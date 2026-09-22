# S07.T06 — Web: optimizer page

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 6 / 7 |
| Depends on | [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), [S07.T05](T05-optimize-job-orchestration.md) |
| Unblocks | — |
| Parallel with | [S07.T07](T07-coach-lost-game-review.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Evaluate page (opponent panel, progress components) — from [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)
- `module` optimize job — from [S07.T05](T05-optimize-job-orchestration.md)

## Outputs (proposed)
- `module` route `/optimize/:deckId` — start form (suite or custom opponents, iterations, K, bots, price cap, fixed cards), live phase/candidate progress, candidates table (move, screening Δ ± SE, confirmation Δ with CI and blocks, holdout, decision), accepted versions with diffs and links to the builder

## Initial objective
The user sees not just the suggested swap but the evidence behind it and the candidates that were rejected, in the same language as the Evaluate page.

## Summary
- CIs rendered as ranges, never a bare point estimate.

## Acceptance / verification
- [ ] After a run, every `optimizer_candidates` row is visible with its decision; accepted version opens in the builder.

## Notes for the elaboration pass
- Legacy reference: `sim_project.html` versions table.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
