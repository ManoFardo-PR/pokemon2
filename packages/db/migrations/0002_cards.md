# 0002_cards.sql — design note

Companion note for `packages/db/migrations/0002_cards.sql` (subtask S02.T05). It records what this migration
does differently from the legacy schema, why `cards_market_usd` is a table, which columns are denormalized,
the bm25 column-order contract, and the measurement of the applied schema.

Reference for every "legacy" statement below: `pokemon/src/pokesearch/db/schema.sql` (read-only).

## 1. Deviations from the legacy schema

### D1 — `cards_market_usd` is a table, not a view

Legacy:

```sql
CREATE VIEW IF NOT EXISTS cards_market_usd AS
SELECT card_id, MIN(market) AS market_usd
FROM cards_latest_price
WHERE source = 'tcgplayer' AND market IS NOT NULL
GROUP BY card_id;
```

Here it is `CREATE TABLE cards_market_usd (card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
market_usd REAL NOT NULL, snapshot_date TEXT NOT NULL)` with an index on `market_usd` (BR-S02.T05-06).

Reason: every price sort and price filter joins it ([S02.T09](../../../docs/stages/02-card-data-and-search/T09-search-query-model-and-sql.md)),
and the legacy view re-aggregated `price_history` through `cards_latest_price` — itself a `MAX(snapshot_date)`
group-by join — on every query. As a table it is written once per price snapshot and read as an indexed join.
It also gains a `snapshot_date` column the view could not carry, so a consumer can tell how stale a price is.

Ownership: the ETL refreshes it after every price snapshot ([S02.T07](../../../docs/stages/02-card-data-and-search/T07-prices-snapshot.md));
`apps/api` never writes it, and `schema.spec.ts` asserts that (BR-S02.T05-06). The selection rule the legacy
view encoded (`MIN(market)` over tcgplayer variants) moves into that ETL step, not into this migration.
`@postgres:` counterpart: a materialized view over `cards_latest_price`, refreshed by the same ETL step.

`cards_latest_price` stays a view, and is portable as written.

### D2 — children have uniqueness constraints

Legacy `attacks` and `abilities` declare `idx INTEGER NOT NULL` with no unique index, and `weaknesses` /
`resistances` have no primary key at all, so a re-load could silently duplicate rows.

Here: `attacks_card_idx_uq` and `abilities_card_idx_uq` are `UNIQUE (card_id, idx)` (BR-S02.T05-03), and
`weaknesses` / `resistances` declare `PRIMARY KEY (card_id, type)` (BR-S02.T05-04) — a card has at most one
weakness and one resistance per energy type.

`attacks.id` / `abilities.id` are `INTEGER PRIMARY KEY` without `AUTOINCREMENT` (legacy had it on `attacks`):
the loader deletes and re-inserts children per card, so the surrogate ids are reused and are not stable
references. Nothing may store an `attacks.id`; [S05.T02](../../../docs/stages/05-card-rules-base/T02-effect-texts-and-card-parts.md)
keys card parts by `(card_id, kind, idx)` for exactly this reason.

### D3 — value domains are checked in the schema

Legacy had no `CHECK` constraints on these tables and allowed a third price source (`wjsutton`).

Here:

| Constraint | Effect |
|---|---|
| `CHECK (source IN ('tcgplayer', 'cardmarket'))` | only the two sources this project ingests |
| `CHECK (length(snapshot_date) = 10)` | `snapshot_date` is a `'YYYY-MM-DD'` day, never a timestamp |
| `CHECK (damage_mod IS NULL OR damage_mod IN ('+', '-', '×'))` | the loader must normalize `x` and `*` to `×` before insert |
| `CHECK (tcgdex_legal_standard IN (0, 1))`, same for `_expanded` | 0, 1 or NULL only — never `''` |
| `CHECK (idx >= 0)` | children are 0-based positions |
| `CHECK (hp IS NULL OR hp >= 0)`, `CHECK (retreat_cost IS NULL OR retreat_cost >= 0)` | no negative numerics |

The `tcgdex_legal_*` domain matters downstream: the legality filter is
`COALESCE(tcgdex_legal_standard, legal_standard = 'Legal')` ([S02.T09](../../../docs/stages/02-card-data-and-search/T09-search-query-model-and-sql.md)),
which only falls back correctly when an absent TCGdex document is NULL and never an empty string.

### D4 — `sets.name_norm`, and `updated_at` is mandatory

`sets` gains `name_norm TEXT NOT NULL` (legacy normalized card names only, not set names), so a join or lookup
on a set name is byte-exact the same way card names are. `sets.updated_at` and `cards.updated_at` are
`NOT NULL` here; legacy allowed NULL, which made "when was this row last loaded" unanswerable for old rows.

Smaller differences, for completeness: no `IF NOT EXISTS` anywhere (migrations must be exact and fail loudly —
`scripts/sql-lint.mjs` enforces it); indexes are renamed from the legacy `ix_<table>_<cols>` to the project's
`<table>_<cols>_idx` convention (`packages/db/MIGRATIONS.md`), with `_uq` for the unique ones; legacy
`etl_meta` is not carried over — `schema_migrations` and `etl_runs` from `0001_foundation.sql` replace it.

## 2. Normalized text columns (BR-S02.T05-09)

Six columns are normalized text: `sets.name_norm`, `cards.name_norm`, `attacks.name_norm`,
`attacks.text_norm`, `abilities.name_norm`, `abilities.text_norm`. Each carries a `BR-S02.T05-09` comment on
its definition line in the SQL.

