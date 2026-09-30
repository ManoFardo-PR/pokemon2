# Handoff — S02.T05

| Field | Value |
|---|---|
| TASK_ID | S02.T05 |
| SPEC | docs/stages/02-card-data-and-search/T05-cards-schema-migration.md |
| HANDOFF | docs/stages/02-card-data-and-search/handoff/T05-cards-schema-migration.handoff.md |
| LAST_PHASE | P4-AUDIT |
| LAST_STATUS | APPROVED WITH DEFERRALS |
| NEXT | none |
| BASE_COMMIT | 5859e54d7c0d2c531b0cc2b1c219a48f1a555c49 |
| RED_COMMIT | 72c1ebd41d5bdaf095ea19c35d545ebdf36008d2 |
| GREEN_COMMIT | f083c985fbfa3a386b203a382225539cb6e71e89 |
| UPDATED | 2026-09-30 |

## §1 PLAN

### §1.0 Phase check

| Source | Finding |
|---|---|
| Spec header `Status` | `TODO` |
| Stage README row | `TODO` |
| `T05-cards-schema-migration.log.md` | does not exist |
| `git log --grep "S02.T05"` | no commits |
| Handoff file | did not exist |
| Outputs on disk | `packages/db/migrations/0002_cards.sql`, `0002_cards.md` do not exist; `schema.ts` has only 0001 types |

Classification: **NOT_STARTED**.

### §1.1 Objective and scope

#### §1.1a Inputs

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:14`

- `module` migration runner and conventions (`-- @sqlite-only` blocks) — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `doc` `project/04-data-model-overview.md` (baseline domain)
- `file` `pokemon/src/pokesearch/db/schema.sql` — the legacy table shapes, indexes and views; read-only reference

#### §1.1b Outputs

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:19`

- `file` `packages/db/migrations/0002_cards.sql` — tables `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `price_history`; view `cards_latest_price`; maintained table `cards_market_usd(card_id PK, market_usd, snapshot_date)`; FTS5 virtual table `cards_fts(card_id UNINDEXED, name, attack_names, attack_text, ability_names, ability_text, rules, flavor, tokenize='unicode61 remove_diacritics 2')` — consumed by [S02.T06](T06-load-cards.md), [S02.T08](T08-full-text-search.md), [S02.T09](T09-search-query-model-and-sql.md), [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md), [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)
- `table` indexes: `cards(set_id)`, `(hp)`, `(supertype)`, `(regulation_mark)`, `(release_date)`, `(name_norm)`, `(name, release_date)`; `attacks(card_id)`, `(damage_num)`; `abilities(card_id)`; `weaknesses(card_id)`, `resistances(card_id)`; `price_history(card_id, snapshot_date)`
- `module` `@pokesearch/db/schema` row types for these tables

#### §1.1c Initial objective

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:24`

The relational home of every card fact from both sources exists, indexed for the search filters, with both raw JSON documents preserved (RN-01) and the SQLite-only objects (FTS5, maintained price table) isolated so the schema stays Postgres-portable.

#### §1.1d Scope

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:40`

- **In scope.** `packages/db/migrations/0002_cards.sql` with the full DDL below; the `-- @sqlite-only` tagging of FTS5 and of the `numericOrder` helper's expression; the `@pokesearch/db/schema` row types and the drift test; a short `packages/db/migrations/0002_cards.md` note recording why `cards_market_usd` is a table and which columns are denormalized.
- **Out of scope.** Inserting any row ([S02.T06](T06-load-cards.md), [S02.T07](T07-prices-snapshot.md)); populating or querying `cards_fts` ([S02.T08](T08-full-text-search.md)); the search SQL ([S02.T09](T09-search-query-model-and-sql.md)); tournament, deck, rules, job and measurement tables (their own migrations); the Postgres translation ([S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)).

### §1.2 Business rules

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:45`

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

> VERBATIM — `docs/project/05-business-rules-traceability.md:16`

| RN-01 | Raw JSON of both card sources preserved; neither overwrites the other | Kept | S02.T05, S02.T06 | loader tests (fixture card round-trip) |

Master ID list for every later phase: **RN-01, BR-S02.T05-01 … BR-S02.T05-10** (11 IDs).

### §1.3 Interfaces and contracts

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:83`

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

#### §1.3a Existing code this subtask conforms to

> VERBATIM — `packages/db/src/schema.ts:30-66`

```ts
export interface TableColumnDescriptor {
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: boolean;
}

export interface TableDescriptor {
  name: string;
  columns: TableColumnDescriptor[];
}

export const TABLES: Record<string, TableDescriptor> = {
  schema_migrations: {
    name: "schema_migrations",
    columns: [
      { name: "version", type: "INTEGER", notnull: false, dflt_value: null, pk: true },
      { name: "name", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "checksum", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "applied_at", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "duration_ms", type: "INTEGER", notnull: true, dflt_value: null, pk: false },
    ],
  },
  etl_runs: {
    name: "etl_runs",
    columns: [
      { name: "id", type: "INTEGER", notnull: false, dflt_value: null, pk: true },
      { name: "kind", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "started_at", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "finished_at", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "status", type: "TEXT", notnull: true, dflt_value: "'running'", pk: false },
      { name: "stats_json", type: "TEXT", notnull: true, dflt_value: "'{}'", pk: false },
      { name: "error", type: "TEXT", notnull: false, dflt_value: null, pk: false },
    ],
  },
};
```

> VERBATIM — `packages/db/src/schema.spec.ts:42-60`

```ts
  describe("BR-S01.T04-09: Schema Drift against PRAGMA table_info", () => {
    it("matches TABLES descriptor exactly against SQLite PRAGMA table_info for schema_migrations", () => {
      const descriptor = TABLES.schema_migrations!;
      expect(descriptor).toBeDefined();

      const pragmaCols = db.all<PragmaTableInfo>("PRAGMA table_info(schema_migrations);");
      expect(pragmaCols.length).toBe(descriptor.columns.length);

      for (let i = 0; i < descriptor.columns.length; i++) {
        const expected = descriptor.columns[i]!;
        const actual = pragmaCols[i]!;

        expect(actual.name).toBe(expected.name);
        expect(actual.type.toUpperCase()).toBe(expected.type);
        expect(Boolean(actual.notnull)).toBe(expected.notnull);
        expect(Boolean(actual.pk)).toBe(expected.pk);
        expect(actual.dflt_value).toBe(expected.dflt_value);
      }
    });
```

> VERBATIM — `packages/db/src/migrate.ts:86-95`

```ts
export function defaultMigrationsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const dbSrcDir = dirname(currentFile);
  const migrationsDir = resolve(dbSrcDir, "../migrations");
  return migrationsDir;
}

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}
```

> VERBATIM — `packages/db/src/migrate.ts:99-140`

```ts
export function discoverMigrations(dir?: string): MigrationFile[] {
  const migrationsDirectory = dir ? resolve(dir) : defaultMigrationsDir();
  if (!existsSync(migrationsDirectory)) {
    return [];
  }

  const entries = readdirSync(migrationsDirectory, { withFileTypes: true });
  const sqlFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".sql"));

  const migrations: MigrationFile[] = [];

  for (const file of sqlFiles) {
    const match = file.name.match(MIGRATION_FILE_PATTERN);
    if (!match || !match[1] || !match[2]) {
      throw new MigrationValidationError(
        `Migration filename '${file.name}' does not conform to NNNN_<snake_case>.sql convention.`
      );
    }

    const versionStr = match[1];
    const name = match[2];

    // Must be valid snake_case (lower letters, numbers, underscores, no consecutive underscores or camelCase)
    if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(name)) {
      throw new MigrationValidationError(
        `Migration name '${name}' in '${file.name}' is not valid snake_case.`
      );
    }

    const filePath = join(migrationsDirectory, file.name);
    const content = readFileSync(filePath, "utf-8");
    const checksum = sha256(content);
    const noTransaction = content.startsWith("-- @no-transaction");

    migrations.push({
      version: parseInt(versionStr, 10),
      name,
      path: filePath,
      checksum,
      sql: content,
      noTransaction,
    });
```

> VERBATIM — `packages/db/src/dialect/sqlite.ts:44-46`

```ts
  numericOrder(column: string): string {
    return `CAST(${column} AS INTEGER)`;
  },
