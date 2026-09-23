# S08.T03 — Hosted Postgres migration path

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 3 / 6 |
| Depends on | [S01.T02](../01-foundation/T02-sqlite-database-client.md), [S01.T04](../01-foundation/T04-database-migration-framework.md), [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S01.T08](../01-foundation/T08-web-skeleton.md), [S02.T08](../02-card-data-and-search/T08-full-text-search.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T04](T04-wasm-replay-and-play.md), [S08.T05](T05-twinleaf-differential-oracle.md), [S08.T06](T06-llm-assisted-authoring.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `doc` `PORTABILITY.md` and the adapter interface — from [S01.T02](../01-foundation/T02-sqlite-database-client.md)
- `module` the migration runner, the `NNNN_*.sql` file convention and the `-- @sqlite-only` / `-- @postgres:` block tagging that makes a Postgres migration set derivable — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `module` API config (`DATABASE_*`) — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `module` web build — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `doc` dialect module contract (FTS5 ↔ `tsvector`) — from [S02.T08](../02-card-data-and-search/T08-full-text-search.md)
- `decision` D-002 revised 2026-09-22 (local SQLite now, a Supabase-like Postgres later) and open item O-3 (which host) — from `project/02-decision-log.md`
- `external` Docker 29 on this machine, used to run the official `postgres:17` image for the rehearsal — machine fact

## Outputs (proposed)
- `doc` `docs/ops/POSTGRES.md` — target: a Supabase-like host (to be chosen by the user); Postgres migration set generated from the SQLite migrations (`*_json` → `jsonb`, FTS5 → generated `tsvector` with weights A–D + GIN, maintained tables → materialized views, `json_each` filters → `jsonb` operators), data export/import (`sqlite → csv/copy → postgres`), a `dialect/postgres` implementation of the FTS/JSON module, hosting notes for api/web with the worker staying on the user's PC (engine binary), go/no-go criteria and cost notes; a proof-of-concept run against a local Docker Postgres 17
- `file` `packages/db/migrations-pg/NNNN_*.sql` — the generated Postgres migration set, regenerated from `packages/db/migrations/` and never hand-edited
- `module` `packages/db/src/dialect/postgres.ts` and `packages/db/src/dialect/postgres/fts.ts` — the `Dialect` implementation that replaces the throwing stub left by [S01.T02](../01-foundation/T02-sqlite-database-client.md)
- `script` `pnpm db:pg:generate`, `pnpm db:pg:export`, `pnpm db:pg:import`, `pnpm db:pg:verify` — the four steps of the rehearsal, each runnable on its own

## Initial objective
Moving to a hosted database later is a planned, rehearsed step instead of a rewrite, because every dialect-specific piece was isolated from day one.

## Context

D-002 was revised on 2026-09-22: the database is a local SQLite file now, and "a Supabase-like solution will be sought for deployment in the future". The host itself is still open as O-3, and its only stated constraint is "any managed PostgreSQL ≥ 15". This subtask exists so that when the user picks a host, the answer is a rehearsed procedure rather than a discovery exercise — and so that if they never pick one, nothing was wasted, because everything produced here is a check on the SQL the project already writes.

Three earlier subtasks paid for this in advance, and this is where the receipt is collected. [S01.T02](../01-foundation/T02-sqlite-database-client.md) wrote `packages/db/PORTABILITY.md` and put every SQLite-only construct behind a `Dialect` interface with a deliberately throwing `postgres.ts` stub, so the interface could not quietly rot. [S01.T04](../01-foundation/T04-database-migration-framework.md) made every migration a numbered, checksum-pinned SQL file and required every SQLite-only statement to sit inside a `-- @sqlite-only` … `-- @end` block preceded by a `-- @postgres: <equivalent or "n/a: reason">` note. [S02.T08](../02-card-data-and-search/T08-full-text-search.md) designed the `tsvector` counterpart of `cards_fts` at the same time as the FTS5 index, and wrote it into `db/dialect/README.md`. Together those three make the Postgres migration set **derivable** rather than authored: a generator reads the SQLite files, keeps every untagged statement verbatim, and substitutes each tagged block with its recorded Postgres equivalent. If the generator cannot do that for some file, the defect is in the tagging, and that is a finding worth having.

The rehearsal is the other half. A translation nobody ran is a plan, not a path. Docker 29 is installed on this machine, so the whole thing runs against the official `postgres:17` image on loopback: apply the generated set, export the SQLite data, import it, point the API at it through `DATABASE_DIALECT=postgres`, and compare the answers of a fixed query set against SQLite row for row. That comparison is the acceptance, and it is deliberately about **result sets**, not about whether the schema applied — a schema that applies and then ranks search results in the wrong order is the failure mode this subtask exists to catch.

Two boundaries keep the subtask finite. **Nothing moves to production here**; there is no account, no credential and no deployment. And **the worker does not travel**: it spawns `ENGINE_BIN`, a native `ptcg-cli.exe`, and the engine never opens a database anyway ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) BR-S04.T12-01), so the realistic shape of a hosted deployment is api plus web on the host, worker and engine on the user's machine, both talking to the same Postgres. D-007 (single local user, no authentication, loopback binding) stops being true the moment the API is not on loopback, which is the single largest non-database consequence of this move and is recorded here rather than discovered later.

## Scope

