# S04.T11 — Baseline bots: random and heuristic

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 11 / 18 |
| Depends on | [S04.T05](T05-actions-and-legality.md), [S04.T09](T09-prompt-protocol.md) |
| Unblocks | [S04.T12](T12-cli-job-protocol.md), [S04.T18](T18-performance-baseline.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) |
| Parallel with | [S04.T07](T07-damage-pipeline.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `legal_actions` / `apply` — from [S04.T05](T05-actions-and-legality.md)
- `contract` prompts and default resolvers — from [S04.T09](T09-prompt-protocol.md)
- `file` `pokemon/src/pokesearch/sim/policies.py` — `heuristic_policy`'s action order and `POLICIES`; read-only reference

## Outputs (proposed)
- `module` `ptcg-core::bots::{Bot trait, RandomBot, HeuristicBot}` — `trait Bot { fn choose_action(&mut self, view, actions) → Action; fn answer_prompt(&mut self, view, prompt) → Answer }`; heuristic: win-now attack → bench Basics → evolve → attach energy to the best attacker → attack for max damage → end turn; prompt answers by purpose (e.g. promote the highest-HP bench) — consumed by [S04.T12](T12-cli-job-protocol.md), [S04.T18](T18-performance-baseline.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)
- `contract` `View` = full state for now (the honest information view arrives with the first subtask of the bots stage); bots are pure functions of `(view, rng)`

## Initial objective
Two reference opponents exist from day one: random (for fuzzing the rules) and a simple heuristic (for benchmarks and as the first frozen suite opponent).

## Context

Two bots, two jobs. `RandomBot` exists to break the rules engine: uniform choices over the legal action list and over valid prompt answers explore states no designed policy reaches, and 10,000 random games with invariants enabled is the cheapest bug-finder this stage has. `HeuristicBot` exists to be a *reference*: it is the opponent [S04.T18](T18-performance-baseline.md) benchmarks against, the first frozen suite opponent ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)), and the yardstick every later bot is measured against ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)). Once it is frozen it is never edited (RN-37, enforced in [S06.T07](../06-bots/T07-bot-registry-and-freezing.md)), so the time to get its shape right is now.

The legacy's `heuristic_policy` is the model, and reading it is worth the ten minutes. Its action preference, verified in `pokemon/src/pokesearch/sim/policies.py`, runs: an attack that knocks out (expected damage ≥ target HP, taking Weakness and Resistance into account) → evolve → stadium/tool plays → abilities → items → supporters (a draw supporter only when the hand is at most five cards) → energy attachment scored by how many new attacks it enables, with a bonus for the Active → bench a Basic → attack for maximum damage → retreat when the Active cannot attack but a benched Pokémon can → pass. Two details in there are hard-won: a stadium whose ability only reshuffles its owner's cards is skipped when the turn has nothing else to do, because otherwise the bot uses it forever and the game never ends; and `_card_value` ranks a card for discarding and searching by a crude type-based score.

The Outputs of this subtask state a shorter order — win-now attack, bench Basics, evolve, attach energy to the best attacker, attack for max damage, end turn — and that is deliberate: in an effect-less engine there are no items, supporters or abilities to sequence, so the legacy's middle section has nothing to do. The full order is written down here anyway, as the target shape, so that when S05 gives cards their effects the bot gains steps rather than changing character.

The `View` is the full state in this stage. RN-30 — honest information — arrives with [S06.T01](../06-bots/T01-honest-information-view.md), which replaces the type without changing the trait. That ordering is deliberate: a bot written against `&Game` today compiles against `&PlayerView` tomorrow with the same call sites, and the legacy's own pilot notes that the third-party engine handed over the opponent's hidden zones whether or not the bot should look at them, so the view is the mechanism that makes honesty checkable rather than promised.

Two hard constraints. A bot is a pure function of `(view, its own rng)` — it never reads `Game::rng`, never mutates the state, and never carries state across games; that is what keeps a bot change from perturbing a shuffle ([S04.T10](T10-termination-stall-and-determinism.md) BR-S04.T10-04) and paired-seed screening genuinely paired. And a bot must never return an illegal action: `HeuristicBot` is property-tested for it, and when any bot does, RN-21's substitution path absorbs it and counts it ([S04.T09](T09-prompt-protocol.md)).

## Scope

