# S06.T01 — Honest information view

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 1 / 8 |
| Depends on | [S04.T03](../04-game-engine-core/T03-game-state-model.md), [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) |
| Unblocks | [S06.T03](T03-planner-turn-policy.md), [S06.T05](T05-rollout-bot.md) |
| Parallel with | [S06.T02](T02-deck-profile-analysis.md), [S06.T07](T07-bot-registry-and-freezing.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` game state (zones, hidden prizes) — from [S04.T03](../04-game-engine-core/T03-game-state-model.md)
- `contract` prompts (`actor`) — from [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)
- `doc` ESPECIFICACAO.md RN-30

## Outputs (proposed)
- `module` `ptcg-core::view::PlayerView` — built per decision for the acting player: own hand, board, discard, known decklist (`Multiset<def>`), `own_deck_and_prizes_pool` (one pile until the first own-deck search, then exact deck contents and prize multiset), opponent: board, discard, hand size, deck size, prize count only; `View::determinize(rng)` samples hidden zones consistently with the known multisets — consumed by [S06.T03](T03-planner-turn-policy.md), [S06.T05](T05-rollout-bot.md)

## Initial objective
Bots cannot cheat by construction: the view given to a bot never contains the opponent's hand, deck order or prizes, and the bot's knowledge of its own deck evolves exactly as a careful human's would.

## Context

[S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md) shipped the `Bot` trait with `pub type View<'a> = &'a Game`, an honest placeholder: for a random bot and a printed-damage heuristic it does not matter that the whole state is reachable, because neither reads anything hidden. From this subtask on it matters a great deal. The planner reasons about what is left in its own deck ([S06.T03](T03-planner-turn-policy.md)), and the lookahead bots sample hidden zones and play them out ([S06.T05](T05-rollout-bot.md), [S06.T06](T06-ismcts-bot.md)) — both are exactly the places where a bot that could peek would quietly become a bot that does. This subtask replaces the alias with a real projection and makes the peek impossible at the type level rather than by convention.

RN-30 states the rule the legacy already followed, and the legacy's own phrasing is the specification. `pilot.py::Knowledge` builds its picture from every card the player owns — hand, deck, prizes, discard and the full stacks in play — because the 60-card list is the player's own and a real player knows what is in it. What it deliberately does *not* know is which six of the unseen cards are prizes: `in_deck()` returns `decklist − visible` as one multiset until `saw_own_deck()` fires, and only then does it split into the exact deck contents and the exact prize multiset. `saw_own_deck()` is called from exactly one place — the moment a card-choice prompt's candidates come from `me.left`, that is, the first time the player searches their own deck — with the comment *"quem busca no deck conta as cartas e descobre os prêmios"*. That single transition is the whole of the legacy's information model, and `tests/test_pilot.py::test_knowledge_cannot_tell_deck_from_prizes_until_it_searches_the_deck` pins it: before the search a prized Kadabra counts as "could be in the deck"; after it, `prized()` is 1 and `in_deck()` is 0.

Three things change here. **The transition is a state field, not a bot field.** [S04.T03](../04-game-engine-core/T03-game-state-model.md) already declares `Player::deck_searched` for exactly this purpose, so the engine raises the flag when it opens a prompt whose candidates are the owner's own deck, and every bot — including a fresh one constructed mid-game by a rollout — sees the same knowledge. In the legacy the flag lived inside one policy's closure, which meant a second bot instance started blind and a determinization could not reproduce it.

**The projection is total and typed.** `PlayerView` has no field that can hold an opponent's card identity. Where the legacy relied on a bot merely *not* reading `other.hand`, here the type does not carry it, and a policy test asserts the struct's field list. The one exception the rules require is the opponent's discard pile and board, which are public; those carry `DefIdx` values like the player's own.

**Determinization is a first-class operation.** The legacy could not look ahead at all — its engine was a generator that could only be advanced — so there was nothing to sample for. With `Game: Clone` costing microseconds ([S04.T03](../04-game-engine-core/T03-game-state-model.md) BR-S04.T03-03), a bot can sample a concrete hidden state consistent with what it legitimately knows, clone it and play it out. `determinize` is the function that turns a view back into a full `Game` without inventing information: it shuffles the acting player's unseen pile under the constraints the view records, and fills the opponent's hidden zones from the cards the opponent is known to own minus what has been seen. Getting this wrong in the optimistic direction is the classic way a lookahead bot cheats, so the sampler is tested against the view it came from rather than against the truth.

One property is worth stating because it costs nothing now and is expensive later: the view is **derived**, never stored. It is built from `&Game` on each decision, and building it is cheap enough that a rollout bot rebuilding it thousands of times per turn does not care. Caching it would introduce a staleness class of bug precisely in the module whose job is to be trustworthy.

## Scope

- **In scope.** `ptcg-core::view` with `PlayerView`, `OpponentView`, `OwnKnowledge` and their constructors from `&Game`; the `deck_searched` transition and its raise point in the prompt layer; `PlayerView::determinize(rng) -> Game`; the multiset type used for unseen cards; the replacement of `type View<'a> = &'a Game` by `&'a PlayerView` in the `Bot` trait and in both baseline bots; the policy test asserting the struct cannot name an opponent's hidden card; the construction and determinization benchmarks.
- **Out of scope.** What a bot concludes from a view — the deck profile ([S06.T02](T02-deck-profile-analysis.md)), the turn policy ([S06.T03](T03-planner-turn-policy.md)), the need function ([S06.T04](T04-need-scoring-and-prompt-resolvers.md)); the playout loop that consumes `determinize` ([S06.T05](T05-rollout-bot.md)); the information-set tree ([S06.T06](T06-ismcts-bot.md)); the engine-side hiding of prize identities in prompts, which is [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-06 and is assumed here; anything about the opponent's *bot*, which is a separate instance with its own view.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-30 | **Kept, made native.** A bot sees: its own hand, board, discard and full 60-card decklist; the opponent's board, discard, hand size, deck size and prize count. Its own deck and prizes are a single unseen multiset until the first search of its own deck, after which the deck contents and the prize multiset are exact. It never sees the opponent's hand, deck, prize identities or any zone order it has not legitimately observed. | `PlayerView` has no field carrying an opponent hidden-card identity; `OwnKnowledge::unseen` is one multiset while `!deck_searched` | `view.rs > no_opponent_hidden_identity_is_reachable` (property test over 10,000 random states: every `DefIdx` in the view is in a public zone or in the viewer's own cards); `> prizes_are_unknown_until_the_first_own_deck_search`; `policy.rs > player_view_field_list_is_frozen` |
| BR-S06.T01-01 | `PlayerView::of(game, p)` is a pure function of `(game, p)`: it mutates nothing, allocates only its own buffers, and two calls on the same state produce equal views. | `view::PlayerView::of(&Game, PlayerIdx) -> PlayerView`, taking `&Game` | `view.rs > of_is_pure` (state serialized before and after is byte-identical); `> two_calls_give_equal_views` |
| BR-S06.T01-02 | `Player::deck_searched` flips to `true` exactly when a prompt whose `owner` is that player and whose `zone` is that player's `Deck` is **opened**, and never for any other reason; it is never reset within a game. | `Game::open_choose_cards` sets it for `Zone::Deck` prompts ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md)); no other writer | `view.rs > a_deck_search_prompt_flips_deck_searched`; `> a_discard_search_does_not`; `> an_opponent_deck_prompt_does_not_flip_my_flag`; `> the_flag_never_returns_to_false` (property test over 200 games) |
| BR-S06.T01-03 | Before the flag, `unseen` is `decklist − visible` as one multiset and `prizes` is `None`; after it, `deck` is the exact remaining deck multiset, `prizes` is `Some(multiset)` and `deck + prizes == unseen` for the same state. | the two-branch constructor of `OwnKnowledge` | `view.rs > unseen_splits_into_deck_and_prizes_on_the_flag` (the sum is invariant across the transition); `> prizes_is_none_before_the_flag` |
| BR-S06.T01-04 | A view records **counts and order only where the order is public**: the opponent's hand and deck appear as `u8` counts, the viewer's own deck appears as an unordered multiset even after the flag, and the only ordered sequences are the viewer's hand, both discards and both boards. | the field types (`u8` for hidden counts, `Multiset<DefIdx>` for the own deck) | `view.rs > own_deck_is_a_multiset_not_a_sequence` (a shuffle of the real deck leaves the view equal); `> opponent_hand_is_a_count` |
| BR-S06.T01-05 | `determinize(rng)` produces a `Game` consistent with the view: every fact the view states holds in the sample, and the sample uses only the acting player's own RNG stream. It never reads the true hidden state. | `PlayerView::determinize(&mut Rng) -> Game`; the function takes `&self`, not `&Game` | `view.rs > a_determinization_matches_its_view` (property test, 5,000 samples: rebuilding the view from the sample yields the original view); `> determinize_does_not_read_the_truth` (a sample drawn from a view whose truth was replaced by a different consistent state is still valid) |
| BR-S06.T01-06 | Determinization is unbiased under the stated knowledge: over many samples, each arrangement of the unseen cards consistent with the view is equally likely. | a Fisher–Yates shuffle of the unseen multiset, then a deterministic deal into deck, prizes and the opponent's hidden zones in a fixed order | `view.rs > determinize_is_uniform` (chi-square over 100,000 samples on a 5-card unseen pile with 2 prizes, p > 0.01) |
| BR-S06.T01-07 | The `Bot` trait's `View` is `&PlayerView` from this subtask on; no bot receives a `&Game`, and `ptcg-core::bots` does not import `state::Game` except through the view module. | the trait signature change in [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md); an import-graph assertion | `policy.rs > bots_do_not_import_game`; `cargo test -p ptcg-core bots` still green after the swap |
| BR-S06.T01-08 | Building a view is cheap enough to do per decision: `PlayerView::of` on a mid-game state costs under 5 µs in release on this machine, and the number is recorded. | the buffers are `SmallVec`s sized from the state; no allocation per card | `cargo bench view_build` with the figure written into `engine/README.md` (BR checked against the recorded value, not against a guess) |

## Data operations

The engine never opens the database; this module reads state and returns a struct. The table below is the **observation table**: what a bot may legitimately learn, where the fact comes from, and the invariant that keeps it honest.

| Fact | Exposed as | Visible when | Invariant |
|---|---|---|---|
| own 60-card list | `own.decklist: Multiset<DefIdx>` | always | fixed at `new_game`; equals the multiset of the viewer's `CardInst`s regardless of zone (RN-30) |
| own hand | `own.hand: SmallVec<[DefIdx; 12]>`, in hand order | always | order is the state's `Player::hand` order, which prompts index into ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md)) |
| own discard | `own.discard: Multiset<DefIdx>` | always | public information; the opponent's is exposed identically |
| own lost zone | `own.lost_zone: Multiset<DefIdx>` | always | public |
| own board | `own.slots: SmallVec<[SlotView; 9]>` (active first, then bench 1..8) | always | `SlotView` carries `def`, `under`, `energies`, `tools`, `damage`, `hp_max`, `conditions`, `turn_played`, `markers`; slot indices match the state's, holes included |
| own deck + prizes | `own.unseen: Multiset<DefIdx>`, `own.deck: None`, `own.prizes: None` | while `!deck_searched` | `unseen == decklist − visible` (BR-S06.T01-03) |
| own deck contents | `own.deck: Some(Multiset<DefIdx>)` | once `deck_searched` | unordered; a shuffle of the real deck does not change the view (BR-S06.T01-04) |
| own prizes | `own.prizes: Some(Multiset<DefIdx>)` | once `deck_searched` | the multiset only; which physical prize holds which card is never exposed |
| own prize count | `own.prizes_left: u8` | always | taken from `Player::prizes.len()`, independent of the flag |
| own deck size | `own.deck_len: u8` | always | the count is public even before the split |
| own turn budget | `own.turn: TurnBudgetView` | always | `energy_attached`, `supporter_played`, `stadium_played`, `stadium_used`, `retreated` |
| opponent board | `opp.slots: SmallVec<[SlotView; 9]>` | always | public; same shape as the viewer's |
| opponent discard, lost zone | `opp.discard`, `opp.lost_zone: Multiset<DefIdx>` | always | public |
| opponent hand | `opp.hand_len: u8` | always | **no identities**; RN-30 |
| opponent deck | `opp.deck_len: u8` | always | **no identities and no order**; RN-30 |
| opponent prizes | `opp.prizes_left: u8` | always | **no identities**; a `choose_prize` prompt lists positions only ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-06) |
| opponent decklist | — | never | a player does not know the opponent's list; inferring from what has been played is a future bot feature, not a view field |
| stadium, turn number, phase, first player | `stadium: Option<DefIdx>`, `turn_no`, `phase`, `i_moved_first: bool` | always | public game facts |
| the pending prompt | passed separately to `answer_prompt` | when one is pending | the bot only ever receives prompts whose `actor` is itself ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md) BR-S04.T09-02) |
| `invalid_actions`, `Game::rng`, `frames` | — | never | engine bookkeeping; exposing the RNG would let a bot predict shuffles |
| the database | — | never | Architecture principle 1 |

