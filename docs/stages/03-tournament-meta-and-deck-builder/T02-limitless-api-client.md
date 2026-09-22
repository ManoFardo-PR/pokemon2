# S03.T02 — Limitless API client

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 2 / 13 |
| Depends on | [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) |
| Unblocks | [S03.T05](T05-decks-sync-and-prune.md) |
| Parallel with | [S03.T01](T01-tournaments-schema-migration.md), [S03.T03](T03-limitless-web-scraper.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` CLI, cache layout (`limitless/tournaments/<id>/…`), run log — from [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)
- `external` `https://play.limitlesstcg.com/api` — `GET /tournaments?game=PTCG&format=STANDARD&limit=50&page=N`, `GET /tournaments/{id}/details`, `GET /tournaments/{id}/standings`; optional header `X-Access-Key` (`LIMITLESS_API_KEY` raises the rate limit)
- `env` `LIMITLESS_API_KEY` (optional), `RAW_CACHE_DIR` — defaults in [Architecture](../../project/03-architecture-overview.md) "Environment layout"

## Outputs (proposed)
- `module` `etl/limitless-api.ts` — `listTournaments({ format, days = 90, minPlayers = 16, maxTournaments = 400 })`, `details(id)`, `standings(id)` with per-tournament file cache — consumed by [S03.T05](T05-decks-sync-and-prune.md)
- `contract` politeness: ≥ 0.4 s between requests, 5 retries with exponential backoff honouring `Retry-After`, 404 → null, descriptive User-Agent
- `contract` zod schemas `TournamentSummary`, `TournamentDetails`, `Standing`, `SourceDecklist` in `packages/shared/src/limitless.ts`, so a shape change at the source fails at parse time instead of at insert time
- `file` recorded JSON fixtures under `packages/etl/test/fixtures/limitless-api/` (one tournament list page, one standings document with and without decklists)

## Initial objective
Tournament lists, standings and decklists for the configured window arrive from the official API without ever tripping its rate limit, cached per tournament so re-syncs cost one request per new event.

## Context

The Limitless play API is the primary source of the meta window: it publishes online tournaments with full standings and, for most of them, each player's decklist. The legacy project pulled **400 tournaments** through it (403 in total, the other 3 coming from the web scraper of [S03.T03](T03-limitless-web-scraper.md)), and those decks are the sample behind every share, partner, opponent weight and coverage denominator downstream.

The constraint that shapes this module is politeness, not throughput. The legacy client (`pokemon/src/pokesearch/etl/limitless.py`) spaced requests at `min_interval = 0.4` s and retried five times with exponential backoff, honouring `Retry-After` on 429; the legacy README records that the API allows roughly 150 requests per window of a few minutes and that a cold 90-day load takes 10–20 minutes while daily syncs are fast. Those numbers are the reason the per-tournament file cache is part of this subtask and not an optimisation: a re-sync must cost one request per *new* event, not one per event in the window.

RN-03 defines the window itself — Standard, last 90 days, at least 16 players, at most 400 tournaments — and it is enforced here, in the listing function, so that everything downstream inherits a window it did not have to filter again. D-003 applies: this is a TypeScript rewrite from the public endpoints; the legacy Python is documentation of the pagination and backoff rules, not code to port. Nothing in this subtask touches the database — [S03.T05](T05-decks-sync-and-prune.md) owns every write.

## Scope

- **In scope.** `packages/etl/src/limitless-api.ts`: the HTTP client (spacing, retries, `Retry-After`, User-Agent, optional `X-Access-Key`), `listTournaments` with the RN-03 window and its pagination cutoff, `details`, `standings`, the per-tournament raw cache under `RAW_CACHE_DIR/limitless/tournaments/<id>/`, a request counter, and the zod schemas that validate each response.
- **Out of scope.** Any database write, the orchestration of a sync, `complete`/refresh logic and pruning ([S03.T05](T05-decks-sync-and-prune.md)); scraping the public site ([S03.T03](T03-limitless-web-scraper.md)); resolving decklist lines to card ids ([S03.T04](T04-deck-resolver.md)); scheduling ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-03 | **Kept.** The meta window is Standard, the last 90 days, tournaments with ≥ 16 players, at most 400 of them. `listTournaments` applies all four filters and returns nothing outside the window. | `listTournaments()` in `limitless-api.ts`: `format` in the query string, `date >= now − days`, `players >= minPlayers`, `return` once `out.length === maxTournaments` | `limitless-api.spec.ts > window filters` on a recorded three-page fixture: a 12-player event and a 100-day-old event are absent, the cap truncates at `maxTournaments` |
| BR-S03.T02-01 | No two HTTP requests leave the client less than `minIntervalMs` (default 400) apart, including retries and cache misses. | a monotonic `lastRequestAt` guard inside `request()`, updated in a `finally` block so a thrown request still counts | `limitless-api.spec.ts > spacing` with a fake clock: 5 requests take ≥ 1,600 ms of simulated time |
| BR-S03.T02-02 | On HTTP 429/500/502/503/504 the client waits `Retry-After` when it is a number, otherwise the current backoff delay (1 s doubling per attempt), and gives up after 5 attempts by returning `null` — never by throwing. | `request()` retry loop | `limitless-api.spec.ts > honours Retry-After` (429 with `Retry-After: 2` then 200 → one wait of 2 s, result returned); `> gives up after 5 attempts` → `null` |
| BR-S03.T02-03 | HTTP 404 returns `null` immediately, with no retry and no cache write. | the `status === 404` branch, placed before the retryable-status branch | `limitless-api.spec.ts > 404 returns null`; the cache directory stays empty |
| BR-S03.T02-04 | Pagination stops at the first page whose every dated entry is older than the cutoff, or at a short page; `maxPages` (60) is a hard stop. | the `allOld`/`data.length < pageSize` break in `listTournaments` | `limitless-api.spec.ts > pagination cutoff` — page 3 is all old, so page 4 is never requested (request counter = 3) |
| BR-S03.T02-05 | A tournament document is fetched at most once: `details(id)` and `standings(id)` read `RAW_CACHE_DIR/limitless/tournaments/<id>/{details,standings}.json` when it exists and `useCache !== false`, and write it after a successful fetch. An empty standings array is a valid cached value and is not re-fetched. | `readCache`/`writeCache` in `limitless-api.ts`, with an explicit `!== undefined` test rather than a truthiness test | `limitless-api.spec.ts > second sync issues no request for a cached tournament` (counter unchanged); `> empty standings array is cached` |
| BR-S03.T02-06 | Every response is validated against its zod schema before being returned; a document that fails validation is logged with the tournament id and treated as absent (`null`), never partially consumed. | `TournamentSummary`/`Standing` parsing in `limitless-api.ts` | `limitless-api.spec.ts > malformed standings` — a fixture with `players: "many"` yields `null` and one warning |
| BR-S03.T02-07 | Requests always carry `User-Agent: pokesearch2/<version> (+local deck browser; <repo url>)` and, when `LIMITLESS_API_KEY` is set, `X-Access-Key`; the key is never logged or written into the cache. | `buildHeaders()`; the logger redacts header values | `limitless-api.spec.ts > headers` asserts both headers; `> key never logged` greps captured log output |

## Data operations

This subtask performs no database operation. Its operations are HTTP requests and raw-cache files.

| Operation | Request | Params | Cache file | Politeness & idempotency | Result |
|---|---|---|---|---|---|
| list page | `GET /tournaments` | `game=PTCG`, `format`, `limit=50`, `page=N` | not cached (the window moves every day) | ≥ 0.4 s spacing; at most `maxPages = 60` pages | `TournamentSummary[]`, newest first |
| window listing | `listTournaments()` | `{ format, days, minPlayers, maxTournaments }` | — | pure over the pages it reads; dedupe by `id`; stops on cutoff or cap (RN-03, BR-S03.T02-04) | up to `maxTournaments` summaries |
| details | `GET /tournaments/{id}/details` | — | `limitless/tournaments/<id>/details.json` | read-through cache; written only on a 2xx; requested only when the caller needs organizer/platform | `TournamentDetails \| null` |
| standings | `GET /tournaments/{id}/standings` | — | `limitless/tournaments/<id>/standings.json` | read-through cache; `[]` is a legitimate cached value | `Standing[] \| null` |
| retry | any of the above | — | — | 5 attempts, delay 1 s doubling, `Retry-After` wins when numeric (BR-S03.T02-02) | value or `null` |
| request accounting | — | — | — | `client.requests` counts every network round trip, cache hits excluded | number reported into `etl_runs` by [S03.T05](T05-decks-sync-and-prune.md) |

## Interfaces

**`packages/etl/src/limitless-api.ts`**

```ts
export interface LimitlessApiOptions {
  baseUrl?: string;            // default "https://play.limitlesstcg.com/api"
  apiKey?: string;             // default process.env.LIMITLESS_API_KEY
  minIntervalMs?: number;      // default 400   (legacy min_interval = 0.4 s)
  timeoutMs?: number;          // default 30_000
  retries?: number;            // default 5
  cacheDir?: string;           // default `${RAW_CACHE_DIR}/limitless/tournaments`
}
export interface ListTournamentsOptions {
  format?: string;             // default "STANDARD"
  days?: number;               // default 90        (RN-03)
  minPlayers?: number;         // default 16        (RN-03)
  maxTournaments?: number;     // default 400       (RN-03)
  pageSize?: number;           // default 50
  maxPages?: number;           // default 60
  now?: Date;                  // injected in tests
}
export interface LimitlessApi {
  readonly requests: number;
  listTournaments(opts?: ListTournamentsOptions): Promise<TournamentSummary[]>;
  details(id: string, opts?: { useCache?: boolean }): Promise<TournamentDetails | null>;
  standings(id: string, opts?: { useCache?: boolean }): Promise<Standing[] | null>;
  close(): void;
}
export function createLimitlessApi(opts?: LimitlessApiOptions): LimitlessApi;
export function tournamentUrl(id: string): string;   // https://play.limitlesstcg.com/tournament/<id>/standings
```

**`packages/shared/src/limitless.ts` (zod, exported as JSON Schema by [S01.T05](../01-foundation/T05-shared-contracts-package.md))**

```ts
export const SourceDecklistSchema = z.object({
  pokemon: z.array(DeckLineSchema).default([]),
  trainer: z.array(DeckLineSchema).default([]),
  energy:  z.array(DeckLineSchema).default([]),
});                                        // DeckLine = { count: number; name: string; set: string; number: string }
export const TournamentSummarySchema = z.object({
  id: z.string(), name: z.string().optional(), date: z.string().optional(),
  format: z.string().optional(), players: z.number().int().nonnegative().optional(),
  organizerId: z.number().int().optional(),
});
export const TournamentDetailsSchema = TournamentSummarySchema.extend({
  organizer: z.object({ id: z.number().int().optional(), name: z.string().optional() }).optional(),
  platform: z.string().optional(), isOnline: z.boolean().optional(),
});
export const StandingSchema = z.object({
  player: z.string().optional(), name: z.string().optional(), country: z.string().optional(),
  placing: z.number().int().positive().optional(), drop: z.number().int().optional(),
  record: z.object({ wins: z.number().int(), losses: z.number().int(), ties: z.number().int() }).optional(),
  deck: z.object({ id: z.string(), name: z.string().optional(), icons: z.array(z.string()).optional() }).optional(),
  decklist: SourceDecklistSchema.nullable().optional(),
});
```

**Window semantics of `listTournaments`.** Pages are requested newest-first from page 1. For each entry: parse `date` as ISO (a trailing `Z` accepted); skip when the date is missing, older than `now − days`, or in the future; skip ids already seen; keep the entry when `players >= minPlayers`; return as soon as `maxTournaments` entries are collected. After a page, stop when no entry on it was inside the window (`allOld`) or when the page held fewer than `pageSize` entries.

**Cache layout.** `${RAW_CACHE_DIR}/limitless/tournaments/<tournament id>/details.json` and `…/standings.json`, written with `ensure_ascii`-free UTF-8 exactly as received. The directory is the unit of invalidation: deleting it forces a re-fetch of that tournament only.

## Implementation steps

1. Add `packages/etl/src/limitless-api.ts` with `createLimitlessApi` and a `request()` that only does spacing, timeout and header construction; unit-test spacing with a fake clock.
2. Add the retry loop: retryable statuses, `Retry-After` parsing, exponential backoff, `null` after `retries` attempts, immediate `null` on 404 (BR-S03.T02-02, -03).
3. Add the zod schemas in `packages/shared/src/limitless.ts` and wire `safeParse` into every response path (BR-S03.T02-06).
4. Implement `listTournaments` with pagination, dedupe, the RN-03 filters and the cutoff/short-page stop conditions.
5. Implement `details` / `standings` with the read-through file cache under `RAW_CACHE_DIR`, including the "empty array is a valid cached value" distinction.
6. Record fixtures by running once against the live API with a short window and saving the raw JSON into `packages/etl/test/fixtures/limitless-api/`; scrub nothing, these documents are public.
7. Write `limitless-api.spec.ts` against the fixtures with an injected fetch and clock; assert the request counter, not wall-clock time.
8. Expose the client through the ETL CLI as a diagnostic (`pnpm etl limitless:probe --days 7`) that prints the window size and request count without writing anything.

## Edge cases and error handling

- **A tournament whose standings exist but whose `details` returns 404** → `standings()` succeeds, `details()` returns `null`; the caller stores the tournament from the summary fields alone (organizer and platform stay `NULL`). The legacy client behaved the same way and only requested `details` when it needed those fields.
- **`Retry-After` given as an HTTP date instead of seconds** → the numeric parse fails, so the client falls back to the current backoff delay rather than waiting an unbounded time.
- **HTTP 429 on the very first page** → the window listing waits and retries; if all 5 attempts fail, `listTournaments` returns the pages it already collected instead of throwing, and the sync reports a partial window in `etl_runs`.
- **A page returns entries dated in the future** (a scheduled event) → skipped by the `date > now` guard; they would otherwise pass the cutoff test and occupy slots in the 400-tournament cap.
- **The same tournament appears on two pages** (an entry inserted while paginating shifts the offset) → the `seen` id set drops the duplicate; without it the cap would be consumed by repeats.
- **A cached `standings.json` containing `[]`** → returned as an empty array, not re-fetched. Treating the empty array as "missing" is exactly the bug the legacy code avoided by testing `cached is not None` for standings while testing truthiness for details.
- **A corrupt cache file (truncated write, OneDrive conflict copy)** → JSON parse fails, the file is deleted and the document is re-fetched once; a second failure is logged and returns `null`.
- **`LIMITLESS_API_KEY` set to an empty string** → treated as absent; no `X-Access-Key` header is sent, so the request is not rejected as malformed.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/etl test -t "limitless-api"` green across all rules below.
- [ ] `limitless-api.spec.ts > window filters`: on the three-page fixture, an event with 12 players and an event 100 days old are excluded, and `maxTournaments = 2` truncates the result to 2 (RN-03).
- [ ] `limitless-api.spec.ts > pagination cutoff`: the fixture's third page is entirely older than the cutoff and the client stops with `requests === 3` (BR-S03.T02-04).
- [ ] `limitless-api.spec.ts > honours Retry-After`: a 429 carrying `Retry-After: 2` followed by a 200 produces exactly one 2 s wait on the fake clock and returns the payload; five consecutive 429s return `null` (BR-S03.T02-02).
- [ ] `limitless-api.spec.ts > spacing`: five sequential calls advance the fake clock by at least 1,600 ms (BR-S03.T02-01).
- [ ] `limitless-api.spec.ts > second sync issues no request for a cached tournament`: after one `standings(id)`, a second call with the same `cacheDir` leaves `requests` unchanged (BR-S03.T02-05).
- [ ] `limitless-api.spec.ts > malformed standings`: a fixture violating `StandingSchema` returns `null` and logs one warning naming the tournament id (BR-S03.T02-06).
- [ ] `pnpm etl limitless:probe --days 7` against the live API prints a window of plausible size and a request count ≤ pages + 0 (no per-tournament request), and writes nothing to the database.

## Risks and open questions

- **Risk — the API's rate limit is stricter than 0.4 s spacing suggests.** The legacy README records "about 150 requests per window of a few minutes", which 0.4 s spacing respects, but the limit is undocumented and may change. Mitigation: `minIntervalMs` is an option, `Retry-After` is honoured, and the probe command makes the current behaviour observable before a full sync.
- **Risk — the response shape changes** (a renamed field in `record` or `deck`). Mitigation: zod validation fails loudly per document (BR-S03.T02-06) and the recorded fixtures make the change reproducible offline; only the schema file needs editing.
- **Risk — a cold 90-day load takes 10–20 minutes** (legacy measurement) and a user cancels it midway. Mitigation: the per-tournament cache makes a re-run resume for free; [S03.T05](T05-decks-sync-and-prune.md) commits one tournament per transaction.
- **Question — is `LIMITLESS_API_KEY` worth requesting from Limitless?** It only raises the rate limit. The user decides; until then the client works without it and the env variable stays optional (listed in [Architecture](../../project/03-architecture-overview.md)).
- **Question — should `details` be fetched for every tournament, or only when organizer/platform are needed?** The legacy sync made it opt-in (`fetch_details`) to save one request per event. Recommendation: keep it opt-in and let [S03.T05](T05-decks-sync-and-prune.md) own the flag; revisit if the meta pages start showing organizer names.

## References

- `pokemon/src/pokesearch/etl/limitless.py` — verified: `min_interval = 0.4`, `timeout = 30.0`, `retries = 5` with `delay = 1.0` doubling, 404 → `None`, retryable statuses `(429, 500, 502, 503, 504)`, `Retry-After` parsed only when numeric, `User-Agent: pokesearch/0.1 (+local deck browser)`, `X-Access-Key` when a key exists, `list_tournaments(fmt, days, min_players, max_tournaments, page_size=50, max_pages=60)` with the `seen`/`all_old` logic, caches at `tournaments/<id>/details.json` and `standings.json`, and `tournament_url()`.
- `pokemon/src/pokesearch/config.py` L54–62 — verified: `LIMITLESS_API_BASE = "https://play.limitlesstcg.com/api"`, `DECKS_FORMAT = "STANDARD"`, `DECKS_DAYS = 90`, `DECKS_MIN_PLAYERS = 16`, `DECKS_MAX_TOURNAMENTS = 400`, `LIMITLESS_API_KEY` optional.
- `pokemon/src/pokesearch/etl/decks.py` L188–200 — verified: standings are requested before `details` precisely because they already reveal whether decklists exist.
- `pokemon/README.md` L104–106 — verified: "cerca de 150 requests por janela de alguns minutos", cold 90-day load ~10–20 min, `LIMITLESS_API_KEY` only raises the limit.
- External: `https://play.limitlesstcg.com/api` — `/tournaments`, `/tournaments/{id}/details`, `/tournaments/{id}/standings`.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-03; [Decision log](../../project/02-decision-log.md) D-003 (ETL rebuilt in TypeScript from the public sources).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
