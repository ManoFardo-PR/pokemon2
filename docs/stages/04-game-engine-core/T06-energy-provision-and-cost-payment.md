# S04.T06 — Energy provision and cost payment

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 6 / 18 |
| Depends on | [S04.T02](T02-card-definition-model.md), [S04.T05](T05-actions-and-legality.md) |
| Unblocks | [S04.T07](T07-damage-pipeline.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) |
| Parallel with | [S04.T09](T09-prompt-protocol.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` actions (`Attack`, `Retreat` need cost checks) — from [S04.T05](T05-actions-and-legality.md)
- `doc` ESPECIFICACAO.md §6.1 — the declared legacy gap: "provides every type of Energy, one at a time" left Prism, Legacy and Neo Upper approximated
- `contract` `CardDef::energy` (the provision units a card declares) and the `approx_energy` tag — from [S04.T02](T02-card-definition-model.md)

## Outputs (proposed)
- `module` `ptcg-core::energy` — `Unit { types: TypeSet | Any }`, `provided_units(slot) → Vec<Unit>` (basic energy = 1 unit of its type; special energy = its `provides` units; modifiers may add units), `can_pay(cost: &[TypeSlot], units) → Option<Assignment>` via a small bipartite matching (≤ 10 units × ≤ 5 slots), `retreat_cost(slot)` through the `retreat_cost` hook — consumed by [S04.T07](T07-damage-pipeline.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)
- `contract` hook shapes `energy_provision(slot) → Vec<Unit>` and `attack_cost(slot, attack) → Vec<TypeSlot>` (can add or remove slots, incl. −N Colorless) that [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) will populate

## Initial objective
What an attached energy provides is decided when a cost is paid, not when it is attached — the structural wall of the legacy engine — so 'provides every type but one at a time' and cost reductions are representable.

## Context

This is the smallest subtask in the stage and the one that removes the biggest structural limitation of the legacy simulator. In the third-party engine an attached energy contributed a fixed list of types, frozen at attach time: `pokemon/src/pokesearch/sim/cardspec.py::energy_provides` had to reduce every special energy to a static list of `CardType` names, and its own docstring says so — *"'Fornece todos os tipos' não é representável numa lista fixa e vira COLORLESS (aproximação)"*. The companion property `energy_provides_exact` exists purely to flag which cards were approximations. ESPECIFICACAO §6.1 lists the casualties as a declared gap: Prism Star, Legacy and Neo Upper energies stayed approximate, and so did Meganium's "one energy counts as two".

The fix is a change of question. Instead of asking "what does this energy provide?" at attach time, the engine asks "can this cost be paid by these attached cards?" at payment time, and answers with a concrete assignment. An energy that provides every type one at a time becomes a unit whose type set is all eleven types with multiplicity one — a perfectly ordinary participant in a matching problem. A cost reduction becomes a shorter cost vector. An energy that counts as two becomes two units from one card. None of those needs a special case in the payment code.

The sizes involved are tiny, which is what makes exactness affordable: at most ten attached cards and at most five cost slots in the current Standard pool. A greedy pass would be wrong (a Colorless slot can eat the only Psychic unit), so `can_pay` runs a bipartite matching — Hopcroft–Karp on a graph of at most 10 × 5 edges, which is a few hundred nanoseconds and is called on the order of tens of times per turn. The legacy's `_can_pay` in `policies.py` was a count-based approximation living in the bot, not in the engine, which is why the bot's idea of payable and the engine's could differ.

The assignment is returned, not just a boolean, because effects need it: "discard an Energy used to pay for this attack" must know which cards were used. It is also deterministic — the matching visits units in slot order and types in a fixed enum order, so the same state always yields the same assignment, and a tie among several valid assignments is broken the same way in every worker (a precondition of [S04.T10](T10-termination-stall-and-determinism.md)).

Retreat is the place where the assignment becomes visible to the player: when several distinct sets of energies can pay the retreat cost, the engine opens a `retreat_payment` prompt rather than choosing silently. When only one assignment exists, no prompt is opened — a prompt that has one answer is noise in the log and a wasted round trip for a bot.

## Scope

- **In scope.** `Unit`, `TypeSet`, `Assignment` and `CostSlot`; `provided_units(game, p, s)` combining printed basic/special energy provision with the `energy_provision` hook; `can_pay(cost, units)` with the matching algorithm and its determinism rule; `attack_cost(game, p, s, i)` and `retreat_cost(game, p, s)` reading their hooks; the distinct-assignment count used to decide whether retreat opens a prompt; the payment application (`pay(assignment, to: discard)` for retreat); the unit tests for the type algebra.
- **Out of scope.** The `Attack` and `Retreat` actions themselves ([S04.T05](T05-actions-and-legality.md)) — they call into here; the `retreat_payment` prompt type and its validation ([S04.T09](T09-prompt-protocol.md)); damage ([S04.T07](T07-damage-pipeline.md)); the modifier index that supplies the hooks ([S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)); the IR ops that move, attach or discard energy ([S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md)); how a bot decides which energy to attach ([S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md)).

## Business rules

The traceability doc assigns no `RN-nn` here. The rules below are the contract [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) programs against and the reason ESPECIFICACAO §6.1's declared gap does not reappear.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S04.T06-01 | An attached card's contribution is computed at payment time, never stored: `provided_units` is a pure function of the slot and the modifier index, and no field anywhere records what an energy provides. | `energy::provided_units`; `Slot` has no `provides` field ([S04.T03](T03-game-state-model.md)) | `energy.rs > provision_is_recomputed_after_a_modifier_change` (same attachment yields different units before and after a stub modifier is added); `policy.rs > slot_has_no_provides_field` |
| BR-S04.T06-02 | A basic energy contributes exactly one unit of its printed type. A special energy contributes the units declared in `CardDef::energy.provides`; a special energy with no program contributes one `Any` unit and its card is tagged `approx_energy` ([S04.T02](T02-card-definition-model.md)), so the approximation is countable rather than invisible. | `energy::provided_units` reading `CardDef::energy` | `energy.rs > basic_energy_is_one_unit_of_its_type`; `> unprogrammed_special_energy_is_one_any_unit` |
| BR-S04.T06-03 | A cost is payable only when a **complete** assignment exists: every typed slot receives a unit whose type set contains that type, every `colorless` slot receives any remaining unit, and no unit pays two slots. Counting energies is never used as a substitute. | `energy::can_pay` via Hopcroft–Karp matching over ≤ 10 × 5 | `energy.rs > cost_WWC_is_payable_by_W_W_any`; `> cost_PP_is_not_payable_by_P_and_D`; `> a_P_or_D_unit_pays_either_slot`; `> colorless_slot_never_steals_the_only_typed_unit` |
| BR-S04.T06-04 | `can_pay` is deterministic: for identical inputs it returns the same `Assignment`, because units are enumerated in `(slot position, attachment index)` order and types in the declared enum order, and the matching uses no hash iteration. | `energy::can_pay`; `TypeSet` is a bitmask, `Assignment` a `SmallVec` | `energy.rs > assignment_is_deterministic` (same inputs, 1,000 calls, identical output); covered again by the fingerprint test of [S04.T10](T10-termination-stall-and-determinism.md) |
| BR-S04.T06-05 | The `attack_cost` hook may add or remove slots, including removing Colorless slots (`−N Colorless`); the resulting cost can be empty but never negative in length, and removals take Colorless slots first, then the rightmost typed slots. | `energy::attack_cost` applying hook deltas in a fixed order | `energy.rs > minus_one_colorless_shortens_the_cost`; `> a_reduction_larger_than_the_cost_yields_an_empty_cost`; `> reduction_removes_colorless_before_typed` |
| BR-S04.T06-06 | `retreat_cost` is the printed cost plus hook deltas, floored at 0; a `retreat_zero` modifier yields 0 regardless of the printed value; a `CardDef::retreat` of `null` means the Pokémon cannot retreat at all and is not the same as 0. | `energy::retreat_cost` returning `Option<u8>` | `energy.rs > retreat_zero_modifier_beats_printed_cost`; `> null_retreat_is_not_zero` |
| BR-S04.T06-07 | Retreat opens a `retreat_payment` prompt only when more than one **distinct set of cards** can pay; with exactly one, the payment is applied without a prompt. Distinctness is by the set of `CardIdx`, not by the assignment permutation. | `energy::distinct_payment_sets(cost, units) -> usize` (counts up to a cap of 32, then reports "many") | `energy.rs > one_payable_set_opens_no_prompt`; `> two_payable_sets_open_a_prompt`; `> permutations_of_the_same_set_count_once` |
| BR-S04.T06-08 | Payment discards exactly the cards named by the accepted assignment, in attachment order, and never touches an energy that was not part of it. | `energy::pay(game, p, s, assignment, to)` | `energy.rs > payment_discards_exactly_the_chosen_cards`; `> payment_leaves_other_energies_attached` |
| BR-S04.T06-09 | One card may contribute more than one unit (an energy that "counts as two"), and the units of one card are never split across a payment in a way that uses the card twice for one slot; the cards behind an assignment are deduplicated before discarding. | `Unit::source: CardIdx`; `Assignment::cards()` deduplicates | `energy.rs > a_two_unit_energy_pays_two_slots_and_is_discarded_once` |

## Data operations

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `Slot::energies` | read only | `provided_units`, `can_pay`, `distinct_payment_sets` | provision never mutates; a query with side effects would break `legal_actions` purity ([S04.T05](T05-actions-and-legality.md)) |
| `Slot::energies` → `Player::discard` | cards moved in attachment order | retreat payment resolution | exactly the cards of the accepted assignment (BR-S04.T06-08), deduplicated (BR-S04.T06-09) |
| `Slot::energies` → arbitrary zone | cards moved | an attack effect that discards energy used to pay (S05) | the effect receives the `Assignment` produced by the attack's cost check; it never recomputes one |
| `Game::pending_prompt` | set to a `retreat_payment` prompt | `apply(Retreat)` when `distinct_payment_sets > 1` | candidates are the attached energies of the retreating slot; `min = max = retreat_cost` |
| `Player::turn.retreated` | `= true` | after the payment resolves, not before | a cancelled or invalid payment leaves the budget unspent ([S04.T09](T09-prompt-protocol.md)) |
| `Game::board_version` | `+= 1` | when a payment detaches cards | the modifier index and the `legal_actions` cache are invalidated ([S04.T03](T03-game-state-model.md)) |
| `Game::rng` | not advanced | anywhere in this module | payment consumes no randomness, so a tie broken here cannot perturb a shuffle (BR-S04.T06-04) |
| the database | — | never | the engine holds no connection |

## Interfaces

```rust
/// A bitmask over the eleven energy types; `Any` is the full mask.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TypeSet(u16);
impl TypeSet {
    pub const ANY: TypeSet = TypeSet(0b111_1111_1111);
    pub fn of(t: Type) -> TypeSet;
    pub fn contains(self, t: Type) -> bool;
    pub fn is_any(self) -> bool;
}

/// One payable unit contributed by one attached card. A card may contribute several.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Unit { pub types: TypeSet, pub source: CardIdx }

/// A cost slot: a concrete type, or Colorless meaning "any single unit".
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum CostSlot { Typed(Type), Colorless }

/// unit index per cost slot, in cost order.
pub type Assignment = SmallVec<[u8; 5]>;

pub fn provided_units(game: &Game, p: PlayerIdx, s: SlotIdx) -> SmallVec<[Unit; 8]>;
pub fn can_pay(cost: &[CostSlot], units: &[Unit]) -> Option<Assignment>;
pub fn distinct_payment_sets(cost: &[CostSlot], units: &[Unit]) -> PaymentSets; // Exactly(n) | Many
pub fn attack_cost(game: &Game, p: PlayerIdx, s: SlotIdx, attack: u8) -> SmallVec<[CostSlot; 5]>;
pub fn retreat_cost(game: &Game, p: PlayerIdx, s: SlotIdx) -> Option<u8>;       // None = cannot retreat
pub(crate) fn pay(game: &mut Game, p: PlayerIdx, s: SlotIdx, a: &Assignment, to: Zone);

pub enum PaymentSets { Exactly(u8), Many }      // counting stops at 32 (BR-S04.T06-07)

pub const MAX_UNITS: usize = 10;
pub const MAX_COST_SLOTS: usize = 5;
```

**Hook shapes** — the contract [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) implements. Names are stable and must not change:

```rust
pub(crate) mod hooks {
    /// Extra units contributed by anything other than the attached cards' printed text
    /// (an ability that makes an attachment count as two, a stadium that adds a Colorless).
    pub fn energy_provision(game: &Game, p: PlayerIdx, s: SlotIdx) -> SmallVec<[Unit; 2]>;

    /// Deltas to an attack's printed cost. Positive entries add slots; `minus_colorless`
    /// removes that many Colorless slots first, then the rightmost typed slots.
    pub fn attack_cost(game: &Game, p: PlayerIdx, s: SlotIdx, attack: u8) -> CostDelta;

    /// Delta to the printed retreat cost; `zero = true` overrides everything.
    pub fn retreat_cost(game: &Game, p: PlayerIdx, s: SlotIdx) -> RetreatDelta;
}

pub struct CostDelta { pub add: SmallVec<[CostSlot; 2]>, pub minus_colorless: u8, pub minus_any: u8 }
pub struct RetreatDelta { pub delta: i8, pub zero: bool }
```

**Matching.** `can_pay` builds a bipartite graph with cost slots on one side and units on the other; a `Typed(t)` slot connects to every unit whose `types` contains `t`, a `Colorless` slot connects to every unit. Hopcroft–Karp finds a maximum matching; the cost is payable when the matching saturates every slot. Slots are processed in cost order, units in `(slot position, attachment index)` order, giving BR-S04.T06-04. With `MAX_UNITS = 10` and `MAX_COST_SLOTS = 5` the graph never exceeds 50 edges.

**Worked examples** (the unit tests):

| Cost | Units | Result |
|---|---|---|
| `[W, W, C]` | `{W}, {W}, ANY` | payable, assignment `[0, 1, 2]` |
| `[P, P]` | `{P}, {D}` | not payable |
| `[P]` | `{P,D}` | payable — a dual-type unit pays either slot |
| `[C, P]` | `{P}, {F}` | payable: the Colorless slot must take `{F}`, not `{P}` (BR-S04.T06-03) |
| `[F, F, C]` minus 1 Colorless | `{F}, {F}` | payable after the hook shortens the cost to `[F, F]` (BR-S04.T06-05) |
| `[M, M]` | one card contributing `{M}` twice | payable; that card is discarded once (BR-S04.T06-09) |
| `[C]` | `ANY` (unprogrammed special energy) | payable; the card is tagged `approx_energy` (BR-S04.T06-02) |

## Implementation steps

1. Declare `TypeSet`, `Unit`, `CostSlot`, `Assignment` and the two constants; add the type-algebra unit tests (`of`, `contains`, `is_any`). `cargo test` green.
2. Implement `provided_units` for printed energy only (basic → one typed unit, special → declared units or one `Any`); spec BR-S04.T06-02.
3. Implement `can_pay` with Hopcroft–Karp over the bounded graph; spec the seven worked examples above (BR-S04.T06-03).
4. Pin determinism: enumerate units and slots in the fixed order, assert `> assignment_is_deterministic` over 1,000 repeated calls with shuffled-but-equal inputs (BR-S04.T06-04).
5. Add the `energy_provision` hook seam returning an empty list, and the test that provision changes when a stub modifier is registered (BR-S04.T06-01).
6. Implement `attack_cost` with `CostDelta` and the removal order (Colorless first, then rightmost typed); spec the three reduction cases (BR-S04.T06-05).
7. Implement `retreat_cost` with `RetreatDelta`, the `zero` override and the `None` case; spec both (BR-S04.T06-06).
8. Implement `distinct_payment_sets` with the cap at 32 and set-level distinctness; spec the three counting cases (BR-S04.T06-07).
9. Implement `pay` with attachment-order discard and card deduplication; wire it into `apply(Retreat)` of [S04.T05](T05-actions-and-legality.md) for the single-assignment path, and into the `retreat_payment` prompt answer for the multi-assignment path (BR-S04.T06-08, -09).
10. Benchmark: `can_pay` on the worst realistic shape (10 units, 5 slots, all Colorless) and record nanoseconds per call in the module header, so [S04.T18](T18-performance-baseline.md) knows whether payment is on the hot path.

## Edge cases and error handling

- **A retreat with several payable energy assignments** → `distinct_payment_sets` returns `Exactly(n)` with `n > 1`, a `retreat_payment` prompt is opened with the attached energies as candidates and `min = max = retreat_cost`, and the answer names the cards. With `Exactly(1)`, `pay` runs immediately and no prompt appears in the log.
- **Retreat cost 0** → no payment, no prompt, and the retreat still consumes `turn.retreated`. A `null` printed retreat is different: the Pokémon cannot retreat at all, so the action is absent (BR-S04.T06-06).
- **An attack cost reduced below zero slots** → the cost becomes empty and the attack is free. The reduction is clamped at an empty cost, never negative, and the order of removal (Colorless first) matters because removing a typed slot first would make a cost payable that should not be.
- **An `Any` unit and a typed slot that only it can fill** → the matching handles it; a greedy left-to-right pass would not, which is precisely why `can_pay` is a matching and not a counter.
- **More than ten attached cards** on one Pokémon → `provided_units` truncates at `MAX_UNITS` and records a debug assertion; ten is well above anything in the current Standard pool, and an unbounded graph would make the worst case unpredictable for [S04.T18](T18-performance-baseline.md).
- **A special energy whose program grants units conditionally** (only while the Pokémon is Active, only for a Fire Pokémon) → the condition is evaluated inside the `energy_provision` hook at payment time, so the same attachment pays one cost and not another in the same turn. This is exactly what the legacy could not express.
- **An effect that discards "an Energy used to pay for this attack" when the attack was free** → the assignment is empty, the effect finds no candidate and resolves as a no-op; it never falls back to discarding an arbitrary attached energy.
- **A modifier disappears between the legality check and the payment** (a stadium replaced by an effect mid-resolution) → `apply` re-reads the cost through the same functions, so the payment either still works or fails with `EngineError::IllegalAction`; no half-paid state exists because `pay` runs after a successful `can_pay`.
- **A payment prompt answered with cards that do not form a valid assignment** → rejected by the prompt validator ([S04.T09](T09-prompt-protocol.md)), counted as an invalid answer (RN-21) and replaced by the deterministic default assignment from `can_pay`.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core energy` green, including `> cost_WWC_is_payable_by_W_W_any`, `> cost_PP_is_not_payable_by_P_and_D`, `> a_P_or_D_unit_pays_either_slot` and `> colorless_slot_never_steals_the_only_typed_unit` (BR-S04.T06-03).
- [ ] `> minus_one_colorless_shortens_the_cost`, `> reduction_removes_colorless_before_typed` and `> a_reduction_larger_than_the_cost_yields_an_empty_cost` with a stub `attack_cost` hook (BR-S04.T06-05).
- [ ] `> provision_is_recomputed_after_a_modifier_change`: the same attached card yields `{W}` before and `{W}, {W}` after a stub `energy_provision` modifier is registered, with no state field changed (BR-S04.T06-01).
- [ ] `> assignment_is_deterministic`: 1,000 calls with the same inputs return an identical `Assignment`, and `policy.rs > core_has_no_hash_iteration` still passes for this module (BR-S04.T06-04).
- [ ] `> one_payable_set_opens_no_prompt` and `> two_payable_sets_open_a_prompt` driven through `apply(Retreat)`; the first leaves `pending_prompt` empty, the second sets a `retreat_payment` prompt (BR-S04.T06-07).
- [ ] `> payment_discards_exactly_the_chosen_cards` and `> a_two_unit_energy_pays_two_slots_and_is_discarded_once` (BR-S04.T06-08, -09).
- [ ] `> unprogrammed_special_energy_is_one_any_unit` and the corresponding `CardDef` carries `approx_energy`, so a coverage report can count the approximation ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)) (BR-S04.T06-02).
- [ ] The `can_pay` benchmark on 10 units × 5 Colorless slots is recorded in the module header and is under one microsecond per call on this machine.

