# S07.T05 — Optimize job orchestration

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 5 / 7 |
| Depends on | [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S07.T02](T02-paired-seed-screening.md), [S07.T03](T03-sequential-confirmation.md), [S07.T04](T04-holdout-acceptance-and-versioning.md) |
| Unblocks | [S07.T06](T06-web-optimizer-page.md), [S07.T07](T07-coach-lost-game-review.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` worker dispatcher — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `module` screening — from [S07.T02](T02-paired-seed-screening.md)
- `module` confirmation — from [S07.T03](T03-sequential-confirmation.md)
- `module` acceptance/versioning — from [S07.T04](T04-holdout-acceptance-and-versioning.md)

## Outputs (proposed)
- `module` worker kind `optimize { deckVersionId, suiteId | opponents, maxIterations, k, bot, strongBot?, priceCap, fixed }` — loop: propose → screen → confirm → accept → next iteration from the accepted list; cancellation between blocks; progress with current phase and candidate; budget rule: run screening/confirmation with the cheap bot (planner), validate the final list with the strong bot (rollout) on holdout seeds — consumed by [S07.T06](T06-web-optimizer-page.md), [S07.T07](T07-coach-lost-game-review.md)

## Initial objective
One job runs the whole method end to end in minutes, resumable and cancellable, with every decision persisted.

## Summary
- Typical iteration: 24 × 12 × 200 = 57.6k screening games + confirmation blocks — seconds to a few minutes at ≥ 5k games/s.

## Acceptance / verification
- [ ] Dhelmise cycle reproduced on suite v6 within 15 minutes; job resumable after cancel.

## Notes for the elaboration pass
- Legacy reference: `optimizer.py::run_optimization`, `scripts/deck_optimize.py` (two-sieve structure).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
