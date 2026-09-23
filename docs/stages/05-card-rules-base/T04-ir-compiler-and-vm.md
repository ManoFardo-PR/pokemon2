# S05.T04 — IR compiler and resumable VM

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 4 / 16 |
| Depends on | [S04.T03](../04-game-engine-core/T03-game-state-model.md), [S04.T09](../04-game-engine-core/T09-prompt-protocol.md), [S05.T03](T03-effect-ir-vocabulary.md) |
| Unblocks | [S05.T05](T05-continuous-modifiers-and-triggers.md), [S05.T06](T06-builtins-escape-hatch.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T11](T11-legacy-tests-to-scenarios.md) |
| Parallel with | [S05.T02](T02-effect-texts-and-card-parts.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` state with `frames` and `pending_prompt` — from [S04.T03](../04-game-engine-core/T03-game-state-model.md)
- `contract` prompts/answers — from [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)
- `contract` IR model — from [S05.T03](T03-effect-ir-vocabulary.md)
- `file` `pokemon/src/pokesearch/sim/effects.py` (the `can` / `run` split and the generator protocol), `catalog_cards.py::_reduce_attack` — read-only reference

## Outputs (proposed)
- `module` `ptcg-core::ir::{compile, vm}` — `compile(program_json, params) → Program` (flat op list, constants folded, filters pre-resolved to def-index bitsets where possible); `Vm::step(game, frame) → Continue | NeedPrompt(prompt) | Done`; frames `{ program_id, pc, locals: SmallVec<(Local, Value)>, ctx: { this_card, holder_slot, actor, owner, attack? } }` stored in `game.frames` — consumed by [S05.T05](T05-continuous-modifiers-and-triggers.md), [S05.T06](T06-builtins-escape-hatch.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T11](T11-legacy-tests-to-scenarios.md)
- `contract` locals shared across the codes of one text (e.g. `$discarded` from a `discard` op feeds a following `draw{n: per_discarded}`); recursion guard for `use_attack_as_this` (depth 1, no copycat-of-copycat)
- `module` `ptcg-core::ir::can` — `can(game, program, ctx) → bool`, the precondition pass that decides whether an action or ability is offered at all
- `file` `engine/ptcg-core/benches/vm.rs` — a criterion bench for compile time, step time and mid-effect clone cost

## Initial objective
Programs run as data inside the game state and can pause on any prompt and resume later — on the same state or on a clone — which is what lets bots look ahead through effects the legacy engine could only run as live coroutines.

## Context

The legacy ran effects as Python generators: `Effect.run(ctx)` yielded at every choice and the engine drove it with `yield from R.reduce_choose_card_actions(...)`. That works and it is readable, but a suspended generator is a live stack frame. It cannot be cloned, serialized, replayed or looked ahead through, which is precisely why the legacy had no rollout bot and why `Game` had no `clone()` at all. The twinleaf TypeScript engine has the same shape with closures instead of generators.

Here the suspended state is data. A `Frame` is a program id, a program counter, a small vector of locals and a context; `game.frames` is a `Vec<Frame>`; a pending question is `game.pending_prompt`. Cloning a game in the middle of "search your deck for up to 2 Basic Pokémon" is a memcpy of a few hundred bytes, and both copies can be answered differently. That single property is what [S06.T05](../06-bots/T05-rollout-bot.md) and [S06.T06](../06-bots/T06-ismcts-bot.md) are built on, and it is why this subtask exists as its own unit rather than as part of the vocabulary.

Two designs are inherited from the legacy because they were right. The first is the **`can` / `run` split**. Every legacy effect had `can(ctx) → bool` deciding whether the action was offered and `run(ctx)` applying it; `Seq` gated on all its parts (`gate_all`) and attack effects gated on the first. Without it, a bot is offered "play Nest Ball" with a full bench and wastes the card. Here `can` is a separate evaluation pass over the same compiled program: it walks the ops, asks each one's precondition, and never mutates. The second is **choice deduplication by card class**: `effects.py::_dedupe` keeps at most `max_cnt` copies of each card class among the candidates, because identical copies are interchangeable and "choose up to 5" over 20 identical cards is otherwise a combinatorial explosion. [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) already models this as `ChooseCards { candidates: [{ def, idxs, max_pick }] }` — candidates grouped by definition — so the VM builds prompts in that grouped form and never materializes a combination. The legacy's `MAX_CHOICE_SCAN = 400` cap exists because it did materialize them.

RN-77 is this subtask's rule and it is about totality. The legacy asserted it per recipe in `tests/test_catalog.py`: every recipe registers, lists its actions without raising, executes to the end, and no card ends in two zones. Here the same guarantee is structural — every op has a defined behaviour for every state, including the states that cannot happen — plus a property test over generated programs. The failure the legacy documented is worth repeating: `SwitchOpponentActive.run` checks the bench again after the precondition, with the comment *"o banco pode ter esvaziado entre a precondição e a execução (nocaute no meio do Seq)"*. A program's preconditions are evaluated once, before the first prompt; by the time op seven runs, three knockouts may have happened. Every op therefore re-checks and degrades to a no-op rather than panicking.

## Scope

- **In scope.** `ptcg-core::ir::compile` (params binding, constant folding, filter pre-resolution, structural validation, `Program` interning); `ptcg-core::ir::vm` (`Vm::step`, frame push/pop, local read/write, prompt emission, answer application); `ptcg-core::ir::can`; the `use_attack_as_this` recursion guard; the `ProgramCache` keyed by `(text_hash, params_hash)`; `engine/ptcg-core/benches/vm.rs`; the unit programs and property tests.
- **Out of scope.** The vocabulary itself ([S05.T03](T03-effect-ir-vocabulary.md)); continuous modifiers and the trigger dispatcher ([S05.T05](T05-continuous-modifiers-and-triggers.md)); the builtin registry and its functions ([S05.T06](T06-builtins-escape-hatch.md)); how the codes of one text concatenate into one program ([S05.T07](T07-rule-codes-composition-semantics.md)); the damage pipeline the `damage` op calls into ([S04.T07](../04-game-engine-core/T07-damage-pipeline.md)); prompt validation and defaults ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md)); scenario files ([S05.T11](T11-legacy-tests-to-scenarios.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-77 | **Kept, generalised from recipes to programs.** Every compiled program compiles, lists its legal actions without erroring, executes to the end on any reachable state, and leaves no card in two zones: every op is total, and an op whose target vanished between the precondition and the execution degrades to a no-op instead of failing. | `Vm::step` returns `StepResult`, never panics; every op's `apply` re-validates its targets; the zone invariant is asserted by `Game::check_invariants` ([S04.T03](../04-game-engine-core/T03-game-state-model.md)) | `vm_total.rs > every program in the corpus runs to Done from 200 random reachable states` (property test over all `rule_codes` bodies); `> no card is in two zones after any step`; `> a target removed by a knockout mid-program yields a no-op, not an error` |
| BR-S05.T04-01 | A program suspended on a prompt survives `Game::clone`: cloning mid-effect and answering the two copies differently yields two independent, valid games. | frames and `pending_prompt` live inside `Game`; nothing in the VM holds a reference into the game | `vm.rs > clone mid-prompt and resume both copies` — two different answers, two different final states, both passing `check_invariants` |
| BR-S05.T04-02 | `compile(body, params)` is pure and deterministic: the same `(body, params)` always yields the same `Program`, and compilation never reads or writes the game. | `compile` takes no `&Game`; the `ProgramCache` is keyed by `(text_hash, params_hash)` and is a pure memo | `vm.rs > compile is deterministic` (1,000 recompiles, identical bytes); `> compiling twice hits the cache and allocates nothing` |
| BR-S05.T04-03 | A `param` is resolved at compile time. A compiled `Program` contains no `param` node, and the VM has no code path that reads params. | `compile` substitutes every `param` and returns `CompileError::UnboundParam` otherwise; the `Op` type used by the VM has no `Param` variant | `vm.rs > an unbound param fails compilation`; `> the compiled Op enum has no Param variant` (compile-time assertion) |
| BR-S05.T04-04 | The VM consumes game RNG only through `coin_then`, `repeat_until_tails` and explicit shuffles, and exactly once per printed flip: a program that flips one coin advances the game stream by one draw, whether or not the effect happens. | the single `game.rng` borrow inside those three ops; no other op touches `rng` | `vm.rs > coin_then consumes exactly one RNG draw on heads and on tails`; `> two identical programs on the same seed produce the same flips` |
| BR-S05.T04-05 | `can(game, program, ctx)` never mutates the game and never opens a prompt; an action whose `can` is false is not offered. | `can` takes `&Game`; the borrow checker enforces it | `vm.rs > can is pure` (state hash unchanged over the whole corpus); `> search to bench is not offered with a full bench` |
| BR-S05.T04-06 | Locals are per text, not per code: a local bound by an op in code *i* is readable by code *j > i* of the same text and is destroyed when the last frame of that text pops. | locals live on the bottom frame of the text's frame group, not on each frame | `vm.rs > $discarded written by DISCARD_HAND_N is read by DRAW_PER_DISCARDED`; `> a second use of the same text starts with empty locals` |
| BR-S05.T04-07 | `use_attack_as_this` recurses at most once: a copied attack that itself copies degrades to its printed damage with no effect, and the program is marked `approx` for that run. | `Frame.ctx.copy_depth`, checked before pushing the copied attack's program | `vm.rs > copy of a copy runs the printed damage only and sets the approx flag` |
| BR-S05.T04-08 | A prompt built by the VM groups candidates by card definition and never enumerates combinations; the number of candidate entries is bounded by the number of distinct definitions in the zone, not by C(n, k). | the `ChooseCards` builder groups by `CardInst.def` before emitting ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md)) | `vm.rs > choose up to 5 from a deck of 20 identical cards emits 1 candidate entry with max_pick = 5`; `> candidate count never exceeds the distinct-definition count` |
| BR-S05.T04-09 | An op whose preconditions held but whose target is gone at execution time is a no-op that records an event; it never panics, never leaves a partial mutation and never ends the turn early. | each op's `apply` starts with a target re-resolution returning `Option`; a `None` short-circuits to `Continue` | `vm.rs > switch_active with an emptied bench is a no-op`; `> attach_energy whose target was knocked out is a no-op` |

## Data operations

The VM does not touch the database — the engine never opens it (Architecture principle 1). Its operations are mutations of `Game`, and the table below is the contract every op is written against. "Zone / field" names the part of [S04.T03](../04-game-engine-core/T03-game-state-model.md)'s state model.

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `game.frames` | push a `Frame` | a program starts (action, ability, trigger, wrapper body, copied attack) | depth ≤ 8; the bottom frame of a text owns its locals |
| `game.frames` | pop the top `Frame` | `pc` passes the program's last op | popping the bottom frame of a text clears that text's locals |
| `game.frames[i].pc` | advance by 1, or jump to a wrapper's `else` target | after every `Continue` | monotonic within a frame except for `repeat_until_tails`, whose back-edge is counted against `max` |
| `game.frames[i].locals` | bind or accumulate `$name` | an op carrying `bind` completes | ≤ 6 locals per text; a `bind` inside `for_each` accumulates the sum |
| `game.pending_prompt` | set to `Some(prompt)` | `Vm::step` returns `NeedPrompt` | exactly one pending prompt at a time; the frame's `pc` is **not** advanced until the answer arrives |
| `game.pending_prompt` | cleared | an answer validated by [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) is applied | the answer's `prompt.id` must match, or the default resolver's answer is used (RN-21) |
| `CardInst.zone` | move one card between zones | `search`, `discard`, `move_cards`, `attach_energy`, `detach`, `look_at_top`, `move_energy` | a card is in exactly one zone after the op; `Game::check_invariants` asserts the permutation |
| `CardInst.attached_to` | set or clear | `attach_energy`, `detach`, tool attach/detach | non-`None` only while `zone == Attached`; the holder must be in play |
| `Player.deck` | reorder | `shuffle`, `look_at_top{rest: shuffle|bottom}`, `move_cards{placement}` | `shuffle` draws from `game.rng`; `placement: top` preserves the player's stated order |
| `Player.hand` / `discard` / `prizes` / `lost_zone` | insert or remove | the card-moving ops | membership is derived from `CardInst.zone`, never stored twice |
| `Slot.damage` | add or subtract counters | `put_counters`, `move_counters`, `heal`, and `damage` via [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) | `0 ≤ damage`; the VM never compares it with HP — knockouts are [S04.T07](../04-game-engine-core/T07-damage-pipeline.md)'s |
| `Slot.conditions` | set or clear | `apply_condition`, `remove_conditions` | exclusivity of {Asleep, Paralyzed, Confused} is [S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md)'s; the VM calls, it does not decide |
| `Slot.turn_effects` / `Player.turn_effects` | append `(source, kind, value, until)` | `turn_effect` | `until ≤ 2`; expiry belongs to the checkup ([S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md)) |
| `Slot.markers` / `Player.markers` / game markers | add, remove, test | `marker` | names are interned; a marker is never read by a different text than the one that set it, unless the name is declared shared |
| `game.rng` | one draw | `coin_then`, each iteration of `repeat_until_tails`, each `shuffle` | one draw per printed flip; no other op touches it (BR-S05.T04-04) |
| `game.board_version` | increment | any op that changes what is in play or what is attached | the signal [S05.T05](T05-continuous-modifiers-and-triggers.md) rebuilds its modifier index on |
| `game.events` | append | every op, when logging is enabled | events are for replay and the coach; nothing reads them to decide anything |
| `game.turn` | end | `end_turn` only | the VM never ends a turn implicitly; attack resolution order belongs to [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) |
| any database table | — | never | the engine receives programs in the job JSON ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)) |

## Interfaces

**`ptcg-core::ir::compile`**

```rust
pub struct ProgramId(pub u32);

pub struct Program {
    pub id: ProgramId,
    pub ops: Vec<COp>,                 // flat: wrappers become jumps, no nesting at run time
    pub attack: Option<AttackFields>,  // gathered by S05.T07 before the ops run
    pub locals: u8,                    // how many local slots this program needs
    pub approx: bool,                  // a code of status 'approx' contributed to it
    pub source: ProgramSource,         // Text(text_hash) | Code(code) | Builtin(name)
}

pub enum CompileError {
    UnboundParam { name: String },
    ParamType { name: String, expected: ParamType },
    UnknownBuiltin { name: String },
    DepthExceeded { limit: u8 },
    BadRange { field: &'static str, value: i32, lo: i32, hi: i32 },
}

pub fn compile(body: &CodeBody, params: &ParamMap) -> Result<Program, CompileError>;
pub fn compile_text(items: &[(CodeBody, ParamMap)]) -> Result<Program, CompileError>; // S05.T07 calls this

pub struct ProgramCache { /* (text_hash, params_hash) -> Arc<Program> */ }
impl ProgramCache { pub fn get_or_compile(&self, key: CacheKey, f: impl FnOnce() -> Result<Program, CompileError>) -> Result<Arc<Program>, CompileError>; }
```

Compilation does four things: substitutes every `param` (BR-S05.T04-03), folds constant `Value` nodes (`{"int":3}` and `{"count":…}` over a constant filter become `CValue::Int`), pre-resolves each `Filter` that depends only on card definitions into a `DefBitset` over the job's `card_defs` — which is what makes "is this a Basic with 70 HP or less" a bit test rather than a predicate call — and flattens wrappers into jumps so that the run-time `COp` list has no nesting.

**`ptcg-core::ir::vm`**

```rust
#[derive(Clone)]
pub struct Frame {
    pub program_id: ProgramId,
    pub pc: u16,
    pub locals: SmallVec<[(Local, i32); 4]>,
    pub ctx: FrameCtx,
}

#[derive(Clone, Copy)]
pub struct FrameCtx {
    pub this_card: CardIdx,            // the card whose text is running
    pub holder_slot: Option<SlotRef>,  // the Pokémon a tool / special energy is attached to
    pub actor: PlayerIdx,              // who answers the prompts this program opens
    pub owner: PlayerIdx,              // whose cards the program acts on
    pub attack: Option<AttackRef>,     // set while an attack's program runs
    pub copy_depth: u8,                // use_attack_as_this guard (BR-S05.T04-07)
    pub kind: EffectKind,              // Attack | Ability | Trainer | Energy | Tool | Stadium
}

pub enum StepResult {
    Continue,                          // the op applied; call step again
    NeedPrompt(Prompt),                // game.pending_prompt is set; supply an Answer, then step again
    Done,                              // the frame popped; if frames is empty the program finished
}

pub struct Vm;
impl Vm {
    pub fn push(game: &mut Game, program: &Arc<Program>, ctx: FrameCtx);
    pub fn step(game: &mut Game, programs: &ProgramTable) -> StepResult;
    pub fn answer(game: &mut Game, answer: &Answer) -> Result<(), AnswerError>;
    pub fn run_to_completion(game: &mut Game, programs: &ProgramTable, resolver: &mut dyn PromptResolver) -> RunOutcome;
}

pub fn can(game: &Game, program: &Program, ctx: &FrameCtx) -> bool;
```

`EffectKind` is the legacy's `effect_kind(ctx)` made explicit. It matters because prevention distinguishes the three sources: `effects.py::effect_kind` returns `attack | ability | trainer`, and Hide 'n' Sneak blocks the first two but not Boss's Orders, while Mist Energy blocks only attacks. `FrameCtx.kind` carries `Tool` and `Energy` in addition, so a tool's `damaged_by_attack` trigger is attributable.

`RunOutcome` is `{ finished: bool, prompts_answered: u16, invalid_answers: u16, approx: bool }`; `invalid_answers` feeds RN-21's counter.

**Locals.** Six names, interned as a `Local` enum: `$discarded`, `$searched`, `$attached`, `$moved`, `$heads`, `$chosen`. They live on the *bottom* frame of a text's frame group; a wrapper's body frame reads through to it. Reading an unbound local yields 0 (BR-S05.T04-06 and the "unbound local" edge case).

**Prompt construction.** When an op needs a choice it builds the [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) prompt directly: `ChooseCards { zone, candidates, min, max, may_cancel }` with `candidates` grouped by `CardInst.def` and carrying `idxs` and `max_pick`, `purpose` taken from the op, `actor` and `owner` from `FrameCtx`. `min = 0` makes the prompt cancellable; the legacy expressed the same thing by `_choose(..., 0, n, ...)` returning an empty list.

**Benchmark targets** (measured in `benches/vm.rs`, recorded in the subtask's completion note, not asserted as a test): `compile` of a median two-code text under 20 µs; `Vm::step` of a non-prompting op under 200 ns; `Game::clone` mid-prompt under 2 µs. These sit under [S04.T18](../04-game-engine-core/T18-performance-baseline.md)'s ≥ 5,000 games/s target; if the median text needs more than ~40 steps the cache, not the step, is the thing to look at.

## Implementation steps

1. Define `COp`, `Program`, `Frame`, `FrameCtx` and `StepResult` in `ptcg-core::ir`; compile with every op `unimplemented!()` and the crate green.
2. Write `compile` for the value and filter subset: param substitution, constant folding, `DefBitset` pre-resolution, `CompileError`. Spec determinism and unbound params.
3. Implement the non-prompting ops (`draw`, `shuffle`, `heal`, `self_damage`, `turn_effect`, `marker`, `noop`, `end_turn`) and `Vm::step`'s frame mechanics; spec a three-op program running to `Done`.
4. Implement `coin_then` and `repeat_until_tails` with the single-draw rule and the `max: 12` cap; spec the RNG-draw count on heads and on tails.
5. Implement the prompting ops (`search`, `discard`, `look_at_top`, `choose_one`, `may`, `move_energy`, `switch_active`, `put_counters{distribute}`) with grouped candidates; spec the "20 identical cards, one candidate entry" case.
6. Implement `can` over the same program, sharing the precondition code with the ops; spec "search to bench is not offered with a full bench" and purity.
7. Implement locals and `bind`, including the `for_each` accumulation; spec the `$discarded → draw` chain and local lifetime.
8. Implement `for_each`, `use_attack_as_this` with the depth guard, and `builtin` dispatch through the registry trait ([S05.T06](T06-builtins-escape-hatch.md) provides the implementations).
9. Add the `ProgramCache` and wire it into the job path; spec the zero-allocation second compile.
10. Write the RN-77 property test: for every body in a corpus of generated and real programs, run from 200 random reachable states with a random prompt resolver, asserting `Done`, `check_invariants` and no panic.
11. Write `benches/vm.rs` and record the three numbers.
12. Write the clone-mid-prompt test and a small fixture scenario that [S05.T11](T11-legacy-tests-to-scenarios.md) can reuse.

## Edge cases and error handling

- **A target disappears between `can` and the op.** Boss's Orders passes `can` (the opponent has a bench), then an earlier op in the same program knocks the last benched Pokémon out. `switch_active` re-resolves, finds nothing, records an event and returns `Continue`. The legacy needed the same guard and says so in a comment on `SwitchOpponentActive.run` (BR-S05.T04-09).
- **The player cancels an optional choice.** `min = 0` and an empty answer. The op applies to nothing, any `bind` writes 0, and the following codes see 0 — which is exactly how "draw 3 cards for each card you discarded in this way" must behave when the player discards nothing.
- **A "you may" wrapper whose body's precondition is false.** `may` evaluates the body's `can` first and, when it is false, skips the prompt entirely rather than asking a question with no valid answer. This is the legacy `MayDo` / `IfCan` distinction: `IfCan` runs the body only if it is available and never blocks the rest, `MayDo` asks. Both exist; the wrapper's code decides which ([S05.T07](T07-rule-codes-composition-semantics.md)).
- **An unbound local read.** Yields 0, no error. The compiler emits a warning at composition time when a text reads a local no earlier code binds, because in practice that means a missing code rather than a deliberate zero.
- **A prompt answered with an invalid answer.** `Vm::answer` returns `AnswerError`; the caller increments `invalid_actions` and applies the default resolver's answer (RN-21, [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)). The VM never aborts a game because a bot answered badly.
- **A clone taken between `NeedPrompt` and `answer`.** Both copies hold the same `pending_prompt` and the same frames. Answering them differently diverges them completely, and neither shares state. This is the property the rollout bot needs and it is asserted directly (BR-S05.T04-01).
- **A program that never terminates.** Structurally impossible except through `repeat_until_tails`, which is capped at 12, and `for_each`, capped at 12. A frame stack deeper than 8 is `CompileError::DepthExceeded` at compile time, so the VM has no unbounded recursion at run time.
- **A `builtin` name the registry does not know.** `CompileError::UnknownBuiltin` at compile time, before any game starts, so the job fails with a clear message instead of a card silently doing nothing. [S05.T06](T06-builtins-escape-hatch.md) additionally fails a consistency test when the registry and `rule_codes` disagree.
- **A copied attack that copies.** Depth 1: the inner attack contributes printed damage only, `RunOutcome.approx` becomes true, and the run records an event naming the card. The legacy documented the same limit.
- **An op that would move a card already in the target zone** (`move_cards` from hand to hand). A no-op with an event, not a double insertion; `check_invariants` would catch the alternative, but the op must not create the situation.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core ir::` green, including `> search{deck, is_basic, n: 1, to: bench}` opening a `ChooseCards` prompt with `purpose = search_to_bench` and moving exactly the chosen card.
- [ ] `vm.rs > coin_then consumes exactly one RNG draw on heads and on tails` — the game's draw counter advances by one in both branches (BR-S05.T04-04).
- [ ] `vm.rs > clone mid-prompt and resume both copies` — a state cloned while a prompt is pending is answered differently on each copy; both reach `Done`, both pass `check_invariants`, and the two final states differ (BR-S05.T04-01).
- [ ] `vm_total.rs > every program in the corpus runs to Done from 200 random reachable states` with a random prompt resolver: no panic, no `Err`, and `check_invariants` (no card in two zones) after every step (RN-77).
- [ ] `vm.rs > can is pure` — the state hash is unchanged after evaluating `can` for every program in the corpus, and `> search to bench is not offered with a full bench` (BR-S05.T04-05).
- [ ] `vm.rs > $discarded written by DISCARD_HAND_N is read by DRAW_PER_DISCARDED` — discarding 2 draws 6 with `{per: 3}`, discarding 0 draws 0 (BR-S05.T04-06).
- [ ] `vm.rs > choose up to 5 from a deck of 20 identical cards emits 1 candidate entry with max_pick = 5` (BR-S05.T04-08).
- [ ] `vm.rs > compile is deterministic` (1,000 recompiles byte-identical) and `> an unbound param fails compilation` with the param name in the message (BR-S05.T04-02, -03).
- [ ] `vm.rs > copy of a copy runs the printed damage only and sets the approx flag` (BR-S05.T04-07).
- [ ] `cargo bench -p ptcg-core --bench vm` runs and the three numbers (compile, step, clone) are recorded in the completion note; a later regression is visible against them.

## Risks and open questions

- **Risk — the flat `COp` list makes wrappers hard to reason about.** Jumps are cheap for the VM and expensive for a reader. Mitigation: `Program::disassemble()` prints the op list with resolved jump targets and indentation, the editor's IR preview uses it ([S05.T13](T13-rules-editor-ui.md)), and every wrapper test asserts the disassembly as well as the effect.
- **Risk — `DefBitset` pre-resolution is wrong for filters that depend on state** (`on_bench`, `has_damage`, `energy_attached_at_least`). Mitigation: `compile` pre-resolves only the definition-only filters, and a compile-time assertion lists which those are; a state-dependent filter in a pre-resolved position is a compile error, not a wrong answer.
- **Risk — six locals is too few, or too many.** Too few forces awkward codes; too many invites programs that are really scripts. Mitigation: the set is closed and the compiler names the local it could not bind; revisit after [S05.T08](T08-spreadsheet-import.md)–[S05.T10](T10-import-catalog-recipes.md) with a count of how many texts use each.
- **Risk — `Frame` grows and `Game::clone` gets slower.** Mitigation: `SmallVec<[(Local, i32); 4]>` keeps the common case inline, `benches/vm.rs` measures the clone, and [S04.T18](../04-game-engine-core/T18-performance-baseline.md) catches a regression against the fingerprint-plus-time rule (RN-50).
- **Question (D-004 semantics) — should `can` be derivable from the program, or declared per code?** It is derived here, from the ops' own preconditions, which means a code author never writes a precondition twice. The alternative is a `can` field on `rule_codes`, which is more explicit and more to get wrong. Recommendation: derive it; if a card needs a precondition the ops cannot express, that is a `Require`-style code at ordinal 0 (the legacy did exactly this with `Seq(more_prizes_than_opponent(), …)`). The user confirms, since it changes what a code looks like in the editor.
- **Question — should the VM expose a step budget per program** so a pathological composition cannot stall a game? With `for_each` and `repeat_until_tails` both capped and no recursion, a program is bounded by construction, so a budget would only mask a compiler bug. Recommendation: no budget; the step cap of [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) already bounds the game.

## References

- `pokemon/src/pokesearch/sim/effects.py` L1–11 and L111–256 — verified: the module docstring stating that every primitive has `can(ctx)` and a generator `run(ctx)`, that zone choices are deduplicated by card class to avoid combinatorial explosion, and that opponent choices are automatic; `Seq(gate_all)`, `ChooseOne`, `CoinThen`, `MayDo`, `IfCan`, `ForOpponent`, `EachPlayer`, `Require`, `Approx` with their edge semantics in the docstrings. Consult for the `can`/`run` split, the dedupe rule and the `MayDo` vs `IfCan` distinction.
- `pokemon/src/pokesearch/sim/effects.py` L39–63 (`_dedupe`, `_choose`) — verified: at most `max(1, max_cnt)` copies of each card class among the candidates, `min_cnt` clamped to the candidate count, empty candidates returning an empty list rather than an error. Consult for the grouped-candidate prompt shape.
- `pokemon/src/pokesearch/sim/effects.py` L765–777 (`SwitchOpponentActive.run`) — verified: the re-check with the comment *"o banco pode ter esvaziado entre a precondição e a execução (nocaute no meio do Seq)"*. The concrete case behind BR-S05.T04-09.
- `pokemon/src/pokesearch/sim/effects.py` L1518–1525 (`effect_kind`) — verified: `attack | ability | trainer`, with the note that Hide 'n' Sneak stops attacks and abilities but not Boss's Orders and that Mist Energy stops attacks only. Consult for `FrameCtx.kind`.
- `pokemon/src/pokesearch/sim/catalog_cards.py` L576–636 (`_reduce_attack`) — verified: the eleven-step attack resolution — copy-attack substitution, `nothing_unless`, `coin_or_nothing`, bonus as a turn effect, the three ignore flags, the `N×`-with-zero-counter zeroing, `reduce_attack_damage`, `counters_per`, boomerang reattachment, `recipe.effects`, `lock_self`, second-attack window, `next_turn`. Consult for the order [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) and this VM must reproduce between them.
- `pokemon/src/pokesearch/sim/catalog_cards.py` L484–494 (`_limit_per_name`) — verified: "once during your turn" is per Pokémon unless the text says *"can't use more than 1 … Ability each turn"*. Consult for the marker semantics the `marker` op serves (RN-16, declared in [S05.T07](T07-rule-codes-composition-semantics.md)).
- [S04.T03](../04-game-engine-core/T03-game-state-model.md) (frames and `pending_prompt` inside `Game`, cheap clone), [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) (`Prompt`, `Purpose`, `Answer`, `validate_answer`, default resolver, RN-21), [S05.T03](T03-effect-ir-vocabulary.md) (the op set this VM implements).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