## Interfaces

```rust
// ptcg-core::view

/// An unordered count of card definitions. Backed by a sorted SmallVec of (DefIdx, u8) pairs,
/// so equality and hashing are structural and no HashMap iteration enters game logic
/// (S04.T03 BR-S04.T03-06).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Multiset(SmallVec<[(DefIdx, u8); 24]>);
impl Multiset {
    pub fn count(&self, def: DefIdx) -> u8;
    pub fn total(&self) -> u16;
    pub fn iter(&self) -> impl Iterator<Item = (DefIdx, u8)> + '_;
    pub fn sub(&self, other: &Multiset) -> Multiset;     // saturating per definition
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlotView {
    pub slot: SlotIdx,
    pub def: DefIdx,
    pub under: SmallVec<[DefIdx; 2]>,
    pub energies: SmallVec<[DefIdx; 4]>,
    pub tools: SmallVec<[DefIdx; 1]>,
    pub damage: u16,
    pub hp_max: u16,                       // already through the hook (S05.T05)
    pub conditions: Conditions,
    pub turn_played: u16,
    pub markers: SmallVec<[Marker; 2]>,
    pub once_used: SmallVec<[u16; 1]>,     // only for the viewer's own slots; empty for the opponent's
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnKnowledge {
    pub decklist: Multiset,                // RN-30: the list is the player's own
    pub hand: SmallVec<[DefIdx; 12]>,      // ordered: prompts index into this order
    pub discard: Multiset,
    pub lost_zone: Multiset,
    pub unseen: Multiset,                  // deck + prizes, one pile, while deck_searched is false
    pub deck: Option<Multiset>,            // Some only after the first own-deck search
    pub prizes: Option<Multiset>,          // idem
    pub deck_len: u8,
    pub prizes_left: u8,
    pub slots: SmallVec<[SlotView; 9]>,    // active first, then bench 1..8, holes skipped
    pub bench_limit: u8,
    pub turn: TurnBudgetView,
    pub knocked_out_last_turn: SmallVec<[DefIdx; 2]>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpponentView {
    pub slots: SmallVec<[SlotView; 9]>,
    pub discard: Multiset,
    pub lost_zone: Multiset,
    pub hand_len: u8,                      // count only (RN-30)
    pub deck_len: u8,                      // count only (RN-30)
    pub prizes_left: u8,                   // count only (RN-30)
    pub bench_limit: u8,
    pub turn: TurnBudgetView,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayerView {
    pub me: PlayerIdx,
    pub own: OwnKnowledge,
    pub opp: OpponentView,
    pub stadium: Option<DefIdx>,
    pub turn_no: u16,
    pub phase: Phase,
    pub i_moved_first: bool,
    pub defs: Arc<[CardDef]>,              // shared, read-only; the same slice the job carried
}

impl PlayerView {
    pub fn of(game: &Game, me: PlayerIdx) -> PlayerView;
    pub fn def(&self, d: DefIdx) -> &CardDef;
    pub fn active(&self) -> Option<&SlotView>;
    pub fn opp_active(&self) -> Option<&SlotView>;
    /// A concrete Game consistent with this view. Reads nothing outside `self`.
    pub fn determinize(&self, rng: &mut Rng) -> Game;
}
```