- **In scope.** The `Bot` trait and its object-safe form; `RandomBot` and `HeuristicBot`; the heuristic's scoring helpers (`expected_damage`, `card_value`, `best_attacker`, `energy_gain`); prompt answering by purpose for both bots; the bot registry used by the CLI (`name → constructor`) and the `params` shape; the bot RNG plumbing; the fuzz harness that runs N random games with `--features invariants`; the heuristic-versus-random sanity measurement.
- **Out of scope.** The honest player view ([S06.T01](../06-bots/T01-honest-information-view.md)); deck profiling ([S06.T02](../06-bots/T02-deck-profile-analysis.md)); the planner's ordered turn policy and its `need()` scoring ([S06.T03](../06-bots/T03-planner-turn-policy.md), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md)); lookahead bots ([S06.T05](../06-bots/T05-rollout-bot.md), [S06.T06](../06-bots/T06-ismcts-bot.md)); bot registration, freezing and `code_hash` ([S06.T07](../06-bots/T07-bot-registry-and-freezing.md)); the job protocol's `bot: { name, params, seed }` field ([S04.T12](T12-cli-job-protocol.md)); measurement statistics ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. RN-30 (honest information) and RN-37 (frozen bots) are the rules this code will later be held to; the local rules below are what make that possible.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S04.T11-01 | A bot is a pure function of `(view, its own rng)`: it holds no state across games, mutates no game state, performs no I/O and never reads `Game::rng`. | `trait Bot` taking `&View` and `&mut Rng`; `Bot: Send` with no interior mutability; clippy `disallowed-types` in `ptcg-core::bots` | `bots.rs > a_bot_call_does_not_mutate_the_state` (serialized state identical before and after); `policy.rs > bots_do_not_touch_game_rng` ([S04.T10](T10-termination-stall-and-determinism.md)) |
| BR-S04.T11-02 | Every bot returns an action that is present in the `actions` slice it was given, and an answer that validates against the prompt it was given. | `HeuristicBot` selects by index from `actions`; `RandomBot` draws an index; both answer through builders that consult the prompt | `bots.rs > heuristic_never_returns_an_illegal_action` (property test, 10,000 states); `> random_never_returns_an_invalid_answer` (property test, 10,000 prompts) |
| BR-S04.T11-03 | `RandomBot` is uniform over the given slice and over the valid answers of a prompt, using only its own stream; it draws exactly once per decision. | `RandomBot::choose_action` = one `gen_range(0..actions.len())`; `answer_prompt` builds a valid answer with a bounded number of draws documented per kind | `bots.rs > random_is_uniform` (chi-square over 100,000 draws on a 7-action slice); `> random_draw_count_per_decision_is_documented` |
| BR-S04.T11-04 | `HeuristicBot` is deterministic given `(view, rng)`: it uses randomness only to break exact ties, and the tie-break is the single last step of the selection, so removing randomness changes nothing else. | `HeuristicBot::choose_action` computes a score per action, takes the maximum, and breaks a tie with one draw | `bots.rs > heuristic_is_deterministic_without_ties`; `> the_tie_break_is_the_only_rng_use` (a counter on the stream) |
| BR-S04.T11-05 | The heuristic's action preference is the documented ordered list, and the order is a data table, not scattered `if`s, so it can be read and frozen. | `HeuristicBot::PREFERENCE: [ActionClass; 11]` consulted in order | `bots.rs > preference_order_matches_the_documented_table`; the table is quoted in `engine/BOTS.md` |
| BR-S04.T11-06 | A "win now" attack is chosen first: an attack whose expected damage (printed, with Weakness ×2 and Resistance −30 applied) is at least the target's remaining HP outranks everything else; among several, the highest expected damage wins. | `HeuristicBot::win_now(view)` before the preference table | `bots.rs > a_lethal_attack_is_taken_over_an_evolution`; `> lethal_accounts_for_weakness` |
| BR-S04.T11-07 | The heuristic never repeats a no-progress action: a stadium ability or an ability whose use leaves the material signature unchanged is skipped when the turn offers nothing else, so the bot cannot loop to the step cap. | `HeuristicBot::is_neutral(action, view)` plus the `turn_is_empty` guard | `bots.rs > a_neutral_stadium_is_skipped_on_an_empty_turn`; `> a_game_between_two_heuristics_never_hits_the_step_cap` (1,000 games, zero `StepLimit`) |
| BR-S04.T11-08 | Both bots answer every purpose of the prompt contract; where a bot has no opinion it delegates to `prompt::defaults::resolve`, never to an arbitrary index. | `answer_prompt`'s `match` over `Purpose` with an explicit delegating arm | `bots.rs > every_purpose_is_answered` (exhaustive match, compile-enforced); `> delegation_uses_the_default_resolver` |
| BR-S04.T11-09 | Bot construction is by name and params: `bots::make(name, params, rng) -> Result<Box<dyn Bot>, EngineError>`; an unknown name is an error, never a silent fallback to random. | `bots::make`; the registry is a static slice of `(name, constructor)` | `bots.rs > unknown_bot_name_is_an_error`; `> the_registry_lists_random_and_heuristic` |
| BR-S04.T11-10 | The heuristic's source is stable from the moment it is frozen: after [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) registers it as a suite opponent, its file is not edited; an improvement is a new bot with a new name (RN-37, enforced by [S06.T07](../06-bots/T07-bot-registry-and-freezing.md)). | the file `bots/heuristic.rs` and its `code_hash` recorded in `bots` ([S06.T07](../06-bots/T07-bot-registry-and-freezing.md)) | `engine/BOTS.md` records the hash at freeze time; `code_hash` test in [S06.T07](../06-bots/T07-bot-registry-and-freezing.md) |