- **In scope.** `scripts/pg-generate.mjs` (the SQLite → Postgres migration generator and its tag grammar); `packages/db/migrations-pg/`; `packages/db/src/dialect/postgres.ts` and `postgres/fts.ts`; the `DATABASE_DIALECT` switch and the `POSTGRES_URL` configuration in `apps/api`, `apps/worker` and `packages/etl`; `scripts/pg-export.mjs` / `pg-import.mjs` / `pg-verify.mjs`; the fixture query set and its comparator; the Docker Compose file for `postgres:17`; `docs/ops/POSTGRES.md` with the hosting notes, the go/no-go criteria and the cost notes; the record of what the rehearsal found, appended to the decision log as input to O-3.
- **Out of scope.** Choosing the host (O-3, the user's decision); creating any account or storing any credential; authentication and authorisation, which D-007 says do not exist and which a non-loopback API would require — named here, owned by a future subtask; connection pooling and PgBouncer tuning; running the ETL against Postgres in anger; changing any existing migration (the SQLite files stay the source of truth); the FTS5 index itself ([S02.T08](../02-card-data-and-search/T08-full-text-search.md)); the `cards_fts` DDL ([S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask. It is the delivery of architecture principle 10 ("dialect-specific SQL is isolated; a hosted Postgres is a migration set away") and the rehearsal D-002's consequences promise.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S08.T03-01 | The Postgres migration set is **generated**, never hand-authored: `packages/db/migrations-pg/` is rewritten wholly by `pnpm db:pg:generate` from `packages/db/migrations/`, and a hand edit is detected because regeneration is byte-stable. | `scripts/pg-generate.mjs` writes every file; `pnpm check` regenerates into a temp directory and diffs | `pg-generate.spec.ts > regenerating twice produces identical bytes`; `pnpm check` fails when a file under `migrations-pg/` differs from a fresh generation |
| BR-S08.T03-02 | Generation fails loudly on an untranslatable statement: a SQLite-only construct outside a tagged block, or a `-- @postgres:` note reading `n/a` for a statement that creates an object, aborts with the file, the line and the construct. | the generator's tag parser plus the SQLite-keyword scanner shared with `scripts/sql-lint.mjs` ([S01.T02](../01-foundation/T02-sqlite-database-client.md) BR-S01.T02-06) | `pg-generate.spec.ts > an untagged json_each aborts naming the file and line`; `> an "n/a" note on a CREATE aborts` |
| BR-S08.T03-03 | `packages/db/src/dialect/postgres.ts` implements every member of the `Dialect` interface; no `NotImplemented` throw survives this subtask, and adding a member to the interface breaks the Postgres build until it is implemented. | the shared `Dialect` type; both implementations are exported from `dialect/index.ts` and type-checked | `dialect.spec.ts > sqlite and postgres implement the same member set`; `pnpm typecheck` fails when a member is missing |
| BR-S08.T03-04 | The bm25 sign flip never reaches business code: SQLite sorts `rankExpr` ascending and Postgres sorts `ts_rank_cd` descending, and both dialects expose one `orderByRelevance()` fragment that already carries its direction. | `Dialect.orderByRelevance()` added to the interface here; [S02.T09](../02-card-data-and-search/T09-search-query-model-and-sql.md)'s builder uses it instead of a literal `ASC` | `dialect.spec.ts > the same query ranks the same card first on both engines` (fixture set, both dialects) |
| BR-S08.T03-05 | The rehearsal compares **result sets**, not counts: every query of the fixture set returns the same rows, in the same order, with the same values, on SQLite and on Postgres — or the difference is an entry in the documented-divergence table of `docs/ops/POSTGRES.md`, with a reason. | `scripts/pg-verify.mjs` serialises each result to canonical JSON and diffs | `pnpm db:pg:verify` exits 0 on the fixture database; a deliberately reordered `ORDER BY` in one query makes it exit 1 naming the query |
| BR-S08.T03-06 | Data import is idempotent and verified: re-running `pnpm db:pg:import` leaves the same row counts, and `pg-verify` compares per-table counts **and** a per-table SHA-256 over the canonically serialised rows before comparing queries. | truncate-then-`COPY` per table in dependency order, inside one transaction per table; the checksum step | `pnpm db:pg:import` twice → identical counts and identical per-table checksums (`pg-verify --tables-only`) |
| BR-S08.T03-07 | The rehearsal is local-only and credential-free: the only connection string used is the Docker one, no secret is committed, and `POSTGRES_URL` is absent from every checked-in file. | `docker-compose.pg.yml` with a fixed local password; the secret scan in `pnpm check` | `pnpm check` fails on a fixture committing a `postgres://` URL with a non-local host; `grep` over the repository finds no host other than `127.0.0.1` |
| BR-S08.T03-08 | No existing SQLite migration is edited by this subtask: `packages/db/migrations/` checksums are identical before and after, which is also what [S01.T04](../01-foundation/T04-database-migration-framework.md) BR-S01.T04-02 would enforce against any live database. | the subtask touches only `migrations-pg/`, `dialect/`, `scripts/` and `docs/ops/` | `pnpm db:status` on the developer database reports the same applied checksums after the subtask as before |
| BR-S08.T03-09 | A Postgres deployment keeps one writer per domain: the etl writes baseline tables, the api user-facing tables, the worker job/measurement/evidence tables. Hosting does not create a second writer and does not move the engine. | `docs/ops/POSTGRES.md` topology section; the existing eslint table-ownership rules ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) BR-S04.T14-08) are dialect-independent | `pnpm lint` unchanged; the topology diagram in `docs/ops/POSTGRES.md` names one writer per domain |
| BR-S08.T03-10 | The subtask ends with a written go/no-go: `docs/ops/POSTGRES.md` records what the rehearsal cost, what diverged, and what a host must provide (PostgreSQL ≥ 15, `unaccent`, `pg_trgm` if fuzzy name search is wanted, ≥ 2 GB of storage for the current dataset). Choosing the host stays O-3. | the "Go / no-go" section of `docs/ops/POSTGRES.md` plus a dated note appended to the decision log | the decision log contains a dated entry referencing O-3 with the rehearsal's findings; `docs/ops/POSTGRES.md` has all ten sections |

