# S06.T04 — Need scoring and prompt resolvers

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 4 / 8 |
| Depends on | [S04.T09](../04-game-engine-core/T09-prompt-protocol.md), [S06.T03](T03-planner-turn-policy.md) |
| Unblocks | [S06.T05](T05-rollout-bot.md), [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` prompt purposes — from [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)
- `module` planner (profile, view) — from [S06.T03](T03-planner-turn-policy.md)
- `doc` ESPECIFICACAO.md RN-36

## Outputs (proposed)
- `module` `ptcg-core::bots::planner::need` — `need(def, view, profile) → f32` (goal fodder 0.5 in hand / 6.0 in deck; main-line Basic 9.0 until 3 in play; evolution with base in play 10 + stage; energy when a main-line Pokémon has none 8.0; supporter when holding none 7.0; Rare Candy 7.5; recovery when a piece is discarded 6.5; search/draw 4.5; +3 last copy, +3 scarce energy when discarding) and `answer_prompt(prompt, view)` scoring by purpose (opening active: free retreat, avoid multi-prize; promotion: +300 can attack now, −400 gives the game; opponent target: prize value × 100, +200 lethal; losing a card: −need); records `margin = best − second` per decision for the coach — consumed by [S06.T05](T05-rollout-bot.md)

## Initial objective
Every prompt the engine asks gets a reasoned answer from the same value function that drives discards and searches, so the bot's choices in effects are as deliberate as its main actions.

## Summary
- Prompts are answered by purpose/zone, never by wording.
- `margin` is exported in the game log for critical-moment selection ([S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md)).

## Acceptance / verification
- [ ] Unit tests: a Boss's-Orders-style target prompt picks the lethal 2-prize target; a discard prompt never discards the last copy of the main attacker when alternatives exist.

## Notes for the elaboration pass
- Legacy reference: `sim/pilot.py::need`, `choose` (zone classification, `MAX_CHOICE_SCAN` no longer needed).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