## Data operations

Bots decide; they do not mutate. The table records what they may touch.

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| the whole `Game` | read only | `choose_action`, `answer_prompt` | `&View` is an immutable borrow; a bot cannot obtain `&mut Game` (BR-S04.T11-01) |
| bot RNG stream | advanced | tie-breaks (`HeuristicBot`), every decision (`RandomBot`) | one stream per bot slot, from `rng::bot_rng` ([S04.T10](T10-termination-stall-and-determinism.md)); never `Game::rng` |
| `Game::rng` | untouched | never | changing a bot must not change a shuffle (BR-S04.T10-04) |
| `Game::invalid_actions` | `+= 1` (indirectly) | when a bot returns something illegal | the increment is the engine's ([S04.T09](T09-prompt-protocol.md)), not the bot's; a correct bot never causes one (BR-S04.T11-02) |
| `Player::deck_searched` | set by the engine, read by the bot | on the first own-deck search | the flag that will split "deck + prizes as one pile" in [S06.T01](../06-bots/T01-honest-information-view.md) (RN-30) |
| the database | — | never | the engine holds no connection |

## Interfaces

```rust
/// For this stage, `View` is the game itself. S06.T01 replaces the alias with a real
/// player view and the trait does not change.
pub type View<'a> = &'a Game;

pub trait Bot: Send {
    fn name(&self) -> &'static str;
    fn choose_action(&mut self, view: View<'_>, actions: &[Action], rng: &mut Rng) -> Action;
    fn answer_prompt(&mut self, view: View<'_>, prompt: &Prompt, rng: &mut Rng) -> Answer;
    /// Called once per game so a bot can precompute from its own decklist (S06.T02 uses it).
    fn new_game(&mut self, _view: View<'_>, _me: PlayerIdx) {}
}

pub struct RandomBot;
pub struct HeuristicBot { /* no per-game state beyond what new_game computes */ }

pub fn make(name: &str, params: &serde_json::Value) -> Result<Box<dyn Bot>, EngineError>;
pub const REGISTRY: &[(&str, fn(&serde_json::Value) -> Result<Box<dyn Bot>, EngineError>)] =
    &[("random", RandomBot::from_params), ("heuristic", HeuristicBot::from_params)];
```

**Heuristic preference table** — the documented order (BR-S04.T11-05). Steps marked *S05* have nothing to select in an effect-less engine and are inert until card programs exist.

| # | Class | Selection rule |
|---|---|---|
| 0 | win-now attack | an attack with `expected_damage ≥ target.remaining_hp`; among several, the highest (BR-S04.T11-06) |
| 1 | evolve | the evolution that raises `hp_max` the most |
| 2 | play stadium | any, unless a stadium of the same name is already in play |
| 3 | attach tool | the tool onto the best attacker |
| 4 | use ability *(S05)* | the first in slot order, skipping neutral ones (BR-S04.T11-07) |
| 5 | play item *(S05)* | the highest `card_value` |
| 6 | play supporter *(S05)* | a draw supporter only when `hand.len() <= 5`; otherwise any non-draw supporter |
| 7 | use stadium *(S05)* | skipped when neutral and the turn is otherwise empty (BR-S04.T11-07) |
| 8 | attach energy | maximise `(new attacks enabled, +2 if the target is the Active, best damage among enabled, hp_max)` |
| 9 | bench a Basic | the highest `hp_max` |
| 10 | attack | the highest `expected_damage` |
| 11 | retreat | only when the Active cannot attack and some benched Pokémon can |
| 12 | end turn | always available |

