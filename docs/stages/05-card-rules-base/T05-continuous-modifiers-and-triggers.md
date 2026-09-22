# S05.T05 — Continuous modifiers and triggers

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 5 / 16 |
| Depends on | [S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md), [S04.T07](../04-game-engine-core/T07-damage-pipeline.md), [S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md), [S05.T04](T04-ir-compiler-and-vm.md) |
| Unblocks | [S05.T11](T11-legacy-tests-to-scenarios.md) |
| Parallel with | [S05.T06](T06-builtins-escape-hatch.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` `energy_provision` / `attack_cost` hook shapes — from [S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md)
- `contract` damage hooks (`damage_out`, `damage_in`, `prevent_damage`, `prevent_effects`, `counters_blocked`, `would_be_knocked_out`, `prize_value`) — from [S04.T07](../04-game-engine-core/T07-damage-pipeline.md)
- `contract` `extra_poison`, `checkup_counters`, `end_of_turn_discard`, `block_conditions` — from [S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md)
- `module` VM (for trigger programs) — from [S05.T04](T04-ir-compiler-and-vm.md)

## Outputs (proposed)
- `module` `ptcg-core::ir::modifiers` — modifier index rebuilt lazily on `board_version` change: for each hook, the ordered list `(slot, card, modifier)` of contributors (attached tools, attached special energies, in-play Pokémon passives on both sides, the stadium), with `scope ∈ self_only | holder | owner_field | global`, `when` conditions, `no_stack_key` (RN-17: one effect per card name); hooks also `hp_max, retreat_cost, bench_size, weakness_override, block_abilities, block_tools, block_special_energy, grant_attacks, evolve_same_turn, no_counter_move`
- `module` `ptcg-core::ir::triggers` — events `play_from_hand, evolve, enter_bench, attach_energy, attack_used, damaged_by_attack, would_be_knocked_out, knocked_out, end_of_turn, between_turns, opponent_attack_done, stadium_played`; resolution order: active player's slots in order, then opponent's (documented approximation of 'turn player chooses')

## Initial objective
Passive effects (tools, stadiums, abilities, special energies) apply through one indexed mechanism that is recomputed only when the board changes, eliminating the legacy's per-action reconciliation loop and its 1.6 million empty hook calls.

## Summary
- Bench shrink when `bench_size` drops (Area Zero leaving play) discards the lowest-HP extra Pokémon without prizes, as the rulebook says.
- `block_conditions` cures immediately; `block_tools` (Jamming Tower) disables tool modifiers without detaching.

## Acceptance / verification
- [ ] Scenarios: tool `+30 damage when target is ex`; stadium `bench_size 8 with a Tera in play` then shrink; `no_stack` with two copies of the same passive counts once; `attack_cost −1 Colorless` from a tool.

## Notes for the elaboration pass
- Legacy reference: `status.py` `HOOK_NAMES` (19 hooks), `refresh_field` (the reconciliation loop being replaced), `ACTIVE_HOOKS` optimisation.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
