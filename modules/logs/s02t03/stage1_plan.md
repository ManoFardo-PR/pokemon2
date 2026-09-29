### 1. Objective and Context

The goal of S02T03 is to implement the TCGdex card data fetcher (`packages/etl/src/fetch-tcgdex.ts`) and its unit test suite (`packages/etl/src/fetch-tcgdex.spec.ts`), as well as integrate the step into the ETL orchestrator (`packages/etl/src/orchestrator.ts`).

TCGdex is the **complement** dataset (providing Cardmarket/TCGplayer prices, standard/expanded legality flags, card variants, and WebP images), not the canonical card database (which is provided by pokemon-tcg-data in S02T02). It addresses approximately ~20k cards with individual HTTP requests. To handle this efficiently, it requires:
- Cache-by-presence with atomic writes (`writeJsonAtomic`).
- Concurrency limiter (default 8 concurrent requests) held strictly around HTTP requests, not during backoff sleeps (BR-S02.T03-03).
- Retry policy for transport errors, 429, and 5xx (5 attempts with exponential backoff 1s, 2s, 4s, 8s, 16s with ±20% jitter and `Retry-After` support).
- 404 handled gracefully as `null` without retries or caching empty files.
- Circuit breaker aborting after 50 consecutive failed requests with `TcgdexUnavailableError`.
- `_fetched_at` timestamp stamped on card JSON cache documents only (not set lists or set briefs).
- Cache seeding utility (`seedCacheFrom`) to safely copy cache files from legacy folders while refusing any folder containing `.db` files.
- Offline reader functions `readCachedCard` and `readCachedSet`.
- Integration into the pipeline via `createFetchTcgdexStep` in `packages/etl/src/orchestrator.ts`.

---

### 2. Target Files

| Path | Role | Action | Purpose |
|---|---|---|---|
| `packages/etl/src/fetch-tcgdex.ts` | src | create | Core TCGdex fetcher, concurrency limiter, cache logic, retry loop, offline readers, and cache seeder |
| `packages/etl/src/fetch-tcgdex.spec.ts` | test | create | Vitest test suite covering all business rules (BR-S02.T03-01 to 09) and error scenarios |
| `packages/etl/src/orchestrator.ts` | src | patch | Wire `fetch-tcgdex` step into `StepRegistry` replacing the stub and updating run stats |

---

### 3. Technical Requirements and Contracts

#### 3.1 Interfaces and Constants

In `packages/etl/src/fetch-tcgdex.ts`:

```typescript
export const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";
export const TCGDEX_CONCURRENCY = 8; // legacy config.TCGDEX_CONCURRENCY

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
  pricing?: {
    tcgplayer?: Record<string, unknown>;
    cardmarket?: Record<string, unknown>;
  };
  _fetched_at?: string;
}

export interface FetchCardsOptions {
  force?: boolean;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Test/internal hook: override base URL */
  baseUrl?: string;
  /** Test/internal hook: override retry backoff sequence */
  backoffSchedule?: readonly number[];
  /** Test/internal hook: override limiter */
  limiter?: Limiter;
}

export interface FetchCardsResult {
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
    super(message ?? `TCGdex endpoint unavailable: ${consecutiveFailures} consecutive failures`);
    this.name = "TcgdexUnavailableError";
    this.consecutiveFailures = consecutiveFailures;
  }
}

export interface Limiter {
  <T>(fn: () => Promise<T>): Promise<T>;
  readonly activeCount: number;
  readonly pendingCount: number;
}

export function limiter(concurrency: number): Limiter;

export async function fetchSetList(opts?: {
  force?: boolean;
  signal?: AbortSignal;
  baseUrl?: string;
  backoffSchedule?: readonly number[];
}): Promise<TcgdexSetSummary[]>;

export async function fetchSetBrief(
  setId: string,
  opts?: {
    force?: boolean;
    signal?: AbortSignal;
    baseUrl?: string;
    backoffSchedule?: readonly number[];
  }
): Promise<TcgdexSet | null>;

export async function fetchCards(
  ids: string[],
  opts?: FetchCardsOptions
): Promise<FetchCardsResult>;

export function readCachedCard(id: string): TcgdexCard | null;
export function readCachedSet(id: string): TcgdexSet | null;

export async function seedCacheFrom(
  dir: string
): Promise<{ copied: number; skipped: number }>;
```

