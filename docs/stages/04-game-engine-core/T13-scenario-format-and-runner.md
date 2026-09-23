# S04.T13 — Scenario format and runner

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 13 / 18 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S04.T07](T07-damage-pipeline.md), [S04.T08](T08-special-conditions-and-checkup.md), [S04.T09](T09-prompt-protocol.md) |
| Unblocks | [S05.T11](../05-card-rules-base/T11-legacy-tests-to-scenarios.md), [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md) |
| Parallel with | [S04.T12](T12-cli-job-protocol.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/scenario` placeholder — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `module` damage calc observables — from [S04.T07](T07-damage-pipeline.md)
- `module` conditions/checkup — from [S04.T08](T08-special-conditions-and-checkup.md)
- `contract` prompts and answers — from [S04.T09](T09-prompt-protocol.md)
- `file` `pokemon/src/pokesearch/sim/testkit/__init__.py` and `pokemon/tests/test_rules.py` — `make_state`, `PlayerZones`, `drive_choices` and the rulebook citations; read-only reference

## Outputs (proposed)
- `contract` scenario JSON `{ id, title, verifies: ['text:<hash>' | 'rule:<name>'], source, setup: { turn, p1: { active: { card, energies, damage?, conditions? }, bench: [...], hand: [...], deck: [...], prizes: n, discard: [...] }, p2: {...}, stadium? }, steps: [ { action }, { answer: { purpose, pick } }, { expect: { damage_calc | zone_contains | counters | conditions | prizes | legal_actions_include | prompt_pending | outcome } }, { checkup } ] }` — consumed by [S05.T11](../05-card-rules-base/T11-legacy-tests-to-scenarios.md), [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md)
- `module` `ptcg-core::scenario` runner used by `cargo test` (every `engine/scenarios/**/*.json`) and by the CLI job kind `scenarios` (emits pass/fail + diff per scenario)
- `file` `engine/scenarios/rules/*.json` — the rulebook fixes: evolve keeps damage; only the starter skips the first attack; the starter draws on turn 1; tool persists after evolving; benching a Basic fires field triggers; a card returned to hand cannot evolve the turn it is replayed; nobody evolves on their own first turn (RN-11)

## Initial objective
Rules and card behaviours are asserted by data files that cite their source, runnable by the engine test suite and by the worker, so evidence for 'proven coverage' is produced by the same mechanism as the engine's own tests.

## Context

A scenario is a test written as data. That sounds like a stylistic choice and is not: it is the mechanism that makes "proven coverage" measurable. [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) records an evidence row per `(text, code, kind, engine build, rules snapshot)`, and the only way a scenario can be evidence is if the same file that the engine's own `cargo test` runs can also be run by the worker against the current build and reported per card. A Rust `#[test]` cannot do that; a JSON file with a `verifies` list can.

The legacy did the same thing with `@pytest.mark.verifies` marks over 136 hand-written tests, and the marks were the source of the proven number (RN-72, RN-73). The mechanism worked but bound the evidence to pytest: a proof existed because a Python test had run, and `verified.py` had to reconcile the marks with a JSON file. Here the file *is* the proof, and rerunning it against a new engine build is one command.

The format is shaped by what the legacy helpers made easy. `pokemon/src/pokesearch/sim/testkit/__init__.py` builds a state from `PlayerZones(hand=…, left=…, discard=…, prize=…, active=[…], bench=[…])` — a flat description of the zones with no game history — and drives prompts with `drive_choices(generator, selectors)`, a list of selectors answered in order. `setup` and the `answer` step are those two ideas with the improvisation removed: zones are named explicitly, and an answer names the purpose it is answering so a scenario does not silently drift when a step is inserted.

Three properties make a scenario worth trusting. It **cites its source**: `source` carries a rulebook page, a legacy test name or a Limitless ruling, so a disagreement is settled by looking it up rather than by arguing. It **fails legibly**: the runner reports the first failing step with expected and actual JSON, because a scenario suite that fails opaquely stops being run. And it is **hermetic**: `card_defs` come from the job ([S04.T12](T12-cli-job-protocol.md)) or, in `cargo test`, from a checked-in fixture file, so a scenario's meaning does not change when the card database is reloaded.

This subtask also writes the first seven scenarios — the RN-11 rulebook corrections — which are the same seven assertions `pokemon/tests/test_rules.py` makes, plus the damage and condition scenarios owned by [S04.T07](T07-damage-pipeline.md) and [S04.T08](T08-special-conditions-and-checkup.md). They are the regression suite for everything S05 builds on top.

## Scope

- **In scope.** The scenario JSON schema in `@pokesearch/shared/scenario` with its exported JSON Schema and `serde` mirror; the `ptcg-core::scenario` runner (setup builder, step executor, expectation evaluator, diff reporter); the `cargo test` harness that discovers and runs every `engine/scenarios/**/*.json`; the `scenarios` job kind's per-scenario `scenario` line ([S04.T12](T12-cli-job-protocol.md)); the fixture `card_defs` file scenarios resolve against in `cargo test`; the seven RN-11 scenario files; a `scenario lint` that refuses a file without `source` or with an unknown `verifies` prefix.
- **Out of scope.** Converting the 136 legacy verified tests ([S05.T11](../05-card-rules-base/T11-legacy-tests-to-scenarios.md)); the `rule_scenarios` table that mirrors these files ([S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)); evidence rows and coverage arithmetic ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)); the differential oracle that generates scenarios from twinleafgg ([S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md)); the IR vocabulary a scenario's `verifies: text:<hash>` points at ([S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md)); the worker's persistence of scenario results ([S04.T15](T15-worker-job-runner.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-11 | **Kept (asserted here).** The six rulebook corrections plus "nobody evolves on their own first turn" each have a scenario file under `engine/scenarios/rules/` citing its rulebook sentence: `evolve-keeps-damage.json`, `first-turn-attack.json`, `first-turn-draw.json`, `tool-survives-evolution.json`, `bench-trigger.json`, `replayed-basic-no-evolve.json`, `no-evolve-own-first-turn.json`. | the seven files plus the `cargo test` discovery harness | `cargo test -p ptcg-core scenarios` runs all seven and they pass; `scenario_lint > every_rules_scenario_cites_a_source` |
| BR-S04.T13-01 | A scenario is hermetic: `setup` fully determines the state, card references resolve against the job's `card_defs` (or the checked-in fixture in `cargo test`), and no step depends on shuffling, timing or a random draw unless the scenario fixes a `seed`. | `scenario::build_state`; `Scenario::seed` defaulting to 0 and the RNG being `Xoshiro256**` seeded from it | `scenario.rs > the_same_scenario_yields_the_same_state`; `> a_scenario_without_a_seed_still_runs_deterministically` |
| BR-S04.T13-02 | Every scenario declares `verifies` and `source`; `verifies` entries are `rule:<name>` or `text:<sha256>` and nothing else, and `source` is a non-empty string naming a rulebook page, a legacy test or a ruling. | the zod schema's refinements; `scripts/scenario-lint.mjs` in `pnpm check` | `scenario_lint > a_file_without_source_fails`; `> an_unknown_verifies_prefix_fails` |
| BR-S04.T13-03 | The runner reports the **first** failing step with its index, the step's JSON, the expectation and the actual value, and stops that scenario; it never reports only "failed". | `scenario::run` returning `ScenarioResult { ok, step, expected, actual }` | `scenario.rs > a_wrong_expectation_reports_step_and_diff`; the CLI's `scenario` line carries the same three fields ([S04.T12](T12-cli-job-protocol.md)) |
| BR-S04.T13-04 | An `answer` step names the `purpose` it answers; when the pending prompt's purpose differs, the scenario fails with `purpose_mismatch` rather than answering the wrong question. | `scenario::step_answer` comparing `prompt.purpose` | `scenario.rs > an_answer_for_the_wrong_purpose_fails`; this is what makes an inserted step visible instead of silent |
| BR-S04.T13-05 | An `action` step must be in `legal_actions`; an illegal one fails the scenario with `illegal_action` and does **not** take RN-21's substitution path — a scenario asserts the rules, it does not exercise the tolerance for broken bots. | `scenario::step_action` calling `Game::is_legal` before `apply` | `scenario.rs > an_illegal_action_step_fails_the_scenario` |
| BR-S04.T13-06 | Every expectation kind is total and value-based: `damage_calc`, `zone_contains`, `counters`, `conditions`, `prizes`, `legal_actions_include`, `prompt_pending`, `outcome`, `hand_size`, `deck_size`. Each compares against an explicit value; there is no free-form predicate and no string matching on card text. | `scenario::Expect` enum with `#[serde(deny_unknown_fields)]` | `scenario.rs > every_expectation_kind_has_a_passing_and_a_failing_case` (ten pairs) |
| BR-S04.T13-07 | Scenario ids are unique across `engine/scenarios/**` and stable: a file may be moved, its id may not change, because evidence rows reference it ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)). | `scripts/scenario-lint.mjs` collecting ids; the id is also the file's `id` field, not its path | `scenario_lint > ids_are_unique`; `> id_matches_no_other_file` |
| BR-S04.T13-08 | A scenario run produces no side effect outside the game it builds: no file is written, no global is touched, and running the suite twice gives identical results. | `scenario::run` taking `&Scenario` and returning a value | `scenario.rs > running_the_suite_twice_gives_identical_results` |
| BR-S04.T13-09 | `cargo test` discovers every `engine/scenarios/**/*.json`, so adding a file adds a test with no code change, and a file that fails to parse is a failing test rather than a skipped one. | the discovery harness walking the directory at test time | `scenario.rs > discovery_finds_every_file`; `> a_malformed_file_fails_the_suite` |
| BR-S04.T13-10 | The `scenarios` job kind reports one `scenario` line per file with `{ id, ok, step?, expected?, actual? }` and a final `done`; the worker stores the results without interpreting them ([S04.T15](T15-worker-job-runner.md)). | `ptcg-cli`'s `scenarios` dispatch | `cli.rs > scenarios_job_emits_one_line_per_scenario` |

