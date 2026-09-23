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
- `file` `pokemon/src/pokesearch/sim/status.py` (`HOOK_NAMES`, `refresh_field`, `_field_modifiers`, `ACTIVE_HOOKS`) — read-only reference

## Outputs (proposed)
- `module` `ptcg-core::ir::modifiers` — modifier index rebuilt lazily on `board_version` change: for each hook, the ordered list `(slot, card, modifier)` of contributors (attached tools, attached special energies, in-play Pokémon passives on both sides, the stadium), with `scope ∈ self_only | holder | owner_field | global`, `when` conditions, `no_stack_key` (RN-17: one effect per card name); hooks also `hp_max, retreat_cost, bench_size, weakness_override, block_abilities, block_tools, block_special_energy, grant_attacks, evolve_same_turn, no_counter_move`
- `module` `ptcg-core::ir::triggers` — events `play_from_hand, evolve, enter_bench, attach_energy, attack_used, damaged_by_attack, would_be_knocked_out, knocked_out, end_of_turn, between_turns, opponent_attack_done, stadium_played`; resolution order: active player's slots in order, then opponent's (documented approximation of 'turn player chooses')
- `contract` `ModifierIndex::query(hook, ctx) → impl Iterator<Item = (SlotRef, CardIdx, &Modifier)>` — the single call site every hook consumer uses, so no hook is ever read by walking the board by hand

## Initial objective
Passive effects (tools, stadiums, abilities, special energies) apply through one indexed mechanism that is recomputed only when the board changes, eliminating the legacy's per-action reconciliation loop and its 1.6 million empty hook calls.

## Context

Effect programs ([S05.T04](T04-ir-compiler-and-vm.md)) answer "what happens when this card is used". This subtask answers the other two thirds of a card's behaviour: "what is true while this card is in play" and "what happens when something else happens". Tools, stadiums, special energies and passive abilities have no action at all — they are read, not run — and triggers are programs the game starts on its own.

The legacy did this by reconciliation. `status.py::refresh_field(player, state)` recomputed bench size and every Pokémon's retreat cost and max HP from scratch, by walking `_field_modifiers` (the stadium, both players' in-play Pokémon, everything attached to them) and calling each hook by name via `getattr`. It was called before listing actions and at every turn change. The cost is recorded in the file itself: the `_hook` helper exists only because *"1,6 milhão de consultas por 30 partidas terminavam num método que só devolvia zero"*, and `ACTIVE_HOOKS` was added so a class could declare which of the 19 `HOOK_NAMES` its recipe actually uses. Even with that, max HP was a function call per read — `status.py:162` records 23,000 class instantiations just to read max HP — which is why [S04.T03](../04-game-engine-core/T03-game-state-model.md) makes `hp_max(slot)` a query and stores nothing on the instance.

The replacement is an index. `ModifierIndex` holds, per hook, the list of contributing `(slot, card, modifier)` triples, built once and invalidated by `game.board_version` — the counter every op that changes what is in play or what is attached increments ([S05.T04](T04-ir-compiler-and-vm.md)). A hook read is then a slice iteration over the contributors of that one hook, usually empty, with the `when` condition evaluated per query because it depends on the attacker, the target and the current board. A board with a stadium, two tools and four passive abilities contributes to perhaps six of the 23 hooks; the other seventeen are empty slices and cost nothing.

Four business rules land here, and they are all about *whose* state a modifier reads.

**RN-18 — bench size comes from state.** `refresh_field` computed `size = max(5, …bench_size_for hooks…)` and then shrank the bench. Here `bench_size` is a hook like any other, `Player.bench_limit` is the cached answer, and the shrink is a consequence of the limit dropping, not a special case written into Area Zero Underdepths. The rulebook order matters and is implemented here: when the limit falls, the affected player discards benched Pokémon until they are at the limit, the player who played the stadium discards first, and the discarded Pokémon award no prizes.

