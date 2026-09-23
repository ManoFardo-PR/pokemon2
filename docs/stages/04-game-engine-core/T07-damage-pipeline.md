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
- `file` `pokemon/src/pokesearch/sim/status.py` — `_calculate_damage`, `attack_damage_to`, `_sum_hooks`, `tera_protected`, `reduce_effect_action`; read-only reference

## Outputs (proposed)
- `module` `ptcg-core::damage` — `resolve_attack(game, attacker, attack)`: per target `DamageCalc { base, plus_before, weakness_applied, resistance_applied, minus_after, prevented, final }` through the ordered stages; `place_counters(target, n, source)` (effect damage: no W/R, subject to `prevent_effects` / `counters_blocked`); `knock_out(slot)` with prize award via `prize_value` hook, promotion prompts, `knocked_out` triggers — consumed by [S04.T08](T08-special-conditions-and-checkup.md), [S04.T10](T10-termination-stall-and-determinism.md), [S04.T13](T13-scenario-format-and-runner.md), [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)
- `contract` stage order: (1) base = printed ± attack program bonuses; (2) Tera on bench → 0 (RN-15, unconditional); (3) `prevent_damage` hooks unless `ignore_target_effects`; (4) `+N` attacker-side (`damage_out`, own turn effects, 'attacks used by the Defending Pokémon do N less' placed by the opponent); (5) Weakness ×2 / Resistance −30 only when the target is the opponent's Active and not ignored (RN-13/14); (6) `−N` target-side (`damage_in`, target turn effects) unless ignored; (7) `would_be_knocked_out` replacements; (8) apply counters; (9) `damaged_by_attack` triggers; (10) after the whole attack: KO checks in slot order, prizes, promotions, `lock_self`, second-attack windows

## Initial objective
Damage is computed once, in one documented order that matches the rulebook and the legacy corrections, with each intermediate value observable in scenarios so any card interaction can be asserted.

## Context

Damage order is the single most consequential piece of arithmetic in the engine. Move Weakness one stage and a whole archetype's knockout maths changes; drop a reduction and a deck that should survive at 10 HP dies. The legacy learned this over months, and `pokemon/src/pokesearch/sim/status.py` carries the result: a `_calculate_damage` replacement whose docstring is literally the order — *"+N antes de fraqueza/resistência (efeitos de turno, ferramentas, estádio); −N depois (berries, estádio)"* — and a separate `attack_damage_to` for targets that are not the opponent's Active. That split is RN-13 and RN-14, and it exists because the two paths are genuinely different rules, not an optimisation.

Three distinctions carry most of the weight.

**Weakness and Resistance apply only to the Active** (RN-13). `attack_damage_to` routes an Active target to the full calculation and a benched target to a reduced one, and its comment explains why: cards say "don't apply Weakness and Resistance for Benched Pokémon", and attacker-side bonuses are written as "your opponent's Active Pokémon". So a benched target gets neither the ×2/−30 stage nor the attacker's `+N`; what it does keep is prevention (the Tera rule, Flower Curtain, Shadowy Darkness Energy) and its own reduction. Treating bench damage as if it were counters — the shortcut the legacy started with — skipped all of that.

**Damage is not an effect** (RN-14). Attack damage passes through the pipeline; damage counters placed by an effect do not. They get no Weakness, no Resistance, no attacker `+N`, no target `−N` — but they *are* effects, so they are stopped by `prevent_effects` (Hide 'n' Sneak) and by `counters_blocked` (Battle Cage). The legacy had to intercept the third-party engine's own counter-placing path (`reduce_effect_action`) precisely because engine cards placed counters without consulting those hooks, and the interception is careful: an `is_damage` flag marks attack damage routed through the same path so it is not filtered twice.

**The Tera rule is a card rule, not an ability** (RN-15). While a Tera Pokémon is on the bench, attack damage to it is prevented — unconditionally, because nothing turns a printed rule off, including attacks that say they ignore all effects on the Defending Pokémon. Damage counters still land. `pokemon/tests/test_rules.py::test_tera_rule_prevents_attack_damage_on_the_bench_only` asserts exactly that: 200 damage to a benched Tera is 0, a bench-damage attack changes nothing, `PlaceCountersOnEach(2)` removes 20, and moving the same Pokémon to the Active spot makes damage land again. The legacy note adds that 0.53 % of the meta counted as exact without this rule implemented.

