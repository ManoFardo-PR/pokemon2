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
| `$RAW_CACHE_DIR/tcgdex/sets.json` | C/U | etl | start of a load, and on `--force` | overwritten whole; must parse as a non-empty array of `{id}` | the TCGdex set universe used by [S02.T04](T04-set-and-card-id-mapping.md) |
| `$RAW_CACHE_DIR/tcgdex/sets/<tcgdexSetId>.json` | C/U | etl | when a canonical set resolves to a TCGdex set | written only on 200; contains the brief card list (`id`, `localId`, `name`) | ≈174 files |
| `$RAW_CACHE_DIR/tcgdex/cards/<tcgdexCardId>.json` | C/U | etl | per matched card, first time or under `force` | write is atomic and only after JSON validation; `_fetched_at` added | ≈20,219 files, ≈53 MB (legacy measurement) |
| cache files | D | etl | when a cached file fails to parse | deleted, then re-fetched once | keeps a crash from poisoning the cache |
| `$RAW_CACHE_DIR/tcgdex/**` | R | etl | [S02.T04](T04-set-and-card-id-mapping.md), [S02.T06](T06-load-cards.md), [S02.T07](T07-prices-snapshot.md) | read-only, offline | `readCachedCard(id)` / `readCachedSet(id)` |
| `$RAW_CACHE_DIR/tcgdex/**` | C | developer (`etl full --seed-tcgdex-from <dir>`) | once, optionally | copies only `cards/*.json`, `sets/*.json`, `sets.json`; skips files that fail validation; never copies a database | D-003: cache, not database |
| `etl_runs.stats_json` | U | etl | end of the step | flat counters | `tcgdex_requests`, `tcgdex_cache_hits`, `tcgdex_404`, `tcgdex_retries`, `tcgdex_failed`, `bytes_downloaded` |
| card tables | — | — | — | not written here | [S02.T06](T06-load-cards.md) / [S02.T07](T07-prices-snapshot.md) own them |

## Interfaces

**`packages/etl/src/fetch-tcgdex.ts`**

```ts
export const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";
export const TCGDEX_CONCURRENCY = 8;      // legacy config.TCGDEX_CONCURRENCY

export interface TcgdexSetSummary { id: string; name: string; cardCount?: { total?: number; official?: number }; }
export interface TcgdexBriefCard { id: string; localId: string; name: string; image?: string; }
export interface TcgdexSet extends TcgdexSetSummary { serie?: { id: string; name: string }; releaseDate?: string;
  legal?: { standard?: boolean; expanded?: boolean }; cards?: TcgdexBriefCard[]; }
export interface TcgdexCard { id: string; localId: string; name: string; image?: string; stage?: string;
  regulationMark?: string; updated?: string; variants?: Record<string, boolean>;
  legal?: { standard?: boolean; expanded?: boolean };
  pricing?: { tcgplayer?: Record<string, unknown>; cardmarket?: Record<string, unknown> };
  _fetched_at?: string; }

export interface FetchCardsOptions { force?: boolean; concurrency?: number; signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void; }
export interface FetchCardsResult { results: Map<string, TcgdexCard | null>; failedIds: string[];
  requests: number; cacheHits: number; notFound: number; retries: number; bytes: number; }

export async function fetchSetList(opts?: { force?: boolean }): Promise<TcgdexSetSummary[]>;
export async function fetchSetBrief(setId: string, opts?: { force?: boolean }): Promise<TcgdexSet | null>;
export async function fetchCards(ids: string[], opts?: FetchCardsOptions): Promise<FetchCardsResult>;
export function readCachedCard(id: string): TcgdexCard | null;   // no network, null when absent or unreadable
export function readCachedSet(id: string): TcgdexSet | null;
export async function seedCacheFrom(dir: string): Promise<{ copied: number; skipped: number }>;
export class TcgdexUnavailableError extends Error { consecutiveFailures: number; }
```

**HTTP.** `undici` with a shared `Agent({ connections: 8, keepAliveTimeout: 30_000 })`; headers `{ "user-agent": "pokesearch2-etl/0.1 (+https://github.com/<repo>)", "accept": "application/json" }`; `headersTimeout: 15_000`, `bodyTimeout: 30_000`. Limiter: a 40-line internal semaphore (no `p-limit` dependency needed) exported as `limiter(n)`.

**Retry policy.** Attempts 5. Retryable: transport errors (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `UND_ERR_*`), 429, 500, 502, 503, 504. Delay `min(16_000, 1000 * 2 ** attempt) * (0.8 + 0.4 * random())`, overridden by `Retry-After` (seconds or HTTP-date) when the header is present. 404 → `null` immediately. Any other 4xx → throw after the first response.

**Progress.** `onProgress` fires every 250 documents (the legacy cadence) and the CLI prints `tcgdex cards: 5000/20219 (cache 4811, net 189, 3.1 req/s, eta 21m)`.

**CLI surface.** `etl full [--skip-tcgdex] [--force] [--concurrency <n>] [--seed-tcgdex-from <dir>]`; `etl prices` calls `fetchCards(ids, { force: true })` through [S02.T07](T07-prices-snapshot.md).

**Cache layout.** `tcgdex/sets.json`, `tcgdex/sets/<id>.json`, `tcgdex/cards/<id>.json` — one flat directory of ≈20k card files, which NTFS handles but Explorer does not; the README says so, and nothing globs that directory (files are addressed by id).

## Implementation steps

1. Add the `limiter(n)` helper and its spec (slots released on throw, in-flight count observable).
2. Write `request()` on top of the shared `undici` Agent with the retry policy, jitter and `Retry-After`; spec the documented backoff sequence and the 404 branch (BR-S02.T03-04, -05).
3. Implement the cache layer: `readCache` (parse-or-delete), `writeCache` (validate then `writeJsonAtomic`), and the `_fetched_at` stamp for cards only (BR-S02.T03-01, -02, -08).
4. Implement `fetchSetList()` and `fetchSetBrief()`; spec that a brief with no `cards` array still resolves (an empty set) and that a 404 on a set id returns `null`.
5. Implement `fetchCards()` with the limiter, per-id error collection, the consecutive-failure circuit breaker and progress callbacks (BR-S02.T03-03, -06, -07).
6. Add `readCachedCard` / `readCachedSet` offline readers used by [S02.T06](T06-load-cards.md) and [S02.T07](T07-prices-snapshot.md).
7. Add `seedCacheFrom(dir)` behind `--seed-tcgdex-from`, validating every copied file and refusing a directory that contains a `.db` file.
8. Wire the step into the CLI, feed the counters into `run.add`, and print the request-rate/ETA line.
9. Add three fixture TCGdex card documents (one with both price blocks, one with only Cardmarket, one with none) to `packages/db/fixtures/` for [S02.T07](T07-prices-snapshot.md).

## Edge cases and error handling

- **TCGdex returns 404 for a card id** that the set brief listed (a withdrawn printing). `fetchCards` stores `null` for that id, counts it in `notFound`, writes no file; [S02.T06](T06-load-cards.md) then loads the card from the canonical source with `raw_tcgdex_json = NULL` and both `tcgdex_legal_*` columns `NULL`.
- **A canonical set has no TCGdex counterpart at all.** That decision belongs to [S02.T04](T04-set-and-card-id-mapping.md); this module simply never gets asked for its cards. If asked with an unknown set id, `fetchSetBrief` returns `null` after one request.
- **Cached card file contains `{"id":` (truncated).** `readCache` fails to parse, deletes the file and re-fetches once; if the refetch also fails, the id lands in `failedIds` and the previous content is gone — which is why the delete happens only after a parse failure, never on a network failure.
- **The endpoint is down for the whole run.** After 50 consecutive failures the step throws `TcgdexUnavailableError`; the run closes as `error` with the counters collected so far, instead of spending 100k requests to produce 20k nulls.
- **TCGdex answers 429 with `Retry-After: 120`.** The 120 s is honoured instead of the computed backoff; the limiter slot is free during the wait, so the other 7 workers keep going (BR-S02.T03-03).
- **`--force` is used on a flaky connection.** Each card is refreshed independently; a card whose refresh fails keeps its previous cached document, so the price snapshot that follows is partially stale rather than partially empty — and the staleness is visible through `_fetched_at`.
- **The cache directory is on a synced folder.** `RAW_CACHE_DIR` defaults to `$DATA_DIR/raw` outside OneDrive (D-005); [S02.T01](T01-etl-cli-and-raw-cache.md)'s path guard refuses a repo-relative cache, and the README warns that 20k small files inside OneDrive is a sync pathology, not a disk-space problem.
- **`--seed-tcgdex-from` points at the legacy `pokemon/data/raw/tcgdex`.** Files are copied and validated; anything that fails validation is skipped and counted. The legacy `pokesearch.db` is never touched (D-003), and the importer refuses a source directory containing one.
- **The run is aborted mid-fetch.** The `AbortSignal` cancels in-flight requests and the limiter drains; every completed file is already on disk, so resuming costs only the remainder.