**RN-17 — "doesn't stack" counts once per card name.** `no_stack_key` deduplicates contributors: two Hop's Snorlax in play contribute their +30 once. The key is the card *name*, not the printing and not the card instance, because that is what the printed text says ("the effect of Snorlax's ability doesn't stack").

**RN-11's bench trigger** — benching a Basic fires field triggers. The legacy had this as a bug and fixed it by hand: the third-party engine's Buddy-Buddy Poffin put Pokémon on the bench outside the reducer, so Risky Ruins' "put 2 damage counters on it" never fired (`catalog.py` L63–64). Here `enter_bench` is an event, every path that puts a Pokémon on the bench raises it — playing from hand, searching to bench, returning from discard, promoting — and the trigger dispatcher does the rest.

**RN-16 — once per turn is per Pokémon unless the text says per name.** The marker the ability program sets is `(slot, code)` by default and `(player, code)` when the code declares `once_scope = 'per_name'`. The legacy derived this from the ability text at class-build time (`catalog_cards.py::_limit_per_name`: the flag is true when the text contains *"can't use more than 1"*); here it is declared on the code ([S05.T07](T07-rule-codes-composition-semantics.md)) and enforced here, which is why both subtasks carry the rule.

## Scope

- **In scope.** `ptcg-core::ir::modifiers` (`ModifierIndex`, `rebuild`, `query`, `no_stack_key` dedupe, the four scopes, the bench-limit cache and the shrink procedure); `ptcg-core::ir::triggers` (`TriggerIndex`, `raise(event, payload)`, the resolution order, re-entrancy limits); the `block_tools`, `block_abilities` and `block_special_energy` suppression semantics; the trigger call sites that this subtask adds to the ops of [S05.T04](T04-ir-compiler-and-vm.md); the scenarios listed under acceptance.
- **Out of scope.** The hooks' own consumers — the damage pipeline stages ([S04.T07](../04-game-engine-core/T07-damage-pipeline.md)), the checkup ([S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md)), cost payment ([S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md)) — which call `query` but do not own it. The IR shape of `Modifier` and `Trigger` ([S05.T03](T03-effect-ir-vocabulary.md)); the VM that runs a trigger's program ([S05.T04](T04-ir-compiler-and-vm.md)); authoring a modifier code ([S05.T07](T07-rule-codes-composition-semantics.md)); builtins ([S05.T06](T06-builtins-escape-hatch.md)); scenario format ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-11 | **Kept** (this subtask owns the bench-trigger correction). Putting a Basic Pokémon onto the Bench by any route — played from hand, searched to bench, returned from the discard pile, promoted after a knockout — raises `enter_bench`, so field triggers fire. The other five corrections belong to [S04.T04](../04-game-engine-core/T04-setup-and-turn-structure.md) and [S04.T05](../04-game-engine-core/T05-actions-and-legality.md). | `Triggers::raise(EnterBench, …)` is called from `Slot::place`, the single function every bench-placing path goes through | `engine/scenarios/rules/bench-trigger-risky-ruins.json` — Buddy-Buddy Poffin benches two Basics under Risky Ruins and each takes 2 damage counters; `modifiers.rs > every bench-placing op raises enter_bench` (call-site test over the op list) |
| RN-16 | **Kept, enforced here** (declared per code in [S05.T07](T07-rule-codes-composition-semantics.md)). "Once during your turn" is per Pokémon instance; it is per card name only when the code declares `once_scope = 'per_name'`, which corresponds to the printed clause "You can't use more than 1 … Ability each turn". | the marker key chosen by `Triggers`/ability dispatch: `(slot, code)` for `per_instance`, `(player, code)` for `per_name`, `(game, code)` for `per_game` | `modifiers.rs > two copies of the same per_instance ability each fire once`; `> two copies of a per_name ability fire once in total`; scenario `abilities/zoroark-trade-two-copies.json` |
| RN-17 | **Kept.** An effect declaring `no_stack_key` is counted once per card name: two in-play copies of the same card contribute one modifier to a hook, and two *different* cards sharing a key also collapse to one. | the dedupe pass in `ModifierIndex::rebuild`, keyed on `(hook, no_stack_key)` and keeping the first contributor in resolution order | `modifiers.rs > two Hop's Snorlax contribute +30 once`; scenario `modifiers/no-stack-two-copies.json` |
| RN-18 | **Kept.** Bench size is read from state, never from a constant: `Player.bench_limit` is the maximum of 5 and every `bench_size` modifier that applies to that player, recomputed whenever the index is rebuilt. | `ModifierIndex::rebuild` writes `bench_limit`; no literal `5` outside its default | `modifiers.rs > bench_limit is 8 with a Tera in play and 5 without`; scenario `modifiers/area-zero-bench-eight.json`; a grep check that `bench_limit` has exactly one writer |
| BR-S05.T05-01 | When `bench_limit` drops below the number of benched Pokémon, the affected player discards benched Pokémon (and everything attached) until they are at the limit, in a prompt they answer themselves; the player who caused the drop discards first; no prizes are awarded. | `shrink_bench(player)` called from `rebuild` when the limit falls, using purpose `promote_after_ko`'s sibling `bench_shrink` | scenario `modifiers/area-zero-shrink-on-leave.json` — the stadium is replaced while both players have 7; both shrink to 5, the stadium's player first, prizes unchanged |
| BR-S05.T05-02 | The modifier index is rebuilt only when `game.board_version` has changed since the last rebuild; a hook query on an unchanged board allocates nothing and touches no card. | `ModifierIndex { built_for: u32 }` compared against `game.board_version` in `query` | `modifiers.rs > 10,000 queries on a static board perform one rebuild`; `benches/modifiers.rs` records the per-query cost |
| BR-S05.T05-03 | `block_tools` disables every tool's modifiers and triggers without detaching the tool; `block_abilities` disables the passives and abilities of the matching Pokémon without removing them; `block_special_energy` disables a special energy's modifiers while its `energy_provision` contribution is decided by [S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md). | the suppression pass runs inside `rebuild`, after collection and before dedupe, so a blocked contributor never enters the index | scenario `modifiers/jamming-tower-disables-tools.json` — a tool's +30 stops applying and the tool is still attached; `modifiers/watchtower-blocks-colorless-abilities.json` |
| BR-S05.T05-04 | `block_conditions` cures the matching Pokémon's existing Special Conditions immediately when the modifier appears, not only at the next checkup. | the post-rebuild pass that calls `remove_conditions` for slots newly covered by a `block_conditions` modifier | scenario `conditions/festival-grounds-cures-on-play.json` — a Poisoned Pokémon with energy attached is cured the moment the stadium enters play |
| BR-S05.T05-05 | Trigger resolution order is: the active player's Active, then their Bench in slot order, then the opponent's Active, then their Bench in slot order, then the stadium. It is deterministic and it is a documented approximation of the rulebook's "the turn player chooses the order". | the fixed iteration in `Triggers::raise`; no hash-map iteration anywhere in the path | `modifiers.rs > trigger order is stable across 1,000 runs and across worker counts`; the approximation is recorded in `docs/rules/IR.md` §Triggers |
| BR-S05.T05-06 | A trigger program cannot raise the same event again more than once: re-entrancy depth is capped at 2 for a given event, and a third attempt is dropped with an event record. | `Triggers::raise` keeps a small event-depth stack on `Game` | `modifiers.rs > a trigger that benches a Pokémon fires enter_bench once and stops` |
| BR-S05.T05-07 | A modifier's `scope` decides whose state its `when` reads: `self_only` applies only when the contributing card's own Pokémon is the subject, `holder` when the holder is, `owner_field` to the contributor's own side, `global` to both. A modifier with the wrong scope is a defect, not a nuance. | `ModifierIndex::query` filters by scope before evaluating `when`; `describe()` renders the scope in the editor | `modifiers.rs > a self_only prevention protects only its own Pokémon` (Crustle); `> an owner_field bonus does not help the opponent` |
| BR-S05.T05-08 | `hp_max(slot)` is always a query through this index and is never cached on a `Slot`; a tool granting +100 HP that is discarded leaves the damage counters in place and can knock the Pokémon out. | `hp_max` is defined only in terms of `query(HpMax, …)`; `Slot` has no `hp_max` field | `modifiers.rs > removing a Hero's Cape from a damaged Pokémon knocks it out`; scenario `modifiers/heros-cape-removed.json` |

