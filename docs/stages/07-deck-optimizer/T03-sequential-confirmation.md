# S07.T03 — Sequential confirmation

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 3 / 7 |
| Depends on | [S07.T02](T02-paired-seed-screening.md) |
| Unblocks | [S07.T04](T04-holdout-acceptance-and-versioning.md), [S07.T05](T05-optimize-job-orchestration.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` screening survivors with Δ/SE — from [S07.T02](T02-paired-seed-screening.md)

## Outputs (proposed)
- `module` `optimizer/confirm.ts` — fresh seeds (`'confirm'` salt); blocks of `12 opponents × 500 paired games`; after each block compute Δ and the 95 % CI (paired); stop when the CI excludes 0 or after 4 blocks (≈ 24k pairs, ~80 % power for 1 point); α split by the number of survivors (Bonferroni); futility stop after block 1 if `Δ + 2·SE < 0` — consumed by [S07.T04](T04-holdout-acceptance-and-versioning.md), [S07.T05](T05-optimize-job-orchestration.md)

## Initial objective
Survivors are re-tested on seeds they have never seen, with an early stop for clear winners and losers and a correction for testing several candidates at once.

## Summary
- All block results are stored so a stopped candidate can be resumed with more blocks later.

## Acceptance / verification
- [ ] Synthetic +1-point swap confirmed within 4 blocks in ≥ 75 % of runs; 0-point swap confirmed ≤ 5 % (after Bonferroni).

## Notes for the elaboration pass
- Parameters live in `jobs.params_json` so the plan is pre-registered per run.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