## Data operations

**State mutations performed by the runner** (the `setup` block is the only place the engine builds a state without playing to it).

| Zone / field | Mutation | When | Invariant |
|---|---|---|---|
| `cards: Vec<CardInst>` | allocated from the union of every zone list in `setup` | `build_state` | the 60-card rule (RN-10) does **not** apply to scenarios: a setup declares exactly the cards it names |
| `Player::{hand, deck, discard, prizes}` | filled in the order written in the JSON | `build_state` | deck order is literal — index 0 is the bottom, the last entry is the top ([S04.T03](T03-game-state-model.md) BR-S04.T03-04) |
| `Player::active`, `Player::bench[i]` | a `Slot` per entry, with `energies`, `damage`, `conditions`, `tools` as declared | `build_state` | `damage` must be a multiple of 10; conditions on a benched slot are rejected at build time (RN-12) |
| `Game::stadium` | set when `setup.stadium` is present | `build_state` | the card is owned by the player the JSON names |
| `Game::turn_no`, `Game::current`, `Player::first_turn` | set from `setup.turn` | `build_state` | `setup.turn` names the player to act and the turn number, so first-turn rules can be asserted (RN-11) |
| `Game::rng` | seeded from `setup.seed` (default 0) | `build_state` | a scenario that depends on a coin states its seed (BR-S04.T13-01) |
| any zone | mutated by the rules | each `action`, `answer` and `checkup` step | the runner never mutates the state directly after `build_state` |
| `Game::pending_prompt` | answered | each `answer` step | the purpose must match (BR-S04.T13-04) |
| the database | — | never | the engine holds no connection; `rule_scenarios` is mirrored by [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md) from git |