## Acceptance / verification

- [ ] `fetch-tcgdex.spec.ts > set brief and 10 cards write 11 files` and a second run makes zero HTTP requests with `tcgdex_cache_hits = 10` (BR-S02.T03-01).
- [ ] `> card file has _fetched_at, set file does not` (BR-S02.T03-02).
- [ ] `> injected 429s follow the documented sequence` — delays 1, 2, 4, 8, 16 s within the jitter band; `> Retry-After: 30 is honoured` (BR-S02.T03-05).
- [ ] `> 404 returns null and writes no file`, with `notFound = 1` (BR-S02.T03-04).
- [ ] `> 3 failing cards out of 10 still resolve 7 and report 3` and the step returns normally (BR-S02.T03-06).
- [ ] `> all-503 endpoint aborts after 50 consecutive failures` with `TcgdexUnavailableError` (BR-S02.T03-07).
- [ ] `> 8 concurrent slots stay busy while one request backs off` — the observed maximum in-flight count is 8 and never drops to 7 during a backoff (BR-S02.T03-03).
- [ ] `> force refresh with a bad body keeps the old file` (BR-S02.T03-08).
- [ ] Against the real API, `pnpm etl full` populates `RAW_CACHE_DIR/tcgdex/` with ≈20,219 card files / ≈53 MB (legacy measurement) and the repeated run finishes in seconds.
- [ ] `readCachedCard()` returns a document with the network disabled; `pnpm etl full --skip-tcgdex` makes no request to `api.tcgdex.net` (asserted by a blocking dispatcher in the spec).

## Risks and open questions

- **Risk — the first full fetch takes 30–60 minutes** (legacy measurement, ≈20k requests). Mitigation: the CLI prints an ETA, the cache makes it a one-time cost, `--seed-tcgdex-from` skips it, and `--sets` lets a developer work on one set.
- **Risk — cache-by-presence makes prices permanently stale.** By design: `pricing` only refreshes under `force`. Mitigation: [S02.T07](T07-prices-snapshot.md) owns the bulk refresh and `_fetched_at` makes the age of every document auditable; the card page shows the snapshot date, not "now".
- **Risk — 20k requests look like abuse to a free, keyless API.** Mitigation: concurrency 8 (the legacy value, which completed a full crawl), an identifying `User-Agent`, `Retry-After` honoured, exponential backoff, circuit breaker. If TCGdex ever publishes a rate limit, it becomes a constant here and a note in `docs/NOTICE.md` ([S01.T09](../01-foundation/T09-licensing-and-notice.md)).
- **Risk — 20,219 files in one directory.** Acceptable on NTFS when addressed by name; no code enumerates the directory. If it ever becomes a problem, a two-level shard (`cards/<first2>/<id>.json`) is a change to `paths.ts` plus a one-off move.
- **Question — should the set brief be refreshed on every run** (new cards appear in a set after release)? Recommendation: refresh `sets.json` and every `sets/<id>.json` on every `full` run (they are ≈175 cheap requests) and keep card documents cache-by-presence. Decide with [S02.T04](T04-set-and-card-id-mapping.md)'s owner; the interface already takes `force` per call.
- **Question — is `pricing.tcgplayer.unit` always `USD` and `cardmarket.unit` always `EUR`?** [S02.T07](T07-prices-snapshot.md) defaults to those when the field is absent; this fetcher stores the document untouched so the question can be answered from the cache later.

## References

- `pokemon/src/pokesearch/etl/fetch_tcgdex.py` — verified (138 lines): endpoints `/sets`, `/sets/{id}`, `/cards/{id}` cached at `sets.json`, `sets/{id}.json`, `cards/{id}.json`; `_get_json(..., retries=5)` with `delay = 1.0` doubling, `404 → None`, retry on 429/500/502/503/504 and `httpx.TransportError`/`TimeoutException`; `_fetched_at` stamped on card documents only; `fetch_cards_bulk` uses `asyncio.Semaphore(config.TCGDEX_CONCURRENCY)` and logs every 250; `User-Agent: pokesearch-etl/0.1`, timeout 30. Consult for endpoints and policy; note that its transport-error backoff sleeps while holding the semaphore — the asymmetry BR-S02.T03-03 removes.
- `pokemon/src/pokesearch/config.py` — verified: `TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en"`, `TCGDEX_ASSETS_BASE = "https://assets.tcgdex.net"`, `TCGDEX_CONCURRENCY = int(os.getenv("TCGDEX_CONCURRENCY", "8"))`.
- `pokemon/README.md` L16 — verified: TCGdex described as "Enriquecimento: preços TCGPlayer (USD) e Cardmarket (EUR), legalidade Standard/Expanded, variantes, imagens WebP. Gratuito, sem chave."
- External: `https://api.tcgdex.net/v2/en` — `/sets`, `/sets/{id}`, `/cards/{id}`; TCGdex documentation at `https://tcgdex.dev/` for the `pricing`, `legal`, `variants` and `image` shapes.
- [S02.T01](T01-etl-cli-and-raw-cache.md) — cache paths, `writeJsonAtomic`, counters; [Decision log](../../project/02-decision-log.md) D-003 for the "cache, not database" rule behind `--seed-tcgdex-from`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
```

### FILE: packages/etl/package.json
```json
{
  "name": "@pokesearch/etl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "etl": "./src/cli.ts"
  },
  "scripts": {
    "dev": "node --experimental-strip-types src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@pokesearch/db": "workspace:*",
    "@pokesearch/shared": "workspace:*",
    "commander": "^12.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^3.2.7"
  }
}
```

### FILE: packages/etl/src/paths.ts
```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { env, findRepoRoot } from "@pokesearch/shared/env";

export class CachePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CachePathError";
  }
}