`defs` is the one shared field; it is `Arc<[CardDef]>` rather than `&[CardDef]` so a determinized `Game` can own it without a lifetime, and it is read-only, so `Arc` does not violate the no-interior-mutability rule of [S04.T03](../04-game-engine-core/T03-game-state-model.md) BR-S04.T03-03 (the clippy allowance is scoped to this field and noted there).

**The `Bot` trait after the swap** — the signature [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md) wrote, with the alias resolved:

```rust
pub type View<'a> = &'a PlayerView;          // was &'a Game

pub trait Bot: Send {
    fn name(&self) -> &'static str;
    fn choose_action(&mut self, view: View<'_>, actions: &[Action], rng: &mut Rng) -> Action;
    fn answer_prompt(&mut self, view: View<'_>, prompt: &Prompt, rng: &mut Rng) -> Answer;
    fn new_game(&mut self, _view: View<'_>, _me: PlayerIdx) {}
}
```

**The determinization algorithm**, in order. Steps 2 and 3 are what make it honest.

1. Start from a skeleton `Game` with the public facts: both boards from `SlotView`s, both discards, both lost zones, the stadium, the turn number, the phase and the viewer's own hand, all placed exactly as the view states.
2. Build the viewer's hidden pile. While `deck_searched` is false the pile is `own.unseen`; shuffle it and deal `prizes_left` cards into the prize zone and the rest into the deck. Once `deck_searched` is true, the deck multiset and the prize multiset are already known, so only their *orders* are sampled — the prizes keep their multiset and the deck is shuffled.
3. Build the opponent's hidden pile. The view does not know the opponent's list, so the pile is drawn from a **plausible-list model**: the union of the opponent's seen cards' definitions plus `Basic Energy` fillers, sized to `opp.hand_len + opp.deck_len + opp.prizes_left`, sampled with replacement weighted by what has already been seen. This is an approximation and it is declared as one: `determinize` returns `Game` plus a `Determinization { opponent_modelled: bool }` flag, and [S06.T05](T05-rollout-bot.md) reports how often it was set.
4. Recompute derived state (`board_version`, `bench_limit` via the hook, the legal-action cache) and seed `Game::rng` from the sampler's own stream, so a playout's shuffles are reproducible from the bot seed alone.
5. Under `debug_assertions`, assert `PlayerView::of(&sample, me) == *self` — the property BR-S06.T01-05 turns into a test.