**Artifacts.**

| Artifact | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| `engine/scenarios/rules/*.json` | create | developer | here (seven RN-11 files) | each cites a rulebook sentence in `source`; ids `rule.<slug>` |
| `engine/scenarios/damage/*.json`, `conditions/*.json` | create | developer | here, from [S04.T07](T07-damage-pipeline.md) and [S04.T08](T08-special-conditions-and-checkup.md) | ids `damage.<slug>`, `cond.<slug>` |
| `engine/scenarios/cards/**/*.json` | create | [S05.T11](../05-card-rules-base/T11-legacy-tests-to-scenarios.md) onwards | not written here | `verifies: ["text:<sha256>"]` |
| `engine/fixtures/scenario-cards.json` | create | developer | here | the `CardDef`s scenarios resolve against in `cargo test`; regenerated by `pnpm --filter @pokesearch/shared fixtures:scenario-cards` |
| `packages/shared/schema/scenario.json` | generate | `pnpm --filter @pokesearch/shared schema:build` | here and on every schema change | the contract [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md) generates against |

## Interfaces

**Scenario JSON** (`@pokesearch/shared/scenario`):

```jsonc
{
  "id": "rule.evolve-keeps-damage",
  "title": "Evolving keeps damage counters",
  "verifies": ["rule:RN-11"],
  "source": "Play! Pokémon rulebook (par_rulebook_en.pdf): \"She may play the Houndstone card on top of the Greavard card, keeping any damage counters.\"; legacy tests/test_rules.py::test_evolving_keeps_damage_counters",
  "seed": 0,
  "setup": {
    "turn": { "player": 0, "turn_no": 3 },
    "p1": {
      "active": { "card": "paf-7", "energies": ["sve-2"], "damage": 30 },
      "bench": [],
      "hand": ["paf-8"],
      "deck": ["sve-2", "sve-2", "sve-2"],
      "prizes": 6,
      "discard": []
    },
    "p2": { "active": { "card": "paf-7" }, "deck": ["sve-2"], "prizes": 6 }
  },
  "steps": [
    { "action": { "kind": "evolve", "card": "paf-8", "slot": 0 } },
    { "expect": { "zone_contains": { "player": 0, "zone": "active", "card": "paf-8" } } },
    { "expect": { "counters": { "player": 0, "slot": 0, "damage": 30 } } }
  ]
}
```

