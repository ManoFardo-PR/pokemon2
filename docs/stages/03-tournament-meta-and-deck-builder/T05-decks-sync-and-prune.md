# S03.T05 — Deck synchronisation and pruning

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 5 / 13 |
| Depends on | [S03.T02](T02-limitless-api-client.md), [S03.T03](T03-limitless-web-scraper.md), [S03.T04](T04-deck-resolver.md) |
| Unblocks | [S03.T06](T06-meta-queries.md), [S03.T07](T07-api-meta-endpoints.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) |
| Parallel with | [S03.T09](T09-decklist-parser-and-exporter.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Limitless API client — from [S03.T02](T02-limitless-api-client.md)
- `module` web scraper — from [S03.T03](T03-limitless-web-scraper.md)
- `module` resolver — from [S03.T04](T04-deck-resolver.md)
- `table` `tournaments`, `archetypes`, `decks`, `deck_cards` (migration 0003) and `etl_runs` (migration 0001) — applied by `pnpm db:migrate` before any sync runs; reached transitively through the resolver's own dependency on the meta schema

## Outputs (proposed)
- `module` `etl/decks.ts` — `syncDecks(db, { format, days, minPlayers, maxTournaments, refreshRecentDays = 3, pruneDays = 180, web, force })`, `tryStartBackgroundSync()` (in-process lock + 10-minute minimum interval), `status(db)` — consumed by [S03.T06](T06-meta-queries.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)
- `table` `tournaments`, `archetypes`, `decks`, `deck_cards` populated; `etl_runs` rows of kind `decks` with stats `{ tournaments, skipped, decks, cards, resolved, requests, unresolvedKinds }`
- `file` `RAW_CACHE_DIR/reports/decks_unresolved.csv` (`set_code, number, name, category, occurrences`)
- `script` `pnpm etl decks [--web] [--skip-api] [--days N] [--min-players N] [--max-tournaments N] [--force] [--prune-days N] [--fetch-details]`

## Initial objective
One command keeps the meta window current: new tournaments are ingested with all decklists resolved, recent ones are refreshed, old ones pruned (RN-04), and the outcome is measurable in `etl_runs` and a report of unresolved lines.

## Context

This is the only writer of the meta domain. It reads the two sources ([S03.T02](T02-limitless-api-client.md), [S03.T03](T03-limitless-web-scraper.md)), resolves every line ([S03.T04](T04-deck-resolver.md)) and turns the result into the four tables of [S03.T01](T01-tournaments-schema-migration.md). Everything downstream — meta pages, opponent weights, the coverage denominator, the optimizer's pool — reads what this subtask wrote, so correctness and observability matter more than speed.

Three mechanisms make a daily sync cheap. **`complete`** marks a tournament that will not change again: one dated before `now − refreshRecentDays` (3 days) is complete and is skipped entirely on the next run unless `--force` is given. **Standings before details**: the standings document already reveals whether a tournament publishes decklists, so one without lists costs a single request, is stored with `has_decklists = 0, complete = 1`, and is never fetched again. **Per-tournament raw cache** in the client layer: a re-sync issues requests only for tournaments that are new or not yet complete. Under exactly these rules the legacy sync ended with 403 tournaments (400 API, 3 web), 38,471 decks and 982,557 decklist lines.

RN-04 adds the other end: tournaments older than 180 days are deleted, and the cascade of [S03.T01](T01-tournaments-schema-migration.md) takes their decks and lines with them. RN-03's 90-day window is deliberately smaller than the prune horizon, so a wider read is possible without keeping data forever.

Two differences from the legacy design. The run is recorded in `etl_runs` rather than in `meta` key/value rows, because [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) needs a history, not a last value. And background execution here is only an in-process lock with a minimum interval, enough for the "atualizar agora" button of [S03.T08](T08-web-meta-pages.md); real scheduling belongs to the worker ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)).

## Scope

