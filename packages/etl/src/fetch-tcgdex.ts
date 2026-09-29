import * as fs from "node:fs";
import * as path from "node:path";
import { tcgdex, writeJsonAtomic } from "./paths.js";

/**
 * S02.T03 — TCGdex fetcher.
 *
 * TCGdex is the complement, never the canon: it supplies `pricing`, `legal`,
 * `variants`, the image base and the `localId` used to pair printings. One HTTP
 * request per card, ~20k cards, so the module is built around three properties:
 * cache by presence (BR-S02.T03-01), a limiter held only around the request
 * itself (BR-S02.T03-03) and a circuit breaker that refuses to walk the whole id
 * list against a dead endpoint (BR-S02.T03-07).
 *
 * The service is free and keyless: no credential is ever read or sent
 * (BR-S02.T03-09), which is why nothing in this file touches the environment.
 */

export const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";

/** Legacy `config.TCGDEX_CONCURRENCY`; the value that completed a full crawl. */
export const TCGDEX_CONCURRENCY = 8;

/** Total attempts per document, first try included (BR-S02.T03-05). */
export const TCGDEX_MAX_ATTEMPTS = 5;

/** Consecutive card failures that abort the step (BR-S02.T03-07). */
export const TCGDEX_BREAKER_THRESHOLD = 50;

/** Legacy progress cadence: one line every 250 documents. */
export const TCGDEX_PROGRESS_EVERY = 250;

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 16_000;

/** Retried besides transport errors; every other non-2xx except 404 fails at once. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);

/** Identifies the crawler to a free, keyless service; carries nothing else. */
const REQUEST_HEADERS: Readonly<Record<string, string>> = {
  "user-agent": "pokesearch2-etl/0.1 (+https://github.com/ManoFardo-PR/pokemon2)",
  accept: "application/json",
};

// --- Document shapes --------------------------------------------------------

export interface TcgdexSetSummary {
  id: string;
  name: string;
  cardCount?: { total?: number; official?: number };
}

export interface TcgdexBriefCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TcgdexSet extends TcgdexSetSummary {
  serie?: { id: string; name: string };
  releaseDate?: string;
  legal?: { standard?: boolean; expanded?: boolean };
  cards?: TcgdexBriefCard[];
}

export interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  stage?: string;
  regulationMark?: string;
  updated?: string;
  variants?: Record<string, boolean>;
  legal?: { standard?: boolean; expanded?: boolean };
  pricing?: { tcgplayer?: Record<string, unknown>; cardmarket?: Record<string, unknown> };
  _fetched_at?: string;
}

// --- Options and results ----------------------------------------------------

/** Shared by the two single-document entry points. */
export interface FetchDocumentOptions {
  force?: boolean | undefined;
  signal?: AbortSignal | undefined;
  /** Test hook: point the fetcher at a local server instead of TCGdex. */
  baseUrl?: string | undefined;
  /** Test hook: retry delay per attempt in ms; production uses `backoffDelay`. */
  backoffMs?: readonly number[] | undefined;
}

export interface FetchCardsOptions extends FetchDocumentOptions {
  concurrency?: number | undefined;
  onProgress?: ((done: number, total: number) => void) | undefined;
}

export interface FetchCardsResult {
  /**
   * One entry per id that reached a verdict. `null` means a confirmed 404; an id
   * that exhausted its attempts is absent here and reported in `failedIds`.
   */
  results: Map<string, TcgdexCard | null>;
  failedIds: string[];
  requests: number;
  cacheHits: number;
  notFound: number;
  retries: number;
  bytes: number;
}

export class TcgdexUnavailableError extends Error {
  readonly consecutiveFailures: number;

  constructor(consecutiveFailures: number, message?: string) {
    super(
      message ??
        `TCGdex looks unavailable: ${consecutiveFailures} consecutive card fetches failed; aborting the step`
    );
    this.name = "TcgdexUnavailableError";
    this.consecutiveFailures = consecutiveFailures;
  }
}