## Data operations

This subtask touches no table. Its mutations are of `Game` and of the index derived from it.

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `ModifierIndex.buckets[hook]` | rebuilt from the board | first query after `game.board_version` changed | contributors in resolution order; at most one per `(hook, no_stack_key)` (RN-17) |
| `ModifierIndex.built_for` | set to `game.board_version` | end of a rebuild | a query with `built_for == board_version` rebuilds nothing (BR-S05.T05-02) |
| `Player.bench_limit` | set to `max(5, bench_size modifiers)` | during a rebuild | ≥ 5, ≤ 8; single writer (RN-18) |
| `Player.bench` | discard slots down to `bench_limit` | the limit falls during a rebuild | the affected player chooses; the causing player shrinks first; no prize is awarded (BR-S05.T05-01) |
| `Slot.conditions` | cleared for slots newly covered by `block_conditions` | after a rebuild | only conditions the modifier covers; exclusivity remains [S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md)'s |
| `game.frames` | a trigger program is pushed | `Triggers::raise` finds a matching, unsuppressed `Trigger` whose `when` holds | pushed in resolution order; the VM drains them ([S05.T04](T04-ir-compiler-and-vm.md)) |
| `game.event_depth` | push/pop the raised event | around `Triggers::raise` | depth ≤ 2 per event kind (BR-S05.T05-06) |
| `Slot.markers` / `Player.markers` | the once-per-turn marker for an ability | an ability program completes | key `(slot, code)`, `(player, code)` or `(game, code)` per `once_scope` (RN-16) |
| `game.board_version` | read only | every query | this subtask never increments it; the ops do ([S05.T04](T04-ir-compiler-and-vm.md)) |
| `game.events` | append a suppression or dedupe record | when a contributor is blocked or collapsed | for replay and the editor's explanation panel only |
| any database table | — | never | the engine does not open the database |

