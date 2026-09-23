# S05.T06 — Builtins escape hatch

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 6 / 16 |
| Depends on | [S05.T04](T04-ir-compiler-and-vm.md) |
| Unblocks | [S05.T07](T07-rule-codes-composition-semantics.md) |
| Parallel with | [S05.T05](T05-continuous-modifiers-and-triggers.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` VM op `builtin{name}` — from [S05.T04](T04-ir-compiler-and-vm.md)
- `file` `pokemon/src/pokesearch/sim/catalog.py` — the `approx=True` notes naming the effects the legacy vocabulary could not express; read-only reference

## Outputs (proposed)
- `module` `ptcg-core::ir::builtins` — registry `name → fn(&mut Game, &Frame) → StepResult` for effects the vocabulary cannot express yet (target < 2 % of meta copies), each with a doc comment citing the card text; the list is exported by `ptcg-cli --builtins` so the UI can show it
- `contract` policy: a builtin is a `rule_codes` row with `status = 'builtin'` and `ir_body_json = { builtin: name }`; adding one requires a scenario; when the vocabulary grows to cover it, the code is rewritten in IR and the builtin removed
- `file` `docs/rules/BUILTINS.md` — the register: for each builtin, the card texts it serves, the meta copies it covers, why the IR cannot express it, and the condition under which it would be retired

## Initial objective
The 'rules as data' promise does not force 100 % expressiveness on day one: the long tail can be native code that is still registered, counted and tested like any other code.

## Summary of the bargain

D-004 says card behaviour is data. A vocabulary that can express every card ever printed would be a programming language, and a spreadsheet of programs is not the authoring surface the user asked for. The escape hatch resolves the tension: an effect the alphabet cannot spell becomes one named Rust function, referenced from a `rule_codes` row like any other code, with a status that says exactly what it is. The card still has a code. The card still counts toward coverage. The card still needs a scenario before anything calls it proven. What it does not have is an IR body a human can read in the editor — and that is the entire cost, paid deliberately, capped at under 2 % of meta copies.

## Context

The legacy had the same escape valve and used it badly, in the only way available: `Approx`. `effects.py::Approx` is an effect that *does nothing* and marks the card approximate; `catalog.py` uses it and the `approx=True` flag on 24 recipes, each with a `note` in Portuguese saying what is missing — *"repetir moedas não modelado"*, *"sobreviver ao nocaute com 10 de HP não modelado"*, *"ataque concedido pela ferramenta não modelado"*, *"fornecer todos os tipos, um por vez, não é representável"*. Those cards were honest about being wrong, which is better than being silently wrong, but they were still wrong: the effect simply did not happen, and the simulation measured a card that does not exist. `ESPECIFICACAO.md` §6.1 lists the resulting declared gaps, and `coverage.py` puts `catalog_approx` at 3.9 % of meta copies with `vanilla` at 1.2 %.

A builtin is the opposite trade. The effect *does* happen, faithfully, in Rust; what is lost is not fidelity but legibility and editability. That is a much better place to spend 2 % of the meta.

The first thing this subtask does is shrink the candidate list, because most of the legacy's approximations are expressible in the new design and would be a waste of a builtin. Four of the legacy's notes are already answered by architecture decisions made in S04 and S05:

- *"fornecer todos os tipos, um por vez"* (Prism, Legacy, Neo Upper energy). The legacy froze `provides` at attach time because the third-party engine stored the energy list inside the Pokémon. Here energy provision is a query at payment time through the `energy_provision` hook ([S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md)), so "any one type, chosen when you pay" is a modifier, not a builtin.
- *"redução de custo de ataque não modelada"* (Sparkling Crystal, Counter Gain, Hop's Choice Band). The `attack_cost` hook exists ([S05.T05](T05-continuous-modifiers-and-triggers.md)).
- *"ataque concedido pela ferramenta não modelado"* (Core Memory). The `grant_attacks` hook exists.
- *"sobreviver ao nocaute com 10 de HP não modelado"* (Survival Brace). The `would_be_knocked_out` hook exists ([S04.T07](../04-game-engine-core/T07-damage-pipeline.md)).
- *"descarte variável … com dano proporcional"* (eight attacks: Team Rocket's Mewtwo ex, Mega Abomasnow ex, Mega Charizard X ex, Ethan's Magcargo, Raging Bolt ex, Team Rocket's Honchkrow, Mega Diancie ex and one more). Expressible as `discard{…, bind: "$discarded"}` running in the attack's `before_damage` phase, followed by an attack-field code reading `{"local": "$discarded"}` — provided [S05.T07](T07-rule-codes-composition-semantics.md) fixes the two-phase order, which it does.

What is left after that pruning is genuinely structural, and the register starts with four entries plus whatever step 10 of [S05.T03](T03-effect-ir-vocabulary.md) finds in the top 300 texts. Each is a case where the effect changes the *shape* of the game rather than its contents: re-flipping coins already spent from the game's RNG stream (Backtrack Badge); a Trainer card occupying a bench slot as if it were a Pokémon (Fossil Quarry's Antique items); a search that evolves a chain in one step, skipping stages the deck may not contain (Grand Tree, Transformation Tome).

The governance is the point. A builtin is not a hiding place: it has a row in `rule_codes`, a scenario before it may be called proven, a line in `docs/rules/BUILTINS.md` with its meta-copy count and its retirement condition, and a consistency test that fails when Rust and the database disagree in either direction. RN-67 is superseded exactly here — the legacy rule was about sandboxing LLM-generated Python, and there is no generated code in this design at all: builtins are human-written Rust, reviewed like any other engine change.

## Scope

- **In scope.** `ptcg-core::ir::builtins` (the `BuiltinFn` type, the registry, `names()`, `get()`, the linkme-style inventory or a hand-maintained `const` table); the `builtin` op's dispatch in [S05.T04](T04-ir-compiler-and-vm.md)'s VM; `ptcg-cli --builtins`; the `GET /api/rules/builtins` passthrough the editor reads; `docs/rules/BUILTINS.md` and its generator; the consistency test in both directions; the initial four builtins with their scenarios; the pruning analysis above, recorded in `BUILTINS.md` §"Not builtins".
- **Out of scope.** The vocabulary the builtins escape from ([S05.T03](T03-effect-ir-vocabulary.md)); the VM and its frames ([S05.T04](T04-ir-compiler-and-vm.md)); the hooks that absorbed four of the legacy's approximations ([S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md), [S04.T07](../04-game-engine-core/T07-damage-pipeline.md), [S05.T05](T05-continuous-modifiers-and-triggers.md)); composing a builtin code with others ([S05.T07](T07-rule-codes-composition-semantics.md)); evidence and coverage accounting ([S05.T12](T12-evidence-and-coverage-metrics.md)); the scenario format ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-67 | **Superseded.** The legacy rule forbade AI-generated code from importing `os`/`subprocess`/network modules or calling `open`/`exec`/`eval`, because `sim/cardgen.py` wrote and ran Python. This design generates no code: rules are data and builtins are human-written Rust reviewed in a pull request like any other engine change. The rule is recorded as superseded rather than dropped, and the property it protected — "nothing executes code nobody read" — is kept by the review requirement and by the closed registry. | the registry is a `const` table in `ptcg-core`; there is no dynamic loading, no `dlopen`, no scripting engine and no code path that compiles anything at run time | `builtins.rs > the registry is a compile-time constant` (a test asserting `names()` is available in a `const` context); repository check: no crate in `engine/` depends on a scripting or dynamic-loading crate |
| BR-S05.T06-01 | Every name in the Rust registry has a `rule_codes` row with `status = 'builtin'` and `ir_body_json = {"builtin": "<name>"}`, and every such row names a registered builtin. The check runs in both directions. | `pnpm rules:check-builtins` compares `ptcg-cli --builtins` with `SELECT code, ir_body_json FROM rule_codes WHERE status = 'builtin'`; it runs inside `pnpm check` | `builtins.spec.ts > a builtin registered in Rust but missing from rule_codes fails`; `> a builtin row naming an unregistered function fails`; both fixtures included |
| BR-S05.T06-02 | A builtin code may not be marked `exact` and may not be `approx`: `status = 'builtin'` is its own status, and it counts toward exact coverage exactly like `exact` does (RN-72's fourth evidence kind). | the `CHECK` on `rule_codes.status` ([S05.T01](T01-rules-schema-migration.md)) plus the `card_status` view counting `('exact','builtin')` | `card-status.spec.ts > a builtin code counts toward exact`; `builtins.spec.ts > changing a builtin row's status to exact fails the consistency check` |
| BR-S05.T06-03 | A builtin is not proven until a scenario that exercises it passes on the current engine build; the evidence row carries `kind = 'builtin'`. There is no "builtins are trusted" path. | the worker writes `kind = 'builtin'` evidence only from a passing scenario ([S05.T12](T12-evidence-and-coverage-metrics.md)); `pnpm rules:check-builtins` fails when a registered builtin has no scenario at all | `builtins.spec.ts > a builtin with no scenario is reported`; `card-status.spec.ts > a builtin code without evidence leaves the card unproven` |
| BR-S05.T06-04 | A builtin function is total in the same sense as an IR op (RN-77): it returns `StepResult`, never panics, re-validates its targets, and leaves no card in two zones. | the `BuiltinFn` signature returns `StepResult`; the RN-77 property test of [S05.T04](T04-ir-compiler-and-vm.md) includes every registered builtin in its corpus | `vm_total.rs > every program in the corpus runs to Done` with the builtin programs included; `builtins.rs > each builtin is a no-op when its precondition fails` |
| BR-S05.T06-05 | Every builtin has an entry in `docs/rules/BUILTINS.md` stating the card texts it serves, its share of meta copies, the reason the IR cannot express it, and the condition that would retire it. | the doc is generated from the registry's doc comments and from a coverage query; `pnpm check` fails on an entry with an empty reason or no retirement condition | `pnpm check` fails on a fixture builtin whose doc comment omits `# Retire when` |
| BR-S05.T06-06 | Builtins stay under 2 % of meta copies (D-004). The number is computed, published on the coverage page and checked; crossing it is a decision, not a drift. | `pnpm rules:check-builtins --budget 2.0` sums `card_status`-weighted meta copies of cards whose texts use a builtin code and exits 1 above the budget; it runs in `pnpm check` with `--warn-only` until [S05.T12](T12-evidence-and-coverage-metrics.md) exists, then as an error | `pnpm rules:check-builtins --budget 2.0` on the real database; the number is reported by `GET /api/rules/coverage` and shown by [S05.T14](T14-coverage-page-and-authoring-queue.md) |
| BR-S05.T06-07 | A builtin's behaviour is fixed per engine build and contributes nothing invisible: it may not read the clock, the filesystem, the network or any global mutable state, and it consumes randomness only through `game.rng`. | the `BuiltinFn` signature takes `&mut Game` and `&Frame` and nothing else; a clippy lint bans `std::time`, `std::fs`, `std::net` and `static mut` inside the module | `builtins.rs > two runs of every builtin on the same seed produce identical fingerprints`; `cargo clippy -p ptcg-core -- -D warnings` with the module lint |

## Data operations

A builtin is engine code; it writes no table. Its mutations are of `Game`, and it is held to exactly the contract the IR ops are held to in [S05.T04](T04-ir-compiler-and-vm.md). The table below states the additional restrictions that apply because a builtin is opaque to the editor.

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `CardInst.zone`, `Player.*` piles | move cards | inside a builtin's `apply` | a card is in exactly one zone afterwards; `Game::check_invariants` is asserted after every builtin in debug builds |
| `Slot.damage`, `Slot.conditions`, `Slot.turn_effects` | as an IR op would | inside a builtin | a builtin never bypasses [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) for attack damage: it calls `resolve_attack` / `place_counters`, it does not subtract HP |
| `game.pending_prompt` | set, via the same builder the ops use | a builtin needs a choice | the prompt carries a `Purpose` from the closed list; a builtin may not invent a prompt kind |
| `game.frames[top].pc` | advanced by the VM, not by the builtin | after the builtin returns `Continue` | a builtin that needs several steps stores its progress in `Frame.locals`, so the state stays clonable mid-builtin |
| `game.rng` | one draw per printed randomisation | inside `coin`-like builtins | Backtrack Badge's re-flip draws once per re-flip and records it; determinism is asserted (BR-S05.T06-07) |
| `game.board_version` | incremented when the board changes | a builtin that benches, attaches or discards a tool | otherwise the modifier index goes stale ([S05.T05](T05-continuous-modifiers-and-triggers.md)) |
| `game.events` | append, naming the builtin | always | the replay and the editor's explanation panel are the only window into an opaque code |
| clock, filesystem, network, `static mut` | — | never | BR-S05.T06-07 |
| any database table | — | never | the engine does not open the database |

## Interfaces

**`ptcg-core::ir::builtins`**

```rust
/// A builtin runs in the same position as an IR op: it may mutate the game, open a prompt,
/// or do nothing. It must be total (RN-77) and deterministic given `game.rng` (BR-S05.T06-07).
pub type BuiltinFn = fn(&mut Game, &mut ModifierIndex, &Frame) -> StepResult;

pub struct BuiltinDef {
    pub name: &'static str,          // snake_case, permanent
    pub f: BuiltinFn,
    pub serves: &'static [&'static str],   // card names this was written for, for the doc
    pub reason: &'static str,              // why the IR cannot express it
    pub retire_when: &'static str,         // the vocabulary change that would remove it
}

pub const BUILTINS: &[BuiltinDef] = &[ /* … */ ];

pub fn get(name: &str) -> Option<BuiltinFn>;          // used by compile(), so an unknown name
                                                       // is CompileError::UnknownBuiltin, not a run-time hole
pub fn names() -> impl Iterator<Item = &'static str>;
```

**CLI.** `ptcg-cli --builtins` prints one JSON line per builtin: `{ "name", "serves", "reason", "retire_when" }`. It is the only source the database check and the UI read; the registry is never parsed out of the Rust source.

**Node side.** `packages/db/src/rules/builtins.ts` exposes `listRegisteredBuiltins(engineBin): BuiltinInfo[]` (spawns `--builtins`), `listBuiltinCodes(db): { code, name, texts, metaCopies }[]`, and `checkBuiltins(db, engineBin, opts): BuiltinReport`. `pnpm rules:check-builtins [--budget <pct>] [--json]` wraps it; exit codes 0 ok, 1 a mismatch or a missing scenario, 2 the budget was exceeded, 3 the engine binary is missing. `apps/api` exposes `GET /api/rules/builtins` returning the merged view (registry ∪ codes, with a `state` of `ok | missing_code | missing_fn | no_scenario`) for [S05.T13](T13-rules-editor-ui.md).

**The register at the start of the stage.** Four entries, each with its reason and its retirement condition. The meta-copy shares are filled by [S05.T12](T12-evidence-and-coverage-metrics.md) once the denominator exists; the legacy's note for each is quoted in `BUILTINS.md`.

| `name` | Serves | Why the IR cannot express it | Retire when |
|---|---|---|---|
| `reflip_attack_coins` | Backtrack Badge | The effect reaches back into coin flips the attack already consumed from `game.rng` and replaces their results. The IR has no notion of a spent flip: `coin_then` and `repeat_until_tails` draw and forget. | the vocabulary grows a `coin_log` local and a `reflip{of}` op, which would also serve any future re-flip card |
| `antique_item_as_pokemon` | Fossil Quarry | A Trainer card occupies a bench slot and is treated as a Pokémon in play. Every selector and filter in the IR assumes a bench slot holds a Pokémon stack; changing that changes the state model, not the vocabulary. | [S04.T03](../04-game-engine-core/T03-game-state-model.md)'s `Slot` admits a non-Pokémon top card, which is a much larger change than the card is worth |
| `evolve_chain_from_deck` | Grand Tree | Searches for and applies an evolution across a chain in one action, skipping stages the deck may not contain, and must resolve the line by name against the card definitions. The IR has no evolution-line traversal and adding one would put deck-building knowledge into the vocabulary. | a `grant_evolution{from, to}` op exists, or the evolution line becomes a first-class selector |
| `transformation_tome` | Transformation Tome | Same family as above, with an additional prompt sequence whose legal answers depend on the chosen evolution. | the same vocabulary change retires both |

**Writing a builtin.** The checklist, kept in `BUILTINS.md` and enforced by review:

1. Confirm the effect is not expressible — the pruning list at the top of `BUILTINS.md` §"Not builtins" exists so the same four legacy notes are not re-litigated each time.
2. Add the `BuiltinDef` with a doc comment quoting the printed text, and the `# Reason` / `# Retire when` sections the generator reads.
3. Implement `BuiltinFn` calling the same helpers the IR ops call (`resolve_attack`, `place_counters`, prompt builders) so the damage pipeline and the modifier index are never bypassed.
4. Add a scenario under `engine/scenarios/builtins/<name>.json` with `verifies: ["text:<hash>"]` and a `source` citing the card text or the ruling.
5. Add the `rule_codes` row (`status = 'builtin'`, `ir_body_json = {"builtin": "<name>"}`, `notes` naming the scenario) and point the text's `text_codes` at it.
6. Run `pnpm rules:check-builtins --budget 2.0` and `pnpm rules:export` ([S05.T15](T15-rules-export-import-seed.md)).

## Implementation steps

1. Define `BuiltinFn`, `BuiltinDef`, the empty `BUILTINS` table, `get()` and `names()`; wire `compile`'s `builtin` op to `get()` so an unknown name is a compile error.
2. Add `ptcg-cli --builtins` and its JSON line format; assert the output parses against a zod schema in `@pokesearch/shared`.
3. Write `packages/db/src/rules/builtins.ts` and `pnpm rules:check-builtins` with both directions of the consistency check and the two failing fixtures.
4. Write `docs/rules/BUILTINS.md` and its generator, including §"Not builtins" with the five pruned legacy approximations and the subtask that absorbed each.
5. Implement `reflip_attack_coins` with its scenario; this is the one that touches the RNG, so it settles the determinism convention for the rest.
6. Implement `evolve_chain_from_deck` and `transformation_tome` with their scenarios; they share the evolution-line resolution helper.
7. Implement `antique_item_as_pokemon` with its scenario, or, if [S04.T03](../04-game-engine-core/T03-game-state-model.md)'s `Slot` cannot hold a non-Pokémon at all, record it as `unimplemented` with the reason and leave the card uncovered — an honest hole beats a builtin that lies.
8. Add the budget check and wire `GET /api/rules/builtins`.
9. Add every registered builtin to the RN-77 property corpus of [S05.T04](T04-ir-compiler-and-vm.md) and to the determinism fingerprint test.
10. Record, in `BUILTINS.md`, the meta-copy share of the register once [S05.T12](T12-evidence-and-coverage-metrics.md) can compute it, and re-run the pruning analysis against the top 300 texts.

## Edge cases and error handling

- **A builtin is registered in Rust but absent from `rule_codes`.** `pnpm rules:check-builtins` exits 1 naming the function. This is the harmless direction — dead code — but it is still a failure, because a builtin nobody references is a builtin nobody tests.
- **A `rule_codes` row names a builtin the engine does not have.** `compile` fails with `CompileError::UnknownBuiltin` *before any game starts*, so a job fails with a clear message rather than a card silently doing nothing. The check catches it earlier, at `pnpm check` time.
- **A builtin renamed in Rust without a migration.** Both directions of the check fail at once (old name missing a function, new name missing a code). The rule is that a builtin name is permanent, like a code: a rename is a new name plus an `UPDATE` of the `rule_codes` row in the same commit.
- **A builtin that needs several steps and a prompt in the middle.** It stores its progress in `Frame.locals` and returns `NeedPrompt`, exactly as a multi-step op does, so the state stays clonable mid-builtin. A builtin that loops internally without returning would break [S05.T04](T04-ir-compiler-and-vm.md)'s clone property, and the review checklist calls it out.
- **A builtin whose precondition fails at execution time** — Grand Tree with no evolution in the deck, Backtrack Badge on an attack that flipped no coins. It returns `Continue` with an event and mutates nothing (BR-S05.T06-04).
- **A builtin that would exceed the 2 % budget.** `--budget` exits 2. The response is a decision, recorded in the decision log: grow the vocabulary, accept a higher budget, or leave the card uncovered. It is never resolved by quietly adding the builtin.
- **A builtin with a scenario that fails on a new engine build.** Exactly like any other code: the evidence for that build is `passed = 0`, `card_status.proven` drops, and the coverage page shows it. Being native buys no trust.
- **Two cards whose texts need the same builtin with different parameters.** A builtin takes no params — `{"builtin": name}` is the whole body. Two behaviours mean two builtins, or one builtin plus a preceding IR code that sets a local the builtin reads. The second option is preferred and is documented, because it keeps the parametrized part visible in the editor.
- **A builtin that wants to read the database** (a card whose text names a set, say). Refused by the signature and by Architecture principle 1. The information must arrive in the job's `card_defs` ([S04.T02](../04-game-engine-core/T02-card-definition-model.md)).

## Acceptance / verification

- [ ] `cargo test -p ptcg-core builtins::` green, including `> each builtin is a no-op when its precondition fails` and `> two runs of every builtin on the same seed produce identical fingerprints` (BR-S05.T06-04, -07).
- [ ] `builtins.spec.ts > a builtin registered in Rust but missing from rule_codes fails` and `> a builtin row naming an unregistered function fails` — both fixtures exit 1 with the offending name in the message (BR-S05.T06-01).
- [ ] `pnpm rules:check-builtins --json` on the real database exits 0, and its report lists every builtin with `state: "ok"`.
- [ ] `builtins.spec.ts > a builtin with no scenario is reported` — registering a function and its code without a scenario exits 1 (BR-S05.T06-03).
- [ ] `card-status.spec.ts > a builtin code counts toward exact` and `> a builtin code without evidence leaves the card unproven` (BR-S05.T06-02, -03).
- [ ] Scenario `builtins/reflip_attack_coins.json` passes: an attack that flipped two tails re-flips them and the damage changes accordingly, with the RNG draw count asserted.
- [ ] `pnpm rules:check-builtins --budget 2.0` reports the current share of meta copies served by builtins and exits 0; the number appears in `GET /api/rules/coverage` (BR-S05.T06-06).
- [ ] `pnpm check` fails on a fixture builtin whose doc comment omits `# Retire when`, and `docs/rules/BUILTINS.md` regenerates with no diff (BR-S05.T06-05).
- [ ] `docs/rules/BUILTINS.md` §"Not builtins" lists the five pruned legacy approximations (Prism/Legacy/Neo Upper provision, attack-cost reduction, granted attacks, survive-at-10-HP, variable discard with proportional damage) with the subtask that absorbed each (RN-67 context).
- [ ] `cargo clippy -p ptcg-core -- -D warnings` passes with the module lint banning `std::time`, `std::fs`, `std::net` and `static mut` inside `ir::builtins` (BR-S05.T06-07).

## Risks and open questions

- **Risk — the escape hatch becomes the path of least resistance.** Writing 30 lines of Rust is easier than extending a vocabulary in two languages with a doc entry and a scenario. Mitigation: the budget check with a hard exit code, the mandatory `# Retire when` field (a builtin with no plausible retirement is a vocabulary gap in disguise), and the coverage page showing the builtin share next to exact and proven so it is visible every day.
- **Risk — a builtin drifts from the printed text** and nothing notices, because the editor cannot show what it does. Mitigation: the doc comment quotes the printed text, the scenario is mandatory, and [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md)'s oracle can produce `twinleaf_diff` evidence for a builtin exactly as for an IR code.
- **Risk — `antique_item_as_pokemon` is not implementable** without changing [S04.T03](../04-game-engine-core/T03-game-state-model.md)'s `Slot`. Mitigation: step 7 makes the fallback explicit — leave the card `unimplemented` with the reason — rather than shipping a builtin that approximates it. An honest hole is measurable; a lying builtin is not.
- **Question (D-004 semantics) — should a builtin be allowed to take params?** It cannot here: `{"builtin": name}` is the whole body, so two behaviours are two builtins. Allowing params would make builtins reusable and would also make them small interpreters with a private, undocumented vocabulary — the thing D-004 exists to avoid. Recommendation: no params; use a preceding IR code to set a local. The user confirms, because it decides how many builtins the register will hold.
- **Question — should `status = 'builtin'` count toward *exact* coverage at all?** It does here, matching RN-72's fourth evidence kind and the glossary. The alternative is a third headline number. Recommendation: keep two numbers and publish the builtin share as a footnote on both, which is what [S05.T14](T14-coverage-page-and-authoring-queue.md) does.
- **Question — where do builtins live once [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md) compiles the core to WebAssembly?** They compile with the core, since they are ordinary Rust with no I/O. Worth confirming when that subtask starts; nothing here should use a target-specific API.

## References

- `pokemon/src/pokesearch/sim/effects.py` L249–255 (`Approx`) — verified: *"Efeito não suportado: a carta fica marcada como aproximada e o efeito não faz nada"*, with `approx = True` and a `note`. The legacy escape hatch this subtask replaces with something that actually runs.
- `pokemon/src/pokesearch/sim/catalog.py` L176–185 — verified: the tool approximations and their notes — `"backtrack badge"` *"repetir moedas não modelado"*, `"survival brace"` *"sobreviver ao nocaute com 10 de HP não modelado"*, `"core memory"` *"ataque concedido pela ferramenta não modelado"*, `"sparkling crystal"` / `"counter gain"` *"redução de custo de ataque não modelada"*, `"powerglass"` *"anexar energia no fim do turno não modelado"*, `"tremendous bomb"`, `"gravity gemstone"`. Consult for the candidate list and for which notes S04/S05 hooks now absorb.
- `pokemon/src/pokesearch/sim/catalog.py` L221–222 — verified: `"fossil quarry"` *"itens Antique jogados como Pokémon não modelados"* and `"grand tree"` *"busca e evolução em cadeia não modeladas"*. The two structural cases.
- `pokemon/src/pokesearch/sim/catalog.py` L491–500 — verified: `"prism energy"`, `"legacy energy"` and `"neo upper energy"` with *"fornecer todos os tipos, um por vez, não é representável"*, and the comment explaining that the third-party engine fixed `provides` at attach time. The reason this family is *not* a builtin here.
- `pokemon/src/pokesearch/sim/catalog.py` L386–402 and L412–413 — verified: the eight variable-discard-with-proportional-damage attacks declared approximate rather than wrong (*"Sem primitiva para descarte variável com dano proporcional, ficam declaradas aproximadas (dano base impresso) em vez de erradas"*). Consult for the list and for why the two-phase attack order in [S05.T07](T07-rule-codes-composition-semantics.md) retires it.
- `pokemon/ESPECIFICACAO.md` §4.5 RN-67 and §6.1 — verified: the sandbox rule as written for `sim/cardgen.py`, and the declared rule gaps. Consult for the superseded disposition.
- `pokemon/README.md` L133–160 — verified: the coverage split `motor 29,4 % · catálogo 59,7 % · esqueleto sem texto 5,7 %` exact, against `catálogo aprox. 3,9 % · esqueleto aprox. 1,2 % · sem implementação 0,1 %`. The 5.2 % of approximations this subtask converts into either coverage or an honest hole.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
