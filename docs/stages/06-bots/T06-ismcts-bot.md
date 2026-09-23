# S06.T06 — ISMCTS bot

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 6 / 8 |
| Depends on | [S06.T05](T05-rollout-bot.md) |
| Unblocks | — |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` rollout infrastructure (determinize, clone, playout policy) — from [S06.T05](T05-rollout-bot.md)

## Outputs (proposed)
- `module` `ptcg-core::bots::ismcts::IsmctsBot { iterations, exploration_c, determinizations }` — information-set MCTS with a fresh determinization per iteration, UCT selection over legal actions, planner playouts, prompts as tree nodes; deterministic given seed

## Initial objective
A stronger, principled lookahead bot whose strength scales with compute, used to validate final deck lists and to test how much bot skill changes the measured deck scores.

## Context

[S06.T05](T05-rollout-bot.md) evaluates every candidate action with the same effort and then throws the work away. That is wasteful twice over: it spends as many playouts on an obviously bad action as on the two that are close, and it learns nothing about what happens *after* the first move, so a line that is good on turn one and catastrophic on turn two scores well. Information Set Monte Carlo Tree Search (Cowling, Powley & Whitehouse, *Information Set Monte Carlo Tree Search*, IEEE Transactions on Computational Intelligence and AI in Games 4(2), 2012) fixes both by building a tree: effort follows promise, and the statistics accumulate along whole lines rather than on single moves.

The reason it has to be *information set* MCTS rather than plain MCTS is the same reason [S06.T01](T01-honest-information-view.md) exists. A node in a perfect-information tree is a state; here the bot does not know the state, only what it legitimately knows, so a node is an **information set** — everything consistent with the acting player's view plus the moves played since the root. Each iteration draws one concrete world from that set and descends through it; over many iterations the node's statistics average over the worlds the bot cannot distinguish. This is the single-observer variant (SO-ISMCTS) from §4.1 of the paper, and it is the right one here because the opponent's hidden cards are already an approximation ([S06.T01](T01-honest-information-view.md) BR-S06.T01-05's `opponent_modelled` flag) and a multiple-observer tree would build a second, more expensive approximation on top of the first.

One detail of ISMCTS is easy to get wrong and is the whole reason a plain UCT implementation misbehaves on hidden-information games: **the exploration term counts availability, not parent visits**. Different determinizations make different actions legal — an Ultra Ball is only playable in a world where you drew it — so an action that was legal in three iterations out of a hundred and won all three is not a 100 % move; it is a move seen three times. UCB1 is therefore computed with the number of iterations in which the action was *available* in place of the parent's visit count. The paper states it as the core correction, and it is BR-S06.T06-02 here.

Three further decisions shape this implementation.

**Prompts are nodes.** The engine suspends on a `Prompt` ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md)) and the answer is as consequential as the action that caused it — which card a search finds decides the next three turns. A tree that treats a prompt as part of the action's outcome would average over the bot's own choice, which is not a choice at all. So an edge is either an `Action` or an `Answer`, nodes alternate accordingly, and the same UCT selection applies to both. This costs nothing structurally and it is what lets the tree learn "play Ultra Ball **and then take the Dhelmise**".

**No floating point.** [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-09 bans `f32`/`f64` from `ptcg-core`, and UCB1 is a square root of a logarithm. Both become fixed-point integer functions: a 4,096-entry `ln` table in units of 1/1024 and an integer square root, with `exploration_c` expressed in hundredths (`141` ≈ √2). The correctness of that arithmetic is not obvious, so it gets its own test against a floating-point reference implementation living in the test module, where floats are allowed.

**No hash containers.** The natural implementation keys nodes by a hash of the information set. `ptcg-core` forbids `HashMap` and `HashSet` because their iteration order leaks into results ([S04.T03](../04-game-engine-core/T03-game-state-model.md) BR-S04.T03-06). The tree is therefore an arena — `Vec<Node>` with `u32` indices, children as a sorted `SmallVec<(EdgeKey, NodeIdx)>` found by binary search. That is also faster for the node sizes involved, and it makes the memory cap a simple length check.

The honest part of this subtask is its acceptance. The exit criterion is that the bot beats the rollout bot in a mirror with a confidence interval excluding 50 % **at equal wall-clock budget**, *or* that the result is documented and the bot is kept as optional. Equal wall-clock is the only fair comparison: an ISMCTS iteration costs roughly what a rollout playout costs, so comparing at equal iteration counts would silently hand one of them more compute. And the "or" is not an escape hatch — the legacy has a worked example of what happens without it. `smart_policy` was a careful rewrite that improved every play-quality metric the author measured (more attacks, less wasted energy, fewer pointless retreats) and still measured 48.3 % (CI 46.1–50.5) against the bot it was meant to beat. The comment recording that sits at the top of the module to this day, and the bot stayed registered and unused. A measured non-improvement is a result; quietly dropping it is how a project loses the ability to tell progress from noise.

The bot's other job is the one named in the Initial objective and it does not depend on winning: **measuring how much the bot matters**. Running suite v6 with the planner and then with ISMCTS answers "how much of this deck's score is the list and how much is the pilot?" — which is exactly the question RN-44's mirror reading was invented for, one level up. That result is useful whichever direction it goes, and [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md) is the consumer that cares.

## Scope

- **In scope.** `ptcg-core::bots::ismcts` with `IsmctsBot`, `IsmctsParams` and their defaults; the arena tree (`Node`, `Edge`, `EdgeKey`, `NodeIdx`) and its memory cap; the four-phase iteration (determinize, select, expand, simulate) and backpropagation; availability-counted UCB1 in fixed-point integer arithmetic (`ilog_fp`, `isqrt`) and the float-reference test; prompt nodes and the `Action`/`Answer` edge union; the robust-child final move rule; determinism given a seed; the budget caps (iterations, wall clock, nodes) and their fallbacks; the registry entry for `ismcts_v1`; the equal-wall-clock comparison protocol against `rollout_v1` and `planner_rs_v1`; the bot-skill sensitivity run.
- **Out of scope.** `determinize`, the playout loop, the value scale and the static evaluation ([S06.T05](T05-rollout-bot.md)) — all reused unchanged; the planner and its resolvers that drive every playout ([S06.T03](T03-planner-turn-policy.md), [S06.T04](T04-need-scoring-and-prompt-resolvers.md)); the honest view ([S06.T01](T01-honest-information-view.md)); the registry mechanics, `code_hash` and freezing ([S06.T07](T07-bot-registry-and-freezing.md)); the measurement job that runs the comparison ([S06.T08](T08-measurement-score-and-mirror.md)); the optimizer's use of a strong bot for final validation ([S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)); any belief model over the opponent's hand, which is named in Risks and not built here.

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask. It inherits RN-30's honesty through `determinize` ([S06.T01](T01-honest-information-view.md)) and RN-20's termination through the playout loop ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)). The rules below are local.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S06.T06-01 | One decision builds one tree and discards it; statistics are never carried across decisions. The root is the current information set, and every node below it is reached by a concrete sequence of `Action`/`Answer` edges from that root. | `IsmctsBot::decide` allocating a fresh `Arena` and truncating it at the end of the call | `ismcts.rs > a_tree_does_not_survive_a_decision` (the arena length is 1 at the start of every decision); `> the_root_is_the_current_information_set` |
| BR-S06.T06-02 | UCB1 uses **availability counts**, not parent visits: an edge's exploration term is computed over the number of iterations in which that edge was legal in the sampled world, and an edge is only a selection candidate in an iteration where it is legal. An edge never seen legal has no statistics and is expanded before any selection happens. | `select::ucb(edge)` reading `edge.available`; `Node::legal_edges(world)` filtering before selection; `edge.available += 1` for every legal edge of the visited node, whether or not it was chosen | `ismcts.rs > availability_is_incremented_for_every_legal_edge`; `> a_rarely_legal_winning_edge_does_not_dominate` (an edge legal in 3 of 100 iterations and winning all three ranks below one legal in 100 and winning 70); `> an_unavailable_edge_is_not_selectable` |
| BR-S06.T06-03 | UCB1 is computed in fixed-point integers on the `Value` scale of [S06.T05](T05-rollout-bot.md) (hundredths of a win): `ucb = mean + (c × isqrt((ln_fp(available) << 10) / visits)) >> 10`, with `c = exploration_c` in hundredths (default 141 ≈ √2 × 100), `ln_fp(n) = round(ln n × 1024)` from a 4,096-entry const table saturating at the last entry, and `isqrt` the integer square root. No `f32`/`f64` appears outside the test module. | `ismcts::ucb`, `ismcts::ln_fp`, `ismcts::isqrt`; clippy `disallowed-types` ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-09) | `ismcts.rs > ucb_matches_a_float_reference` (10,000 random `(mean, visits, available, c)` tuples agree with an `f64` reference to within 1 unit on the 0–10,000 scale); `> ln_fp_matches_the_table`; `> isqrt_is_exact`; `policy.rs > core_has_no_floating_point` |
| BR-S06.T06-04 | A decision is a pure function of `(view, params, the bot's own rng state)`: the same view with the same seed yields the same action, on any thread and in any process. Iterations are sequential; the bot never spawns and never reads the real `Game::rng`. | `decide`'s single-threaded loop; the tree is an arena of `Vec`s with no hash container | `ismcts.rs > the_same_view_and_seed_give_the_same_action` (1,000 repetitions); `determinism.rs > fingerprint_is_equal_at_1_and_16_workers` with `ismcts_v1` on both sides; `policy.rs > bots_do_not_touch_game_rng` |
| BR-S06.T06-05 | One iteration draws exactly one determinization, at the root, and descends through that single world; a world is never redrawn mid-descent. `determinizations` controls reuse: a world serves `ceil(iterations / determinizations)` consecutive iterations, and the default `determinizations = iterations` means a fresh world per iteration. | `decide`'s iteration loop calling `view.determinize` when `i % reuse == 0` | `ismcts.rs > one_determinization_per_iteration_by_default` (a sampler counter equals `iterations`); `> a_reuse_factor_of_four_draws_a_quarter_as_many_worlds`; `> a_descent_uses_one_world_throughout` |
| BR-S06.T06-06 | The tree is an arena: `Vec<Node>` addressed by `u32`, children as a `SmallVec<[(EdgeKey, NodeIdx); 8]>` kept sorted by `EdgeKey` and found by binary search. No `HashMap`, no `HashSet`, no pointer identity, and a `Node` is at most 64 bytes so the node cap is a memory bound rather than a guess. | the type definitions; `size_of::<Node>()` asserted at compile time | `ismcts.rs > a_node_fits_in_sixty_four_bytes` (`const_assert`); `> children_are_sorted_and_binary_searched`; `policy.rs > core_has_no_hash_iteration` |
| BR-S06.T06-07 | An edge is an `Action` **or** an `Answer`: a pending prompt makes the current node a prompt node whose edges are candidate answers, and the tree therefore plans a card play together with the choice inside it. The acting side of a node is recorded, so backpropagation credits the right player. | `enum EdgeKey { Act(Action), Ans(AnswerKey) }`; `Node::actor: PlayerIdx` | `ismcts.rs > a_prompt_becomes_a_node_with_answer_edges`; `> a_search_and_its_pick_are_two_edges_on_one_line`; `> backpropagation_credits_the_acting_side` |
| BR-S06.T06-08 | The returned move is the **robust child**: the root edge with the highest `visits`, ties broken by mean value and then by the lower `EdgeKey` ordering. The highest-mean edge is not used, because a mean over few visits is noise. | `decide`'s final selection | `ismcts.rs > the_move_is_the_most_visited_root_edge`; `> a_high_mean_low_visit_edge_is_not_chosen`; `> the_final_choice_draws_nothing_from_the_stream` |
| BR-S06.T06-09 | Every budget is a hard cap with a stated fallback: `iterations` (default 800), `max_nodes` (default 20,000) and `time_budget_us` (default `None`). Reaching `max_nodes` stops expansion and keeps simulating into existing nodes; reaching `time_budget_us` ends the iteration loop between iterations, never mid-descent; a decision that completes zero iterations returns the planner's choice. | the three checks in `decide`'s loop | `ismcts.rs > the_node_cap_stops_expansion_not_simulation`; `> a_time_budget_is_checked_between_iterations`; `> zero_iterations_falls_back_to_the_planner` |
| BR-S06.T06-10 | Playouts below the tree are the planner on both sides, reusing [S06.T05](T05-rollout-bot.md)'s `playout` and its value scale unchanged; the ISMCTS bot never recurses into itself and never builds a second profile. | `simulate` calling `rollout::playout` with the shared `Arc<Profile>` | `ismcts.rs > simulation_reuses_the_rollout_playout`; `> playouts_share_one_profile` (a build counter reads 1 per game) |
| BR-S06.T06-11 | The comparison against `rollout_v1` is at **equal wall clock**, not equal iterations: both bots are configured from the measured `µs/decision` in `docs/PERF.md` so that their per-decision budgets match within 5 %, and the configuration used is recorded with the result. | the comparison script's budget solver; the parameters stored in `jobs.params_json` ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)) | `docs/PERF.md` gains an `ismcts_v1` block; the measurement's `note` records both bots' parameters and their measured per-decision cost (BR-S06.T06-12) |
| BR-S06.T06-12 | The outcome of the comparison is recorded whichever way it goes. If the mirror's 95 % CI does not exclude 50 %, `ismcts_v1` stays registered and **optional** — never a suite opponent, never a default — and `engine/BOTS.md` records the measured record, the CI, the budgets and the date. The bot is not deleted and the result is not re-run until it is favourable. | `engine/BOTS.md`'s bot table; the measurement row in `measurements` ([S06.T08](T08-measurement-score-and-mirror.md)) | review: `engine/BOTS.md` contains an `ismcts_v1` row with its measured mirror record and CI; `> ismcts_is_not_a_default_bot` (the registry's default for a job with no bot named is `heuristic`) |

## Data operations

The engine never opens the database. The table below is the **algorithm table**: one decision, step by step, with the budget each step is allowed. Steps 3–7 are one iteration and run `iterations` times.

| Step | Operation | Budget | Notes |
|---|---|---|---|
| 1 | Clear the arena; push the root node for the current information set, with `actor = me` | O(1) | BR-S06.T06-01 |
| 2 | If the decision has a single candidate, return it | O(1) | no tree for a forced move |
| 3 | **Determinize.** Every `reuse` iterations, `world = view.determinize(&mut rng)`; otherwise reuse the current world. Count `opponent_modelled` | ≈ 20 µs per draw (to verify) | BR-S06.T06-05; the counter feeds [S06.T05](T05-rollout-bot.md) BR-S06.T05-09's reporting |
| 4 | **Select.** `g = world.clone()`; from the root, while the node is fully expanded in this world, take the legal edge maximising `ucb`, apply it to `g`, descend. Increment `available` on **every** legal edge of each visited node | depth ≤ tree depth; one clone ≈ µs ([S04.T03](../04-game-engine-core/T03-game-state-model.md)) | BR-S06.T06-02, -03 |
| 5 | **Expand.** At the first node with a legal edge that has no child, create one child (the lowest unexpanded `EdgeKey`) and apply that edge to `g`. Skip when `arena.len() >= max_nodes` | one node ≤ 64 bytes | BR-S06.T06-06, -09 |
| 6 | **Simulate.** `rollout::playout(&mut g, me, &planner, max_depth_turns)` | ≈ 100 µs (to verify) | BR-S06.T06-10; the value scale is [S06.T05](T05-rollout-bot.md)'s |
| 7 | **Backpropagate.** Walk the visited path to the root: `visits += 1`, `value_sum += v` where `v` is the value **from the acting side of that node's parent**, so a node the opponent acts at accumulates `10_000 - v` | depth writes | BR-S06.T06-07 |
| 8 | After the loop, pick the root edge with the highest `visits`; ties by mean, then by `EdgeKey` order | O(root children) | BR-S06.T06-08 |
| 9 | Record `Decision { best, second, margin, iterations, nodes, modelled }` | O(1) | read by the driver through `Explains` ([S06.T04](T04-need-scoring-and-prompt-resolvers.md) BR-S06.T04-07) |
| 10 | If zero iterations completed, return the planner's choice | O(1) | BR-S06.T06-09 |

**Budget arithmetic**, derived from [S06.T05](T05-rollout-bot.md)'s table and the ≥ 5,000 games/s target of [S04.T18](../04-game-engine-core/T18-performance-baseline.md). Every figure is a derivation until step 10 of the implementation replaces it with a measurement.

| Quantity | Derivation | Value |
|---|---|---|
| one iteration | one determinization (amortised) + one clone + one depth-capped playout | ≈ 100–120 µs |
| one decision at 800 iterations | 800 × 110 µs | ≈ 88 ms |
| the equal-wall-clock rollout configuration | `rollout_v1` at `playouts_per_action × max_actions_scanned ≈ 800` playouts | ≈ 88 ms |
| one game, ISMCTS on one side | ≈ 60 decisions × 88 ms | ≈ 5.3 s |
| 400-game mirror, both sides ISMCTS | 400 × 10.6 s ÷ 22 threads | ≈ 3.2 min |
| tree size at 800 iterations | ≤ 800 expansions, one node each | ≤ 800 nodes ≈ 51 KB |
| `max_nodes` headroom | 20,000 × 64 B | ≈ 1.3 MB per decision |

**Value and credit.** The value scale is [S06.T05](T05-rollout-bot.md)'s unchanged — `WIN = 10_000`, `TIE = 5_000`, `LOSS = 0`, depth-capped positions by `static_value` — and a node stores `value_sum: i64` plus `visits: u32`, so `mean = (value_sum / visits) as i32`. Credit is assigned by the node's `actor`: an edge leaving a node where the opponent acts accumulates `WIN - v`, which is the standard negamax convention written once rather than at every call site.

## Interfaces

```rust
// ptcg-core::bots::ismcts

pub type NodeIdx = u32;

/// An edge is a move OR a prompt answer (BR-S06.T06-07).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum EdgeKey { Act(Action), Ans(AnswerKey) }

#[derive(Debug, Clone, Copy)]
pub struct Edge {
    pub key:       EdgeKey,
    pub child:     Option<NodeIdx>,   // None until expanded
    pub visits:    u32,
    pub available: u32,               // iterations in which this edge was legal (BR-S06.T06-02)
    pub value_sum: i64,               // on the Value scale of S06.T05
}

#[derive(Debug, Clone)]
pub struct Node {                      // ≤ 64 bytes (BR-S06.T06-06)
    pub actor:  PlayerIdx,
    pub visits: u32,
    pub edges:  SmallVec<[Edge; 8]>,   // sorted by EdgeKey; binary searched
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct IsmctsParams {
    pub iterations:      u32,          // 800   — tree iterations per decision
    pub exploration_c:   i32,          // 141   — hundredths; 141 ≈ √2 × 100 (BR-S06.T06-03)
    pub determinizations: u32,         // 800   — == iterations: a fresh world per iteration
    pub max_depth_turns: u16,          // 12    — passed through to rollout::playout
    pub max_nodes:       u32,          // 20_000
    pub time_budget_us:  Option<u32>,  // None  — wall-clock cap, checked between iterations
}
impl Default for IsmctsParams { /* exactly the values above */ }

pub struct IsmctsBot {
    params:   IsmctsParams,
    profile:  Arc<Profile>,
    programs: Arc<ProgramTable>,
    me:       PlayerIdx,
    policy:   PlannerBot,              // drives every playout, both sides (BR-S06.T06-10)
    arena:    Vec<Node>,               // cleared at the start of each decision
    path:     SmallVec<[(NodeIdx, u8); 32]>,
    scratch:  Decision,
}

impl Bot for IsmctsBot {
    fn name(&self) -> &'static str { "ismcts_v1" }
    fn choose_action(&mut self, view: View<'_>, actions: &[Action], rng: &mut Rng) -> Action;
    fn answer_prompt(&mut self, view: View<'_>, prompt: &Prompt, rng: &mut Rng) -> Answer;
    fn new_game(&mut self, view: View<'_>, me: PlayerIdx);
}
impl Explains for IsmctsBot { /* margin, iterations, nodes, modelled */ }
```

**Fixed-point UCB1** (BR-S06.T06-03). `mean` and the returned score are on the 0–10,000 `Value` scale.

```rust
/// round(ln(n) * 1024) for n in 1..=4096; index 0 is unused, values saturate at LN_FP[4096].
const LN_FP: [u16; 4097] = /* generated by build.rs from an exact rational computation */;

pub fn ln_fp(n: u32) -> u32 { LN_FP[n.clamp(1, 4096) as usize] as u32 }
pub fn isqrt(n: u64) -> u64;                       // Newton, exact floor

pub fn ucb(e: &Edge, c: i32) -> i32 {
    if e.visits == 0 { return i32::MAX; }          // an unvisited legal edge is taken first
    let mean  = (e.value_sum / e.visits as i64) as i32;
    let ratio = ((ln_fp(e.available) as u64) << 10) / e.visits as u64;
    let bonus = ((c as i64 * isqrt(ratio) as i64) >> 10) as i32;
    mean + bonus
}
```

The shift pair is what keeps the units honest: `ln_fp` is in 1/1024, the extra `<< 10` makes `isqrt` return 1/1024 of `sqrt(ln/visits)`, and the final `>> 10` returns to whole units, so `c = 141` on the 0–10,000 scale is `1.41` in the textbook formula's units of "one win". `ucb_matches_a_float_reference` is the test that this paragraph is true.

**One iteration**, stated exactly:

```rust
fn iterate(&mut self, view: &PlayerView, world: &Game) {
    let mut g = world.clone();
    self.path.clear();
    let mut node = 0u32;

    // 4 — select
    loop {
        let legal = self.legal_edge_indices(node, &g);
        if legal.is_empty() { break; }
        for &i in &legal { self.arena[node as usize].edges[i as usize].available += 1; }
        match legal.iter().find(|&&i| self.arena[node as usize].edges[i as usize].child.is_none()) {
            Some(&i) => { self.path.push((node, i)); self.step(&mut g, node, i); node = self.expand(node, i, &g); break; }
            None => {
                let i = legal.iter().copied()
                    .max_by_key(|&i| ucb(&self.arena[node as usize].edges[i as usize], self.params.exploration_c))
                    .unwrap();
                self.path.push((node, i));
                self.step(&mut g, node, i);
                node = self.arena[node as usize].edges[i as usize].child.unwrap();
            }
        }
        if g.outcome().is_some() { break; }
    }

    // 6 — simulate, 7 — backpropagate
    let v = rollout::playout(&mut g, self.me, &self.policy, self.params.max_depth_turns);
    for &(n, i) in self.path.iter().rev() {
        let e = &mut self.arena[n as usize].edges[i as usize];
        e.visits += 1;
        e.value_sum += if self.arena[n as usize].actor == self.me { v as i64 }
                       else { (rollout::WIN - v) as i64 };
        self.arena[n as usize].visits += 1;
    }
}
```

`legal_edge_indices` rebuilds the node's edge list the first time it is visited — from `g.legal_actions()` when no prompt is pending, from the prompt's candidate answers otherwise ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md)) — and thereafter filters the stored edges against the current world. `step` applies an `Act` with `Game::apply` and an `Ans` with `Game::answer`.