## Interfaces

**`ptcg-core::ir::modifiers`**

```rust
pub enum Hook {
    DamageOut, DamageIn, PreventDamage, PreventEffects, CountersBlocked, WouldBeKnockedOut, PrizeValue,
    EnergyProvision, AttackCost, ExtraPoison, CheckupCounters, EndOfTurnDiscard, BlockConditions,
    HpMax, RetreatCost, BenchSize, WeaknessOverride, BlockAbilities, BlockTools, BlockSpecialEnergy,
    GrantAttacks, EvolveSameTurn, NoCounterMove,
}

pub enum Scope { SelfOnly, Holder, OwnerField, Global }

pub struct HookCtx<'a> {
    pub subject: SlotRef,              // the Pokémon the hook is being asked about
    pub other: Option<SlotRef>,        // attacker when asking damage_in, target when asking damage_out
    pub side: PlayerIdx,               // the player the answer is for (hook_owner inside `when`)
    pub attack: Option<AttackRef>,
    pub game: &'a Game,
}

pub struct ModifierIndex { built_for: u32, buckets: [SmallVec<[Contributor; 4]>; HOOK_COUNT] }

pub struct Contributor { pub slot: Option<SlotRef>, pub card: CardIdx, pub modifier: Arc<Modifier> }

impl ModifierIndex {
    pub fn query<'a>(&'a mut self, game: &'a Game, hook: Hook, ctx: &HookCtx<'a>)
        -> impl Iterator<Item = &'a Contributor> + 'a;
    pub fn sum_int(&mut self, game: &Game, hook: Hook, ctx: &HookCtx) -> i32;   // damage_out, damage_in, hp_max, retreat_cost
    pub fn max_int(&mut self, game: &Game, hook: Hook, ctx: &HookCtx) -> i32;   // bench_size
    pub fn any(&mut self, game: &Game, hook: Hook, ctx: &HookCtx) -> bool;      // prevent_*, block_*, no_counter_move
    pub fn rebuild(&mut self, game: &mut Game);
}
```