/** Thrown inside a worker when the step is already over; never reaches the caller. */
class StepStoppedError extends Error {
  constructor() {
    super("TCGdex step stopped before the request was issued");
    this.name = "StepStoppedError";
  }
}

// --- limiter ----------------------------------------------------------------

export interface Limiter {
  <T>(task: () => Promise<T>, options?: { front?: boolean | undefined }): Promise<T>;
  readonly activeCount: number;
  readonly pendingCount: number;
}

/**
 * A small semaphore (BR-S02.T03-03). The slot is held for exactly as long as the
 * task runs, so a retry's backoff — which happens between two calls, never inside
 * one — leaves the worker free for another card.
 *
 * `front` puts a retry ahead of ids that have not been attempted yet, so a card's
 * attempts stay close together instead of piling up at the tail of the run.
 */
export function limiter(concurrency: number): Limiter {
  const max = Math.max(1, Math.floor(concurrency));
  const queue: Array<() => void> = [];
  let active = 0;

  const pump = (): void => {
    while (active < max && queue.length > 0) {
      const start = queue.shift();
      if (start === undefined) {
        break;
      }
      active++;
      start();
    }
  };

  const limit = <T>(
    task: () => Promise<T>,
    options?: { front?: boolean | undefined }
  ): Promise<T> =>
    new Promise<T>((resolve) => {
      const start = (): void => {
        // The slot is released once the task settles, either way; adopting the
        // task's promise keeps a rejection reason intact instead of re-wrapping it.
        const running = (async (): Promise<T> => task())();
        resolve(
          running.finally(() => {
            active--;
            pump();
          })
        );
      };
      if (options?.front === true) {
        queue.unshift(start);
      } else {
        queue.push(start);
      }
      pump();
    });

  Object.defineProperties(limit, {
    activeCount: { get: (): number => active, enumerable: true },
    pendingCount: { get: (): number => queue.length, enumerable: true },
  });

  return limit as unknown as Limiter;
}

// --- Backoff ----------------------------------------------------------------

/**
 * Delay before retry `attempt` (1-based): 1, 2, 4, 8, 16 s capped at 16 s, each
 * with a jitter band of ±20 %. A parseable `Retry-After` — seconds or HTTP-date —
 * replaces the computed value outright (BR-S02.T03-05).
 */
