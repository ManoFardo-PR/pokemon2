import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import { fileURLToPath } from "node:url";
import { tcgdex } from "./paths.js";
import {
  TCGDEX_API_BASE,
  TCGDEX_CONCURRENCY,
  TcgdexUnavailableError,
  backoffDelay,
  fetchCards,
  fetchSetBrief,
  fetchSetList,
  limiter,
  readCachedCard,
  readCachedSet,
  seedCacheFrom,
  type TcgdexCard,
  type TcgdexSet,
  type TcgdexSetSummary,
} from "./fetch-tcgdex.js";

/**
 * S02.T03 — RED phase suite for the TCGdex fetcher.
 *
 * Every describe block names the business rule it pins. Two contract details are
 * fixed here that the subtask doc leaves to the implementation, both following the
 * conventions already used by `fetch-ptcg.spec.ts`:
 *
 *  - `baseUrl` and `backoffMs` are accepted by every fetch entry point as test hooks,
 *    so the suite runs against a local `node:http` server with zero real sleeps.
 *  - a card id that exhausts its retries is reported in `failedIds` and is *absent*
 *    from `results`, which keeps it distinguishable from a 404 (present, value `null`).
 */

/** No waiting between retries; production defaults to 1, 2, 4, 8, 16 s (BR-S02.T03-05). */
const ZERO_BACKOFF: readonly number[] = [0, 0, 0, 0, 0];

interface MockRoute {
  /** Status for every hit, unless `sequence` is set. */
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  /** Status per hit on this path; the last entry repeats. */
  sequence?: number[];
  /** Keep the response open until the test releases it (used to observe in-flight count). */
  hold?: boolean;
  /** Write a fragment of the body and destroy the socket: a transport error, not a status. */
  dropBody?: boolean;
}

interface LoggedRequest {
  path: string;
  search: string;
  headers: http.IncomingHttpHeaders;
}