## Data operations

This subtask creates no application table. What it defines is the mapping every existing object goes through, and the one-time move of its rows.

**Migration mapping** — every object of migrations 0001–0008 (plus the ops tables added in this stage) and what it becomes.

| SQLite object | Postgres object | Transformation | Data move |
|---|---|---|---|
| `schema_migrations` | `schema_migrations` | unchanged; `version INTEGER PRIMARY KEY` → `integer PRIMARY KEY` | not copied — the Postgres set has its own numbering and is applied by the same runner against the `migrations-pg/` directory |
| `etl_runs` | `etl_runs` | `id INTEGER PRIMARY KEY` → `bigint GENERATED BY DEFAULT AS IDENTITY`; both `CHECK`s verbatim; the partial index `WHERE status = 'running'` is supported as written | `COPY` from CSV; the identity sequence is reset with `setval` after import |
| `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances` | same tables | `*_json TEXT` → `jsonb` with a GIN index on `cards.raw_ptcg_json`, `cards.raw_tcgdex_json` and `cards.rules_json`; text primary keys unchanged | `COPY` from CSV, `*_json` columns cast on input (`::jsonb`); ≈20.4k card rows |
| `cards_fts` (FTS5 virtual table) | generated column `cards.search_tsv tsvector` + GIN index | dropped entirely; the index becomes a `GENERATED ALWAYS AS (setweight(...) \|\| …) STORED` column on `cards`, weights A/B/C/D | **not copied** — recomputed by Postgres on insert; `rebuildFts` becomes a no-op on this dialect |
| `cards_latest_price` (view) | same view | unchanged SQL | not copied — a view |
| `cards_market_usd` (maintained table) | `MATERIALIZED VIEW cards_market_usd` | the table plus its refresh step becomes one materialized view with the same `SELECT`, and a unique index on `card_id` so a concurrent refresh is possible later | not copied — `REFRESH MATERIALIZED VIEW` after the price rows land |
| `price_history` | `price_history` | unchanged; four-column primary key kept; `REAL` → `double precision` | `COPY`; the largest table (≈10k rows per snapshot date) |
| `tournaments`, `archetypes`, `decks`, `deck_cards` | same tables | unchanged; `icons_json`/`list_json` → `jsonb` | `COPY` in that order so the foreign keys hold; ≈400 tournaments, tens of thousands of decks, ≈1M `deck_cards` rows |
| `user_decks`, `user_deck_versions` | same tables | `*_json` → `jsonb`; `id INTEGER PRIMARY KEY` → identity | `COPY`; sequences reset |
| `jobs`, `job_pairings`, `games` | same tables | `params_json`/`progress_json`/`result_json`/`outcomes_json`/`deck_*_json` → `jsonb` (+ GIN on `jobs.params_json`); `log_blob BLOB` → `bytea`; the three `CHECK`s on `jobs` verbatim; the composite foreign key on `games` unchanged | `COPY`; `log_blob` exported hex-encoded and imported with `decode(…, 'hex')`; `games` may be skipped with `--skip-games` because it is regenerable |
| `effect_texts`, `card_parts`, `rule_codes`, `text_codes`, `text_sentences`, `card_overrides`, `rule_scenarios` | same tables | `params_schema_json`, `ir_body_json`, `params_json` → `jsonb`; `CHECK (code = upper(code))` verbatim | `COPY`; `rule_scenarios` is a mirror of git and can be re-derived instead |
| `rule_evidence` | `rule_evidence` | unchanged columns; the two insert-only triggers are rewritten as `BEFORE UPDATE OR DELETE … FOR EACH ROW EXECUTE FUNCTION raise_insert_only()` (RN-64) | `COPY` with the triggers created **after** the import, or the ledger cannot be loaded |
| `rules_current`, `card_usage_cache`, `coverage_history` | same tables | unchanged; `card_usage_cache` may also be a materialized view, and `docs/ops/POSTGRES.md` records that it stays a table so its single-writer rule is unchanged | `card_usage_cache` is recomputed rather than copied; the other two are copied |
| view `card_status` | same view | unchanged SQL; the `part_state` CTE is portable as written | not copied |
| `bots`, `suites`, `suite_opponents`, `measurements`, `measurement_opponents`, `optimizer_candidates` | same tables | `*_json` → `jsonb`; `REAL` → `double precision` | `COPY`; frozen rows must arrive byte-identical or RN-40/RN-41 are violated, which `pg-verify`'s per-table checksum covers |
| `etl_alerts` and the authoring tables added in this stage ([S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T06](T06-llm-assisted-authoring.md)) | same tables | `*_json` → `jsonb`; same `CHECK`s | `COPY`; both are small |
| `PRAGMA` statements | session `SET` / server configuration | `journal_mode`, `synchronous`, `busy_timeout`, `foreign_keys` have no counterpart: WAL is always on, foreign keys are always enforced, `busy_timeout` becomes `lock_timeout` | none |