**Collection order inside `rebuild`**, which is also the resolution order: the stadium; then, for each player starting with the active one, the Active slot and then the Bench in slot order, and for each slot the Pokémon's own passive modifiers, then its attached tools in attach order, then its attached special energies in attach order. The three passes that follow are: **suppression** (`block_tools`, `block_abilities`, `block_special_energy` contributors are applied first and remove other contributors), then **dedupe** by `(hook, no_stack_key)` keeping the first, then **bucketing** by hook. Suppression before dedupe matters: Jamming Tower must remove a tool's contribution before that contribution can win a `no_stack_key` race against a Pokémon's.

**Aggregation per hook**, fixed here so no consumer invents its own:

| Hook | Aggregation | Notes |
|---|---|---|
| `damage_out`, `damage_in` | sum | `damage_in` values are negative; [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) applies them at stages 4 and 6 |
| `hp_max` | base + sum | Hero's Cape +100, Gravity Mountain −30 |
| `retreat_cost` | base + sum, floored at 0, then forced to 0 if any contributor says "retreat zero" | the legacy's `refresh_field` did exactly this |
| `bench_size` | max, floored at 5 | RN-18 |
| `attack_cost` | base + sum of deltas, per symbol | Nighttime Mine +1, Sparkling Crystal −1 |
| `energy_provision` | union of provided types, resolved at payment time | [S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md) |
| `prize_value` | base + sum, floored at 1 | Lillie's Pearl −1 |
| `extra_poison`, `checkup_counters` | sum | [S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md) |
| `prevent_damage`, `prevent_effects`, `counters_blocked`, `block_*`, `no_counter_move`, `evolve_same_turn` | any | a single contributor is enough |
| `would_be_knocked_out` | first in resolution order | a replacement effect; two would conflict, and the first wins deterministically |
| `weakness_override` | first in resolution order | Lillie's Clefairy ex "Fairy Zone" |
| `grant_attacks` | concatenation in resolution order | the attack list a card gains |
| `end_of_turn_discard` | collect all | each contributor discards itself or its holder's energy |

**`ptcg-core::ir::triggers`**

```rust
pub enum Event {
    PlayFromHand, Evolve, EnterBench, AttachEnergy, AttackUsed, DamagedByAttack,
    WouldBeKnockedOut, KnockedOut, EndOfTurn, BetweenTurns, OpponentAttackDone, StadiumPlayed,
}

pub struct EventPayload { pub subject: Option<SlotRef>, pub source: Option<CardIdx>, pub actor: PlayerIdx, pub amount: i32 }

pub struct Triggers;
impl Triggers {
    /// Pushes a frame per matching trigger, in resolution order. The caller then drains the VM.
    pub fn raise(game: &mut Game, index: &mut ModifierIndex, event: Event, payload: EventPayload) -> u8;
}
```

**Call sites** this subtask adds, so that no event has a silent hole: `Slot::place` → `EnterBench`; `Actions::play_pokemon` → `PlayFromHand`; `Actions::evolve` → `Evolve`; `Energy::attach` → `AttachEnergy`; `damage::resolve_attack` entry → `AttackUsed`, per-target after counters → `DamagedByAttack`, before applying a lethal total → `WouldBeKnockedOut`, after → `KnockedOut`; `turn::end` → `EndOfTurn`; `checkup::run` → `BetweenTurns`; `damage::resolve_attack` exit on the defending side → `OpponentAttackDone`; `Actions::play_stadium` → `StadiumPlayed`. `modifiers.rs > every event has at least one call site` walks the enum and the call graph.

