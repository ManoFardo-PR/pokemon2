# S06.T05 — Rollout bot (determinized playouts)

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 5 / 8 |
| Depends on | [S04.T03](../04-game-engine-core/T03-game-state-model.md), [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md), [S06.T01](T01-honest-information-view.md), [S06.T02](T02-deck-profile-analysis.md), [S06.T03](T03-planner-turn-policy.md), [S06.T04](T04-need-scoring-and-prompt-resolvers.md) |
| Unblocks | [S06.T06](T06-ismcts-bot.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` cheap `Game: Clone` — from [S04.T03](../04-game-engine-core/T03-game-state-model.md)
- `module` separate bot RNG stream — from [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)
- `module` `PlayerView::determinize` — from [S06.T01](T01-honest-information-view.md)
- `module` `Profile` shared as `Arc<Profile>` by every playout — from [S06.T02](T02-deck-profile-analysis.md)
- `module` planner as rollout policy — from [S06.T03](T03-planner-turn-policy.md)
- `module` prompt resolvers — from [S06.T04](T04-need-scoring-and-prompt-resolvers.md)

## Outputs (proposed)
- `module` `ptcg-core::bots::rollout::RolloutBot { playouts_per_action, max_depth_turns, policy: Planner }` — for each legal action: determinize the view N times, clone, apply, play out with the planner on both sides, average outcome (win = 1, tie = 0.5, prizes differential as tie-break); prompts inside playouts answered by the planner — consumed by [S06.T06](T06-ismcts-bot.md)

## Initial objective
The first bot that looks ahead: it evaluates each move by playing the game out from sampled hidden states, something impossible on the legacy engine.

## Context

This is the subtask that spends the architecture's single biggest bet. D-001 chose Rust for two reasons, and the second one was cheap state cloning: *"Generator coroutines, no cloning → Frame stack inside a cloneable state / Enables rollout/ISMCTS bots"*. The legacy simulator physically could not do what this file describes — its engine was a generator that could only be advanced, never copied — so every legacy bot was a one-pass heuristic and the entire planner cascade of [S06.T03](T03-planner-turn-policy.md) exists because search was unavailable. Here `Game: Clone` costs microseconds ([S04.T03](../04-game-engine-core/T03-game-state-model.md) BR-S04.T03-03) and a `Game` plus its buffers stays under 4 KB, so a bot can ask the only question that matters — *if I do this, what happens?* — and answer it by playing.

The structure is the simplest honest form of Monte Carlo search, and it is deliberately not a tree. For each legal action, sample a concrete hidden state consistent with the view, clone it, apply the action, play the rest of the game out with the planner driving both sides, and score the terminal outcome. Average over samples; take the best action. [S06.T06](T06-ismcts-bot.md) is the tree version, and it is next precisely because this subtask establishes every piece it needs: determinization, playouts, the value scale, the budget discipline and the determinism guarantees.

Four decisions make this more than a textbook rollout.

**Common random numbers.** The naive implementation draws a fresh determinization for every `(action, playout)` pair, which means two actions are compared under different hidden worlds and most of the observed difference is sampling noise. Instead the bot draws **one set of N determinizations per decision** and evaluates every candidate action against the same N worlds. The comparison between two actions is then paired, the variance of the *difference* collapses, and the same budget buys a much sharper ranking. This is the identical argument [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md) makes for paired seeds one stage later, and the legacy's own optimizer failure — screening gains of +2.7 to +4.6 points that became −2.2 to +0.9 on confirmation — is what unpaired comparison looks like when it is believed.

**Honesty is structural, not promised.** The bot receives a `PlayerView` and the only route from a view to a `Game` is `PlayerView::determinize` ([S06.T01](T01-honest-information-view.md) BR-S06.T01-05), which reads nothing outside the view. A rollout bot that could peek would be the single most damaging bug in this stage — it would look like a large, real improvement — so the type system is what prevents it, and `determinize_does_not_read_the_truth` is already the test that pins it. The opponent's hidden cards are *modelled*, not known; the sampler reports `Determinization { opponent_modelled }` and this subtask reports the share per job so the approximation is visible in the measurement rather than folded into it.

**The budget is the bot.** A rollout bot with no budget is a bot with no definition. At the ≥ 5,000 games/s target ([S04.T18](../04-game-engine-core/T18-performance-baseline.md) measures it; the legacy managed 22–40 games/s) a full game costs about 200 µs, so a playout capped at twelve turns costs roughly 100 µs and 64 playouts cost roughly 6.4 ms per decision — a derivation from a target, not a measurement, and step 10 replaces it with the measured figure. That puts a rollout-versus-rollout mirror of 1,200 games at a few minutes on this machine's thread count, which is affordable for a measurement and hopeless for the optimizer's inner loop. Saying so now is what keeps [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md) from planning around a bot it cannot afford.

**A playout must end.** Every playout runs against the real engine, so it inherits RN-20's five end reasons and the 3,000-step cap ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)). What it adds is a depth cap in *turns*: past `max_depth_turns` the position is scored by a static evaluation instead of played further. That cap is what makes the cost predictable, and it introduces the one genuinely new piece of judgement in this file — a value for a non-terminal position. It is deliberately crude (prize differential, then board presence), because a sophisticated evaluator is a second bot hiding inside the first, and a crude one that is measured beats a clever one that is assumed.

Determinism is the constraint everything else bends around. The bot draws only from its own stream (`rng::bot_rng`, [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-04), each determinized `Game` gets an RNG seeded from that stream, and playouts inside one decision are **never** run in parallel — the engine's parallelism is across games, and a work-stealing pool inside a decision would make the same seed produce different actions. The fingerprint equality at 1 and 16 workers has to hold for a rollout bot exactly as it holds for a heuristic one.

## Scope

- **In scope.** `ptcg-core::bots::rollout` with `RolloutBot`, `RolloutParams` and their defaults; the per-decision determinization set and its reuse across candidate actions; the playout loop and its depth cap; `static_value` for a depth-capped position and `terminal_value` for a finished one; the action-set reduction and its declared bound; the prompt path (a prompt decision is evaluated the same way an action decision is); the per-decision RNG discipline and the no-inner-parallelism rule; the `opponent_modelled` accounting and its reporting into `result_json`; the optional concede rule, off by default; the registry entry for `rollout_v1`; the benchmarks and the mirror measurement against `planner_rs_v1`.
- **Out of scope.** `determinize` itself and the opponent model it uses ([S06.T01](T01-honest-information-view.md)); the planner cascade and the prompt resolvers that drive the playouts ([S06.T03](T03-planner-turn-policy.md), [S06.T04](T04-need-scoring-and-prompt-resolvers.md)); the deck profile ([S06.T02](T02-deck-profile-analysis.md)); the information-set tree, UCT and the reuse of statistics across iterations ([S06.T06](T06-ismcts-bot.md)); the registry, `code_hash` and freezing ([S06.T07](T07-bot-registry-and-freezing.md)); the suite measurement and its statistics ([S06.T08](T08-measurement-score-and-mirror.md)); the engine's own parallelism and the job protocol ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)); the performance baseline the budget arithmetic quotes ([S04.T18](../04-game-engine-core/T18-performance-baseline.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask. It is held to two rules owned elsewhere: RN-30's honest information ([S06.T01](T01-honest-information-view.md)), which `determinize` enforces, and RN-20's termination ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)), which every playout inherits. The local rules below are what make a lookahead bot trustworthy enough to be measured.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S06.T05-01 | **Common random numbers.** One decision draws exactly `playouts_per_action` determinizations and evaluates **every** candidate action against that same ordered set; no action sees a world another action did not. | `RolloutBot::decide` building `worlds: SmallVec<[Game; 8]>` once, then iterating actions in the outer loop and worlds in the inner | `rollout.rs > every_action_sees_the_same_worlds` (an instrumented sampler records one determinization per world, not per action-world pair); `> pairing_reduces_the_variance_of_the_difference` (two identical actions score identically under CRN, and differ under independent sampling) |
| BR-S06.T05-02 | The bot reaches a `Game` only through `PlayerView::determinize`; `ptcg-core::bots::rollout` does not import `state::Game` for construction and never receives one from the driver. | the module imports `Game` only as `determinize`'s return type; the import-graph policy test of [S06.T01](T01-honest-information-view.md) BR-S06.T01-07 | `policy.rs > rollout_constructs_no_game_of_its_own`; `view.rs > determinize_does_not_read_the_truth` still green (RN-30) |
| BR-S06.T05-03 | A decision is a pure function of `(view, params, the bot's own rng state)`: the same view with the same seed yields the same action, on any thread and in any process. Playouts within one decision are **sequential**; the bot never spawns, never uses `rayon` and never reads `Game::rng` of the real game. | `decide` is a single-threaded loop; clippy `disallowed-types` bars `rayon` inside `ptcg-core::bots` | `rollout.rs > the_same_view_and_seed_give_the_same_action` (1,000 repetitions); `determinism.rs > fingerprint_is_equal_at_1_and_16_workers` with `rollout_v1` on both sides ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-06); `policy.rs > bots_do_not_touch_game_rng` |
| BR-S06.T05-04 | Every playout terminates within `max_depth_turns` turns or at an engine end condition, whichever comes first, and the two cases produce values on the same scale. A playout never runs to the 3,000-step cap in normal operation; one that does is counted and reported. | the playout loop's turn counter; `terminal_value` and `static_value` both return `Value` in hundredths of a win | `rollout.rs > a_playout_stops_at_the_depth_cap`; `> a_playout_that_ends_naturally_uses_the_terminal_value`; `> no_playout_reaches_the_step_cap` over 200 decisions |
| BR-S06.T05-05 | The value scale is integer and fixed: a win is `10_000`, a tie is `5_000`, a loss is `0`. A depth-capped position is `5_000 + PRIZE_WEIGHT × (opp.prizes_left − own.prizes_left)`, clamped to `[500, 9_500]`, with `BOARD_WEIGHT × (own_in_play − opp_in_play)` as a second term and a zero board forced to the losing bound. No floating point appears. | `rollout::terminal_value`, `rollout::static_value`; [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-09 | `rollout.rs > the_value_scale_matches_the_table`; `> a_two_prize_lead_at_the_cap_scores_above_a_tie`; `> an_empty_board_at_the_cap_scores_at_the_losing_bound`; `policy.rs > core_has_no_floating_point` |
| BR-S06.T05-06 | Inside a playout **both** sides are the planner with its prompt resolvers ([S06.T03](T03-planner-turn-policy.md), [S06.T04](T04-need-scoring-and-prompt-resolvers.md)); a playout is a planner-versus-planner game. The rollout bot never recurses into itself. | `Playout::run` constructing two `PlannerBot`s from the shared `Arc<Profile>` and `Arc<ProgramTable>` | `rollout.rs > a_playout_uses_the_planner_on_both_sides`; `> a_playout_never_constructs_a_rollout_bot` (a constructor counter) |
| BR-S06.T05-07 | The `Profile` is built once in `new_game` and shared as `Arc<Profile>` by the bot and by every playout's planners; no playout rebuilds it and no playout can mutate it ([S06.T02](T02-deck-profile-analysis.md) BR-S06.T02-09). | `Arc<Profile>` cloned into each playout's planners; `Profile` has no `&mut self` method | `rollout.rs > playouts_share_one_profile` (a build counter reads 1 per game, whatever the playout count) |
| BR-S06.T05-08 | Action-set reduction is declared and bounded, never silent: when `actions.len() > max_actions_scanned` the bot evaluates the planner's own top `max_actions_scanned` candidates, in the planner's order, and records `actions_scanned` and `actions_total` on the decision. The planner's first choice is always among them. | `rollout::shortlist(view, actions, params)`; the recorded pair in `Decision` | `rollout.rs > a_shortlist_always_contains_the_planner_choice`; `> the_shortlist_size_is_recorded`; `> no_shortlisting_below_the_bound` |
| BR-S06.T05-09 | The share of determinizations whose opponent zones were modelled rather than known is counted per job and surfaced: `opponent_modelled_share` appears in the engine's `result` line extras and in the measurement's `outcomes_json` ([S06.T08](T08-measurement-score-and-mirror.md)). | the counter incremented in `decide`, aggregated per pairing by [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)'s aggregator | `rollout.rs > the_modelled_share_is_counted`; a suite run's `result_json` carries the field, checked by `job-runner.spec.ts` |
| BR-S06.T05-10 | A playout never mutates the real `Game`, the real view, or any state the driver owns: it operates on a clone of a determinized sample and drops it. The bot's own fields are per-decision scratch that is cleared at the start of `decide`. | `decide` takes `&PlayerView`; the only `&mut Game` in the module is a local | `rollout.rs > a_rollout_decision_does_not_mutate_the_view` (the serialized view is byte-identical before and after); `> scratch_is_cleared_between_decisions` |
| BR-S06.T05-11 | Conceding is off by default: `concede_below` is `None`, and when it is set the bot concedes only when **every** candidate action's mean value is below the threshold and at least `playouts_per_action` samples supported that. A conceding bot changes what a suite measures, so turning it on is an explicit parameter with its own bot name. | `RolloutParams::concede_below: Option<i32>`, default `None`; `decide`'s final guard | `rollout.rs > the_default_bot_never_concedes` over 500 games (zero `Concede` outcomes); `> a_configured_threshold_concedes_a_hopeless_position` |
| BR-S06.T05-12 | A prompt is a decision like any other: `answer_prompt` shortlists candidate answers, evaluates each against the same world set and returns the best; when the prompt has a single valid answer it returns it without sampling. The answer always validates. | `RolloutBot::answer_prompt` reusing `decide`'s machinery over `Answer` candidates | `rollout.rs > a_single_answer_prompt_costs_no_playouts`; `> every_generated_prompt_gets_a_valid_answer` (property test, 10,000 prompts) |
| BR-S06.T05-13 | The per-decision cost is measured, not assumed: `µs/decision` at the default parameters is recorded in `docs/PERF.md` alongside the games/s of a rollout-versus-planner pairing, and the budget arithmetic in this file is restated against the measured figure. | `cargo bench rollout_decide`; the `docs/PERF.md` block of [S04.T18](../04-game-engine-core/T18-performance-baseline.md) | `docs/PERF.md` contains a `rollout_v1` block with `µs/decision`, games/s and the parameters used; `bench.rs > rollout_bench_runs_at_the_documented_parameters` |

## Data operations

The engine never opens the database. The table below is the **algorithm table**: one decision, step by step, with the cost each step is allowed.

| Step | Operation | Budget | Notes |
|---|---|---|---|
| 1 | Clear the per-decision scratch; read `actions` | O(1) | BR-S06.T05-10 |
| 2 | If `actions.len() == 1`, return it | O(1) | no sampling for a forced move |
| 3 | `shortlist = planner order of actions, truncated to max_actions_scanned` (default 12) | one planner pass, O(phases × actions) | BR-S06.T05-08; the planner's own choice is always index 0 |
| 4 | Draw `worlds[0..N]` = `view.determinize(&mut self.rng)`, `N = playouts_per_action` (default 64) | N × determinize, ≈ N × 20 µs (to verify) | BR-S06.T05-01; counted for `opponent_modelled` (BR-S06.T05-09) |
| 5 | For each `a` in `shortlist`, for each `w` in `worlds`: `g = w.clone()` | \|shortlist\| × N clones, ≈ µs each ([S04.T03](../04-game-engine-core/T03-game-state-model.md) BR-S04.T03-03) | the world is cloned, never consumed, so every action starts from the identical position |
| 6 | `g.apply(a)` (or `g.answer(a)` for a prompt); an `EngineError` scores the sample as a loss and is counted | O(1) | a shortlisted action is legal by construction; a counted error is a defect signal |
| 7 | Play out: `while !g.ended() && turns_played < max_depth_turns { planner drives whichever side is to act }` | ≤ `max_depth_turns` (default 12) turns, ≈ 100 µs (to verify) | BR-S06.T05-04, BR-S06.T05-06 |
| 8 | Score: `terminal_value(g, me)` if ended, else `static_value(g, me)` | O(board) | BR-S06.T05-05 |
| 9 | Accumulate `sum[a] += value`; after the inner loop, `mean[a] = sum[a] / N` | integer division, hundredths | BR-S06.T05-05 |
| 10 | Pick `argmax mean`, ties by `(mean, prize differential mean, lower shortlist index)` | O(\|shortlist\|) | deterministic; no RNG draw (BR-S06.T05-03) |
| 11 | Record `Decision { best, second, margin, actions_scanned, actions_total, playouts, modelled }` | O(1) | read by the driver through `Explains` ([S06.T04](T04-need-scoring-and-prompt-resolvers.md) BR-S06.T04-07) |
| 12 | If `concede_below` is set and `best < threshold`, return `Concede` | O(1) | BR-S06.T05-11; disabled by default |

**Budget arithmetic** at the defaults, derived from the ≥ 5,000 games/s target of [S04.T18](../04-game-engine-core/T18-performance-baseline.md) — a derivation, replaced by measurement in step 10 of the implementation.

| Quantity | Derivation | Value |
|---|---|---|
| one full game | the S04.T18 target | ≈ 200 µs |
| one depth-capped playout | ≈ half a game at 12 of ~24 turns | ≈ 100 µs |
| one decision | `min(actions, 12)` shortlist × 64 worlds… | — |
| …with world reuse | the worlds are shared, so the cost is `shortlist × N` playouts, not `shortlist × N` determinizations | ≈ 12 × 64 × 100 µs ≈ 77 ms |
| one decision at `playouts_per_action = 16`, `max_actions_scanned = 6` | the cheap profile | ≈ 6 × 16 × 100 µs ≈ 9.6 ms |
| one game, rollout on one side | ≈ 60 decisions × 77 ms | ≈ 4.6 s |
| 1,200-game mirror, both sides rollout | 1,200 × 9.2 s ÷ 22 threads | ≈ 8 min |
| the same at the cheap profile | 1,200 × 1.2 s ÷ 22 threads | ≈ 1 min |

The defaults therefore land at `playouts_per_action = 32` and `max_actions_scanned = 8` — between the two profiles — and the measured figure decides whether they move. The optimizer's inner loop cannot afford any of these, which is why [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md) screens with the planner and this bot is reserved for validation.

**Value scale** (BR-S06.T05-05), in hundredths of a win:

| Position | Value |
|---|---|
| the bot won | `10_000` |
| a tie (`stall`, `step_limit`, simultaneous loss) | `5_000` |
| the bot lost | `0` |
| depth cap reached | `clamp(5_000 + 1_200 × Δprizes + 150 × Δin_play, 500, 9_500)` |
| depth cap with the bot's board empty | `500` |
| depth cap with the opponent's board empty | `9_500` |

where `Δprizes = opp.prizes_left − own.prizes_left` and `Δin_play = own_pokemon_in_play − opp_pokemon_in_play`. `PRIZE_WEIGHT = 1_200` makes a two-prize lead worth about a quarter of a win, which is the cheapest defensible calibration and is stated as such.

## Interfaces

```rust
// ptcg-core::bots::rollout

/// A position value in hundredths of a win: 10_000 = win, 5_000 = tie, 0 = loss.
pub type Value = i32;

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct RolloutParams {
    pub playouts_per_action: u16,       // 32   — worlds drawn per decision (BR-S06.T05-01)
    pub max_depth_turns:     u16,       // 12   — turns played before static_value (BR-S06.T05-04)
    pub max_actions_scanned: u8,        // 8    — shortlist bound (BR-S06.T05-08)
    pub prize_weight:        i32,       // 1200
    pub board_weight:        i32,       // 150
    pub concede_below:  Option<i32>,    // None — off by default (BR-S06.T05-11)
}
impl Default for RolloutParams { /* exactly the values above */ }

pub struct RolloutBot {
    params:   RolloutParams,
    profile:  Arc<Profile>,             // built once in new_game (BR-S06.T05-07)
    programs: Arc<ProgramTable>,
    me:       PlayerIdx,
    policy:   PlannerBot,               // the rollout policy, reused for both sides of every playout
    scratch:  Scratch,                  // worlds, per-action sums, Decision — cleared per decision
}

impl Bot for RolloutBot {
    fn name(&self) -> &'static str { "rollout_v1" }
    fn choose_action(&mut self, view: View<'_>, actions: &[Action], rng: &mut Rng) -> Action;
    fn answer_prompt(&mut self, view: View<'_>, prompt: &Prompt, rng: &mut Rng) -> Answer;
    fn new_game(&mut self, view: View<'_>, me: PlayerIdx);
}
impl Explains for RolloutBot { /* margin, actions_scanned, playouts, modelled */ }
```

```rust
// The core loop, stated exactly.

fn decide(&mut self, view: &PlayerView, cands: &[Cand], rng: &mut Rng) -> usize {
    if cands.len() == 1 { return 0; }
    let short = shortlist(view, &self.profile, cands, self.params.max_actions_scanned);

    // BR-S06.T05-01: one world set, shared by every candidate.
    self.scratch.worlds.clear();
    for _ in 0..self.params.playouts_per_action {
        let (g, d) = view.determinize(rng);
        self.scratch.modelled += d.opponent_modelled as u32;
        self.scratch.worlds.push(g);
    }

    for (i, c) in short.iter().enumerate() {
        let mut sum: i64 = 0;
        for w in &self.scratch.worlds {
            let mut g = w.clone();                       // S04.T03 BR-S04.T03-03
            if c.apply_to(&mut g).is_err() { continue; } // counted as a loss of value 0
            sum += playout(&mut g, self.me, &self.policy, self.params.max_depth_turns) as i64;
        }
        self.scratch.mean[i] = (sum / self.params.playouts_per_action as i64) as Value;
    }
    argmax_with_ties(&self.scratch.mean)                 // BR-S06.T05-03: no RNG draw here
}

fn playout(g: &mut Game, me: PlayerIdx, policy: &PlannerBot, max_turns: u16) -> Value {
    let start = g.turn_no;
    while g.outcome().is_none() && g.turn_no - start < max_turns {
        match g.pending_prompt() {
            Some(p) => { let a = policy.answer_for(g, p); g.answer(a).ok(); }
            None    => { let a = policy.action_for(g);    g.apply(a).ok(); }
        }
    }
    match g.outcome() { Some(o) => terminal_value(o, me), None => static_value(g, me) }
}

pub fn terminal_value(o: &Outcome, me: PlayerIdx) -> Value;   // 10_000 / 5_000 / 0
pub fn static_value(g: &Game, me: PlayerIdx) -> Value;        // the depth-cap table above
pub fn shortlist<'a>(view: &PlayerView, p: &Profile, cands: &'a [Cand], n: u8) -> SmallVec<[&'a Cand; 12]>;

pub const WIN: Value = 10_000;
pub const TIE: Value = 5_000;
pub const LOSS: Value = 0;
pub const VALUE_FLOOR: Value = 500;
pub const VALUE_CEILING: Value = 9_500;
```

`policy.action_for(&Game)` and `policy.answer_for(&Game, &Prompt)` are thin wrappers that build `PlayerView::of(g, g.current)` and call the planner — inside a playout the state is a sample the bot is entitled to see, so the view is rebuilt per decision exactly as it is in a real game ([S06.T01](T01-honest-information-view.md)). Building it is cheap by BR-S06.T01-08, and rebuilding rather than caching is what keeps a playout indistinguishable from a real game.

**Registry entry** — the shape [S06.T07](T07-bot-registry-and-freezing.md) consumes:

```rust
BotEntry {
    name: "rollout_v1",
    kind: BotKind::Rollout,
    ctor: RolloutBot::from_params,
    params_schema: include_str!("rollout.params.json"),
    source_files: &["bots/rollout.rs", "bots/planner.rs", "bots/planner/phases.rs",
                    "bots/planner/need.rs", "bots/planner/resolve.rs",
                    "bots/profile.rs", "view.rs"],
}
```

**Job params.** A pairing selects the bot by name with its params ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)):

```json
{ "name": "rollout_v1",
  "params": { "playouts_per_action": 32, "max_depth_turns": 12, "max_actions_scanned": 8 },
  "seed": 0 }
```

and the pairing's `result` line carries two extras this subtask adds: `"decisions": 71_400` and `"opponent_modelled_share": 0.81`.

## Implementation steps

1. Declare `Value`, `RolloutParams`, `RolloutBot`, `Scratch` and a `decide` that returns index 0; implement `Bot` and `new_game` building the shared `Arc<Profile>`. `cargo test -p ptcg-core rollout` green, and a bot that always takes the planner's first candidate plays 200 complete games (BR-S06.T05-07).
2. Implement `terminal_value` and `static_value` with their constants and the clamp; spec the six rows of the value table, including both empty-board bounds (BR-S06.T05-05).
3. Implement `playout` against a hand-built `Game` with the planner on both sides and the depth cap; spec that it stops at the cap, that a natural end uses `terminal_value`, and that it never reaches the step cap over 200 runs (BR-S06.T05-04, -06).
4. Implement the world set and the CRN loop; spec `> every_action_sees_the_same_worlds` with an instrumented sampler and `> pairing_reduces_the_variance_of_the_difference` against an independent-sampling control (BR-S06.T05-01).
5. Implement `shortlist` on top of the planner's own ordering; spec that the planner's choice is always present, that the recorded pair is right, and that no shortlisting happens below the bound (BR-S06.T05-08).
6. Implement `argmax_with_ties` and the `Decision` record; spec determinism over 1,000 repetitions and that no RNG draw occurs in the selection (BR-S06.T05-03).
7. Implement `answer_prompt` over candidate answers with the single-answer shortcut; run the property test over 10,000 generated prompts (BR-S06.T05-12).
8. Add the `opponent_modelled` counter, thread it into the pairing aggregator and the `result` line, and spec both ends (BR-S06.T05-09).
9. Add the import-graph and mutation policy tests, and `> a_rollout_decision_does_not_mutate_the_view` (BR-S06.T05-02, -10).
10. Benchmark `rollout_decide` at three parameter profiles (16/6, 32/8, 128/12), record `µs/decision` and the resulting games/s in `docs/PERF.md`, and restate the budget table in this file against the measured numbers (BR-S06.T05-13).
11. Run `determinism.rs > fingerprint_is_equal_at_1_and_16_workers` with `rollout_v1` on both sides, then the acceptance mirror against `planner_rs_v1` on the suite v6 lists at ≥ 400 games, recording the win rate with its Wilson CI (BR-S06.T05-03).
12. Implement `concede_below` behind its default `None` and spec both halves; write the rollout section of `engine/BOTS.md` with the algorithm table, the value scale, the measured budget and the honest statement that the opponent's hidden cards are modelled (BR-S06.T05-11).

## Edge cases and error handling

- **A determinization fails** because the unseen pile is smaller than the prize count (reachable only in a hand-built scenario, [S06.T01](T01-honest-information-view.md)) → the world is skipped, the decision proceeds with the remaining worlds, and the failure is counted; if **every** world fails, the bot returns the planner's choice and records `playouts: 0`. A rollout that cannot sample is a planner, not a crash.
- **A shortlisted action turns out to be illegal in a sampled world** → cannot normally happen, because legality is a function of the visible state and the sample matches the view on every visible fact; if it does, `apply` returns `EngineError::IllegalAction`, the sample scores `LOSS` for that action and the event is counted. A non-zero count is a defect in `determinize`, and the counter is what makes it visible.
- **Every candidate action scores identically** (all worlds end the same way regardless) → the tie-break falls to mean prize differential and then to the lower shortlist index, which is the planner's own preference order. The bot degrades gracefully into the planner rather than into a coin flip.
- **The decision is the opening hand** (`Phase::Setup`, `opening_active`) → the view has no board, `determinize` samples the whole deck, and playouts start from setup. They are the most expensive playouts of the game and the least informative; `max_depth_turns` bounds them like any other, and the measured cost per phase is reported so a future version can shortcut setup deliberately.
- **A playout hits a prompt whose `actor` is the opponent** → the playout's planner for that side answers it from *that side's* view, exactly as in a real game. The rollout bot does not answer for its opponent, which is what keeps the sample a game rather than a fantasy.
- **`max_depth_turns` is larger than the game has left** → the playout simply ends naturally and uses `terminal_value`; the cap is a ceiling, not a target. A cap of 0 is refused at construction (`EngineError` naming the field), because a rollout that plays nothing is a misconfiguration, not a fast bot.
- **The opponent's zones were modelled in every world** (nothing of theirs has been seen yet, early turn 1) → every world's opponent is drawn from the plausible-list model, the decision is close to uninformed, and `opponent_modelled_share` is 1.0 for that decision. The measurement reports the share so an early-game bias is legible; it is not corrected here, and [S06.T06](T06-ismcts-bot.md) is where a belief model would go.
- **A playout stalls** (12 turns of no material change, RN-20) → it ends with `Stall` and scores `TIE`, which is the correct value: a stalled position *is* a tie. The depth cap usually fires first, so a stalled playout is rare and is counted next to the step-cap counter.
- **The bot is used as a suite opponent** → it must be frozen first ([S06.T07](T07-bot-registry-and-freezing.md), RN-37), and its params become part of its identity: `rollout_v1` at 32 playouts and `rollout_v1` at 128 are different measurements. The measure job refuses a params override on a frozen bot ([S06.T08](T08-measurement-score-and-mirror.md)).
- **Two rollout bots in the same pairing** (a mirror) → each has its own stream from `rng::bot_rng(seed_base, game_idx, slot)` and its own `Arc<Profile>` from its own decklist; they cannot observe each other and their worlds are independent. The fingerprint test runs exactly this configuration.
- **Memory** → the world set holds `playouts_per_action` `Game`s at under 4 KB each ([S04.T03](../04-game-engine-core/T03-game-state-model.md)), so 32 worlds is about 128 KB per bot, plus one clone in flight. Two bots on 22 threads is a few megabytes, which the bench records rather than assumes.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core rollout` green, including `> every_action_sees_the_same_worlds` — an instrumented sampler records exactly `playouts_per_action` determinizations per decision regardless of the shortlist size (BR-S06.T05-01).
- [ ] `> the_same_view_and_seed_give_the_same_action` over 1,000 repetitions, and `cargo test -p ptcg-core determinism::fingerprint_is_equal_at_1_and_16_workers` with `rollout_v1` on both sides of a 200-game pairing (BR-S06.T05-03).
- [ ] `> the_value_scale_matches_the_table`, `> a_two_prize_lead_at_the_cap_scores_above_a_tie`, `> an_empty_board_at_the_cap_scores_at_the_losing_bound` (BR-S06.T05-05).
- [ ] `> a_playout_stops_at_the_depth_cap`, `> a_playout_that_ends_naturally_uses_the_terminal_value`, `> no_playout_reaches_the_step_cap` over 200 decisions (BR-S06.T05-04).
- [ ] `> a_playout_uses_the_planner_on_both_sides` and `> playouts_share_one_profile` — a profile build counter reads 1 per game at any playout count (BR-S06.T05-06, -07).
- [ ] `> a_shortlist_always_contains_the_planner_choice`, `> the_shortlist_size_is_recorded`, `> no_shortlisting_below_the_bound` (BR-S06.T05-08).
- [ ] `> every_generated_prompt_gets_a_valid_answer` over 10,000 generated prompts, and `> a_single_answer_prompt_costs_no_playouts` (BR-S06.T05-12).
- [ ] `policy.rs > rollout_constructs_no_game_of_its_own` and `> a_rollout_decision_does_not_mutate_the_view` (the serialized view is byte-identical before and after) (BR-S06.T05-02, -10).
- [ ] `> the_default_bot_never_concedes` over 500 games with zero `Concede` outcomes, and `> a_configured_threshold_concedes_a_hopeless_position` (BR-S06.T05-11).
- [ ] **Acceptance measurement.** A mirror of `rollout_v1` against `planner_rs_v1` on the suite v6 lists at ≥ 400 games per list reports a win rate whose 95 % Wilson CI excludes 50 %; the record, the CI, the parameters and the `opponent_modelled_share` are written into `engine/BOTS.md` ([S06.T08](T08-measurement-score-and-mirror.md) runs it).
- [ ] `cargo bench rollout_decide` completes at the three parameter profiles and `docs/PERF.md` gains a `rollout_v1` block with `µs/decision`, games/s and peak memory; the budget table of this file is restated against those numbers (BR-S06.T05-13).

## Risks and open questions

- **Risk — determinization bias makes the rollout optimistic.** The opponent's hidden cards are sampled from what has been seen plus Basic Energy fillers ([S06.T01](T01-honest-information-view.md)), which systematically under-weights the cards they are holding and have not played. A bot that looks ahead against a weaker imagined opponent overrates aggressive lines. Mitigation: the acceptance reading is a **mirror**, where both sides use the same model, so the bias largely cancels; `opponent_modelled_share` is reported per job; and the tree bot ([S06.T06](T06-ismcts-bot.md)) is where a belief model belongs if the mirror demands one.
- **Risk — the depth cap's static value is a second, unmeasured heuristic.** `5_000 + 1_200 × Δprizes` is a guess with a round number in it, and every decision within twelve turns of the end is decided by it. Mitigation: the weights are `RolloutParams` fields, so a change is a params change with its own measurement; a control run at `max_depth_turns = 40` (no effective cap) on a small sample tells how much the cap is deciding, and that comparison is part of step 10.
- **Risk — the bot is too slow to be useful.** If the measured `µs/decision` puts a 1,200-game mirror beyond an hour, the acceptance measurement itself becomes impractical. Mitigation: the three parameter profiles are benchmarked before the acceptance run, the defaults are chosen from the measurement rather than from this file, and the cheap profile (16 playouts, 6 actions) is the fallback stated in advance so the decision is not made under time pressure.
- **Risk — common random numbers hide a real difference.** Pairing reduces the variance of a comparison but also correlates the errors: if the world set happens to be unrepresentative, every action is wrong together and the bot is confidently wrong for that decision. Mitigation: the world set is redrawn every decision, so the correlation does not persist across a game; and `playouts_per_action` is the parameter that trades this off, measured at three values.
- **Risk — `shortlist` throws away the winning move.** Bounding the action set at 8 means a decision with 30 legal actions never evaluates 22 of them. Mitigation: the shortlist is the planner's own ordering, so the discarded actions are the ones a competent baseline already rejected, the bound is recorded per decision, and `max_actions_scanned` can be raised for a validation run at a known cost.
- **Question — should playouts be parallelised across worlds?** It is the obvious speedup and it would break BR-S06.T05-03 unless the reduction is order-independent and each world carries its own RNG. Recommendation: no, for now — the engine already saturates the machine across games, so inner parallelism would only add contention; revisit only if [S04.T18](../04-game-engine-core/T18-performance-baseline.md) shows a single job failing to use the threads.
- **Question — should the rollout reuse its world set across consecutive decisions in the same turn?** It would cut the determinization cost several-fold and keep the comparison paired within a turn. The objection is that the state has moved, so a world drawn before an action is no longer consistent with the view after it. Recommendation: redraw per decision, which is the correct thing; a "resample only the parts that changed" optimisation is a measurable change to be proposed after the first `docs/PERF.md` block exists.
- **DEPENDENCY-PROPOSAL: S06.T05 should declare an input from S04.T05 because** the playout loop calls `Game::legal_actions` and `Game::apply` directly, and `shortlist` orders `Action` values; today `Action` reaches this file only transitively through [S06.T03](T03-planner-turn-policy.md), whose own `Depends on` carries [S04.T05](../04-game-engine-core/T05-actions-and-legality.md). Adding it to this subtask's `Depends on` (and to S04.T05's `Unblocks`) would make the file self-contained; not applied here, because a dependency change is edited by hand in both files.

## References

- `pokemon/src/pokesearch/sim/pilot.py` (whole file) — verified: the pilot is a single-pass cascade with no lookahead of any kind, and `planner_policy` holds only a `memo` dict across decisions. There is no legacy counterpart to this subtask; the legacy engine was a generator advanced by `send`, so no state could be copied and no move could be tried. Consult it only for the rollout *policy* (the planner that drives every playout).
- `pokemon/ESPECIFICACAO.md` §1.4 — verified: *"IA decidindo jogada ao vivo"* is out of scope because *"uma medição na régua são ~465 mil decisões"*; §3 and §6.1 record that the third-party engine is the one that shipped the rules. The decision-count figure is the scale a lookahead bot has to live inside, and it is why the budget table above exists before the code does.
- `pokemon/src/pokesearch/sim/runner.py` — verified: `play_batch` parallelising across *games* with a `ProcessPoolExecutor`, never within a decision, and `_play_one` seeding the two policies with `seed*2+1` and `seed*2+2` separately from the engine's own seed. The across-games-only parallelism BR-S06.T05-03 keeps.
- `pokemon/benchmarks/otimizacao_dhelmise.md` and `pokemon/ESPECIFICACAO.md` §5.3 — verified: three optimizer iterations, 24 screened swaps, 3 finalists, **none confirmed**; screening gains of +2.7 to +4.6 points became −2.2 to +0.9 at confirmation. The measured cost of comparing candidates under independent noise, and the reason BR-S06.T05-01 pairs the worlds.
- [Decision log](../../project/02-decision-log.md) D-001 — verified: Rust was chosen because *"the deck optimizer needs 10–100× more games per candidate, and lookahead bots need cheap state cloning"*, and because the legacy's generator coroutines could not be cloned. This subtask is the first consumer of that decision.
- [S04.T03](../04-game-engine-core/T03-game-state-model.md) — `Game: Clone` at microsecond cost, the under-4-KB budget, `Player::deck_searched` and the no-hash-iteration rule; [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) — `rng::bot_rng`, the end reasons a playout inherits, the step cap and the index-order aggregation the fingerprint test rests on.
- [S06.T01](T01-honest-information-view.md) — `PlayerView::determinize`, `Determinization { opponent_modelled }`, the uniformity property and the honesty tests; [S06.T02](T02-deck-profile-analysis.md) — `Arc<Profile>` and BR-S06.T02-09; [S06.T03](T03-planner-turn-policy.md) and [S06.T04](T04-need-scoring-and-prompt-resolvers.md) — the policy and the resolvers every playout runs.
- [S04.T18](../04-game-engine-core/T18-performance-baseline.md) — `docs/PERF.md`, the ≥ 5,000 games/s target the budget table derives from, and the median-of-five measurement protocol the rollout block follows.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