- **In scope.** `packages/etl/src/decks.ts`: the sync orchestration (listing, per-tournament decision, ingestion, web pass, prune, report), the upsert functions for the four tables, deck id construction, the `complete` rule, delete-then-insert of `deck_cards`, archetype reuse for web lists, the `etl_runs` row, the unresolved CSV, `tryStartBackgroundSync`/`isRunning`/`status`, and the `etl decks` CLI command.
- **Out of scope.** Fetching and parsing ([S03.T02](T02-limitless-api-client.md), [S03.T03](T03-limitless-web-scraper.md)); line resolution ([S03.T04](T04-deck-resolver.md)); the schema ([S03.T01](T01-tournaments-schema-migration.md)); reads and derived numbers ([S03.T06](T06-meta-queries.md)); cron scheduling and alerting ([S08.T01](../08-operations-and-extensions/T01-scheduler.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)); the user's own decks ([S03.T11](T11-user-decks-schema-and-api.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-03 | **Kept.** Only tournaments of the configured format, dated within `days` (default 90), with `players ≥ minPlayers` (default 16), up to `maxTournaments` (default 400), are ingested. The sync passes the window to the client and stores nothing outside it. | `syncDecks` calls `listTournaments({ format, days, minPlayers, maxTournaments })` ([S03.T02](T02-limitless-api-client.md)) and the web pass filters rows by `date >= cutoff` | `decks-sync.spec.ts > window` — a fixture tournament with 12 players and one 100 days old produce no rows |
| RN-04 | **Kept.** After ingestion, tournaments dated before `now − pruneDays` (default 180) are deleted; their decks and deck cards go with them through the cascade. | `prune(db, pruneDays)`: one `DELETE FROM tournaments WHERE date < :cutoff` inside a transaction | `decks-sync.spec.ts > prune` — a 200-day-old tournament and its 2 decks and 40 lines disappear; a 179-day-old one survives |
| BR-S03.T05-01 | A tournament is `complete = 1` when its date is before `now − refreshRecentDays` (3 days) or when it publishes no decklists. A complete tournament is skipped on the next run (counted in `skipped`) unless `force` is set. | the `complete` computation and the `known[tid].complete && !force` guard in `syncDecks` | `decks-sync.spec.ts > second run touches only the incomplete tournament` — request counter rises by exactly the incomplete one's cost |
| BR-S03.T05-02 | A tournament whose standings contain no decklist is stored once with `has_decklists = 0, complete = 1` and zero decks, and is never fetched again. | the `standings.some(s => s.decklist)` branch, before any `details` request | `decks-sync.spec.ts > no decklists` — one tournament row, zero deck rows, `skipped` incremented |
| BR-S03.T05-03 | One tournament and all its decks are written in a single transaction; a failure anywhere in it leaves the database as if that tournament had not been seen. | `db.transaction()` around `ingestTournament` | `decks-sync.spec.ts > failed deck aborts its tournament` — an injected error on deck 2 leaves 0 tournaments and 0 decks |
| BR-S03.T05-04 | A deck's cards are replaced, never merged: `DELETE FROM deck_cards WHERE deck_id = ?` then a bulk insert, inside the tournament's transaction. Re-ingesting the same tournament is idempotent. | `upsertDeck()` | `decks-sync.spec.ts > ingest twice is idempotent` — 1 tournament, 2 decks, identical `deck_cards` count and `card_total` after a repeated ingest |
| BR-S03.T05-05 | Deck ids are `<tournament_id>:<player \| name \| standing index>` for API decks and `web:<list id>:<player \| placing>` for scraped decks; the same list always produces the same id. | `deckIdFor()` in `decks.ts` | `decks-sync.spec.ts > deck ids` — a standing without `player` falls back to `name`, then to its index |
| BR-S03.T05-06 | `decks.card_total` is the sum of `count` over the deck's lines and `resolved_count` the sum over lines with a `card_id`; both are recomputed on every ingest and never incremented in place. | `buildCardRows()` returns `(rows, total, resolved)`; `upsertDeck` writes them | `decks-sync.spec.ts > totals` — a fixture deck with one unresolved 2-copy line has `card_total = 20`, `resolved_count = 18` |
| BR-S03.T05-07 | Every run writes exactly one `etl_runs` row of kind `decks` with `started_at`, `finished_at`, `status ∈ ok\|error`, the stats object and, on failure, the error message truncated to 500 characters. The row is written even when the run throws. | a `finally` block in `syncDecks` | `decks-sync.spec.ts > etl_runs on success` and `> etl_runs on failure` |
| BR-S03.T05-08 | `tryStartBackgroundSync()` refuses to start when a sync is already running or when fewer than 600 s have passed since the last start, returning `{ started: false, reason }`; it never queues. | an in-process mutex plus `lastStartedAt` in `decks.ts` | `decks-sync.spec.ts > background lock` — second immediate call returns `started: false, reason: "running"`; a third after the mutex is released but within 600 s returns `reason: "cooldown"` |
| BR-S03.T05-09 | The unresolved report is rewritten on every run at `RAW_CACHE_DIR/reports/decks_unresolved.csv` with the header `set_code,number,name,category,occurrences`, rows sorted by descending occurrences; a run with nothing unresolved writes the header alone. | `writeUnresolvedReport(stats)` | `decks-sync.spec.ts > unresolved report` — the CSV's first data row is the most frequent unresolved tuple; an all-resolved run leaves a one-line file |
| BR-S03.T05-10 | Only this module writes `tournaments`, `archetypes`, `decks`, `deck_cards`; the web pass reuses an existing archetype whose lower-cased name matches, and otherwise inserts `web:<slug>` once. | `archetypeIdFor(db, name, icons)`; architecture principle 2 | `decks-sync.spec.ts > web archetype reuse` — a web list named "Dragapult Dusknoir" adopts the API archetype id, not a new `web:` slug |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `tournaments` | R | etl | start of run | `SELECT id, complete, has_decklists WHERE source='limitless_api'` — the skip decision | one query, not one per tournament |
| `tournaments` | C / U | etl | per ingested tournament | upsert on `id`; never `INSERT OR REPLACE` (it would cascade-delete the decks) | `fetched_at` always rewritten |
| `tournaments` | C / U | etl | tournament without decklists | `has_decklists = 0, complete = 1`; no decks follow (BR-S03.T05-02) | one row, one request |
| `tournaments` | D | etl | prune step | `DELETE … WHERE date < now − pruneDays`; cascades (RN-04) | one transaction; rowcount logged |
| `tournaments` | D | etl | end of the web pass | delete `source='limitless_web'` rows with no deck — division splits can empty one | legacy did the same in a `finally` |
| `archetypes` | C / U | etl | a standing carries a `deck` object | upsert on `id` with `name` and `icons_json` | Limitless slug as id |
| `archetypes` | C | etl | a web list's archetype name is unknown | insert-if-absent `web:<slug>` where slug = `norm(name)` with non-alphanumerics collapsed to `-` | reuse by lower-cased name first (BR-S03.T05-10) |
| `decks` | C / U | etl | per decklist | upsert on `id`; `card_total`/`resolved_count` recomputed (BR-S03.T05-06); `updated_at` rewritten | inside the tournament transaction |
| `deck_cards` | D then C | etl | per decklist | delete-then-insert per `deck_id`; `idx` 0-based in pokemon → trainer → energy order (BR-S03.T05-04) | lines with `count <= 0` are dropped before insert |
| `etl_runs` | C / U | etl | once per run | one row of kind `decks`, closed in a `finally` (BR-S03.T05-07) | history for [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) |
| `RAW_CACHE_DIR/reports/decks_unresolved.csv` | C (overwrite) | etl | end of run | full rewrite, sorted by occurrences (BR-S03.T05-09) | not a database object; a report |
| all four tables | R | api, worker | anytime | read-only; WAL lets them read during a sync | [S03.T06](T06-meta-queries.md) owns the queries |