export function cacheRoot(): string {
  const root = process.env.RAW_CACHE_DIR || env.RAW_CACHE_DIR;
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

export function resolveCachePath(...segments: string[]): string {
  const root = cacheRoot();
  const target = path.resolve(root, ...segments);

  const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
  if (target !== root && !target.startsWith(normalizedRoot)) {
    throw new CachePathError(`Cache path '${target}' escapes cache root '${root}'`);
  }

  let repoRoot: string | undefined;
  try {
    repoRoot = findRepoRoot();
  } catch {
    // Repo root might not be discoverable in isolated environments
  }

  if (repoRoot) {
    const normalizedRepo = path.resolve(repoRoot).endsWith(path.sep)
      ? path.resolve(repoRoot)
      : path.resolve(repoRoot) + path.sep;
    if (target === path.resolve(repoRoot) || target.startsWith(normalizedRepo)) {
      throw new CachePathError(
        `Cache path '${target}' resolves inside the repository root '${repoRoot}'`
      );
    }
  }

  return target;
}

export const ptcg = {
  setsFile: (): string => resolveCachePath("pokemon-tcg-data", "sets", "en.json"),
  cardsFile: (setId: string): string =>
    resolveCachePath("pokemon-tcg-data", "cards", "en", `${setId}.json`),
  etagsFile: (): string => resolveCachePath("pokemon-tcg-data", "etags.json"),
};

export const tcgdex = {
  setsFile: (): string => resolveCachePath("tcgdex", "sets.json"),
  setFile: (id: string): string => resolveCachePath("tcgdex", "sets", `${id}.json`),
  cardFile: (id: string): string => resolveCachePath("tcgdex", "cards", `${id}.json`),
};

export const limitless = {
  tournamentDir: (id: string): string => resolveCachePath("limitless", "tournaments", id),
  webList: (id: string): string => resolveCachePath("limitless", "web", `list_${id}.html`),
};

export const reports = {
  file: (name: string): string => resolveCachePath("reports", name),
};

export async function writeJsonAtomic(destPath: string, value: unknown): Promise<void> {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  const tmpPath = `${destPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new TypeError("Cannot serialize undefined to JSON");
  }

  try {
    await fs.promises.writeFile(tmpPath, serialized, "utf8");
    await fs.promises.rename(tmpPath, destPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // ignore unlink error
      }
    }
    throw err;
  }
}
```

### FILE: packages/etl/src/fetch-ptcg.ts
```typescript
import * as fs from "node:fs";
import { ptcg, writeJsonAtomic } from "./paths.js";
import { createEtlLogger } from "./logger.js";

const logger = createEtlLogger();

export const PTCG_RAW_BASE = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master";

/** Backoff before retry n (BR-S02.T02-07): 1 s, 2 s, 4 s. Tests inject `[0, 0, 0]`. */
export const DEFAULT_BACKOFF_MS: readonly number[] = [1000, 2000, 4000];

/** Statuses retried, besides transport errors. Every other non-2xx except 404 fails at once. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([500, 502, 503, 504]);

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
  /** Retry backoff per attempt in ms; defaults to DEFAULT_BACKOFF_MS. */
  backoffMs?: readonly number[] | undefined;
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
    const parsed: unknown = JSON.parse(raw);
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
    const parsed: unknown = JSON.parse(content);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET with the retry policy of BR-S02.T02-07: transport errors and 5xx are retried
 * up to `retries` times with `backoffMs` between attempts; 304 and 404 are returned
 * to the caller; every other non-2xx (403, 401, 429, ...) fails immediately.
 * The body is read inside the retry scope, so a connection dropped mid-body is a
 * transport error and nothing reaches the cache (BR-S02.T02-06).
 */
async function fetchWithRetry(
  url: string,
  options: {
    etag?: string | undefined;
    signal?: AbortSignal | undefined;
    retries?: number | undefined;
    backoffMs?: readonly number[] | undefined;
  }
): Promise<HttpFetchResult> {
  const maxRetries = options.retries ?? 3;
  const backoffs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const headers: Record<string, string> = {
    "user-agent": "pokesearch2-etl/0.1 (+local)",
    accept: "application/json",
  };
  if (options.etag !== undefined) {
    headers["if-none-match"] = options.etag;
  }
  const fetchInit: RequestInit = { method: "GET", headers };
  if (options.signal !== undefined) {
    fetchInit.signal = options.signal;
  }

  for (let attempt = 1; ; attempt++) {
    const delay = backoffs[attempt - 1] ?? backoffs[backoffs.length - 1] ?? 0;
    let res: Response;
    let body: string | undefined;
    try {
      res = await fetch(url, fetchInit);
      if (res.status !== 304 && res.status !== 404) {
        body = await res.text();
      }
    } catch (err: unknown) {
      if (options.signal?.aborted || attempt > maxRetries) {
        throw err;
      }
      await sleep(delay);
      continue;
    }

    if (res.status === 304) {
      return { status: 304, etag: res.headers.get("etag") ?? options.etag ?? undefined };
    }
    if (res.status === 404) {
      return { status: 404 };
    }
    if (RETRYABLE_STATUSES.has(res.status)) {
      if (attempt > maxRetries) {
        throw new Error(`HTTP ${res.status} from ${url} after ${attempt} attempts: ${body ?? ""}`);
      }
      await sleep(delay);
      continue;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}: ${body ?? ""}`);
    }
    return { status: 200, etag: res.headers.get("etag") ?? undefined, body: body ?? "" };
  }
}

