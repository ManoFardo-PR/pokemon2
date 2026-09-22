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

## Outputs (proposed)
- `module` `packages/etl` CLI `etl <full|delta|prices|fts|decks|status> [--sets id,…] [--force] [--skip-tcgdex] [--web]` (commander), structured logging, exit codes — consumed by [S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md), [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)
- `file` cache layout under `RAW_CACHE_DIR`: `pokemon-tcg-data/` (+ `etags.json`), `tcgdex/{sets.json, sets/<id>.json, cards/<id>.json}`, `limitless/{tournaments/<id>/…, web/list_<id>.html}`, `reports/*.csv`
- `module` `etl/run-log.ts` — `startRun(kind)` / `finishRun(id, stats | error)` writing `etl_runs`; `etl status` prints the last run per kind — consumed by [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)

## Initial objective
One executable entry point for every ingestion job, with a predictable on-disk cache (so a full reload can run offline) and a database log of every run's statistics and errors.

## Summary
- Subcommands are thin: they call modules delivered by later subtasks (`fetchPtcg`, `fetchTcgdex`, `loadSet`, `snapshotPrices`, `rebuildFts`, `syncDecks`).
- Every run writes an `etl_runs` row at start (`status=running`) and at end (`done|error`, `stats_json`, `error`).
- Cache directory is created on demand; paths never inside the repo.
- Not in scope: scheduling ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)), any fetcher logic.

## Acceptance / verification
- [ ] `etl status` on an empty database prints 'no runs' and exits 0.
- [ ] Running an unknown subcommand exits 2 with usage.
- [ ] A failing fetcher leaves an `etl_runs` row with `status=error` and the message.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/run.py` (subcommands and order) and `config.py` (source URLs, `TCGDEX_CONCURRENCY=8`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
