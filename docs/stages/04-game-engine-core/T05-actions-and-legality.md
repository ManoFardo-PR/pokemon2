# S04.T05 — Actions and legality

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 5 / 18 |
| Depends on | [S04.T02](T02-card-definition-model.md), [S04.T04](T04-setup-and-turn-structure.md) |
| Unblocks | [S04.T06](T06-energy-provision-and-cost-payment.md), [S04.T07](T07-damage-pipeline.md), [S04.T09](T09-prompt-protocol.md), [S04.T11](T11-baseline-bots-random-heuristic.md), [S06.T03](../06-bots/T03-planner-turn-policy.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` `CardDef` (stage, evolves_from, trainer subtype) — from [S04.T02](T02-card-definition-model.md)
- `module` turn structure and budgets — from [S04.T04](T04-setup-and-turn-structure.md)

## Outputs (proposed)
- `module` `ptcg-core::actions` — `enum Action { PlayBasic(c), Evolve(c, slot), AttachEnergy(c, slot), PlayItem(c), PlaySupporter(c), AttachTool(c, slot), PlayStadium(c), UseAbility(slot, i), UseStadium, Retreat(slot), Attack(i), EndTurn, Concede }`; `legal_actions(&Game) → Vec<Action>` in O(hand + slots); `apply(&mut Game, Action)` — consumed by [S04.T06](T06-energy-provision-and-cost-payment.md), [S04.T07](T07-damage-pipeline.md), [S04.T09](T09-prompt-protocol.md), [S04.T11](T11-baseline-bots-random-heuristic.md), [S06.T03](../06-bots/T03-planner-turn-policy.md)
- `contract` legality rules: evolve keeps damage, energies, tools and conditions are cleared (RN-11/RN-12); stadium with the same name cannot replace itself; retreat once per turn paying cost; one supporter, one energy attachment, one stadium play per turn; ability/attack availability consults hooks (blocked abilities, extra costs) that S05 populates

## Initial objective
Every legal move is enumerable cheaply and applies with the rulebook side effects, so bots choose among real options and no prompt combination is ever expanded into the action list.

## Summary
- Choices inside an action (which energies to discard for retreat, which Basic to bench) are prompts ([S04.T09](T09-prompt-protocol.md)), not action variants.
- Tools stay attached across evolution (`attached_to` follows the slot, not the card).
- Not in scope: effect programs (S05), damage ([S04.T07](T07-damage-pipeline.md)).

## Acceptance / verification
- [ ] Scenarios: evolve keeps 30 damage; second stadium of same name illegal; retreat unavailable when Asleep/Paralyzed (once [S04.T08](T08-special-conditions-and-checkup.md) lands, test hooks now).

## Notes for the elaboration pass
- Legacy reference: `status.py` fixes J (evolve keeps damage, tool re-pointing) and L (bench trigger); legacy `Player.get_actions` order.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