#### 3.2 Business Rules Verbatim

- **BR-S02.T03-01**: A cached card or set file is used without any HTTP request unless `force` is set; presence plus successful JSON parse is the only cache check.
- **BR-S02.T03-02**: Every card document written to the cache carries `_fetched_at` as an ISO-8601 UTC timestamp; set briefs and the set list do not.
- **BR-S02.T03-03**: The concurrency limiter is held only around the HTTP request; backoff sleeps happen outside it, for both transport and HTTP failures.
- **BR-S02.T03-04**: A `404` yields `null` and is counted, never retried and never cached as an empty document.
- **BR-S02.T03-05**: 429 and 5xx are retried up to 5 times with exponential backoff from 1 s (1, 2, 4, 8, 16 s) plus ±20 % jitter; `Retry-After` overrides the computed delay when present.
- **BR-S02.T03-06**: Individual card failures never fail the step: they are collected into `failedIds` and reported; the step fails only if the set list itself cannot be read.
- **BR-S02.T03-07**: The step aborts with an error when 50 consecutive requests fail, instead of walking the whole id list against a dead endpoint.
- **BR-S02.T03-08**: `--force` re-requests documents but only replaces a cache file after the new body parses; a failed refresh leaves the previous document readable.
- **BR-S02.T03-09**: Requests carry a descriptive `User-Agent` and no credentials; TCGdex needs no key and none is ever read from the environment.

#### 3.3 Details of Limiter, Retry, and Concurrency Architecture

1. **Internal Semaphore / Limiter (`limiter(n)`):**
   - Implements a FIFO queue of task executors.
   - When a slot becomes available (active < concurrency), next queued item starts.
   - Tracks `activeCount` and `pendingCount`.
   - Wrapping is strictly around the HTTP invocation:
     ```ts
     const res = await limit(() => doHttpCall(...));
     ```
   - If an error or retry condition occurs, the HTTP call completes, releasing the slot in the limiter, and `sleep(backoff)` executes outside the limited block (BR-S02.T03-03).
2. **HTTP Client & Retry:**
   - Headers: `{ "user-agent": "pokesearch2-etl/0.1 (+https://github.com/miz/pokemon2)", "accept": "application/json" }`. No authorization headers or environment variable reads (BR-S02.T03-09).
   - Retryable statuses: 429, 500, 502, 503, 504, plus network / transport errors (`FetchError`, `TypeError: fetch failed`, network drops, timeouts).
   - Maximum retries: 5.
   - Backoff calculation: `Math.min(16000, 1000 * Math.pow(2, attempt - 1)) * (0.8 + 0.4 * Math.random())`. If response has `Retry-After`:
     - If integer string: parsed as seconds (`parseInt(val, 10) * 1000`).
     - If HTTP date: `Math.max(0, Date.parse(val) - Date.now())`.
   - 404 returns `{ notFound: true, body: null }` immediately without retrying or caching (BR-S02.T03-04).
   - Other 4xx status codes throw an error immediately without retrying.
3. **Cache Storage Rules:**
   - Set list: `tcgdex.setsFile()` (`$RAW_CACHE_DIR/tcgdex/sets.json`). Must be a JSON array. Does NOT get `_fetched_at`.
   - Set brief: `tcgdex.setFile(id)` (`$RAW_CACHE_DIR/tcgdex/sets/${id}.json`). Does NOT get `_fetched_at`.
   - Card: `tcgdex.cardFile(id)` (`$RAW_CACHE_DIR/tcgdex/cards/${id}.json`). When written, stamped with `_fetched_at: new Date().toISOString()` (BR-S02.T03-02).
   - Corrupt cache reading: When reading a cached card or set, if JSON parsing fails, delete the corrupted file and treat as cache miss (returning null or triggering refetch).
   - Atomic replacement: When updating/writing cache, use `writeJsonAtomic` after validation (BR-S02.T03-08).
4. **Circuit Breaker:**
   - A consecutive failure counter is shared across all concurrent card workers in `fetchCards`.
   - Any successful fetch (200 or 404) resets consecutive failure counter to 0.
   - Any card that exhausts all retries or errors out increments consecutive failure counter.
   - If consecutive failure counter reaches 50, abort immediately and throw `TcgdexUnavailableError` (BR-S02.T03-07).
