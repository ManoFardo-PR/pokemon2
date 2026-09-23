# S08.T02 — ETL monitoring and alerts

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 2 / 6 |
| Depends on | [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md), [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T03](T03-hosted-postgres-migration-path.md), [S08.T04](T04-wasm-replay-and-play.md), [S08.T05](T05-twinleaf-differential-oracle.md), [S08.T06](T06-llm-assisted-authoring.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `etl_runs` — from [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)
- `module` deck sync stats (`decks`, `unresolvedKinds`) — from [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)
- `module` the Fastify app factory, the route conventions of `apps/api/ROUTES.md` and the error envelope the four admin routes follow, plus the `/health` contract this subtask must leave untouched — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `module` `lastRunPerKind(db)`, `STALE_RUN_MINUTES` and the agreed `stats_json` counter names every fetcher writes — from [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)
- `env` `ALERT_WEBHOOK_URL` (optional) — new here, added to the environment table of `project/03-architecture-overview.md`
- `doc` `pokemon/ESPECIFICACAO.md` §6.2 — the declared data limitations, one of which this subtask exists to close; read-only reference

## Outputs (proposed)
- `module` route `/admin/etl` — last run per kind, duration, stats, error; alert rules: 'decks sync returned 0 decks', 'web scraper returned 0 rows twice', 'unresolved lines > 0.1 %', 'prices snapshot missed a day'; alerts shown in the web nav badge and optionally sent by e-mail/webhook (`ALERT_WEBHOOK_URL`)
- `module` `packages/etl/src/alerts.ts` — the rule catalogue as pure functions over recent `etl_runs` rows, `evaluateAlerts(db, now)`, and the open/acknowledge/resolve lifecycle
- `file` `packages/db/migrations/0009_ops.sql` — `etl_alerts(id, rule, key, severity, status, first_seen_at, last_seen_at, acked_at, resolved_at, run_id, detail_json)` with its constraints and indexes
- `contract` `GET /api/status` — the richer operational view deliberately kept out of `/health`, which keeps its contract and its 100 ms budget unchanged: last run per kind, open alerts, cache ages, table growth

## Initial objective
Silent failures — the legacy scraper's documented failure mode — become visible the same day.

## Context

`pokemon/ESPECIFICACAO.md` §6.2 lists four declared data limitations, and the second one is the reason this subtask exists: *"A raspagem do limitlesstcg.com quebra em silêncio se o HTML mudar."* The failure it describes is not a crash. The scraper still returns; it just returns nothing, the sync reports success, the meta page keeps showing yesterday's tournaments, and nobody finds out until a number looks wrong weeks later. The same shape of failure applies to every source here: pokemon-tcg-data could return an HTML error page, TCGdex could stop exposing a `pricing` block, Limitless could change a selector. What they have in common is that the pipeline is written to be tolerant — a 404 on one set is a warning, an empty scrape ingests nothing, a card without prices is skipped — and tolerance without observation is silence.

[S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) already built the thing that makes observation possible, and it built it for this reason: the legacy recorded a single `etl_meta.last_load` string, so *"a failed nightly run was invisible and nothing could be alerted on"*. Here every invocation writes one `etl_runs` row with `started_at`, `finished_at`, `status`, `stats_json` and `error`, and every fetcher feeds an agreed set of flat counters into it. This subtask is the only reader of that table for alerting, and it adds nothing to the pipeline: a rule is a pure function of the last few rows of a kind. That is deliberate. A monitoring layer that needs the pipeline to call it is a monitoring layer that stops being called.

The rules themselves are chosen by asking what a successful-looking run can hide. A `decks` run that touches every tournament and writes zero decks is the §6.2 failure exactly. A web pass that returns zero rows **twice** is a broken selector rather than a quiet Tuesday — once is normal, twice is a pattern, and that distinction is why the rule carries a memory. Unresolved decklist lines above 0.1 % mean a set alias is missing or a new set landed without its mapping; [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)'s own acceptance asks for `resolved / cards ≥ 99.9 %`, so the threshold is that acceptance restated as a running check. A price snapshot that missed a day means the card page's sparkline has a hole and the deck price is stale, and because [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md) makes the snapshot idempotent per date, the gap is detectable by date arithmetic alone.

Two design choices keep this honest. **An alert is a row, not a log line**: it has a first-seen time, a last-seen time and a status, so "this has been broken for six days" is answerable and an acknowledged alert stops shouting without being forgotten. And **the badge is the delivery mechanism, the webhook is optional**: `ALERT_WEBHOOK_URL` is empty by default, everything works without it, and an unreachable webhook never fails an ETL run — a monitoring system that can break the thing it monitors is worse than no monitoring at all.

This subtask also settles three questions earlier files deferred to it. [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md) asked whether `price_history` needs a retention policy once real growth is measured; [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) asked whether the unresolved report should become a table; [S01.T07](../01-foundation/T07-api-skeleton-and-health.md) said that anything richer than `/health` belongs to an `/api/status` owned here. The answers are below: no retention, the report stays a file, and `/api/status` exists.

## Scope

- **In scope.** `packages/etl/src/alerts.ts` (the rule catalogue, `evaluateAlerts`, the open/ack/resolve transitions, the webhook sender); `packages/db/migrations/0009_ops.sql` (`etl_alerts` plus its row type and `TABLES` entry); `apps/api/src/routes/admin.ts` (`GET /api/admin/etl`, `GET /api/admin/alerts`, `POST /api/admin/alerts/:id/ack`, `POST /api/admin/etl/run`) and `GET /api/status`; the web route `/admin/etl` and the nav badge; the evaluation hooks at the end of every ETL run and at worker start; `docs/ops/ALERTS.md` with the rule catalogue and the tuning knobs; the three deferred answers above.
- **Out of scope.** Writing `etl_runs` rows ([S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)); the ETL steps themselves and their counters ([S02.T02](../02-card-data-and-search/T02-fetch-pokemon-tcg-data.md), [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md), [S02.T08](../02-card-data-and-search/T08-full-text-search.md), [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)); the schedule that starts them ([S08.T01](T01-scheduler.md)); `/health` itself, which stays exactly as [S01.T07](../01-foundation/T07-api-skeleton-and-health.md) contracted it; alerting on engine jobs, measurements or coverage, which are not ETL and have their own pages; a general metrics/time-series system — the counters live in `stats_json` and are charted from there; e-mail delivery beyond a webhook that a mail relay can accept.

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask. What it does carry is a **declared legacy limitation**, and its disposition is the point of the file:

**`ESPECIFICACAO.md` §6.2, second bullet — *"A raspagem do limitlesstcg.com quebra em silêncio se o HTML mudar."* — Closed here, not inherited.** The scraper can still break when the HTML changes; [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md) BR-S03.T03-02 makes it return empty results rather than throw, and [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) lets the API results commit regardless. What stops being silent is the **consequence**: an empty web pass is a counter in `etl_runs.stats_json`, a second consecutive empty pass raises `WEB_SCRAPER_EMPTY_TWICE`, and the badge turns red the same day. The other three §6.2 bullets are unrelated to this subtask and keep their dispositions elsewhere — price history starting at the first local snapshot is inherent to [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md); gallery sets belong to the id mapping of [S02.T04](../02-card-data-and-search/T04-set-and-card-id-mapping.md); the missing licence record is [S01.T09](../01-foundation/T09-licensing-and-notice.md)'s and open item O-1's.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S08.T02-01 | A run that "succeeded" while producing nothing raises an alert: an `etl_runs` row with `status='ok'` whose kind-specific yield counter is zero — `decks` with `decks = 0`, `prices` with `price_rows = 0`, `delta` with `sets_changed > 0` and `cards = 0`, `fts` with `fts_rows = 0` — is `EMPTY_YIELD`, severity `error`. This is the §6.2 failure mode generalised to every source. | `RULES.EMPTY_YIELD` in `alerts.ts`, evaluated over the row just closed | `alerts.spec.ts > a decks run with decks = 0 raises EMPTY_YIELD`; `> a healthy run of each kind raises nothing` |
| BR-S08.T02-02 | An alert is raised **once** per `(rule, key)` while it stays open: a repeat observation updates `last_seen_at`, `run_id` and `detail_json` and never inserts a second row or re-sends the webhook before `ALERT_MIN_INTERVAL_MINUTES` (default 720). | `upsertAlert()` with `ON CONFLICT (rule, key) WHERE status <> 'resolved' DO UPDATE`; the webhook is sent only on insert or after the interval | `alerts.spec.ts > three consecutive failing runs leave one open alert with last_seen_at advanced`; `> the webhook is sent once` |
| BR-S08.T02-03 | An alert resolves itself: the first healthy observation of the same `(rule, key)` sets `status='resolved'` and `resolved_at`, and the row is kept. Nothing is deleted, so "this broke for six days in September" stays answerable. | `resolveAlert()` called by the same evaluation pass that found the condition absent; no `DELETE` exists in `alerts.ts` | `alerts.spec.ts > a healthy run resolves the open alert and keeps the row`; `grep` shows no `DELETE FROM etl_alerts` |
| BR-S08.T02-04 | Alert evaluation never fails an ETL run: it is called after `finishRun` has already closed the row, inside its own `try`/`catch`, and an exception is logged at `warn` and counted, leaving the run's status untouched. | the evaluation hook sits outside `withRun`'s transaction and outside its error path | `alerts.spec.ts > a throwing rule leaves the etl_runs row ok and the process alive`; `> the exit code still matches etl_runs.status` |
| BR-S08.T02-05 | The webhook is optional and non-blocking: with `ALERT_WEBHOOK_URL` unset nothing is sent and no code path is skipped; when set, the POST has a 5 s timeout, is not retried, and a failure is logged and counted in `etl_alerts.detail_json.delivery` rather than raised. | `sendWebhook()` guarded by the config; `AbortSignal.timeout(5000)`; the call is awaited but its rejection is swallowed | `alerts.spec.ts > with no webhook configured the full suite passes and nothing is sent`; `> an unreachable webhook records a delivery failure and raises nothing` |
| BR-S08.T02-06 | Freshness alerts are computed from dates, not from the presence of a run: `PRICES_SNAPSHOT_GAP` fires when the newest `price_history.snapshot_date` is more than `ALERT_PRICES_MAX_AGE_HOURS` (default 30) old, and `STALE_KIND` fires when the last `ok` run of a scheduled kind is older than its period plus the grace — so a scheduler that never fired is as visible as one whose task failed. | `RULES.PRICES_SNAPSHOT_GAP` reads `MAX(snapshot_date)`; `RULES.STALE_KIND` reads `lastRunPerKind(db)` and the job periods of [S08.T01](T01-scheduler.md) | `alerts.spec.ts > a 36-hour-old snapshot raises PRICES_SNAPSHOT_GAP`; `> a worker that never ran the decks task raises STALE_KIND` |
| BR-S08.T02-07 | The unresolved-lines rule is the running form of [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)'s acceptance: `UNRESOLVED_LINES` fires when `(cards − resolved) / cards > ALERT_UNRESOLVED_PCT` (default 0.001) on a `decks` run with `cards > 0`, and its `detail_json` carries the top five unresolved tuples read from `reports/decks_unresolved.csv`. | `RULES.UNRESOLVED_LINES`; the CSV is read best-effort and its absence is not itself an alert | `alerts.spec.ts > 0.2 % unresolved raises the alert with the top tuples`; `> 0.05 % does not`; `> a missing CSV still raises with an empty tuple list` |
| BR-S08.T02-08 | `/admin/etl` and `/api/admin/*` are read-mostly: the only writes they perform are acknowledging an alert and enqueuing a manual ETL run through the same `tryStartBackgroundSync` / `startRun` path the CLI and the scheduler use. They never write `etl_runs` directly and never touch a baseline table. | the route module imports `alerts.ts` and the etl entry points only; the eslint table-ownership rule | `pnpm lint` fails on a fixture writing `etl_runs` from `apps/api`; `routes.spec.ts > GET /api/admin/etl performs no writes` |
| BR-S08.T02-09 | Every rule declares its severity, its key and its remedy, and the catalogue is the single source for the page, the webhook payload and `docs/ops/ALERTS.md`; a rule without a one-line remedy does not compile. | the `AlertRule` type requires `remedy: string`; `docs/ops/ALERTS.md` is generated from the catalogue in `pnpm check` | `alerts.spec.ts > every rule has a severity, a key function and a remedy`; `pnpm check` fails when `ALERTS.md` drifts from the catalogue |
| BR-S08.T02-10 | `/health` is unchanged: it keeps the exact response [S01.T07](../01-foundation/T07-api-skeleton-and-health.md) contracted and its 100 ms budget. Everything richer — alerts, cache ages, table growth — is `GET /api/status`, which has no budget and may be slow. | two separate route files; `system.ts` is not edited by this subtask | `health.spec.ts` still passes unmodified; `status.spec.ts > returns alerts, run ages and table counts` |

## Data operations

**CRUD.** The **worker** evaluates and writes alerts; the api reads them and acknowledges them. Nothing here writes a baseline table.

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `etl_runs` | R | worker | after every run closes, and once at worker start | read-only; the last `ALERT_HISTORY_ROWS` (default 20) rows per kind via `etl_runs_kind_started_idx` | the only input the rules need |
| `etl_runs` | R | api | `/api/admin/etl`, `/api/status`, the nav badge | read-only; `lastRunPerKind(db)` plus a bounded history | never written from the api (BR-S08.T02-08) |
| `etl_runs` | C/U/D | worker (this module) | never | `withRun` owns the row ([S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)) | evaluation runs strictly after the row is closed (BR-S08.T02-04) |
| `etl_alerts` | C | worker | when a rule matches and no open row exists for `(rule, key)` | insert-only for a new condition; `first_seen_at = last_seen_at = now` | one row per distinct condition (BR-S08.T02-02) |
| `etl_alerts` | U (`last_seen_at`, `run_id`, `detail_json`) | worker | when a rule matches and an open row exists | single-statement update; no read-modify-write; the webhook is not re-sent inside `ALERT_MIN_INTERVAL_MINUTES` | "still broken" without a second row |
| `etl_alerts` | U (`status='resolved'`, `resolved_at`) | worker | when the same evaluation finds the condition absent | only from `open` or `acked`; a resolved row is never reopened — a recurrence inserts a new row | keeps the history (BR-S08.T02-03) |
| `etl_alerts` | U (`status='acked'`, `acked_at`) | api (`POST /api/admin/alerts/:id/ack`) | the user dismisses an alert | only from `open`; acknowledging does not resolve, so a still-broken condition stays visible on the page in a muted state | the one api write |
| `etl_alerts` | R | api, worker | the badge, the page, `/api/status`, and the "already open?" check | read-only; `etl_alerts_open_idx` serves both | — |
| `etl_alerts` | D | — | never | history is the point; growth is a handful of rows per year | no retention (BR-S08.T02-03) |
| `price_history` | R | worker | `PRICES_SNAPSHOT_GAP` | `SELECT MAX(snapshot_date)` — one indexed read, no aggregate over the table | BR-S08.T02-06 |
| `cards`, `cards_fts`, `decks`, `tournaments` | R (count) | api | `/api/status` growth panel | `COUNT(*)` per table, cached 60 s in the api process | slow by design; `/health` stays fast (BR-S08.T02-10) |
| `$RAW_CACHE_DIR/reports/decks_unresolved.csv` | R | worker | `UNRESOLVED_LINES` | best-effort; the top five rows; absence is not an alert | stays a file (see Risks) |
| any baseline or job table | C/U/D | this module | never | Architecture principle 2 | the module writes `etl_alerts` and nothing else |

**Endpoints.**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/admin/etl` | `?kind=&limit=20` | `{ kinds: [{ kind, last: { id, status, startedAt, finishedAt, durationMs, stats, error } \| null, history: [...], nextFireAt \| null }], counters: { … } }` | `503 database_unavailable` |
| GET | `/api/admin/alerts` | `?status=open,acked&limit=100` | `{ items: [{ id, rule, key, severity, status, firstSeenAt, lastSeenAt, ackedAt, resolvedAt, runId, detail, title, remedy }], openCount, errorCount }` | `503 database_unavailable` |
| POST | `/api/admin/alerts/:id/ack` | — | `{ id, status: "acked", ackedAt }` | `404 not_found`; `409 conflict` when the alert is already resolved |
| POST | `/api/admin/etl/run` | `{ kind: "prices" \| "delta" \| "decks" \| "fts" }` | `{ started: boolean, reason?: "running" \| "cooldown", runId? }` | `409 conflict` when a run of that kind is live; `422 unprocessable` on an unknown kind |
| GET | `/api/status` | — | `{ ok, schemaVersion, sqliteVersion, databasePath, databaseBytes, alerts: { open, error, warn }, kinds: [{ kind, lastOkAt, lastStatus, ageHours }], cache: { rawCacheBytes, ptcgFetchedAt, tcgdexOldestCardAt }, counts: { sets, cards, cardsFts, tournaments, decks, deckCards, priceHistory, etlRuns } }` | `503 database_unavailable` |
| GET | `/health` | — | **unchanged** from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md) | unchanged (BR-S08.T02-10) |

**Web route** `/admin/etl` — one page, four panels, pt-BR through the strings module (D-006): the alert list at the top (severity chip, title, "desde <first_seen>", remedy, "Ignorar"); the per-kind table (last status, duration, the kind's headline counters, next scheduled fire from [S08.T01](T01-scheduler.md)); a sparkline per kind over the last twenty runs; and the growth panel from `/api/status`. The header nav badge is a count of `open` alerts with `severity='error'`, red when non-zero, linking here.

## Interfaces

**`packages/db/migrations/0009_ops.sql`**

```sql
-- 0009_ops.sql — operational alerts derived from etl_runs.
-- Owner: S08.T02. Written only by apps/worker; acknowledged by apps/api. Insert-and-update, never deleted.
-- Postgres: detail_json TEXT -> jsonb; the partial unique index is supported as written.

CREATE TABLE etl_alerts (
    id            INTEGER PRIMARY KEY,
    rule          TEXT    NOT NULL,           -- catalogue id, e.g. 'EMPTY_YIELD'
    key           TEXT    NOT NULL,           -- what the rule is about, e.g. 'decks' or 'prices:2026-09-21'
    severity      TEXT    NOT NULL,           -- 'error' | 'warn'
    status        TEXT    NOT NULL,           -- 'open' | 'acked' | 'resolved'
    first_seen_at TEXT    NOT NULL,           -- 'YYYY-MM-DDTHH:MM:SSZ'
    last_seen_at  TEXT    NOT NULL,
    acked_at      TEXT,
    resolved_at   TEXT,
    run_id        INTEGER REFERENCES etl_runs(id) ON DELETE SET NULL,
    detail_json   TEXT    NOT NULL DEFAULT '{}',
    CHECK (severity IN ('error','warn')),
    CHECK (status   IN ('open','acked','resolved')),
    CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
    CHECK (acked_at IS NULL OR acked_at >= first_seen_at),
    CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX etl_alerts_open_key_idx ON etl_alerts (rule, key) WHERE status <> 'resolved';
CREATE INDEX        etl_alerts_open_idx     ON etl_alerts (status, severity, last_seen_at DESC);
CREATE INDEX        etl_alerts_rule_idx     ON etl_alerts (rule, first_seen_at DESC);
```

The partial unique index is what makes BR-S08.T02-02 a database guarantee rather than a convention: a second open row for the same condition cannot be inserted. `run_id` is `ON DELETE SET NULL` because `etl_runs` rows are never deleted today (`ETL_RUNS_RETENTION_DAYS` defaults to `0`, [S08.T01](T01-scheduler.md)) but the alert must survive if that ever changes.

**The rule catalogue** (`packages/etl/src/alerts.ts`). Each rule is a pure function of the recent rows of one kind plus, for two of them, one indexed read.

| id | Severity | Fires when | Key | Remedy |
|---|---|---|---|---|
| `RUN_FAILED` | `error` | the closed run has `status='error'` | `<kind>` | read `etl_runs.error`, reproduce with the same `pnpm etl <kind>` command |
| `EMPTY_YIELD` | `error` | `status='ok'` and the kind's yield counter is 0: `decks.decks`, `prices.price_rows`, `fts.fts_rows`, or `delta.cards` with `sets_changed > 0` (BR-S08.T02-01) | `<kind>` | a source changed shape; check the raw cache and the fetcher's fixtures |
| `WEB_SCRAPER_EMPTY_TWICE` | `error` | the last **two** `decks` runs with `stats.web = true` both have `stats.web_rows = 0` | `decks-web` | the §6.2 failure: the Limitless listing HTML changed; update the selectors in [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md) and its fixtures |
| `UNRESOLVED_LINES` | `warn` | `(cards − resolved) / cards > ALERT_UNRESOLVED_PCT` on a `decks` run with `cards > 0` (BR-S08.T02-07) | `decks` | a set alias or a new set is missing; see `reports/decks_unresolved.csv` and [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md)'s overrides |
| `PRICES_SNAPSHOT_GAP` | `error` | `MAX(price_history.snapshot_date)` is more than `ALERT_PRICES_MAX_AGE_HOURS` old (BR-S08.T02-06) | `prices` | run `pnpm etl prices`; check whether the 06:00 task fired ([S08.T01](T01-scheduler.md)) |
| `STALE_KIND` | `warn` | the last `ok` run of a scheduled kind is older than its period plus `SCHEDULER_MISFIRE_GRACE_S` | `<kind>` | the scheduler is off or the worker is not running; check `SCHEDULER_ENABLED` |
| `RUN_STUCK` | `warn` | an `etl_runs` row has been `running` for more than `STALE_RUN_MINUTES` (240) | `<kind>` | a process was killed; the next CLI start reconciles it to `cancelled` |
| `UNKNOWN_PRICE_VARIANTS` | `warn` | `stats.unknown_price_variants > 0` on a `prices` run | `prices` | a new TCGplayer finish appeared; review `reports/price_unknown_variants.csv` and extend the allow-list ([S02.T07](../02-card-data-and-search/T07-prices-snapshot.md) BR-S02.T07-02) |
| `FTS_OUT_OF_SYNC` | `warn` | `COUNT(cards_fts) <> COUNT(cards)` (`ftsRowCountMatches(db)` is false) | `fts` | run `pnpm etl fts`; it takes seconds ([S02.T08](../02-card-data-and-search/T08-full-text-search.md) BR-S02.T08-01) |
| `BACKUP_FAILED` | `error` | the last `backup` run has `status='error'` | `backup` | `pnpm db:backup` failed verification and pruned nothing; check disk space and the target path ([S01.T02](../01-foundation/T02-sqlite-database-client.md) BR-S01.T02-07) |
| `MISSING_CARD_FILES` | `warn` | `stats.missing_card_files > 0` on a `full`/`delta` run | `ptcg` | usually a freshly announced set with no card file yet; harmless unless it persists for weeks |

```ts
export type AlertSeverity = "error" | "warn";
export type AlertStatus   = "open" | "acked" | "resolved";

export interface AlertContext {
  db: Db; now: Date;
  kind: EtlRunKind;
  run: EtlRunRow | null;                 // the row just closed, or null at worker start
  history: EtlRunRow[];                  // newest first, up to ALERT_HISTORY_ROWS
  stats: Record<string, number | string>;
}
export interface AlertRule {
  id: string;
  severity: AlertSeverity;
  title: string;                         // one line, English (D-006: the API is English, the UI translates)
  remedy: string;                        // required (BR-S08.T02-09)
  appliesTo: readonly EtlRunKind[] | "any";
  key(ctx: AlertContext): string;
  evaluate(ctx: AlertContext): { firing: boolean; detail?: Record<string, unknown> };
}
export const RULES: readonly AlertRule[];

export function evaluateAlerts(db: Db, now?: Date, only?: EtlRunKind): {
  raised: number; updated: number; resolved: number; delivered: number; errors: number;
};
export function openAlerts(db: Db): EtlAlertRow[];
export function ackAlert(db: Db, id: number): EtlAlertRow;
export async function sendWebhook(url: string, payload: AlertPayload): Promise<boolean>;
export const ALERT_HISTORY_ROWS = 20;
```

**Evaluation points.** Two, and only two. The CLI calls `evaluateAlerts(db, new Date(), kind)` immediately after `withRun` closes the row — outside its transaction and outside its error path, so a throwing rule cannot change the run's outcome (BR-S08.T02-04). The worker calls `evaluateAlerts(db)` with no `only` filter at start, after `reconcileStaleRuns`, which is what catches the conditions no run can observe: a scheduler that never fired, a price gap, a stuck row, a desynchronised FTS index. There is no timer; a condition that needs continuous polling does not belong in this catalogue.

**Webhook payload** — one POST, `content-type: application/json`, no authentication header (the URL is the secret, as webhook URLs are), 5 s timeout, no retry:

```json
{ "source": "pokesearch2", "event": "alert.raised",
  "alert": { "id": 41, "rule": "WEB_SCRAPER_EMPTY_TWICE", "key": "decks-web",
             "severity": "error", "title": "Limitless web pass returned no rows twice",
             "remedy": "The listing HTML changed; update the selectors and fixtures",
             "firstSeenAt": "2026-09-22T10:04:11Z", "lastSeenAt": "2026-09-23T10:03:58Z",
             "detail": { "runs": [412, 407], "webRows": [0, 0] } },
  "status": { "openErrors": 1, "openWarnings": 2 } }
```

`event` is `alert.raised` on insert and `alert.resolved` on resolution; nothing is sent for an update inside `ALERT_MIN_INTERVAL_MINUTES`. A mail relay that accepts a JSON POST is the supported "e-mail" path; no SMTP client is added.

**Environment.**

| Variable | Default | Effect |
|---|---|---|
| `ALERT_WEBHOOK_URL` | — (unset) | when set, alerts are POSTed there; unset means badge-only and nothing is skipped (BR-S08.T02-05) |
| `ALERT_MIN_INTERVAL_MINUTES` | `720` | minimum gap between two deliveries for the same open alert |
| `ALERT_WEBHOOK_TIMEOUT_MS` | `5000` | abort budget for the POST; no retry |
| `ALERT_UNRESOLVED_PCT` | `0.001` | the 0.1 % threshold, the running form of [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)'s `≥ 99.9 %` acceptance |
| `ALERT_PRICES_MAX_AGE_HOURS` | `30` | 24 h plus a six-hour tolerance around the 06:00 task |
| `ALERT_HISTORY_ROWS` | `20` | how many rows per kind a rule may look at |
| `ALERTS_ENABLED` | `1` | `0` evaluates nothing; for a developer running the ETL against a fixture database |

## Implementation steps

1. Write `0009_ops.sql` with `etl_alerts`, its five `CHECK`s and its three indexes; add `EtlAlertRow` and its `TABLES` entry; run the drift test ([S01.T04](../01-foundation/T04-database-migration-framework.md) BR-S01.T04-09).
2. Write the `AlertRule` type, the `AlertContext` builder over `lastRunPerKind` plus a bounded per-kind history, and the empty catalogue; spec that every registered rule has a severity, a key function and a remedy (BR-S08.T02-09).
3. Implement the alert lifecycle — `upsertAlert` against the partial unique index, `resolveAlert`, `ackAlert` — and spec the three-failing-runs case and the resolution case (BR-S08.T02-02, -03).
4. Implement the four rules the objective names: `EMPTY_YIELD`, `WEB_SCRAPER_EMPTY_TWICE`, `UNRESOLVED_LINES`, `PRICES_SNAPSHOT_GAP`, each with a fixture that fires it and a fixture that does not (BR-S08.T02-01, -06, -07).
5. Implement the remaining seven rules with the same pair of fixtures each.
6. Add the two evaluation hooks — after `withRun` in the CLI, and at worker start after `reconcileStaleRuns` — with the isolating `try`/`catch`; spec that a throwing rule leaves the run `ok` (BR-S08.T02-04).
7. Implement `sendWebhook` with its timeout, the no-retry rule, the delivery record and the `ALERT_MIN_INTERVAL_MINUTES` gate; spec both the unset and the unreachable cases (BR-S08.T02-05).
8. Add `apps/api/src/routes/admin.ts` with the four routes, their response schemas and the error envelope; spec that `GET` performs no writes (BR-S08.T02-08).
9. Add `GET /api/status` in its own route file, leaving `system.ts` untouched, with the 60 s count cache; spec that `/health` is byte-identical to before (BR-S08.T02-10).
10. Build the `/admin/etl` page and the nav badge in `apps/web`, with pt-BR strings and the four panels.
11. Generate `docs/ops/ALERTS.md` from the catalogue and add the drift check to `pnpm check` (BR-S08.T02-09).
12. Run the real pipeline once, break one source on purpose (rename a selector in a local fixture, or move the clock forward past the price window), confirm the badge turns red and the alert resolves on the next healthy run, and record the result in the completion note.

## Edge cases and error handling

- **A scraped page returns zero rows twice.** This is the §6.2 case and the rule that carries a memory. One empty web pass is ordinary — there may genuinely be no new official event — so it raises nothing and is merely a `stats.web_rows = 0` counter. The **second consecutive** empty pass raises `WEB_SCRAPER_EMPTY_TWICE` at `error`, with both run ids in `detail_json` so the two are findable, and the remedy names the selectors and fixtures in [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md). A third empty pass updates `last_seen_at` and does not insert again; the first non-empty pass resolves it and the row stays as history (BR-S08.T02-02, -03).
- **A run succeeds and writes nothing.** `EMPTY_YIELD` looks at the yield counter the kind is supposed to move, not at the status, because the whole failure mode being closed here is "status ok, result empty". The counters are the agreed names [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) fixed, so the rule needs no knowledge of any fetcher. A `delta` run that legitimately changed nothing — `sets_changed = 0`, the common weekday case — does **not** fire, which is why the `delta` clause is conditioned on `sets_changed > 0`.
- **The scheduler never fired at all.** No run means no evaluation hook, so a rule attached to a run cannot notice. `STALE_KIND` and `PRICES_SNAPSHOT_GAP` are evaluated at worker start instead, from the clock and from `MAX(snapshot_date)`; a worker that is itself not running is outside what the system can observe about itself, and the page's "last seen" timestamps are what a person reads in that case.
- **The webhook URL is wrong or the endpoint is down.** The POST aborts at 5 s, `detail_json.delivery` records `{ ok: false, at, error }`, the alert stays open, and the ETL run is unaffected. There is no retry and no queue: a monitoring channel that accumulates a backlog will deliver the six-day-old news of a problem that has since resolved (BR-S08.T02-05).
- **Two processes evaluate at the same moment** — the CLI finishing a manual `etl decks` while the worker starts. The partial unique index makes the second insert fail; `upsertAlert` catches exactly that constraint violation and converts it into the update path, so the outcome is one row either way.
- **An alert is acknowledged and the condition persists.** `acked` keeps the row visible on the page in a muted state and drops it out of the red badge count, but `last_seen_at` keeps advancing, so "acknowledged eleven days ago, still firing" is legible. Acknowledging is not resolving; only a healthy observation resolves (BR-S08.T02-03).
- **The same condition recurs after resolution.** A resolved row is never reopened — the partial unique index only covers `status <> 'resolved'` — so a recurrence inserts a **new** row with its own `first_seen_at`. That is what makes "this has broken three times this month" countable, which a reopened row would erase.
- **`reports/decks_unresolved.csv` is missing or unreadable.** `UNRESOLVED_LINES` still fires on the counters, with an empty tuple list and a note in `detail_json`. The CSV is a convenience for the remedy, not the evidence; making the alert depend on a file would reintroduce a silent failure through the back door (BR-S08.T02-07).
- **`stats_json` lacks a counter a rule expects** — an older row written before a fetcher added its counter. The rule reads it as `undefined` and reports `firing: false` rather than treating a missing value as zero, because "the counter was never written" and "the counter was zero" are different facts and only the second is a failure.
- **`/api/status` is slow on a large database.** It counts `deck_cards` (≈1M rows) and `price_history` (≈3.6M rows a year), which is seconds, not milliseconds. That is accepted: the counts are cached 60 s in the api process, the page shows the cache age, and `/health` keeps its 100 ms budget untouched (BR-S08.T02-10).
- **A rule throws on a malformed `stats_json`.** The evaluation pass catches per rule, counts the failure, logs the rule id at `warn` and continues with the others; one broken rule does not silence the catalogue, and it does not touch the run's status (BR-S08.T02-04).
- **The database is locked while an alert is being written.** The upsert is a single short statement and waits `busy_timeout`; on `SQLITE_BUSY` the evaluation gives up for that rule and logs it. The condition will be observed again on the next run or at the next worker start, and losing one evaluation of a persistent condition costs nothing.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/etl test alerts.spec.ts` green: every rule has one fixture that fires it and one that does not, and a full set of healthy fixture runs across all kinds raises **zero** alerts (BR-S08.T02-01, -09).
- [ ] `> a decks run with decks = 0 raises EMPTY_YIELD` and `> a delta run with sets_changed = 0 and cards = 0 raises nothing` (BR-S08.T02-01).
- [ ] `> one empty web pass raises nothing; two consecutive empty web passes raise WEB_SCRAPER_EMPTY_TWICE` with both run ids in `detail_json`, and `> the next non-empty pass resolves it and the row is still present` (BR-S08.T02-03).
- [ ] `> 0.2 % unresolved raises UNRESOLVED_LINES with the top five tuples` and `> 0.05 % does not`; with the CSV deleted the alert still fires with an empty tuple list (BR-S08.T02-07).
- [ ] `> a 36-hour-old newest snapshot_date raises PRICES_SNAPSHOT_GAP` and `> a 20-hour-old one does not`, both against an injected clock (BR-S08.T02-06).
- [ ] `> three consecutive failing runs leave exactly one open alert` with `last_seen_at` advanced and one webhook delivery; `SELECT COUNT(*) FROM etl_alerts WHERE rule = ? AND status <> 'resolved'` is 1 (BR-S08.T02-02).
- [ ] `> with ALERT_WEBHOOK_URL unset the whole suite passes and nothing is sent`, and `> an unreachable webhook records a delivery failure, leaves the alert open and raises nothing` (BR-S08.T02-05).
- [ ] `> a throwing rule leaves the etl_runs row ok`: an injected failure in one rule leaves `status='ok'`, the CLI exit code 0, and the other rules evaluated (BR-S08.T02-04).
- [ ] `curl :8000/api/admin/etl` lists every kind with its last run, duration and headline counters; `curl -X POST :8000/api/admin/alerts/<id>/ack` returns `status: "acked"` and a second call returns 409 once the alert has resolved (BR-S08.T02-08).
- [ ] `health.spec.ts` passes **unmodified** and `apps/api/src/routes/system.ts` is untouched by this subtask's diff; `status.spec.ts > returns alerts, run ages and table counts` passes (BR-S08.T02-10).
- [ ] `pnpm lint` fails on a fixture writing `etl_runs` from `apps/api`, and `routes.spec.ts > GET /api/admin/etl performs no writes` passes (BR-S08.T02-08).
- [ ] End to end on the real database: break one Limitless selector in a local fixture, run `pnpm etl decks --web` twice, and the nav badge shows one red alert whose remedy names the selectors; restore the fixture, run once more, and the alert resolves while the row remains.

## Risks and open questions

- **Risk — alert fatigue.** Eleven rules on a pipeline that runs five times a day can produce noise, and a badge that is always red is a badge nobody reads. Mitigation: only five rules are `error`; `warn` rules never enter the badge count; every alert carries a remedy so it is actionable; and the completion note records how many alerts the first real week produced, which is the number that says whether a threshold is wrong.
- **Risk — a rule's threshold is wrong and hides a real failure.** `ALERT_UNRESOLVED_PCT = 0.001` comes from [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)'s acceptance, but a rotation week legitimately produces unresolved lines until the id mapping catches up. Mitigation: every threshold is an environment variable, and the page shows the measured value beside the threshold so tuning is a reading, not a guess.
- **Risk — the monitoring breaks the pipeline.** This is the failure this design is most careful about: evaluation runs after the row closes, in its own `try`/`catch`, with a five-second non-retried webhook. Mitigation: BR-S08.T02-04 and BR-S08.T02-05, each with a test that asserts the ETL outcome is unchanged.
- **Risk — `0009` collides with a migration number another S08 subtask claims.** Two other subtasks add a table in this stage: [S08.T05](T05-twinleaf-differential-oracle.md) and [S08.T06](T06-llm-assisted-authoring.md). Mitigation: the numbering across the stage is `0009_ops.sql` here, `0010_twinleaf.sql` there and `0011_authoring.sql` last; all three must be confirmed against `packages/db/migrations/` before the first one is applied, and `project/04-data-model-overview.md`'s table inventory currently stops at 0008 and needs all three rows added.
- **Answer to [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md)'s deferred question — `price_history` retention.** Recommendation: **no retention**. At ≈10k rows per day the table reaches ≈3.6M rows a year, which SQLite serves fine on the indexed `(card_id, snapshot_date)` path, and a sparkline with holes is worse than a larger file. What this subtask adds instead is the measurement: `/api/status` reports the row count and the database size, so the decision can be revisited with a number. The user decides if the file ever becomes inconvenient.
- **Answer to [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)'s deferred question — file or table for the unresolved report.** Recommendation: **keep the file**. The alert reads `etl_runs.stats.unresolvedKinds` for its condition and the CSV only for the top five tuples in its detail, so the report stays a report and no schema follows it. Confirmed here, as that file asked.
- **Question — should the badge poll, or only refresh on navigation?** Polling every 60 s makes a red badge appear without a reload but adds a request per minute per open tab. Recommendation: refresh on navigation plus a 60 s `staleTime` in TanStack Query, which is what the health badge already does ([S01.T08](../01-foundation/T08-web-skeleton.md)); revisit only if the user leaves the page open during syncs.
- **DEPENDENCY-PROPOSAL: S08.T02 should depend on S01.T04 because** it adds `packages/db/migrations/0009_ops.sql` and therefore needs the migration runner, the `NNNN_*.sql` convention and the `TABLES` drift test that [S01.T04](../01-foundation/T04-database-migration-framework.md) owns — the same edge every other migration-owning subtask has. Today it is reached only transitively through [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md).
- **DEPENDENCY-PROPOSAL: S08.T02 should depend on S01.T07 and S01.T08 because** it adds four API routes plus `GET /api/status` under [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)'s route conventions and error envelope, and a `/admin/etl` page plus a nav badge inside [S01.T08](../01-foundation/T08-web-skeleton.md)'s shell, strings module and query conventions. Neither edge exists in any header today.
- **DEPENDENCY-PROPOSAL: S08.T02 should depend on S02.T07 and S02.T08 because** `PRICES_SNAPSHOT_GAP` reads `MAX(price_history.snapshot_date)` and `UNKNOWN_PRICE_VARIANTS` reads a counter both defined by [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md), while `FTS_OUT_OF_SYNC` calls `ftsRowCountMatches(db)` from [S02.T08](../02-card-data-and-search/T08-full-text-search.md). Both are cited in prose here and neither is in the header.
- **Sizing — this file may be two subtasks.** Its prose runs past the ~2,400-word guidance in [Conventions](../../project/08-conventions.md) because it holds a detection engine and an operator surface: `alerts.ts` with its eleven-rule catalogue, `etl_alerts`, the two evaluation hooks and the webhook on one side; `/admin/etl`, the nav badge, `/api/status` and the four API routes on the other. A split would be "S08.T02 ETL alert rules" (steps 1–7, 11) and a new subtask "ETL monitoring page" (steps 8–10, 12) depending on it. Not applied here, because renumbering is not this pass's to do; proposed for the user's decision.

## References

- `pokemon/ESPECIFICACAO.md` §6.2 L317–322 — verified, four bullets: price history existing only from the first local snapshot plus the Feb/Mar 2025 seed; **"A raspagem do limitlesstcg.com quebra em silêncio se o HTML mudar."**; galleries being separate sets in one source and part of the main set in the other; and the unrecorded licences of `pokemon-tcg-data` and `pokemon_tcg_stockmarket` with no `LICENSE` file. The second bullet is the limitation this subtask closes.
- [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) — the `etl_runs` contract this reads: one row per invocation, `status ∈ running|ok|error|cancelled`, `stats_json` restricted to flat scalar counters, `lastRunPerKind(db)`, `STALE_RUN_MINUTES = 240`, and the agreed counter names (`sets`, `sets_changed`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `unmatched_sets`, `unmatched_cards`, `http_requests`, `http_304`, `cache_hits`, `price_rows`, `fts_rows`, `duration_ms`). Its Context states the reason this table exists: the legacy's single `etl_meta.last_load` string made a failed nightly run invisible.
- [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) — the `decks` run's `SyncStats` (`tournaments`, `skipped`, `decks`, `cards`, `resolved`, `requests`, `unresolvedKinds`), the note that `stats_json` is *"what [S08.T02] alerts on: a drop in `decks`, a rise in `cards − resolved`, or `requests` far above the expected count"*, the `reports/decks_unresolved.csv` format, the `resolved / cards ≥ 99.9 %` acceptance, and the edge case in which a changed listing HTML makes the web pass ingest nothing while the API results stay committed.
- [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md) — snapshot idempotency per date, the `unknown_price_variants` counter and `reports/price_unknown_variants.csv`, and the deferred retention question answered above. [S02.T08](../02-card-data-and-search/T08-full-text-search.md) — `ftsRowCountMatches(db)` and the "counts diverge" edge case it names as something `/health` and `etl status` should surface.
- [S01.T07](../01-foundation/T07-api-skeleton-and-health.md) — the error envelope, the route conventions, and the explicit statement that anything richer than `/health` belongs to a separate `/api/status` in this subtask. [S01.T08](../01-foundation/T08-web-skeleton.md) — the shell, the nav, the strings module and the `<QueryState>` wrapper the page uses.
- [S08.T01](T01-scheduler.md) — the job table whose periods `STALE_KIND` compares against, the `backup` run kind `BACKUP_FAILED` reads, and `SCHEDULER_MISFIRE_GRACE_S`.
- `pokemon/src/pokesearch/etl/decks.py` L273–286 — verified: the legacy `status(conn)` built from `meta` key/value rows (`decks_sync_status`, `decks_last_sync`, `decks_sync_started`, `decks_sync_error`, `decks_sync_stats`) with counts of tournaments, decks and archetypes. A last value, not a history — which is why this subtask reads `etl_runs` instead.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