**Worked example — Area Zero Underdepths.** The stadium contributes one `bench_size` modifier with `scope: global`, `when: exists{ of: in_play{of: hook_owner}, filter: tag "tera" }`, `value: 8`, `no_stack_key: "BENCH_SIZE"`. `rebuild` asks it once per player: with a Tera in play the player's `bench_limit` becomes 8; without, the `when` fails and the default 5 stands. When the stadium is replaced, `board_version` changes, `rebuild` recomputes both limits as 5, and `shrink_bench` runs for the stadium's owner first — which is exactly the third printed sentence, implemented once for every card that will ever raise a bench limit rather than written into this card.

## Implementation steps

1. Define `Hook`, `Scope`, `HookCtx`, `Contributor` and an empty `ModifierIndex` with `query` returning an empty iterator; wire `hp_max`, `retreat_cost` and `bench_size` to call it so the rest of the engine already reads through the index.
2. Implement `rebuild`'s collection pass in the fixed resolution order, with `built_for` invalidation; spec the "10,000 queries, one rebuild" case.
3. Implement the per-hook aggregation table and `sum_int` / `max_int` / `any`; spec each aggregation with a two-contributor fixture.
4. Implement the `no_stack_key` dedupe and spec the two-copies case (RN-17).
5. Implement the suppression pass (`block_tools`, `block_abilities`, `block_special_energy`) before dedupe; spec Jamming Tower and Team Rocket's Watchtower.
6. Implement `bench_limit` writing and `shrink_bench`, including the prompt, the discard-first ordering and the no-prize rule (RN-18, BR-S05.T05-01).
7. Implement the `block_conditions` immediate cure pass (BR-S05.T05-04).
8. Implement `TriggerIndex` and `Triggers::raise` with the resolution order and the depth cap; add the call sites listed above and the "every event has a call site" test.
9. Implement the once-per-turn marker keys for the three `once_scope` values (RN-16).
10. Write the eight scenarios listed under acceptance and run them through the [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) runner.
11. Add `benches/modifiers.rs` measuring a hook query on an empty bucket, on a four-contributor bucket, and a full rebuild; record the numbers and compare against the legacy's 1.6 M-calls-per-30-games figure to make the improvement concrete.

## Edge cases and error handling

