# S04.T09 — Prompt protocol

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 9 / 18 |
| Depends on | [S04.T03](T03-game-state-model.md), [S04.T05](T05-actions-and-legality.md) |
| Unblocks | [S04.T11](T11-baseline-bots-random-heuristic.md), [S04.T13](T13-scenario-format-and-runner.md), [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md), [S06.T01](../06-bots/T01-honest-information-view.md), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md) |
| Parallel with | [S04.T06](T06-energy-provision-and-cost-payment.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` state (`pending_prompt`, frames) — from [S04.T03](T03-game-state-model.md)
- `module` actions needing choices (retreat payment, bench placement, KO promotion) — from [S04.T05](T05-actions-and-legality.md)
- `file` `pokemon/src/pokesearch/sim/policies.py` — `MAX_CHOICE_SCAN = 400` and the prose-matching `choose` function; read-only reference

## Outputs (proposed)
- `contract` `Prompt { id, actor: PlayerIdx, owner: PlayerIdx, purpose: Purpose, source: Option<CardIdx>, kind }` with `kind ∈ ChooseCards { zone, candidates: [{ def, idxs, max_pick }], min, max, may_cancel }, ChoosePokemon { side, slots, min, max }, ChooseAttack { options }, ChooseOption { labels }, DistributeCounters { targets, total, max_per }, MoveEnergy { from, to_candidates, count }, OrderCards { cards }, Confirm`; `Purpose ∈ search_to_hand | search_to_bench | discard_cost | discard_effect | attach_target | switch_in_own | switch_in_opponent | promote_after_ko | choose_prize | order_deck_top | distribute_counters | distribute_energy | choose_attack_to_copy | may_use | choose_one | reveal_ack | opening_active | bench_setup | retreat_payment`; `Answer` enum mirroring the kinds; `validate_answer(prompt, answer) → Result` in O(n) — consumed by [S04.T11](T11-baseline-bots-random-heuristic.md), [S04.T13](T13-scenario-format-and-runner.md), [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md), [S06.T01](../06-bots/T01-honest-information-view.md), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md)
- `module` `ptcg-core::prompt::defaults` — deterministic default resolver per purpose (used for invalid answers and for the random bot)
- `contract` RN-21: an invalid answer increments `invalid_actions` and the default resolver's answer is used; the game never aborts on a bot mistake

## Initial objective
Every decision the rules delegate to a player is a structured, machine-readable question with an explicit actor (which may be the opponent), answered in O(n) without ever enumerating card combinations.

## Context

The prompt protocol is the interface between the rules and everything that decides — bots, scenarios, the future WASM player. Getting it wrong is expensive in two specific ways, and the legacy hit both.

**Combinatorial explosion.** The third-party engine turned "choose 2 of these 7 cards" into 21 distinct `ChooseCardAction`s, "choose 3 of 10" into 120, and so on. Bots then scanned a prefix of that list — `pokemon/src/pokesearch/sim/policies.py:18` caps it at `MAX_CHOICE_SCAN = 400` — which means that past a certain hand size the bot simply could not see most of its options, and which option it did see depended on an arbitrary enumeration order. Here a prompt states the *shape* of the choice (`min`, `max`, candidates) and the answer names the picks. Validation is O(n) in the number of candidates, never in the number of subsets, and a prompt with 10 candidates and `max: 3` is one object with ten entries.

**Prose as an interface.** The legacy prompt carried a `tips` string of English text, and the heuristic bot's `choose` function decided what to do by looking for substrings: `"discard" and "hand"`, `"knocked out"`, `"opponent" and ("switch" or "bench")`, `"prize"`, `"deck" or "search" or "put"`, `"damage counter"`. That is a parser for card text pretending to be an API. Here every prompt carries a `Purpose` from a closed enum, and a bot dispatches on it. The nineteen purposes in the Outputs are the closed set; adding one is a contract change with a `CONTRACT_VERSION` bump ([S01.T05](../01-foundation/T05-shared-contracts-package.md)).

Three further properties are decided here. **The actor may not be the owner**: Escape Rope-style effects have the opponent choose among your Pokémon, and Xerosic-style effects have you choose among theirs. `actor` says who answers, `owner` says whose cards are at stake, and [S06.T01](../06-bots/T01-honest-information-view.md) uses both to build an honest view. **Identical copies are interchangeable, benched Pokémon are not**: `ChooseCards` groups candidates by `def` with an `idxs` list and a `max_pick`, so picking "two Ultra Balls" does not require naming which two, while `ChoosePokemon` addresses slots individually because two identical benched Pokémon with different damage are genuinely different. **Hidden zones expose only counts**: a prize choice lists six positions, not six cards.

RN-21 closes the loop. The legacy counted an illegal bot action as an error and substituted `actions[0]` — the first legal action, which is whatever the enumeration happened to put first. Here an invalid answer increments `invalid_actions` and is replaced by the *default resolver's* answer for that purpose, which is a documented, deterministic choice rather than an accident of ordering. The game never aborts on a bot mistake, because a measurement that crashes on a bad bot measures nothing.

## Scope

- **In scope.** The `Prompt`, `Purpose`, `PromptKind`, `Answer` and `Candidate` types with their `serde` representation; `validate_answer` with its O(n) guarantee and its error reasons; `prompt::defaults` — one deterministic resolver per purpose; the `invalid_actions` counter and the substitution path (RN-21); prompt id allocation and the rule that an answer names the id it answers; the candidate-grouping rule for `ChooseCards`; the `may_cancel` semantics; the helper that opens a prompt from inside the engine and the one that resumes whatever was suspended.
- **Out of scope.** Which prompts a card opens (S05); the engine-level prompts' own logic — setup ([S04.T04](T04-setup-and-turn-structure.md)), retreat payment ([S04.T06](T06-energy-provision-and-cost-payment.md)), promotion ([S04.T07](T07-damage-pipeline.md), [S04.T08](T08-special-conditions-and-checkup.md)) — they use this contract; the player view that hides information from a bot ([S06.T01](../06-bots/T01-honest-information-view.md)); bot answering strategies beyond the defaults ([S04.T11](T11-baseline-bots-random-heuristic.md), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md)); the frame stack that suspends on a prompt ([S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md)); the scenario `answer` step ([S04.T13](T13-scenario-format-and-runner.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-21 | **Revised.** An illegal action or an invalid prompt answer increments `Game::invalid_actions` and is replaced by the deterministic default — the default *resolver's* answer for that purpose, not "the first legal option" as in the legacy. The game never aborts and never stalls on a bot mistake. | `Game::answer` catching `validate_answer`'s error, then calling `defaults::resolve`; `Game::apply` doing the same for actions ([S04.T05](T05-actions-and-legality.md)) | `prompt.rs > an_invalid_answer_is_counted_and_replaced`; `> the_replacement_is_the_default_not_the_first_candidate`; `> a_bot_that_always_answers_garbage_still_finishes_a_game` (property test, 200 games) |
| BR-S04.T09-01 | A prompt never enumerates combinations: `ChooseCards` carries candidates grouped by definition with `idxs` and `max_pick`, and `validate_answer` runs in O(candidates + picks). No prompt kind contains a list of alternative answers. | the `PromptKind` type; `validate_answer` implementation | `prompt.rs > validate_answer_is_linear` (10 candidates, `max: 3`, one prompt object, validation touches ≤ 13 entries); `policy.rs > prompt_kind_has_no_answer_list` |
| BR-S04.T09-02 | Every prompt names both `actor` (who answers) and `owner` (whose cards are at stake); they differ for `switch_in_opponent` and for `promote_after_ko` raised during the opponent's turn. A bot is never asked to answer a prompt whose `actor` is not itself. | `Prompt` construction helpers require both; the driver routes by `actor` ([S04.T12](T12-cli-job-protocol.md)) | `prompt.rs > actor_and_owner_can_differ`; `> the_driver_routes_by_actor` |
| BR-S04.T09-03 | `validate_answer` is total and pure: every `(prompt, answer)` pair yields `Ok` or `Err(reason)`, it mutates nothing, and the reason names the first violated constraint (`unknown_prompt`, `wrong_kind`, `too_few`, `too_many`, `not_a_candidate`, `duplicate_pick`, `exceeds_max_pick`, `cancel_not_allowed`, `total_mismatch`, `slot_empty`). | `prompt::validate_answer(&Prompt, &Answer) -> Result<(), InvalidAnswer>` | `prompt.rs > every_reason_is_reachable` (one test per reason); `> validate_answer_is_pure` |
| BR-S04.T09-04 | For every purpose there is exactly one default resolver, it always returns an answer that validates, and it is deterministic — it uses no randomness and depends only on the prompt and the state. | `defaults::resolve(game, prompt) -> Answer`, a `match` over `Purpose` with no `_` arm | `prompt.rs > default_resolver_covers_every_purpose` (exhaustive match, compile-enforced); `> default_answers_always_validate` (property test over 10,000 generated prompts); `> default_resolver_is_deterministic` |
| BR-S04.T09-05 | Candidates in a `ChooseCards` prompt are grouped by `def` and ordered by the zone's own order; `idxs` lists the concrete card indices of a group in that same order, and `max_pick` is the group's size. An answer picks `(group, count)` pairs, never raw card indices from a hidden zone. | `Prompt::choose_cards` builder; `Answer::Cards(SmallVec<(u8, u8)>)` | `prompt.rs > identical_copies_are_one_group`; `> picking_two_of_a_group_of_three_is_valid`; `> picking_four_of_a_group_of_three_is_exceeds_max_pick` |
| BR-S04.T09-06 | A hidden zone exposes counts only: a `choose_prize` prompt lists positions `0..prizes.len()` with no `def`, and a deck search that reveals nothing lists no card identities. Revealing is an explicit prompt field (`reveal: true`), not a side effect of being asked. | `Prompt::choose_cards` refusing to attach `def` for `Zone::Prize` and for non-revealing searches | `prompt.rs > prize_candidates_carry_no_def`; `> a_non_revealing_search_hides_identities` |
| BR-S04.T09-07 | `may_cancel` means the answer `Answer::Cancel` is valid and the effect resolves as "did nothing"; without it, `Cancel` is `cancel_not_allowed`. A mandatory prompt with zero valid answers is never opened — the caller checks first and skips. | `validate_answer`'s cancel branch; the `open_prompt` helper asserting a non-empty candidate set for mandatory prompts | `prompt.rs > cancel_is_valid_only_when_may_cancel`; `> a_mandatory_prompt_with_no_candidates_is_not_opened` |
| BR-S04.T09-08 | Prompt ids are per-game monotonic `u32`s; an answer carrying a different id than `pending_prompt` is `unknown_prompt` and is handled by RN-21's path. Ids are never reused within a game. | `Game::next_prompt_id`; `Game::answer` comparing ids | `prompt.rs > an_answer_to_a_stale_prompt_is_rejected_and_counted` |
| BR-S04.T09-09 | `DistributeCounters` and `MoveEnergy` validate their totals exactly: the sum of the answer's per-target counts equals `total`, no target exceeds `max_per`, and every named target is in the prompt's target list. | `validate_answer` arms for those two kinds | `prompt.rs > distribute_counters_total_must_match`; `> distribute_counters_respects_max_per`; `> move_energy_count_must_match` |
| BR-S04.T09-10 | `Game::invalid_actions` is monotonic and reported per pairing, never reset mid-game; it is the number the job protocol surfaces as `invalid_actions` ([S04.T12](T12-cli-job-protocol.md)) and the measurement layer watches. | `Game::invalid_actions: u32`, incremented in the two RN-21 paths only | `prompt.rs > invalid_actions_counts_both_bad_actions_and_bad_answers` |

## Data operations

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `Game::pending_prompt` | `Some(Prompt)` | any rule that delegates a choice: setup, retreat payment, promotion, checkup, an IR `search`/`may`/`choose_one` op | at most one prompt pending; opening a second before the first is answered is a bug caught by a debug assertion |
| `Game::pending_prompt` | `None` | `Game::answer` after validation (or after substitution) | cleared before the suspended procedure resumes, so a resumed step may open the next prompt |
| `Game::next_prompt_id` | `+= 1` | each prompt opened | monotonic, never reused (BR-S04.T09-08) |
| `Game::invalid_actions` | `+= 1` | an invalid answer or an illegal action | monotonic; reported per pairing (BR-S04.T09-10, RN-21) |
| `Game::frames` | resumed | `Game::answer` → the suspended procedure's `resume` | the frame stack is untouched by validation; only the resume advances it ([S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md)) |
| `Game::checkup_cursor` | resumed | `Game::answer` while `phase == BetweenTurns` | [S04.T08](T08-special-conditions-and-checkup.md) owns the cursor; this module only routes the answer |
| zone contents | moved by the resumed procedure | after a valid or substituted answer | the prompt module itself moves no card; it answers questions, the caller acts |
| `Game::events` | `PromptOpened`, `PromptAnswered`, `InvalidAnswer` appended | each of the above, only when logging | the event carries the prompt id, purpose and the answer actually used (substituted or not), so a replay can show the substitution |
| the database | — | never | the engine holds no connection |

## Interfaces

```rust
pub type PromptId = u32;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Prompt {
    pub id: PromptId,
    pub actor: PlayerIdx,          // who answers
    pub owner: PlayerIdx,          // whose cards are at stake
    pub purpose: Purpose,
    pub source: Option<CardIdx>,   // the card that caused the question, when there is one
    pub kind: PromptKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Purpose {
    SearchToHand, SearchToBench, DiscardCost, DiscardEffect, AttachTarget,
    SwitchInOwn, SwitchInOpponent, PromoteAfterKo, ChoosePrize, OrderDeckTop,
    DistributeCounters, DistributeEnergy, ChooseAttackToCopy, MayUse, ChooseOne,
    RevealAck, OpeningActive, BenchSetup, RetreatPayment,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PromptKind {
    ChooseCards { zone: Zone, candidates: SmallVec<[Candidate; 8]>,
                  min: u8, max: u8, may_cancel: bool, reveal: bool },
    ChoosePokemon { side: Side, slots: SmallVec<[SlotIdx; 8]>, min: u8, max: u8 },
    ChooseAttack { options: SmallVec<[AttackRef; 4]> },
    ChooseOption { labels: SmallVec<[OptionId; 4]> },       // OptionId is a u16 code, never prose
    DistributeCounters { targets: SmallVec<[Target; 8]>, total: u8, max_per: u8 },
    MoveEnergy { from: Target, to_candidates: SmallVec<[Target; 8]>, count: u8 },
    OrderCards { cards: SmallVec<[Candidate; 8]> },
    Confirm { count: u8 },                                  // "you may draw `count`" etc.
}

/// Identical copies of one printing are one candidate group.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Candidate {
    pub def: Option<DefIdx>,                 // None for a hidden zone (BR-S04.T09-06)
    pub idxs: SmallVec<[CardIdx; 4]>,        // concrete cards in this group, in zone order
    pub max_pick: u8,                        // == idxs.len()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "answer", rename_all = "snake_case")]
pub enum Answer {
    Cards(SmallVec<[(u8, u8); 4]>),          // (group index, count)
    Pokemon(SmallVec<[SlotIdx; 4]>),
    Attack(u8),
    Option(u8),                              // index into labels
    Counters(SmallVec<[(Target, u8); 8]>),
    Energy(SmallVec<[(Target, u8); 4]>),
    Order(SmallVec<[u8; 8]>),                // permutation of group indices
    Yes, No, Cancel,
}

pub fn validate_answer(p: &Prompt, a: &Answer) -> Result<(), InvalidAnswer>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum InvalidAnswer {
    UnknownPrompt, WrongKind, TooFew, TooMany, NotACandidate,
    DuplicatePick, ExceedsMaxPick, CancelNotAllowed, TotalMismatch, SlotEmpty,
}

pub mod defaults {
    /// Exactly one arm per Purpose; no wildcard arm, so a new purpose fails to compile
    /// until its default exists (BR-S04.T09-04).
    pub fn resolve(game: &Game, p: &Prompt) -> Answer;
}

impl Game {
    pub fn pending_prompt(&self) -> Option<&Prompt>;
    pub fn answer(&mut self, a: Answer) -> Result<(), EngineError>;   // never fails on a bad answer (RN-21)
    pub fn invalid_actions(&self) -> u32;
}
```

**Default resolvers**, one per purpose. Each is stated so a bot author knows what "doing nothing" means:

| Purpose | Default answer |
|---|---|
| `search_to_hand`, `search_to_bench` | the first `min` candidates in zone order (or `min` groups, taking one from each) |
| `discard_cost`, `discard_effect` | the last `min` candidates in zone order — the most recently acquired cards |
| `attach_target`, `switch_in_own`, `promote_after_ko` | the lowest occupied bench slot index |
| `switch_in_opponent` | the opponent's lowest occupied bench slot index |
| `choose_prize` | position 0 |
| `order_deck_top` | the identity permutation |
| `distribute_counters`, `distribute_energy` | all of `total` on the first target, capped by `max_per`, spilling to the next |
| `choose_attack_to_copy` | attack index 0 |
| `may_use`, `choose_one`, `reveal_ack` | `Yes` / option 0 / `Yes` |
| `opening_active` | the first Basic in hand order |
| `bench_setup` | `Cancel` (bench nothing) |
| `retreat_payment` | the assignment returned by `energy::can_pay` ([S04.T06](T06-energy-provision-and-cost-payment.md)) |

**Answer flow.**

```text
Game::answer(a)
  ├─ pending_prompt is None                → EngineError::InvalidAnswer, nothing changes
  ├─ validate_answer(prompt, a) == Ok      → use a
  └─ validate_answer(prompt, a) == Err(r)  → invalid_actions += 1
                                             a' = defaults::resolve(game, prompt)   (RN-21)
                                             use a'
  → pending_prompt = None
  → resume whatever suspended: setup | checkup | the VM frame stack | the action that opened it
```

## Implementation steps

1. Declare `Purpose`, `PromptKind`, `Candidate`, `Answer`, `InvalidAnswer` and `Prompt` with their `serde` attributes; export the JSON Schema through `@pokesearch/shared` so [S04.T13](T13-scenario-format-and-runner.md) and [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md) share it. `cargo test` green.
2. Implement `validate_answer` for `ChooseCards` with all its reasons and the grouping rule; spec `> identical_copies_are_one_group` and the three pick tests (BR-S04.T09-05).
3. Implement the remaining kinds' validation arms, including the two total checks; spec `> every_reason_is_reachable` with one test per variant (BR-S04.T09-03, -09).
4. Add the prompt-opening helpers (`open_choose_cards`, `open_choose_pokemon`, …) enforcing the hidden-zone rule and the mandatory-prompt precondition; spec BR-S04.T09-06 and -07.
5. Implement `defaults::resolve` with an exhaustive `match` and the table above; spec the exhaustiveness (compile-time) and `> default_answers_always_validate` as a property test over generated prompts (BR-S04.T09-04).
6. Implement `Game::answer` with the RN-21 substitution path, `invalid_actions` and the id check; spec `> an_invalid_answer_is_counted_and_replaced`, `> the_replacement_is_the_default_not_the_first_candidate` and `> an_answer_to_a_stale_prompt_is_rejected_and_counted` (RN-21, BR-S04.T09-08, -10).
7. Wire the four engine-level prompts that already exist — `opening_active`, `bench_setup` ([S04.T04](T04-setup-and-turn-structure.md)), `retreat_payment` ([S04.T06](T06-energy-provision-and-cost-payment.md)), `promote_after_ko` ([S04.T07](T07-damage-pipeline.md), [S04.T08](T08-special-conditions-and-checkup.md)) — through the helpers, and check each against its default resolver.
8. Add the property test that generates random prompts of every kind, answers them with a random *valid* answer and asserts `Ok`, then with a random *invalid* answer and asserts a reason plus a substitution (RN-21).
9. Add `> a_bot_that_always_answers_garbage_still_finishes_a_game`: 200 games where every prompt receives `Answer::Cancel` regardless of `may_cancel`, asserting that all 200 reach an `Outcome` and that `invalid_actions` is greater than zero.
10. Add the `actor`-routing test and document in `engine/README.md` that a bot receives only prompts whose `actor` is itself, which is the precondition [S06.T01](../06-bots/T01-honest-information-view.md) builds the player view on.

## Edge cases and error handling

- **A prompt answered with an index outside the candidates** → `NotACandidate`, `invalid_actions += 1`, and the default resolver's answer is used. The game continues, and the measurement sees a non-zero `invalid_actions` for that pairing — which is how a broken bot is detected rather than hidden.
- **A prompt answered twice** (a driver bug, or a stale answer from a parallel worker) → the second answer carries an id that no longer matches `pending_prompt`; `UnknownPrompt`, counted, and ignored. The state is not advanced twice.
- **A mandatory `ChooseCards` whose zone turns out to be empty** → the prompt is not opened at all; the caller checks the candidate set first and resolves the effect as "nothing to choose". Opening a prompt with no valid answer would force the default resolver to invent one.
- **`min > max` or `max > total candidates`** → a construction-time debug assertion; the builders clamp `max` to the number of pickable cards in release, because a prompt that cannot be satisfied is worse than a narrower one.
- **Two identical benched Pokémon, one damaged** → `ChoosePokemon` lists both slots separately; they are not grouped. Grouping applies to `ChooseCards` only, where copies in a hand or deck are genuinely interchangeable.
- **A `choose_prize` prompt** → candidates carry positions and no `def`; a bot that tries to read the prize identities sees nothing, which is the engine-side half of RN-30 ([S06.T01](../06-bots/T01-honest-information-view.md) is the bot-side half).
- **`switch_in_opponent` when the opponent's bench is empty** → the prompt is not opened and the effect does nothing; the rules never force a switch that cannot happen.
- **A `DistributeCounters` answer whose totals sum to less than `total`** → `TotalMismatch` even when the shortfall is legal-looking; "place 4 damage counters" means all four, and the default resolver places them on the first target up to `max_per`, spilling onward.
- **`Answer::Cancel` on a prompt without `may_cancel`** → `CancelNotAllowed`, counted, replaced by the default. This is the most common bot mistake and the reason the property test in step 9 uses exactly it.
- **A prompt opened while another is pending** → a debug assertion fires; in release the second call returns an error to its caller rather than overwriting the first, because losing a pending prompt would strand a suspended frame stack.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core prompt` green, including `> every_reason_is_reachable` with one case per `InvalidAnswer` variant (BR-S04.T09-03).
- [ ] `> default_answers_always_validate`: 10,000 generated prompts across all eight kinds, each resolved by `defaults::resolve` and validated, zero failures (BR-S04.T09-04).
- [ ] `> an_invalid_answer_is_counted_and_replaced` and `> the_replacement_is_the_default_not_the_first_candidate` — the substituted answer equals `defaults::resolve`'s output, and `invalid_actions` is 1 (RN-21).
- [ ] `> a_bot_that_always_answers_garbage_still_finishes_a_game`: 200 games answered exclusively with `Answer::Cancel` all reach an `Outcome`, with `invalid_actions > 0` on every one (RN-21).
- [ ] `> identical_copies_are_one_group`, `> picking_two_of_a_group_of_three_is_valid`, `> picking_four_of_a_group_of_three_is_exceeds_max_pick` (BR-S04.T09-05).
- [ ] `> prize_candidates_carry_no_def` and `> a_non_revealing_search_hides_identities` (BR-S04.T09-06).
- [ ] `> validate_answer_is_linear`: a prompt with 10 candidates and `max: 3` is one object, and validation performs at most 13 candidate comparisons — asserted with an instrumented counter (BR-S04.T09-01).
- [ ] `> actor_and_owner_can_differ` for a `switch_in_opponent` prompt, and `> the_driver_routes_by_actor` (BR-S04.T09-02).
- [ ] `> an_answer_to_a_stale_prompt_is_rejected_and_counted` (BR-S04.T09-08) and `> invalid_actions_counts_both_bad_actions_and_bad_answers` (BR-S04.T09-10).
- [ ] The exported JSON Schema for `Prompt` and `Answer` round-trips through `@pokesearch/shared` with no diff, so scenarios ([S04.T13](T13-scenario-format-and-runner.md)) and the IR ([S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md)) reference the same names.

## Risks and open questions

- **Risk — the nineteen purposes prove insufficient when S05 codes real cards.** A missing purpose forces a bad fit, and bots dispatch on purpose. Mitigation: the enum is versioned with `CONTRACT_VERSION`; adding a purpose is a schema change plus a default resolver, and `defaults::resolve` has no wildcard arm, so the compiler refuses to forget one. [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md) is the first real test of the set.
- **Risk — candidate grouping hides a distinction that matters.** Two copies of a card in hand are interchangeable; two copies with different attached tools are not, but tools attach to Pokémon, not to hand cards, so the case does not arise today. Mitigation: `ChoosePokemon` never groups, and the rule is stated in BR-S04.T09-05 so a future exception is a documented change.
- **Risk — the default resolver becomes a hidden policy.** Every substituted answer is a decision the engine made for a bot, and a bot with many invalid answers is silently played by the defaults. Mitigation: `invalid_actions` is reported per pairing in the job protocol ([S04.T12](T12-cli-job-protocol.md)) and stored per pairing ([S04.T14](T14-jobs-schema-migration.md)); a non-zero value on a measurement run is a defect to investigate, and [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) surfaces it next to the score.
- **Question — should `ChooseOption` labels be codes or prose?** Codes (`OptionId: u16`) keep the engine free of English and force the UI to translate, which D-006 wants anyway; prose would be easier to debug. Recommendation: codes, with a `docs/rules/OPTIONS.md` table mapping code to meaning, maintained by [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md).
- **Question — should a prompt carry a deadline or a cost hint for lookahead bots?** [S06.T05](../06-bots/T05-rollout-bot.md) may want to know how expensive a subtree is. Recommendation: leave the prompt minimal; a bot can compute it from the kind. Revisit at S06 if rollouts are dominated by prompt branching.

## References

- `pokemon/src/pokesearch/sim/policies.py` — verified: `MAX_CHOICE_SCAN = 400`, and `heuristic_policy::choose` ranking `ChooseCardAction`s by searching a prose `tips` string for `"discard"`/`"hand"`, `"knocked out"`, `"retreat"`/`"switch"`, `"opponent"`, `"prize"`, `"deck"`/`"search"`/`"put"` and `"damage counter"`, falling back to `actions[0]`. Consult as the precise failure this contract removes.
- `pokemon/src/pokesearch/sim/engine_adapter.py` — verified: `run_game` counts an action not in the legal list as `invalid += 1` and substitutes `actions[0]`; `GameResult.invalid_actions` carries the count. This is RN-21's legacy form and the reason the revision names the default resolver instead.
- `pokemon/src/pokesearch/sim/testkit/__init__.py` — verified: `drive_choices(generator, selectors)` answers each prompt by finding the `ChooseCardAction` whose `chosen` list equals the selector's output, raising with the available choices when none matches. Consult for how scenarios will express answers ([S04.T13](T13-scenario-format-and-runner.md)).
- [S04.T03](T03-game-state-model.md) — `pending_prompt`, `frames` and the rule that a cloned state carries a pending prompt.
- [S06.T01](../06-bots/T01-honest-information-view.md) — the consumer of `actor`/`owner` and of the hidden-zone rule (RN-30).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