**Scoring helpers.**

```rust
/// Printed damage with Weakness ×2 and Resistance −30, as the pipeline would apply them
/// against the current Active. Deliberately ignores hooks: the bot estimates, it does not simulate.
fn expected_damage(view: View<'_>, attacker: Target, attack: u8, target: Target) -> u16;

/// A crude worth used for discard and search decisions.
/// energy 1.0 · Pokémon 2.0 + hp_max/100 (+1.0 when it is an evolution) · trainer 2.0 (3.0 when its
/// text draws or searches — S05 only) · anything else 1.5.  Integers ×10 internally (no floats).
fn card_value(view: View<'_>, card: CardIdx) -> u16;

fn best_attacker(view: View<'_>, p: PlayerIdx) -> Option<SlotIdx>;   // max (best printed damage, hp_max)
fn energy_gain(view: View<'_>, card: CardIdx, to: SlotIdx) -> (u8, u8, u16, u16);
```

**Prompt answering** (both bots; `HeuristicBot`'s opinions, `RandomBot` uniform):

| Purpose | `HeuristicBot` | `RandomBot` |
|---|---|---|
| `promote_after_ko`, `switch_in_own` | the benched slot maximising `(remaining_hp, energies.len())` | a uniform benched slot |
| `switch_in_opponent` | the opponent's benched slot minimising `remaining_hp` | uniform |
| `discard_cost`, `discard_effect` | the `min` cards with the lowest `card_value` | uniform |
| `search_to_hand`, `search_to_bench` | the `min` candidates with the highest `card_value` | uniform |
| `distribute_counters` | all on the opponent's Active, capped by `max_per` | uniform spread |
| `choose_prize` | position 0 (hidden, so any choice is equivalent) | uniform |
| `opening_active` | the Basic with the highest printed damage, tie-broken by `hp` | uniform Basic |
| `bench_setup` | every Basic in hand, up to the limit | a uniform count, then uniform picks |
| `retreat_payment` | the assignment from `energy::can_pay` ([S04.T06](T06-energy-provision-and-cost-payment.md)) | uniform among valid assignments |
| anything else | `prompt::defaults::resolve` (BR-S04.T11-08) | `prompt::defaults::resolve` with a uniform pick where the default is a list |

**`engine/BOTS.md`** records, per bot: name, params schema, the preference table above, the prompt table above, the file it lives in, and — once frozen — its `code_hash` and the date.

## Implementation steps

1. Declare `Bot`, `View`, `REGISTRY` and `make`; implement `RandomBot::choose_action` as a single uniform draw; spec `> random_is_uniform` and `> unknown_bot_name_is_an_error` (BR-S04.T11-03, -09). `cargo test` green.
2. Implement `RandomBot::answer_prompt` per prompt kind with a documented draw count; spec `> random_never_returns_an_invalid_answer` as a property test over 10,000 generated prompts (BR-S04.T11-02, -03).
3. Wire the fuzz harness: 10,000 random-versus-random games with `--features invariants`, asserting no `EngineError`, no invariant panic and an `Outcome` on every game. Fix whatever it finds in the owning subtask, not here.
4. Implement `expected_damage`, `card_value`, `best_attacker` and `energy_gain` as integer-only functions; unit-test each against hand-built states (BR-S04.T10-09 forbids floats).
5. Implement `HeuristicBot::win_now` and the preference table for the classes that exist today (evolve, stadium, tool, energy, bench, attack, retreat, end turn); spec `> a_lethal_attack_is_taken_over_an_evolution` and `> preference_order_matches_the_documented_table` (BR-S04.T11-05, -06).
6. Add the neutral-action guard and the `turn_is_empty` condition; spec `> a_neutral_stadium_is_skipped_on_an_empty_turn` (BR-S04.T11-07).
7. Implement `HeuristicBot::answer_prompt` with the table above and the delegating arm; spec `> every_purpose_is_answered` and `> delegation_uses_the_default_resolver` (BR-S04.T11-08).
8. Add the tie-break discipline: one draw at the end of the selection only; spec `> heuristic_is_deterministic_without_ties` and `> the_tie_break_is_the_only_rng_use` with a stream counter (BR-S04.T11-04).
9. Run the property test `> heuristic_never_returns_an_illegal_action` over 10,000 states generated by the random fuzzer, and `> a_bot_call_does_not_mutate_the_state` (BR-S04.T11-01, -02).
10. Run the sanity measurement: 1,000 games heuristic versus random on a vanilla deck pair, recording the win rate and the end-reason distribution in `engine/BOTS.md`; run 1,000 heuristic-versus-heuristic games and confirm zero `StepLimit` outcomes (BR-S04.T11-07).
11. Write `engine/BOTS.md` with both tables, the params schemas and a placeholder for the freeze hash that [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) fills.

## Edge cases and error handling

- **`legal_actions` contains only `EndTurn` and `Concede`** → the heuristic ends the turn; it never concedes. Conceding is left to bots that can judge a position ([S06.T05](../06-bots/T05-rollout-bot.md)), because a baseline that concedes distorts every suite it appears in.
- **A lethal attack exists against a benched target but not the Active** → `win_now` considers only attacks the bot can actually make with their real targets; an attack that hits the bench is evaluated against the target the pipeline would use. When in doubt it falls through to step 10 and picks maximum expected damage.
- **Two actions score exactly the same** → one draw from the bot's own stream breaks the tie. Because that draw is the last step, two bots differing only in tie-breaking still make the same choices whenever a strict maximum exists (BR-S04.T11-04).
- **A prompt answered with an index outside the candidates** → cannot happen for these two bots by construction (they select from the prompt's own lists), and if it ever does, the engine counts it and substitutes the default (RN-21). The property test in step 9 is what keeps "cannot happen" true.
- **A prompt whose candidate list is empty** → the engine never opens one ([S04.T09](T09-prompt-protocol.md) BR-S04.T09-07), so both bots can assume a non-empty list; a debug assertion documents the assumption.
- **`RandomBot` on a `DistributeCounters` prompt with `total = 4` and `max_per = 2`** → it spreads uniformly under the cap, using a documented number of draws so the stream position stays predictable; an answer that fails validation would be a bug in the builder, not a bot decision.
- **A deck with no attacking Pokémon at all** → the heuristic attaches energy, benches, and ends turns; the game terminates by deck-out or stall ([S04.T10](T10-termination-stall-and-determinism.md)). No special case is needed, and the fuzz harness covers it.
- **An evolution that lowers `hp_max`** → step 1 ranks by the increase, so a lowering evolution scores worst among evolutions but can still be chosen when it is the only one; the damage carried over stays, which is correct (RN-11).
- **The bot is asked to act while `phase == BetweenTurns`** → it is not: only prompt answers are accepted there, and the driver routes by `actor` ([S04.T09](T09-prompt-protocol.md) BR-S04.T09-02). A bot that receives a prompt out of its turn answers it normally.
- **A bot constructed with unexpected `params`** → `make` returns `EngineError` naming the field; the worker fails the job rather than silently running a different bot, because a measurement attributed to the wrong bot is worse than no measurement.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core bots` green, including `> heuristic_never_returns_an_illegal_action` over 10,000 fuzzer-generated states and `> random_never_returns_an_invalid_answer` over 10,000 generated prompts (BR-S04.T11-02).
- [ ] `cargo test -p ptcg-core --features invariants fuzz_random_games` — 1,000 random-versus-random games complete with an `Outcome` each, zero `EngineError`, zero invariant panics.
- [ ] `> a_bot_call_does_not_mutate_the_state`: the serialized state before and after `choose_action` and `answer_prompt` is byte-identical (BR-S04.T11-01).
- [ ] `> heuristic_is_deterministic_without_ties` and `> the_tie_break_is_the_only_rng_use` — a stream counter shows at most one draw per decision, and zero when a strict maximum exists (BR-S04.T11-04).
- [ ] `> a_lethal_attack_is_taken_over_an_evolution` and `> lethal_accounts_for_weakness` (60 printed against a Weakness target counts as 120) (BR-S04.T11-06).
- [ ] `> preference_order_matches_the_documented_table` — the recorded class sequence over a scripted turn equals the table in `engine/BOTS.md` (BR-S04.T11-05).
- [ ] `> a_game_between_two_heuristics_never_hits_the_step_cap`: 1,000 heuristic-versus-heuristic games, zero `StepLimit` outcomes (BR-S04.T11-07).
- [ ] Heuristic versus random over 1,000 games on a vanilla deck pair: the heuristic's win rate exceeds 90 %, and the figure plus the end-reason distribution are recorded in `engine/BOTS.md`.
- [ ] `> every_purpose_is_answered` compiles (exhaustive `match` with no wildcard) and `> delegation_uses_the_default_resolver` passes (BR-S04.T11-08).
- [ ] `> unknown_bot_name_is_an_error` and `> the_registry_lists_random_and_heuristic` (BR-S04.T11-09).

## Risks and open questions

- **Risk — the heuristic is frozen too early.** Once [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) makes it a suite opponent, RN-37 forbids editing it, and a weak opponent makes every later score look better than it is. Mitigation: freeze only after S05 gives cards their effects and the preference table's S05 rows are exercised; until then it is a benchmark opponent, not a ruler. The freeze date and `code_hash` go into `engine/BOTS.md`.
- **Risk — "win now" ignores hooks and mis-estimates lethality** once S05 adds damage modifiers. Mitigation: `expected_damage` is documented as an estimate; the bot may attack and fail to knock out, which is a legal, if suboptimal, play. Lookahead bots that need exactness call the pipeline on a cloned state ([S06.T05](../06-bots/T05-rollout-bot.md)).
- **Risk — the sanity measurement's ">90 % versus random" bar is unmet** because the effect-less engine gives the heuristic little to work with. Mitigation: if the observed rate is lower, the number is recorded as measured and the bar is adjusted in `engine/BOTS.md` with the reason, rather than the bot being tuned to hit a target that was guessed.
- **Question — should `RandomBot` be uniform over actions or over action *classes*?** Uniform over actions oversamples whatever class has the most instances (usually energy attachments), which biases the fuzz exploration. Recommendation: keep it uniform over actions for simplicity and determinism, and add a `random_by_class` variant only if the fuzzer's coverage proves lopsided.
- **Question — should the heuristic use the honest view before [S06.T01](../06-bots/T01-honest-information-view.md) exists?** It reads the full state today, which means it could in principle see hidden zones. Recommendation: none of its rules reads a hidden zone, and a review checklist item in `engine/BOTS.md` records that; the mechanical guarantee arrives with the view type in S06.

## References

- `pokemon/src/pokesearch/sim/policies.py` — verified: `heuristic_policy`'s ordered selection (knockout attack by `_expected_damage` ≥ target HP → evolve by source HP → `PutStadiumAction`/`UseStadiumAction`/`UseToolAction` with the neutral-stadium guard → `UseAbilityAction` → `UseItemAction` sorted by `-_card_value` → `UseSupporterAction` preferring a draw supporter when the hand is ≤ 5 → `AttachEnergyAction` scored by `(new attacks enabled, active bonus 2, best damage, hp)` → bench a Basic by HP → attack by expected damage → retreat when the Active cannot attack and a benched one can → pass); `_expected_damage` applying ×2 for Weakness and −30 for Resistance; `_card_value` (energy 1.0, Pokémon 2.0 + hp/100 with +1.0 for evolutions, trainer 3.0 when its text mentions draw or search else 2.0, otherwise 1.5); `_best_attacker`; `MAX_CHOICE_SCAN = 400`; `POLICIES` mapping `random`, `heuristic`, `smart`, `planner`, `planner_v4/v7/v9`, with the comment that `heuristic` and `smart` are frozen suite references and a new bot goes in `pilot.py` (RN-37). Consult for the order and the scoring shapes; nothing is ported.
- `pokemon/src/pokesearch/sim/runner.py` — verified: `_play_one` constructing the two policies with `seed*2+1` and `seed*2+2`, separate from the engine's own seed — the legacy form of the separate-stream rule.
- [S04.T09](T09-prompt-protocol.md) — the purposes both bots dispatch on, `prompt::defaults::resolve` and RN-21's substitution path.
- [S04.T10](T10-termination-stall-and-determinism.md) — `rng::bot_rng` and the rule that a bot never touches `Game::rng`.
- [S06.T01](../06-bots/T01-honest-information-view.md) — the `View` type that replaces `&Game`, and RN-30.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
