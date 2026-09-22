# S04.T18 — Performance baseline

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 18 / 18 |
| Depends on | [S04.T11](T11-baseline-bots-random-heuristic.md), [S04.T12](T12-cli-job-protocol.md) |
| Unblocks | — |
| Parallel with | [S04.T15](T15-worker-job-runner.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` heuristic bot — from [S04.T11](T11-baseline-bots-random-heuristic.md)
- `contract` CLI job protocol — from [S04.T12](T12-cli-job-protocol.md)

## Outputs (proposed)
- `file` `docs/PERF.md` — table of games/s and µs/game at 1, 8, 16, 22 workers for random×random and heuristic×heuristic on two vanilla decks; memory per game; method to reproduce (`pnpm engine:bench`)
- `script` `engine/ptcg-cli --bench` mode and `pnpm engine:bench`

## Initial objective
Speed is measured, not assumed: the number that decides how many games the optimizer can afford is recorded with its method, and regressions are visible.

## Summary
- Target: ≥ 5,000 games/s at 16 workers with heuristic bots (legacy: 22–40 games/s). If below 1,000, profile before continuing to S05.
- Bench uses fixed seeds so hashes can be compared across runs.

## Acceptance / verification
- [ ] `docs/PERF.md` filled with real numbers from this machine; fingerprint unchanged between bench runs.

## Notes for the elaboration pass
- Legacy numbers for the reference map: ~30 ms/game, 3,000 games in 133 s on 8 processes.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
