# S04.T03 — Game state model

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 3 / 18 |
| Depends on | [S04.T01](T01-engine-workspace-and-crates.md) |
| Unblocks | [S04.T04](T04-setup-and-turn-structure.md), [S04.T09](T09-prompt-protocol.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md), [S06.T01](../06-bots/T01-honest-information-view.md), [S06.T05](../06-bots/T05-rollout-bot.md) |
| Parallel with | [S04.T02](T02-card-definition-model.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `ptcg-core` crate skeleton — from [S04.T01](T01-engine-workspace-and-crates.md)
- `doc` `project/03-architecture-overview.md` (determinism and cloning requirements)
- `file` `pokemon/src/pokesearch/sim/status.py` — the perf notes at L162 and L201 and the bench-size patch at L796; read-only reference

## Outputs (proposed)
- `module` `ptcg-core::state` — `Game { players: [Player; 2], cards: Vec<CardInst>, turn_no, current: PlayerIdx, first_player, phase, stadium: Option<CardIdx>, rng: Xoshiro256**, frames: Vec<Frame>, pending_prompt: Option<Prompt>, board_version: u32, events: Vec<Event> }`; `Player { deck: Vec<CardIdx> (top = end), hand, discard, prizes (hidden), active: Option<Slot>, bench: [Option<Slot>; 8], bench_limit: u8, per-turn flags, turn_effects, markers, knocked_out_last_turn }`; `Slot { top: CardIdx, under: SmallVec, energies: SmallVec, tools: SmallVec, damage: u16, conditions: bitflags, turn_played, turn_effects, markers, once_used }`; `CardInst { def: u16, owner: u8, zone: Zone, attached_to: Option<CardIdx> }` — consumed by [S04.T04](T04-setup-and-turn-structure.md), [S04.T09](T09-prompt-protocol.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md), [S06.T01](../06-bots/T01-honest-information-view.md), [S06.T05](../06-bots/T05-rollout-bot.md)
- `contract` `Game: Clone` is cheap (index-based, no heap graph); `Zone` enum `Deck|Hand|Discard|Prize|Active|Bench(i)|Attached|LostZone|Stadium`

## Initial objective
A compact, index-based state in which every card has a stable identity for the whole game, damage is counters (never HP subtraction), the bench size is data (RN-18), and cloning a mid-effect state costs microseconds — the property that makes lookahead bots possible.

## Context

Four design decisions are settled here, and every later subtask in S04, S05 and S06 inherits them.

**Cards are indices, not objects.** All 120 cards of a game live in one `Vec<CardInst>` allocated at setup and never resized. A zone is a `Vec<CardIdx>`; a slot points at indices. There is no heap graph, so `Clone` is a handful of `memcpy`s of small buffers rather than a deep object walk. The legacy engine had no `clone()` at all — states were driven by generator coroutines that could only be advanced, never copied — which is precisely why the legacy bots could not look ahead. `Game: Clone` is not a convenience here; it is the enabling property for [S06.T05](../06-bots/T05-rollout-bot.md) and [S06.T06](../06-bots/T06-ismcts-bot.md).

**Damage is counters, never HP subtraction.** A slot stores `damage: u16` and maximum HP is a query (`hp_max(slot)`) that runs through the modifier index. The legacy stored current HP on the card and mutated it, which forced a reconciliation routine (`refresh_field`) to keep the maximum and the current value from disagreeing whenever a tool or stadium entered or left play — `status.py::_refresh_hp_field` exists only to undo the previous delta before applying the new one. It also made `max_hp` expensive: `status.py:159-170` records that reading the two printed numbers used to instantiate the card class again, 23,000 instantiations in 30 games, until a per-class cache was added. Here the printed values live in `CardDef` ([S04.T02](T02-card-definition-model.md)), which is already in memory, and the field delta is a hook sum, so nothing is stored and nothing can drift.

**Effects live inside the state.** `frames: Vec<Frame>` and `pending_prompt` are fields of `Game`, not of an external interpreter. A program suspended on a prompt is part of the state, so cloning a mid-effect position and resuming both copies independently is ordinary. [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md) depends on exactly this; twinleafgg's reducer closures, by contrast, cannot be cloned at all.

**The bench size is data (RN-18).** `Player::bench` is a fixed array of eight optional slots with a `bench_limit` field; five is a starting value, not a constant. The legacy had to patch the third-party engine's state checker (`status.py:791-806`) because it hard-coded a maximum of five and every Basic Box game with Area Zero Underdepths and a Tera in play ended in `StateCheckError`. Eight is the printed maximum in the current Standard pool; the limit itself is computed by the `bench_size` hook that [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) fills.

One more thing is settled here and is cheap only if done now: the zone invariant behind RN-77. Every card index belongs to exactly one zone at every observable moment, and a debug-only `assert_invariants()` proves it. In the legacy that guarantee was a contract test over the 262 recipes (`tests/test_catalog.py`); here it is a property of the state itself, so no recipe can violate it.

## Scope

- **In scope.** `Game`, `Player`, `Slot`, `CardInst`, `Zone`, `TurnEffect`, `Marker`, `Event`, `Phase` and their `Clone`/`serde` derivations; the zone-move primitives every later subtask uses (`move_card`, `attach`, `detach`, `promote`, `bench_put`, `discard_slot`); `hp_max`, `damage`, `remaining_hp` and `is_knocked_out` as queries; `board_version` bumping; `assert_invariants()` under `debug_assertions` and behind a `--features invariants` flag for release fuzzing; the size and clone-cost measurements.
- **Out of scope.** Setup, shuffling and turn flow ([S04.T04](T04-setup-and-turn-structure.md)); legality and the action enum ([S04.T05](T05-actions-and-legality.md)); energy provision ([S04.T06](T06-energy-provision-and-cost-payment.md)); the damage pipeline and knockouts ([S04.T07](T07-damage-pipeline.md)); conditions and checkup semantics ([S04.T08](T08-special-conditions-and-checkup.md)) — the bitflags exist, the rules do not; the `Prompt` type ([S04.T09](T09-prompt-protocol.md)) — `pending_prompt` is `Option<Prompt>` with `Prompt` declared there; the RNG streams and fingerprints ([S04.T10](T10-termination-stall-and-determinism.md)); the modifier index that `hp_max` and `bench_limit` consult ([S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)) — today those hooks return the printed value; the player view ([S06.T01](../06-bots/T01-honest-information-view.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-18 | **Kept.** The bench limit is state, not a constant: `Player::bench_limit` is a field initialised to 5 and recomputed from the `bench_size` hook; every bench-capacity check reads it, and `bench` has eight physical slots so a limit of 8 needs no reallocation. | `Player::bench_limit`, `Game::bench_free_slots()`; no literal `5` outside the initialiser | `state.rs > bench_limit_is_a_field_not_a_constant` (set 8, place 8, assert ok; set 5, place 6, assert refused); `policy.rs > no_bare_bench_five` source scan |
| RN-77 | **Kept (zone invariant half).** Every `CardIdx` in `0..cards.len()` appears in exactly one zone list, and `CardInst::zone` agrees with the list that holds it; an attached card has `zone == Attached` and a non-`None` `attached_to` pointing at a card that is itself in `Active` or `Bench(i)`. The total-operations half belongs to [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md). | `Game::assert_invariants()` called after every mutation under `debug_assertions`; `move_card` is the only function that writes `CardInst::zone` | `state.rs > every_card_is_in_exactly_one_zone` (property test over 10,000 random mutation sequences); `state.rs > attachment_points_at_a_slot_top` |
| BR-S04.T03-01 | A card's identity is its index and never changes: `cards` is allocated once at setup with the exact deck contents and is never pushed to, removed from, or reordered. Zone lists hold indices; only they change. | `Game::new` sizes `cards` up front; `CardInst` has no `id` field and `cards` is not `pub` | `state.rs > card_indices_are_a_permutation_of_0..n` after 10,000 random moves; `> cards_vec_len_is_constant` |
| BR-S04.T03-02 | Current HP is never stored. `remaining_hp(slot) = hp_max(slot).saturating_sub(slot.damage)` and `is_knocked_out(slot) = slot.damage >= hp_max(slot)`; the only mutable number is `damage`. | `Slot` has no `hp` field; the three queries are the only readers | `state.rs > slot_has_no_hp_field` (compile-time: a test constructing `Slot { .. }` exhaustively); `> hp_max_change_does_not_change_damage` |
| BR-S04.T03-03 | `Game: Clone` is a deep copy with no shared ownership and no interior mutability: cloning a state and mutating the clone leaves the original byte-identical. | derived `Clone`; no `Rc`, `Arc`, `RefCell`, `Cell` anywhere in `state` (clippy `disallowed-types`) | `state.rs > clone_is_independent` (serialize original, clone, mutate clone, re-serialize original, compare); `cargo clippy -p ptcg-core -- -D warnings` |
| BR-S04.T03-04 | `deck` is ordered with the top of the deck at the end of the `Vec`, so drawing is `pop()`; every module that touches the deck says so in one place. | `Player::deck` doc comment and `draw_one()` / `put_on_top()` / `put_on_bottom()` helpers; no direct indexing of `deck` outside `state` | `state.rs > draw_takes_the_last_element`; `> put_on_bottom_inserts_at_index_0` |
| BR-S04.T03-05 | `board_version` increments on every change that can alter a continuous modifier — a card entering or leaving Active/Bench/Attached/Stadium, an evolution, a tool attach or detach — and on nothing else. | `move_card`, `attach`, `detach`, `promote`, `evolve_onto` call `touch_board()`; the counter is private | `state.rs > board_version_bumps_on_board_changes_only` (a hand-to-discard move does not bump; an attach does) |
| BR-S04.T03-06 | No `HashMap`/`HashSet` iteration influences game logic: `state` uses `Vec`, `SmallVec`, `IndexMap` and bitflags only, so iteration order is a function of the data, not of a hash seed. | clippy `disallowed-types` for `std::collections::HashMap`/`HashSet` inside `ptcg-core` | `policy.rs > core_has_no_hash_iteration`; `cargo clippy -p ptcg-core -- -D warnings` (the ground under RN-47, settled in [S04.T10](T10-termination-stall-and-determinism.md)) |
| BR-S04.T03-07 | Turn effects are `(source, kind, value, until_turn)` tuples stored on the slot or the player; nothing about them is a string parsed at read time. | `TurnEffect { source: Option<CardIdx>, kind: EffectKind, value: i16, until: u16 }` with `EffectKind` a closed enum | `state.rs > turn_effect_is_structured` (the enum has no `Other(String)` variant); expiry itself is verified in [S04.T08](T08-special-conditions-and-checkup.md) |
| BR-S04.T03-08 | `events` is empty unless logging was requested: with `log: false` a full game appends nothing, so the log costs no allocation in measurement runs. | `Game::log_enabled` set at construction; `push_event` returns early | `state.rs > events_stay_empty_without_logging`; the allocation is visible in [S04.T18](T18-performance-baseline.md)'s per-game memory number |

## Data operations

The state model defines the mutation primitives; the rules that call them arrive in later subtasks. Every row below is enforced by `assert_invariants()`.

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `cards: Vec<CardInst>` | allocated once, length fixed | `Game::new` | length = 60 + 60; indices 0..59 belong to player 0, 60..119 to player 1; never reordered (BR-S04.T03-01) |
| `CardInst::zone` | written only by `move_card(idx, to)` | every zone change | the index is removed from exactly one zone list and pushed to exactly one other (RN-77) |
| `Player::deck` | `pop()` to draw, `push()` for top, `insert(0, _)` for bottom, full shuffle at setup | draws, search-then-shuffle, deck manipulation | top = last element (BR-S04.T03-04); shuffling uses `Game::rng` only |
| `Player::hand` | push on draw/return, `swap_remove` never — ordered removal only | draws, plays, discards | order is stable so prompt candidate indices stay meaningful between the prompt and its answer ([S04.T09](T09-prompt-protocol.md)) |
| `Player::discard` | push only; removal only by explicit recovery effects | discards, knockouts | a knocked-out slot's `top`, `under`, `energies` and `tools` all move here in that order |
| `Player::prizes` | filled with 6 at setup; removed by index on a prize take | knockouts, effects | contents are never read by the owner's view until taken ([S06.T01](../06-bots/T01-honest-information-view.md)) |
| `Player::active` | `Some(Slot)` between setup and a knockout; `None` only while a promotion prompt is pending | promote, retreat, switch, knockout | `None` outside a pending promotion is a terminal condition, checked by [S04.T10](T10-termination-stall-and-determinism.md) |
| `Player::bench[i]` | set on bench play, cleared on promotion/knockout/discard | play Basic, promote, knockout, bench shrink | occupied slots ≤ `bench_limit` (RN-18); slot indices are stable — a knockout leaves a hole, it does not compact |
| `Player::bench_limit` | recomputed from the `bench_size` hook | on `board_version` change | ≥ 5, ≤ 8; a decrease triggers the bench shrink of [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) |
| `Slot::under` | pushed on evolution (the evolved card becomes `top`) | evolve | the whole stack moves together to the discard on a knockout; `under` is never reordered |
| `Slot::energies`, `Slot::tools` | push on attach, remove on detach/discard | attach, effects, knockout | every element has `zone == Attached` and `attached_to == Some(slot.top)`; re-pointed on evolution so a tool keeps working ([S04.T05](T05-actions-and-legality.md), RN-11) |
| `Slot::damage` | `+=` from the damage pipeline, `-=` from healing (saturating at 0) | attacks, counters, checkup, heal | never negative; never reset by evolution (RN-11); knockout is `damage >= hp_max` |
| `Slot::conditions` | bitflags set/cleared | [S04.T08](T08-special-conditions-and-checkup.md) | at most one of Asleep/Paralyzed/Confused; cleared whenever the slot leaves Active |
| `Slot::turn_played` | set to `turn_no` when the slot is created or evolved | play, evolve | read by the "no evolution on the turn it was played" rule (RN-11) |
| `Slot::once_used`, `Player::markers`, `Game::markers` | set/cleared | ability use, per-turn resets | a marker is a `(scope, name_id, value)` triple; cleared per turn or per game according to its scope (RN-16 enforcement in [S04.T05](T05-actions-and-legality.md)) |
| `Game::stadium` | `Some(CardIdx)` | stadium play | the previous stadium card moves to its owner's discard in the same mutation |
| `Game::rng` | advanced by every draw of randomness | shuffles, coin flips | one stream per game; bot streams are separate ([S04.T10](T10-termination-stall-and-determinism.md)) |
| `Game::frames`, `Game::pending_prompt` | pushed/popped by the VM | [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md) | a pending prompt implies a non-empty frame stack or an engine-level prompt (promotion, setup) |
| `Game::board_version` | `+= 1` | board-shape changes only | BR-S04.T03-05 |
| `Game::events` | push | only when `log_enabled` | BR-S04.T03-08 |
| the database | — | never | the engine holds no connection (Architecture principle 1) |

## Interfaces

```rust
pub type CardIdx = u16;
pub type PlayerIdx = u8;      // 0 | 1
pub type SlotIdx = u8;        // 0 = active, 1..=8 = bench positions

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Zone { Deck, Hand, Discard, Prize, Active, Bench(u8), Attached, LostZone, Stadium }

#[derive(Debug, Clone, Copy)]
pub struct CardInst {
    pub def: DefIdx,                       // index into the job's card_defs (S04.T02)
    pub owner: PlayerIdx,
    pub zone: Zone,
    pub attached_to: Option<CardIdx>,      // Some only when zone == Attached
}

#[derive(Debug, Clone, Default)]
pub struct Slot {
    pub top: CardIdx,
    pub under: SmallVec<[CardIdx; 2]>,     // evolution stack, bottom last
    pub energies: SmallVec<[CardIdx; 4]>,
    pub tools: SmallVec<[CardIdx; 1]>,
    pub damage: u16,                       // in points; always a multiple of 10
    pub conditions: Conditions,            // bitflags
    pub turn_played: u16,
    pub turn_effects: SmallVec<[TurnEffect; 2]>,
    pub markers: SmallVec<[Marker; 2]>,
    pub once_used: SmallVec<[u16; 1]>,     // ability name ids used this turn (RN-16)
}

#[derive(Debug, Clone)]
pub struct Player {
    pub deck: Vec<CardIdx>,                // top of deck = last element
    pub hand: Vec<CardIdx>,
    pub discard: Vec<CardIdx>,
    pub prizes: Vec<CardIdx>,
    pub active: Option<Slot>,
    pub bench: [Option<Slot>; 8],
    pub bench_limit: u8,                   // RN-18; 5 at setup
    pub turn: TurnBudget,                  // energy_attached, supporter_played, stadium_played, stadium_used, retreated
    pub turn_effects: SmallVec<[TurnEffect; 2]>,
    pub markers: SmallVec<[Marker; 2]>,
    pub knocked_out_last_turn: SmallVec<[DefIdx; 2]>,
    pub deck_searched: bool,               // flips the "deck + prizes as one pile" view (RN-30, S06.T01)
}

#[derive(Debug, Clone)]
pub struct Game {
    pub players: [Player; 2],
    cards: Vec<CardInst>,                  // private: only move_card writes zones
    pub turn_no: u16,
    pub current: PlayerIdx,
    pub first_player: PlayerIdx,
    pub phase: Phase,                      // Setup | Turn | BetweenTurns | Ended
    pub stadium: Option<CardIdx>,
    pub rng: Xoshiro256StarStar,
    pub frames: Vec<Frame>,                // S05.T04
    pub pending_prompt: Option<Prompt>,    // S04.T09
    pub board_version: u32,
    pub events: Vec<Event>,
    pub outcome: Option<Outcome>,          // S04.T10
    log_enabled: bool,
}

// Hand-rolled: `bitflags` is not on the D-001 dependency allowlist and this is eight lines.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Conditions(u8);
impl Conditions {
    pub const ASLEEP: u8 = 1; pub const PARALYZED: u8 = 2; pub const CONFUSED: u8 = 4;
    pub const POISONED: u8 = 8; pub const BURNED: u8 = 16;
    pub const EXCLUSIVE: u8 = Self::ASLEEP | Self::PARALYZED | Self::CONFUSED;
    pub fn has(self, f: u8) -> bool { self.0 & f != 0 }
    pub fn set(&mut self, f: u8) { if f & Self::EXCLUSIVE != 0 { self.0 &= !Self::EXCLUSIVE; } self.0 |= f; }
    pub fn clear(&mut self, f: u8) { self.0 &= !f; }
    pub fn clear_all(&mut self) { self.0 = 0; }
}

#[derive(Debug, Clone, Copy)]
pub struct TurnEffect { pub source: Option<CardIdx>, pub kind: EffectKind, pub value: i16, pub until: u16 }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EffectKind {
    NoAttack, NoAttackNamed(u16), NoRetreat, NoItems, NoSupporters,
    DamagePlus, DamageMinus, NoWeakness, NoResistance, NoTargetEffects, NoAttackEffects,
}
```

**Queries** (no field stores these values):

```rust
impl Game {
    pub fn def(&self, idx: CardIdx) -> &CardDef;
    pub fn zone(&self, idx: CardIdx) -> Zone;
    pub fn slot(&self, p: PlayerIdx, s: SlotIdx) -> Option<&Slot>;
    pub fn hp_max(&self, p: PlayerIdx, s: SlotIdx) -> u16;          // printed + hp_max hooks, floor 10
    pub fn remaining_hp(&self, p: PlayerIdx, s: SlotIdx) -> u16;    // hp_max - damage, saturating
    pub fn is_knocked_out(&self, p: PlayerIdx, s: SlotIdx) -> bool; // damage >= hp_max
    pub fn bench_free_slots(&self, p: PlayerIdx) -> u8;             // bench_limit - occupied (RN-18)
    pub fn in_play(&self, p: PlayerIdx) -> impl Iterator<Item = (SlotIdx, &Slot)>;  // active first, then bench 1..8
}
```

**Mutation primitives** (the only writers of `CardInst::zone`; each calls `touch_board()` when the row above says so):

```rust
impl Game {
    pub(crate) fn move_card(&mut self, idx: CardIdx, to: Zone);
    pub(crate) fn attach(&mut self, card: CardIdx, p: PlayerIdx, s: SlotIdx);
    pub(crate) fn detach(&mut self, card: CardIdx, to: Zone);
    pub(crate) fn bench_put(&mut self, p: PlayerIdx, card: CardIdx) -> Result<SlotIdx, EngineError>;
    pub(crate) fn promote(&mut self, p: PlayerIdx, from: SlotIdx);
    pub(crate) fn evolve_onto(&mut self, p: PlayerIdx, s: SlotIdx, card: CardIdx);  // keeps damage, energies, tools
    pub(crate) fn discard_slot(&mut self, p: PlayerIdx, s: SlotIdx);                // top, under, energies, tools
    pub(crate) fn draw_one(&mut self, p: PlayerIdx) -> Option<CardIdx>;
    pub(crate) fn touch_board(&mut self);
    #[cfg(any(debug_assertions, feature = "invariants"))]
    pub fn assert_invariants(&self);
}
```

**Budget.** `size_of::<Game>()` is recorded in `engine/README.md`; the target is that a `Game` plus its owned buffers stays under 4 KB for a 120-card game, so an ISMCTS tree of 10,000 nodes fits comfortably in cache-friendly memory.

## Implementation steps

1. Declare `Zone`, `CardIdx`, `PlayerIdx`, `SlotIdx`, `CardInst` and `Conditions`; `cargo test` green on an empty module.
2. Declare `Slot`, `TurnEffect`, `EffectKind`, `Marker` and `TurnBudget` with `Clone` + `Default`; add `state.rs > slot_has_no_hp_field` (BR-S04.T03-02).
3. Declare `Player` and `Game`, derive `Clone`, add the clippy `disallowed-types` entries for `Rc`/`Arc`/`RefCell`/`Cell`/`HashMap`/`HashSet` inside `ptcg-core` (BR-S04.T03-03, -06).
4. Write `move_card` as the single zone writer plus the zone-list helpers; write `assert_invariants()` and call it from a `#[cfg(debug_assertions)]` wrapper in every primitive (RN-77).
5. Add `attach`/`detach`/`bench_put`/`promote`/`discard_slot`/`evolve_onto` with `touch_board()`, and the property test over 10,000 random mutation sequences asserting the permutation and the attachment invariant (BR-S04.T03-01, RN-77).
6. Add `draw_one`, `put_on_top`, `put_on_bottom` and the deck-order tests (BR-S04.T03-04).
7. Add `hp_max`/`remaining_hp`/`is_knocked_out`/`bench_free_slots`/`in_play`; `hp_max` calls a `hooks::hp_max_delta` stub returning 0 today, the seam [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) fills (RN-18, BR-S04.T03-02).
8. Add `board_version`, `log_enabled`, `push_event` and their tests (BR-S04.T03-05, -08).
9. Declare `frames: Vec<Frame>` and `pending_prompt: Option<Prompt>` with `Frame` and `Prompt` as placeholder types owned by [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md) and [S04.T09](T09-prompt-protocol.md); assert that cloning a state with a non-empty frame stack and a pending prompt produces two independently resumable copies (the property [S06.T05](../06-bots/T05-rollout-bot.md) needs).
10. Measure and record: `size_of::<Game>()`, heap bytes for a fresh 120-card game, and the time for one million `clone()` calls of a mid-game state in release; write the numbers into `engine/README.md` next to the crate map.

## Edge cases and error handling

- **A bench slot is freed by a knockout** → the hole stays: `bench[2] = None` while `bench[3]` is occupied. Compacting would renumber slots between a prompt being issued and answered, and the legacy's 1-based reindexing (`status.py::_shrink_bench` re-indexes with `enumerate(..., start=1)`) is exactly the kind of bookkeeping this avoids. `in_play` skips holes; `bench_free_slots` counts them.
- **`bench_limit` drops below the number of occupied slots** (Area Zero Underdepths leaves play) → the state model permits the transient inconsistency for the duration of one mutation and `assert_invariants()` tolerates it only while `phase == BetweenTurns`; resolving it — discarding the excess without awarding prizes — belongs to [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md).
- **A tool attached to a Pokémon that evolves** → `evolve_onto` pushes the old top into `under` and leaves `energies`/`tools` untouched, then re-points every attached card's `attached_to` at the new top. The legacy needed a patch for this (`status.py::_install_rule_fixes` item 4) because the tool kept pointing at the old card and its damage hooks stopped recognising the holder.
- **`hp_max` becomes lower than the accumulated damage** (a hook is removed, or an evolution to a lower-HP card) → `is_knocked_out` becomes true immediately and the knockout is processed by [S04.T07](T07-damage-pipeline.md) at the next check point. There is no zombie state, because nothing stores current HP; the legacy had to floor the evolved card's HP at 10 to avoid one.
- **A card appears in two zone lists** → `assert_invariants()` panics in debug and in `--features invariants` builds, naming the index and both zones. Release builds skip the check; the fuzz target in [S04.T11](T11-baseline-bots-random-heuristic.md) runs with the feature on, which is where such a bug is found.
- **A prompt is pending and the state is cloned** → both copies carry the same `pending_prompt` and frame stack and can be answered differently. This is the intended use; the test asserts the two resulting states differ and neither mutates the other (BR-S04.T03-03).
- **A deck with fewer than 60 cards reaches `Game::new`** → rejected there with `EngineError::DeckSize`; the `cards` vector is never partially built (RN-10, enforced in [S04.T04](T04-setup-and-turn-structure.md)).
- **`damage` not a multiple of 10** → impossible by construction: every writer adds counters, and the damage pipeline rounds to tens before applying. A debug assertion in `add_damage` makes an arithmetic slip visible immediately.
- **More than eight benched Pokémon** → `bench_put` returns `EngineError::IllegalAction`; the array has exactly eight slots, so there is no reallocation path and no silent growth.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core state` green, including `> every_card_is_in_exactly_one_zone` and `> attachment_points_at_a_slot_top` over 10,000 random mutation sequences (RN-77).
- [ ] `> bench_limit_is_a_field_not_a_constant` passes: with `bench_limit = 8` eight Basics are placed, with `bench_limit = 5` the sixth is refused; `policy.rs > no_bare_bench_five` finds no literal 5 outside the initialiser (RN-18).
- [ ] `> clone_is_independent`: a state is serialized, cloned, the clone mutated through twenty primitives, and the original re-serializes byte-identically (BR-S04.T03-03).
- [ ] `> card_indices_are_a_permutation_of_0..n` and `> cards_vec_len_is_constant` after the same 10,000-step run (BR-S04.T03-01).
- [ ] A state with a pending prompt and two frames clones into two copies that are answered differently and end in different states, with neither affecting the other (the property [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md) and [S06.T05](../06-bots/T05-rollout-bot.md) rely on).
- [ ] `cargo clippy -p ptcg-core -- -D warnings` clean with `HashMap`, `HashSet`, `Rc`, `Arc`, `RefCell` and `Cell` in the disallowed list (BR-S04.T03-06).
- [ ] `cargo bench clone_midgame` (or a release-mode timed loop): one million clones of a mid-game state complete in under one second on this machine, and the figure is written into `engine/README.md` with `size_of::<Game>()`.
- [ ] `> board_version_bumps_on_board_changes_only`: a hand→discard move leaves it unchanged, an attach increments it exactly once (BR-S04.T03-05).
- [ ] `> events_stay_empty_without_logging`: a scripted 30-turn sequence with `log: false` leaves `events.len() == 0` (BR-S04.T03-08).

## Risks and open questions

- **Risk — `SmallVec` inline sizes chosen wrong.** Four energies and one tool inline cover the common case, but a Pokémon with six energies spills to the heap and slows cloning. Mitigation: [S04.T18](T18-performance-baseline.md) reports the spill rate; the inline sizes are two constants and changing them is source-compatible.
- **Risk — `assert_invariants()` is too slow to keep on in the fuzz target.** It is O(cards) per mutation. Mitigation: it is behind `debug_assertions` or an explicit feature; the fuzzing run in [S04.T11](T11-baseline-bots-random-heuristic.md) uses a release build with `--features invariants` and a reduced game count, and the cost is measured once.
- **Risk — the `Frame`/`Prompt` placeholders constrain S05.** Declaring fields for types owned elsewhere couples this file to [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md). Mitigation: the fields are `Vec<Frame>` and `Option<Prompt>` and nothing here reads their contents, so S05 can define them freely as long as both are `Clone`.
- **Question — should bench slots be a `SmallVec<[Slot; 5]>` instead of `[Option<Slot>; 8]`?** The array wastes a few hundred bytes per state when the bench is small, but keeps slot indices stable, which prompts depend on. Recommendation: keep the array; revisit only if [S04.T18](T18-performance-baseline.md) shows the memory per rollout node is the binding constraint for [S06.T06](../06-bots/T06-ismcts-bot.md).
- **Question — should `events` be a separate side-channel rather than a field?** Keeping it in `Game` means a logging clone also clones the log. Recommendation: keep it in `Game` while logging is off by default; if [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md) needs logs during rollouts, move the buffer out then. Decided at S07.

## References

- `pokemon/src/pokesearch/sim/status.py` — verified: `_base_stats` at L159-170 with its note that reading the two printed numbers used to instantiate the card class again, "23 mil instâncias em 30 partidas"; `_hook` at L198-207 with its note that the per-recipe `ACTIVE_HOOKS` declaration removed "1,6 milhão de consultas por 30 partidas" landing in methods that returned zero; `_refresh_hp_field` (the max-versus-current reconciliation this model removes); `_shrink_bench` (1-based re-indexing); the state-checker patch at L791-806 that raised the hard-coded bench maximum of five to `player.benchSize` (RN-18). Consult for the failure modes; nothing is ported.
- [S04.T01](T01-engine-workspace-and-crates.md) — the `Game` facade signatures this module implements and the no-globals rule the design rests on.
- [S04.T02](T02-card-definition-model.md) — `CardDef` and `DefIdx`, the printed values `hp_max` starts from.
- [Architecture](../../project/03-architecture-overview.md) — "Generator coroutines, no cloning → Frame stack inside a cloneable state" and determinism principle 5.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-18, RN-77; [Glossary](../../project/07-glossary.md) "Zone", "Slot", "Damage counter vs damage", "Turn effect", "Marker".

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
