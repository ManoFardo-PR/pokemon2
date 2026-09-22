# S06.T06 — ISMCTS bot

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 6 / 8 |
| Depends on | [S06.T05](T05-rollout-bot.md) |
| Unblocks | — |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` rollout infrastructure (determinize, clone, playout policy) — from [S06.T05](T05-rollout-bot.md)

## Outputs (proposed)
- `module` `ptcg-core::bots::ismcts::IsmctsBot { iterations, exploration_c, determinizations }` — information-set MCTS with a fresh determinization per iteration, UCT selection over legal actions, planner playouts, prompts as tree nodes; deterministic given seed

## Initial objective
A stronger, principled lookahead bot whose strength scales with compute, used to validate final deck lists and to test how much bot skill changes the measured deck scores.

## Summary
- Comparison protocol: fixed compute budget per decision; report win rate vs rollout and planner, and µs/decision.
- Not on the optimizer's hot path (too slow); used for final validation (S07 statistics plan).

## Acceptance / verification
- [ ] Beats the rollout bot in mirror with CI excluding 50 % at equal wall-clock budget, or the result is documented and the bot kept as optional.

## Notes for the elaboration pass
- Reference: Cowling, Powley & Whitehouse, 'Information Set Monte Carlo Tree Search' (2012).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
