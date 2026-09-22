# S03.T05 — Deck synchronisation and pruning

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 5 / 13 |
| Depends on | [S03.T02](T02-limitless-api-client.md), [S03.T03](T03-limitless-web-scraper.md), [S03.T04](T04-deck-resolver.md) |
| Unblocks | [S03.T06](T06-meta-queries.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) |
| Parallel with | [S03.T09](T09-decklist-parser-and-exporter.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Limitless API client — from [S03.T02](T02-limitless-api-client.md)
- `module` web scraper — from [S03.T03](T03-limitless-web-scraper.md)
- `module` resolver — from [S03.T04](T04-deck-resolver.md)

## Outputs (proposed)
- `module` `etl/decks.ts` — `syncDecks(db, { format, days, minPlayers, maxTournaments, refreshRecentDays = 3, pruneDays = 180, web, force })`, `tryStartBackgroundSync()` (in-process lock + 10-minute minimum interval), `status(db)` — consumed by [S03.T06](T06-meta-queries.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)
- `table` `tournaments`, `archetypes`, `decks`, `deck_cards` populated; `etl_runs` rows of kind `decks` with stats `{ tournaments, skipped, decks, cards, resolved, requests, unresolvedKinds }`
- `file` `RAW_CACHE_DIR/reports/decks_unresolved.csv` (`set_code, number, name, category, occurrences`)

## Initial objective
One command keeps the meta window current: new tournaments are ingested with all decklists resolved, recent ones are refreshed, old ones pruned (RN-04), and the outcome is measurable in `etl_runs` and a report of unresolved lines.

## Summary
- Per tournament: skip if `complete` (unless `--force`); fetch standings first; if no decklists → store with `has_decklists = 0, complete = 1`; else ingest tournament + all decks in one transaction; `complete = date < now − refreshRecentDays`.
- Then the web sync (if `--web`), then `DELETE FROM tournaments WHERE date < now − pruneDays` (cascades), then the unresolved report.
- Deck rows carry `card_total`, `resolved_count`; `deck_cards` are delete-then-insert per deck.

## Acceptance / verification
- [ ] Fixture-driven end-to-end: 2 API tournaments + 1 web page → expected rows; second run touches only the non-complete tournament.
- [ ] Prune removes a tournament older than 180 days and its decks.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/decks.py` (286 lines). Background execution here is an in-process lock; the worker owns scheduling ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
