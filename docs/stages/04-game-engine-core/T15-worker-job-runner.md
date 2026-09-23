# S04.T15 — Worker: job runner

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 15 / 18 |
| Depends on | [S04.T02](T02-card-definition-model.md), [S04.T12](T12-cli-job-protocol.md), [S04.T14](T14-jobs-schema-migration.md) |
| Unblocks | [S04.T16](T16-api-jobs-and-sse.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md), [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md), [S07.T05](../07-deck-optimizer/T05-optimize-job-orchestration.md) |
| Parallel with | [S04.T18](T18-performance-baseline.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `deriveCardDefs` — from [S04.T02](T02-card-definition-model.md)
- `contract` job protocol + `ptcg-cli` binary — from [S04.T12](T12-cli-job-protocol.md)
- `table` `jobs`, `job_pairings`, `games` — from [S04.T14](T14-jobs-schema-migration.md)
- `env` `ENGINE_BIN`, `DATABASE_PATH`, `LOG_LEVEL`, `MIGRATE_ON_START` — from `project/03-architecture-overview.md`

## Outputs (proposed)
- `module` `apps/worker/src/{main,queue,engine-process,persist}.ts` — poll `jobs WHERE status='queued'` (one at a time), mark `running`, build the request (card defs for the union of decks, programs when S05 exists, pairings, options), spawn `ENGINE_BIN`, parse lines, update `jobs.progress_json` at most every 500 ms, upsert `job_pairings`, insert `games` when requested, finish with `done|error`; cancellation by `status='cancelled'` → SIGTERM; record `engine_build` from `--version` — consumed by [S04.T16](T16-api-jobs-and-sse.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md), [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md), [S07.T05](../07-deck-optimizer/T05-optimize-job-orchestration.md)
- `contract` job kinds handled now: `evaluate` (deck version vs opponents), `scenarios`, `replay`; later kinds register through the same dispatcher

## Initial objective
Long simulations run outside the API process, survive page reloads, report progress to the database and can be cancelled — with the engine never touching the database.

## Context

The worker is the seam between two worlds that must not meet: a database the engine may not open, and an engine that produces numbers the database must record. It is the only writer of `jobs`, `job_pairings` and `games` (architecture principle 2), and it is the place where a self-contained job JSON is assembled and where the JSON Lines coming back become rows.

The legacy did this inside the web process. `pokemon/src/pokesearch/sim/jobs.py` started a daemon thread per run, one per project, wrote progress through `store.update_run`, and cancelled by setting a `threading.Event` that the optimizer loop polled. It worked, and its failure modes are instructive: a run died with the web process, a restart left rows stuck in `running` forever with no recovery path, and the log was a growing text column (`log_text = COALESCE(log_text,'') || ?`) rather than structured rows. A separate process fixes all three, and D-008 already puts `apps/worker` in the tree for it.

Three properties define this subtask. **One job at a time, claimed atomically.** The claim is `UPDATE jobs SET status='running', started_at=? WHERE id=? AND status='queued'`; zero rows changed means someone else won, and the worker moves on. The architecture says one worker per machine, but the statement does not rely on that. **Writes are short and throttled.** SQLite in WAL mode with `busy_timeout=5000` tolerates several processes only if nobody holds a write transaction while doing something slow; progress is written at most every 500 ms, `games` rows are batched at 500 per transaction, and the engine's stdout is read continuously so back-pressure never builds ([S04.T12](T12-cli-job-protocol.md)). **Crash recovery is explicit.** On start the worker marks every `running` job without a live process as `error: worker restarted`, with `finished_at` set so the timestamp `CHECK` of [S04.T14](T14-jobs-schema-migration.md) holds.

The other half of the work is building the request. For an `evaluate` job the worker resolves the deck version and the opponent decks to card ids, takes the union, calls `deriveCardDefs` ([S04.T02](T02-card-definition-model.md)), assigns `def_idx` by sorted `card_id`, expands each decklist into `[{ def, count }]`, derives `seed_base` per pairing with the RN-46 formula, and records `engine_build` from `ptcg-cli --version` before spawning. Everything the engine needs is in that one line; nothing it needs is behind a database handle.

## Scope

- **In scope.** `apps/worker/src/main.ts` (process lifecycle, recovery sweep, poll loop, graceful shutdown); `queue.ts` (claim, heartbeat, cancel observation, finish); `engine-process.ts` (spawn, stdin write, line reader, exit handling, SIGTERM/kill escalation); `persist.ts` (pairing upserts, game batches, progress throttle, count assertions); `build-request.ts` (deck resolution, `deriveCardDefs`, `def_idx` assignment, `seed_base`, options); the `evaluate`, `scenarios` and `replay` dispatchers and the registry later kinds join; the worker's own configuration and its `/health`-equivalent log line.
- **Out of scope.** The schema ([S04.T14](T14-jobs-schema-migration.md)); the API that enqueues and cancels ([S04.T16](T16-api-jobs-and-sse.md)); the engine itself ([S04.T12](T12-cli-job-protocol.md)); score and confidence intervals ([S04.T17](T17-web-evaluate-page.md) owns `wilson` and `weightedScore`); evidence rows written from `scenarios` results ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)); measurement rows ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)); the optimizer's orchestration of many jobs ([S07.T05](../07-deck-optimizer/T05-optimize-job-orchestration.md)); the scheduler ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It is where RN-46's seeds are derived, RN-49's provenance is recorded and RN-21's `invalid_actions` reaches the database, each owned elsewhere.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S04.T15-01 | The engine subprocess receives everything it needs on stdin and is given no database access: no `DATABASE_PATH` in its environment, no working directory it could read the file from, and a request line carrying every `CardDef` and every program. | `engine-process.ts` spawning with an explicit env allowlist (`LOG_LEVEL`, `PTCG_WORKERS`) | `job-runner.spec.ts > the engine is spawned without DATABASE_PATH`; `> the request contains a card_def for every card id in both decks` |
| BR-S04.T15-02 | A job is claimed atomically: `UPDATE jobs SET status='running', started_at=? WHERE id=? AND status='queued'`; zero rows changed means the job was taken or cancelled and the worker does not spawn anything. | `queue.ts::claim` | `job-runner.spec.ts > a second claim of the same job changes zero rows and spawns nothing` |
| BR-S04.T15-03 | Progress is written at most every `PROGRESS_INTERVAL_MS` (500) and always once at the end of each pairing; a progress write is a single `UPDATE jobs SET progress_json = ?` with no read-modify-write. | `persist.ts::throttledProgress` | `job-runner.spec.ts > progress writes are at most one per 500 ms`; `> the last progress write reflects the final counts` |
| BR-S04.T15-04 | `engine_build` is read from `ptcg-cli --version` **before** the job runs and stored on the `jobs` row; a job whose binary does not answer `--version` fails without running (RN-49, RN-50). | `engine-process.ts::readVersion` called in `claim`'s transaction follow-up | `job-runner.spec.ts > engine_build is recorded before any pairing starts`; `> a missing ENGINE_BIN fails the job with a clear message` |
| BR-S04.T15-05 | `seed_base` per pairing is derived with the RN-46 formula `(seed0 + crc32(parts.join("\|"))) mod 1_000_000_007`, where `parts` are the job kind, both deck identifiers and both bot names; the same request therefore reproduces the same games. | `build-request.ts::seedBase`, the TypeScript twin of `ptcg-core::rng::seed_base` ([S04.T10](T10-termination-stall-and-determinism.md)) | `job-runner.spec.ts > seedBase matches the Rust fixed vectors` (shared fixture file); `> the same evaluate request produces the same seed_base` |
| BR-S04.T15-06 | Cancellation is observed, not pushed: the worker re-reads `jobs.status` every `CANCEL_POLL_MS` (1000) while a job runs; on `cancelled` it sends SIGTERM, waits `KILL_GRACE_MS` (2000), then kills, and writes `status='cancelled'` with `finished_at`. | `queue.ts::watchCancel` + `engine-process.ts::terminate` | `job-runner.spec.ts > cancelling mid-run stops the child within 2 s and leaves status cancelled` |
| BR-S04.T15-07 | On start the worker recovers: every `running` job is set to `error` with `finished_at` and the message `worker restarted`, because a running job cannot outlive the process that owned it. | `main.ts::recoverOrphans` before the first poll | `job-runner.spec.ts > a running job left by a previous process becomes error on start` |
| BR-S04.T15-08 | Counts are asserted before a pairing's final row is written: `games = wins + losses + ties + errors` and `sum(outcomes) = games - errors`; a mismatch fails the job rather than storing an inconsistent row ([S04.T14](T14-jobs-schema-migration.md) BR-S04.T14-09). | `persist.ts::writeResult` | `job-runner.spec.ts > an inconsistent result line fails the job`; `pnpm db:check` finds no violating pairing |
| BR-S04.T15-09 | `games` rows are inserted only when the job's params asked for them, in batches of `GAME_BATCH` (500) inside one short transaction each, and a `log_blob` above `MAX_LOG_BYTES` (1 MB deflated) is dropped to NULL with a note rather than stored. | `persist.ts::writeGames` | `job-runner.spec.ts > no games rows without store_games`; `> games are inserted in batches of 500`; `> an oversized log is dropped with a note` |
| BR-S04.T15-10 | Every line the engine writes is either persisted or counted: unknown `type` values are logged at `warn` and counted in `jobs.result_json.unknown_lines`, never silently dropped. | `engine-process.ts::onLine`'s default branch | `job-runner.spec.ts > an unknown line type is counted and logged` |
| BR-S04.T15-11 | The worker is the only writer of `jobs` (beyond the api's insert and cancel), `job_pairings` and `games`; it never writes a baseline, user-deck or rules table. | the eslint table-ownership rule of [S04.T14](T14-jobs-schema-migration.md) BR-S04.T14-08 | `pnpm lint` fails on a worker write to `cards`; `grep` shows no `INSERT INTO cards` under `apps/worker` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `jobs` | R | worker | poll every `POLL_INTERVAL_MS` (500) | `SELECT id FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1` using `jobs_status_created_idx` | [S04.T14](T14-jobs-schema-migration.md) |
| `jobs` | U (`status`, `started_at`) | worker | claim | conditional update; zero rows = lost the race (BR-S04.T15-02) | |
| `jobs` | U (`engine_build`, `rules_snapshot`, `workers`) | worker | right after the claim, before spawning | `engine_build` from `--version`; `rules_snapshot` NULL until S05 (BR-S04.T15-04) | RN-49 |
| `jobs` | U (`progress_json`) | worker | throttled to one per 500 ms | last-write-wins; single-statement (BR-S04.T15-03) | read by the SSE endpoint ([S04.T16](T16-api-jobs-and-sse.md)) |
| `jobs` | U (`status`, `result_json`, `error`, `finished_at`) | worker | once, at the end | terminal; `done` requires `engine_build` ([S04.T14](T14-jobs-schema-migration.md) BR-S04.T14-07) | |
| `jobs` | R (`status`) | worker | every 1,000 ms while running | cancellation observation (BR-S04.T15-06) | |
| `jobs` | U (`status='error'`, `finished_at`, `error`) | worker | on start, for orphans | `WHERE status='running'` (BR-S04.T15-07) | |
| `job_pairings` | C | worker | once per pairing, before the first game | `ON CONFLICT (job_id, idx) DO UPDATE`; inputs (`deck_*_json`, `bot_*`, `seed_base`, `weight`, `label`) written here | never `INSERT OR REPLACE` |
| `job_pairings` | U (`games`, `wins`, `losses`, `ties`) | worker | on each `progress` line | upsert of counters only | |
| `job_pairings` | U (`outcomes_json`, `avg_turns`, `invalid_actions`, `errors`, `fingerprint`) | worker | on the `result` line, once | counts asserted first (BR-S04.T15-08); `fingerprint` written once (BR-S04.T14-04) | RN-50 |
| `games` | C | worker | on `game` lines, only with `store_games` | insert-only, batches of 500, one short transaction each (BR-S04.T15-09) | |
| `user_deck_versions` | R | worker | building an `evaluate` request | read-only: `list_json` for the evaluated deck | [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) |
| `decks`, `deck_cards` | R | worker | building an `evaluate` request | read-only: the opponents' tournament lists | [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) |
| `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `card_overrides` | R | worker | `deriveCardDefs` for the union of all decks | read-only, batched | [S04.T02](T02-card-definition-model.md) |
| any table | C/U/D | engine | never | spawned without `DATABASE_PATH` (BR-S04.T15-01) | Architecture principle 1 |
| baseline / user / rules tables | C/U/D | worker | never | the worker writes job tables only (BR-S04.T15-11) | Architecture principle 2 |

## Interfaces

**Module layout.**

```
apps/worker/src/
  main.ts            process lifecycle: config, recovery sweep, poll loop, SIGINT/SIGTERM shutdown
  queue.ts           claim(), heartbeat(), watchCancel(), finish()
  build-request.ts   buildEvaluate(), buildScenarios(), buildReplay(), seedBase()
  engine-process.ts  spawnEngine(), readVersion(), writeJob(), onLine(), terminate()
  persist.ts         upsertPairingInputs(), writeProgress(), writeCounters(), writeResult(), writeGames()
  kinds/index.ts     the dispatcher: kind -> { build, onResult, onDone }
```

**Public surface.**

```ts
export interface WorkerConfig {
  databasePath: string;            // $DATABASE_PATH
  engineBin: string;               // $ENGINE_BIN
  pollIntervalMs: number;          // 500
  progressIntervalMs: number;      // 500
  cancelPollMs: number;            // 1000
  killGraceMs: number;             // 2000
  gameBatch: number;               // 500
  maxLogBytes: number;             // 1_048_576
  defaultWorkers: number;          // os.availableParallelism()
}

export interface JobKindHandler<P> {
  kind: JobKind;
  paramsSchema: z.ZodType<P>;
  build(db: Db, job: JobRow, params: P): Promise<JobRequest>;   // the JSON Lines request (S04.T12)
  onResult?(db: Db, job: JobRow, line: ResultLine): void;        // extra per-pairing side effects
  onDone(db: Db, job: JobRow, lines: DoneLine): JobResultSummary; // what goes into jobs.result_json
}
export function register(handler: JobKindHandler<unknown>): void;

export function seedBase(seed0: number, parts: readonly string[]): number;  // RN-46, mirrors ptcg-core::rng
```

**`evaluate` params** (validated by the api before insert, re-validated here):

```ts
export const EvaluateParams = z.object({
  deckVersionId: z.number().int(),
  opponents: z.array(z.object({ deckId: z.string(), weight: z.number().positive(),
                                archetypeId: z.string().optional() })).min(1),
  gamesPerOpponent: z.number().int().min(1).max(20000),
  bot: z.string().default("heuristic"),
  opponentBot: z.string().default("heuristic"),
  botParams: z.record(z.unknown()).default({}),
  storeGames: z.boolean().default(false),
  storeLogs: z.boolean().default(false),
  seed0: z.number().int().nonnegative().default(20260918),
  workers: z.number().int().min(1).optional(),
});
```

**Request building for `evaluate`.**

```text
1. read user_deck_versions.list_json           → [{ card_id, count }] for deck A
2. read decks/deck_cards for each opponent      → [{ card_id, count }] for each deck B
3. cardIds = union of every card_id             (typically ~150 distinct printings)
4. defs = deriveCardDefs(db, sorted(cardIds))   → def_idx assigned by sorted card_id (S04.T02)
5. per opponent i:
     seed_base = seedBase(params.seed0, [job.kind, deckVersionKey, opponents[i].deckId,
                                          params.bot, params.opponentBot])
     pairing   = { idx: i, deck_a, deck_b, bot_a, bot_b, games: gamesPerOpponent,
                   seed_base, weight: opponents[i].weight, label: archetype name }
6. options = { workers, store_games, store_logs, stall_turns: 12, max_steps: 3000, progress_every: 200 }
7. request  = { type: "job", id, contract_version, kind: "evaluate", card_defs: defs,
                programs: {}, pairings, options }
```

**Process handling.**

```ts
const child = spawn(cfg.engineBin, ["--workers", String(workers)], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { LOG_LEVEL: process.env.LOG_LEVEL ?? "info" },   // no DATABASE_PATH (BR-S04.T15-01)
  windowsHide: true,
});
child.stdin.write(JSON.stringify(request) + "\n");
child.stdin.end();
// stdout is read line by line with a split stream; every line is dispatched by `type`
```

| Engine line | Worker action |
|---|---|
| `progress` | update in-memory counters; `writeCounters` on the pairing; `writeProgress` if the throttle allows |
| `game` | buffer; flush a batch of 500 with `writeGames` |
| `result` | flush the game buffer, assert counts, `writeResult` with `fingerprint` |
| `scenario` | buffer; summarised into `result_json` by the `scenarios` handler |
| `done` | flush everything, compute `result_json`, `finish('done')` |
| `error` | record on the pairing if it names one, else fail the job |
| unknown | `warn` log, `unknown_lines += 1` (BR-S04.T15-10) |

**Exit handling.** A non-zero exit with no `done` line fails the job with the exit code and the last 2,000 characters of stderr in `jobs.error`; exit codes 2–5 are mapped to their meanings from [S04.T12](T12-cli-job-protocol.md). A zero exit without `done` is also a failure — a truncated stream is not a success.

**Configuration.** `ENGINE_BIN`, `DATABASE_PATH`, `LOG_LEVEL`, `MIGRATE_ON_START` (refuses to start on a pending migration unless set to 1), plus the numeric constants above, all overridable by environment variables with the documented defaults.

## Implementation steps

1. Create `apps/worker` with `main.ts` opening the database through `@pokesearch/db/client`, checking the schema version, logging one startup line and exiting cleanly on SIGINT. `pnpm --filter worker test` green on a trivial spec.
2. Implement `recoverOrphans` and the poll loop with `claim`; spec the atomic claim and the orphan recovery (BR-S04.T15-02, -07).
3. Implement `engine-process.ts::readVersion` and store `engine_build` on the claimed row; spec the missing-binary failure (BR-S04.T15-04).
4. Implement `build-request.ts::seedBase` against the shared fixed vectors, and `buildEvaluate` through step 7 above; spec `> seedBase matches the Rust fixed vectors` and `> the request contains a card_def for every card id in both decks` (BR-S04.T15-01, -05).
5. Implement `spawnEngine` with the env allowlist, the stdin write and the line reader; spec `> the engine is spawned without DATABASE_PATH` (BR-S04.T15-01).
6. Implement `persist.ts`: pairing input upsert, counter upsert, throttled progress, result write with the count assertions; spec the throttle and the assertion (BR-S04.T15-03, -08).
7. Implement `writeGames` with batching, the `store_games` guard and the oversized-log rule; spec all three (BR-S04.T15-09).
8. Implement `finish` for `done` and `error`, the exit-code mapping and the unknown-line counter; spec `> a non-zero exit without done fails the job` and `> an unknown line type is counted and logged` (BR-S04.T15-10).
9. Implement `watchCancel` with SIGTERM, the grace period and the kill; spec `> cancelling mid-run stops the child within 2 s and leaves status cancelled` (BR-S04.T15-06).
10. Add the `scenarios` handler (build a request from `engine/scenarios/**` plus derived card defs, summarise pass/fail into `result_json`) and a `replay` stub that fails with `not implemented` until [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md).
11. Write the end-to-end spec: two fixture decks, three opponents, 20 games each, with a stub engine binary that replays a recorded stdout stream — asserting rows, progress updates, `engine_build` and fingerprints. Then repeat once against the real binary as a smoke test.
12. Write `apps/worker/README.md`: the lifecycle, the configuration table, the line-to-action table, the recovery rule and how to add a job kind.

## Edge cases and error handling

- **The worker crashes mid-job** → the `jobs` row stays `running`. On the next start `recoverOrphans` sets it to `error` with `finished_at` and the message `worker restarted`; the `games` rows already written stay, and the pairing rows keep their partial counters, visibly incomplete rather than absent.
- **The engine process is killed by the operating system** → the stdout stream ends without `done` and the exit code is non-zero; the job fails with that code and the stderr tail. No pairing gets a `fingerprint`, so nothing downstream mistakes a partial run for a result.
- **A job whose deck has 59 cards** → the engine emits one `error` line for that pairing (RN-10, [S04.T04](T04-setup-and-turn-structure.md)); the worker stores it on the pairing and continues. If every pairing fails this way, `done` still arrives and the job finishes `done` with zero games — which the Evaluate page shows as an explicit failure rather than a zero score ([S04.T17](T17-web-evaluate-page.md)).
- **A card id in a deck that is absent from `cards`** → `deriveCardDefs` raises `DeriveError`; the job fails before spawning, with the card id in the message. Better than shipping a short `card_defs` array the engine would reject with exit code 4.
- **A cancel arrives between the claim and the spawn** → `watchCancel` starts before the spawn, so the child is terminated as soon as it exists; if the cancel lands before, the spawn is skipped and the job goes straight to `cancelled`.
- **`SIGTERM` is not honoured** (a wedged child) → after `KILL_GRACE_MS` the worker kills the process; on Windows `child.kill()` maps to `TerminateProcess`, so the escalation is a hard stop and the partially written rows stay as they are.
- **The database is locked by a long ETL transaction** → writes fail with `SQLITE_BUSY` after `busy_timeout`; the worker retries a progress write up to three times with backoff and skips it on the fourth (progress is advisory), but retries a `result` write indefinitely with backoff, because losing it loses the job's output.
- **`store_logs` on a long job** → the buffer is flushed every 500 games, so memory stays bounded; a single log above `MAX_LOG_BYTES` is dropped to NULL with a note in `jobs.error` rather than stored (BR-S04.T15-09).
- **Two `result` lines for the same pairing** → the second is refused by the fingerprint-written-once rule ([S04.T14](T14-jobs-schema-migration.md) BR-S04.T14-04) and logged as a protocol violation; it would mean an engine bug.
- **`MIGRATE_ON_START=0` and a pending migration** → the worker refuses to start and logs the pending version. Running a job against a schema the code does not expect is how silently wrong rows are written.
- **A `queued` job of an unknown kind** → failed immediately with `unknown job kind`, without spawning. The dispatcher is a registry, so a kind added by a later subtask needs no change here (BR-S04.T15-10's sibling case).

## Acceptance / verification

- [ ] `pnpm --filter worker test` green, including `> a second claim of the same job changes zero rows and spawns nothing` (BR-S04.T15-02) and `> a running job left by a previous process becomes error on start` (BR-S04.T15-07).
- [ ] End-to-end with the real binary: queue an `evaluate` job for two fixture decks against three opponents at 20 games each → `job_pairings` has three rows with `games = 20`, consistent counts, a 64-hex `fingerprint` each, `jobs.status = 'done'` and `jobs.engine_build` equal to `ptcg-cli --version`'s `build_hash`.
- [ ] Progress is observable: during that run, `jobs.progress_json` changes at least three times and never more than twice per second (BR-S04.T15-03).
- [ ] `> cancelling mid-run stops the child within 2 s and leaves status cancelled`: set `status='cancelled'` while running, and within two seconds the child is gone and `finished_at` is set (BR-S04.T15-06).
- [ ] `> the engine is spawned without DATABASE_PATH` and `> the request contains a card_def for every card id in both decks` (BR-S04.T15-01).
- [ ] `> seedBase matches the Rust fixed vectors`: the TypeScript and Rust implementations agree on the shared fixture vectors, including `seed0 = 0` (BR-S04.T15-05, RN-46).
- [ ] `> no games rows without store_games`, `> games are inserted in batches of 500` and `> an oversized log is dropped with a note` (BR-S04.T15-09).
- [ ] `> an inconsistent result line fails the job`: a stub engine emitting `games=20, wins=10, losses=5, ties=3, errors=0` fails with a count assertion and writes no `result` row (BR-S04.T15-08).
- [ ] `> a missing ENGINE_BIN fails the job with a clear message` and `> a non-zero exit without done fails the job` with the exit code and the stderr tail in `jobs.error` (BR-S04.T15-04).
- [ ] `pnpm lint` fails on a worker write to `cards` and passes for the same write to `job_pairings` (BR-S04.T15-11).

## Risks and open questions

- **Risk — one job at a time leaves the machine idle** when a job uses fewer workers than the machine has threads. Mitigation: the engine parallelises internally with `rayon`, so a single job already saturates the machine at `--workers 16`; running two jobs would mostly add contention. [S07.T05](../07-deck-optimizer/T05-optimize-job-orchestration.md) revisits this if screening many candidates proves latency-bound rather than throughput-bound.
- **Risk — progress writes contend with the api's reads.** Mitigation: one short single-statement `UPDATE` at most twice a second, WAL mode, and readers that never block writers; the SSE endpoint polls once a second ([S04.T16](T16-api-jobs-and-sse.md)), so the two rates are compatible by construction.
- **Risk — the `seedBase` twins drift.** Two implementations of one formula is exactly the class of bug RN-46 exists to prevent. Mitigation: a shared fixture file of input/output vectors checked by both `cargo test` and `pnpm --filter worker test`; a change to either implementation fails the other's test.
- **Risk — a stub-engine test suite diverges from the real binary.** Mitigation: the recorded stdout stream used by the unit tests is captured from a real run and regenerated whenever the protocol version changes; one end-to-end test always uses the real binary.
- **Question — should the worker retry a failed job automatically?** A transient failure (the binary being rebuilt mid-run) is indistinguishable from a deterministic one at this level, and a silent retry would double a measurement's cost without telling anyone. Recommendation: no automatic retry; the user re-queues from the UI. Revisit when the scheduler runs jobs unattended ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)).
- **Question — should `rules_snapshot` be computed here or passed in the params?** Computing it here keeps it honest (it is the snapshot actually used); passing it lets a caller pin an older snapshot. Recommendation: compute it here from the active rules when S05 exists, and record the decision in `apps/worker/README.md`; [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) decides whether pinning is ever needed.

## References

- `pokemon/src/pokesearch/sim/jobs.py` — verified: a daemon `threading.Thread` per run with `running_for(project_id)` allowing one job per project, cancellation through a `threading.Event` polled by the optimizer, `_launch` wrapping the work so any exception becomes `status='error'` with the last 2,000 characters of the traceback, and `_progress`/`_emit` writing through `store.update_run`. Consult for the lifecycle; the in-process threading is exactly what a separate worker replaces.
- `pokemon/src/pokesearch/sim/store.py` — verified: `create_run` setting `started_at` at queue time, `update_run` building a dynamic `SET` list and appending to `log_text`, `add_results` with `INSERT OR REPLACE`, and `get_run` joining `sim_results` to `archetypes` for display. Consult for the write shapes; the three deviations are in [S04.T14](T14-jobs-schema-migration.md).
- `pokemon/src/pokesearch/sim/progress.py` — verified: `_seed(suite, *parts) = (seed0 + zlib.crc32("|".join(parts).encode())) % 1_000_000_007`, the formula `seedBase` mirrors (RN-46).
- [S04.T12](T12-cli-job-protocol.md) — the request shape, the five response line types, the exit codes and the `engine/PROTOCOL.md` reference.
- [S04.T14](T14-jobs-schema-migration.md) — the three tables, their constraints and the ownership rules this module is held to.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