**CRUD** — the rows this subtask itself writes, all of them into the rehearsal database.

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| every table of the rehearsal database | C | script (`pnpm db:pg:import`) | once per rehearsal | truncate-then-`COPY` per table in foreign-key order, one transaction per table; re-running yields identical counts and checksums (BR-S08.T03-06) | the only write path against Postgres in this subtask |
| every table of `$DATABASE_PATH` | R | script (`pnpm db:pg:export`) | once per rehearsal | read-only; opened with `readonly: true` through `openDatabase` ([S01.T02](../01-foundation/T02-sqlite-database-client.md)) | the developer database is never modified |
| `cards.search_tsv`, `cards_market_usd` | C (derived) | script (`pnpm db:pg:import`) | after the card and price rows land | recomputed by Postgres, never copied | the two objects whose contents do not travel |
| `packages/db/migrations-pg/*.sql` | C/U | script (`pnpm db:pg:generate`) | on every generation | whole-directory rewrite; byte-stable (BR-S08.T03-01) | not a database object; a build artifact under version control |
| `$DATA_DIR/pg-export/*.csv` | C | script (`pnpm db:pg:export`) | per rehearsal | one file per table, overwritten; outside the repository (D-005) | ≈1 GB for the full dataset; `--tables` restricts it |
| `packages/db/migrations/*.sql` | — | — | never | the SQLite set is the source of truth (BR-S08.T03-08) | edited only by its owning subtask |

## Interfaces

**The translation table.** This is the content of `docs/ops/POSTGRES.md` §3 and the substitution table the generator applies. Everything not listed is portable as written, which is the point of `PORTABILITY.md`.

| SQLite | Postgres | Note |
|---|---|---|
| `TEXT`, `INTEGER`, `REAL`, `BLOB` | `text`, `bigint`, `double precision`, `bytea` | `INTEGER` is widened deliberately; SQLite integers are already 64-bit |
| `id INTEGER PRIMARY KEY` | `id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | `BY DEFAULT`, not `ALWAYS`, so `COPY` can carry the original ids |
| `<col>_json TEXT` | `<col>_json jsonb` + `CREATE INDEX … USING GIN (<col>_json)` on the columns that are filtered | `jsonb` reorders keys, so a byte comparison of a JSON column is meaningless after the move; `pg-verify` compares parsed values |
| `cards_fts` FTS5 + `bm25(cards_fts, 0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5)` sorted `ASC` | `cards.search_tsv` generated `tsvector` + GIN, `ts_rank_cd(search_tsv, query)` sorted `DESC` | `setweight(to_tsvector('english', name),'A')` ‖ attack/ability **names** `'B'` ‖ attack/ability **text** and `rules` `'C'` ‖ `flavor_text` `'D'`; the numeric bm25 weights collapse to four classes, which is the first documented divergence |
| `cards_fts MATCH '"heal"* "bench"*'` | `search_tsv @@ to_tsquery('english', 'heal:* & bench:*')` | `buildMatch`'s `"tok"*` per token becomes `tok:*` joined by `&` (or `\|` when `or: true`); `websearch_to_tsquery` is used for the unquoted free-text path |
| `tokenize = 'unicode61 remove_diacritics 2'` | `CREATE EXTENSION unaccent` + `unaccent()` in the generated expression | a host without `unaccent` is a no-go criterion (BR-S08.T03-10) |
| `cards_market_usd` (table refreshed by the ETL) | `MATERIALIZED VIEW cards_market_usd` + `UNIQUE INDEX cards_market_usd_card_idx ON cards_market_usd (card_id)` | `refreshMarketUsd()` becomes `REFRESH MATERIALIZED VIEW cards_market_usd`, still inside the snapshot's transaction ([S02.T07](../02-card-data-and-search/T07-prices-snapshot.md) BR-S02.T07-07) |
| `json_each(c.rules_json)` | `jsonb_array_elements_text(c.rules_json)` | in a `FROM` position; the `value` column becomes the function's own output |
| `EXISTS (SELECT 1 FROM json_each(x) WHERE value = ?)` | `x ? $1` (jsonb containment/existence) | `jsonContains` in the `Dialect` interface; the GIN index serves it |
| `CAST(number AS INTEGER)` for the card-number sort | `NULLIF(regexp_replace(number,'\D','','g'),'')::int` | SQLite's `CAST` silently yields 0 for `TG12`; the Postgres form yields NULL, which sorts last — a divergence the fixture set asserts rather than hides |
| `group_concat(a.name, ' \| ' ORDER BY a.idx)` | `string_agg(a.name, ' \| ' ORDER BY a.idx)` | only inside the FTS rebuild, which disappears on this dialect |
| `strftime('%Y-%m-%dT%H:%M:%SZ','now')` | `to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` | `nowUtc()` in the `Dialect` interface; timestamps stay ISO-8601 **text**, so no type changes |
| `INSERT … ON CONFLICT (cols) DO UPDATE` | identical | the reason `INSERT OR REPLACE` was banned from day one |
| `BEGIN IMMEDIATE` | `BEGIN` | `transaction(fn, "immediate")` maps to a plain `BEGIN`; `SAVEPOINT`/`RELEASE` are identical |
| `PRAGMA busy_timeout = 5000` | `SET lock_timeout = '5s'` | per session, applied by the adapter on connect |
| `PRAGMA foreign_keys = ON` | no-op | always enforced |
| `VACUUM INTO '<path>'` | `pg_dump --format=custom` | `pnpm db:backup` gets a dialect branch; the verification step becomes `pg_restore --list` |
| `PRAGMA integrity_check` | `SELECT 1` + `pg_restore --list` on the dump | there is no equivalent; the backup check becomes "the dump is readable" |
| `PRAGMA table_info(t)` | `information_schema.columns` | the schema-drift test ([S01.T04](../01-foundation/T04-database-migration-framework.md) BR-S01.T04-09) gets a dialect branch |
| `sqlite_master` | `pg_catalog.pg_class` / `information_schema.tables` | used by `/health`'s `countOrZero` ([S01.T07](../01-foundation/T07-api-skeleton-and-health.md) BR-S01.T07-07) |
| insert-only triggers on `rule_evidence` | `BEFORE UPDATE OR DELETE … EXECUTE FUNCTION raise_insert_only()` | `RAISE EXCEPTION` instead of `RAISE(ABORT, …)`; RN-64 is preserved |
| partial index `… WHERE status = 'running'` | identical | supported since 7.2 |
| views (`cards_latest_price`, `card_status`, `stale_evidence`) | identical | none of them uses a SQLite-only construct |

**Configuration.** One new variable selects the dialect; everything else is a connection string.

| Variable | Default | Used by |
|---|---|---|
| `DATABASE_DIALECT` | `sqlite` | api, worker, etl — `postgres` selects `dialect/postgres.ts` and `POSTGRES_URL` instead of `DATABASE_PATH` |
| `POSTGRES_URL` | — (required when `DATABASE_DIALECT=postgres`) | api, worker, etl — `postgres://pokesearch:pokesearch@127.0.0.1:5433/pokesearch` for the rehearsal |
| `POSTGRES_POOL_MAX` | `4` | api, worker — one small pool per process; the worker needs one connection plus the cancellation poller |
| `POSTGRES_STATEMENT_TIMEOUT_MS` | `30000` | api — matches `REQUEST_TIMEOUT_MS` from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md) |
| `PG_EXPORT_DIR` | `$DATA_DIR/pg-export` | the export/import scripts |