**Where `deck_searched` is raised.** The prompt builders of [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) call `Game::note_deck_seen(owner)` when they open a `ChooseCards` prompt whose `zone` is `Zone::Deck` and whose `owner` is that player. Nothing else calls it. A "look at the top 3 cards of your deck" effect also raises it, which is correct: the player has counted cards.

## Implementation steps

1. Add `ptcg-core::view` with `Multiset` and its operations; spec `sub`, `count`, `total` and structural equality. `cargo test -p ptcg-core view` green.
2. Write `SlotView`, `OwnKnowledge`, `OpponentView`, `PlayerView` and `PlayerView::of` for the public facts and the viewer's own zones; spec purity and equality (BR-S06.T01-01).
3. Add the `deck_searched` branch to `OwnKnowledge` and the `note_deck_seen` raise point in the prompt builders; spec the four transition cases (BR-S06.T01-02, -03).
4. Add the policy test that freezes the field list and asserts no opponent hidden identity is reachable, plus the property test over 10,000 random states (RN-30).
5. Change `type View<'a>` to `&'a PlayerView` and adapt `RandomBot` and `HeuristicBot`; the [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md) test suite must stay green unchanged except for construction (BR-S06.T01-07).
6. Implement `determinize` steps 1–2 (own hidden pile) with the debug round-trip assertion; spec consistency and the uniformity chi-square (BR-S06.T01-05, -06).
7. Implement step 3 (the opponent model) behind `Determinization { opponent_modelled }`; spec that the sample's opponent zone sizes match the view exactly even when the identities are modelled.
8. Implement steps 4–5 (derived state, RNG seeding, the assertion) and spec that two determinizations from the same view and seed are byte-identical.
9. Benchmark `PlayerView::of` and `determinize` on a mid-game state; record both figures in `engine/README.md` next to the clone cost (BR-S06.T01-08).
10. Write the `engine/VIEW.md` section of `engine/BOTS.md`: the observation table above, the transition rule, the determinization algorithm and the honest statement that the opponent's hidden cards are modelled, not known.

