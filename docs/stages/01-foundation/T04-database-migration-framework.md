# S01.T04 — Database migration framework

| Field | Value |
|---|---|
| Stage | S01 — Foundation |
| Status | TODO |
| Order in stage | 4 / 10 |
| Depends on | [S01.T02](T02-sqlite-database-client.md), [S01.T03](T03-test-database-and-fixtures.md) |
| Unblocks | [S01.T07](T07-api-skeleton-and-health.md), [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md), [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md), [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md), [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md), [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/db/client` and `doc` `PORTABILITY.md` — from [S01.T02](T02-sqlite-database-client.md)
- `module` `@pokesearch/db/testing` — from [S01.T03](T03-test-database-and-fixtures.md)
- `doc` `project/04-data-model-overview.md` — the migration numbering already assigned by domain (0001 foundation, 0002 cards/prices/FTS, 0003 tournaments, 0004 user decks, 0005 jobs, 0006 rules, 0007 measurement, 0008 optimizer)

## Outputs (proposed)
- `module` `@pokesearch/db/migrate` — `migrate(db)` applies `packages/db/migrations/NNNN_*.sql` in order inside one transaction each, records them in `schema_migrations`; CLI `pnpm db:migrate` and `pnpm db:status` — consumed by [S01.T07](T07-api-skeleton-and-health.md), [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md), [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md), [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md), [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md), [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md) (every migration-owning subtask depends on this one)
- `file` `packages/db/migrations/0001_foundation.sql` — `schema_migrations(version, name, applied_at)` extended with `checksum` and `duration_ms`, and `etl_runs(id, kind, started_at, finished_at, status, stats_json, error)` with its constraints and indexes; full DDL under Interfaces
- `doc` migration conventions: forward-only numbered SQL, one concern per file, dialect blocks tagged `-- @sqlite-only` / `-- @postgres` — consumed by [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md), [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md), [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md), [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)
- `module` typed row types per table (hand-written or generated) exposed from `@pokesearch/db/schema`, with a drift test against the migrated database

## Initial objective
Schema changes are explicit, ordered, reviewable SQL files applied by one command, with the current version visible in the database, so the ETL, API and worker can assert the schema they expect instead of creating tables on connect.

## Context

The legacy project had no migrations: `connection.py` ran `executescript(schema.sql)` on every connect and `schema.sql` is a sequence of `CREATE TABLE IF NOT EXISTS`, so the schema was whatever the file contained, a hand-added column never propagated, and nothing recorded which version a database was at. `ESPECIFICACAO.md` §2.4 lists this as a declared gap. Here the adapter opens, the runner changes, and nothing else creates a table.

The runner itself is small — discover, compare, apply one transaction per file. The interesting part is the guarantees around it: an applied file is immutable (checksum), the version sequence is gapless, two processes racing cannot double-apply, and a failure leaves the database exactly where it was. Those are what let [S01.T07](T07-api-skeleton-and-health.md) refuse to serve on an outdated schema and [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) derive a Postgres set mechanically from the same tagged files.

`etl_runs` is created here rather than in S02 because every ingestion subtask logs into it from [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) onwards. The open question O-4 — Drizzle, Kysely or hand-written row types — is closed **in** this subtask by a documented procedure, because the answer depends on what exists at implementation time.

## Scope

- **In scope.** `packages/db/src/migrate.ts` (discovery, validation, application, status), the `schema_migrations` bookkeeping, `0001_foundation.sql`, `pnpm db:migrate` / `pnpm db:status`, `assertSchemaCurrent`, `migrationsHash()` for [S01.T03](T03-test-database-and-fixtures.md)'s template cache, the `@pokesearch/db/testing` re-export with migrations applied, `packages/db/MIGRATIONS.md`, the O-4 procedure and its outcome, `@pokesearch/db/schema` row types and the drift test.
- **Out of scope.** Tables of later stages (`0002` → [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md), `0003` → [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md), `0005` → [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md), `0006` → [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)); down-migrations (forward-only by decision); reading or writing `etl_runs` rows ([S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) owns the helpers); the Postgres migration set ([S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T04-01 | A migration file is applied inside exactly one transaction together with its `schema_migrations` row; on failure nothing of that file persists and the recorded version is unchanged. | `applyOne()` — `db.transaction(..., "immediate")` wrapping `exec(sql)` + the bookkeeping insert | `migrate.spec.ts > a failing migration rolls back` (valid `CREATE` then a syntax error → 0 new tables) |
| BR-S01.T04-02 | An applied migration is immutable: the SHA-256 stored at apply time must match the file on every later run; a mismatch aborts before applying anything. | `validate()` comparing `schema_migrations.checksum` with `sha256(file)` | `migrate.spec.ts > editing an applied migration aborts` |
| BR-S01.T04-03 | Versions are 4-digit, unique and gapless from 0001; a duplicate, a gap, or a file applied in the database but missing on disk aborts before any statement runs. | `discover()` + `validate()` ahead of the first transaction | `migrate.spec.ts > rejects duplicate / gap / missing` |
| BR-S01.T04-04 | `migrate()` is idempotent: a second run applies nothing. Migration SQL is therefore written **without** `IF NOT EXISTS`. | version comparison in `pending()`; `sql-lint` flags `IF NOT EXISTS` in a migration | `migrate.spec.ts > second run is a no-op`; lint fixture fails |
| BR-S01.T04-05 | Every SQLite-only statement sits inside `-- @sqlite-only` … `-- @end`, immediately preceded by `-- @postgres: <equivalent or "n/a: reason">`. | `scripts/sql-lint.mjs` extended to require the annotation | `pnpm check` fails on a fixture with an untagged `CREATE VIRTUAL TABLE … USING fts5` |
| BR-S01.T04-06 | `etl_runs.status = 'running'` holds exactly when `finished_at IS NULL`, and `finished_at >= started_at` when both exist. | two `CHECK` constraints in `0001_foundation.sql` | `schema.spec.ts > etl_runs rejects a finished run still marked running` |
| BR-S01.T04-07 | No code outside `@pokesearch/db/migrate` executes DDL (`CREATE`, `ALTER`, `DROP`). | `scripts/sql-lint.mjs` scans `packages/*/src` and `apps/*/src`, allowing only `migrate.ts` and the dialect module | `pnpm check` fails on a fixture with `CREATE TABLE` in `apps/api/src` |
| BR-S01.T04-08 | `assertSchemaCurrent(db)` throws `SchemaOutdatedError { applied, expected }` when the applied version differs from the highest on disk. | `assertSchemaCurrent`, called at api startup ([S01.T07](T07-api-skeleton-and-health.md)) and etl start ([S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)) | `migrate.spec.ts > throws on a partially migrated database` |
| BR-S01.T04-09 | The row types in `@pokesearch/db/schema` match the migrated database: same columns, nullability and order. | `TABLES` descriptor compared with `PRAGMA table_info(...)` | `schema.spec.ts > row types match the database` (fails when a migration adds a column) |

## Data operations

**CRUD** — the two tables this subtask creates.

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl/user) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `schema_migrations` | C | migration runner (whichever process runs `db:migrate`) | once per file, inside that file's transaction | insert-only; `version` is the primary key, so a concurrent double-apply fails the second transaction | `checksum` = SHA-256 of the file as applied |
| `schema_migrations` | R | api (startup, `/health`), worker, etl, `db:status` | every process start | read-only; `MAX(version)` is the schema version | never cached across a restart |
| `schema_migrations` | U / D | — | never | forward-only; a mistake is corrected by a new migration | manual deletion is an unsupported recovery path, documented in MIGRATIONS.md |
| `etl_runs` | C | etl | at the start of every run | insert with `status='running'`, `finished_at NULL`; monotonic internal id | helpers owned by [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) |
| `etl_runs` | U | etl | at the end of the same run | one update setting `finished_at`, `status`, `stats_json`, `error`; a crashed run stays `running` until reconciled | the CHECK pair makes a half-written update impossible |
| `etl_runs` | R | api (`/health`, ETL history), worker scheduler | on request | read-only | `etl_runs_kind_started_idx` serves "latest run per kind" |
| `etl_runs` | D | — | not in this stage | retention proposed for [S08.T01](../08-operations-and-extensions/T01-scheduler.md) | to verify with the user before any delete path exists |

**Commands**

| Command | Arguments | Effect | Exit codes |
|---|---|---|---|
| `pnpm db:migrate` | `[--db <path>] [--to <version>] [--dry-run] [--json]` | applies pending migrations to `$DATABASE_PATH` or `--db` | 0 ok (incl. nothing to do), 1 migration failed, 2 validation failed |
| `pnpm db:status` | `[--db <path>] [--json]` | prints applied and pending versions, the resolved path and the SQLite version | 0 up to date, 3 pending, 2 validation failed |

## Interfaces

**`packages/db/src/migrate.ts`**

```ts
export interface MigrationFile { version: number; name: string; path: string; checksum: string; sql: string; noTransaction: boolean; }
export interface MigrateResult { applied: AppliedMigration[]; alreadyApplied: number; schemaVersion: number; }
export function discoverMigrations(dir?: string): MigrationFile[];
export function migrate(db: Db, opts?: { to?: number; dryRun?: boolean; dir?: string }): MigrateResult;
export function currentSchemaVersion(db: Db): number;      // 0 when schema_migrations is absent
export function pendingMigrations(db: Db, dir?: string): MigrationFile[];
export function assertSchemaCurrent(db: Db, dir?: string): void;
export function migrationsHash(dir?: string): string;      // for the test template cache
export class MigrationError extends Error { version: number; name: string; cause: unknown; }
export class MigrationChecksumError extends MigrationError {}
export class SchemaOutdatedError extends Error { applied: number; expected: number; }
```

**Runner semantics.** (1) Discover `NNNN_<snake_name>.sql`, rejecting any other file name. (2) Validate uniqueness, gaplessness, checksum equality for applied files, presence on disk of every applied version. (3) `currentSchemaVersion` reads `MAX(version)`, treating a missing `schema_migrations` as 0 — which is how 0001 bootstraps itself, creating the table and inserting its own row in one transaction. (4) For each pending file ascending: `BEGIN IMMEDIATE`, re-read the applied set inside the lock (skip if a concurrent runner just applied it), `exec(sql)`, insert the bookkeeping row, `COMMIT`. (5) On error: `ROLLBACK`, stop, throw `MigrationError` naming version, file and SQLite error; later files are not attempted. (6) `--dry-run` performs (1)–(3) only.

**Conventions** (`packages/db/MIGRATIONS.md`): `NNNN_<name>.sql`, numbers from the data-model inventory; one concern per file; never edited once applied; no `IF NOT EXISTS`; explicit index names `<table>_<cols>_idx`; a header comment stating purpose, owning subtask and the Postgres note; SQLite-only blocks tagged per BR-S01.T04-05; a file that cannot run in a transaction (a SQLite twelve-step rebuild needing `PRAGMA foreign_keys=OFF`, or `VACUUM`) declares `-- @no-transaction` on its first line, must be re-runnable, and needs an explicit review note.

**`packages/db/migrations/0001_foundation.sql`**

```sql
-- 0001_foundation.sql — schema bookkeeping and the ETL run log.
-- Owner: S01.T04. Postgres: portable as written (TEXT/INTEGER only, ISO-8601 UTC timestamps).

CREATE TABLE schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    checksum    TEXT    NOT NULL,              -- SHA-256 of the file as applied
    applied_at  TEXT    NOT NULL,              -- 'YYYY-MM-DDTHH:MM:SSZ'
    duration_ms INTEGER NOT NULL
);