export async function fetchSets(opts?: {
  baseUrl?: string | undefined;
  force?: boolean | undefined;
  signal?: AbortSignal | undefined;
  inMemoryEtags?: Record<string, string> | undefined;
  backoffMs?: readonly number[] | undefined;
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
    backoffMs: opts?.backoffMs,
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

  const parsed: unknown = JSON.parse(res.body);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid sets format: expected array from ${url}`);
  }

  let changed = true;
  if (fs.existsSync(setsFilePath)) {
    try {
      const existingBytes = fs.readFileSync(setsFilePath, "utf8");
      const existingParsed: unknown = JSON.parse(existingBytes);
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
    backoffMs?: readonly number[] | undefined;
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
    backoffMs: opts?.backoffMs,
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

  const parsed: unknown = JSON.parse(res.body);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid cards format: expected array for set ${setId}`);
  }

  let changed = true;
  if (fs.existsSync(cardsFilePath)) {
    try {
      const existingBytes = fs.readFileSync(cardsFilePath, "utf8");
      const existingParsed: unknown = JSON.parse(existingBytes);
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
    backoffMs: opts?.backoffMs,
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
        backoffMs: opts?.backoffMs,
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
    const parsed: unknown = JSON.parse(content);
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
    const parsed: unknown = JSON.parse(content);
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
```

### FILE: packages/etl/src/fetch-ptcg.spec.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import { ptcg } from "./paths.js";
import {
  fetchAll,
  loadSets,
  loadCards,
  CacheMissError,
  type PtcgSet,
  type PtcgCard,
} from "./fetch-ptcg.js";

describe("fetch-ptcg (RED phase test suite)", () => {
  let tempCacheDir: string;
  const originalRawCacheDir = process.env.RAW_CACHE_DIR;
  let server: http.Server;
  let serverUrl: string;

  // Mock server state
  interface MockRoute {
    status: number;
    etag?: string;
    body: string;
    headers?: Record<string, string>;
    /** Status per request on this path (the last one repeats); overrides `status`. */
    sequence?: number[];
    /** Send the headers and half of the body, then drop the connection (BR-S02.T02-06). */
    abortBody?: boolean;
  }
  let routes: Map<string, MockRoute>;
  let requestLog: Array<{ path: string; headers: http.IncomingHttpHeaders }>;
  let hitCounts: Map<string, number>;
  /** No waiting between retries in tests; production defaults to 1 s, 2 s, 4 s. */
  const ZERO_BACKOFF: readonly number[] = [0, 0, 0];

  beforeEach(async () => {
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-ptcg-test-"));
    process.env.RAW_CACHE_DIR = tempCacheDir;

    routes = new Map();
    requestLog = [];
    hitCounts = new Map();

    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url ?? "/", `http://localhost`);
      const reqPath = parsedUrl.pathname;
      requestLog.push({ path: reqPath, headers: req.headers });

      const route = routes.get(reqPath);
      if (!route) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const hit = hitCounts.get(reqPath) ?? 0;
      hitCounts.set(reqPath, hit + 1);
      const status = route.sequence
        ? (route.sequence[Math.min(hit, route.sequence.length - 1)] ?? route.status)
        : route.status;

      if (route.abortBody) {
        res.writeHead(status, { "content-type": "application/json" });
        res.write(route.body.slice(0, Math.floor(route.body.length / 2)));
        res.destroy();
        return;
      }

      const clientEtag = req.headers["if-none-match"];
      if (status === 200 && clientEtag && route.etag && clientEtag === route.etag) {
        res.writeHead(304, { etag: route.etag });
        res.end();
        return;
      }

      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(route.headers ?? {}),
      };
      if (route.etag) {
        headers["etag"] = route.etag;
      }

      res.writeHead(status, headers);
      res.end(route.body);
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

  const sampleSets: PtcgSet[] = [
    { id: "sv1", name: "Scarlet & Violet", total: 198 },
    { id: "sv2", name: "Paldea Evolved", total: 193 },
  ];

  const sampleCardsSv1: PtcgCard[] = [
    { id: "sv1-1", name: "Sprigatito", number: "1", supertype: "Pokémon", hp: "60" },
    { id: "sv1-2", name: "Floragato", number: "2", supertype: "Pokémon", hp: "90" },
  ];

  const sampleCardsSv2: PtcgCard[] = [
    { id: "sv2-1", name: "Fuecoco", number: "1", supertype: "Pokémon", hp: "70" },
  ];

  function setupStandardRoutes(_baseUrlOverride?: string) {
    routes.set("/sets/en.json", {
      status: 200,
      etag: '"etag-sets-1"',
      body: JSON.stringify(sampleSets),
    });
    routes.set("/cards/en/sv1.json", {
      status: 200,
      etag: '"etag-cards-sv1-1"',
      body: JSON.stringify(sampleCardsSv1),
    });
    routes.set("/cards/en/sv2.json", {
      status: 200,
      etag: '"etag-cards-sv2-1"',
      body: JSON.stringify(sampleCardsSv2),
    });
  }

  describe("First-run download", () => {
    it("fetches sets index and cards for each set, writing cache and etags.json", async () => {
      setupStandardRoutes();

      const result = await fetchAll({ baseUrl: serverUrl });

      expect(result.sets).toHaveLength(2);
      expect(result.changedSetIds).toEqual(expect.arrayContaining(["sv1", "sv2"]));
      expect(result.requests).toBe(3);
      expect(result.notModified).toBe(0);
      expect(result.missingCardFiles).toEqual([]);

      // Verify cached files exist
      expect(fs.existsSync(ptcg.setsFile())).toBe(true);
      expect(fs.existsSync(ptcg.cardsFile("sv1"))).toBe(true);
      expect(fs.existsSync(ptcg.cardsFile("sv2"))).toBe(true);
      expect(fs.existsSync(ptcg.etagsFile())).toBe(true);

      // Verify etags content
      const etags = JSON.parse(fs.readFileSync(ptcg.etagsFile(), "utf8"));
      expect(etags["sets/en.json"]).toBe('"etag-sets-1"');
      expect(etags["cards/en/sv1.json"]).toBe('"etag-cards-sv1-1"');
      expect(etags["cards/en/sv2.json"]).toBe('"etag-cards-sv2-1"');
    });
  });

  describe("Second run unchanged (BR-S02.T02-02)", () => {
    it("handles 304 Not Modified without rewriting files or marking sets as changed", async () => {
      setupStandardRoutes();

      // First run to seed cache
      await fetchAll({ baseUrl: serverUrl });

      const sv1Path = ptcg.cardsFile("sv1");
      const sv2Path = ptcg.cardsFile("sv2");
      const setsPath = ptcg.setsFile();

      const mtimeSv1 = fs.statSync(sv1Path).mtimeMs;
      const mtimeSv2 = fs.statSync(sv2Path).mtimeMs;
      const mtimeSets = fs.statSync(setsPath).mtimeMs;

      // Clear request log
      requestLog = [];

      // Second run - server should return 304 because ETags are sent
      const result = await fetchAll({ baseUrl: serverUrl });

      expect(result.changedSetIds).toEqual([]);
      expect(result.requests).toBe(3);
      expect(result.notModified).toBe(3);

      // Verify mtimes did not change
      expect(fs.statSync(sv1Path).mtimeMs).toBe(mtimeSv1);
      expect(fs.statSync(sv2Path).mtimeMs).toBe(mtimeSv2);
      expect(fs.statSync(setsPath).mtimeMs).toBe(mtimeSets);

      // Verify conditional headers were sent
      const sv1Req = requestLog.find((r) => r.path === "/cards/en/sv1.json");
      expect(sv1Req?.headers["if-none-match"]).toBe('"etag-cards-sv1-1"');
    });
  });

  describe("Deleted cache file re-downloaded unconditionally (BR-S02.T02-01)", () => {
    it("omits If-None-Match when cached card file is missing even if ETag is known", async () => {
      setupStandardRoutes();
      await fetchAll({ baseUrl: serverUrl });

      // Delete sv1 card file but keep etags.json
      fs.unlinkSync(ptcg.cardsFile("sv1"));
      expect(fs.existsSync(ptcg.cardsFile("sv1"))).toBe(false);

      requestLog = [];
      const result = await fetchAll({ baseUrl: serverUrl });

      const sv1Req = requestLog.find((r) => r.path === "/cards/en/sv1.json");
      expect(sv1Req?.headers["if-none-match"]).toBeUndefined();
      expect(fs.existsSync(ptcg.cardsFile("sv1"))).toBe(true);
      expect(result.changedSetIds).toContain("sv1");
    });
  });

  describe("Corrupt / Truncated file recovery (BR-S02.T02-04)", () => {
    it("deletes corrupt JSON cache and re-downloads unconditionally", async () => {
      setupStandardRoutes();
      await fetchAll({ baseUrl: serverUrl });

      // Overwrite sv2 card file with corrupted JSON
      fs.writeFileSync(ptcg.cardsFile("sv2"), '[{"id": "sv2-1", ', "utf8");

      requestLog = [];
      const result = await fetchAll({ baseUrl: serverUrl });

      const sv2Req = requestLog.find((r) => r.path === "/cards/en/sv2.json");
      expect(sv2Req?.headers["if-none-match"]).toBeUndefined();
      expect(result.changedSetIds).toContain("sv2");

      const loaded = JSON.parse(fs.readFileSync(ptcg.cardsFile("sv2"), "utf8"));
      expect(loaded).toEqual(sampleCardsSv2);
    });
  });

  describe("Rotating ETag with identical SHA-256 (BR-S02.T02-03)", () => {
    it("updates in-memory ETag but marks changed: false and does not touch file mtime", async () => {
      setupStandardRoutes();
      await fetchAll({ baseUrl: serverUrl });

      const sv1Path = ptcg.cardsFile("sv1");
      const mtimeBefore = fs.statSync(sv1Path).mtimeMs;

      // Update mock route with new ETag but identical body
      routes.set("/cards/en/sv1.json", {
        status: 200,
        etag: '"etag-cards-sv1-rotated"',
        body: JSON.stringify(sampleCardsSv1),
      });

      const result = await fetchAll({ baseUrl: serverUrl });

      expect(result.changedSetIds).not.toContain("sv1");
      expect(fs.statSync(sv1Path).mtimeMs).toBe(mtimeBefore);

      const etags = JSON.parse(fs.readFileSync(ptcg.etagsFile(), "utf8"));
      expect(etags["cards/en/sv1.json"]).toBe('"etag-cards-sv1-rotated"');
    });
  });

  describe("404 handling (BR-S02.T02-05)", () => {
    it("404 on cards/en/<id>.json logs warning and records in missingCardFiles without failing run", async () => {
      setupStandardRoutes();
      routes.set("/cards/en/sv2.json", {
        status: 404,
        body: "Card set not found",
      });

      const result = await fetchAll({ baseUrl: serverUrl });
      expect(result.missingCardFiles).toContain("sv2");
      expect(result.changedSetIds).toContain("sv1");
      expect(result.changedSetIds).not.toContain("sv2");
    });

    it("404 on sets/en.json throws error and aborts run", async () => {
      routes.set("/sets/en.json", {
        status: 404,
        body: "Sets index not found",
      });

      await expect(fetchAll({ baseUrl: serverUrl })).rejects.toThrow();
    });
  });

  describe("etags.json persistence failure safety (BR-S02.T02-08)", () => {
    it("leaves etags.json unchanged if batch run fails", async () => {
      setupStandardRoutes();
      await fetchAll({ baseUrl: serverUrl });

      const initialEtags = fs.readFileSync(ptcg.etagsFile(), "utf8");

      // Now make sets fail with 500 error
      routes.set("/sets/en.json", {
        status: 500,
        body: "Server Error",
      });

      await expect(
        fetchAll({ baseUrl: serverUrl, force: true, backoffMs: ZERO_BACKOFF })
      ).rejects.toThrow();

      const finalEtags = fs.readFileSync(ptcg.etagsFile(), "utf8");
      expect(finalEtags).toBe(initialEtags);
    });
  });

  describe("Retry policy (BR-S02.T02-07)", () => {
    it("503 then 200 succeeds with two requests", async () => {
      setupStandardRoutes();
      routes.set("/cards/en/sv1.json", {
        status: 200,
        sequence: [503, 200],
        etag: '"etag-cards-sv1-1"',
        body: JSON.stringify(sampleCardsSv1),
      });

      const result = await fetchAll({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });

      expect(requestLog.filter((r) => r.path === "/cards/en/sv1.json")).toHaveLength(2);
      expect(result.changedSetIds).toContain("sv1");
      expect(JSON.parse(fs.readFileSync(ptcg.cardsFile("sv1"), "utf8"))).toEqual(sampleCardsSv1);
    });

    it("gives up after three retries on a persistent 5xx", async () => {
      setupStandardRoutes();
      routes.set("/sets/en.json", { status: 503, body: "Service Unavailable" });

      await expect(fetchAll({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF })).rejects.toThrow(
        /HTTP 503/
      );
      expect(requestLog.filter((r) => r.path === "/sets/en.json")).toHaveLength(4);
    });

    it("403 fails without retry", async () => {
      setupStandardRoutes();
      routes.set("/sets/en.json", { status: 403, body: "Forbidden" });

      await expect(fetchAll({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF })).rejects.toThrow(
        /HTTP 403/
      );
      expect(requestLog.filter((r) => r.path === "/sets/en.json")).toHaveLength(1);
      expect(fs.existsSync(ptcg.setsFile())).toBe(false);
    });
  });

  describe("Atomic writes (BR-S02.T02-06)", () => {
    it("aborted body leaves the previous file intact", async () => {
      setupStandardRoutes();
      await fetchAll({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF });
      const sv1Path = ptcg.cardsFile("sv1");
      const etagsBefore = fs.readFileSync(ptcg.etagsFile(), "utf8");

      const replacement: PtcgCard[] = [{ id: "sv1-99", name: "Never written", number: "99" }];
      routes.set("/cards/en/sv1.json", {
        status: 200,
        etag: '"etag-cards-sv1-2"',
        body: JSON.stringify(replacement),
        abortBody: true,
      });
      requestLog = [];

      await expect(fetchAll({ baseUrl: serverUrl, backoffMs: ZERO_BACKOFF })).rejects.toThrow();

      // 1 attempt + 3 retries, all dropped mid-body
      expect(requestLog.filter((r) => r.path === "/cards/en/sv1.json")).toHaveLength(4);
      expect(JSON.parse(fs.readFileSync(sv1Path, "utf8"))).toEqual(sampleCardsSv1);
      expect(fs.readFileSync(ptcg.etagsFile(), "utf8")).toBe(etagsBefore);
      const leftovers = fs.readdirSync(path.dirname(sv1Path)).filter((f) => f.includes(".tmp"));
      expect(leftovers).toEqual([]);
    });
  });

  describe("Filtered fetch (--sets / onlySets)", () => {
    it("only fetches specified sets when onlySets filter is passed", async () => {
      setupStandardRoutes();

      const result = await fetchAll({ baseUrl: serverUrl, onlySets: ["sv1"] });

      expect(result.sets).toHaveLength(2);
      expect(result.changedSetIds).toEqual(["sv1"]);
      expect(fs.existsSync(ptcg.cardsFile("sv1"))).toBe(true);
      expect(fs.existsSync(ptcg.cardsFile("sv2"))).toBe(false);
    });
  });

  describe("Offline reader helpers: loadSets and loadCards", () => {
    it("loadSets returns parsed sets from cache without network", () => {
      const setsDir = path.dirname(ptcg.setsFile());
      fs.mkdirSync(setsDir, { recursive: true });
      fs.writeFileSync(ptcg.setsFile(), JSON.stringify(sampleSets), "utf8");

      const loaded = loadSets();
      expect(loaded).toEqual(sampleSets);
    });

    it("loadSets throws CacheMissError if sets file does not exist", () => {
      expect(() => loadSets()).toThrow(CacheMissError);
    });

    it("loadSets deletes corrupted file and throws CacheMissError", () => {
      const setsDir = path.dirname(ptcg.setsFile());
      fs.mkdirSync(setsDir, { recursive: true });
      fs.writeFileSync(ptcg.setsFile(), "invalid json content", "utf8");

      expect(() => loadSets()).toThrow(CacheMissError);
      expect(fs.existsSync(ptcg.setsFile())).toBe(false);
    });

    it("loadCards returns parsed cards for existing setId", () => {
      const cardsDir = path.dirname(ptcg.cardsFile("sv1"));
      fs.mkdirSync(cardsDir, { recursive: true });
      fs.writeFileSync(ptcg.cardsFile("sv1"), JSON.stringify(sampleCardsSv1), "utf8");

      const loaded = loadCards("sv1");
      expect(loaded).toEqual(sampleCardsSv1);
    });

    it("loadCards returns empty array if file does not exist", () => {
      const loaded = loadCards("nonexistent-set");
      expect(loaded).toEqual([]);
    });

    it("loadCards deletes corrupted file and throws CacheMissError", () => {
      const cardsDir = path.dirname(ptcg.cardsFile("sv2"));
      fs.mkdirSync(cardsDir, { recursive: true });
      fs.writeFileSync(ptcg.cardsFile("sv2"), "{corrupt json", "utf8");

      expect(() => loadCards("sv2")).toThrow(CacheMissError);
      expect(fs.existsSync(ptcg.cardsFile("sv2"))).toBe(false);
    });
  });
});
```

### FILE: packages/etl/src/orchestrator.ts
```typescript
import type { Db } from "@pokesearch/db";
import type { RunHandle } from "./run-log.js";
import { fetchAll, type FetchAllOptions, type FetchAllResult } from "./fetch-ptcg.js";

