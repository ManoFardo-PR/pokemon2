# S06.T05 — Rollout bot (determinized playouts)

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 5 / 8 |
| Depends on | [S04.T03](../04-game-engine-core/T03-game-state-model.md), [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md), [S06.T01](T01-honest-information-view.md), [S06.T03](T03-planner-turn-policy.md), [S06.T04](T04-need-scoring-and-prompt-resolvers.md) |
| Unblocks | [S06.T06](T06-ismcts-bot.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` cheap `Game: Clone` — from [S04.T03](../04-game-engine-core/T03-game-state-model.md)
- `module` separate bot RNG stream — from [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)
- `module` `PlayerView::determinize` — from [S06.T01](T01-honest-information-view.md)
- `module` planner as rollout policy — from [S06.T03](T03-planner-turn-policy.md)
- `module` prompt resolvers — from [S06.T04](T04-need-scoring-and-prompt-resolvers.md)

## Outputs (proposed)
- `module` `ptcg-core::bots::rollout::RolloutBot { playouts_per_action, max_depth_turns, policy: Planner }` — for each legal action: determinize the view N times, clone, apply, play out with the planner on both sides, average outcome (win = 1, tie = 0.5, prizes differential as tie-break); prompts inside playouts answered by the planner — consumed by [S06.T06](T06-ismcts-bot.md)

## Initial objective
The first bot that looks ahead: it evaluates each move by playing the game out from sampled hidden states, something impossible on the legacy engine.

## Summary
- Budget expressed in playouts; typical 32–128 per decision; cost measured in µs/decision and stored in `docs/PERF.md`.
- Uses only the view + determinization, never the true hidden state.

## Acceptance / verification
- [ ] Mirror vs `planner_rs_v1` on suite v6 decks: win rate > 50 % with CI excluding 50 % at ≥ 400 games.

## Notes for the elaboration pass
- Determinization bias is expected; ISMCTS ([S06.T06](T06-ismcts-bot.md)) addresses it.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