**Registry entry** — the shape [S06.T07](T07-bot-registry-and-freezing.md) consumes:

```rust
BotEntry {
    name: "ismcts_v1",
    kind: BotKind::Ismcts,
    ctor: IsmctsBot::from_params,
    params_schema: include_str!("ismcts.params.json"),
    source_files: &["bots/ismcts.rs", "bots/rollout.rs", "bots/planner.rs",
                    "bots/planner/phases.rs", "bots/planner/need.rs",
                    "bots/planner/resolve.rs", "bots/profile.rs", "view.rs"],
}
```

**Job params.** A pairing names the bot and its budget ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)):

```json
{ "name": "ismcts_v1",
  "params": { "iterations": 800, "exploration_c": 141, "determinizations": 800,
              "max_depth_turns": 12, "max_nodes": 20000 },
  "seed": 0 }
```

**Comparison protocol** (BR-S06.T06-11). Three pairings, each mirrored on the suite v6 lists, each recorded with its measured per-decision cost:

| Pairing | Budget rule | Reported |
|---|---|---|
| `ismcts_v1` vs `rollout_v1` | equal `µs/decision` within 5 %, solved from `docs/PERF.md` | win rate, Wilson CI, µs/decision of both, iterations and playouts used |
| `ismcts_v1` vs `planner_rs_v1` | ISMCTS at its default budget; the planner has none | win rate, Wilson CI, µs/decision |
| `ismcts_v1` at 200 / 800 / 3,200 iterations vs `planner_rs_v1` | three budgets | the scaling curve — does strength rise with compute? |

