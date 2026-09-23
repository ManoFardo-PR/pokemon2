# S07.T02 — Paired-seed screening

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 2 / 7 |
| Depends on | [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](T01-candidate-pool-and-move-generation.md) |
| Unblocks | [S07.T03](T03-sequential-confirmation.md), [S07.T05](T05-optimize-job-orchestration.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` seeding (`seed_base` per pairing, bot streams separate) — from [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)
- `module` worker (`evaluate` pairings) — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `module` candidate moves — from [S07.T01](T01-candidate-pool-and-move-generation.md)

## Outputs (proposed)
- `module` `optimizer/screen.ts` — for K candidates: candidate and reference play the same `(opponent, seed)` pairs (`seed_base = crc32(job, 'screen', iteration, opponent)`); per pair `d ∈ {−1, −0.5, 0, 0.5, 1}` (tie = 0.5); `Δ = mean(d)` weighted by opponent weight, `SE = sd(d)/√n`; pass rule `Δ − 1·SE > 0`; sizes `K ≤ 24 × 12 opponents × 200 games` — consumed by [S07.T03](T03-sequential-confirmation.md), [S07.T05](T05-optimize-job-orchestration.md)

## Initial objective
Cheap, high-recall triage: common random numbers cancel most seed noise so a real 1-point gain shows up in a few thousand games, while clearly harmful swaps are dropped early.

## Summary
- Reference results are computed once per iteration and reused for every candidate.
- Screening never accepts anything; it only forwards survivors.

## Acceptance / verification
- [ ] Synthetic test with a known +2-point swap: passes screening in ≥ 95 % of 20 runs; a 0-point swap passes ≤ 20 %.

## Notes for the elaboration pass
- Legacy failure being fixed: +2.7..+4.6 screening gains that vanished at confirmation (`benchmarks/otimizacao_dhelmise.md`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
