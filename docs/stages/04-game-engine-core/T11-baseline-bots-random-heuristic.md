# S04.T11 — Baseline bots: random and heuristic

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 11 / 18 |
| Depends on | [S04.T05](T05-actions-and-legality.md), [S04.T09](T09-prompt-protocol.md) |
| Unblocks | [S04.T12](T12-cli-job-protocol.md), [S04.T18](T18-performance-baseline.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) |
| Parallel with | [S04.T07](T07-damage-pipeline.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `legal_actions` / `apply` — from [S04.T05](T05-actions-and-legality.md)
- `contract` prompts and default resolvers — from [S04.T09](T09-prompt-protocol.md)

## Outputs (proposed)
- `module` `ptcg-core::bots::{Bot trait, RandomBot, HeuristicBot}` — `trait Bot { fn choose_action(&mut self, view, actions) → Action; fn answer_prompt(&mut self, view, prompt) → Answer }`; heuristic: win-now attack → bench Basics → evolve → attach energy to the best attacker → attack for max damage → end turn; prompt answers by purpose (e.g. promote the highest-HP bench) — consumed by [S04.T12](T12-cli-job-protocol.md), [S04.T18](T18-performance-baseline.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)
- `contract` `View` = full state for now (the honest information view arrives with the first subtask of the bots stage); bots are pure functions of `(view, rng)`

## Initial objective
Two reference opponents exist from day one: random (for fuzzing the rules) and a simple heuristic (for benchmarks and as the first frozen suite opponent).

## Summary
- Heuristic must never return an illegal action (property-tested).
- Random bot answers prompts uniformly among valid answers via the default resolver's candidate list.

## Acceptance / verification
- [ ] Random vs random: 1,000 games end without engine errors; heuristic beats random > 90 % on a vanilla deck pair.

## Notes for the elaboration pass
- Legacy reference: `policies.py::heuristic_policy` order (frozen legacy bot).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