/** Narrowing helper: `noUncheckedIndexedAccess` makes plain indexing `T | undefined`. */
function must<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected a value for ${label}, got ${String(value)}`);
  }
  return value;
}

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? countFiles(full) : 1;
  }
  return total;
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

describe("fetch-tcgdex (RED phase test suite)", () => {
  let tempCacheDir: string;
  const originalRawCacheDir = process.env.RAW_CACHE_DIR;
  let server: http.Server;
  let serverUrl: string;

  let routes: Map<string, MockRoute>;
  let requestLog: LoggedRequest[];
  let hitCounts: Map<string, number>;
  /** Requests currently open on the server (held routes stay counted until released). */
  let inFlight: number;
  let maxInFlight: number;
  /** Deferred senders for `hold` routes, drained by `releaseHeld()`. */
  let held: Array<() => void>;
  let holding: boolean;

  function hits(p: string): number {
    return hitCounts.get(p) ?? 0;
  }

  function releaseHeld(): void {
    holding = false;
    const pending = held;
    held = [];
    for (const send of pending) send();
  }

  async function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (cond()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`Timed out after ${timeoutMs} ms waiting for: ${label}`);
  }

  beforeEach(async () => {
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-tcgdex-test-"));
    process.env.RAW_CACHE_DIR = tempCacheDir;

    routes = new Map();
    requestLog = [];
    hitCounts = new Map();
    inFlight = 0;
    maxInFlight = 0;
    held = [];
    holding = true;

    server = http.createServer((req, res) => {
      const parsed = new URL(req.url ?? "/", "http://localhost");
      const reqPath = parsed.pathname;
      requestLog.push({ path: reqPath, search: parsed.search, headers: req.headers });
      const hit = hits(reqPath);
      hitCounts.set(reqPath, hit + 1);

      const route = routes.get(reqPath);
      if (!route) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const status = route.sequence
        ? (route.sequence[Math.min(hit, route.sequence.length - 1)] ?? 200)
        : (route.status ?? 200);

      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);

      const send = (): void => {
        inFlight--;
        const body = route.body ?? "";
        if (route.dropBody) {
          res.writeHead(status, {
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(body, "utf8")),
          });
          res.write(body.slice(0, Math.max(1, Math.floor(body.length / 2))));
          res.destroy();
          return;
        }
        res.writeHead(status, { "content-type": "application/json", ...(route.headers ?? {}) });
        res.end(body);
      };

      if (route.hold && holding) {
        held.push(send);
      } else {
        send();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (addr && typeof addr === "object") {
      serverUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterEach(async () => {
    releaseHeld();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    if (originalRawCacheDir === undefined) {
      delete process.env.RAW_CACHE_DIR;
    } else {
      process.env.RAW_CACHE_DIR = originalRawCacheDir;
    }
    if (fs.existsSync(tempCacheDir)) {
      fs.rmSync(tempCacheDir, { recursive: true, force: true });
    }
  });

  // --- Sample payloads ------------------------------------------------------

  const sampleSetList: TcgdexSetSummary[] = [
    { id: "sv1", name: "Scarlet & Violet", cardCount: { total: 258, official: 198 } },
    { id: "sv2", name: "Paldea Evolved", cardCount: { total: 279, official: 193 } },
  ];

  function cardId(n: number): string {
    return `sv1-${String(n).padStart(3, "0")}`;
  }

  function cardDoc(id: string): TcgdexCard {
    return {
      id,
      localId: id.slice(id.indexOf("-") + 1),
      name: `Card ${id}`,
      image: `https://assets.tcgdex.net/en/sv/sv1/${id}`,
      stage: "Basic",
      regulationMark: "G",
      variants: { normal: true, reverse: true, holo: false, firstEdition: false },
      legal: { standard: true, expanded: true },
      pricing: { cardmarket: { unit: "EUR", avg: 0.5 } },
    };
  }

  function setBriefDoc(ids: string[]): TcgdexSet {
    return {
      id: "sv1",
      name: "Scarlet & Violet",
      serie: { id: "sv", name: "Scarlet & Violet" },
      releaseDate: "2023-03-31",
      cardCount: { total: 258, official: 198 },
      legal: { standard: true, expanded: true },
      cards: ids.map((id) => ({
        id,
        localId: id.slice(id.indexOf("-") + 1),
        name: `Card ${id}`,
        image: `https://assets.tcgdex.net/en/sv/sv1/${id}`,
      })),
    };
  }

  /** Registers `/cards/<id>` for each id, plus an optional per-id route override. */
  function registerCards(ids: string[], override?: (id: string) => MockRoute | undefined): void {
    for (const id of ids) {
      const custom = override?.(id);
      routes.set(`/cards/${id}`, custom ?? { status: 200, body: JSON.stringify(cardDoc(id)) });
    }
  }

  function tenIds(): string[] {
    return Array.from({ length: 10 }, (_, i) => cardId(i + 1));
  }

  // --- Constants ------------------------------------------------------------

  describe("Module constants", () => {
    it("exposes the documented API base and default concurrency", () => {
      expect(TCGDEX_API_BASE).toBe("https://api.tcgdex.net/v2/en");
      expect(TCGDEX_CONCURRENCY).toBe(8);
    });
  });

  // --- limiter() ------------------------------------------------------------

  describe("limiter(n) (BR-S02.T03-03)", () => {
    it("never runs more than n tasks at once and reports activeCount / pendingCount", async () => {
      const limit = limiter(3);
      let active = 0;
      let observedMax = 0;
      const gates: Array<() => void> = [];

      const tasks = Array.from({ length: 9 }, () =>
        limit(async () => {
          active++;
          observedMax = Math.max(observedMax, active);
          await new Promise<void>((resolve) => gates.push(resolve));
          active--;
          return "done";
        })
      );

      await waitFor(() => gates.length === 3, 1000, "three tasks started");
      expect(limit.activeCount).toBe(3);
      expect(limit.pendingCount).toBe(6);

      while (gates.length > 0) {
        const resolveOne = gates.shift();
        if (resolveOne) resolveOne();
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const results = await Promise.all(tasks);
      expect(results).toHaveLength(9);
      expect(results.every((r: string) => r === "done")).toBe(true);
      expect(observedMax).toBe(3);
      expect(limit.activeCount).toBe(0);
      expect(limit.pendingCount).toBe(0);
    });

    it("releases the slot when the task throws", async () => {
      const limit = limiter(1);
      await expect(limit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
      expect(limit.activeCount).toBe(0);
      await expect(limit(() => Promise.resolve(42))).resolves.toBe(42);
      expect(limit.activeCount).toBe(0);
      expect(limit.pendingCount).toBe(0);
    });

    it("preserves the resolved value and its type", async () => {
      const limit = limiter(2);
      const value = await limit<{ ok: boolean }>(() => Promise.resolve({ ok: true }));
      expect(value).toEqual({ ok: true });
    });
  });

  // --- BR-S02.T03-01 --------------------------------------------------------

  describe("Cache by presence (BR-S02.T03-01)", () => {
    it("set brief and 10 cards write 11 files with 11 HTTP requests", async () => {
      const ids = tenIds();
      routes.set("/sets/sv1", { status: 200, body: JSON.stringify(setBriefDoc(ids)) });
      registerCards(ids);

      const brief = await fetchSetBrief("sv1", { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      expect(must(brief, "set brief").cards).toHaveLength(10);

      const res = await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(requestLog).toHaveLength(11);
      expect(res.requests).toBe(10);
      expect(res.cacheHits).toBe(0);
      expect(res.notFound).toBe(0);
      expect(res.failedIds).toEqual([]);
      expect(res.results.size).toBe(10);
      expect(res.bytes).toBeGreaterThan(0);

      expect(countFiles(path.join(tempCacheDir, "tcgdex"))).toBe(11);
      expect(fs.existsSync(tcgdex.setFile("sv1"))).toBe(true);
      for (const id of ids) {
        expect(fs.existsSync(tcgdex.cardFile(id))).toBe(true);
      }
      expect(must(res.results.get(ids[0] ?? ""), "first card").name).toBe(`Card ${cardId(1)}`);
    });

    it("a second run makes zero HTTP requests and reports cacheHits = 10", async () => {
      const ids = tenIds();
      routes.set("/sets/sv1", { status: 200, body: JSON.stringify(setBriefDoc(ids)) });
      registerCards(ids);

      await fetchSetBrief("sv1", { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      requestLog = [];

      const brief = await fetchSetBrief("sv1", { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      const res = await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(requestLog).toHaveLength(0);
      expect(must(brief, "cached set brief").id).toBe("sv1");
      expect(res.requests).toBe(0);
      expect(res.cacheHits).toBe(10);
      expect(res.bytes).toBe(0);
      expect(res.failedIds).toEqual([]);
      expect(res.results.size).toBe(10);
      expect(must(res.results.get(cardId(3)), "cached card").name).toBe(`Card ${cardId(3)}`);
    });

    it("force re-requests every card even though the cache is valid", async () => {
      const ids = tenIds();
      registerCards(ids);
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      requestLog = [];

      const res = await fetchCards(ids, {
        baseUrl: serverUrl,
        force: true,
        backoffMs: ZERO_BACKOFF,
      });

      expect(requestLog).toHaveLength(10);
      expect(res.requests).toBe(10);
      expect(res.cacheHits).toBe(0);
    });

    it("a cached file that no longer parses is deleted and re-fetched exactly once", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      fs.writeFileSync(tcgdex.cardFile(cardId(1)), '{"id": "sv1-001"', "utf8");
      requestLog = [];

      const res = await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(requestLog).toHaveLength(1);
      expect(res.requests).toBe(1);
      expect(res.cacheHits).toBe(0);
      expect(must(res.results.get(cardId(1)), "refetched card").name).toBe(`Card ${cardId(1)}`);
      expect(readJson(tcgdex.cardFile(cardId(1))).id).toBe(cardId(1));
    });

    it("fetchSetList caches sets.json and serves the second call offline", async () => {
      routes.set("/sets", { status: 200, body: JSON.stringify(sampleSetList) });

      const first = await fetchSetList({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      expect(first).toHaveLength(2);
      expect(fs.existsSync(tcgdex.setsFile())).toBe(true);

      requestLog = [];
      const second = await fetchSetList({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      expect(requestLog).toHaveLength(0);
      expect(second).toEqual(first);

      const forced = await fetchSetList({
        baseUrl: serverUrl,
        force: true,
        backoffMs: ZERO_BACKOFF,
      });
      expect(requestLog).toHaveLength(1);
      expect(forced).toEqual(first);
    });

    it("a set brief without a cards array still resolves as an empty set", async () => {
      routes.set("/sets/sv9", {
        status: 200,
        body: JSON.stringify({ id: "sv9", name: "Empty Set" }),
      });

      const brief = await fetchSetBrief("sv9", { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      expect(must(brief, "sv9 brief").id).toBe("sv9");
      expect(must(brief, "sv9 brief").cards ?? []).toEqual([]);
      expect(fs.existsSync(tcgdex.setFile("sv9"))).toBe(true);
    });
  });

  // --- BR-S02.T03-02 --------------------------------------------------------

  describe("_fetched_at stamping (BR-S02.T03-02)", () => {
    it("card files carry an ISO-8601 UTC _fetched_at", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      const before = Date.now();
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      const after = Date.now();

      const onDisk = readJson(tcgdex.cardFile(cardId(1)));
      const stamp = onDisk["_fetched_at"];
      expect(typeof stamp).toBe("string");
      expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      const parsed = new Date(String(stamp));
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      expect(parsed.toISOString()).toBe(stamp);
      expect(parsed.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(parsed.getTime()).toBeLessThanOrEqual(after + 1000);
    });

    it("set briefs and the set list carry no _fetched_at", async () => {
      routes.set("/sets", { status: 200, body: JSON.stringify(sampleSetList) });
      routes.set("/sets/sv1", { status: 200, body: JSON.stringify(setBriefDoc([cardId(1)])) });

      await fetchSetList({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      await fetchSetBrief("sv1", { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      const brief = readJson(tcgdex.setFile("sv1"));
      expect(brief).not.toHaveProperty("_fetched_at");
      expect(Object.keys(brief)).not.toContain("_fetched_at");

      const listRaw = fs.readFileSync(tcgdex.setsFile(), "utf8");
      expect(listRaw).not.toContain("_fetched_at");
      expect(JSON.parse(listRaw)).toEqual(sampleSetList);
    });

    it("keeps the original _fetched_at when serving a card from cache", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      const stampFirst = readJson(tcgdex.cardFile(cardId(1)))["_fetched_at"];

      const res = await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      expect(res.cacheHits).toBe(1);
      expect(must(res.results.get(cardId(1)), "cached card")._fetched_at).toBe(stampFirst);
      expect(readJson(tcgdex.cardFile(cardId(1)))["_fetched_at"]).toBe(stampFirst);
    });
  });

  // --- BR-S02.T03-03 --------------------------------------------------------

  describe("Limiter slot released during backoff (BR-S02.T03-03)", () => {
    it("8 concurrent slots stay busy while one request backs off", async () => {
      const ids = Array.from({ length: 20 }, (_, i) => cardId(i + 1));
      const failing = must(ids[0], "first id");

      // Every card but the first holds its response open, so the number of held
      // requests is exactly the number of limiter slots currently doing HTTP work.
      registerCards(ids, (id) =>
        id === failing
          ? { sequence: [503, 200], body: JSON.stringify(cardDoc(id)) }
          : { status: 200, body: JSON.stringify(cardDoc(id)), hold: true }
      );

      // A long backoff for the 503: if the slot were held during the sleep only 7
      // requests could be open, and the wait below would time out.
      const promise = fetchCards(ids, {
        baseUrl: serverUrl,
        concurrency: 8,
        backoffMs: [1500, 1500, 1500, 1500, 1500],
      });

      await waitFor(
        () => held.length === 8,
        900,
        "8 card requests in flight while the 503 backs off"
      );
      expect(held.length).toBe(8);
      expect(hits(`/cards/${failing}`)).toBe(1);

      releaseHeld();
      const res = await promise;

      expect(maxInFlight).toBeLessThanOrEqual(8);
      expect(res.failedIds).toEqual([]);
      expect(res.results.size).toBe(20);
      expect(res.retries).toBe(1);
      expect(hits(`/cards/${failing}`)).toBe(2);
    }, 20000);

    it("honours a lower concurrency option", async () => {
      const ids = Array.from({ length: 12 }, (_, i) => cardId(i + 1));
      registerCards(ids, (id) => ({ status: 200, body: JSON.stringify(cardDoc(id)), hold: true }));

      const promise = fetchCards(ids, {
        baseUrl: serverUrl,
        concurrency: 3,
        backoffMs: ZERO_BACKOFF,
      });

      await waitFor(() => held.length === 3, 1000, "3 requests in flight");
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(held.length).toBe(3);

      releaseHeld();
      const res = await promise;
      expect(res.results.size).toBe(12);
      expect(maxInFlight).toBeLessThanOrEqual(3);
    }, 20000);
  });

  // --- BR-S02.T03-04 --------------------------------------------------------

  describe("404 handling (BR-S02.T03-04)", () => {
    it("404 returns null, counts notFound and writes no file", async () => {
      const ids = [cardId(1), "sv1-999"];
      registerCards([cardId(1)]);
      routes.set("/cards/sv1-999", { status: 404, body: "Not Found" });

      const res = await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(res.notFound).toBe(1);
      expect(res.results.has("sv1-999")).toBe(true);
      expect(res.results.get("sv1-999")).toBeNull();
      expect(res.failedIds).toEqual([]);
      expect(fs.existsSync(tcgdex.cardFile("sv1-999"))).toBe(false);
      expect(fs.existsSync(tcgdex.cardFile(cardId(1)))).toBe(true);
    });

    it("never retries a 404", async () => {
      routes.set("/cards/sv1-999", { status: 404, body: "Not Found" });
      await fetchCards(["sv1-999"], { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      expect(hits("/cards/sv1-999")).toBe(1);
    });

    it("a 404 on an unknown set id returns null after one request and caches nothing", async () => {
      routes.set("/sets/nope", { status: 404, body: "Not Found" });
      const brief = await fetchSetBrief("nope", { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      expect(brief).toBeNull();
      expect(hits("/sets/nope")).toBe(1);
      expect(fs.existsSync(tcgdex.setFile("nope"))).toBe(false);
    });
  });

  // --- BR-S02.T03-05 --------------------------------------------------------

  describe("Backoff sequence and Retry-After (BR-S02.T03-05)", () => {
    const BASE_SEQUENCE = [1000, 2000, 4000, 8000, 16000];

    it("injected retries follow the documented sequence inside the jitter band", () => {
      BASE_SEQUENCE.forEach((base, index) => {
        const attempt = index + 1;
        for (let sample = 0; sample < 40; sample++) {
          const delay = backoffDelay(attempt);
          expect(delay).toBeGreaterThanOrEqual(base * 0.8);
          expect(delay).toBeLessThanOrEqual(base * 1.2);
        }
      });
    });

    it("caps the base delay at 16 s for later attempts", () => {
      for (const attempt of [5, 6, 8]) {
        const delay = backoffDelay(attempt);
        expect(delay).toBeGreaterThanOrEqual(16000 * 0.8);
        expect(delay).toBeLessThanOrEqual(16000 * 1.2);
      }
    });

    it("applies jitter rather than a fixed delay", () => {
      const samples = new Set(Array.from({ length: 40 }, () => backoffDelay(1)));
      expect(samples.size).toBeGreaterThan(1);
    });

    it("Retry-After in seconds overrides the computed backoff", () => {
      const response = new Response(null, {
        status: 429,
        headers: { "retry-after": "3" },
      });
      const delay = backoffDelay(1, response);
      expect(delay).toBeGreaterThanOrEqual(3000);
      expect(delay).toBeLessThanOrEqual(3100);
    });

    it("Retry-After: 30 is honoured on a later attempt too", () => {
      const response = new Response(null, {
        status: 429,
        headers: { "retry-after": "30" },
      });
      const delay = backoffDelay(2, response);
      expect(delay).toBeGreaterThanOrEqual(30000);
      expect(delay).toBeLessThanOrEqual(30100);
    });

    it("Retry-After as an HTTP-date is honoured", () => {
      const when = new Date(Date.now() + 3000);
      const response = new Response(null, {
        status: 429,
        headers: { "retry-after": when.toUTCString() },
      });
      const delay = backoffDelay(1, response);
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(4500);
    });

    it("falls back to the computed backoff when Retry-After is unparseable", () => {
      const response = new Response(null, {
        status: 429,
        headers: { "retry-after": "soon" },
      });
      const delay = backoffDelay(1, response);
      expect(delay).toBeGreaterThanOrEqual(800);
      expect(delay).toBeLessThanOrEqual(1200);
    });

    it("never returns a negative delay for a Retry-After date in the past", () => {
      const response = new Response(null, {
        status: 429,
        headers: { "retry-after": new Date(Date.now() - 60000).toUTCString() },
      });
      expect(backoffDelay(1, response)).toBeGreaterThanOrEqual(0);
    });

    it("retries 429 and 5xx and counts them in `retries`", async () => {
      const ids = [cardId(1), cardId(2)];
      registerCards(ids, (id) => ({
        sequence: id === cardId(1) ? [429, 200] : [503, 503, 200],
        body: JSON.stringify(cardDoc(id)),
      }));

      const res = await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(hits(`/cards/${cardId(1)}`)).toBe(2);
      expect(hits(`/cards/${cardId(2)}`)).toBe(3);
      expect(res.retries).toBe(3);
      expect(res.failedIds).toEqual([]);
      expect(res.results.size).toBe(2);
    });

    it("stops after 5 attempts on a persistent 500", async () => {
      routes.set(`/cards/${cardId(1)}`, { status: 500, body: "Server Error" });
      const res = await fetchCards([cardId(1)], { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(hits(`/cards/${cardId(1)}`)).toBe(5);
      expect(res.failedIds).toEqual([cardId(1)]);
      expect(fs.existsSync(tcgdex.cardFile(cardId(1)))).toBe(false);
    });

    it("retries a connection dropped mid-body and writes nothing until it parses", async () => {
      routes.set(`/cards/${cardId(1)}`, {
        dropBody: true,
        body: JSON.stringify(cardDoc(cardId(1))),
      });

      const res = await fetchCards([cardId(1)], { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(hits(`/cards/${cardId(1)}`)).toBe(5);
      expect(res.failedIds).toEqual([cardId(1)]);
      expect(fs.existsSync(tcgdex.cardFile(cardId(1)))).toBe(false);
      const cardsDir = path.join(tempCacheDir, "tcgdex", "cards");
      const leftovers = fs.existsSync(cardsDir)
        ? fs.readdirSync(cardsDir).filter((f) => f.includes(".tmp"))
        : [];
      expect(leftovers).toEqual([]);
    });

    it("does not retry a non-404 4xx", async () => {
      routes.set(`/cards/${cardId(1)}`, { status: 403, body: "Forbidden" });
      const res = await fetchCards([cardId(1)], { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(hits(`/cards/${cardId(1)}`)).toBe(1);
      expect(res.failedIds).toEqual([cardId(1)]);
      expect(res.retries).toBe(0);
    });

    it("fetchSetList throws after exhausting its attempts on a 503", async () => {
      routes.set("/sets", { status: 503, body: "Service Unavailable" });
      await expect(
        fetchSetList({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF })
      ).rejects.toThrow();
      expect(hits("/sets")).toBe(5);
      expect(fs.existsSync(tcgdex.setsFile())).toBe(false);
    });
  });

  // --- BR-S02.T03-06 --------------------------------------------------------

  describe("Graceful partial failures (BR-S02.T03-06)", () => {
    it("3 failing cards out of 10 still resolve 7 and report 3", async () => {
      const ids = tenIds();
      const failing = new Set([cardId(2), cardId(5), cardId(9)]);
      registerCards(ids, (id) =>
        failing.has(id)
          ? { status: 500, body: "Server Error" }
          : { status: 200, body: JSON.stringify(cardDoc(id)) }
      );

      const res = await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(res.failedIds).toHaveLength(3);
      expect([...res.failedIds].sort()).toEqual([...failing].sort());
      expect(res.results.size).toBe(7);
      for (const id of ids) {
        if (failing.has(id)) {
          // A failed id is reported through `failedIds`, never as a `null` result:
          // `null` is reserved for a confirmed 404 (BR-S02.T03-04).
          expect(res.results.has(id)).toBe(false);
          expect(hits(`/cards/${id}`)).toBe(5);
          expect(fs.existsSync(tcgdex.cardFile(id))).toBe(false);
        } else {
          expect(must(res.results.get(id), `card ${id}`).id).toBe(id);
          expect(fs.existsSync(tcgdex.cardFile(id))).toBe(true);
        }
      }
    });

    it("reports final progress through onProgress", async () => {
      const ids = tenIds();
      registerCards(ids);
      const calls: Array<[number, number]> = [];

      await fetchCards(ids, {
        baseUrl: serverUrl,
        backoffMs: ZERO_BACKOFF,
        onProgress: (done: number, total: number) => calls.push([done, total]),
      });

      expect(calls.length).toBeGreaterThan(0);
      for (const [done, total] of calls) {
        expect(total).toBe(10);
        expect(done).toBeGreaterThanOrEqual(0);
        expect(done).toBeLessThanOrEqual(total);
      }
      expect(calls[calls.length - 1]).toEqual([10, 10]);
    });

    it("an empty id list resolves to empty counters without any request", async () => {
      const res = await fetchCards([], { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      expect(requestLog).toHaveLength(0);
      expect(res.results.size).toBe(0);
      expect(res.failedIds).toEqual([]);
      expect(res.requests).toBe(0);
      expect(res.bytes).toBe(0);
    });

    it("an already-aborted signal issues no request and writes no file", async () => {
      const ids = tenIds();
      registerCards(ids);
      const controller = new AbortController();
      controller.abort();

      await fetchCards(ids, {
        baseUrl: serverUrl,
        backoffMs: ZERO_BACKOFF,
        signal: controller.signal,
      }).catch(() => undefined);

      expect(requestLog).toHaveLength(0);
      expect(countFiles(path.join(tempCacheDir, "tcgdex"))).toBe(0);
    });
  });

  // --- BR-S02.T03-07 --------------------------------------------------------

  describe("Circuit breaker (BR-S02.T03-07)", () => {
    it("an all-503 endpoint aborts after 50 consecutive failures", async () => {
      const ids = Array.from({ length: 120 }, (_, i) => cardId(i + 1));
      registerCards(ids, () => ({ status: 503, body: "Service Unavailable" }));

      await expect(
        fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF })
      ).rejects.toBeInstanceOf(TcgdexUnavailableError);

      // Walking the whole list would cost 120 × 5 = 600 requests; the breaker stops far short.
      expect(requestLog.length).toBeGreaterThanOrEqual(50);
      expect(requestLog.length).toBeLessThan(600);
      expect(countFiles(path.join(tempCacheDir, "tcgdex"))).toBe(0);
    }, 30000);

    it("reports the consecutive failure count on the error", async () => {
      const ids = Array.from({ length: 120 }, (_, i) => cardId(i + 1));
      registerCards(ids, () => ({ status: 503, body: "Service Unavailable" }));

      let caught: unknown;
      try {
        await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      } catch (err: unknown) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(TcgdexUnavailableError);
      const error = caught as TcgdexUnavailableError;
      expect(error.name).toBe("TcgdexUnavailableError");
      expect(error.consecutiveFailures).toBe(50);
      expect(error.message).toMatch(/50/);
    }, 30000);

    it("any success resets the counter, so a flaky endpoint never trips the breaker", async () => {
      const ids = Array.from({ length: 120 }, (_, i) => cardId(i + 1));
      registerCards(ids, (id) =>
        Number(id.slice(id.indexOf("-") + 1)) % 2 === 0
          ? { status: 500, body: "Server Error" }
          : { status: 200, body: JSON.stringify(cardDoc(id)) }
      );

      const res = await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(res.failedIds).toHaveLength(60);
      expect(res.results.size).toBe(60);
    }, 30000);
  });

  // --- BR-S02.T03-08 --------------------------------------------------------

  describe("Force refresh preserves a good cache (BR-S02.T03-08)", () => {
    it("force refresh with an unparseable body keeps the old file", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      const file = tcgdex.cardFile(cardId(1));
      const before = fs.readFileSync(file, "utf8");
      const mtimeBefore = fs.statSync(file).mtimeMs;

      routes.set(`/cards/${cardId(1)}`, { status: 200, body: "<html>not json</html>" });
      const res = await fetchCards(ids, {
        baseUrl: serverUrl,
        force: true,
        backoffMs: ZERO_BACKOFF,
      });

      expect(res.failedIds).toEqual([cardId(1)]);
      expect(fs.readFileSync(file, "utf8")).toBe(before);
      expect(fs.statSync(file).mtimeMs).toBe(mtimeBefore);
      expect(readCachedCard(cardId(1))).not.toBeNull();
    });

    it("force refresh with an empty body keeps the old file", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      const file = tcgdex.cardFile(cardId(1));
      const before = fs.readFileSync(file, "utf8");

      routes.set(`/cards/${cardId(1)}`, { status: 200, body: "" });
      const res = await fetchCards(ids, {
        baseUrl: serverUrl,
        force: true,
        backoffMs: ZERO_BACKOFF,
      });

      expect(res.failedIds).toEqual([cardId(1)]);
      expect(fs.readFileSync(file, "utf8")).toBe(before);
    });

    it("force refresh that fails with 503 keeps the old file readable", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      const before = fs.readFileSync(tcgdex.cardFile(cardId(1)), "utf8");

      routes.set(`/cards/${cardId(1)}`, { status: 503, body: "Service Unavailable" });
      const res = await fetchCards(ids, {
        baseUrl: serverUrl,
        force: true,
        backoffMs: ZERO_BACKOFF,
      });

      expect(res.failedIds).toEqual([cardId(1)]);
      expect(fs.readFileSync(tcgdex.cardFile(cardId(1)), "utf8")).toBe(before);
      expect(must(readCachedCard(cardId(1)), "cached card").id).toBe(cardId(1));
    });

    it("leaves no .tmp leftovers behind after a failed refresh", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      routes.set(`/cards/${cardId(1)}`, { status: 200, body: "{broken" });
      await fetchCards(ids, { baseUrl: serverUrl, force: true, backoffMs: ZERO_BACKOFF });

      const cardsDir = path.dirname(tcgdex.cardFile(cardId(1)));
      expect(fs.readdirSync(cardsDir).filter((f) => f.includes(".tmp"))).toEqual([]);
    });
  });

  // --- BR-S02.T03-09 --------------------------------------------------------

  describe("User-Agent and zero credentials (BR-S02.T03-09)", () => {
    it("sends a descriptive User-Agent and an application/json Accept", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      routes.set("/sets", { status: 200, body: JSON.stringify(sampleSetList) });

      await fetchSetList({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(requestLog.length).toBeGreaterThan(0);
      for (const req of requestLog) {
        expect(String(req.headers["user-agent"] ?? "")).toMatch(/^pokesearch2-etl\/0\.1/);
        expect(String(req.headers["accept"] ?? "")).toContain("application/json");
      }
    });

    it("sends no credential header and no query string", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      for (const req of requestLog) {
        expect(req.headers["authorization"]).toBeUndefined();
        expect(req.headers["x-api-key"]).toBeUndefined();
        expect(req.headers["api-key"]).toBeUndefined();
        expect(req.headers["cookie"]).toBeUndefined();
        expect(req.search).toBe("");
      }
    });

    it("reads nothing from process.env in the module source", () => {
      const source = fs.readFileSync(
        fileURLToPath(new URL("./fetch-tcgdex.ts", import.meta.url)),
        "utf8"
      );
      expect(source).not.toMatch(/process\.env/);
      expect(source).not.toMatch(/api[_-]?key/i);
    });
  });

  // --- Offline readers ------------------------------------------------------

  describe("Offline readers", () => {
    it("readCachedCard returns the cached document without any request", async () => {
      const ids = [cardId(1)];
      registerCards(ids);
      await fetchCards(ids, { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      requestLog = [];

      const card = must(readCachedCard(cardId(1)), "cached card");
      expect(card.id).toBe(cardId(1));
      expect(card.name).toBe(`Card ${cardId(1)}`);
      expect(card.legal?.standard).toBe(true);
      expect(typeof card._fetched_at).toBe("string");
      expect(requestLog).toHaveLength(0);
    });

    it("readCachedSet returns the cached brief without any request", async () => {
      routes.set("/sets/sv1", { status: 200, body: JSON.stringify(setBriefDoc([cardId(1)])) });
      await fetchSetBrief("sv1", { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      requestLog = [];

      const set = must(readCachedSet("sv1"), "cached set");
      expect(set.id).toBe("sv1");
      expect(set.cards).toHaveLength(1);
      expect(requestLog).toHaveLength(0);
    });

    it("returns null when the file is absent", () => {
      expect(readCachedCard("sv1-404")).toBeNull();
      expect(readCachedSet("nope")).toBeNull();
      expect(requestLog).toHaveLength(0);
    });

    it("returns null when the file is corrupted", () => {
      fs.mkdirSync(path.dirname(tcgdex.cardFile(cardId(1))), { recursive: true });
      fs.writeFileSync(tcgdex.cardFile(cardId(1)), '{"id": "sv1-001"', "utf8");
      fs.mkdirSync(path.dirname(tcgdex.setFile("sv1")), { recursive: true });
      fs.writeFileSync(tcgdex.setFile("sv1"), "not json at all", "utf8");

      expect(readCachedCard(cardId(1))).toBeNull();
      expect(readCachedSet("sv1")).toBeNull();
      expect(requestLog).toHaveLength(0);
    });
  });

  // --- seedCacheFrom --------------------------------------------------------

  describe("Cache seeding (seedCacheFrom, D-003)", () => {
    let seedDir: string;

    beforeEach(() => {
      seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-tcgdex-seed-"));
      fs.mkdirSync(path.join(seedDir, "cards"), { recursive: true });
      fs.mkdirSync(path.join(seedDir, "sets"), { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(seedDir)) {
        fs.rmSync(seedDir, { recursive: true, force: true });
      }
    });

    function writeSeed(relative: string, contents: string): void {
      const target = path.join(seedDir, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents, "utf8");
    }

    it("copies valid card files, set briefs and the set list", async () => {
      writeSeed(`cards/${cardId(1)}.json`, JSON.stringify(cardDoc(cardId(1))));
      writeSeed(`cards/${cardId(2)}.json`, JSON.stringify(cardDoc(cardId(2))));
      writeSeed("sets/sv1.json", JSON.stringify(setBriefDoc([cardId(1), cardId(2)])));
      writeSeed("sets.json", JSON.stringify(sampleSetList));

      const result = await seedCacheFrom(seedDir);

      expect(result.copied).toBe(4);
      expect(result.skipped).toBe(0);
      expect(fs.existsSync(tcgdex.cardFile(cardId(1)))).toBe(true);
      expect(fs.existsSync(tcgdex.cardFile(cardId(2)))).toBe(true);
      expect(fs.existsSync(tcgdex.setFile("sv1"))).toBe(true);
      expect(fs.existsSync(tcgdex.setsFile())).toBe(true);
      expect(must(readCachedCard(cardId(1)), "seeded card").name).toBe(`Card ${cardId(1)}`);
      expect(must(readCachedSet("sv1"), "seeded set").cards).toHaveLength(2);
      expect(requestLog).toHaveLength(0);
    });

    it("refuses a source directory containing a database file and copies nothing", async () => {
      writeSeed(`cards/${cardId(1)}.json`, JSON.stringify(cardDoc(cardId(1))));
      fs.writeFileSync(path.join(seedDir, "pokesearch.db"), "SQLite format 3\u0000", "utf8");

      await expect(seedCacheFrom(seedDir)).rejects.toThrow(/\.db/i);
      expect(countFiles(path.join(tempCacheDir, "tcgdex"))).toBe(0);
    });

    it("refuses a database file nested inside the source directory", async () => {
      fs.mkdirSync(path.join(seedDir, "db"), { recursive: true });
      fs.writeFileSync(path.join(seedDir, "db", "legacy.db"), "SQLite format 3\u0000", "utf8");

      await expect(seedCacheFrom(seedDir)).rejects.toThrow(/\.db/i);
    });

    it("skips malformed JSON and documents without an id", async () => {
      writeSeed(`cards/${cardId(1)}.json`, JSON.stringify(cardDoc(cardId(1))));
      writeSeed("cards/broken.json", '{"id": "sv1-00');
      writeSeed("cards/no-id.json", JSON.stringify({ name: "No identifier" }));
      writeSeed("cards/notes.txt", "ignored, not JSON");

      const result = await seedCacheFrom(seedDir);

      expect(result.copied).toBe(1);
      expect(result.skipped).toBeGreaterThanOrEqual(2);
      expect(fs.existsSync(tcgdex.cardFile(cardId(1)))).toBe(true);
      expect(fs.existsSync(tcgdex.cardFile("broken"))).toBe(false);
      expect(fs.existsSync(tcgdex.cardFile("no-id"))).toBe(false);
    });

    it("throws when the source directory does not exist", async () => {
      await expect(seedCacheFrom(path.join(seedDir, "missing"))).rejects.toThrow();
    });

    it("seeded cards are served from the cache with zero HTTP requests", async () => {
      writeSeed(`cards/${cardId(1)}.json`, JSON.stringify(cardDoc(cardId(1))));
      await seedCacheFrom(seedDir);
      registerCards([cardId(1)]);

      const res = await fetchCards([cardId(1)], { baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(requestLog).toHaveLength(0);
      expect(res.cacheHits).toBe(1);
      expect(res.requests).toBe(0);
    });
  });

  // --- Fixture schema parity -------------------------------------------------

  describe("Fixture schema parity (packages/db/fixtures)", () => {
    const fixtureNames = [
      "tcgdex-card-both-prices.json",
      "tcgdex-card-cardmarket-only.json",
      "tcgdex-card-no-prices.json",
    ] as const;

    function fixturePath(name: string): string {
      return fileURLToPath(new URL(`../../db/fixtures/${name}`, import.meta.url));
    }

    function loadFixture(name: string): TcgdexCard {
      return JSON.parse(fs.readFileSync(fixturePath(name), "utf8")) as TcgdexCard;
    }

    it("every fixture matches the TcgdexCard shape and carries no _fetched_at", () => {
      for (const name of fixtureNames) {
        const card = loadFixture(name);
        expect(typeof card.id).toBe("string");
        expect(typeof card.localId).toBe("string");
        expect(typeof card.name).toBe("string");
        expect(card.legal?.standard).toBe(true);
        expect(card.legal?.expanded).toBe(true);
        expect(typeof card.variants?.["normal"]).toBe("boolean");
        expect(card).not.toHaveProperty("_fetched_at");
      }
    });

    it("covers both price blocks, Cardmarket only and no pricing at all", () => {
      const both = loadFixture("tcgdex-card-both-prices.json");
      expect(both.pricing?.tcgplayer).toBeDefined();
      expect(both.pricing?.cardmarket).toBeDefined();
      expect(both.pricing?.tcgplayer?.["unit"]).toBe("USD");
      expect(both.pricing?.cardmarket?.["unit"]).toBe("EUR");

      const cardmarketOnly = loadFixture("tcgdex-card-cardmarket-only.json");
      expect(cardmarketOnly.pricing?.tcgplayer).toBeUndefined();
      expect(cardmarketOnly.pricing?.cardmarket?.["unit"]).toBe("EUR");

      const noPrices = loadFixture("tcgdex-card-no-prices.json");
      expect(noPrices.pricing).toBeUndefined();
    });

    it("uses three distinct card ids so a price snapshot can key on them", () => {
      const ids = fixtureNames.map((name) => loadFixture(name).id);
      expect(new Set(ids).size).toBe(3);
    });

    it("round-trips through the cache: seeded, then read back by readCachedCard", async () => {
      const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-tcgdex-fixtures-"));
      try {
        fs.mkdirSync(path.join(seedDir, "cards"), { recursive: true });
        for (const name of fixtureNames) {
          const card = loadFixture(name);
          fs.copyFileSync(fixturePath(name), path.join(seedDir, "cards", `${card.id}.json`));
        }

        const result = await seedCacheFrom(seedDir);
        expect(result.copied).toBe(3);

        for (const name of fixtureNames) {
          const fixture = loadFixture(name);
          const cached = must(readCachedCard(fixture.id), `cached ${fixture.id}`);
          expect(cached).toEqual(fixture);
        }
      } finally {
        fs.rmSync(seedDir, { recursive: true, force: true });
      }
    });
  });
});
