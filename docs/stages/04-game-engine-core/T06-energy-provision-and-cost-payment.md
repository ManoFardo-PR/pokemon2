# S04.T06 — Energy provision and cost payment

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 6 / 18 |
| Depends on | [S04.T05](T05-actions-and-legality.md) |
| Unblocks | [S04.T07](T07-damage-pipeline.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) |
| Parallel with | [S04.T09](T09-prompt-protocol.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` actions (`Attack`, `Retreat` need cost checks) — from [S04.T05](T05-actions-and-legality.md)

## Outputs (proposed)
- `module` `ptcg-core::energy` — `Unit { types: TypeSet | Any }`, `provided_units(slot) → Vec<Unit>` (basic energy = 1 unit of its type; special energy = its `provides` units; modifiers may add units), `can_pay(cost: &[TypeSlot], units) → Option<Assignment>` via a small bipartite matching (≤ 10 units × ≤ 5 slots), `retreat_cost(slot)` through the `retreat_cost` hook — consumed by [S04.T07](T07-damage-pipeline.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)
- `contract` hook shapes `energy_provision(slot) → Vec<Unit>` and `attack_cost(slot, attack) → Vec<TypeSlot>` (can add or remove slots, incl. −N Colorless) that [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) will populate

## Initial objective
What an attached energy provides is decided when a cost is paid, not when it is attached — the structural wall of the legacy engine — so 'provides every type but one at a time' and cost reductions are representable.

## Summary
- Assignment is deterministic (first feasible in slot order) and returned so effects like 'discard an energy used to pay' know which cards were used.
- Retreat cost payment opens a `ChooseCards` prompt only when more than one distinct assignment exists.

## Acceptance / verification
- [ ] Unit tests: `[W,W,C]` payable by `{W, W, Any}`; `[P,P]` not payable by `{P, D}`; a `{P|D}` unit pays either; cost reduction −1 Colorless applied through the hook.

## Notes for the elaboration pass
- Legacy gap documented in ESPECIFICACAO.md §6.1 (Prism/Legacy/Neo Upper approximated); twinleafgg `legacy-energy.ts` pushes `CardType.ANY` into the energy map — the reference behaviour.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