## Edge cases and error handling

- **A bot asks for a view during the opponent's turn** (a `switch_in_opponent` prompt whose `actor` is the opponent) → the view is built for the *actor*, so the opponent's bot sees its own knowledge. `PlayerView::of(game, prompt.actor)` is the only call the driver makes, which is what keeps `actor`/`owner` meaningful.
- **A prompt over the opponent's deck** (a rare "your opponent searches their deck" effect) → `owner` is the opponent, so `note_deck_seen` raises *their* flag, not the viewer's. Asserted by `> an_opponent_deck_prompt_does_not_flip_my_flag`.
- **The first own-deck search finds nothing** (an empty deck) → the flag still rises: the player counted the cards and learned there were none. `deck` becomes an empty multiset and `prizes` becomes exact, which is the correct inference.
- **A prize is taken before the flag** → `prizes_left` drops and `unseen` loses the taken card once it becomes visible (it moves to the hand). The split has not happened, so no contradiction arises; `unseen == decklist − visible` still holds by construction.
- **A card is moved from the deck to the lost zone face-down by an opponent's effect** → it leaves `unseen` only when the view can see it. If the effect reveals nothing, the card count moves from `deck_len` to `lost_zone` size while the identity stays in `unseen`, which overstates what is still drawable. This is a genuine limitation of counting-based knowledge and is recorded in `engine/BOTS.md`; the alternative — tracking every revealed card — is [S06.T06](T06-ismcts-bot.md)'s belief model, not this subtask's.
- **A determinization of a state whose unseen pile is smaller than the prize count** (impossible in a legal game, reachable in a hand-built scenario) → `determinize` returns `EngineError::Determinization` naming the deficit rather than dealing duplicates; a rollout that hits it aborts that sample and reports it.
- **The opponent has a card in play whose definition the job did not carry** → cannot happen: `card_defs` is the union of both decks ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md) BR-S04.T15-01), so `defs` covers everything either side can show.
- **A view built during `Phase::Setup`** → `slots` may be empty and `hand` is the opening hand; the view is valid and the `opening_active` prompt is answered from it. Nothing special-cases setup.
- **Two views of the same state for the two players** → they are different structs with no shared mutable data, and neither can reconstruct the other's hidden knowledge. The test builds both and asserts each one's `unseen` is disjoint from what the other's view would reveal.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core view` green, including `> no_opponent_hidden_identity_is_reachable` — a property test over 10,000 random mid-game states asserting every `DefIdx` appearing in a view is either in a public zone or among the viewer's own cards (RN-30).
- [ ] `> prizes_are_unknown_until_the_first_own_deck_search`: the legacy Kadabra case reproduced — before the search the prized card counts once in `unseen` and `prizes` is `None`; after it, `prizes` contains it and `deck` does not (RN-30, BR-S06.T01-03).
- [ ] `> a_deck_search_prompt_flips_deck_searched`, `> a_discard_search_does_not`, `> an_opponent_deck_prompt_does_not_flip_my_flag`, `> the_flag_never_returns_to_false` over 200 games (BR-S06.T01-02).
- [ ] `> a_determinization_matches_its_view`: 5,000 samples, each rebuilt into a view that equals the original (BR-S06.T01-05).
- [ ] `> determinize_is_uniform`: 100,000 samples of a 5-card unseen pile with 2 prizes give a chi-square p-value above 0.01 against the uniform distribution over the 10 arrangements (BR-S06.T01-06).
- [ ] `> determinize_does_not_read_the_truth`: a view is detached from its `Game`, the `Game` is mutated into a different state consistent with the same view, and the two determinizations are drawn from the same distribution (a 2,000-sample two-sample test) (BR-S06.T01-05).
- [ ] `> own_deck_is_a_multiset_not_a_sequence` and `> opponent_hand_is_a_count` (BR-S06.T01-04).
- [ ] `cargo test -p ptcg-core bots` is green after `View` becomes `&PlayerView`, with no change to any `RandomBot`/`HeuristicBot` assertion; `policy.rs > bots_do_not_import_game` passes (BR-S06.T01-07).
- [ ] `cargo bench view_build` and `cargo bench determinize` complete, and both figures are written into `engine/README.md`; `PlayerView::of` is under 5 µs on a mid-game state on this machine (BR-S06.T01-08).
- [ ] `> of_is_pure`: the serialized `Game` is byte-identical before and after 1,000 view constructions (BR-S06.T01-01).

