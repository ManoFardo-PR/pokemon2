# S05.T07 — Rule codes: composition semantics

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 7 / 16 |
| Depends on | [S05.T01](T01-rules-schema-migration.md), [S05.T03](T03-effect-ir-vocabulary.md), [S05.T04](T04-ir-compiler-and-vm.md), [S05.T06](T06-builtins-escape-hatch.md) |
| Unblocks | [S05.T08](T08-spreadsheet-import.md), [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T13](T13-rules-editor-ui.md), [S05.T15](T15-rules-export-import-seed.md), [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md) |
| Parallel with | [S05.T11](T11-legacy-tests-to-scenarios.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `rule_codes`, `text_codes` — from [S05.T01](T01-rules-schema-migration.md)
- `contract` IR (`param{name}`, attack fields) — from [S05.T03](T03-effect-ir-vocabulary.md)
- `module` compiler (params binding) and VM (shared locals) — from [S05.T04](T04-ir-compiler-and-vm.md)
- `module` builtin registry — from [S05.T06](T06-builtins-escape-hatch.md)
- `decision` D-004 — one code per effect sentence, parameters per card, everything in the database — from `project/02-decision-log.md`

## Outputs (proposed)
- `doc` `docs/rules/CODES.md` — the authoring contract: a text = ordered `(code, params)` items; each code body is an IR fragment; fragments of one text are concatenated into one program with shared locals; a code may span several sentences (`sentence_from..sentence_to`) or be a *wrapper* (`coin_then`, `may`, `if`) that applies to the next item; `params_json` must validate against `params_schema_json`; attack-level fields (`plus`, `nothing_unless`, …) come from codes flagged `category = attack_modifier`; once-per-turn scope declared per ability code (RN-16) — consumed by [S05.T08](T08-spreadsheet-import.md), [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T13](T13-rules-editor-ui.md), [S05.T15](T15-rules-export-import-seed.md), [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md)
- `module` `packages/db/src/rules/compose.ts` — `composeProgram(textHash) → ProgramJson` and `rulesSnapshot(db) → sha256` over all active code bodies + text_codes; `validateParams(code, params)`; `apps/api` route `GET /api/rules/programs/:textHash` — consumed by the same subtasks
- `contract` code naming: `UPPER_SNAKE` verbs + object, e.g. `DRAW_N`, `SEARCH_DECK_FILTER_TO_HAND`, `DMG_PLUS_IF_TARGET_TAG`, `COND_APPLY_OPPONENT_ACTIVE`, `WRAP_COIN_THEN`

## Initial objective
The user's authoring model — one code per sentence, parameters per card — is precisely defined so that a text's meaning is the deterministic composition of its codes, and the engine receives one compiled program per text without knowing about sentences.

## Context

This is the design centre of D-004 and the file the rest of the stage is written against. Everything before it builds parts (`text_hash`), an alphabet (IR), an interpreter (VM) and an escape hatch (builtins). Everything after it — the three importers, the editor, the export, the LLM assistant — writes `(code, params)` pairs and trusts this contract to turn them into one program.

The user's model in their own words is "a code per effect sentence, parameters per card, everything in the database". Stated that way it is almost precise. Three things have to be pinned down before a single row is imported, because getting them wrong after 1,600 sentences have been classified is expensive.

**A code is not exactly a sentence.** The relation is many-to-many in both directions, and the schema already admits it: `text_codes` carries `sentence_from` and `sentence_to`. One sentence can need two codes — Gwynn's printed text is a single sentence, *"Discard up to 2 Pokémon that don't have a Rule Box from your hand, and draw 3 cards for each card you discarded in this way."*, and it is a discard followed by a draw, two separate behaviours joined by a comma. One code can cover two sentences — Buddy-Buddy Poffin's *"…and put them onto your Bench. Then, shuffle your deck."* could be one code, although here it is two, because a separate `SHUFFLE_DECK` is reusable across dozens of cards. The contract is therefore: **a text's meaning is the ordered list of its `(code, params)` items**, and the sentence range is provenance — it tells the editor which words a code came from, and it tells the spreadsheet importer where to attach a classification. It is not what decides the program.

**Codes of one text are not all the same kind of thing.** A single printed text can carry an effect, a continuous modifier, a trigger and a set of attack-level damage fields at once. Mega Zeraora ex's attack text is entirely an attack field; Torkoal's is one op and one attack field; Brave Bangle's is one modifier; Fezandipiti ex's ability text is a trigger precondition and an effect. Composition therefore does not concatenate — it **partitions** by `rule_codes.category` into four slots, and only the `effect` slot is a sequence.

**Order inside an attack is not the ordinal order.** `catalog_cards.py::_reduce_attack` shows why: the legacy computed the bonus, applied the ignore flags, resolved the damage, and only then ran `recipe.effects`. A card whose text says "Discard 2 Fire Energy from this Pokémon. This attack does 50 more damage for each Energy discarded in this way" needs the discard to happen *before* damage, and a card whose text says "This attack also does 30 damage to one of your opponent's Benched Pokémon" needs its op *after*. So an `effect` code on an attack part declares a `phase`, defaulting to `after_damage`. This single field retires the eight legacy attacks that were declared approximate for exactly this reason (`catalog.py` L386–402: *"Sem primitiva para descarte variável com dano proporcional, ficam declaradas aproximadas … em vez de erradas"*).

Two further pieces of the contract come from the legacy directly. **Wrappers** replace the legacy's `CoinThen`, `MayDo`, `IfCan` and `ChooseOne` combinators: a code with `category = 'wrapper'` and `wraps = 'next'` takes the following item as its body, so "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed." is `WRAP_COIN_THEN{}` followed by `COND_APPLY_OPPONENT_ACTIVE{condition: "paralyzed"}` — two rows, and the coin is visible to the lint that caught Erika's Tangela, Jynx, Misty's Staryu and Team Rocket's Ekans. **`once_scope`** is declared per ability code (RN-16), where the legacy derived it from the text at class-build time.

## Scope

- **In scope.** `docs/rules/CODES.md` (the authoring contract, the naming rules, the four slots, the wrapper semantics, the phase rule, the `once_scope` rule, the composition errors); `packages/db/src/rules/compose.ts` (`composeProgram`, `composeCode`, `validateParams`, `rulesSnapshot`, `explain`); the `ProgramJson` contract in `@pokesearch/shared`; `GET /api/rules/programs/:textHash` and `GET /api/rules/snapshot`; the composition-error taxonomy; the code-naming lint; the seed vocabulary of ~40 starter codes that the three importers map onto.
- **Out of scope.** The IR itself ([S05.T03](T03-effect-ir-vocabulary.md)); compiling and running a program ([S05.T04](T04-ir-compiler-and-vm.md)); modifiers and triggers at run time ([S05.T05](T05-continuous-modifiers-and-triggers.md)); builtins ([S05.T06](T06-builtins-escape-hatch.md)); writing `text_codes` rows, which is what the importers ([S05.T08](T08-spreadsheet-import.md)–[S05.T10](T10-import-catalog-recipes.md)) and the editor ([S05.T13](T13-rules-editor-ui.md)) do; sentence splitting ([S05.T08](T08-spreadsheet-import.md)); evidence and coverage ([S05.T12](T12-evidence-and-coverage-metrics.md)); the seed files ([S05.T15](T15-rules-export-import-seed.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-16 | **Kept, declared here.** "Once during your turn" is per Pokémon instance unless the printed text says per name; the scope is a property of the code (`rule_codes.once_scope ∈ none, per_instance, per_name, per_game`), set when the code is authored, and [S05.T05](T05-continuous-modifiers-and-triggers.md) enforces it with the matching marker key. A composed program carries the strongest scope among its ability codes. | `composeProgram` writes `ProgramJson.once`; the code-naming lint requires `once_scope <> 'none'` on any code whose `pattern` starts with "Once during your turn" | `compose.spec.ts > a per_instance ability code yields once = per_instance`; `> a text mixing per_instance and per_name yields per_name`; `codes-lint.spec.ts > "Once during your turn" with once_scope none is rejected` |
| BR-S05.T07-01 | A text's meaning is the ordered list of its `(code, params)` items: `composeProgram(textHash)` depends on nothing else — not on the card, not on the card's name, not on the sentences. Two texts with the same items compose to the same program. | `composeProgram` reads `text_codes` and `rule_codes` only; its signature takes a `textHash` and a `Db` | `compose.spec.ts > composeProgram is a pure function of its items` (same items under two hashes → identical programs modulo `text_hash`) |
| BR-S05.T07-02 | `text_codes.ordinal` is dense from 0; a gap or a duplicate is a composition error, not a silent skip. | the density assertion at the top of `composeProgram`; the API rejects a `PUT` that would create one | `compose.spec.ts > a gap in ordinals fails with OrdinalGap`; `> the API rejects a code list with a repeated ordinal` |
| BR-S05.T07-03 | `params_json` validates against the code's `params_schema_json`, and `validateParams` names the failing field. A code whose params do not validate is not composed and not executed. | `validateParams(code, params)` is called by `composeProgram`, by `PUT /api/rules/texts/:hash/codes` and by every importer | `compose.spec.ts > params failing the schema are rejected with the field name`; `api.spec.ts > PUT with n = "two" returns 422 with field "n"` |
| BR-S05.T07-04 | Codes partition into four slots by `category`: `effect` items form the op sequence, `attack_modifier` items merge into one `AttackFields` record, `modifier` items become `Program.modifiers[]`, `trigger` items become `Program.triggers[]`. Two `attack_modifier` codes setting the same field is a composition error. | the partition pass in `composeProgram`; `mergeAttackFields` returns `DuplicateAttackField` | `compose.spec.ts > two codes both setting plus fail with DuplicateAttackField`; `> a text with an effect, a modifier and a trigger composes into three populated slots` |
| BR-S05.T07-05 | A wrapper code (`category = 'wrapper'`) with `wraps = 'next'` takes the next item as its body; with `wraps = 'rest'` it takes every remaining `effect` item. A wrapper with no following item is a composition error. Wrappers nest, to depth 3. | the wrapper pass, run before the partition, over the `effect` and `wrapper` items in ordinal order | `compose.spec.ts > WRAP_COIN_THEN wraps the next item`; `> a trailing wrapper fails with DanglingWrapper`; `> a wrapper around a wrapper around an op composes` |
| BR-S05.T07-06 | An `effect` code on an `attack` part declares `phase ∈ before_damage, after_damage` (default `after_damage`); ops are emitted in two groups, ordinal order preserved inside each. On a non-attack part `phase` is ignored. | `rule_codes.phase` (added to the schema by the same migration) and the two-group emission in `composeProgram` | `compose.spec.ts > a before_damage discard precedes the damage marker in the op stream`; `> phase on a trainer text is ignored` |
| BR-S05.T07-07 | A composed program's status is the worst of its codes' statuses on the order `exact = builtin < approx < draft < unimplemented`; only `exact` and `builtin` count toward exact coverage, and the program carries `approx = true` when any code is `approx`. | `worstStatus()` in `composeProgram`; the same order is used by `card_status` ([S05.T01](T01-rules-schema-migration.md)) | `compose.spec.ts > one draft code makes the program draft`; `> one approx code sets approx without changing an otherwise exact program's ability to run` |
| BR-S05.T07-08 | `rulesSnapshot(db)` is a SHA-256 over the canonical serialization of every non-`unimplemented` `rule_codes` row and every `text_codes` row, sorted; it changes when and only when something that can change behaviour changes. Editing `notes`, `pattern` or `approx_note` does not change it. | `rulesSnapshot` serializes an explicit field list (`code, category, wraps, phase, once_scope, status, ir_body_json` and `text_hash, ordinal, code, params_json`) with canonical JSON and sorted keys | `compose.spec.ts > editing notes leaves the snapshot unchanged`; `> editing an ir_body changes it`; `> the snapshot is stable across two processes and two orderings of the same rows` |
| BR-S05.T07-09 | A code name is `UPPER_SNAKE`, starts with a verb or a declared prefix (`DMG_`, `COND_`, `WRAP_`, `MOD_`, `TRG_`, `RULE_`), is unique, and is never renamed: a rename is a new code plus a repoint of every `text_codes` row, in one transaction. | `codes-lint.mjs` in `pnpm check`; the `CHECK (code = upper(code))` constraint; the API has no rename route | `codes-lint.spec.ts > a lowercase or spaced code is rejected`; `> a WRAP_ prefix on a non-wrapper category is rejected`; `api.spec.ts > there is no rename endpoint` |
| BR-S05.T07-10 | `composeProgram` never reads the game and never runs anything: it produces JSON. Compilation and execution belong to the engine; the API's IR preview shows the composed JSON and the disassembly, not a simulated result. | `compose.ts` has no engine import; the engine receives `ProgramJson` through the job ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)) | `compose.spec.ts > compose.ts imports nothing from the engine` (import graph assertion); Architecture principle 1 |

## Data operations

**CRUD.** Composition is a read path; the write paths it validates belong to the editor and the importers, and are listed here because this subtask owns the rule they obey.

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `text_codes` | R | api, worker, script | every `composeProgram` and every `rulesSnapshot` | ordered by `ordinal`; dense from 0 or `OrdinalGap` | BR-S05.T07-02 |
| `rule_codes` | R | api, worker, script | every composition | `params_schema_json` read for validation; `ir_body_json` read for the body | BR-S05.T07-03 |
| `text_codes` | C/U/D | api (`PUT /api/rules/texts/:hash/codes`) | the editor saves a code list | delete-then-insert of the whole list for that `text_hash`, in one transaction; every item validated before the delete | [S05.T13](T13-rules-editor-ui.md) |
| `text_codes` | C | script (the three importers) | import | insert only into free `(text_hash, ordinal)` slots; a conflict is reported, never overwritten | [S05.T08](T08-spreadsheet-import.md)–[S05.T10](T10-import-catalog-recipes.md) |
| `rule_codes` | C/U | api (`PUT /api/rules/codes/:code`) | authoring a code | upsert on `code`; `ir_body_json` revalidated against the IR schema; `updated_at` rewritten; no rename path | BR-S05.T07-09 |
| `rule_codes` | C | script (`rules:import`) | seeding a fresh database | upsert; an import never lowers a hand-authored `exact` code to `draft` | [S05.T15](T15-rules-export-import-seed.md) |
| `rules_current.rules_snapshot` | U | worker | after any write to `rule_codes` or `text_codes` | recomputed by `rulesSnapshot(db)`; single row | [S05.T12](T12-evidence-and-coverage-metrics.md) |
| `rule_evidence` | R | api | the editor shows staleness next to each code | read-only here; `rules_snapshot` mismatch means stale | RN-64 |
| compiled programs | — | engine | the engine receives `ProgramJson` in the job, never a database row | Architecture principle 1 | [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) |

**Endpoints.**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/rules/programs/:textHash` | `?explain=1` adds the per-item breakdown and the rendered English | `{ program: ProgramJson, items: [{ ordinal, code, params, sentenceFrom, sentenceTo, status, english }], status, approx, once, warnings: [] }` | 404 unknown text; 409 `CompositionError` with `{ kind, ordinal, detail }` |
| GET | `/api/rules/snapshot` | — | `{ rulesSnapshot, codes, textCodes, computedAt }` | — |
| GET | `/api/rules/codes/:code` | — | the code row plus its usages (`textHash`, printings, meta copies) | 404 |
| PUT | `/api/rules/texts/:hash/codes` | `{ items: [{ code, params, sentenceFrom, sentenceTo }] }` | the recomposed program | 422 `ParamsInvalid { field }`; 409 `CompositionError`; 404 unknown code |

## Interfaces

**`packages/db/src/rules/compose.ts`**

```ts
export type CodeCategory = "effect" | "attack_modifier" | "modifier" | "trigger" | "wrapper";
export type CodeStatus   = "draft" | "exact" | "approx" | "builtin" | "unimplemented";
export type OnceScope    = "none" | "per_instance" | "per_name" | "per_game";
export type Phase        = "before_damage" | "after_damage";

export interface ProgramJson {
  version: string;                 // IR_CONTRACT_VERSION
  textHash: string;
  ops: Op[];                       // effect slot, wrappers resolved, phases already ordered
  phaseSplit: number | null;       // index where after_damage ops begin; null on a non-attack part
  attack: AttackFields | null;     // attack_modifier slot
  modifiers: Modifier[];           // modifier slot
  triggers: Trigger[];             // trigger slot
  locals: string[];                // locals this program binds, in bind order
  status: CodeStatus;              // worst of the items
  approx: boolean;
  once: OnceScope;
}

export type CompositionError =
  | { kind: "OrdinalGap";           ordinal: number }
  | { kind: "UnknownCode";          ordinal: number; code: string }
  | { kind: "ParamsInvalid";        ordinal: number; code: string; field: string; detail: string }
  | { kind: "DanglingWrapper";      ordinal: number; code: string }
  | { kind: "WrapperDepth";         ordinal: number; limit: number }
  | { kind: "DuplicateAttackField"; ordinal: number; field: string; firstOrdinal: number }
  | { kind: "AttackFieldOnNonAttack"; ordinal: number; code: string; partKind: string }
  | { kind: "UnboundLocal";         ordinal: number; local: string }   // warning, not an error
  | { kind: "UnknownBuiltin";       ordinal: number; name: string };

export function composeProgram(db: Db, textHash: string): Result<ProgramJson, CompositionError>;
export function composeCode(db: Db, code: string, params: unknown): Result<ProgramJson, CompositionError>; // tests, previews
export function validateParams(code: RuleCodeRow, params: unknown): Result<ParamMap, { field: string; detail: string }>;
export function rulesSnapshot(db: Db): string;                 // 64-char lowercase hex
export function explain(db: Db, textHash: string, locale?: "en" | "pt-BR"): ExplainedText;
```

**The composition algorithm.** Nine steps, in this order.

1. **Load.** `SELECT * FROM text_codes WHERE text_hash = ? ORDER BY ordinal`, joined to `rule_codes`. An unknown code is `UnknownCode`.
2. **Check density.** Ordinals must be `0..n-1`. A gap or duplicate is `OrdinalGap`.
3. **Validate params.** `validateParams` per item, against that code's `params_schema_json`. The first failure is `ParamsInvalid` with the field name, and composition stops — a half-composed program is worse than none.
4. **Bind.** Substitute every `param{name}` in the item's `ir_body_json` with the validated value. After this step no `param` node survives (the rule [S05.T04](T04-ir-compiler-and-vm.md) relies on).
5. **Resolve wrappers.** Walk the items in ordinal order. A `wrapper` with `wraps = "next"` consumes the following item — recursively, so a wrapper may wrap a wrapper, to depth 3 — and becomes one composite item whose body is the consumed item's ops. `wraps = "rest"` consumes every remaining `effect`/`wrapper` item. A wrapper with nothing after it is `DanglingWrapper`.
6. **Partition.** Each surviving item goes to its slot by `category`. An `attack_modifier` item on a part whose `part_kind` is not `attack` is `AttackFieldOnNonAttack`.
7. **Merge attack fields.** Field by field, in ordinal order. Two items setting the same field is `DuplicateAttackField` naming both ordinals. `plus` and `plus_per` are different fields and may coexist, as `AttackRecipe` allowed.
8. **Order the ops.** On an `attack` part, emit the `before_damage` items first and the `after_damage` items second, preserving ordinal order inside each group, and record `phaseSplit`. On any other part, ordinal order, `phaseSplit = null`.
9. **Summarize.** `status = worst(items)`; `approx = any(status === "approx")`; `once = strongest(once_scope of the ability-part items)`; `locals` = the binds in emission order, with a warning (not an error) for any local read before it is bound.

**Worked example, end to end — Torkoal `sv1-35`, attack "Concentrated Fire", printed damage `80×`.**

*The printed text, from `attacks.text`:*

> Flip a coin for each Fire Energy attached to this Pokémon. This attack does 80 damage for each heads.

*Step A — the text and its part.* `card_parts` has `('sv1-35', 'attack', 0, <hash>)`; `effect_texts` holds the wording. `text_sentences` ([S05.T08](T08-spreadsheet-import.md)) splits it into two rows, ordinals 0 and 1.

*Step B — the items the author writes.* Two rows in `text_codes`, both pointing at reusable codes:

| ordinal | code | category | phase | params_json | sentence_from..to |
|---|---|---|---|---|---|
| 0 | `COIN_FLIPS_PER_COUNTER` | `effect` | `before_damage` | `{"counter": {"energy_count": {"slot": "self", "type": "Fire"}}}` | 0..0 |
| 1 | `DMG_PER_HEADS` | `attack_modifier` | — | `{"n": 80, "offset": 1}` | 1..1 |

*Step C — the two code rows.*

```json
// rule_codes: COIN_FLIPS_PER_COUNTER
{ "category": "effect", "once_scope": "none", "status": "exact",
  "pattern": "Flip a coin for each {counter}.",
  "params_schema_json": { "type": "object", "additionalProperties": false,
                          "required": ["counter"], "properties": { "counter": { "$ref": "#/$defs/Value" } } },
  "ir_body_json": { "ops": [ { "op": "for_each", "over": { "times": { "param": "counter" } }, "max": 12,
                               "bind": "$heads",
                               "body": [ { "op": "coin_then", "body": [ { "op": "marker", "mode": "add",
                                                                         "of": "self", "name": "$heads" } ] } ] } ] } }

// rule_codes: DMG_PER_HEADS
{ "category": "attack_modifier", "once_scope": "none", "status": "exact",
  "pattern": "This attack does {n} damage for each heads.",
  "params_schema_json": { "type": "object", "additionalProperties": false,
                          "required": ["n", "offset"],
                          "properties": { "n": { "type": "integer", "minimum": 0, "maximum": 200 },
                                          "offset": { "type": "integer", "minimum": 0, "maximum": 1 } } },
  "ir_body_json": { "attack": { "coin_plus": { "flips": { "local": "$heads" }, "n": { "param": "n" } } } } }
```

*Step D — the composed program.* Density passes (0, 1). Params validate. Binding replaces `{"param":"counter"}` with the energy-count value and `{"param":"n"}` with `80`. No wrappers. The partition puts item 0 in the op slot and item 1 in the attack slot. Nothing to merge. Item 0 is `before_damage`, so it leads and `phaseSplit = 1`. Status is `exact` for both, so the program is `exact`, not `approx`, and `once = "none"`.

```json
{ "version": "1.0.0",
  "textHash": "…",
  "ops": [ { "op": "for_each", "over": { "times": { "energy_count": { "slot": "self", "type": "Fire" } } },
             "max": 12, "bind": "$heads",
             "body": [ { "op": "coin_then", "body": [ { "op": "marker", "mode": "add", "of": "self",
                                                        "name": "$heads" } ] } ] } ],
  "phaseSplit": 1,
  "attack": { "coin_plus": { "flips": { "local": "$heads" }, "n": 80 } },
  "modifiers": [], "triggers": [],
  "locals": ["$heads"],
  "status": "exact", "approx": false, "once": "none" }
```

*Step E — what the engine does with it.* [S04.T07](../04-game-engine-core/T07-damage-pipeline.md) resolves the attack: it runs the `before_damage` ops (the coin loop, consuming one RNG draw per Fire Energy and accumulating `$heads`), reads `attack.coin_plus` to compute the base damage — `80 × $heads`, with `offset: 1` forcing 0 when `$heads` is 0, exactly the `plus_per_offset` rule from `catalog_cards.py` L607–613 — runs the pipeline, then runs the `after_damage` ops, of which there are none. A bot estimating damage without flipping reads `coin_plus` and takes its mean, as `AttackRecipe.expected_bonus` did.

**Second worked example, the one-sentence-two-codes case — Gwynn `me5-78`.** Printed text: *"Discard up to 2 Pokémon that don't have a Rule Box from your hand, and draw 3 cards for each card you discarded in this way."* One sentence, two items, both with `sentence_from = sentence_to = 0`:

| ordinal | code | params_json |
|---|---|---|
| 0 | `DISCARD_HAND_FILTER_UP_TO_N` | `{"n": 2, "min": 0, "filter": {"all_of": [{"is_pokemon": true}, {"no_rule_box": true}]}}` |
| 1 | `DRAW_PER_DISCARDED` | `{"per": 3}` |

Item 0's body binds `$discarded`; item 1's body reads `{"local": "$discarded"}` and multiplies by `{"param": "per"}`. Discarding nothing draws nothing, which is the behaviour the printed "up to" demands and which the legacy got by threading `ctx.state._last_discarded` between two effects. Here it is a declared local with a lifetime ([S05.T04](T04-ir-compiler-and-vm.md)).

**Naming.** `UPPER_SNAKE`, verb-first or with one of six declared prefixes: `DMG_` (attack damage fields), `COND_` (special conditions), `WRAP_` (wrappers), `MOD_` (continuous modifiers), `TRG_` (triggers), `RULE_` (restatements of engine rules, `noop` bodies). The prefix must agree with the category, which the lint checks. Names describe the *behaviour*, never the card: `SEARCH_DECK_FILTER_TO_BENCH`, not `BUDDY_BUDDY_POFFIN`. A code used by exactly one card is allowed and expected in the long tail — 1,046 of the legacy's 1,157 raw sentence templates occur exactly once — but it is still named after what it does.

**`docs/rules/CODES.md`** carries all of the above plus: the four slots and what each accepts; the nine algorithm steps; the error taxonomy with an example of each; the naming table; the starter vocabulary of ~40 codes with their patterns, schemas and one real card each; and a "how to add a code" checklist (pattern, schema with ranges, body, status, scenario, export).

## Implementation steps

1. Write `ProgramJson`, `CompositionError` and the `CodeCategory`/`Phase`/`OnceScope` unions in `@pokesearch/shared`; add the `phase` column to `rule_codes` in `0006_rules.sql` ([S05.T01](T01-rules-schema-migration.md)) before it ships.
2. Write `validateParams` over `params_schema_json` (JSON Schema draft 2020-12 subset with `$defs` referencing the IR schemas) with field-level errors; spec it against the Torkoal and Gwynn schemas.
3. Write `composeProgram` steps 1–4 (load, density, validate, bind); spec `OrdinalGap` and `ParamsInvalid`.
4. Add step 5 (wrappers) with the depth limit; spec `WRAP_COIN_THEN` around a condition code, a nested wrapper, and `DanglingWrapper`.
5. Add steps 6–8 (partition, attack-field merge, phase ordering); spec `DuplicateAttackField`, `AttackFieldOnNonAttack` and the Torkoal phase split.
6. Add step 9 (status, approx, once, locals) with the unbound-local warning; spec RN-16's three scopes.
7. Write `rulesSnapshot` with canonical JSON and the explicit field list; spec stability and the "notes do not change it" rule.
8. Write `explain()` using the IR `describe()` of [S05.T03](T03-effect-ir-vocabulary.md), so `?explain=1` returns readable English per item.
9. Add the four API routes with their error mapping; spec the 422 and 409 shapes.
10. Write `scripts/codes-lint.mjs` (naming, prefix/category agreement, `once_scope` on "Once during your turn" patterns, params schema completeness) and add it to `pnpm check`.
11. Author the ~40 starter codes as seed rows, each with a pattern, a schema with ranges, a body and one real card; this is the vocabulary [S05.T08](T08-spreadsheet-import.md)–[S05.T10](T10-import-catalog-recipes.md) map onto.
12. Write `docs/rules/CODES.md` and review it with the user before any import runs — this is the decision point D-004 names.

## Edge cases and error handling

- **One sentence, two codes** (Gwynn). Both items carry the same `sentence_from`/`sentence_to`. The editor shows them bracketed under the same sentence; the spreadsheet importer attaches the same classification row to both.
- **Two sentences, one code** (a card whose "…and put them onto your Bench. Then, shuffle your deck." is coded as one item). `sentence_from = 0, sentence_to = 1`. Allowed, and the editor highlights the whole range.
- **A "you may" wrapper spanning two sentences.** "You may discard an Energy from this Pokémon. If you do, this attack does 60 more damage." is `WRAP_MAY{}` (ordinal 0, sentences 0..0) + `DISCARD_ENERGY_SELF{n:1}` (1, 0..0) + `DMG_PLUS_IF_LOCAL{n:60, local:"$discarded"}` (2, 1..1). The wrapper takes only the *next* item, so the damage bonus is outside it and reads the local, which is 0 when the player declines — the `IfCan` semantics the legacy documented, rather than `MayDo`'s all-or-nothing. When the whole rest of the text belongs inside the wrapper, the author uses `wraps = "rest"` and the code list says so explicitly.
- **Params failing their schema.** `ParamsInvalid { ordinal, code, field, detail }`, 422 from the API with the field name, and composition stops. The importers collect these into their report rather than writing a broken row.
- **A code edited while evidence exists.** `rulesSnapshot` changes; the worker updates `rules_current.rules_snapshot`; existing evidence rows keep their old snapshot and are marked stale in the editor; [S05.T12](T12-evidence-and-coverage-metrics.md) re-runs the scenarios of every text that uses the edited code. Nothing is deleted (RN-64).
- **Two `attack_modifier` codes both setting `plus`.** `DuplicateAttackField` naming both ordinals. Almost always the sign of a text whose two sentences are conditional variants of one bonus, which is one code with a `Cond` param.
- **An `attack_modifier` code on a Trainer text.** `AttackFieldOnNonAttack`. It happens when an importer maps an attack-shaped legacy entry onto the wrong text, and it is caught at composition rather than at run time.
- **A dangling wrapper.** `WRAP_COIN_THEN` as the last item: `DanglingWrapper`. Usually a missing second code, which is exactly what the legacy lint's `moeda` rule was looking for from the other direction.
- **A local read before it is bound.** A warning, not an error, surfaced in the API response's `warnings` and in the editor. The program still composes and reads 0, because "for each card you discarded in this way" with no discard is genuinely zero — but in practice it means a missing code.
- **A `builtin` code composed with other codes.** Allowed: the builtin is one item in the op slot, and an `attack_modifier` item may sit beside it. Its body is `{"ops": [{"op": "builtin", "name": …}]}` and an unregistered name is `UnknownBuiltin` at composition time, before the engine ever sees the job.
- **An empty code list on a texted part.** Not an error here — `composeProgram` returns an empty program — but `card_status` counts the part as uncovered, which is what puts the text at the top of the authoring queue ([S05.T14](T14-coverage-page-and-authoring-queue.md)).

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/db test compose.spec.ts` green, including the Torkoal end-to-end case: two items compose to the program shown above, `phaseSplit = 1`, `attack.coin_plus.flips = {"local":"$heads"}`, `status = "exact"`.
- [ ] `compose.spec.ts > "Discard 2 cards from your hand. Then draw 3 cards for each card you discarded." composes` as `DISCARD_HAND_N{n:2}` + `DRAW_PER_DISCARDED{per:3}` into one program, and its scenario `engine/scenarios/codes/discard-then-draw.json` passes: discarding 2 draws 6, discarding 0 draws 0.
- [ ] `compose.spec.ts > params failing the schema are rejected with the field name` and `api.spec.ts > PUT /api/rules/texts/:hash/codes with n = "two" returns 422 { field: "n" }` (BR-S05.T07-03).
- [ ] `compose.spec.ts > a gap in ordinals fails with OrdinalGap`; `> a trailing wrapper fails with DanglingWrapper`; `> two codes both setting plus fail with DuplicateAttackField` naming both ordinals (BR-S05.T07-02, -05, -04).
- [ ] `compose.spec.ts > WRAP_COIN_THEN wraps the next item` — the composed ops are one `coin_then` whose body is the wrapped item's ops, and the disassembly shows the nesting (BR-S05.T07-05).
- [ ] `compose.spec.ts > a per_instance ability code yields once = per_instance` and `> a text mixing per_instance and per_name yields per_name`; `codes-lint.spec.ts > "Once during your turn" with once_scope none is rejected` (RN-16).
- [ ] `compose.spec.ts > editing notes leaves the snapshot unchanged` and `> editing an ir_body changes it`; `> the snapshot is stable across two processes` (BR-S05.T07-08).
- [ ] `GET /api/rules/programs/:textHash?explain=1` on the Torkoal text returns two items with readable English (`"Flip a coin for each Fire Energy attached to this Pokémon"`, `"This attack does 80 damage for each heads"`) and no warnings.
- [ ] `pnpm check` runs `codes-lint.mjs` and fails on a fixture code named `draw_n`, on a `WRAP_` code with `category = 'effect'`, and on a code whose `params_schema_json` omits a `maximum` on an integer field (BR-S05.T07-09, RN-61).
- [ ] `compose.spec.ts > compose.ts imports nothing from the engine` — an import-graph assertion (BR-S05.T07-10).
- [ ] `docs/rules/CODES.md` exists with all six sections and the ~40 starter codes, and has been reviewed with the user before [S05.T08](T08-spreadsheet-import.md) runs.

## Risks and open questions

- **Risk — the contract is settled after the spreadsheet is imported** and 1,600 classified sentences have to be re-mapped. Mitigation: step 12 makes the review a gate in practice, and [S05.T08](T08-spreadsheet-import.md) depends on this subtask precisely so the order is enforced by the graph.
- **Risk — the starter vocabulary is wrong-grained**, either so generic that params become programs or so specific that the code count explodes. Mitigation: the ~40 starter codes are chosen by covering the top 100 effect texts by meta copies and are reviewed against the spreadsheet's own sentence templates before import; the count of codes per 100 texts is reported after each importer and is the number that says whether the grain is right.
- **Risk — `phase` is not enough for some attack.** A text that discards, computes damage, and then discards again would need three phases. Mitigation: two phases cover every legacy case found (`_reduce_attack` has exactly this shape); a third would be a schema change with a version bump, and the error taxonomy already makes the need visible rather than silent.
- **Risk — wrappers make code lists hard to read** in a spreadsheet, which is the authoring surface D-004 is built around. Mitigation: `wraps = "next"` is the common case and reads as two adjacent rows; the editor renders the bracket; `explain()` renders the English. If the user finds it awkward, the alternative is a `wrapped_by` column on `text_codes` instead of a wrapper item, which is a schema change and a decision for them.
- **Question (D-004 semantics, the central one) — how generic should a code be?** `SEARCH_DECK_FILTER_TO_BENCH{n, filter}` covers Nest Ball, Buddy-Buddy Poffin, Precious Trolley and Hop's Bag with four parameter sets; `BUDDY_BUDDY_POFFIN` would cover one card. The design assumes the former, with filters as parameters. This is the single decision that sets how many codes exist, how the spreadsheet's `code` column is filled, and how much of the long tail collapses. The user owns it and should confirm before step 11.
- **Question (D-004 semantics) — should `sentence_from`/`sentence_to` be authoritative or provenance?** They are provenance here: the ordinal order decides the program. Making them authoritative would forbid one sentence with two codes, which Gwynn needs. Recommendation: keep them as provenance; the user confirms, since it affects how the spreadsheet's columns map.
- **Question (D-004 semantics) — should a code carry its own `can` precondition?** It does not: preconditions are derived from the ops ([S05.T04](T04-ir-compiler-and-vm.md)), and a text needing an explicit gate uses a `RULE_REQUIRE_*` code at ordinal 0, as `Seq(more_prizes_than_opponent(), …)` did. The user confirms.
- **DEPENDENCY-PROPOSAL: S05.T07 should depend on S05.T02 because** `composeProgram` and the editor's explain path read `effect_texts` and `card_parts` (the part kind decides whether `attack_modifier` codes are legal and whether `phase` applies); today the dependency is only implied through [S05.T01](T01-rules-schema-migration.md)'s schema.

## References

- `pokemon/src/pokesearch/sim/catalog_cards.py` L576–636 (`_reduce_attack`) — verified: the resolution order that motivates the two phases — copy-attack substitution, `nothing_unless`, `coin_or_nothing`, `recipe.bonus(ctx)` as a turn effect, the three ignore flags, the `N×`-with-zero-counter zeroing, `reduce_attack_damage`, `counters_per`, boomerang reattachment, `recipe.effects.run(ctx)`, `lock_self`, the second-attack window, `next_turn`. Consult for what must happen before damage and what after.
- `pokemon/src/pokesearch/sim/effects.py` L122–256 — verified: `Seq(gate_all)`, `ChooseOne` (first available option; option order encodes the bot's preference), `CoinThen` (effect only on heads, one flip from the game's RNG), `MayDo` (the player decides; `draws` tells the pilot how many cards it draws), `IfCan` (*"a diferença entre 'descarte 2 energias e paralise' e 'você pode descartar 2 energias; se fizer, paralise'"*), `ForOpponent`, `EachPlayer`, `Require`, `Approx`. Consult for the wrapper semantics and for the `MayDo`/`IfCan` distinction the edge cases turn on.
- `pokemon/src/pokesearch/sim/effects.py` L346–356 (`DrawPerDiscarded`) — verified: *"Compra N por carta descartada pelo DiscardFromHand imediatamente anterior (Gwynn)"*, implemented by reading `ctx.state._last_discarded`. The ad-hoc channel that becomes a declared local here.
- `pokemon/src/pokesearch/sim/catalog_cards.py` L484–494 (`_limit_per_name`) — verified: once-per-turn is per Pokémon unless the ability text contains *"can't use more than 1"*, cached per class as `_PER_NAME`, with the note that the previous per-name default left the second copy in play with no ability. RN-16's source.
- `pokemon/src/pokesearch/sim/lint.py` L34–42 and L83–104 — verified: the seven lint rules and their labels (`ataque-sem-receita`, `habilidade-ausente`, `moeda`, `tipo-de-energia`, `opcional`, `descartou-assim`, `texto-do-motor`) and `_is_optional` recognising `IfCan`/`ChooseOne`. Consult for the composition mistakes worth detecting at authoring time ([S05.T13](T13-rules-editor-ui.md) implements them against this contract).
- `pokemon/src/pokesearch/sim/catalog.py` L81 and L359–402 — verified: `"gwynn": Seq(DiscardFromHand(2, F.no_rule_box, exact=False, min_n=1), DrawPerDiscarded(3))`, the `self_has_energy_cards` guard on Metagross and Mega Greninja ex, and the eight variable-discard attacks declared approximate. Consult for the two worked examples and for what the `phase` field retires.
- [Decision log](../../project/02-decision-log.md) D-004; [S05.T03](T03-effect-ir-vocabulary.md) (the IR this composes), [S05.T04](T04-ir-compiler-and-vm.md) (locals, binding, the compiled `Program`), [S05.T01](T01-rules-schema-migration.md) (`rule_codes`, `text_codes`, the status order used by `card_status`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