The third row is the one that tells whether the implementation is correct independently of whether it beats the rollout bot: an ISMCTS whose win rate does not rise with iterations has a bug, and that diagnosis is available even when the headline comparison is a draw.

## Implementation steps

1. Declare `EdgeKey`, `Edge`, `Node`, `IsmctsParams` and `IsmctsBot`; implement `Bot` with a `decide` that returns the planner's choice, and `new_game` sharing the `Arc<Profile>`. `cargo test -p ptcg-core ismcts` green and 200 complete games (BR-S06.T06-10).
2. Generate `LN_FP` in `build.rs` from an exact rational computation and implement `isqrt`; spec both against reference values, including the saturation at 4,096 (BR-S06.T06-03).
3. Implement `ucb` and the float-reference test over 10,000 random tuples; this is the step that either validates the fixed-point arithmetic or sends it back (BR-S06.T06-03).
4. Implement the arena, `legal_edge_indices` and the sorted-children binary search; add the `const_assert` on `size_of::<Node>()` and the policy test for hash containers (BR-S06.T06-06).
5. Implement selection with availability increments and expansion of the lowest unexpanded edge; spec `> availability_is_incremented_for_every_legal_edge` and `> a_rarely_legal_winning_edge_does_not_dominate` (BR-S06.T06-02).
6. Implement simulation through `rollout::playout` and backpropagation with the actor-credit rule; spec `> backpropagation_credits_the_acting_side` on a two-ply hand-built tree (BR-S06.T06-07, -10).
7. Implement the determinization loop with the `reuse` factor and its counter; spec the default and a reuse factor of four (BR-S06.T06-05).
8. Implement prompt nodes: when `g.pending_prompt()` is `Some`, the node's edges are the prompt's candidate answers; spec `> a_prompt_becomes_a_node_with_answer_edges` and `> a_search_and_its_pick_are_two_edges_on_one_line` (BR-S06.T06-07).
9. Implement the three budget caps with their fallbacks and the robust-child final rule; spec all five behaviours (BR-S06.T06-08, -09).
10. Benchmark `ismcts_decide` at 200 / 800 / 3,200 iterations, record `µs/decision`, nodes and peak memory in `docs/PERF.md`, and solve the equal-wall-clock `rollout_v1` configuration from the two blocks (BR-S06.T06-11).
11. Run `determinism.rs > fingerprint_is_equal_at_1_and_16_workers` with `ismcts_v1` on both sides, then the three comparison pairings of the protocol table through [S06.T08](T08-measurement-score-and-mirror.md) (BR-S06.T06-04, -11).
12. Write the result into `engine/BOTS.md` whichever way it went — the record, the CI, both budgets, the scaling curve and the date — and mark the bot `optional` if the mirror CI does not exclude 50 % (BR-S06.T06-12).