export class NotImplementedError extends Error {
  constructor(stepName: string) {
    super(`Step '${stepName}' is not implemented yet.`);
    this.name = "NotImplementedError";
  }
}

export interface LoadOptions {
  sets?: string[] | undefined;
  force?: boolean | undefined;
  skipTcgdex?: boolean | undefined;
  concurrency?: number | undefined;
  verbose?: boolean | undefined;
  /** Developer/test hook: base URL of the pokemon-tcg-data raw files (env PTCG_RAW_BASE). */
  ptcgBaseUrl?: string | undefined;
  /** Developer/test hook: retry backoff in ms per attempt (env PTCG_BACKOFF_MS). */
  backoffMs?: readonly number[] | undefined;
}

export interface PipelineStep {
  name: string;
  execute: (ctx: StepContext) => Promise<void>;
}

export interface StepContext {
  db: Db;
  run: RunHandle;
  options: LoadOptions;
}

export interface StepRegistry {
  fetchPtcg: PipelineStep;
  fetchTcgdex: PipelineStep;
  mapIds: PipelineStep;
  loadCards: PipelineStep;
  rebuildFts: PipelineStep;
  snapshotPrices: PipelineStep;
  [key: string]: PipelineStep;
}

function createStubStep(name: string): PipelineStep {
  return {
    name,
    execute: (): Promise<void> => {
      return Promise.reject(new NotImplementedError(name));
    },
  };
}

export type FetchPtcgFn = (opts?: FetchAllOptions) => Promise<FetchAllResult>;

/**
 * The real `fetch-ptcg` step (S02.T02, implementation step 7): runs `fetchAll` with the
 * CLI options and records the agreed counters in `etl_runs.stats_json`.
 * `fetchImpl` is injectable so the pipeline can be tested without the network.
 */
export function createFetchPtcgStep(fetchImpl: FetchPtcgFn = fetchAll): PipelineStep {
  return {
    name: "fetch-ptcg",
    execute: async ({ run, options }: StepContext): Promise<void> => {
      const result = await fetchImpl({
        baseUrl: options.ptcgBaseUrl,
        force: options.force,
        onlySets: options.sets,
        backoffMs: options.backoffMs,
      });
      const only = options.sets;
      const processed = only ? result.sets.filter((s) => only.includes(s.id)).length : result.sets.length;
      run.add({
        http_requests: result.requests,
        http_304: result.notModified,
        sets: processed,
        sets_changed: result.changedSetIds.length,
        missing_card_files: result.missingCardFiles.join(","),
        bytes_downloaded: result.bytes,
      });
    },
  };
}

export const defaultStepRegistry: StepRegistry = {
  fetchPtcg: createFetchPtcgStep(),
  fetchTcgdex: createStubStep("fetch-tcgdex"),
  mapIds: createStubStep("map-ids"),
  loadCards: createStubStep("load-cards"),
  rebuildFts: createStubStep("rebuild-fts"),
  snapshotPrices: createStubStep("snapshot-prices"),
};

