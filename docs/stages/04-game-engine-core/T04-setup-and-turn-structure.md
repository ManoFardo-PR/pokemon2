# S04.T04 — Setup and turn structure

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 4 / 18 |
| Depends on | [S04.T03](T03-game-state-model.md) |
| Unblocks | [S04.T05](T05-actions-and-legality.md), [S04.T10](T10-termination-stall-and-determinism.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` state model — from [S04.T03](T03-game-state-model.md)
- `doc` ESPECIFICACAO.md RN-10, RN-11, RN-20 (deck-out rule)
- `file` `pokemon/src/pokesearch/sim/status.py` `_install_rule_fixes` and `pokemon/tests/test_rules.py` — the three first-turn corrections with their rulebook quotations; read-only reference

## Outputs (proposed)
- `module` `ptcg-core::setup` — shuffle with the game RNG, opening hands of 7 with mulligan loop (opponent may draw 1 per mulligan — prompt later), choose Active + optional bench Basics via prompts, 6 prizes, first-player coin; `ptcg-core::turn` — start-of-turn draw (starter draws on turn 1), per-turn budgets `{ energy_attached, supporter_played, stadium_played, stadium_used, retreated }`, `end_turn()` → between-turns phase hook → switch — consumed by [S04.T05](T05-actions-and-legality.md), [S04.T10](T10-termination-stall-and-determinism.md)
- `contract` first-turn rules: the starting player cannot attack on turn 1; nobody evolves a Pokémon on the turn it was played nor on their own first turn (RN-11)

## Initial objective
Games start and alternate exactly as the rulebook says, including the details the legacy engine got wrong and had to be patched (starter draws on turn 1; only the starter skips the first attack).

## Context

Everything downstream assumes a game that starts correctly and alternates correctly. Four of the six corrections in RN-11 live in this subtask, and all four were found in the legacy by comparing the third-party engine against the official rulebook (`par_rulebook_en.pdf`), one quotation at a time. `pokemon/src/pokesearch/sim/status.py::_install_rule_fixes` carries those quotations verbatim, and `pokemon/tests/test_rules.py` turns each into an assertion. They are worth restating because each one silently distorts every measurement it touches.

*"Start your turn by drawing a card."* — with no exception. The third-party engine only drew inside its turn-switch routine, so the first player never drew on turn 1 and played the whole game one card behind. The legacy patch moves one card from the starter's deck to their hand right after the first-player coin, which is why `test_starting_player_draws_on_the_first_turn` asserts 46 cards left for the starter and 47 for the other player.

*"On the first turn of the game, the starting player skips this step. […] After that, each player attacks as normal."* — the engine blocked attacking for both players on their respective first turns, so the second player lost a whole attack step. The patch lets the second player attack on their first turn while keeping the evolution ban (nobody evolves on their own first turn).

*"She may play the Houndstone card on top of the Greavard card, keeping any damage counters."* — evolving replaced the Pokémon with a fresh full-HP card, so evolution healed. With damage as counters ([S04.T03](T03-game-state-model.md)) this correction is structural rather than a patch: `evolve_onto` never touches `damage`.

And the sixth correction, the one that is easy to miss: a card that returns to the hand or the deck and is replayed cannot evolve on the turn it is replayed. The engine used the card's factory flag, so a Dunsparce bounced by Run Away Draw came back "veteran" and the play-evolve-draw loop ran to the step cap. Here `Slot::turn_played` is written at play time, from the state, and there is no factory flag to be stale.

RN-10 is the other pillar. A game runs only with exactly 60 cards on each side. The legacy learned this the expensive way: an empty list did not fail — the third-party engine silently loaded its own default deck, and a version with zero cards received a score of 36.7 % that belonged to a completely different deck (`pokemon/src/pokesearch/sim/engine_adapter.py`, the comment above `run_game`'s size check). Here the check is in `Game::new`, before a single card is allocated, and it returns `EngineError::DeckSize { player, cards }`. [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md) also refuses a non-60 list in the builder, but the engine does not trust it.

Deck-out is decided here too, even though [S04.T10](T10-termination-stall-and-determinism.md) owns end reasons: RN-20 says the loss happens on the **mandatory** start-of-turn draw only. A card-effect draw that runs the deck dry does not end the game; the player simply draws fewer. Putting the check inside `start_turn` and nowhere else is what makes that true.

## Scope

- **In scope.** `Game::new` with the 60-card check and the deck allocation; the setup sequence (shuffle, opening hands, mulligan loop, Active and bench choice, prizes, first-player coin, the starter's turn-1 draw); `Phase` transitions; `start_turn` with the mandatory draw and the deck-out signal; `TurnBudget` and its reset; `end_turn` and the between-turns hook point; the first-turn flags (`first_player`, per-player `first_turn`) and the three legality facts derived from them (no attack for the starter on turn 1; no evolution on your own first turn; no evolution of a Pokémon played this turn).
- **Out of scope.** The action enum and the rest of legality ([S04.T05](T05-actions-and-legality.md)) — this subtask exposes the flags, T05 consults them; the prompts used by setup ([S04.T09](T09-prompt-protocol.md)) — setup calls `pending_prompt` with purposes `opening_active` and `bench_setup`, defined there; what the between-turns hook actually does ([S04.T08](T08-special-conditions-and-checkup.md)); end reasons, stall and the step cap ([S04.T10](T10-termination-stall-and-determinism.md)) — `start_turn` returns a deck-out signal, T10 turns it into an `Outcome`; RNG stream construction ([S04.T10](T10-termination-stall-and-determinism.md)) — setup uses `game.rng`, whose seeding is defined there.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-10 | **Kept.** A game runs only with exactly 60 cards per side. `Game::new` counts both decks before allocating anything and returns `EngineError::DeckSize { player, cards }` otherwise; there is no default deck and no partial game. | `Game::new`, first statement | `setup.rs > deck_of_59_is_refused`, `> deck_of_0_is_refused`, `> deck_of_61_is_refused`; scenario `rules/deck-size-60.json` |
| RN-11 | **Kept (four of six here).** (a) The starting player draws on turn 1. (b) Only the starting player skips the attack step on turn 1. (c) Nobody evolves on their own first turn. (d) A Pokémon does not evolve on the turn it entered play, including a card that left play and was replayed. | (a) `setup::finish` draws one for `first_player`; (b) `turn::can_attack_this_turn`; (c)/(d) `turn::can_evolve(slot)` reading `player.first_turn` and `slot.turn_played` | `rules.rs > starter_draws_on_turn_one` (starter deck 46, other 47); `> only_starter_skips_first_attack`; `> nobody_evolves_on_their_own_first_turn`; `> replayed_card_cannot_evolve_this_turn`; scenarios `rules/first-turn-draw.json`, `rules/first-turn-attack.json`, `rules/replayed-basic-no-evolve.json` ([S04.T13](T13-scenario-format-and-runner.md)) |
| BR-S04.T04-01 | Setup order is fixed and deterministic: shuffle P0 deck, shuffle P1 deck, coin for first player, deal 7 to P0, deal 7 to P1, mulligan loop, Active/bench prompts (first player first), 6 prizes each from the top, starter's turn-1 draw. Every random draw comes from `game.rng` in that order. | `setup::run(game)` as a single straight-line function | `setup.rs > setup_sequence_is_fixed` (two `Game::new` calls with the same seed produce byte-identical states); `> rng_draw_count_is_stable` |
| BR-S04.T04-02 | A mulligan is: reveal the hand, shuffle it back, draw 7 again; the opponent **may** draw one card per mulligan the opponent's opponent took, asked once at the end of the loop as a single `Confirm` prompt carrying the count. The loop is bounded at 20 iterations per player. | `setup::mulligan_loop` | `setup.rs > hand_without_basic_is_mulliganed`; `> opponent_may_draw_one_per_mulligan`; `> mulligan_loop_is_bounded` |
| BR-S04.T04-03 | The mandatory draw is the only deck-out trigger: `start_turn` returns `StartTurn::DeckOut` when the current player's deck is empty before drawing; no other draw path ends the game (RN-20's deck-out clause). | `turn::start_turn`; `Game::draw_one` returns `Option` and never signals termination | `turn.rs > empty_deck_on_mandatory_draw_signals_deckout`; `> effect_draw_on_empty_deck_does_not_end_the_game` |
| BR-S04.T04-04 | The per-turn budget is reset at `start_turn` and only there: `energy_attached = 0`, `supporter_played = false`, `stadium_played = false`, `stadium_used = false`, `retreated = false`. No effect resets a budget except through an explicit marker. | `turn::start_turn` calling `TurnBudget::reset()` | `turn.rs > budget_resets_only_at_start_of_turn` |
| BR-S04.T04-05 | `turn_no` increases by one at every `start_turn` and is never decremented; `current` alternates strictly; `first_player` is written once at setup and never again. | `turn::end_turn` → `start_turn`; `first_player` has no setter | `turn.rs > turn_no_is_monotonic_and_alternating` over 200 simulated turns |
| BR-S04.T04-06 | Setup leaves a state that satisfies the zone invariant and the counts: each player has 7 in hand, 6 prizes, exactly one Active, 0–5 benched Basics, and 60 − 7 − 6 − (1 + benched) cards in the deck, plus the starter's extra draw. | `setup::run` ends with `assert_invariants()` and a count check in debug | `setup.rs > opening_counts` (7 hand, 6 prizes, 47 deck before the starter's draw, 46 after) |
| BR-S04.T04-07 | A player who cannot put any Basic into play after 20 mulligans loses the setup: the game ends immediately with `EndReason::NoPokemon` against them, rather than looping or starting an unplayable game. | `setup::mulligan_loop` bound feeding `Game::outcome` | `setup.rs > a_deck_with_no_basic_ends_setup_as_no_pokemon` |
| BR-S04.T04-08 | Between turns is a phase, not a callback: `end_turn` sets `phase = BetweenTurns`, runs the hook, then sets `phase = Turn` for the next player. The hook is a no-op until [S04.T08](T08-special-conditions-and-checkup.md) fills it, and it may leave a prompt pending, in which case the turn does not switch until the prompt is answered. | `turn::end_turn` state machine | `turn.rs > between_turns_phase_is_entered_and_left`; `> a_pending_prompt_between_turns_delays_the_switch` |

## Data operations

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `cards: Vec<CardInst>` | allocated, 120 entries, all `zone = Deck` | `Game::new`, after the 60-card check | never allocated for an invalid deck (RN-10) |
| `Player::deck` | full Fisher–Yates shuffle using `game.rng` | setup step 1, once per player | P0 shuffled before P1, always, so the RNG stream is reproducible (BR-S04.T04-01) |
| `Player::hand` | 7 cards moved from the deck top | setup step 4 and after every mulligan | exactly 7 after the loop ends |
| `Player::deck` ← `Player::hand` | whole hand returned, then reshuffled | each mulligan | the reshuffle is a fresh Fisher–Yates on the whole deck |
| `Player::hand` | +1 per mulligan the opponent took | after the mulligan loop, if the player accepts | at most `opponent_mulligans` extra cards, never more |
| `Player::active` | one Basic from hand → `Some(Slot)` | setup, `opening_active` prompt | mandatory; a hand with no Basic triggers a mulligan instead (BR-S04.T04-02) |
| `Player::bench[i]` | 0–5 Basics from hand | setup, `bench_setup` prompt | `bench_limit` is 5 at setup; Area Zero-style effects are not in play yet |
| `Player::prizes` | 6 cards from the deck top | setup, after both boards are set | exactly 6; contents never revealed to the owner ([S06.T01](../06-bots/T01-honest-information-view.md)) |
| `Game::first_player` | written once | setup, coin flip from `game.rng` | never rewritten (BR-S04.T04-05) |
| `Player::hand` (starter) | +1 card | end of setup | RN-11 (a): the starter draws on turn 1, so their deck is 46 and the other's 47 |
| `Game::turn_no` | `+= 1` | `start_turn` | monotonic; `turn_no = 1` is the starter's first turn |
| `Game::current` | flipped | `end_turn` → `start_turn` | strict alternation |
| `Game::phase` | `Setup` → `Turn` → `BetweenTurns` → `Turn` → … → `Ended` | setup end, `end_turn`, termination | a pending prompt freezes the phase until answered (BR-S04.T04-08) |
| `Player::turn` (budget) | reset to zero/false | `start_turn`, before the mandatory draw | reset happens exactly once per turn (BR-S04.T04-04) |
| `Player::hand` | +1 from the deck | `start_turn`, mandatory draw | an empty deck here is the deck-out signal (BR-S04.T04-03, RN-20) |
| `Player::knocked_out_last_turn` | cleared | `start_turn` of the owner | the list covers the window since the owner's previous turn ended |
| `Slot::turn_played` | `= turn_no` | on `bench_put`, `promote` from hand, `evolve_onto` | read by the evolution ban (RN-11 (d)); never reset by leaving and re-entering play, because a new slot is a new value |
| `Player::first_turn` | `true` at setup, `false` at the owner's second `start_turn` | `start_turn` | read by the attack and evolution bans (RN-11 (b), (c)) |
| the database | — | never | the engine holds no connection |

## Interfaces

```rust
// ptcg-core::setup
pub struct SetupOptions {
    pub max_mulligans: u8,      // 20 (BR-S04.T04-07)
    pub bench_at_setup: u8,     // 5
}
impl Default for SetupOptions { /* the values above */ }

/// Runs the whole setup. Returns Pending when a prompt must be answered before it can continue;
/// the caller (Game::apply / the driver in S04.T12) calls `setup::resume` after `answer`.
pub(crate) fn run(game: &mut Game, opts: SetupOptions) -> SetupState;
pub(crate) fn resume(game: &mut Game) -> SetupState;

pub enum SetupState { Pending, Done, Ended }   // Ended = BR-S04.T04-07

// ptcg-core::turn
#[derive(Debug, Clone, Copy, Default)]
pub struct TurnBudget {
    pub energy_attached: u8,       // 0 or 1 per turn unless a modifier raises it
    pub supporter_played: bool,
    pub stadium_played: bool,
    pub stadium_used: bool,
    pub retreated: bool,
}
impl TurnBudget { pub fn reset(&mut self) { *self = Self::default() } }

pub enum StartTurn { Ok, DeckOut }

pub(crate) fn start_turn(game: &mut Game) -> StartTurn;
pub(crate) fn end_turn(game: &mut Game);           // → BetweenTurns → hook → next player's start_turn
pub(crate) fn between_turns(game: &mut Game);      // no-op here; filled by S04.T08

/// The three first-turn facts S04.T05 consults. They are queries, never stored booleans on actions.
pub fn can_attack_this_turn(game: &Game, p: PlayerIdx) -> bool;   // RN-11 (b)
pub fn can_evolve(game: &Game, p: PlayerIdx, s: SlotIdx) -> bool; // RN-11 (c) and (d)
pub fn is_first_turn_of(game: &Game, p: PlayerIdx) -> bool;
```

**`can_attack_this_turn`** is `!(game.turn_no == 1 && p == game.first_player)`. It deliberately does not consult conditions or turn effects; those belong to [S04.T05](T05-actions-and-legality.md) and [S04.T08](T08-special-conditions-and-checkup.md), and keeping them apart is what makes the RN-11 scenario assert one thing.

**`can_evolve`** is `!game.players[p].first_turn && slot.turn_played < game.turn_no`. The second clause covers both "played this turn" and "replayed this turn", because the slot is created at play time.

**Setup prompts** (kinds and purposes are defined in [S04.T09](T09-prompt-protocol.md)):

| Step | Prompt | `actor` | `purpose` | Notes |
|---|---|---|---|---|
| choose the opening Active | `ChooseCards { zone: Hand, candidates: Basics }` | the player | `opening_active` | min 1, max 1, not cancellable |
| place opening bench | `ChooseCards { zone: Hand, candidates: Basics }` | the player | `bench_setup` | min 0, max `bench_limit`, cancellable (means "no more") |
| accept mulligan draws | `Confirm { count }` | the player | `may_use` | asked once, after the loop |

**Turn loop, as the driver sees it:**

```text
Setup → (prompts) → start_turn(P=first_player)          turn_no = 1
  repeat: legal_actions / apply / answer …
  EndTurn action or a lock  →  end_turn()
     phase = BetweenTurns → between_turns() → [prompts?] → phase = Turn
  start_turn(other player)                               turn_no += 1
```

**Constants defined here:** `MAX_MULLIGANS = 20`, `OPENING_HAND = 7`, `PRIZES = 6`, `SETUP_BENCH_LIMIT = 5`. `STALL_TURNS` and `MAX_STEPS` belong to [S04.T10](T10-termination-stall-and-determinism.md).

## Implementation steps

1. Implement `Game::new` with the 60-card check, the `cards` allocation and the per-player deck fill; spec the three refusal cases (RN-10). `cargo test` green.
2. Implement the shuffle and the deal in `setup::run` with a fixed order and no prompts yet (Active chosen as the first Basic); spec `> setup_sequence_is_fixed` and `> opening_counts` (BR-S04.T04-01, -06).
3. Add the mulligan loop with the bound and the "no Basic after 20" ending; spec both paths (BR-S04.T04-02, -07).
4. Replace the placeholder Active choice with the `opening_active` and `bench_setup` prompts and the `SetupState::Pending`/`resume` protocol; spec that a driver answering both prompts reaches `Done`.
5. Add the opponent's mulligan draws as one `Confirm` prompt carrying the count; spec that accepting draws exactly that many cards (BR-S04.T04-02).
6. Add the first-player coin and the starter's turn-1 draw; spec `> starter_draws_on_turn_one` with 46/47 (RN-11 (a)).
7. Implement `start_turn` (budget reset, `turn_no += 1`, `knocked_out_last_turn` clear, mandatory draw, `StartTurn::DeckOut`) and `end_turn` with the `BetweenTurns` phase and the no-op hook; spec BR-S04.T04-03, -04, -05, -08.
8. Add `can_attack_this_turn`, `can_evolve`, `is_first_turn_of` and clear `first_turn` at the owner's second `start_turn`; spec `> only_starter_skips_first_attack`, `> nobody_evolves_on_their_own_first_turn`, `> replayed_card_cannot_evolve_this_turn` (RN-11 (b), (c), (d)).
9. Write a driver-only smoke test that runs 200 turns of an empty turn loop (start, end, start, …) with no actions, asserting alternation, budget resets and a deck-out at the expected turn.
10. Record the RNG draw count of a full setup (shuffles, coin, mulligans) in the module header, so [S04.T10](T10-termination-stall-and-determinism.md) can assert that a bot change does not perturb it.

## Edge cases and error handling

- **A deck of 59, 61 or 0 cards** → `Game::new` returns `EngineError::DeckSize { player, cards }` and allocates nothing. Zero is called out explicitly because that is the legacy failure: an empty list scored 36.7 % against a deck that was never played.
- **An opening hand with no Basic** → mulligan: reveal, shuffle back, redraw seven. The opponent's entitlement to one card per mulligan is counted and offered once at the end, not after each one, so the prompt count does not depend on luck.
- **Both players mulligan** → each counts the other's mulligans; both may draw. The offers are resolved in player order (0 then 1) so the RNG and prompt order stay deterministic.
- **A deck with no Basic at all** → 20 mulligans, then `EndReason::NoPokemon` against that player and `phase = Ended`. The game is not started; [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md)'s `NO_BASIC` check should have caught it, but the engine does not rely on that.
- **The mandatory draw on an empty deck** → `StartTurn::DeckOut`. The budget has already been reset and `turn_no` incremented, so the turn count reported in the outcome includes the turn the player could not start — which matches how the legacy counted turns in `GameResult.turns`.
- **An effect draws the last card of the deck** → nothing happens. The player simply holds an empty deck until their next mandatory draw. This is RN-20's "mandatory draw only" clause and the most common way a rule engine accidentally ends a game early.
- **A prompt pending when `end_turn` is called** → `end_turn` refuses with `EngineError::IllegalAction`; a turn ends only from a settled state. The driver ([S04.T12](T12-cli-job-protocol.md)) always answers a pending prompt before offering actions.
- **`between_turns` leaves a prompt pending** (a knockout during checkup needs a promotion) → the phase stays `BetweenTurns` and `current` does not flip until the prompt is answered; [S04.T08](T08-special-conditions-and-checkup.md) relies on this being a phase rather than a callback.
- **A player has an empty bench and their Active is knocked out during their own turn** → the game ends with `EndReason::NoPokemon`; the turn structure does not attempt to start a turn for a player with no Pokémon ([S04.T10](T10-termination-stall-and-determinism.md) owns the check, `end_turn` calls it).
- **`turn_no` overflow** → `u16` gives 65,535 turns and the step cap of 3,000 stops a game long before; a debug assertion catches the impossible case rather than wrapping.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core setup` green, including `> deck_of_59_is_refused`, `> deck_of_0_is_refused`, `> deck_of_61_is_refused` with `EngineError::DeckSize` carrying the player and the count (RN-10).
- [ ] `cargo test -p ptcg-core rules::starter_draws_on_turn_one` — after setup the starting player holds 8 cards with 46 in deck, the other 7 with 47 (RN-11 (a)).
- [ ] `cargo test -p ptcg-core rules::only_starter_skips_first_attack` — on turn 1 the starter's legal actions contain no `Attack`, and the second player's first turn does contain one (RN-11 (b)).
- [ ] `cargo test -p ptcg-core rules::nobody_evolves_on_their_own_first_turn` and `rules::replayed_card_cannot_evolve_this_turn` — a Basic returned to hand and replayed is not an evolution target the same turn (RN-11 (c), (d)).
- [ ] Scenario `engine/scenarios/rules/first-turn-draw.json`, `rules/first-turn-attack.json`, `rules/replayed-basic-no-evolve.json` and `rules/deck-size-60.json` pass under the runner of [S04.T13](T13-scenario-format-and-runner.md).
- [ ] `> setup_sequence_is_fixed`: two `Game::new` calls with the same seed and the same decks, answered by the same scripted prompt answers, produce byte-identical serialized states (BR-S04.T04-01).
- [ ] `> empty_deck_on_mandatory_draw_signals_deckout` and `> effect_draw_on_empty_deck_does_not_end_the_game` (BR-S04.T04-03, RN-20).
- [ ] `> budget_resets_only_at_start_of_turn` and `> turn_no_is_monotonic_and_alternating` over a 200-turn empty loop (BR-S04.T04-04, -05).
- [ ] `> a_deck_with_no_basic_ends_setup_as_no_pokemon` after exactly 20 mulligans (BR-S04.T04-07).

## Risks and open questions

- **Risk — the mulligan draw offer changes the RNG stream.** Offering the opponent's draws after the loop rather than per mulligan changes how many cards are drawn and when. Mitigation: the order is fixed by BR-S04.T04-01 and asserted by `> rng_draw_count_is_stable`; any change to it is a change to every stored fingerprint and must be treated as a new engine build (RN-50).
- **Risk — the rulebook's mulligan procedure differs from what the bots expect.** A bot that never declines the extra draw is fine; one that declines changes its own hand size and therefore its own decisions. Mitigation: the offer is a prompt with a default resolver ([S04.T09](T09-prompt-protocol.md)) that accepts, so the baseline bots behave identically until someone deliberately changes it.
- **Risk — the first-turn rules interact with effects that grant an extra turn.** No such card is in the current Standard pool, but `turn_no == 1` is a weaker test than "this player's first turn". Mitigation: `can_attack_this_turn` uses `turn_no == 1 && p == first_player`, and `can_evolve` uses the per-player `first_turn` flag, so a future extra-turn effect only has to leave `first_turn` alone.
- **Question — should the opening bench choice be one prompt with `min 0, max 5` or a loop of single choices?** One prompt is O(n) to validate and matches the prompt contract; a loop is closer to how a person plays and gives bots more information per decision. Recommendation: one prompt; revisit if [S06.T03](../06-bots/T03-planner-turn-policy.md) finds the single choice too coarse.
- **Question — should the engine also refuse a deck with more than four copies of a card?** RN-10 says nothing about copies, and the legacy explicitly did not validate it outside the optimizer (ESPECIFICACAO §4.2, "O que o sistema não valida"). Recommendation: leave it to [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md) (`COPY_LIMIT`), so a deliberately illegal test deck can still be simulated. The user decides if the engine should refuse as well.

## References

- `pokemon/src/pokesearch/sim/status.py` — verified: `_install_rule_fixes()` with the four rulebook quotations in its docstring (evolution keeps damage counters; only the starting player skips the first attack; "Start your turn by drawing a card"; the tool re-pointing after evolution) and item 6 on a replayed card's `firstTurnPlayed`; the `_determine_first_player` patch that moves one card from `LEFT` to `HAND` for the starter; the `get_actions` patch that lets the second player attack on their first turn while filtering out `EvolvePokemonAction`. Consult for the exact rulebook wording; nothing is ported.
- `pokemon/tests/test_rules.py` — verified: `test_starting_player_draws_on_the_first_turn` (46 for the starter, 47 for the other), `test_only_the_starting_player_skips_the_first_attack`, `test_evolving_keeps_damage_counters` (90 − 30), `test_a_card_that_comes_back_to_the_hand_cannot_evolve_the_turn_it_is_played_again`. These four become the first scenarios of [S04.T13](T13-scenario-format-and-runner.md).
- `pokemon/src/pokesearch/sim/engine_adapter.py` — verified: `run_game` refuses any side whose `deck_size` is not 60, with the comment that an empty list made the third-party engine load its own `charizard_ex` deck and a 0-card version scored 36.7 % (RN-10).
- [S04.T03](T03-game-state-model.md) — the zone primitives, `Slot::turn_played` and the phase field this subtask drives.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-10, RN-11, RN-20.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