## Edge cases and error handling

- **An edge legal in only a handful of iterations wins all of them.** This is the failure a plain UCT implementation exhibits on hidden-information games: the mean is 100 % and the exploration term is computed against a parent visit count that has nothing to do with this edge. Availability counting fixes it, and `> a_rarely_legal_winning_edge_does_not_dominate` is the regression test written before the code.
- **An edge that was legal when expanded is illegal in the current world** (the card was in the hand in the previous determinization and is in the deck in this one) → it is filtered out of `legal_edge_indices` for this iteration, its `available` is not incremented, and its stored statistics are untouched. Its child node stays in the arena and is reachable again in a world where the edge is legal.
- **A node has no legal edge in the sampled world** → the descent stops there and simulation runs from that position. This is legitimate and not an error; the engine always offers at least `EndTurn` during a turn ([S04.T05](../04-game-engine-core/T05-actions-and-legality.md) BR-S04.T05-09), so it occurs only at terminal nodes and at prompt nodes whose answer set is world-dependent.
- **`max_nodes` is reached early in a long game** → expansion stops and iterations continue as pure simulations into the existing tree, which still refines the root statistics. The decision is recorded with `nodes: max_nodes` so a run that is silently budget-bound is legible in the log rather than being mistaken for a strength result.
- **The determinization fails** (the unseen pile is smaller than the prize count, reachable in a hand-built scenario, [S06.T01](T01-honest-information-view.md)) → the iteration is skipped and counted; if every iteration fails, the decision falls back to the planner and records `iterations: 0`, exactly as [S06.T05](T05-rollout-bot.md) does.
- **Two root edges finish with identical visit counts** → the tie breaks by mean value, then by `EdgeKey`'s derived ordering, which follows the `Action` enum's declaration order and then its fields. No RNG is drawn, so the choice is reproducible; `> the_final_choice_draws_nothing_from_the_stream` asserts it.
- **A prompt with a single valid answer** → `answer_prompt` returns it without building a tree, the same shortcut [S06.T05](T05-rollout-bot.md) BR-S06.T05-12 takes. Building an 800-iteration tree to confirm a forced answer is the most expensive way to do nothing.
- **A prompt whose `actor` is the opponent, encountered inside the tree** → the node records `actor = opponent`, its edges are that side's candidate answers, and backpropagation credits `WIN - v` there. The bot is modelling the opponent's choice, which is what a tree is for; it is not *answering* for them in the real game, where the driver routes by `actor` ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-02).
- **`exploration_c = 0`** → pure exploitation; legal and occasionally useful as a diagnostic, and the scaling run reports it as a control. `exploration_c` below zero is refused at construction with an `EngineError` naming the field, because a negative exploration term would invert the search.
- **`iterations = 0`** → the decision falls straight through to the planner's choice and records it. This makes `ismcts_v1` at zero iterations exactly `planner_rs_v1`, which is a useful sanity anchor for the scaling curve and is asserted as such.
- **The comparison is a draw.** The CI includes 50 %, and BR-S06.T06-12 applies: the row goes into `engine/BOTS.md` with the measured numbers and the bot stays optional. It is not re-run with a different seed until it wins; the legacy's `smart_policy` comment is the standing example of the alternative, and it is the honest one.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core ismcts` green, including `> ucb_matches_a_float_reference` — 10,000 random `(mean, visits, available, c)` tuples where the fixed-point `ucb` and an `f64` reference agree to within 1 unit on the 0–10,000 scale (BR-S06.T06-03).
- [ ] `> availability_is_incremented_for_every_legal_edge`, `> a_rarely_legal_winning_edge_does_not_dominate` (3-of-100 legal and winning ranks below 100-of-100 at 70 %), `> an_unavailable_edge_is_not_selectable` (BR-S06.T06-02).
- [ ] `> one_determinization_per_iteration_by_default` (the sampler counter equals `iterations`), `> a_reuse_factor_of_four_draws_a_quarter_as_many_worlds`, `> a_descent_uses_one_world_throughout` (BR-S06.T06-05).
- [ ] `> a_prompt_becomes_a_node_with_answer_edges`, `> a_search_and_its_pick_are_two_edges_on_one_line`, `> backpropagation_credits_the_acting_side` (BR-S06.T06-07).
- [ ] `> the_move_is_the_most_visited_root_edge`, `> a_high_mean_low_visit_edge_is_not_chosen`, `> the_final_choice_draws_nothing_from_the_stream` (BR-S06.T06-08).
- [ ] `> the_node_cap_stops_expansion_not_simulation`, `> a_time_budget_is_checked_between_iterations`, `> zero_iterations_falls_back_to_the_planner` and equals `planner_rs_v1`'s choice on 1,000 states (BR-S06.T06-09).
- [ ] `> the_same_view_and_seed_give_the_same_action` over 1,000 repetitions, and `cargo test -p ptcg-core determinism::fingerprint_is_equal_at_1_and_16_workers` with `ismcts_v1` on both sides of a 200-game pairing (BR-S06.T06-04).
- [ ] `> a_node_fits_in_sixty_four_bytes` (`const_assert`), `> children_are_sorted_and_binary_searched`, `policy.rs > core_has_no_hash_iteration` and `> core_has_no_floating_point` (BR-S06.T06-03, -06).
- [ ] `cargo bench ismcts_decide` at 200 / 800 / 3,200 iterations completes, and `docs/PERF.md` gains an `ismcts_v1` block with `µs/decision`, nodes and peak memory at each (BR-S06.T06-11).
- [ ] **Scaling check.** `ismcts_v1` at 200, 800 and 3,200 iterations against `planner_rs_v1`, mirrored on the suite v6 lists at ≥ 400 games each: the win rate is monotonically non-decreasing across the three budgets and the 3,200-iteration CI excludes the 200-iteration point estimate. A flat or falling curve is a defect, not a result (BR-S06.T06-11).
- [ ] **Headline comparison.** `ismcts_v1` against `rollout_v1`, mirrored, at equal wall clock within 5 %, at ≥ 400 games: either the 95 % Wilson CI excludes 50 %, **or** the record, the CI, both configurations and the date are written into `engine/BOTS.md` and the bot is marked optional and is not a suite opponent (BR-S06.T06-11, -12).

