# S08.T02 — ETL monitoring and alerts

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 2 / 6 |
| Depends on | [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md), [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T03](T03-hosted-postgres-migration-path.md), [S08.T04](T04-wasm-replay-and-play.md), [S08.T05](T05-twinleaf-differential-oracle.md), [S08.T06](T06-llm-assisted-authoring.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `etl_runs` — from [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)
- `module` deck sync stats (`decks`, `unresolvedKinds`) — from [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)

## Outputs (proposed)
- `module` route `/admin/etl` — last run per kind, duration, stats, error; alert rules: 'decks sync returned 0 decks', 'web scraper returned 0 rows twice', 'unresolved lines > 0.1 %', 'prices snapshot missed a day'; alerts shown in the web nav badge and optionally sent by e-mail/webhook (`ALERT_WEBHOOK_URL`)

## Initial objective
Silent failures — the legacy scraper's documented failure mode — become visible the same day.

## Summary
- Alert evaluation runs after each ETL run and on worker start.

## Acceptance / verification
- [ ] Fixture runs trigger each alert rule exactly once; healthy runs trigger none.

## Notes for the elaboration pass
- Legacy limitation §6.2: 'scraping breaks silently if the HTML changes'.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