```

> VERBATIM — `packages/db/package.json:1-24`

```json
{
  "name": "@pokesearch/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
    "exports": {
    ".": "./src/index.ts",
    "./migrate": "./src/migrate.ts",
    "./testing": "./src/testing/index.ts"
  },
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^3.2.7"
  }
}
```

> VERBATIM — `packages/db/src/testing/index.ts:454-460`

```ts
export function loadFixture(db: Db, name: string): { tables: Record<string, number> } {
  const fixture = readFixture(name);
  const result: Record<string, number> = {};

  const existingTables = new Set(
    db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
```

> VERBATIM — `scripts/sql-lint.mjs:5-13`

```js
const SQLITE_ONLY_PATTERNS = [
  /\bjson_each\b/i,
  /\bjson_tree\b/i,
  /\bMATCH\b/i,
  /\bbm25\b/i,
  /\bVACUUM\b/i,
  /\bPRAGMA\b/i,
  /\bfts5\b/i,
];
```

> VERBATIM — `scripts/sql-lint.mjs:47-100`

```js
function lintSqlFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const errors = [];

  let inSqliteOnlyBlock = false;
  let hasPostgresNote = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Check BR-S01.T04-04: Migration SQL is written WITHOUT IF NOT EXISTS
    if (/\bIF\s+NOT\s+EXISTS\b/i.test(line)) {
      errors.push({
        line: i + 1,
        message: "Forbidden 'IF NOT EXISTS' in migration SQL. Migrations must be exact and idempotent via runner.",
      });
    }

    if (line.startsWith("-- @postgres:")) {
      hasPostgresNote = true;
      continue;
    }

    if (line.startsWith("-- @sqlite-only")) {
      if (!hasPostgresNote) {
        errors.push({
          line: i + 1,
          message: "Found -- @sqlite-only block without preceding -- @postgres: note",
        });
      }
      inSqliteOnlyBlock = true;
      continue;
    }

    if (line.startsWith("-- @end")) {
      inSqliteOnlyBlock = false;
      hasPostgresNote = false;
      continue;
    }

    if (!inSqliteOnlyBlock) {
      for (const pattern of SQLITE_ONLY_PATTERNS) {
        if (pattern.test(line)) {
          errors.push({
            line: i + 1,
            message: `SQLite-only construct "${line}" outside -- @sqlite-only block`,
          });
          break;
        }
      }
    }
  }
```

NOTE (P1): `sql-lint.mjs` scans `.sql` files under `process.cwd()` and TS/JS sources under `<cwd>/packages`; a test that runs it against a temp tree must create a `packages/` folder there, or `readdirSync` throws and the exit code is non-zero for the wrong reason.

NOTE (P1): `PRAGMA table_info` reports `notnull = 0` for a `TEXT PRIMARY KEY` / `INTEGER PRIMARY KEY` column not declared `NOT NULL`, and `pk` as 1..n for composite keys (the existing drift test compares `Boolean(pk)`). The existing 0001 descriptors follow this (`version`, `id`: `notnull: false, pk: true`).

### §1.4 Data operations

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:61`

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

### §1.5 Implementation steps

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:281`

1. Write `0002_cards.sql` down to `resistances`, with the header comment, the foreign keys and the index names; apply it on a temp database and run `PRAGMA foreign_key_check`.
2. Add `price_history`, `cards_latest_price` and `cards_market_usd` with their indexes and checks.
3. Add the tagged `cards_fts` block with its `-- @postgres:` note; verify `pnpm check` passes and fails when the tag is removed (BR-S02.T05-07).
4. Add the row types and the `TABLES` entries in `@pokesearch/db/schema`; run the drift test until it is green (BR-S02.T05-10).
5. Write `schema.spec.ts`: `NOT NULL` on `raw_ptcg_json`, cascade deletes, the two unique indexes, the two composite primary keys, the `cards_market_usd` single-row rule, and an FTS insert + `MATCH` round trip.
6. Insert one fixture card through the typed layer (from `packages/db/fixtures/`) and read it back, asserting every column type; this is the contract [S02.T06](T06-load-cards.md) implements.
7. Write `packages/db/migrations/0002_cards.md` recording the four deviations from the legacy schema and the bm25 column-order contract.
8. Measure the applied schema size and the index list (`SELECT name FROM sqlite_master WHERE type='index'`) and record it in the note, so a later migration that drops an index is visible.

| Step | Tag | Reason |
|---|---|---|
| 1 | IN SCOPE | — |
| 2 | IN SCOPE | — |
| 3 | IN SCOPE | the "fails when the tag is removed" half is a test on a temp copy (see §1.9 BR-07) |
| 4 | IN SCOPE | — |
| 5 | IN SCOPE (P2 writes the specs) | — |
| 6 | IN SCOPE, **pending §1.13 Q1** | no fixture in the 0002 shape exists; "the typed layer" is only types, there is no insert helper (Q3) |
| 7 | IN SCOPE | — |
| 8 | IN SCOPE | measurement recorded in `0002_cards.md`; not a test |

### §1.6 Edge cases and error handling

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:292`

- **A card with no TCGdex counterpart.** `tcgdex_id`, `local_id`, `raw_tcgdex_json`, `variants_json`, `img_webp_*`, `tcgdex_updated` and both `tcgdex_legal_*` are NULL. The legality filter's `COALESCE(tcgdex_legal_standard, legal_standard = 'Legal')` ([S02.T09](T09-search-query-model-and-sql.md)) then falls back to the canonical string, which is why the `CHECK` allows only 0/1/NULL and never an empty string.
- **A card numbered `TG01`.** Stored verbatim in `number`; ordering uses `numericOrder`, so `CAST('TG01' AS INTEGER)` is 0 and the secondary `number` sort keeps gallery cards grouped and stable rather than interleaved.
- **Damage text `30×`.** `damage_text = '30×'`, `damage_num = 30`, `damage_mod = '×'`; the `CHECK` accepts only `+`, `-`, `×`, so the loader must normalize `x` and `*` before insert ([S02.T06](T06-load-cards.md)).
- **An attack with non-numeric damage** (`'varies'`, `''`). `damage_text` keeps the raw string, `damage_num` and `damage_mod` are NULL; a damage range filter simply does not match it, which is correct.
- **A card with no prices.** No `price_history` rows and no `cards_market_usd` row; the search `LEFT JOIN` keeps it visible, `market_usd` is NULL, and the price sorts put it last (`NULLS LAST`).
- **A re-load of the same set.** `cards` upserts, children are delete-then-insert; because `attacks.id`/`abilities.id` are surrogate ids, they change on every reload — nothing may store an attack id as a stable reference, which is why [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md) keys parts by `(card_id, kind, idx)` and effect texts by hash, not by `attacks.id`.
- **A source set disappears upstream.** Nothing cascades: `sets` has no `ON DELETE` from anywhere, and deleting a set with cards fails on the `cards.set_id` foreign key — deliberate, so data loss is an explicit act.
- **The migration is applied twice.** The runner skips it by version; if someone runs the raw SQL twice, `CREATE TABLE` fails (no `IF NOT EXISTS`, per the [S01.T04](../01-foundation/T04-database-migration-framework.md) conventions) and the transaction rolls back — loud, which is the point.
- **FTS5 is unavailable** (a Node build without it). `CREATE VIRTUAL TABLE` fails and the whole migration rolls back; [S01.T02](../01-foundation/T02-sqlite-database-client.md)'s verified fact (`node:sqlite` = SQLite 3.50.4 with `ENABLE_FTS5`) is what makes this safe, and `db.sqliteVersion()` in `/health` is where the assumption is visible.

| Edge case | BR tag (NOTE P1: tags assigned by P1) | Testable here |
|---|---|---|
| card with no TCGdex counterpart | RN-01 | yes — NULLs accepted; `tcgdex_legal_*` CHECK rejects `''` and `2` |
| card numbered `TG01` | — (numericOrder is not in this migration) | yes — `number` stored verbatim |
| damage text `30×` | — (CHECK on `damage_mod`) | yes — `'×'` accepted, `'x'` and `'*'` rejected |
| non-numeric damage | — | yes — `damage_num`/`damage_mod` NULL accepted |
| card with no prices | BR-S02.T05-06 | yes — card exists with no `cards_market_usd` row |
| re-load of the same set | BR-S02.T05-01, -03 | partly — delete-then-insert of children is S02.T06 |
| source set disappears upstream | BR-S02.T05-02 | yes — `DELETE FROM sets` with cards raises FOREIGNKEY |
| migration applied twice | BR-S02.T05-08 | yes — raw `exec` of the file a second time fails and leaves version 2 |
| FTS5 unavailable | BR-S02.T05-07 | no — environment property; covered by the FTS round-trip passing |

### §1.7 Acceptance checks

> VERBATIM — `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md:304`

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

| # | Check (short) | Tag |
|---|---|---|
| 1 | `pnpm db:migrate` on fresh temp DB → version 2, zero rows, FK check clean | RUNNABLE NOW (as `migrate.spec.ts` test) |
| 2 | `raw_ptcg_json` NOT NULL | RUNNABLE NOW |
| 3 | cascade of five child row sets | RUNNABLE NOW |
| 4 | duplicate `(card_id, idx)` / `(card_id, type)` rejected | RUNNABLE NOW |
| 5 | price upsert keeps count 1; `cards_market_usd` single row | RUNNABLE NOW |
| 6 | FTS insert + MATCH; bm25 with 8 weights | RUNNABLE NOW |
| 7 | drift test passes and fails on an undocumented column | RUNNABLE NOW |
| 8 | fixture card round-trip through the typed layer | RUNNABLE NOW, **pending §1.13 Q1/Q3** |
| 9 | `pnpm check` fails without the tag, passes with it | RUNNABLE NOW (sql-lint on a temp copy) + P4A runs `pnpm check` |
| 10 | "all 18 named indexes" listed | RUNNABLE NOW, **count conflict — §1.13 Q4** |
### §1.8 Target files

**CREATE (production)**
- `packages/db/migrations/0002_cards.sql` — the DDL of §1.3, exactly; LF line endings (see §1.13 Q2).
- `packages/db/migrations/0002_cards.md` — the four deviations from the legacy schema, the bm25 column-order contract, why `cards_market_usd` is a table, the denormalized columns, and the step-8 measurement (index list, applied schema size).

**MODIFY (production)**
- `packages/db/src/schema.ts` — add `SetRow`, `CardRow`, `AttackRow`, `AbilityRow`, `WeaknessRow`, `ResistanceRow`, `PriceHistoryRow`, `CardsLatestPriceRow`, `CardsMarketUsdRow`, unions `PriceSource`, `DamageMod`, and `TABLES` entries for every new table and the view. P2 may write the type declarations (contracts); the `TABLES` entries are P3's.
- `packages/db/package.json` — add `"./schema": "./src/schema.ts"` to `exports`, only if §1.13 Q5 is accepted.

**TEST FILES (P2)**
- `packages/db/src/schema.spec.ts` — existing (S01.T04). Append a `describe("S02.T05 …")` block; do not alter the existing 0001 tests.
- `packages/db/src/schema-drift.spec.ts` — new; the name the spec prescribes for BR-S02.T05-10.
- `packages/db/src/migrate.spec.ts` — existing. Append the `0002 applies on a fresh temp DB …` test; do not alter existing tests.
- `scripts/sql-lint.spec.ts` — new; runs `scripts/sql-lint.mjs` against a temp tree with and without the `-- @sqlite-only` tag (BR-S02.T05-07). Lives in the root `scripts` vitest project.
- Fixture for the typed round-trip — **depends on §1.13 Q1**.

**DO NOT TOUCH**
- `packages/db/migrations/0001_foundation.sql` (applied migration; checksum-protected).
- `packages/db/src/migrate.ts`, `client.ts`, `dialect/**` (see §1.13 Q6), `testing/index.ts`, `scripts/sql-lint.mjs`.
- `packages/db/fixtures/cards-basic.json` and `packages/db/src/testing/fixtures.spec.ts` — unless the user picks option B in §1.13 Q1.
- Legacy `pokemon/**` (read-only reference).

### §1.9 Test plan

Test names in quotes are VERBATIM from the spec's Verification column or Acceptance list.

| BR ID | Test file | Test name(s) | Scenarios to cover |
|---|---|---|---|
| RN-01 | `schema.spec.ts` | "raw_ptcg_json is NOT NULL" | insert a card without `raw_ptcg_json` → `SQLITE_CONSTRAINT_NOTNULL`; insert with `raw_tcgdex_json` NULL succeeds. The loader round-trip half is **DEFERRED → S02.T06** (no loader exists). |
| BR-S02.T05-01 | `schema.spec.ts` | "deleting a card removes its five child row sets" | one card with 2 attacks, 1 ability, 1 weakness, 1 resistance, 3 price rows; `DELETE FROM cards` → all five counts 0. NOTE (P1): also assert the `cards_market_usd` row cascades (its FK declares it). |
| BR-S02.T05-02 | `schema.spec.ts` | "inserting a card with an unknown set_id raises SQLITE_CONSTRAINT_FOREIGNKEY" | plus edge case: `DELETE FROM sets` for a set that has cards raises FOREIGNKEY. |
| BR-S02.T05-03 | `schema.spec.ts` | "duplicate (card_id, idx) is rejected" | for `attacks` and for `abilities`; the same `idx` on a different card is accepted. |
| BR-S02.T05-04 | `schema.spec.ts` | "duplicate (card_id, type) is rejected" | for `weaknesses` and for `resistances`. |
| BR-S02.T05-05 | `schema.spec.ts` | "second insert of the same key updates, count stays 1" | `INSERT … ON CONFLICT (card_id, snapshot_date, source, variant) DO UPDATE` twice → count 1, value updated; a plain duplicate `INSERT` raises; `source` outside `('tcgplayer','cardmarket')` and a `snapshot_date` of length ≠ 10 are rejected. |
| BR-S02.T05-06 | `schema.spec.ts` | "cards_market_usd rejects a second row for the same card"; "`grep` shows no write to it in `apps/api`" | second row → PK violation; `sqlite_master.type` for `cards_market_usd` is `table`, not `view`; a scan of `apps/api/src/**/*.ts` finds no `INSERT`/`UPDATE`/`DELETE` targeting `cards_market_usd`. |
| BR-S02.T05-07 | `schema.spec.ts` + `scripts/sql-lint.spec.ts` | "cards_fts accepts an insert and a MATCH"; "`pnpm check` fails when the `-- @sqlite-only` tag around `cards_fts` is removed, and passes with it" | FTS insert + `MATCH` returns the row; `bm25(cards_fts, 0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5)` evaluates without an argument-count error; the column order of `cards_fts` equals the contract. sql-lint on a temp tree: exit 0 with the real file, exit ≠ 0 with the tag lines stripped. |
| BR-S02.T05-08 | `migrate.spec.ts` | "0002 applies on a fresh temp DB, version 2, zero rows, PRAGMA foreign_key_check clean" | plus: the file contains no `INSERT`; line 1 is not `-- @no-transaction`; edge case: executing the file's SQL a second time fails and the version stays 2. |
| BR-S02.T05-09 | — | "load.spec.ts > name_norm equals norm(name) for every fixture card" | **DEFERRED → S02.T06** (the `norm()` implementation and the loader belong there). The column-comment half is checkable now: see §1.13 Q7. |
| BR-S02.T05-10 | `schema-drift.spec.ts` | "0002 tables match their TypeScript row types" | for every new table and the `cards_latest_price` view: `PRAGMA table_info` equals the `TABLES` descriptor (name, type, notnull, pk, dflt_value, in order); plus the negative case: after `ALTER TABLE cards ADD COLUMN rogue TEXT` the comparison fails. |

Edge cases from §1.6 without their own BR test go into `schema.spec.ts` under an "edge cases" describe: `TG01` stored verbatim; `damage_mod` accepts `'×'`, rejects `'x'` and `'*'`; non-numeric damage with NULL `damage_num`/`damage_mod` accepted; `tcgdex_legal_standard` rejects `''` and `2`, accepts NULL; a card with no prices has no `cards_market_usd` row.

Acceptance #10 (index list) goes into `schema.spec.ts`, with the expected set per §1.13 Q4.

Legacy assertions to port: none. The spec's References name `pokemon/src/pokesearch/db/schema.sql` as a shape reference only; there is no legacy schema test suite.

### §1.10 Constraints

> VERBATIM — `tsconfig.base.json` (compiler flags every file must pass)

```
"strict": true, "module": "nodenext", "moduleResolution": "nodenext", "allowImportingTsExtensions": true,
"isolatedModules": true, "verbatimModuleSyntax": true, "erasableSyntaxOnly": true,
"exactOptionalPropertyTypes": true, "noUncheckedIndexedAccess": true, "noImplicitReturns": true,
"noImplicitOverride": true, "noFallthroughCasesInSwitch": true, "useUnknownInCatchVariables": true
```

> VERBATIM — `packages/db/MIGRATIONS.md:54-62`

```
- [ ] Filename conforms to `NNNN_<snake_case>.sql`.
- [ ] No `IF NOT EXISTS` clauses are present in DDL.
- [ ] Indexes are explicitly named following `<table>_<cols>_idx`.
- [ ] SQLite-only constructs are properly tagged with `-- @postgres:` and `-- @sqlite-only ... -- @end`.
- [ ] Accompanying runtime row types in `@pokesearch/db/schema` are updated and drift tests pass.
- [ ] Tested with `pnpm --filter @pokesearch/db test` and `node scripts/sql-lint.mjs`.
```

> VERBATIM — `docs/project/04-data-model-overview.md:15`

```
- **Normalized text**: `norm(s)` = `s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().trim()` with internal whitespace collapsed to single spaces. `name_norm`, `text_norm` and `name_key` use exactly this function, so joins on normalized names are byte-exact.
```

> VERBATIM — `docs/project/02-decision-log.md:98` (D-009)

```
- **Decision.** Adopt hand-written row types in `@pokesearch/db/schema` paired with SQLite runtime `PRAGMA table_info` drift verification (`packages/db/src/schema.spec.ts`).
```

Other constraints:
- Imports use explicit `.js` extensions in the style of the existing files (`from "./client.js"`).
- Tests open databases the way `schema.spec.ts` does: `mkdtempSync(join(tmpdir(), …))` + `openDatabase` + `migrate(db, { dir: defaultMigrationsDir() })`, cleaned in `afterEach`. The `@pokesearch/db` vitest setup registers `migrate()` as the default schema initializer.
- Runtime: Node ≥ 24.13 (`package.json` engines) — `node:sqlite` with FTS5 (D-002 verified facts).
- `packages/db` depends on `zod ^3.25` (not v4, unlike `packages/etl`).
- Commands (root `package.json`): `pnpm test` (vitest, all projects), `pnpm --filter @pokesearch/db test`, `pnpm typecheck`, `pnpm lint`, `node scripts/sql-lint.mjs`, `pnpm check`, `pnpm build`, `node scripts/docs-lint.mjs --strict`.

### §1.11 Deferrals

a. OUT (this subtask → later)

| Item | BR IDs | Blocking task | Its status |
|---|---|---|---|
| loader round-trip re-deriving `name`, `hp`, `stage` from `raw_ptcg_json` | RN-01 (second verification) | S02.T06 | TODO |
| `name_norm equals norm(name) for every fixture card` | BR-S02.T05-09 | S02.T06 | TODO |

b. INHERITED (earlier tasks → S02.T05): none. No `.log.md` in the tree names S02.T05 as a blocking task.

### §1.12 Workspace state

- BASE_COMMIT `5859e54` (`fix(S02.T04): restore legacy parity in id mapping after audit`).
- None of the §1.8 CREATE targets exist. `schema.ts` holds only the 0001 types. `schema.spec.ts` and `migrate.spec.ts` exist with S01.T04 tests.
- Uncommitted changes in the working tree that touch this area: `packages/db/migrations/0001_foundation.sql` shows as modified, but the diff is line endings only (index LF, working copy CRLF) — see §1.13 Q2. Also uncommitted: the v2 prompts, the status backfill of S01/S02 specs, `package.json` (`build` script), and unrelated `apps/web`, `modules/`, `scripts/__fixtures__` changes.
- Existing tests checked for breakage when 0002 lands: `migrate.spec.ts` "Real 0001" uses `toBeGreaterThanOrEqual(1)`; `client.spec.ts` and `testing.spec.ts` use databases without the default migrations; `fixtures.spec.ts` uses its own hand-written schema; `apps/api/health.spec.ts` uses `expect.any(Number)`. NOTE (P1): none of them should break.

### §1.13 Open questions

**Q1 — BLOCKS P2. Which fixture carries the typed round-trip (step 6, acceptance #8)?**
> VERBATIM spec step 6: "Insert one fixture card through the typed layer (from `packages/db/fixtures/`) and read it back, asserting every column type"
> VERBATIM `packages/db/fixtures/README.md:35`: "**Schema Drift Prevention**: When database schemas are migrated or updated, fixture documents must be updated to keep `source` and `rows` synchronized."

`cards-basic.json` rows use `subtypes`, `types`, have no `raw_ptcg_json`, `number`, `name_norm`, `updated_at`, and its sets have no `name_norm`/`updated_at` — they cannot be inserted into the 0002 schema. `fixtures.spec.ts > loads fixture idempotently` loads `cards-basic` into its own hand-written old-shape schema.
- Option A (proposed): P2 adds a new fixture `packages/db/fixtures/cards-schema-0002.json` in the 0002 shape (1 set, 1 card with children and prices); `cards-basic.json` stays as is and its migration is recorded as a debt for S02.T06, the first task that loads it into the real schema.
- Option B: P2 migrates `cards-basic.json` to the 0002 shape and updates the hand-written schema in `fixtures.spec.ts` to match — this changes an S01.T03 test and fixture.

**Q2 — does not block P2; must be settled before P3 commits. `.sql` files have no line-ending rule.**
`.gitattributes` pins `*.md`, `*.ts`, `*.json`, … to LF but not `*.sql`. `0001_foundation.sql` is LF in git and CRLF in the working copy. `migrate.ts` stores `sha256(content)` of the raw file (VERBATIM `migrate.ts:93-94`), so the same migration has a different checksum on a CRLF and an LF checkout → `MigrationChecksumError` on any database migrated from the other. Proposed: add `*.sql text eol=lf` to `.gitattributes` in its own commit before P3 (outside this subtask's targets, so the user decides), then renormalize.

**Q3 — non-blocking. "Through the typed layer" / "`@pokesearch/db/schema`".** There is no insert helper; `schema.ts` exports types only. Proposed reading: insert with a `CardRow`-typed object via `db.run`, read back with `db.get<CardRow>`, compare every column.

**Q4 — non-blocking. "all 18 named indexes".** The DDL in §1.3 names **21** indexes (sets 3, cards 8, attacks 3, abilities 2, weaknesses 1, resistances 1, price_history 2, cards_market_usd 1). 18 is the count up to `resistances`. Proposed: assert the exact set of 21 names from the DDL, and correct the spec's number in the P3 notes.

**Q5 — non-blocking. The `@pokesearch/db/schema` subpath does not exist.** `packages/db/package.json` exports `.`, `./migrate`, `./testing`; the types are reachable from `@pokesearch/db`. The spec and D-009 name `@pokesearch/db/schema`. Proposed: add `"./schema": "./src/schema.ts"` (one line, MODIFY target).

**Q6 — non-blocking; out of scope. `numericOrder` differs from the spec.**
> VERBATIM spec Interfaces: "`numericOrder(col)` returns `CAST(<col> AS INTEGER), <col>` on SQLite"
> VERBATIM `packages/db/src/dialect/sqlite.ts:44-46`: returns `` `CAST(${column} AS INTEGER)` `` only.
The spec's Scope line mentions "the `-- @sqlite-only` tagging of … the `numericOrder` helper's expression", but no migration uses it. Proposed: leave the dialect untouched here; flag for S02.T09, its first consumer. Related: `sqliteDialect.rank()` builds `bm25(<weights>)` without the table argument that `bm25(cards_fts, …)` requires — flag for S02.T08.

**Q7 — non-blocking. BR-S02.T05-09 column comments.**
> VERBATIM BR-S02.T05-09: "the schema documents that contract in a column comment"
The spec DDL comments only `sets.name_norm` (`-- norm(name); see BR-S02.T05-09`); `cards.name_norm`, `attacks.name_norm`/`text_norm`, `abilities.name_norm`/`text_norm` have none. Proposed: P3 adds the same comment to each; P2 asserts each `*_norm` column line in `0002_cards.sql` carries `BR-S02.T05-09`.

**Q8 — pipeline note for P2/P3 (non-blocking).** The subject of most tests is a SQL file, which cannot be stubbed with `NOT_IMPLEMENTED`. At RED those tests fail with `no such table: <name>` (a `DbError`) or with `TABLES.<name>` undefined. P2 should list `no such table` as the expected reason for them in §2.5, and P3 step 0 should accept it.

### §1.14 Manifest

| File | Why | Use |
|---|---|---|
| `docs/project/08-conventions.md` | status vocabulary, BR format | REFERENCE |
| `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md` | the spec | VERBATIM §1.1–1.7 |
| `docs/stages/02-card-data-and-search/README.md` | order, dependents | REFERENCE |
| `docs/project/05-business-rules-traceability.md` | RN-01 row | VERBATIM §1.2 |
| `docs/project/02-decision-log.md` | D-002, D-009 | VERBATIM §1.10 (D-009) / REFERENCE (D-002) |
| `docs/project/04-data-model-overview.md` | `norm()`, portability notes | VERBATIM §1.10 |
| `docs/project/03-architecture-overview.md` | principle 1 (engine never touches the DB) | REFERENCE |
| `docs/stages/01-foundation/T04-database-migration-framework.md` + `.log.md` | provider of the runner and drift test | REFERENCE |
| `docs/stages/01-foundation/T02-sqlite-database-client.log.md` | `foreign_keys=ON`, dialect, sql-lint | REFERENCE |
| `packages/db/package.json` | exports | VERBATIM §1.3a |
| `packages/db/tsconfig.json`, `tsconfig.base.json` | compiler flags | VERBATIM §1.10 |
| `packages/db/vitest.config.ts`, `vitest.config.ts` | test projects, setup file | REFERENCE |
| `packages/db/src/index.ts` | re-exports `schema.js` | REFERENCE |
| `packages/db/src/schema.ts` | TABLES descriptor shape | VERBATIM §1.3a |
| `packages/db/src/schema.spec.ts` | drift-test pattern, DB setup | VERBATIM §1.3a (excerpt) |
| `packages/db/src/migrate.ts` | discovery, checksum | VERBATIM §1.3a (excerpt) |
| `packages/db/src/migrate.spec.ts` | existing tests that could break | REFERENCE |
| `packages/db/src/client.spec.ts`, `testing/testing.spec.ts`, `testing/fixtures.spec.ts` | breakage check | REFERENCE |
| `packages/db/src/testing/index.ts`, `testing/vitest.setup.ts` | fixture loader, default initializer | VERBATIM §1.3a (excerpt) / REFERENCE |
| `packages/db/src/dialect/sqlite.ts`, `dialect/types.ts` | `numericOrder`, `rank` | VERBATIM §1.3a / REFERENCE |
| `packages/db/MIGRATIONS.md` | migration checklist | VERBATIM §1.10 |
| `packages/db/PORTABILITY.md` §7 | divergences table | REFERENCE |
| `packages/db/fixtures/README.md`, `cards-basic.json` | fixture shape | VERBATIM §1.13 Q1 / REFERENCE |
| `scripts/sql-lint.mjs` | tag rules | VERBATIM §1.3a |
| `apps/api/src/health.spec.ts` | breakage check | REFERENCE |
| `package.json` (root), `.gitattributes` | commands, line endings | REFERENCE |
| `pokemon/src/pokesearch/db/schema.sql` (legacy) | shape reference | REFERENCE (read-only) |

### §1.15 User answers and amendments (2026-09-30)

- **Q1 → Option A.** P2 creates `packages/db/fixtures/cards-schema-0002.json` in the 0002 shape (1 set, 1 card with 2 attacks, 1 ability, 1 weakness, 1 resistance, 3 price rows, 1 `cards_market_usd` row). Added to §1.8 TEST FILES. `cards-basic.json` and `fixtures.spec.ts` stay untouched; migrating `cards-basic.json` to the 0002 shape is a debt handed to S02.T06 (the first task that loads it into the real schema) — P3 lists it in the log's Deferrals so S02.T06's P1 inherits it.
- **Q2 → fixed outside this subtask.** `.gitattributes` now has `*.sql text eol=lf`; the working copy of `0001_foundation.sql` was converted to LF and its SHA-256 now equals `HEAD:packages/db/migrations/0001_foundation.sql` (`c0c10cc7…9987`). Uncommitted; it must be committed on its own (`chore: pin *.sql to LF`) before P3's RED commit. NOTE (P1): any local database migrated earlier from the CRLF copy holds a different checksum for 0001 and will raise `MigrationChecksumError` against the LF file.
- **Q3–Q7:** proposed resolutions stand unless the user overrides them.
- **Q8:** adopted into the pipeline — `PROMPT_02_v2.md` §2.5 now allows `MISSING_ARTIFACT: <exact error>` for non-code subjects, and `PROMPT_03_v2.md` step 0 checks the declared reason.

## §2 RED

### §2.1 Files written

| Path | Kind | Change |
|---|---|---|
| `packages/db/src/schema.spec.ts` | TEST | existing file (S01.T04). Import lines extended; new top-level `describe("S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql)")` appended with 21 tests. No existing test changed. |
| `packages/db/src/schema-drift.spec.ts` | TEST | new — 3 tests (BR-S02.T05-10) |
| `packages/db/src/migrate.spec.ts` | TEST | existing file. `readFileSync` added to the `node:fs` import; new top-level `describe("S02.T05 — 0002_cards.sql through the migration runner")` appended with 3 tests. No existing test changed. |
| `scripts/sql-lint.spec.ts` | TEST | new — 1 test (BR-S02.T05-07), root `scripts` vitest project |
| `packages/db/fixtures/cards-schema-0002.json` | TEST (fixture) | new — §1.15 Q1 option A |
| `packages/db/src/schema.ts` | STUB (types only) | appended `PriceSource`, `DamageMod`, `SetRow`, `CardRow`, `AttackRow`, `AbilityRow`, `WeaknessRow`, `ResistanceRow`, `PriceHistoryRow`, `CardsLatestPriceRow`, `CardsMarketUsdRow`. No value added; the `TABLES` entries are P3's. |

No production SQL was written. `0002_cards.sql` and `0002_cards.md` do not exist.

### §2.2 BR → test table

| BR ID | Test file | describe › it | What the assertion checks | Legacy ported |
|---|---|---|---|---|
| RN-01 | `schema.spec.ts` | RN-01 › raw_ptcg_json is NOT NULL | insert without `raw_ptcg_json` → `DbError`, code `SQLITE_CONSTRAINT`, message `NOT NULL constraint failed: cards.raw_ptcg_json` | — |
| RN-01 | `schema.spec.ts` | RN-01 › raw_tcgdex_json is nullable … | a card with `raw_tcgdex_json` NULL is stored and read back unchanged | — |
| RN-01 (loader round-trip) | — | — | DEFERRED → S02.T06 | — |
| BR-S02.T05-01 | `schema.spec.ts` | BR-01 › deleting a card removes its five child row sets | counts `[2,1,1,1,3,1]` before and all `0` after `DELETE FROM cards` (includes `cards_market_usd`) | — |
| BR-S02.T05-02 | `schema.spec.ts` | BR-02 › inserting a card with an unknown set_id raises SQLITE_CONSTRAINT_FOREIGNKEY | `SQLITE_CONSTRAINT` + `FOREIGN KEY constraint failed` | — |
| BR-S02.T05-02 | `schema.spec.ts` | BR-02 › deleting a set that still has cards is refused | same error; the set survives | — |
| BR-S02.T05-03 | `schema.spec.ts` | BR-03 › duplicate (card_id, idx) is rejected | for `attacks` and `abilities`: `UNIQUE constraint failed: <t>.card_id, <t>.idx`; same idx on another card accepted | — |
| BR-S02.T05-04 | `schema.spec.ts` | BR-04 › duplicate (card_id, type) is rejected | for `weaknesses` and `resistances`: `UNIQUE constraint failed: <t>.card_id, <t>.type`; another type accepted | — |
| BR-S02.T05-05 | `schema.spec.ts` | BR-05 › second insert of the same key updates, count stays 1 | upsert twice → count 1, `market` 2.5; plain duplicate insert → UNIQUE on the four PK columns | — |
| BR-S02.T05-05 | `schema.spec.ts` | BR-05 › price_history rejects an unknown source and a malformed snapshot_date | both → `CHECK constraint failed`; count 0 | — |
| BR-S02.T05-06 | `schema.spec.ts` | BR-06 › cards_market_usd rejects a second row for the same card | `UNIQUE constraint failed: cards_market_usd.card_id` | — |
| BR-S02.T05-06 | `schema.spec.ts` | BR-06 › cards_market_usd is a table, not a view, and apps/api never writes it | `sqlite_master.type = 'table'`; no INSERT/REPLACE/UPDATE/DELETE on it in `apps/api/src/**` | — |
| BR-S02.T05-06 | `schema.spec.ts` | BR-06 › a card with no prices stays visible through a LEFT JOIN … | `[{id, market_usd: null}]` | — |
| BR-S02.T05-07 | `schema.spec.ts` | BR-07 › cards_fts accepts an insert and a MATCH | `MATCH 'pokemon'` finds a row stored as `Pokémon`; `bm25(cards_fts, 0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5)` returns a number | — |
| BR-S02.T05-07 | `schema.spec.ts` | BR-07 › cards_fts columns follow the bm25 column-order contract | `PRAGMA table_info(cards_fts)` order; `USING fts5`; `unicode61 remove_diacritics 2` | — |
| BR-S02.T05-07 | `scripts/sql-lint.spec.ts` | BR-07 › `pnpm check` fails when the `-- @sqlite-only` tag … is removed, and passes with it | sql-lint exit 0 on the real file; exit 1 and `outside -- @sqlite-only block` once the tag lines are stripped | — |
| BR-S02.T05-08 | `migrate.spec.ts` | 0002 through the runner › 0002 applies on a fresh temp DB, version 2, zero rows, PRAGMA foreign_key_check clean | version 2, `schema_migrations.name = 'cards'`, 0 rows in the 9 new objects, empty `foreign_key_check` | — |
| BR-S02.T05-08 | `migrate.spec.ts` | … › 0002_cards.sql creates no row and runs inside a transaction | no `-- @no-transaction` on line 1; no `INSERT` outside comments | — |
| BR-S02.T05-08 | `migrate.spec.ts` | … › executing the 0002 SQL a second time fails and leaves the schema at version 2 | second `exec` throws `already exists`; version and ledger unchanged | — |
| BR-S02.T05-09 | `schema.spec.ts` | BR-09 › every *_norm column definition in 0002_cards.sql carries a BR-S02.T05-09 comment | 6 `name_norm`/`text_norm` definitions, each with `BR-S02.T05-09` (§1.13 Q7) | — |
| BR-S02.T05-09 (`norm()` equality) | — | — | DEFERRED → S02.T06 | — |
| BR-S02.T05-10 | `schema-drift.spec.ts` | BR-10 › 0002 tables match their TypeScript row types | per table: row-type keys = column list and nullable keys = nullable list (compile time); PRAGMA names/order/nullability = lists; `TABLES` descriptor = PRAGMA | — |
| BR-S02.T05-10 | `schema-drift.spec.ts` | BR-10 › the cards_latest_price view exposes exactly the CardsLatestPriceRow columns | names, order, types; descriptor present | — |
| BR-S02.T05-10 | `schema-drift.spec.ts` | BR-10 › fails when a column is added to the SQL without the type | after `ALTER TABLE cards ADD COLUMN rogue_col` the PRAGMA names differ from the descriptor | — |

### §2.3 Edge case → test table

| Edge case (§1.6) | Test |
|---|---|
| card with no TCGdex counterpart | RN-01 › raw_tcgdex_json is nullable …; Edge › tcgdex_legal_* accept 0, 1 and NULL, and reject '' and 2; the fixture card (all `tcgdex_*` NULL) |
| card numbered `TG01` | Edge › a card numbered TG01 is stored verbatim |
| damage text `30×` | Edge › damage_mod accepts '×' and rejects 'x' and '*' |
| non-numeric damage | Edge › an attack with non-numeric damage keeps the text and NULL number and modifier |
| card with no prices | BR-06 › a card with no prices stays visible through a LEFT JOIN … |
| re-load of the same set | BR-01 (cascade), BR-03/04 (uniqueness); the delete-then-insert itself is S02.T06 |
| source set disappears upstream | BR-02 › deleting a set that still has cards is refused |
| migration applied twice | migrate.spec › executing the 0002 SQL a second time fails … |
| FTS5 unavailable | not testable (environment); covered indirectly by BR-07 › cards_fts accepts an insert and a MATCH |

### §2.4 Expected failing tests

All 28 tests below must fail at RED; every other test in the workspace must pass.

- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > RN-01: both raw documents are preserved > raw_ptcg_json is NOT NULL`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > RN-01: both raw documents are preserved > raw_tcgdex_json is nullable: a card with no TCGdex counterpart is accepted`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-01: children cascade with their card > deleting a card removes its five child row sets`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-02: a card cannot exist without its set > inserting a card with an unknown set_id raises SQLITE_CONSTRAINT_FOREIGNKEY`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-02: a card cannot exist without its set > deleting a set that still has cards is refused`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-03: one attack / ability per index > duplicate (card_id, idx) is rejected`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-04: one weakness / resistance per energy type > duplicate (card_id, type) is rejected`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-05: one price observation per key > second insert of the same key updates, count stays 1`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-05: one price observation per key > price_history rejects an unknown source and a malformed snapshot_date`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-06: cards_market_usd is a maintained table with one row per card > cards_market_usd rejects a second row for the same card`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-06: cards_market_usd is a maintained table with one row per card > cards_market_usd is a table, not a view, and apps/api never writes it`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-06: cards_market_usd is a maintained table with one row per card > a card with no prices stays visible through a LEFT JOIN with a NULL market_usd`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-07: the FTS5 index and its bm25 column-order contract > cards_fts accepts an insert and a MATCH`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-07: the FTS5 index and its bm25 column-order contract > cards_fts columns follow the bm25 column-order contract`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-09: normalized columns document the norm() contract > every *_norm column definition in 0002_cards.sql carries a BR-S02.T05-09 comment`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Acceptance: named indexes > lists every named index of the 0002 tables`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Edge cases > a card numbered TG01 is stored verbatim`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Edge cases > damage_mod accepts '×' and rejects 'x' and '*'`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Edge cases > an attack with non-numeric damage keeps the text and NULL number and modifier`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Edge cases > tcgdex_legal_* accept 0, 1 and NULL, and reject '' and 2`
- `packages/db/src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Acceptance: typed fixture round-trip > a fixture card inserted through @pokesearch/db/schema reads back with identical values for every column`
- `packages/db/src/schema-drift.spec.ts > BR-S02.T05-10: 0002 row types vs the migrated database > 0002 tables match their TypeScript row types`
- `packages/db/src/schema-drift.spec.ts > BR-S02.T05-10: 0002 row types vs the migrated database > the cards_latest_price view exposes exactly the CardsLatestPriceRow columns`
- `packages/db/src/schema-drift.spec.ts > BR-S02.T05-10: 0002 row types vs the migrated database > fails when a column is added to the SQL without the type`
- `packages/db/src/migrate.spec.ts > S02.T05 — 0002_cards.sql through the migration runner > 0002 applies on a fresh temp DB, version 2, zero rows, PRAGMA foreign_key_check clean`
- `packages/db/src/migrate.spec.ts > S02.T05 — 0002_cards.sql through the migration runner > 0002_cards.sql creates no row and runs inside a transaction`
- `packages/db/src/migrate.spec.ts > S02.T05 — 0002_cards.sql through the migration runner > executing the 0002 SQL a second time fails and leaves the schema at version 2`
- `scripts/sql-lint.spec.ts > BR-S02.T05-07: sql-lint guards the -- @sqlite-only block of 0002_cards.sql > `pnpm check` fails when the `-- @sqlite-only` tag around `cards_fts` is removed, and passes with it`

### §2.5 Expected failure reason

| Test(s) | Reason |
|---|---|
| `packages/db/src/schema.spec.ts > … > raw_ptcg_json is NOT NULL` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > raw_tcgdex_json is nullable: a card with no TCGdex counterpart is accepted` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > deleting a card removes its five child row sets` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > inserting a card with an unknown set_id raises SQLITE_CONSTRAINT_FOREIGNKEY` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > deleting a set that still has cards is refused` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > duplicate (card_id, idx) is rejected` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > duplicate (card_id, type) is rejected` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > second insert of the same key updates, count stays 1` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > price_history rejects an unknown source and a malformed snapshot_date` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > cards_market_usd rejects a second row for the same card` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > cards_market_usd is a table, not a view, and apps/api never writes it` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > a card with no prices stays visible through a LEFT JOIN with a NULL market_usd` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > cards_fts accepts an insert and a MATCH` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > cards_fts columns follow the bm25 column-order contract` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > every *_norm column definition in 0002_cards.sql carries a BR-S02.T05-09 comment` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > lists every named index of the 0002 tables` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > a card numbered TG01 is stored verbatim` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > damage_mod accepts '×' and rejects 'x' and '*'` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > an attack with non-numeric damage keeps the text and NULL number and modifier` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > tcgdex_legal_* accept 0, 1 and NULL, and reject '' and 2` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `packages/db/src/schema.spec.ts > … > a fixture card inserted through @pokesearch/db/schema reads back with identical values for every column` | MISSING_ARTIFACT: `no such table: sets` — thrown by the shared `beforeEach` (`INSERT INTO sets`); removed by `0002_cards.sql` |
| `schema-drift.spec.ts > 0002 tables match their TypeScript row types` | assertion mismatch — `TABLES.sets is missing: expected undefined to be defined` |
| `schema-drift.spec.ts > the cards_latest_price view exposes exactly the CardsLatestPriceRow columns` | assertion mismatch — `TABLES.cards_latest_price is missing` |
| `schema-drift.spec.ts > fails when a column is added to the SQL without the type` | assertion mismatch — `TABLES.cards is missing` |
| `migrate.spec.ts > 0002 applies on a fresh temp DB, version 2, zero rows, PRAGMA foreign_key_check clean` | assertion mismatch — `expected 1 to be 2` (only 0001 is discovered) |
| `migrate.spec.ts > 0002_cards.sql creates no row and runs inside a transaction` | MISSING_ARTIFACT: `ENOENT: no such file or directory` for `packages/db/migrations/0002_cards.sql` |
| `migrate.spec.ts > executing the 0002 SQL a second time fails and leaves the schema at version 2` | assertion mismatch — `expected 1 to be 2` |
| `sql-lint.spec.ts > `pnpm check` fails when the `-- @sqlite-only` tag around `cards_fts` is removed, and passes with it` | MISSING_ARTIFACT: `ENOENT: no such file or directory` for `packages/db/migrations/0002_cards.sql` |

### §2.6 Decisions and ambiguities

1. **Extended SQLite codes are asserted through the message.** The spec's verification column names `SQLITE_CONSTRAINT_NOTNULL` / `SQLITE_CONSTRAINT_FOREIGNKEY`, but `DbError.code` carries only the primary code (VERBATIM `packages/db/src/client.ts:169-170`: `const primaryCode = errcode & 0xff; code = SQLiteErrorMap[primaryCode] …`). Tests assert `code === "SQLITE_CONSTRAINT"` plus SQLite's canonical message for the extended code (`NOT NULL constraint failed: cards.raw_ptcg_json`, `FOREIGN KEY constraint failed`, `UNIQUE constraint failed: <table>.<cols>`, `CHECK constraint failed`).
2. **Fixture content (§1.15 Q1, option A).** `cards-schema-0002.json` carries `sv1-86` Gardevoir ex copied verbatim from `cards-ptcg-sample.json` (`source.ptcg.cards`, and `raw_ptcg_json` is its compact JSON) and the `sv1` set from `cards-basic.json`'s source. Differences from the §1.15 description: the card has **1** attack (the source card has one; none was invented), and the fixture has **no price rows**, because `fixtureRowsSchema` and `TABLE_ORDER` in `packages/db/src/testing/index.ts` do not include `price_history` or `cards_market_usd`, so `loadFixture` would drop them. The cascade test builds its own 2 attacks and 3 price rows inline. Columns the source does not provide are NULL (`ptcgo_code`, set legalities and URLs, `stage` — its derivation is S02.T06's, `national_dex_json`, all `tcgdex_*`). `name_norm`/`text_norm` follow `norm()` of `04-data-model-overview.md:15`. `updated_at` is a fixed `2026-09-30T00:00:00Z`.
3. **"Through the typed layer" (Q3).** `loadFixture(db, "cards-schema-0002")` inserts; `db.get<SetRow>`, `db.get<CardRow>`, `db.all<AttackRow>` etc. read back; each row must `toEqual` its fixture row, and the card's key set must equal the fixture's (a DDL column missing from the fixture would appear as an extra `null` key and fail).
4. **BR-06 guard folded into a failing test.** "no write to `cards_market_usd` in `apps/api`" is true today, so on its own it would pass at RED. It shares a test with the "is a table, not a view" assertion, which fails first at RED.
5. **Index list = 21 names (Q4).** The test asserts the exact set of 21 named indexes of the §1.3 DDL, excluding `sqlite_autoindex_*`.
6. **BR-09 comments (Q7).** The test requires all 6 `name_norm`/`text_norm` column definitions to carry `BR-S02.T05-09` on their line. P3 must add the comment to the 5 lines the spec DDL leaves without it.
7. **Drift scope.** `cards_latest_price` is compared by names, order and types only: a view reports `notnull = 0` for every column. `cards_fts` is not in the drift test: it is a virtual table and the spec defines no row type for it. Nullability rule: nullable in TypeScript ⇔ `notnull = 0 AND pk = 0` in PRAGMA — so `cards.id` (`TEXT PRIMARY KEY`) and `attacks.id` (`INTEGER PRIMARY KEY`) are non-null in TS although PRAGMA reports `notnull = 0`.
8. **`TABLES` descriptor for the view.** The view test requires `TABLES.cards_latest_price` to exist with matching names and types; P3 adds it (with `notnull: false, pk: false, dflt_value: null` as PRAGMA reports).
9. **sql-lint test tree.** It needs both `packages/` and `apps/`. VERBATIM `scripts/sql-lint.mjs:152-153`: `...scanSourceFiles(join(rootDir, "apps")).catch?.(() => []) ?? [],` — `scanSourceFiles` is synchronous and throws on a missing folder before `.catch` is reached, so the `catch` is dead code. Out of scope here; noted for whoever owns sql-lint.
10. **"Applied twice" edge.** Tested by executing the file's SQL inside `db.transaction` after a normal `migrate`; expects `/already exists/` and an unchanged ledger.
11. **Row types written in RED.** They are contracts the tests type-check against (`expectTypeOf` in the drift test). Column order and nullability follow the §1.3 DDL exactly; `tcgdex_legal_*` are typed `0 | 1 | null`, `damage_mod` is `DamageMod | null`, `source` is `PriceSource`.
12. **Existing test files.** Only import lines were extended and new describes appended in `schema.spec.ts` and `migrate.spec.ts`; no existing assertion was touched.

### §2.7 Execution status

Tests: NOT EXECUTED — confirmation delegated to P3 step 0 (vitest's native binaries in `node_modules` are Windows builds and do not load in the Cowork shell).

Static checks run from the Cowork shell (Node 22, the repo's own pure-JS `typescript` and `eslint`):
- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` → exit 0, no output
- `node node_modules/typescript/bin/tsc -p scripts/tsconfig.json --noEmit` → exit 0, no output
- `node node_modules/eslint/bin/eslint.js packages/db/src/schema.ts packages/db/src/schema.spec.ts packages/db/src/schema-drift.spec.ts packages/db/src/migrate.spec.ts scripts/sql-lint.spec.ts` → exit 0, no output

## §3 GREEN

Run by P3-GREEN on 2026-09-30, in Claude Code. No `## §3 GREEN` existed before this one, so this is run 1.

### §3.1 Baseline

STEP 1 ran `pnpm test` and `pnpm typecheck` on the working tree before any production file was written.

| Check | Expected (§2.4 / §2.5) | Actual | Verdict |
|---|---|---|---|
| Failing tests | 28 | 28 | match |
| Passing tests | every other test in the workspace | 448 passed, 39 test files (4 failed files) | match |
| Failing test names | the 28 of §2.4 | the same 28, name for name | match |
| Failure reasons | §2.5 | see below | match |
| `pnpm typecheck` | clean | exit 0, no diagnostics | match (case d clear) |

Failure reasons, checked one by one against §2.5:

- the 21 `schema.spec.ts` tests: all failed with `DbError: no such table: sets`, raised by the shared
  `beforeEach` at `src/schema.spec.ts:213` (`insert("sets", …)`) — the declared `MISSING_ARTIFACT` reason.
- `schema-drift.spec.ts` (3): `TABLES.sets is missing`, `TABLES.cards_latest_price is missing`,
  `TABLES.cards is missing` — the declared assertion mismatches.
- `migrate.spec.ts > 0002 applies on a fresh temp DB …`: `expected 1 to be 2` — as declared.
- `migrate.spec.ts > 0002_cards.sql creates no row and runs inside a transaction`: `ENOENT … 0002_cards.sql` — as declared.
- `migrate.spec.ts > executing the 0002 SQL a second time …`: `expected 1 to be 2` — as declared.
- `scripts/sql-lint.spec.ts` (1): `ENOENT … 0002_cards.sql` — as declared.

No test outside §2.4 failed (case a clear), no test in §2.4 passed (case b clear), and every reason matched
its declaration (case c clear). **Baseline clean.**

NOTE (P3): the RED commit was not made by this phase. The §2.1 files, the handoff, the spec and the stage
README were already committed as `72c1ebd feat: add fixture for Gardevoir ex card and implement schema drift
tests`, authored `2026-09-30 11:35:44 -0300` — while this phase's baseline `pnpm test` was still running
(it started 11:35:34). The working tree was clean at that point, so the baseline evidence above is the
evidence for exactly the content of `72c1ebd`. RED_COMMIT is therefore set to `72c1ebd`, not to a commit this
phase created; the deviation is recorded in §3.5 (D-1).

`72c1ebd` swept in one file that must not be tracked: `apps/api/src/__lint-fixture__.ts`, which
`scripts/lint-config.spec.ts` creates and deletes at runtime (BR-S01.T02-03) and which happened to be on disk
during that commit. This phase removed it in its own commit before implementing:
`f8a03e6 chore: untrack the transient eslint fixture swept into 72c1ebd`.

- RED_COMMIT: `72c1ebd41d5bdaf095ea19c35d545ebdf36008d2`
- Pre-implementation hygiene commit: `f8a03e6`

### §3.2 Files changed

`git diff --stat 72c1ebd`, VERBATIM (run with the new files staged, so untracked files appear):

```
 apps/api/src/__lint-fixture__.ts      |   2 -
 packages/db/migrations/0002_cards.md  | 176 ++++++++++++++++++++++++++++++++
 packages/db/migrations/0002_cards.sql | 187 ++++++++++++++++++++++++++++++++++
 packages/db/package.json              |   1 +
 packages/db/src/schema.ts             | 156 ++++++++++++++++++++++++++++
 5 files changed, 520 insertions(+), 2 deletions(-)
```

Against the §1.8 target list: both CREATE targets written; both MODIFY targets touched; no test file, fixture,
test helper or test config created, edited, renamed or deleted; nothing in DO NOT TOUCH changed. The
`apps/api/src/__lint-fixture__.ts` deletion is the `f8a03e6` hygiene commit described in §3.1, not a
production change of this subtask.

### §3.3 BR → implementation table

| BR ID | Test(s) from §2.2 | Implementing code | Status |
|---|---|---|---|
| RN-01 | `schema.spec.ts` › RN-01 › raw_ptcg_json is NOT NULL; › raw_tcgdex_json is nullable … | `0002_cards.sql:cards` — `raw_ptcg_json TEXT NOT NULL`, `raw_tcgdex_json TEXT` (nullable); every other card column is a derivation, listed in `0002_cards.md` §3 | IMPLEMENTED |
| RN-01 (loader round-trip) | — | — | DEFERRED → S02.T06 (§1.11a) |
| BR-S02.T05-01 | `schema.spec.ts` › BR-01 › deleting a card removes its five child row sets | `0002_cards.sql` — `REFERENCES cards(id) ON DELETE CASCADE` on `attacks.card_id`, `abilities.card_id`, `weaknesses.card_id`, `resistances.card_id`, `price_history.card_id` and `cards_market_usd.card_id` | IMPLEMENTED |
| BR-S02.T05-02 | `schema.spec.ts` › BR-02 › inserting a card with an unknown set_id …; › deleting a set that still has cards is refused | `0002_cards.sql:cards` — `set_id TEXT NOT NULL REFERENCES sets(id)` with no `ON DELETE`, so the delete is restricted | IMPLEMENTED |
| BR-S02.T05-03 | `schema.spec.ts` › BR-03 › duplicate (card_id, idx) is rejected | `0002_cards.sql` — `CREATE UNIQUE INDEX attacks_card_idx_uq ON attacks (card_id, idx)` and `abilities_card_idx_uq ON abilities (card_id, idx)` | IMPLEMENTED |
| BR-S02.T05-04 | `schema.spec.ts` › BR-04 › duplicate (card_id, type) is rejected | `0002_cards.sql` — `PRIMARY KEY (card_id, type)` on `weaknesses` and on `resistances` | IMPLEMENTED |
| BR-S02.T05-05 | `schema.spec.ts` › BR-05 › second insert of the same key updates …; › price_history rejects an unknown source and a malformed snapshot_date | `0002_cards.sql:price_history` — `PRIMARY KEY (card_id, snapshot_date, source, variant)`, `CHECK (source IN ('tcgplayer', 'cardmarket'))`, `CHECK (length(snapshot_date) = 10)` | IMPLEMENTED |
| BR-S02.T05-06 | `schema.spec.ts` › BR-06 › cards_market_usd rejects a second row …; › … is a table, not a view, and apps/api never writes it; › a card with no prices stays visible through a LEFT JOIN … | `0002_cards.sql:cards_market_usd` — `CREATE TABLE` (not a view) with `card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE`, plus `cards_market_usd_price_idx`; the rationale and the ETL-only ownership are in `0002_cards.md` §1 D1 | IMPLEMENTED |
| BR-S02.T05-07 | `schema.spec.ts` › BR-07 › cards_fts accepts an insert and a MATCH; › cards_fts columns follow the bm25 column-order contract; `scripts/sql-lint.spec.ts` › BR-07 | `0002_cards.sql` — the `-- @postgres:` note followed by `-- @sqlite-only` / `CREATE VIRTUAL TABLE cards_fts USING fts5(…, tokenize = 'unicode61 remove_diacritics 2')` / `-- @end`; the weight table is in `0002_cards.md` §4 | IMPLEMENTED |
| BR-S02.T05-08 | `migrate.spec.ts` › 0002 applies on a fresh temp DB …; › creates no row and runs inside a transaction; › executing the 0002 SQL a second time … | `0002_cards.sql` as a whole — no `INSERT` statement, no `-- @no-transaction` marker on line 1 (so `migrate()` wraps it in one transaction), no `IF NOT EXISTS` anywhere | IMPLEMENTED |
| BR-S02.T05-09 | `schema.spec.ts` › BR-09 › every *_norm column definition … carries a BR-S02.T05-09 comment | `0002_cards.sql` — the six `name_norm` / `text_norm` definitions on `sets`, `cards`, `attacks`, `abilities`, each commented `norm(<col>), written only by the loader; BR-S02.T05-09`; the `norm()` contract is quoted in `0002_cards.md` §2 | IMPLEMENTED (schema half) |
| BR-S02.T05-09 (`norm()` equality) | — | — | DEFERRED → S02.T06 (§1.11a) |
| BR-S02.T05-10 | `schema-drift.spec.ts` › BR-10 › 0002 tables match their TypeScript row types; › the cards_latest_price view …; › fails when a column is added … | `packages/db/src/schema.ts:TABLES` — 9 new descriptors (`sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `price_history`, `cards_latest_price`, `cards_market_usd`), generated from `PRAGMA table_info` of the migrated database; the row types they pair with (`SetRow` … `CardsMarketUsdRow`, `PriceSource`, `DamageMod`) were written as contracts in P2 and left unchanged | IMPLEMENTED |

Every ID of the §1.2 master list (RN-01, BR-S02.T05-01 … -10, 11 IDs) appears above. No BR of §2.2 is without
implementing code, and no non-DEFERRED BR of §1.2 is without a test.

### §3.4 TCRs

None. No test file, fixture, test helper, snapshot or test configuration was created, edited, renamed or
deleted by this phase, and no test needed one: every one of the 28 passed against the DDL as specified in §1.3.

### §3.5 Deviations and decisions

- **D-1 — the RED commit was made outside this phase.** STEP 1 prescribes that P3 commits the §2.1 files as
  `test(S02.T05): RED — <n> failing tests` and sets RED_COMMIT to that hash. Those files were already
  committed as `72c1ebd`, with a different message, while this phase's baseline run was in flight (§3.1).
  RED_COMMIT is set to `72c1ebd` rather than rewriting someone else's commit; the baseline evidence in §3.1
  corresponds exactly to its content, so the chain of evidence holds. Flagged for P4A/P4.
- **D-2 — one extra commit before implementation.** `f8a03e6` removes `apps/api/src/__lint-fixture__.ts`,
  a runtime artifact of `scripts/lint-config.spec.ts` that `72c1ebd` tracked by accident. It is not a §1.8
  target; it was committed on its own so the GREEN diff stays production-only. It is not a test-file change:
  the file is generated by a test, never read as one, and `lint-config.spec.ts` recreates it on every run
  (all 4 of its tests pass in §3.6).
- **§1.13 Q4 resolved as proposed — 21 named indexes, not 18.** The §1.3 DDL names 21 (`sets` 3, `cards` 8,
  `attacks` 3, `abilities` 2, `weaknesses` 1, `resistances` 1, `price_history` 2, `cards_market_usd` 1); 18 is
  the count up to `resistances`. All 21 are created; the spec's "all 18 named indexes" wording is corrected in
  `0002_cards.md` §5 rather than in the spec body, which this phase may not rewrite.
- **§1.13 Q5 resolved as proposed.** `packages/db/package.json` gains `"./schema": "./src/schema.ts"`, so the
  subpath the spec and D-009 name (`@pokesearch/db/schema`) resolves. One line; no import was rewritten to use
  it, since the existing files import `./schema.js` relatively.
- **§1.13 Q7 resolved as proposed.** The §1.3 DDL comments only `sets.name_norm`. The other five `*_norm`
  definitions received the same `BR-S02.T05-09` comment, which is what §2.2 BR-09 asserts (6 lines).
- **§1.13 Q6 left untouched, as proposed.** `sqliteDialect.numericOrder` still returns only
  `CAST(<col> AS INTEGER)` without the secondary `<col>`, and `sqliteDialect.rank()` still builds `bm25(<weights>)`
  without the table argument that `bm25(cards_fts, …)` requires. No migration uses either, so neither is in
  scope here. Both stay flagged for their first consumers: S02.T09 and S02.T08.
- **`TABLES` descriptors were generated, not hand-typed.** Each of the 9 entries was emitted from
  `PRAGMA table_info` of a database with 0001 and 0002 applied, then committed as source. This is what
  BR-S02.T05-10 compares against at run time, so generating it removes transcription error as a failure mode
  while leaving the descriptors hand-maintained from here on (D-009 keeps them hand-written).
- **The view's descriptor uses PRAGMA's own values.** §2.6 decision 8 proposed
  `notnull: false, pk: false, dflt_value: null` for `cards_latest_price`. Measured, `PRAGMA
  table_info(cards_latest_price)` reports exactly that for all 14 columns, so the descriptor is PRAGMA-faithful
  and the proposal and the measurement agree.
- **`cards_market_usd` carries `snapshot_date`.** Present in the §1.3 DDL and kept: the legacy object was a
  view over `cards_latest_price` and could not report how stale a price was. Recorded in `0002_cards.md` §1 D1.
- **Nothing was implemented that the spec does not ask for.** No row is inserted, no index beyond the 21, no
  trigger, no `PRAGMA`, and `cards_fts` is left empty (populating it is S02.T08).

### §3.6 Final command output

`pnpm test` — exit 0:

```
 Test Files  39 passed (39)
      Tests  476 passed (476)
   Duration  30.24s (transform 9.11s, setup 10.96s, collect 23.22s, tests 87.72s, environment 11.72s, prepare 10.78s)
```

No failures. All 28 tests of §2.4 pass, and the 448 tests that passed at baseline still pass
(448 + 28 = 476).

`pnpm typecheck` — exit 0:

```
$ pnpm -r run typecheck && tsc -p scripts/tsconfig.json
Scope: 6 of 7 workspace projects
$ tsc --noEmit
$ tsc --noEmit
$ tsc --noEmit
$ tsc --noEmit
$ tsc --noEmit
$ tsc --noEmit
```

`pnpm lint` — exit 0:

```
$ pnpm -r run lint && eslint scripts
Scope: 6 of 7 workspace projects
$ eslint .
$ eslint .
$ eslint .
$ eslint .
$ eslint .
$ eslint .
```

`node scripts/sql-lint.mjs` — exit 0, no output (BR-S02.T05-07 on the real file; the negative half, exit 1 with
`outside -- @sqlite-only block` once the tag is stripped, is asserted by `scripts/sql-lint.spec.ts`).

Step-8 measurement, taken on an empty database with 0001 then 0002 applied and recorded in `0002_cards.md` §5:
20 480 bytes after 0001, 200 704 bytes after 0002; 16 tables (including the 5 FTS5 shadow tables), 1 view,
29 indexes — 21 named on the 0002 tables, 2 named on the 0001 tables, 6 implicit `sqlite_autoindex_*`.

### §3.7 Loop

One round. Nothing failed.

| Round | Ran | Result | Fix applied |
|---|---|---|---|
| 1 | `pnpm test`, `pnpm typecheck`, `pnpm lint`, `node scripts/sql-lint.mjs` | 476/476 passed; typecheck, lint and sql-lint all exit 0 | none needed |

The implementation was written once, in the order of §1.5 steps 1–4 and 7–8: the DDL down to `resistances`,
then `price_history` / `cards_latest_price` / `cards_market_usd`, then the tagged `cards_fts` block, then the
`TABLES` entries generated from the applied schema, then the companion note with the measurement. Steps 5 and 6
were P2's (the specs and the fixture) and were not touched.

### §3.8 Status

**PASSED.** §3.6 shows `pnpm test` 476/476 with exit 0, `pnpm typecheck` exit 0, `pnpm lint` exit 0, and
`node scripts/sql-lint.mjs` exit 0. No TCR is open and no new deferral was created.

## §4A VERIFY

Collected in a fresh session. Evidence only; no judgement of the implementation.

### §4A.1 Repository state

`git rev-parse HEAD` — exit 0

```
f8388e7f3b7270b8b17f1911c14e5c0b91954f30
```

`git status --porcelain` — exit 0

```
```

Empty output. **No uncommitted change.**

`git log --oneline 72c1ebd41d5bdaf095ea19c35d545ebdf36008d2~1..HEAD` — exit 0

```
f8388e7 docs(S02.T05): record GREEN_COMMIT in the handoff and the log
f083c98 feat(S02.T05): GREEN — cards schema migration 0002 with FTS5 and row types
f8a03e6 chore: untrack the transient eslint fixture swept into 72c1ebd
72c1ebd feat: add fixture for Gardevoir ex card and implement schema drift tests
```

`git diff --stat 72c1ebd41d5bdaf095ea19c35d545ebdf36008d2..HEAD` — exit 0

```
 apps/api/src/__lint-fixture__.ts                   |   2 -
 .../T05-cards-schema-migration.log.md              | 103 +++++++++++
 .../T05-cards-schema-migration.md                  |   2 +-
 .../handoff/T05-cards-schema-migration.handoff.md  | 201 ++++++++++++++++++++-
 packages/db/migrations/0002_cards.md               | 176 ++++++++++++++++++
 packages/db/migrations/0002_cards.sql              | 187 +++++++++++++++++++
 packages/db/package.json                           |   1 +
 packages/db/src/schema.ts                          | 156 ++++++++++++++++
 8 files changed, 820 insertions(+), 8 deletions(-)
```

`git diff --name-only 72c1ebd41d5bdaf095ea19c35d545ebdf36008d2..HEAD` — exit 0

```
apps/api/src/__lint-fixture__.ts
docs/stages/02-card-data-and-search/T05-cards-schema-migration.log.md
docs/stages/02-card-data-and-search/T05-cards-schema-migration.md
docs/stages/02-card-data-and-search/handoff/T05-cards-schema-migration.handoff.md
packages/db/migrations/0002_cards.md
packages/db/migrations/0002_cards.sql
packages/db/package.json
packages/db/src/schema.ts
```

### §4A.2 Check results

#### `pnpm check` — exit 0

Sub-commands executed, in order, as echoed by pnpm:

```
$ pnpm typecheck && pnpm lint && node scripts/sql-lint.mjs && node scripts/notice-lint.mjs && pnpm schema:check && pnpm test
$ pnpm -r run typecheck && tsc -p scripts/tsconfig.json
$ pnpm -r run lint && eslint scripts
$ pnpm --filter @pokesearch/shared schema:check
$ vitest run
```

- `pnpm typecheck` — six `tsc --noEmit` runs plus `tsc -p scripts/tsconfig.json`; no diagnostic emitted.
- `pnpm lint` — six `eslint .` runs plus `eslint scripts`; no diagnostic emitted.
- `node scripts/sql-lint.mjs` — no output.
- `node scripts/notice-lint.mjs` — no output.
- `pnpm schema:check` — VERBATIM:

```
All schemas are up-to-date and deterministic.
```

- `pnpm test` — VERBATIM summary:

```
 Test Files  39 passed (39)
      Tests  476 passed (476)
   Start at  12:11:11
   Duration  20.82s (transform 6.69s, setup 7.37s, collect 14.81s, tests 66.00s, environment 10.80s, prepare 10.25s)
```

No failure in any sub-command.

The esbuild warning `Unrecognized target environment "es2024" [tsconfig.json]` is emitted repeatedly by the
vite/esbuild transform during `vitest run`. It is a warning, not an error, and does not affect the exit code.

#### `pnpm build` — exit 0

VERBATIM:

```
$ pnpm -r --if-present run build
Scope: 6 of 7 workspace projects
$ vite build
vite v5.4.21 building for production...
transforming...
✓ 192 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.41 kB │ gzip:   0.29 kB
dist/assets/index-KNoAnyLu.css    2.07 kB │ gzip:   0.82 kB
dist/assets/index-CKelI_1k.js   401.08 kB │ gzip: 122.52 kB
✓ built in 1.34s
```

No failure.

#### `node scripts/docs-lint.mjs --strict` — exit 0

No output on stdout or stderr. No failure.

#### `pnpm vitest run packages/db/src/schema.spec.ts packages/db/src/schema-drift.spec.ts packages/db/src/migrate.spec.ts scripts/sql-lint.spec.ts --reporter=verbose` — exit 0

The four test files of §2.1. VERBATIM summary:

```
 Test Files  4 passed (4)
      Tests  60 passed (60)
   Start at  12:11:55
   Duration  1.54s (transform 1.33s, setup 2.20s, collect 370ms, tests 897ms, environment 1ms, prepare 602ms)
```

Verbose listing of the S02.T05 tests, VERBATIM (ANSI colour codes stripped, reordered by file for readability —
vitest interleaves the projects):

```
 ✓  @pokesearch/db  src/schema-drift.spec.ts > BR-S02.T05-10: 0002 row types vs the migrated database > 0002 tables match their TypeScript row types 24ms
 ✓  @pokesearch/db  src/schema-drift.spec.ts > BR-S02.T05-10: 0002 row types vs the migrated database > the cards_latest_price view exposes exactly the CardsLatestPriceRow columns 16ms
 ✓  @pokesearch/db  src/schema-drift.spec.ts > BR-S02.T05-10: 0002 row types vs the migrated database > fails when a column is added to the SQL without the type 15ms
 ✓  scripts  scripts/sql-lint.spec.ts > BR-S02.T05-07: sql-lint guards the -- @sqlite-only block of 0002_cards.sql > `pnpm check` fails when the `-- @sqlite-only` tag around `cards_fts` is removed, and passes with it 143ms
 ✓  @pokesearch/db  src/migrate.spec.ts > S02.T05 — 0002_cards.sql through the migration runner > 0002 applies on a fresh temp DB, version 2, zero rows, PRAGMA foreign_key_check clean 11ms
 ✓  @pokesearch/db  src/migrate.spec.ts > S02.T05 — 0002_cards.sql through the migration runner > 0002_cards.sql creates no row and runs inside a transaction 5ms
 ✓  @pokesearch/db  src/migrate.spec.ts > S02.T05 — 0002_cards.sql through the migration runner > executing the 0002 SQL a second time fails and leaves the schema at version 2 11ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > RN-01: both raw documents are preserved > raw_ptcg_json is NOT NULL 13ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > RN-01: both raw documents are preserved > raw_tcgdex_json is nullable: a card with no TCGdex counterpart is accepted 11ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-01: children cascade with their card > deleting a card removes its five child row sets 14ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-02: a card cannot exist without its set > inserting a card with an unknown set_id raises SQLITE_CONSTRAINT_FOREIGNKEY 14ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-02: a card cannot exist without its set > deleting a set that still has cards is refused 12ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-03: one attack / ability per index > duplicate (card_id, idx) is rejected 13ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-04: one weakness / resistance per energy type > duplicate (card_id, type) is rejected 12ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-05: one price observation per key > second insert of the same key updates, count stays 1 11ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-05: one price observation per key > price_history rejects an unknown source and a malformed snapshot_date 12ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-06: cards_market_usd is a maintained table with one row per card > cards_market_usd rejects a second row for the same card 12ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-06: cards_market_usd is a maintained table with one row per card > cards_market_usd is a table, not a view, and apps/api never writes it 14ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-06: cards_market_usd is a maintained table with one row per card > a card with no prices stays visible through a LEFT JOIN with a NULL market_usd 11ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-07: the FTS5 index and its bm25 column-order contract > cards_fts accepts an insert and a MATCH 11ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-07: the FTS5 index and its bm25 column-order contract > cards_fts columns follow the bm25 column-order contract 10ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > BR-S02.T05-09: normalized columns document the norm() contract > every *_norm column definition in 0002_cards.sql carries a BR-S02.T05-09 comment 11ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Acceptance: named indexes > lists every named index of the 0002 tables 11ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Edge cases > a card numbered TG01 is stored verbatim 12ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Edge cases > damage_mod accepts '×' and rejects 'x' and '*' 13ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Edge cases > an attack with non-numeric damage keeps the text and NULL number and modifier 12ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Edge cases > tcgdex_legal_* accept 0, 1 and NULL, and reject '' and 2 17ms
 ✓  @pokesearch/db  src/schema.spec.ts > S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql) > Acceptance: typed fixture round-trip > a fixture card inserted through @pokesearch/db/schema reads back with identical values for every column 18ms
```

The remaining 32 of the 60 tests are the pre-existing S01.T04 tests in `schema.spec.ts` and `migrate.spec.ts`;
all passed.

No failure in any command. Nothing to record under "every failure in full".

### §4A.3 Expected tests

All 28 tests of §2.4, matched in full against the verbose run above. The describe paths are abbreviated with `…`
in this table for width; each was compared against the complete §2.4 text before being recorded.

| # | Test | Result |
|---|---|---|
| 1 | `schema.spec.ts > S02.T05 … > RN-01 … > raw_ptcg_json is NOT NULL` | PASS |
| 2 | `schema.spec.ts > S02.T05 … > RN-01 … > raw_tcgdex_json is nullable: a card with no TCGdex counterpart is accepted` | PASS |
| 3 | `schema.spec.ts > S02.T05 … > BR-S02.T05-01 … > deleting a card removes its five child row sets` | PASS |
| 4 | `schema.spec.ts > S02.T05 … > BR-S02.T05-02 … > inserting a card with an unknown set_id raises SQLITE_CONSTRAINT_FOREIGNKEY` | PASS |
| 5 | `schema.spec.ts > S02.T05 … > BR-S02.T05-02 … > deleting a set that still has cards is refused` | PASS |
| 6 | `schema.spec.ts > S02.T05 … > BR-S02.T05-03 … > duplicate (card_id, idx) is rejected` | PASS |
| 7 | `schema.spec.ts > S02.T05 … > BR-S02.T05-04 … > duplicate (card_id, type) is rejected` | PASS |
| 8 | `schema.spec.ts > S02.T05 … > BR-S02.T05-05 … > second insert of the same key updates, count stays 1` | PASS |
| 9 | `schema.spec.ts > S02.T05 … > BR-S02.T05-05 … > price_history rejects an unknown source and a malformed snapshot_date` | PASS |
| 10 | `schema.spec.ts > S02.T05 … > BR-S02.T05-06 … > cards_market_usd rejects a second row for the same card` | PASS |
| 11 | `schema.spec.ts > S02.T05 … > BR-S02.T05-06 … > cards_market_usd is a table, not a view, and apps/api never writes it` | PASS |
| 12 | `schema.spec.ts > S02.T05 … > BR-S02.T05-06 … > a card with no prices stays visible through a LEFT JOIN with a NULL market_usd` | PASS |
| 13 | `schema.spec.ts > S02.T05 … > BR-S02.T05-07 … > cards_fts accepts an insert and a MATCH` | PASS |
| 14 | `schema.spec.ts > S02.T05 … > BR-S02.T05-07 … > cards_fts columns follow the bm25 column-order contract` | PASS |
| 15 | `schema.spec.ts > S02.T05 … > BR-S02.T05-09 … > every *_norm column definition in 0002_cards.sql carries a BR-S02.T05-09 comment` | PASS |
| 16 | `schema.spec.ts > S02.T05 … > Acceptance: named indexes > lists every named index of the 0002 tables` | PASS |
| 17 | `schema.spec.ts > S02.T05 … > Edge cases > a card numbered TG01 is stored verbatim` | PASS |
| 18 | `schema.spec.ts > S02.T05 … > Edge cases > damage_mod accepts '×' and rejects 'x' and '*'` | PASS |
| 19 | `schema.spec.ts > S02.T05 … > Edge cases > an attack with non-numeric damage keeps the text and NULL number and modifier` | PASS |
| 20 | `schema.spec.ts > S02.T05 … > Edge cases > tcgdex_legal_* accept 0, 1 and NULL, and reject '' and 2` | PASS |
| 21 | `schema.spec.ts > S02.T05 … > Acceptance: typed fixture round-trip > a fixture card inserted through @pokesearch/db/schema reads back with identical values for every column` | PASS |
| 22 | `schema-drift.spec.ts > BR-S02.T05-10 … > 0002 tables match their TypeScript row types` | PASS |
| 23 | `schema-drift.spec.ts > BR-S02.T05-10 … > the cards_latest_price view exposes exactly the CardsLatestPriceRow columns` | PASS |
| 24 | `schema-drift.spec.ts > BR-S02.T05-10 … > fails when a column is added to the SQL without the type` | PASS |
| 25 | `migrate.spec.ts > S02.T05 … > 0002 applies on a fresh temp DB, version 2, zero rows, PRAGMA foreign_key_check clean` | PASS |
| 26 | `migrate.spec.ts > S02.T05 … > 0002_cards.sql creates no row and runs inside a transaction` | PASS |
| 27 | `migrate.spec.ts > S02.T05 … > executing the 0002 SQL a second time fails and leaves the schema at version 2` | PASS |
| 28 | `scripts/sql-lint.spec.ts > BR-S02.T05-07 … > sql-lint guards the -- @sqlite-only block of 0002_cards.sql` | PASS |

28 PASS, 0 FAIL, 0 NOT FOUND.

### §4A.4 Fixes applied

none.

### §4A.5 Verdict

**CLEAN.**

- `pnpm check` exit 0.
- `pnpm build` exit 0.
- `node scripts/docs-lint.mjs --strict` exit 0.
- `pnpm vitest run` over the four §2.1 files exit 0.
- All 28 tests of §2.4 PASS.
- `git status --porcelain` empty; no uncommitted change.

## §4 AUDIT

Auditor: P4-AUDIT (Cowork), 2026-09-30. HEAD at audit: `ea6a6f8` (`docs(S02.T05): verification evidence`). The only commit after §4A.1's HEAD is P4A's own, touching the handoff and the spec's `Owner / Updated` cell, which is allowed. No test suite was run by this phase; §4A is the execution evidence. Independent checks below were run from the Cowork shell with read-only git (temp index) and `node:sqlite` (SQLite 3.51.3).

### §4.1 Checks A–G

**A. Test integrity — PASS.**
`git diff --name-status 72c1ebd..HEAD` lists no test file, fixture, test helper or test config:

```
D	apps/api/src/__lint-fixture__.ts
A	docs/stages/02-card-data-and-search/T05-cards-schema-migration.log.md
M	docs/stages/02-card-data-and-search/T05-cards-schema-migration.md
M	docs/stages/02-card-data-and-search/handoff/T05-cards-schema-migration.handoff.md
A	packages/db/migrations/0002_cards.md
A	packages/db/migrations/0002_cards.sql
M	packages/db/package.json
M	packages/db/src/schema.ts
```

`git diff --stat 72c1ebd..HEAD -- '*.spec.ts' '*.spec.mjs' '*.test.*' '**/fixtures/**' '**/__fixtures__/**' '**/testing/**' 'vitest.config.ts' '**/vitest.config.ts'` → empty. No TCR was raised (§3.4).

**B. Scope — PASS, with one explained extra.**
Every path above is in §1.8 CREATE/MODIFY, or is the log, the handoff or the spec status cell — except `apps/api/src/__lint-fixture__.ts` (deleted). That file is a runtime artifact of `scripts/lint-config.spec.ts` that the out-of-phase RED commit tracked by accident; its removal in `f8a03e6` restores the tree, it is not implementation. Nothing in §1.8 DO NOT TOUCH changed.

**C. Business rules — see §4.2.** All 11 IDs MET, two with justified deferred halves.

`0002_cards.sql` against the spec's DDL (§1.3), `diff` of the fenced block vs the file: the only differences are (a) the five `BR-S02.T05-09` column comments required by §2.6 decision 6 plus a reworded sixth, (b) one space of alignment on two `attacks` index lines, (c) a two-line comment on the bm25 column-order contract above `cards_fts` that deliberately avoids the word `bm25` (sql-lint flags it even in comments). No DDL statement differs. File is UTF-8 with LF endings.

**D. Edge cases and acceptance — PASS.**
Every §1.6 edge case maps to a test in §2.3 except "FTS5 unavailable" (environmental, accepted in §1.6). Every §1.7 RUNNABLE NOW check maps to a §2.4 test, and §4A.3 reports all 28 as PASS. Acceptance #9 (`pnpm check` with and without the tag) is covered by `scripts/sql-lint.spec.ts` and by `pnpm check` exit 0 in §4A.2.

Independent confirmation (Cowork shell, `node:sqlite`, 0001 + 0002 applied to an empty file):

```
objects [{"type":"index","c":29},{"type":"table","c":16},{"type":"view","c":1}]
named idx on 0002 21
no raw_ptcg -> 1299 NOT NULL constraint failed: cards.raw_ptcg_json
unknown set -> 787 FOREIGN KEY constraint failed
delete set w/ cards -> 787 FOREIGN KEY constraint failed
after cascade { m: 0, w: 0 }
size bytes 200704
```

These match `0002_cards.md` §5 (16 tables, 1 view, 29 indexes, 21 named, 200 704 bytes).

**E. Evidence consistency — PASS.**
§3.6 and the log report 476 tests / 39 files, exit 0 for test, typecheck, lint, sql-lint; §4A.2 reports the same from a fresh session (`pnpm check` 476/476, `pnpm build` 0, docs-lint `--strict` 0); §4A.3 lists all 28 §2.4 tests as PASS, 0 NOT FOUND. The log's Status (`IN_PROGRESS — P3-GREEN PASSED; DONE is P4-AUDIT's to set`) matches the evidence and the pipeline rule.

**F. Deferrals — JUSTIFIED.**
Both OUT deferrals (RN-01 loader round-trip; BR-S02.T05-09 `norm()` equality) and the §1.15 Q1 debt (`cards-basic.json` to the 0002 shape) name S02.T06, whose status is `TODO` and which has no `.log.md`. Each needs the loader and its `norm()`, which do not exist. All three are in the log's Deferrals table, which S02.T06's P1 reads (S02.T06 depends on S02.T05).
The two dialect findings (`numericOrder`, `rank()`) are not deferrals of this subtask's work; they are recorded in the log for S02.T08 and S02.T09, both of which depend on S02.T05, so their P1 reads them.

**G. Conventions — PASS.**
`schema.ts` descriptors are plain literals, no casts or non-null assertions; `package.json` gains only the `./schema` export (§1.13 Q5). The `_uq` suffix on two unique indexes departs from `MIGRATIONS.md`'s `<table>_<cols>_idx`, but the names are the spec's (§1.3), so this is not a P3 deviation.

### §4.2 BR verdict table

| BR ID | Test (§2.2) | Implementation (§3.3 / log) | Verdict | Evidence |
|---|---|---|---|---|
| RN-01 | raw_ptcg_json is NOT NULL; raw_tcgdex_json is nullable … | `cards.raw_ptcg_json TEXT NOT NULL`, `raw_tcgdex_json TEXT` | MET (schema half) + DEFERRED-JUSTIFIED (loader round-trip → S02.T06) | errcode 1299 reproduced independently |
| BR-S02.T05-01 | deleting a card removes its five child row sets | `ON DELETE CASCADE` on 6 child FKs | MET | cascade reproduced independently |
| BR-S02.T05-02 | unknown set_id …; deleting a set that still has cards … | `cards.set_id REFERENCES sets(id)` | MET | errcode 787 reproduced |
| BR-S02.T05-03 | duplicate (card_id, idx) is rejected | `attacks_card_idx_uq`, `abilities_card_idx_uq` | MET | index list |
| BR-S02.T05-04 | duplicate (card_id, type) is rejected | `PRIMARY KEY (card_id, type)` ×2 | MET | DDL |
| BR-S02.T05-05 | second insert …; unknown source / malformed date | 4-col PK + 2 CHECKs | MET | DDL |
| BR-S02.T05-06 | rejects a second row; is a table and apps/api never writes it; LEFT JOIN | `CREATE TABLE cards_market_usd` | MET | `sqlite_master` type `table` |
| BR-S02.T05-07 | FTS insert + MATCH; column order; sql-lint with/without tag | tagged `cards_fts` block | MET | §4A.2 `pnpm check` 0 |
| BR-S02.T05-08 | 0002 applies …; no row / transaction; applied twice | file content | MET | §4A.3 |
| BR-S02.T05-09 | every *_norm column … carries a BR-S02.T05-09 comment | 6 commented definitions | MET (comment half) + DEFERRED-JUSTIFIED (`norm()` equality → S02.T06) | DDL diff |
| BR-S02.T05-10 | 3 drift tests | 9 `TABLES` descriptors | MET | §4A.3 |

### §4.3 Findings

| # | Severity | Finding | Evidence | Fix owner |
|---|---|---|---|---|
| F1 | MINOR (process) | The RED commit was not made by the pipeline. `72c1ebd` (11:35:44, user identity, generated-style message) was committed while P3's baseline run was in flight. It mixes the RED tests with unrelated work (v2 prompts, status backfill, `.gitattributes`, `build` script) and tracked a transient test artifact. The chain survived only because P3 detected it, recorded it honestly and cleaned up in `f8a03e6`. | `git log`, §3.5 D-1 | User: no commits while a phase runs. Optional: add `apps/api/src/__lint-fixture__.ts` to `.gitignore`. |
| F2 | MINOR | `packages/db/fixtures/README.md` "Delivered Fixtures" does not list `cards-schema-0002.json`. Nobody was told to: P1 added the fixture to the targets after the user's Q1 answer without re-checking its companion docs. | README vs `packages/db/fixtures/` | P1 (prompt rule). One-line docs fix, any time. |
| F3 | MINOR | The spec still says "all 18 named indexes"; the DDL it specifies names 21 (confirmed independently). `0002_cards.md` §5 records the correction; the spec body was left for this audit. | spec Acceptance list; §4.1 D | User: correct the number in the spec (docs edit, no code impact). |
| F4 | MINOR | `0002_cards.md` has two inaccuracies: §1 D2 says legacy had `AUTOINCREMENT` "on `attacks`" — it is on both `attacks` and `abilities` (`pokemon/src/pokesearch/db/schema.sql:62`, `:77`); §4 says "the FTS module asserts it at startup", describing S02.T08 behavior that does not exist yet as if it did. | legacy schema; S02.T08 status `TODO` | Docs fix; any later touch of the note. |
| F5 | MINOR (improvement, not a defect here) | `node:sqlite` exposes the extended result code (`1299`, `787` above), but `DbError` keeps only the primary code (`client.ts:169-170`), so the tests had to identify constraints by message text (§2.6 decision 1). Keeping `extendedCode` on `DbError` would let tests assert `SQLITE_CONSTRAINT_NOTNULL` exactly as the spec words it. | independent run; `client.ts` | S01.T02 owner, whenever the client is next touched. |

No BLOCKER or MAJOR finding.

### §4.4 Verdict

**APPROVED WITH DEFERRALS.**

### §4.5 Status set

`DONE` in the spec header and the stage README row; `P4-AUDIT / 2026-09-30` in `Owner / Updated`. Per the pipeline rule, the remaining work passes to its blocking task. S02.T06 inherits, from this subtask's `.log.md` Deferrals table:
- the RN-01 loader round-trip;
- the BR-S02.T05-09 `norm()` equality test;
- migrating `cards-basic.json` (and the hand-written schema in `fixtures.spec.ts`) to the 0002 shape.

The log lists all three. S02.T08 and S02.T09 receive the dialect findings through the same log.

### §4.6 Post-audit fixes (user-approved, 2026-09-30)

| Finding | Fix | File |
|---|---|---|
| F1 | ignore the transient lint fixture | `.gitignore` (+ `apps/api/src/__lint-fixture__.ts`) |
| F2 | list `cards-schema-0002.json` under Delivered Fixtures | `packages/db/fixtures/README.md` |
| F3 | "all 18 named indexes" → "all 21 named indexes" | spec, Acceptance list |
| F4 | legacy `AUTOINCREMENT` "on both"; the startup assertion is attributed to S02.T08 as specified, not as existing | `packages/db/migrations/0002_cards.md` |
| F5 | not fixed here — belongs to the `client.ts` owner (S01.T02); recorded | — |

Docs-only; no test or production code changed. Uncommitted at the end of P4 — the next Claude Code phase's pre-flight commits them.