## Risks and open questions

- **Risk — the tree inherits the determinization bias and amplifies it.** Every world's opponent is drawn from the plausible-list model ([S06.T01](T01-honest-information-view.md)), and a tree that searches deeper into a systematically weak imagined opponent can be *worse* than a shallow rollout, not better. This is the most likely explanation if the headline comparison comes back flat. Mitigation: the comparison is a mirror, where both sides share the model; the scaling curve separates "the search is broken" from "the search is searching a wrong game"; and a belief model over the opponent's hand is named here as the next lever rather than being built speculatively.
- **Risk — prompt nodes explode the branching factor.** A `ChooseCards` prompt with ten candidate groups and `max: 3` has many candidate answers, and enumerating them as edges would swamp the tree. Mitigation: the edge set for a prompt node is the **shortlisted** answers from [S06.T04](T04-need-scoring-and-prompt-resolvers.md)'s scoring, bounded exactly as [S06.T05](T05-rollout-bot.md) BR-S06.T05-08 bounds actions, and the bound is recorded per decision. Widening it is a params change with a measurement.
- **Risk — the fixed-point UCB1 is subtly wrong in a way the reference test misses.** The reference test compares the formula, not the search; an error in the units would still produce a monotone, plausible-looking bot. Mitigation: the scaling run is the independent check — a UCB1 whose exploration term is off by a factor of 1,024 does not gain strength with iterations — and `exploration_c = 0` as a control isolates the bonus term entirely.
- **Risk — the bot is too slow for the job it was built for.** At the derived ≈ 5.3 s per game, even a 400-game validation run costs minutes, and [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)'s holdout acceptance may not be able to afford it. Mitigation: the measured `docs/PERF.md` block exists before any consumer plans around it, `time_budget_us` gives a hard wall-clock knob, and the bot is explicitly not on the optimizer's hot path.
- **Risk — one tree per decision throws away most of the work.** After the bot moves, the subtree under the chosen edge is still valid for the next decision, and discarding it costs a large constant factor. Mitigation: none taken, deliberately. The opponent's hidden move between the two decisions changes the information set in ways the stored statistics no longer describe, and a wrong reuse is far more expensive than a slow correct one. Revisit only with a measurement.
- **Question — should the tree be SO-ISMCTS or MO-ISMCTS?** The multiple-observer variant keeps a separate tree per player and models the opponent's own information set, which is the theoretically right thing for a game where bluffing matters. Recommendation: single-observer, as implemented here — the opponent model is already the dominant approximation, and a second tree would double the cost to refine the smaller error. Record the choice in `engine/BOTS.md` so a future revision is a decision rather than a discovery.
- **Question — should `ismcts_v1` ever become a suite opponent?** RN-43 ([S06.T07](T07-bot-registry-and-freezing.md)) would make it the ruler for the next suite once it is frozen, and a ruler that takes 5 s per game makes every future measurement expensive. Recommendation: no — suite opponents stay in the planner family, and ISMCTS is used for validation and for the bot-skill sensitivity question. The user decides if that ever changes; it would be a new suite version either way (RN-41).