They are written **only** through the shared `norm()` of [S02.T06](../../../docs/stages/02-card-data-and-search/T06-load-cards.md),
defined in `docs/project/04-data-model-overview.md`:

```
norm(s) = s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().trim(), internal whitespace collapsed to single spaces
```

The schema cannot enforce this — SQLite has no such function — so it is a loader contract, verified there by
`load.spec.ts > name_norm equals norm(name) for every fixture card`. Any other writer will silently break
every join and search that relies on normalized equality.

## 3. Denormalized columns

| Column | Copied from | Why |
|---|---|---|
| `cards.release_date` | `sets.release_date` | every search filters and sorts by release date; without the copy each query joins `sets` for a column that never changes after the set is loaded |
| `cards.legal_unlimited`, `legal_standard`, `legal_expanded` | the card's own `raw_ptcg_json.legalities` | kept as columns rather than read out of the JSON on every query, so the legality filter is an indexed column comparison |
| `cards.retreat_cost` | length of `retreat_json` (`convertedRetreatCost`) | numeric filter |
| `attacks.converted_cost` | length of `cost_json` (`convertedEnergyCost`) | numeric filter |
| `attacks.damage_num`, `damage_mod` | parsed from `damage_text` | damage-range filters; `damage_text` keeps the raw string (`'120+'`, `'30×'`, `'varies'`) and both parsed columns are NULL when it is not numeric |

All of them are derivations of `raw_ptcg_json` or `raw_tcgdex_json`, which are preserved verbatim and never
overwrite one another (RN-01). Every derived column can be rebuilt from the raw documents; the raw documents
can never be rebuilt from the derived columns.

## 4. bm25 column-order contract

`cards_fts` is declared in this order, and the order is part of the contract with
[S02.T08](../../../docs/stages/02-card-data-and-search/T08-full-text-search.md) and
[S02.T09](../../../docs/stages/02-card-data-and-search/T09-search-query-model-and-sql.md):

| Position | Column | bm25 weight |
|---|---|---|
| 0 | `card_id` (UNINDEXED) | 0 |
| 1 | `name` | 10.0 |
| 2 | `attack_names` | 6.0 |
| 3 | `attack_text` | 3.0 |
| 4 | `ability_names` | 6.0 |
| 5 | `ability_text` | 3.0 |
| 6 | `rules` | 2.0 |
| 7 | `flavor` | 0.5 |

`bm25()` takes one weight per column **in declaration order**, so reordering the columns silently reweights
every search — no error, just worse results. `schema.spec.ts > cards_fts columns follow the bm25 column-order
contract` pins the order, and the FTS module asserts it at startup.

The tokenizer is `unicode61 remove_diacritics 2`, so a query for `pokemon` matches a stored `Pokémon`.

This is the one SQLite-only object in the migration: it sits in a `-- @sqlite-only` / `-- @end` block preceded
by a `-- @postgres:` note naming its counterpart — a generated `tsvector` column on `cards` with weights
A (name), B (attack/ability names), C (attack/ability text, rules), D (flavor) plus a GIN index
(BR-S02.T05-07, `packages/db/PORTABILITY.md` §7). `pnpm check` fails if the tag is removed.

## 5. Measurement of the applied schema

Measured by applying `0001_foundation.sql` and then `0002_cards.sql` to an empty SQLite file
(`node:sqlite`, SQLite 3.50.4), with no rows inserted:

| Metric | Value |
|---|---|
| Database size after 0001 | 20 480 bytes |
| Database size after 0002 | 200 704 bytes |
| Objects in `sqlite_master` after 0002 | 16 tables, 1 view, 29 indexes |
| Named indexes on the 0002 tables | 21 |
| Named indexes on the 0001 tables | 2 (`etl_runs_kind_started_idx`, `etl_runs_running_idx`) |
| Implicit `sqlite_autoindex_*` | 6 (the `TEXT PRIMARY KEY` and composite primary keys) |

The 16 tables include the 5 FTS5 shadow tables (`cards_fts_data`, `_idx`, `_content`, `_docsize`, `_config`)
that `CREATE VIRTUAL TABLE` creates, plus `cards_fts` itself.

The 21 named indexes of this migration, as
`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex_%'` reports them:

| Table | Indexes |
|---|---|
| `sets` | `sets_release_date_idx`, `sets_name_norm_idx`, `sets_ptcgo_code_idx` |
| `cards` | `cards_set_id_idx`, `cards_hp_idx`, `cards_supertype_idx`, `cards_regulation_mark_idx`, `cards_release_date_idx`, `cards_name_norm_idx`, `cards_name_release_idx`, `cards_tcgdex_id_idx` |
| `attacks` | `attacks_card_idx_uq`, `attacks_card_id_idx`, `attacks_damage_num_idx` |
| `abilities` | `abilities_card_idx_uq`, `abilities_card_id_idx` |
| `weaknesses` | `weaknesses_card_id_idx` |
| `resistances` | `resistances_card_id_idx` |
| `price_history` | `price_history_card_date_idx`, `price_history_date_idx` |
| `cards_market_usd` | `cards_market_usd_price_idx` |

`schema.spec.ts > lists every named index of the 0002 tables` asserts this exact set, so a later migration that
drops or renames one of them fails a test rather than quietly degrading a query plan.

Note: the Outputs list of the subtask spec says "all 18 named indexes"; 18 is the count up to `resistances`.
The DDL as specified names 21, and 21 is what is asserted.