CREATE TABLE etl_runs (
    id          INTEGER PRIMARY KEY,           -- monotonic internal id
    kind        TEXT    NOT NULL,              -- full | delta | prices | fts | decks | decks-web | seed
    started_at  TEXT    NOT NULL,
    finished_at TEXT,
    status      TEXT    NOT NULL DEFAULT 'running',
    stats_json  TEXT    NOT NULL DEFAULT '{}',
    error       TEXT,
    CHECK (status IN ('running', 'ok', 'error', 'cancelled')),
    CHECK (finished_at IS NULL OR finished_at >= started_at),
    CHECK ((status = 'running') = (finished_at IS NULL))
);

CREATE INDEX etl_runs_kind_started_idx ON etl_runs (kind, started_at DESC);
CREATE INDEX etl_runs_running_idx      ON etl_runs (started_at) WHERE status = 'running';
```

**`@pokesearch/db/schema`** exports `SchemaMigrationRow`, `EtlRunRow`, the unions `EtlRunKind` and `EtlRunStatus`, and a `TABLES` descriptor used only by the drift test.

**O-4 decision procedure**, timeboxed to half a day. (1) Establish the facts: does `drizzle-orm` ship a driver for `node:sqlite` (not `better-sqlite3`) at implementation time; does Kysely's SQLite dialect accept a custom driver object? (2) Score each candidate: (a) no native dependency; (b) migrations remain the single source of truth for the schema — a tool wanting its own schema DSL fails this; (c) any codegen is deterministic and runs inside `pnpm check`; (d) a raw-SQL escape hatch exists for FTS5, `json_each` and the dialect module; (e) hot paths can still use hand-written SQL. (3) Spike the winner for two hours against 0001. (4) If none satisfies (b) cheaply, take hand-written row types plus the drift test — the recommendation of record, since the project writes SQL by hand anyway. (5) Append the outcome, with the observed facts, as a dated resolution of O-4 in the decision log.

## Implementation steps

1. Write `0001_foundation.sql` exactly as above.
2. Implement `discoverMigrations` + `validate` + `currentSchemaVersion` with unit tests over a fixture directory.
3. Implement `migrate()` with the transaction-per-file loop and `MigrationError`; test through `withTempDb`: fresh database → one row, second run a no-op.
4. Add the checksum rule and the gap/duplicate/missing checks with their specs (BR-S01.T04-02, -03).
5. Add `assertSchemaCurrent`, `pendingMigrations`, `migrationsHash`; register `migrate` as the schema initializer in `vitest.setup.ts` — the re-export [S01.T07](T07-api-skeleton-and-health.md) consumes.
6. Write `scripts/db-migrate.mjs` and `scripts/db-status.mjs`; wire the scripts with the documented flags and exit codes; spec them against a temp database.
7. Extend `scripts/sql-lint.mjs`: no `IF NOT EXISTS`, tagged SQLite-only blocks, named indexes, DDL confined to migrations (BR-S01.T04-04, -05, -07).
8. Write `@pokesearch/db/schema` row types and the `PRAGMA table_info` drift test (BR-S01.T04-09).
9. Run the O-4 procedure, record the decision; if a typed layer is adopted, put it behind `@pokesearch/db/schema` without changing any consumer import.
10. Write `packages/db/MIGRATIONS.md` (conventions + the six-item review checklist referenced by PORTABILITY.md §10).

## Edge cases and error handling

- **A statement fails halfway through a file** → the whole file rolls back (SQLite DDL is transactional); no bookkeeping row; the next run retries from scratch. The message carries version, file and SQLite error text.
- **Two processes call `migrate()` at once** (api with `MIGRATE_ON_START=1` and a manual `pnpm db:migrate`) → `BEGIN IMMEDIATE` serialises them; the loser re-reads inside its lock and skips; a residual race on the insert hits the `version` primary key and is treated as "already applied", not an error.
- **An applied file was edited** → `MigrationChecksumError` listing both checksums and the supported fix (revert, write a new migration). `--allow-checksum-drift` exists for local experiments and is refused when `NODE_ENV=production`.
- **An applied file was deleted** → `MigrationMissingError`; a database cannot be reasoned about from a tree that no longer holds its history.
- **A migration must disable foreign keys** (the twelve-step rebuild) → `PRAGMA foreign_keys` is a no-op inside a transaction, so the file declares `-- @no-transaction`; the runner applies it statement by statement, records it only on full success, and `db:status` marks the database "needs verification" if the process died mid-file.
- **A long migration blocks the api** → migrations run with the api stopped by convention; `busy_timeout` makes a concurrent writer fail fast rather than hang. MIGRATIONS.md requires a header note for anything expected to take seconds.
- **`schema_migrations` exists but is empty** → version 0, so 0001 is retried and fails on "table already exists"; the message names the unsupported recovery path instead of guessing.
- **`--to <version>` below the applied version** → refused, exit 2, with "restore a backup (`pnpm db:backup` output) to go back".

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/db test migrate.spec.ts` green: fresh database → 0001 applied, one `schema_migrations` row with checksum and duration; a second run returns `applied: []` (BR-S01.T04-01, -04).
- [ ] A fixture file whose second statement is invalid leaves the database at the previous version with no new tables (BR-S01.T04-01).
- [ ] The four validation failures — edited checksum, duplicate version, gap, applied-but-missing — each abort before any statement runs (BR-S01.T04-02, -03).
- [ ] `pnpm db:status --db <temp>` exits 3 with a pending migration and 0 when up to date; `pnpm db:migrate --dry-run` leaves `schema_migrations` unchanged.
- [ ] After `pnpm db:migrate`, `etl_runs` exists with both indexes, and inserting `status='ok'` with `finished_at NULL` is rejected by the CHECK (BR-S01.T04-06).
- [ ] `pnpm check` fails on the three lint fixtures: `IF NOT EXISTS` in a migration, an untagged `CREATE VIRTUAL TABLE … USING fts5`, and `CREATE TABLE` inside `apps/api/src` (BR-S01.T04-04, -05, -07).
- [ ] `schema.spec.ts > row types match the database` fails when a column is added to 0001 without updating `@pokesearch/db/schema` (BR-S01.T04-09).
- [ ] `assertSchemaCurrent` throws `SchemaOutdatedError { applied: 1, expected: 2 }` on a database at 0001 with a 0002 file present (BR-S01.T04-08).
- [ ] The decision log contains a dated resolution of O-4 naming the chosen typing layer and the facts that decided it.