export async function runLoad(
  db: Db,
  run: RunHandle,
  options: LoadOptions,
  registry?: Partial<StepRegistry>
): Promise<void> {
  const steps: PipelineStep[] = [];
  const fetchPtcg = registry?.fetchPtcg ?? defaultStepRegistry.fetchPtcg;
  const fetchTcgdex = registry?.fetchTcgdex ?? defaultStepRegistry.fetchTcgdex;
  const mapIds = registry?.mapIds ?? defaultStepRegistry.mapIds;
  const loadCards = registry?.loadCards ?? defaultStepRegistry.loadCards;
  const rebuildFts = registry?.rebuildFts ?? defaultStepRegistry.rebuildFts;
  const snapshotPrices = registry?.snapshotPrices ?? defaultStepRegistry.snapshotPrices;

  steps.push(fetchPtcg);

  if (!options.skipTcgdex) {
    steps.push(fetchTcgdex);
  }

  steps.push(mapIds);
  steps.push(loadCards);
  steps.push(rebuildFts);

  if (!options.skipTcgdex) {
    steps.push(snapshotPrices);
  }

  const ctx: StepContext = { db, run, options };
  for (const step of steps) {
    await step.execute(ctx);
  }
}
```

================================================================================
SPECIFICATION (source of truth for this subtask):
================================================================================
# [S02T03] S02T03 — Fetch TCGdex (prices, legality, variants, images)

# S02T03 — Fetch TCGdex (prices, legality, variants, images)

| Campo | Valor |
|---|---|
| Estágio | S02 — Card data and search |
| ID Tarefa | S02T03 |
| Depende de | S02T01 |
| Desbloqueia | S02T04, S02T07 |
| Ordem de lançamento | 3 |
| Depende de (outros estágios) | Nenhuma |
| Desbloqueia (outros estágios) | Nenhum |
| Especificação | `docs/stages/02-card-data-and-search/T03-fetch-tcgdex.md` |

<!-- depends_on: S02T01 -->
<!-- seq: 3 -->

## 🎯 Objetivo
All TCGdex card documents needed to complement the canonical data (prices, legality flags, variants, WebP images) are cached locally, fetched with bounded concurrency and polite retries, and refreshable in bulk for price snapshots.

## 🔍 Contexto
### Context

TCGdex is the **complement**, never the canon: it supplies `pricing` (TCGplayer USD and Cardmarket EUR), `legal.standard` / `legal.expanded`, `variants`, the WebP image base and a `localId` used to pair printings. The card wording, attacks and abilities come from pokemon-tcg-data ([S02.T02](T02-fetch-pokemon-tcg-data.md)); RN-01 requires both raw documents to survive into the database side by side.

The scale is different from T02: one HTTP request per card, ≈20,219 cached files and ≈53 MB, a first full fetch of roughly 20k requests taking 30–60 minutes (legacy measurement). That forces three properties. **Bounded concurrency** — the legacy `config.TCGDEX_CONCURRENCY = 8` and this subtask keeps 8 as the default. **Cache by presence** — a card file that exists is never re-requested unless `force`, because per-file conditional requests would still cost 20k round trips. **Bulk refresh** — prices are only current if the whole card set is re-fetched, which is exactly what [S02.T07](T07-prices-snapshot.md) does with `force: true`.

The legacy implementation, `pokemon/src/pokesearch/etl/fetch_tcgdex.py`, is a good description of the endpoints and a flawed description of the retry loop: 5 attempts, delay starting at 1 s and doubling, 404 → `None`, retry on 429/500/502/503/504 and on transport/timeout errors, progress every 250 cards. But the backoff sleep after a **transport** error happens inside `async with sem`, so a flapping network holds concurrency slots idle, while the sleep after an **HTTP** 5xx happens outside it. This subtask fixes that asymmetry: the semaphore is only ever held around the request itself (BR-S02.T03-03). The legacy also never bounds total attempts across the run, so a full outage costs 20k × 5 requests before finishing "successfully" with 20k nulls; here a circuit breaker aborts the step (BR-S02.T03-07).

D-003 allows seeding the cache from the legacy `pokemon/data/raw/tcgdex` folder (164 MB total raw dir, of which TCGdex is ≈53 MB) to skip the first hour. That is a cache copy, not database reuse, and the documents are re-parsed by the new loader; it stays an explicit opt-in flag, never a default.

### Scope

- **In scope.** `packages/etl/src/fetch-tcgdex.ts`: endpoint wrappers, the file cache and its validation, the limiter, the retry/backoff policy and circuit breaker, `_fetched_at` stamping, progress reporting, the offline readers `readCachedCard` / `readCachedSet`, and the `--seed-from <dir>` importer for an existing cache directory.
- **Out of scope.** Matching TCGdex ids to canonical ids ([S02.T04](T04-set-and-card-id-mapping.md)); turning `pricing` into rows ([S02.T07](T07-prices-snapshot.md)); writing any card column ([S02.T06](T06-load-cards.md)); mirroring images (out of scope for the whole project — images are hotlinked, see [Vision and scope](../../project/01-vision-and-scope.md)).

### Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` here. RN-01 ("neither source overwrites the other") is what makes this fetcher's output a *separate* cached document rather than a patch on the canonical one.

### Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `$RAW_CACHE_DIR/tcgdex/sets.json` | C/U | etl | start of a load, and on `--force` | overwritten whole; must parse as a non-empty array of `{id}` | the TCGdex set universe used by [S02.T04](T04-set-and-card-id-mapping.md) |
| `$RAW_CACHE_DIR/tcgdex/sets/<tcgdexSetId>.json` | C/U | etl | when a canonical set resolves to a TCGdex set | written only on 200; contains the brief card list (`id`, `localId`, `name`) | ≈174 files |
| `$RAW_CACHE_DIR/tcgdex/cards/<tcgdexCardId>.json` | C/U | etl | per matched card, first time or under `force` | write is atomic and only after JSON validation; `_fetched_at` added | ≈20,219 files, ≈53 MB (legacy measurement) |
| cache files | D | etl | when a cached file fails to parse | deleted, then re-fetched once | keeps a crash from poisoning the cache |
| `$RAW_CACHE_DIR/tcgdex/**` | R | etl | [S02.T04](T04-set-and-card-id-mapping.md), [S02.T06](T06-load-cards.md), [S02.T07](T07-prices-snapshot.md) | read-only, offline | `readCachedCard(id)` / `readCachedSet(id)` |
| `$RAW_CACHE_DIR/tcgdex/**` | C | developer (`etl full --seed-tcgdex-from <dir>`) | once, optionally | copies only `cards/*.json`, `sets/*.json`, `sets.json`; skips files that fail validation; never copies a database | D-003: cache, not database |
| `etl_runs.stats_json` | U | etl | end of the step | flat counters | `tcgdex_requests`, `tcgdex_cache_hits`, `tcgdex_404`, `tcgdex_retries`, `tcgdex_failed`, `bytes_downloaded` |
| card tables | — | — | — | not written here | [S02.T06](T06-load-cards.md) / [S02.T07](T07-prices-snapshot.md) own them |

### Interfaces

**`packages/etl/src/fetch-tcgdex.ts`**

```ts
export const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";
export const TCGDEX_CONCURRENCY = 8;      // legacy config.TCGDEX_CONCURRENCY

export interface TcgdexSetSummary { id: string; name: string; cardCount?: { total?: number; official?: number }; }
export interface TcgdexBriefCard { id: string; localId: string; name: string; image?: string; }
export interface TcgdexSet extends TcgdexSetSummary { serie?: { id: string; name: string }; releaseDate?: string;
  legal?: { standard?: boolean; expanded?: boolean }; cards?: TcgdexBriefCard[]; }
export interface TcgdexCard { id: string; localId: string; name: string; image?: string; stage?: string;
  regulationMark?: string; updated?: string; variants?: Record<string, boolean>;
  legal?: { standard?: boolean; expanded?: boolean };
  pricing?: { tcgplayer?: Record<string, unknown>; cardmarket?: Record<string, unknown> };
  _fetched_at?: string; }

export interface FetchCardsOptions { force?: boolean; concurrency?: number; signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void; }
export interface FetchCardsResult { results: Map<string, TcgdexCard | null>; failedIds: string[];
  requests: number; cacheHits: number; notFound: number; retries: number; bytes: number; }

export async function fetchSetList(opts?: { force?: boolean }): Promise<TcgdexSetSummary[]>;
export async function fetchSetBrief(setId: string, opts?: { force?: boolean }): Promise<TcgdexSet | null>;
export async function fetchCards(ids: string[], opts?: FetchCardsOptions): Promise<FetchCardsResult>;
export function readCachedCard(id: string): TcgdexCard | null;   // no network, null when absent or unreadable
export function readCachedSet(id: string): TcgdexSet | null;
export async function seedCacheFrom(dir: string): Promise<{ copied: number; skipped: number }>;
export class TcgdexUnavailableError extends Error { consecutiveFailures: number; }
```