5. **Seed Cache From (`seedCacheFrom(dir)`):**
   - Check if `dir` contains any `.db` file (recursive check or top-level/subfolder check). If any `.db` file is detected, throw an Error rejecting the operation (D-003).
   - Look for `sets.json`, `sets/*.json`, `cards/*.json`.
   - Validate each JSON document:
     - `sets.json`: must be valid JSON array.
     - `sets/*.json`: must be valid JSON object with `id` property.
     - `cards/*.json`: must be valid JSON object with `id` property.
   - If valid, write to destination cache using `writeJsonAtomic`.
   - Returns `{ copied: number, skipped: number }`.

---

### 4. Test Scenarios (RED phase)

Test file: `packages/etl/src/fetch-tcgdex.spec.ts`

Exact imports:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import { tcgdex } from "./paths.js";
import {
  fetchSetList,
  fetchSetBrief,
  fetchCards,
  readCachedCard,
  readCachedSet,
  seedCacheFrom,
  limiter,
  TcgdexUnavailableError,
  type TcgdexCard,
  type TcgdexSet,
  type TcgdexSetSummary,
} from "./fetch-tcgdex.js";
```

Assertions to cover:
1. `fetch-tcgdex.spec.ts > set brief and 10 cards write 11 files and a second run makes zero HTTP requests with tcgdex_cache_hits = 10 (BR-S02.T03-01)`
   - First run requests set brief and 10 cards against mock server, writing 1 brief file and 10 card files.
   - Second run with `force: false` executes 0 HTTP requests, reports `cacheHits: 10`, `requests: 0`.
2. `fetch-tcgdex.spec.ts > card file has _fetched_at, set file does not (BR-S02.T03-02)`
   - Verify cached card JSON document on disk has an ISO-8601 string in `_fetched_at`.
   - Verify cached set brief JSON document and set list JSON document do NOT have `_fetched_at`.
3. `fetch-tcgdex.spec.ts > 8 concurrent slots stay busy while one request backs off (BR-S02.T03-03)`
   - Create mock server where one request triggers a 500 error requiring backoff delay while other requests proceed.
   - Measure active limiter slots: slot is released before backoff sleep starts, allowing other in-flight requests to maintain max concurrency.
4. `fetch-tcgdex.spec.ts > 404 returns null and writes no file (BR-S02.T03-04)`
   - Mock server returns 404 for card id `ghost-card`.
   - `fetchCards` returns `results.get("ghost-card") === null`, `notFound: 1`.
   - No cache file is written at `tcgdex.cardFile("ghost-card")`.
   - Mock server returns 404 for set brief; `fetchSetBrief` returns `null` and writes no file.
5. `fetch-tcgdex.spec.ts > injected 429s follow the documented sequence (BR-S02.T03-05)`
   - Mock server returns 429 three times then 200.
   - Verify backoffs match exponential pattern (1s, 2s, 4s within ±20% jitter) and total retries recorded is 3.
6. `fetch-tcgdex.spec.ts > Retry-After: 30 is honoured (BR-S02.T03-05)`
   - Mock server returns 429 with `Retry-After: 2` (or injected value).
   - Verify the sleep timer honors the specified header duration.
7. `fetch-tcgdex.spec.ts > 3 failing cards out of 10 still resolve 7 and report 3 (BR-S02.T03-06)`
   - 3 card requests fail with persistent 500 errors; 7 succeed.
   - `fetchCards` resolves successfully; `failedIds` contains exactly the 3 failed IDs, `results` contains the 7 succeeded ones; step does not throw.
8. `fetch-tcgdex.spec.ts > all-503 endpoint aborts after 50 consecutive failures (BR-S02.T03-07)`
   - Endpoint returns 503 for all requests.
   - Calling `fetchCards` with 60 card IDs aborts by throwing `TcgdexUnavailableError` with `consecutiveFailures >= 50`.
9. `fetch-tcgdex.spec.ts > force refresh with a bad body keeps the old file (BR-S02.T03-08)`
   - Pre-populate cache for card `card-1` with valid data.
   - Run `fetchCards(["card-1"], { force: true })` against an endpoint returning invalid JSON or connection drop.
   - Cached file for `card-1` on disk remains untouched with valid data.
10. `fetch-tcgdex.spec.ts > request headers carry descriptive User-Agent and no credentials (BR-S02.T03-09)`
    - Check headers captured by mock server: `User-Agent` starts with `pokesearch2-etl/0.1` and `Authorization` is undefined.
    - Check code does not read any `process.env` secrets for TCGdex.
11. `fetch-tcgdex.spec.ts > offline readers readCachedCard and readCachedSet return cached documents without network`
    - Pre-write valid files for a set and card into cache directory.
    - `readCachedCard` returns the card; `readCachedSet` returns the set.
    - Missing files return `null`. Corrupted files are deleted and return `null`.
12. `fetch-tcgdex.spec.ts > seedCacheFrom copies valid cache files and rejects directories containing .db files`
    - Create a fake seed dir with `cards/c1.json`, `sets/s1.json`, `sets.json`, and one corrupted JSON file.
    - `seedCacheFrom` copies valid files, skips corrupt ones.
    - If `pokesearch.db` exists in the seed dir, `seedCacheFrom` throws an Error and aborts.

---

### 5. Architecture and Coding Constraints

- **Language & Runtime:** TypeScript / Node.js native ESM (`"type": "module"`). Node v20+.
- **HTTP Client:** Native `fetch` (global fetch available in Node 20+, backed by undici) with custom headers (`User-Agent: pokesearch2-etl/0.1 (+https://github.com/miz/pokemon2)` and `Accept: application/json`).
- **No external heavy dependencies:** No `p-limit` or Axios. Implement `limiter(n)` directly in `fetch-tcgdex.ts` as a clean 30–40 line semaphore.
- **Paths & Atomicity:** Always use `tcgdex.setsFile()`, `tcgdex.setFile(id)`, `tcgdex.cardFile(id)` from `paths.ts` and `writeJsonAtomic` for file writes.
- **Write Fence:** All files to create or modify are strictly within `packages/etl/`. No changes to root lockfiles, git, or external config files.
- **Assumptions made:**
  - `fetchSetBrief` fetches `/sets/{id}` and caches to `tcgdex.setFile(id)`.
  - `fetchSetList` fetches `/sets` and caches to `tcgdex.setsFile()`.
  - In `orchestrator.ts`, `createFetchTcgdexStep` will call `fetchSetList()` and, if canonical sets are loaded or provided, fetch set briefs or cards as needed. For S02T03 standalone, `createFetchTcgdexStep` will fetch the set list and record stats (`tcgdex_requests`, `tcgdex_cache_hits`, `tcgdex_404`, `tcgdex_retries`, `tcgdex_failed`, `bytes_downloaded`), ready to be chained with card mapping in S02T04.

---

### 6. Existing Code This Task Depends On

#### `packages/etl/src/paths.ts`
```typescript
export const tcgdex = {
  setsFile: (): string => resolveCachePath("tcgdex", "sets.json"),
  setFile: (id: string): string => resolveCachePath("tcgdex", "sets", `${id}.json`),
  cardFile: (id: string): string => resolveCachePath("tcgdex", "cards", `${id}.json`),
};

export async function writeJsonAtomic(destPath: string, value: unknown): Promise<void>;
```

#### `packages/etl/src/orchestrator.ts`
```typescript
export interface LoadOptions {
  sets?: string[] | undefined;
  force?: boolean | undefined;
  skipTcgdex?: boolean | undefined;
  concurrency?: number | undefined;
  verbose?: boolean | undefined;
  ptcgBaseUrl?: string | undefined;
  backoffMs?: readonly number[] | undefined;
}

export interface StepContext {
  db: Db;
  run: RunHandle;
  options: LoadOptions;
}

export interface PipelineStep {
  name: string;
  execute: (ctx: StepContext) => Promise<void>;
}

export const defaultStepRegistry: StepRegistry = {
  fetchPtcg: createFetchPtcgStep(),
  fetchTcgdex: createStubStep("fetch-tcgdex"),
  mapIds: createStubStep("map-ids"),
  loadCards: createStubStep("load-cards"),
  rebuildFts: createStubStep("rebuild-fts"),
  snapshotPrices: createStubStep("snapshot-prices"),
};
```

#### `packages/etl/src/run-log.ts`
```typescript
export interface RunHandle {
  add: (stats: Record<string, unknown>) => void;
  // ...
}
```