**Types.**

```ts
export const CardRef = z.string();                 // a card_id, e.g. "sv4pt5-54"; resolved via card_defs
export const SlotSetup = z.object({
  card: CardRef,
  under: z.array(CardRef).default([]),
  energies: z.array(CardRef).default([]),
  tools: z.array(CardRef).default([]),
  damage: z.number().int().multipleOf(10).default(0),
  conditions: z.array(z.enum(["asleep","paralyzed","confused","poisoned","burned"])).default([]),
  turn_played: z.number().int().optional(),
});
export const PlayerSetup = z.object({
  active: SlotSetup.optional(), bench: z.array(SlotSetup).default([]),
  hand: z.array(CardRef).default([]), deck: z.array(CardRef).default([]),
  discard: z.array(CardRef).default([]), lost_zone: z.array(CardRef).default([]),
  prizes: z.number().int().min(0).max(6).default(6),
  first_turn: z.boolean().optional(), deck_searched: z.boolean().default(false),
});
export const Step = z.union([
  z.object({ action: ActionRef }),
  z.object({ answer: z.object({ purpose: Purpose, pick: z.unknown() }) }),
  z.object({ expect: Expect }),
  z.object({ checkup: z.literal(true) }),
  z.object({ end_turn: z.literal(true) }),
]);
export const Scenario = z.object({
  id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
  title: z.string(),
  verifies: z.array(z.string().regex(/^(rule:[A-Za-z0-9-]+|text:[0-9a-f]{64})$/)).min(1),
  source: z.string().min(1),
  seed: z.number().int().nonnegative().default(0),
  setup: z.object({ turn: z.object({ player: z.number().int().min(0).max(1),
                                     turn_no: z.number().int().min(1).default(1) }),
                    p1: PlayerSetup, p2: PlayerSetup, stadium: z.object({ card: CardRef, owner: z.number().int() }).optional() }),
  steps: z.array(Step).min(1),
});
```

**Expectation kinds** (BR-S04.T13-06):