**HTTP.** `undici` with a shared `Agent({ connections: 8, keepAliveTimeout: 30_000 })`; headers `{ "user-agent": "pokesearch2-etl/0.1 (+https://github.com/<repo>)", "accept": "application/json" }`; `headersTimeout: 15_000`, `bodyTimeout: 30_000`. Limiter: a 40-line internal semaphore (no `p-limit` dependency needed) exported as `limiter(n)`.

**Retry policy.** Attempts 5. Retryable: transport errors (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `UND_ERR_*`), 429, 500, 502, 503, 504. Delay `min(16_000, 1000 * 2 ** attempt) * (0.8 + 0.4 * random())`, overridden by `Retry-After` (seconds or HTTP-date) when the header is present. 404 → `null` immediately. Any other 4xx → throw after the first response.

**Progress.** `onProgress` fires every 250 documents (the legacy cadence) and the CLI prints `tcgdex cards: 5000/20219 (cache 4811, net 189, 3.1 req/s, eta 21m)`.

**CLI surface.** `etl full [--skip-tcgdex] [--force] [--concurrency <n>] [--seed-tcgdex-from <dir>]`; `etl prices` calls `fetchCards(ids, { force: true })` through [S02.T07](T07-prices-snapshot.md).

**Cache layout.** `tcgdex/sets.json`, `tcgdex/sets/<id>.json`, `tcgdex/cards/<id>.json` — one flat directory of ≈20k card files, which NTFS handles but Explorer does not; the README says so, and nothing globs that directory (files are addressed by id).

### Implementation steps

1. Add the `limiter(n)` helper and its spec (slots released on throw, in-flight count observable).
2. Write `request()` on top of the shared `undici` Agent with the retry policy, jitter and `Retry-After`; spec the documented backoff sequence and the 404 branch (BR-S02.T03-04, -05).
3. Implement the cache layer: `readCache` (parse-or-delete), `writeCache` (validate then `writeJsonAtomic`), and the `_fetched_at` stamp for cards only (BR-S02.T03-01, -02, -08).
4. Implement `fetchSetList()` and `fetchSetBrief()`; spec that a brief with no `cards` array still resolves (an empty set) and that a 404 on a set id returns `null`.
5. Implement `fetchCards()` with the limiter, per-id error collection, the consecutive-failure circuit breaker and progress callbacks (BR-S02.T03-03, -06, -07).
6. Add `readCachedCard` / `readCachedSet` offline readers used by [S02.T06](T06-load-cards.md) and [S02.T07](T07-prices-snapshot.md).
7. Add `seedCacheFrom(dir)` behind `--seed-tcgdex-from`, validating every copied file and refusing a directory that contains a `.db` file.
8. Wire the step into the CLI, feed the counters into `run.add`, and print the request-rate/ETA line.
9. Add three fixture TCGdex card documents (one with both price blocks, one with only Cardmarket, one with none) to `packages/db/fixtures/` for [S02.T07](T07-prices-snapshot.md).

### Edge cases and error handling

- **TCGdex returns 404 for a card id** that the set brief listed (a withdrawn printing). `fetchCards` stores `null` for that id, counts it in `notFound`, writes no file; [S02.T06](T06-load-cards.md) then loads the card from the canonical source with `raw_tcgdex_json = NULL` and both `tcgdex_legal_*` columns `NULL`.
- **A canonical set has no TCGdex counterpart at all.** That decision belongs to [S02.T04](T04-set-and-card-id-mapping.md); this module simply never gets asked for its cards. If asked with an unknown set id, `fetchSetBrief` returns `null` after one request.
- **Cached card file contains `{"id":` (truncated).** `readCache` fails to parse, deletes the file and re-fetches once; if the refetch also fails, the id lands in `failedIds` and the previous content is gone — which is why the delete happens only after a parse failure, never on a network failure.
- **The endpoint is down for the whole run.** After 50 consecutive failures the step throws `TcgdexUnavailableError`; the run closes as `error` with the counters collected so far, instead of spending 100k requests to produce 20k nulls.
- **TCGdex answers 429 with `Retry-After: 120`.** The 120 s is honoured instead of the computed backoff; the limiter slot is free during the wait, so the other 7 workers keep going (BR-S02.T03-03).
- **`--force` is used on a flaky connection.** Each card is refreshed independently; a card whose refresh fails keeps its previous cached document, so the price snapshot that follows is partially stale rather than partially empty — and the staleness is visible through `_fetched_at`.
- **The cache directory is on a synced folder.** `RAW_CACHE_DIR` defaults to `$DATA_DIR/raw` outside OneDrive (D-005); [S02.T01](T01-etl-cli-and-raw-cache.md)'s path guard refuses a repo-relative cache, and the README warns that 20k small files inside OneDrive is a sync pathology, not a disk-space problem.
- **`--seed-tcgdex-from` points at the legacy `pokemon/data/raw/tcgdex`.** Files are copied and validated; anything that fails validation is skipped and counted. The legacy `pokesearch.db` is never touched (D-003), and the importer refuses a source directory containing one.
- **The run is aborted mid-fetch.** The `AbortSignal` cancels in-flight requests and the limiter drains; every completed file is already on disk, so resuming costs only the remainder.

### Risks and open questions

- **Risk — the first full fetch takes 30–60 minutes** (legacy measurement, ≈20k requests). Mitigation: the CLI prints an ETA, the cache makes it a one-time cost, `--seed-tcgdex-from` skips it, and `--sets` lets a developer work on one set.
- **Risk — cache-by-presence makes prices permanently stale.** By design: `pricing` only refreshes under `force`. Mitigation: [S02.T07](T07-prices-snapshot.md) owns the bulk refresh and `_fetched_at` makes the age of every document auditable; the card page shows the snapshot date, not "now".
- **Risk — 20k requests look like abuse to a free, keyless API.** Mitigation: concurrency 8 (the legacy value, which completed a full crawl), an identifying `User-Agent`, `Retry-After` honoured, exponential backoff, circuit breaker. If TCGdex ever publishes a rate limit, it becomes a constant here and a note in `docs/NOTICE.md` ([S01.T09](../01-foundation/T09-licensing-and-notice.md)).
- **Risk — 20,219 files in one directory.** Acceptable on NTFS when addressed by name; no code enumerates the directory. If it ever becomes a problem, a two-level shard (`cards/<first2>/<id>.json`) is a change to `paths.ts` plus a one-off move.
- **Question — should the set brief be refreshed on every run** (new cards appear in a set after release)? Recommendation: refresh `sets.json` and every `sets/<id>.json` on every `full` run (they are ≈175 cheap requests) and keep card documents cache-by-presence. Decide with [S02.T04](T04-set-and-card-id-mapping.md)'s owner; the interface already takes `force` per call.
- **Question — is `pricing.tcgplayer.unit` always `USD` and `cardmarket.unit` always `EUR`?** [S02.T07](T07-prices-snapshot.md) defaults to those when the field is absent; this fetcher stores the document untouched so the question can be answered from the cache later.

### References

- `pokemon/src/pokesearch/etl/fetch_tcgdex.py` — verified (138 lines): endpoints `/sets`, `/sets/{id}`, `/cards/{id}` cached at `sets.json`, `sets/{id}.json`, `cards/{id}.json`; `_get_json(..., retries=5)` with `delay = 1.0` doubling, `404 → None`, retry on 429/500/502/503/504 and `httpx.TransportError`/`TimeoutException`; `_fetched_at` stamped on card documents only; `fetch_cards_bulk` uses `asyncio.Semaphore(config.TCGDEX_CONCURRENCY)` and logs every 250; `User-Agent: pokesearch-etl/0.1`, timeout 30. Consult for endpoints and policy; note that its transport-error backoff sleeps while holding the semaphore — the asymmetry BR-S02.T03-03 removes.
- `pokemon/src/pokesearch/config.py` — verified: `TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en"`, `TCGDEX_ASSETS_BASE = "https://assets.tcgdex.net"`, `TCGDEX_CONCURRENCY = int(os.getenv("TCGDEX_CONCURRENCY", "8"))`.
- `pokemon/README.md` L16 — verified: TCGdex described as "Enriquecimento: preços TCGPlayer (USD) e Cardmarket (EUR), legalidade Standard/Expanded, variantes, imagens WebP. Gratuito, sem chave."
- External: `https://api.tcgdex.net/v2/en` — `/sets`, `/sets/{id}`, `/cards/{id}`; TCGdex documentation at `https://tcgdex.dev/` for the `pricing`, `legal`, `variants` and `image` shapes.
- [S02.T01](T01-etl-cli-and-raw-cache.md) — cache paths, `writeJsonAtomic`, counters; [Decision log](../../project/02-decision-log.md) D-003 for the "cache, not database" rule behind `--seed-tcgdex-from`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)

