# S04.T14 — Jobs schema migration

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 14 / 18 |
| Depends on | [S01.T04](../01-foundation/T04-database-migration-framework.md) |
| Unblocks | [S04.T15](T15-worker-job-runner.md), [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md), [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md) |
| Parallel with | [S04.T01](T01-engine-workspace-and-crates.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` migration runner and conventions — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `doc` `project/04-data-model-overview.md` (the Jobs domain and its owner)
- `file` `pokemon/src/pokesearch/db/schema.sql` — the legacy `sim_runs` / `sim_results` shapes; read-only reference

## Outputs (proposed)
- `file` `packages/db/migrations/0005_jobs.sql` — `jobs(id, kind, status queued|running|done|error|cancelled, params_json, progress_json, result_json, error, engine_build, rules_snapshot, workers, created_at, started_at, finished_at)`, `job_pairings(job_id, idx, deck_a_json, deck_b_json, bot_a_id, bot_b_id, seed_base, weight, label, games, wins, losses, ties, outcomes_json, avg_turns, invalid_actions, errors, fingerprint)` PK `(job_id, idx)`, `games(job_id, pairing_idx, game_idx, seed, first, winner, reason, turns, duration_us, log_blob)` — consumed by [S04.T15](T15-worker-job-runner.md), [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md), [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)
- `module` `@pokesearch/db/schema` row types `JobRow`, `JobPairingRow`, `GameRow`, covered by the schema-drift test that the migration framework established

## Initial objective
Every engine invocation and its results are durable rows, so runs can be listed, resumed, compared and audited long after the process exited.

## Context

The engine never opens the database (architecture principle 1) and the worker is the only writer of these tables (principle 2). What this migration defines is therefore the exact shape in which the JSON Lines of [S04.T12](T12-cli-job-protocol.md) become rows, and it is worth being precise because five later subtasks read them: the worker writes them ([S04.T15](T15-worker-job-runner.md)), the API serves them ([S04.T16](T16-api-jobs-and-sse.md)), the optimizer compares them ([S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md)), the coach reads game logs ([S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md)) and the replay viewer reads them again ([S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)).

The legacy had `sim_runs` and `sim_results` and they are the right starting point with four things missing. `sim_runs(id, project_id, version_id, kind, mode, status, progress_json, result_json, log_text, started_at, finished_at, error)` has no `created_at` — a queued run had `started_at` set at insert time, so "how long did it wait" was unanswerable — and no `engine_build` or rules snapshot, which means no stored score can be attributed to the code that produced it (RN-49, RN-50). `sim_results(run_id, version_id, opponent_archetype_id, opponent_deck_id, weight, games, wins, losses, ties, avg_turns, first_player_wins, invalid_actions, errors)` has no fingerprint and no outcome breakdown, so the 54/32/12/2 end-reason distribution the legacy measured was never stored per pairing, only computed ad hoc. And there was no per-game table at all: `log_text` accumulated a human-readable narrative on the run row, which is neither queryable nor a replay.

Four deliberate changes follow. **`engine_build` and `rules_snapshot` are columns on `jobs`**, written from `ptcg-cli --version` and from the active rules hash, so every number carries its provenance. **`job_pairings.fingerprint` is stored**, which is what makes RN-50's "same hash, faster" check possible across runs and days. **`games` is its own table**, written only when the job asked for it, with a compressed log blob only when it asked for that too — the storage cost of a 3,000-game job with logs is real, so it is opt-in twice. And **`jobs.status` is a `CHECK`-ed enum with `created_at` separate from `started_at`**, so the queue is a queue.

One legacy habit is explicitly not carried over: `store.add_results` used `INSERT OR REPLACE`, which `packages/db/PORTABILITY.md` forbids because it deletes and re-inserts the row, firing cascades. Here pairing upserts use `ON CONFLICT (job_id, idx) DO UPDATE`.

## Scope

- **In scope.** `packages/db/migrations/0005_jobs.sql` with the full DDL below; the three tables, their constraints, their indexes and the `-- @postgres:` notes; `JobRow`, `JobPairingRow`, `GameRow` in `@pokesearch/db/schema` plus their `TABLES` descriptor entries for the drift test; the ownership rules in the CRUD table; a short `packages/db/migrations/0005_jobs.md` recording the four deviations from the legacy shape; the retention rule for `games`.
- **Out of scope.** Writing any row ([S04.T15](T15-worker-job-runner.md)); the API over these tables ([S04.T16](T16-api-jobs-and-sse.md)); the `bots` table that `bot_a_id`/`bot_b_id` will reference ([S06.T07](../06-bots/T07-bot-registry-and-freezing.md), migration 0007) — until it exists the columns are plain text; `optimizer_candidates` ([S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md), migration 0008); `measurements` and `suites` ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), migration 0007); the event-log format inside `log_blob` ([S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)); the Postgres translation ([S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It is the storage layer for RN-49 (every measurement records its provenance) and RN-50 (a performance change is accepted only with an identical result hash), both owned elsewhere.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S04.T14-01 | `jobs.status` is one of `queued`, `running`, `done`, `error`, `cancelled`, and the timestamps agree with it: `queued` has `started_at IS NULL`; `running` has `started_at NOT NULL` and `finished_at IS NULL`; `done`/`error`/`cancelled` have both set. | two `CHECK` constraints on `jobs` | `jobs-schema.spec.ts > status is constrained to five values`; `> a running job without started_at is rejected`; `> a done job without finished_at is rejected` |
| BR-S04.T14-02 | `created_at` is distinct from `started_at`: a row is inserted `queued` with `created_at` only, so queue latency is measurable. | `created_at TEXT NOT NULL` with no default tied to the start | `jobs-schema.spec.ts > created_at is required and started_at is nullable` |
| BR-S04.T14-03 | A pairing is identified by `(job_id, idx)` and upserted, never deleted and re-inserted: progress updates use `ON CONFLICT (job_id, idx) DO UPDATE`, and `INSERT OR REPLACE` appears nowhere. | the primary key plus `scripts/sql-lint.mjs`'s ban on `INSERT OR REPLACE` ([S01.T02](../01-foundation/T02-sqlite-database-client.md)) | `jobs-schema.spec.ts > upserting a pairing twice leaves one row with the later values`; `pnpm check` fails on a fixture using `INSERT OR REPLACE` |
| BR-S04.T14-04 | `job_pairings.fingerprint` is 64 lowercase hex characters or NULL while the pairing is still running; once written it is never updated for the same `(job_id, idx)`. | `CHECK (fingerprint IS NULL OR length(fingerprint) = 64)`; the worker writes it once with the `result` line | `jobs-schema.spec.ts > fingerprint length is checked`; `job-runner.spec.ts > fingerprint is written once` ([S04.T15](T15-worker-job-runner.md)) |
| BR-S04.T14-05 | `games` rows exist only when the job requested them, and `log_blob` only when it requested logs; a `games` row is uniquely `(job_id, pairing_idx, game_idx)` and always has a parent pairing. | primary key `(job_id, pairing_idx, game_idx)` plus `FOREIGN KEY (job_id, pairing_idx) REFERENCES job_pairings(job_id, idx) ON DELETE CASCADE` | `jobs-schema.spec.ts > a game without its pairing is rejected`; `> duplicate (job_id, pairing_idx, game_idx) is rejected` |
| BR-S04.T14-06 | Deleting a job deletes its pairings and its games: both children declare `ON DELETE CASCADE` and foreign keys are on for every connection. | the two foreign keys; `foreign_keys=ON` from [S01.T02](../01-foundation/T02-sqlite-database-client.md) | `jobs-schema.spec.ts > deleting a job removes its pairings and games` (1 job, 2 pairings, 10 games → all zero) |
| BR-S04.T14-07 | `engine_build` and `rules_snapshot` are recorded on `jobs`; a `done` job with a NULL `engine_build` is rejected, so no result is stored without knowing which build produced it (RN-49, RN-50). | `CHECK (status <> 'done' OR engine_build IS NOT NULL)` | `jobs-schema.spec.ts > a done job without engine_build is rejected` |
| BR-S04.T14-08 | Only the worker writes these tables; the api inserts a `queued` job and updates `status` to `cancelled`, and reads everything else. Nothing else writes them, and the engine never opens the database. | the CRUD table below; an eslint rule restricting writes to `apps/worker` plus the two api paths ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a fixture writing `job_pairings` from `apps/api`; `grep` shows no database import in `engine/` |
| BR-S04.T14-09 | Counts are consistent: `games = wins + losses + ties + errors` on a finished pairing, and the `outcomes_json` counters sum to `games - errors`. The schema cannot express it, so the worker asserts it before writing the `result` row. | `persist.ts`'s assertion ([S04.T15](T15-worker-job-runner.md)); documented in `0005_jobs.md` | `job-runner.spec.ts > pairing counts are consistent`; a `pnpm db:check` query listing violating rows |
| BR-S04.T14-10 | `0005_jobs.sql` creates no row, runs in one transaction, and leaves `schema_migrations.version = 5`; it uses no SQLite-only construct, so the whole file is portable as written. | no `INSERT`, no `-- @sqlite-only` block needed | `migrate.spec.ts > 0005 applies on a fresh temp DB, version 5, zero rows, PRAGMA foreign_key_check clean` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `jobs` | C | api | `POST /api/jobs` | inserted `queued` with `created_at`, `params_json`; `started_at` NULL (BR-S04.T14-02) | [S04.T16](T16-api-jobs-and-sse.md) |
| `jobs` | U (`status`, `started_at`, `workers`, `engine_build`, `rules_snapshot`) | worker | on claiming a queued job | `UPDATE … WHERE id = ? AND status = 'queued'`; zero rows changed means another poller won | [S04.T15](T15-worker-job-runner.md) |
| `jobs` | U (`progress_json`) | worker | at most every 500 ms while running | last-write-wins; no read-modify-write | throttled so SQLite writes stay short |
| `jobs` | U (`status`, `result_json`, `error`, `finished_at`) | worker | at the end | one terminal update; `done` requires `engine_build` (BR-S04.T14-07) | |
| `jobs` | U (`status = 'cancelled'`) | api | `POST /api/jobs/:id/cancel` | only from `queued` or `running`; the worker observes it and signals the child | the single api write besides the insert (BR-S04.T14-08) |
| `jobs` | R | api, worker | list, detail, SSE polling, optimizer history | read-only | [S04.T16](T16-api-jobs-and-sse.md), [S07.T05](../07-deck-optimizer/T05-optimize-job-orchestration.md) |
| `jobs` | D | api | explicit delete by the user | cascades to pairings and games (BR-S04.T14-06) | |
| `job_pairings` | C | worker | when the job starts, one row per pairing with its inputs | `ON CONFLICT (job_id, idx) DO UPDATE`, never `INSERT OR REPLACE` (BR-S04.T14-03) | inputs known before any game runs |
| `job_pairings` | U (counters) | worker | on each `progress` line | upsert of `wins/losses/ties/games` only | [S04.T12](T12-cli-job-protocol.md) |
| `job_pairings` | U (final) | worker | on the `result` line | writes `outcomes_json`, `avg_turns`, `invalid_actions`, `errors`, `fingerprint` once (BR-S04.T14-04) | |
| `job_pairings` | R | api, worker | job detail, score computation, paired screening | read-only | [S04.T17](T17-web-evaluate-page.md), [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md) |
| `games` | C | worker | on each `game` line, only when `store_games` | insert-only, batched at 500 rows per transaction; `(job_id, pairing_idx, game_idx)` unique (BR-S04.T14-05) | |
| `games` | R | api, worker | replay, coach critical moments | read-only; `log_blob` decompressed in Node | [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md), [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md) |
| `games` | D | worker | retention sweep | deletes `games` of jobs older than `GAMES_RETENTION_DAYS` (default 30) keeping `job_pairings`; never deletes a job | documented in `0005_jobs.md`; the sweep itself is [S08.T01](../08-operations-and-extensions/T01-scheduler.md) |
| all three | C/U/D | etl | never | the etl writes baseline tables only | Architecture principle 2 |
| all three | C/R/U/D | engine | never | the engine opens no database | Architecture principle 1 |

## Interfaces

**`packages/db/migrations/0005_jobs.sql`**

```sql
-- 0005_jobs.sql — one row per engine invocation, its pairings and (optionally) its games.
-- Owner: S04.T14 (schema), S04.T15 (rows). The engine never touches these tables.
-- Postgres: *_json TEXT -> jsonb (+ GIN on jobs.params_json); log_blob BLOB -> bytea.
--   Everything else is portable as written; no SQLite-only construct in this file.

CREATE TABLE jobs (
    id             INTEGER PRIMARY KEY,
    kind           TEXT    NOT NULL,          -- 'evaluate' | 'scenarios' | 'replay' | 'measure' | 'optimize'
    status         TEXT    NOT NULL,          -- queued | running | done | error | cancelled
    params_json    TEXT    NOT NULL,          -- the request as the api received it
    progress_json  TEXT,                      -- { pairings: [{ idx, done, total, w, l, t }], updated_at }
    result_json    TEXT,                      -- kind-specific summary (score, CI, scenario totals, …)
    error          TEXT,
    engine_build   TEXT,                      -- ptcg-cli --version build_hash (RN-49, RN-50)
    rules_snapshot TEXT,                      -- SHA-256 over active code bodies and text codes (S05)
    workers        INTEGER,                   -- the value actually used
    created_at     TEXT    NOT NULL,          -- 'YYYY-MM-DDTHH:MM:SSZ'; queue latency = started_at - created_at
    started_at     TEXT,
    finished_at    TEXT,
    CHECK (status IN ('queued','running','done','error','cancelled')),
    CHECK ((status = 'queued'  AND started_at IS NULL)
        OR (status = 'running' AND started_at IS NOT NULL AND finished_at IS NULL)
        OR (status IN ('done','error','cancelled') AND started_at IS NOT NULL AND finished_at IS NOT NULL)),
    CHECK (status <> 'done' OR engine_build IS NOT NULL),
    CHECK (workers IS NULL OR workers >= 1)
);
CREATE INDEX jobs_status_created_idx ON jobs (status, created_at);
CREATE INDEX jobs_kind_created_idx   ON jobs (kind, created_at DESC);

CREATE TABLE job_pairings (
    job_id          INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    idx             INTEGER NOT NULL,                  -- pairing index inside the job
    deck_a_json     TEXT    NOT NULL,                  -- [{ card_id, count }] — card ids, never def indices
    deck_b_json     TEXT    NOT NULL,
    bot_a_id        TEXT    NOT NULL,                  -- bot name; becomes a FK to bots(id) in 0007
    bot_b_id        TEXT    NOT NULL,
    bot_a_params_json TEXT,
    bot_b_params_json TEXT,
    seed_base       INTEGER NOT NULL,                  -- RN-46
    weight          REAL,                              -- opponent weight, carried for reproducibility
    label           TEXT,                              -- archetype name or scenario group, for display
    games           INTEGER NOT NULL DEFAULT 0,
    wins            INTEGER NOT NULL DEFAULT 0,        -- from deck A's point of view
    losses          INTEGER NOT NULL DEFAULT 0,
    ties            INTEGER NOT NULL DEFAULT 0,
    outcomes_json   TEXT,                              -- { prizes, deck_out, no_pokemon, stall, step_limit, concede }
    avg_turns       REAL,
    invalid_actions INTEGER NOT NULL DEFAULT 0,        -- RN-21
    errors          INTEGER NOT NULL DEFAULT 0,
    fingerprint     TEXT,                              -- 64 hex, written once with the result line (RN-50)
    PRIMARY KEY (job_id, idx),
    CHECK (idx >= 0),
    CHECK (games >= 0 AND wins >= 0 AND losses >= 0 AND ties >= 0 AND errors >= 0),
    CHECK (fingerprint IS NULL OR length(fingerprint) = 64)
);
CREATE INDEX job_pairings_job_idx ON job_pairings (job_id, idx);

CREATE TABLE games (
    job_id      INTEGER NOT NULL,
    pairing_idx INTEGER NOT NULL,
    game_idx    INTEGER NOT NULL,
    seed        INTEGER NOT NULL,
    first       INTEGER NOT NULL,                      -- 0 | 1: which player moved first
    winner      INTEGER,                               -- 0 | 1 | NULL (tie)
    reason      TEXT    NOT NULL,                      -- prizes | no_pokemon | deck_out | stall | step_limit | concede
    turns       INTEGER NOT NULL,
    duration_us INTEGER,
    log_blob    BLOB,                                  -- deflated JSON Lines of events; only with store_logs
    PRIMARY KEY (job_id, pairing_idx, game_idx),
    FOREIGN KEY (job_id, pairing_idx) REFERENCES job_pairings(job_id, idx) ON DELETE CASCADE,
    CHECK (first IN (0, 1)),
    CHECK (winner IS NULL OR winner IN (0, 1)),
    CHECK (reason IN ('prizes','no_pokemon','deck_out','stall','step_limit','concede')),
    CHECK (turns >= 0)
);
CREATE INDEX games_job_pairing_idx ON games (job_id, pairing_idx);
CREATE INDEX games_reason_idx      ON games (job_id, reason);
```

**`@pokesearch/db/schema`** gains:

```ts
export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";
export type JobKind   = "evaluate" | "scenarios" | "replay" | "measure" | "optimize";
export type EndReason = "prizes" | "no_pokemon" | "deck_out" | "stall" | "step_limit" | "concede";

export interface JobRow {
  id: number; kind: JobKind; status: JobStatus;
  params_json: string; progress_json: string | null; result_json: string | null;
  error: string | null; engine_build: string | null; rules_snapshot: string | null;
  workers: number | null; created_at: string; started_at: string | null; finished_at: string | null;
}
export interface JobPairingRow {
  job_id: number; idx: number;
  deck_a_json: string; deck_b_json: string;
  bot_a_id: string; bot_b_id: string;
  bot_a_params_json: string | null; bot_b_params_json: string | null;
  seed_base: number; weight: number | null; label: string | null;
  games: number; wins: number; losses: number; ties: number;
  outcomes_json: string | null; avg_turns: number | null;
  invalid_actions: number; errors: number; fingerprint: string | null;
}
export interface GameRow {
  job_id: number; pairing_idx: number; game_idx: number;
  seed: number; first: 0 | 1; winner: 0 | 1 | null;
  reason: EndReason; turns: number; duration_us: number | null; log_blob: Uint8Array | null;
}
```

All three are added to the `TABLES` descriptor the drift test of [S01.T04](../01-foundation/T04-database-migration-framework.md) walks.

**Why `bot_a_id` is text today.** The `bots` table arrives with migration 0007 ([S06.T07](../06-bots/T07-bot-registry-and-freezing.md)). Declaring a foreign key now would block this migration on a later one; declaring it later is an `ALTER TABLE` that SQLite cannot do for a constraint, so `0007_measurement.sql` will rebuild `job_pairings` with the reference if the user wants it. `0005_jobs.md` records that choice and its cost.

**Storage estimate.** A `games` row without a log is roughly 60 bytes; a 3,000-game job with `store_games` costs about 180 KB. A deflated log for one game is on the order of 5–20 KB, so `store_logs` on the same job costs 15–60 MB — which is why it is opt-in twice and why `GAMES_RETENTION_DAYS` exists. The real figures are measured in [S04.T18](T18-performance-baseline.md) and written into `0005_jobs.md`.

## Implementation steps

1. Write `0005_jobs.sql` down to the end of `jobs`, with the header comment, the four `CHECK`s and the two indexes; apply it on a temp database and run `PRAGMA foreign_key_check`.
2. Add `job_pairings` with its composite primary key, its checks and its index; spec the upsert behaviour (BR-S04.T14-03).
3. Add `games` with the composite foreign key to `job_pairings` and its two indexes; spec the orphan rejection and the cascade (BR-S04.T14-05, -06).
4. Add `JobRow`, `JobPairingRow`, `GameRow` and their `TABLES` entries; run the drift test until green.
5. Write `jobs-schema.spec.ts`: the five status values, the three timestamp combinations, the `engine_build` requirement on `done`, the fingerprint length, the duplicate-game rejection and the cascade (BR-S04.T14-01, -02, -04, -05, -06, -07).
6. Insert a fixture job with two pairings and ten games through the typed layer and read it back, asserting every column type including `log_blob` as `Uint8Array` — this is the contract [S04.T15](T15-worker-job-runner.md) implements.
7. Add the `pnpm db:check` query for BR-S04.T14-09 (pairings where `games <> wins + losses + ties + errors`) and confirm it returns nothing on the fixture.
8. Add the eslint restriction limiting writes to these three tables to `apps/worker` plus the two api paths, and a fixture proving it fails from `apps/api` (BR-S04.T14-08).
9. Write `packages/db/migrations/0005_jobs.md` recording the four deviations from `sim_runs`/`sim_results`, the `bot_a_id`-as-text decision, the retention rule and the storage estimate.
10. Record the applied index list (`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('jobs','job_pairings','games')`) in the note, so a later migration that drops one is visible.

## Edge cases and error handling

- **The worker crashes mid-job** → the row stays `running` with `finished_at IS NULL`. On restart the worker marks every `running` job without a live process as `error: worker restarted`, which satisfies the timestamp `CHECK` because it sets `finished_at` in the same statement ([S04.T15](T15-worker-job-runner.md)).
- **Two workers poll the same queued job** → the claim is `UPDATE jobs SET status='running', started_at=? WHERE id=? AND status='queued'`; the loser changes zero rows and moves on. The architecture says one worker per machine, but the statement does not depend on that.
- **A cancel arrives after the job finished** → `UPDATE … WHERE id = ? AND status IN ('queued','running')` changes zero rows; the api returns 409 rather than corrupting a terminal state ([S04.T16](T16-api-jobs-and-sse.md)).
- **A pairing that produced no result** (the engine emitted an `error` line for it) → the row keeps its inputs, `games = 0`, `errors` counted and `fingerprint` NULL. The pairing is visibly incomplete rather than absent, which matters when a score is computed over twelve opponents and one failed.
- **`store_games` on a 10,000-game job** → 10,000 rows at roughly 60 bytes each; inserted in batches of 500 inside short transactions so no reader waits longer than `busy_timeout` ([S01.T02](../01-foundation/T02-sqlite-database-client.md) BR-S01.T02-04).
- **`log_blob` larger than a few megabytes for one game** → the worker refuses to store a log above `MAX_LOG_BYTES` (1 MB deflated) and records `log_blob = NULL` plus a note in `jobs.error`; an unbounded blob would make the database unusable for the sake of one pathological game.
- **A `games` row whose parent pairing is deleted** → cascaded away by the composite foreign key; there is no path that leaves an orphan, which is why the foreign key is composite rather than on `job_id` alone.
- **Deleting a job that is still running** → allowed at the schema level, and the worker notices its rows vanished on the next write and aborts the child process. The api refuses the delete for a `running` job; the schema does not enforce that, and `0005_jobs.md` says so.
- **A `reason` value the engine adds later** → rejected by the `CHECK`. That is intended: a new end reason is a rules change and needs a migration, so a stored distribution can never silently gain a bucket.
- **The migration applied twice** → the runner skips it by version; the raw SQL run twice fails on `CREATE TABLE` (no `IF NOT EXISTS`, per [S01.T04](../01-foundation/T04-database-migration-framework.md)) and the transaction rolls back.

## Acceptance / verification

- [ ] `pnpm db:migrate` on a fresh temp database applies 0005, leaves `schema_migrations.version = 5`, zero rows in all three tables, and `PRAGMA foreign_key_check` returns nothing (BR-S04.T14-10).
- [ ] `jobs-schema.spec.ts > status is constrained to five values`, `> a running job without started_at is rejected`, `> a done job without finished_at is rejected` (BR-S04.T14-01).
- [ ] `> a done job without engine_build is rejected` and `> created_at is required and started_at is nullable` (BR-S04.T14-02, -07).
- [ ] `> upserting a pairing twice leaves one row with the later values`, and `pnpm check` fails on a fixture migration using `INSERT OR REPLACE` (BR-S04.T14-03).
- [ ] `> fingerprint length is checked`: a 63-character value is rejected, NULL and a 64-hex value are accepted (BR-S04.T14-04).
- [ ] `> a game without its pairing is rejected` and `> duplicate (job_id, pairing_idx, game_idx) is rejected` (BR-S04.T14-05).
- [ ] `> deleting a job removes its pairings and games`: one job with 2 pairings and 10 games, after `DELETE FROM jobs` all three counts are 0 (BR-S04.T14-06).
- [ ] A fixture job with two pairings and ten games inserted through `@pokesearch/db/schema` reads back with identical values for every column, including `log_blob` as a `Uint8Array`.
- [ ] `schema-drift.spec.ts > 0005 tables match their TypeScript row types` passes and fails when a column is added to the SQL without the type.
- [ ] `pnpm lint` fails on a fixture writing `job_pairings` from `apps/api` and passes for the same write from `apps/worker` (BR-S04.T14-08).

## Risks and open questions

- **Risk — `games` grows without bound.** An optimizer run with `store_games` on hundreds of candidate jobs is millions of rows. Mitigation: `store_games` is off by default, the retention sweep deletes `games` of jobs older than `GAMES_RETENTION_DAYS` while keeping the aggregate `job_pairings`, and [S07.T05](../07-deck-optimizer/T05-optimize-job-orchestration.md) sets the flag only for the jobs a human will inspect.
- **Risk — `params_json` becomes the real schema.** Every job kind stuffing its inputs into one JSON column means no constraint and no index on anything that matters. Mitigation: the columns that are queried — status, kind, timestamps, engine build, fingerprint — are real columns; `params_json` is validated by the zod schema of the kind before insert ([S04.T16](T16-api-jobs-and-sse.md)) and is round-tripped, not parsed piecemeal.
- **Risk — `bot_a_id` never becomes a foreign key.** Mitigation: `0005_jobs.md` records the intent and [S06.T07](../06-bots/T07-bot-registry-and-freezing.md) owns the decision; an orphan bot name in an old job row is harmless historical data, and the `bots` table is where freezing is enforced (RN-37).
- **Question — should `jobs` carry a `parent_job_id`** so an optimizer run can group its candidate jobs? [S07.T05](../07-deck-optimizer/T05-optimize-job-orchestration.md) needs some grouping; `optimizer_candidates` (migration 0008) may cover it. Recommendation: leave it out here and let S07 add a nullable column if `optimizer_candidates` proves insufficient — a nullable `ALTER TABLE ADD COLUMN` is portable and cheap.
- **Question — should the fingerprint be stored per game as well as per pairing?** Per pairing is what RN-50 compares; per game would localise a divergence to a single game. Recommendation: `games.seed` plus a rerun already localises it, so no extra column; revisit if a fingerprint mismatch is ever observed and proves hard to bisect.

## References

- `pokemon/src/pokesearch/db/schema.sql` — verified: `sim_runs(id, project_id, version_id, kind, mode, status, progress_json, result_json, log_text, started_at, finished_at, error)` at L307–320 with status values `queued | running | done | error | cancelled` in a comment rather than a constraint and no `created_at`; `sim_results(run_id, version_id, opponent_archetype_id, opponent_deck_id, weight, games, wins, losses, ties, avg_turns, first_player_wins, invalid_actions, errors)` at L322–337 with `PRIMARY KEY (run_id, version_id, opponent_deck_id)`; `ix_sim_runs_project` at L340. Consult for the field set; the four deviations are listed under Context.
- `pokemon/src/pokesearch/sim/store.py` — verified: `create_run` inserting with `started_at = _now()` at queue time (which is why queue latency was unmeasurable), `update_run` appending to `log_text` with `COALESCE(log_text,'') || ?`, and `add_results` using `INSERT OR REPLACE INTO sim_results` — the statement `packages/db/PORTABILITY.md` forbids and BR-S04.T14-03 replaces.
- [S01.T04](../01-foundation/T04-database-migration-framework.md) — migration naming, the no-`IF NOT EXISTS` rule, the dialect tagging convention and the drift test.
- [S04.T12](T12-cli-job-protocol.md) — the `progress`, `game` and `result` lines whose fields these columns mirror one for one.
- [Data model overview](../../project/04-data-model-overview.md) — the Jobs domain, migration 0005 and its owner.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
