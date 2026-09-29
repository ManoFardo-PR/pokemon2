You are a strict reviewer. Your only job is to decide whether the OUTPUT below delivers exactly what the PROMPT asked, in the required format. Do not request improvements beyond the request. Do not redo the work.

STAGE: Stage 1 - Planning (round 1)

================================================================================
PROMPT THAT WAS SENT TO THE WORKER:
================================================================================
You are a Principal Software Architect and Tech Lead. Your job is to gather every piece of context needed for subtask S02T03 and produce a SELF-CONTAINED MASTER PLAN. The later stages (test writer, implementer, auditor) will NOT read the workspace: everything they need must be inside your plan.

SUBTASK: S02T03
PROJECT: pokemon2
TEST RUNNER: `pnpm test`
TYPE CHECK / COMPILE: `pnpm typecheck`
PROJECT CONVENTIONS (hint from config, may be empty): pnpm monorepo (workspaces apps/* and packages/*). Production code lives in apps/<name>/src and packages/<name>/src; tests are *.spec.ts next to the code they cover (apps/web also uses apps/web/test/). Root Node scripts live in scripts/*.mjs with *.spec.mjs specs. Database migrations live in packages/db/migrations. The Rust engine lives in engine/ptcg-core and engine/ptcg-cli (Cargo workspace at engine/Cargo.toml, created by S04.T01) and is tested through `pnpm engine:test`, never by touching the database.
FILES TO READ FIRST (from the task, may be empty): docs/stages/02-card-data-and-search/T03-fetch-tcgdex.md

RULES:
1. The full specification of the subtask is at the end of this prompt (SPECIFICATION section). Do NOT look for a specification file on disk.
2. You have NO tools and cannot read the workspace. The orchestrator injected below the existing files it selected for you (WORKSPACE FILES). Plan only from them and from the specification; if a file you would need is missing, say so in section 5 and take the simplest safe assumption.
3. Decide where every file goes based on what you read in the project and on the specification. Use paths relative to the repository root. Do not invent a layout that contradicts the existing project.
4. If the specification provides interfaces or test scenarios, copy them exactly; do not reinterpret them. Do not add requirements that are not in the specification. If something is ambiguous, choose the simplest interpretation and record it in section 5.
5. Section 6 must contain the exact signatures (and short relevant excerpts) of every existing function, class or module that this task will call, extend or must stay compatible with. Later stages depend on this section instead of reading files.
6. WRITE FENCE: section 2 may only list paths under: apps, packages, engine, scripts, docs. Never under: modules, .git, .continue. If the task needs a change outside the fence (root configuration, CI, lockfiles), describe it in section 5 as a manual step for the maintainer; never put it in section 2.
7. Every business rule id of the specification (BR-..., RN-...) must appear verbatim in section 3 and be covered by at least one line of section 4 that names it. The test writer must cite these ids in test names; the orchestrator checks that.

OUTPUT FORMAT (mandatory: exactly these six sections, in this order, with these exact headings):

### 1. Objective and Context
[goal, dependencies on earlier tasks, what already exists in the workspace]

### 2. Target Files
A markdown table with one row per file to create or modify. Columns: Path | Role | Action | Purpose.
- Role is one of: test, src, config, doc
- Action is one of: create (new file), patch (edit an existing file with exact search/replace edits), rewrite (replace an existing file entirely; use only when a patch would be impractical)
Example:
| Path | Role | Action | Purpose |
|---|---|---|---|
| path/to/module.py | src | create | implements X |
| path/to/test_module.py | test | create | tests for X |

### 3. Technical Requirements and Contracts
[exact function/class signatures (name, parameters, types, return), numbered business rules (BR-...), error handling, edge cases]

### 4. Test Scenarios (RED phase)
[complete list of assertions the tests must cover, including edge cases; one line per assertion; include the exact import statement the tests must use]

### 5. Architecture and Coding Constraints
[language and runtime constraints, allowed dependencies, naming conventions, assumptions made]

### 6. Existing Code This Task Depends On
[for each existing file the implementation relies on: path, exact signatures, and short excerpts needed to use it correctly; write "None" if the task depends on nothing]

================================================================================
WORKSPACE FILES (injected by the orchestrator; "(none)" when nothing was injected):
================================================================================
### FILE: docs/stages/02-card-data-and-search/T03-fetch-tcgdex.md
```markdown
# S02.T03 — Fetch TCGdex (prices, legality, variants, images)

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 3 / 14 |
| Depends on | [S02.T01](T01-etl-cli-and-raw-cache.md) |
| Unblocks | [S02.T04](T04-set-and-card-id-mapping.md), [S02.T07](T07-prices-snapshot.md) |
| Parallel with | [S02.T02](T02-fetch-pokemon-tcg-data.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` CLI + cache layout + run log — from [S02.T01](T01-etl-cli-and-raw-cache.md)
- `external` `https://api.tcgdex.net/v2/en/sets`, `/sets/{id}` (brief card list `id, localId, name`), `/cards/{id}` (full card incl. `pricing`, `legal`, `variants`, `image`)
- `file` `pokemon/src/pokesearch/etl/fetch_tcgdex.py` — endpoints, retry/backoff, concurrency and the cache-by-presence policy; read-only reference

## Outputs (proposed)
- `module` `etl/fetch-tcgdex.ts` — `fetchSetList()`, `fetchSetBrief(id)`, `fetchCards(ids, { force, concurrency = 8 })` with file-per-entity cache (presence = cached), `_fetched_at` stamp, retry policy — consumed by [S02.T04](T04-set-and-card-id-mapping.md), [S02.T07](T07-prices-snapshot.md)
- `file` cached JSON under `RAW_CACHE_DIR/tcgdex/` (≈20k card files, ≈53 MB)

## Initial objective
All TCGdex card documents needed to complement the canonical data (prices, legality flags, variants, WebP images) are cached locally, fetched with bounded concurrency and polite retries, and refreshable in bulk for price snapshots.

## Context

TCGdex is the **complement**, never the canon: it supplies `pricing` (TCGplayer USD and Cardmarket EUR), `legal.standard` / `legal.expanded`, `variants`, the WebP image base and a `localId` used to pair printings. The card wording, attacks and abilities come from pokemon-tcg-data ([S02.T02](T02-fetch-pokemon-tcg-data.md)); RN-01 requires both raw documents to survive into the database side by side.

The scale is different from T02: one HTTP request per card, ≈20,219 cached files and ≈53 MB, a first full fetch of roughly 20k requests taking 30–60 minutes (legacy measurement). That forces three properties. **Bounded concurrency** — the legacy `config.TCGDEX_CONCURRENCY = 8` and this subtask keeps 8 as the default. **Cache by presence** — a card file that exists is never re-requested unless `force`, because per-file conditional requests would still cost 20k round trips. **Bulk refresh** — prices are only current if the whole card set is re-fetched, which is exactly what [S02.T07](T07-prices-snapshot.md) does with `force: true`.

The legacy implementation, `pokemon/src/pokesearch/etl/fetch_tcgdex.py`, is a good description of the endpoints and a flawed description of the retry loop: 5 attempts, delay starting at 1 s and doubling, 404 → `None`, retry on 429/500/502/503/504 and on transport/timeout errors, progress every 250 cards. But the backoff sleep after a **transport** error happens inside `async with sem`, so a flapping network holds concurrency slots idle, while the sleep after an **HTTP** 5xx happens outside it. This subtask fixes that asymmetry: the semaphore is only ever held around the request itself (BR-S02.T03-03). The legacy also never bounds total attempts across the run, so a full outage costs 20k × 5 requests before finishing "successfully" with 20k nulls; here a circuit breaker aborts the step (BR-S02.T03-07).

D-003 allows seeding the cache from the legacy `pokemon/data/raw/tcgdex` folder (164 MB total raw dir, of which TCGdex is ≈53 MB) to skip the first hour. That is a cache copy, not database reuse, and the documents are re-parsed by the new loader; it stays an explicit opt-in flag, never a default.

## Scope

- **In scope.** `packages/etl/src/fetch-tcgdex.ts`: endpoint wrappers, the file cache and its validation, the limiter, the retry/backoff policy and circuit breaker, `_fetched_at` stamping, progress reporting, the offline readers `readCachedCard` / `readCachedSet`, and the `--seed-from <dir>` importer for an existing cache directory.
- **Out of scope.** Matching TCGdex ids to canonical ids ([S02.T04](T04-set-and-card-id-mapping.md)); turning `pricing` into rows ([S02.T07](T07-prices-snapshot.md)); writing any card column ([S02.T06](T06-load-cards.md)); mirroring images (out of scope for the whole project — images are hotlinked, see [Vision and scope](../../project/01-vision-and-scope.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` here. RN-01 ("neither source overwrites the other") is what makes this fetcher's output a *separate* cached document rather than a patch on the canonical one.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T03-01 | A cached card or set file is used without any HTTP request unless `force` is set; presence plus successful JSON parse is the only cache check. | `readCache()` guard at the top of `fetchCard` / `fetchSetBrief` | `fetch-tcgdex.spec.ts > re-run makes zero HTTP requests` |
| BR-S02.T03-02 | Every card document written to the cache carries `_fetched_at` as an ISO-8601 UTC timestamp; set briefs and the set list do not. | the write path of `fetchCard` only | `fetch-tcgdex.spec.ts > card file has _fetched_at, set file does not` |
| BR-S02.T03-03 | The concurrency limiter is held only around the HTTP request; backoff sleeps happen outside it, for both transport and HTTP failures. | `limit(() => request(...))` with the retry loop wrapping the limited call | `fetch-tcgdex.spec.ts > 8 concurrent slots stay busy while one request backs off` (observed in-flight count) |
| BR-S02.T03-04 | A `404` yields `null` and is counted, never retried and never cached as an empty document. | the 404 branch returns before the write | `fetch-tcgdex.spec.ts > 404 returns null and writes no file` |
| BR-S02.T03-05 | 429 and 5xx are retried up to 5 times with exponential backoff from 1 s (1, 2, 4, 8, 16 s) plus ±20 % jitter; `Retry-After` overrides the computed delay when present. | `backoffDelay(attempt, response)` | `fetch-tcgdex.spec.ts > injected 429s follow the documented sequence`; `> Retry-After: 30 is honoured` |
| BR-S02.T03-06 | Individual card failures never fail the step: they are collected into `failedIds` and reported; the step fails only if the set list itself cannot be read. | `fetchCards` returns `{ results, failedIds }`; `fetchSetList` throws | `fetch-tcgdex.spec.ts > 3 failing cards out of 10 still resolve 7 and report 3` |
| BR-S02.T03-07 | The step aborts with an error when 50 consecutive requests fail, instead of walking the whole id list against a dead endpoint. | consecutive-failure counter in `fetchCards`, reset on any success | `fetch-tcgdex.spec.ts > all-503 endpoint aborts after 50 consecutive failures` |
| BR-S02.T03-08 | `--force` re-requests documents but only replaces a cache file after the new body parses; a failed refresh leaves the previous document readable. | `writeJsonAtomic` after validation | `fetch-tcgdex.spec.ts > force refresh with a bad body keeps the old file` |
| BR-S02.T03-09 | Requests carry a descriptive `User-Agent` and no credentials; TCGdex needs no key and none is ever read from the environment. | the single `undici` Agent configuration | `pnpm lint` grep: no `process.env` read inside `fetch-tcgdex.ts`; `> request headers` assertion in the spec |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|

... (truncated by the orchestrator: the worker received the full prompt; judge the requirements above against the OUTPUT)
================================================================================
OUTPUT THE WORKER RETURNED:
================================================================================
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
================================================================================
AUTOMATED CHECKS RUN BY THE ORCHESTRATOR ON THAT OUTPUT:
================================================================================
Sections found: [1, 2, 3, 4, 5, 6]
Files in section 2: packages/etl/src/fetch-tcgdex.ts (src/create), packages/etl/src/fetch-tcgdex.spec.ts (test/create), packages/etl/src/orchestrator.ts (src/patch)
Task target files: packages/etl/src/fetch-tcgdex.ts
No problems.
================================================================================

Decide:
- CORRECT: the output contains everything the prompt required, in the required format, consistent with the inputs given to the worker, and the automated checks show no problem.
- REWORK: something required is missing, wrong, contradicts the inputs, violates the format, or the automated checks report a problem.

OUTPUT FORMAT (mandatory): first line is the verdict, then at most 5 bullet lines with objective reasons (what is missing or wrong, referencing the prompt requirement). Nothing else.
VERDICT: CORRECT
or
VERDICT: REWORK
- reason 1
- reason 2