## References

- Cowling, P. I., Powley, E. J. and Whitehouse, D., *Information Set Monte Carlo Tree Search*, IEEE Transactions on Computational Intelligence and AI in Games 4(2), 2012, pp. 120–143 — the algorithm this subtask implements. §4.1 defines SO-ISMCTS; §4.1.1 states the availability-count correction to UCB1 that BR-S06.T06-02 enforces; §5 reports the empirical behaviour on card games with hidden hands.
- `pokemon/src/pokesearch/sim/policies.py` L192–205 — verified: the `smart_policy` header comment recording a careful rewrite that improved every play-quality metric the author tracked (attacks 5.65 vs 5.15, wasted energy 0.25 vs 0.36, pointless retreats 0.49 vs 1.06) and still measured **48.3 % over 2,000 mirrored games, CI 46.1–50.5**, i.e. not better; and the closing line *"Fica registrada para iteração futura. Trocar o padrão exige um teste que exclua 50% do intervalo."* The standing example behind BR-S06.T06-12 and the source of the "CI excluding 50 %" bar.
- `pokemon/benchmarks/HISTORICO.md` — verified: `planner v10`, a plausible retune proposed by an AI reviewer, measured 73.4 % against v9's 74.3 % on suite v3 and is recorded as *"REJEITADA … revertida: a régua não sustentou"*. A rejected change kept in the history rather than deleted, which is the discipline BR-S06.T06-12 applies to this bot.
- `pokemon/ESPECIFICACAO.md` §1.4 — verified: live AI decision-making is out of scope because *"uma medição na régua são ~465 mil decisões"*. The scale any per-decision search budget has to survive, and the reason the budget table precedes the code.
- [S06.T05](T05-rollout-bot.md) — `determinize` usage, `rollout::playout`, the `Value` scale (`WIN`/`TIE`/`LOSS`, `static_value`), the shortlist bound, the no-inner-parallelism rule and the `docs/PERF.md` block this subtask's budgets are solved against.
- [S06.T01](T01-honest-information-view.md) — `PlayerView::determinize`, `Determinization { opponent_modelled }` and the honesty guarantee every iteration rests on; [S06.T03](T03-planner-turn-policy.md) and [S06.T04](T04-need-scoring-and-prompt-resolvers.md) — the playout policy and the answer shortlisting the prompt nodes reuse.
- [S04.T03](../04-game-engine-core/T03-game-state-model.md) — cheap `Clone`, the under-4-KB `Game` budget and BR-S04.T03-06's ban on hash iteration that the arena satisfies; [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) — `Prompt`, `Answer` and the `actor` routing that prompt nodes model; [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) — `bot_rng`, the fingerprint equality at 1 and 16 workers and BR-S04.T10-09's ban on floating point.
- [S04.T18](../04-game-engine-core/T18-performance-baseline.md) — `docs/PERF.md`, the median-of-five protocol and the ≥ 5,000 games/s target the budget table derives from; [S06.T08](T08-measurement-score-and-mirror.md) — the measure job that runs the three comparison pairings and stores their CIs.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