**Commands.**

| Command | Arguments | Effect | Exit codes |
|---|---|---|---|
| `pnpm db:pg:generate` | `[--out <dir>] [--check]` | rewrites `packages/db/migrations-pg/` from `packages/db/migrations/`; `--check` generates into a temp directory and diffs | 0 ok · 1 drift (`--check`) · 2 an untranslatable statement (BR-S08.T03-02) |
| `pnpm db:pg:export` | `[--db <path>] [--out <dir>] [--tables a,b] [--skip-games]` | one CSV per table from a read-only SQLite connection, in foreign-key order, with a `manifest.json` of counts and per-table checksums | 0 ok · 2 source unreadable |
| `pnpm db:pg:import` | `[--url <postgres://…>] [--in <dir>] [--truncate]` | applies `migrations-pg/` through the same runner, then truncate-then-`COPY` per table, then `REFRESH MATERIALIZED VIEW cards_market_usd` | 0 ok · 1 a table failed · 2 schema mismatch |
| `pnpm db:pg:verify` | `[--url …] [--tables-only] [--queries <file>]` | per-table counts and checksums, then the fixture query set on both engines with a canonical-JSON diff | 0 identical · 1 a difference outside the documented-divergence table · 2 connection failure |

**`packages/db/src/dialect/postgres.ts`** implements the interface [S01.T02](../01-foundation/T02-sqlite-database-client.md) declared — `jsonArrayElements`, `jsonContains`, `fullTextMatch`, `rank`, `upsert`, `nowUtc`, `numericOrder` — plus the two members this subtask adds to both implementations: `orderByRelevance()` (BR-S08.T03-04) and `refreshDerived(name)` (a no-op in SQLite, `REFRESH MATERIALIZED VIEW` in Postgres). The `Db` interface itself is unchanged; a `PgDb` wraps `pg`'s pooled client behind the same seven methods, with `run/get/all` returning the same shapes and `DbError { code, sql, params }` carrying the `SQLSTATE` in `code`.

**The fixture query set** (`packages/db/fixtures/pg-verify/*.sql`) is the acceptance's teeth: twenty queries covering free-text search with and without filters, the card-number sort, a `json_each` filter, the meta window aggregate of [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), the coverage query of [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md), a job listing with its pairings, and the price-latest view. Each file carries its parameters as a JSON header comment so the comparator can bind them identically on both engines.

**The rehearsal environment.** `docker-compose.pg.yml` runs `postgres:17` bound to `127.0.0.1:5433` (5433, not 5432, so a pre-existing local Postgres is never touched), with `POSTGRES_PASSWORD=pokesearch`, a named volume, and `command: postgres -c shared_preload_libraries=''`. `docs/ops/POSTGRES.md` records the image digest actually used, because "Postgres 17" is not a version a result can be attributed to.

