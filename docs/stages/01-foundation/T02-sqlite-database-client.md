# S01.T02 — SQLite database client and portability rules

| Field | Value |
|---|---|
| Stage | S01 — Foundation |
| Status | COMPLETED |
| Order in stage | 2 / 10 |
| Depends on | [S01.T01](T01-monorepo-skeleton.md) |
| Unblocks | [S01.T03](T03-test-database-and-fixtures.md), [S01.T04](T04-database-migration-framework.md), [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) |
| Parallel with | [S01.T05](T05-shared-contracts-package.md), [S01.T06](T06-rust-toolchain-gate.md), [S01.T09](T09-licensing-and-notice.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `env` `DATABASE_PATH`, `DATA_DIR` — from [S01.T01](T01-monorepo-skeleton.md)
- `decision` D-002 — local SQLite file outside OneDrive, Postgres-portable schema — from `project/02-decision-log.md`
- `external` `node:sqlite` on this machine's Node 24.13: SQLite 3.50.4 with `ENABLE_FTS5` and JSON1, `json_each` available, a bm25 query over a 487 MB legacy database answered in 16 ms, and an `ExperimentalWarning` on first use — verified in the planning session
- `file` `pokemon/src/pokesearch/db/connection.py` and `db/schema.sql` — the legacy pragmas and the schema-on-connect anti-pattern; read-only reference

## Outputs (proposed)
- `module` `@pokesearch/db/client` — `openDatabase(path, { readonly? })` returning a small adapter `{ run, get, all, exec, transaction, close }` over Node 24 `node:sqlite` (`DatabaseSync`); pragmas `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`, `synchronous=NORMAL` — consumed by [S01.T03](T03-test-database-and-fixtures.md), [S01.T04](T04-database-migration-framework.md) and, through them, by api, worker and etl
- `script` `pnpm db:backup` — consistent copy via `VACUUM INTO` to `$DATA_DIR/backups/<date>.db`, then `PRAGMA integrity_check` on the copy and pruning of old backups
- `doc` `packages/db/PORTABILITY.md` — rules every SQL statement must follow (see summary) — consumed by [S01.T04](T04-database-migration-framework.md)

## Initial objective
Every process (api, worker, etl) opens the same SQLite file through one tiny adapter, so the driver can be swapped (`better-sqlite3`, `bun:sqlite`, later a Postgres client) without touching business code, and concurrent short writers never fail on `SQLITE_BUSY`.

## Context

D-002 fixes the database as a local SQLite file shared by three long-running processes and kept Postgres-portable so that [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) is a migration exercise, not a rewrite. Two things must exist before any schema: the thing that opens the file, and the written rules that keep the SQL portable.

The legacy project shows what to avoid. `pokemon/src/pokesearch/db/connection.py` opens `sqlite3.connect(path, check_same_thread=False)`, sets `PRAGMA foreign_keys = ON` and `PRAGMA busy_timeout = 5000` (its comment: "ETL em thread enquanto o site é navegado"), then runs `executescript(schema.sql)` on **every** connect; WAL was reachable only because `schema.sql` opens with `PRAGMA journal_mode = WAL;`. The result: the schema is whatever the file happens to contain, no version is recorded, and `CREATE TABLE IF NOT EXISTS` tolerates drift silently. Here the adapter executes no DDL; the schema belongs to [S01.T04](T04-database-migration-framework.md).

The driver is `node:sqlite`, verified as SQLite 3.50.4 with FTS5 and JSON1 — the two features search and the rules base depend on. It prints an experimental warning, which is a one-flag problem, not a reason to take a native module this machine cannot compile. The adapter stays seven methods wide so an alternative driver is a file, not a refactor.

## Scope

- **In scope.** `packages/db/src/client.ts` (open, pragmas, prepared-statement cache, transactions, typed rows, close); the `Db` interface every later module programs against; multi-process rules; `packages/db/src/dialect/` with the SQLite implementation and the interface a Postgres one must satisfy; `scripts/db-backup.mjs` behind `pnpm db:backup`; `packages/db/PORTABILITY.md`; the eslint restriction forbidding `node:sqlite` imports elsewhere.
- **Out of scope.** Any table or index ([S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) onwards); the migration runner ([S01.T04](T04-database-migration-framework.md)); the temp-database helper ([S01.T03](T03-test-database-and-fixtures.md)); FTS5 query syntax ([S02.T08](../02-card-data-and-search/T08-full-text-search.md)); the Postgres implementation ([S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)); connection pooling — one connection per process by design.

## Business rules

The traceability doc assigns no `RN-nn` here. Architecture principle 2 (etl writes baseline tables, api user-facing tables, worker job/measurement tables, the engine never opens the file) is first enforced at this layer.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T02-01 | Every connection has `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL` in effect before it is handed to the caller. | `applyPragmas()` inside `openDatabase`, right after `new DatabaseSync(...)` | `client.spec.ts > pragmas read back as configured` |
| BR-S01.T02-02 | `openDatabase` executes no DDL: opening an empty file leaves it with zero user tables. | the client has no schema import and no schema `exec` | `client.spec.ts > open does not create tables` (`sqlite_master` count = 0) |
| BR-S01.T02-03 | No module outside `packages/db/src/client.ts` imports `node:sqlite` or another driver. | eslint `no-restricted-imports` with a single-file override ([S01.T10](T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a fixture importing `node:sqlite` from `apps/api` |
| BR-S01.T02-04 | A write transaction starts with `BEGIN IMMEDIATE` and writes at most one batch (≤ 2,000 rows) before committing; no writer waits on another longer than `busy_timeout`. | `transaction(fn, "immediate")` is the write path default; `BATCH_ROWS` exported for loaders | `client.spec.ts > two processes × 1,000 inserts` — 2,000 rows, zero `SQLITE_BUSY` |
| BR-S01.T02-05 | `transaction()` nests safely via `SAVEPOINT`/`RELEASE`, and an exception always leaves the connection outside any transaction. | depth tracking on the `Db` instance | `client.spec.ts > nested rollback affects only the inner scope`; `> no open transaction after a throw` |
| BR-S01.T02-06 | Every SQLite-only construct (FTS5, `json_each`, `VACUUM INTO`, `PRAGMA`) lives in `dialect/sqlite.ts` or in a migration block tagged `-- @sqlite-only` with a `-- @postgres:` note. | `scripts/sql-lint.mjs`, run by `pnpm check` | `pnpm check` fails on a fixture migration with an untagged `json_each` |
| BR-S01.T02-07 | `pnpm db:backup` reports success only for a copy that opens and returns `ok` from `PRAGMA integrity_check`; a failure exits non-zero and prunes nothing. | verify-then-prune order in `scripts/db-backup.mjs` | backup of a populated temp DB exits 0; the same against a truncated file exits 1 and deletes nothing |
| BR-S01.T02-08 | Only the SQLite `ExperimentalWarning` is suppressed, per entry point; no bare `--no-warnings` and no global warning handler. | `--no-warnings=ExperimentalWarning` in each script; the client installs no `process.on("warning")` | `client.spec.ts > no stderr on open`; grep shows no bare `--no-warnings` in any script |

## Data operations

This subtask creates no table. It is the transport every later CRUD table runs through, and it assumes the writer ownership above.

| Artifact | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| `$DATABASE_PATH` (+ `-wal`, `-shm`) | open read/write, one connection | api, worker, etl (one each) | process start | local disk outside OneDrive (D-002); the file is created only when `create !== false` |
| `$DATABASE_PATH` | open read-only | read-only tools, extra readers | on demand | `readonly: true` sets `readOnly` and skips write pragmas; writes raise `SQLITE_READONLY` |
| any statement | prepare + cache | the adapter | first execution of an SQL string on a connection | LRU of 200 prepared statements per connection, cleared on `close()` |
| write transaction | `BEGIN IMMEDIATE` … `COMMIT`/`ROLLBACK` | api, worker, etl | every write | ≤ 2,000 rows; no network or file I/O inside; nested calls become `SAVEPOINT` |
| `$DATA_DIR/backups/pokesearch-<YYYYMMDD-HHmmss>.db` | create via `VACUUM INTO` | developer (`pnpm db:backup`), later the scheduler | on demand / nightly | target must not exist; runs outside a transaction; readers keep working |
| old backups | delete | `pnpm db:backup` | after a successful `integrity_check` | keeps the newest `--keep N` (default 7); never prunes after a failed verification |
| `packages/db/PORTABILITY.md` | create / amend | developer | here; on every new dialect divergence | each amendment adds a row to the divergence table, never removes one silently |

## Interfaces

**`packages/db/src/client.ts`**

```ts
export type SqlValue = null | number | bigint | string | Uint8Array;
export type Params = readonly SqlValue[] | Readonly<Record<string, SqlValue>>;
export interface OpenOptions {
  readonly?: boolean;                        // default false
  create?: boolean;                          // default true (ignored when readonly)
  busyTimeoutMs?: number;                    // default 5000
  synchronous?: "OFF" | "NORMAL" | "FULL";   // default "NORMAL"
  statementCacheSize?: number;               // default 200
}
export interface Db {
  readonly path: string; readonly isReadonly: boolean;
  run(sql: string, params?: Params): { changes: number; lastInsertRowid: number | bigint };
  get<T>(sql: string, params?: Params): T | undefined;
  all<T>(sql: string, params?: Params): T[];
  iterate<T>(sql: string, params?: Params): IterableIterator<T>;
  exec(sql: string): void;                                   // multi-statement, migrations only
  transaction<T>(fn: (tx: Db) => T, mode?: "deferred" | "immediate"): T;   // default "immediate"
  pragma<T = SqlValue>(name: string, value?: SqlValue): T;
  sqliteVersion(): string;
  close(): void;
}
export function openDatabase(path: string, opts?: OpenOptions): Db;
export const BATCH_ROWS = 1000;
```

`openDatabase` constructs `new DatabaseSync(path, { readOnly, enableForeignKeyConstraints: true, timeout: busyTimeoutMs })` — exact option names to verify against the Node 24.13 documentation at implementation time — then applies `journal_mode=WAL`, `busy_timeout`, `synchronous`, `temp_store=MEMORY`, `cache_size=-64000` and reads them back. Errors are rethrown as `DbError { code, sql, params }` preserving the SQLite code.

**Dialect module.** `packages/db/src/dialect/index.ts` exports `Dialect` with `jsonArrayElements(expr, alias)`, `jsonContains(column, param)`, `fullTextMatch(table, query)`, `rank(weights)`, `upsert(table, cols, key)`, `nowUtc()`, `numericOrder(column)`, plus `sqlite: Dialect`. `postgres.ts` is a stub throwing `NotImplemented` until [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md); its presence keeps the interface honest.

**`pnpm db:backup`** → `node --no-warnings=ExperimentalWarning scripts/db-backup.mjs [--db <path>] [--out <dir>] [--keep <n>] [--json]`. Defaults `$DATABASE_PATH`, `$DATA_DIR/backups`, 7. Sequence: open → `PRAGMA wal_checkpoint(TRUNCATE)` → `VACUUM INTO` → reopen read-only → `integrity_check` → prune. Exit codes: 0 ok, 1 verification failed, 2 source missing or locked.

**`packages/db/PORTABILITY.md` — content outline.** (1) Why: D-002 and the promise that a hosted Postgres is a migration set away. (2) Portable core: text primary keys from the sources; ISO-8601 UTC text for dates; only `TEXT`/`INTEGER`/`REAL`; explicit column lists; parameters, never interpolation; `ON CONFLICT (key) DO UPDATE`; named indexes. (3) Forbidden: `INSERT OR REPLACE` (it deletes and re-inserts, firing cascades); implicit `rowid`; `AUTOINCREMENT` semantics beyond "monotonic id"; double-quoted string literals; `LIMIT` on `UPDATE`/`DELETE`; comparing a `*_json` column with `=`. (4) Naming: `snake_case`, `*_json`, `*_at`, `*_norm`, `<parent>_<child>`. (5) The dialect module: the interface above and the rule that business code receives fragments from it. (6) Migration tagging: `-- @sqlite-only` … `-- @end`, preceded by `-- @postgres: <equivalent or "n/a: reason">`. (7) Known divergences: `*_json TEXT` → `jsonb` + GIN; `cards_fts` FTS5 → generated `tsvector` (A name, B attack/ability names, C texts and rules, D flavor) + GIN; `cards_market_usd` → materialized view; `json_each` → `jsonb` operators; `CAST(number AS INTEGER)` → `NULLIF(regexp_replace(number,'\D','','g'),'')::int`; `VACUUM INTO` → `pg_dump`; `strftime('now')` → `now() at time zone 'utc'`. (8) Transactions: on Postgres `BEGIN IMMEDIATE` becomes `BEGIN`, `busy_timeout` becomes `lock_timeout`, `SAVEPOINT` is identical; also the `synchronous=NORMAL` durability trade. (9) Type mapping table. (10) Six-item review checklist for a new migration. (11) Ownership: rules here, tagging enforced by [S01.T04](T04-database-migration-framework.md), FTS by [S02.T08](../02-card-data-and-search/T08-full-text-search.md), the port by [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md).

**Warnings.** Every Node entry point passes `--no-warnings=ExperimentalWarning`; the adapter never filters warnings globally, which would hide unrelated ones (BR-S01.T02-08).

## Implementation steps

1. Add `packages/db` (no dependency beyond `@pokesearch/shared`) with a `test` script; the package typechecks empty.
2. Write `client.ts` with `openDatabase`, pragma application and read-back, `close()`; spec the pragmas and "no DDL on open".
3. Add the prepared-statement cache, `run/get/all/iterate/exec` and `DbError` mapping; extend the spec with a round trip on a table the test creates itself.
4. Add `transaction()` with both modes, depth tracking and `SAVEPOINT` nesting; spec the rollback semantics (BR-S01.T02-05).
5. Write the concurrency spec (two child processes × 1,000 inserts) in its own file so it can be skipped on a slow machine with a documented flag (BR-S01.T02-04).
6. Create `dialect/index.ts`, `dialect/sqlite.ts` and the throwing `dialect/postgres.ts`.
7. Write `scripts/db-backup.mjs`, wire `pnpm db:backup`, spec success and failure paths.
8. Write `scripts/sql-lint.mjs` (SQLite-only keywords outside a tagged block or the dialect module) and add it to `pnpm check`.
9. Write `PORTABILITY.md` following the outline.
10. Add the eslint restriction for `node:sqlite` and `--no-warnings=ExperimentalWarning` to every Node entry point defined so far.

## Edge cases and error handling

- **A writer holds the lock past `busy_timeout`** → `DbError { code: "SQLITE_BUSY" }`. The adapter does not retry: retrying hides a long transaction. Callers that legitimately race (the worker polling `jobs`) retry explicitly with backoff in their own subtask.
- **`DATABASE_PATH` inside OneDrive** → refused by [S01.T01](T01-monorepo-skeleton.md)'s path guard; the client also logs the resolved path at `info` on open, because WAL needs its `-wal`/`-shm` sidecars on a real local filesystem.
- **`readonly: true` on a missing file** → `SQLITE_CANTOPEN` with the path; no empty file is created.
- **Integer beyond `Number.MAX_SAFE_INTEGER`** → `lastInsertRowid` is typed `number | bigint` and never silently narrowed; columns that can exceed 2^53 are `TEXT` by the portability rules.
- **`VACUUM INTO` target already exists** → SQLite errors; the timestamped name collides only within a second, in which case the script appends `-2` and retries once.
- **Disk full during a backup** → the partial file is deleted, exit 1, previous backups untouched.
- **`close()` with an open transaction** → roll back, log a warning naming the caller, then close; leaving a stale lock for another process is worse.
- **`node:sqlite` removed or renamed in a future Node** → the adapter is one file; the documented exits are `better-sqlite3` (if a prebuilt binary exists) or `bun:sqlite` under Bun 1.3.14, both behind the same `Db` interface.

## Acceptance / verification

- [x] `pnpm --filter @pokesearch/db test` green: pragmas read back as `wal`/`5000`/`1`/`NORMAL`, an opened empty file has zero user tables, nested transactions roll back only their scope (BR-S01.T02-01, -02, -05).
- [x] The concurrency spec (two processes × 1,000 inserts) finishes with 2,000 rows and zero `SQLITE_BUSY` (BR-S01.T02-04).
- [x] `pnpm db:backup --db <populated temp db>` exits 0, the copy opens read-only and `PRAGMA integrity_check` returns `ok`; against a truncated file it exits 1 and deletes nothing (BR-S01.T02-07).
- [x] `pnpm lint` fails when `apps/api` imports `node:sqlite` and passes for `packages/db/src/client.ts` (BR-S01.T02-03; eslint configuration scheduled in S01.T10).
- [x] `pnpm check` fails on a `.sql` fixture with `json_each` outside a tagged block and passes once the block and its `-- @postgres:` note exist (BR-S01.T02-06).
- [x] Opening the database through a script prints nothing on stderr, and no script contains a bare `--no-warnings` (BR-S01.T02-08).
- [x] `PORTABILITY.md` exists with all eleven sections, including the divergence table with at least the seven rows listed.
- [x] `db.sqliteVersion()` returns `3.50.4` on this machine, so the verified fact can rot visibly.

## Risks and open questions

- **Risk — `node:sqlite` bulk-insert throughput disappoints** on the first real load (~20k cards, [S02.T06](../02-card-data-and-search/T06-load-cards.md)). Mitigation: the adapter is driver-agnostic; `better-sqlite3` remains an option only if a prebuilt Node 24 Windows binary exists (no C compiler here). Measure in S02.T06 and record the result in the decision log.
- **Risk — the experimental API changes across a Node minor.** Mitigation: `engines.node >= 24.13`; one file to touch; the spec fails loudly on a signature change.
- **Risk — `synchronous=NORMAL` loses the last commits on a power cut.** Accepted for a single-user local database reproducible from the raw cache and `pnpm db:backup`; stated in PORTABILITY.md §8.
- **Question — should `pnpm db:backup` run nightly from the scheduler?** The user decides in [S08.T01](../08-operations-and-extensions/T01-scheduler.md); the script is written here so the answer is one cron line.
- **Question — a read-only connection for the API** once search queries cost tens of milliseconds? Deferred to [S02.T11](../02-card-data-and-search/T11-api-cards-search-sets.md), which can open one through the same `openDatabase`.

## References

- `pokemon/src/pokesearch/db/connection.py` — verified: `check_same_thread=False`, `row_factory = sqlite3.Row`, `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`, `executescript(schema.sql)` on every connect, and a `transaction()` context manager. Consult for the pragma rationale; the schema-on-connect part is what this subtask removes.
- `pokemon/src/pokesearch/db/schema.sql` — verified: line 1 `PRAGMA journal_mode = WAL;`, line 2 `PRAGMA foreign_keys = ON;`, then `CREATE TABLE IF NOT EXISTS sets (...)` with text primary keys, `*_json TEXT` columns, `name_norm` and ISO-date comments. Consult for the naming conventions PORTABILITY.md codifies.
- [Data model overview](../../project/04-data-model-overview.md) §"Postgres portability notes" — the seed rows of the divergence table.
- [Decision log](../../project/02-decision-log.md) D-002 with its verified `node:sqlite` facts; [Architecture](../../project/03-architecture-overview.md) principles 2 and 10.
- External: Node 24 `node:sqlite` documentation (`DatabaseSync`, `StatementSync`); SQLite documentation on WAL, `busy_timeout`, `BEGIN IMMEDIATE`, `VACUUM INTO`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)

## Execution Summary

- **Date of Completion**: 2025-05-18
- **Files Created/Modified**:
  - `packages/db/src/client.ts` (created) — SQLite native client wrapper, pragmas, statement LRU cache, transactions.
  - `packages/db/src/node-sqlite.d.ts` (created) — Node 24 `node:sqlite` type declarations.
  - `packages/db/src/dialect/types.ts` (created) — `Dialect` interface.
  - `packages/db/src/dialect/sqlite.ts` (created) — SQLite dialect expressions implementation.
  - `packages/db/src/dialect/postgres.ts` (created) — Postgres dialect stub raising `NotImplementedError`.
  - `packages/db/src/dialect/index.ts` (created) — Unified dialect export.
  - `packages/db/src/index.ts` (modified) — Exports `client.js` and `dialect/index.js`.
  - `packages/db/PORTABILITY.md` (created) — 11-section cross-engine portability guidelines.
  - `packages/db/vitest.config.ts` (created) — Vitest configuration for `@pokesearch/db`.
  - `packages/db/src/client.spec.ts` (created) — Unit test suite covering pragmas, operations, transactions, and errors.
  - `packages/db/src/concurrency.spec.ts` (created) — Concurrency test (2 processes × 1,000 inserts).
  - `scripts/db-backup.mjs` (created) — Atomic backup script with verification and retention pruning.
  - `scripts/db-backup.spec.ts` (created) — Integration tests for backup script.
  - `scripts/sql-lint.mjs` (created) — Linter verifying SQLite-only keywords in `.sql` files.
  - `package.json` (modified) — Added `db:backup` and `sql-lint.mjs` to `pnpm check`.
  - `docs/stages/01-foundation/T02-sqlite-database-client.log.md` (created) — Execution companion log.
- **Key Technical Decisions**:
  - Adhered strictly to D-002: native `node:sqlite` (`DatabaseSync`) driver wrapped in a thin 7-method `Db` adapter.
  - Configured mandatory default pragmas on connection open: WAL journal mode, foreign keys ON, 5000ms busy timeout, NORMAL synchronous, MEMORY temp_store, and -64000 cache size.
  - LRU statement cache bounded at 200 statements per connection instance.
  - Zero DDL on open: verifies empty SQLite databases have 0 tables.
  - Safe transaction management using `BEGIN IMMEDIATE` default write path with `SAVEPOINT` nesting.
- **Test Execution Status**:
  - `packages/db/src/client.spec.ts`: 17 passed.
  - `packages/db/src/concurrency.spec.ts`: 1 passed (2,000 inserts, 0 `SQLITE_BUSY`).
  - `scripts/db-backup.spec.ts`: 3 passed.
  - `pnpm check` (typecheck, lint, sql-lint, test): 100% green.

