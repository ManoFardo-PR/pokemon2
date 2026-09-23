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

## Outputs (proposed)
- `module` `apps/worker/src/scheduler.ts` — `node-cron` with TZ `America/Sao_Paulo`: prices 06:00 daily, `delta` Mondays 05:00, decks 07:00 daily; single-flight per job kind; `SCHEDULER_ENABLED` env; manual trigger endpoint reuse (`POST /api/meta/refresh`); notes for a hosted alternative (platform cron hitting an endpoint)

## Initial objective
Data stays fresh while the worker is running, with the same code paths as the manual CLI and no overlapping runs.

## Summary
- Misfire policy: run once on start if the last run of a kind is older than its period.

## Acceptance / verification
- [ ] Cron expressions unit-tested against fixed timestamps; a simulated overlapping trigger is skipped with a log line.

## Notes for the elaboration pass
- Legacy reference: `scheduler.py` (APScheduler, same times).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
