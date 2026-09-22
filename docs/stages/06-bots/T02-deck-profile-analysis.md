# S06.T02 — Deck profile analysis

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 2 / 8 |
| Depends on | [S04.T02](../04-game-engine-core/T02-card-definition-model.md), [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md) |
| Unblocks | [S06.T03](T03-planner-turn-policy.md) |
| Parallel with | [S06.T01](T01-honest-information-view.md), [S06.T07](T07-bot-registry-and-freezing.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` `CardDef` (attacks, costs, stages, evolves_from, tags) — from [S04.T02](../04-game-engine-core/T02-card-definition-model.md)
- `contract` IR attack fields (`plus_when`, `nothing_unless`, `plus_per`) to read goals — from [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md)
- `doc` ESPECIFICACAO.md RN-31

## Outputs (proposed)
- `module` `ptcg-core::bots::profile::Profile` — from a decklist: `power[def]` = (nominal damage of best attack, cost, scaling counter) ranked by `dmg / (cost + 1.5)`; `main` attacker weighted by copies; `main_line` (Basic → … → top); `support` (ability Pokémon outside the line); `attackers` (≥ 60 nominal); `goal` read from the main attack's conditions (e.g. 'get 4 named cards into the discard'); `is_fodder(def)`, `goal_pending(view)` — consumed by [S06.T03](T03-planner-turn-policy.md)

## Initial objective
The bot understands its own deck before the first turn — who attacks, what has to be set up, what the deck is trying to achieve — so decisions serve a plan instead of local greed.

## Summary
- Reads IR data rather than card names, so new cards work without bot changes.
- Deterministic; computed once per game.

## Acceptance / verification
- [ ] Unit tests on three archetype lists (Dragapult, Gardevoir, the user's Dhelmise): expected main line and goal detected.

## Notes for the elaboration pass
- Legacy reference: `sim/pilot.py::Profile` and `_nominal_power` (planner v11 read the goal from `discard_has`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
