# S02.T05 — Cards schema migration

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 5 / 14 |
| Depends on | [S01.T04](../01-foundation/T04-database-migration-framework.md) |
| Unblocks | [S02.T06](T06-load-cards.md), [S02.T08](T08-full-text-search.md), [S02.T09](T09-search-query-model-and-sql.md), [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md), [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md) |
| Parallel with | [S02.T01](T01-etl-cli-and-raw-cache.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` migration runner and conventions (`-- @sqlite-only` blocks) — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `doc` `project/04-data-model-overview.md` (baseline domain)
- `file` `pokemon/src/pokesearch/db/schema.sql` — the legacy table shapes, indexes and views; read-only reference

## Outputs (proposed)
- `file` `packages/db/migrations/0002_cards.sql` — tables `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `price_history`; view `cards_latest_price`; maintained table `cards_market_usd(card_id PK, market_usd, snapshot_date)`; FTS5 virtual table `cards_fts(card_id UNINDEXED, name, attack_names, attack_text, ability_names, ability_text, rules, flavor, tokenize='unicode61 remove_diacritics 2')` — consumed by [S02.T06](T06-load-cards.md), [S02.T08](T08-full-text-search.md), [S02.T09](T09-search-query-model-and-sql.md), [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md), [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)
- `table` indexes: `cards(set_id)`, `(hp)`, `(supertype)`, `(regulation_mark)`, `(release_date)`, `(name_norm)`, `(name, release_date)`; `attacks(card_id)`, `(damage_num)`; `abilities(card_id)`; `weaknesses(card_id)`, `resistances(card_id)`; `price_history(card_id, snapshot_date)`
- `module` `@pokesearch/db/schema` row types for these tables

## Initial objective
The relational home of every card fact from both sources exists, indexed for the search filters, with both raw JSON documents preserved (RN-01) and the SQLite-only objects (FTS5, maintained price table) isolated so the schema stays Postgres-portable.

## Context

This is the first migration that carries real data, and five subtasks read it before anything else exists: the loader ([S02.T06](T06-load-cards.md)), the FTS builder ([S02.T08](T08-full-text-search.md)), the query builder ([S02.T09](T09-search-query-model-and-sql.md)), the tournament schema that references `cards(id)` ([S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md)) and the rules base that references printings ([S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)). Getting the shape right here is cheaper than a twelve-step table rebuild later.

The legacy `pokemon/src/pokesearch/db/schema.sql` is the shape reference and has been read line by line. Four things change.

1. **RN-01 becomes a constraint, not a habit.** `raw_ptcg_json` is `NOT NULL`; `raw_tcgdex_json` is nullable because a card may have no TCGdex counterpart ([S02.T04](T04-set-and-card-id-mapping.md)). Neither is ever derived from the other, and every normalized column is reproducible from them.
2. **`cards_market_usd` becomes a maintained table.** In the legacy it is a view: `SELECT card_id, MIN(market) FROM cards_latest_price WHERE source='tcgplayer' AND market IS NOT NULL GROUP BY card_id`. Every price-sorted or price-filtered search therefore re-aggregated the whole price history. Here it is a table refreshed by [S02.T07](T07-prices-snapshot.md) — SQLite has no materialized views, and Postgres gets one (`04-data-model-overview.md`, portability notes).
3. **Children get primary keys and indexes.** The legacy `weaknesses` and `resistances` have no primary key and no index, so a re-load could duplicate rows and every `EXISTS (… FROM weaknesses …)` was a scan. Here the key is `(card_id, type)` and both tables are indexed.
4. **`ON DELETE CASCADE` is real.** The legacy declared it but ran with `PRAGMA foreign_keys` set per connection; [S01.T02](../01-foundation/T02-sqlite-database-client.md) turns foreign keys on for every connection, so cascades actually fire and the loader's delete-then-insert stays correct.

One legacy comment is worth carrying over verbatim, because it explains an index that looks redundant: on `CREATE INDEX ix_cards_name ON cards(name, release_date)` it says *"a linha evolutiva é subida pelo nome exato (sim/cardspec.py); sem índice era uma varredura de 20 mil linhas por carta"* — the evolution line is walked by exact name, and without the index that is a 20k-row scan per card. [S04.T02](../04-game-engine-core/T02-card-definition-model.md) does the same walk, so the index stays.

## Scope

- **In scope.** `packages/db/migrations/0002_cards.sql` with the full DDL below; the `-- @sqlite-only` tagging of FTS5 and of the `numericOrder` helper's expression; the `@pokesearch/db/schema` row types and the drift test; a short `packages/db/migrations/0002_cards.md` note recording why `cards_market_usd` is a table and which columns are denormalized.
- **Out of scope.** Inserting any row ([S02.T06](T06-load-cards.md), [S02.T07](T07-prices-snapshot.md)); populating or querying `cards_fts` ([S02.T08](T08-full-text-search.md)); the search SQL ([S02.T09](T09-search-query-model-and-sql.md)); tournament, deck, rules, job and measurement tables (their own migrations); the Postgres translation ([S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-01 | **Kept.** The raw JSON of both card sources is preserved and neither overwrites the other: `cards.raw_ptcg_json NOT NULL` holds the canonical document, `cards.raw_tcgdex_json` holds the TCGdex one (NULL when unmatched), and every other column is a derivation of one of them. | column definitions in `0002_cards.sql`; the loader never writes one from the other ([S02.T06](T06-load-cards.md)) | `schema.spec.ts > raw_ptcg_json is NOT NULL` (insert without it fails); loader round-trip test re-derives `name`, `hp`, `stage` from `raw_ptcg_json` and compares |
| BR-S02.T05-01 | Every child row is deleted with its card: `attacks`, `abilities`, `weaknesses`, `resistances`, `price_history` all declare `REFERENCES cards(id) ON DELETE CASCADE`. | the five foreign keys, with `foreign_keys=ON` from [S01.T02](../01-foundation/T02-sqlite-database-client.md) | `schema.spec.ts > deleting a card removes its five child row sets` |
| BR-S02.T05-02 | A card cannot exist without its set: `cards.set_id REFERENCES sets(id)` and the load order puts the set first. | foreign key on `cards` | `schema.spec.ts > inserting a card with an unknown set_id raises SQLITE_CONSTRAINT_FOREIGNKEY` |
| BR-S02.T05-03 | A printing has at most one attack per index and one ability per index: `UNIQUE (card_id, idx)` on both children. | unique indexes `attacks_card_idx_uq`, `abilities_card_idx_uq` | `schema.spec.ts > duplicate (card_id, idx) is rejected` |
| BR-S02.T05-04 | A card has at most one weakness and one resistance per energy type: primary key `(card_id, type)` on both tables. | table-level `PRIMARY KEY` | `schema.spec.ts > duplicate (card_id, type) is rejected` |
| BR-S02.T05-05 | A price observation is unique per `(card_id, snapshot_date, source, variant)`; re-running a snapshot on the same day updates in place and never appends. | `price_history` primary key + the loader's `ON CONFLICT … DO UPDATE` ([S02.T07](T07-prices-snapshot.md)) | `schema.spec.ts > second insert of the same key updates, count stays 1` |
| BR-S02.T05-06 | `cards_market_usd` holds at most one row per card and is a *table*, refreshed by the ETL — never a view and never written by the api. | `card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE`; the refresh lives in [S02.T07](T07-prices-snapshot.md) | `schema.spec.ts > cards_market_usd rejects a second row for the same card`; `grep` shows no write to it in `apps/api` |
| BR-S02.T05-07 | Every SQLite-only object in this migration sits in a block tagged `-- @sqlite-only` preceded by a `-- @postgres:` note naming its counterpart. | the tagging around `cards_fts`; `scripts/sql-lint.mjs` from [S01.T02](../01-foundation/T02-sqlite-database-client.md) | `pnpm check` passes on the migration and fails when the tag is removed |
| BR-S02.T05-08 | `0002_cards.sql` creates no row and runs inside one transaction; applying it to an empty database leaves every table empty and `schema_migrations.version = 2`. | no `INSERT` in the file; no `-- @no-transaction` marker | `migrate.spec.ts > 0002 applies on a fresh temp DB, version 2, zero rows, PRAGMA foreign_key_check clean` |
| BR-S02.T05-09 | Normalized text columns (`name_norm`, `text_norm`, `sets.name_norm`) are written only through the shared `norm()` of [S02.T06](T06-load-cards.md); the schema documents that contract in a column comment. | column comments plus the loader's single `norm()` implementation | `load.spec.ts > name_norm equals norm(name) for every fixture card` |
| BR-S02.T05-10 | Row types in `@pokesearch/db/schema` match the migrated database column-for-column, including nullability. | the drift test from [S01.T04](../01-foundation/T04-database-migration-framework.md) reading `PRAGMA table_info` | `schema-drift.spec.ts > 0002 tables match their TypeScript row types` |

## Data operations

The migration itself is a single DDL step (actor: the migration runner, under `pnpm db:migrate`, idempotent by version). The table below fixes who may write each object once it exists — the ownership every later subtask is held to.

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `sets` | C/U | etl | per set during a load | upsert on `id` (`ON CONFLICT (id) DO UPDATE`) | [S02.T06](T06-load-cards.md) |
| `sets` | R | api, worker | every search, sets page, card page | read-only | [S02.T09](T09-search-query-model-and-sql.md), [S02.T11](T11-api-cards-search-sets.md) |
| `cards` | C/U | etl | per card during a load | upsert on `id`; `raw_ptcg_json` always rewritten, `raw_tcgdex_json` only when a match exists | RN-01 |
| `cards` | U | etl | during a price refresh | only `raw_tcgdex_json`, `tcgdex_legal_standard`, `tcgdex_legal_expanded`, `tcgdex_updated` | [S02.T07](T07-prices-snapshot.md) |
| `cards` | R | api, worker | search, card page, card definitions | read-only | [S02.T09](T09-search-query-model-and-sql.md), [S04.T02](../04-game-engine-core/T02-card-definition-model.md) |
| `attacks`, `abilities`, `weaknesses`, `resistances` | C/D | etl | per card during a load | delete-then-insert per parent card, inside the set's transaction | [S02.T06](T06-load-cards.md) |
| `attacks`, `abilities`, `weaknesses`, `resistances` | R | api, worker | search predicates, card page, FTS rebuild | read-only | [S02.T08](T08-full-text-search.md), [S02.T09](T09-search-query-model-and-sql.md) |
| `price_history` | C/U | etl | once per snapshot date | upsert on the four-column PK; same-day re-run is a no-op in effect | [S02.T07](T07-prices-snapshot.md) |
| `price_history` | R | api | card page sparkline, price filters | read-only, `days` bounded | [S02.T11](T11-api-cards-search-sets.md) |
| `cards_latest_price` (view) | R | api | card page price table | read-only by definition | latest snapshot per `(card_id, source, variant)` |
| `cards_market_usd` | C/U/D | etl | after every price snapshot | full refresh: delete-then-insert, or upsert + delete of cards that lost all prices | [S02.T07](T07-prices-snapshot.md) |
| `cards_market_usd` | R | api | price sort/filter, deck price totals | read-only; `LEFT JOIN` so unpriced cards still appear | [S02.T09](T09-search-query-model-and-sql.md), [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md) |
| `cards_fts` | C/D | etl | after every load, full rebuild | `DELETE` then one `INSERT … SELECT`, then `'optimize'`; row count must equal `cards` | [S02.T08](T08-full-text-search.md) |
| `cards_fts` | R | api | free-text search | read-only, `MATCH` + `bm25()` | [S02.T09](T09-search-query-model-and-sql.md) |
| any of the above | — | engine | never | the engine does not open the database | Architecture principle 1 |

## Interfaces

**`packages/db/migrations/0002_cards.sql`**

```sql
-- 0002_cards.sql — canonical card facts from pokemon-tcg-data complemented by TCGdex, prices and the FTS index.
-- Owner: S02.T05 (schema), S02.T06 (rows), S02.T07 (prices), S02.T08 (FTS).
-- Postgres: *_json TEXT -> jsonb + GIN; cards_fts -> generated tsvector (A name, B attack/ability names,
--   C texts and rules, D flavor) + GIN; cards_market_usd -> materialized view; see packages/db/PORTABILITY.md.

CREATE TABLE sets (
    id              TEXT PRIMARY KEY,          -- pokemon-tcg-data set id, e.g. 'sv8'
    tcgdex_id       TEXT,                      -- resolved by S02.T04; NULL when unmatched
    name            TEXT    NOT NULL,
    name_norm       TEXT    NOT NULL,          -- norm(name); see BR-S02.T05-09
    series          TEXT,
    printed_total   INTEGER,
    total           INTEGER,
    release_date    TEXT,                      -- 'YYYY-MM-DD'
    ptcgo_code      TEXT,                      -- e.g. 'SSP'
    legal_unlimited TEXT,                      -- 'Legal' | 'Banned' | NULL (source wording)
    legal_standard  TEXT,
    legal_expanded  TEXT,
    symbol_url      TEXT,
    logo_url        TEXT,
    updated_at      TEXT    NOT NULL           -- 'YYYY-MM-DDTHH:MM:SSZ'
);
CREATE INDEX sets_release_date_idx ON sets (release_date DESC);
CREATE INDEX sets_name_norm_idx    ON sets (name_norm);
CREATE INDEX sets_ptcgo_code_idx   ON sets (ptcgo_code);

CREATE TABLE cards (
    id                    TEXT PRIMARY KEY,                              -- 'sv4pt5-54'
    set_id                TEXT    NOT NULL REFERENCES sets(id),
    tcgdex_id             TEXT,
    number                TEXT    NOT NULL,                              -- printed, e.g. '54', 'TG01'
    local_id              TEXT,                                          -- TCGdex localId
    name                  TEXT    NOT NULL,
    name_norm             TEXT    NOT NULL,
    supertype             TEXT,                                          -- 'Pokémon' | 'Trainer' | 'Energy'
    subtypes_json         TEXT,                                          -- JSON array
    hp                    INTEGER,
    types_json            TEXT,
    evolves_from          TEXT,
    evolves_to_json       TEXT,
    stage                 TEXT,                                          -- derived, see S02.T06
    rules_json            TEXT,
    flavor_text           TEXT,
    regulation_mark       TEXT,                                          -- 'G' | 'H' | 'I' | …
    rarity                TEXT,
    artist                TEXT,
    national_dex_json     TEXT,
    retreat_cost          INTEGER,
    retreat_json          TEXT,
    legal_unlimited       TEXT,
    legal_standard        TEXT,
    legal_expanded        TEXT,
    tcgdex_legal_standard INTEGER,                                       -- 0 | 1 | NULL (no TCGdex document)
    tcgdex_legal_expanded INTEGER,
    variants_json         TEXT,
    img_small             TEXT,
    img_large             TEXT,
    img_webp_high         TEXT,
    img_webp_low          TEXT,
    raw_ptcg_json         TEXT    NOT NULL,                              -- RN-01
    raw_tcgdex_json       TEXT,                                          -- RN-01; NULL when unmatched
    release_date          TEXT,                                          -- denormalized from sets, for filters
    tcgdex_updated        TEXT,
    updated_at            TEXT    NOT NULL,
    CHECK (tcgdex_legal_standard IN (0, 1)),
    CHECK (tcgdex_legal_expanded IN (0, 1)),
    CHECK (hp IS NULL OR hp >= 0),
    CHECK (retreat_cost IS NULL OR retreat_cost >= 0)
);
CREATE INDEX cards_set_id_idx          ON cards (set_id);
CREATE INDEX cards_hp_idx              ON cards (hp);
CREATE INDEX cards_supertype_idx       ON cards (supertype);
CREATE INDEX cards_regulation_mark_idx ON cards (regulation_mark);
CREATE INDEX cards_release_date_idx    ON cards (release_date);
CREATE INDEX cards_name_norm_idx       ON cards (name_norm);
-- the evolution line is walked by exact name (S04.T02); without this index it is a 20k-row scan per card
CREATE INDEX cards_name_release_idx    ON cards (name, release_date);
CREATE INDEX cards_tcgdex_id_idx       ON cards (tcgdex_id);

CREATE TABLE attacks (
    id             INTEGER PRIMARY KEY,
    card_id        TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    idx            INTEGER NOT NULL,                                     -- position on the printing, 0-based
    name           TEXT,
    name_norm      TEXT,
    cost_json      TEXT,                                                 -- JSON array of energy type names
    converted_cost INTEGER,
    damage_text    TEXT,                                                 -- '120+', '30×', 'varies'
    damage_num     INTEGER,
    damage_mod     TEXT,                                                 -- '+' | '-' | '×' | NULL
    text           TEXT,
    text_norm      TEXT,
    CHECK (idx >= 0),
    CHECK (damage_mod IS NULL OR damage_mod IN ('+', '-', '×'))
);
CREATE UNIQUE INDEX attacks_card_idx_uq   ON attacks (card_id, idx);
CREATE INDEX        attacks_card_id_idx   ON attacks (card_id);
CREATE INDEX        attacks_damage_num_idx ON attacks (damage_num);

CREATE TABLE abilities (
    id        INTEGER PRIMARY KEY,
    card_id   TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    idx       INTEGER NOT NULL,
    name      TEXT,
    name_norm TEXT,
    type      TEXT,                                                      -- 'Ability' | 'Poké-Power' | …
    text      TEXT,
    text_norm TEXT,
    CHECK (idx >= 0)
);
CREATE UNIQUE INDEX abilities_card_idx_uq ON abilities (card_id, idx);
CREATE INDEX        abilities_card_id_idx ON abilities (card_id);

CREATE TABLE weaknesses (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    type    TEXT NOT NULL,
    value   TEXT,                                                        -- '×2', '+30'
    PRIMARY KEY (card_id, type)
);
CREATE INDEX weaknesses_card_id_idx ON weaknesses (card_id);

CREATE TABLE resistances (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    type    TEXT NOT NULL,
    value   TEXT,                                                        -- '-30'
    PRIMARY KEY (card_id, type)
);
CREATE INDEX resistances_card_id_idx ON resistances (card_id);

CREATE TABLE price_history (
    card_id       TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    snapshot_date TEXT NOT NULL,                                         -- 'YYYY-MM-DD'
    source        TEXT NOT NULL,                                         -- 'tcgplayer' | 'cardmarket'
    variant       TEXT NOT NULL,                                         -- 'normal' | 'holofoil' | 'reverse-holofoil' | …
    currency      TEXT,                                                  -- 'USD' | 'EUR'
    low           REAL,
    mid           REAL,
    high          REAL,
    market        REAL,                                                  -- tcgplayer marketPrice / cardmarket avg
    direct_low    REAL,
    trend         REAL,
    avg1          REAL,
    avg7          REAL,
    avg30         REAL,
    PRIMARY KEY (card_id, snapshot_date, source, variant),
    CHECK (source IN ('tcgplayer', 'cardmarket')),
    CHECK (length(snapshot_date) = 10)
);
CREATE INDEX price_history_card_date_idx ON price_history (card_id, snapshot_date);
CREATE INDEX price_history_date_idx      ON price_history (snapshot_date);

-- Latest snapshot per (card, source, variant). Portable as written.
CREATE VIEW cards_latest_price AS
SELECT p.*
FROM price_history p
JOIN (SELECT card_id, source, variant, MAX(snapshot_date) AS snapshot_date
      FROM price_history GROUP BY card_id, source, variant) m
  ON m.card_id = p.card_id AND m.source = p.source
 AND m.variant = p.variant AND m.snapshot_date = p.snapshot_date;

-- One market price in USD per card. A maintained TABLE, not a view: every price sort and price filter
-- joins it (S02.T09), and re-aggregating price_history per query was the legacy cost.
-- @postgres: materialized view over cards_latest_price, refreshed by the same ETL step.
CREATE TABLE cards_market_usd (
    card_id       TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    market_usd    REAL NOT NULL,
    snapshot_date TEXT NOT NULL
);
CREATE INDEX cards_market_usd_price_idx ON cards_market_usd (market_usd);

-- @postgres: generated tsvector column on cards with weights A (name), B (attack_names, ability_names),
--   C (attack_text, ability_text, rules), D (flavor) + GIN index; see packages/db/PORTABILITY.md §7.
-- @sqlite-only
CREATE VIRTUAL TABLE cards_fts USING fts5(
    card_id UNINDEXED,
    name,
    attack_names,
    attack_text,
    ability_names,
    ability_text,
    rules,
    flavor,
    tokenize = 'unicode61 remove_diacritics 2'
);
-- @end
```

**Column-order contract for bm25.** `bm25(cards_fts, …)` takes one weight per column in declaration order, so the column order above is part of the contract with [S02.T08](T08-full-text-search.md): `0 (card_id), 10.0 (name), 6.0 (attack_names), 3.0 (attack_text), 6.0 (ability_names), 3.0 (ability_text), 2.0 (rules), 0.5 (flavor)`. Reordering columns silently reweights every search; the FTS module asserts the order at startup.

**`@pokesearch/db/schema`** gains `SetRow`, `CardRow`, `AttackRow`, `AbilityRow`, `WeaknessRow`, `ResistanceRow`, `PriceHistoryRow`, `CardsLatestPriceRow`, `CardsMarketUsdRow`, the unions `PriceSource = "tcgplayer" | "cardmarket"` and `DamageMod = "+" | "-" | "×"`, and adds these tables to the `TABLES` descriptor the drift test walks. `*_json` columns are typed `string | null` at the row level; parsed shapes belong to the service layer.

**Numeric-aware ordering.** `number` is `TEXT` (`'54'`, `'TG01'`, `'SV045'`). The dialect module's `numericOrder(col)` returns `CAST(<col> AS INTEGER), <col>` on SQLite and `NULLIF(regexp_replace(<col>,'\D','','g'),'')::int, <col>` on Postgres; no migration hard-codes either.

## Implementation steps

1. Write `0002_cards.sql` down to `resistances`, with the header comment, the foreign keys and the index names; apply it on a temp database and run `PRAGMA foreign_key_check`.
2. Add `price_history`, `cards_latest_price` and `cards_market_usd` with their indexes and checks.
3. Add the tagged `cards_fts` block with its `-- @postgres:` note; verify `pnpm check` passes and fails when the tag is removed (BR-S02.T05-07).
4. Add the row types and the `TABLES` entries in `@pokesearch/db/schema`; run the drift test until it is green (BR-S02.T05-10).
5. Write `schema.spec.ts`: `NOT NULL` on `raw_ptcg_json`, cascade deletes, the two unique indexes, the two composite primary keys, the `cards_market_usd` single-row rule, and an FTS insert + `MATCH` round trip.
6. Insert one fixture card through the typed layer (from `packages/db/fixtures/`) and read it back, asserting every column type; this is the contract [S02.T06](T06-load-cards.md) implements.
7. Write `packages/db/migrations/0002_cards.md` recording the four deviations from the legacy schema and the bm25 column-order contract.
8. Measure the applied schema size and the index list (`SELECT name FROM sqlite_master WHERE type='index'`) and record it in the note, so a later migration that drops an index is visible.

## Edge cases and error handling

- **A card with no TCGdex counterpart.** `tcgdex_id`, `local_id`, `raw_tcgdex_json`, `variants_json`, `img_webp_*`, `tcgdex_updated` and both `tcgdex_legal_*` are NULL. The legality filter's `COALESCE(tcgdex_legal_standard, legal_standard = 'Legal')` ([S02.T09](T09-search-query-model-and-sql.md)) then falls back to the canonical string, which is why the `CHECK` allows only 0/1/NULL and never an empty string.
- **A card numbered `TG01`.** Stored verbatim in `number`; ordering uses `numericOrder`, so `CAST('TG01' AS INTEGER)` is 0 and the secondary `number` sort keeps gallery cards grouped and stable rather than interleaved.
- **Damage text `30×`.** `damage_text = '30×'`, `damage_num = 30`, `damage_mod = '×'`; the `CHECK` accepts only `+`, `-`, `×`, so the loader must normalize `x` and `*` before insert ([S02.T06](T06-load-cards.md)).
- **An attack with non-numeric damage** (`'varies'`, `''`). `damage_text` keeps the raw string, `damage_num` and `damage_mod` are NULL; a damage range filter simply does not match it, which is correct.
- **A card with no prices.** No `price_history` rows and no `cards_market_usd` row; the search `LEFT JOIN` keeps it visible, `market_usd` is NULL, and the price sorts put it last (`NULLS LAST`).
- **A re-load of the same set.** `cards` upserts, children are delete-then-insert; because `attacks.id`/`abilities.id` are surrogate ids, they change on every reload — nothing may store an attack id as a stable reference, which is why [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md) keys parts by `(card_id, kind, idx)` and effect texts by hash, not by `attacks.id`.
- **A source set disappears upstream.** Nothing cascades: `sets` has no `ON DELETE` from anywhere, and deleting a set with cards fails on the `cards.set_id` foreign key — deliberate, so data loss is an explicit act.
- **The migration is applied twice.** The runner skips it by version; if someone runs the raw SQL twice, `CREATE TABLE` fails (no `IF NOT EXISTS`, per the [S01.T04](../01-foundation/T04-database-migration-framework.md) conventions) and the transaction rolls back — loud, which is the point.
- **FTS5 is unavailable** (a Node build without it). `CREATE VIRTUAL TABLE` fails and the whole migration rolls back; [S01.T02](../01-foundation/T02-sqlite-database-client.md)'s verified fact (`node:sqlite` = SQLite 3.50.4 with `ENABLE_FTS5`) is what makes this safe, and `db.sqliteVersion()` in `/health` is where the assumption is visible.

## Acceptance / verification

- [ ] `pnpm db:migrate` on a fresh temp database applies 0002, leaves `schema_migrations.version = 2`, zero rows in every new table, and `PRAGMA foreign_key_check` returns nothing (BR-S02.T05-08).
- [ ] `schema.spec.ts > raw_ptcg_json is NOT NULL` — inserting a card without it raises `SQLITE_CONSTRAINT_NOTNULL` (RN-01).
- [ ] `> deleting a card removes its five child row sets` — one card with 2 attacks, 1 ability, 1 weakness, 1 resistance and 3 price rows; after `DELETE FROM cards`, all counts are 0 (BR-S02.T05-01).
- [ ] `> duplicate (card_id, idx) is rejected` for attacks and abilities; `> duplicate (card_id, type) is rejected` for weaknesses and resistances (BR-S02.T05-03, -04).
- [ ] `> second insert of the same price key updates, count stays 1` (BR-S02.T05-05); `> cards_market_usd rejects a second row for the same card` (BR-S02.T05-06).
- [ ] `> cards_fts accepts an insert and a MATCH`, and `bm25(cards_fts, 0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5)` evaluates without an argument-count error — which is the column-order contract (BR-S02.T05-07).
- [ ] `schema-drift.spec.ts > 0002 tables match their TypeScript row types` passes, and fails when a column is added to the SQL without the type (BR-S02.T05-10).
- [ ] A fixture card inserted through `@pokesearch/db/schema` reads back with identical values for every column, including `subtypes_json` and `raw_ptcg_json`.
- [ ] `pnpm check` fails when the `-- @sqlite-only` tag around `cards_fts` is removed, and passes with it (BR-S02.T05-07).
- [ ] `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN (…)` lists all 18 named indexes; every index in the Outputs list is present.

## Risks and open questions

- **Risk — `cards_market_usd` drifts from `price_history`** because it is maintained, not derived. Mitigation: [S02.T07](T07-prices-snapshot.md) refreshes it in the same transaction as the snapshot, and its acceptance compares the table against the equivalent aggregate query; the view definition stays in the migration note so the invariant is written down.
- **Risk — a future migration must add a column to `cards`.** `ALTER TABLE … ADD COLUMN` is portable and cheap; a column *removal* or a constraint change needs SQLite's twelve-step rebuild. Mitigation: the checks here are minimal and about data validity, not policy.
- **Risk — the bm25 column order is changed by a later migration.** Mitigation: the contract is documented in the migration header and in `0002_cards.md`, and [S02.T08](T08-full-text-search.md) asserts the column order at startup before trusting its weights.
- **Deliberate addition — `sets.name_norm`.** The legacy resolved a set name with `lower(name) LIKE ?` and no index; a normalized, indexed column makes `set_name=Pokémon 151` work with or without diacritics and keeps the `norm()` contract uniform (BR-S02.T05-09). Noted here because it is a column the legacy schema does not have.
- **Question — should `attacks`/`abilities` use `(card_id, idx)` as the primary key instead of a surrogate `id`?** Recommendation: keep the surrogate (simpler child references and a stable `ORDER BY id` tie-break) plus the unique index, which gives the same guarantee. Decide before [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md) starts, since it is the only subtask that could want a stable part id — and it keys by `(card_id, kind, idx)` precisely to avoid depending on this.
- **Question — index `cards(rarity)` and `cards(artist)`?** Both are `LIKE '%…%'` filters today, which no index serves. Recommendation: leave them out until a measurement shows the facet or filter is slow on 20k rows; record the measurement in [S02.T09](T09-search-query-model-and-sql.md).

## References

- `pokemon/src/pokesearch/db/schema.sql` — verified: `sets`/`cards`/`attacks`/`abilities`/`weaknesses`/`resistances`/`price_history`/`etl_meta` definitions (L4–120), the ten indexes (L122–133) including the comment on `ix_cards_name` about the 20k-row evolution-line scan, the `cards_latest_price` view (L136–144), `cards_market_usd` **as a view** (L147–151), and the `cards_fts` virtual table with `tokenize = 'unicode61 remove_diacritics 2'` (L344–354). Consult for shapes; the four deviations are listed under Context.
- `pokemon/src/pokesearch/etl/load.py` — verified: the exact column list of the `cards` upsert, which this DDL mirrors, and the delete-then-insert of the four child tables.
- [S01.T04](../01-foundation/T04-database-migration-framework.md) — migration naming, the `-- @sqlite-only` / `-- @postgres:` tagging convention, the no-`IF NOT EXISTS` rule and the drift test.
- [S01.T02](../01-foundation/T02-sqlite-database-client.md) — `foreign_keys=ON` on every connection (what makes the cascades real), `packages/db/PORTABILITY.md` and the dialect module `numericOrder`.
- [Data model overview](../../project/04-data-model-overview.md) — the baseline table inventory, the bm25 weights, and the Postgres portability notes this migration's header quotes.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
