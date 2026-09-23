# S06.T02 — Deck profile analysis

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 2 / 8 |
| Depends on | [S04.T02](../04-game-engine-core/T02-card-definition-model.md), [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md) |
| Unblocks | [S06.T03](T03-planner-turn-policy.md), [S06.T05](T05-rollout-bot.md) |
| Parallel with | [S06.T01](T01-honest-information-view.md), [S06.T07](T07-bot-registry-and-freezing.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` `CardDef` (attacks, costs, stages, evolves_from, tags) — from [S04.T02](../04-game-engine-core/T02-card-definition-model.md)
- `contract` IR attack fields (`plus_when`, `nothing_unless`, `plus_per`) to read goals — from [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md)
- `doc` ESPECIFICACAO.md RN-31

## Outputs (proposed)
- `module` `ptcg-core::bots::profile::Profile` — from a decklist: `power[def]` = (nominal damage of best attack, cost, scaling counter) ranked by `dmg / (cost + 1.5)`; `main` attacker weighted by copies; `main_line` (Basic → … → top); `support` (ability Pokémon outside the line); `attackers` (≥ 60 nominal); `goal` read from the main attack's conditions (e.g. 'get 4 named cards into the discard'); `is_fodder(def)`, `goal_pending(view)` — consumed by [S06.T03](T03-planner-turn-policy.md)

## Initial objective
The bot understands its own deck before the first turn — who attacks, what has to be set up, what the deck is trying to achieve — so decisions serve a plan instead of local greed.

## Context

This is the subtask that turns "pick the card with the highest HP" into "pick the piece the plan is missing". It is also the single largest measured jump the legacy bots ever made: `HISTORICO.md` records the heuristic bot at 52.7 % on suite v1 and the first planner — the one that knew its own list and its main attacker — at 81.2 %, with loss-by-deck-out falling from 32.8 % to 10.5 % in the same step. The later 57.3 % on the user's Dhelmise list came from one further idea in this module, the deck **goal**, which took that suite from 36.5 % to 57.3 % on its own.

The legacy's `Profile` is three inferences over the player's own 60 cards, and all three are reproduced here.

**Who attacks.** `_nominal_power(card)` reads every attack and scores it `dmg / (cost + 1.5)`, where `dmg` is the printed damage plus what the attack's recipe adds at *nominal* board values — a table of four constants, `hand_self = 7`, `bench_self = 4`, `bench_both = 8`, `bench_opponent = 4`, standing in for "a typical board" before the game has one. The `+1.5` in the denominator keeps a free 30-damage attack from outranking a four-energy 250. The main attacker is then the highest-ranked *top of line* — a card nothing in the deck evolves into — weighted by `min(copies, 3)`, so a one-of bomb does not displace the four-of the deck is actually built around.

**What has to be set up.** `main_line` walks the `evolves_from` chain downward through the cards the deck itself contains, producing `[Basic, …, top]`. Support Pokémon are those with an ability that are not in the main line, and each gets its own line, because putting a support Basic down early is worth a bench slot and putting its evolution down is worth a turn.

**What the deck is trying to achieve.** This is the piece with the largest measured effect and the one that has to be re-expressed rather than ported. In the legacy a `goal` was a `(kind, filter, n)` triple hanging off a Python callable attached to the main attack's `plus_when` or `nothing_unless`. Dhelmise's "Vengeful Anchor" needs four Hide 'n' Sneak cards in the discard before its +140 applies; once the pilot read that, it started feeding the discard on purpose and the suite went from 36.5 % to 57.3 %. Here the attack condition is not a callable but an IR `Cond` ([S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md)), which means the goal can be *read* rather than annotated: a `cmp` whose left side is a `count` over a zone and whose relation is `ge` against an `int` is, structurally, "get N cards matching this filter into that zone". That is the whole pattern, and it generalises past Dhelmise — any "if you have N of X in your discard / lost zone / bench" attack becomes a goal the planner can serve, with no bot change when a new card arrives.

Two constraints shape the design. First, the profile reads **`CardDef` and the program's attack fields, never card names**: the moment a bot special-cases a name, a new set breaks it and the measurement silently changes meaning. Second, it is computed **once per game** in `Bot::new_game` ([S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md)) from the decklist alone, so it costs nothing per decision and is identical for every determinized copy in a rollout — which is what keeps [S06.T05](T05-rollout-bot.md) reproducible.

## Scope

- **In scope.** `ptcg-core::bots::profile` with `Profile`, `NominalPower`, `Goal` and `Line`; `nominal_power(def, programs)`; the top-of-line and main-attacker selection; the evolution-line walk over the deck's own definitions; the support set and support lines; the `attackers` list; goal extraction from the main attack's `nothing_unless` / `plus_when` conditions; `goal_pending(view)`, `goal_progress(view)`, `is_fodder(def)`; the nominal-value table and its justification; the three-archetype test fixture.
- **Out of scope.** Using any of it to choose an action ([S06.T03](T03-planner-turn-policy.md)); the `need` value function and prompt answers ([S06.T04](T04-need-scoring-and-prompt-resolvers.md)); the honest view ([S06.T01](T01-honest-information-view.md)) — the profile takes a decklist, not a view, and only its `goal_pending`/`goal_progress` queries take one; attack-damage estimation during play, which is [S06.T03](T03-planner-turn-policy.md)'s `attack_value` and uses the real board rather than nominal values; the IR vocabulary itself ([S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md)); deriving `CardDef` ([S04.T02](../04-game-engine-core/T02-card-definition-model.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-31 | **Kept, read from data.** The bot infers from its own 60 cards: the main attacker (the top-of-line definition maximising `nominal_damage / (cost + 1.5) × min(copies, 3)`), its evolution line, the support Pokémon and their lines, the list of attackers (nominal damage ≥ 60), and the deck's goal — read from the main attack's `nothing_unless` or `plus_when` condition when that condition has the shape "at least N cards matching F in zone Z". | `Profile::of(defs, counts, programs)` in `ptcg-core::bots::profile` | `profile.rs > three_archetypes` — Dragapult, Gardevoir and the user's Dhelmise list each yield the expected `main`, `main_line` and `goal` (RN-31); `> the_goal_is_read_from_the_condition_not_from_a_name` (renaming every card leaves the goal unchanged) |
| BR-S06.T02-01 | `Profile::of` reads only `CardDef`s, their copy counts and the composed programs of their attacks and abilities. It never reads a card name, a `card_id`, a set code or the game state. | the signature takes `&[CardDef]`, `&Multiset`, `&ProgramTable`; a policy test scans the module for `name` comparisons | `policy.rs > profile_does_not_branch_on_card_names`; `profile.rs > renaming_every_def_changes_nothing` |
| BR-S06.T02-02 | `nominal_power(def)` returns `(damage, cost, scale)` for the attack maximising `damage / (cost + 1.5)`, where `damage` is the printed value plus the attack-field bonuses evaluated at the nominal board table, halved when the attack is `coin_or_nothing`, and `scale` names the `Value` kind the attack scales with (or `None`). Arithmetic is integer: the ratio is compared as `d1 * (c2*2 + 3) > d2 * (c1*2 + 3)`. | `profile::nominal_power`; no `f32`/`f64` in `ptcg-core` ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-09) | `profile.rs > nominal_power_matches_the_table` (one case per attack-field kind); `> a_free_30_does_not_outrank_a_four_energy_250`; `> coin_or_nothing_halves_the_nominal` |
| BR-S06.T02-03 | The main attacker is chosen among **tops of line only** — definitions that no other definition in the deck evolves into — and ties are broken by copies, then by the lower `DefIdx`, so the choice is deterministic. | `Profile::of`'s `tops` filter and its total ordering | `profile.rs > an_evolution_target_is_never_the_main_attacker`; `> the_main_attacker_is_deterministic_under_ties` |
| BR-S06.T02-04 | `main_line` is `[Basic, …, top]` built by walking `evolves_from` **through the definitions the deck contains**; a missing middle stage truncates the line at that point and sets `line_incomplete = true` rather than inventing a stage. | `Profile::line(top)` with a visited set and a depth cap of 3 | `profile.rs > a_stage2_line_is_basic_stage1_stage2`; `> a_deck_without_the_stage1_gets_a_truncated_line_and_the_flag`; `> a_cyclic_evolves_from_terminates` |
| BR-S06.T02-05 | `support` is the set of definitions with at least one ability that are not in `main_line`; `support_lines` maps each support top of line to its own line. A support Pokémon that is also an attacker appears in both sets. | `Profile::of`'s support pass, reading `CardDef::abilities` | `profile.rs > an_ability_pokemon_outside_the_line_is_support`; `> a_support_evolution_line_is_walked_too` |
| BR-S06.T02-06 | A `Goal { zone, filter, n }` is extracted only from a `Cond` of the exact shape `cmp { left: count { zone, of: owner, filter }, rel: ge, right: int n }`, taken from the main attack's `nothing_unless` first and its `plus_when` second. Anything else yields `goal = None`; the profile never guesses. | `profile::goal_from(cond)` with an exhaustive `match` and no fallback | `profile.rs > the_dhelmise_condition_yields_goal_discard_4`; `> a_condition_of_another_shape_yields_none`; `> nothing_unless_wins_over_plus_when` |
| BR-S06.T02-07 | `goal_pending(view)` is true when the goal exists and the count of matching cards in the goal's zone is below `n`; `goal_progress(view)` returns `(have, n)`. Both read the honest view ([S06.T01](T01-honest-information-view.md)) and nothing else. | `Profile::goal_pending(&PlayerView)` | `profile.rs > goal_pending_is_false_once_four_are_in_the_discard`; `> goal_progress_reports_have_and_n` |
| BR-S06.T02-08 | `is_fodder(def)` is true when a goal exists, the definition matches the goal's filter, and the definition is **not** in `main_line` — a piece of the main line is never fodder, however well it matches. | `Profile::is_fodder` | `profile.rs > a_main_line_card_matching_the_filter_is_not_fodder` (the legacy's own guard); `> a_spare_matching_card_is_fodder` |
| BR-S06.T02-09 | The profile is computed once per game in `Bot::new_game` and is immutable afterwards; every determinized copy inside a rollout reuses the same `Arc<Profile>`, so a playout cannot perturb it. | `Profile` has no `&mut self` method; the bots hold `Arc<Profile>` | `profile.rs > profile_has_no_mutating_method` (compile-time); `rollout.rs > playouts_share_one_profile` ([S06.T05](T05-rollout-bot.md)) |
| BR-S06.T02-10 | Building a profile for a 60-card list costs under 200 µs in release on this machine, and the figure is recorded, so the "once per game" claim stays honest at 5,000 games/s. | `Profile::of` is a linear pass plus three short walks | `cargo bench profile_build`, figure written into `engine/README.md` |

## Data operations

The engine never opens the database; this module derives values. The table below is the **derivation table**: each output field, the inputs it reads and the rule that produces it.

| Output field | Reads | Computation | Invariant |
|---|---|---|---|
| `power[def] = NominalPower { damage, cost, scale }` | `CardDef::attacks[*].{cost, damage_printed, damage_mod}`, the attack's `AttackFields` from the composed program | per attack: `damage_printed` (0 when `damage_mod` is `×` and no `plus_per` applies), plus `plus`, plus `plus_per.n × max(0, nominal(counter) − offset)`, plus `coin_plus.n × flips/2`, halved when `coin_or_nothing`; keep the attack maximising `damage/(cost + 1.5)` | integer comparison only (BR-S06.T02-02); an attack with `nothing_unless` still contributes its nominal damage, because the goal exists to satisfy it |
| `copies[def]` | the decklist multiset | direct | equals the `Multiset` the job expanded; sums to 60 |
| `tops` | `CardDef::evolves_from[0]` over the deck's own definitions | every definition that is not the `evolves_from[0]` of another definition in the deck | a Basic with no evolution in the deck is a top of line (BR-S06.T02-03) |
| `main: Option<DefIdx>` | `power`, `copies`, `tops` | `argmax over tops of power.damage × min(copies, 3) / (power.cost + 1.5)`, ties by copies then lower `DefIdx` | never an evolution target (BR-S06.T02-03) |
| `scale: Option<ScaleKind>` | `power[main].scale` | the `Value` kind the main attack scales with: `HandSelf`, `BenchSelf`, `BenchBoth`, `BenchOpponent`, `EnergySelf`, `DiscardCount`, `DamageOn`, `Prizes` | drives the planner's "never discard your own hand" rule ([S06.T03](T03-planner-turn-policy.md)) |
| `main_line: SmallVec<[DefIdx; 3]>` | `CardDef::evolves_from`, the deck's definitions | walk down from `main` matching `evolves_from[0]` by name against the deck's own definitions; cap 3 | `[Basic, …, top]`; truncation sets `line_incomplete` (BR-S06.T02-04) |
| `support: SmallVec<[DefIdx; 8]>` | `CardDef::abilities`, `main_line` | definitions with ≥ 1 ability, not in `main_line` | may intersect `attackers` (BR-S06.T02-05) |
| `support_lines: SmallVec<[Line; 4]>` | as `main_line`, per support top | one line per support definition that is a top of line | same walk, same cap |
| `attackers: SmallVec<[DefIdx; 6]>` | `power`, `tops` | tops with `power.damage >= 60`, sorted by the same ratio, descending | the threshold is a named constant `ATTACKER_MIN_DAMAGE = 60` |
| `goal: Option<Goal { zone, filter, n }>` | the main attack's `nothing_unless`, then `plus_when` | the `cmp/count/ge/int` shape only (BR-S06.T02-06) | `None` when the shape does not match; never inferred from a name |
| `line_incomplete: bool` | the line walk | true when a walk stopped before reaching a Basic | surfaced in the job's `result_json` so a mis-imported list is visible |
| `goal_pending(view) -> bool` | `PlayerView` ([S06.T01](T01-honest-information-view.md)) | `count of goal.filter matches in goal.zone < goal.n` | reads the view, never the `Game` (BR-S06.T02-07) |
| `is_fodder(def) -> bool` | `goal`, `main_line` | matches the filter and is outside `main_line` | BR-S06.T02-08 |
| the database | — | never | Architecture principle 1 |

**The nominal board table.** The legacy's four constants, kept verbatim and extended to the `Value` kinds the IR adds. They stand for "a typical mid-game board" and exist only to rank attacks before a board exists.

| IR `Value` the attack scales with | Nominal | Why |
|---|---|---|
| `hand_size { of: owner }` | 7 | the legacy `hand_self`; an opening hand plus a draw |
| `bench_size { of: owner }` | 4 | the legacy `bench_self`; a filled bench with the Active out |
| `bench_size { of: both }` | 8 | the legacy `bench_both` |
| `bench_size { of: opponent }` | 4 | the legacy `bench_opponent` |
| `energy_count { slot: self }` | 3 | new; a typical loaded attacker |
| `count { zone: discard, of: owner }` | 6 | new; a mid-game discard |
| `damage_on { slot: … }` | 60 | new; six counters |
| `prizes { of: … }` | 3 | new; halfway through the race |
| anything else | 2 | the legacy default for an unknown counter |

## Interfaces

```rust
// ptcg-core::bots::profile

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScaleKind { HandSelf, BenchSelf, BenchBoth, BenchOpponent, EnergySelf, DiscardCount,
                     DamageOn, Prizes, Other }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NominalPower { pub damage: u16, pub cost: u8, pub scale: Option<ScaleKind>, pub attack: u8 }

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Goal {
    pub zone: Zone,          // Discard | LostZone | Bench | Hand — the zone the count is over
    pub filter: Filter,      // the IR filter, evaluated by the VM's filter evaluator (S05.T04)
    pub n: u8,
}

pub type Line = SmallVec<[DefIdx; 3]>;   // [Basic, …, top]

#[derive(Debug, Clone)]
pub struct Profile {
    pub power: SmallVec<[(DefIdx, NominalPower); 24]>,   // sorted by DefIdx; binary search
    pub copies: Multiset,
    pub main: Option<DefIdx>,
    pub scale: Option<ScaleKind>,
    pub main_line: Line,
    pub support: SmallVec<[DefIdx; 8]>,
    pub support_lines: SmallVec<[Line; 4]>,
    pub attackers: SmallVec<[DefIdx; 6]>,
    pub goal: Option<Goal>,
    pub line_incomplete: bool,
}

impl Profile {
    /// Computed once per game from the decklist alone. `programs` supplies the composed
    /// AttackFields per (def, attack index); empty in an effect-less engine.
    pub fn of(defs: &[CardDef], counts: &Multiset, programs: &ProgramTable) -> Profile;

    pub fn power_of(&self, def: DefIdx) -> NominalPower;      // (0, 9, None) when unknown
    pub fn in_main_line(&self, def: DefIdx) -> bool;
    pub fn line_of(&self, def: DefIdx) -> Option<&Line>;      // main line first, then support lines
    pub fn is_fodder(&self, def: DefIdx) -> bool;
    pub fn goal_pending(&self, view: &PlayerView) -> bool;
    pub fn goal_progress(&self, view: &PlayerView) -> Option<(u8, u8)>;   // (have, n)
}

pub const ATTACKER_MIN_DAMAGE: u16 = 60;
pub const LINE_DEPTH_CAP: usize = 3;
pub const NOMINAL_DEFAULT: u16 = 2;
```

**`nominal_power`, step by step.** For each attack `i` of `def`:

```text
d = damage_printed                                  (S04.T02: the numeric part only)
if fields.plus            -> d += fields.plus.n
if fields.plus_per        -> d += n × max(0, nominal(counter) − offset)     ; scale = kind(counter)
if fields.coin_plus       -> d += n × (flips == 0 ? 1 : flips / 2)          ; the legacy's expected_bonus
if fields.coin_or_nothing -> d /= 2
cost = fields.cost_alt.map(|c| min(c.len(), attack.cost.len())).unwrap_or(attack.cost.len())
keep the attack maximising d / (cost + 1.5), compared as d1·(2·c2 + 3) > d2·(2·c1 + 3)
```

`nothing_unless` does **not** zero the nominal damage: an attack that needs a condition is exactly the attack the goal exists to enable, and zeroing it here would hide the deck's own plan. The legacy made the same choice — `_nominal_power` adds `r.plus` whenever `plus_when` carries a goal.

**Goal extraction.** `goal_from(cond)` matches one shape and nothing else:

```text
Cond::Cmp { left: Value::Count { zone, of: Owner, filter }, rel: Ge, right: Value::Int(n) }
  -> Some(Goal { zone, filter, n })
Cond::AllOf(children)  -> the first child that matches the shape
anything else          -> None
```

Dhelmise's "Vengeful Anchor" condition reads *"if 4 or more of your Hide 'n' Sneak Pokémon are in your discard pile"*, which composes to `cmp { left: count { zone: "discard", of: "owner", filter: { ability_named: "Hide 'n' Sneak" } }, rel: "ge", right: { int: 4 } }` — exactly the shape above, which is why the pattern is worth reading rather than annotating.

**Worked example — the user's Dhelmise list.** 23 Pokémon over five lines. `tops` excludes Shuppet and Poltchageist (both are `evolves_from` targets). Among the remaining tops, Dhelmise's nominal damage with its +140 goal bonus and a two-energy cost beats Banette's and Sinistcha's, and it has four copies, so `main = dhelmise`, `main_line = [dhelmise]` (a Basic), `scale = Some(DiscardCount)`. Banette and Sinistcha carry abilities outside the main line, so they are `support` with lines `[shuppet, banette]` and `[poltchageist, sinistcha]`. `attackers` holds Dhelmise, Banette and Sinistcha. `goal = Goal { zone: Discard, filter: ability_named("Hide 'n' Sneak"), n: 4 }`. `is_fodder` is then true for the spare Shuppet and Poltchageist copies and false for Dhelmise itself — which is precisely the discipline that moved suite v5 from 36.5 % to 57.3 %.

**Where the profile is built.** `HeuristicBot`, `PlannerBot`, `RolloutBot` and `IsmctsBot` all build it in `Bot::new_game(view, me)` from `view.own.decklist` and store `Arc<Profile>`. A rollout's inner playouts clone the `Arc`, never the `Profile`.

## Implementation steps

1. Declare `NominalPower`, `ScaleKind`, `Goal`, `Line` and `Profile` with the nominal table as a `const` array; `cargo test -p ptcg-core profile` green on an empty module.
2. Implement `nominal_power` over printed damage only, then add the attack fields one at a time with a test each (`plus`, `plus_per` with `offset`, `coin_plus` including `flips == 0`, `coin_or_nothing`, `cost_alt`) (BR-S06.T02-02).
3. Implement the tops-of-line filter and the main-attacker selection with its total ordering; spec both rules (BR-S06.T02-03).
4. Implement the line walk with the visited set and the depth cap; spec the Stage 2 case, the truncated case and the cyclic case (BR-S06.T02-04).
5. Implement the support set and support lines; spec the overlap with `attackers` (BR-S06.T02-05).
6. Implement `attackers` and `scale`; spec the 60-damage threshold boundary.
7. Implement `goal_from(cond)` with the single shape, the `all_of` descent and the `nothing_unless`-before-`plus_when` order; spec the Dhelmise condition and two non-matching shapes (BR-S06.T02-06).
8. Implement `goal_pending`, `goal_progress` and `is_fodder` against `PlayerView`; spec the main-line exclusion (BR-S06.T02-07, -08).
9. Build the three-archetype fixture — a Dragapult list, a Gardevoir list and the user's Dhelmise list, stored as `engine/fixtures/profiles/*.json` with their expected `main`, `main_line`, `support`, `attackers` and `goal` — and write `> three_archetypes` (RN-31).
10. Add the policy test forbidding name comparisons and the "rename everything" test (BR-S06.T02-01).
11. Benchmark `Profile::of` on the 60-card fixture and record the figure in `engine/README.md` (BR-S06.T02-10).
12. Write the profile section of `engine/BOTS.md`: the derivation table, the nominal table with its justification, the goal shape, and the statement that anything outside the shape yields no goal.

## Edge cases and error handling

- **A deck with no Pokémon that attacks** (a theoretical stall list) → `main = None`, `main_line` empty, `attackers` empty, `goal = None`. The planner then falls back to its generic rules ([S06.T03](T03-planner-turn-policy.md)) instead of panicking, and the profile carries `line_incomplete = false` because nothing was truncated.
- **Two definitions with equal rank and equal copies** → the lower `DefIdx` wins. Since `def_idx` is assigned by sorted `card_id` ([S04.T02](../04-game-engine-core/T02-card-definition-model.md) BR-S04.T02-01), the tie-break is stable across runs, which is what keeps a measurement reproducible.
- **A Stage 2 whose Stage 1 is not in the deck** (a Rare Candy list) → the walk stops at the Stage 2 and `line_incomplete = true`. The planner still benches the Basic, because the Basic is reachable by name from `CardDef::evolves_from`'s full chain even though the middle printing is absent from the list. The flag is reported, not fatal.
- **A `plus_per` whose counter is a `param` that was never bound** → cannot happen: composition substitutes every `param` before the program reaches the engine ([S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md) step 4). If one is seen, `nominal` returns `NOMINAL_DEFAULT` and the profile records nothing special — a value of 2 is a conservative guess, and the composition test is where the real bug surfaces.
- **An effect-less engine** (S04 only, no programs) → `ProgramTable` is empty, every attack contributes its printed damage alone, and the profile still finds a main attacker and a line. The goal is `None`, which is correct: without programs there is no condition to read.
- **A deck whose main attack scales with `hand_size`** (the Alakazam "Powerful Hand" case the legacy test pins) → `scale = Some(HandSelf)` and nominal damage is `20 × 7 = 140` at the nominal hand. The planner then refuses hand-dumping supporters ([S06.T03](T03-planner-turn-policy.md)), which is the whole reason `scale` is a field.
- **A goal whose filter matches nothing in the deck** (an importer mistake) → `goal_pending` is permanently true and `is_fodder` is always false, so the planner simply never finds fodder. The profile reports `goal_progress = (0, n)` in the job result so the mistake is visible rather than silently changing behaviour.
- **A support Pokémon whose ability is on the Basic and whose evolution has none** → the Basic is `support`, the evolution is not; `support_lines` walks from the top of line, so both appear in the line. Correct: the bench slot is what is being reserved.
- **A 60-card list with 40 distinct definitions** → `power` is a 40-entry sorted `SmallVec`; `power_of` is a binary search. No `HashMap` enters, per [S04.T03](../04-game-engine-core/T03-game-state-model.md) BR-S04.T03-06.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core profile` green, including `> three_archetypes`: the Dragapult fixture yields `main = dragapult ex` with `main_line = [dreepy, drakloak, dragapult ex]`; the Gardevoir fixture yields `main = gardevoir ex` with a three-card line and `kirlia` in `support`; the Dhelmise fixture yields `main = dhelmise`, `scale = DiscardCount` and `goal = { zone: Discard, filter: ability_named("Hide 'n' Sneak"), n: 4 }` (RN-31).
- [ ] `> the_goal_is_read_from_the_condition_not_from_a_name`: every `CardDef::name` in the Dhelmise fixture is replaced by a random string and the extracted goal is unchanged (RN-31, BR-S06.T02-01).
- [ ] `> nominal_power_matches_the_table`: one case per attack-field kind (`plus`, `plus_per` with `offset: 1`, `coin_plus` with `flips: 0`, `coin_or_nothing`, `cost_alt`), each compared against a hand-computed value (BR-S06.T02-02).
- [ ] `> a_free_30_does_not_outrank_a_four_energy_250` and `> coin_or_nothing_halves_the_nominal` (BR-S06.T02-02).
- [ ] `> an_evolution_target_is_never_the_main_attacker` and `> the_main_attacker_is_deterministic_under_ties` over 1,000 random 60-card lists (BR-S06.T02-03).
- [ ] `> a_stage2_line_is_basic_stage1_stage2`, `> a_deck_without_the_stage1_gets_a_truncated_line_and_the_flag`, `> a_cyclic_evolves_from_terminates` (BR-S06.T02-04).
- [ ] `> the_dhelmise_condition_yields_goal_discard_4`, `> a_condition_of_another_shape_yields_none`, `> nothing_unless_wins_over_plus_when` (BR-S06.T02-06).
- [ ] `> a_main_line_card_matching_the_filter_is_not_fodder` and `> a_spare_matching_card_is_fodder` on the Dhelmise fixture (BR-S06.T02-08).
- [ ] `> goal_pending_is_false_once_four_are_in_the_discard`: a view with 3 matching cards is pending, with 4 is not, and `goal_progress` reports `(3, 4)` then `(4, 4)` (BR-S06.T02-07).
- [ ] `policy.rs > profile_does_not_branch_on_card_names` and `> renaming_every_def_changes_nothing` (BR-S06.T02-01).
- [ ] `cargo bench profile_build` completes under 200 µs for the 60-card Dhelmise fixture and the figure is in `engine/README.md` (BR-S06.T02-10).

## Risks and open questions

- **Risk — the goal shape is too narrow and most decks get `goal = None`.** Dhelmise is the case that motivated it; "if your opponent's Active has 3 or more damage counters" and "if you have 2 or fewer Prize cards" are conditions of the same `cmp` family but with different left sides, and the current shape rejects them. Mitigation: the shape is one function with one `match`; widening it is a test plus an arm. Step 9's fixtures are chosen to include at least one deck with no goal so the "no goal" path is exercised, and the share of suite-v6 lists with a goal is reported once [S06.T08](T08-measurement-score-and-mirror.md) runs.
- **Risk — the nominal table is tuned to the legacy's meta.** `hand_self = 7` was right for a 2026 Standard list; a hand-scaling attack in a different format would be mis-ranked. Mitigation: the table is a `const` array with a named entry per `Value` kind, quoted in `engine/BOTS.md`; changing an entry changes the bot, so it changes the `code_hash` ([S06.T07](T07-bot-registry-and-freezing.md)) and shows up as a new bot version rather than as drift.
- **Risk — one main attacker is the wrong model for a two-attacker deck.** A list with two equal top-of-line attackers gets one `main` and one `attackers` entry each; the planner's "main line first" rules then favour one arbitrarily. Mitigation: `attackers` is ordered and [S06.T03](T03-planner-turn-policy.md) uses it for the "always keep a second attacker" rule, so the second line is not ignored; a real two-plan profile is a bot change to be measured, not a silent widening here.
- **Question — should `scale` also be read for support Pokémon?** Only the main attacker's `scale` is stored, because the only consumer is the "never dump your hand" rule. Recommendation: keep it to the main attacker; if a second consumer appears, the field becomes a per-definition lookup in `power`, which already carries it.
- **Question — should the profile know the opponent's archetype?** It could, from the job's pairing label, and it would let a bot play the matchup rather than the deck. Recommendation: no — it would make the bot's score depend on metadata the engine is not supposed to read, and RN-30's honesty argument applies to the deck list as well. The user decides if a matchup-aware bot is ever wanted; it would be a new bot name.

## References

- `pokemon/src/pokesearch/sim/pilot.py` L94–117 (`_nominal_power`) — verified: `_NOMINAL = {"hand_self": 7, "bench_self": 4, "bench_both": 8, "bench_opponent": 4}`; the per-attack accumulation of `r.plus` when `plus_when` carries a goal, `r.plus_per` with `plus_per_offset`, `r.counters_per` at `10 × per × nominal`, and `dmg //= 2` for `coin_or_nothing`; the ranking `dmg / (cost + 1.5)` and the initial `best = (0, 9, None)`. The nominal table and the ranking reproduced here.
- `pokemon/src/pokesearch/sim/pilot.py` L123–170 (`Profile`) — verified: `copies` as a `Counter`, `prev` from `evolveFrom[0]`, `tops` as the definitions not in `evolves_into`, the ranking `dmg/(cost+1.5) × min(copies, 3)`, `main`, `scale`, `main_line`, `support` (has an ability and is outside the main line), `support_lines`, `attackers` at `>= 60`, and the goal read from `plus_when.goal` or `nothing_unless.goal`; `goal_pending(me)` counting discard matches against `n`; `is_fodder(card)` requiring a filter match **and** `_name(card) not in main_line`; `_line(top)` walking `prev` with a visited guard.
- `pokemon/tests/test_pilot.py::test_profile_finds_the_main_attacker_its_line_and_what_it_scales_with` — verified: `p.main == "alakazam"`, `p.scale == "hand_self"`, `p.main_line[0] == "abra"`, `p.main_line[-1] == "alakazam"`, `"dudunsparce" in p.support`. The shape of the three-archetype acceptance test.
- `pokemon/benchmarks/HISTORICO.md` — verified: suite v1 heuristic 52.7 % (CI 49.8–55.6) → planner v4 87.3 % (CI 85.3–89.2) with deck-out losses 32.8 % → 5.5 %; suite v5 planner v9 36.5 % (CI 34.8–38.2) → planner v11 57.3 % (CI 55.5–59.0) with the note *"lê o objetivo do deck na condição do ataque principal (4 Hide 'n' Sneak no descarte) e alimenta o descarte de propósito"*. The measured value of this subtask's two ideas.
- `pokemon/ESPECIFICACAO.md` §4.3 RN-31 — verified: the rule text naming the main attacker, the evolution line, the support and the deck goal read from the main attack's condition.
- [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md) — the `AttackFields` list (`plus`, `plus_when`, `plus_per`, `coin_plus`, `coin_or_nothing`, `nothing_unless`, `cost_alt`), the `Cond` grammar (`cmp`, `rel ∈ eq ne lt le gt ge`, `count { zone, of, filter }`) and the `Value` kinds the nominal table maps.
- [S04.T02](../04-game-engine-core/T02-card-definition-model.md) — `CardDef`, `DefIdx` assignment by sorted `card_id`, `evolves_from` as the full chain, and `damage_printed` / `damage_mod`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