- **Two copies of the same passive in play, one of them blocked.** Jamming Tower blocks a tool's +30 while an identical tool on another Pokémon is unaffected. Suppression runs before dedupe, so the blocked one is gone before the `no_stack_key` race, and the surviving one contributes. If both are blocked, the hook is empty.
- **A `no_stack_key` shared by two different card names.** Allowed and deliberate — it is how "the effect of this Stadium doesn't stack" is expressed across reprints with different names. The editor shows every code sharing a key so the collapse is never a surprise.
- **The bench limit drops while the player has exactly the limit.** No prompt, no discard, no event. `shrink_bench` is a no-op when `bench.len() <= bench_limit`.
- **The bench limit drops and the player must discard their last Pokémon.** Cannot happen: the Active is not on the bench, so a player at bench limit 5 always keeps their Active. If a future card could force it, `shrink_bench` refuses to discard below zero benched and records an event rather than ending the game.
- **A trigger fires during a trigger.** Risky Ruins' `enter_bench` trigger cannot bench anything, but a future card could. Depth is capped at 2 per event kind; the third attempt is dropped with an event. The cap is a safety property, not a rule of the game, and it is documented.
- **A modifier whose `when` reads the subject that is being removed.** `query` is called with a `HookCtx` whose `subject` may already be out of play during a knockout cascade. Every `when` evaluation that dereferences a missing slot yields false, not a panic — the same totality rule as RN-77.
- **A tool granting +100 HP discarded from a Pokémon with 90 damage.** `hp_max` falls to the printed value, the damage counters stay, and the Pokémon is knocked out at the next knockout check. This is correct and is asserted, because storing max HP on the slot — the legacy's instinct — would get it wrong.
- **A stadium replaced by a stadium with the same name.** The rules forbid it; [S04.T05](../04-game-engine-core/T05-actions-and-legality.md) refuses the action. This subtask therefore never sees a same-name replacement and does not special-case it.
- **`block_abilities` covering a Pokémon whose ability already set its once-per-turn marker.** The marker stays; the ability simply cannot be used again while blocked, and the marker clears at the normal time. Blocking does not rewind.
- **A `weakness_override` from each side.** First in resolution order wins, which means the active player's card wins. Deterministic, documented in `docs/rules/IR.md`, and flagged as an approximation of a situation the rulebook resolves by the turn player choosing.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core modifiers::` green, including `> bench_limit is 8 with a Tera in play and 5 without` and the single-writer grep check (RN-18).
- [ ] Scenario `modifiers/area-zero-bench-eight.json` passes: a player with a Tera Pokémon benches a sixth, seventh and eighth Pokémon; the opponent without one cannot bench a sixth (RN-18).
- [ ] Scenario `modifiers/area-zero-shrink-on-leave.json` passes: with both players at 7 and the stadium replaced, both shrink to 5 through their own prompts, the stadium's owner first, and neither player's prize count changes (BR-S05.T05-01).
- [ ] Scenario `modifiers/no-stack-two-copies.json` passes: two Hop's Snorlax in play give +30 once, not +60 (RN-17).
- [ ] Scenario `modifiers/tool-plus-30-vs-ex.json` passes: Brave Bangle on a Pokémon with no Rule Box adds 30 against an opponent's Active `ex` and nothing against a non-`ex` or against a benched target (the `damage_out` path, [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) stage 4).
- [ ] Scenario `modifiers/jamming-tower-disables-tools.json` passes: the same tool's +30 stops applying while the stadium is in play and the tool remains attached (BR-S05.T05-03).
- [ ] Scenario `modifiers/attack-cost-minus-one.json` passes: a tool reducing a Colorless symbol lets the attack be used one energy short, and the reduction disappears when the tool is discarded.
- [ ] Scenario `rules/bench-trigger-risky-ruins.json` passes: Buddy-Buddy Poffin benches two Basics and each receives 2 damage counters from Risky Ruins (RN-11).
- [ ] `modifiers.rs > two copies of the same per_instance ability each fire once` and `> two copies of a per_name ability fire once in total` (RN-16).
- [ ] `modifiers.rs > 10,000 queries on a static board perform one rebuild` and `cargo bench --bench modifiers` records the empty-bucket, four-contributor and full-rebuild costs (BR-S05.T05-02).
- [ ] `modifiers.rs > trigger order is stable across 1,000 runs and across worker counts` — the same fingerprint at 1 and at 8 workers, which is [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)'s determinism rule applied to triggers (BR-S05.T05-05).

## Risks and open questions

- **Risk — `board_version` is not incremented somewhere it should be**, and a stale index silently gives a wrong answer. This is the sharpest failure mode in the subtask, because it is invisible. Mitigation: a debug-only `ModifierIndex::verify(game)` rebuilds unconditionally and compares, and it runs after every step in the scenario runner and in the property tests; a mismatch fails loudly in CI while release builds pay nothing.
- **Risk — the resolution order is an approximation** of "the turn player chooses the order of simultaneous effects", and a real ruling could depend on it. Mitigation: the order is fixed, deterministic and written into `docs/rules/IR.md`; any scenario that depends on it cites the ruling it assumes in its `source` field, so a later correction is traceable.
- **Risk — the suppression-then-dedupe order is wrong for some card.** Mitigation: the order is asserted by a scenario that combines Jamming Tower with two identical tools; if a card ever requires the opposite, it is a documented exception, not a silent reorder.
- **Question (D-004 semantics) — is `no_stack_key` authored per code or derived from the card name?** It is a field on the code here, defaulting to null, and the convention is to set it to the code name when the printed text says "doesn't stack". Deriving it from the card name would be automatic but would collapse reprints that should stack with genuinely different cards. The user owns this; RN-17 is theirs.
- **Question (D-004 semantics) — should a passive ability's modifier live on the ability's own text, or on the Pokémon?** On the text, which means a Pokémon with a passive ability has an `ability` part whose codes are `Modifier` bodies, exactly like a tool's. That keeps one rule — "behaviour hangs off texts" — and it is why `card_status` can judge a passive. Recommendation: keep it; the user confirms.
- **DEPENDENCY-PROPOSAL: S05.T05 should depend on S05.T03 because** this subtask implements the `Modifier` and `Trigger` shapes and the hook and event enums the vocabulary defines; today it reaches them only transitively through [S05.T04](T04-ir-compiler-and-vm.md).

