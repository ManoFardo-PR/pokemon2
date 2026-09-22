# S02.T11 — API: search, cards, sets, facets

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 11 / 14 |
| Depends on | [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S02.T07](T07-prices-snapshot.md), [S02.T09](T09-search-query-model-and-sql.md), [S02.T10](T10-natural-language-parser.md) |
| Unblocks | [S02.T12](T12-web-search-page.md), [S02.T13](T13-web-card-detail-page.md), [S02.T14](T14-web-sets-page.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Fastify app factory and route conventions — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `table` `price_history`, `cards_market_usd` — from [S02.T07](T07-prices-snapshot.md)
- `module` search service + `SearchQuery` — from [S02.T09](T09-search-query-model-and-sql.md)
- `module` `parseNaturalLanguage` — from [S02.T10](T10-natural-language-parser.md)
- `file` `pokemon/src/pokesearch/api/routes_api.py`, `routes_ui.py::card_page`, `deps.py::query_from_request` — the endpoint set, the parameter buckets and the card-page payload; read-only reference

## Outputs (proposed)
- `contract` `GET /api/search?…` (every `SearchQuery` field as query params + `q` free phrase) → `{ interpretation: { source: 'rules', chips, filters }, total, page, page_size, pages, usedOrFallback, items[] }`; `POST /api/search` (body = SearchQuery); `GET /api/nl/parse?q=`; `GET /api/cards/:id` (card + set + attacks + abilities + weaknesses + resistances + latest prices + other printings); `GET /api/cards/:id/prices?days=730`; `GET /api/sets`; `GET /api/facets`; `GET /api/stats` — consumed by [S02.T12](T12-web-search-page.md), [S02.T13](T13-web-card-detail-page.md), [S02.T14](T14-web-sets-page.md)
- `module` `apps/api/src/routes/{search,cards,sets}.ts`

## Initial objective
The web app (and any script) can search, read a card with everything the card page needs in one call, and list sets, with query parameters validated and documented by the shared schema.

## Context

This is the seam between the database work of S02 and the three pages that follow. It adds no query logic: [S02.T09](T09-search-query-model-and-sql.md) owns the SQL, [S02.T10](T10-natural-language-parser.md) owns the phrase. What it owns is the **contract** — how a URL becomes a `SearchQuery`, what the response envelope looks like, and how errors are shaped — and one piece of real behaviour: the merge rule between a free phrase and explicit filters.

The legacy solved the merge in `pokemon/src/pokesearch/api/deps.py::query_from_request`: parse `q` into a `SearchQuery`, then walk the URL parameters and overwrite whatever they name, bucketed by type (`_LIST_PARAMS` 7 keys, `_INT_PARAMS` 10, `_FLOAT_PARAMS` 2, `_BOOL_PARAMS` 3, `_STR_PARAMS` 16), with a special `all_years=1` that clears `release_from`. The rule the README states is "os filtros do painel lateral prevalecem sobre a interpretação da frase" — sidebar filters win. That rule is kept, because it is what makes the chips usable: the user reads the interpretation, then corrects one filter without rewriting the phrase.

Two things change. The legacy mixed JSON endpoints with HTMX HTML fragments in the same app and its `/api/search` accepted anything, coercing silently (`int(vals[-1])` inside a `try/except: pass`, so `page_size=abc` was ignored rather than refused). Here the app is JSON-only (D-008; HTML belongs to `apps/web`) and the query string is parsed by the shared zod schema, so a bad value is a 400 naming the field. And `GET /api/cards/:id` returns, in one call, everything the card page needs — including the "other printings" strip that the legacy computed inside the HTML route and never exposed over HTTP.

## Scope

- **In scope.** `apps/api/src/routes/search.ts`, `cards.ts`, `sets.ts`; the query-string codec that turns a flat URL into a `SearchQuery` (repeated keys → arrays, `1/true/sim` → booleans, `all_years=1` → `release_from: null`); the merge rule; the response envelopes; the `CardDetail` payload including other printings; the OpenAPI document at `/docs`; route tests on the temp database.
- **Out of scope.** The Fastify factory, logging, CORS and the error envelope shape ([S01.T07](../01-foundation/T07-api-skeleton-and-health.md)); SQL ([S02.T09](T09-search-query-model-and-sql.md)); parsing ([S02.T10](T10-natural-language-parser.md)); any page ([S02.T12](T12-web-search-page.md)–[S02.T14](T14-web-sets-page.md)); meta, deck and job endpoints (their own stages); authentication — none, the API binds to `127.0.0.1` (D-007).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask; it inherits RN-60 from [S02.T10](T10-natural-language-parser.md) by calling the rules parser unconditionally and offering no LLM path.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T11-01 | Explicit query parameters override the phrase interpretation, field by field: a value present in the URL replaces whatever `parseNaturalLanguage` wrote for that field. | `mergeQuery(parsed, urlValues)` in `apps/api/src/search/params.ts` | `search.route.spec.ts > ?q=fogo&types=Water` returns `types: ['Water']` and keeps the other parsed fields |
| BR-S02.T11-02 | Every request is validated against `SearchQuerySchema`; an invalid value is a `400` with `{ error: { code: 'invalid_query', issues: [{ path, message }] } }` and no database access. | the zod type provider on the route schema | `search.route.spec.ts > page_size=999 → 400 with path ['page_size']`; `> sort=bogus → 400` |
| BR-S02.T11-03 | The response always echoes the interpretation: `interpretation.source` is `'rules'` when `q` was present and `'none'` otherwise, with `chips` and `filters = activeFilters(query)`. | the single response builder in `search.ts` | `search.route.spec.ts > without q, source is 'none' and chips is empty`; `> with q, chips are non-empty` |
| BR-S02.T11-04 | `GET /api/cards/:id` returns everything the card page needs in one call — card, set, attacks, abilities, weaknesses, resistances, latest prices, variant list, both raw documents and up to 12 other printings — or `404` with `{ error: { code: 'not_found' } }`. | `cards.ts` composing `getCard` + `otherPrintings` | `cards.route.spec.ts > payload has all nine sections`; `> unknown id → 404` |
| BR-S02.T11-05 | "Other printings" are cards with the same `name` and a different `id`, newest first, at most 12. | `SELECT … FROM cards WHERE name = ? AND id <> ? ORDER BY release_date DESC, id LIMIT 12` | `cards.route.spec.ts > other printings excludes self and is capped at 12` |
| BR-S02.T11-06 | `days` on the price history is an integer in `[1, 3650]`, defaulting to 730; out of range is a `400`. | zod on the route params | `cards.route.spec.ts > days=99999 → 400`; `> default is 730` |
| BR-S02.T11-07 | `q` is capped at 300 characters; a longer phrase is a `400`, so no pathological input reaches the parser or the FTS matcher. | zod `.max(300)` on `q` | `search.route.spec.ts > 301-character q → 400` |
| BR-S02.T11-08 | Every route is read-only: the API opens the database and issues no `INSERT`, `UPDATE` or `DELETE` in this stage. | the three route modules contain no write statement; a read-only connection is used for them | `pnpm lint` custom rule finds no write verb in `routes/{search,cards,sets}.ts`; `> a write attempt raises SQLITE_READONLY` |
| BR-S02.T11-09 | `GET` and `POST /api/search` return byte-identical bodies for the same effective query, so the UI can use either. | both call one `runSearch(db, query)` | `search.route.spec.ts > GET and POST agree` for a query using ten filters |
| BR-S02.T11-10 | The OpenAPI document at `/docs` is generated from the same zod schemas the routes validate with; it is never hand-written. | `@fastify/swagger` fed by the zod type provider | `openapi.spec.ts > /docs/json lists the eight routes and SearchQuery has every field` |
| BR-S02.T11-11 | A repeated query key becomes an array only for the seven list fields; for every other field the **last** value wins. | `parseQueryString()` bucket table | `params.spec.ts > ?types=Fire&types=Water → ['Fire','Water']`; `> ?hp_min=1&hp_min=2 → 2` |
| BR-S02.T11-12 | `all_years=1` clears `release_from` and is the only parameter that is not a `SearchQuery` field. | the one special case in `parseQueryString()`, documented in `ROUTES.md` | `params.spec.ts > all_years=1 sets release_from to null`; `> all_years=0 leaves the default` |

## Data operations

All endpoints are reads. The api writes only user-facing tables, and this stage has none.

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/search` | `q` (≤ 300 chars) plus every `SearchQuery` field as a query parameter; list fields repeatable; `all_years=0\|1` | `{ interpretation: { source: 'rules'\|'none', chips: string[], filters: Partial<SearchQuery> }, total, page, page_size, pages, usedOrFallback, items: CardListItem[] }` | `400 invalid_query` (zod issues); `503 schema_outdated` from the skeleton's guard |
| POST | `/api/search` | body: `SearchQuery` (JSON, `strict`) | same envelope with `interpretation.source = 'none'` | `400 invalid_query`; `415` on a non-JSON body |
| GET | `/api/nl/parse` | `q` (required, ≤ 300 chars) | `{ filters: Partial<SearchQuery>, chips: string[], residual: string }` | `400 invalid_query` when `q` is missing or too long |
| GET | `/api/cards/:id` | path `id` | `CardDetail` — card columns with `*_json` parsed, `set` block, `attacks[]`, `abilities[]`, `weaknesses[]`, `resistances[]`, `prices[]` (latest per source+variant), `price_history_days`, `raw_ptcg`, `raw_tcgdex`, `other_printings[]` (≤ 12) | `404 not_found` |
| GET | `/api/cards/:id/prices` | path `id`; `days` int `[1,3650]`, default `730` | `PriceHistoryRow[]` ordered by `(snapshot_date, source, variant)` | `400 invalid_query`; `404 not_found` when the card does not exist |
| GET | `/api/sets` | — | `SetListRow[]` with `card_count`, ordered `release_date DESC, id` | — |
| GET | `/api/facets` | — | `{ types, subtypes, supertypes, rarities, regulation_marks, series, stages, artists }` (string arrays; artists ≤ 300) | — |
| GET | `/api/stats` | — | `{ sets, cards, cards_2021, with_tcgdex, price_snapshots, last_price_date, last_load }` | — |
| GET | `/docs`, `/docs/json` | — | the generated OpenAPI UI and document | — |

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `cards`, `sets`, `attacks`, `abilities`, `weaknesses`, `resistances` | R | api | every request | read-only connection | via [S02.T09](T09-search-query-model-and-sql.md)'s service |
| `cards_fts` | R | api | free-text searches | read-only, through the dialect module | [S02.T08](T08-full-text-search.md) |
| `cards_market_usd`, `cards_latest_price`, `price_history` | R | api | price column, card page, sparkline data | read-only | [S02.T07](T07-prices-snapshot.md) |
| `etl_runs` | R | api | `/api/stats` (`last_load`) | read-only, last row of kind `full`/`delta` | [S02.T01](T01-etl-cli-and-raw-cache.md) |
| anything | C/U/D | api | never in this stage | — | user-facing writes start at [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) |

## Interfaces

**`apps/api/src/search/params.ts`**

```ts
export const LIST_PARAMS = ["types", "subtypes", "series", "rarity",
  "regulation_marks", "set_ids", "attack_energy_types", "national_dex"] as const;
export function parseQueryString(qs: Record<string, string | string[]>): unknown;  // shape only, no validation
export function mergeQuery(parsed: Partial<SearchQuery>, explicit: unknown): SearchQuery;  // zod-validated result
export function toBool(v: string): boolean | undefined;   // 1|true|yes|sim|on / 0|false|no|nao|off
```

`parseQueryString` keeps every key that is a `SearchQuery` field plus `all_years`; unknown keys are ignored (they may be UI state such as `view=grid`). `mergeQuery` builds `{ ...SEARCH_QUERY_DEFAULTS, ...parsed, ...explicit }` and runs it through `SearchQuerySchema`, so the defaults, the phrase and the URL compose in exactly that precedence (BR-S02.T11-01).

**`apps/api/src/routes/search.ts`**

```ts
const SearchGetQuery = SearchQuerySchema.partial()
  .extend({ q: z.string().trim().max(300).optional(), all_years: z.enum(["0","1"]).optional() });

interface SearchResponse {
  interpretation: { source: "rules" | "none"; chips: string[]; filters: Partial<SearchQuery> };
  total: number; page: number; page_size: number; pages: number;
  usedOrFallback: boolean; items: CardListItem[];
}
interface CardListItem {
  id: string; name: string; set_id: string; set_name: string; number: string;
  supertype: string | null; subtypes: string[]; types: string[]; hp: number | null; stage: string | null;
  rarity: string | null; regulation_mark: string | null; release_date: string | null;
  img_small: string | null; img_webp_low: string | null; img_large: string | null; img_webp_high: string | null;
  market_usd: number | null; legal_standard: string | null; tcgdex_legal_standard: 0 | 1 | null;
}
```

**`apps/api/src/routes/cards.ts`**

```ts
interface CardDetail {
  /* every cards column, with *_json parsed into subtypes / types / rules / retreat / variants / national_dex */
  set: { id: string; name: string; series: string | null; ptcgo_code: string | null;
         printed_total: number | null; total: number | null; symbol_url: string | null; logo_url: string | null };
  attacks: { idx: number; name: string | null; cost: string[]; converted_cost: number | null;
             damage_text: string | null; damage_num: number | null; damage_mod: string | null; text: string | null }[];
  abilities: { idx: number; name: string | null; type: string | null; text: string | null }[];
  weaknesses: { type: string; value: string | null }[];
  resistances: { type: string; value: string | null }[];
  prices: PriceHistoryRow[];            // cards_latest_price, ordered by (source, variant)
  price_history_days: number;           // COUNT(DISTINCT snapshot_date)
  raw_ptcg: unknown; raw_tcgdex: unknown | null;
  other_printings: { id: string; set_id: string; set_name: string; number: string;
                     release_date: string | null; img_small: string | null; img_webp_low: string | null }[];
}
```

**Error envelope** (from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)): `{ error: { code, message, issues? } }` with codes `invalid_query` (400), `not_found` (404), `schema_outdated` (503), `internal` (500). The Fastify error handler maps a `ZodError` to `invalid_query` with `issues: [{ path: 'page_size', message: 'Number must be less than or equal to 200' }]`.

**OpenAPI.** `@fastify/swagger` + `@fastify/swagger-ui` at `/docs`, fed by the zod type provider, so `SearchQuery` appears with every field, type and default (BR-S02.T11-10). `GET /docs/json` is what the acceptance test reads.

**Connection.** The three route modules share a read-only connection obtained from `openDatabase(path, { readonly: true })` ([S01.T02](../01-foundation/T02-sqlite-database-client.md)) — the "read-only connection for the API" question that subtask deferred here, answered yes: this stage has no writes, and a read-only handle makes BR-S02.T11-08 enforced by SQLite rather than by review.

## Implementation steps

1. Add `params.ts` with the bucket table, `toBool`, `parseQueryString`, `mergeQuery`, and its spec (BR-S02.T11-01, -11, -12).
2. Add the read-only connection to the app context and register it as a Fastify decorator.
3. Implement `GET /api/search` with the zod route schema, the phrase→merge→service pipeline and the response envelope; spec the interpretation and the validation errors (BR-S02.T11-02, -03, -07).
4. Implement `POST /api/search` reusing `runSearch`; spec the GET/POST equality (BR-S02.T11-09).
5. Implement `GET /api/nl/parse` (pure, no database touch) and spec it against three phrases.
6. Implement `GET /api/cards/:id` with the composed payload and `other_printings`; spec every section and the 404 (BR-S02.T11-04, -05).
7. Implement `GET /api/cards/:id/prices` with the `days` bounds (BR-S02.T11-06).
8. Implement `GET /api/sets`, `/api/facets`, `/api/stats`.
9. Register `@fastify/swagger` and assert the generated document (BR-S02.T11-10).
10. Write `apps/api/ROUTES.md` additions: the parameter buckets, the merge precedence, the `all_years` special case and the error codes.
11. Run the route suite against a temp database seeded with the shared fixtures, and record p50/p95 latency for `/api/search` on the full database in `apps/api/src/search/NOTES.md`.

## Edge cases and error handling

- **`page_size=999`.** `400 invalid_query` with `issues[0].path = 'page_size'`. The legacy silently ignored a bad integer; a 400 is what lets the UI show a real message.
- **`q` plus a conflicting explicit filter** (`?q=pokémon de fogo&types=Water`). The URL wins for `types`; the phrase's other fields survive; the chips still show the phrase's interpretation, and the UI renders the effective `filters` next to them so the conflict is visible (BR-S02.T11-01).
- **`q` alone with no recognized pattern** (`?q=!!`). `interpretation.chips` is empty, `filters` is `{}`, and the search returns the default listing — a 200, not an error.
- **A 301-character `q`.** `400`; the search box caps input at 300 characters client-side, so this is a defence against scripts, not against users (BR-S02.T11-07).
- **`GET /api/cards/xx-999` (unknown id).** `404 not_found`. Note `GET /api/cards/:id/prices` also 404s for an unknown card rather than returning `[]`, so the client can distinguish "no card" from "no prices".
- **A card with no prices.** `prices: []`, `price_history_days: 0`, `market_usd: null` in list items. The card page renders the "no price" state ([S02.T13](T13-web-card-detail-page.md)) instead of an empty table.
- **A card whose name is unique.** `other_printings: []`; the strip is hidden by the page.
- **A card with 40 printings** (a basic energy). `other_printings` is capped at 12, newest first; the page links to a filtered search for the rest (BR-S02.T11-05).
- **`days=0` or `days=99999`.** `400`; `days=1` is legal and returns at most today's snapshot.
- **`?types=Fire&types=Fire`.** Duplicates are preserved into the array and the SQL `IN (?,?)` is harmless; deduplication happens in the schema's array transform so the chip list does not repeat.
- **An unknown query parameter** (`?view=grid`). Ignored by `parseQueryString`, so UI state can travel in the URL without breaking the API. A *known* field with a bad value is still a 400 — silence applies to unknown keys only.
- **The database is one migration behind.** The skeleton's `assertSchemaCurrent` guard answers `503 schema_outdated` on every route, naming `pnpm db:migrate`, instead of failing with a missing-table SQL error.
- **The FTS index is empty** (a load ran without `etl fts`). Free-text searches return `total: 0` with `usedOrFallback: false`; `/api/stats` exposes the counts so the UI can warn, and this is why `stats` carries `cards` and `last_load`.

## Acceptance / verification

- [ ] `search.route.spec.ts` against the temp database + fixtures: `?types=Water&hp_min=200` returns the expected card; `?q=água com mais de 200 de hp que cura` returns the same card with non-empty `chips` and `interpretation.source = 'rules'` (BR-S02.T11-03).
- [ ] `> ?q=fogo&types=Water` returns `interpretation.filters.types === ['Water']` and keeps `supertype: 'Pokémon'` from the phrase (BR-S02.T11-01).
- [ ] `> page_size=999 → 400` with `issues[0].path === 'page_size'`; `> sort=bogus → 400`; `> 301-character q → 400` (BR-S02.T11-02, -07).
- [ ] `> GET and POST agree` — identical JSON bodies for a ten-filter query (BR-S02.T11-09).
- [ ] `params.spec.ts` green: `?types=Fire&types=Water → ['Fire','Water']`; `?hp_min=1&hp_min=2 → 2`; `all_years=1 → release_from: null`; `all_years=0` leaves `'2021-01-01'`; `?view=grid` is ignored (BR-S02.T11-11, -12).
- [ ] `cards.route.spec.ts > payload has all nine sections` for the fixture card, with `attacks[0].cost` parsed as an array and `damage_num = 120`; `> unknown id → 404` (BR-S02.T11-04).
- [ ] `> other printings excludes self and is capped at 12` on a fixture with 14 same-name cards (BR-S02.T11-05).
- [ ] `> days=99999 → 400` and `> default is 730` (BR-S02.T11-06).
- [ ] `sets.route.spec.ts`: `/api/sets` row count equals `SELECT COUNT(*) FROM sets` and each row carries `card_count`; `/api/facets` returns eight arrays; `/api/stats` returns the seven keys with `last_load` from `etl_runs`.
- [ ] `openapi.spec.ts > /docs/json lists the eight routes` and the `SearchQuery` schema contains every field with its default (BR-S02.T11-10).
- [ ] `> a write attempt raises SQLITE_READONLY` — a test route issuing an `INSERT` fails, proving the connection mode (BR-S02.T11-08).
- [ ] On the full database, `/api/search?q=pokémon de fogo com mais de 200 hp desde 2023` answers in under 200 ms p95 over 50 requests, and the numbers are recorded in `apps/api/src/search/NOTES.md`.

## Risks and open questions

- **Risk — the query-string codec and the zod schema drift** (a new `SearchQuery` field the bucket table does not know). Mitigation: `LIST_PARAMS` is the only hand-maintained list; every other field is derived from `SearchQuerySchema.shape`, and a spec asserts that the derived key set equals the schema's.
- **Risk — the card payload grows** (both raw documents are kilobytes each). Mitigation: the UI collapses them; if the payload becomes a problem, `?raw=0` omits them — a backwards-compatible addition, not a breaking change.
- **Risk — facets are computed per request.** Mitigation: [S02.T09](T09-search-query-model-and-sql.md) memoizes them for ten minutes; the route adds `Cache-Control: max-age=600` so the browser does not refetch on every page.
- **Question — should `/api/search` support cursor pagination** for deep pages? Offset pagination on 20.4k rows is fine; a cursor matters at millions. Recommendation: keep offsets, revisit if a consumer ever pages past ~100 pages. Owner: whoever builds the next list endpoint ([S03.T07](../03-tournament-meta-and-deck-builder/T07-api-meta-endpoints.md)).
- **Question — should the API expose an `ai=1` interpretation** as the legacy did? RN-60 allows it only as an opt-in hidden without a key. Recommendation: not in S02; `interpretation.source` already leaves room, so adding it later changes no client.
- **Question — ETag / `If-None-Match` on `/api/sets` and `/api/facets`?** Both change only after an ETL run. Recommendation: derive a weak ETag from `MAX(cards.updated_at)` if the sets page ever feels slow; not needed for ≈174 rows today.

## References

- `pokemon/src/pokesearch/api/routes_api.py` — verified (68 lines): `GET /api/search` returning `{interpretation: {source, chips, filters, llm_available}, total, page, page_size, pages, used_or_fallback, items}`; `POST /api/search` taking a `SearchQuery` body; `GET /api/nl/parse`; `GET /api/cards/{card_id}` (404 "card não encontrado"); `GET /api/cards/{card_id}/prices?days=90`; `GET /api/sets`, `/api/facets`, `/api/stats`. Consult for the endpoint set and the envelope; the new `days` default is 730 because the card page asks for two years.
- `pokemon/src/pokesearch/api/deps.py` — verified (93 lines): `query_from_request` parsing `q` with the rules parser and then letting URL parameters overwrite it, with the five bucket sets (`_LIST_PARAMS` 7, `_INT_PARAMS` 10, `_FLOAT_PARAMS` 2, `_BOOL_PARAMS` 3, `_STR_PARAMS` 16), `_bool` accepting `1/true/yes/sim/on` and `0/false/no/nao/não/off`, the `all_years` special case clearing `release_from`, and the silent `except ValueError: pass` this subtask replaces with a 400.
- `pokemon/src/pokesearch/api/routes_ui.py::card_page` — verified: the "other printings" query `SELECT id, set_id, number, release_date, img_small FROM cards WHERE name = ? AND id != ? ORDER BY release_date DESC LIMIT 12`, and `get_price_history(conn, card_id, days=730)` for the card page.
- `pokemon/README.md` L62–76 — verified: the endpoint table and the full list of query-string filters, which is the parameter surface this contract reproduces.
- [S01.T07](../01-foundation/T07-api-skeleton-and-health.md) — the app factory, the error envelope, `ROUTES.md` and the schema-version guard; [S02.T09](T09-search-query-model-and-sql.md) — `search`, `getCard`, `facets`, `stats`, `listSets`; [S02.T10](T10-natural-language-parser.md) — `parseNaturalLanguage` and the chip strings.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