## 📥 Entradas (Inputs)
- `module` CLI + cache layout + run log — from [S02.T01](T01-etl-cli-and-raw-cache.md)
- `external` `https://api.tcgdex.net/v2/en/sets`, `/sets/{id}` (brief card list `id, localId, name`), `/cards/{id}` (full card incl. `pricing`, `legal`, `variants`, `image`)
- `file` `pokemon/src/pokesearch/etl/fetch_tcgdex.py` — endpoints, retry/backoff, concurrency and the cache-by-presence policy; read-only reference

## 📤 Saídas Esperadas (Outputs)
- `module` `etl/fetch-tcgdex.ts` — `fetchSetList()`, `fetchSetBrief(id)`, `fetchCards(ids, { force, concurrency = 8 })` with file-per-entity cache (presence = cached), `_fetched_at` stamp, retry policy — consumed by [S02.T04](T04-set-and-card-id-mapping.md), [S02.T07](T07-prices-snapshot.md)
- `file` cached JSON under `RAW_CACHE_DIR/tcgdex/` (≈20k card files, ≈53 MB)

## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)
```
export const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";
export const TCGDEX_CONCURRENCY = 8;      // legacy config.TCGDEX_CONCURRENCY

export interface TcgdexSetSummary { id: string; name: string; cardCount?: { total?: number; official?: number }; }
export interface TcgdexBriefCard { id: string; localId: string; name: string; image?: string; }
export interface TcgdexSet extends TcgdexSetSummary { serie?: { id: string; name: string }; releaseDate?: string;
  legal?: { standard?: boolean; expanded?: boolean }; cards?: TcgdexBriefCard[]; }
export interface TcgdexCard { id: string; localId: string; name: string; image?: string; stage?: string;
  regulationMark?: string; updated?: string; variants?: Record<string, boolean>;
  legal?: { standard?: boolean; expanded?: boolean };
  pricing?: { tcgplayer?: Record<string, unknown>; cardmarket?: Record<string, unknown> };
  _fetched_at?: string; }

export interface FetchCardsOptions { force?: boolean; concurrency?: number; signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void; }
export interface FetchCardsResult { results: Map<string, TcgdexCard | null>; failedIds: string[];
  requests: number; cacheHits: number; notFound: number; retries: number; bytes: number; }

export async function fetchSetList(opts?: { force?: boolean }): Promise<TcgdexSetSummary[]>;
export async function fetchSetBrief(setId: string, opts?: { force?: boolean }): Promise<TcgdexSet | null>;
export async function fetchCards(ids: string[], opts?: FetchCardsOptions): Promise<FetchCardsResult>;
export function readCachedCard(id: string): TcgdexCard | null;   // no network, null when absent or unreadable
export function readCachedSet(id: string): TcgdexSet | null;
export async function seedCacheFrom(dir: string): Promise<{ copied: number; skipped: number }>;
export class TcgdexUnavailableError extends Error { consecutiveFailures: number; }
```

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-S02.T03-01 | A cached card or set file is used without any HTTP request unless `force` is set; presence plus successful JSON parse is the only cache check. — Enforcement: `readCache()` guard at the top of `fetchCard` / `fetchSetBrief` — Verification: `fetch-tcgdex.spec.ts > re-run makes zero HTTP requests` |
| BR-S02.T03-02 | Every card document written to the cache carries `_fetched_at` as an ISO-8601 UTC timestamp; set briefs and the set list do not. — Enforcement: the write path of `fetchCard` only — Verification: `fetch-tcgdex.spec.ts > card file has _fetched_at, set file does not` |
| BR-S02.T03-03 | The concurrency limiter is held only around the HTTP request; backoff sleeps happen outside it, for both transport and HTTP failures. — Enforcement: `limit(() => request(...))` with the retry loop wrapping the limited call — Verification: `fetch-tcgdex.spec.ts > 8 concurrent slots stay busy while one request backs off` (observed in-flight count) |
| BR-S02.T03-04 | A `404` yields `null` and is counted, never retried and never cached as an empty document. — Enforcement: the 404 branch returns before the write — Verification: `fetch-tcgdex.spec.ts > 404 returns null and writes no file` |
| BR-S02.T03-05 | 429 and 5xx are retried up to 5 times with exponential backoff from 1 s (1, 2, 4, 8, 16 s) plus ±20 % jitter; `Retry-After` overrides the computed delay when present. — Enforcement: `backoffDelay(attempt, response)` — Verification: `fetch-tcgdex.spec.ts > injected 429s follow the documented sequence`; `> Retry-After: 30 is honoured` |
| BR-S02.T03-06 | Individual card failures never fail the step: they are collected into `failedIds` and reported; the step fails only if the set list itself cannot be read. — Enforcement: `fetchCards` returns `{ results, failedIds }`; `fetchSetList` throws — Verification: `fetch-tcgdex.spec.ts > 3 failing cards out of 10 still resolve 7 and report 3` |
| BR-S02.T03-07 | The step aborts with an error when 50 consecutive requests fail, instead of walking the whole id list against a dead endpoint. — Enforcement: consecutive-failure counter in `fetchCards`, reset on any success — Verification: `fetch-tcgdex.spec.ts > all-503 endpoint aborts after 50 consecutive failures` |
| BR-S02.T03-08 | `--force` re-requests documents but only replaces a cache file after the new body parses; a failed refresh leaves the previous document readable. — Enforcement: `writeJsonAtomic` after validation — Verification: `fetch-tcgdex.spec.ts > force refresh with a bad body keeps the old file` |
| BR-S02.T03-09 | Requests carry a descriptive `User-Agent` and no credentials; TCGdex needs no key and none is ever read from the environment. — Enforcement: the single `undici` Agent configuration — Verification: `pnpm lint` grep: no `process.env` read inside `fetch-tcgdex.ts`; `> request headers` assertion in the spec |


## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)
- (nenhum)

## ✅ Critérios de aceite (done_when)
- `fetch-tcgdex.spec.ts > set brief and 10 cards write 11 files` and a second run makes zero HTTP requests with `tcgdex_cache_hits = 10` (BR-S02.T03-01).
- `> card file has _fetched_at, set file does not` (BR-S02.T03-02).
- `> injected 429s follow the documented sequence` — delays 1, 2, 4, 8, 16 s within the jitter band; `> Retry-After: 30 is honoured` (BR-S02.T03-05).
- `> 404 returns null and writes no file`, with `notFound = 1` (BR-S02.T03-04).
- `> 3 failing cards out of 10 still resolve 7 and report 3` and the step returns normally (BR-S02.T03-06).
- `> all-503 endpoint aborts after 50 consecutive failures` with `TcgdexUnavailableError` (BR-S02.T03-07).
- `> 8 concurrent slots stay busy while one request backs off` — the observed maximum in-flight count is 8 and never drops to 7 during a backoff (BR-S02.T03-03).
- `> force refresh with a bad body keeps the old file` (BR-S02.T03-08).
- Against the real API, `pnpm etl full` populates `RAW_CACHE_DIR/tcgdex/` with ≈20,219 card files / ≈53 MB (legacy measurement) and the repeated run finishes in seconds.
- `readCachedCard()` returns a document with the network disabled; `pnpm etl full --skip-tcgdex` makes no request to `api.tcgdex.net` (asserted by a blocking dispatcher in the spec).

## 📖 Arquivos para ler primeiro (o planejador começa por estes)
- `docs/stages/02-card-data-and-search/T03-fetch-tcgdex.md`

## 📁 Arquivos Alvo a Criar/Editar
- `packages/etl/src/fetch-tcgdex.ts`