## Risks and open questions

- **Risk — the matching becomes the hot path.** `can_pay` runs for every attack and retreat in `legal_actions`, which is every action enumeration. Mitigation: a fast path short-circuits when the unit count is below the slot count or when every slot is Colorless; step 10 measures it and [S04.T18](T18-performance-baseline.md) reports it in the profile.
- **Risk — `Any` units make almost every attack look payable** for cards still carrying the `approx_energy` approximation, inflating a deck's apparent speed. Mitigation: the tag is on the definition, so [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) counts those copies as not exact and the two coverage numbers show it (RN-70). A measurement on a suite containing such a card is labelled, not silently trusted.
- **Risk — the hook order becomes ambiguous** when two modifiers reduce the same cost. Mitigation: `CostDelta` accumulates `minus_colorless` and `minus_any` as sums and applies them in one documented order; [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) orders contributors by `(slot, card idx)`, so the sum is deterministic regardless of which card was played first.
- **Question — should `distinct_payment_sets` cap at 32 or compute exactly?** With ten units and five slots the exact count can reach the hundreds, and the only consumer is the boolean "more than one". Recommendation: keep the cap; `Many` and `Exactly(n > 1)` lead to the same prompt.
- **Question — should the engine offer the player a choice of *which* assignment pays an attack**, not only a retreat? Nothing in the current pool depends on it, since attack payment discards nothing by default. Recommendation: leave it out; if an S05 card needs it, the seam is `pay` plus a prompt and the change is local. Decided when such a card is first coded.

