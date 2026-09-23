# S04.T10 — Termination, stall detection and determinism

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 10 / 18 |
| Depends on | [S04.T04](T04-setup-and-turn-structure.md), [S04.T07](T07-damage-pipeline.md) |
| Unblocks | [S04.T12](T12-cli-job-protocol.md), [S06.T05](../06-bots/T05-rollout-bot.md), [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md) |
| Parallel with | [S04.T08](T08-special-conditions-and-checkup.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` turn structure (deck-out on draw) — from [S04.T04](T04-setup-and-turn-structure.md)
- `module` KO/prize handling — from [S04.T07](T07-damage-pipeline.md)
- `doc` ESPECIFICACAO.md RN-20, RN-46, RN-47, RN-50
- `file` `pokemon/src/pokesearch/sim/engine_adapter.py` and `progress.py` — `_material`, `STALL_TURNS`, `max_steps`, `_end_reason`, `_seed`; read-only reference

## Outputs (proposed)
- `module` `ptcg-core::terminal` — `Outcome { winner: Option<PlayerIdx>, reason: prizes | no_pokemon | deck_out | stall | step_limit | concede, turns }`; stall = material signature `(prizes, deck, discard, hand, board, total damage)` per player unchanged for 12 consecutive turns (compared two turns back); step cap 3,000 — consumed by [S04.T12](T12-cli-job-protocol.md), [S06.T05](../06-bots/T05-rollout-bot.md), [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md)
- `module` `ptcg-core::rng` — game stream `Xoshiro256**` seeded from `(seed_base, game_idx)`; each bot receives its own stream seeded from `(seed, bot_slot)`; `fingerprint(games) → sha256` over `(winner, reason, turns, final_state_hash)` in game order
- `doc` determinism rules in `engine/README.md`: no `HashMap` iteration in game logic (Vec/IndexMap/BTreeMap only), integers only, modifiers ordered by (slot, card idx), results aggregated in game-index order regardless of thread

## Initial objective
A game always ends with a named reason, and the same job produces the same bytes on 1 or 16 threads and on different days — the property every measurement and every optimizer comparison rests on.

## Context

Everything the project promises downstream — a reproducible score with a confidence interval, an optimizer that accepts a swap only when the gain survives fresh seeds, a performance change accepted only with an identical result hash — reduces to two properties established here: a game always ends, and the same job always produces the same bytes.

**Always ends.** RN-20 names five reasons plus concede: prizes, deck-out on the mandatory draw only, no Pokémon, stall after 12 turns without material change, and the step cap. The legacy measured the real distribution and it is worth carrying as a sanity baseline: 54 % prizes, 32 % deck-out, 12 % no Pokémon, 2 % stall. That 32 % deck-out figure is itself a diagnosis — it is mostly the bot drawing itself to death, and the legacy's own notes track it falling from 32.8 % to 3.1 % as the pilot improved. A new engine whose deck-out share looks nothing like that is telling us something about the bots, not about the rules.

Stall detection needs one non-obvious detail. The legacy's `_material` signature is computed per player — prize count, deck size, discard size, hand size, board size and the sum of board HP — and compared not with the previous turn but with **two turns back**, because the signature alternates between the two players' perspectives as turns pass and a one-turn comparison would never match. `STALL_TURNS = 12` counts consecutive matches. Here the last component becomes total damage on the board rather than remaining HP, since damage is what the state stores ([S04.T03](T03-game-state-model.md)); it is the same quantity with the sign flipped, and it changes in exactly the same situations.

**Same bytes.** RN-47 required `PYTHONHASHSEED=0` on every measurement, and the scripts re-executed themselves to enforce it, because Python's set and dict iteration order over enum members varied per process and leaked into the game. That rule is **superseded**: there is no hash iteration in the game logic at all ([S04.T03](T03-game-state-model.md) BR-S04.T03-06 forbids `HashMap`/`HashSet` in `ptcg-core`, enforced by clippy), so there is nothing to seed. What replaces it is stronger and testable: a fingerprint over the games of a pairing that must be identical at one worker and at sixteen.

Two disciplines make that hold. Randomness is split into independent streams: one per game, derived from `(seed_base, game_idx)`, and one per bot slot, derived from `(seed_base, game_idx, bot_slot)`. Changing a bot's internal tie-breaking therefore cannot perturb a shuffle, which is what keeps paired-seed screening genuinely paired ([S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md)) — if a candidate list and its reference are compared on the same `(opponent, seed)` pairs, the shuffles must be the same in both. And aggregation is by game index, never by completion order: the legacy's `play_batch` collected futures with `as_completed`, which is fine for sums but not for anything order-sensitive, and it is the habit that quietly makes results thread-dependent.

RN-46's stable per-matchup seed is kept in its legacy form: `seed_base = (seed0 + crc32(parts)) mod 1_000_000_007`. The reason it exists is stated in `progress.py` — Python's `hash()` of a string changes per process — and while that specific hazard is gone, a documented, reproducible function from matchup identity to seed is exactly what a frozen suite needs.

## Scope

- **In scope.** `Outcome`, `EndReason` and the ordered end-condition check; the material signature and the stall detector; the step cap; the RNG stream construction (`game_rng`, `bot_rng`) and the `seed_base` derivation function; `final_state_hash`, `game_fingerprint` and `pairing_fingerprint`; the aggregation-order rule; the determinism section of `engine/README.md`; the 1-versus-16-worker test harness that [S04.T12](T12-cli-job-protocol.md) and [S04.T18](T18-performance-baseline.md) reuse.
- **Out of scope.** The CLI that spawns the `rayon` pool ([S04.T12](T12-cli-job-protocol.md)) — this subtask provides the invariants it must preserve; the bots themselves ([S04.T11](T11-baseline-bots-random-heuristic.md)); the `jobs`/`job_pairings` tables that store the fingerprint ([S04.T14](T14-jobs-schema-migration.md)); the measurement statistics ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)); performance measurement itself ([S04.T18](T18-performance-baseline.md)), which consumes the fingerprint as its correctness gate (RN-50).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-20 | **Kept.** A game ends for exactly one of: `prizes` (a player took their last prize), `no_pokemon` (a player has no Pokémon in play after a knockout is resolved), `deck_out` (the mandatory start-of-turn draw found an empty deck — no other draw ends the game), `stall` (12 consecutive turns with no material change), `step_limit` (3,000 steps), `concede`. The checks run in that order at the documented check points. | `terminal::check(game)` called after `after_attack`, after the checkup and at `start_turn`; `StartTurn::DeckOut` from [S04.T04](T04-setup-and-turn-structure.md) | `terminal.rs > last_prize_ends_with_prizes`; `> empty_board_ends_with_no_pokemon`; `> mandatory_draw_on_empty_deck_ends_with_deck_out`; `> effect_draw_on_empty_deck_does_not_end_the_game`; `> twelve_idle_turns_end_with_stall`; `> step_cap_ends_with_step_limit`; scenario `rules/end-reasons.json` |
| RN-46 | **Kept.** The seed of a matchup is `seed_base = (seed0 + crc32(parts.join("\|"))) mod 1_000_000_007`, where `parts` identifies the matchup (suite tag, deck ids, bot names); game `i` of a pairing uses `(seed_base, i)`. The function is pure and version-stable. | `rng::seed_base(seed0, parts) -> u64`; `rng::game_rng(seed_base, game_idx)` | `rng.rs > seed_base_matches_the_documented_formula` (fixed vectors); `> the_same_matchup_yields_the_same_seed_across_runs` |
| RN-47 | **Superseded.** `PYTHONHASHSEED=0` has no counterpart: `ptcg-core` contains no hash-map or hash-set iteration, so no process-level seed can influence a game. The property it protected is now asserted directly by fingerprint equality across worker counts. | clippy `disallowed-types` from [S04.T03](T03-game-state-model.md) BR-S04.T03-06; `rng` uses `Xoshiro256**` only | `policy.rs > core_has_no_hash_iteration`; `determinism.rs > fingerprint_is_equal_at_1_and_16_workers` |
| RN-50 | **Kept.** A performance change is accepted only when the result hash is unchanged: `pairing_fingerprint` over the games of a pairing is the artifact compared before and after any optimisation. | `rng::pairing_fingerprint(&[GameOutcome]) -> [u8; 32]`; the check itself lives in [S04.T18](T18-performance-baseline.md) | `determinism.rs > fingerprint_is_stable_across_two_runs`; the bench gate in [S04.T18](T18-performance-baseline.md) |
| BR-S04.T10-01 | The material signature of a player is `(prizes.len(), deck.len(), discard.len(), hand.len(), pokemon_in_play, total_damage_on_board)`; the game's signature is the pair of both players' tuples, and it is recorded once per turn at `start_turn`, after the mandatory draw. | `terminal::material(game) -> [MaterialSig; 2]` | `terminal.rs > material_changes_on_a_draw`; `> material_changes_when_damage_is_placed`; `> material_is_recorded_once_per_turn` |
| BR-S04.T10-02 | Stall is 12 consecutive turns whose signature equals the signature **two turns earlier**; the counter resets to zero on any change. The history keeps only the last 14 entries. | `terminal::stall_check` comparing with `history[len-2]` | `terminal.rs > stall_compares_two_turns_back` (a signature alternating between two values does not reset the counter); `> any_change_resets_the_counter` |
| BR-S04.T10-03 | The step cap is 3,000 `apply`/`answer` calls per game; reaching it ends the game with `step_limit` and no winner. The cap is a job option with 3,000 as the default ([S04.T12](T12-cli-job-protocol.md)). | `Game::steps` incremented in `apply` and `answer`; `terminal::check` | `terminal.rs > step_cap_ends_with_step_limit`; `> steps_count_answers_too` |
| BR-S04.T10-04 | The game RNG and every bot RNG are independent streams: `game_rng = Xoshiro256**::seed_from_u64(splitmix(seed_base, game_idx, 0))`, `bot_rng(slot) = …(seed_base, game_idx, 1 + slot)`. A bot never draws from `Game::rng`, and no game rule draws from a bot stream. | `rng::game_rng` / `rng::bot_rng`; `Bot::choose_action` receives its own `&mut Rng` ([S04.T11](T11-baseline-bots-random-heuristic.md)) | `rng.rs > streams_are_independent` (changing the bot stream leaves the shuffle of game 0 byte-identical); `policy.rs > bots_do_not_touch_game_rng` |
| BR-S04.T10-05 | `final_state_hash` is a SHA-256 over a canonical serialization of the terminal state: both players' zone contents as `DefIdx` sequences in zone order, board damage, prizes remaining, turn number. It never includes a pointer, an address, an iteration order or a timing value. | `rng::final_state_hash(&Game) -> [u8; 32]` | `determinism.rs > final_state_hash_is_stable_across_processes` (two processes, same seed, same hash); `> hash_changes_when_a_card_moves` |
| BR-S04.T10-06 | A pairing's results are aggregated in **game-index order**, never in completion order, and `pairing_fingerprint` hashes `(game_idx, winner, reason, turns, final_state_hash)` in that order. | the aggregator in [S04.T12](T12-cli-job-protocol.md) writing into a pre-sized `Vec` by index; `pairing_fingerprint` iterating it | `determinism.rs > fingerprint_is_equal_at_1_and_16_workers`; `> aggregation_order_is_index_order` (completion order shuffled in a test harness, fingerprint unchanged) |
| BR-S04.T10-07 | `Concede` produces `Outcome { winner: Some(other), reason: Concede }` immediately and is the only reason a game can end on a player's own action outside the normal checks. | `Game::apply(Concede)` | `terminal.rs > concede_awards_the_win_to_the_other_player` |
| BR-S04.T10-08 | When a check point finds both players in a losing condition at once (both decks out, both boards empty), the game is a tie: `winner: None` with the reason of the condition that was detected. | `terminal::check`'s symmetric branch | `terminal.rs > simultaneous_no_pokemon_is_a_tie`; `> simultaneous_deck_out_is_a_tie` |
| BR-S04.T10-09 | All game arithmetic is integer: no `f32`/`f64` appears in `ptcg-core` outside test code, so no result depends on floating-point association or on the order of summation across threads. | clippy `disallowed-types` for `f32`/`f64` in `ptcg-core` | `policy.rs > core_has_no_floating_point` |

## Data operations

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `Game::outcome` | `Some(Outcome)` | the first check point where an end condition holds | written once; every later `apply`/`answer` returns `EngineError::IllegalAction` |
| `Game::phase` | `= Ended` | together with `outcome` | no further mutation of any zone |
| `Game::steps` | `+= 1` | every `apply` and every `answer` | monotonic; reaching `max_steps` is `step_limit` (BR-S04.T10-03) |
| `Game::material_history` | one signature pushed | `start_turn`, after the mandatory draw | capped at 14 entries; a ring buffer, never reallocated |
| `Game::stall_counter` | `+= 1` on a match, `= 0` otherwise | same point | reaching 12 is `stall` (BR-S04.T10-02) |
| `Game::rng` | advanced | shuffles, coin flips only | never advanced by a bot (BR-S04.T10-04) |
| bot streams | advanced | inside `Bot::choose_action` / `answer_prompt` | one stream per bot slot; separate from `Game::rng` |
| `final_state_hash` | computed once | when `outcome` is written | pure function of the terminal state (BR-S04.T10-05) |
| per-pairing result vector | written at `[game_idx]` | as each game completes, on any thread | pre-sized; no push, so completion order cannot affect it (BR-S04.T10-06) |
| `pairing_fingerprint` | computed once | after every game of a pairing has been written | hashed in index order |
| the database | — | never | the engine holds no connection; the fingerprint is written by the worker ([S04.T15](T15-worker-job-runner.md)) |

## Interfaces

```rust
// ptcg-core::terminal
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EndReason { Prizes, NoPokemon, DeckOut, Stall, StepLimit, Concede }

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Outcome {
    pub winner: Option<PlayerIdx>,     // None = tie
    pub reason: EndReason,
    pub turns: u16,
    pub steps: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MaterialSig {
    pub prizes: u8, pub deck: u8, pub discard: u8, pub hand: u8,
    pub in_play: u8, pub damage: u16,
}

pub(crate) fn material(game: &Game) -> [MaterialSig; 2];
pub(crate) fn record_material(game: &mut Game);        // called from start_turn
pub(crate) fn check(game: &mut Game);                  // the ordered end-condition check
pub fn outcome(game: &Game) -> Option<&Outcome>;

pub const STALL_TURNS: u8 = 12;
pub const MAX_STEPS: u32 = 3_000;
pub const MATERIAL_HISTORY: usize = 14;
```

```rust
// ptcg-core::rng
pub type Rng = rand_xoshiro::Xoshiro256StarStar;

/// RN-46. `parts` identifies the matchup, e.g. ["score", "<deck_a>", "<deck_b>", "<bot_a>", "<bot_b>"].
pub fn seed_base(seed0: u64, parts: &[&str]) -> u64;   // (seed0 + crc32(join("|"))) % 1_000_000_007
pub fn game_rng(seed_base: u64, game_idx: u32) -> Rng;
pub fn bot_rng(seed_base: u64, game_idx: u32, bot_slot: u8) -> Rng;

pub fn final_state_hash(game: &Game) -> [u8; 32];
pub fn game_fingerprint(idx: u32, o: &Outcome, state_hash: &[u8; 32]) -> [u8; 32];
pub fn pairing_fingerprint(games: &[GameOutcome]) -> [u8; 32];   // index order (BR-S04.T10-06)

#[derive(Debug, Clone, Copy)]
pub struct GameOutcome { pub idx: u32, pub outcome: Outcome, pub state_hash: [u8; 32] }
```

**Seed derivation.** `seed_base` reproduces the legacy formula exactly, including the modulus, so a suite frozen against a documented seed stays reproducible. `game_rng` and `bot_rng` mix the pair through SplitMix64 before seeding Xoshiro, so consecutive `game_idx` values do not produce correlated streams:

```text
seed_base(seed0, parts) = (seed0 + crc32(parts.join("|"))) mod 1_000_000_007
game_rng(base, i)       = Xoshiro256**::seed_from_u64( splitmix64(base ^ (i as u64) << 32 ^ 0) )
bot_rng(base, i, slot)  = Xoshiro256**::seed_from_u64( splitmix64(base ^ (i as u64) << 32 ^ (1 + slot)) )
```

**End-condition check order** (at each check point, first match wins):

| # | Condition | Reason | Winner |
|---|---|---|---|
| 1 | a player has taken their last prize | `Prizes` | that player |
| 2 | a player has no Pokémon in play, after knockouts and promotions are resolved | `NoPokemon` | the other player (both → tie) |
| 3 | `StartTurn::DeckOut` for the current player | `DeckOut` | the other player (both → tie) |
| 4 | `stall_counter >= STALL_TURNS` | `Stall` | none (tie) |
| 5 | `steps >= max_steps` | `StepLimit` | none (tie) |

**Check points:** after `after_attack` ([S04.T07](T07-damage-pipeline.md)), after the checkup reports `Done` ([S04.T08](T08-special-conditions-and-checkup.md)), and at `start_turn` ([S04.T04](T04-setup-and-turn-structure.md)) after the mandatory draw and the material record.

**Determinism rules** (written into `engine/README.md`, and each one has a test):

1. No `HashMap`/`HashSet` iteration in `ptcg-core` — `Vec`, `SmallVec`, `IndexMap`, `BTreeMap` only (BR-S04.T03-06).
2. No floating point in `ptcg-core` (BR-S04.T10-09).
3. Continuous modifiers are ordered by `(player, slot, attachment index)` ([S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)).
4. One RNG stream per game and one per bot slot; a bot never touches `Game::rng` (BR-S04.T10-04).
5. Results are aggregated by game index, never by completion order (BR-S04.T10-06).
6. `final_state_hash` covers only game facts, never addresses, timings or thread ids (BR-S04.T10-05).
7. Prompt candidate order and `legal_actions` order are functions of the state ([S04.T05](T05-actions-and-legality.md), [S04.T09](T09-prompt-protocol.md)).

## Implementation steps

1. Declare `EndReason`, `Outcome`, `MaterialSig` and the constants; implement `material()` and `record_material()`; spec that a draw and a damage placement each change the signature (BR-S04.T10-01). `cargo test` green.
2. Implement `terminal::check` with conditions 1–3 and the symmetric tie branch; wire the three check points; spec the four end reasons and the two tie cases (RN-20, BR-S04.T10-08).
3. Implement the stall detector with the two-turns-back comparison and the 14-entry ring buffer; spec `> stall_compares_two_turns_back` and `> any_change_resets_the_counter` (BR-S04.T10-02).
4. Add `Game::steps` to `apply` and `answer`, implement condition 5 and make `max_steps` a field with the 3,000 default (BR-S04.T10-03).
5. Implement `Concede` in `terminal::check`'s caller and spec it (BR-S04.T10-07).
6. Implement `rng::seed_base` with the exact legacy formula and fixed test vectors; implement `game_rng` and `bot_rng` with SplitMix64 mixing (RN-46, BR-S04.T10-04).
7. Spec stream independence: run game 0 twice with different bot seeds and assert the shuffled deck order after setup is byte-identical (BR-S04.T10-04).
8. Implement `final_state_hash`, `game_fingerprint` and `pairing_fingerprint`; spec stability across two processes and sensitivity to a single card move (BR-S04.T10-05).
9. Write `determinism.rs` with a small in-crate harness that plays N games of one pairing both sequentially and on a thread pool with a shuffled completion order, and asserts equal fingerprints — the test [S04.T12](T12-cli-job-protocol.md) then repeats at the CLI level with `--workers 1` and `--workers 16` (BR-S04.T10-06, RN-47).
10. Add the clippy `disallowed-types` entry for `f32`/`f64` and the `policy.rs` checks for floating point, hash iteration and bots touching `Game::rng` (BR-S04.T10-09, RN-47).
11. Write the determinism section of `engine/README.md` with the seven rules and the name of the test that enforces each; run 1,000 random-bot games and record the end-reason distribution next to the legacy baseline (54 / 32 / 12 / 2).

## Edge cases and error handling

- **A stall signature with alternating sides.** Two players each shuffling a card back and forth make the per-turn signature alternate between two values; comparing with the previous turn would never match and the stall would never fire. Comparing two turns back is what makes it fire, and `> stall_compares_two_turns_back` is the test that pins it.
- **Deck-out on the mandatory draw versus an optional draw.** Only the mandatory start-of-turn draw ends the game (RN-20). A card effect that draws the last card leaves the player with an empty deck and the game continues until their next turn begins. Both cases have their own test.
- **The last prize is taken while the opponent also has no Pokémon** → condition 1 wins, because it is checked first: the player who took the last prize wins by prizes. Ordering the checks is the whole of the disambiguation.
- **Both players' decks run out on the same turn** → impossible, since only the current player draws; but both boards can be emptied by one attack, and that is a tie by BR-S04.T10-08.
- **A game that ends during the checkup** → `terminal::check` runs after the checkup reports `Done`, not in the middle of it, so a poison knockout that empties a board is resolved with all its prompts before the outcome is written.
- **A step cap reached while a prompt is pending** → the game ends with `step_limit` and the prompt is discarded; `answer` counts as a step precisely so a bot that answers endlessly cannot run forever.
- **`seed0` equal to zero** → valid; `seed_base` is still well distributed because the crc32 term dominates. Fixed vectors in the test cover `seed0 = 0`.
- **A `crc32` of an empty `parts` list** → 0, so `seed_base = seed0`; documented rather than special-cased, so a caller that forgets to pass identifying parts gets a visibly degenerate seed rather than a silent one.
- **Two pairings in one job with the same `seed_base`** → allowed and sometimes intended (a mirror match). Fingerprints differ anyway because they include the game index and the terminal state.
- **A `NaN`-style non-determinism from a future dependency** → prevented at the type level: no floating point in `ptcg-core`, checked by `policy.rs`. Statistics are computed in TypeScript, outside the engine ([S04.T17](T17-web-evaluate-page.md), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md)).

## Acceptance / verification

- [ ] `cargo test -p ptcg-core terminal` green: `> last_prize_ends_with_prizes`, `> empty_board_ends_with_no_pokemon`, `> mandatory_draw_on_empty_deck_ends_with_deck_out`, `> effect_draw_on_empty_deck_does_not_end_the_game`, `> twelve_idle_turns_end_with_stall`, `> step_cap_ends_with_step_limit` (RN-20).
- [ ] `> stall_compares_two_turns_back`: a state whose signature alternates between two values reaches `stall` after 12 turns, and a state that changes every turn never does (BR-S04.T10-02).
- [ ] `cargo test -p ptcg-core rng::seed_base_matches_the_documented_formula` against fixed vectors, including `seed0 = 0` and an empty `parts` list (RN-46).
- [ ] `> streams_are_independent`: running game 0 with two different bot seeds produces byte-identical post-setup deck orders, so a bot change cannot perturb a shuffle (BR-S04.T10-04).
- [ ] `cargo test -p ptcg-core determinism::fingerprint_is_equal_at_1_and_16_workers` — 200 games of one pairing, run sequentially and on a 16-thread pool with a deliberately shuffled completion order; `pairing_fingerprint` is byte-identical between the two runs (RN-47, BR-S04.T10-06).
- [ ] `> fingerprint_is_stable_across_two_runs`: the same job run twice in two separate processes yields the same `pairing_fingerprint` (RN-50).
- [ ] `> final_state_hash_is_stable_across_processes` and `> hash_changes_when_a_card_moves` (BR-S04.T10-05).
- [ ] `> simultaneous_no_pokemon_is_a_tie` and `> concede_awards_the_win_to_the_other_player` (BR-S04.T10-07, -08).
- [ ] `cargo clippy -p ptcg-core -- -D warnings` with `f32`/`f64`, `HashMap` and `HashSet` in the disallowed list, and `cargo test -p ptcg-cli policy` green for `core_has_no_floating_point`, `core_has_no_hash_iteration` and `bots_do_not_touch_game_rng` (RN-47, BR-S04.T10-09).
- [ ] 1,000 random-bot games produce an end-reason distribution recorded in `engine/README.md` alongside the legacy baseline (54 % prizes, 32 % deck-out, 12 % no Pokémon, 2 % stall), with any large divergence explained in the same paragraph.

## Risks and open questions

- **Risk — the 12-turn stall threshold is tuned for the legacy's bots.** A weaker or stronger bot changes how often genuine progress stops. Mitigation: `stall_turns` is a job option defaulting to 12 ([S04.T12](T12-cli-job-protocol.md)); changing it changes the fingerprint, so it is a deliberate, recorded act. The legacy's 2 % stall share is the yardstick.
- **Risk — the material signature misses a kind of progress.** Two Pokémon trading damage that is healed each turn leaves prize, deck, discard, hand and board counts unchanged, and total damage returns to the same value; the signature then looks idle while the game is doing something. Mitigation: the turn count still advances toward the step cap, so the game ends either way; if the case appears in practice, adding a component to the signature is a documented engine change.
- **Risk — the step cap masks a livelock.** A game that reaches 3,000 steps is a tie and contributes to the score as 0.5, which hides a rules bug behind a statistic. Mitigation: `step_limit` is reported as its own outcome bucket in every result line ([S04.T12](T12-cli-job-protocol.md)) and on the Evaluate page ([S04.T17](T17-web-evaluate-page.md)); a non-trivial share is a defect, not noise.
- **Risk — `rayon`'s work stealing reorders side effects.** Mitigation: games are independent, results are written by index, and the fingerprint test with a shuffled completion order is run in CI on every change to the crate.
- **Question — should the fingerprint include the full event log when logging is on?** It would catch divergences the terminal state hides, at the cost of making logged and unlogged runs incomparable. Recommendation: keep the fingerprint independent of logging, and add a separate `log_fingerprint` only if a divergence is ever observed. Decided if and when that happens.
- **Question — should `seed_base` move to SHA-256 instead of CRC-32?** CRC-32 collides after roughly 2^16 matchups by the birthday bound, which is far beyond a suite of a dozen opponents, and the legacy formula is what existing documented seeds assume. Recommendation: keep CRC-32; revisit if a suite ever exceeds a few thousand matchups.

## References

- `pokemon/src/pokesearch/sim/engine_adapter.py` — verified: `STALL_TURNS = 12`; `max_steps = 3000` as `run_game`'s default; `_material(state)` returning, per player, `len(prize), len(left), len(discard), len(hand), len(board), sum(hp of board)`; the stall loop comparing `now == history[-2]` with the comment that the signature alternates between the two players, so the comparison is two turns back; `_end_reason` distinguishing `prizes` from `no_pokemon` because the third-party engine only named `deck_out`. Consult for the signature and the thresholds.
- `pokemon/src/pokesearch/sim/progress.py` — verified: `_seed(suite, *parts) = (suite["seed0"] + zlib.crc32("|".join(parts).encode())) % 1_000_000_007`, with the comment that Python's `hash()` of a string changes per process and is unusable for a frozen suite (RN-46).
- `pokemon/src/pokesearch/sim/runner.py` — verified: `play_batch` building tasks as `(deck_a, deck_b, policy_a, policy_b, seed0 + i, i % 2 == 0)` and collecting them with `as_completed`, i.e. in completion order; `_play_one` seeding the two policies with `seed*2+1` and `seed*2+2`, separately from the engine's own `seed`. Consult for the aggregation habit BR-S04.T10-06 replaces.
- `pokemon/ESPECIFICACAO.md` §4.2 RN-20 — verified: the measured end-reason distribution "54 % prêmios, 32 % fim de deck, 12 % sem Pokémon, 2 % estagnação"; §4.4 RN-47 (`PYTHONHASHSEED=0` enforced by scripts re-executing themselves) and RN-50 (performance changes accepted only with an identical result hash).
- [S04.T03](T03-game-state-model.md) BR-S04.T03-06 — the no-hash-iteration rule that makes RN-47 superseded rather than re-implemented.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
