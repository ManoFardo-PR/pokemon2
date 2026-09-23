# S08.T01 — Scheduler

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 1 / 6 |
| Depends on | [S02.T02](../02-card-data-and-search/T02-fetch-pokemon-tcg-data.md), [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md), [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) |
| Unblocks | — |
| Parallel with | [S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T03](T03-hosted-postgres-migration-path.md), [S08.T04](T04-wasm-replay-and-play.md), [S08.T05](T05-twinleaf-differential-oracle.md), [S08.T06](T06-llm-assisted-authoring.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `fetchAll` (delta detection) — from [S02.T02](../02-card-data-and-search/T02-fetch-pokemon-tcg-data.md)
- `module` `refreshAndSnapshot` — from [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md)
- `module` `syncDecks`, run lock — from [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)
- `module` the worker process, its lifecycle and its poll loop, which this scheduler is hosted inside — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `env` `SCHEDULER_ENABLED` (default `0`) — from `project/03-architecture-overview.md`
- `file` `pokemon/src/pokesearch/scheduler.py` (38 lines) and `pokemon/README.md` §"Agendamento" — the cron times, the timezone and the in-process hosting this subtask moves out of the web process; read-only reference

## Outputs (proposed)
- `module` `apps/worker/src/scheduler.ts` — `node-cron` with TZ `America/Sao_Paulo`: prices 06:00 daily, `delta` Mondays 05:00, decks 07:00 daily; single-flight per job kind; `SCHEDULER_ENABLED` env; manual trigger endpoint reuse (`POST /api/meta/refresh`); notes for a hosted alternative (platform cron hitting an endpoint)
- `module` `apps/worker/src/maintenance.ts` — the two housekeeping tasks the scheduler owns and that earlier subtasks deferred to it: the nightly `pnpm db:backup` and the weekly retention sweep of `games` rows bounded by `GAMES_RETENTION_DAYS` (both deferred questions are named, with their owning files, under Context)
- `doc` `apps/worker/SCHEDULER.md` — the job table with its cron strings and timezone, the conflict groups, the misfire and catch-up rules, the environment variables and the two external-scheduler alternatives (a hosted platform cron hitting an endpoint; Windows Task Scheduler running the same `pnpm etl` commands)

## Initial objective
Data stays fresh while the worker is running, with the same code paths as the manual CLI and no overlapping runs.

## Context

Three ingestion jobs decide whether the site is telling the truth: prices go stale in a day, the meta window moves every day, and new sets appear every few weeks. The legacy already automated all three, and the times it chose are the times kept here, because they were chosen against real constraints — the Limitless day boundary and an overnight window on the user's own machine.

`pokemon/src/pokesearch/scheduler.py` is 38 lines and does exactly this: `BackgroundScheduler(timezone="America/Sao_Paulo")` with three cron jobs — `prices` at `hour=6, minute=0`, `delta` at `day_of_week="mon", hour=5, minute=0`, and `decks` at `hour=7, minute=0` — each with `misfire_grace_time=3600`, and `max_instances=1` on `decks` alone. What is wrong with it is not the schedule but the host. It ran **inside the FastAPI web process**, started from the lifespan when `config.ENABLE_SCHEDULER` was true and stopped with `sched.shutdown(wait=False)`; so a nightly full reload competed with page requests for the same process, and closing the site stopped the automation. D-008 and the process model of `project/03-architecture-overview.md` already put the scheduler in `apps/worker`, which is the only process that is supposed to be running unattended anyway, and which [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) built with a lifecycle, a recovery sweep and a graceful shutdown this can hang off.

The second thing that changes is the locking. The legacy's protection was a module-level `threading.Lock` (`decks.py` L225–255): `try_start_background_sync` refused with `"já em execução"` when the lock was held and with `"aguarde alguns minutos entre atualizações"` inside `MIN_INTERVAL_S = 600`, and the scheduler's own entry point `run_locked()` logged `"decks: sync já em execução; job ignorado"` and returned `None`. A thread lock protects one process. Here the api can start a background sync from its "atualizar agora" button while the worker's scheduler fires, and [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) says so explicitly in its Risks: *"the in-process lock does not protect against two processes… S08.T01 owns the cross-process guard"*. That guard already exists and does not need inventing — [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)'s `startRun` checks the live `etl_runs` row of the same kind inside the same `BEGIN IMMEDIATE` that inserts and exits 3 (BR-S02.T01-05). The scheduler's job is to **use** that path rather than a parallel one, and to treat exit 3 as "skipped", not as a failure.

The third thing is that the scheduler owns no logic of its own. Every task it fires is a command someone can also type. `prices` is `etl prices` (which is `refreshAndSnapshot`, ≈20k TCGdex requests, 30–60 minutes on a cold run), `delta` is `etl delta` (which is `fetchAll` plus the changed-set load, the FTS rebuild and the cached snapshot), `decks` is `etl decks --web`, the backup is `pnpm db:backup`. If a scheduled run breaks, the reproduction is one line in a terminal, and the fix is never in this file. That is also why [S08.T02](T02-etl-monitoring-and-alerts.md) can alert on the results without knowing anything about cron: everything the scheduler starts writes an `etl_runs` row through the same `withRun` wrapper.

Finally, this subtask is where three questions left open elsewhere get answered, because they are all "should the scheduler do it?". [S01.T02](../01-foundation/T02-sqlite-database-client.md) asked whether `pnpm db:backup` should run nightly; [S01.T04](../01-foundation/T04-database-migration-framework.md) asked about `etl_runs` retention; [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) put `GAMES_RETENTION_DAYS` in the schema and left the sweep here. The answers are in the job table: backup nightly at 03:30 keeping 7, `games` swept weekly beyond 30 days, `etl_runs` kept forever because the rows are tiny and [S08.T02](T02-etl-monitoring-and-alerts.md)'s alert history is exactly that table.

## Scope

- **In scope.** `apps/worker/src/scheduler.ts` (the job table, `node-cron` registration with the timezone, the conflict groups, the misfire and catch-up decisions, the skip accounting, start/stop wired into the worker's lifecycle); `apps/worker/src/maintenance.ts` (`runBackup`, `sweepGames`, `sweepEtlRuns`); the scheduler's environment variables and their defaults; the extension of `EtlRunKind` with `backup` and `retention`; `apps/worker/SCHEDULER.md`; the unit tests over fixed timestamps; the answers to the three deferred questions above.
- **Out of scope.** Every task body — fetching ([S02.T02](../02-card-data-and-search/T02-fetch-pokemon-tcg-data.md)), the price snapshot ([S02.T07](../02-card-data-and-search/T07-prices-snapshot.md)), the deck sync and its prune ([S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)), the FTS rebuild ([S02.T08](../02-card-data-and-search/T08-full-text-search.md)); the `etl_runs` row itself, written by `withRun` ([S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)); alerting on the outcome ([S08.T02](T02-etl-monitoring-and-alerts.md)); the `jobs` queue and the engine, which the worker polls on its own loop ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); the `scenarios` re-run triggered by an engine-build change, which [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) fires at worker startup and not from cron; the manual-refresh endpoint, owned by [S03.T07](../03-tournament-meta-and-deck-builder/T07-api-meta-endpoints.md); any hosted deployment ([S08.T03](T03-hosted-postgres-migration-path.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns RN-03 and RN-04 to [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md), not to this subtask. They appear here because the scheduled path is the one that runs unattended, and a scheduler that quietly widened the window or skipped the prune would break both rules without anyone typing a command.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-03 | **Kept, inherited unchanged.** The scheduled decks run passes no window override, so it uses [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)'s defaults — Standard, 90 days, `players ≥ 16`, at most 400 tournaments. The scheduler has no flag that can widen or narrow the meta window, so the automatic and the manual run see the same sample. | the `decks` entry in `SCHEDULED_JOBS` invokes `etl decks --web` with no `--days` / `--min-players` / `--max-tournaments`; the argument list is a frozen constant, not built from configuration | `scheduler.spec.ts > the decks job passes no window flags` (argument-list assertion); `> no environment variable can reach syncDecks' window options` (config-key assertion) |
| RN-04 | **Kept, inherited unchanged.** The scheduled decks run prunes tournaments dated before `now − 180 days` on every execution, because `pruneDays` keeps its default; there is no "skip prune" path for automatic runs. | the same frozen argument list omits `--prune-days`; `SCHEDULER.md` records that the prune is part of the daily job | `scheduler.spec.ts > the decks job leaves pruneDays at its default`; the end-to-end check below asserts a 200-day-old fixture tournament is gone after one scheduled run |
| BR-S08.T01-01 | The scheduler is off unless `SCHEDULER_ENABLED=1`: with the default `0` the worker registers no cron task, and the only thing that runs is the job poll loop. | `startScheduler(cfg)` returns an inert handle when `!cfg.schedulerEnabled`; the worker logs one line saying the scheduler is disabled | `scheduler.spec.ts > disabled by default registers zero tasks`; `> enabling registers exactly the five documented tasks` |
| BR-S08.T01-02 | Every scheduled task is the **same code path** as its manual command: the scheduler calls the CLI's step registry, never a private copy, so a task cannot drift from what a human can reproduce in a terminal. | `SCHEDULED_JOBS[i].run` is a thin call into `packages/etl`'s exported `runPrices`/`runDelta`/`runDecks` or into `maintenance.ts`; the scheduler module imports no fetcher and no `node:sqlite` | `scheduler.spec.ts > every job's run function is an exported etl entry point` (identity assertion); `pnpm lint` fails on a fixture importing `undici` from `scheduler.ts` |
| BR-S08.T01-03 | Two tasks of the same conflict group never run at once. A trigger whose group is busy is **skipped**, never queued: it logs one line naming the running task and increments `scheduler_skips`, and the next occurrence fires normally. | `conflictBusy(group)` checked before `run()`, plus `startRun`'s own cross-process guard ([S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) BR-S02.T01-05) which exits 3 and is mapped to the same "skipped" outcome | `scheduler.spec.ts > an overlapping trigger is skipped with a log line and no second run`; `> a CLI exit code 3 is recorded as skipped, not as an error` |
| BR-S08.T01-04 | A missed trigger is caught up only inside the grace window: when the worker starts, a task whose most recent fire time is at most `SCHEDULER_MISFIRE_GRACE_S` (default 3600, the legacy value) in the past and whose last successful run began before that fire time runs immediately; an older miss does not. | `shouldCatchUpMisfire(job, now, lastOk)` in `scheduler.ts`, evaluated once per task at start | `scheduler.spec.ts > a worker started at 06:00:30 runs prices immediately`; `> a worker started at 08:00 does not run the 06:00 prices trigger` |
| BR-S08.T01-05 | A task whose last successful run is older than its own period plus the grace runs once at start, staggered by `SCHEDULER_STARTUP_STAGGER_S` (default 60) in schedule order, and at most once per process start. `SCHEDULER_CATCHUP=0` disables it, and the reason is always logged. | `staleAtStart(job, lastOk, now)` plus a per-process `caughtUp: Set<string>` | `scheduler.spec.ts > a kind whose last ok run is 9 days old runs once at start`; `> it does not run a second time on the same process`; `> SCHEDULER_CATCHUP=0 only logs` |
| BR-S08.T01-06 | Every scheduled execution leaves exactly one `etl_runs` row, written by the same `withRun` wrapper the CLI uses, with `stats_json.trigger` set to `scheduled`, `catchup` or `misfire`. A task that was skipped writes **no** row — a skip is not a run. | the tasks call the CLI entry points, which own `withRun`; the trigger tag is passed through `run.add({ trigger })` | `scheduler.spec.ts > one etl_runs row per executed task with the trigger tag`; `> a skipped trigger writes no row` |
| BR-S08.T01-07 | A task that throws never stops the scheduler: the error is logged with the task id, the `etl_runs` row closes as `error` (owned by `withRun`), and every later trigger still fires. | a `try`/`catch` around each `run()` inside the cron callback; no `unhandledRejection` path | `scheduler.spec.ts > a throwing task leaves the other tasks registered and firing`; `> the process does not exit` |
| BR-S08.T01-08 | The scheduler stops cleanly: on `SIGINT`/`SIGTERM` the worker stops accepting new triggers first, then waits up to `SCHEDULER_SHUTDOWN_GRACE_MS` (default 30000) for a running task, then logs what it abandoned and exits. A task interrupted this way leaves its `etl_runs` row `running`, which [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)'s `reconcileStaleRuns` turns into `cancelled`. | `stopScheduler()` called from the worker's existing shutdown handler ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)) before the database closes | `scheduler.spec.ts > stop() prevents new triggers`; `> an in-flight task is awaited up to the grace and then reported` |
| BR-S08.T01-09 | Retention deletes only what the retention configuration names, and never a parent: the weekly sweep removes `games` rows of jobs finished more than `GAMES_RETENTION_DAYS` (default 30) ago and leaves `jobs` and `job_pairings` intact; `ETL_RUNS_RETENTION_DAYS` defaults to `0`, meaning nothing in `etl_runs` is ever deleted. | `sweepGames()` deletes by `job_id` from a subquery over finished jobs, in batches of 5,000 inside short transactions; `sweepEtlRuns()` returns 0 when the setting is `0` | `maintenance.spec.ts > sweeping games keeps the job and its pairings`; `> etl_runs retention of 0 deletes nothing`; `> a retention of 90 deletes only rows older than 90 days` |
| BR-S08.T01-10 | The nightly backup is verified before anything is pruned: the scheduled task runs `pnpm db:backup --keep 7`, whose own contract already refuses to prune after a failed `PRAGMA integrity_check` ([S01.T02](../01-foundation/T02-sqlite-database-client.md) BR-S01.T02-07), and a non-zero exit is an error row plus an alert, not a silent skip. | `runBackup()` maps the script's exit codes (0 ok, 1 verification failed, 2 source missing) onto the run outcome | `maintenance.spec.ts > a failed backup closes the run as error and prunes nothing`; the alert rule is asserted in [S08.T02](T02-etl-monitoring-and-alerts.md) |

## Data operations

Every row below is written by the **worker** process, through the ETL entry points it calls. The scheduler itself executes no SQL beyond the two retention deletes.

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `etl_runs` | R | worker | once per task at worker start, and before every trigger | `SELECT` of the latest row per `kind` via `etl_runs_kind_started_idx`; read-only | feeds the misfire, catch-up and conflict decisions |
| `etl_runs` | C | worker | at the start of every executed task | insert-only through `startRun(db, kind)`, `status='running'`; a second live run of the same kind exits 3 and the trigger is skipped (BR-S08.T01-03) | the cross-process guard [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) asked for |
| `etl_runs` | U | worker | when the task returns or throws | one update through `finishRun`, `status='ok'`/`'error'`, `stats_json` carrying `trigger` (BR-S08.T01-06) | never a second update of a closed row |
| `etl_runs` | U | worker | at worker start, for rows stale beyond `STALE_RUN_MINUTES` | `reconcileStaleRuns` sets `cancelled`; owned by [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md), called here before the first trigger | recovers a task killed by a shutdown or a reboot |
| `etl_runs` | D | worker | weekly, only when `ETL_RUNS_RETENTION_DAYS > 0` | default `0` → no-op; the history is what [S08.T02](T02-etl-monitoring-and-alerts.md) alerts on (BR-S08.T01-09) | answers the question [S01.T04](../01-foundation/T04-database-migration-framework.md) left open |
| `cards`, `sets`, `attacks`, `abilities`, `weaknesses`, `resistances`, `cards_fts` | C/U | worker (via `etl delta`) | Mondays 05:00 | upserts owned by [S02.T06](../02-card-data-and-search/T06-load-cards.md); the FTS index is rebuilt wholesale afterwards | only the changed sets are touched (`changedSetIds`) |
| `price_history`, `cards_market_usd` | C/U | worker (via `etl prices`) | daily 06:00 | upsert on `(card_id, snapshot_date, source, variant)`; same-day re-run leaves the row count unchanged ([S02.T07](../02-card-data-and-search/T07-prices-snapshot.md) BR-S02.T07-01) | `cards_market_usd` is refreshed in the snapshot's own transaction |
| `cards` (four TCGdex columns) | U | worker (via `etl prices`) | daily 06:00 | `refreshAndSnapshot` updates only `raw_tcgdex_json`, `tcgdex_legal_standard`, `tcgdex_legal_expanded`, `tcgdex_updated` (RN-01) | ≈20k requests, 30–60 min on a cold run |
| `tournaments`, `archetypes`, `decks`, `deck_cards` | C/U | worker (via `etl decks --web`) | daily 07:00 | one transaction per tournament; delete-then-insert of `deck_cards` per deck (RN-03) | the window is never overridden |
| `tournaments` (and cascade) | D | worker (via `etl decks --web`) | daily 07:00, prune step | `DELETE FROM tournaments WHERE date < now − 180 days` (RN-04) | the cascade takes decks and lines |
| `games` | D | worker (`sweepGames`) | weekly, Sunday 04:00 | deletes rows whose job finished more than `GAMES_RETENTION_DAYS` (30) ago, in batches of 5,000; `jobs` and `job_pairings` untouched (BR-S08.T01-09) | the sweep [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) deferred here |
| `$DATA_DIR/backups/pokesearch-<YYYYMMDD-HHmmss>.db` | C, then D of old files | worker (`runBackup`) | daily 03:30 | `VACUUM INTO` → reopen read-only → `PRAGMA integrity_check` → prune to `--keep 7`; never prunes after a failed check (BR-S08.T01-10) | not a database object; a file |
| `jobs`, `job_pairings` | C/U | worker | never from the scheduler | the queue is the worker's own poll loop ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); the scheduler enqueues no engine job | a future "nightly measurement" would change this and needs a decision |
| any rules or user-deck table | C/U/D | worker | never | Architecture principle 2 | the scheduler writes baseline, log and job-child tables only |

## Interfaces

**The job table.** Five tasks, all in one frozen constant so the argument lists cannot be built from configuration (RN-03, RN-04).

| id | Cron (5 fields) | Local time, `America/Sao_Paulo` | Runs | `etl_runs.kind` | Conflict group |
|---|---|---|---|---|---|
| `prices` | `0 6 * * *` | 06:00 every day | `etl prices` → `refreshAndSnapshot(db)` | `prices` | `cards` |
| `delta` | `0 5 * * 1` | 05:00 every Monday | `etl delta` → `fetchAll` + load + `rebuildFts` + `snapshotFromCache` | `delta` | `cards` |
| `decks` | `0 7 * * *` | 07:00 every day | `etl decks --web` → `syncDecks(db, { web: true })` | `decks` | `meta` |
| `backup` | `30 3 * * *` | 03:30 every day | `pnpm db:backup --keep 7` | `backup` | `maintenance` |
| `retention` | `0 4 * * 0` | 04:00 every Sunday | `sweepGames()` then `sweepEtlRuns()` | `retention` | `maintenance` |

The first three cron strings and the timezone are the legacy's, verbatim in effect: `scheduler.py` registers `hour=6, minute=0`, `day_of_week="mon", hour=5, minute=0` and `hour=7, minute=0` against `BackgroundScheduler(timezone="America/Sao_Paulo")`. The order inside a morning is deliberate and is kept: the backup is taken before anything writes, `delta` precedes `prices` on Mondays so the price snapshot sees the newly loaded cards, and `decks` runs last because Limitless publishes the previous day's events overnight.

`backup` and `retention` extend `EtlRunKind` ([S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)) with two members. No migration is needed — `etl_runs.kind` carries no `CHECK`, only the `status` column does — but the inline comment in `0001_foundation.sql` that enumerates the kinds becomes incomplete, and that file may not be edited because its checksum is pinned ([S01.T04](../01-foundation/T04-database-migration-framework.md) BR-S01.T04-02). The current list therefore lives in `packages/db/MIGRATIONS.md` and in `EtlRunKind` itself, and `SCHEDULER.md` says so.

**Conflict groups.** `cards` covers `prices` and `delta`, because both write `cards` — `refreshAndSnapshot` updates the four TCGdex columns and `delta` upserts the canonical ones. `meta` covers `decks` alone. `maintenance` covers `backup` and `retention`. A trigger whose group is busy is skipped (BR-S08.T01-03); groups do not block each other, which is what lets a long `decks` sync overlap a price snapshot exactly as [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) allows ("different kinds are allowed — they write different tables").

**Environment.**

| Variable | Default | Effect |
|---|---|---|
| `SCHEDULER_ENABLED` | `0` | `1` registers the cron tasks; anything else leaves the worker a pure job runner (BR-S08.T01-01) |
| `SCHEDULER_TZ` | `America/Sao_Paulo` | the IANA zone every cron string is evaluated in; an unknown zone refuses to start |
| `SCHEDULER_PRICES_CRON` | `0 6 * * *` | overrides one task's cron; an empty string disables that task |
| `SCHEDULER_DELTA_CRON` | `0 5 * * 1` | as above |
| `SCHEDULER_DECKS_CRON` | `0 7 * * *` | as above |
| `SCHEDULER_BACKUP_CRON` | `30 3 * * *` | as above; empty disables the nightly backup |
| `SCHEDULER_RETENTION_CRON` | `0 4 * * 0` | as above; empty disables the sweep |
| `SCHEDULER_MISFIRE_GRACE_S` | `3600` | the legacy's `misfire_grace_time`; how late a missed trigger may still fire (BR-S08.T01-04) |
| `SCHEDULER_CATCHUP` | `1` | `0` turns the staleness catch-up into a log line only (BR-S08.T01-05) |
| `SCHEDULER_STARTUP_STAGGER_S` | `60` | seconds between catch-up runs at start, so a week-old database does not start three jobs at once |
| `SCHEDULER_JITTER_S` | `0` | random delay added to each trigger; left at 0 because a single local user is not a thundering herd |
| `SCHEDULER_SHUTDOWN_GRACE_MS` | `30000` | how long a stop waits for an in-flight task (BR-S08.T01-08) |
| `GAMES_RETENTION_DAYS` | `30` | from [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md); `0` disables the `games` sweep |
| `ETL_RUNS_RETENTION_DAYS` | `0` | `0` keeps every run forever, which is the recommendation (BR-S08.T01-09) |

**`apps/worker/src/scheduler.ts`**

```ts
export type ConflictGroup = "cards" | "meta" | "maintenance";
export type TriggerKind   = "scheduled" | "misfire" | "catchup" | "manual";

export interface ScheduledJob {
  id: "prices" | "delta" | "decks" | "backup" | "retention";
  cron: string;                       // 5-field, evaluated in cfg.tz
  kind: EtlRunKind;                   // the etl_runs kind the task writes
  group: ConflictGroup;
  periodMs: number;                   // 86_400_000 daily, 604_800_000 weekly — used by the staleness rule
  run(db: Db, ctx: { trigger: TriggerKind; signal: AbortSignal }): Promise<void>;
}

export interface SchedulerHandle {
  readonly enabled: boolean;
  readonly jobs: readonly ScheduledJob[];
  running(): readonly string[];                 // ids currently executing
  stop(graceMs?: number): Promise<{ abandoned: string[] }>;
}

export function startScheduler(db: Db, cfg: SchedulerConfig): SchedulerHandle;
export function nextFireTimes(cron: string, tz: string, from: Date, n?: number): Date[];   // pure, for tests
export function shouldCatchUpMisfire(job: ScheduledJob, now: Date, lastOk: Date | null, cfg: SchedulerConfig): boolean;
export function staleAtStart(job: ScheduledJob, now: Date, lastOk: Date | null, cfg: SchedulerConfig): boolean;
export const SCHEDULED_JOBS: readonly ScheduledJob[];
```

`nextFireTimes`, `shouldCatchUpMisfire` and `staleAtStart` are pure functions of a clock, which is what makes the acceptance checks below runnable against fixed timestamps instead of against a wall clock.

**`apps/worker/src/maintenance.ts`**

```ts
export function runBackup(cfg: { keep: number }): Promise<{ path: string; bytes: number; ms: number }>;
export function sweepGames(db: Db, days?: number): { jobs: number; rows: number };      // GAMES_RETENTION_DAYS
export function sweepEtlRuns(db: Db, days?: number): { rows: number };                  // 0 → no-op
export const GAME_SWEEP_BATCH = 5000;
```

`sweepGames` deletes with `DELETE FROM games WHERE job_id IN (SELECT id FROM jobs WHERE finished_at IS NOT NULL AND finished_at < :cutoff) LIMIT`-free batching by `job_id`, because `packages/db/PORTABILITY.md` forbids `LIMIT` on `DELETE`; it takes the job ids first, then deletes per job, 5,000 rows at a time inside short transactions so no reader waits longer than `busy_timeout`.

**Startup sequence**, inserted into the worker's existing lifecycle ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)) between `recoverOrphans()` and the first poll: read the config → if disabled, log one line and return → `reconcileStaleRuns(db)` → read the latest `etl_runs` row per kind → decide misfire and staleness per task → register the cron tasks with `node-cron`'s `{ scheduled: true, timezone: cfg.tz }` → fire the catch-ups, staggered → log the table of tasks with their next fire times. The last line is what a person reads to know the scheduler is alive: `scheduler: 5 tasks, tz America/Sao_Paulo — prices 2026-09-23T06:00, delta 2026-09-28T05:00, decks 2026-09-23T07:00, backup 2026-09-23T03:30, retention 2026-09-27T04:00`.

**Manual triggers.** The scheduler adds no endpoint. `POST /api/meta/refresh` ([S03.T07](../03-tournament-meta-and-deck-builder/T07-api-meta-endpoints.md)) already calls `tryStartBackgroundSync` with its 10-minute `BACKGROUND_MIN_INTERVAL_MS`, and that path and this one converge on `startRun`, so the button and the cron task cannot both be syncing decks. `SCHEDULER.md` states the ordering rule: the button is for "now", the cron task is for "every day", and neither queues behind the other.

**External-scheduler alternatives**, recorded for the two situations where the worker is not the right host. A hosted deployment ([S08.T03](T03-hosted-postgres-migration-path.md)) keeps the worker on the user's machine, so cron stays here; if the ETL ever moves to the host, the alternative is a platform cron hitting an authenticated endpoint, which needs the authentication story D-007 says does not exist yet. On Windows, the legacy documented Task Scheduler running `uv run pokesearch-etl prices` in the project folder; the equivalent here is a `scripts/etl.cmd` shim invoking `pnpm etl <command>` with the repository as the working directory. That also answers the question [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) left for this subtask — `pnpm etl` stays a workspace script, no globally linked binary is installed, and the shim exists only for the Task Scheduler case.

## Implementation steps

1. Add `node-cron` to `apps/worker` and write `SCHEDULED_JOBS` with the five entries, their cron strings, kinds, groups and periods, plus the config schema and its defaults; a disabled scheduler registers nothing (BR-S08.T01-01).
2. Write `nextFireTimes(cron, tz, from, n)` over the cron parser and spec it against fixed timestamps, including the two daylight-saving edges named under Edge cases.
3. Write `startScheduler` with registration, the per-task `try`/`catch`, the in-flight set and `running()`; spec that a throwing task leaves the others firing (BR-S08.T01-07).
4. Add the conflict groups and `conflictBusy`, and map the CLI's exit code 3 onto the same "skipped" outcome; spec the overlap case and the accounting (BR-S08.T01-03).
5. Write `shouldCatchUpMisfire` and `staleAtStart` as pure functions and spec the 06:00:30 restart, the 08:00 restart and the nine-day-old kind (BR-S08.T01-04, -05).
6. Wire the tasks to the exported ETL entry points and pass the `trigger` tag into `run.add`; spec the identity assertion and the one-row rule (BR-S08.T01-02, -06).
7. Write `maintenance.ts`: `runBackup` with its exit-code mapping, `sweepGames` with batching, `sweepEtlRuns` with the `0` no-op; spec all three (BR-S08.T01-09, -10).
8. Extend `EtlRunKind` with `backup` and `retention`, record the extension in `packages/db/MIGRATIONS.md`, and confirm `etl status` prints the two new kinds.
9. Hook `startScheduler` and `stopScheduler` into the worker lifecycle after `recoverOrphans`, with the shutdown grace and the abandoned-task log (BR-S08.T01-08).
10. Write `apps/worker/SCHEDULER.md`: the job table, the conflict groups, the misfire and catch-up rules, the environment table, the manual-trigger ordering and the two external alternatives.
11. Run one real unattended night with `SCHEDULER_ENABLED=1` and record the five `etl_runs` rows, their durations and the backup size in the completion note — the first measurement of this machine's overnight window.

## Edge cases and error handling

- **The worker restarts at 06:00:30, thirty seconds after the prices trigger.** The misfire rule fires it immediately: the most recent fire time is 30 s in the past, well inside `SCHEDULER_MISFIRE_GRACE_S = 3600`, and the last successful `prices` run began before it. This is the legacy's `misfire_grace_time=3600` reproduced deliberately rather than inherited by accident. A restart at 08:00 does not run it — the miss is two hours old, the grace has passed, and the next 06:00 is close enough that forcing a 30–60 minute TCGdex refresh during the day is worse than skipping one snapshot (BR-S08.T01-04).
- **Two triggers overlap.** Monday is the case that actually happens: `delta` at 05:00 can still be loading changed sets when `prices` fires at 06:00, and both write `cards`. They share the `cards` conflict group, so the 06:00 trigger is skipped with one log line naming the running task and its start time, and `scheduler_skips` is incremented. Nothing is queued — a queued price snapshot would run at an unpredictable hour and produce a snapshot dated by wall clock rather than by intent. `decks` at 07:00 is in a different group and runs regardless. If the two ever end up in the same process by a configuration mistake, `startRun`'s cross-process guard is the second line of defence and exits 3, which is mapped to the same skip (BR-S08.T01-03).
- **A scheduled task throws.** The `etl_runs` row closes as `error` with the message (owned by `withRun`), the scheduler logs it with the task id, and every other task keeps its registration. The failure becomes visible through [S08.T02](T02-etl-monitoring-and-alerts.md), not through a dead scheduler — which is the failure mode of a scheduler that lets an exception escape its callback (BR-S08.T01-07).
- **The worker was off for a week.** At start, every task whose last `ok` run is older than its period plus the grace is caught up once, staggered 60 s apart in schedule order: backup, delta, prices, decks. Running them at once would put a full TCGdex refresh, a set load and a deck sync on the same disk and the same database file simultaneously. `SCHEDULER_CATCHUP=0` reduces this to a log line for anyone who prefers to start the jobs by hand (BR-S08.T01-05).
- **A daylight-saving transition in `America/Sao_Paulo`.** Brazil has not observed DST since 2019, so today every one of these times is unambiguous; the rule is written down anyway because `SCHEDULER_TZ` is configurable and a zone that does observe it will produce a skipped hour and a repeated hour. The contract: a trigger in a skipped hour fires once at the next valid instant, and a trigger in a repeated hour fires on the first occurrence only, guarded by the "last successful run began before this fire time" test that already prevents a double run.
- **`SCHEDULER_TZ` names a zone Node does not know.** The worker refuses to start with the invalid zone in the message, rather than silently falling back to UTC — a three-hour shift in the overnight window would move the price snapshot into the user's working day.
- **The api's "atualizar agora" button is pressed at 06:59.** `tryStartBackgroundSync` starts a deck sync; the 07:00 cron trigger then finds the `meta` group busy through `startRun` and skips. The two paths never both sync, and the user's explicit action wins because it started first (BR-S08.T01-03).
- **`SIGINT` during the 06:00 price refresh.** New triggers stop immediately, the in-flight task is awaited up to 30 s, and because a cold refresh takes far longer it is abandoned with a log line naming it. Its `etl_runs` row stays `running` and the next start's `reconcileStaleRuns` turns it into `cancelled` after `STALE_RUN_MINUTES`, which is what that rule exists for (BR-S08.T01-08).
- **The nightly backup fails `PRAGMA integrity_check`.** `pnpm db:backup` exits 1 and prunes nothing; `runBackup` maps that to an `error` run, the previous seven backups are untouched, and the retention sweep four hours later is **not** conditioned on it — the two are independent, and making the sweep depend on the backup would mean one bad night stops all housekeeping. The alert is [S08.T02](T02-etl-monitoring-and-alerts.md)'s.
- **The retention sweep would delete the games of a job the user is still reading.** It deletes only from jobs with a non-null `finished_at` older than 30 days, and it never deletes `jobs` or `job_pairings`, so the aggregates, the fingerprints and the score survive; what disappears is the per-game detail, which is regenerable by re-running the job. A replay opened on an old job ([S08.T04](T04-wasm-replay-and-play.md)) therefore reports "log no longer stored" rather than a broken page (BR-S08.T01-09).
- **The database is locked by a long ETL transaction when the sweep runs.** The batched deletes fail with `SQLITE_BUSY` after `busy_timeout`; the sweep stops at the batch boundary, reports how many rows it removed and closes the run as `error`. It is resumable by construction, because the next run recomputes the cutoff and continues.
- **`SCHEDULER_ENABLED=1` on two machines against the same database** — not the supported topology (one worker per machine, one database file), but survivable: `startRun`'s guard means only one of them runs each kind and the other records a skip. `SCHEDULER.md` states that this is a coincidence of the guard, not a design, and that a second worker is out of scope.

## Acceptance / verification

- [ ] `pnpm --filter worker test scheduler.spec.ts` green, including `> disabled by default registers zero tasks` and `> enabling registers exactly the five documented tasks` with the cron strings `0 6 * * *`, `0 5 * * 1`, `0 7 * * *`, `30 3 * * *`, `0 4 * * 0` and the timezone `America/Sao_Paulo` (BR-S08.T01-01).
- [ ] `> next fire times against fixed timestamps`: from `2026-09-22T12:00:00-03:00`, `prices` next fires `2026-09-23T06:00:00-03:00`, `delta` `2026-09-28T05:00:00-03:00` (the next Monday) and `retention` `2026-09-27T04:00:00-03:00` (the next Sunday).
- [ ] `> an overlapping trigger is skipped with a log line and no second run`: a stub `delta` still running at 06:00 makes the `prices` trigger log `skipped: cards group busy (delta since …)` and leaves `etl_runs` with exactly one row for that morning (BR-S08.T01-03, -06).
- [ ] `> a worker started at 06:00:30 runs prices immediately` and `> a worker started at 08:00 does not run the 06:00 prices trigger`, both driven by an injected clock (BR-S08.T01-04).
- [ ] `> a kind whose last ok run is 9 days old runs once at start` with `trigger: "catchup"` in `stats_json`, staggered by 60 s, and not a second time on the same process; `SCHEDULER_CATCHUP=0` produces only a log line (BR-S08.T01-05).
- [ ] `> a throwing task leaves the other tasks registered and firing` and the process exit code stays 0 (BR-S08.T01-07).
- [ ] `scheduler.spec.ts > the decks job passes no window flags` and `> the decks job leaves pruneDays at its default`; an end-to-end run against a fixture database leaves a 200-day-old tournament deleted and a 179-day-old one intact (RN-03, RN-04).
- [ ] `maintenance.spec.ts > sweeping games keeps the job and its pairings`: a job finished 40 days ago with 2 pairings and 10 games ends with 0 `games` rows, 2 `job_pairings` rows and 1 `jobs` row; a job finished 20 days ago is untouched (BR-S08.T01-09).
- [ ] `maintenance.spec.ts > etl_runs retention of 0 deletes nothing` and `> a failed backup closes the run as error and prunes nothing` (BR-S08.T01-09, -10).
- [ ] `> stop() prevents new triggers` and `> an in-flight task is awaited up to the grace and then reported`, with the abandoned task named in the log (BR-S08.T01-08).
- [ ] One real unattended night with `SCHEDULER_ENABLED=1`: `pnpm etl status` next morning shows five `ok` rows — `backup`, `prices`, `decks`, plus `delta` and `retention` on their days — each with `stats_json.trigger = "scheduled"`, and the backup file exists under `$DATA_DIR/backups/` (BR-S08.T01-02, -06).

## Risks and open questions

- **Risk — the schedule is inherited without being re-examined.** 06:00/05:00/07:00 were right for the legacy's data sources and for a machine that was on overnight; they may be wrong here. Mitigation: every time is an environment variable, the job table is one constant, and the completion note records the measured durations, so the first week of real runs is evidence for moving them rather than a guess.
- **Risk — a 30–60 minute price refresh every night is a lot of traffic** for a number that changes by cents. Mitigation: the duration is measured and recorded, and [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md) already names the alternative it deferred here — refreshing only cards above a price threshold. That is a change to `refreshAndSnapshot`, not to the scheduler, and it needs the user's call because it trades completeness of the sparkline for time.
- **Risk — the scheduler grows into a second job queue.** `jobs` is the queue ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)) and `etl_runs` is a log; a cron task that enqueued engine jobs would blur them. Mitigation: `SCHEDULED_JOBS` contains only ETL and maintenance entries, and the rule is written in `SCHEDULER.md`. A nightly measurement, if the user ever wants one, is a new entry that inserts a `jobs` row and returns — and that is a decision, not an implementation detail.
- **Risk — catch-up surprises the user.** Starting the worker at 15:00 after a week away begins a deck sync and a price refresh in the middle of the afternoon. Mitigation: `SCHEDULER_CATCHUP=0`, the 60 s stagger, and a log line per catch-up naming why it fired.
- **Question — should a failed task retry?** It does not: a transient network failure and a broken source look identical here, and a retry loop would turn one alert into several. Recommendation: no retry; the fetchers already retry at the request level ([S02.T02](../02-card-data-and-search/T02-fetch-pokemon-tcg-data.md) BR-S02.T02-07), and the next day's trigger is the real retry. Revisit if [S08.T02](T02-etl-monitoring-and-alerts.md) shows transient failures are common.
- **Question — should the backup run before or after the ETL?** It runs at 03:30, before everything, so the copy is of the last known-good state rather than of whatever the night produced. The alternative — backing up after the loads — protects the new data but preserves a corrupted load. Recommendation: keep it first; the raw cache makes a reload possible anyway (D-003). The user confirms.
- **DEPENDENCY-PROPOSAL: S08.T01 should depend on S01.T02 because** the nightly `backup` task invokes `pnpm db:backup` and relies on its exit-code contract (0 ok, 1 verification failed, 2 source missing) and on its `--keep` pruning rule, both defined by [S01.T02](../01-foundation/T02-sqlite-database-client.md), whose own Risks section explicitly defers the "should it run nightly?" question to this subtask. Today the edge does not exist in either header.
- **DEPENDENCY-PROPOSAL: S08.T01 should depend on S02.T08 because** the Monday `delta` task rebuilds the FTS index as part of `runLoad`, and [S02.T08](../02-card-data-and-search/T08-full-text-search.md)'s own Risks section defers the "should `rebuildFts` become incremental for `etl delta`?" decision to this subtask, which cannot answer it without that module's measurement. The current edge reaches it only transitively through [S02.T02](../02-card-data-and-search/T02-fetch-pokemon-tcg-data.md).
- **DEPENDENCY-PROPOSAL: S08.T01 should depend on S04.T14 because** the weekly retention sweep deletes from `games` using `GAMES_RETENTION_DAYS`, a constant that subtask defines together with the rule that the sweep "itself is S08.T01". The edge exists from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) but not from the schema that owns the table.
- **Sizing — this file is probably two subtasks.** Its prose runs past the ~2,400-word guidance in [Conventions](../../project/08-conventions.md) because it covers two different jobs: cron orchestration (the job table, the timezone, the conflict groups, the misfire and catch-up rules, the lifecycle) and housekeeping (the nightly backup and the weekly retention sweep, both inherited here from questions [S01.T02](../01-foundation/T02-sqlite-database-client.md), [S01.T04](../01-foundation/T04-database-migration-framework.md) and [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) deferred to this subtask). A split would be "S08.T01 scheduler", keeping steps 1–6 and 9–11, and a new subtask owning `maintenance.ts`, `GAMES_RETENTION_DAYS` and `ETL_RUNS_RETENTION_DAYS` and depending on it. Not applied here, because renumbering is not this pass's to do; proposed for the user's decision.

