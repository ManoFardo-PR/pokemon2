# S05.T03 — Effect IR vocabulary

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 3 / 16 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S04.T07](../04-game-engine-core/T07-damage-pipeline.md), [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) |
| Unblocks | [S05.T04](T04-ir-compiler-and-vm.md), [S05.T05](T05-continuous-modifiers-and-triggers.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T15](T15-rules-export-import-seed.md), [S06.T02](../06-bots/T02-deck-profile-analysis.md) |
| Parallel with | [S05.T01](T01-rules-schema-migration.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/ir` placeholder + JSON Schema export — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `contract` damage pipeline stages and hook names — from [S04.T07](../04-game-engine-core/T07-damage-pipeline.md)
- `contract` prompt purposes and kinds — from [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)
- `file` `pokemon/src/pokesearch/sim/effects.py`, `attackops.py`, `cardfilters.py` — the legacy closed vocabulary and its edge semantics; read-only reference

## Outputs (proposed)
- `contract` `@pokesearch/shared/ir` (zod) mirrored by `ptcg-core::ir::model` (serde): values (`int`, `count{zone, of, filter}`, `energy_count{slot, type?}`, `damage_on{slot}`, `prizes{of}`, `hand_size{of}`, `bench_size{of}`, `coin{flips | until_tails}`, `param{name}`), selectors (`self, holder, owner, opponent, active{of}, bench{of}, in_play{of}, zone{of, zone}`), filters (`is_pokemon, is_basic, is_evolution, stage, has_rule_box, no_rule_box, tag, is_energy, is_basic_energy, is_special_energy, energy_type, is_trainer, trainer_kind, name_contains, ability_named, hp_at_most, pokemon_type, on_bench, on_active, has_damage, energy_attached_at_least, owner_tag, all_of, any_of, not`), ops (`draw, draw_until, shuffle, discard{from, filter, n, min, actor}, search{zone, filter, n, min, to: hand|bench|discard|top|attach, reveal}, look_at_top{n, take, rest}, move_cards, attach_energy{from, filter, to}, detach, move_energy, switch_active{side, actor}, heal, put_counters{targets, n, distribute}, move_counters, apply_condition, remove_conditions, damage{targets, n, weakness}, self_damage, knock_out, take_prizes, turn_effect{scope, kind, until}, marker{add|remove|has}, may{prompt}, choose_one{options, actor}, coin_then, repeat_until_tails, for_each, use_attack_as_this, end_turn, builtin{name}`), attack fields (`plus, plus_when, plus_per{counter, n, offset}, coin_plus, coin_or_nothing, nothing_unless, ignore_weakness, ignore_resistance, ignore_target_effects, lock_self, cost_alt`), `Modifier { hook, when, value, scope, no_stack_key }`, `Trigger { on, when, program }` — consumed by [S05.T04](T04-ir-compiler-and-vm.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S06.T02](../06-bots/T02-deck-profile-analysis.md)
- `doc` `docs/rules/IR.md` — one entry per element with meaning, parameters, ranges (RN-61 sanity ranges) and an example; generated from the schema descriptions
- `contract` two elements added during this elaboration because [S05.T04](T04-ir-compiler-and-vm.md) and [S05.T07](T07-rule-codes-composition-semantics.md) require them: the value form `local{name}` (reads a local written earlier in the same text) and the condition grammar `Cond` used by `plus_when`, `nothing_unless`, `Modifier.when` and `Trigger.when`
- `file` `packages/shared/schemas/ir.schema.json` and `engine/ptcg-core/schemas/ir.schema.json` — the exported JSON Schema on each side, compared byte-for-byte by a test

## Initial objective
A closed, documented vocabulary in which a code's behaviour is written as data: rich enough for the hard cards (energy provision as a query, cost reduction, granted attacks, survive-at-10-HP, copy attack, opponent-side choices), strict enough that anything outside it is rejected.

## Context

This is the alphabet of D-004. A `rule_codes.ir_body_json` is a sentence in this language; `text_codes.params_json` fills its blanks; the engine interprets the result. Everything downstream — the compiler, the composition rules, the three importers, the editor's IR preview, the LLM authoring assistant — is constrained by what this document allows, so the vocabulary is fixed before the first code is written and grows only by an explicit, versioned change.

The legacy proved that a closed vocabulary works and showed exactly where the ceiling sits. `sim/effects.py` holds 56 concrete effect classes plus eight ready-made `Require` factories (the "64 primitives"), nine composition classes (`Seq`, `ChooseOne`, `CoinThen`, `MayDo`, `IfCan`, `ForOpponent`, `EachPlayer`, `Require`, `Approx`) and five recipe dataclasses; `COUNTERS` holds 15 board counters plus three families of eight typed energy counters, 39 in all; `sim/attackops.py` holds 28 attack ops, seven `PLUS_CONDITIONS`, five special conditions and a `MAX_AMOUNT` table of sanity ranges. Its own header states the contract this subtask inherits verbatim: *"Fonte única da verdade. O classificador só pode emitir o que está aqui, e `build_recipe` recusa qualquer coisa fora do vocabulário — então a saída da IA nunca vira comportamento não previsto."* That is RN-61 in one sentence, and `build_recipe` is its reference implementation: unknown op, unknown counter, unknown condition, non-integer, out-of-range — all raise `RecipeError`.

Four things change. **Values become expressions.** The legacy's counters were 39 named Python lambdas; here `count{zone, of, filter}` and `energy_count{slot, type}` subsume all 39 and stop growing with each new "for each X" wording. **Conditions become data.** The legacy's `plus_when` was a Python callable, which is why `sim/cardfilters.py::describe` has to say *"condição escrita em código (ver sim/catalog.py)"* when it meets an anonymous lambda — and why the audit could not read what a card actually did. Here every condition is a `Cond` tree that renders back to English. **Prompts are first class.** The legacy opened a choice by calling `choose_card_actions` inside a generator; here `search`, `discard`, `choose_one` and `may` declare a `purpose` from the closed list [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) fixes, so bots see a typed question rather than a prose `tips` string. **Modifiers and triggers leave the effect language.** A tool's "+30 damage" is not an op at all; it is a `Modifier` on a named hook, which is why the vocabulary has three top-level body shapes rather than one.

The vocabulary is versioned as `IR_CONTRACT_VERSION` (semver, exported by `@pokesearch/shared`). Adding an op, a filter, a hook or a trigger event is a minor bump and requires four things in the same commit: the zod schema, the serde model, an entry in `docs/rules/IR.md`, and a scenario that exercises it. Removing or changing the meaning of an element is a major bump and requires a migration of every affected `rule_codes.ir_body_json`. What does **not** grow this vocabulary is the long tail: an effect the alphabet cannot spell becomes a `builtin{name}` ([S05.T06](T06-builtins-escape-hatch.md)), which is still a code, still counted and still tested.

## Scope

- **In scope.** `packages/shared/src/ir/*.ts` (zod schemas for `Value`, `Selector`, `Filter`, `Cond`, `Op`, `AttackFields`, `Modifier`, `Trigger`, `CodeBody`, `Program`), the exported JSON Schema, the sanity ranges, `IR_CONTRACT_VERSION`, the `describe(node) → string` renderer used by the editor and by `docs/rules/IR.md`, the generator that writes `docs/rules/IR.md` from the schema descriptions, and the legacy coverage matrix (every legacy primitive/op/counter/hook mapped to an IR element or marked "not needed" with a reason).
- **Out of scope.** Executing any of it ([S05.T04](T04-ir-compiler-and-vm.md)); the modifier index and the trigger dispatcher ([S05.T05](T05-continuous-modifiers-and-triggers.md)); the builtin registry ([S05.T06](T06-builtins-escape-hatch.md)); how several code bodies combine into one program ([S05.T07](T07-rule-codes-composition-semantics.md)); the hooks' own semantics, which belong to [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) and [S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md); anything the engine does with a prompt ([S04.T09](../04-game-engine-core/T09-prompt-protocol.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-61 | **Kept.** Output that becomes behaviour passes a closed vocabulary with sanity ranges; anything outside it is rejected, whether it came from an LLM, an importer or a human. Every op, filter, counter, hook, condition kind and trigger event is an enum member; every numeric field has an explicit `minimum`/`maximum`. | the zod schemas in `packages/shared/src/ir/`, which are `.strict()` throughout, and their exported JSON Schema with `additionalProperties: false` | `ir.spec.ts > an unknown op is rejected`; `> draw with n = 99 is rejected` (range 0–12); `> an extra property on search is rejected`; `> every numeric field in the schema declares minimum and maximum` (schema walk) |
| BR-S05.T03-01 | The vocabulary is closed in both languages at the same time: the JSON Schema exported by `@pokesearch/shared` and the one exported by `ptcg-core::ir::model` are byte-identical after canonical serialization. | `pnpm ir:schema` (TypeScript) and `cargo run -p ptcg-core --bin ir-schema` (Rust) write the two files; `pnpm check` diffs them | `pnpm check` fails when an op is added on one side only (fixture: add `teleport` to the Rust enum) |
| BR-S05.T03-02 | Every element of the vocabulary appears in `docs/rules/IR.md` with a meaning, its parameters, its range and one example drawn from a real printed card. | `scripts/ir-docs.mjs` generates the file from the schema `description` fields and fails when one is empty | `pnpm check` fails on an element with no description or no example; `ir-docs.spec.ts > generated doc matches the committed file` |
| BR-S05.T03-03 | Every legacy primitive, attack op, counter and hook has a row in the coverage matrix naming its IR element or an explicit "not needed — reason". | `docs/rules/IR.md` §"Legacy mapping", checked against fixed inventories (56 effect classes + 8 `Require` factories, 28 ops, 39 counters, 19 `HOOK_NAMES`, 25 filters) | `ir-legacy.spec.ts > every legacy name is mapped` — the inventories are committed as data files and the test fails on an unmapped name |
| BR-S05.T03-04 | A code body is exactly one of three shapes — an op list, a `Modifier`, or a `Trigger` — and a `CodeBody` mixing two is rejected. | the `CodeBody` discriminated union in zod/serde | `ir.spec.ts > a body with both ops and a modifier is rejected` |
| BR-S05.T03-05 | `param{name}` may appear only where the schema declares a `paramSlot`, and the schema states the slot's type; a `param` in a position typed as an enum is resolved against that enum at compile time, never at run time. | `paramSlot` annotations on the zod schemas; `validateParams` in [S05.T07](T07-rule-codes-composition-semantics.md) reads them | `ir.spec.ts > param is rejected where the schema forbids it` (e.g. as an op name); `> the param slots of a body are enumerable` |
| BR-S05.T03-06 | Every op that can open a question declares a `purpose` from the closed `Purpose` list of [S04.T09](../04-game-engine-core/T09-prompt-protocol.md); a purpose outside that list is rejected. | the `Purpose` enum is imported from `@pokesearch/shared/prompt`, not redefined | `ir.spec.ts > search with purpose 'whatever' is rejected`; `> the IR Purpose enum is identical to the prompt Purpose enum` |
| BR-S05.T03-07 | Every `Cond` renders to a readable English sentence and every `Filter` renders to a readable noun phrase; no node renders as "written in code". | `describe(node)` covers every variant; the function is total (exhaustive switch, no default) | `describe.spec.ts > every schema variant renders non-empty`; `> the Brave Bangle condition renders as "the holder has no Rule Box and the target is the opponent's Active Pokémon ex"` |
| BR-S05.T03-08 | `IR_CONTRACT_VERSION` is bumped in the same commit as any schema change, and a job JSON carrying a different major version is refused by the engine. | the version constant lives beside the schemas; `ptcg-cli` compares it on job intake ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)) | `ir.spec.ts > the committed schema hash matches IR_CONTRACT_VERSION`; engine test `job with a foreign IR major version is refused` |

## Data operations

This subtask writes no table. Its "operations" are the vocabulary itself: the elements a `rule_codes.ir_body_json` may contain. The table below is that vocabulary, with the parameter slots a code may expose and the RN-61 sanity range of each numeric field. Ranges are taken from `attackops.py::MAX_AMOUNT` and `build_recipe` where the legacy had one, and are marked *(new)* where it did not.

| Element | Kind | Parameters | Range / enum | Example (real card) |
|---|---|---|---|---|
| `int` | value | `v` | −400…400 | `{"int": 30}` — Brave Bangle's bonus |
| `count` | value | `zone`, `of`, `filter` | `zone ∈ deck hand discard prizes lost_zone in_play bench active attached`; result 0…60 | `{"count":{"zone":"discard","of":"owner","filter":{"ability_named":"Hide 'n' Sneak"}}}` — Dhelmise |
| `energy_count` | value | `slot`, `type?` | `type ∈` the nine energy types; result 0…12 | `{"energy_count":{"slot":"self","type":"Lightning"}}` — Mega Zeraora ex |
| `damage_on` | value | `slot` | 0…64 (counters, not HP) | `{"damage_on":{"slot":{"active":{"of":"opponent"}}}}` |
| `prizes` | value | `of` | 0…6 | `{"prizes":{"of":"actor"}}` — Iono |
| `hand_size` | value | `of` | 0…60 | `{"hand_size":{"of":"owner"}}` — Alakazam "Powerful Hand" |
| `bench_size` | value | `of` | 0…8 | `{"bench_size":{"of":"opponent"}}` |
| `coin` | value | `flips` **or** `until_tails` | `flips` 1…12; `until_tails` true | `{"coin":{"until_tails":true}}` — Pikachu `svp-101` |
| `param` | value | `name` | resolved at compile time to the slot's declared type | `{"param":"n"}` |
| `local` *(new)* | value | `name` | `$discarded $searched $attached $moved $heads $chosen`; 0…60 | `{"local":"$discarded"}` — Gwynn |
| `self` `holder` `owner` `opponent` | selector | — | — | `holder` = the Pokémon a tool or energy is attached to |
| `active` `bench` `in_play` | selector | `of` | `of ∈ self owner opponent actor hook_owner both` | `{"in_play":{"of":"opponent"}}` |
| `zone` | selector | `of`, `zone` | as `count.zone` | `{"zone":{"of":"owner","zone":"discard"}}` |
| `is_pokemon` `is_basic` `is_evolution` `is_energy` `is_basic_energy` `is_special_energy` `is_trainer` `on_bench` `on_active` `has_damage` `has_rule_box` `no_rule_box` | filter | — | — | `{"no_rule_box": true}` — Brave Bangle's holder |
| `stage` | filter | `v` | `basic stage1 stage2` | `{"stage":"stage2"}` — Gravity Mountain |
| `tag` | filter | `v` | `ex v vstar vmax radiant tera future ancient ace_spec mega` | `{"tag":"tera"}` — Area Zero Underdepths |
| `trainer_kind` | filter | `v` | `item supporter stadium tool` | `{"trainer_kind":"supporter"}` — Pokégear 3.0 |
| `energy_type` `pokemon_type` | filter | `v` | the nine energy types | `{"pokemon_type":"Darkness"}` |
| `hp_at_most` | filter | `n` | 10…340 | `{"hp_at_most":70}` — Buddy-Buddy Poffin |
| `energy_attached_at_least` | filter | `n` | 1…12 | `{"energy_attached_at_least":3}` — Jumbo Ice Cream |
| `name_contains` | filter | `v` | string ≤ 40 chars, matched on `norm()` | `{"name_contains":"hop's"}` |
| `ability_named` | filter | `v` | string ≤ 40 chars | `{"ability_named":"Hide 'n' Sneak"}` |
| `owner_tag` | filter | `v` | `mine theirs` | disambiguates "your" vs "your opponent's" inside a shared filter |
| `all_of` `any_of` `not` | filter | children | ≤ 8 children, depth ≤ 4 | `{"all_of":[{"is_basic":true},{"hp_at_most":70}]}` |
| `always` `all_of` `any_of` `not` `cmp` `exists` `matches` `has_marker` | cond | see grammar | `cmp.rel ∈ eq ne lt le gt ge` | `{"exists":{"of":{"in_play":{"of":"hook_owner"}},"filter":{"tag":"tera"}}}` |
| `draw` | op | `n`, `of` | `n` 1…12 | `{"op":"draw","n":{"param":"n"}}` |
| `draw_until` | op | `n`, `of` | 1…12 | Team Rocket's Ariana |
| `shuffle` | op | `zone` | — | the "Then, shuffle your deck." sentence |
| `discard` | op | `from`, `filter`, `n`, `min`, `actor`, `purpose`, `bind` | `n` 0…12 | Gwynn |
| `search` | op | `zone`, `filter`, `n`, `min`, `to`, `reveal`, `purpose`, `bind` | `n` 1…6 (`to: bench` 1…5) | Buddy-Buddy Poffin |
| `look_at_top` | op | `n`, `take`, `filter`, `rest`, `from_bottom` | `n` 1…8, `take` 0…5, `rest ∈ shuffle bottom discard` | Pokégear 3.0, Dusk Ball |
| `move_cards` | op | `from`, `to`, `filter`, `n`, `placement`, `shuffle_moved`, `bind` | `n` 0…60; `placement ∈ top bottom any` | Iono |
| `attach_energy` | op | `from`, `filter`, `to`, `n` | `n` 1…5 | Wondrous Patch |
| `detach` | op | `of`, `filter`, `n`, `to` | `n` 1…12 | Enhanced Hammer |
| `move_energy` | op | `from`, `to`, `filter`, `n` | `n` 1…5 | Energy Switch |
| `switch_active` | op | `side`, `actor` | `side ∈ own opponent`; `actor ∈ self opponent` | Boss's Orders (`actor: self`) vs Escape Rope (`actor: opponent`) |
| `heal` | op | `targets`, `n` | `n` 10…340 or `all` | Jumbo Ice Cream |
| `put_counters` | op | `targets`, `n`, `distribute` | `n` 1…20 | Dusknoir (13), Sinistcha (4 each) |
| `move_counters` | op | `from`, `to`, `n` | 1…12 | Munkidori |
| `apply_condition` `remove_conditions` | op | `targets`, `condition` | `asleep burned confused paralyzed poisoned` | Erika's Tangela |
| `damage` | op | `targets`, `n`, `weakness` | `n` 10…300 | Fezandipiti ex "Cruel Arrow" (100, 1 target) |
| `self_damage` | op | `n` | 10…200 | Rillaboom "Wood Hammer" (50) |
| `knock_out` | op | `targets` | — | Annihilape "Destined Fight" |
| `take_prizes` | op | `n`, `of` | 1…6 | — |
| `turn_effect` | op | `scope`, `kind`, `value`, `until` | `kind ∈ no_attack no_retreat no_items no_supporters damage_plus damage_minus prevent_damage no_ability`; `value` 0…999; `until` 1…2 turns | Aegislash "Metal Slash" |
| `marker` | op | `mode`, `of`, `name` | `mode ∈ add remove has` | once-per-turn bookkeeping |
| `may` | op | `purpose`, `body` | `purpose = may_use` | Kadabra "Psychic Draw" |
| `choose_one` | op | `options`, `actor`, `purpose` | 2…4 options | Kieran |
| `coin_then` | op | `body` | one flip | Crushing Hammer |
| `repeat_until_tails` | op | `body`, `max` | `max` 12 (safety cap) | Krookodile "Chomp Chomp Bite" |
| `for_each` | op | `over`, `body`, `max` | `over ∈ players chosen in_play`; `max` 12 | Iono, Judge |
| `use_attack_as_this` | op | `source`, `filter` | `source ∈ bench deck_top`; depth 1 | N's Zoroark ex "Night Joker" |
| `end_turn` | op | — | — | Lumiose City |
| `noop` *(new)* | op | `note` | — | a sentence that only restates an engine rule |
| `builtin` | op | `name` | registered name ([S05.T06](T06-builtins-escape-hatch.md)) | Backtrack Badge |
| `plus` / `plus_when` | attack field | `n`, `cond` | `n` 0…400 | Dhelmise "Vengeful Anchor" (+140) |
| `plus_per` | attack field | `counter`, `n`, `offset` | `n` 0…200; `offset` 0 or 1 | Mega Zeraora ex (60, offset 1) |
| `coin_plus` | attack field | `flips`, `n` | `flips` 0 (= until tails) or 1…12; `n` 0…200 | Pikachu `svp-101` (until tails, 30) |
| `coin_or_nothing` | attack field | — | — | Trumbeak "Fly" |
| `nothing_unless` | attack field | `cond` | — | Solrock "Cosmic Beam" |
| `ignore_weakness` `ignore_resistance` `ignore_target_effects` `lock_self` | attack field | — | — | Mega Starmie ex, Cynthia's Gible, N's Zekrom, Riolu |
| `cost_alt` | attack field | `cond`, `cost` | cost ≤ 5 symbols | Kyurem "Trifrost" |
| `Modifier` | body | `hook`, `when`, `value`, `scope`, `no_stack_key` | 23 hooks (below); `scope ∈ self_only holder owner_field global` | Brave Bangle, Area Zero Underdepths |
| `Trigger` | body | `on`, `when`, `program` | 12 events (below) | Meowth ex (`play_from_hand`), Lucky Helmet (`damaged_by_attack`) |

**Hooks** (from [S04.T07](../04-game-engine-core/T07-damage-pipeline.md), [S04.T08](../04-game-engine-core/T08-special-conditions-and-checkup.md), [S04.T06](../04-game-engine-core/T06-energy-provision-and-cost-payment.md) and [S05.T05](T05-continuous-modifiers-and-triggers.md), used verbatim): `damage_out`, `damage_in`, `prevent_damage`, `prevent_effects`, `counters_blocked`, `would_be_knocked_out`, `prize_value`, `energy_provision`, `attack_cost`, `extra_poison`, `checkup_counters`, `end_of_turn_discard`, `block_conditions`, `hp_max`, `retreat_cost`, `bench_size`, `weakness_override`, `block_abilities`, `block_tools`, `block_special_energy`, `grant_attacks`, `evolve_same_turn`, `no_counter_move`.

**Trigger events** (from [S05.T05](T05-continuous-modifiers-and-triggers.md), used verbatim): `play_from_hand`, `evolve`, `enter_bench`, `attach_energy`, `attack_used`, `damaged_by_attack`, `would_be_knocked_out`, `knocked_out`, `end_of_turn`, `between_turns`, `opponent_attack_done`, `stadium_played`.

## Interfaces

**Grammar.** A code body is one of three shapes:

```
CodeBody := { "ops": [Op, ...] }            // an effect fragment
          | { "modifier": Modifier }        // a continuous effect on a hook
          | { "trigger":  Trigger }         // a program run on an event
          | { "attack":   AttackFields }    // attack-level damage modifiers

Value    := { "int": n } | { "param": name } | { "local": name }
          | { "count": { "zone": Z, "of": S, "filter": F } }
          | { "energy_count": { "slot": Sel, "type"?: T } }
          | { "damage_on": { "slot": Sel } } | { "prizes": { "of": S } }
          | { "hand_size": { "of": S } }    | { "bench_size": { "of": S } }
          | { "coin": { "flips": n } } | { "coin": { "until_tails": true } }

Selector := "self" | "holder" | "owner" | "opponent"
          | { "active": { "of": S } } | { "bench": { "of": S } }
          | { "in_play": { "of": S } } | { "zone": { "of": S, "zone": Z } }

Cond     := { "always": true } | { "not": Cond }
          | { "all_of": [Cond, ...] } | { "any_of": [Cond, ...] }
          | { "cmp": { "left": Value, "rel": Rel, "right": Value } }
          | { "exists":  { "of": Selector, "filter": Filter } }   // at least one passes
          | { "matches": { "of": Selector, "filter": Filter } }   // all pass, and there is at least one
          | { "has_marker": { "of": Selector, "name": string } }

Modifier := { "hook": H, "when": Cond, "value": Value,
              "scope": "self_only" | "holder" | "owner_field" | "global",
              "no_stack_key": string | null }
Trigger  := { "on": E, "when": Cond, "program": [Op, ...] }
```

Every op is an object with `"op"` plus its fields; an op that can open a question carries `"purpose"`; an op that produces a count carries an optional `"bind": "$name"` writing a local ([S05.T04](T04-ir-compiler-and-vm.md)). Inside a `for_each`, a `bind` **accumulates**: the local ends holding the sum over the iterations, which is what "if either player put any cards on the bottom of their deck in this way" needs.

**Worked examples.** Each shows the printed text, the sentence split, the code with its params schema, the IR body, and the per-card params. These are the examples `docs/rules/IR.md` ships with, and the same seven are the fixtures of `ir.spec.ts`.

*1 — Buddy-Buddy Poffin (`sv8pt5-101`, Item), two sentences, two codes.*

```json
// sentence 0: "Search your deck for up to 2 Basic Pokémon with 70 HP or less and put them onto your Bench."
// code SEARCH_DECK_TO_BENCH  params_schema: { n: int 1..5, filter: Filter }
{ "ops": [ { "op": "search", "zone": { "zone": "deck", "of": "owner" },
             "filter": { "param": "filter" }, "n": { "param": "n" }, "min": 0,
             "to": "bench", "reveal": false, "purpose": "search_to_bench", "bind": "$searched" } ] }
// sentence 1: "Then, shuffle your deck."   code SHUFFLE_DECK  params_schema: {}
{ "ops": [ { "op": "shuffle", "zone": { "zone": "deck", "of": "owner" } } ] }

// text_codes for this text_hash:
// (0, SEARCH_DECK_TO_BENCH, { "n": 2, "filter": { "all_of": [ { "is_basic": true }, { "hp_at_most": 70 } ] } }, 0, 0)
// (1, SHUFFLE_DECK,         { },                                                                               1, 1)
```

`search` deliberately has no `shuffle` field, unlike the legacy `SearchDeck(..., shuffle=True)`: the printed text says "Then, shuffle your deck" as its own sentence, so it is its own code. Cards that search without shuffling (there are a few) simply omit the second code instead of passing a flag.

*2 — Boss's Orders (`me1-114`, Supporter), one sentence, one code.*

```json
// "Switch in 1 of your opponent's Benched Pokémon to the Active Spot."
// code SWITCH_OPPONENT_ACTIVE  params_schema: {}
{ "ops": [ { "op": "switch_active", "side": "opponent", "actor": "self",
             "purpose": "switch_in_opponent" } ] }
```

Escape Rope is the *same* op with `"actor": "opponent"`. The legacy had to hard-code the opponent's choice (`SwitchOpponentActive` picks `max(bench, key=(hp, energy))` when `chooser == "opponent"`); here the prompt's `actor` field carries it and the opponent's bot answers, which is the whole point of [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)'s `actor ≠ owner`.

*3 — Iono (`sv4pt5-80`, Supporter), two sentences, two codes, one shared local.*

```json
// sentence 0: "Each player shuffles their hand and puts it on the bottom of their deck."
// code HAND_TO_BOTTOM_EACH_PLAYER  params_schema: {}
{ "ops": [ { "op": "for_each", "over": "players", "body": [
    { "op": "move_cards", "from": { "zone": "hand", "of": "actor" },
      "to": { "zone": "deck", "of": "actor" }, "placement": "bottom",
      "shuffle_moved": true, "bind": "$moved" } ] } ] }

// sentence 1: "If either player put any cards on the bottom of their deck in this way,
//              each player draws a card for each of their remaining Prize cards."
// code DRAW_PER_PRIZES_EACH_PLAYER_IF_MOVED  params_schema: { per: int 1..3 }
{ "ops": [ { "op": "for_each", "over": "players",
             "when": { "cmp": { "left": { "local": "$moved" }, "rel": "gt", "right": { "int": 0 } } },
             "body": [ { "op": "draw", "n": { "prizes": { "of": "actor" } }, "of": "actor" } ] } ] }
// params: { "per": 1 }  — unused by the body here; declared because Lillie's Determination-style
//                          variants draw a fixed multiple, and the schema must reject anything else.
```

*4 — Brave Bangle (`me5-104`, Tool), one effect sentence, one modifier code.*

```json
// "If the Pokémon this card is attached to doesn't have a Rule Box, the attacks it uses do 30 more
//  damage to your opponent's Active Pokémon ex (before applying Weakness and Resistance)."
// code DMG_PLUS_IF_TARGET_TAG  params_schema: { n: int 0..200, tag: Tag, holder: Filter }
{ "modifier": {
    "hook": "damage_out",
    "scope": "holder",
    "when": { "all_of": [
        { "matches": { "of": "holder", "filter": { "param": "holder" } } },
        { "matches": { "of": { "active": { "of": "opponent" } }, "filter": { "tag": { "param": "tag" } } } } ] },
    "value": { "param": "n" },
    "no_stack_key": null } }

// params: { "n": 30, "tag": "ex", "holder": { "no_rule_box": true } }
```

`damage_out` is stage 4 of the [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) order, which is exactly "before applying Weakness and Resistance" — the parenthetical is not a separate sentence, it names the stage. Maximum Belt `sv8pt5-117` is the **same code** with `{ "n": 50, "tag": "ex", "holder": { "is_pokemon": true } }`: one code, two cards, different params. That is D-004 doing its job.

*5 — Area Zero Underdepths (`sv8pt5-94`, Stadium), three sentences, two codes.*

```json
// sentence 0: "Each player who has any Tera Pokémon in play can have up to 8 Pokémon on their Bench."
// code BENCH_SIZE_IF_IN_PLAY  params_schema: { size: int 5..8, requires: Filter }
{ "modifier": {
    "hook": "bench_size",
    "scope": "global",
    "when": { "exists": { "of": { "in_play": { "of": "hook_owner" } },
                          "filter": { "param": "requires" } } },
    "value": { "param": "size" },
    "no_stack_key": "BENCH_SIZE" } }
// params: { "size": 8, "requires": { "tag": "tera" } }

// sentences 1-2: "If a player no longer has any Tera Pokémon in play, that player discards Pokémon
//   from their Bench until they have 5. When this card leaves play, both players discard Pokémon
//   from their Bench until they have 5, and the player who played this card discards first."
// code RULE_RESTATEMENT_BENCH_SHRINK  params_schema: {}  status: exact
{ "ops": [ { "op": "noop", "note": "bench shrink is automatic whenever bench_size drops (S05.T05, RN-11/RN-18)" } ] }
```

`scope: "global"` means the modifier applies to both players, and `hook_owner` inside `when` is the player whose bench size is being asked for — so one modifier answers differently for each side. The second code is the `noop` case: two printed sentences that restate an engine rule. They still get a code, with `status = 'exact'` and a note naming the subtask that implements the rule, because a sentence with no code would make the card inexact forever.

*6 — Mega Zeraora ex `me5-27`, attack "Thunderous Fist", printed damage `60×`.*

```json
// "This attack does 60 damage for each Lightning Energy attached to this Pokémon."
// code DMG_PER_COUNTER  params_schema: { counter: Value, n: int 0..200, offset: int 0..1 }
{ "attack": { "plus_per": { "counter": { "param": "counter" },
                            "n": { "param": "n" },
                            "offset": { "param": "offset" } } } }

// params: { "counter": { "energy_count": { "slot": "self", "type": "Lightning" } }, "n": 60, "offset": 1 }
```

`offset: 1` is the legacy's `plus_per_offset`, and its reason is written in `catalog_cards.py` L607–613: printed damage `60×` already counts one unit, so `20× para cada Pokémon no Banco` with an empty bench must do **0**, not 20. With `offset: 1` and a counter of 0 the attack's base damage is forced to 0 by [S04.T07](../04-game-engine-core/T07-damage-pipeline.md). The typed counter is also a lint finding the legacy had to fix by hand: `sim/lint.py` flags `tipo-de-energia` when the text names an energy type and the recipe counts all energy, which is how Mega Meganium ex, Mega Gardevoir ex, Heatran and Armarouge were corrected.

*7 — Torkoal `sv1-35`, attack "Concentrated Fire", printed damage `80×` — a counter **and** a coin.*

```json
// sentence 0: "Flip a coin for each Fire Energy attached to this Pokémon."
// code COIN_FLIPS_PER_COUNTER  params_schema: { counter: Value }
{ "ops": [ { "op": "for_each", "over": { "times": { "param": "counter" } }, "max": 12,
             "body": [ { "op": "coin_then", "body": [ { "op": "marker", "mode": "add",
                                                        "of": "self", "name": "$heads" } ] } ],
             "bind": "$heads" } ] }
// params: { "counter": { "energy_count": { "slot": "self", "type": "Fire" } } }

// sentence 1: "This attack does 80 damage for each heads."
// code DMG_PER_HEADS  params_schema: { n: int 0..200, offset: int 0..1 }
{ "attack": { "coin_plus": { "flips": { "local": "$heads" }, "n": { "param": "n" } } } }
// params: { "n": 80, "offset": 1 }
```

This is the case that shows why composition matters: the coin sentence is an *op* (it consumes game RNG and writes a local) and the damage sentence is an *attack field* (it is read before damage is computed). [S05.T07](T07-rule-codes-composition-semantics.md) fixes the order — attack-field codes are gathered first, op codes run in ordinal order — and the engine's expected-damage estimate for bots uses `coin_plus`'s mean without flipping, exactly as `AttackRecipe.expected_bonus` did.

**TypeScript surface.**

```ts
export const IR_CONTRACT_VERSION = "1.0.0";
export const Value: z.ZodType<Value>;      // and Selector, Filter, Cond, Op, AttackFields, Modifier, Trigger
export const CodeBody: z.ZodType<CodeBody>;
export const Program: z.ZodType<Program>;  // the composed result (S05.T07)
export function describe(node: Value | Selector | Filter | Cond | Op): string;   // pt-BR and en, by locale
export function paramSlots(body: CodeBody): { name: string; type: ParamType; path: string }[];
export function irSchemaJson(): object;    // what `pnpm ir:schema` writes
```

`ptcg-core::ir::model` mirrors these as serde enums with `#[serde(tag = "op")]` on `Op` and untagged unions elsewhere, and `ir-schema` writes the same JSON Schema from the Rust side.

## Implementation steps

1. Write `Value`, `Selector` and `Filter` in zod with descriptions and ranges; write the matching serde enums; wire `pnpm ir:schema` and `cargo run --bin ir-schema` and make the diff pass on this subset.
2. Add `Cond` and `describe()` for everything written so far; spec the Brave Bangle rendering.
3. Add `Op` (the full list), with `purpose` imported from `@pokesearch/shared/prompt` and `bind` where a count is produced; assert the `Purpose` enums are identical.
4. Add `AttackFields`, `Modifier` and `Trigger`, then the `CodeBody` union; spec the "no mixed body" rule.
5. Add `paramSlots()` and the `paramSlot` annotations; spec that a `param` in a forbidden position is rejected.
6. Commit the four legacy inventories as data files (`docs/rules/legacy/{effects,ops,counters,hooks,filters}.json`) extracted mechanically from the legacy sources, and write `ir-legacy.spec.ts`.
7. Fill the coverage matrix until every legacy name maps or carries a reason; the ones expected to carry a reason are the Prism/Legacy/Neo Upper "provides every type, one at a time" family and the variable-discard-with-proportional-damage family, which go to [S05.T06](T06-builtins-escape-hatch.md).
8. Write `scripts/ir-docs.mjs`, generate `docs/rules/IR.md`, and add the seven worked examples as its example fixtures.
9. Add `IR_CONTRACT_VERSION`, the schema-hash test and the engine's major-version check on job intake.
10. Review the vocabulary against the top 300 effect texts by meta copies (≈ 97.3 % of effect copies in the legacy measurement) and record, in `docs/rules/IR.md`, which of them the alphabet cannot spell — that list is the input to [S05.T06](T06-builtins-escape-hatch.md).

## Edge cases and error handling

- **An op the vocabulary does not have.** Rejected by zod and by serde, with the path of the offending node. The authoring answer is never to add a free-form field: it is either a new element (schema change, doc entry, scenario, version bump) or a `builtin` ([S05.T06](T06-builtins-escape-hatch.md)).
- **A number outside its sanity range** — `draw` with `n = 99`, `put_counters` with `n = 40`. Rejected with the range in the message, exactly as `build_recipe` did (`f"{field} fora da faixa [{lo}, {hi}]: {value}"`). The ranges exist because a well-formed but wrong LLM answer is the failure mode RN-61 explicitly does *not* claim to catch (`ESPECIFICACAO.md` RN-61: the validator stops malformed output, not wrong-but-well-formed output; the legacy sample was 25 of 27 attacks correct).
- **A `param` whose declared slot is an enum and whose value is not a member.** Caught at compile time by `validateParams` ([S05.T07](T07-rule-codes-composition-semantics.md)) reading `paramSlots()`, not at run time by the VM. The engine never sees an unresolved param.
- **A `local` read before anything wrote it.** The value is 0, not an error: "draw 3 for each card you discarded in this way" with nothing discarded draws nothing. The compiler warns when a text's code list reads a local no earlier code binds, because that is almost always a missing code rather than a deliberate zero.
- **`repeat_until_tails` on a stuck RNG.** `max: 12` caps it. The cap is a safety property of the vocabulary, not a rule of the game; it is documented in `IR.md` and exercised by a scenario with a forced-heads RNG.
- **A `Cond` nested past depth 4 or a filter with more than 8 children.** Rejected. Deep conditions are a sign that a sentence needs two codes; the limit makes that visible at authoring time instead of at debugging time.
- **`use_attack_as_this` copying an attack that itself copies.** Depth 1 only; the inner copy degrades to its printed damage with no effect, and the compiler marks the program `approx` with a note. The legacy did the same (`catalog_cards.py::_copied_attack`: *"copiar um ataque que copia outro não se resolve aqui"*).
- **A hook name that exists in `IR.md` but not in the engine's hook enum.** The two JSON Schemas diverge and `pnpm check` fails (BR-S05.T03-01). This is the failure the legacy could not have: its hooks were Python method names discovered by `getattr`.
- **A sentence that only restates a rule** ("If a player no longer has any Tera Pokémon in play, that player discards…"). `noop` with a mandatory `note`. Without it, every stadium with a shrink clause would be permanently inexact; with it, the note says which subtask owns the behaviour and the editor shows it.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/shared test ir.spec.ts` green, including `> an unknown op is rejected`, `> draw with n = 99 is rejected`, `> an extra property on search is rejected`, `> a body with both ops and a modifier is rejected` (RN-61, BR-S05.T03-04).
- [ ] `ir.spec.ts > every numeric field in the schema declares minimum and maximum` — a walk over the exported JSON Schema finds no unbounded integer (RN-61).
- [ ] `pnpm check` runs `pnpm ir:schema` and `cargo run -p ptcg-core --bin ir-schema` and the two files are byte-identical; adding `teleport` to the Rust `Op` enum makes it fail (BR-S05.T03-01).
- [ ] `ir-legacy.spec.ts > every legacy name is mapped` — all 56 effect classes, 8 `Require` factories, 28 attack ops, 39 counters, 19 `HOOK_NAMES` entries and 29 filter predicates resolve to an IR element or an explicit reason (BR-S05.T03-03).
- [ ] `ir.spec.ts > the seven worked examples validate` — Buddy-Buddy Poffin, Boss's Orders, Iono, Brave Bangle, Area Zero Underdepths, Mega Zeraora ex and Torkoal parse, and their params validate against their `params_schema_json` (BR-S05.T03-05).
- [ ] `describe.spec.ts > every schema variant renders non-empty` and `> the Brave Bangle condition renders as "the holder has no Rule Box and the target is the opponent's Active Pokémon ex"` (BR-S05.T03-07).
- [ ] `ir.spec.ts > the IR Purpose enum is identical to the prompt Purpose enum` and `> search with purpose 'whatever' is rejected` (BR-S05.T03-06).
- [ ] `pnpm check` regenerates `docs/rules/IR.md` and finds no diff; removing one element's `description` makes it fail (BR-S05.T03-02).
- [ ] `ir.spec.ts > the committed schema hash matches IR_CONTRACT_VERSION` — changing a schema without bumping the version fails (BR-S05.T03-08).
- [ ] `docs/rules/IR.md` §"Unspellable" lists, with meta copies attached, every one of the top 300 effect texts the vocabulary cannot express — the hand-off to [S05.T06](T06-builtins-escape-hatch.md).

## Risks and open questions

- **Risk — the vocabulary is under-powered and the builtin escape hatch swallows the long tail.** D-004 budgets builtins at under 2 % of meta copies. Mitigation: step 10 measures the gap against the top 300 texts *before* any code is authored, so the decision to grow the alphabet or to accept a builtin is made with a number. Re-measure at the end of [S05.T08](T08-spreadsheet-import.md)–[S05.T10](T10-import-catalog-recipes.md).
- **Risk — the vocabulary is over-powered and codes become tiny programs**, at which point the spreadsheet stops being an authoring surface and D-004's premise fails. Mitigation: the depth and child-count limits, the "one code per sentence" contract in [S05.T07](T07-rule-codes-composition-semantics.md), and the rule that a code whose body is longer than roughly eight ops is reviewed as a candidate for a builtin.
- **Risk — the two schemas drift** because one side is easier to edit. Mitigation: the byte diff in `pnpm check`, which fails the build rather than warning.
- **Question (D-004 semantics) — may a `Filter` be a parameter?** It is, here: `SEARCH_DECK_TO_BENCH` takes `{ n, filter }`, so Buddy-Buddy Poffin, Nest Ball and Precious Trolley are one code with three parameter sets. The alternative — a distinct code per filter — would produce hundreds of near-identical codes and match the spreadsheet's sentence templates more literally. This is the single largest lever on how many codes exist, and the user owns it. Recommendation: filters are params, and the spreadsheet's `params` column carries them as JSON.
- **Question (D-004 semantics) — should a sentence that restates an engine rule get a `noop` code, or no code at all?** A `noop` code is proposed (`RULE_RESTATEMENT_*`, `status = 'exact'`, mandatory note). No code at all would leave the card inexact; a hidden exemption list would hide the decision. The user confirms.
- **Question — should `docs/rules/IR.md` be bilingual?** `describe()` is written to render in both, because the UI is pt-BR (D-006) and the doc is English. Recommendation: the doc is English only; the UI calls `describe(node, "pt-BR")`.

## References

- `pokemon/src/pokesearch/sim/attackops.py` — verified: the module docstring stating that the classifier may only emit what is in the file; `PLUS_CONDITIONS` (7 named predicates), `CONDITIONS` (5), `OP_BUILDERS` (28 ops), `NEEDS_AMOUNT`, `NEEDS_CONDITION`, `MAX_AMOUNT` (15 entries: `draw` 12, `search_deck_to_hand` 6, `search_basic_to_bench` 5, `self_damage` 200, `damage_to_opponents` 300, `place_counters_opponent_active` 20, …), `EFFECT_ITEM_SCHEMA`/`RESULT_SCHEMA` and `build_recipe`'s `RecipeError` paths. Consult for the sanity ranges and for the exact shape of RN-61's rejection behaviour.
- `pokemon/src/pokesearch/sim/effects.py` — verified: 72 classes, of which 56 are concrete effects, 9 are composition classes and 5 are recipe dataclasses; 8 module-level `Require` factories; `COUNTERS` = 15 board counters + `energy_self_<type>`, `energy_mine_<type>`, `bench_self_with_energy_<type>` × 8 types = 39. Docstrings carry the edge semantics this vocabulary must keep: `MayDo` ("comprar nem sempre é bom: o deck é finito"), `IfCan` ("a diferença entre 'descarte 2 energias e paralise' e 'você pode descartar 2 energias; se fizer, paralise'"), `_dedupe` (choices deduplicated by card class), `DamageToOpponents` ("é DANO, não marcador"), `ShuffleSelfIntoDeck` (refuses when it would be the last Pokémon).
- `pokemon/src/pokesearch/sim/effects.py` L1528–1579 (`AttackRecipe`) — verified: `plus`, `plus_when`, `plus_per`, `plus_per_offset`, `coin_plus` (`flips == 0` meaning "until tails"), `coin_or_nothing`, `nothing_unless`, `lock_self`, `ignore_weakness_resistance`, `ignore_resistance`, `ignore_target_effects`, `copy_attack`, `counters_per`, `effects`, and `expected_bonus` (mean bonus without consuming the RNG). Consult for the attack-field list and for the bot-facing estimate.
- `pokemon/src/pokesearch/sim/cardfilters.py` — verified: 29 filter predicates/factories plus `all_of`/`any_of`/`not_` and the `describe()` fallback *"condição escrita em código (ver sim/catalog.py)"*. Consult for the filter list and for why `describe` must be total here.
- `pokemon/src/pokesearch/sim/status.py` L186–208 — verified: `HOOK_NAMES` with 19 entries and the `ACTIVE_HOOKS` note (*"sem isso, 1,6 milhão de consultas por 30 partidas terminavam num método que só devolvia zero"*). Consult for the legacy hook list the 23 IR hooks map onto.
- `pokemon/src/pokesearch/sim/catalog_cards.py` L607–613 — verified: the `plus_per_offset` rationale for printed `N×` damage. `pokemon/src/pokesearch/sim/lint.py` L91–100 — verified: the `tipo-de-energia` rule requiring a typed counter or filter when the text names an energy type.
- [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) (stage order and hook names), [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) (`Purpose`, `Prompt.kind`, `actor ≠ owner`), [S01.T05](../01-foundation/T05-shared-contracts-package.md) (zod + exported JSON Schema convention).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