## Risks and open questions

- **Risk — the opponent model makes rollouts optimistic.** Sampling the opponent's hidden cards from what has been seen under-weights cards they hold but have not played, which systematically favours the bot doing the lookahead. Mitigation: `Determinization::opponent_modelled` is reported per job by [S06.T05](T05-rollout-bot.md), and the rollout bot is accepted only on a mirror measurement where both sides use the same model, so the bias cancels. A real belief model belongs to [S06.T06](T06-ismcts-bot.md) if the mirror result demands it.
- **Risk — `PlayerView::of` on every decision dominates rollout cost.** A rollout at 128 playouts × 30 turns builds tens of thousands of views per decision. Mitigation: the benchmark in step 9 is the gate; if it is too slow, the fix is an incremental view keyed on `board_version` — deliberately not done now, because a cache in this module is a correctness risk, and the decision is recorded here.
- **Risk — the "counting" model drifts from what a human would know.** A human also remembers which cards an opponent has played and which of their own cards were shuffled back. Mitigation: the view records what the legacy recorded and no more; anything further is a bot feature with its own measurement, so the honesty guarantee stays simple and testable.
- **Question — should the view expose the opponent's `once_used` markers?** They are publicly observable (you can see whether an ability was used this turn), and the planner's gust rule could use them. `SlotView::once_used` is empty for the opponent today. Recommendation: leave it empty until [S06.T03](T03-planner-turn-policy.md) asks for it, then fill it and say so in `engine/BOTS.md`; the user need not decide.
- **Question — should `defs` be `Arc<[CardDef]>` or an index into a job-level table?** `Arc` costs one atomic increment per determinization and keeps the sample self-contained. Recommendation: `Arc`, with the clippy allowance scoped to this one field; revisit only if [S04.T18](../04-game-engine-core/T18-performance-baseline.md) shows the refcount traffic on a 16-thread run.

