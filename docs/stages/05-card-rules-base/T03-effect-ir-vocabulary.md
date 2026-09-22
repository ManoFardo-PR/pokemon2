# S05.T03 — Effect IR vocabulary

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 3 / 16 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S04.T07](../04-game-engine-core/T07-damage-pipeline.md), [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) |
| Unblocks | [S05.T04](T04-ir-compiler-and-vm.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S06.T02](../06-bots/T02-deck-profile-analysis.md) |
| Parallel with | [S05.T01](T01-rules-schema-migration.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/ir` placeholder + JSON Schema export — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `contract` damage pipeline stages and hook names — from [S04.T07](../04-game-engine-core/T07-damage-pipeline.md)
- `contract` prompt purposes and kinds — from [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)

## Outputs (proposed)
- `contract` `@pokesearch/shared/ir` (zod) mirrored by `ptcg-core::ir::model` (serde): values (`int`, `count{zone, of, filter}`, `energy_count{slot, type?}`, `damage_on{slot}`, `prizes{of}`, `hand_size{of}`, `bench_size{of}`, `coin{flips | until_tails}`, `param{name}`), selectors (`self, holder, owner, opponent, active{of}, bench{of}, in_play{of}, zone{of, zone}`), filters (`is_pokemon, is_basic, is_evolution, stage, has_rule_box, no_rule_box, tag, is_energy, is_basic_energy, is_special_energy, energy_type, is_trainer, trainer_kind, name_contains, ability_named, hp_at_most, pokemon_type, on_bench, on_active, has_damage, energy_attached_at_least, owner_tag, all_of, any_of, not`), ops (`draw, draw_until, shuffle, discard{from, filter, n, min, actor}, search{zone, filter, n, min, to: hand|bench|discard|top|attach, reveal}, look_at_top{n, take, rest}, move_cards, attach_energy{from, filter, to}, detach, move_energy, switch_active{side, actor}, heal, put_counters{targets, n, distribute}, move_counters, apply_condition, remove_conditions, damage{targets, n, weakness}, self_damage, knock_out, take_prizes, turn_effect{scope, kind, until}, marker{add|remove|has}, may{prompt}, choose_one{options, actor}, coin_then, repeat_until_tails, for_each, use_attack_as_this, end_turn, builtin{name}`), attack fields (`plus, plus_when, plus_per{counter, n, offset}, coin_plus, coin_or_nothing, nothing_unless, ignore_weakness, ignore_resistance, ignore_target_effects, lock_self, cost_alt`), `Modifier { hook, when, value, scope, no_stack_key }`, `Trigger { on, when, program }` — consumed by [S05.T04](T04-ir-compiler-and-vm.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S06.T02](../06-bots/T02-deck-profile-analysis.md)
- `doc` `docs/rules/IR.md` — one entry per element with meaning, parameters, ranges (RN-61 sanity ranges) and an example; generated from the schema descriptions

## Initial objective
A closed, documented vocabulary in which a code's behaviour is written as data: rich enough for the hard cards (energy provision as a query, cost reduction, granted attacks, survive-at-10-HP, copy attack, opponent-side choices), strict enough that anything outside it is rejected.

## Summary
- The vocabulary is versioned with `CONTRACT_VERSION`; adding an op is a schema change on both sides plus a doc entry.
- Parameters of a code appear as `param{name}` placeholders, bound by `text_codes.params_json` at compile time ([S05.T07](T07-rule-codes-composition-semantics.md)).
- Legacy inventory to cover: 64 effect primitives + 10 combinators + 39 counters + 5 recipe types (`effects.py`), 28 attack ops + 7 plus-conditions (`attackops.py`), 19 hooks (`status.py::HOOK_NAMES`).

## Acceptance / verification
- [ ] Every legacy primitive/op/hook has a mapping row in `docs/rules/IR.md` (or an explicit 'not needed' note); JSON Schema diff TS vs Rust is empty.

## Notes for the elaboration pass
- Legacy reference: `sim/effects.py` docstrings for edge semantics (e.g. `MayDo`, `IfCan`, dedupe by class), `sim/attackops.py` `MAX_AMOUNT` ranges, `sim/cardfilters.py` (25 filters with pt-BR descriptions).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