Two further legacy details are preserved. `_sum_hooks` deduplicates contributors by `no_stack_key`, which is RN-17 — "the effect of X doesn't stack" counts once per card name — and that deduplication has to happen inside the summation, not afterwards. And `after_damage_reduction` fires only when a reduction actually applied, which is what makes a berry discard itself exactly when it did something.

In this stage the hooks are all empty and the pipeline collapses to: printed damage, Tera check, Weakness ×2 / Resistance −30 on the Active, apply counters, knockouts, prizes. That is enough to play complete games, and [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) fills the stages without moving them.

## Scope

- **In scope.** `resolve_attack` and the ten-stage order; `DamageCalc` as an observable record; `place_counters` as the separate effect path; `heal` and `move_counters` as the inverse primitives; `knock_out` with prize award through the `prize_value` hook, the `knocked_out` trigger and the promotion prompt; the after-attack sequence (knockout sweep in slot order, prize checks, promotions, `lock_self`, the second-attack window); the seven damage hook shapes [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) implements; the `no_stack_key` deduplication (RN-17's mechanism); rounding to whole damage counters.
- **Out of scope.** Special Conditions and the checkup ([S04.T08](T08-special-conditions-and-checkup.md)) — checkup damage calls `place_counters` from there; end-of-game detection and the outcome ([S04.T10](T10-termination-stall-and-determinism.md)) — `knock_out` reports "no Pokémon left" and "last prize taken", T10 decides; the attack's own effect program and its `plus`/`coin` fields ([S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md)) — stage 1 receives a number from it; the modifier index that answers the hooks ([S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)); prize *value* derivation, which is `CardDef::prize_value` from [S04.T02](T02-card-definition-model.md) (RN-19).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-13 | **Kept.** Attacker-side `+N` applies before Weakness (×2) and Resistance (−30); target-side `−N` applies after. Weakness and Resistance apply only when the target is the opponent's **Active** and neither is ignored by the attack. | `damage::resolve_one` stages 4 → 5 → 6; the Weakness/Resistance stage is guarded by `target.is_active()` | `damage.rs > plus_applies_before_weakness` (60 base, +20, weakness → 160, not 140); `> minus_applies_after_resistance`; scenario `rules/weakness-x2.json`, `rules/resistance-minus-30.json` |
| RN-14 | **Kept.** Bench damage is not counters: a benched target takes no Weakness, no Resistance and no attacker `+N`, but prevention and its own reduction still apply. Damage counters placed by an effect skip the whole pipeline yet pass the `prevent_effects` / `counters_blocked` filter — damage is not an effect, a counter is. | `damage::resolve_one` bench branch; `damage::place_counters` calling `hooks::counters_blocked` | `damage.rs > bench_target_takes_no_weakness`; `> bench_target_keeps_its_own_reduction`; `> counters_are_blocked_by_counters_blocked`; `> counters_ignore_weakness`; scenario `rules/bench-damage-no-wr.json` |
| RN-15 | **Kept.** The Tera rule is a card rule: while a Tera Pokémon is on the bench, attack damage to it is 0 — unconditionally, including from attacks that ignore all effects on the target. Damage counters still land. On the Active the rule does not apply. | `damage::resolve_one` stage 2, evaluated before the `ignore_target_effects` branch | `damage.rs > tera_on_bench_takes_zero_attack_damage`; `> tera_on_bench_still_takes_counters`; `> tera_on_active_takes_normal_damage`; `> ignore_target_effects_does_not_beat_tera`; scenario `rules/tera-bench.json` |
| BR-S04.T07-01 | The stage order is a single function and a single list: `resolve_one` executes stages 1–9 in the documented order with no early exit other than the documented zeros, and the order is asserted by a test that records the sequence of hook calls. | `damage::resolve_one`; a `#[cfg(test)]` recorder around the hook calls | `damage.rs > stage_order_is_as_documented` (the recorded call sequence equals the expected list) |
| BR-S04.T07-02 | Every resolution produces a `DamageCalc` with all intermediate values, and that record is what scenarios assert against — `{ base, plus_before, weakness_applied, resistance_applied, minus_after, prevented, final }`. It is produced whether or not logging is on. | `resolve_attack` returns `SmallVec<[(Target, DamageCalc); 2]>`; the scenario `expect: { damage_calc }` reads it ([S04.T13](T13-scenario-format-and-runner.md)) | `damage.rs > damage_calc_records_every_stage`; scenario `rules/damage-calc-fields.json` |
| BR-S04.T07-03 | Damage is applied in whole counters: `final` is rounded **down** to a multiple of 10 before it becomes `Slot::damage`, and no arithmetic anywhere produces a non-multiple. | `damage::apply_final` (stage 8) | `damage.rs > final_damage_is_a_multiple_of_ten`; `> a_halving_effect_rounds_down` (e.g. 90 halved → 40) |
| BR-S04.T07-04 | Contributors that declare `no_stack_key` are counted once per key inside each hook summation, not afterwards (RN-17's mechanism, declared in [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)). | `damage::sum_hook` deduplicating by `no_stack_key` while iterating contributors in `(slot, card idx)` order | `damage.rs > two_copies_of_a_no_stack_bonus_count_once`; `> two_different_bonuses_both_count` |
| BR-S04.T07-05 | Prevention is checked once, at stage 3, and is skipped only by `ignore_target_effects`; the Tera rule at stage 2 is not prevention and is never skipped. A prevented attack yields `final = 0` and `prevented = true`, and stages 4–6 do not run. | `resolve_one` stages 2 and 3 | `damage.rs > prevent_damage_zeroes_the_attack`; `> ignore_target_effects_beats_prevent_damage`; `> ignore_target_effects_does_not_beat_tera` |
| BR-S04.T07-06 | `would_be_knocked_out` (stage 7) may replace the outcome for a target whose accumulated damage would reach `hp_max`; a replacement leaves the slot at exactly `hp_max − 10` when it says "survives with 10 HP", and it fires at most once per target per attack. | `resolve_one` stage 7, consulting the hook with the prospective total | `damage.rs > survive_at_ten_hp_replacement`; `> replacement_fires_once_per_target` |
| BR-S04.T07-07 | Knockouts are resolved after the whole attack, sweeping slots in a fixed order — the defending player's Active, then bench 1..8, then the attacking player's Active, then their bench — and a knockout awards `prize_value` prizes through the hook, capped by the number of prizes remaining. | `damage::after_attack` → `knock_out` per slot | `damage.rs > knockouts_are_swept_in_slot_order`; `> prize_award_is_capped_by_remaining_prizes`; `> an_ex_awards_two_prizes` |
| BR-S04.T07-08 | A knockout of the Active opens a `promote_after_ko` prompt for its **owner**; when several knockouts happen at once, prompts are opened in the sweep order and each is answered before the next is raised. | `knock_out` setting `pending_prompt`; `after_attack` resuming | `damage.rs > both_actives_knocked_out_open_two_prompts_in_order`; scenario `rules/double-knockout.json` |
| BR-S04.T07-09 | `place_counters` never consults Weakness, Resistance, `damage_out` or `damage_in`, and never rounds — it places whole counters by definition; it is refused by `prevent_effects` and by `counters_blocked`, with the `by` and `kind` arguments naming the source so a card can prevent only the opponent's effects. | `damage::place_counters(game, target, n, source: Source)` where `Source { card, kind: attack\|ability\|trainer, by: PlayerIdx }` | `damage.rs > counters_ignore_weakness`; `> own_effect_is_not_blocked_by_prevent_effects`; `> opponent_ability_counters_are_blocked` |

## Data operations

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `Slot::damage` | `+= final` (a multiple of 10) | stage 8 of each target's resolution | never negative; never a non-multiple of 10 (BR-S04.T07-03) |
| `Slot::damage` | `+= n * 10` | `place_counters`, after the block filter | no pipeline stage runs (RN-14) |
| `Slot::damage` | `-=` saturating at 0 | `heal(slot, n)` | healing never produces a negative value and never exceeds the current damage |
| `Slot::damage` (two slots) | moved between slots | `move_counters(from, to, n)` | refused when the `no_counter_move` hook is active ([S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)); the total across both slots is unchanged |
| `Slot::top`, `under`, `energies`, `tools` → `Player::discard` | whole stack moved, in that order | `knock_out` | one mutation; the stack is never partially discarded |
| `Player::bench[i]` / `Player::active` | slot cleared | `knock_out` | a knocked-out Active leaves `active = None` until the promotion prompt is answered ([S04.T04](T04-setup-and-turn-structure.md)) |
| `Player::prizes` → attacker's `Player::hand` | `min(prize_value, prizes.len())` cards from the top | `knock_out`, immediately after the discard | capped (BR-S04.T07-07); taking the last prize is reported to [S04.T10](T10-termination-stall-and-determinism.md) |
| `Player::knocked_out_last_turn` | `DefIdx` appended | `knock_out` | cleared at the owner's `start_turn`; read by "if any of your Pokémon were knocked out during your opponent's last turn" effects |
| `Game::pending_prompt` | `promote_after_ko` | `knock_out` of an Active with a non-empty bench | actor and owner are the knocked-out player; candidates are their bench slots |
| `Slot::turn_effects` (attacker) | `lock_self` entry added | stage 10, when the attack declares it | expires in the checkup ([S04.T08](T08-special-conditions-and-checkup.md)) |
| `Player::markers` | `second_attack` set/cleared | stage 10 | consumed by [S04.T05](T05-actions-and-legality.md) so the turn does not end |
| `Game::board_version` | `+= 1` | on every knockout and promotion | invalidates the modifier index and the `legal_actions` cache |
| `Game::events` | `Damage`, `KnockedOut`, `PrizeTaken` appended | each stage 8/10 event, only when logging | the event carries the whole `DamageCalc`, so a replay can show the arithmetic ([S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)) |
| the database | — | never | the engine holds no connection |

## Interfaces

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct DamageCalc {
    pub base: i32,              // stage 1: printed ± the attack program's own bonuses
    pub plus_before: i32,       // stage 4: damage_out hooks + attacker turn effects (may be negative)
    pub weakness_applied: bool, // stage 5
    pub resistance_applied: bool,
    pub minus_after: i32,       // stage 6: damage_in hooks + target turn effects
    pub prevented: bool,        // stage 2 (Tera) or stage 3 (prevent_damage)
    pub replaced: bool,         // stage 7: would_be_knocked_out fired
    pub final_damage: u16,      // stage 8, a multiple of 10
}

#[derive(Debug, Clone, Copy)]
pub struct Target { pub player: PlayerIdx, pub slot: SlotIdx }

#[derive(Debug, Clone, Copy)]
pub struct Source { pub card: Option<CardIdx>, pub kind: SourceKind, pub by: PlayerIdx }
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceKind { Attack, Ability, Trainer, Condition, Checkup }

pub(crate) fn resolve_attack(game: &mut Game, attacker: Target, attack: u8)
    -> SmallVec<[(Target, DamageCalc); 2]>;
pub(crate) fn resolve_one(game: &Game, attacker: Target, target: Target, base: i32) -> DamageCalc;
pub(crate) fn place_counters(game: &mut Game, target: Target, n: u16, src: Source) -> u16; // returns placed
pub(crate) fn heal(game: &mut Game, target: Target, n: u16) -> u16;
pub(crate) fn move_counters(game: &mut Game, from: Target, to: Target, n: u16) -> u16;
pub(crate) fn knock_out(game: &mut Game, target: Target, credited_to: PlayerIdx);
pub(crate) fn after_attack(game: &mut Game, attacker: Target);   // stage 10
```

**Hook shapes** — the contract [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) implements. These seven names are consumed verbatim by S05 and must not change:

```rust
pub(crate) mod hooks {
    /// Stage 4. Attacker-side contributors: attached tools/energies of the attacker, in-play
    /// passives of the attacker's owner, the stadium. Summed with no_stack_key dedup (RN-17).
    pub fn damage_out(game: &Game, atk: Target, tgt: Target) -> i32;

    /// Stage 6. Target-side contributors: the target's attachments, its owner's passives, the stadium.
    pub fn damage_in(game: &Game, atk: Target, tgt: Target) -> i32;

    /// Stage 3. Any contributor may prevent the whole damage.
    pub fn prevent_damage(game: &Game, atk: Target, tgt: Target) -> bool;

    /// Any non-damage effect aimed at `tgt`; `by` is who causes it, so a card can prevent
    /// only the opponent's effects ("Hide 'n' Sneak" prevents effects, not damage).
    pub fn prevent_effects(game: &Game, tgt: Target, src: Source) -> bool;

    /// Damage counters specifically ("Battle Cage"); implies prevent_effects.
    pub fn counters_blocked(game: &Game, tgt: Target, src: Source) -> bool;

    /// Stage 7. Called with the prospective total; Some(new_damage) replaces the outcome.
    pub fn would_be_knocked_out(game: &Game, tgt: Target, prospective: u16) -> Option<u16>;

    /// Prizes awarded by knocking out `tgt`; defaults to CardDef::prize_value (RN-19).
    pub fn prize_value(game: &Game, tgt: Target) -> u8;
}
```

**The ten stages, as implemented.**

| # | Stage | Skipped by | Notes |
|---|---|---|---|
| 1 | `base` = printed damage ± the attack program's own bonuses | — | the program is absent in this stage, so `base` is `damage_printed` |
| 2 | Tera on bench → `final = 0`, `prevented = true` | nothing (RN-15) | evaluated before `ignore_target_effects` |
| 3 | `prevent_damage` hooks | `ignore_target_effects` on the attack | `prevented = true`, stages 4–6 skipped |
| 4 | `plus_before` = `damage_out` + attacker `DamagePlus`/`DamageMinus` turn effects | target is not the opponent's Active (RN-14) | may be negative |
| 5 | Weakness ×2, then Resistance −30 | target is not the opponent's Active; `ignore_weakness` / `ignore_resistance` on the attack; a `no_weakness` turn effect on the target | ×2 applies to `base + plus_before` |
| 6 | `minus_after` = `damage_in` + target `DamageMinus` turn effects; fire `after_damage_reduction` when it applied | `ignore_target_effects` | floored at 0 |
| 7 | `would_be_knocked_out` replacement | — | at most once per target per attack |
| 8 | round down to a multiple of 10, `Slot::damage += final` | — | BR-S04.T07-03 |
| 9 | `damaged_by_attack` trigger for the target | `final == 0` | trigger names match [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) |
| 10 | after the whole attack: knockout sweep, prizes, promotions, `lock_self`, second-attack window | — | `after_attack` |

**Attack modifier flags** read at stages 3, 5 and 6, declared on the attack by [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md): `ignore_target_effects`, `ignore_weakness`, `ignore_resistance`, `lock_self`. They are absent in this stage and default to false.

## Implementation steps

1. Declare `DamageCalc`, `Target`, `Source`, `SourceKind` and the empty `hooks` module; `cargo test` green.
2. Implement `resolve_one` for the Active path with stages 1, 5 and 8 only (printed damage, Weakness ×2, Resistance −30, apply); spec 60 vs Weakness → 120 and 60 vs Resistance → 30 (RN-13).
3. Add the bench branch (no stage 4, no stage 5) and spec `> bench_target_takes_no_weakness` (RN-14).
4. Add stage 2, the Tera rule, before everything else; spec the four Tera cases including `> ignore_target_effects_does_not_beat_tera` (RN-15).
5. Add stages 3, 4 and 6 with the hook seams and `sum_hook`'s `no_stack_key` deduplication; spec `> plus_applies_before_weakness`, `> minus_applies_after_resistance` and the two no-stack cases (RN-13, BR-S04.T07-04).
6. Add stage 7 (`would_be_knocked_out`) and stage 9 (`damaged_by_attack`); spec the survive-at-10 replacement and the trigger firing exactly on non-zero damage (BR-S04.T07-06).
7. Implement `place_counters`, `heal` and `move_counters` as the separate effect path with the `prevent_effects` / `counters_blocked` filter and the `by`/`kind` arguments; spec the four counter cases (RN-14, BR-S04.T07-09).
8. Implement `knock_out`: discard the whole stack, award `min(prize_value, remaining)` prizes, append to `knocked_out_last_turn`, raise the `knocked_out` trigger, open the `promote_after_ko` prompt; spec the prize cap and the two-prize ex (BR-S04.T07-07).
9. Implement `after_attack` with the fixed sweep order, the multi-prompt sequencing, `lock_self` and the second-attack window; spec `> knockouts_are_swept_in_slot_order` and `> both_actives_knocked_out_open_two_prompts_in_order` (BR-S04.T07-08).
10. Add the stage-order recorder test and the `DamageCalc` completeness test; write the seven `engine/scenarios/rules/*.json` files this subtask owns for [S04.T13](T13-scenario-format-and-runner.md).
11. Run the random fuzz loop of [S04.T05](T05-actions-and-legality.md) with `--features invariants` for 10,000 games and confirm no invariant violation and no negative or non-multiple damage.

## Edge cases and error handling

- **Both Actives are knocked out by one attack** (a recoil attack that kills the attacker) → the sweep runs in the fixed order: defender's Active first, then their bench, then the attacker's Active, then their bench. Prizes are awarded for each knockout to the opposing player, both promotion prompts are opened in that order, and each is answered before the next is raised. If both players end with no Pokémon, [S04.T10](T10-termination-stall-and-determinism.md) resolves it as a tie by its documented rule, not here.
- **A knockout with an empty bench** → no promotion prompt is opened, `active` stays `None`, and the sweep reports the condition; [S04.T10](T10-termination-stall-and-determinism.md) turns it into `EndReason::NoPokemon` at the next check point. This is the same path a poison knockout takes in [S04.T08](T08-special-conditions-and-checkup.md).
- **The last prize is taken mid-attack** → the prizes are moved immediately and the condition is reported; the remaining targets of a multi-target attack are still resolved, because the rules resolve the attack before checking the win condition, and then the game ends. The legacy resolved this the same way.
- **`prize_value` is 3 but only 2 prizes remain** → two are taken, capped by `prizes.len()`; the game ends on the last one. Taking "up to N" is the rule, and an uncapped move would leave the prize zone negative.
- **A benched target protected by the Tera rule hit by an effect that places counters** → the counters land. Tera prevents attack *damage*, and a counter is not damage; `pokemon/tests/test_rules.py` asserts exactly this (`tera.hp == hp0 − 20` after `PlaceCountersOnEach(2)`).
- **An attack that says "this attack's damage isn't affected by Weakness or Resistance"** → stage 5 is skipped entirely; `weakness_applied` and `resistance_applied` are both false in the `DamageCalc`, so a scenario can tell "skipped" from "not applicable".
- **A halving or dividing effect producing 45** → stage 8 rounds down to 40. Rounding up would create free damage; the rulebook's damage values are always multiples of 10, so a non-multiple is always the result of our arithmetic, not of a card.
- **`damage_out` summing to a negative larger than the base** → `final` floors at 0 and `prevented` stays false; a zero-damage attack still counts as an attack (the turn still ends, `attack_used` still fires), but stage 9 does not fire because no damage was dealt.
- **A `would_be_knocked_out` replacement on a target that is already at `hp_max` damage** before this attack → the hook is consulted with the prospective total, which is already at or above the maximum; a replacement that says "survives with 10 HP" sets the damage to `hp_max − 10` regardless of how much was accumulated, and fires only once per target per attack.
- **An effect places counters on a Pokémon whose owner is the source's owner** (self-damage) → `prevent_effects` returns false for one's own effects, matching the legacy rule that a card may confuse or damage itself freely; the `by` field is what makes that distinction possible.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core damage` green, including `> plus_applies_before_weakness` (base 60, +20, Weakness → 160) and `> minus_applies_after_resistance` (RN-13).
- [ ] Scenarios `engine/scenarios/rules/weakness-x2.json` (60 → 120), `rules/resistance-minus-30.json` (60 → 30) and `rules/bench-damage-no-wr.json` (bench target takes 60, not 120) pass under [S04.T13](T13-scenario-format-and-runner.md) (RN-13, RN-14).
- [ ] Scenario `rules/tera-bench.json`: a benched Tera takes 0 from a 200-damage attack, 20 from two damage counters, and normal damage once it is the Active (RN-15).
- [ ] `> counters_are_blocked_by_counters_blocked` and `> own_effect_is_not_blocked_by_prevent_effects` with stub hooks (RN-14, BR-S04.T07-09).
- [ ] `> stage_order_is_as_documented`: the recorded hook-call sequence for one Active resolution equals `[tera, prevent_damage, damage_out, weakness, resistance, damage_in, would_be_knocked_out, damaged_by_attack]` (BR-S04.T07-01).
- [ ] `> final_damage_is_a_multiple_of_ten` over 10,000 randomised resolutions, and `> a_halving_effect_rounds_down` (90 → 40) (BR-S04.T07-03).
- [ ] `> two_copies_of_a_no_stack_bonus_count_once` and `> two_different_bonuses_both_count` (BR-S04.T07-04, RN-17's mechanism).
- [ ] `> an_ex_awards_two_prizes`, `> prize_award_is_capped_by_remaining_prizes` and scenario `rules/double-knockout.json` with two promotion prompts in sweep order (BR-S04.T07-07, -08).
- [ ] `> survive_at_ten_hp_replacement`: with a stub `would_be_knocked_out`, a lethal attack leaves the slot at `hp_max − 10` and `replaced = true` (BR-S04.T07-06).
- [ ] `cargo test -p ptcg-core --features invariants fuzz_random_actions` — 10,000 games with damage enabled, no invariant panic, no negative or non-multiple damage value observed.

## Risks and open questions

- **Risk — the stage order is right for today's cards and wrong for a future one.** Mitigation: the order is a documented list, a recorded test and a set of scenarios; changing it changes the engine build hash, which makes every piece of evidence stale ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)) and every fingerprint different (RN-50) — loud, which is what a rules change should be.
- **Risk — attacker-side `+N` on bench targets.** The legacy skips it, reasoning that such bonuses are written as "your opponent's Active Pokémon". A card that boosts damage to any target would be mis-modelled. Mitigation: the rule is stated in RN-14 and in the stage table; [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) can declare a modifier with `scope: global` that the bench branch also consults, and the first such card triggers a documented amendment here.
- **Risk — the knockout sweep order differs from "the turn player chooses".** The rulebook lets the turn player order simultaneous resolutions; a fixed order is a documented approximation. Mitigation: the order is in BR-S04.T07-07 and in the scenario; the practical difference is limited to prompts, and the approximation is recorded so a measurement is never presented as more exact than it is.
- **Question — should `DamageCalc` be produced for counters as well?** Today `place_counters` returns only the number placed. A uniform record would make scenarios simpler but would suggest counters go through stages they do not. Recommendation: keep them distinct; scenarios assert counters with `expect: { counters }`.
- **Question — should recoil and self-damage go through `resolve_one`?** Recoil is damage to your own Pokémon, so Weakness does not apply (it is not the opponent's Active) and the bench branch already handles it. Recommendation: route self-damage through `resolve_one` with the attacker as target, so prevention and reduction apply; confirm against the first recoil card coded in S05.

## References

- `pokemon/src/pokesearch/sim/status.py` — verified: `_calculate_damage` with the order in its docstring (`+N` before Weakness/Resistance, `−N` after), the Tera check first, the `no_target_effects@atk` bypass evaluated before prevention, the temporary clearing of `target.resistance` / `target.weakness` for `no_resistance@atk` / `no_weakness`, and `after_damage_reduction` fired only when a reduction applied; `attack_damage_to` with the Active-versus-bench split and its comment that bench targets keep prevention and reduction but not Weakness/Resistance (RN-14); `tera_protected` (RN-15); `_sum_hooks` deduplicating by `no_stack_key` (RN-17); `reduce_effect_action` filtering engine-placed counters through `counters_blocked` with `is_damage` marking attack damage. Consult for the order and the edge semantics; nothing is ported.
- `pokemon/tests/test_rules.py::test_tera_rule_prevents_attack_damage_on_the_bench_only` — verified: 200 damage to a benched Tera is 0, a bench-damage attack leaves HP unchanged, two damage counters remove 20, and the same Pokémon in the Active spot takes damage normally; the docstring notes 0.53 % of the meta counted as exact without the rule.
- `pokemon/tests/test_status.py::test_turn_effects_expire_and_modify_damage` — verified: `damage_minus_30` on the target plus `damage_plus_20` on the source gives `60 + 20 − 30 = 50`, the arithmetic RN-13 describes.
- [S04.T02](T02-card-definition-model.md) — `CardDef::prize_value` (RN-19) and the printed weakness/resistance values this pipeline reads.
- [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) — the consumer of the seven hook names and of the `damaged_by_attack`/`knocked_out` trigger names declared here.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
