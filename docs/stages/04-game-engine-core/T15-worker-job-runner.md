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

## Outputs (proposed)
- `module` `apps/worker/src/{main,queue,engine-process,persist}.ts` — poll `jobs WHERE status='queued'` (one at a time), mark `running`, build the request (card defs for the union of decks, programs when S05 exists, pairings, options), spawn `ENGINE_BIN`, parse lines, update `jobs.progress_json` at most every 500 ms, upsert `job_pairings`, insert `games` when requested, finish with `done|error`; cancellation by `status='cancelled'` → SIGTERM; record `engine_build` from `--version` — consumed by [S04.T16](T16-api-jobs-and-sse.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md), [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md), [S07.T05](../07-deck-optimizer/T05-optimize-job-orchestration.md)
- `contract` job kinds handled now: `evaluate` (deck version vs opponents), `scenarios`, `replay`; later kinds register through the same dispatcher

## Initial objective
Long simulations run outside the API process, survive page reloads, report progress to the database and can be cancelled — with the engine never touching the database.

## Summary
- One worker process per machine (single writer for job tables); the API only inserts `queued` rows.
- Crash recovery: on start, `running` jobs without a live process are marked `error: worker restarted`.

## Acceptance / verification
- [ ] Queue an evaluate job for two fixture decks → rows filled, progress updates observed, `engine_build` recorded; cancel mid-run → `cancelled` within 2 s.

## Notes for the elaboration pass
- Legacy reference: `sim/jobs.py` (thread per run + process pool) and `sim/store.py`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