| Kind | Asserts |
|---|---|
| `damage_calc` | the `DamageCalc` of the last resolution: any subset of `{ base, plus_before, weakness_applied, resistance_applied, minus_after, prevented, replaced, final }` ([S04.T07](T07-damage-pipeline.md)) |
| `zone_contains` | `{ player, zone, card, count? }` — the card appears in that zone the given number of times (default ≥ 1) |
| `counters` | `{ player, slot, damage }` — the slot's damage equals the value |
| `conditions` | `{ player, slot, has: [], not: [] }` |
| `prizes` | `{ player, remaining }` |
| `legal_actions_include` | `{ player, action }` / `exclude` — used for "no Attack on turn 1" (RN-11) |
| `prompt_pending` | `{ purpose, actor?, owner?, candidates? }` |
| `outcome` | `{ winner, reason }` ([S04.T10](T10-termination-stall-and-determinism.md)) |
| `hand_size`, `deck_size` | `{ player, n }` — the 46/47 assertion of `rule.first-turn-draw` |

**Runner.**

```rust
pub struct ScenarioResult {
    pub id: String, pub ok: bool,
    pub step: Option<usize>,
    pub expected: Option<serde_json::Value>,
    pub actual: Option<serde_json::Value>,
    pub failure: Option<Failure>,   // PurposeMismatch | IllegalAction | BuildError | Expectation
}

pub fn build_state(defs: &[CardDef], s: &Scenario) -> Result<Game, EngineError>;
pub fn run(defs: &[CardDef], s: &Scenario) -> ScenarioResult;
pub fn run_all(defs: &[CardDef], dir: &Path) -> Vec<ScenarioResult>;   // cargo test only
```

**The seven RN-11 scenarios.**

| id | Asserts | Source |
|---|---|---|
| `rule.evolve-keeps-damage` | 30 damage before and after an evolution | rulebook (Greavard → Houndstone); `test_evolving_keeps_damage_counters` |
| `rule.first-turn-draw` | the starter holds 8 with 46 in deck; the other holds 7 with 47 | rulebook "Start your turn by drawing a card."; `test_starting_player_draws_on_the_first_turn` |
| `rule.first-turn-attack` | the starter's turn-1 actions exclude `Attack`; the second player's include it | rulebook "On the first turn of the game, the starting player skips this step."; `test_only_the_starting_player_skips_the_first_attack` |
| `rule.no-evolve-own-first-turn` | neither player's first turn offers `Evolve` | same rulebook page; same legacy test |
| `rule.tool-survives-evolution` | the tool's `attached_to` follows the new top and its HP bonus still applies | `test_tool_keeps_working_after_evolution` (Hero's Cape: 70 + 100 − 20, then 90 + 100 − 20) |
| `rule.bench-trigger` | benching a Basic raises `enter_bench` once | legacy rule fix 5 (`reduce_play_pokemon_action` → `on_bench_placed`) |
| `rule.replayed-basic-no-evolve` | a Basic returned to hand and replayed is not an evolution target that turn | `test_a_card_that_comes_back_to_the_hand_cannot_evolve_the_turn_it_is_played_again` |

## Implementation steps

1. Write the zod schema in `packages/shared/src/scenario/` with the refinements for `verifies`, `source` and the id pattern; export its JSON Schema. `pnpm --filter @pokesearch/shared test` green.
2. Write the `serde` mirror in `ptcg-core::scenario` and a conformance test parsing checked-in fixtures (BR-S04.T13-02).
3. Implement `build_state`: allocate `cards` from the union of the zone lists, fill the zones in written order, build slots with energies/tools/damage/conditions, set `stadium`, `turn`, `first_turn` and the seed; reject a condition on a benched slot and a non-multiple-of-10 damage (BR-S04.T13-01).
4. Generate `engine/fixtures/scenario-cards.json` from the card fixtures of [S04.T02](T02-card-definition-model.md) and make `cargo test` resolve `CardRef`s against it.
5. Implement the `action` and `answer` steps with their two failure modes (`illegal_action`, `purpose_mismatch`) (BR-S04.T13-04, -05).
6. Implement the `checkup` and `end_turn` steps, delegating to [S04.T08](T08-special-conditions-and-checkup.md) and [S04.T04](T04-setup-and-turn-structure.md), including the resume loop when a checkup suspends on a prompt.
7. Implement the ten expectation kinds with a passing and a failing test each, and the diff reporter that returns expected/actual as JSON values (BR-S04.T13-03, -06).
8. Write the `cargo test` discovery harness that walks `engine/scenarios/**/*.json`, and make a malformed file a failing test (BR-S04.T13-09).
9. Write the seven RN-11 scenario files from the table above, checking each against its legacy assertion; make them pass (RN-11).
10. Move the damage and condition scenarios named by [S04.T07](T07-damage-pipeline.md) and [S04.T08](T08-special-conditions-and-checkup.md) into `engine/scenarios/damage/` and `conditions/` and make the suite green.
11. Write `scripts/scenario-lint.mjs` (unique ids, `source` present, `verifies` prefixes, schema validity) and add it to `pnpm check` (BR-S04.T13-02, -07).
12. Implement the `scenarios` job kind in `ptcg-cli` emitting one `scenario` line per file plus `done`, and check it end to end (BR-S04.T13-10).

