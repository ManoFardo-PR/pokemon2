# S02.T09 — Search query model and SQL builder

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 9 / 14 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S02.T05](T05-cards-schema-migration.md), [S02.T08](T08-full-text-search.md) |
| Unblocks | [S02.T10](T10-natural-language-parser.md), [S02.T11](T11-api-cards-search-sets.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/search` placeholder to replace — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `table` card tables, indexes, `cards_market_usd` — from [S02.T05](T05-cards-schema-migration.md)
- `module` FTS query builder and rank expression — from [S02.T08](T08-full-text-search.md)
- `file` `pokemon/src/pokesearch/search/filters.py`, `service.py` and `pokemon/tests/test_search.py` — the filter semantics, the OR fallback and the end-to-end cases to port; read-only reference

## Outputs (proposed)
- `contract` `SearchQuery` (zod, in `@pokesearch/shared/search`): lists `types, subtypes, series, rarity, regulation_marks, set_ids, attack_energy_types`; ints `hp_min/max, retreat_min/max, attack_cost_min/max, attack_damage_min/max, page (1), page_size (24, ≤200)`; numbers `price_min_usd/max_usd`; booleans `legal_standard, legal_expanded, has_ability`; strings `text, name, supertype, stage, set_name, artist, attack_name, attack_text, ability_name, ability_text, weakness_type, resistance_type, evolves_from, release_from ('2021-01-01' default), release_to, sort ∈ relevance|release_date|name|hp|price_desc|price_asc|number`; `activeFilters(q)` diff against defaults — consumed by [S02.T10](T10-natural-language-parser.md), [S02.T11](T11-api-cards-search-sets.md)
- `module` `apps/api/src/search/sql.ts` — `buildSearchSql(q, { useOr }) → { items, count, params }`; `apps/api/src/search/service.ts` — `search(db, q) → { total, page, pages, items, usedOrFallback }`, `getCard(db, id)`, `getPriceHistory(db, id, days)`, `facets(db)`, `stats(db)`, `listSets(db)` — consumed by [S02.T10](T10-natural-language-parser.md), [S02.T11](T11-api-cards-search-sets.md)

## Initial objective
A single typed query object drives both the attribute filters and the free-text search, compiled into one parameterized SQL statement whose semantics match the legacy service (same filters, same sorts, same fallback), verified by ported tests.

## Context

`SearchQuery` is the pivot of this stage. The sidebar filters of [S02.T12](T12-web-search-page.md) produce it, the natural-language parser of [S02.T10](T10-natural-language-parser.md) produces it, the API of [S02.T11](T11-api-cards-search-sets.md) validates URL parameters into it, and the "interpretei como" chips are a diff of it against its own defaults. One object, three producers, one compiler — which is why it lives in `@pokesearch/shared` (browser-safe, zod, JSON Schema exported) while the SQL that consumes it lives in the API.

The legacy `pokemon/src/pokesearch/search/filters.py` is a 246-line pydantic model plus a `build_sql` that this subtask re-expresses in TypeScript. Its semantics are the specification, and four of them are non-obvious enough to be business rules here:

- **Attack conditions hold for the same attack.** `attack_damage_min=100 AND attack_text='discard energy'` must not match a card whose first attack does 120 and whose second one discards; all attack predicates go inside a single `EXISTS (SELECT 1 FROM attacks a WHERE a.card_id = c.id AND …)`.
- **Legality prefers TCGdex and falls back to the canonical string**: `COALESCE(c.tcgdex_legal_standard, c.legal_standard = 'Legal') = ?`. A card without a TCGdex document is judged by pokemon-tcg-data, not dropped.
- **The default release filter is `2021-01-01`**, so the user sees the modern card pool unless they ask for more; `release_from: null` means "all years" and the parser emits exactly that for "todos os anos".
- **The OR fallback**: when a multi-token free-text query returns zero rows, re-run it OR-joined and flag the result, so "paralyzed unicorn" shows the paralyzed card with a visible warning instead of an empty page.

Two legacy behaviours are improved rather than copied. `build_sql` returns `(sql_items, sql_count, params)` where the count query reuses the same parameter list and the caller appends `LIMIT/OFFSET` — workable but easy to desynchronize; here the builder returns `{ items, count, params }` with pagination bound inside `items`, and the two statements are asserted to consume the same parameters. And the facets query is uncached in the legacy, re-scanning `cards` with `json_each` on every page load; here it is memoized for ten minutes.

## Scope

- **In scope.** The zod `SearchQuery` schema, its defaults, its refinements and `activeFilters`; `buildSearchSql` (WHERE assembly, joins, sorts, pagination, parameterization); `search()` with set-name resolution and the OR fallback; `getCard`, `getPriceHistory`, `facets` (with cache), `stats`, `listSets`; the ported test suite.
- **Out of scope.** HTTP binding, parameter buckets and the response envelope ([S02.T11](T11-api-cards-search-sets.md)); natural-language parsing ([S02.T10](T10-natural-language-parser.md)); FTS tokenization and weights ([S02.T08](T08-full-text-search.md)); the schema ([S02.T05](T05-cards-schema-migration.md)); any UI ([S02.T12](T12-web-search-page.md)–[S02.T14](T14-web-sets-page.md)); deck and meta queries ([S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T09-01 | Every user value reaches SQL as a bound parameter; no query is built by string interpolation of user input. | `buildSearchSql` appends to `params` for every predicate; eslint forbids template literals containing `${` inside the SQL builder except for validated identifiers | `sql.spec.ts > no predicate embeds a value` (the generated SQL contains no digit or quote from the input); `> name with a quote round-trips` |
| BR-S02.T09-02 | All attack predicates are evaluated against the **same** attack row, and all ability predicates against the same ability row. | one `EXISTS (… FROM attacks a WHERE a.card_id = c.id AND <all>)`; likewise for `abilities b` | `search.spec.ts > attack_damage_min=100 + attack_text='paralyz' returns 0 on the fixture` (two different attacks) |
| BR-S02.T09-03 | Standard/Expanded legality is `COALESCE(c.tcgdex_legal_<f>, c.legal_<f> = 'Legal') = ?`; a card with no TCGdex document is judged by the canonical string. | the two legality predicates | `search.spec.ts > trainer stadium legal` (fixture cards have no TCGdex document and are still found) |
| BR-S02.T09-04 | `release_from` defaults to `'2021-01-01'`; `null` disables the filter entirely and is the only way to search all years. | the zod default plus the `if (q.release_from)` guard | `search.spec.ts > default release filter` returns only the modern printing; with `release_from: null` it returns both |
| BR-S02.T09-05 | `page_size` is an integer in `[1, 200]` and `page` an integer `≥ 1`; a violation is a schema error, never a clamped value. | zod `.int().min(1).max(200)` | `search-query.spec.ts > page_size 999 fails parsing`; the API maps it to 400 ([S02.T11](T11-api-cards-search-sets.md)) |
| BR-S02.T09-06 | The OR fallback fires only when the result is empty **and** the free text has more than one token; it sets `usedOrFallback` only when the retry actually found rows. | `search()` after the count query, using `tokens()` from [S02.T08](T08-full-text-search.md) | `search.spec.ts > or fallback`: `text='paralyzed unicorn'` returns the paralyzed card with `usedOrFallback = true`; `text='unicorn'` returns 0 with `usedOrFallback = false` |
| BR-S02.T09-07 | `set_name` is resolved to `set_ids` before the SQL is built (by id, `ptcgo_code` or normalized name `LIKE`); when nothing matches, a sentinel id is used so the result is empty rather than unfiltered. | `resolveSetName()` in `service.ts`, returning `['__none__']` when empty | `search.spec.ts > unknown set_name returns 0 rows, not everything` |
| BR-S02.T09-08 | `retreat_max` implies `supertype = 'Pokémon'` and treats a missing retreat cost as 0 (`COALESCE(c.retreat_cost, 0) <= ?`), so "recuo grátis" never returns Trainers. | the `retreat_max` predicate | `search.spec.ts > retreat_free` returns only the free-retreat Pokémon |
| BR-S02.T09-09 | The `items` and `count` statements share one parameter array; the builder asserts that both consume exactly `params.length` placeholders (plus the two pagination parameters bound inside `items`). | placeholder count check in `buildSearchSql` | `sql.spec.ts > items and count consume the same params` for a query using every filter |
| BR-S02.T09-10 | `activeFilters(q)` returns exactly the fields whose value differs from the schema default, excluding `page`, `page_size` and `sort`. | `activeFilters()` compared against `SearchQuerySchema.parse({})` | `search-query.spec.ts > activeFilters`: `{}` → `{}`; `{ types: ['Fire'] }` → `{ types: ['Fire'] }`; `{ release_from: '2021-01-01' }` → `{}` |
| BR-S02.T09-11 | Every `sort` value produces valid SQL and a total order: each sort ends with a deterministic tiebreak so pagination cannot repeat or skip a row. | the `ORDER BY` map, each entry ending in `c.id` | `sql.spec.ts > every sort value executes` (all seven run against the fixture DB); `> page 1 and page 2 are disjoint` for each sort |
| BR-S02.T09-12 | `facets()` is memoized for 10 minutes per database path and the cache is invalidated by `etl` runs through a version key, never served stale across a reload within a process. | `facetsCache` keyed by `(path, MAX(cards.updated_at))` | `facets.spec.ts > second call does not query`; `> a new card invalidates the cache` |

## Data operations

This subtask issues **reads only** — it never writes a row. Below, what a `SearchQuery` field produces.

| Read operation | Input field(s) | SQL produced (through the dialect module where marked †) |
|---|---|---|
| Base relation | always | `FROM cards c JOIN sets s ON s.id = c.set_id LEFT JOIN cards_market_usd m ON m.card_id = c.id` |
| Free-text rank join | `text` | `JOIN (SELECT card_id, <rankExpr> AS rank FROM cards_fts WHERE cards_fts MATCH ?) f ON f.card_id = c.id` † |
| Name substring | `name` | `c.name_norm LIKE ?` with `%norm(name)%` |
| Category | `supertype`, `stage` | `c.supertype = ?` (mapped `pokemon\|trainer\|energy` → `Pokémon\|Trainer\|Energy`), `c.stage = ?` |
| JSON array membership | `types`, `subtypes`, `attack_energy_types` | `EXISTS (SELECT 1 FROM json_each(<col>) WHERE lower(value) IN (?,…))` † |
| Set / series | `set_ids`, `series` | `c.set_id IN (?,…)`; `lower(s.series) IN (?,…)` |
| Rarity | `rarity` | `(lower(c.rarity) LIKE ? OR …)` — OR-ed substrings |
| Regulation mark | `regulation_marks` | `upper(c.regulation_mark) IN (?,…)` |
| Artist | `artist` | `lower(c.artist) LIKE ?` |
| National dex | `national_dex` | `EXISTS (SELECT 1 FROM json_each(c.national_dex_json) WHERE value IN (?,…))` † |
| Legality | `legal_standard`, `legal_expanded` | `COALESCE(c.tcgdex_legal_<f>, c.legal_<f> = 'Legal') = ?` |
| Numeric ranges | `hp_min/max`, `retreat_min` | `c.hp >= ?`, `c.hp <= ?`, `c.retreat_cost >= ?` |
| Free retreat | `retreat_max` | `COALESCE(c.retreat_cost, 0) <= ? AND c.supertype = 'Pokémon'` |
| Attack block (one attack) | `attack_name`, `attack_text`, `attack_cost_min/max`, `attack_damage_min/max`, `attack_energy_types` | `EXISTS (SELECT 1 FROM attacks a WHERE a.card_id = c.id AND <word-wise LIKEs on a.name_norm / a.text_norm> AND a.converted_cost <= ? AND a.converted_cost >= ? AND a.damage_num >= ? AND a.damage_num <= ? AND <json_each on a.cost_json>)` |
| Ability block (one ability) | `ability_name`, `ability_text` | `EXISTS (SELECT 1 FROM abilities b WHERE b.card_id = c.id AND <word-wise LIKEs>)` |
| Ability presence | `has_ability` | `EXISTS (…)` / `NOT EXISTS (…)` — only when no ability text/name filter is present |
| Weakness / resistance | `weakness_type`, `resistance_type` | `EXISTS (SELECT 1 FROM weaknesses w WHERE w.card_id = c.id AND lower(w.type) = ?)`; same for `resistances r` |
| Evolution | `evolves_from` | `lower(c.evolves_from) LIKE ?` |
| Release window | `release_from`, `release_to` | `c.release_date >= ?`, `c.release_date <= ?` |
| Price window | `price_min_usd`, `price_max_usd` | `m.market_usd >= ?`, `m.market_usd <= ?` |
| Sort | `sort` | see the `ORDER BY` map under Interfaces † (`numericOrder` for `number`) |
| Pagination | `page`, `page_size` | `LIMIT ? OFFSET ?` with `offset = (page - 1) * page_size` |
| Count | always | the same `FROM … WHERE …` with `SELECT COUNT(*)` |
| Set-name resolution | `set_name` | `SELECT id FROM sets WHERE lower(id) = ? OR lower(ptcgo_code) = ? OR name_norm LIKE ?` |
| Card read | `getCard(id)` | card + set join, attacks/abilities ordered by `idx`, weaknesses, resistances, `cards_latest_price`, `COUNT(DISTINCT snapshot_date)` |
| Price history | `getPriceHistory(id, days)` | `… FROM price_history WHERE card_id = ? AND snapshot_date >= ? ORDER BY snapshot_date, source, variant` |
| Facets | `facets()` | seven `DISTINCT`/`GROUP BY` queries + artists `LIMIT 300`, memoized 10 min |
| Stats | `stats()` | counts of `sets`, `cards`, cards since 2021, cards with `tcgdex_id`, distinct snapshot dates, `MAX(snapshot_date)`, last `etl_runs` of kind `full`/`delta` |
| Sets list | `listSets()` | `SELECT s.*, (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) AS card_count FROM sets s ORDER BY release_date DESC, id` |
| any write | — | **none** — the api writes user-facing tables only, and search writes nothing |

## Interfaces

**`packages/shared/src/search/query.ts`** — the full field list, with types and defaults.

```ts
export const SORTS = ["relevance", "release_date", "name", "hp", "price_desc", "price_asc", "number"] as const;
export type Sort = (typeof SORTS)[number];
export const DEFAULT_RELEASE_FROM = "2021-01-01";
export const ENERGY_TYPES = ["Grass","Fire","Water","Lightning","Psychic","Fighting",
  "Darkness","Metal","Fairy","Dragon","Colorless"] as const;

export const SearchQuerySchema = z.object({
  // free text
  text:                 z.string().trim().min(1).nullable().default(null),
  // identity
  name:                 z.string().trim().min(1).nullable().default(null),
  supertype:            z.string().trim().min(1).nullable().default(null),   // 'Pokémon' | 'Trainer' | 'Energy'
  stage:                z.string().trim().min(1).nullable().default(null),   // 'Basic' | 'Stage 1' | 'Stage 2' | …
  subtypes:             z.array(z.string()).default([]),
  types:                z.array(z.string()).default([]),
  // provenance
  set_ids:              z.array(z.string()).default([]),
  set_name:             z.string().trim().min(1).nullable().default(null),   // resolved into set_ids
  series:               z.array(z.string()).default([]),
  rarity:               z.array(z.string()).default([]),                     // substring match, OR-ed
  regulation_marks:     z.array(z.string()).default([]),
  artist:               z.string().trim().min(1).nullable().default(null),
  national_dex:         z.array(z.number().int().positive()).default([]),
  // legality
  legal_standard:       z.boolean().nullable().default(null),
  legal_expanded:       z.boolean().nullable().default(null),
  // numbers
  hp_min:               z.number().int().min(0).nullable().default(null),
  hp_max:               z.number().int().min(0).nullable().default(null),
  retreat_min:          z.number().int().min(0).nullable().default(null),
  retreat_max:          z.number().int().min(0).nullable().default(null),
  // attacks
  attack_name:          z.string().trim().min(1).nullable().default(null),
  attack_text:          z.string().trim().min(1).nullable().default(null),
  attack_cost_min:      z.number().int().min(0).nullable().default(null),
  attack_cost_max:      z.number().int().min(0).nullable().default(null),
  attack_damage_min:    z.number().int().min(0).nullable().default(null),
  attack_damage_max:    z.number().int().min(0).nullable().default(null),
  attack_energy_types:  z.array(z.string()).default([]),
  // abilities
  ability_name:         z.string().trim().min(1).nullable().default(null),
  ability_text:         z.string().trim().min(1).nullable().default(null),
  has_ability:          z.boolean().nullable().default(null),
  // relations
  weakness_type:        z.string().trim().min(1).nullable().default(null),
  resistance_type:      z.string().trim().min(1).nullable().default(null),
  evolves_from:         z.string().trim().min(1).nullable().default(null),
  // window
  release_from:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(DEFAULT_RELEASE_FROM),
  release_to:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  price_min_usd:        z.number().nonnegative().nullable().default(null),
  price_max_usd:        z.number().nonnegative().nullable().default(null),
  // presentation
  sort:                 z.enum(SORTS).default("relevance"),
  page:                 z.number().int().min(1).default(1),
  page_size:            z.number().int().min(1).max(200).default(24),
}).strict();

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export const SEARCH_QUERY_DEFAULTS: SearchQuery = SearchQuerySchema.parse({});
export function activeFilters(q: SearchQuery): Partial<SearchQuery>;   // diff vs defaults, minus page/page_size/sort
export function isEmptyQuery(q: SearchQuery): boolean;                 // activeFilters(q) has no key and text is null
```

`national_dex` is present in the legacy model and in the legacy URL bucket list; it is kept here so the parser's "Pokédex #25" chip has a field to write into.

**`apps/api/src/search/sql.ts`**

```ts
export interface BuiltSearchSql { items: string; count: string; params: SqlValue[]; }
export function buildSearchSql(q: SearchQuery, opts?: { useOr?: boolean }): BuiltSearchSql;
```

`items` selects `c.id, c.name, c.set_id, s.name AS set_name, c.number, c.supertype, c.subtypes_json, c.types_json, c.hp, c.stage, c.rarity, c.regulation_mark, c.release_date, c.img_small, c.img_webp_low, c.img_large, c.img_webp_high, m.market_usd, c.tcgdex_legal_standard, c.legal_standard` — the exact tile payload of [S02.T12](T12-web-search-page.md), so no second query is needed to render a result.

**`ORDER BY` map** (`num(c.number)` = the dialect module's `numericOrder`):

| `sort` | with free text | without |
|---|---|---|
| `relevance` | `f.rank ASC, c.release_date DESC, num(c.number), c.id` | `c.release_date DESC, c.set_id, num(c.number), c.id` |
| `release_date` | `c.release_date DESC, c.set_id, num(c.number), c.id` | same |
| `name` | `c.name_norm ASC, c.release_date DESC, c.id` | same |
| `hp` | `c.hp DESC NULLS LAST, c.name_norm, c.id` | same |
| `price_desc` | `m.market_usd DESC NULLS LAST, c.name_norm, c.id` | same |
| `price_asc` | `m.market_usd ASC NULLS LAST, c.name_norm, c.id` | same |
| `number` | `c.set_id, num(c.number), c.id` | same |

**`apps/api/src/search/service.ts`**

```ts
export interface SearchResult<T = CardListItem> {
  total: number; page: number; page_size: number; pages: number;
  items: T[]; usedOrFallback: boolean; query: SearchQuery;
}
export function search(db: Db, q: SearchQuery): SearchResult;
export function resolveSetName(db: Db, setName: string): string[];   // [] -> caller uses ['__none__']
export function getCard(db: Db, id: string): CardDetail | null;
export function getPriceHistory(db: Db, id: string, days?: number): PriceHistoryRow[];  // default 90, max 3650
export function facets(db: Db): Facets;          // memoized 10 min
export function stats(db: Db): Stats;
export function listSets(db: Db): SetListRow[];
export interface Facets { types: string[]; subtypes: string[]; supertypes: string[]; rarities: string[];
  regulation_marks: string[]; series: string[]; stages: string[]; artists: string[]; }
```

`pages = max(1, ceil(total / page_size))`. `getCard` returns the card row with `*_json` columns parsed, `set_name`/`series`/`ptcgo_code`/`symbol_url`/`logo_url` from the set, `attacks`/`abilities` ordered by `idx` with `cost` parsed, `weaknesses`, `resistances`, `prices` from `cards_latest_price` ordered by `(source, variant)`, and `price_history_days = COUNT(DISTINCT snapshot_date)`.

**Word-wise `LIKE`.** `attack_text`/`ability_text`/`attack_name`/`ability_name` split the normalized value on whitespace, drop words of length ≤ 1, and AND one `LIKE '%word%'` per remaining word against the `*_norm` column. `"discard energy"` therefore matches "Discard an Energy from this Pokémon" — the legacy behaviour, preserved because the natural-language parser produces exactly these phrases.

## Implementation steps

1. Replace the `@pokesearch/shared/search` placeholder with the schema above, plus `SEARCH_QUERY_DEFAULTS`, `activeFilters`, `isEmptyQuery` and the regenerated JSON Schema; spec defaults and the `page_size` cap (BR-S02.T09-05, -10).
2. Write `buildSearchSql` for the base relation, pagination and the simple scalar filters, with the parameter-order assertion (BR-S02.T09-01, -09).
3. Add the JSON-array filters through the dialect module, and the rarity/regulation/artist forms.
4. Add the attack and ability `EXISTS` blocks with word-wise `LIKE`, plus `has_ability` (BR-S02.T09-02).
5. Add legality, release window, price window and `retreat_max`'s implied supertype (BR-S02.T09-03, -04, -08).
6. Add the `ORDER BY` map with the `c.id` tiebreak and `numericOrder`; spec every sort and the page-disjointness property (BR-S02.T09-11).
7. Write `service.search()` with set-name resolution and the OR fallback (BR-S02.T09-06, -07).
8. Write `getCard`, `getPriceHistory`, `listSets`, `stats`, and `facets` with the memo (BR-S02.T09-12).
9. Port `pokemon/tests/test_search.py` case by case onto the shared fixtures, plus the new cases listed in Acceptance.
10. Measure `EXPLAIN QUERY PLAN` for the three heaviest shapes (free text + filters; price sort; `has_ability=false`) on the full database and record the plans and timings in `apps/api/src/search/NOTES.md`.

## Edge cases and error handling

- **`page_size = 999`.** The schema rejects it; [S02.T11](T11-api-cards-search-sets.md) turns the zod issue into a 400 with the field path. No clamping, because silently returning 200 rows for a request for 999 is a lie the client cannot detect.
- **`page` beyond the last page.** Valid: the query returns zero items with the true `total` and `pages`, and the UI shows "page 9 of 3" with a link back. Better than an error, because a stale bookmark is common.
- **A free-text phrase with no usable token** (`"!!"`). `buildMatch` returns `null` ([S02.T08](T08-full-text-search.md)), the FTS join is omitted, `sort: relevance` degrades to `release_date DESC`, and the structured filters still apply.
- **A single-token text with zero results.** No OR fallback (there is nothing to loosen); `usedOrFallback` stays false and the UI shows the empty state (BR-S02.T09-06).
- **`set_name` matches nothing** (`set_name=Nonexistent`). `resolveSetName` returns `[]`, the service substitutes `['__none__']`, and the result is empty — not the whole database, which is what dropping the filter would do (BR-S02.T09-07).
- **`set_name` matches several sets** (`set_name=sv` matching by name substring). All matching ids are used; the chip shows the resolved count so the user can narrow it.
- **A card with no prices and `sort=price_asc`.** The `LEFT JOIN` keeps it; `NULLS LAST` puts it after every priced card. With `price_max_usd` set, it is excluded — a filter on a missing value cannot pass.
- **`hp_min > hp_max`** (or any inverted range). Accepted by the schema and returns zero rows; the UI is responsible for not producing it. Adding a refinement would reject a legitimate probing query and complicate the parser's output.
- **`retreat_max=0` on a Trainer search.** The implied `supertype = 'Pokémon'` wins, so `supertype=Trainer` plus `retreat_max=0` returns nothing — correct, and the chip list shows both filters so the contradiction is visible.
- **An apostrophe or `%` in `name`.** Bound as a parameter; `%` and `_` are *not* escaped, so `name=%` matches everything — documented, and harmless because it is a user-visible filter, not an injection.
- **`getPriceHistory(id, days=100000)`.** `days` is clamped by the schema to ≤ 3650; the card page asks for 730 ([S02.T13](T13-web-card-detail-page.md)).
- **`facets()` on an empty database.** Returns eight empty arrays; the search page renders its filter groups collapsed rather than crashing.
- **The FTS index is stale or empty** (a load ran without `etl fts`). Free-text searches return nothing while filters still work; `stats()` exposes the `cards_fts` row count so the cause is visible, and `etl fts` fixes it.

## Acceptance / verification

- [ ] `search.spec.ts` ports every case of `pokemon/tests/test_search.py` against the shared fixtures and passes: `default release filter`, `fts heal`, `attack damage and text` (including the zero-result cross-attack case), `types + hp`, `trainer stadium legal`, `retreat free`, `has_ability` both ways, `or fallback`, `get_card`, `facets` (BR-S02.T09-02, -03, -04, -06, -08).
- [ ] `search-query.spec.ts > page_size 999 fails parsing` and `> page 0 fails parsing` (BR-S02.T09-05).
- [ ] `> activeFilters` green: `{}` → `{}`; `{types:['Fire']}` → one key; `{release_from:'2021-01-01'}` → `{}`; `{page_size:96}` → `{}` (BR-S02.T09-10).
- [ ] `sql.spec.ts > every sort value executes` — all seven sorts run against the fixture database without error (BR-S02.T09-11).
- [ ] `> page 1 and page 2 are disjoint` for each sort on a 30-row fixture with ties in the sort key (BR-S02.T09-11).
- [ ] `> items and count consume the same params` for a query setting every filter at once (BR-S02.T09-09).
- [ ] `> no predicate embeds a value`: for a query with `name="O'Hara"`, `hp_min=200`, the generated SQL contains neither `O'Hara` nor `200`, and the search still returns the right rows (BR-S02.T09-01).
- [ ] `> unknown set_name returns 0 rows, not everything` (BR-S02.T09-07).
- [ ] `facets.spec.ts > second call does not query` (a counting `Db` wrapper) and `> a new card invalidates the cache` (BR-S02.T09-12).
- [ ] On the full database, a free-text + filter query at `page_size=24` returns in under 150 ms, and `EXPLAIN QUERY PLAN` shows index use on `cards_release_date_idx` or `cards_name_norm_idx` for the non-text shapes; the plans are recorded in `apps/api/src/search/NOTES.md`.

## Risks and open questions

- **Risk — a ported filter differs subtly from the legacy** (a missing `lower()`, an `OR` where the legacy had `AND`). Mitigation: the legacy tests are ported verbatim and the semantics that matter are business rules with named tests; the filter table above is the checklist.
- **Risk — `json_each` filters do not use an index** and scan 20.4k rows. Acceptable at this size (the legacy did the same interactively), and the step is measured in acceptance. Postgres gets a GIN index on `jsonb` ([S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)).
- **Risk — `activeFilters` drifts from the schema** when a field is added. Mitigation: it diffs against `SearchQuerySchema.parse({})` rather than a hand-written default object, so a new field is covered automatically.
- **Risk — the facets memo serves stale values after an ETL run in another process.** Mitigation: the cache key includes `MAX(cards.updated_at)`, which the loader moves; the worst case is one stale read within 10 minutes for an unchanged database.
- **Question — should `hp_min > hp_max` be a validation error?** Specified as *accepted, returns zero rows*. Recommendation: keep it permissive so the natural-language parser never produces an invalid query; revisit if users report confusion, in which case the UI warns rather than the schema rejects.
- **Question — should `rarity` be exact-match instead of substring?** The legacy uses substring so "Rare" matches "Double Rare" and "Illustration Rare", which is what the parser's eleven rarity patterns assume. Recommendation: keep substring and expose exact rarities in the facet list; the user decides if the facet checkboxes should switch to exact matching in [S02.T12](T12-web-search-page.md).
- **DEPENDENCY-PROPOSAL:** `search()`, `facets()` and `stats()` read `cards_market_usd`, `cards_latest_price` and `price_history`, which are populated by [S02.T07](T07-prices-snapshot.md); today S02.T09 depends only on S01.T05, S02.T05 and S02.T08. The tables exist from the 0002 migration, so the build compiles and the tests pass with empty price tables — but the price sorts and the `price_*` filters are only meaningful once S02.T07 has run. Consider adding `S02.T07` to this file's `Depends on` (and `S02.T09` to S02.T07's `Unblocks`), or state explicitly in Inputs that empty price tables are an accepted partial input.

## References

- `pokemon/src/pokesearch/search/filters.py` — verified (246 lines): the pydantic `SearchQuery` with `release_from` defaulting to `config.DEFAULT_RELEASE_FROM = '2021-01-01'` and `page_size` `ge=1, le=200`; `_like_words` (words longer than one character, AND-ed `LIKE`); `_json_has` (`EXISTS (SELECT 1 FROM json_each(col) WHERE lower(value) IN (…))`); the single `EXISTS … FROM attacks a` holding every attack predicate; `COALESCE(c.tcgdex_legal_standard, c.legal_standard = 'Legal') = ?`; `COALESCE(c.retreat_cost, 0) <= ? AND c.supertype = 'Pokémon'`; the seven-entry `order` map and the `SELECT` list this subtask reuses; `active_filters()` skipping `page`, `page_size`, `sort`.
- `pokemon/src/pokesearch/search/service.py` — verified (129 lines): `resolve_set_name` (`lower(id) = ? OR lower(ptcgo_code) = ? OR lower(name) LIKE ?`) with the `['__none__']` sentinel; the OR fallback condition `total == 0 and q.text and len(fts.tokens(q.text)) > 1` with `used_or = total > 0`; `get_card` expanding `*_json`, ordering children by `idx` and adding `prices` and `price_history_days`; `get_price_history(days=90)`; `facets()` with the 300-artist limit; `list_sets()` with `card_count`; `stats()`.
- `pokemon/tests/test_search.py` — verified (118 lines): the fixture set/cards and the twelve cases ported in Acceptance, including `test_or_fallback` (`'paralyzed unicorn'`) and `test_nl_end_to_end` (four phrases).
- [S02.T08](T08-full-text-search.md) — `buildMatch`, `tokens`, `rankExpr` and the ascending-bm25 rule; [S02.T05](T05-cards-schema-migration.md) — the columns and indexes every predicate relies on; [S01.T05](../01-foundation/T05-shared-contracts-package.md) — where the contract lives and how its JSON Schema is exported.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