## Risks and open questions

- **Risk — a later stage needs a destructive change** (renaming a populated column). Mitigation: MIGRATIONS.md documents the twelve-step rebuild and `-- @no-transaction`; `pnpm db:backup` runs first and the backup path is named in the file's header.
- **Risk — the checksum rule is too strict during early development**, while 0002–0006 are drafted and re-applied. Mitigation: `--allow-checksum-drift` locally plus the fact that dropping a temp database is free; the rule is absolute only outside development.
- **Risk — O-4 is resolved for a library that later stalls.** Mitigation: criterion (b) keeps migrations as the source of truth, so abandoning it costs the row types, not the schema.
- **Question — retention of `etl_runs`.** Nothing deletes rows today. Proposal: a retention step in [S08.T01](../08-operations-and-extensions/T01-scheduler.md); the user decides whether to keep everything.
- **Question — should `MIGRATE_ON_START` default to 1 in development?** Decided in [S01.T07](T07-api-skeleton-and-health.md); the safe default recommended here is 0.
- **DEPENDENCY-PROPOSAL.** [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) consumes the tagged migration files produced under these conventions, yet it is listed as unblocked by [S01.T02](T02-sqlite-database-client.md) only. Consider adding `S01.T04 → S08.T03` (`Unblocks` here, `Depends on` there) when S08 is elaborated.

## References

- `pokemon/src/pokesearch/db/connection.py` — verified: `executescript(SCHEMA_PATH.read_text())` on every connect, no version table. The gap this subtask closes.
- `pokemon/src/pokesearch/db/schema.sql` — verified: `PRAGMA journal_mode = WAL;` then `CREATE TABLE IF NOT EXISTS sets (...)`, `cards (...)` with text primary keys, `*_json TEXT` columns and ISO-date comments. Consult for the column conventions the later migrations follow; do not copy the `IF NOT EXISTS` style.
- `pokemon/ESPECIFICACAO.md` §2.4 — verified: the section where "no migrations" is declared as a limitation.
- [Data model overview](../../project/04-data-model-overview.md) — the 0001–0008 numbering and the migration conventions this file implements.
- [Decision log](../../project/02-decision-log.md) D-002 and open item O-4, which this subtask must close.
- `packages/db/PORTABILITY.md` ([S01.T02](T02-sqlite-database-client.md)) — the SQL rules every migration is checked against.
- External: SQLite documentation on transactional DDL, `PRAGMA foreign_keys` inside transactions, and the twelve-step `ALTER TABLE` procedure.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