## Edge cases and error handling

- **A scenario whose setup names a card absent from `card_defs`** → `BuildError` naming the `card_id`; the scenario fails rather than silently substituting. In `cargo test` this means the fixture file needs regenerating; in a worker job it means [S04.T15](T15-worker-job-runner.md) did not ship the right definitions.
- **A scenario with fewer than 60 cards per side** → allowed, and normal: a scenario states the cards the assertion needs. RN-10 applies to games, not to scenarios, and `build_state` bypasses `Game::new`'s deck check deliberately.
- **A step that ends the game earlier than the scenario expects** → every later step fails with the actual `Outcome` as `actual`, so the report says "the game had already ended" rather than panicking.
- **A prompt pending when the scenario ends** → not a failure by itself; `expect: { prompt_pending }` is how a scenario asserts it. A scenario that leaves an unasserted prompt pending is reported as a warning by the lint, because it is usually a missing step.
- **An `answer` step whose `pick` does not validate** → the scenario fails with the `InvalidAnswer` reason as `actual`; RN-21's substitution is deliberately not applied, because a scenario tests the rules, not the tolerance (BR-S04.T13-05).
- **A scenario that depends on a coin flip** → it sets `seed` explicitly and the expectation states the outcome. The condition scenarios of [S04.T08](T08-special-conditions-and-checkup.md) are written this way, which is also how the legacy tests did it (`st.rng = random.Random(1)`), and a changed RNG implementation therefore breaks them loudly rather than quietly.
- **Two scenarios with the same id in different folders** → the lint fails with both paths. Ids are referenced by evidence rows, so a duplicate would make a proof ambiguous (BR-S04.T13-07).
- **A deliberately wrong expectation** (the acceptance check) → the runner reports the step index, the expectation JSON and the actual JSON; `> a_wrong_expectation_reports_step_and_diff` asserts all three fields are present and non-empty.
- **A scenario whose `verifies` names a text hash that no longer exists** in the rules base → not this runner's problem; [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) reports it as orphan evidence. The runner validates the *shape* of the entry only.
- **A `checkup` step when the phase is not `BetweenTurns`** → the runner calls `end_turn` first when the game is mid-turn, and fails with `illegal_step` when the game has already ended, so a scenario cannot accidentally run two checkups in a row.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core scenarios` green: all seven `engine/scenarios/rules/*.json` pass, including `rule.first-turn-draw` asserting 46 and 47 cards and `rule.tool-survives-evolution` asserting `90 + 100 − 20` (RN-11).
- [ ] `> a_wrong_expectation_reports_step_and_diff`: a copy of `rule.evolve-keeps-damage` with `damage: 0` fails with `step: 2`, the expectation JSON and the actual JSON in the report (BR-S04.T13-03).
- [ ] `> an_answer_for_the_wrong_purpose_fails` and `> an_illegal_action_step_fails_the_scenario` (BR-S04.T13-04, -05).
- [ ] `> every_expectation_kind_has_a_passing_and_a_failing_case` — ten pairs, twenty assertions (BR-S04.T13-06).
- [ ] `> discovery_finds_every_file` (the count equals the number of `.json` files under `engine/scenarios/`) and `> a_malformed_file_fails_the_suite` (BR-S04.T13-09).
- [ ] `pnpm check` → `scenario-lint` passes on the repository and fails on a fixture without `source`, on a duplicate id and on an unknown `verifies` prefix (BR-S04.T13-02, -07).
- [ ] `> running_the_suite_twice_gives_identical_results`, field by field (BR-S04.T13-08).
- [ ] `ptcg-cli` with `kind: "scenarios"` and the seven rule files emits seven `scenario` lines with `ok: true` and one `done` (BR-S04.T13-10).
- [ ] The exported `packages/shared/schema/scenario.json` and the `serde` mirror agree, checked by the same schema-comparison test used for the job protocol ([S04.T12](T12-cli-job-protocol.md) BR-S04.T12-06).

## Risks and open questions

- **Risk — the format is too weak for real card behaviour** and [S05.T11](../05-card-rules-base/T11-legacy-tests-to-scenarios.md) has to extend it mid-conversion, invalidating already-written files. Mitigation: the ten expectation kinds were chosen by reading the legacy's 136 verified tests' assertion styles; extensions are additive (a new `Expect` variant) and old files keep parsing. A conversion that needs a new kind adds it here and says so.
- **Risk — scenarios become slow enough that nobody runs them.** A few hundred scenarios at sub-millisecond each is nothing, but a scenario that plays a full game is not. Mitigation: the lint warns on a scenario with more than 40 steps, and `cargo test` prints the slowest five.
- **Risk — the fixture card file drifts from the real database.** A scenario passing against a stale `CardDef` proves nothing about the current card. Mitigation: the fixture is regenerated by a script, the regeneration is part of `pnpm check`'s drift detection, and the worker's `scenarios` job runs against definitions derived live from the database ([S04.T15](T15-worker-job-runner.md)).
- **Question — should `setup` allow an abstract card ("any Basic with 60 HP") instead of a printing id?** Abstract cards would make scenarios robust to rotation; concrete ids make them exact and citable. Recommendation: concrete ids, matching the legacy and RN-05 (effects match by exact printing); revisit if rotation churn makes the suite expensive to maintain.
- **Question — should a scenario be able to assert an event log?** It would let a scenario prove *how* something happened, not only the end state. Recommendation: defer to [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md), which defines the log format; adding an `expect: { events }` kind then is additive.

## References

- `pokemon/src/pokesearch/sim/testkit/__init__.py` — verified: `PlayerZones(hand, left, discard, prize, active, bench)` and `make_state(player1, player2, turn)` building a state directly from zone lists with `random.Random(0)`; `_make_player` setting `supporterPlayedTurn = False`, `firstTurn = False` and 1-based `card.index` per zone; `drive_choices(generator, selectors)` answering each prompt by finding the `ChooseCardAction` whose `chosen` equals the selector's output and raising with the available choices when none matches. Consult for the setup and answer shapes this format formalises.
- `pokemon/tests/test_rules.py` — verified: the rulebook quotations in the docstrings of `test_evolving_keeps_damage_counters` (90 − 30), `test_starting_player_draws_on_the_first_turn` (46 / 47), `test_only_the_starting_player_skips_the_first_attack` (second player may attack; nobody evolves on their own first turn), `test_tool_keeps_working_after_evolution` (70 + 100 − 20, then 90 + 100 − 20), `test_a_card_that_comes_back_to_the_hand_cannot_evolve_the_turn_it_is_played_again`, and `test_tera_rule_prevents_attack_damage_on_the_bench_only`. These are the sources cited by the seven RN-11 scenarios and by `damage.tera-bench`.
- `pokemon/tests/test_status.py` — verified: the eight condition assertions that become `engine/scenarios/conditions/*.json` ([S04.T08](T08-special-conditions-and-checkup.md)), each with its own fixed `rng` seed.
- [S04.T09](T09-prompt-protocol.md) — `Purpose` and `Answer`, the vocabulary an `answer` step uses.
- [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) — the consumer of `id` and `verifies`; the reason ids are stable and evidence is per engine build (RN-72, RN-73).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