**`docs/ops/POSTGRES.md` — ten sections.** (1) Why and when: D-002 revised, O-3 still open, and the rule that nothing before this subtask depends on the host. (2) Topology: api + web hosted, worker + engine local, one writer per domain (BR-S08.T03-09), and the D-007 consequence that a non-loopback API needs an authentication story that does not exist yet. (3) The translation table above. (4) The generator, its tag grammar and how to add a substitution. (5) Export/import, including the `log_blob` hex round trip and the tables that are recomputed rather than copied. (6) The rehearsal: the compose file, the four commands, the image digest and the wall times measured. (7) Documented divergences, each with a reason: the four `tsvector` weight classes, the `CAST(number AS INTEGER)` NULL behaviour, `jsonb` key reordering, and anything the fixture set finds. (8) Go / no-go criteria: PostgreSQL ≥ 15, `unaccent` available, extensions installable, ≥ 2 GB storage, and a measured p95 for the search query. (9) Cost notes: the dataset size per table and the storage/egress shape, with the numbers from the rehearsal rather than from a price page. (10) What stays undecided: O-3, authentication, and whether the ETL runs on the host or locally.

## Implementation steps

1. Add the two `Dialect` members (`orderByRelevance`, `refreshDerived`) to the interface and to `dialect/sqlite.ts`, leaving `postgres.ts` still throwing; `pnpm typecheck` and the existing search tests stay green (BR-S08.T03-03, -04).
2. Write `docker-compose.pg.yml` and a `pnpm pg:up` / `pnpm pg:down` pair; confirm `postgres:17` answers on `127.0.0.1:5433` and record the image digest.
3. Write `scripts/pg-generate.mjs`: the tag parser, the substitution table above, the SQLite-keyword scanner, and byte-stable output; spec the two abort cases (BR-S08.T03-01, -02).
4. Generate `migrations-pg/` for 0001–0008 and apply it to the Docker database with the existing migration runner pointed at that directory; iterate on the substitution table until it applies clean.
5. Write `packages/db/src/dialect/postgres.ts` and `postgres/fts.ts` (the generated `tsvector` expression, `to_tsquery` building from `tokens()`, `ts_rank_cd` with its descending order) and make `dialect.spec.ts` run the shared cases against both implementations.
6. Write `scripts/pg-export.mjs` with the foreign-key ordering, the `manifest.json` of counts and checksums, and the `log_blob` hex encoding.
7. Write `scripts/pg-import.mjs` with truncate-then-`COPY`, the identity-sequence reset, the deferred creation of the `rule_evidence` triggers, and the materialized-view refresh; run it twice and compare (BR-S08.T03-06).
8. Write the twenty fixture queries and `scripts/pg-verify.mjs` with its canonical-JSON comparator and its documented-divergence allow-list (BR-S08.T03-05).
9. Add `DATABASE_DIALECT` and `POSTGRES_URL` to the api, worker and etl configuration, and start the API against the rehearsal database; check `/health`, a free-text search, a meta page and a coverage request by hand.
10. Run the full rehearsal on real data, record the four wall times (generate, export, import, verify), the per-table sizes and the search p95, and append them to `docs/ops/POSTGRES.md` §6 and §9.
11. Write `docs/ops/POSTGRES.md`'s remaining sections, especially §2's D-007 consequence and §7's divergence list.
12. Append a dated entry to the decision log recording what the rehearsal found and what a host must provide, as the input O-3 needs (BR-S08.T03-10).

## Edge cases and error handling

