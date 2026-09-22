# S04.T07 — Damage pipeline

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 7 / 18 |
| Depends on | [S04.T05](T05-actions-and-legality.md), [S04.T06](T06-energy-provision-and-cost-payment.md) |
| Unblocks | [S04.T08](T08-special-conditions-and-checkup.md), [S04.T10](T10-termination-stall-and-determinism.md), [S04.T13](T13-scenario-format-and-runner.md), [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) |
| Parallel with | [S04.T11](T11-baseline-bots-random-heuristic.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` actions (`Attack`) — from [S04.T05](T05-actions-and-legality.md)
- `module` cost payment (attack legality) — from [S04.T06](T06-energy-provision-and-cost-payment.md)
- `doc` ESPECIFICACAO.md RN-13, RN-14, RN-15, RN-19

## Outputs (proposed)
- `module` `ptcg-core::damage` — `resolve_attack(game, attacker, attack)`: per target `DamageCalc { base, plus_before, weakness_applied, resistance_applied, minus_after, prevented, final }` through the ordered stages; `place_counters(target, n, source)` (effect damage: no W/R, subject to `prevent_effects` / `counters_blocked`); `knock_out(slot)` with prize award via `prize_value` hook, promotion prompts, `knocked_out` triggers — consumed by [S04.T08](T08-special-conditions-and-checkup.md), [S04.T10](T10-termination-stall-and-determinism.md), [S04.T13](T13-scenario-format-and-runner.md), [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)
- `contract` stage order: (1) base = printed ± attack program bonuses; (2) Tera on bench → 0 (RN-15, unconditional); (3) `prevent_damage` hooks unless `ignore_target_effects`; (4) `+N` attacker-side (`damage_out`, own turn effects, 'attacks used by the Defending Pokémon do N less' placed by the opponent); (5) Weakness ×2 / Resistance −30 only when the target is the opponent's Active and not ignored (RN-13/14); (6) `−N` target-side (`damage_in`, target turn effects) unless ignored; (7) `would_be_knocked_out` replacements; (8) apply counters; (9) `damaged_by_attack` triggers; (10) after the whole attack: KO checks in slot order, prizes, promotions, `lock_self`, second-attack windows

## Initial objective
Damage is computed once, in one documented order that matches the rulebook and the legacy corrections, with each intermediate value observable in scenarios so any card interaction can be asserted.

## Summary
- Hooks are called through the modifier index ([S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)); in this stage they are empty and the pipeline reduces to printed damage + W/R.
- Damage counters placed by effects are a different path from attack damage ('damage is not an effect'); both exist from this subtask on.
- KO of the last Pokémon or taking the last prize ends the game immediately; a KO during a multi-target attack awards prizes before the next target is processed.

## Acceptance / verification
- [ ] Scenarios: 60 vs Weakness → 120; 60 vs Resistance → 30; bench target takes no W/R; Tera on bench takes 0 from attacks but 20 from counters; prize value 2 for ex.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/sim/status.py::_calculate_damage` (D) and `attack_damage_to` (bench path), `catalog_cards.py::_reduce_attack` (11-step attack resolution).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
