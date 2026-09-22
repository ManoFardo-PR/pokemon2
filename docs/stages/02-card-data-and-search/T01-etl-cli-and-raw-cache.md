# S02.T01 — ETL CLI, raw cache layout and run log

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 1 / 14 |
| Depends on | [S01.T01](../01-foundation/T01-monorepo-skeleton.md), [S01.T04](../01-foundation/T04-database-migration-framework.md) |
| Unblocks | [S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md), [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) |
| Parallel with | [S02.T05](T05-cards-schema-migration.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `env` `RAW_CACHE_DIR`, `DATABASE_PATH` — from [S01.T01](../01-foundation/T01-monorepo-skeleton.md)
- `module` `@pokesearch/db/migrate` and `table etl_runs` — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `file` `pokemon/src/pokesearch/etl/run.py` and `config.py` — the legacy subcommand set, the fixed order inside a full load and the source constants; read-only reference

## Outputs (proposed)
- `module` `packages/etl` CLI `etl <full|delta|prices|fts|decks|status> [--sets id,…] [--force] [--skip-tcgdex] [--web]` (commander), structured logging, exit codes — consumed by [S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md), [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)
- `file` cache layout under `RAW_CACHE_DIR`: `pokemon-tcg-data/` (+ `etags.json`), `tcgdex/{sets.json, sets/<id>.json, cards/<id>.json}`, `limitless/{tournaments/<id>/…, web/list_<id>.html}`, `reports/*.csv`
- `module` `etl/run-log.ts` — `startRun(kind)` / `finishRun(id, stats | error)` writing `etl_runs`; `etl status` prints the last run per kind — consumed by [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)

## Initial objective
One executable entry point for every ingestion job, with a predictable on-disk cache (so a full reload can run offline) and a database log of every run's statistics and errors.

## Context

D-003 rebuilds the whole ingestion pipeline in TypeScript from the public sources. Six later subtasks in this stage and four in S03 are *fetchers and loaders*; this one is the frame they plug into. Writing it first means every fetcher inherits the same cache root, the same logging, the same run bookkeeping and the same exit-code contract, instead of each inventing them.

The legacy CLI is the shape reference. `pokemon/src/pokesearch/etl/run.py` is a 149-line `argparse` program with subcommands `full`, `delta`, `prices`, `fts`, `seed-wjsutton` and `decks`, and a `run_load()` that fixes the order inside a full load: download pokemon-tcg-data → read the set list → fetch the TCGdex set list → per set (fetch canonical cards, resolve the TCGdex set id, match cards, fetch the matched TCGdex cards, `load_set`) → `rebuild_fts` → write `last_load` → write the two unmatched CSVs → `prices.snapshot_from_cache`. That order is kept because it is correct: FTS needs loaded rows and the price snapshot needs `cards.tcgdex_id`.

Two things are added. First, **a run log**: the legacy recorded a single `etl_meta.last_load` string, so a failed nightly run was invisible and nothing could be alerted on. [S01.T04](../01-foundation/T04-database-migration-framework.md) already ships `etl_runs(id, kind, started_at, finished_at, status, stats_json, error)` with `CHECK (status IN ('running','ok','error','cancelled'))` and `CHECK ((status = 'running') = (finished_at IS NULL))`; this subtask is its only writer, and [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) its only reader for alerting. Second, **a cache outside the repository**: the legacy resolved `RAW_DIR` against the repo root, which under D-005 would put tens of thousands of small JSON files inside OneDrive; here everything hangs off `RAW_CACHE_DIR` (default `$DATA_DIR/raw`).

## Scope

- **In scope.** `packages/etl` as a workspace member with a `bin` entry; the commander program, its flags and exit codes; `etl/paths.ts` (cache-root resolution and per-source path helpers); `etl/run-log.ts`; `etl/logger.ts` (pino, human and `--json` modes); `etl status`; the reconciliation of stale `running` rows; the orchestration order of `etl full` / `etl delta` with the fetcher and loader modules injected.
- **Out of scope.** Every fetcher and loader body ([S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md), [S02.T06](T06-load-cards.md), [S02.T07](T07-prices-snapshot.md), [S02.T08](T08-full-text-search.md), [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md)–[S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)); id mapping ([S02.T04](T04-set-and-card-id-mapping.md)); running the ETL on a schedule ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)); alerting on the rows written here ([S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask. Architecture principle 2 — the etl writes baseline tables only — is first enforced here, by the fact that the only table this module writes is `etl_runs`.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T01-01 | Every subcommand invocation writes exactly one `etl_runs` row, inserted with `status='running'` before any network or file work and closed to `ok` or `error` before the process exits. | `withRun(kind, fn)` wrapper in `etl/run-log.ts`; every subcommand body is its `fn` | `run-log.spec.ts > one row per invocation, ok on success`; `> error carries the message` |
| BR-S02.T01-02 | A run that ends in `error` stores the error message in `etl_runs.error` and the partial counters in `stats_json`; it never stores an empty `{}`. | `finishRun(id, { error, stats })` merges the counters collected so far | `run-log.spec.ts > failing fetcher leaves status=error with message and partial stats` |
| BR-S02.T01-03 | Every cache path resolves under `RAW_CACHE_DIR`; a path that escapes it (absolute, `..`, or inside the repository) is refused before any write. | `resolveCachePath()` in `etl/paths.ts` (resolve, then `startsWith` check) | `paths.spec.ts > rejects ../ and repo-relative targets` |
| BR-S02.T01-04 | `etl full` and `etl delta` run their steps in this order and skip none: fetch canonical → fetch TCGdex → map ids → load cards per set → rebuild FTS → snapshot prices. | the `runLoad()` orchestrator, a single ordered array of named steps | `orchestrator.spec.ts > step order` with stubbed modules recording their call order |
| BR-S02.T01-05 | At most one run of a given `kind` is active: starting a second one while an `etl_runs` row of that kind is `running` and younger than `STALE_RUN_MINUTES` exits 3 without touching the cache. | `startRun` checks the `etl_runs_running_idx` partial index inside the same `BEGIN IMMEDIATE` that inserts | `run-log.spec.ts > second concurrent run of the same kind exits 3` |
| BR-S02.T01-06 | A row left `running` for more than `STALE_RUN_MINUTES` (default 240) is reconciled to `cancelled` by the next run of any kind, never deleted. | `reconcileStaleRuns()` called once at CLI start | `run-log.spec.ts > stale running row becomes cancelled, not removed` |
| BR-S02.T01-07 | Subcommand bodies contain no HTTP, no SQL against card tables and no parsing; they only call injected modules and aggregate their counters. | `packages/etl/src/cli.ts` imports no `undici`/`node:sqlite`; eslint `no-restricted-imports` for the CLI folder | `pnpm lint` fails on a fixture that fetches from `cli.ts` |
| BR-S02.T01-08 | The CLI exits non-zero whenever the run log says `error`, and zero whenever it says `ok` — the two can never disagree. | one `process.exitCode` assignment, derived from the closed run row | `cli.spec.ts > exit code matches etl_runs.status for both outcomes` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `etl_runs` | C | etl | first statement of every subcommand | insert-only; `status='running'`, `finished_at NULL`, `stats_json='{}'` | id is the run handle passed to every step |
| `etl_runs` | U | etl | when a subcommand returns or throws | one update per run, sets `finished_at`, `status`, `stats_json`, `error`; a closed row is never updated again | `CHECK ((status='running') = (finished_at IS NULL))` from 0001 makes a half-write fail loudly |
| `etl_runs` | U | etl | CLI start, for rows older than `STALE_RUN_MINUTES` | `status='cancelled'`, `finished_at = now`; no-op when nothing is stale | recovers from a killed process |
| `etl_runs` | R | etl (`etl status`), api, [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) | on demand | read-only; last row per `kind` via `etl_runs_kind_started_idx` | `--json` prints the rows verbatim |
| `$RAW_CACHE_DIR/<source>/…` | C/U | etl (the fetcher modules, through `paths.ts`) | during fetch steps | directory created on demand; write is atomic (temp file + rename); path must stay under the cache root | contents owned by [S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md), [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md) |
| `$RAW_CACHE_DIR/reports/*.csv` | C | etl | end of a load or a deck sync | overwritten per run; header row always written even when empty | consumed by a human and by [S02.T04](T04-set-and-card-id-mapping.md)'s acceptance |
| card/set/price/deck tables | — | — | — | not written here | this subtask owns no baseline table |

## Interfaces

**CLI.** `pnpm etl <command>` → `node --no-warnings=ExperimentalWarning packages/etl/src/cli.ts`.

```
etl full     [--sets <id,…>] [--force] [--skip-tcgdex] [--concurrency <n>] [--json] [--verbose]
etl delta    [--skip-tcgdex] [--json]
etl prices   [--no-refresh] [--date <YYYY-MM-DD>] [--json]
etl fts      [--json]
etl decks    [--web] [--skip-api] [--days <n>] [--min-players <n>] [--max-tournaments <n>]
             [--refresh-recent-days <n>] [--prune-days <n>] [--force] [--json]
etl status   [--kind <kind>] [--json]
```

Global: `--db <path>` (default `$DATABASE_PATH`), `--cache <dir>` (default `$RAW_CACHE_DIR`). Exit codes: `0` ok · `1` run failed (`etl_runs.status='error'`) · `2` usage error (unknown command or flag; commander prints help) · `3` another run of the same kind is active · `4` the database schema is behind (`assertSchemaCurrent` threw; the message names `pnpm db:migrate`).

**`packages/etl/src/run-log.ts`**

```ts
export type EtlRunKind = "full" | "delta" | "prices" | "fts" | "decks" | "decks-web" | "seed";
export interface RunHandle { id: number; kind: EtlRunKind; startedAt: string; add(patch: Record<string, number | string>): void; }
export function startRun(db: Db, kind: EtlRunKind): RunHandle;            // throws ConcurrentRunError (exit 3)
export function finishRun(db: Db, run: RunHandle, outcome: { error?: unknown }): void;
export function withRun<T>(db: Db, kind: EtlRunKind, fn: (run: RunHandle) => Promise<T>): Promise<T>;
export function reconcileStaleRuns(db: Db, staleMinutes?: number): number; // default STALE_RUN_MINUTES = 240
export function lastRunPerKind(db: Db): EtlRunRow[];
export const STALE_RUN_MINUTES = 240;
```

`run.add({ sets: 174 })` accumulates into an in-memory object that `finishRun` serialises into `stats_json`. Agreed counter names, so [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) can chart them without parsing prose: `sets`, `sets_changed`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `unmatched_sets`, `unmatched_cards`, `http_requests`, `http_304`, `cache_hits`, `price_rows`, `fts_rows`, `duration_ms`.

**`packages/etl/src/paths.ts`**

```ts
export function cacheRoot(): string;                       // $RAW_CACHE_DIR, created on demand
export function resolveCachePath(...segments: string[]): string;   // throws CachePathError when it escapes the root
export const ptcg = { setsFile: () => …, cardsFile: (setId: string) => …, etagsFile: () => … };
export const tcgdex = { setsFile: () => …, setFile: (id: string) => …, cardFile: (id: string) => … };
export const limitless = { tournamentDir: (id: string) => …, webList: (id: string) => … };
export const reports = { file: (name: string) => … };
export async function writeJsonAtomic(path: string, value: unknown): Promise<void>;  // temp + rename
```

**Cache layout** (paths are exactly what the fetchers use):

```
$RAW_CACHE_DIR/
  pokemon-tcg-data/ sets/en.json · cards/en/<ptcgSetId>.json · etags.json
  tcgdex/           sets.json · sets/<tcgdexSetId>.json · cards/<tcgdexCardId>.json
  limitless/        tournaments/<id>/{tournament.json,standings.json,decks.json} · web/list_<id>.html
  reports/          idmap_unmatched_sets.csv · idmap_unmatched_cards.csv · decks_unresolved.csv
```

**Logging.** pino; default human output `HH:mm:ss LEVEL step: message` with a per-step progress line; `--json` emits one NDJSON object per event with `{ run_id, kind, step, ...counters }`. No secret is ever logged: the logger redacts any field whose name matches `/key|token|secret/i` (only `LIMITLESS_API_KEY` exists today).

## Implementation steps

1. Add `packages/etl` to the workspace with a `bin` entry, a `test` script and dependencies on `@pokesearch/db` and `@pokesearch/shared` only; an empty CLI prints help and exits 2.
2. Write `paths.ts` with `cacheRoot`, `resolveCachePath`, the four per-source helpers and `writeJsonAtomic`; spec the escape check (BR-S02.T01-03).
3. Write `logger.ts` (human + `--json`, redaction) and wire `--verbose`.
4. Write `run-log.ts`: `startRun`/`finishRun`/`withRun`, the concurrency guard and `reconcileStaleRuns`; spec all three rules (BR-S02.T01-01, -02, -05, -06).
5. Add `etl status` reading `lastRunPerKind`, printing a table or JSON; on an empty database it prints `no runs` and exits 0.
6. Add the database bootstrap shared by all subcommands: open through `openDatabase`, call `assertSchemaCurrent`, map `SchemaOutdatedError` to exit 4.
7. Register the six subcommands with commander, each wrapped in `withRun`, each calling a step module resolved through an injectable registry (stubs that throw `NotImplemented` until their subtask lands).
8. Write `runLoad()` with the ordered step array and the `--sets`/`--force`/`--skip-tcgdex`/`delta` variations; spec the order with stub modules (BR-S02.T01-04).
9. Add the exit-code mapping and the `no-restricted-imports` lint rule for `cli.ts` (BR-S02.T01-07, -08).
10. Document the commands and the cache layout in `packages/etl/README.md`, and add the counter-name list so later fetchers use the agreed names.

## Edge cases and error handling

- **The process is killed mid-run (Ctrl-C, reboot).** The row stays `running`. The next CLI start reconciles it to `cancelled` after `STALE_RUN_MINUTES`; a `SIGINT` handler tries to close it as `cancelled` immediately, but never blocks the exit for more than 2 s.
- **A second `etl full` starts while the first is running.** `startRun` sees the live row inside its `BEGIN IMMEDIATE` and exits 3 with the first run's id and start time; nothing in the cache is touched. Different kinds (`prices` during `decks`) are allowed — they write different tables.
- **The database is behind the migrations.** `assertSchemaCurrent` throws before any fetch; the CLI exits 4 telling the user to run `pnpm db:migrate`. No `etl_runs` row is written, because the table may not exist yet.
- **`RAW_CACHE_DIR` does not exist or is not writable.** It is created on demand with `recursive: true`; an `EACCES`/`EROFS` fails the run with `status='error'` and a message naming the resolved path, because a silent fallback to the repository would put 53 MB of TCGdex JSON inside OneDrive.
- **`--sets sv99` names a set that does not exist.** The run proceeds over the zero matching sets, `stats_json.sets = 0`, status `ok`, and a warning line lists the unknown ids — an empty selection is a user error, not a pipeline failure.
- **A step module is not implemented yet.** The registry stub throws `NotImplemented`; the run closes as `error` with that message, so a half-built pipeline is visible in `etl status` instead of silently succeeding.
- **Disk fills during a fetch.** `writeJsonAtomic` removes its temp file, the error propagates, the run closes as `error`; the cache keeps only complete files, so the next run re-fetches exactly what is missing.
- **`stats_json` grows unbounded** (e.g. a step tries to store per-set detail). Only flat scalar counters are accepted; `run.add` throws on a non-scalar value, keeping the column small enough to read in a terminal.

## Acceptance / verification

- [ ] `pnpm etl status` against a freshly migrated temp database prints `no runs` and exits 0.
- [ ] `pnpm etl bogus` exits 2 and prints the usage block; `pnpm etl full --nope` exits 2 (BR-S02.T01-08).
- [ ] `run-log.spec.ts` green: one row per invocation; success → `status='ok'` with counters; a step that throws → `status='error'` with the message and the partial counters (BR-S02.T01-01, -02).
- [ ] `run-log.spec.ts > second concurrent run of the same kind exits 3` and leaves the first row untouched (BR-S02.T01-05); `> stale running row becomes cancelled` (BR-S02.T01-06).
- [ ] `orchestrator.spec.ts > step order` records exactly `fetch-ptcg, fetch-tcgdex, map-ids, load-cards, rebuild-fts, snapshot-prices` with stub modules; `--skip-tcgdex` drops the TCGdex and price steps and nothing else (BR-S02.T01-04).
- [ ] `paths.spec.ts` green: `resolveCachePath("../x")`, an absolute path and a repo-relative path all throw `CachePathError`; the four source helpers return paths under `RAW_CACHE_DIR` (BR-S02.T01-03).
- [ ] Running any subcommand against a database one migration behind exits 4 and writes no `etl_runs` row.
- [ ] `pnpm lint` fails on a fixture that imports `undici` from `packages/etl/src/cli.ts` (BR-S02.T01-07).

## Risks and open questions

- **Risk — the run log becomes a job queue.** `etl_runs` is a log, not a queue; the worker's `jobs` table ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)) is the queue. Mitigation: no `status='queued'` value exists in the 0001 `CHECK`, so the mistake cannot compile.
- **Risk — the concurrency guard is advisory only.** Two CLIs started in the same millisecond both pass if the `BEGIN IMMEDIATE` is not respected. Mitigation: the check and the insert share one immediate transaction (BR-S02.T01-05); the worst case is two runs writing the same idempotent upserts.
- **Risk — `--force` on `etl full` re-downloads ~20k TCGdex documents** (30–60 min, legacy measurement). Mitigation: `--force` prints the estimate and the request count before starting; [S02.T07](T07-prices-snapshot.md) owns the routine refresh path, which is the one the scheduler uses.
- **Question — should `etl` be a `pnpm` script or a globally linked binary?** Recommendation: a workspace script (`pnpm etl …`), so no global state exists on the machine; revisit only if [S08.T01](../08-operations-and-extensions/T01-scheduler.md) needs a path-stable executable for Task Scheduler. The user decides during S08.T01.
- **Question — is `decks-web` a separate `kind` or a flag on `decks`?** The `CHECK` in 0001 already allows both values. Recommendation: one `decks` run with `web: true` in `stats_json`, so the monitoring page has one series. Confirm with [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) before its first run.

## References

- `pokemon/src/pokesearch/etl/run.py` — verified: `argparse` with `full`/`delta`/`prices`/`fts`/`seed-wjsutton`/`decks`; `run_load()` fixes the step order and writes the two unmatched CSVs before calling `prices.snapshot_from_cache(conn)`; `--skip-tcgdex`, `--sets`, `--force` flags. Consult for the order and the flag names, not for the structure.
- `pokemon/src/pokesearch/config.py` — verified: `RAW_DIR = ROOT / "data" / "raw"` with `PTCG_RAW_DIR`, `TCGDEX_RAW_DIR`, `REPORTS_DIR`, `LIMITLESS_RAW_DIR` under it; `TCGDEX_CONCURRENCY = 8`; `PTCG_RAW_BASE`, `TCGDEX_API_BASE`. Consult for the cache sub-tree names this subtask reuses and for what "resolved against the repository root" costs.
- [S01.T04](../01-foundation/T04-database-migration-framework.md) — the `etl_runs` DDL, its `CHECK` constraints and `etl_runs_running_idx`; `assertSchemaCurrent` and `SchemaOutdatedError`.
- [S01.T02](../01-foundation/T02-sqlite-database-client.md) — `openDatabase`, `transaction(fn, "immediate")`, and the `--no-warnings=ExperimentalWarning` rule every entry point follows.
- [Architecture](../../project/03-architecture-overview.md) — the environment table (`DATA_DIR`, `RAW_CACHE_DIR`) and principle 2 (who writes what).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
