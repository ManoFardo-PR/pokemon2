# S06.T04 — Need scoring and prompt resolvers

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 4 / 8 |
| Depends on | [S04.T09](../04-game-engine-core/T09-prompt-protocol.md), [S06.T03](T03-planner-turn-policy.md) |
| Unblocks | [S06.T05](T05-rollout-bot.md), [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` prompt purposes — from [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)
- `module` planner (profile, view) — from [S06.T03](T03-planner-turn-policy.md)
- `doc` ESPECIFICACAO.md RN-36

## Outputs (proposed)
- `module` `ptcg-core::bots::planner::need` — `need(def, view, profile) → Need` (`Need` is an `i32` in hundredths, because `ptcg-core` carries no floating point — [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-09; the scale below is the legacy's unchanged): goal fodder 0.5 in hand / 6.0 in deck; main-line Basic 9.0 until 3 in play; evolution with base in play 10 + stage; energy when a main-line Pokémon has none 8.0; supporter when holding none 7.0; Rare Candy 7.5; recovery when a piece is discarded 6.5; search/draw 4.5; +3 last copy, +3 scarce energy when discarding — and `answer_prompt(prompt, view)` scoring by purpose (opening active: free retreat, avoid multi-prize; promotion: +300 can attack now, −400 gives the game; opponent target: prize value × 100, +200 lethal; losing a card: −need); records `margin = best − second` per decision for the coach — consumed by [S06.T05](T05-rollout-bot.md), [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md)

## Initial objective
Every prompt the engine asks gets a reasoned answer from the same value function that drives discards and searches, so the bot's choices in effects are as deliberate as its main actions.

## Context

A game is not only actions. Between two `Action`s the engine asks questions — which card the search finds, which Pokémon the gust drags out, which card leaves the hand to pay a cost — and in a real list those questions outnumber the actions. The legacy measured what happens when they are answered badly: `planner v6`, whose only change was *"descarte usa a memória — a carta não conta a si mesma, última cópia e energia escassa valem mais, recuperação vale quando a linha está no descarte"*, moved suite v2 from 76.0 % to 77.2 % and, more tellingly, moved the **mirror** from 50.2 % to 53.8 %. The mirror is the reading that cannot be explained by deck quality, so that is a bot improvement in its purest measured form.

The idea is one function. `need(card)` answers "what is this card worth to the plan right now?", and every prompt is then a sign and a sort: a search takes the highest `need`, a discard gives up the lowest, an order puts the highest on top. That single function is what makes the bot's behaviour inside an effect as deliberate as its behaviour in the turn cascade, and it is why this subtask and [S06.T03](T03-planner-turn-policy.md) are two halves of one bot rather than two bots.

Three properties of `need` carry the measured gain, and all three are named in RN-36.

**The card does not count itself.** When the bot is deciding whether to discard the Alakazam in its hand, "do I already have one?" must not be answered by the Alakazam being asked about. The legacy's `_need` decrements `hand[n]` by one when `holding` is true, and the regression test that pins it — `test_discard_choice_keeps_the_piece_the_line_needs_and_the_last_copy` — has a comment saying exactly what went wrong before: *"A carta avaliada contava a si mesma como 'já tenho uma', e a evolução de que o plano precisava saía barata."*

**The last copy is worth more.** If a card scores at least 5.0 and the memory says there is no other copy left in the deck, it gets +3.0. The memory is [S06.T01](T01-honest-information-view.md)'s honest count — `own.deck` after the first own-deck search, `own.unseen` before it — so the bot is not cheating, it is counting, which is what a real player does.

**Scarce energy is worth more.** If two or fewer energy cards remain in the deck, every energy in hand gets +3.0. Energy is the resource that cannot be searched back in most lists, and discarding the last of it is a slow loss that no single decision looks responsible for.

On top of `need`, the prompt layer adds a second idea the legacy discovered the hard way: **answer by structure, never by wording**. `heuristic_policy::choose` decided what a prompt meant by looking for substrings in an English `tips` string — `"discard"` and `"hand"`, `"knocked out"`, `"opponent"` with `"switch"`, `"prize"`, `"damage counter"`. `smart_policy` tried to fix it by switching to the **zone** the candidates were in, with the comment *"O enunciado varia de carta para carta e casar por palavra é frágil; a zona é um fato do estado"* — and `smart` measured 48.3 % (CI 46.1–50.5) over 2,000 mirrored games against `heuristic`, i.e. not better. The right fix was neither: it was to make the engine say what it is asking. [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) gives every prompt a `Purpose` from a closed enum of nineteen, plus `actor`, `owner`, `zone` and grouped candidates. This subtask dispatches on that, and `tips` does not exist.

Two consequences follow. `MAX_CHOICE_SCAN = 400` has **no counterpart**. The legacy scanned a prefix of a combinatorial action list, so with a large hand it literally could not see most of its options and which ones it saw depended on an enumeration order. Here a `ChooseCards` prompt is one object with `n` candidate groups; the resolver scores each group once and assembles the answer greedily, which is optimal for an additive score and costs O(n log n). And the legacy's prose test for "am I losing this card?" becomes a **direction** derived from `(purpose, zone)`: `Gain` when the card comes toward the player, `Loss` when it leaves, `Target` when the choice is a board position, `Blind` when the candidates carry no identity (RN-30, [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-06).

The last output is for a human. Every decision records `margin = best − second`, the gap between the chosen option and the runner-up. A small margin is where the game was close to going differently, and [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md) selects at most six such moments per lost game to show a reviewer. The legacy kept it in `memo["margin"]` with the note *"o técnico revisa primeiro as decisões de margem pequena"*; here it is a field the driver copies into the event log when `store_logs` is on.

## Scope

- **In scope.** `ptcg-core::bots::planner::need` with `need`, `base_need`, the memory bonuses and the `Need` type; `ptcg-core::bots::planner::resolve` with `answer_prompt`'s exhaustive `match` over `Purpose` and one resolver per purpose; the `Direction` derivation from `(purpose, zone)`; the candidate-group scoring and the greedy answer assembly; the goal-feeding resolver; the RN-33 brake applied to `Confirm` and `MayUse` draws; `margin` and the `Explains` extension trait the driver reads it through; the structural predicates that replace the legacy's name and prose tests (`is_rare_candy_like`, `recovers_from_discard`, `searches_or_draws`); the property test that every generated prompt gets a valid answer.
- **Out of scope.** The turn cascade and `attack_value` ([S06.T03](T03-planner-turn-policy.md)) — this subtask calls `attack_value` and `energy_gain`, it does not define them; the `Prompt`, `Answer` and `validate_answer` contract and the default resolvers ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md)); the deck profile and `is_fodder`/`goal_pending` ([S06.T02](T02-deck-profile-analysis.md)); the honest view ([S06.T01](T01-honest-information-view.md)); how a playout answers prompts inside a rollout ([S06.T05](T05-rollout-bot.md) reuses these resolvers unchanged); the coach's moment selection, its LLM call and its verdict vocabulary ([S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md)) — this subtask only produces the number it sorts by; the event log's encoding ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-36 | **Kept.** A discard decision uses memory: the card being evaluated does not count itself as "I already have one"; a card worth at least `Need(500)` whose remaining count in the deck is zero gains `Need(300)`; an energy card gains `Need(300)` when two or fewer energy cards remain in the deck; and a card that recovers a main-line piece from the discard is worth `Need(650)` while such a piece is there. | `need(view, profile, card, Holding::Yes)` — the `holding` flag decrements the hand count and enables the three bonuses; the remaining count comes from `view.own.deck` or `view.own.unseen` ([S06.T01](T01-honest-information-view.md)) | `need.rs > the_card_does_not_count_itself` (the legacy Alakazam regression: the evolution the line needs is not the discard); `> the_last_copy_of_a_needed_card_gains_three`; `> a_copy_with_one_left_in_the_deck_does_not`; `> energy_gains_three_when_two_remain`; `> recovery_is_worth_six_five_while_a_line_piece_is_in_the_discard` |
| BR-S06.T04-01 | `Need` is an `i32` in hundredths and every constant on the scale is a named `const`: `GOAL_FODDER_HAND = 50`, `GOAL_FODDER_DECK = 600`, `MAIN_BASIC = 900`, `MAIN_EVOLUTION = 1000`, `SUPPORT_BASIC = 600`, `SUPPORT_EVOLUTION = 650`, `ENERGY_NEEDED = 800`, `SUPPORTER_NONE_HELD = 700`, `RARE_CANDY = 750`, `RECOVERY = 650`, `SEARCH_OR_DRAW = 450`, `TRAINER_DEFAULT = 300`, `SPARE = 150`, `BASE = 200`, `LAST_COPY = 300`, `SCARCE_ENERGY = 300`. No floating point appears anywhere in the module. | the `const` block in `need.rs`; clippy `disallowed-types` for `f32`/`f64` ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-09) | `policy.rs > core_has_no_floating_point` still green; `need.rs > the_scale_matches_the_documented_table` (one assertion per constant against a hand-built state) |
| BR-S06.T04-02 | `need` branches on **structure**, never on a card name or on prose: "Rare Candy" is any Trainer whose program contains an evolve op that skips a stage, "recovery" is any program with an op moving a card from the owner's discard, "search or draw" is any program containing a `search` or `draw` op. `need` never reads `CardDef::name`, `card_id` or rules text. | `need::is_rare_candy_like`, `::recovers_from_discard`, `::searches_or_draws`, all over the `ProgramTable` ([S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md)); a policy scan of the module | `policy.rs > need_does_not_read_card_names`; `need.rs > renaming_every_def_leaves_every_need_unchanged` (the Dhelmise fixture with randomized names) |
| BR-S06.T04-03 | `answer_prompt` covers every `Purpose` with an exhaustive `match` and no wildcard arm, so a new purpose fails to compile until it has a resolver; where the planner has no opinion it delegates to `prompt::defaults::resolve`, never to an arbitrary index. | `resolve::answer(view, profile, prompt)`'s `match` over the nineteen purposes | `resolve.rs > every_purpose_is_answered` (compile-enforced exhaustiveness); `> delegation_uses_the_default_resolver` ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-04) |
| BR-S06.T04-04 | Every answer the planner returns validates: `validate_answer(prompt, answer)` is `Ok` for every prompt of every kind, so a planner never triggers RN-21's substitution path and `invalid_actions` stays at zero on a measurement run. | the resolvers build answers from the prompt's own candidate groups and slot lists, respecting `min`, `max`, `max_pick` and `may_cancel` | `resolve.rs > every_generated_prompt_gets_a_valid_answer` (property test over 10,000 generated prompts across all eight kinds); a 1,200-game suite run reports `invalid_actions == 0` for the planner side |
| BR-S06.T04-05 | The meaning of a prompt comes from `(purpose, zone, actor, owner)` and from nothing else. `Direction` is derived once per prompt: `Gain` (`search_to_hand`, `search_to_bench`, `order_deck_top`, `attach_target`), `Loss` (`discard_cost`, `discard_effect`, and any `ChooseCards` over the actor's own hand whose resolution removes the card), `Target` (`switch_in_own`, `switch_in_opponent`, `promote_after_ko`, `distribute_counters`, `distribute_energy`, `choose_attack_to_copy`), `Blind` (`choose_prize`, and any prompt whose candidates carry no `def`). No resolver inspects card text. | `resolve::direction(prompt) -> Direction`, a total function over `Purpose` × `Zone` | `resolve.rs > direction_covers_every_purpose`; `> a_prize_prompt_is_blind`; `> a_hand_discard_is_a_loss`; `> a_deck_search_is_a_gain` |
| BR-S06.T04-06 | Candidates are scored per **group**, never per subset: a `ChooseCards` prompt with `n` groups costs `n` `need` evaluations and one sort; the answer is assembled greedily — for `Gain`, take `max` of the highest-scoring groups (respecting `max_pick`); for `Loss`, take exactly `min` of the lowest-scoring. There is no counterpart to the legacy's `MAX_CHOICE_SCAN = 400`. | `resolve::pick_cards(prompt, score)`; `Answer::Cards(SmallVec<(u8, u8)>)` ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-05) | `resolve.rs > a_prompt_with_twenty_groups_evaluates_need_twenty_times` (call counter); `> a_gain_takes_max_and_a_loss_takes_min`; `> max_pick_is_respected_when_a_group_has_three_copies` |
| BR-S06.T04-07 | Every decision records `margin = best_score − second_score` in hundredths, or `None` when fewer than two distinct options existed; it is overwritten on each decision, is never read by the bot itself, and is copied into the event log by the driver only when `store_logs` is on. | `PlannerBot::last_margin() -> Option<i32>` from the `Explains` trait; the CLI driver appending a `BotDecision` event ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)) | `resolve.rs > margin_is_the_gap_to_the_runner_up`; `> margin_is_none_with_a_single_candidate`; `> margin_does_not_affect_the_chosen_answer` (a run with logging off makes the same choices, asserted by fingerprint equality) |
| BR-S06.T04-08 | When the profile has a goal and the goal is pending, a `discard_effect` prompt over the owner's **deck** feeds the goal: candidates that are `is_fodder` are preferred, and the number taken is capped at `missing + 1` so the bot does not strip its own deck of pieces it still needs. A main-line card is never fodder, however well it matches the filter ([S06.T02](T02-deck-profile-analysis.md) BR-S06.T02-08). | `resolve::feed_goal(view, profile, prompt)`, reached only when `purpose == DiscardEffect && zone == Deck && profile.goal_pending(view)` | `resolve.rs > a_deck_to_discard_prompt_feeds_the_goal`; `> it_never_takes_more_than_missing_plus_one`; `> a_main_line_card_is_not_fed_to_the_goal`; `> with_no_goal_the_prompt_falls_back_to_lowest_need` |
| BR-S06.T04-09 | A `Confirm` or `may_use` prompt that offers an optional draw is answered by RN-33's brake, not by a preference: `Yes` only when `deck_len - count >= SAFE_DECK` and `hand.len() < FULL_HAND`. The same `may_draw` function serves the turn cascade and this resolver, so the two can never disagree. | `resolve` calling `planner::may_draw` ([S06.T03](T03-planner-turn-policy.md)) for `Purpose::Confirm`-shaped prompts | `resolve.rs > a_you_may_draw_three_with_nine_left_is_declined`; `> a_you_may_draw_one_with_nine_left_is_accepted`; `> a_non_draw_confirm_is_accepted` |
| BR-S06.T04-10 | A `Blind` prompt is answered without scoring: `choose_prize` takes position 0 and any candidate group carrying no `def` is treated as equivalent, so no ordering can leak information the view does not have (RN-30). | `resolve::blind`; the resolver never inspects `Candidate::idxs` for a `def`-less group | `resolve.rs > a_prize_choice_is_position_zero`; `view.rs > no_opponent_hidden_identity_is_reachable` still green ([S06.T01](T01-honest-information-view.md)) |
| BR-S06.T04-11 | `need` is pure, total and memoised per decision: it mutates nothing, returns a value for every `DefIdx` including one the profile has never seen, and is evaluated at most once per `(def, holding)` pair inside a single `answer_prompt` or `choose_action` call. | `need(&PlayerView, &Profile, DefIdx, Holding) -> Need`; a `SmallVec` memo cleared at the start of each decision | `need.rs > need_is_total` (property test over 10,000 random defs); `> need_is_pure`; `> need_is_evaluated_once_per_def_per_decision` (call counter) |
| BR-S06.T04-12 | Ties break toward the lower candidate index, deterministically; the planner's RNG is drawn from only when a resolver declares an explicit random tie-break, which none currently does. | `pick_cards`'s stable sort by `(-score, index)`; the stream counter | `resolve.rs > ties_break_toward_the_lower_index`; `> a_prompt_decision_draws_nothing_from_the_stream` |

## Data operations

The engine never opens the database and a resolver mutates nothing. The table below is the **decision table** for the nineteen purposes of [S04.T09](../04-game-engine-core/T09-prompt-protocol.md); scores are in hundredths, so the legacy's `+300` is `30_000` and its `hp × 0.1` is `hp`.

| Phase | Condition | Action | Rule |
|---|---|---|---|
| `opening_active` | `Direction::Gain` over the hand, Basics only | maximise `-300 × retreat_cost - 400 × (prize_value - 1) + hp_max - 250 × (def ∈ profile.support)` | RN-35 — a free retreat beats a big hitter; a multi-prize opener is a gift |
| `bench_setup` | setup, every Basic in hand up to `bench_limit` | bench all except a `prize_value ≥ 2` Basic that cannot attack and is not on the main line | RN-35, BR-S06.T04-05 |
| `promote_after_ko`, `switch_in_own` | `Direction::Target`, own bench | maximise `30_000 × can_attack_now + 10 × hp_max + 4_000 × energies - 12_000 × (support ∧ ¬can_attack) - 15_000 × (prize_value - 1) × ¬can_attack - 40_000 × (prize_value ≥ opp.prizes_left)` | RN-35 — never promote a multi-prize Pokémon that cannot attack; never hand over the game |
| `switch_in_opponent` | `Direction::Target`, opponent bench | maximise `1_000 × prize_value + 20_000 × (remaining_hp ≤ attack_value(Sure)) - 3 × remaining_hp` | RN-34 — prize value first, lethality second, frailty as the tie-break |
| `search_to_hand`, `search_to_bench` | `Direction::Gain` | take `max` groups by descending `need` (respecting `max_pick`) | RN-36 |
| `discard_cost`, `discard_effect` (own hand) | `Direction::Loss` | take exactly `min` groups by ascending `need` | RN-36 |
| `discard_effect` (own deck, goal pending) | `Direction::Loss`, `zone == Deck`, `profile.goal` is `Some` | prefer `is_fodder` groups, capped at `missing + 1`, then ascending `need` | RN-31, BR-S06.T04-08 |
| `attach_target` | `Direction::Target`, own slots | maximise `energy_gain` ([S06.T03](T03-planner-turn-policy.md) BR-S06.T03-04) | RN-32 |
| `distribute_counters` | `Direction::Target` | concentrate on the opponent slot with the lowest `remaining_hp`, capped by `max_per`, spilling to the next lowest | RN-34 |
| `distribute_energy` | `Direction::Target`, own slots | the same `energy_gain` ordering, one unit at a time | RN-32 |
| `order_deck_top` | `Direction::Gain` | the permutation putting the highest `need` on top | RN-36 |
| `choose_attack_to_copy` | `Direction::Target` | the attack with the highest `attack_value(Estimate)` against the opponent's Active | RN-32 |
| `retreat_payment` | `Direction::Loss`, attached energies | give up the units the main-line attacker needs least; never break a payable cost on another main-line slot when an alternative exists | RN-35 |
| `may_use`, `Confirm` with a draw | the prompt's program draws `n` | `Yes` iff `deck_len - n >= 7` and `hand.len() < 12` | RN-33, BR-S06.T04-09 |
| `may_use`, `Confirm` without a draw | — | `Yes` | RN-32 |
| `choose_one` | `ChooseOption` with `OptionId` codes | `prompt::defaults::resolve` — the codes carry no meaning the planner can read | BR-S06.T04-03 |
| `reveal_ack` | — | `Yes` | BR-S06.T04-03 |
| `choose_prize` | `Direction::Blind` | position 0 | RN-30, BR-S06.T04-10 |
| any purpose with no opinion | — | `prompt::defaults::resolve` | BR-S06.T04-03 |

**The `need` derivation** — the legacy's two-level function, in hundredths, with every prose test replaced by a program test.

| Case | Condition | Value |
|---|---|---|
| goal fodder, in hand | `profile.goal_pending(view) ∧ profile.is_fodder(def)` ∧ holding | `50` — first to leave the hand |
| goal fodder, in the deck | the same, not holding | `600` — first to be dug out |
| Pokémon outside every line | no line contains `def` | `200`, `+100` when `def ∈ profile.attackers` |
| loose multi-prize support Basic | line length 1, not the main line, `prize_value ≥ 2` | `600` when `hand.len() ≤ 6` and none is in play, else `150` |
| line Basic | line index 0 | `900` main / `600` support while `in_play(line) + hand[def] < target` (3 main, 1 support), else `150` |
| evolution with its base in play | `board.count(line[i-1]) > hand[def]`, counting the Basic too when `i == 2` and a Rare-Candy-like card is held | `1000 + 100 × i` main / `650 + 100 × i` support |
| evolution without a base | otherwise | `300` when none is in play, else `150` |
| energy a main-line Pokémon lacks | some main-line slot has no energy and the hand holds fewer energies than such slots | `800`, else `200` |
| supporter, none held | no other supporter in hand (the card does not count itself) | `700`, else `300` |
| Rare-Candy-like | program evolves skipping a stage, `main_line.len() == 3`, the Basic is in play | `750`, else `300` |
| recovery | program moves a card from the owner's discard and a main-line piece is there | `650` |
| search or draw | program contains a `search` or `draw` op | `450` |
| any other Trainer | — | `300` |
| anything else | — | `200` |
| **+ last copy** | holding, base `≥ 500`, remaining count in the deck is 0 | `+300` (RN-36) |
| **+ scarce energy** | holding, `def` is an energy card, `≤ 2` energy cards remain in the deck | `+300` (RN-36) |

**Read and write set.**

| Fact | Source | Used by |
|---|---|---|
| purpose, zone, actor, owner, candidate groups, `min`/`max`/`max_pick`/`may_cancel` | the `Prompt` ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md)) | every resolver |
| own hand, board, discard, `deck`/`unseen`, `prizes_left` | `view.own` ([S06.T01](T01-honest-information-view.md)) | `need`, the memory bonuses |
| opponent board, `prizes_left` | `view.opp` | promotion, gust target, counters |
| `main_line`, `support_lines`, `attackers`, `goal`, `is_fodder`, `goal_pending` | `Arc<Profile>` ([S06.T02](T02-deck-profile-analysis.md)) | `need`, `feed_goal` |
| `draw`/`search`/`evolve`/`from_discard` ops | the `ProgramTable` ([S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md)) | the three structural predicates, `may_draw` |
| `attack_value`, `energy_gain`, `may_draw` | [S06.T03](T03-planner-turn-policy.md) | gust target, attach, confirm |
| `PlannerBot::last_margin` | written by each decision | the driver's event log → [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md) |
| the `Game`, `Game::rng`, the database | — | never (RN-30, Architecture principle 1) |

## Interfaces

```rust
// ptcg-core::bots::planner::need

/// A value on the need scale, in hundredths (S06.T03). Need(900) is the legacy's 9.0.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct Need(pub i32);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Holding { Yes, No }        // Yes = the card is in the actor's hand right now (RN-36)

/// Total and pure. Memoised per decision (BR-S06.T04-11).
pub fn need(view: &PlayerView, profile: &Profile, programs: &ProgramTable,
            def: DefIdx, holding: Holding) -> Need;

// Structural replacements for the legacy's name and prose tests (BR-S06.T04-02).
pub fn is_rare_candy_like(programs: &ProgramTable, def: DefIdx) -> bool;
pub fn recovers_from_discard(programs: &ProgramTable, def: DefIdx) -> bool;
pub fn searches_or_draws(programs: &ProgramTable, def: DefIdx) -> bool;

pub const GOAL_FODDER_HAND:  i32 = 50;    pub const GOAL_FODDER_DECK:  i32 = 600;
pub const MAIN_BASIC:        i32 = 900;   pub const MAIN_EVOLUTION:    i32 = 1000;
pub const SUPPORT_BASIC:     i32 = 600;   pub const SUPPORT_EVOLUTION: i32 = 650;
pub const ENERGY_NEEDED:     i32 = 800;   pub const SUPPORTER_NONE_HELD: i32 = 700;
pub const RARE_CANDY:        i32 = 750;   pub const RECOVERY:          i32 = 650;
pub const SEARCH_OR_DRAW:    i32 = 450;   pub const TRAINER_DEFAULT:   i32 = 300;
pub const BASE:              i32 = 200;   pub const SPARE:             i32 = 150;
pub const LAST_COPY:         i32 = 300;   pub const SCARCE_ENERGY:     i32 = 300;
pub const MAIN_BASIC_TARGET: u8  = 3;     pub const SUPPORT_BASIC_TARGET: u8 = 1;
pub const SCARCE_ENERGY_AT:  u8  = 2;     pub const SHORT_HAND:        u8 = 6;
```

```rust
// ptcg-core::bots::planner::resolve

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction { Gain, Loss, Target, Blind }
pub fn direction(prompt: &Prompt) -> Direction;          // total over Purpose × Zone

/// The planner's answer. Always validates (BR-S06.T04-04).
pub fn answer(view: &PlayerView, profile: &Profile, programs: &ProgramTable,
              prompt: &Prompt, out: &mut Decision) -> Answer;

/// Scratch written by every decision; never read by the bot itself (BR-S06.T04-07).
#[derive(Debug, Clone, Copy, Default)]
pub struct Decision { pub best: i32, pub second: Option<i32>, pub margin: Option<i32> }

/// The driver reads this after each decision and logs it when `store_logs` is on.
pub trait Explains {
    fn last_margin(&self) -> Option<i32>;                // hundredths of a need unit
    fn last_decision(&self) -> Decision;
}
impl Explains for PlannerBot { /* … */ }
```

**Candidate scoring and assembly** (BR-S06.T04-06) — the whole of the `ChooseCards` path:

```text
groups = prompt.kind.candidates                      // one entry per distinct definition
score[g] = match direction(prompt) {
    Gain  =>  need(g.def, Holding::No)               // higher is better
    Loss  => -need(g.def, Holding::Yes)              // higher is better = cheaper to lose
    Blind =>  0
    Target => unreachable (ChoosePokemon, not ChooseCards)
}
sort groups by (-score, group index)                 // stable; ties take the lower index
want = match direction { Gain => prompt.max, Loss => prompt.min, Blind => prompt.min }
take groups in order, at most `g.max_pick` from each, until `want` cards are named
answer = Answer::Cards([(group_index, count), …])
decision.best   = Σ score of the taken cards
decision.second = the same sum with the last taken group swapped for the next-best untaken one
decision.margin = best - second
```

**The promotion resolver**, in full (RN-35) — the legacy's arithmetic ×100:

```text
for each candidate bench slot s:
    ready  = any attack of s is payable now
    score  = 30_000 * ready
           + 10 * hp_max(s)
           + 4_000 * s.energies.len()
           - 12_000 * (def(s) ∈ profile.support && !ready)
           - 15_000 * (prize_value(def(s)) - 1) * !ready
           - 40_000 * (prize_value(def(s)) >= view.opp.prizes_left)      // do not hand over the game
pick the maximum; ties take the lower slot index
```

**The opponent-target resolver** (RN-34) — used by `switch_in_opponent` and by any `ChoosePokemon` over the opponent's side:

```text
lethal = max attack_value(view, own active, a, target, Certainty::Sure, Placement::AsActive)
score  = 1_000 * prize_value(target) + 20_000 * (remaining_hp(target) <= lethal) - 3 * remaining_hp(target)
```

except for `distribute_counters` and any prompt whose purpose moves counters, where the score is `-remaining_hp(target)`: counters go where they finish something.

**Where `margin` goes.** The CLI driver owns both the bot and the `Game`; after each `choose_action` or `answer_prompt` it reads `Explains::last_margin` and, when `options.store_logs` is set ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)), appends one event:

```json
{ "t": "bot_decision", "turn": 14, "actor": 0, "kind": "prompt",
  "prompt_id": 37, "purpose": "discard_effect", "margin": 125, "chosen": [[2, 1]] }
```

`margin` is `null` when there was no runner-up. [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md) reads these events out of `games.log_blob` and sorts ascending to pick at most six critical moments per game.

## Implementation steps

1. Declare `Need`, `Holding`, the constant block and a `need` that returns `BASE` for everything; wire it into [S06.T03](T03-planner-turn-policy.md)'s four call sites, replacing the stub. `cargo test -p ptcg-core need` green and the planner's phase tests still pass (BR-S06.T04-01).
2. Implement the Pokémon branch — the line lookup, the Basic target counts, the evolution rule with its Rare-Candy-like exception, and the loose multi-prize support Basic — and spec each case against a hand-built board (RN-36).
3. Implement `is_rare_candy_like`, `recovers_from_discard` and `searches_or_draws` over the `ProgramTable`; spec each against a stub program and against an empty one (BR-S06.T04-02).
4. Implement the energy and Trainer branches; spec the "a main-line Pokémon has no energy" case and the "no supporter held" case, both with the self-exclusion (RN-36).
5. Implement the three memory bonuses on top of `base_need`, reading `view.own.deck` when `deck_searched` is set and `view.own.unseen` before it; spec the Alakazam regression, the last-copy bonus and the scarce-energy bonus (RN-36).
6. Add the per-decision memo and the totality property test; add the policy test forbidding name and text reads, and the "rename everything" test on the Dhelmise fixture (BR-S06.T04-02, -11).
7. Implement `direction(prompt)` as a total function over `Purpose` × `Zone` and spec all four directions, including a `def`-less candidate group being `Blind` (BR-S06.T04-05, -10).
8. Implement `pick_cards` with the group scoring, the stable sort and the greedy assembly; spec the group-count call counter, the gain/loss quantities and `max_pick` (BR-S06.T04-06, -12).
9. Implement the board resolvers — opening active, bench setup, promotion, opponent target, counters, attach, retreat payment — each against its formula above; spec the two acceptance cases (the lethal two-prize gust target, and a promotion that refuses to hand over the game) (RN-34, RN-35).
10. Implement the `Confirm`/`may_use` brake through [S06.T03](T03-planner-turn-policy.md)'s `may_draw` and spec the three cases (RN-33, BR-S06.T04-09).
11. Implement `feed_goal` for a deck-to-discard prompt under a pending goal, with the `missing + 1` cap and the main-line exclusion; spec the four cases on the Dhelmise fixture (BR-S06.T04-08).
12. Implement `Decision`, `Explains` and the driver's `bot_decision` event behind `store_logs`; spec that logging changes no decision by comparing pairing fingerprints with logging on and off (BR-S06.T04-07).
13. Run the property test over 10,000 generated prompts asserting every answer validates, then a 1,200-game suite run asserting `invalid_actions == 0` on the planner side; write the resolver table and the `need` table into `engine/BOTS.md` (BR-S06.T04-03, -04).

## Edge cases and error handling

- **A prompt whose candidate list is empty** → cannot happen; [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-07 refuses to open a mandatory prompt with no valid answer. A debug assertion records the assumption, and the property test's generator never produces one.
- **A `ChooseCards` prompt with `min = 0` and `may_cancel`** → for a `Loss` direction the resolver answers `Cancel` (giving up nothing is better than giving up something); for a `Gain` it takes `max`. The legacy had no cancel concept at all, so this is a new case and it gets its own test rather than a default.
- **Every candidate scores identically** (four copies of the same card in the hand) → they are one group, so there is nothing to choose between; `margin` is `None` and the answer names `(group 0, count)`. Grouping by definition ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-05) removes the whole class of arbitrary tie-breaks the legacy's enumeration created.
- **A discard prompt where every candidate is a last copy worth more than 5.0** → the resolver still gives up the cheapest; `margin` is small, which is exactly the signal [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md) looks for. The bot does not refuse a mandatory cost, because refusing is not an available answer.
- **`switch_in_opponent` when the actor is the opponent** (an Escape Rope-style effect where they choose among your Pokémon) → the prompt is routed to the *other* bot by `actor` ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-02), and that bot sees its own view. This resolver is never asked to choose against itself, and a test builds the prompt both ways to prove the routing.
- **A `promote_after_ko` prompt with exactly one benched Pokémon** → it is promoted regardless of score, including a two-prize Pokémon that cannot attack; the `-40_000` term cannot change a one-candidate decision. The rule is "never promote it **when another is available**", and the test names both halves.
- **The goal's zone is the lost zone rather than the discard** → `feed_goal` reads `profile.goal.zone` and works unchanged; the Dhelmise case happens to be the discard. A fixture with a lost-zone goal exercises the other branch, because a resolver that silently only handles one zone is the kind of bug a single fixture hides.
- **A `distribute_counters` answer that must total exactly `total`** → the greedy fill is capped by `max_per` and spills to the next target until the total is reached; `validate_answer` checks the sum exactly ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-09), so a shortfall is a test failure here, not a substituted default in production.
- **A `retreat_payment` prompt where only one assignment exists** → the engine does not open it at all ([S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md)); when several exist, the resolver gives up the units that no main-line slot's cost needs, and falls back to `prompt::defaults::resolve`'s `can_pay` assignment when every choice is equivalent.
- **`need` asked about a definition the profile never saw** (a card that entered play through an opponent's effect) → the Pokémon branch finds no line and returns `BASE + attacker bonus`; `power_of` returns `(0, 9, None)` for an unknown definition ([S06.T02](T02-deck-profile-analysis.md)), so nothing divides by zero and nothing panics. Covered by the totality property test.
- **Logging is on and the margin is huge** (a forced choice with one real option) → the event still carries `margin: null` rather than a large number, because there was no runner-up. The coach's sort is ascending, so `null` sorts last and a forced move is never presented as a critical moment.
- **The same prompt answered twice** (a driver bug) → the second answer carries a stale id and is rejected and counted by RN-21 ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-08). The resolver is stateless across prompts, so it produces the same answer both times and nothing diverges.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core need` green, including `> the_card_does_not_count_itself` — the legacy Alakazam case: with Kadabra in play and one Alakazam in hand, a one-card hand discard gives up the spare energy, never the Alakazam (RN-36).
- [ ] `> the_last_copy_of_a_needed_card_gains_three`, `> a_copy_with_one_left_in_the_deck_does_not`, `> energy_gains_three_when_two_remain`, `> recovery_is_worth_six_five_while_a_line_piece_is_in_the_discard` (RN-36).
- [ ] `> the_scale_matches_the_documented_table`: one assertion per constant in the `need` table, each against a hand-built state (BR-S06.T04-01).
- [ ] `cargo test -p ptcg-core resolve` green, including `> every_generated_prompt_gets_a_valid_answer` — a property test over 10,000 generated prompts across all eight `PromptKind`s, zero `InvalidAnswer` (BR-S06.T04-04).
- [ ] `> a_boss_orders_prompt_takes_the_lethal_two_prize_target`: an opponent bench holding a 1-prize Pokémon at 60 HP and a 2-prize Pokémon at 70 HP, with an Active able to deal 80 as Active-placed damage, yields the 2-prize target (RN-34).
- [ ] `> a_promotion_never_hands_over_the_game`: with the opponent on one prize left, a 2-prize benched Pokémon is not promoted while any other bench slot exists; with it as the only slot, it is (RN-35).
- [ ] `> direction_covers_every_purpose`, `> a_prize_prompt_is_blind`, `> a_hand_discard_is_a_loss`, `> a_deck_search_is_a_gain` (BR-S06.T04-05).
- [ ] `> a_prompt_with_twenty_groups_evaluates_need_twenty_times` (instrumented call counter), `> a_gain_takes_max_and_a_loss_takes_min`, `> max_pick_is_respected_when_a_group_has_three_copies` (BR-S06.T04-06).
- [ ] `> a_deck_to_discard_prompt_feeds_the_goal`, `> it_never_takes_more_than_missing_plus_one`, `> a_main_line_card_is_not_fed_to_the_goal` on the Dhelmise fixture (BR-S06.T04-08).
- [ ] `> a_you_may_draw_three_with_nine_left_is_declined` and `> a_you_may_draw_one_with_nine_left_is_accepted` (RN-33, BR-S06.T04-09).
- [ ] `> margin_is_the_gap_to_the_runner_up`, `> margin_is_none_with_a_single_candidate`, and `> margin_does_not_affect_the_chosen_answer` — the same 200-game pairing run with `store_logs` on and off produces identical `pairing_fingerprint` values (BR-S06.T04-07).
- [ ] `policy.rs > need_does_not_read_card_names` and `> renaming_every_def_leaves_every_need_unchanged` on the Dhelmise fixture (BR-S06.T04-02); `resolve.rs > every_purpose_is_answered` compiles with no wildcard arm (BR-S06.T04-03).
- [ ] A 1,200-game run of `planner_rs_v1` on the suite v6 lists reports `invalid_actions == 0` for the planner side, and a `store_logs` run yields at least one `bot_decision` event per decision with a `margin` field (BR-S06.T04-04, -07).

## Risks and open questions

- **Risk — the sixteen constants are a tuned surface with no theory behind them.** They came from one person's measured iterations on one meta, and nothing here says 9.0 is right for a main-line Basic. Mitigation: they are named `const`s quoted in `engine/BOTS.md`, they are part of `planner_rs_v1`'s `code_hash` ([S06.T07](T07-bot-registry-and-freezing.md)), and a change to any of them is a new bot with its own measurement rather than a silent drift. The legacy's own history shows the honest version of this: `planner v10`, a plausible retune, measured 73.4 % against v9's 74.3 % and was reverted.
- **Risk — the structural predicates are narrower than the names they replace.** "Rare Candy" is a specific card; "a program that evolves skipping a stage" may match cards the rule was never meant for, or miss a Rare Candy whose program is not yet written. Mitigation: each predicate is one function with one test, an unimplemented program simply returns false (the card scores `TRAINER_DEFAULT`, which is the conservative direction), and the share of a suite's lists whose programs are complete is already gated at freeze time ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) BR-S05.T16-03).
- **Risk — `margin` is a within-bot number and invites over-reading.** The gap between the best and second option on *this* value function says the planner was undecided; it does not say the position was close. A reviewer shown six small-margin moments may conclude the bot lost there when it lost three turns earlier. Mitigation: the metric is documented as "where the bot was undecided" in `engine/BOTS.md`, and [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md) treats every verdict as a hypothesis to measure (RN-66), never as a finding.
- **Risk — `Direction::Loss` is not always right for a hand-zone prompt.** "Put a card from your hand on top of your deck" removes it from the hand but keeps it; scoring it as a pure loss makes the bot bury a card it wants. Mitigation: the derivation is over `(purpose, zone)`, and `order_deck_top` is already `Gain`; a purpose that moves a card between the actor's own zones gets its own arm when [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md) produces one, with a test rather than a widened default.
- **Question — should `need` be exposed to the lookahead bots as a leaf evaluator?** [S06.T05](T05-rollout-bot.md) needs a value for a position, not for a card, and summing `need` over a hand is not that. Recommendation: no — the rollout's leaf value is prize differential and terminal outcome, which are properties of the position; `need` stays a card-level function and its only consumers are the planner and its resolvers.
- **Question — should `margin` be recorded for turn-cascade actions as well as for prompts?** The cascade is a first-match ordering, not a scored comparison, so "second best" is only well defined within a phase's selector. Recommendation: record it where a selector genuinely compares candidates (bench, energy, items, supporter, attack) and leave it `None` for the phases that are pure predicates; that is what the `Decision` struct already expresses, and it keeps the coach's input honest.

## References

- `pokemon/src/pokesearch/sim/pilot.py` L245–262 (`need`) — verified: the goal-fodder short-circuit returning `0.5` when holding and `6.0` otherwise; `base = _need(...)`; the early return when not holding; `resta = k.in_deck(me)`; the energy branch counting deck entries whose name ends in `"energy"` and adding `3.0` when two or fewer remain; and `if base >= 5.0 and resta[n] == 0: return base + 3.0` with the comment *"é a última: descartada, a linha para aqui"*. The three RN-36 bonuses reproduced above.
- `pokemon/src/pokesearch/sim/pilot.py` L264–302 (`_need`) — verified: `hand[n] -= 1` when holding, with the comment *"a própria carta não conta como 'já tenho uma'"*; the line lookup falling back to `2.0 + 1.0 if n in attackers`; the loose multi-prize support Basic returning `6.0` only when `len(me.hand) <= 6` and it is not already in play (the Fezandipiti case); the Basic targets `3 if main else 1` against `em_jogo + hand[n]`; the evolution rule `base_em_jogo > hand[n]` counting the Basic when `i == 2` and a Rare Candy is held; `(10.0 if main else 6.5) + i`; the energy branch comparing energies in hand against main-line slots with none; the supporter, Rare Candy, recovery (`"from your discard pile"`) and search/draw branches, each keyed on a card name or on substring matching — the prose dependencies BR-S06.T04-02 replaces.
- `pokemon/src/pokesearch/sim/pilot.py` L304–382 (`choose`) — verified: the zone classification and its `k.saw_own_deck()` side effect (moved into the engine by [S06.T01](T01-honest-information-view.md) BR-S06.T01-02); the `you may draw N` branch applying `len(me.left) - N >= SAFE_DECK and len(me.hand) < FULL_HAND`; `losing` derived from `"discard" | "bottom" | "shuffle"` in the prompt text plus a hand zone; the goal-feeding branch capping fodder at `max(falta, 0) + 1` and scoring `3.0` per fodder minus `2.0` per non-fodder; the opening score `-30 × retreat - 40 × (prize - 1) + hp × 0.1 - 25 × support`; the promotion score `300 × ready + hp + 40 × energies - 120 × (support ∧ ¬ready) - 150 × (prize - 1) × ¬ready - 400 × (prize ≥ len(other.prize))`; the opponent score `prize × 100 + 200 × (hp ≤ ataque) - hp × 0.3` with the counter-moving variant `-hp`; the `±extra` terms (`+0.25` gaining, `-0.5` losing); the `- 0.0001 * i` index tie-break; and `memo["margin"] = round(best_score - second, 3)` with the comment *"o técnico revisa primeiro as decisões de margem pequena"*.
- `pokemon/src/pokesearch/sim/policies.py` L18 and L69–94 — verified: `MAX_CHOICE_SCAN = 400`, and `heuristic_policy::choose` branching on substrings of `tips` (`"discard"`+`"hand"`, `"knocked out"`, `"retreat"`+`"switch"`, `"opponent"`+`"switch"`/`"bench"`, `"prize"`, `"deck"`/`"search"`/`"put"`, `"damage counter"`). The prefix cap and the prose interface this subtask has no counterpart for.
- `pokemon/src/pokesearch/sim/policies.py` L192–205 and L255–317 (`smart_policy`) — verified: the header comment recording the measured result of the zone-based rewrite, *"2000 partidas espelhadas, mesma lista dos dois lados: 48,3% de vitórias, IC 95% de 46,1% a 50,5%"*, i.e. not better than `heuristic` despite attacking more (5.65 vs 5.15) and wasting less energy (0.25 vs 0.36); and its `zone_of` classifier with the comment that prompt wording varies per card while the zone is a fact of the state. The measured evidence that zone alone was not the answer either.
- `pokemon/tests/test_pilot.py::test_discard_choice_keeps_the_piece_the_line_needs_and_the_last_copy` — verified: with Kadabra Active, Abra benched and a hand of `[alakazam, fire, fire, fire]`, the discard chooses anything but the Alakazam. The first acceptance case above.
- `pokemon/benchmarks/HISTORICO.md` — verified: `planner v6` on suite v2, score 76.0 % → 77.2 % and mirror 50.2 % → 53.8 %, with the note naming exactly the three memory rules of RN-36.
- `pokemon/ESPECIFICACAO.md` §4.3 RN-36 — verified: *"Descarte com memória: a carta não conta a si mesma; última cópia e energia escassa valem mais"*, pointing at `pilot.py:245`.
- [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) — the nineteen purposes, `PromptKind`, `Answer`, `Candidate` grouping with `max_pick`, `validate_answer`'s ten reasons, `prompt::defaults::resolve` and RN-21's substitution path.
- [S06.T02](T02-deck-profile-analysis.md) — `Profile`, `main_line`, `support_lines`, `attackers`, `scale`, `goal`, `goal_pending`, `is_fodder` and `power_of`; [S06.T03](T03-planner-turn-policy.md) — `Need`, `attack_value`, `energy_gain`, `may_draw` and the constants `FULL_HAND` / `SAFE_DECK`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
