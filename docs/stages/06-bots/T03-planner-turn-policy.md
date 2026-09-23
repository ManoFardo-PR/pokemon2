# S06.T03 — Planner bot: turn policy

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 3 / 8 |
| Depends on | [S04.T05](../04-game-engine-core/T05-actions-and-legality.md), [S06.T01](T01-honest-information-view.md), [S06.T02](T02-deck-profile-analysis.md) |
| Unblocks | [S06.T04](T04-need-scoring-and-prompt-resolvers.md), [S06.T05](T05-rollout-bot.md) |
| Parallel with | [S06.T08](T08-measurement-score-and-mirror.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` legal actions — from [S04.T05](../04-game-engine-core/T05-actions-and-legality.md)
- `module` `PlayerView` — from [S06.T01](T01-honest-information-view.md)
- `module` `Profile` — from [S06.T02](T02-deck-profile-analysis.md)
- `doc` ESPECIFICACAO.md RN-32..RN-35

## Outputs (proposed)
- `module` `ptcg-core::bots::planner::PlannerBot` (v1) — fixed phase order: win-now attack → bench Basics (main line first, always keep a second attacker) → evolve (main line first) → attach energy (tuple sort: useful, not fragile, on main line, reaches ≥ 60 now, stage, attacks unlocked, missing energy, HP) → stadium/tool → search items before draws → abilities → items → supporter (hand-dumpers only with ≤ 3 cards) → retreat (only if the incoming Pokémon hits ≥ max(60, 2× current)) → attack (max prizes, then max damage) → end turn; brakes `FULL_HAND = 12`, `SAFE_DECK = 7` for optional draws (RN-33); gust rule (RN-34); never promote a 2-prize Pokémon that cannot attack (RN-35) — consumed by [S06.T04](T04-need-scoring-and-prompt-resolvers.md), [S06.T05](T05-rollout-bot.md)

## Initial objective
A competent baseline that plays like a disciplined human — sets up, avoids decking out, attacks last — reproducing the legacy pilot's measured behaviour on the new engine.

## Context

This is the subtask that produced the largest measured jump the legacy ever recorded, and the jump came from one idea: **develop first, attack last**. `benchmarks/HISTORICO.md` has the numbers. The heuristic bot scored 52.7 % (CI 49.8–55.6) on suite v1 and lost 32.8 % of its games by decking out. The first planner — the same engine, the same cards, a different turn order — scored 81.2 %, and by planner v4 it was at 87.3 % (CI 85.3–89.2) with deck-out losses at 5.5 %. By planner v8 the deck-out rate was 3.1 %. Nothing about the rules changed; the bot simply stopped knocking out as soon as it could and stopped drawing itself to death.

The legacy's own summary of why the old bots were bad is worth quoting because it is the design brief: *"Os bots antigos nocauteavam assim que podiam e perdiam o resto do turno. Compra opcional é recusada quando o deck está curto: perder por fim de deck é o piloto comprando até morrer."* A knockout is the end of a turn, so taking it early throws away every development step that turn. An optional draw is free only while the deck is long; near the end each card in the deck is a turn of life. Both mistakes are invisible in a single game and dominant over a thousand.

`pilot.py::_p` is the reference implementation and it is a **flat ordered cascade**, not a scoring function: twelve phases, each a predicate and a selector, the first one that yields an action wins. That shape is kept deliberately. A weighted sum over heterogeneous considerations is impossible to attribute when a measurement moves; a cascade lets `HISTORICO.md` say "planner v5: search items before draws" and mean exactly one row of a table. Every phase here therefore cites the RN it serves, and the table in **Data operations** is the executable form of RN-32.

Four things change against the legacy, and each removes a class of defect rather than tuning a number.

**Draw amounts come from the program, not from prose.** `_draw_amount` runs three regexes over the card's English text (`draw (\d+) cards?`, `until you have (\d+) cards?`, `you may draw (\d+) cards`) to decide how many cards an action draws. That is the same prose-matching that [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) removed from prompts, and it fails the same way: a new wording silently becomes "draws nothing", and RN-33's brake stops applying to exactly the card that would deck the bot out. Here the number is read from the composed program's `draw` ops ([S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md)); a card with no program draws nothing, which is true rather than assumed.

**`power_on` is a query, not a temporary mutation.** To ask "what would I do to that benched Pokémon if I dragged it out?", the legacy assigned `alvo.position = ACTIVE`, evaluated, and restored the position in a `finally`. That mutates shared state inside a read-only decision, and it is one panic away from leaving the board wrong. Here the Weakness/Resistance stage takes an `as_active` flag ([S04.T07](../04-game-engine-core/T07-damage-pipeline.md) applies W/R only against the opponent's Active, RN-13), so the same answer comes from a pure function of the view.

**The bot reads a view, not the state.** `attack_value` in the legacy reads `state`, `me` and `other` in full. Here it reads `PlayerView` ([S06.T01](T01-honest-information-view.md)), which is what makes RN-30 a type-level guarantee instead of a convention. The consequence is honest and must be stated: `attack_value` becomes an **estimate**. It applies the attack's own `AttackFields` at the real board values, Tera-on-bench (RN-15), Weakness and Resistance in the pipeline's order (RN-13), and the counter-blocking declarations of cards visible in play — everything else a hook could contribute is invisible from a view and is assumed absent. A bot that needs exactness clones and runs the real pipeline, which is [S06.T05](T05-rollout-bot.md)'s whole purpose.

**Arithmetic is integer.** [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-09 forbids `f32`/`f64` in `ptcg-core`, so the planner's thresholds and the `need` scale it consumes ([S06.T04](T04-need-scoring-and-prompt-resolvers.md)) are fixed-point integers in hundredths: `Need(900)` is the legacy's `9.0`. Every legacy constant survives exactly; only its representation changes.

One correction to carry into the code. The traceability doc renders RN-33 as *"optional draws refused with ≥ 12 in hand or < 7 in deck"*, which understates the second brake. `pilot.py` L447 is `return deck_n - n >= SAFE_DECK and len(me.hand) < FULL_HAND`: the draw is refused when the deck would drop **below seven after the draw**, not when it is already below seven. With nine cards left, a draw of three is refused (9 − 3 = 6 < 7) even though the deck is comfortably above the floor. That is the version that measured 3.1 % deck-out losses, and it is the version implemented here.

## Scope

- **In scope.** `ptcg-core::bots::planner` with `PlannerBot`, its params and defaults; the twelve-phase cascade as a data table of `(predicate, selector)` pairs; `attack_value`, `power`, `power_on`, `ready` and `wins_now`; the energy-gain tuple and its blocked-counters branch; `may_draw` and `draw_amount`; `gust_pays`; the retreat gate; the bench and evolve selectors; the supporter keep/dump split; the constants `FULL_HAND`, `SAFE_DECK` and the rest; the registration of `planner_rs_v1` in the bot registry's entry shape ([S06.T07](T07-bot-registry-and-freezing.md) owns the registry itself); the policy tests and the phase-order test; the mirror measurement against the heuristic bot.
- **Out of scope.** The `need` value function and every prompt answer ([S06.T04](T04-need-scoring-and-prompt-resolvers.md)) — this subtask calls `need` and declares its threshold constants, and T04 defines it; the honest view and `determinize` ([S06.T01](T01-honest-information-view.md)); the deck profile ([S06.T02](T02-deck-profile-analysis.md)); lookahead of any kind ([S06.T05](T05-rollout-bot.md), [S06.T06](T06-ismcts-bot.md)); the registry, `code_hash` and freezing ([S06.T07](T07-bot-registry-and-freezing.md)); the suite measurement that grades the bot ([S06.T08](T08-measurement-score-and-mirror.md)); the damage pipeline itself ([S04.T07](../04-game-engine-core/T07-damage-pipeline.md)) — `attack_value` estimates it, it does not reimplement it; action legality ([S04.T05](../04-game-engine-core/T05-actions-and-legality.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-32 | **Kept.** The turn runs in a fixed order and the attack is last: a game-ending attack → bench Basics → evolve → attach energy → stadium/tool → search items → abilities → items → supporter → retreat → attack → end turn. The first phase that yields an action wins; no phase is skipped for a later one. | `PlannerBot::choose_action` walking `PHASES: [Phase; 12]` in order; each phase is a `(predicate, selector)` pair, never an inline `if` chain | `planner.rs > phase_order_matches_the_documented_table` (a scripted turn's recorded phase sequence equals the table); `> a_knockout_that_does_not_end_the_game_waits_for_the_last_phase`; `> a_game_ending_attack_preempts_every_development_step` |
| RN-33 | **Kept, stated in full.** An optional draw of `n` cards is refused when `deck_len - n < SAFE_DECK` (7) or when `hand.len() >= FULL_HAND` (12). The brake is on the deck size **after** the draw, so a draw of 3 with 9 cards left is refused; a mandatory draw is never refused. | `planner::may_draw(view, def) -> bool`, consulted by the evolve, stadium, ability, item and supporter phases and by [S06.T04](T04-need-scoring-and-prompt-resolvers.md)'s `Confirm` resolver | `planner.rs > a_draw_of_three_with_nine_left_is_refused` (9 − 3 = 6 < 7); `> a_draw_of_one_with_nine_left_is_taken`; `> a_full_hand_of_twelve_refuses_every_optional_draw`; `> the_mandatory_start_of_turn_draw_is_never_refused` |
| RN-34 | **Kept.** A gust effect (an item, supporter or ability that switches in one of the opponent's benched Pokémon) is played only when some benched target can be knocked out this turn **and** is worth strictly more prizes than the knockout the current Active already allows — which is zero prizes when the Active cannot be knocked out at all. | `planner::gust_pays(view, profile, def) -> bool`, applied in the search-item, item and supporter phases | `planner.rs > a_gust_is_refused_when_the_active_already_falls_for_the_same_prizes`; `> a_gust_is_played_for_a_two_prize_bench_target_when_the_active_gives_one`; `> a_gust_is_refused_with_an_empty_opponent_bench`; `> a_non_gust_item_is_unaffected` |
| RN-35 | **Kept, two halves.** Retreat is paid only when the incoming Pokémon really hits: `power(incoming) >= max(60, 2 × power(active))`, or `power(active) == 0` and `power(incoming) >= 30`. A Pokémon worth two or more prizes that cannot attack is never benched to sit idle and never promoted when another is available; the promotion half lives in the `promote_after_ko` resolver. | `planner::retreat_gate` for the first half; `planner::need`'s multi-prize support-Basic rule and [S06.T04](T04-need-scoring-and-prompt-resolvers.md)'s `promote_after_ko` scoring for the second | `planner.rs > a_retreat_into_a_ten_damage_attacker_is_refused` (the legacy's Abra case); `> a_retreat_into_a_sixty_damage_attacker_from_a_dead_active_is_taken`; `> a_retreat_that_doubles_the_output_is_taken`; `> a_two_prize_pokemon_that_cannot_attack_is_not_benched_on_a_long_hand` |
| BR-S06.T03-01 | `PlannerBot::choose_action` returns an element of the `actions` slice it was given, always, including when every phase declines — the final phase is `EndTurn`, which [S04.T05](../04-game-engine-core/T05-actions-and-legality.md) BR-S04.T05-09 guarantees is always legal. | the cascade selects by index from `actions`; the last phase has no predicate | `planner.rs > never_returns_an_illegal_action` (property test over 10,000 fuzzer-generated states); `> an_empty_turn_ends_the_turn` |
| BR-S06.T03-02 | `attack_value(view, attacker, attack, target, certainty, placement)` follows the damage order of RN-13: the attack's own field bonuses are added to the printed damage first, then Weakness ×2 and Resistance −30 apply **only** when the target is the opponent's Active or is being evaluated `AsActive`; counters placed by the attack's `counters_per` field are added afterwards and never pass through Weakness or Resistance (RN-14). `Certainty::Sure` removes every coin-dependent term and returns 0 for a `coin_or_nothing` attack. | `planner::attack_value`, a pure function of `(&PlayerView, &ProgramTable)` | `planner.rs > weakness_applies_to_the_printed_plus_bonus`; `> counters_bypass_weakness`; `> sure_drops_the_coin_term`; `> sure_zeroes_a_coin_or_nothing_attack`; `> a_nothing_unless_attack_whose_condition_fails_is_worth_zero` |
| BR-S06.T03-03 | The planner is a pure function of `(view, profile, its own rng)`: it holds no state across games beyond the `Arc<Profile>` built in `new_game`, mutates nothing, and draws from its stream only to break an exact tie, as the last step of a selection. | `PlannerBot` has no `&mut self` method other than the trait's; `Bot: Send` with no interior mutability ([S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md) BR-S04.T11-01) | `planner.rs > a_planner_call_does_not_mutate_the_view`; `> the_tie_break_is_the_only_rng_use` (stream counter: zero draws when a strict maximum exists); `policy.rs > bots_do_not_touch_game_rng` |
| BR-S06.T03-04 | The energy phase ranks candidate attachments by the tuple `(useful, not_fragile, on_main_line, reaches_60_now, stage, attacks_unlocked, -missing, hp_max)` and attaches only when `useful` is true. `fragile` is "the target is the Active, the attack this attachment unlocks deals under 60 now, and its `hp_max` is at most 90". When the opponent's Active blocks damage counters, the tuple becomes `(useful, prints_damage, not_fragile, printed_damage, -missing, hp_max)`. | `planner::energy_gain(view, profile, action) -> Gain`; the blocked branch guarded by `planner::blocks_counters` | `planner.rs > energy_goes_to_the_main_line_before_a_loose_attacker`; `> energy_is_not_spent_on_a_fragile_active`; `> a_useless_attachment_is_declined_and_the_phase_falls_through`; `> a_counter_blocked_active_redirects_energy_to_printed_damage` |
| BR-S06.T03-05 | `draw_amount(view, def) -> u8` is read from the composed program's `draw` ops and from nothing else; no planner function reads `CardDef::name`, a card's rules text or any prose. | `planner::draw_amount` taking `&ProgramTable`; a policy test scanning the module | `policy.rs > planner_does_not_read_card_text`; `planner.rs > draw_amount_reads_the_program` (a card whose program draws 3 reports 3; the same card with an empty program reports 0) |
| BR-S06.T03-06 | The bench phase plays a Basic when its `need` is at least `BENCH_NEED_FLOOR` (`Need(500)`, the legacy's 5.0) **or** the bench holds fewer than `MIN_BENCH` (2) Pokémon; among candidates it takes the highest `need`. This is the "always keep a second attacker" rule. | `planner::bench_phase` | `planner.rs > a_second_basic_goes_down_even_when_its_need_is_low`; `> a_third_low_need_basic_is_not_benched`; `> the_highest_need_basic_wins` |
| BR-S06.T03-07 | Search items are played before any drawing card: an item whose `draw_amount` is 0 and which is not a gust is preferred over abilities, items and supporters. A search finds the missing piece and shortens the deck by exactly the card it takes, which a draw cannot promise. | phase 6 in `PHASES`, ordered before phases 7–9 | `planner.rs > a_search_item_precedes_a_draw_ability`; `> a_drawing_item_is_not_treated_as_a_search`; the phase-order test of RN-32 |
| BR-S06.T03-08 | The supporter phase prefers supporters that keep the hand: a hand-dumping supporter is played only when `profile.scale != ScaleKind::HandSelf` **and** `hand.len() <= DUMP_HAND_MAX` (3). Among keepers, a drawing supporter wins when `hand.len() <= KEEP_DRAW_HAND_MAX` (5), then the highest `need`. | `planner::supporter_phase`, reading `Profile::scale` ([S06.T02](T02-deck-profile-analysis.md)) | `planner.rs > a_hand_scaling_deck_never_dumps_its_hand`; `> a_dumper_is_played_on_a_three_card_hand`; `> a_dumper_is_refused_on_a_six_card_hand`; `> a_draw_supporter_wins_on_a_five_card_hand` |
| BR-S06.T03-09 | Every phase is a pure predicate over `(&PlayerView, &Profile, &[Action])`; no phase reads `Game`, opens a database, allocates per candidate or depends on the order of a hash container. The phase table is data and is quoted verbatim in `engine/BOTS.md`. | the `Phase` struct holding two function pointers; clippy `disallowed-types` in `ptcg-core::bots` | `policy.rs > planner_phases_are_function_pointers`; `policy.rs > bots_do_not_import_game` ([S06.T01](T01-honest-information-view.md) BR-S06.T01-07) |
| BR-S06.T03-10 | A decision costs at most one pass over `actions` per phase and never calls the damage pipeline: `choose_action` is O(phases × actions) with `actions.len() <= 40` ([S04.T05](../04-game-engine-core/T05-actions-and-legality.md) BR-S04.T05-01), and the figure is benchmarked and recorded, because [S06.T05](T05-rollout-bot.md) calls it tens of thousands of times per decision. | the cascade's single-pass selectors; `attack_value` memoised per `(attack, target)` within one decision | `cargo bench planner_decide` with the µs/decision figure written into `docs/PERF.md`; `planner.rs > attack_value_is_computed_once_per_attack_target_pair` (call counter) |

## Data operations

The engine never opens the database and the planner mutates nothing; it maps a state to an action. The table below is the **decision table** — RN-32's order in executable form. Phases run top to bottom and the first action returned wins.

| Phase | Condition | Action | Rule |
|---|---|---|---|
| 0 — finish | an `Attack(i)` whose `attack_value(Sure)` is at least the opponent Active's `remaining_hp`, **and** that knockout takes at least `own.prizes_left` prizes or the opponent's bench is empty | that attack; among several, the highest `attack_value(Estimate)` | RN-32 — the attack that ends the game waits for nothing |
| 1 — bench | a `PlayBasic(c)` exists and (`need(c) >= Need(500)` or occupied bench slots `< 2`) | the candidate with the highest `need` | RN-32, BR-S06.T03-06; main line first falls out of `need` ([S06.T04](T04-need-scoring-and-prompt-resolvers.md)) |
| 2 — evolve | an `Evolve(c, slot)` exists; candidates whose entry draws are filtered by `may_draw` | the highest `(def in profile.main_line, hp_max)` | RN-32, RN-33 |
| 3 — energy | an `AttachEnergy(c, slot)` exists and the best `energy_gain` has `useful = true`. Ahead of it: if the Active is not `ready` and some benched Pokémon is, and an attachment to the Active would complete `retreat_cost`, attach there instead | the highest `energy_gain` tuple | RN-32, BR-S06.T03-04 |
| 4 — stadium / tool | a `PlayStadium`, `AttachTool` or `UseStadium` exists; `UseStadium` is skipped when the stadium is neutral and the turn is otherwise empty, or when `may_draw` refuses it | the first in that order | RN-32, RN-33; the neutral guard of [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md) BR-S04.T11-07 |
| 5 — search items | a `PlayItem(c)` with `draw_amount(c) == 0`, not a gust, passing `may_draw` and `gust_pays` | the highest `need` | RN-32, RN-34, BR-S06.T03-07 |
| 6 — abilities | a `UseAbility(slot, i)` passing `may_draw` | the first in slot order | RN-32, RN-33 |
| 7 — items | a `PlayItem(c)` passing `may_draw` and `gust_pays` | the highest `need` | RN-32, RN-33, RN-34 |
| 8 — supporter | a `PlaySupporter(c)` passing `may_draw` and `gust_pays`; keepers before dumpers; a dumper only when `profile.scale != HandSelf` and `hand.len() <= 3` | keepers: the highest `(draws && hand.len() <= 5, need)`; dumpers: the first | RN-32, RN-33, BR-S06.T03-08 |
| 9 — retreat | a `Retreat(slot)` exists, the Active exists, and `power(incoming) >= max(60, 2 × power(active))` or (`power(active) == 0` and `power(incoming) >= 30`) | the retreat bringing in the highest-`power` bench slot | RN-32, RN-35 |
| 10 — attack | an `Attack(i)` exists | a knockout by `attack_value(Sure)` first, ranked `(prize_value(target), attack_value)`; otherwise the highest `attack_value`, taken when it is above 0 or when `EndTurn` is absent | RN-32 |
| 11 — end turn | always | `EndTurn` | BR-S06.T03-01 |

**Read set.** Every phase reads only these, and the list is the whole of the planner's input.

| Fact | Source | Used by |
|---|---|---|
| legal actions | the `actions` slice ([S04.T05](../04-game-engine-core/T05-actions-and-legality.md)) | every phase |
| own hand, board, discard, decklist, `unseen`/`deck`/`prizes` | `view.own` ([S06.T01](T01-honest-information-view.md)) | `need`, `may_draw`, phases 1–8 |
| opponent board, `hand_len`, `deck_len`, `prizes_left` | `view.opp` | phases 0, 3, 9, 10; `gust_pays` |
| `main`, `main_line`, `support`, `attackers`, `scale`, `goal` | `Arc<Profile>` ([S06.T02](T02-deck-profile-analysis.md)) | phases 1–3, 5, 7, 8; `need` |
| attack costs, printed damage, `AttackFields` | `view.def(d)` and the `ProgramTable` | `attack_value`, `power`, `energy_gain` |
| `hp_max`, `damage`, `energies`, `tools`, `conditions` | `SlotView` | `power`, `ready`, `energy_gain`, phase 0 |
| `draw` op counts | the composed program ([S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md)) | `draw_amount`, `may_draw` |
| the true hidden state, `Game::rng`, the database | — | never (RN-30, Architecture principle 1) |

## Interfaces

```rust
// ptcg-core::bots — the trait S06.T01 finished; restated here because the planner is its first real user.
pub type View<'a> = &'a PlayerView;

pub trait Bot: Send {
    fn name(&self) -> &'static str;
    fn choose_action(&mut self, view: View<'_>, actions: &[Action], rng: &mut Rng) -> Action;
    fn answer_prompt(&mut self, view: View<'_>, prompt: &Prompt, rng: &mut Rng) -> Answer;
    fn new_game(&mut self, _view: View<'_>, _me: PlayerIdx) {}
}
```

```rust
// ptcg-core::bots::planner

/// A value on the `need` scale, in hundredths. `Need(900)` is the legacy's 9.0.
/// Integer because ptcg-core carries no floating point (S04.T10 BR-S04.T10-09).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct Need(pub i32);

#[derive(Debug, Clone)]
pub struct PlannerBot {
    profile: Arc<Profile>,                 // built once in new_game (S06.T02 BR-S06.T02-09)
    programs: Arc<ProgramTable>,           // the job's composed programs; empty in an effect-less engine
    me: PlayerIdx,
    params: PlannerParams,
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct PlannerParams {
    pub full_hand:  u8,   // 12  — RN-33
    pub safe_deck:  u8,   // 7   — RN-33
    pub bench_need: i32,  // 500 — BR-S06.T03-06, the legacy's 5.0
    pub min_bench:  u8,   // 2
    pub retreat_min: i32,       // 60
    pub retreat_desperate: i32, // 30
    pub dump_hand_max: u8,      // 3
}
impl Default for PlannerParams { /* exactly the values above */ }

impl Bot for PlannerBot {
    fn name(&self) -> &'static str { "planner_rs_v1" }
    fn choose_action(&mut self, view: View<'_>, actions: &[Action], rng: &mut Rng) -> Action;
    fn answer_prompt(&mut self, view: View<'_>, prompt: &Prompt, rng: &mut Rng) -> Answer; // S06.T04
    fn new_game(&mut self, view: View<'_>, me: PlayerIdx);
}
```

**The phase table** (BR-S06.T03-09). `Phase` is data; `PHASES` is what `engine/BOTS.md` quotes.

```rust
pub struct Phase {
    pub name: &'static str,
    /// Returns the chosen index into `actions`, or None to fall through to the next phase.
    pub pick: fn(&PlannerBot, &PlayerView, &[Action]) -> Option<usize>,
}
pub const PHASES: [Phase; 12] = [
    Phase { name: "finish",        pick: phases::finish },
    Phase { name: "bench",         pick: phases::bench },
    Phase { name: "evolve",        pick: phases::evolve },
    Phase { name: "energy",        pick: phases::energy },
    Phase { name: "stadium_tool",  pick: phases::stadium_tool },
    Phase { name: "search_items",  pick: phases::search_items },
    Phase { name: "abilities",     pick: phases::abilities },
    Phase { name: "items",         pick: phases::items },
    Phase { name: "supporter",     pick: phases::supporter },
    Phase { name: "retreat",       pick: phases::retreat },
    Phase { name: "attack",        pick: phases::attack },
    Phase { name: "end_turn",      pick: phases::end_turn },
];
```

**Evaluation helpers.** All pure over `(&PlayerView, &Profile, &ProgramTable)`; none touches `Game`.

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Certainty { Estimate, Sure }      // Sure drops every coin-dependent term
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Placement { AsIs, AsActive }      // AsActive: W/R applied as if the target were the Active

/// Damage this attack would deal to `target`, in points. RN-13 order; counters added after W/R (RN-14).
pub fn attack_value(view: &PlayerView, programs: &ProgramTable, attacker: SlotIdx, attack: u8,
                    target: (Side, SlotIdx), certainty: Certainty, placement: Placement) -> i32;

/// Best attack_value this slot could deal to the opponent's Active right now, over payable attacks.
pub fn power(view: &PlayerView, programs: &ProgramTable, slot: SlotIdx) -> i32;
pub fn ready(view: &PlayerView, programs: &ProgramTable, slot: SlotIdx) -> bool;   // power > 0
/// Same, evaluated against a benched opponent as if it had been dragged to the Active spot.
pub fn power_on(view: &PlayerView, programs: &ProgramTable, slot: SlotIdx, target: SlotIdx) -> i32;

pub fn draw_amount(view: &PlayerView, programs: &ProgramTable, def: DefIdx) -> u8;
pub fn may_draw(view: &PlayerView, programs: &ProgramTable, p: &PlannerParams, def: DefIdx) -> bool;
pub fn gust_pays(view: &PlayerView, programs: &ProgramTable, def: DefIdx) -> bool;
pub fn blocks_counters(view: &PlayerView, programs: &ProgramTable, target: (Side, SlotIdx)) -> bool;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Gain(pub bool, pub bool, pub bool, pub bool, pub i8, pub i8, pub i8, pub u16);
pub fn energy_gain(view: &PlayerView, profile: &Profile, programs: &ProgramTable,
                   card: DefIdx, to: SlotIdx) -> Gain;

pub const FULL_HAND: u8 = 12;          // RN-33 — pilot.py L34
pub const SAFE_DECK: u8 = 7;           // RN-33 — pilot.py L35
pub const RETREAT_MIN: i32 = 60;       // RN-35
pub const RETREAT_DESPERATE: i32 = 30; // RN-35
pub const FRAGILE_HP: u16 = 90;        // BR-S06.T03-04
pub const FRAGILE_DAMAGE: i32 = 60;
pub const BENCH_NEED_FLOOR: Need = Need(500);
pub const KEEP_DRAW_HAND_MAX: u8 = 5;
```

**`may_draw`, exactly** (RN-33, with the correction over the traceability wording):

```text
n = draw_amount(view, programs, def)
if n == 0          -> true                       // the card draws nothing; the brake does not apply
deck_after = view.own.deck_len as i16 - n as i16
may_draw = deck_after >= SAFE_DECK && view.own.hand.len() < FULL_HAND
```

**`gust_pays`, exactly** (RN-34):

```text
if the def's program contains no "switch in one of the opponent's benched Pokemon" op -> true
if own active is None or opp active is None or opp bench is empty                     -> false
front_falls  = power_on(active, opp_active) >= opp_active.remaining_hp()
front_prizes = front_falls ? prize_value(opp_active) : 0
gust_pays    = any benched b of the opponent with
                   power_on(active, b) >= b.remaining_hp() && prize_value(b) > front_prizes
```

**`attack_value`, stage by stage** — the same order as the pipeline of [S04.T07](../04-game-engine-core/T07-damage-pipeline.md), over view data:

```text
d = def.attacks[i].damage_printed
fields = programs.attack_fields(def, i)
if fields.nothing_unless is Some(c) && !eval(c, view)   -> return 0
d += fields.plus                                        ; when its plus_when condition holds
d += fields.plus_per.n * max(0, value(counter, view) - fields.plus_per.offset)
d += fields.coin_plus.n * (flips == 0 ? 1 : flips / 2)  ; dropped entirely when Certainty::Sure
if fields.coin_or_nothing                               -> d = (certainty == Sure) ? 0 : d / 2
if target is Tera and benched (RN-15)                   -> d = 0
if placement == AsActive || target is the opponent's Active:
      if attacker type is in target.weakness            -> d *= 2
      else if attacker type is in target.resistance     -> d = max(0, d - 30)
flat = 0
if fields.counters_per is Some && !blocks_counters(view, target)
      flat = 10 * per * value(unit, view)               ; counters never pass W/R (RN-14)
return d + flat
```

**Registry entry** — the shape [S06.T07](T07-bot-registry-and-freezing.md) consumes; the name is permanent (RN-37).

```rust
BotEntry {
    name: "planner_rs_v1",
    kind: BotKind::Planner,
    ctor: PlannerBot::from_params,
    params_schema: include_str!("planner.params.json"),
    source_files: &["bots/planner.rs", "bots/planner/phases.rs",
                    "bots/planner/need.rs", "bots/profile.rs", "view.rs"],
}
```

## Implementation steps

1. Declare `Need`, `PlannerParams`, `PlannerBot`, `Phase` and a `PHASES` table whose every entry returns `None` except `end_turn`; implement `Bot` and `new_game` building the `Arc<Profile>`. `cargo test -p ptcg-core planner` green, and a planner that only ends turns already finishes 1,000 games (BR-S06.T03-01).
2. Implement `attack_value` over printed damage plus Weakness and Resistance with the `Placement` flag; spec the RN-13 order and the `AsActive` case. Then add the attack fields one at a time, each with its own test (`plus`, `plus_per`, `coin_plus`, `coin_or_nothing`, `nothing_unless`, `counters_per`) (BR-S06.T03-02).
3. Implement `power`, `ready` and `power_on` on top of it, plus the per-decision memo of `(attack, target)` pairs; spec the memo with a call counter (BR-S06.T03-10).
4. Implement phase 10 (attack) and phase 0 (finish) and spec the difference between them: a knockout that does not end the game must fall through to phase 10, a game-ending one must fire at phase 0 (RN-32).
5. Implement `draw_amount` from the program's `draw` ops and `may_draw` with the deck-after brake; spec the four RN-33 cases, including the 9-cards-minus-3 refusal (RN-33, BR-S06.T03-05).
6. Implement phases 1 and 2 (bench, evolve) against `need` — a stub returning `Need(200)` for everything until [S06.T04](T04-need-scoring-and-prompt-resolvers.md) lands — and spec the bench floor and the two-Pokémon rule (BR-S06.T03-06).
7. Implement `energy_gain` with its eight-component tuple, the fragile guard and the retreat-payment shortcut; implement phase 3; spec the four energy cases (BR-S06.T03-04).
8. Implement `blocks_counters` as a pure scan of the target's attachments and its owner's in-play definitions for a `counters_blocked` declaration, and wire the blocked branch of `energy_gain`; spec it with a stubbed declaration (BR-S06.T03-04).
9. Implement `gust_pays` and phases 5, 6, 7 (search items, abilities, items); spec the four RN-34 cases and the search-before-draw order (RN-34, BR-S06.T03-07).
10. Implement phase 8 (supporter) with the keep/dump split reading `Profile::scale`, and phase 4 (stadium/tool) with the neutral guard; spec the four supporter cases (BR-S06.T03-08).
11. Implement phase 9 (retreat) with the gate and spec the three RN-35 cases, including the legacy's "Abra that deals 10" regression (RN-35).
12. Run the acceptance measurement: `planner_rs_v1` against the heuristic bot on suite v6 lists, mirrored, recording win rate with its CI and the loss-by-deck-out share; benchmark `choose_action` and write the µs/decision into `docs/PERF.md`; write the planner section of `engine/BOTS.md` with the phase table, the constants and the RN each phase serves (RN-32, BR-S06.T03-10).

## Edge cases and error handling

- **A lethal attack exists but taking it does not end the game** → phase 0 declines (the knockout takes fewer prizes than remain and the opponent still has a bench), and the turn continues developing; the attack is taken at phase 10 anyway, after every development step. This is the single behaviour that moved suite v1 from 52.7 % to 81.2 %, and the test that pins it is `> a_knockout_that_does_not_end_the_game_waits_for_the_last_phase`.
- **The opponent has no Active** (the moment after a knockout, before promotion) → `power`, `power_on` and phase 0 all return 0 rather than panicking; the planner falls through to development. The engine opens a `promote_after_ko` prompt before the next action anyway ([S04.T07](../04-game-engine-core/T07-damage-pipeline.md)), so this state is observed only inside a rollout's playout.
- **An attack that hits the bench or several targets** → the planner evaluates `Attack(i)` against the opponent's Active only, because [S04.T05](../04-game-engine-core/T05-actions-and-legality.md)'s `Attack(u8)` carries no target and the spread is the program's business. Such attacks are systematically **under**-valued, never over-valued, which keeps the bias conservative; the case is recorded in `engine/BOTS.md` and is one of the things [S06.T05](T05-rollout-bot.md) fixes by actually playing the attack out.
- **A deck of exactly 7 cards and a card that draws 0** → `may_draw` returns true, because the brake applies to optional draws and this card is not one. A 7-card deck with a "draw 2" card refuses (7 − 2 = 5 < 7); a 9-card deck with "draw 2" accepts (9 − 2 = 7 ≥ 7). The boundary is tested on both sides.
- **A "draw until you have N cards" effect** → `draw_amount` reports `max(0, N - hand.len())` from the program's `draw_until` op, so the brake sees the real number. The legacy computed `N - (len(hand) - 1)` because the card itself was still counted in the hand at that moment; here the op is evaluated against the hand the program will see, and the off-by-one is a test, not a comment.
- **Every energy attachment is useless** (nothing it enables is new) → phase 3 declines and the turn continues; the energy is not attached at all this turn. The legacy did the same (`if gain(best)[0]`), and it matters: a wasted attachment is a permanently lost resource, and the measured "desperdiça menos energia" figure is what this guard protects.
- **A gust card whose program the job did not carry** (an unimplemented printing) → `gust_pays` finds no switch op, returns true, and the card is treated as an ordinary item. It will do nothing when played, which is the engine's behaviour for an unimplemented card, not a planner decision; the suite's coverage gate ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) BR-S05.T16-03) is what keeps such cards out of a ruler.
- **The Active is Asleep or Paralyzed** → `Attack` and `Retreat` are absent from `actions` altogether ([S04.T05](../04-game-engine-core/T05-actions-and-legality.md) predicate 5), so phases 0, 9 and 10 find nothing and the planner develops. No condition check is written into the planner, which is exactly why the filter chain belongs to the engine.
- **A profile with `main = None`** (a deck with no attacker, or an effect-less engine that found none) → `main_line` is empty, `need` falls back to its generic branch, and every phase still works: the planner benches by `need`, attaches to whatever unlocks an attack, and attacks. Asserted by a test on the "no attacker" fixture of [S06.T02](T02-deck-profile-analysis.md).
- **Two actions tie exactly on every tuple component** → the lower index in `actions` wins, deterministically; the RNG is consulted only when the phase declares a genuine tie-break, and the stream counter test asserts zero draws when a strict maximum exists. The legacy's `- 0.0001 * i` term did the same thing by arithmetic; making it an explicit ordering rule removes a rounding hazard.
- **The planner is asked to act during `Phase::Setup`** → `opening_active` and `bench_setup` arrive as prompts, not as actions, and are answered by [S06.T04](T04-need-scoring-and-prompt-resolvers.md). `choose_action` is never called in setup, and a debug assertion records the assumption.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core planner` green, including `> never_returns_an_illegal_action` — a property test over 10,000 fuzzer-generated states asserting the returned action is in the given slice (BR-S06.T03-01).
- [ ] `> phase_order_matches_the_documented_table`: the recorded phase sequence over a scripted twelve-action turn equals `PHASES`, and `> a_knockout_that_does_not_end_the_game_waits_for_the_last_phase` together with `> a_game_ending_attack_preempts_every_development_step` (RN-32).
- [ ] `> a_draw_of_three_with_nine_left_is_refused`, `> a_draw_of_one_with_nine_left_is_taken`, `> a_full_hand_of_twelve_refuses_every_optional_draw`, `> the_mandatory_start_of_turn_draw_is_never_refused` (RN-33).
- [ ] `> a_gust_is_refused_when_the_active_already_falls_for_the_same_prizes`, `> a_gust_is_played_for_a_two_prize_bench_target_when_the_active_gives_one`, `> a_gust_is_refused_with_an_empty_opponent_bench` (RN-34).
- [ ] `> a_retreat_into_a_ten_damage_attacker_is_refused`, `> a_retreat_into_a_sixty_damage_attacker_from_a_dead_active_is_taken`, `> a_retreat_that_doubles_the_output_is_taken` (RN-35).
- [ ] `> weakness_applies_to_the_printed_plus_bonus`, `> counters_bypass_weakness`, `> sure_drops_the_coin_term`, `> sure_zeroes_a_coin_or_nothing_attack` (BR-S06.T03-02).
- [ ] `> energy_goes_to_the_main_line_before_a_loose_attacker`, `> energy_is_not_spent_on_a_fragile_active`, `> a_useless_attachment_is_declined_and_the_phase_falls_through`, `> a_counter_blocked_active_redirects_energy_to_printed_damage` (BR-S06.T03-04).
- [ ] `policy.rs > planner_does_not_read_card_text` and `> planner_phases_are_function_pointers`; `> bots_do_not_touch_game_rng` and `> bots_do_not_import_game` still green (BR-S06.T03-05, -09).
- [ ] `> a_planner_call_does_not_mutate_the_view` (the serialized view is byte-identical before and after) and `> the_tie_break_is_the_only_rng_use` with a stream counter reporting zero draws on a strict maximum (BR-S06.T03-03).
- [ ] `cargo run -p ptcg-cli -- --bots` lists `planner_rs_v1`; a 1,200-game mirror of `planner_rs_v1` against `heuristic` on the suite v6 lists reports a win rate whose 95 % CI excludes 50 %, and the **loss-by-deck-out share of the planner side is below 5 %** (the legacy went 32.8 % → 3.1 %). Both figures are recorded in `engine/BOTS.md`.
- [ ] `cargo bench planner_decide` completes and the µs/decision figure is written into `docs/PERF.md`; `> attack_value_is_computed_once_per_attack_target_pair` passes (BR-S06.T03-10).

## Risks and open questions

- **Risk — `attack_value` is an estimate and the estimate is optimistic in one direction.** It cannot see hook contributions that are not declared on visible cards, so a target protected by something the view cannot evaluate looks knockable. The planner then attacks and fails, losing a turn. Mitigation: the three cases it *can* see (Tera on the bench, a declared `counters_blocked`, a declared `prevent_damage`) are handled, the rest is recorded in `engine/BOTS.md`, and `Certainty::Sure` is used for every "will this knock out?" decision so coins never contribute to a lethality claim. The exact answer costs a clone and belongs to [S06.T05](T05-rollout-bot.md).
- **Risk — the twelve constants are tuned to the legacy's 2026 meta.** `FULL_HAND = 12`, `SAFE_DECK = 7`, the 60/30 retreat thresholds and the `Need(500)` bench floor were each moved once and measured once. Mitigation: they are `PlannerParams` fields with the legacy defaults, so a variant is a params change with its own measurement rather than an edit; and because params are part of a bot's identity ([S06.T07](T07-bot-registry-and-freezing.md)), a retuned planner is a new bot name, not a silent drift.
- **Risk — the cascade cannot express "do A, then B" within one turn.** Each call returns one action and the engine calls again, so a plan that depends on ordering two cheap actions emerges only if the phase order happens to produce it. The legacy lived with this and reached 87.3 %. Mitigation: none here, deliberately; multi-step planning is search, and search is [S06.T05](T05-rollout-bot.md) and [S06.T06](T06-ismcts-bot.md).
- **Risk — phase 0's "ends the game" test is wrong when a knockout awards prizes through a hook.** `prize_value` can be modified ([S04.T07](../04-game-engine-core/T07-damage-pipeline.md) hook), and the planner reads `CardDef::prize_value`. Mitigation: it under-counts rather than over-counts (a hook that raises prize value makes the planner attack later, not sooner); a test pins the direction, and the exact value is available to the lookahead bots.
- **Question — should the planner ever concede?** [S04.T05](../04-game-engine-core/T05-actions-and-legality.md) puts `Concede` in the action enum and [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md) leaves the decision to a bot that can judge a position. The planner cannot judge one. Recommendation: `planner_rs_v1` never concedes, and the phase table has no concede phase; [S06.T05](T05-rollout-bot.md) owns the question because it has a value estimate to base it on.
- **Question — should `need` live here or in [S06.T04](T04-need-scoring-and-prompt-resolvers.md)?** This subtask calls it from four phases and declares its threshold constants, which makes the split slightly awkward. Recommendation: keep it in T04 as the tree already has it — the function is shared with every prompt resolver and is half of T04's measured contribution (planner v6, mirror 50.2 % → 53.8 %) — and let T03 depend on a stub until T04 lands. Step 6 is written for exactly that ordering.

## References

- `pokemon/src/pokesearch/sim/pilot.py` L385–546 (`_p`) — verified: the twelve-phase cascade in order; `wins_now()` selecting knockouts whose target prize value is at least `len(me.prize)` or whose opponent bench is empty; the bench guard `need >= 5.0 or len(me.bench) < 2`; the evolve key `(name in main_line, hp)`; the energy tuple `(not inutil, not fragil, linha, bate_agora >= 60, estagio, len(depois) - len(antes), -falta, hp)` and its blocked variant `(not inutil, dano > 0, not fragil, dano, -falta, hp, 0, 0)`; `fragil = na_frente and bate_agora < 60 and hp <= 90`; the retreat-payment shortcut when the Active is not `ready` and the bench is; the stadium/tool loop with `_is_neutral_stadium` and `_turn_is_empty`; the search-items filter `may_draw and gust_pays and _draw_amount == 0 and not a gust`; the supporter `keep`/`dump` split with `p.scale != "hand_self" and len(me.hand) <= 3`; the retreat gate `power(melhor) >= max(60, 2 * aqui) or (aqui == 0 and power(melhor) >= 30)` with its comment that the AI coach flagged the pilot three times for retreating into an Abra that deals 10; the final attack ranking `(prize, attack_value)`.
- `pokemon/src/pokesearch/sim/pilot.py` L441–447 (`may_draw`) — verified: `return deck_n - n >= SAFE_DECK and len(me.hand) < FULL_HAND`, with `FULL_HAND = 12` (L34) and `SAFE_DECK = 7` (L35) and the comment that an optional draw has two brakes, the short deck (*"cada carta é um turno de vida"*) and the already-full hand. **The deck brake is on the size after the draw**, which the traceability doc's short form understates; this file implements the real rule.
- `pokemon/src/pokesearch/sim/pilot.py` L429–439 (`gust_pays`) and L419–427 (`power_on`) — verified: the `_GUST` text tuple, the false return when either Active or the opponent bench is missing, `cai_frente`/`premio_frente`, the strict `prize(b) > premio_frente` comparison, and `power_on` temporarily assigning `alvo.position = PokemonPosition.ACTIVE` inside a `try/finally` — the mutation this subtask replaces with a `Placement` flag.
- `pokemon/src/pokesearch/sim/pilot.py` L55–91 (`attack_value`) — verified: printed damage, `recipe.expected_bonus(ctx)`, the `sure` subtraction of `coin_plus`, `coin_or_nothing` giving 0 when `sure` and `dmg // 2` otherwise, the `nothing_unless` early return of 0, `counters_per` producing a flat `10 × per × COUNTERS[unit](ctx)` only when `counters_blocked` is false, `tera_protected`/`damage_prevented` zeroing the damage, and Weakness ×2 / Resistance −30 applied **after** the bonus (RN-13) with the flat counters added **after** W/R (RN-14).
- `pokemon/src/pokesearch/sim/pilot.py` L222–231 (`_draw_amount`) — verified: the three regexes `draw (\d+) cards?`, `until you have (\d+) cards?` and `you may draw (\d+) cards` run over the card's text plus every ability's text, with `until you have N` returning `max(0, N - (len(me.hand) - 1))`. The prose dependency this subtask replaces with the program's `draw` ops.
- `pokemon/tests/test_pilot.py::test_pilot_refuses_optional_draw_when_the_deck_is_short_and_attacks_last` — verified: with a 5-card deck and a "draw 3" ability available the pilot attacks instead, and with a 30-card deck it uses the ability before attacking. The two-sided acceptance case reproduced above.
- `pokemon/benchmarks/HISTORICO.md` — verified: suite v1 `heuristic` 52.7 % (CI 49.8–55.6) with 32.8 % deck-out losses; `planner` v1 81.2 % with 10.5 %; v4 87.3 % (CI 85.3–89.2) with 5.5 %; v8 74.1 % on suite v3 with deck-out at 3.1 %; the v5 notes for the turn-order and gust changes (*"planner v5: itens de busca antes de qualquer compra"*, *"planner v4: Boss's Orders e afins só quando rendem nocaute ou mais prêmios"*).
- `pokemon/ESPECIFICACAO.md` §4.3 RN-32..RN-35 — verified: the fixed order with attack last, the 12-in-hand / 7-in-deck brakes, the gust rule and the retreat/promotion rule, each with its `pilot.py` line pointer.
- [S04.T05](../04-game-engine-core/T05-actions-and-legality.md) — the `Action` enum, the guarantee that `legal_actions` is at most ~40 entries, the predicate chain that removes blocked attacks and retreats before the planner sees them, and `EndTurn` always being legal.
- [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) — the ten damage stages `attack_value` estimates, the RN-13 ordering and the seven hook names; [S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md) — `can_pay`, `attack_cost` and `retreat_cost`, which the energy and retreat phases consult.
- [S06.T01](T01-honest-information-view.md) — `PlayerView`, `SlotView`, `determinize` and BR-S06.T01-07 (the `Bot` trait's view type); [S06.T02](T02-deck-profile-analysis.md) — `Profile`, `main_line`, `scale`, `attackers`, `goal` and `is_fodder`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
