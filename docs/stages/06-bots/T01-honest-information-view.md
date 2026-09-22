# S06.T01 — Honest information view

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 1 / 8 |
| Depends on | [S04.T03](../04-game-engine-core/T03-game-state-model.md), [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) |
| Unblocks | [S06.T03](T03-planner-turn-policy.md), [S06.T05](T05-rollout-bot.md) |
| Parallel with | [S06.T02](T02-deck-profile-analysis.md), [S06.T07](T07-bot-registry-and-freezing.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` game state (zones, hidden prizes) — from [S04.T03](../04-game-engine-core/T03-game-state-model.md)
- `contract` prompts (`actor`) — from [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)
- `doc` ESPECIFICACAO.md RN-30

## Outputs (proposed)
- `module` `ptcg-core::view::PlayerView` — built per decision for the acting player: own hand, board, discard, known decklist (`Multiset<def>`), `own_deck_and_prizes_pool` (one pile until the first own-deck search, then exact deck contents and prize multiset), opponent: board, discard, hand size, deck size, prize count only; `View::determinize(rng)` samples hidden zones consistently with the known multisets — consumed by [S06.T03](T03-planner-turn-policy.md), [S06.T05](T05-rollout-bot.md)

## Initial objective
Bots cannot cheat by construction: the view given to a bot never contains the opponent's hand, deck order or prizes, and the bot's knowledge of its own deck evolves exactly as a careful human's would.

## Summary
- The engine still holds full state; the view is a projection.
- `determinize` is the primitive for rollout/ISMCTS bots ([S06.T05](T05-rollout-bot.md), [S06.T06](T06-ismcts-bot.md)).

## Acceptance / verification
- [ ] Property test: no `CardIdx` of the opponent's hand/deck/prizes appears in the view; after a `search_to_hand` prompt on the own deck, `prizes_known = true` and the prize multiset equals decklist − visible − deck.

## Notes for the elaboration pass
- Legacy reference: `sim/pilot.py::Knowledge` (`prizes_known`, `saw_own_deck`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
