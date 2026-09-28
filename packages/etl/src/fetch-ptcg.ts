import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { ptcg, writeJsonAtomic } from "./paths.js";
import { createEtlLogger } from "./logger.js";

const logger = createEtlLogger();

export const PTCG_RAW_BASE = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master";

export interface PtcgSet {
  id: string;
  name: string;
  series?: string;
  printedTotal?: number;
  total?: number;
  releaseDate?: string;
  ptcgoCode?: string;
  legalities?: Record<string, string>;
  images?: { symbol?: string; logo?: string };
  updatedAt?: string;
}

export interface PtcgCard {
  id: string;
  name: string;
  number: string;
  supertype?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  evolvesTo?: string[];
  rules?: string[];
  flavorText?: string;
  regulationMark?: string;
  rarity?: string;
  artist?: string;
  nationalPokedexNumbers?: number[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  attacks?: {
    name?: string;
    cost?: string[];
    convertedEnergyCost?: number;
    damage?: string;
    text?: string;
  }[];
  abilities?: {
    name?: string;
    type?: string;
    text?: string;
  }[];
  weaknesses?: { type?: string; value?: string }[];
  resistances?: { type?: string; value?: string }[];
  legalities?: Record<string, string>;
  images?: { small?: string; large?: string };
}

export interface FetchAllOptions {
  baseUrl?: string | undefined;
  force?: boolean | undefined;
  onlySets?: string[] | undefined;
  signal?: AbortSignal | undefined;
}

export interface FetchAllResult {
  sets: PtcgSet[];
  changedSetIds: string[];
  missingCardFiles: string[];
  requests: number;
  notModified: number;
  bytes: number;
}

export class CacheMissError extends Error {
  readonly path: string;

  constructor(filePath: string, message?: string) {
    super(message ?? `Cache miss for file: ${filePath}`);
    this.name = "CacheMissError";
    this.path = filePath;
  }
}

export function loadEtags(): Record<string, string> {
  const file = ptcg.etagsFile();
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

export async function saveEtags(etags: Record<string, string>): Promise<void> {
  const file = ptcg.etagsFile();
  await writeJsonAtomic(file, etags);
}

function isValidJsonArray(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed);
  } catch {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
    return false;
  }
}

interface HttpFetchResult {
  status: number;
  etag?: string | undefined;
  body?: string | undefined;
}

async function fetchWithRetry(
  url: string,
  options: {
    etag?: string | undefined;
    signal?: AbortSignal | undefined;
    retries?: number | undefined;
  }
): Promise<HttpFetchResult> {
  const maxRetries = options.retries ?? 3;
  const backoffs = [100, 200, 400];

  let attempt = 0;
  while (true) {
    attempt++;
    const headers: Record<string, string> = {
      "user-agent": "pokesearch2-etl/0.1 (+local)",
      accept: "application/json",
    };
    if (options.etag !== undefined) {
      headers["if-none-match"] = options.etag;
    }

    try {
      const fetchInit: RequestInit = {
        method: "GET",
        headers,
      };
      if (options.signal !== undefined) {
        fetchInit.signal = options.signal;
      }
      const res = await fetch(url, fetchInit);

      if (res.status === 304) {
        return {
          status: 304,
          etag: res.headers.get("etag") ?? options.etag ?? undefined,
        };
      }

      if (res.status === 404) {
        return {
          status: 404,
        };
      }

      const retryableStatus = [429, 500, 502, 503, 504].includes(res.status);
      if (retryableStatus && attempt <= maxRetries) {
        const delay = backoffs[attempt - 1] ?? 400;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} from ${url}: ${errorText}`);
      }

      const body = await res.text();
      const responseEtag = res.headers.get("etag") ?? undefined;

      return {
        status: 200,
        etag: responseEtag,
        body,
      };
    } catch (err: unknown) {
      if (attempt <= maxRetries) {
        const delay = backoffs[attempt - 1] ?? 400;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

export async function fetchSets(opts?: {
  baseUrl?: string | undefined;
  force?: boolean | undefined;
  signal?: AbortSignal | undefined;
  inMemoryEtags?: Record<string, string> | undefined;
}): Promise<{
  sets: PtcgSet[];
  changed: boolean;
  status: number;
  bytes: number;
}> {
  const base = opts?.baseUrl ?? PTCG_RAW_BASE;
  const url = `${base}/sets/en.json`;
  const relPath = "sets/en.json";
  const setsFilePath = ptcg.setsFile();

  const etags = opts?.inMemoryEtags ?? loadEtags();
  const cachedValid = !opts?.force && isValidJsonArray(setsFilePath);
  const storedEtag = cachedValid ? etags[relPath] : undefined;

  const res = await fetchWithRetry(url, {
    etag: storedEtag,
    signal: opts?.signal,
  });

  if (res.status === 404) {
    throw new Error(`Critical resource not found: ${url}`);
  }

  if (res.status === 304) {
    if (!fs.existsSync(setsFilePath)) {
      return fetchSets({ ...opts, force: true });
    }
    const cachedSets = JSON.parse(fs.readFileSync(setsFilePath, "utf8")) as PtcgSet[];
    return {
      sets: cachedSets,
      changed: false,
      status: 304,
      bytes: 0,
    };
  }

  if (!res.body) {
    throw new Error(`Empty response body for ${url}`);
  }

  const parsed = JSON.parse(res.body);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid sets format: expected array from ${url}`);
  }

  let changed = true;
  if (fs.existsSync(setsFilePath)) {
    try {
      const existingBytes = fs.readFileSync(setsFilePath, "utf8");
      const existingParsed = JSON.parse(existingBytes);
      if (JSON.stringify(existingParsed) === JSON.stringify(parsed)) {
        changed = false;
      }
    } catch {
      changed = true;
    }
  }

  if (changed) {
    await writeJsonAtomic(setsFilePath, parsed);
  }

  if (res.etag && opts?.inMemoryEtags) {
    opts.inMemoryEtags[relPath] = res.etag;
  }

  return {
    sets: parsed as PtcgSet[],
    changed,
    status: 200,
    bytes: Buffer.byteLength(res.body, "utf8"),
  };
}

