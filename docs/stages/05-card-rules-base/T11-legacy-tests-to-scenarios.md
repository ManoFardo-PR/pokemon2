# S05.T11 — Convert legacy verified tests into scenarios

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 11 / 16 |
| Depends on | [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md), [S05.T04](T04-ir-compiler-and-vm.md), [S05.T05](T05-continuous-modifiers-and-triggers.md) |
| Unblocks | [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Parallel with | [S05.T07](T07-rule-codes-composition-semantics.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` scenario format and runner — from [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)
- `module` VM — from [S05.T04](T04-ir-compiler-and-vm.md)
- `module` modifiers/triggers (tools, stadiums, passives) — from [S05.T05](T05-continuous-modifiers-and-triggers.md)
- `file` legacy tests `pokemon/tests/test_{abilities,tools_stadiums,effects,engine_cards,special_energy,attack_effects,rules}.py` (136 `@pytest.mark.verifies` marks) and `sim/testkit/__init__.py`
- `external` verified counts (2026-09-22): the 136 marks split 36 / 28 / 25 / 24 / 11 / 10 / 2 across `test_abilities`, `test_tools_stadiums`, `test_effects`, `test_engine_cards`, `test_special_energy`, `test_attack_effects`, `test_rules`; `sim/verified_cards.json` records **134 distinct test node ids** proving **117 parts of 109 cards**

## Outputs (proposed)
- `file` `engine/scenarios/cards/**/*.json` — one scenario per converted test, `verifies: ['text:<hash>']`, `source: 'tests/test_x.py::test_name'`
- `doc` `engine/scenarios/CONVERSION.md` — helper mapping (`make_state` → `setup`, `attach_energy` → `energies`, `play_tool/put_stadium/use_stadium` → actions, `drive_choices` → `answer` steps, damage assertions → `expect.damage_calc`)
- `script` `pnpm rules:sync-scenarios` — mirrors `engine/scenarios/**/*.json` into `rule_scenarios` (git stays the source of truth) and reports scenarios whose `verifies` no longer resolves to a text
- `file` `<out>/conversion-report.json` — per legacy test: the scenario produced, or the reason it could not be converted, plus the triage of every failure

## Initial objective
The evidence base of the legacy project (what was actually proven about 109 cards) is carried over as executable scenarios that the new engine must pass, so coverage starts with proof, not intentions.

## Context

Everything else in the stage produces *intentions*: a code says what a card should do. This subtask produces the only thing that can contradict an intention. Without it, `proven` is zero and the coverage page shows one number instead of two, which is the exact failure RN-70 exists to prevent.

The legacy's evidence mechanism is worth describing precisely, because this subtask reproduces its semantics in a different shape. A test declares what it proves with `@pytest.mark.verifies("munkidori", "Adrena-Brain")` — a card key and, optionally, the parts it covers. `tests/conftest.py` collects those marks at collection time, records which declared tests *ran* and which *passed*, and `pytest --write-verified` rewrites `sim/verified_cards.json` through `verified.merge_run`: a test that ran and failed or was skipped **leaves** the file; a test that did not run this session keeps its previous entry. `tests/test_verified.py` then fails when the file and the marks disagree in either direction. That is a small, honest evidence ledger, and the new design keeps every one of its properties — evidence is written by the runner, a failure removes proof, a claim must point at a real part — while moving it from a JSON file to `rule_evidence` rows tied to an engine build ([S05.T12](T12-evidence-and-coverage-metrics.md)).

The conversion itself is a translation between two very different test styles. A legacy test is Python that builds a state with module-local helpers, drives the third-party engine's generator through `drive_choices`, and asserts with bare `assert`. A scenario is JSON: `setup` / `steps` / `expect`, run by the [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) runner. The helpers are the key, and they are remarkably consistent across the seven files: `state(p1_active=…, p1_bench=…, p2_active=…, p2_bench=…, hand=…, left=…, deck=…, discard=…, prizes=…, seed=…)`, `card(cid)`, `cat(key)`, `attach_energy(pokemon, cid, n)`, `put(st, pokemon, where)`, `play_tool(tool, st, holder)`, `put_stadium(stadium, st, player)`, `use_stadium(stadium, st, selectors)`, `use_ability(pokemon, st, selectors, expect)`, `pick(*names)`, `damage(st, source, target, base)`, and `drive_choices(generator, selectors)` from the testkit. Each maps onto exactly one scenario construct, which is what makes the conversion mechanical enough to be worth automating partly and small enough to finish by hand.

Two conversions are not mechanical and must be decided per test. The first is `drive_choices`: its selectors are Python lambdas over the engine's `raw_available_actions`, often written as `lambda info: list(info["raw_available_actions"][0].chosen)` — "take the first option". A scenario's `answer` step names a `purpose` and a concrete `pick`, which is stricter and better, but it requires reading what the test actually intended. The second is the assertion style. `assert holder.hp == base + 100 - 70` (from the Hero's Cape test) encodes a chain of reasoning about max HP, damage and healing; the scenario equivalent is a `counters` expectation plus, where the test is about damage, an `expect.damage_calc` naming the intermediate stages that [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) exposes — which is strictly more informative, because it says *why* the number is what it is.

The order of work follows the value. The 134 test node ids that `verified_cards.json` records as passing are the evidence base and go first; the remaining tests in those seven files (and the other test files) are regression and follow. Scenarios are files in git, and `rule_scenarios` is a mirror — the legacy learned the same lesson when `verified_cards.json` and the marks drifted, and `tests/test_verified.py` exists to catch exactly that.

## Scope

- **In scope.** `engine/scenarios/cards/**/*.json` (one file per converted test, foldered by card supertype); `engine/scenarios/CONVERSION.md`; the conversion helper `scripts/rules/convert-tests.mjs` that produces a scenario **skeleton** from a legacy test's helper calls (a starting point a human finishes, never an unreviewed output); `pnpm rules:sync-scenarios`; the triage process and the `conversion-report.json`; the scenario id convention and its permanence rule.
- **Out of scope.** The scenario JSON schema and the runner ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)); the rulebook scenarios `engine/scenarios/rules/*.json`, which [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) owns (RN-11); writing evidence rows and computing coverage ([S05.T12](T12-evidence-and-coverage-metrics.md)); the worker job kind `scenarios` ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); authoring the codes the scenarios exercise ([S05.T07](T07-rule-codes-composition-semantics.md)–[S05.T10](T10-import-catalog-recipes.md)); the twinleaf oracle ([S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S05.T11-01 | Every converted scenario names what it proves as a **text hash**, not a card name: `verifies: ["text:<hash>"]`. A legacy mark naming a card and a part is resolved to the text of that part at conversion time, and a mark that cannot be resolved is reported, never converted to a name-based claim. | the `verifies` field's schema ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)); `pnpm rules:sync-scenarios` rejects a `text:` value absent from `effect_texts` | `sync-scenarios.spec.ts > a scenario verifying an unknown text hash fails the sync`; `conversion.spec.ts > a card-level mark on a Pokémon with two texted parts is reported, not guessed` |
| BR-S05.T11-02 | A scenario id is permanent. Renaming a scenario is a new id plus a documented redirect, because `rule_evidence.ref` holds the id and the ledger is insert-only (RN-64). | the id is the file's path stem and is checked for uniqueness by the sync; a `moved.json` records redirects | `sync-scenarios.spec.ts > two scenarios with the same id fail`; `> a renamed scenario without a redirect is reported as an orphaned ref` |
| BR-S05.T11-03 | Every scenario carries `source`: the legacy node id (`tests/test_abilities.py::test_x`), a rulebook page, or the ruling it encodes. A scenario with no source is rejected. | the schema's `source` is required and non-empty; `pnpm check` runs the sync in validate-only mode | `sync-scenarios.spec.ts > a scenario without source fails validation` |
| BR-S05.T11-04 | Git is the source of truth for scenarios; `rule_scenarios` is a mirror rebuilt by delete-then-insert. Nothing writes a scenario into the database that is not a file. | `pnpm rules:sync-scenarios` reads the directory and replaces the table; the API has no scenario-write route | `sync-scenarios.spec.ts > sync is delete-then-insert and is idempotent`; `api.spec.ts > there is no POST /api/rules/scenarios` |
| BR-S05.T11-05 | A scenario that fails because the new engine is right and the legacy assumption was wrong is kept, corrected, and its `source` records the ruling that settles it — it is never deleted to make the suite green. | the triage procedure; the `source` field gains a `superseded:` line | `conversion-report.json` lists every such case; review checklist item in `CONVERSION.md` |
| BR-S05.T11-06 | The conversion helper produces a skeleton, not a scenario: its output is always reviewed and completed by a human before it is committed, and it marks every `answer` step it could not resolve with `"pick": "TODO"`. | `convert-tests.mjs` writes into `engine/scenarios/_draft/` and `pnpm check` fails on any committed scenario containing `"TODO"` | `pnpm check` fails on a fixture scenario with a `TODO` pick |
| BR-S05.T11-07 | A scenario is deterministic: it fixes the seed or forces every coin, and running it twice yields the same result on the same engine build. | the scenario schema's `seed` / forced-flip fields ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)); the runner asserts no unforced randomness in a scenario declaring `deterministic: true` | `cargo test -p ptcg-core scenarios::` runs every converted scenario twice and compares; a scenario with an unforced flip and no seed fails |
| BR-S05.T11-08 | The converted set covers at least the 117 parts of 109 cards that the legacy's ledger records as proven, or names each missing one with a reason. | the coverage check in `conversion-report.json`, comparing the scenarios' resolved text hashes against a transcription of `verified_cards.json` | `conversion.spec.ts > every part in verified_cards.json maps to a converted scenario or to a reason` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `pokemon/tests/test_*.py`, `sim/testkit/__init__.py`, `sim/verified_cards.json` | R | script (`convert-tests.mjs`), developer | during conversion | read-only; the legacy tree is never written | the inputs |
| `engine/scenarios/cards/**/*.json` | C/U | developer | one file per converted test | committed to git; ids permanent | BR-S05.T11-02 |
| `engine/scenarios/_draft/**` | C/D | script (`convert-tests.mjs`) | skeleton generation | never committed; `.gitignore`d | BR-S05.T11-06 |
| `effect_texts`, `card_parts`, `cards` | R | script (`convert-tests.mjs`, `rules:sync-scenarios`) | resolving a legacy mark to a text hash | read-only | BR-S05.T11-01 |
| `rule_scenarios` | C/D | script (`pnpm rules:sync-scenarios`) | after editing scenarios, and in `pnpm check` | delete-then-insert of the whole mirror in one transaction; idempotent | BR-S05.T11-04 |
| `rule_scenarios` | R | api, worker | the editor's per-text scenario list; the worker's scenario job | read-only | [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T13](T13-rules-editor-ui.md) |
| `rule_evidence` | — | this subtask | never | the worker writes evidence after running a scenario | [S05.T12](T12-evidence-and-coverage-metrics.md), RN-64 |
| `rule_codes`, `text_codes` | R | developer | while triaging a failing scenario | read-only here; a fix is authored in the editor | [S05.T13](T13-rules-editor-ui.md) |
| `<out>/conversion-report.json` | C | script | every conversion run | always written | the triage artefact |

## Interfaces

**Scenario file layout and id convention.** `engine/scenarios/cards/<supertype>/<slug>.json`, where `<supertype>` is `pokemon`, `trainer`, `energy` or `stadium` and `<slug>` is derived from the legacy test name with the `test_` prefix removed. The id is the path without the extension: `cards/trainer/air-balloon-reduces-retreat-and-restores-on-detach`. Ids are permanent (BR-S05.T11-02).

**`engine/scenarios/CONVERSION.md` — the helper mapping.** Every legacy helper, what it does, and its scenario equivalent.

| Legacy helper | What it does | Scenario equivalent |
|---|---|---|
| `state(p1_active, p1_bench, p2_active, p2_bench, hand, left, deck, discard, prizes, seed)` | builds a `State` with both players' zones | `setup: { turn, p1: { active, bench, hand, deck, discard, prizes }, p2: {…}, seed }` |
| `card(cid)` | instantiates a card by engine id (`TWM-130`) | a printing id (`sv4pt5-54`) in the corresponding zone array; the engine ids are translated through the card tables |
| `cat(key)` | instantiates a catalog card by `name_key` | the same: a printing id; there is no "catalog" versus "engine" distinction any more |
| `attach_energy(pokemon, cid, n)` | appends `n` energies to a Pokémon | `energies: ["Fire", "Fire"]` inside that slot's `setup` entry |
| `put(st, pokemon, where="bench")` | places a Pokémon in a zone after setup | part of `setup`, or a `{ action: { kind: "play_pokemon", … } }` step when the test is about the placement |
| `play_tool(tool, st, holder)` | attaches a tool | `tools: ["me5-104"]` inside the holder's `setup` entry, or a `play_tool` action step |
| `put_stadium(stadium, st, player)` | puts a stadium into play | `setup.stadium: { card, playedBy }` |
| `use_stadium(stadium, st, selectors)` | uses a stadium's once-per-turn effect | `{ action: { kind: "use_stadium" } }` followed by `answer` steps |
| `use_ability(pokemon, st, selectors, expect)` | uses an ability, asserting availability | `{ action: { kind: "use_ability", slot, index } }`; `expect=False` becomes `{ expect: { legal_actions_include: [] } }` on that ability |
| `pick(*names)` | a selector choosing candidates by card name | `{ answer: { purpose, pick: [{ name }] } }` |
| `drive_choices(gen, selectors)` | drives the generator, one selector per prompt | one `{ answer: { purpose, pick } }` step per prompt, in order |
| `damage(st, source, target, base)` | computes damage through `status` | `{ expect: { damage_calc: { base, plus_before, weakness_applied, resistance_applied, minus_after, prevented, final } } }` |
| bare `assert x.hp == …` | HP after damage and healing | `{ expect: { counters: { slot, value } } }` — counters, not HP, since [S04.T03](../04-game-engine-core/T03-game-state-model.md) stores damage as counters |
| `status.refresh_field(player, st)` | forces a modifier recomputation | nothing: the index rebuilds on `board_version` ([S05.T05](T05-continuous-modifiers-and-triggers.md)) |
| `@pytest.mark.verifies("key", "Part")` | declares what the test proves | `verifies: ["text:<hash>"]`, resolved from the card's part |

**Worked conversion** — `tests/test_tools_stadiums.py::test_air_balloon_reduces_retreat_and_restores_on_detach`, one of the 134 recorded proofs. The legacy test builds a Charizard ex active with a Charmander benched, records the printed retreat cost, plays Air Balloon, calls `refresh_field`, asserts the cost dropped by 2, detaches the tool and asserts the cost came back.

```json
{
  "id": "cards/trainer/air-balloon-reduces-retreat-and-restores-on-detach",
  "title": "Air Balloon lowers retreat by 2 and restores it when detached",
  "verifies": ["text:<hash of Air Balloon's trainer text>"],
  "source": "tests/test_tools_stadiums.py::test_air_balloon_reduces_retreat_and_restores_on_detach",
  "deterministic": true,
  "setup": {
    "turn": "p1",
    "p1": { "active": { "card": "sv4pt5-54", "energies": [] },
            "bench":  [ { "card": "sv4pt5-26" } ],
            "hand":   [ "sv4-156" ], "prizes": 3 },
    "p2": { "active": { "card": "sv4pt5-54" }, "prizes": 3 }
  },
  "steps": [
    { "expect": { "retreat_cost": { "slot": "p1.active", "value": 2 } } },
    { "action": { "kind": "play_tool", "card": "sv4-156", "target": "p1.active" } },
    { "expect": { "retreat_cost": { "slot": "p1.active", "value": 0 } } },
    { "action": { "kind": "discard_tool", "card": "sv4-156" } },
    { "expect": { "retreat_cost": { "slot": "p1.active", "value": 2 } } }
  ]
}
```

Three things changed on purpose. The printed retreat cost is asserted before the tool, so the scenario states its own premise instead of computing `base` at run time (the legacy's `assert base >= 2`). `refresh_field` disappears, because the modifier index rebuilds itself. And the detach is an action, not a call into `effects._detach`, so the scenario exercises the same path a game does.

**`scripts/rules/convert-tests.mjs`** — the skeleton generator.

```
node scripts/rules/convert-tests.mjs --tests <legacy>/tests --only test_tools_stadiums.py \
     --verified <legacy>/src/pokesearch/sim/verified_cards.json --out engine/scenarios/_draft [--json]
```

It parses each test function's helper calls in order (it does not execute Python), maps them through the table above, resolves each `verifies` mark to a text hash through `cards`/`card_parts`, and writes a skeleton with `"pick": "TODO"` wherever a `drive_choices` selector was a lambda it could not read. Exit 0 always; the report says how many skeletons need work. Nothing it writes is committed (BR-S05.T11-06).

**`pnpm rules:sync-scenarios`** `[--check] [--json]`: reads `engine/scenarios/**/*.json`, validates each against the [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) schema, resolves every `verifies: "text:<hash>"` against `effect_texts`, checks id uniqueness, and replaces `rule_scenarios`. `--check` validates without writing and is what `pnpm check` runs. Exit codes: 0 ok, 1 a validation or resolution failure, 2 the database is unavailable.

**`conversion-report.json`**: `{ ranAt, legacy: { marks: 136, byFile: {...}, storedNodeIds: 134, parts: 117, cards: 109 }, converted: { scenarios, texts }, skipped: [{ nodeId, reason }], unresolvedMarks: [{ nodeId, key, part, reason }], failures: [{ scenarioId, step, expected, actual, triage: "engine_bug" | "code_missing" | "legacy_wrong" | "not_yet_implemented", issue }] }`.

## Implementation steps

1. Transcribe `verified_cards.json` into `packages/db/fixtures/legacy-verified.json` (109 cards → parts → node ids) and write the resolver that turns a `(name_key, part)` pair into a `text_hash` through `cards` and `card_parts`; report the marks it cannot resolve.
2. Write `engine/scenarios/CONVERSION.md` with the helper mapping table and the worked Air Balloon conversion.
3. Write `convert-tests.mjs` for the `state` / `card` / `cat` / `attach_energy` / `put` subset and generate skeletons for `test_tools_stadiums.py` (28 marks, the most mechanical file).
4. Convert `test_tools_stadiums.py` by hand from the skeletons; run them through the [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) runner and triage every failure.
5. Convert `test_special_energy.py` (11) and `test_attack_effects.py` (10) — both small and both exercising [S05.T05](T05-continuous-modifiers-and-triggers.md) and the attack fields.
6. Convert `test_abilities.py` (36), the largest and the one that exercises `once_scope` (RN-16) and triggers.
7. Convert `test_effects.py` (25) and `test_engine_cards.py` (24) — the Items and Supporters, which are also the cards that had no recipe to import.
8. Convert `test_rules.py` (2) or confirm that [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)'s `rules/*.json` already covers them, and record which.
9. Write `pnpm rules:sync-scenarios` with `--check`, add it to `pnpm check`, and mirror the converted set into `rule_scenarios`.
10. Run the whole converted set, produce `conversion-report.json`, triage every failure into one of the four buckets with an issue each, and record the pass rate.
11. Convert the remaining non-`verifies` tests in the seven files as regression scenarios, lowest value last.

## Edge cases and error handling

- **A mark with no part on a Pokémon.** `@pytest.mark.verifies("some pokemon")` with no part name means "the whole card", which `verified.py` maps to `WHOLE = "*"` — and `*` only matches a Trainer or a Special Energy. On a Pokémon it proves nothing, and the legacy's `unknown_claims` flagged it. Here it is reported in `unresolvedMarks` and the converter refuses to guess which part the test covered.
- **A test proving two cards at once.** `test_abilities.py::test_every_hide_n_sneak_pokemon_of_the_deck_blocks_effects_and_takes_damage` carries a mark per card. It becomes one scenario with several entries in `verifies`, which the format allows, and the evidence writer produces one row per `(text, code)` pair ([S05.T12](T12-evidence-and-coverage-metrics.md)).
- **A `drive_choices` selector that takes the first option.** `lambda info: list(info["raw_available_actions"][0].chosen)` proves the effect ran, not that the right thing was chosen. The converted scenario names the concrete `pick` the test's later assertions imply; when they imply nothing, the skeleton keeps `"TODO"` and a human decides. A scenario that asserts less than the original is worse than no scenario.
- **A test asserting through a private helper.** `from pokesearch.sim.effects import _detach` in the Air Balloon test. The scenario uses the public action instead, which is a stronger test and occasionally reveals that the action path differs from the helper path — a finding, not an obstacle.
- **A test that depends on the third-party engine's behaviour rather than the card's.** `test_engine_cards.py` exists precisely to pin down the engine's own cards; some of its assertions encode that engine's quirks. Those convert to `legacy_wrong` in triage and the scenario is rewritten against the printed text, with the ruling in `source`.
- **A scenario that fails because the new engine is right.** Kept and corrected, with a `superseded:` line in `source` naming the ruling. The legacy documented several such cases itself (the Dunsparce "Dig" implementation with the coin flipped and no effect *"for simplicity"*, the Cruel Arrow that placed 10 counters and bypassed the Tera rule).
- **A scenario that fails because a code is missing.** Triaged `code_missing`; the scenario stays red, the text appears in the authoring queue, and no evidence is written. This is the correct state and the coverage page shows it.
- **A scenario whose text hash no longer exists** after an ETL reload changed the wording. `pnpm rules:sync-scenarios` fails with the scenario id and the hash. The fix is to repoint `verifies` at the new hash after checking the text really is the same card; the old `rule_evidence` rows stay in the ledger and stop counting.
- **Two scenarios with the same id.** The sync fails. Ids are path stems, so this means two files at the same path, which git prevents — except after a rename, which is what `moved.json` is for.
- **A scenario with an unforced coin flip and no seed.** Rejected when it declares `deterministic: true`, which every converted scenario does. A card whose behaviour is genuinely random needs forced flips, not a lucky seed.
- **`test_rules.py` has only 2 marks** but is the file the rulebook corrections live in (RN-11). Most of its content belongs to [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)'s `rules/*.json`, not here; step 8 records the split so neither subtask assumes the other did it.

## Acceptance / verification

- [ ] `pnpm rules:sync-scenarios --check` passes: every file under `engine/scenarios/**` validates against the [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) schema, every `verifies: "text:<hash>"` resolves to an `effect_texts` row, every `source` is non-empty and every id is unique (BR-S05.T11-01, -03).
- [ ] `pnpm rules:sync-scenarios` writes the mirror and a second run reports zero changes (BR-S05.T11-04).
- [ ] `cargo test -p ptcg-core scenarios::` runs every converted scenario; the pass rate is recorded in `conversion-report.json` and every failure is triaged into `engine_bug`, `code_missing`, `legacy_wrong` or `not_yet_implemented` with an issue reference (BR-S05.T11-05).
- [ ] `conversion.spec.ts > every part in verified_cards.json maps to a converted scenario or to a reason` — all 117 parts of the 109 cards are accounted for (BR-S05.T11-08).
- [ ] The Air Balloon scenario above passes end to end, including the retreat cost before the tool, after the tool and after the detach.
- [ ] `cargo test -p ptcg-core scenarios::` run twice on the same build produces identical results for every scenario, and a fixture scenario with an unforced flip and `deterministic: true` fails (BR-S05.T11-07).
- [ ] `pnpm check` fails on a committed scenario containing `"pick": "TODO"` and passes for the real tree (BR-S05.T11-06).
- [ ] `sync-scenarios.spec.ts > two scenarios with the same id fail` and `> a scenario verifying an unknown text hash fails the sync` (BR-S05.T11-01, -02).
- [ ] `engine/scenarios/CONVERSION.md` exists with the full helper mapping table and the worked conversion, and every converted file's `source` names its legacy node id.
- [ ] `conversion-report.json` records the legacy baseline (136 marks, 134 stored node ids, 117 parts, 109 cards) against the converted counts, so the carry-over is a number and not an impression.

## Risks and open questions

- **Risk — the conversion is a long hand-editing job** (136 marks plus regression tests) and stalls the stage. Mitigation: the skeleton generator removes the mechanical half, the order of steps 4–8 is by value, and [S05.T12](T12-evidence-and-coverage-metrics.md) only needs *some* scenarios to start reporting a real `proven` number. A partial conversion is useful; an unreviewed conversion is not.
- **Risk — a converted scenario asserts less than the legacy test did** because a `drive_choices` selector was unreadable. This silently weakens the evidence base while looking like progress. Mitigation: the `TODO` rule (BR-S05.T11-06), and a review checklist item requiring every original `assert` to have a corresponding `expect`.
- **Risk — many scenarios fail at first** because the codes do not exist yet ([S05.T07](T07-rule-codes-composition-semantics.md)–[S05.T10](T10-import-catalog-recipes.md) run in parallel with this). Mitigation: the `code_missing` triage bucket, and the understanding that a red scenario with a named cause is the authoring queue's best input.
- **Risk — scenario ids drift from `rule_evidence.ref`.** Mitigation: ids are permanent, renames go through `moved.json`, and the sync reports evidence whose `ref` matches no scenario ([S05.T12](T12-evidence-and-coverage-metrics.md) shows it).
- **Question — should the regression tests (step 11) be scenarios or Rust unit tests?** Scenarios cost more to write and are readable by the editor and by the coverage page; Rust tests are faster to write and invisible. Recommendation: scenarios for anything that is *about a card*, Rust tests for anything about the engine itself. The user does not need to decide this; the reviewer does.
- **Question — should a scenario be allowed to verify a `rule:` name as well as a `text:` hash?** The format allows both ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)), and `rules/*.json` uses `rule:`. Converted card scenarios use `text:` only, because `rule_evidence` is keyed on a text. A scenario verifying only a `rule:` produces no evidence row and is engine-test-only, which is correct — worth stating in `CONVERSION.md` so nobody expects coverage from it.
- **DEPENDENCY-PROPOSAL: S05.T11 should depend on S05.T02 because** resolving a legacy `@pytest.mark.verifies("card", "Part")` mark to a `verifies: ["text:<hash>"]` value requires `effect_texts` and `card_parts` and the `textHash` function; today the dependency is not expressed at all.

## References

- `pokemon/tests/conftest.py` — verified: the `verifies` marker contract (*"`@pytest.mark.verifies("name key", "Parte", ...)` declara de que carta o teste é prova"*), `--write-verified`, `pytest_itemcollected` collecting the marks, `pytest_runtest_makereport` recording `ran` and `passed` (with the note that a test skipped in setup counts as having run and not proved), and the terminal summary listing declared-but-unproven node ids. Consult for the evidence semantics [S05.T12](T12-evidence-and-coverage-metrics.md) reproduces.
- `pokemon/src/pokesearch/sim/verified.py` L62–81 (`merge_run`) — verified: a test that ran enters if it passed and leaves if it failed or was skipped; a test that did not run keeps its previous entry. `L84–97` (`declared_index`, `stored_index`) — the two-way comparison. Consult for why evidence is per run and per build here.
- `pokemon/src/pokesearch/sim/verified_cards.json` — verified: `version: 1`, 109 cards, 117 parts, 134 distinct node ids across the seven test files; examples `"annihilape": {"Destined Fight": [...]}`, `"banette": {"Hide 'n' Sneak": [...], "Puppet Pull": [...]}`, `"area zero underdepths": {"*": [two tests]}`. The evidence baseline this subtask must carry over.
- `pokemon/tests/test_verified.py` — verified: `test_stored_proofs_match_the_markers` (the file and the marks must agree in both directions), `test_every_claim_points_to_a_real_part`, `test_card_without_effect_text_is_proven_and_untested_part_is_not` (Dreepy has two textless attacks and is complete; Drakloak has one texted part), and `test_verified_never_exceeds_exact` (`0 < verified_copies <= exact_copies`). Consult for the invariants [S05.T12](T12-evidence-and-coverage-metrics.md) inherits.
- `pokemon/src/pokesearch/sim/testkit/__init__.py` — verified: `make_card`, `PlayerZones(hand, left, discard, prize, active, bench)`, `make_state(player1, player2, turn)` seeding `random.Random(0)`, `drive_choices(generator, selectors)` driving one selector per prompt and raising when the generator yields more prompts than selectors, and `_find_choice` matching a `ChooseCardAction` by its `chosen` list. Consult for the `setup` and `answer` mappings.
- `pokemon/tests/test_tools_stadiums.py` L24–96 — verified: the local helpers `_registry`, `cat`, `card`, `state`, `attach_energy`, `play_tool`, `put_stadium`, `use_stadium`, `damage`, and the worked test at L97–112. `pokemon/tests/test_abilities.py` L24–92 — verified: `put`, `use_ability`, `pick`, `damage`. Consult for the helper mapping table.
- `pokemon/tests/test_{abilities,tools_stadiums,effects,engine_cards,special_energy,attack_effects,rules}.py` — verified mark counts: 36, 28, 25, 24, 11, 10, 2 = 136.
- [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) — the scenario JSON shape, the runner and the `rules/*.json` set; [S05.T12](T12-evidence-and-coverage-metrics.md) — what happens to a passing scenario.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
