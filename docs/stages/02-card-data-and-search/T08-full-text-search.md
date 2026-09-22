# S02.T08 — Full-text search index and query builder

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 8 / 14 |
| Depends on | [S02.T05](T05-cards-schema-migration.md), [S02.T06](T06-load-cards.md) |
| Unblocks | [S02.T09](T09-search-query-model-and-sql.md), [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) |
| Parallel with | [S02.T07](T07-prices-snapshot.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `cards_fts` (FTS5) — from [S02.T05](T05-cards-schema-migration.md)
- `table` populated `cards`, `attacks`, `abilities` — from [S02.T06](T06-load-cards.md)
- `file` `pokemon/src/pokesearch/search/fts.py` and `pokemon/src/pokesearch/etl/load.py::rebuild_fts` — the token rules, the `"tok"*` syntax and the repopulation SQL; read-only reference

## Outputs (proposed)
- `module` `db/dialect/sqlite/fts.ts` — `rebuildFts(db)` (wipe + repopulate from cards/attacks/abilities/rules + `optimize`), `buildMatch(text, { or, columns }) → string`, `rankExpr` = `bm25(cards_fts, 0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5)` — consumed by [S02.T09](T09-search-query-model-and-sql.md), [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)
- `doc` `db/dialect/README.md` — the dialect module contract and the Postgres counterpart design (`tsvector` with weights A/B/C/D, `websearch_to_tsquery`, prefix `:*`) — consumed by [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)
- `script` `etl fts` subcommand wiring

## Initial objective
Free text (English card wording, after pt→en translation) ranks cards by relevance with name matches first, supports prefix and column-restricted matching, and lives behind one module so the Postgres path replaces it without touching the search service.

## Context

Free text is one of two inputs to the search ([S02.T09](T09-search-query-model-and-sql.md)); the other is the structured filter set. It carries the part of a phrase the natural-language parser could not turn into a filter — the residual, translated pt→en because card text is English ([S02.T10](T10-natural-language-parser.md)). "cura banco" becomes `heal bench`, which must find *Healing Rain* ("heal 30 damage from each of your Pokémon") without also drowning it in every card whose flavour text says "bench".

That is what the weights do. The `cards_fts` column order fixed by [S02.T05](T05-cards-schema-migration.md) is `card_id, name, attack_names, attack_text, ability_names, ability_text, rules, flavor`, and `bm25()` takes one weight per column in that order: `0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5`. A name hit outranks an attack-name hit, which outranks body text, which outranks a rule box, which outranks flavour. `bm25()` in SQLite returns a *negative* score where more negative is better, so the sort is `ASC` — a detail that is easy to invert and produces plausible-looking nonsense.

D-002 makes this the SQLite-only corner of search, so it lives behind the dialect module: business code receives `rankExpr` and a `MATCH` fragment, never FTS5 syntax. The Postgres counterpart (a generated `tsvector` with weights A/B/C/D plus GIN) is designed here and implemented in [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md), which is why `db/dialect/README.md` is an output of this subtask rather than of that one.

The index is standalone, not external-content, and is rebuilt wholesale after each load — the legacy choice, and still the right one: a full rebuild over 20.4k cards is seconds, there are no triggers to keep correct, and the load path ([S02.T06](T06-load-cards.md)) already deletes and re-inserts children. The verified machine fact behind the performance claim: a bm25 query over a 487 MB legacy database answered in 16 ms.

## Scope

- **In scope.** `packages/db/src/dialect/sqlite/fts.ts`: `rebuildFts`, `buildMatch`, `tokens`, `rankExpr`, `ftsColumnOrder()` and the startup assertion that the physical column order matches the weights; the `etl fts` subcommand; `packages/db/src/dialect/README.md` with the contract and the Postgres design; the row-count invariant check.
- **Out of scope.** The `cards_fts` DDL ([S02.T05](T05-cards-schema-migration.md)); the WHERE clause, filters, sorts and the OR fallback decision ([S02.T09](T09-search-query-model-and-sql.md)); pt→en translation ([S02.T10](T10-natural-language-parser.md)); the Postgres implementation ([S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)); highlighting or snippets — not a product requirement today.

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T08-01 | After `rebuildFts`, `cards_fts` has exactly one row per `cards` row, and the step fails if it does not. | the post-condition check at the end of `rebuildFts` | `fts.spec.ts > row count equals cards count`; the step throws when a card is missing |
| BR-S02.T08-02 | `tokens(text)` = strip diacritics → lower → `[a-z0-9]+`, keeping tokens of length ≥ 2 or a single digit; everything else is discarded. | `tokens()` sharing `norm()` from [S02.T06](T06-load-cards.md) | `fts.spec.ts > tokens table`: `'cura banco'→['cura','banco']`, `'Pokémon V'→['pokemon']`, `'120+'→['120']`, `'a 3'→['3']`, `''→[]` |
| BR-S02.T08-03 | `buildMatch` produces `"tok"*` per token, AND-joined by default and OR-joined when `or: true`; it returns `null` when there is no usable token, and the caller then omits the FTS join entirely. | `buildMatch()` return type `string \| null` | `fts.spec.ts > buildMatch`: `'cura banco' → '"cura"* "banco"*'`; `{or:true}` → `'"cura"* OR "banco"*'`; `'!!' → null` |
| BR-S02.T08-04 | Every token is double-quoted before the `*`, so no user input can be read as FTS5 syntax (`OR`, `NEAR`, `-`, `^`, `:`, `(`). | the quoting in `buildMatch`, plus rejection of a token containing `"` (impossible after tokenization) | `fts.spec.ts > injection attempts`: `'a OR b'`, `'NEAR(x y)'`, `'name:foo'` all become literal quoted tokens and raise no FTS5 syntax error |
| BR-S02.T08-05 | A column-restricted match uses `{col1 col2}: (...)` with column names validated against the declared column list; an unknown column throws before the query is built. | `assertColumns()` against `FTS_COLUMNS` | `fts.spec.ts > unknown column throws`; `> {name attack_text}: ("heal"*)` is produced verbatim |
| BR-S02.T08-06 | `rankExpr` is `bm25(cards_fts, 0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5)` and is always sorted **ascending** (more negative = more relevant). | the single exported constant plus a comment; [S02.T09](T09-search-query-model-and-sql.md) uses `ORDER BY f.rank ASC` | `fts.spec.ts > a name match ranks before a flavor-only match` for the same term |
| BR-S02.T08-07 | The weights are bound to the physical column order: `rebuildFts` and the query builder both call `ftsColumnOrder(db)` once and throw if it differs from the declared order. | `assertFtsColumnOrder()` run at module init | `fts.spec.ts > reordered columns throw at init` (a temp DB with a permuted virtual table) |
| BR-S02.T08-08 | No SQL outside `packages/db/src/dialect/` mentions `cards_fts`, `MATCH` or `bm25`. | eslint `no-restricted-syntax` on string literals in `apps/*` and `packages/etl` | `pnpm lint` fails on a fixture using `cards_fts MATCH` in `apps/api` |
| BR-S02.T08-09 | The rebuild runs in one transaction and ends with `INSERT INTO cards_fts(cards_fts) VALUES('optimize')` outside it; a failed rebuild leaves the previous index intact. | `db.transaction(...)` around delete+insert; `optimize` after commit | `fts.spec.ts > a failing rebuild leaves the old index queryable` |

## Data operations

**Writes** (the index is a baseline artifact of the ETL):

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `cards_fts` | D then C | etl | end of `etl full` / `etl delta`, and on `etl fts` | full wipe + one `INSERT … SELECT`; running it twice yields the same content | ≈20.4k rows |
| `cards_fts` | U (maintenance) | etl | right after the rebuild, outside the transaction | `INSERT INTO cards_fts(cards_fts) VALUES('optimize')` | merges the b-tree segments; makes later queries faster |
| `cards`, `attacks`, `abilities` | R | etl | during the rebuild | read-only | source of the eight columns |
| `etl_runs.stats_json` | U | etl | end of the step | flat counters | `fts_rows`, `fts_ms` |
| `cards_fts` | R | api | every free-text search | read-only, `MATCH` + `bm25` | [S02.T09](T09-search-query-model-and-sql.md) |

**Reads** — what an input produces:

| Read operation | Input | SQL / expression produced |
|---|---|---|
| Default free-text match | `text = "heal bench"` | `MATCH` argument `"heal"* "bench"*` (implicit AND) |
| OR fallback (driven by [S02.T09](T09-search-query-model-and-sql.md)) | `text = "paralyzed unicorn"`, `or: true` | `"paralyzed"* OR "unicorn"*` |
| Prefix match | `text = "charizar"` | `"charizar"*` — matches *Charizard*, *Charizard ex* |
| Column-restricted match | `text = "heal"`, `columns: ["name","attack_text"]` | `{name attack_text}: ("heal"*)` |
| No usable token | `text = "!!"` or `""` | `null` — the caller omits the FTS join and ranks by `release_date DESC` |
| Ranked join (used by [S02.T09](T09-search-query-model-and-sql.md)) | any non-null match | `JOIN (SELECT card_id, bm25(cards_fts, 0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5) AS rank FROM cards_fts WHERE cards_fts MATCH ?) f ON f.card_id = c.id`, ordered `f.rank ASC` |
| Index health check | — | `SELECT (SELECT COUNT(*) FROM cards_fts) = (SELECT COUNT(*) FROM cards)` |

## Interfaces

**`packages/db/src/dialect/sqlite/fts.ts`**

```ts
export const FTS_COLUMNS = ["card_id", "name", "attack_names", "attack_text",
  "ability_names", "ability_text", "rules", "flavor"] as const;
export type FtsColumn = Exclude<(typeof FTS_COLUMNS)[number], "card_id">;

export const BM25_WEIGHTS = [0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5] as const;   // one per FTS_COLUMNS entry
export const rankExpr = `bm25(cards_fts, ${BM25_WEIGHTS.join(", ")})`;          // sort ASC

export function tokens(text: string | null | undefined): string[];
export function buildMatch(text: string | null | undefined,
  opts?: { or?: boolean; columns?: FtsColumn[] }): string | null;
export function rebuildFts(db: Db, onProgress?: (rows: number) => void): { rows: number; ms: number };
export function ftsColumnOrder(db: Db): string[];        // parsed from sqlite_master
export function assertFtsColumnOrder(db: Db): void;      // throws FtsSchemaError
export function ftsRowCountMatches(db: Db): boolean;
export class FtsSchemaError extends Error { expected: string[]; actual: string[]; }
```

**`rebuildFts` SQL.** One transaction:

```sql
DELETE FROM cards_fts;
INSERT INTO cards_fts (card_id, name, attack_names, attack_text, ability_names, ability_text, rules, flavor)
SELECT c.id,
       c.name,
       (SELECT group_concat(a.name, ' | ' ORDER BY a.idx) FROM attacks   a WHERE a.card_id = c.id),
       (SELECT group_concat(a.text, ' | ' ORDER BY a.idx) FROM attacks   a WHERE a.card_id = c.id AND a.text IS NOT NULL),
       (SELECT group_concat(b.name, ' | ' ORDER BY b.idx) FROM abilities b WHERE b.card_id = c.id),
       (SELECT group_concat(b.text, ' | ' ORDER BY b.idx) FROM abilities b WHERE b.card_id = c.id AND b.text IS NOT NULL),
       (SELECT group_concat(j.value, ' | ') FROM json_each(c.rules_json) j),
       c.flavor_text
FROM cards c;
```

Then, after the commit: `INSERT INTO cards_fts(cards_fts) VALUES('optimize');`. The `ORDER BY` inside `group_concat` is an addition to the legacy statement — aggregate `ORDER BY` is available from SQLite 3.44 and this machine ships 3.50.4 (verified) — and it makes the rebuild deterministic, so two rebuilds produce byte-identical index content.

`json_each` and `group_concat` are dialect-specific, which is exactly why this statement lives in the dialect module and is tagged in the [S02.T05](T05-cards-schema-migration.md) migration note.

**`db/dialect/README.md` — outline.** (1) What the dialect module is for: every SQLite-only construct behind a named function, so business code is portable by construction. (2) The `Dialect` interface from [S01.T02](../01-foundation/T02-sqlite-database-client.md) (`jsonArrayElements`, `jsonContains`, `fullTextMatch`, `rank`, `upsert`, `nowUtc`, `numericOrder`) plus the FTS additions (`buildMatch`, `rankExpr`, `rebuildFts`). (3) The SQLite implementation: FTS5 standalone table, `unicode61 remove_diacritics 2`, `"tok"*` prefix queries, bm25 negative-ascending. (4) **The Postgres counterpart**: a generated column `cards.search_tsv tsvector` = `setweight(to_tsvector('english', name),'A') || setweight(…attack_names, ability_names…,'B') || setweight(…attack_text, ability_text, rules…,'C') || setweight(…flavor…,'D')`, a GIN index on it, `websearch_to_tsquery('english', $1)` for the query and `:*` appended per lexeme for prefix behaviour, `ts_rank_cd(search_tsv, query)` sorted **descending** (the sign flip the adapter hides). (5) The weight mapping table SQLite ↔ Postgres and what is lost (bm25's per-column numeric weights become four discrete classes; `remove_diacritics 2` becomes `unaccent`). (6) The rebuild story: SQLite rebuilds an index, Postgres updates a generated column, so `rebuildFts` becomes a no-op there. (7) The rule that a new dialect divergence adds a row to `PORTABILITY.md` §7.

**`etl fts`.** `etl fts [--json]` → `withRun(db, "fts", () => rebuildFts(db))`; also called as the penultimate step of `etl full` / `etl delta`, before the price snapshot.

## Implementation steps

1. Write `tokens()` on top of `norm()` and spec the table (BR-S02.T08-02).
2. Write `buildMatch()` with quoting, AND/OR joining, the `null` case and the column filter; spec the injection cases (BR-S02.T08-03, -04, -05).
3. Add `FTS_COLUMNS`, `BM25_WEIGHTS`, `rankExpr`, `ftsColumnOrder()` and `assertFtsColumnOrder()`; spec the permuted-table failure (BR-S02.T08-07).
4. Write `rebuildFts()` with the statement above, the transaction boundary, the post-condition row-count check and the `optimize` call (BR-S02.T08-01, -09).
5. Spec relevance on the fixture set: the same term in a name outranks the same term in flavour text (BR-S02.T08-06).
6. Wire `etl fts` and the `etl full` step; feed `fts_rows` and `fts_ms` into `run.add`.
7. Add the eslint restriction that keeps `cards_fts`/`MATCH`/`bm25` inside the dialect folder (BR-S02.T08-08).
8. Write `db/dialect/README.md` following the outline, including the weight-mapping table.
9. Rebuild against the full database and record rows, wall time and a sample query latency in `packages/db/README.md`.

## Edge cases and error handling

- **A phrase with no recognized token** (`"!!"`, `"a"`, `""`). `buildMatch` returns `null`; [S02.T09](T09-search-query-model-and-sql.md) omits the FTS join and the query degrades to the structured filters with the default `release_date DESC` sort — not to an empty result.
- **A single-character digit** (`"3"`). Kept, because `t.length >= 2 || /^\d$/.test(t)`: "3 energias" must still find `3`-cost attacks through the structured filter while the residual keeps the digit.
- **A user types FTS5 syntax** (`"a OR b"`, `"NEAR(heal bench)"`, `"name:foo"`). Tokenization drops the punctuation and each word is quoted, so the query is `"a"* "or"* "b"*` — literal, no syntax error, no injection (BR-S02.T08-04).
- **Prefix query `"charizar"`.** Produces `"charizar"*`, which matches *Charizard*, *Charizard ex* and *Charizard VMAX*. A *suffix* query (`"izard"`) matches nothing: FTS5 has no suffix operator, and the search page says so rather than pretending.
- **Accented input** (`"pokémon"`). `tokens()` strips the diacritic and the table is declared `remove_diacritics 2`, so index and query agree; a query built without `norm()` would silently miss.
- **A card with no attacks and no abilities** (most Trainers). The three subselects yield NULL, the row still exists with `name`, `rules` and `flavor` populated — which is why the row-count invariant is per card, not per non-empty column.
- **`rules_json` is NULL.** `json_each(NULL)` yields no rows, so `group_concat` returns NULL; no error, and the column is simply empty.
- **The rebuild fails halfway** (disk full, lock). The transaction rolls back, the previous index is still queryable and the run closes as `error`; a stale index is better than an empty one (BR-S02.T08-09).
- **`cards_fts` and `cards` counts diverge** (someone inserted a card without rebuilding). `ftsRowCountMatches(db)` is false; `etl status` and the api `/health` surface it, and `etl fts` fixes it in seconds.
- **Someone reorders the virtual table's columns in a future migration.** `assertFtsColumnOrder` throws at module init with the expected and actual lists, instead of silently reweighting every search (BR-S02.T08-07).

## Acceptance / verification

- [ ] `fts.spec.ts > tokens table` green: `'cura banco'→['cura','banco']`, `'Pokémon V'→['pokemon']`, `'120+'→['120']`, `'a 3'→['3']`, `''→[]` (BR-S02.T08-02).
- [ ] `> buildMatch` green: `'cura banco' → '"cura"* "banco"*'`; `{ or: true } → '"cura"* OR "banco"*'`; `{ columns: ["name","attack_text"] } → '{name attack_text}: ("cura"* "banco"*)'`; `'!!' → null` (BR-S02.T08-03, -05).
- [ ] `> injection attempts` green: `'a OR b'`, `'NEAR(x y)'` and `'name:foo'` all execute against the fixture index without an FTS5 error (BR-S02.T08-04).
- [ ] `> unknown column throws` for `columns: ["nope"]` (BR-S02.T08-05).
- [ ] `rebuildFts` on the fixture database: `SELECT COUNT(*) FROM cards_fts` equals `SELECT COUNT(*) FROM cards`, and running it twice produces identical column contents (BR-S02.T08-01).
- [ ] `> heal bench` on the fixture set returns the card whose ability text contains both stems, and a name match for the same term ranks before a flavour-only match (BR-S02.T08-06).
- [ ] `> prefix query 'charizar' matches Charizard printings` on the real database (or a fixture containing two Charizard rows).
- [ ] `> a failing rebuild leaves the old index queryable` — an injected error after `DELETE` rolls back and a `MATCH` still returns the previous rows (BR-S02.T08-09).
- [ ] `> reordered columns throw at init` against a temp database with a permuted virtual table (BR-S02.T08-07).
- [ ] `pnpm lint` fails on a fixture containing `cards_fts MATCH` in `apps/api/src` (BR-S02.T08-08).
- [ ] On the full database, `pnpm etl fts` finishes in under 60 s and a `MATCH` + `bm25` query returns in tens of milliseconds (reference point: 16 ms over a 487 MB legacy database on this machine).

## Risks and open questions

- **Risk — bm25's sign is inverted somewhere.** Results would look random but plausible. Mitigation: `rankExpr` is a single constant with the `ASC` rule in its comment, and the relevance spec (name before flavour) fails loudly if the sort flips.
- **Risk — the weights drift from the column order.** Mitigation: `assertFtsColumnOrder` at init (BR-S02.T08-07) and the contract note in the [S02.T05](T05-cards-schema-migration.md) migration header.
- **Risk — `remove_diacritics 2` and `norm()` disagree.** `remove_diacritics 2` removes diacritics from all scripts; `norm()` strips `\p{Mn}` after NFD. They agree for Latin text; a future non-Latin source would need re-checking. Recorded, not solved.
- **Risk — the standalone index doubles the text on disk.** ≈20.4k cards of text indexed twice is tens of megabytes, acceptable for a local file. An external-content table would halve it at the cost of triggers; not worth it while the rebuild is seconds.
- **Question — should `rebuildFts` become incremental for `etl delta`** (delete + re-insert only the changed sets' cards)? Recommendation: measure the full rebuild first; if it stays under a minute, keep it whole — partial rebuilds are where index/table divergence comes from. Decide with [S08.T01](../08-operations-and-extensions/T01-scheduler.md) if the nightly job's duration becomes a problem.
- **Question — index the set name and the `ptcgo_code` as a ninth column?** It would let "surging sparks charizard" work as one phrase. Recommendation: no — `set_name` is a structured filter resolved by [S02.T09](T09-search-query-model-and-sql.md), and adding a column changes the bm25 arity. Revisit only with a user complaint.

## References

- `pokemon/src/pokesearch/search/fts.py` — verified (26 lines): `_TOKEN_RE = re.compile(r"[a-z0-9]+")`; `tokens()` keeping `len(t) >= 2 or t.isdigit()` after `unidecode(...).lower()`; `build_match()` producing `f'"{t}"*'` joined by `" "` or `" OR "`, with the optional `"{" + " ".join(columns) + "}: (" + expr + ")"` wrapper. Consult for the token rules and the match syntax.
- `pokemon/src/pokesearch/etl/load.py::rebuild_fts` — verified: `DELETE FROM cards_fts` then the `INSERT … SELECT` with four `group_concat(..., ' | ')` subselects (attack text and ability text filtered by `IS NOT NULL` in the attacks case), `group_concat(value, ' | ') FROM json_each(c.rules_json)` for rules and `c.flavor_text`, followed by `INSERT INTO cards_fts(cards_fts) VALUES('optimize')`. Consult for the statement; the `ORDER BY` inside `group_concat` is this subtask's addition.
- `pokemon/src/pokesearch/search/filters.py` L94, L106 — verified: `_BM25_WEIGHTS = "0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5"` and the join `JOIN (SELECT card_id, bm25(cards_fts, …) AS rank FROM cards_fts WHERE cards_fts MATCH ?) f ON f.card_id = c.id`.
- `pokemon/src/pokesearch/db/schema.sql` L342–354 — verified: `cards_fts` declared as a standalone (not external-content) FTS5 table with `tokenize = 'unicode61 remove_diacritics 2'` and the comment that the ETL rebuilds it after the load.
- [S02.T05](T05-cards-schema-migration.md) — the column order the weights are bound to; [S01.T02](../01-foundation/T02-sqlite-database-client.md) — the `Dialect` interface and `PORTABILITY.md` §7 (the FTS5 → `tsvector` divergence row).
- [Decision log](../../project/02-decision-log.md) D-002 — the verified `node:sqlite` facts: SQLite 3.50.4 with `ENABLE_FTS5` and JSON1, `json_each` available, a bm25 query over a 487 MB database answered in 16 ms.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
