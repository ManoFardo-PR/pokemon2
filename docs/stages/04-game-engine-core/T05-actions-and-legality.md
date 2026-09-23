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
- `file` `pokemon/src/pokesearch/sim/status.py` — the `get_actions` filter chain and rule fixes J and L; read-only reference

## Outputs (proposed)
- `module` `ptcg-core::actions` — `enum Action { PlayBasic(c), Evolve(c, slot), AttachEnergy(c, slot), PlayItem(c), PlaySupporter(c), AttachTool(c, slot), PlayStadium(c), UseAbility(slot, i), UseStadium, Retreat(slot), Attack(i), EndTurn, Concede }`; `legal_actions(&Game) → Vec<Action>` in O(hand + slots); `apply(&mut Game, Action)` — consumed by [S04.T06](T06-energy-provision-and-cost-payment.md), [S04.T07](T07-damage-pipeline.md), [S04.T09](T09-prompt-protocol.md), [S04.T11](T11-baseline-bots-random-heuristic.md), [S06.T03](../06-bots/T03-planner-turn-policy.md)
- `contract` legality rules: evolve keeps damage, energies, tools and conditions are cleared (RN-11/RN-12); stadium with the same name cannot replace itself; retreat once per turn paying cost; one supporter, one energy attachment, one stadium play per turn; ability/attack availability consults hooks (blocked abilities, extra costs) that S05 populates

## Initial objective
Every legal move is enumerable cheaply and applies with the rulebook side effects, so bots choose among real options and no prompt combination is ever expanded into the action list.

## Context

This is the subtask that decides what a "decision" is in this engine, and the decision it makes is the one the legacy could not: **an action is a move, not a move plus every choice inside it**. The legacy engine expanded a "choose k cards from n" into a `ChooseCardAction` per combination, which is C(n,k) actions; the bots then scanned at most `MAX_CHOICE_SCAN = 400` of them (`pokemon/src/pokesearch/sim/policies.py:18`) and picked by matching English prose in a `tips` string. Here, choosing which energies to discard for a retreat, which Basic to bench, or which card a search finds is a **prompt** ([S04.T09](T09-prompt-protocol.md)), answered in O(n). `legal_actions` therefore stays linear in hand size plus slots, typically under forty entries, and a bot that scans all of them scans all of them.

The second thing settled here is that legality is a query over the state, never a cached boolean on an action. The legacy's `status.py::install` wrapped `Player.get_actions` with a filter chain — drop attacks when Asleep/Paralyzed or under a `no_attack` turn effect, drop attacks whose extra field cost cannot be paid, drop retreats when Asleep/Paralyzed, drop items/supporters under player effects, drop ability uses when abilities are blocked — and that chain is the right shape. It is reproduced here as an ordered list of predicates, each one a function of `(game, action)`, each one testable on its own, each one consulting a hook that is empty today and that [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) fills.

Two of RN-11's six corrections are enforced here. Evolving keeps the damage counters, the attached energies, the tools and the markers, and clears the Special Conditions — in this engine that is not a patch but the natural behaviour of `evolve_onto` ([S04.T03](T03-game-state-model.md)), which only changes `top` and pushes the old card into `under`. Tools keep working after evolution because `attached_to` is re-pointed at the new top in the same mutation; the legacy needed rule fix 4 for exactly this, and `pokemon/tests/test_rules.py::test_tool_keeps_working_after_evolution` asserts a Hero's Cape survives with `70 + 100 − 20` HP. Benching a Basic fires field triggers (legacy rule fix 5, Risky Ruins) — here `bench_put` raises the `enter_bench` trigger, which is a no-op until [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) registers listeners.

RN-16 is enforced here too, though it is declared elsewhere. "Once during your turn" is per Pokémon **instance** unless the card's text says per name. `CardDef::abilities[i].once_per` carries the declaration ([S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md) sets it); the enforcement is three different stores: `Slot::once_used` for `instance`, `Player::markers` for `name`, `Game::markers` for `game`. Getting this wrong in either direction is a real distortion — per-name enforcement on an instance ability halves a deck's output, and the reverse doubles it.

