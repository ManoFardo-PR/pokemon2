# S04.T08 — Special Conditions and Pokémon Checkup

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 8 / 18 |
| Depends on | [S04.T07](T07-damage-pipeline.md) |
| Unblocks | [S04.T13](T13-scenario-format-and-runner.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) |
| Parallel with | [S04.T10](T10-termination-stall-and-determinism.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` damage pipeline (`place_counters`, `knock_out`, promotion prompts) — from [S04.T07](T07-damage-pipeline.md)
- `doc` ESPECIFICACAO.md RN-12
- `file` `pokemon/src/pokesearch/sim/status.py` and `pokemon/tests/test_status.py` — the condition semantics, the checkup order and the eight legacy assertions; read-only reference

## Outputs (proposed)
- `module` `ptcg-core::conditions` — `apply_condition(slot, cond)` with the exclusive set {Asleep, Paralyzed, Confused} and coexisting {Poisoned, Burned}; `clear_conditions(slot)` on bench/evolve/retreat/switch; action filters (Asleep/Paralyzed: no attack, no retreat; Confused: coin on attack, tails = 30 self-counters and no attack); `ptcg-core::checkup` — between-turns procedure: Poison 10 (+`extra_poison`), Burn 20 + coin, Sleep coin, Paralysis clears after the owner's turn, checkup counters (hook), turn-effect expiry, end-of-turn discards (hook), then KO/promotion prompts — consumed by [S04.T13](T13-scenario-format-and-runner.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)
- `contract` the checkup is a resumable procedure: it may suspend on prompts (promotion after a poison KO for either player) and resume; `block_conditions` modifiers cure existing conditions immediately

## Initial objective
Special Conditions behave per rulebook with a checkup that can ask the players questions instead of guessing (the legacy engine had no conditions at all and auto-resolved checkup KOs).

## Context

The third-party engine the legacy used had no Special Conditions whatsoever. `pokemon/src/pokesearch/sim/status.py` exists to add them from outside, and its module docstring is the complete rule set in five lines: Poisoned 10, Burned 20 then a coin (heads cures), Asleep blocks attacking and retreating with a coin at checkup, Paralyzed blocks the same and is removed at the checkup after its owner's turn, Confused flips a coin on attacking with tails meaning the attack fails and the Pokémon takes 30. Asleep, Paralyzed and Confused are mutually exclusive; Poisoned and Burned coexist with everything. Going to the bench or evolving clears everything, and applying a condition to a benched Pokémon is ignored.

That module also records the one thing it could not do, and the reason: *"Nocaute durante o checkup não pode abrir prompts (`next_turn` não é gerador): descarte, prêmios do topo para a mão do adversário e substituição automática do Ativo pelo Pokémon do banco com mais HP e energia."* A poison knockout between turns had to promote a replacement by itself, choosing the benched Pokémon with the most HP and energy, because the engine's turn-switch routine was a plain function and could not suspend. That is a real distortion: which Pokémon comes up after a knockout is one of the most consequential decisions in a game, and the legacy made it by heuristic for both players.

Here the checkup is a phase, not a function call ([S04.T04](T04-setup-and-turn-structure.md) sets `phase = BetweenTurns`), and it is a resumable procedure with an explicit step cursor. When a poison knockout empties an Active spot, the checkup suspends on a `promote_after_ko` prompt, the driver answers it, and `resume` continues from the same step. Both players can be knocked out in the same checkup; both prompts are raised in order.

The second correction is subtler and comes from the legacy's `refresh_field`: a modifier that blocks conditions (Festival Grounds-style) cures the existing ones **at the moment it becomes true**, not at the next checkup. The comment is explicit — a Confused Active that receives the relevant energy attacks without flipping a coin that same turn. That behaviour is preserved here through the `block_conditions` hook being consulted both by `apply_condition` and by a board-change sweep, rather than only inside the checkup.

The ordering inside the checkup matters for one commonly asserted case: damage comes before the coin. A Burned Pokémon takes its 20 and only then flips to see whether it is cured, which is why `pokemon/tests/test_status.py::test_burned_takes_20_on_checkup_and_a_heads_cures_it` asserts `hp0 − 20` after the first checkup regardless of the flip. Checkup counters placed by abilities (Froslass-style) are gathered from targets read **before** any knockout, so the result does not depend on the order in which Pokémon fall.

## Scope

- **In scope.** The `Conditions` semantics — application, exclusivity, clearing on leaving the Active spot and on evolving; the action filters Asleep/Paralyzed impose (consumed by predicate 5 of [S04.T05](T05-actions-and-legality.md)); the Confusion coin on attacking, including the 30 self-damage and the failed attack; the checkup procedure with its ordered steps, its suspension points and its cursor; turn-effect and player-effect expiry; the four hook seams `extra_poison`, `checkup_counters`, `end_of_turn_discard`, `block_conditions`; the coin-flip helper and its RNG discipline.
- **Out of scope.** The damage arithmetic itself ([S04.T07](T07-damage-pipeline.md)) — checkup damage calls `place_counters` with `SourceKind::Condition`; the promotion prompt's shape and validation ([S04.T09](T09-prompt-protocol.md)); end-of-game detection after a checkup knockout ([S04.T10](T10-termination-stall-and-determinism.md)); which card applies which condition (S05); the modifier index behind the four hooks ([S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)); how a bot answers a promotion prompt ([S04.T11](T11-baseline-bots-random-heuristic.md), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-12 | **Kept.** Poisoned places 10 damage at each checkup (plus `extra_poison`); Burned places 20 then flips a coin, heads cures. Asleep and Paralyzed block attacking and retreating; Asleep flips at each checkup, heads wakes; Paralyzed is removed at the checkup that follows its owner's turn. Confused flips on attacking: tails means the attack fails and the Pokémon takes 30 self-damage. Asleep/Paralyzed/Confused are mutually exclusive; Poisoned and Burned coexist with them and with each other. Moving to the bench or evolving clears every condition, and a condition applied to a benched Pokémon is ignored. | `conditions::apply_condition` (exclusivity, Active-only), `conditions::blocks_attack` / `blocks_retreat` (predicate 5 of [S04.T05](T05-actions-and-legality.md)), `conditions::confusion_check` (attack path of [S04.T07](T07-damage-pipeline.md)), `checkup::run` steps 2–6, `Game::evolve_onto` / `promote` / retreat calling `Conditions::clear_all` | `conditions.rs > poison_places_ten_each_checkup`; `> burn_places_twenty_then_flips`; `> heads_cures_burn`; `> asleep_blocks_attack_and_retreat`; `> asleep_wakes_on_heads`; `> paralysis_clears_after_its_owners_turn`; `> confusion_tails_fails_the_attack_and_deals_thirty`; `> exclusive_conditions_replace_each_other`; `> poisoned_and_burned_coexist`; `> bench_clears_conditions`; `> applying_to_a_benched_pokemon_is_ignored`; scenarios `rules/poison-checkup.json`, `rules/burn-coin.json`, `rules/sleep-block.json`, `rules/paralysis-timing.json`, `rules/confusion-tails.json` |
| BR-S04.T08-01 | The checkup is a resumable procedure with an explicit cursor: `checkup::run` returns `Pending` when a prompt must be answered and `checkup::resume` continues from the same step, never re-running a completed one. A cloned state mid-checkup resumes independently. | `CheckupCursor { player: u8, step: CheckupStep, slot: SlotIdx }` stored in `Game`; `run`/`resume` | `checkup.rs > a_prompt_suspends_and_resumes_at_the_same_step`; `> a_clone_mid_checkup_resumes_independently`; `> no_step_runs_twice` (recorded step log) |
| BR-S04.T08-02 | The order inside one player's checkup is fixed: (1) `block_conditions` sweep, (2) poison damage, (3) burn damage, (4) knockout check, (5) burn coin, (6) sleep coin, (7) paralysis removal, (8) bench condition clear, (9) turn-effect and player-effect expiry, (10) `end_of_turn_discard` hook. Player 0 is processed before player 1, then `checkup_counters` runs once for the whole board. | `checkup::run` as a `match` on `CheckupStep` in that order | `checkup.rs > step_order_is_as_documented` (recorded step log equals the expected list) |
| BR-S04.T08-03 | Damage comes before the coin: a Burned Pokémon takes its 20 at every checkup it starts Burned in, including the one that cures it. Poison and Burn damage are summed and placed in one `place_counters` call, so a single knockout check follows. | `checkup::run` steps 2–4 | `checkup.rs > burn_damage_precedes_the_cure_coin` (HP drops by 20 even when the flip is heads) |
| BR-S04.T08-04 | Paralysis is removed at the checkup that follows **its owner's** turn, not at the next checkup. A Pokémon paralysed during its owner's own turn therefore loses the condition after the opponent's turn. | `checkup::run` step 7 comparing `game.current` with the slot's owner | `checkup.rs > paralysis_survives_the_opponents_checkup`; `> paralysis_clears_after_its_owners_turn` |
| BR-S04.T08-05 | `block_conditions` cures immediately: the sweep runs at checkup step 1 **and** whenever `board_version` changes, so a Confused Active that becomes protected during its owner's turn attacks without flipping that same turn. | `conditions::block_sweep(game)` called from `touch_board`'s consumer and from `checkup::run` step 1 | `conditions.rs > a_blocking_modifier_cures_immediately_not_at_checkup` |
| BR-S04.T08-06 | Only the Active can carry a condition: `apply_condition` on a benched slot is a no-op returning `false`, and every bench slot's conditions are cleared at checkup step 8 as a safety net. | `conditions::apply_condition` first guard; `checkup::run` step 8 | `conditions.rs > applying_to_a_benched_pokemon_is_ignored`; `checkup.rs > bench_conditions_are_cleared` |
| BR-S04.T08-07 | Checkup counters from abilities are computed against the target list read **before** any knockout in that checkup, so the result does not depend on the order in which Pokémon fall; each source is filtered by `counters_blocked` with `kind: Ability` and the source's owner as `by`. | `checkup::checkup_counters` snapshotting targets first | `checkup.rs > checkup_counters_targets_are_snapshotted`; `> a_blocked_source_places_nothing` |
| BR-S04.T08-08 | Every coin flip in the checkup draws from `Game::rng` exactly once, in the documented order (burn, then sleep, per player, per slot); no flip is conditional on a bot decision, so the RNG stream is a function of the game state alone. | `checkup::flip(game)`; the only randomness in the module | `checkup.rs > rng_draw_count_per_checkup_is_deterministic` (same state, same seed → same draw count and same results, 1,000 repetitions) |
| BR-S04.T08-09 | A turn effect expires when `until < turn_no`, evaluated at checkup step 9 for both the slot-level and the player-level lists; nothing else removes a turn effect. | `checkup::expire_effects` | `checkup.rs > a_one_turn_effect_survives_the_opponents_turn_and_expires_on_mine` (the legacy's `no_retreat` timing) |

## Data operations

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `Slot::conditions` | flag set, exclusive group replaced | `apply_condition`, Active only | at most one of Asleep/Paralyzed/Confused; Poisoned and Burned independent (RN-12) |
| `Slot::conditions` | `clear_all()` | retreat, switch, promote, `evolve_onto`, `block_conditions` sweep | a slot that leaves the Active spot always arrives condition-free (RN-12, BR-S04.T08-05) |
| `Slot::damage` | `+= 10 (+ extra_poison)` and/or `+= 20` in one call | checkup steps 2–3 | applied through `place_counters` with `SourceKind::Condition`, so `counters_blocked` is honoured |
| `Slot::damage` | `+= 30` | Confusion tails, on the attacking Pokémon | placed as self-damage before the attack is abandoned; the attack deals nothing |
| `Slot::damage` | `+= n * 10` | checkup `checkup_counters` hook | targets snapshotted before knockouts (BR-S04.T08-07) |
| `Slot` → discard, prizes → hand | `knock_out` | checkup step 4 and after `checkup_counters` | the whole stack moves; prizes capped by the remaining count ([S04.T07](T07-damage-pipeline.md)) |
| `Game::pending_prompt` | `promote_after_ko` | checkup knockout with a non-empty bench | the checkup suspends; `CheckupCursor` records where (BR-S04.T08-01) |
| `Slot::turn_effects`, `Player::turn_effects` | entries with `until < turn_no` removed | checkup step 9 | the only removal path (BR-S04.T08-09) |
| `Slot::tools`, `Slot::energies` → discard | cards moved | checkup step 10, `end_of_turn_discard` hook | the hook is empty in this stage ([S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) fills it) |
| `Player::markers` (`second_attack`) | cleared | checkup step 10 | "attack again" is once per turn; matches the legacy reset in `next_turn` |
| `Game::rng` | advanced once per coin flip | checkup steps 5–6, Confusion check | flip order is fixed (BR-S04.T08-08) |
| `Game::phase` | stays `BetweenTurns` until the checkup reports `Done` | whole procedure | a pending prompt does not switch the turn ([S04.T04](T04-setup-and-turn-structure.md)) |
| `Game::events` | `ConditionApplied`, `ConditionCleared`, `CheckupDamage`, `CoinFlip` appended | each step, only when logging | a replay can reproduce the coin results without re-running the RNG |
| the database | — | never | the engine holds no connection |

## Interfaces

```rust
// ptcg-core::conditions
pub fn apply_condition(game: &mut Game, t: Target, cond: u8, src: Source) -> bool;   // false when ignored
pub fn clear_conditions(game: &mut Game, t: Target);
pub fn blocks_attack(game: &Game, t: Target) -> bool;    // Asleep | Paralyzed
pub fn blocks_retreat(game: &Game, t: Target) -> bool;   // Asleep | Paralyzed
pub(crate) fn confusion_check(game: &mut Game, attacker: Target) -> ConfusionResult;
pub(crate) fn block_sweep(game: &mut Game);              // BR-S04.T08-05

pub enum ConfusionResult { NotConfused, Heads, Tails }   // Tails: 30 self-damage, attack abandoned

// ptcg-core::checkup
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CheckupStep {
    BlockSweep, PoisonDamage, BurnDamage, KnockoutCheck, BurnCoin, SleepCoin,
    ParalysisRemoval, BenchClear, ExpireEffects, EndOfTurnDiscard, Counters, Done,
}

#[derive(Debug, Clone, Copy)]
pub struct CheckupCursor { pub player: PlayerIdx, pub step: CheckupStep, pub slot: SlotIdx }

pub(crate) fn run(game: &mut Game) -> CheckupState;      // starts at (player 0, BlockSweep)
pub(crate) fn resume(game: &mut Game) -> CheckupState;   // continues from game.checkup_cursor
pub enum CheckupState { Pending, Done }

pub(crate) fn flip(game: &mut Game) -> Coin;             // the only RNG consumer here
pub enum Coin { Heads, Tails }

pub const POISON_DAMAGE: u16 = 10;
pub const BURN_DAMAGE: u16 = 20;
pub const CONFUSION_SELF_DAMAGE: u16 = 30;
```

**Hook shapes** — consumed verbatim by [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md); these four names must not change:

```rust
pub(crate) mod hooks {
    /// Extra poison damage per checkup, in points (a "poison is 30 instead of 10" card returns 20).
    pub fn extra_poison(game: &Game, t: Target) -> u16;

    /// Damage counters placed on `t` during each checkup by an in-play source.
    /// Returns (source_card, counters) pairs so counters_blocked can filter per source.
    pub fn checkup_counters(game: &Game, t: Target) -> SmallVec<[(CardIdx, u16); 2]>;

    /// Attachments that discard themselves at the end of the turn (Ignition Energy-style).
    pub fn end_of_turn_discard(game: &Game, p: PlayerIdx) -> SmallVec<[CardIdx; 2]>;

    /// A modifier that prevents Special Conditions; also cures existing ones (BR-S04.T08-05).
    pub fn block_conditions(game: &Game, t: Target) -> bool;
}
```

**Condition semantics table** (the whole of RN-12 in one place):

| Condition | Blocks attack | Blocks retreat | At checkup | Exclusive with |
|---|---|---|---|---|
| Asleep | yes | yes | coin; heads wakes | Paralyzed, Confused |
| Paralyzed | yes | yes | removed at the checkup after its owner's turn | Asleep, Confused |
| Confused | no (coin on attacking; tails = attack fails, 30 self-damage) | no | nothing | Asleep, Paralyzed |
| Poisoned | no | no | 10 damage + `extra_poison` | — |
| Burned | no | no | 20 damage, then a coin; heads cures | — |

**The checkup as the driver sees it:**

```text
end_turn()                       phase = BetweenTurns
  checkup::run(game)
    player 0: BlockSweep → PoisonDamage → BurnDamage → KnockoutCheck ──┐
              → BurnCoin → SleepCoin → ParalysisRemoval → BenchClear  │ may return Pending
              → ExpireEffects → EndOfTurnDiscard                      │ (promote_after_ko)
    player 1: the same steps                                          │
    Counters (whole board, targets snapshotted first) ────────────────┘
  → Done
phase = Turn; current flips; start_turn()
```

## Implementation steps

1. Implement `apply_condition` with the Active guard and the exclusivity rule, `clear_conditions`, and wire `Conditions::clear_all` into retreat, switch, promote and `evolve_onto`; spec the four semantics tests (RN-12, BR-S04.T08-06). `cargo test` green.
2. Implement `blocks_attack` / `blocks_retreat` and wire them into predicate 5 of [S04.T05](T05-actions-and-legality.md); spec that an Asleep or Paralyzed Active offers neither `Attack` nor `Retreat` (RN-12).
3. Implement `confusion_check` and call it at the start of the attack path in [S04.T07](T07-damage-pipeline.md); spec that tails deals 30 self-damage and the attack deals nothing, and that heads resolves normally (RN-12).
4. Implement `flip` on `Game::rng` and the `CheckupStep` / `CheckupCursor` machinery with a recorded step log under `cfg(test)`; spec the order (BR-S04.T08-02).
5. Implement steps 2–4 (poison, burn, knockout check) with a single `place_counters` call and the `extra_poison` hook; spec `> poison_places_ten_each_checkup` and `> burn_damage_precedes_the_cure_coin` (RN-12, BR-S04.T08-03).
6. Implement steps 5–7 (burn coin, sleep coin, paralysis removal with the owner comparison); spec `> asleep_wakes_on_heads`, `> paralysis_survives_the_opponents_checkup`, `> paralysis_clears_after_its_owners_turn` (RN-12, BR-S04.T08-04).
7. Implement steps 8–10 (bench clear, effect expiry, `end_of_turn_discard`, `second_attack` reset); spec the expiry timing test (BR-S04.T08-09).
8. Implement the suspension protocol: a checkup knockout with a non-empty bench sets `promote_after_ko` and returns `Pending`; `resume` continues from the cursor. Spec `> a_prompt_suspends_and_resumes_at_the_same_step`, `> no_step_runs_twice` and `> a_clone_mid_checkup_resumes_independently` (BR-S04.T08-01).
9. Implement `checkup_counters` with the target snapshot and the per-source `counters_blocked` filter; spec both tests (BR-S04.T08-07).
10. Implement `block_sweep` and call it on board changes as well as at step 1; spec the immediate cure (BR-S04.T08-05).
11. Write the five `engine/scenarios/rules/*.json` condition scenarios and check them against the corresponding legacy assertions in `pokemon/tests/test_status.py`.

## Edge cases and error handling

- **A poison knockout with an empty bench** → no promotion prompt is raised, the Active spot stays empty, the checkup continues to the next step and finishes; [S04.T10](T10-termination-stall-and-determinism.md) then ends the game with `EndReason::NoPokemon`. The checkup never invents a Pokémon and never ends the game itself.
- **A poison knockout with several benched Pokémon** → the checkup suspends on a `promote_after_ko` prompt owned by the knocked-out player, even though it is not their turn. This is the case the legacy could not express and resolved by heuristic (highest HP, then most energy).
- **Both Actives are knocked out in the same checkup** (both poisoned to zero) → player 0's knockout and prompt are processed first, then player 1's; each prompt is answered before the next is raised, and both prize awards happen. If both benches are empty the game is a tie by [S04.T10](T10-termination-stall-and-determinism.md)'s rule.
- **A Pokémon that is both Poisoned and Burned** → 10 + 20 = 30 damage in one `place_counters` call, then one knockout check, then the burn coin. Summing before the check means a Pokémon at 30 damage from full is knocked out once, not twice.
- **`extra_poison` returns a value while the Pokémon is not Poisoned** → ignored; the hook is consulted only inside the poison branch, matching the legacy guard.
- **A Confused Pokémon whose attack is free and deals no damage** → the coin is still flipped, because Confusion is checked when the attack is *used*, not when damage is dealt; tails still deals 30 and abandons the attack.
- **A condition applied by an effect to a Pokémon protected by `block_conditions`** → `apply_condition` returns `false` and nothing is recorded; the effect that tried does not retry.
- **A `block_conditions` modifier that appears mid-turn** → `block_sweep` runs on the board change and clears the conditions immediately, so the same turn's attack skips the Confusion coin. Waiting for the checkup would be a turn late.
- **A checkup prompt answered with a slot index that is not a benched Pokémon** → rejected by the prompt validator, counted as an invalid answer (RN-21) and replaced by the deterministic default (the lowest occupied bench index), which keeps the checkup deterministic even with a broken bot ([S04.T09](T09-prompt-protocol.md)).
- **A `checkup_counters` source that is itself knocked out earlier in the same checkup** → it still places its counters, because the target list and the source list are both snapshotted before any knockout; the legacy made the same choice for the same reason.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core conditions` green: `> exclusive_conditions_replace_each_other`, `> poisoned_and_burned_coexist`, `> bench_clears_conditions`, `> applying_to_a_benched_pokemon_is_ignored` (RN-12).
- [ ] `cargo test -p ptcg-core checkup` green: `> poison_places_ten_each_checkup` (20 damage after two checkups), `> burn_damage_precedes_the_cure_coin`, `> asleep_wakes_on_heads`, `> paralysis_clears_after_its_owners_turn` (RN-12, BR-S04.T08-03, -04).
- [ ] `> confusion_tails_fails_the_attack_and_deals_thirty`: with a seed producing tails, the defender's damage is unchanged and the attacker's damage is 30 (RN-12).
- [ ] `> asleep_blocks_attack_and_retreat`: with the Active Asleep, `legal_actions` contains neither `Attack` nor `Retreat`; after waking, both return (RN-12).
- [ ] Scenarios `engine/scenarios/rules/poison-checkup.json`, `rules/burn-coin.json`, `rules/sleep-block.json`, `rules/paralysis-timing.json` and `rules/confusion-tails.json` pass under [S04.T13](T13-scenario-format-and-runner.md).
- [ ] `> a_prompt_suspends_and_resumes_at_the_same_step` and `> no_step_runs_twice`: a poison knockout with two benched Pokémon suspends, the prompt is answered, and the recorded step log contains each step exactly once (BR-S04.T08-01).
- [ ] `> step_order_is_as_documented`: the recorded step log equals `[BlockSweep, PoisonDamage, BurnDamage, KnockoutCheck, BurnCoin, SleepCoin, ParalysisRemoval, BenchClear, ExpireEffects, EndOfTurnDiscard]` per player, then `Counters` (BR-S04.T08-02).
- [ ] `> rng_draw_count_per_checkup_is_deterministic`: the same state and seed produce the same number of flips and the same results over 1,000 repetitions (BR-S04.T08-08).
- [ ] `> a_one_turn_effect_survives_the_opponents_turn_and_expires_on_mine`, reproducing the legacy `no_retreat` timing assertion (BR-S04.T08-09).
- [ ] `> a_blocking_modifier_cures_immediately_not_at_checkup` with a stub `block_conditions` (BR-S04.T08-05).

## Risks and open questions

- **Risk — the resumable checkup is the most intricate control flow in the engine.** A cursor that is advanced in the wrong place re-runs a step or skips one, and both are silent. Mitigation: the recorded step log is a first-class test artifact (`> no_step_runs_twice`, `> step_order_is_as_documented`) and the fuzz loop of [S04.T05](T05-actions-and-legality.md) runs with it enabled under `--features invariants`.
- **Risk — coin flips inside the checkup change the RNG stream when a condition is added.** A game where a Pokémon becomes Burned consumes more randomness than one where it does not, which is correct but means two "similar" games diverge. Mitigation: that is exactly why bot streams are separate from the game stream ([S04.T10](T10-termination-stall-and-determinism.md)); paired-seed comparisons ([S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md)) stay paired because both sides play the same seeded game.
- **Risk — the promotion prompt for a player whose turn it is not** surprises a bot that assumes it only acts on its own turn. Mitigation: `Prompt::actor` is explicit ([S04.T09](T09-prompt-protocol.md)) and the default resolver covers `promote_after_ko` for every bot, so a bot that ignores the case still plays legally.
- **Question — should Paralysis removal be "after the owner's turn" or "after the owner's next turn ends"?** The legacy compares `state.turn == owner.id` at the checkup, which means the condition is removed at the checkup that follows a turn played by the owner. Recommendation: keep the legacy timing, which matches the rulebook reading, and pin it with `rules/paralysis-timing.json`; if a rulebook page says otherwise, the scenario is the single place to change.
- **Question — should the checkup place condition damage as counters or as pipeline damage?** Counters, because conditions are effects and the rulebook never applies Weakness to them. Recommendation: keep `place_counters` with `SourceKind::Condition`; the open point is whether `counters_blocked` should stop condition damage at all, which the first card that says so will settle in S05.

## References

- `pokemon/src/pokesearch/sim/status.py` — verified: the module docstring stating the full RN-12 rule set and the note that a checkup knockout could not open prompts, so the Active was replaced automatically by the benched Pokémon with the most HP and energy; `apply_condition` with the Active guard, the `effects_blocked` check and the exclusivity set; `checkup()` with its step order (block sweep, poison + burn damage summed, knockout, burn coin, sleep coin, paralysis when `state.turn == owner.id`, bench clear, effect expiry, `end_of_turn` attachments) and `_checkup_counters` reading targets before any knockout; `refresh_field`'s note that a blocking modifier cures conditions at the moment it becomes true, so a Confused Active attacks without a coin that same turn. Consult for the semantics; nothing is ported.
- `pokemon/tests/test_status.py` — verified: `test_poison_damages_on_checkup_and_bench_is_cleared` (330 → 320 → 310; a benched Pokémon is not poisoned), `test_asleep_and_paralyzed_block_attack_and_retreat`, `test_confused_tails_hurts_itself` (attacker 70 → 40, defender unchanged), `test_turn_effects_expire_and_modify_damage` (a one-turn `no_retreat` survives the opponent's checkup and expires at the owner's), `test_knockout_by_poison_takes_prize_and_promotes_bench` (one prize moves to the hand, a benched Charmander is promoted), `test_burned_takes_20_on_checkup_and_a_heads_cures_it` (the 20 lands before the coin), `test_burned_and_poisoned_stack_but_burned_replaces_nothing`. These eight become the condition scenarios of [S04.T13](T13-scenario-format-and-runner.md).
- [S04.T07](T07-damage-pipeline.md) — `place_counters`, `knock_out` and the `counters_blocked` filter the checkup calls.
- [S04.T04](T04-setup-and-turn-structure.md) — the `BetweenTurns` phase and the rule that a pending prompt delays the turn switch.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-12; [Glossary](../../project/07-glossary.md) "Special Conditions", "Pokémon Checkup", "Turn effect".

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