## References

- `pokemon/src/pokesearch/sim/pilot.py` L188–216 (`Knowledge`) — verified: `__init__` gathering hand, `left`, `prize`, `discard` and every stack in play into `self.cards` with the comment *"a lista de 60: é dele, ele a conhece"*; `visible(me)` counting hand plus discard plus stacks; `saw_own_deck()` setting `prizes_known`; `in_deck(me)` returning `Counter(me.left)` after the flag and `decklist − visible` before it, with the note *"contagem, nunca a ordem"*; `prized(me)` empty until the flag. The model this subtask makes native.
- `pokemon/src/pokesearch/sim/pilot.py` L313–318 (`choose`) — verified: the zone classification, and `k.saw_own_deck()` called exactly when the first candidate is in `me.left`, with the comment *"quem busca no deck conta as cartas e descobre os prêmios"*. The single raise point BR-S06.T01-02 relocates into the engine.
- `pokemon/tests/test_pilot.py::test_knowledge_cannot_tell_deck_from_prizes_until_it_searches_the_deck` — verified: before the search `prized() == {}` and `in_deck()["kadabra"] == 1`; after `saw_own_deck()`, `prized()["kadabra"] == 1` and `in_deck()["kadabra"] == 0`. The acceptance case reproduced above.
- `pokemon/ESPECIFICACAO.md` §4.3 RN-30 — verified: *"o piloto conhece a própria lista; mão, campo e descartes são visíveis; deck + prêmios próprios são um monte só até a primeira busca no próprio deck. Nunca lê mão, deck ou prêmios do oponente, embora o motor os entregue"*.
- [S04.T03](../04-game-engine-core/T03-game-state-model.md) — `Player::deck_searched` (declared there for this subtask), `Slot`, `Zone`, the cheap-`Clone` property `determinize` relies on, and the no-hash-iteration rule `Multiset` respects.
- [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) — `actor`/`owner`, BR-S04.T09-02 (a bot only receives prompts addressed to it) and BR-S04.T09-06 (prize candidates carry no `def`), the engine-side half of RN-30.
- [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md) — the `Bot` trait and the `View` alias this subtask replaces.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