- **A rehearsal type mismatch** — the commonest failure, and the one worth naming: a column SQLite stores as `TEXT` because the loader wrote a string, while the Postgres column is `bigint`. `COPY` aborts on the first offending row with its line number. The import script does not coerce; it reports the table, the column, the offending value and the two types, because a silent `::bigint` cast would hide a loader defect that is also wrong on SQLite. The known candidates are `cards.hp` (a string in the source, deliberately `TEXT` here), `price_history` numerics arriving as `''` rather than NULL, and `first`/`winner` in `games`, which are `0`/`1` integers and must not become booleans.
- **An untagged SQLite-only construct in a migration.** Generation aborts (BR-S08.T03-02) naming the file and line. The fix is in the owning subtask's migration, not here — this subtask never edits `packages/db/migrations/` (BR-S08.T03-08) — so the outcome is a defect report against that file plus a `-- @postgres:` note.
- **The `cards_fts` rebuild has no counterpart.** `rebuildFts(db)` is called by `etl full`, `etl delta` and `etl fts`. On this dialect it returns `{ rows: <count of cards>, ms: 0 }` without touching anything, because the generated column is maintained by Postgres. The row-count invariant ([S02.T08](../02-card-data-and-search/T08-full-text-search.md) BR-S02.T08-01) becomes trivially true, and `ftsRowCountMatches` returns true by construction — which is recorded in `docs/ops/POSTGRES.md` §7 so nobody reads a green check as evidence the index was rebuilt.
- **Ranking differs even though both queries "work".** The four `tsvector` weight classes cannot reproduce bm25's numeric weights, so a card ranked third on SQLite may rank second on Postgres. `pg-verify` treats the relevance queries as order-sensitive but allows a declared tolerance: the top result must match, and any reordering below it is reported and must be accepted explicitly in the divergence table. Accepting it silently would make the whole verification worthless.
- **`jsonb` reorders and de-duplicates keys.** A byte comparison of `raw_ptcg_json` after the round trip fails even when nothing is lost, and duplicate keys — which SQLite's `TEXT` preserves — are collapsed. The comparator parses both sides before comparing, and the export manifest's checksum for a `*_json` column is computed over the canonicalised value on both sides. RN-01 (both raw documents preserved) survives the move in meaning, not in bytes, and `docs/ops/POSTGRES.md` §7 says so.
- **`rule_evidence`'s insert-only triggers block the import.** They are RN-64's enforcement and they refuse `UPDATE`/`DELETE`, which a truncate-then-`COPY` needs. The import creates the table without them, loads the ledger, and creates the trigger function afterwards — and `pg-verify` asserts that an `UPDATE` against the loaded table raises, so the protection is proven present rather than assumed.
- **The Docker container is not running.** Every `pg:*` command exits 2 with the compose command to start it. Nothing falls back to a local Postgres on 5432, because operating on an unrelated database is worse than failing.
- **A partial import.** Each table is one transaction, so a failure leaves earlier tables loaded and later ones empty; `pg-verify --tables-only` names exactly which tables diverge. `--truncate` re-runs from scratch, which is cheap enough at this dataset size that no resume logic is written.
- **`games.log_blob` at 1 MB per row.** The CSV export of a job with `store_logs` is large and slow to hex-encode. `--skip-games` exists for that reason: `games` rows are regenerable by re-running the job, and `job_pairings` carries the aggregates that matter. The manifest records that they were skipped so `pg-verify` does not report a false divergence.
- **`SQLITE_BUSY` has no Postgres twin.** The adapter maps a `lock_timeout` expiry to the same `DbError` code the callers already handle, so the retry logic in the worker ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)) and the failure mapping in the API ([S01.T07](../01-foundation/T07-api-skeleton-and-health.md)) need no change. This is verified with a deliberately held lock rather than assumed.
- **The user picks a host that ships an older PostgreSQL.** Generated columns need 12, `jsonb` predicates and GIN need far less, and nothing here uses a feature newer than 15. The go/no-go section states 15 as the floor, matching O-3's own recommendation, and names the two features that would break below 12.

## Acceptance / verification

- [ ] `pnpm db:pg:generate --check` exits 0 on the repository and exits 2 on a fixture migration containing an untagged `json_each`, naming the file and line (BR-S08.T03-01, -02).
- [ ] `pnpm pg:up && pnpm db:pg:import` applies every generated migration to `postgres:17` on `127.0.0.1:5433`, and `SELECT max(version) FROM schema_migrations` equals the highest SQLite migration number.
- [ ] `pnpm db:pg:import` run twice produces identical per-table counts and identical per-table checksums (`pnpm db:pg:verify --tables-only` exits 0) (BR-S08.T03-06).
- [ ] `pnpm db:pg:verify` exits 0 over the twenty fixture queries — search with and without filters, the card-number sort, a `json_each` filter, the meta aggregate, the coverage query, a job listing and the price-latest view — and exits 1 naming the query when one fixture's `ORDER BY` is deliberately changed (BR-S08.T03-05).
- [ ] With `DATABASE_DIALECT=postgres` and `POSTGRES_URL` set, `pnpm --filter api dev` starts, `GET /health` returns the Postgres server version in place of `sqliteVersion` with the same non-zero counts, and a free-text search for `charizar` returns the same first card as on SQLite (BR-S08.T03-04).
- [ ] `dialect.spec.ts > sqlite and postgres implement the same member set` passes, and `packages/db/src/dialect/postgres.ts` contains no `NotImplemented` (BR-S08.T03-03).
- [ ] An `UPDATE` against `rule_evidence` on the imported database raises, proving the insert-only triggers were created after the load (RN-64 preserved).
- [ ] `pnpm db:status` against the developer SQLite database reports the same applied checksums before and after this subtask (BR-S08.T03-08).
- [ ] `pnpm check` fails on a fixture committing a `postgres://` URL with a non-local host, and `grep -r "postgres://" docs packages apps scripts` finds only `127.0.0.1` (BR-S08.T03-07).
- [ ] `docs/ops/POSTGRES.md` exists with all ten sections, including the measured wall times, the image digest, the divergence list and the go/no-go criteria; the decision log carries a dated entry against O-3 (BR-S08.T03-10).

## Risks and open questions