export function backoffDelay(attempt: number, response?: Response): number {
  const header = response?.headers.get("retry-after") ?? null;
  if (header !== null) {
    const trimmed = header.trim();
    const seconds = Number(trimmed);
    if (trimmed !== "" && Number.isFinite(seconds) && seconds >= 0) {
      return Math.round(seconds * 1000);
    }
    const when = Date.parse(trimmed);
    if (!Number.isNaN(when)) {
      return Math.max(0, when - Date.now());
    }
  }

  const exponent = Math.max(0, Math.floor(attempt) - 1);
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
  return Math.round(base * (0.8 + 0.4 * Math.random()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- HTTP -------------------------------------------------------------------

interface RequestCounters {
  requests: number;
  retries: number;
  bytes: number;
}

function newCounters(): RequestCounters {
  return { requests: 0, retries: 0, bytes: 0 };
}

interface GetOptions {
  signal?: AbortSignal | undefined;
  backoffMs?: readonly number[] | undefined;
  limit?: Limiter | undefined;
  shouldStop?: (() => boolean) | undefined;
}

type Attempt =
  | { kind: "ok"; value: unknown; bytes: number }
  | { kind: "notFound" }
  | { kind: "retryable"; status: number; response: Response }
  | { kind: "transport"; message: string }
  | { kind: "fatal"; message: string }
  | { kind: "stopped" };

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Consumes a body we do not need, so the socket is released for the next request. */
async function drain(response: Response): Promise<void> {
  try {
    await response.text();
  } catch {
    // The body is irrelevant here; a truncated one changes nothing.
  }
}

/**
 * One attempt. The body is read and parsed inside this call, so a connection
 * dropped mid-body is a transport failure and nothing reaches the cache.
 */
async function performRequest(
  url: string,
  counters: RequestCounters,
  options: GetOptions
): Promise<Attempt> {
  if (options.shouldStop?.() === true || options.signal?.aborted === true) {
    return { kind: "stopped" };
  }

  const init: RequestInit = { method: "GET", headers: { ...REQUEST_HEADERS } };
  if (options.signal !== undefined) {
    init.signal = options.signal;
  }

  counters.requests++;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err: unknown) {
    return { kind: "transport", message: `Transport failure for ${url}: ${describeError(err)}` };
  }

  if (response.status === 404) {
    await drain(response);
    return { kind: "notFound" };
  }
  if (RETRYABLE_STATUSES.has(response.status)) {
    await drain(response);
    return { kind: "retryable", status: response.status, response };
  }
  if (!response.ok) {
    await drain(response);
    return { kind: "fatal", message: `HTTP ${response.status} from ${url}` };
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err: unknown) {
    return { kind: "transport", message: `Body read failed for ${url}: ${describeError(err)}` };
  }

  try {
    const value: unknown = JSON.parse(body);
    return { kind: "ok", value, bytes: Buffer.byteLength(body, "utf8") };
  } catch {
    return { kind: "transport", message: `Unparseable JSON body from ${url}` };
  }
}

function delayFor(
  attempt: number,
  response: Response | undefined,
  override: readonly number[] | undefined
): number {
  if (override !== undefined) {
    return override[attempt - 1] ?? override[override.length - 1] ?? 0;
  }
  return backoffDelay(attempt, response);
}

type GetOutcome = { found: true; value: unknown } | { found: false };

/**
 * GET + parse with the retry policy of BR-S02.T03-05. The limiter wraps the
 * request only: the backoff below runs with the slot already released
 * (BR-S02.T03-03). A 404 resolves to `{ found: false }`; anything else that
 * survives every attempt throws.
 */
async function getJson(
  url: string,
  counters: RequestCounters,
  options: GetOptions
): Promise<GetOutcome> {
  for (let attempt = 1; ; attempt++) {
    const run = (): Promise<Attempt> => performRequest(url, counters, options);
    const outcome =
      options.limit === undefined ? await run() : await options.limit(run, { front: attempt > 1 });

    if (outcome.kind === "ok") {
      counters.bytes += outcome.bytes;
      return { found: true, value: outcome.value };
    }
    if (outcome.kind === "notFound") {
      return { found: false };
    }
    if (outcome.kind === "stopped") {
      throw new StepStoppedError();
    }
    if (outcome.kind === "fatal") {
      throw new Error(outcome.message);
    }

    const reason =
      outcome.kind === "retryable" ? `HTTP ${outcome.status} from ${url}` : outcome.message;
    if (attempt >= TCGDEX_MAX_ATTEMPTS) {
      throw new Error(`${reason} after ${attempt} attempts`);
    }

    counters.retries++;
    const response = outcome.kind === "retryable" ? outcome.response : undefined;
    await sleep(delayFor(attempt, response, options.backoffMs));
  }
}

// --- Cache ------------------------------------------------------------------

function isDocument(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

/** Read-only: never deletes, because the offline readers must not mutate the cache. */
function readJsonFile(file: string): unknown {
  if (!fs.existsSync(file)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The cache check of BR-S02.T03-01: presence plus a successful parse. A file that
 * no longer parses is deleted so the next fetch replaces it — a crash must not
 * poison the cache permanently. The delete happens on a parse failure only, never
 * on a network failure (BR-S02.T03-08).
 */
function readJsonFileOrPurge(file: string): unknown {
  if (!fs.existsSync(file)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    try {
      fs.unlinkSync(file);
    } catch {
      // The next successful write replaces it anyway.
    }
    return undefined;
  }
}

export function readCachedCard(id: string): TcgdexCard | null {
  const value = readJsonFile(tcgdex.cardFile(id));
  return isDocument(value) ? (value as TcgdexCard) : null;
}

export function readCachedSet(id: string): TcgdexSet | null {
  const value = readJsonFile(tcgdex.setFile(id));
  return isDocument(value) ? (value as TcgdexSet) : null;
}

// --- Set endpoints ----------------------------------------------------------

/** The TCGdex set universe. Throws when it cannot be read: the step needs it. */
export async function fetchSetList(opts?: FetchDocumentOptions): Promise<TcgdexSetSummary[]> {
  const file = tcgdex.setsFile();
  if (opts?.force !== true) {
    const cached = readJsonFileOrPurge(file);
    if (Array.isArray(cached)) {
      return cached as TcgdexSetSummary[];
    }
  }

  const url = `${opts?.baseUrl ?? TCGDEX_API_BASE}/sets`;
  const outcome = await getJson(url, newCounters(), {
    signal: opts?.signal,
    backoffMs: opts?.backoffMs,
  });

  if (!outcome.found) {
    throw new Error(`TCGdex set list not found at ${url}`);
  }
  if (!Array.isArray(outcome.value)) {
    throw new Error(`TCGdex set list at ${url} is not an array`);
  }

  // No `_fetched_at` here: the stamp belongs to card documents only (BR-S02.T03-02).
  await writeJsonAtomic(file, outcome.value);
  return outcome.value as TcgdexSetSummary[];
}

/** The brief card list of one set. `null` when TCGdex does not know the id. */
export async function fetchSetBrief(
  setId: string,
  opts?: FetchDocumentOptions
): Promise<TcgdexSet | null> {
  const file = tcgdex.setFile(setId);
  if (opts?.force !== true) {
    const cached = readJsonFileOrPurge(file);
    if (isDocument(cached)) {
      return cached as TcgdexSet;
    }
  }

  const url = `${opts?.baseUrl ?? TCGDEX_API_BASE}/sets/${encodeURIComponent(setId)}`;
  const outcome = await getJson(url, newCounters(), {
    signal: opts?.signal,
    backoffMs: opts?.backoffMs,
  });

  if (!outcome.found) {
    return null;
  }
  if (!isDocument(outcome.value)) {
    throw new Error(`TCGdex set brief at ${url} is not a document`);
  }

  await writeJsonAtomic(file, outcome.value);
  return outcome.value as TcgdexSet;
}

// --- Cards ------------------------------------------------------------------

/**
 * Fetches every id, cache first. Individual failures never fail the step
 * (BR-S02.T03-06); only a dead endpoint does, through `TcgdexUnavailableError`
 * (BR-S02.T03-07).
 */
export async function fetchCards(
  ids: string[],
  opts?: FetchCardsOptions
): Promise<FetchCardsResult> {
  const results = new Map<string, TcgdexCard | null>();
  const failedIds: string[] = [];
  const counters = newCounters();
  let cacheHits = 0;
  let notFound = 0;

  const signal = opts?.signal;
  /** A function, not a comparison: the flag flips while the step is running. */
  const isAborted = (): boolean => signal?.aborted === true;
  const abortError = (): Error =>
    signal?.reason instanceof Error ? signal.reason : new Error("TCGdex card fetch aborted");

  if (isAborted()) {
    throw abortError();
  }

  const total = ids.length;
  if (total === 0) {
    return { results, failedIds, requests: 0, cacheHits: 0, notFound: 0, retries: 0, bytes: 0 };
  }

  const base = opts?.baseUrl ?? TCGDEX_API_BASE;
  const force = opts?.force === true;
  const limit = limiter(opts?.concurrency ?? TCGDEX_CONCURRENCY);

  let done = 0;
  let consecutiveFailures = 0;
  let breaker: TcgdexUnavailableError | undefined;

  const shouldStop = (): boolean => breaker !== undefined || isAborted();

  const report = (): void => {
    done++;
    if (done % TCGDEX_PROGRESS_EVERY === 0) {
      opts?.onProgress?.(done, total);
    }
  };

  /** A verdict — document, cache hit or confirmed 404 — proves the endpoint is alive. */
  const succeeded = (): void => {
    consecutiveFailures = 0;
  };

  const failed = (id: string): void => {
    failedIds.push(id);
    consecutiveFailures++;
    if (breaker === undefined && consecutiveFailures >= TCGDEX_BREAKER_THRESHOLD) {
      breaker = new TcgdexUnavailableError(consecutiveFailures);
    }
  };

  await Promise.all(
    ids.map(async (id): Promise<void> => {
      if (shouldStop()) {
        return;
      }

      if (!force) {
        const cached = readJsonFileOrPurge(tcgdex.cardFile(id));
        if (isDocument(cached)) {
          results.set(id, cached as TcgdexCard);
          cacheHits++;
          succeeded();
          report();
          return;
        }
      }

      try {
        const outcome = await getJson(`${base}/cards/${encodeURIComponent(id)}`, counters, {
          signal,
          backoffMs: opts?.backoffMs,
          limit,
          shouldStop,
        });

        if (!outcome.found) {
          // A withdrawn printing: remembered as `null`, never cached as a document.
          results.set(id, null);
          notFound++;
          succeeded();
        } else if (isDocument(outcome.value)) {
          const card = {
            ...(outcome.value as Record<string, unknown>),
            _fetched_at: new Date().toISOString(),
          } as unknown as TcgdexCard;
          await writeJsonAtomic(tcgdex.cardFile(id), card);
          results.set(id, card);
          succeeded();
        } else {
          failed(id);
        }
      } catch (err: unknown) {
        if (err instanceof StepStoppedError) {
          return;
        }
        failed(id);
      }
      report();
    })
  );

  if (breaker !== undefined) {
    throw breaker;
  }
  if (isAborted()) {
    throw abortError();
  }

  opts?.onProgress?.(done, total);

  return {
    results,
    failedIds,
    requests: counters.requests,
    cacheHits,
    notFound,
    retries: counters.retries,
    bytes: counters.bytes,
  };
}

// --- Cache seeding (D-003) --------------------------------------------------

const DATABASE_FILE = /\.(db|db-wal|db-shm|sqlite|sqlite3)$/i;

function findDatabaseFile(dir: string): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findDatabaseFile(full);
      if (nested !== undefined) {
        return nested;
      }
    } else if (DATABASE_FILE.test(entry.name)) {
      return full;
    }
  }
  return undefined;
}

/**
 * Copies an existing TCGdex cache directory into `RAW_CACHE_DIR` (D-003). It is a
 * cache copy and nothing else: a source directory holding a database file is
 * refused outright, before a single file is copied.
 */
export async function seedCacheFrom(dir: string): Promise<{ copied: number; skipped: number }> {
  const source = path.resolve(dir);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Seed source directory not found: ${source}`);
  }

  const database = findDatabaseFile(source);
  if (database !== undefined) {
    throw new Error(
      `Refusing to seed from '${source}': it contains the database file ` +
        `'${path.relative(source, database)}'. D-003 allows copying the cache, never a database.`
    );
  }

  let copied = 0;
  let skipped = 0;

  const copyDocument = async (
    from: string,
    to: string,
    isValid: (value: unknown) => boolean
  ): Promise<void> => {
    const value = readJsonFile(from);
    if (value === undefined || !isValid(value)) {
      skipped++;
      return;
    }
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    // Byte-for-byte: a seeded document keeps the `_fetched_at` it already carried.
    await fs.promises.copyFile(from, to);
    copied++;
  };

  const copyDirectory = async (subdir: string, target: (id: string) => string): Promise<void> => {
    const from = path.join(source, subdir);
    if (!fs.existsSync(from)) {
      return;
    }
    for (const entry of await fs.promises.readdir(from, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const id = entry.name.slice(0, -".json".length);
      await copyDocument(path.join(from, entry.name), target(id), isDocument);
    }
  };

  const setsJson = path.join(source, "sets.json");
  if (fs.existsSync(setsJson)) {
    await copyDocument(setsJson, tcgdex.setsFile(), (value) => Array.isArray(value));
  }
  await copyDirectory("cards", (id) => tcgdex.cardFile(id));
  await copyDirectory("sets", (id) => tcgdex.setFile(id));

  return { copied, skipped };
}