export async function fetchSetCards(
  setId: string,
  opts?: {
    baseUrl?: string | undefined;
    force?: boolean | undefined;
    signal?: AbortSignal | undefined;
    inMemoryEtags?: Record<string, string> | undefined;
  }
): Promise<{
  cards: PtcgCard[];
  changed: boolean;
  notFound: boolean;
  status: number;
  bytes: number;
}> {
  const base = opts?.baseUrl ?? PTCG_RAW_BASE;
  const url = `${base}/cards/en/${setId}.json`;
  const relPath = `cards/en/${setId}.json`;
  const cardsFilePath = ptcg.cardsFile(setId);

  const etags = opts?.inMemoryEtags ?? loadEtags();
  const cachedValid = !opts?.force && isValidJsonArray(cardsFilePath);
  const storedEtag = cachedValid ? etags[relPath] : undefined;

  const res = await fetchWithRetry(url, {
    etag: storedEtag,
    signal: opts?.signal,
  });

  if (res.status === 404) {
    logger.warn(`Card set ${setId} returned 404 (${url})`);
    return {
      cards: [],
      changed: false,
      notFound: true,
      status: 404,
      bytes: 0,
    };
  }

  if (res.status === 304) {
    if (!fs.existsSync(cardsFilePath)) {
      return fetchSetCards(setId, { ...opts, force: true });
    }
    const cachedCards = JSON.parse(fs.readFileSync(cardsFilePath, "utf8")) as PtcgCard[];
    return {
      cards: cachedCards,
      changed: false,
      notFound: false,
      status: 304,
      bytes: 0,
    };
  }

  if (!res.body) {
    throw new Error(`Empty response body for ${url}`);
  }

  const parsed = JSON.parse(res.body);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid cards format: expected array for set ${setId}`);
  }

  let changed = true;
  if (fs.existsSync(cardsFilePath)) {
    try {
      const existingBytes = fs.readFileSync(cardsFilePath, "utf8");
      const existingParsed = JSON.parse(existingBytes);
      if (JSON.stringify(existingParsed) === JSON.stringify(parsed)) {
        changed = false;
      }
    } catch {
      changed = true;
    }
  }

  if (changed) {
    await writeJsonAtomic(cardsFilePath, parsed);
  }

  if (res.etag && opts?.inMemoryEtags) {
    opts.inMemoryEtags[relPath] = res.etag;
  }

  return {
    cards: parsed as PtcgCard[],
    changed,
    notFound: false,
    status: 200,
    bytes: Buffer.byteLength(res.body, "utf8"),
  };
}

export async function fetchAll(opts?: FetchAllOptions): Promise<FetchAllResult> {
  const inMemoryEtags: Record<string, string> = { ...loadEtags() };

  let requests = 0;
  let notModified = 0;
  let bytes = 0;
  const changedSetIds: string[] = [];
  const missingCardFiles: string[] = [];

  // 1. Fetch sets index
  const setsRes = await fetchSets({
    baseUrl: opts?.baseUrl,
    force: opts?.force,
    signal: opts?.signal,
    inMemoryEtags,
  });

  requests++;
  if (setsRes.status === 304) {
    notModified++;
  } else {
    bytes += setsRes.bytes;
  }

  const targetSets = opts?.onlySets
    ? setsRes.sets.filter((s) => opts.onlySets!.includes(s.id))
    : setsRes.sets;

  // 2. Fetch cards per set with concurrency 4
  const concurrency = 4;
  const queue = [...targetSets];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const set = queue.shift();
      if (!set) break;

      const cardRes = await fetchSetCards(set.id, {
        baseUrl: opts?.baseUrl,
        force: opts?.force,
        signal: opts?.signal,
        inMemoryEtags,
      });

      requests++;
      if (cardRes.status === 304) {
        notModified++;
      } else {
        bytes += cardRes.bytes;
      }

      if (cardRes.notFound) {
        missingCardFiles.push(set.id);
      } else if (cardRes.changed) {
        changedSetIds.push(set.id);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);

  // 3. Save etags atomically at the end of successful run (BR-S02.T02-08)
  await saveEtags(inMemoryEtags);

  return {
    sets: setsRes.sets,
    changedSetIds,
    missingCardFiles,
    requests,
    notModified,
    bytes,
  };
}

export function loadSets(): PtcgSet[] {
  const setsPath = ptcg.setsFile();
  if (!fs.existsSync(setsPath)) {
    throw new CacheMissError(setsPath, `Sets file not found in cache: ${setsPath}`);
  }

  try {
    const content = fs.readFileSync(setsPath, "utf8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error("Sets cache is not an array");
    }
    return parsed as PtcgSet[];
  } catch (err: unknown) {
    try {
      fs.unlinkSync(setsPath);
    } catch {
      // ignore
    }
    throw new CacheMissError(
      setsPath,
      `Corrupted sets file deleted: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function loadCards(setId: string): PtcgCard[] {
  const cardsPath = ptcg.cardsFile(setId);
  if (!fs.existsSync(cardsPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(cardsPath, "utf8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error(`Cards cache for set ${setId} is not an array`);
    }
    return parsed as PtcgCard[];
  } catch (err: unknown) {
    try {
      fs.unlinkSync(cardsPath);
    } catch {
      // ignore
    }
    throw new CacheMissError(
      cardsPath,
      `Corrupted cards file deleted for set ${setId}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