## References

- `pokemon/src/pokesearch/sim/status.py` L186–189 — verified: `HOOK_NAMES` with the 19 legacy hooks (`bench_size_for`, `retreat_zero_for`, `hp_delta_for`, `blocks_conditions`, `extra_poison_damage`, `damage_bonus`, `damage_reduction`, `damage_prevented`, `after_damage_reduction`, `effects_blocked_for`, `counters_blocked_for`, `on_bench_placed`, `abilities_blocked_for`, `attack_cost_delta_for`, `evolve_same_turn_for`, `tools_disabled`, `weakness_override_for`, `checkup_counters_for`, `end_of_turn`). Consult for the mapping to the 23 IR hooks.
- `pokemon/src/pokesearch/sim/status.py` L198–253 (`_hook`, `_field_modifiers`, `refresh_field`) — verified: the `ACTIVE_HOOKS` optimisation with its comment *"sem isso, 1,6 milhão de consultas por 30 partidas terminavam num método que só devolvia zero"*; `_field_modifiers` collecting the stadium, both players' in-play Pokémon and their attachments; `refresh_field` computing `size = max(5, bench_size_for…)`, calling `_shrink_bench`, then recomputing retreat cost as base + tool deltas with a stadium zero-override, and reading the field modifiers of *both* players because a rewritten Weakness comes from across the table. This is the loop the index replaces.
- `pokemon/src/pokesearch/sim/effects.py` L1585–1701 — verified: `ToolRecipe`, `PokemonRecipe`, `EnergyRecipe` and `StadiumRecipe` field lists, including `no_stack` ("o efeito de X não se acumula": conta uma vez por nome de carta), `prevent_self_only`, `plus_self_only`, `minus_self_only`, `bench_size=(filter, size)`, `hp_delta`, `counters_blocked`, `on_bench_placed`, `tools_off`, `abilities_off`, `extra_poison`, `blocks_conditions`, `evolve_same_turn`, `attack_cost_delta`. Consult for the hook inventory and for which scope each legacy flag corresponds to.
- `pokemon/src/pokesearch/sim/catalog.py` L190, L210–223 — verified: `"area zero underdepths": StadiumRecipe(bench_size=(F.is_tera, 8))` with the comment that the excess-bench discard is general (`refresh_field` shrinks whenever the limit drops), `"jamming tower": StadiumRecipe(tools_off=True)`, `"battle cage": StadiumRecipe(counters_blocked=F.on_bench)`, `"risky ruins": StadiumRecipe(on_bench_placed=(…, 2))`, `"team rocket's watchtower": StadiumRecipe(abilities_off=F.pokemon_type("colorless"))`. Consult for the concrete modifier shapes and their rulings.
- `pokemon/src/pokesearch/sim/catalog.py` L63–64 — verified: the comment that the third-party engine put benched Pokémon outside the reducer so the field trigger (Risky Ruins) did not fire. The concrete case behind RN-11 here.
- `pokemon/src/pokesearch/sim/catalog.py` L410–411 — verified: `"hop's snorlax": PokemonRecipe(damage_plus=30, no_stack=True, …)`. The RN-17 fixture.
- `pokemon/src/pokesearch/sim/catalog_cards.py` L484–494 (`_limit_per_name`) — verified: once-per-turn is per Pokémon unless the ability text contains *"can't use more than 1"*, with the note that the previous per-name default left a second copy in play with no ability. The RN-16 fixture.
- [S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md), [S04.T07](../04-game-engine-core/T07-damage-pipeline.md), [S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md) — the hook consumers and the stage order this index feeds; [S05.T03](T03-effect-ir-vocabulary.md) — the `Modifier` and `Trigger` grammar.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