What this subtask deliberately does not do: pay costs (that is [S04.T06](T06-energy-provision-and-cost-payment.md), which decides what an attached energy provides at payment time), compute damage ([S04.T07](T07-damage-pipeline.md)), or run any effect program (S05). `Attack(i)` here checks that the attack exists, that the attacker may attack, and that the cost is payable through the `can_pay` seam; resolving it is T07's job.

## Scope

- **In scope.** The `Action` enum and its stable ordering; `legal_actions(&Game) -> &[Action]` with the generator per action kind and the shared predicate chain; `apply(&mut Game, Action)` with the rulebook side effects for every variant; the per-turn budget checks; the evolution predicate (stage match, name match, `can_evolve` from [S04.T04](T04-setup-and-turn-structure.md)); tool attach rules (one tool per Pokémon unless a modifier says otherwise); stadium replace rules; retreat as an action plus a payment prompt; `UseAbility` with RN-16 enforcement; `Concede` and `EndTurn`; the hook seams `block_abilities`, `block_tools`, `attack_cost`, `retreat_cost`, `grant_attacks` that S05 fills.
- **Out of scope.** Cost payment and energy provision ([S04.T06](T06-energy-provision-and-cost-payment.md)); damage, knockouts and prizes ([S04.T07](T07-damage-pipeline.md)); Special Conditions semantics ([S04.T08](T08-special-conditions-and-checkup.md)) — the predicate reading `Conditions::ASLEEP` exists here, the conditions themselves are set there; the `Prompt` type and its validation ([S04.T09](T09-prompt-protocol.md)); effect programs, triggers and continuous modifiers (S05); bot preference order ([S04.T11](T11-baseline-bots-random-heuristic.md), [S06.T03](../06-bots/T03-planner-turn-policy.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-11 | **Kept (two of six here).** Evolving keeps damage counters, attached energies, tools and markers, and clears Special Conditions; an attached tool keeps working after the evolution because every attached card's `attached_to` is re-pointed at the new top in the same mutation. Benching a Basic fires field triggers. | `actions::apply` → `Game::evolve_onto` (no write to `damage`, re-points attachments, calls `Conditions::clear_all`); `Game::bench_put` raises the `enter_bench` trigger | `actions.rs > evolving_keeps_damage_energies_and_tools`; `> evolving_clears_conditions`; `> benching_a_basic_raises_enter_bench`; scenarios `rules/evolve-keeps-damage.json`, `rules/tool-survives-evolution.json`, `rules/bench-trigger.json` ([S04.T13](T13-scenario-format-and-runner.md)) |
| RN-16 | **Kept (enforcement half).** "Once during your turn" is per Pokémon instance unless the card declares per name or per game. `once_per: instance` is tracked in `Slot::once_used`, `name` in `Player::markers`, `game` in `Game::markers`; the declaration comes from `CardDef` ([S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md)). | `actions::can_use_ability` and the marker write inside `apply(UseAbility)` | `actions.rs > two_copies_of_an_instance_ability_can_both_be_used`; `> two_copies_of_a_name_ability_can_be_used_once`; `> a_game_scoped_ability_is_used_once_per_game` |
| BR-S04.T05-01 | A choice inside an action is never an action variant: `legal_actions` returns at most `hand.len() + slots + 3` entries, and no variant carries a set of chosen cards. Every inner choice is a prompt. | the `Action` enum has no `Vec` field; `legal_actions` is a linear scan | `actions.rs > legal_actions_is_linear` (a hand of 12 with 6 slots never exceeds 40 actions); `policy.rs > action_enum_has_no_collection_fields` |
| BR-S04.T05-02 | `legal_actions` is pure and ordered: it mutates nothing, and for a given state it returns the same sequence in the same order every time. The order is the enum's declaration order, then hand index, then slot index. | `legal_actions(&self)` takes `&Game`; the result is cached in `Game` and invalidated by `board_version` plus a turn-state counter | `actions.rs > legal_actions_is_pure` (state serialized before and after is identical); `> legal_actions_order_is_stable` over 1,000 random states |
| BR-S04.T05-03 | The per-turn budget is absolute: at most one energy attachment, one supporter, one stadium play and one retreat per turn; a stadium's ability is usable once per turn. Exceeding any of them makes the action absent from `legal_actions` and an error in `apply`. | `budget_allows(game, action)` consulted by both the generator and `apply` | `actions.rs > second_supporter_is_illegal`; `> second_energy_attachment_is_illegal`; `> second_retreat_is_illegal`; `> apply_rejects_a_budgeted_action_twice` |
| BR-S04.T05-04 | A stadium with the same name as the one in play cannot be played; a stadium with a different name replaces it and the replaced card goes to its **owner's** discard. | `actions::can_play_stadium` comparing `CardDef::name` of the in-play stadium; `apply(PlayStadium)` moving the old card to `CardInst::owner`'s discard | `actions.rs > same_name_stadium_cannot_replace_itself`; `> replaced_stadium_goes_to_its_owners_discard` |
| BR-S04.T05-05 | `Evolve(card, slot)` is legal only when the card's `evolves_from[0]` equals the slot's top name, the slot may evolve this turn (`turn::can_evolve`, RN-11) and the evolving card is in the hand. Rare Candy-style skips are effects, not this action. | `actions::can_evolve_onto` | `actions.rs > evolve_requires_direct_pre_evolution`; `> evolve_refused_on_the_turn_the_basic_was_played`; `> evolve_refused_on_your_own_first_turn` |
| BR-S04.T05-06 | A Pokémon carries at most one tool unless a modifier raises the limit; `AttachTool` is absent when the target is full, and tools are unaffected by `block_tools` for the purpose of attaching (a disabled tool is still attached). | `actions::tool_slots_free(game, slot)` reading the `tool_limit` hook | `actions.rs > second_tool_on_the_same_pokemon_is_illegal`; `> jamming_tower_does_not_prevent_attaching` (with a stub modifier) |
| BR-S04.T05-07 | Attacking requires: the slot is the Active, the attack index exists in `CardDef` or in `grant_attacks`, `turn::can_attack_this_turn` is true, no condition or turn effect blocks it, and `energy::can_pay(cost + attack_cost hook)` succeeds. Retreating requires: no condition or turn effect blocks it, the budget allows it, a bench Pokémon exists, and the retreat cost is payable. | `actions::attack_actions`, `actions::retreat_actions`, both ending at the [S04.T06](T06-energy-provision-and-cost-payment.md) seam | `actions.rs > attack_absent_without_enough_energy`; `> attack_absent_when_asleep`; `> retreat_absent_with_empty_bench`; `> retreat_absent_when_paralyzed` |
| BR-S04.T05-08 | `apply` never silently repairs an illegal action: an action not present in `legal_actions` returns `EngineError::IllegalAction { action, reason }` and leaves the state unchanged. Substituting a default is the caller's business ([S04.T09](T09-prompt-protocol.md), RN-21). | `apply` re-validates through the same predicates the generator uses | `actions.rs > apply_of_an_illegal_action_is_a_no_op` (state serialized before and after is identical) |
| BR-S04.T05-09 | `UseAbility` and `UseStadium` do not end the turn and do not consume the energy or supporter budget; `Attack` ends the turn unless a `second_attack` marker is set; `EndTurn` and `Concede` are always legal. | `apply` per variant; the `second_attack` marker is written only by effects (S05) | `actions.rs > attack_ends_the_turn`; `> ability_does_not_end_the_turn`; `> end_turn_is_always_legal` |

## Data operations

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `Player::hand` → `Player::bench[i]` | card moved, new `Slot` with `turn_played = turn_no` | `apply(PlayBasic)` | only a `CardDef` with `stage == basic`; `bench_free_slots > 0` (RN-18); raises the `enter_bench` trigger (RN-11) |
| `Player::hand` → `Slot::top`, old top → `Slot::under` | `evolve_onto` | `apply(Evolve)` | `damage`, `energies`, `tools`, `markers` untouched; `conditions` cleared; attachments re-pointed; `turn_played = turn_no` (RN-11) |
| `Player::hand` → `Slot::energies` | card moved, `zone = Attached`, `attached_to = slot.top` | `apply(AttachEnergy)` | `turn.energy_attached += 1`, capped by the budget (BR-S04.T05-03) |
| `Player::hand` → `Slot::tools` | card moved, `zone = Attached` | `apply(AttachTool)` | at most `tool_limit` (default 1) per slot (BR-S04.T05-06) |
| `Player::hand` → `Player::discard` | card moved after its program runs | `apply(PlayItem)`, `apply(PlaySupporter)` | supporter sets `turn.supporter_played = true`; the program is a no-op until S05 |
| `Player::hand` → `Game::stadium`; previous stadium → owner's discard | two moves in one mutation | `apply(PlayStadium)` | name must differ from the stadium in play (BR-S04.T05-04); `turn.stadium_played = true` |
| `Game::stadium` (ability use) | `Player::turn.stadium_used = true` | `apply(UseStadium)` | once per turn per player |
| `Slot::once_used` / `Player::markers` / `Game::markers` | marker written | `apply(UseAbility)` | scope chosen by `CardDef::abilities[i].once_per` (RN-16) |
| `Player::active` ↔ `Player::bench[i]` | slots swapped; conditions of both cleared | `apply(Retreat)` | `turn.retreated = true`; cost paid through a `retreat_payment` prompt when more than one assignment exists ([S04.T06](T06-energy-provision-and-cost-payment.md)) |
| `Slot::energies` → `Player::discard` | cards moved | retreat payment resolution | exactly `retreat_cost(slot)` cards, chosen by the prompt answer |
| `Game::phase`, `Game::current` | turn ends | `apply(Attack)` after resolution, `apply(EndTurn)` | an attack ends the turn unless a `second_attack` marker exists (BR-S04.T05-09) |
| `Game::outcome` | set to a concede result | `apply(Concede)` | winner is the other player, reason `Concede` ([S04.T10](T10-termination-stall-and-determinism.md)) |
| `Game::board_version` | `+= 1` | every mutation above that changes the board | invalidates the `legal_actions` cache and the modifier index (BR-S04.T05-02) |
| the database | — | never | the engine holds no connection |

## Interfaces

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Action {
    PlayBasic(CardIdx),                 // from hand to a free bench slot
    Evolve(CardIdx, SlotIdx),
    AttachEnergy(CardIdx, SlotIdx),
    PlayItem(CardIdx),
    PlaySupporter(CardIdx),
    AttachTool(CardIdx, SlotIdx),
    PlayStadium(CardIdx),
    UseAbility(SlotIdx, u8),            // u8 = ability index in CardDef
    UseStadium,
    Retreat(SlotIdx),                   // the bench slot that comes in
    Attack(u8),                         // attack index on the Active
    EndTurn,
    Concede,
}

impl Game {
    /// Pure. Cached on (board_version, turn_state_version); recomputed lazily.
    pub fn legal_actions(&self) -> &[Action];
    pub fn apply(&mut self, action: Action) -> Result<(), EngineError>;
    pub fn is_legal(&self, action: Action) -> bool;
}
```

**The predicate chain.** Every generator ends with the same shared filter, applied in this order (the order matters only for the `reason` string in `EngineError::IllegalAction`):

| # | Predicate | Reads | Filled by |
|---|---|---|---|
| 1 | phase is `Turn` and no prompt is pending | `Game::phase`, `pending_prompt` | here |
| 2 | budget allows the action | `Player::turn` | here (BR-S04.T05-03) |
| 3 | player-level turn effects (`NoItems`, `NoSupporters`) | `Player::turn_effects` | here; set by S05 |
| 4 | slot-level blocks: `NoAttack`, `NoAttackNamed(id)`, `NoRetreat` | `Slot::turn_effects` | here; set by S05 |
| 5 | Special Conditions: Asleep or Paralyzed block `Attack` and `Retreat` | `Slot::conditions` | [S04.T08](T08-special-conditions-and-checkup.md) |
| 6 | `block_abilities` hook (Team Rocket's Watchtower-style) | modifier index | [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) |
| 7 | `attack_cost` / `retreat_cost` hooks, then `energy::can_pay` | modifier index, `Slot::energies` | [S04.T06](T06-energy-provision-and-cost-payment.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) |
| 8 | the program's `can` precondition, when the card has one | `Game::frames` compiler output | [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md) |

**Hook seams declared here** (empty in this stage; shapes are the contract [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) implements):

```rust
pub(crate) mod hooks {
    pub fn block_abilities(game: &Game, p: PlayerIdx, s: SlotIdx) -> bool;        // RN-16-adjacent, S05
    pub fn block_tools(game: &Game) -> bool;                                      // Jamming Tower
    pub fn tool_limit(game: &Game, p: PlayerIdx, s: SlotIdx) -> u8;               // default 1
    pub fn grant_attacks(game: &Game, p: PlayerIdx, s: SlotIdx) -> &[AttackDef];  // granted attacks
    pub fn evolve_same_turn(game: &Game, p: PlayerIdx, s: SlotIdx) -> bool;       // Forest of Vitality
    pub fn energy_budget(game: &Game, p: PlayerIdx) -> u8;                        // default 1
}
```

**Caching.** `legal_actions` is recomputed when `(board_version, turn_state_version)` changes, where `turn_state_version` bumps on any write to a budget, a marker, a turn effect or a condition. A clone carries the cache, which is correct because the cache is a pure function of the state it was computed from.

**Triggers raised by `apply`** (no-ops until S05): `play_from_hand`, `enter_bench`, `evolve`, `attach_energy`, `stadium_played`, `attack_used`. Names match [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) exactly.

## Implementation steps

1. Declare `Action`, `is_legal` and an empty `legal_actions`; add `policy.rs > action_enum_has_no_collection_fields` (BR-S04.T05-01). `cargo test` green.
2. Implement the simple generators — `PlayBasic`, `AttachEnergy`, `PlayItem`, `PlaySupporter`, `EndTurn`, `Concede` — with the budget predicate; implement their `apply` arms; spec the budget rules (BR-S04.T05-03).
3. Implement `Evolve`: the stage/name predicate plus `turn::can_evolve`, then `apply` through `evolve_onto`; spec that damage, energies, tools and markers survive and conditions are cleared (RN-11, BR-S04.T05-05).
4. Implement `AttachTool` with `tool_limit`, and the attachment re-pointing test across an evolution (RN-11, BR-S04.T05-06); write the `rules/tool-survives-evolution.json` scenario stub for [S04.T13](T13-scenario-format-and-runner.md).
5. Implement `PlayStadium` and `UseStadium` with the same-name rule and the owner's-discard rule (BR-S04.T05-04).
6. Implement `UseAbility` with the three `once_per` scopes and their marker stores; spec all three (RN-16).
7. Implement `Retreat` and `Attack` against the [S04.T06](T06-energy-provision-and-cost-payment.md) seam (a stub `can_pay` that counts energies today), including the condition and turn-effect predicates; spec absence in each blocked case (BR-S04.T05-07).
8. Add the shared predicate chain with its `reason` strings and make `apply` re-validate through it; spec `> apply_of_an_illegal_action_is_a_no_op` by serializing the state before and after (BR-S04.T05-08).
9. Add the `legal_actions` cache keyed on `(board_version, turn_state_version)`; spec purity and order stability over 1,000 random states (BR-S04.T05-02).
10. Add the trigger raise points with their exact names and a no-op listener registry, so [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) only has to register.
11. Write the random-action fuzz loop (10,000 games of `legal_actions` → pick → `apply`) with `--features invariants`, asserting no `EngineError` and no invariant violation; this is the harness [S04.T11](T11-baseline-bots-random-heuristic.md) reuses.

## Edge cases and error handling

- **A bench is full and the hand holds a Basic** → `PlayBasic` is absent for every Basic, not present-and-failing. Bots see only real options, which is the whole point of the enumeration being cheap.
- **Two identical benched Pokémon and one evolution card** → two distinct `Evolve(card, slot)` actions, one per slot. Identical copies are interchangeable in a *card* prompt but not as *targets* in play, and the action carries the slot precisely so this distinction survives ([S04.T09](T09-prompt-protocol.md) groups candidates by definition but keeps `idxs`).
- **A retreat with several payable energy assignments** → one `Retreat(slot)` action; `apply` opens a `retreat_payment` prompt listing the attached energies, and the answer chooses which go to the discard. When exactly one assignment is possible, no prompt is opened and the payment is applied directly ([S04.T06](T06-energy-provision-and-cost-payment.md)).
- **A stadium in play with the same name as one in hand** → the action is absent; playing a second copy of the same stadium is not a way to reset its once-per-turn use. The check is by `CardDef::name`, because different printings of the same stadium name are the same stadium.
- **An Active with no attack the player can pay for, an empty bench and no cards in hand** → the only legal actions are `EndTurn` and `Concede`. `EndTurn` is always legal by BR-S04.T05-09, so the game cannot deadlock; stall detection ([S04.T10](T10-termination-stall-and-determinism.md)) handles the resulting loop.
- **An ability on a benched Pokémon whose slot is knocked out mid-turn** → the slot is gone, so the action disappears from the next `legal_actions`; a bot holding a stale action gets `EngineError::IllegalAction`, which is counted by RN-21's mechanism and replaced with a default ([S04.T09](T09-prompt-protocol.md)).
- **`Attack(i)` where `i` refers to a granted attack that is no longer granted** → the predicate re-reads `grant_attacks` inside `apply`, so the action fails rather than executing a stale index.
- **A supporter played when `NoSupporters` is in effect** → absent by predicate 3. The legacy patched this into `get_actions` for the same reason: a filtered action list is the only place where "you may not do that" is representable without special-casing every card.
- **Conceding while a prompt is pending** → refused; the prompt must be answered first, so the state is always settled when the outcome is written. Bots that want to concede do so on their action turn ([S04.T10](T10-termination-stall-and-determinism.md)).
- **An action applied while `phase == BetweenTurns`** → predicate 1 rejects it. The only legal input in that phase is a prompt answer ([S04.T08](T08-special-conditions-and-checkup.md)).

## Acceptance / verification

- [ ] `cargo test -p ptcg-core actions` green, including `> evolving_keeps_damage_energies_and_tools` (30 damage before, 30 after; the tool still on the slot) and `> evolving_clears_conditions` (RN-11).
- [ ] `> benching_a_basic_raises_enter_bench` with a stub listener counting one call (RN-11); scenario `engine/scenarios/rules/bench-trigger.json` passes under [S04.T13](T13-scenario-format-and-runner.md).
- [ ] `> two_copies_of_an_instance_ability_can_both_be_used` and `> two_copies_of_a_name_ability_can_be_used_once` — the same `CardDef` with `once_per: instance` then `once_per: name` (RN-16).
- [ ] `> same_name_stadium_cannot_replace_itself` and `> replaced_stadium_goes_to_its_owners_discard` (BR-S04.T05-04).
- [ ] `> second_supporter_is_illegal`, `> second_energy_attachment_is_illegal`, `> second_retreat_is_illegal` — absent from `legal_actions` and `EngineError::IllegalAction` from `apply` (BR-S04.T05-03).
- [ ] `> apply_of_an_illegal_action_is_a_no_op`: the serialized state is byte-identical before and after a rejected `apply` (BR-S04.T05-08).
- [ ] `> legal_actions_is_pure` and `> legal_actions_order_is_stable` over 1,000 randomly generated states (BR-S04.T05-02).
- [ ] `> legal_actions_is_linear`: with 12 cards in hand and 6 occupied slots, `legal_actions().len() <= 40` (BR-S04.T05-01).
- [ ] `cargo test -p ptcg-core --features invariants fuzz_random_actions` — 10,000 games of random legal actions end without an `EngineError` and without an invariant panic.

## Risks and open questions

- **Risk — the `legal_actions` cache goes stale.** A mutation that changes legality without bumping `board_version` or `turn_state_version` produces a wrong action list, which is the worst kind of bug because it is silent. Mitigation: a debug-only mode recomputes uncached on every call and compares; the fuzz loop runs with it on.
- **Risk — the predicate chain and `apply` drift apart.** Two implementations of the same rule is how the legacy accumulated its patch list. Mitigation: `apply` calls `is_legal`, which calls the same chain, so there is one implementation and the re-validation is the enforcement of BR-S04.T05-08.
- **Risk — `Action` is `Copy` and small today, but granted attacks or multi-target choices could push a variant to carry data.** Mitigation: BR-S04.T05-01 and its policy test make that a visible decision rather than a drift; anything with a set belongs in a prompt.
- **Question — should `Concede` be in the enum at all?** It is useful for bots that detect hopeless positions and for measuring, but it also gives a bad bot a way to end games early and distort a suite. Recommendation: keep it in the enum, and let [S04.T12](T12-cli-job-protocol.md) expose an option that removes it from `legal_actions` for measurement runs; the user decides the default when the first suite is frozen ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)).
- **Question — should `UseAbility` be split into "declare" and "resolve"?** Today it is one action that may open prompts. If [S06.T05](../06-bots/T05-rollout-bot.md) needs to evaluate an ability without committing to it, a `can` precondition already exists (predicate 8). Recommendation: keep one action; revisit at S06 if lookahead needs the split.

## References

- `pokemon/src/pokesearch/sim/status.py` — verified: the `get_actions` wrapper installed in `install()`, which calls `refresh_field`, drops `AttackAction` when `cannot_attack` (Asleep, Paralyzed, `no_attack`, or a per-attack-name lock), drops attacks whose `extra_attack_cost` cannot be met, drops `RetreatAction` when `cannot_retreat`, drops `UseItemAction`/`UseSupporterAction` under player effects, and drops `UseAbilityAction` when `abilities_blocked`; `cannot_attack`'s note that "during your next turn, this Pokémon can't use <name>" locks one attack and not the Pokémon; rule fix 4 (tool `attachedTo` re-pointing after evolution) and rule fix 5 (`on_bench_placed` when a Basic is played to the bench). Consult for the filter order; nothing is ported.
- `pokemon/tests/test_rules.py` — verified: `test_evolving_keeps_damage_counters`, `test_tool_keeps_working_after_evolution` (Hero's Cape: `70 + 100 − 20`, then `90 + 100 − 20` after evolving), `test_a_card_that_comes_back_to_the_hand_cannot_evolve_the_turn_it_is_played_again`.
- `pokemon/src/pokesearch/sim/policies.py` — verified: `MAX_CHOICE_SCAN = 400` and the `choose` function that ranks `ChooseCardAction`s by matching words in a prose `tips` string. Consult as the reason actions and prompts are separated here.
- [S04.T04](T04-setup-and-turn-structure.md) — `can_attack_this_turn`, `can_evolve`, `TurnBudget` and the phase machine this subtask queries.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-11, RN-16; [Architecture](../../project/03-architecture-overview.md) "C(n,k) choice spaces, prose prompts → structured prompts with `actor`/`purpose`, O(n) validation".

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