- **Risk — the generator becomes a second schema.** A substitution table long enough to encode business meaning is a schema in disguise, and it will drift. Mitigation: the generator only substitutes **tagged blocks** and never rewrites untagged SQL, so its size is bounded by the number of SQLite-only constructs the project deliberately allows — today seven, listed in `PORTABILITY.md` §7. If the table grows past roughly a dozen entries, that is the signal that the portability rules are being violated upstream, and it should be reported rather than absorbed.
- **Risk — the search experience changes and nobody notices.** bm25's per-column numeric weights become four `tsvector` classes, which is a genuine loss of fidelity. Mitigation: the relevance fixtures assert the top result, the divergence is written down, and the go/no-go section states that if relevance matters more than hosting, the answer is to stay on SQLite — which D-002 already permits indefinitely.
- **Risk — the rehearsal is run once and rots.** A year later the migration set has six more files and the generator has never seen them. Mitigation: `pnpm db:pg:generate --check` runs inside `pnpm check`, so a new migration that cannot be translated fails the ordinary quality gate on the day it is written, long before anyone wants a host.
- **Risk — D-007 is quietly broken by hosting.** The API binds to loopback precisely because there is no authentication ([S01.T07](../01-foundation/T07-api-skeleton-and-health.md) BR-S01.T07-02). A hosted API on a public address with no auth is a different product. Mitigation: `docs/ops/POSTGRES.md` §2 states it as a blocking prerequisite and this subtask deliberately does **not** relax the loopback refinement; a future subtask owns it.
- **Question — does the ETL run on the host or on the user's machine?** Running it locally against a remote Postgres turns ≈1M `deck_cards` inserts into network round trips; running it on the host needs the raw cache there. Recommendation: keep the ETL local for the first hosted deployment and measure, since `etl delta` writes little; record the measurement in `docs/ops/POSTGRES.md` §10. The user decides with O-3.
- **Question — should `card_usage_cache` become a materialized view?** It is derived, refreshed by one writer, and would be one `REFRESH` instead of a delete-then-insert. Recommendation: leave it a table, because [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) BR-S05.T12-04 pins its single-writer semantics and its explicit `computed_at`, both of which a materialized view would blur. Revisit only if the refresh becomes slow on Postgres.
- **DEPENDENCY-PROPOSAL (resolution, not a new edge).** [S01.T04](../01-foundation/T04-database-migration-framework.md)'s Risks section proposes adding `S01.T04 → S08.T03`. That edge already exists in both headers — `S01.T04` lists `S08.T03` under `Unblocks` and this file lists it under `Depends on` — so the proposal is satisfied and the note in `S01.T04` is stale. No change is made here; it is reported so the stale note can be removed by that file's owner.
- **DEPENDENCY-PROPOSAL (answer to S01.T08).** [S01.T08](../01-foundation/T08-web-skeleton.md)'s Risks section proposes removing `S01.T08 → S08.T03`, on the grounds that nothing in the web shell is consumed by a database-hosting subtask. The edge is **real and should be kept**: hosting re-points the web app's origin, and three of the shell's rules are what make that a configuration change rather than a rewrite — BR-S01.T08-05 (relative paths only, no host or port in web source), the Vite proxy that makes `/api` same-origin in development, and the `CORS_ORIGINS` list that must gain the hosted origin. §2 of `docs/ops/POSTGRES.md` covers exactly that, so the input `module` web build is consumed here. Reported so the note in `S01.T08` can be resolved rather than acted on.

## References

- [Decision log](../../project/02-decision-log.md) — D-002 as revised on 2026-09-22 (local SQLite outside OneDrive, Postgres-portable, "a Supabase-like solution will be sought for deployment in the future"), its consequence naming this subtask, D-005 (heavy artifacts outside the repository), D-007 (no authentication, loopback) and open item O-3 ("Which Supabase-like host to target later — any managed PostgreSQL ≥ 15", needed by S08.T03 only).
- [Data model overview](../../project/04-data-model-overview.md) §"Postgres portability notes" — the seed rows of the translation table: `*_json TEXT` → `jsonb` with GIN; `cards_fts` → generated `tsvector` with weights A/B/C/D + GIN; `cards_market_usd` → materialized view; `json_each` filters → `jsonb` operators; `CAST(number AS INTEGER)` → `NULLIF(regexp_replace(number,'\D','','g'),'')::int`; views unchanged. Also the full table inventory by migration number, which is the checklist the mapping table walks.
- [S01.T02](../01-foundation/T02-sqlite-database-client.md) — the `Db` and `Dialect` interfaces, the throwing `dialect/postgres.ts` stub this subtask replaces, and `PORTABILITY.md` §7 (known divergences), §8 (transactions: `BEGIN IMMEDIATE` → `BEGIN`, `busy_timeout` → `lock_timeout`, `SAVEPOINT` identical) and §9 (the type-mapping table).
- [S01.T04](../01-foundation/T04-database-migration-framework.md) — the `NNNN_<snake_name>.sql` convention, the `-- @sqlite-only` … `-- @end` / `-- @postgres:` tagging that makes generation possible (BR-S01.T04-05), the checksum immutability rule and the `TABLES` descriptor the drift test walks.
- [S02.T08](../02-card-data-and-search/T08-full-text-search.md) — `db/dialect/README.md` §4, which already designs the Postgres counterpart: the generated `tsvector` with `setweight` A/B/C/D, the GIN index, `websearch_to_tsquery` plus `:*` for prefixes, and `ts_rank_cd` sorted descending — "the sign flip the adapter hides".
- [Architecture](../../project/03-architecture-overview.md) — principle 10 (Postgres-portable schema), principle 2 (who writes what) and the environment table this subtask extends with `DATABASE_DIALECT` and `POSTGRES_URL`.
- External: PostgreSQL 17 documentation on generated columns, `tsvector`/`setweight`/`ts_rank_cd`, `unaccent`, GIN on `jsonb`, `COPY`, identity columns and materialized views; the `postgres:17` image on Docker Hub; Docker 29 on this machine (verified).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