## Interfaces

**`packages/etl/src/decks.ts`**

```ts
export interface SyncOptions {
  format?: string;             // default "STANDARD"
  days?: number;               // default 90          (RN-03)
  minPlayers?: number;         // default 16          (RN-03)
  maxTournaments?: number;     // default 400         (RN-03)
  refreshRecentDays?: number;  // default 3
  pruneDays?: number;          // default 180         (RN-04)
  web?: boolean;               // default false — also scrape official events
  skipApi?: boolean;           // default false — web only
  fetchDetails?: boolean;      // default false — request /details for organizer & platform
  force?: boolean;             // default false — re-fetch and re-ingest complete tournaments
  now?: Date;                  // injected in tests
}
export interface SyncStats {
  tournaments: number; skipped: number; decks: number; cards: number;
  resolved: number; requests: number; unresolvedKinds: number;
}
export function syncDecks(db: Db, opts?: SyncOptions): Promise<SyncStats>;

export function isRunning(): boolean;
export function tryStartBackgroundSync(opts?: SyncOptions & { ignoreInterval?: boolean }):
  { started: boolean; reason?: "running" | "cooldown" };
export const BACKGROUND_MIN_INTERVAL_MS = 600_000;   // 10 minutes

export interface SyncStatus {
  status: "never" | "running" | "done" | "error";
  lastSync: string | null; startedAt: string | null; error: string | null;
  stats: SyncStats | null;
  tournaments: number;   // COUNT(*) FROM tournaments WHERE has_decklists = 1
  decks: number; archetypes: number; newest: string | null;   // MAX(tournaments.date)
}
export function status(db: Db): SyncStatus;
```