## References

- `pokemon/src/pokesearch/sim/cardspec.py` — verified: `energy_provides` deriving a fixed list of engine `CardType` names from the card name (basic) or from "it provides X Energy" / "provides N in any combination of A and B" (special), with the explicit note that "provides every type of Energy" is not representable as a fixed list and degrades to `COLORLESS`; `energy_provides_exact` exists only to mark those approximations. Consult for the text patterns; the fixed-list model is what this subtask replaces.
- `pokemon/ESPECIFICACAO.md` §6.1 — verified: the declared gap list, headed by "'Fornece todos os tipos de Energia, um por vez': Prism, Legacy e Neo Upper ficam aproximadas", and "Meganium (energia valendo por duas)". These are the cases BR-S04.T06-02 and BR-S04.T06-09 make representable.
- `pokemon/src/pokesearch/sim/policies.py` — verified: `_can_pay(cost, energy)` in the bot, a counting approximation that lived outside the engine. Consult as the reason payment belongs in the engine.
- twinleafgg (`C:\tmp\tw`, commit `b26ec9c`, MIT) `legacy-energy.ts` — **to verify at implementation time**: the reference behaviour reported in the planning notes is that it pushes a wildcard type into the energy map for "provides every type" energies. Read it before finalising the `Any` semantics; it is a translation source, not an engine to copy.
- [S04.T02](T02-card-definition-model.md) — `CardDef::energy`, the `approx_energy` tag and the `Unit` shape shipped with a job.
- [S04.T05](T05-actions-and-legality.md) — predicate 7 of the legality chain, the caller of `attack_cost`, `retreat_cost` and `can_pay`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
