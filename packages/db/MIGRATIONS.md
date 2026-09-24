# PokésSearch Database Migrations (`MIGRATIONS.md`)

This document defines the rules, authoring workflow, and review checklist for database migrations across `@pokesearch/db`.

---

## 1. Naming & Ordering Conventions

- **Pattern**: `NNNN_<snake_case_description>.sql` (e.g. `0001_foundation.sql`, `0002_cards.sql`).
- **Sequential & Gapless**: Numbering starts strictly at `0001` and proceeds monotonically without sequence gaps.
- **Domain Assignment**:
  - `0001`: Foundation (`schema_migrations`, `etl_runs`).
  - `0002`: Card data, prices, sets, FTS5 virtual tables.
  - `0003`: Tournaments and meta analysis.
  - `0004`: User decks and lists.
  - `0005`: Asynchronous background jobs.
  - `0006`: Card rules base and card relations.
  - `0007`: Performance telemetry & measurement.
  - `0008`: Deck optimizer holdouts and acceptance.

---

## 2. Invariance & Immutability Rules

1. **Transaction-per-file (BR-S01.T04-01)**:
   - Each migration file executes in an isolated transaction (`BEGIN IMMEDIATE ... COMMIT`).
   - If any statement in the migration fails, SQLite rolls back every change made in that file. No row is recorded in `schema_migrations`.
2. **Checksum Immutability (BR-S01.T04-02)**:
   - Once applied to a database, migration files are immutable. The runner records the SHA-256 hash in `schema_migrations.checksum`.
   - Editing an applied migration aborts future migrations with `MigrationChecksumError`.
   - Local checksum drift is permitted only when `allowChecksumDrift: true` AND `NODE_ENV !== "production"`.
3. **No `IF NOT EXISTS` (BR-S01.T04-04)**:
   - Migrations are exact and forward-only. The migration runner guarantees idempotency via the `schema_migrations` ledger.
   - Do not write `CREATE TABLE IF NOT EXISTS` or `CREATE INDEX IF NOT EXISTS`.
4. **No Down-Migrations**:
   - Reverting changes is achieved by restoring backups (`scripts/db-backup.mjs`) or applying a subsequent forward migration. Requests to migrate `--to <lower_version>` throw `MigrationValidationError`.
5. **Non-Transactional Migrations (`-- @no-transaction`)**:
   - For migrations that cannot run in a transaction (such as table rebuilds requiring `PRAGMA foreign_keys = OFF` or `VACUUM`), declare `-- @no-transaction` on line 1.

---

## 3. SQL Portability Annotations (BR-S01.T04-05)

Every SQLite-only construct (FTS5 virtual tables, `bm25`, `json_each`, `json_tree`, `MATCH`) must be enclosed in:
```sql
-- @postgres: <equivalent or "n/a: reason">
-- @sqlite-only
... SQLite specific statement ...
-- @end
```

---

## 4. Migration Review Checklist

Before committing a new migration:
- [ ] Filename conforms to `NNNN_<snake_case>.sql`.
- [ ] No `IF NOT EXISTS` clauses are present in DDL.
- [ ] Indexes are explicitly named following `<table>_<cols>_idx`.
- [ ] SQLite-only constructs are properly tagged with `-- @postgres:` and `-- @sqlite-only ... -- @end`.
- [ ] Accompanying runtime row types in `@pokesearch/db/schema` are updated and drift tests pass.
- [ ] Tested with `pnpm --filter @pokesearch/db test` and `node scripts/sql-lint.mjs`.