**CLI.** `pnpm etl decks [options]` maps one-to-one onto `SyncOptions` in kebab-case (`--min-players`, `--max-tournaments`, `--refresh-recent-days`, `--prune-days`, `--fetch-details`, `--skip-api`, `--web`, `--force`, `--json`). Exit codes: 0 success, 1 the run threw (the `etl_runs` row carries the message), 2 bad arguments.

**Run order inside `syncDecks`.** (1) open the `etl_runs` row; (2) build the resolver ([S03.T04](T04-deck-resolver.md)) once; (3) read the known API tournaments; (4) unless `skipApi`, list the window and, per tournament, decide skip / no-decklists / ingest; (5) if `web`, run the scraping pass, reusing the same resolver and stats; (6) prune; (7) write the unresolved CSV; (8) close the `etl_runs` row. Steps 4–6 each commit independently, so a failure in the web pass keeps the API results.

**Per-tournament decision (step 4).**

```
tid = `api:${t.id}`
if (known[tid]?.complete && !force)        → skipped++, continue
useCache = !force && !(known[tid] && !known[tid].complete)
complete  = (t.date < now − refreshRecentDays) ? 1 : 0
standings = await api.standings(t.id, { useCache })            // standings before details
if (!standings?.some(s => s.decklist))     → upsert(has_decklists: 0, complete: 1), skipped++, continue
details   = fetchDetails ? await api.details(t.id, { useCache }) : null
ingestTournament(db, tid, t, details, standings, resolver, stats, complete)   // one transaction
```

**`etl_runs` row (kind `decks`).** `{ kind: "decks", started_at, finished_at, status: "ok" | "error", stats_json: SyncStats, error }`. `stats_json` is what [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) alerts on: a drop in `decks`, a rise in `cards − resolved`, or `requests` far above the expected count.

**Unresolved CSV.** `RAW_CACHE_DIR/reports/decks_unresolved.csv`, UTF-8, header `set_code,number,name,category,occurrences`, one row per distinct unresolved tuple, sorted by descending `occurrences`, then by `set_code`, `number` for stability.

## Implementation steps

1. Add `buildCardRows(deckId, decklist, resolver, stats)` returning `(rows, total, resolved)` and dropping lines with `count <= 0`; spec the totals and the `idx` ordering.
2. Add `upsertTournament`, `upsertArchetype`, `upsertDeck` with `ON CONFLICT (id) DO UPDATE` and the delete-then-insert of `deck_cards`.
3. Add `ingestTournament` wrapping the per-tournament work in one transaction (BR-S03.T05-03).
4. Add `syncDecks` step 4 (listing, skip decision, standings-first, `complete` computation) against the recorded API fixtures.
5. Add `prune` and its spec, including the 179-day / 200-day boundary pair.
6. Add the web pass: iterate event types and pages, map rows onto tournaments and decks, `archetypeIdFor` reuse, and the end-of-pass deletion of deckless web tournaments.
7. Add `writeUnresolvedReport` and the `etl_runs` bookkeeping in a `finally`.
8. Add `tryStartBackgroundSync` / `isRunning` / `status` and expose `status` to the API of [S03.T07](T07-api-meta-endpoints.md).
9. Wire `pnpm etl decks` with the full flag set and a `--json` output for scripting.
10. Run a real `--days 7` sync, then a second one, and record both `etl_runs` rows in the stage README notes as the first measurement of this machine.