## References

- `pokemon/src/pokesearch/scheduler.py` — verified, 38 lines: `BackgroundScheduler(timezone="America/Sao_Paulo")`; `sched.add_job(_job_prices, "cron", hour=6, minute=0, id="prices", misfire_grace_time=3600)`; `sched.add_job(_job_delta, "cron", day_of_week="mon", hour=5, minute=0, id="delta", misfire_grace_time=3600)`; `sched.add_job(_job_decks, "cron", hour=7, minute=0, id="decks", misfire_grace_time=3600, max_instances=1)`; the three bodies call `prices.snapshot_refresh(connect())`, `etl_run.run_load(changed_only=True)` and `decks.run_locked()`. No `coalesce` is set, and `max_instances` appears only on `decks`. Consult for the times, the timezone and the grace value, all three kept here.
- `pokemon/src/pokesearch/config.py` L26 — verified: `ENABLE_SCHEDULER: bool = os.getenv("ENABLE_SCHEDULER", "0") == "1"`, off by default. `pokemon/src/pokesearch/api/main.py` L19–28 — verified: the FastAPI `lifespan` starting the scheduler inside the web process when the flag is set and stopping it with `sched.shutdown(wait=False)`. This in-process hosting is what moves to `apps/worker`.
- `pokemon/src/pokesearch/etl/decks.py` L225–255 — verified: `_lock = threading.Lock()`, `_last_started`, `MIN_INTERVAL_S = 600`, `is_running()` returning `_lock.locked()`, and `try_start_background_sync(**kwargs) -> tuple[bool, str]` returning `(False, "aguarde alguns minutos entre atualizações")` inside the interval (bypassable with `ignore_interval`), `(False, "já em execução")` when the lock is held, and `(True, "iniciado")` after starting a daemon thread named `decks-sync`. L258–270 — `run_locked()`, the scheduler's own entry point, which logs `"decks: sync já em execução; job ignorado"` and returns `None` rather than queueing. Consult for the skip-never-queue behaviour this subtask keeps and for the single-process limitation it replaces.
- `pokemon/README.md` L315–319 §"Agendamento" — verified: *"`ENABLE_SCHEDULER=1` no `.env` liga o APScheduler dentro do processo web: preços diariamente às 06:00, `delta` toda segunda 05:00 e decks diariamente às 07:00 (fuso America/Sao_Paulo). Alternativa: Agendador de Tarefas do Windows executando `uv run pokesearch-etl prices` na pasta do projeto."* The source of the external-scheduler alternative recorded in `SCHEDULER.md`.
- `pokemon/ESPECIFICACAO.md` §2.3 L102–103 — verified: the same three times, stated as part of the ingestion pipeline, together with the ordered `full` pipeline whose step order `etl delta` preserves.
- [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) — `withRun`, `startRun`'s concurrency guard and exit code 3, `reconcileStaleRuns`, `STALE_RUN_MINUTES`, the `EtlRunKind` union this subtask extends, and the agreed `stats_json` counter names.
- [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) — `syncDecks`' defaults (RN-03's 90 days / 16 players / 400 tournaments, RN-04's 180-day prune), `tryStartBackgroundSync` with `BACKGROUND_MIN_INTERVAL_MS`, and the Risks note naming this subtask as the owner of the cross-process guard.
- [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) — the worker lifecycle (`recoverOrphans`, the poll loop, `SIGINT`/`SIGTERM` shutdown) this scheduler is registered inside; [S01.T02](../01-foundation/T02-sqlite-database-client.md) — `pnpm db:backup`'s sequence and exit codes; [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) — `GAMES_RETENTION_DAYS` and the rule that the sweep belongs here.
- External: `node-cron` (5-field expressions, the `timezone` option, `task.stop()`); the IANA zone `America/Sao_Paulo`, which has observed no daylight saving since 2019.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