## Edge cases and error handling

- **A tournament whose standings exist but whose `details` returns 404** → `details` is `null`; the tournament is stored from the summary alone with `organizer` and `platform` left `NULL`, and all its decks are ingested normally. Missing metadata never blocks decklists.
- **A tournament that publishes no decklists** → one row with `has_decklists = 0, complete = 1`, zero decks, `skipped++`. The next run sees `complete` and issues no request at all.
- **A tournament dated today** → `complete = 0`, so the next run re-fetches it with `useCache = false` and re-ingests it; late-published decklists are picked up without `--force`.
- **A standing with a decklist but no `player` and no `name`** → the deck id falls back to the standing index (`api:1234:7`); the deck is stored, and re-ingesting the same standings reproduces the same id.
- **A decklist line that resolves to nothing** → stored with `card_id NULL`, `match_kind 'none'` and the fallback image; it counts in `card_total` but not in `resolved_count`, and it appears in the CSV. The deck stays 60 cards.
- **`--web` when the listing HTML changed** → the parsers return empty results ([S03.T03](T03-limitless-web-scraper.md) BR-S03.T03-02), the web pass ingests nothing, the API results are already committed, and `etl_runs.stats.decks` shows the shortfall.
- **A web division split that leaves a tournament with no decks** (every list of `web:515` moved to `web:515-jr`) → the end-of-pass delete removes the empty tournament so the meta window has no phantom event.
- **The prune cutoff crosses a tournament currently being read by the API** → WAL gives the reader a consistent snapshot; the delete is one short transaction and the reader simply sees the pre-delete state.
- **A second sync started while one is running** (the web button plus the scheduler) → `tryStartBackgroundSync` returns `{ started: false, reason: "running" }`; the scheduler's own path logs and skips rather than queuing.
- **The process dies mid-run** → the `etl_runs` row stays open with `finished_at NULL`; the next run's `status()` reports the stale row, and because tournaments commit individually, the completed ones are already durable and will be skipped.
- **`RAW_CACHE_DIR/reports/` does not exist** → it is created before the CSV is written; a failure to write the report is logged but does not fail the run, since the data is already committed.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/etl test -t "decks-sync"` green.
- [ ] `decks-sync.spec.ts > end to end`: 2 API tournaments (one with decklists, one without) plus 1 web listing page produce exactly the expected rows — 3 tournaments, the deck counts of the fixtures, and `deck_cards` totals matching `card_total` (BR-S03.T05-02, -06).
- [ ] `decks-sync.spec.ts > second run touches only the incomplete tournament`: after the first run, a second run with the same fixtures leaves row counts unchanged, increments `skipped`, and issues requests only for the tournament dated within `refreshRecentDays` (BR-S03.T05-01).
- [ ] `decks-sync.spec.ts > ingest twice is idempotent`: ingesting the same tournament twice yields 1 tournament, 2 decks and an unchanged `deck_cards` count (BR-S03.T05-04).
- [ ] `decks-sync.spec.ts > prune`: a 200-day-old tournament and its decks and lines are gone, a 179-day-old one is intact (RN-04).
- [ ] `decks-sync.spec.ts > failed deck aborts its tournament`: an error injected on the second deck leaves that tournament absent while earlier tournaments remain (BR-S03.T05-03).
- [ ] `decks-sync.spec.ts > etl_runs`: a successful run writes one `ok` row with all seven stats fields; a throwing run writes one `error` row with a message ≤ 500 characters (BR-S03.T05-07).
- [ ] `decks-sync.spec.ts > background lock`: concurrent calls return `running`, and a call within 600 s of the last start returns `cooldown` (BR-S03.T05-08).
- [ ] `decks-sync.spec.ts > unresolved report`: the CSV has the documented header and descending occurrences; an all-resolved run leaves only the header (BR-S03.T05-09).
- [ ] Real run: `pnpm etl decks --web` populates ≈400 tournaments and tens of thousands of decks with `resolved / cards ≥ 99.9 %`, and `status(db).newest` is within a day of today (stage exit criterion; legacy reference 403 tournaments, 38,471 decks, 982,557 lines).

## Risks and open questions

- **Risk — a cold 90-day sync takes 10–20 minutes** (legacy measurement) and a user closes the terminal. Mitigation: per-tournament transactions plus the client's raw cache make a re-run resume nearly for free; the CLI prints `[i/N]` progress as the legacy did.
- **Risk — `complete` hides a late correction**: standings edited more than 3 days after the event are never re-read. Mitigation: `--force` exists and `refreshRecentDays` is an option; 3 days is a starting point, not a law.
- **Risk — one long transaction for a 1,000-deck tournament** exceeds the batch guidance of [S01.T02](../01-foundation/T02-sqlite-database-client.md) (≤ 2,000 rows per write). Mitigation: measure on the largest real tournament; if it hurts, commit per deck and accept partial tournaments, recording the change in the decision log.
- **Risk — the in-process lock does not protect against two processes** (the api's background sync and the worker's scheduler at once). Mitigation: [S08.T01](../08-operations-and-extensions/T01-scheduler.md) owns the cross-process guard; until then only one process is expected to call `tryStartBackgroundSync`. Stated here so it is not discovered as a bug.
- **Question — should `fetchDetails` default to true?** It costs one request per tournament and only fills `organizer`, `platform` and `is_online`. Recommendation: keep it off until [S03.T08](T08-web-meta-pages.md) decides whether those fields are shown.
- **Question — where does the unresolved CSV belong** once [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) exists — a file, or a table? Recommendation: keep the file (a report, not state) and let alerting read `etl_runs.stats.unresolvedKinds`.

## References

- `pokemon/src/pokesearch/etl/decks.py` — verified: `SyncStats` fields and `as_dict()`, `upsert_tournament`/`upsert_archetype`/`upsert_deck` with `ON CONFLICT(id) DO UPDATE` and `DELETE FROM deck_cards` before `executemany`, `build_card_rows` (category order, `count <= 0` dropped, unresolved tallied by `(code, number, name, category)`), `ingest_tournament` in one transaction with deck ids `f"{tid}:{player or name or index}"`, `prune()` as a single `DELETE … WHERE date < cutoff`, `write_unresolved_report` (header and descending sort), the `sync()` flow with `refresh_recent_days = 3`, `prune_days = 180`, standings-before-details, `use_cache` logic and the error path truncating the message to 500 characters, and `try_start_background_sync` with `MIN_INTERVAL_S = 600` plus `run_locked`/`status`.
- `pokemon/src/pokesearch/etl/limitless_web.py` L199–254 — verified: the web pass writes `source='limitless_web'`, `has_decklists=1`, `complete=1`, `is_online=0`, `platform='TCG'`, `organizer='Play! Pokémon (<type>)'`, deck ids `web:<list id>:<player|placing>`, archetype reuse by lower-cased name with a `web:<slug>` fallback, and the `finally` deletion of web tournaments without decks.
- `pokemon/tests/test_decks.py` L52–66 — verified: the idempotent double `ingest_tournament` (1 tournament, 2 decks), `card_total`/`resolved_count` of 20/18 for a deck with an unresolved 2-copy line, and the `match_kind` tally assertions.
- `pokemon/README.md` L96–106 — verified: the four documented CLI invocations (`decks`, `--web`, `--web --skip-api`, the tuned run), the "atualizar agora" button with its 10-minute minimum interval, the daily 07:00 scheduler, and the 10–20 minute cold load.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-03, RN-04; [Data model overview](../../project/04-data-model-overview.md) (migration 0003 ownership, `etl_runs`); [Architecture](../../project/03-architecture-overview.md) principle 2.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
