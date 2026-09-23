# S05.T09 — Import legacy attack effects (412 attacks)

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 9 / 16 |
| Depends on | [S05.T07](T07-rule-codes-composition-semantics.md) |
| Unblocks | — |
| Parallel with | [S05.T08](T08-spreadsheet-import.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `doc` composition contract and code naming — from [S05.T07](T07-rule-codes-composition-semantics.md)
- `file` `pokemon/src/pokesearch/sim/attack_effects.json` (346 cards, 412 attacks: `data.effects[] {op, amount, amount2, condition, coin_then}`, `plus`, `plus_condition`, `plus_per`, `coin_flips`, `nothing_unless`, flags, `unsupported`, `source`)
- `external` verified file contents (2026-09-22): `version: 1`, 346 cards, **413** attack entries; every entry carries `approx, at, data, multiplier, ops, printed, source, text`; 32 also carry `replaced` and 7 carry `unrecognized`; sources are `groq openai/gpt-oss-120b` (344) and `twinleaf …` (69); `approx = true` on 167 entries, always together with `data.unsupported = true`; `multiplier = true` on 45
- `file` `pokemon/src/pokesearch/sim/attackops.py` — the closed vocabulary the entries were validated against; read-only reference

## Outputs (proposed)
- `script` `pnpm rules:import-attack-effects` — mechanical mapping of the 28 legacy ops and 7 plus-conditions to codes (`SELF_DAMAGE_N`, `COUNTERS_OPP_ACTIVE_N`, `DMG_TO_BENCH_N`, `COND_APPLY_OPPONENT_ACTIVE`, …) with params, keyed by the attack's `text_hash`; provenance kept in `notes` (`import:attack_effects <source>`); `unsupported` entries become `draft` codes
- `file` mapping table `packages/db/seed/legacy/attack_ops_map.json`
- `file` `<out>/attack-effects-report.json` — per entry: the text it matched, the codes written, and the reason when nothing was written

## Initial objective
Four hundred attacks already expressed in a closed vocabulary become codes and params in minutes, with their origin (Groq classification vs Twinleaf translation) preserved for the audit trail.

## Context

This is the cheapest coverage in the stage. The legacy already did the hard part: every one of these 413 attack effects was forced through `attackops.py::build_recipe`, which accepts only the 28 ops, the 7 `PLUS_CONDITIONS`, the 39 counters and the 5 special conditions, with per-op sanity ranges. Nothing in the file is free-form. Mapping it onto `rule_codes` + `text_codes` is therefore a table lookup, not an interpretation, and the whole import is a few hundred lines with a mapping file beside it.

The verified numbers matter for planning, because they are less flattering than the headline. Of the 413 entries, **167 are `approx = true` with `data.unsupported = true`** — the classifier or the translator met something outside the vocabulary and said so. Those are not lost: the vocabulary has grown ([S05.T03](T03-effect-ir-vocabulary.md)), and many of them are now expressible, but the import cannot know which. It writes what the file says and marks the rest `draft` with the original text in `notes`, which puts them in the authoring queue with a head start rather than silently pretending they are done. The honest split is **246 entries that map to a complete code list** and **167 that land as a `draft` placeholder carrying the printed text and whatever partial fields the entry did have**. Seven of the 167 carry an `unrecognized` array naming the constructs the Twinleaf translator met and could not map — `["COIN_FLIP_PROMPT", "PREVENT_EFFECTS_OF_ATTACKS"]`, `["MOVE_CARDS", "SHUFFLE_DECK"]`, `["AddSpecialConditionsEffect"]` — which is a shopping list for [S05.T03](T03-effect-ir-vocabulary.md) and for [S05.T06](T06-builtins-escape-hatch.md), and it is carried into `notes` verbatim.

RN-62 is this subtask's rule and the file already encodes it. Sixty-nine entries come from `twinleaf …` and 344 from `groq openai/gpt-oss-120b`; where the Twinleaf translator produced an entry, it *replaced* the Groq one and kept it under a `replaced` key — 32 entries have both. Twinleaf translation comes from implemented logic in a second engine, not from prose, so it outranks a classification, and `README.md` L161 says so. The import preserves the ranking as data: `text_codes.source` records `twinleaf` or `attack_effects`, `notes` carries the full source string (including the Twinleaf source file path), and the superseded Groq classification is written into `notes` too, so the audit trail survives the move. Crucially, the ranking is about **confidence, not truth**: neither source is evidence (RN-63). A Twinleaf-derived code is still `draft` or `exact` by human decision and still needs a scenario before `card_status.proven` moves.

The other thing the file carries is `multiplier` (45 entries), which is the legacy's `printed_multiplier` flag: printed damage written as `N×` already counts one unit of the counter, so `plus_per_offset` must be 1. Getting this wrong makes "20× for each Benched Pokémon" do 20 with an empty bench, which the legacy fixed explicitly. The import maps `multiplier → offset`, and it is the single most error-prone field in the mapping.

## Scope

- **In scope.** `packages/db/src/rules/import-attack-effects.ts`; `packages/db/seed/legacy/attack_ops_map.json` (the 28 ops → codes, the 7 plus-conditions → `Cond`s, the 39 counters → IR `Value`s, the 5 conditions → enum members); `pnpm rules:import-attack-effects`; the report; the matching of a legacy `name_key` + attack name to a `text_hash`; the provenance and ranking rules; the fixtures.
- **Out of scope.** Authoring the target codes — the ~40 starter codes come from [S05.T07](T07-rule-codes-composition-semantics.md) and this import adds the handful the mapping needs, all as seed rows reviewed like any other code. The catalog recipes ([S05.T10](T10-import-catalog-recipes.md)); the spreadsheet ([S05.T08](T08-spreadsheet-import.md)); the twinleaf oracle as a *differential* source of evidence, which is [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md) and is a different thing from this translation; evidence and coverage ([S05.T12](T12-evidence-and-coverage-metrics.md)); scenarios ([S05.T11](T11-legacy-tests-to-scenarios.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-62 | **Kept.** A translation from an implemented second source outranks a prose classification: an entry whose `source` starts with `twinleaf` is imported with `text_codes.source = 'twinleaf'` and wins any conflict with an `attack_effects` (Groq) entry for the same `(text_hash, ordinal)`; the superseded entry's `data` is preserved verbatim in `rule_codes.notes` / the report. The ranking never makes a code `exact` on its own — provenance is confidence, not evidence (RN-63). | `sourceRank = { manual: 3, catalog: 2, twinleaf: 1, attack_effects: 0 }` applied in the conflict resolver; the importer never writes a status above `draft` for a `groq` entry | `import-attack-effects.spec.ts > a twinleaf entry wins over a groq entry for the same text`; `> the superseded groq data is preserved in notes`; `> no imported code is written with status exact` |
| BR-S05.T09-01 | The import is mechanical: every legacy op, plus-condition, counter and condition resolves through `attack_ops_map.json`, and an unmapped name aborts the entry with a report line rather than being approximated. | the map is loaded and checked for completeness at startup against the 28 / 7 / 39 / 5 inventories from [S05.T03](T03-effect-ir-vocabulary.md) | `import-attack-effects.spec.ts > the map covers all 28 ops, 7 plus-conditions, 39 counters and 5 conditions`; `> an entry with an unmapped op is reported, not guessed` |
| BR-S05.T09-02 | `multiplier = true` maps to `offset = 1` on the `plus_per` params, and `multiplier = false` to `offset = 0`. Nothing else sets `offset`. | the `plus_per` branch of the mapper | `import-attack-effects.spec.ts > Mega Zeraora ex imports with offset 1`; `> a non-multiplier plus_per imports with offset 0` |
| BR-S05.T09-03 | An entry with `approx = true` or `data.unsupported = true` produces a `draft` code carrying the printed text, the `ops` summary and any `unrecognized` array in `notes`; it never produces an `exact` or `approx` code and never silently produces nothing. | the `unsupported` branch writes `RULE_UNCODED_ATTACK` with `status = 'draft'` and the note | `import-attack-effects.spec.ts > an unsupported entry yields a draft placeholder with the text in notes`; `> the seven unrecognized arrays survive into notes` |
| BR-S05.T09-04 | An entry whose `(name_key, attack name)` does not resolve to a `text_hash` in the current data is reported with the reason, never forced onto a near-miss text. | the matcher requires an exact match on the printed attack text after `normText`, not on the attack name | `import-attack-effects.spec.ts > an entry whose text changed upstream is reported as text_changed`; `> an attack name shared by two different texts is reported as ambiguous` |
| BR-S05.T09-05 | The import never overwrites an occupied `(text_hash, ordinal)` slot authored by a human or by a higher-ranked source; conflicts are reported with both sides. | the conflict resolver using `sourceRank`; `manual` always wins | `import-attack-effects.spec.ts > a manual code list survives the import and is reported as a conflict` |
| BR-S05.T09-06 | The import is idempotent: a second run on an unchanged file writes nothing and reports zero writes. | insert-if-absent keyed on `(text_hash, ordinal)`; the file's SHA-256 recorded in the report | `import-attack-effects.spec.ts > importing twice writes nothing the second time` |
| BR-S05.T09-07 | Every written `text_codes` row records its provenance: `source` is `twinleaf` or `attack_effects`, and `rule_codes.notes` gains `import:attack_effects <source string>` including the Twinleaf source file path where there is one. | the writer builds `notes` from the entry's `source` and `at` fields | `import-attack-effects.spec.ts > every imported row carries its source string and timestamp` |
| BR-S05.T09-08 | Each entry's `coin_then` flag becomes a `WRAP_COIN_THEN` item immediately before the wrapped effect's item, so a coin in the legacy data is a coin in the composed program (the lint rule the legacy added after Erika's Tangela, Jynx, Misty's Staryu and Team Rocket's Ekans). | the effect loop emits the wrapper item first when `coin_then` is true | `import-attack-effects.spec.ts > coin_then emits WRAP_COIN_THEN before the effect`; the composed program's disassembly shows the nesting |
| BR-S05.T09-09 | A `plus_condition` or `nothing_unless` value maps to the `Cond` the map declares and to nothing else; `none` maps to no field at all, not to `always`. | the two condition branches | `import-attack-effects.spec.ts > plus_condition "opponent_active_is_ex" maps to the declared Cond`; `> plus_condition "none" leaves plus unconditional` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `pokemon/src/pokesearch/sim/attack_effects.json` | R | script (`rules:import-attack-effects`) | on demand | read-only; its SHA-256 recorded in the report | the legacy tree is never written |
| `packages/db/seed/legacy/attack_ops_map.json` | R | script | at startup | completeness checked against the four inventories | BR-S05.T09-01 |
| `effect_texts`, `card_parts`, `cards`, `attacks` | R | script | resolving each entry to a `text_hash` | read-only; matched on `normText(attacks.text)` | BR-S05.T09-04 |
| `rule_codes` | C | script | when the map names a code that does not exist yet | insert-if-absent; the seed bodies come from the map file and are reviewed in the pull request like any code | [S05.T07](T07-rule-codes-composition-semantics.md) |
| `rule_codes` | U | script | never for `status`, `ir_body_json` or `params_schema_json`; only to append provenance to `notes` | an import never changes what a code does | BR-S05.T09-07 |
| `text_codes` | C | script | per mapped entry | insert into free `(text_hash, ordinal)` slots only; `source` set to `twinleaf` or `attack_effects` | RN-62, BR-S05.T09-05 |
| `text_codes` | U | script | only when a `twinleaf` entry supersedes an `attack_effects` one in the same slot | the superseded row's params go into the report and into `notes` before the update | RN-62 |
| `<out>/attack-effects-report.json` | C | script | every run, including `--dry-run` | always written | the artefact the user reads |
| `cards`, `attacks`, `abilities` | — | this subtask | never written | the ETL owns them (D-003) | — |
| `rule_evidence` | — | this subtask | never | a classification and a translation are both provenance, not evidence (RN-63) | [S05.T12](T12-evidence-and-coverage-metrics.md) |
| `text_sentences` | — | this subtask | never | sentences come from the spreadsheet ([S05.T08](T08-spreadsheet-import.md)) | — |

## Interfaces

**Entry shape**, verified against the file:

```jsonc
"cards": {
  "beldum": {
    "engine_id": "TEF-109",
    "attacks": {
      "Iron Tackle": {
        "approx": false,
        "at": "2026-09-17T16:29:39+00:00",
        "multiplier": false,
        "ops": "self_damage",                     // human-readable summary from build_recipe's notes
        "printed": "50",                          // printed damage as a string
        "source": "twinleaf src/sets/10-scarlet-and-violet/set-temporal-forces/beldum.ts (impressão)",
        "text": "This Pokémon also does 10 damage to itself.",
        "data": {
          "plus": 0, "plus_condition": "none", "plus_per": "none", "plus_per_amount": 0,
          "coin_flips": 0, "coin_plus_amount": 0, "coin_or_nothing": false,
          "nothing_unless": "none",               // absent on older groq entries
          "ignore_weakness_resistance": false, "ignore_resistance": false,
          "ignore_target_effects": false, "lock_self": false,
          "unsupported": false,
          "effects": [ { "op": "self_damage", "amount": 10, "amount2": 0,
                         "condition": "none", "coin_then": false } ]
        },
        "replaced": { /* the superseded groq entry, same shape, with its own source and at */ },
        "unrecognized": [ "COIN_FLIP_PROMPT", "PREVENT_EFFECTS_OF_ATTACKS" ]   // 7 entries
      }
    }
  }
}
```

**Mapping table** — `packages/db/seed/legacy/attack_ops_map.json`. Four sections, each complete against its inventory, each entry naming the target code and how the legacy's `amount` / `amount2` / `condition` become params.

```jsonc
{
  "version": 1,
  "ops": {
    "self_damage":                    { "code": "SELF_DAMAGE_N",              "params": { "n": "amount" } },
    "place_counters_opponent_active": { "code": "COUNTERS_OPP_ACTIVE_N",      "params": { "n": "amount" } },
    "place_counters_each_opponent":   { "code": "COUNTERS_EACH_OPPONENT_N",   "params": { "n": "amount" } },
    "damage_to_opponents":            { "code": "DMG_TO_CHOSEN_N",            "params": { "n": "amount", "targets": "amount2|1" } },
    "damage_to_opponent_benched":     { "code": "DMG_TO_BENCH_N",             "params": { "n": "amount", "targets": "amount2|1" } },
    "apply_condition":                { "code": "COND_APPLY_OPPONENT_ACTIVE", "params": { "condition": "condition" } },
    "apply_condition_self":           { "code": "COND_APPLY_SELF",            "params": { "condition": "condition" } },
    "discard_energy_self":            { "code": "DISCARD_ENERGY_SELF_N",      "params": { "n": "amount|all" } },
    "energy_self_to_hand":            { "code": "ENERGY_SELF_TO_HAND_N",      "params": { "n": "amount|1" } },
    "discard_energy_opponent_active": { "code": "DISCARD_ENERGY_OPP_ACTIVE",  "params": {} },
    "attach_energy_from_discard":     { "code": "ATTACH_ENERGY_FROM_DISCARD", "params": { "n": "amount" } },
    "draw":                           { "code": "DRAW_N",                     "params": { "n": "amount" } },
    "search_deck_to_hand":            { "code": "SEARCH_DECK_FILTER_TO_HAND", "params": { "n": "amount", "filter": { "const": { "any_card": true } } } },
    "search_basic_to_bench":          { "code": "SEARCH_DECK_FILTER_TO_BENCH","params": { "n": "amount", "filter": { "const": { "is_basic": true } } } },
    "from_discard_to_hand":           { "code": "RETURN_FROM_DISCARD_N",      "params": { "n": "amount", "filter": { "const": { "is_pokemon": true } } } },
    "from_discard_to_bench":          { "code": "FROM_DISCARD_TO_BENCH_N",    "params": { "n": "amount" } },
    "switch_self":                    { "code": "SWITCH_OWN_ACTIVE",          "params": {} },
    "switch_opponent_active":         { "code": "SWITCH_OPPONENT_ACTIVE_THEY_CHOOSE", "params": {} },
    "return_self_to_hand":            { "code": "RETURN_SELF_TO_HAND",        "params": {} },
    "heal_self":                      { "code": "HEAL_SELF_N",                "params": { "n": "amount" } },
    "discard_opponent_deck":          { "code": "DISCARD_OPPONENT_DECK_N",    "params": { "n": "amount" } },
    "discard_stadium":                { "code": "DISCARD_STADIUM",            "params": {} },
    "self_cannot_attack_next_turn":   { "code": "SELF_NO_ATTACK_NEXT_TURN",   "params": {} },
    "self_prevent_damage_next_turn":  { "code": "SELF_PREVENT_DAMAGE_NEXT_TURN", "params": {} },
    "self_takes_less_damage_next_turn": { "code": "SELF_DMG_MINUS_NEXT_TURN", "params": { "n": "amount" } },
    "defender_cannot_retreat_next_turn": { "code": "DEFENDER_NO_RETREAT_NEXT_TURN", "params": {} },
    "opponent_cannot_play_items_next_turn":      { "code": "OPPONENT_NO_ITEMS_NEXT_TURN",      "params": {} },
    "opponent_cannot_play_supporters_next_turn": { "code": "OPPONENT_NO_SUPPORTERS_NEXT_TURN", "params": {} }
  },
  "plus_conditions": {
    "stadium_in_play":             { "cond": { "exists": { "of": "stadium", "filter": { "is_trainer": true } } } },
    "opponent_active_is_ex":       { "cond": { "matches": { "of": { "active": { "of": "opponent" } }, "filter": { "tag": "ex" } } } },
    "opponent_active_is_evolution":{ "cond": { "matches": { "of": { "active": { "of": "opponent" } }, "filter": { "is_evolution": true } } } },
    "self_has_damage":             { "cond": { "cmp": { "left": { "damage_on": { "slot": "self" } }, "rel": "gt", "right": { "int": 0 } } } },
    "opponent_has_more_prizes":    { "cond": { "cmp": { "left": { "prizes": { "of": "opponent" } }, "rel": "gt", "right": { "prizes": { "of": "owner" } } } } },
    "self_has_more_prizes":        { "cond": { "cmp": { "left": { "prizes": { "of": "owner" } }, "rel": "gt", "right": { "prizes": { "of": "opponent" } } } } },
    "self_has_tool_attached":      { "cond": { "exists": { "of": { "zone": { "of": "self", "zone": "attached" } }, "filter": { "trainer_kind": "tool" } } } }
  },
  "counters": { "bench_self": { "value": { "bench_size": { "of": "owner" } } }, "...": "all 39" },
  "conditions": { "poisoned": "poisoned", "burned": "burned", "asleep": "asleep",
                  "paralyzed": "paralyzed", "confused": "confused" }
}
```

`"amount2|1"` means "take `amount2`, defaulting to 1 when it is 0", reproducing `OP_BUILDERS`' `max(1, b)`. `"amount|all"` means "take `amount`, or the `all` sentinel when it is 0", reproducing `DiscardEnergySelf(a or None)`. Both are documented in the map's own README section so the reader does not have to infer them.

**Per-entry emission order**, which is the ordinal order of the resulting `text_codes` list:

1. `nothing_unless` → `ATTACK_NOTHING_UNLESS{cond}` (`attack_modifier`).
2. `coin_or_nothing` → `ATTACK_COIN_OR_NOTHING{}` (`attack_modifier`).
3. `plus` (+ `plus_condition`) → `DMG_PLUS{n, cond?}` (`attack_modifier`).
4. `plus_per` + `plus_per_amount` + `multiplier` → `DMG_PER_COUNTER{counter, n, offset}` (`attack_modifier`).
5. `coin_flips` + `coin_plus_amount` → `DMG_PER_HEADS{flips, n}` (`attack_modifier`; `coin_flips = -1` becomes `flips: "until_tails"`, reproducing `build_recipe`'s `0 if flips == -1 else flips`).
6. the four boolean flags → `ATTACK_IGNORE_WEAKNESS_RESISTANCE`, `ATTACK_IGNORE_RESISTANCE`, `ATTACK_IGNORE_TARGET_EFFECTS`, `ATTACK_LOCK_SELF` (`attack_modifier`, no params).
7. each `data.effects[]` item in order → optionally `WRAP_COIN_THEN{}` then the mapped code (`effect`, `phase: after_damage`).
8. `unsupported` → `RULE_UNCODED_ATTACK{}` with the note (`effect`, `status: draft`).

Every item gets `sentence_from = 0, sentence_to = <last>` — the legacy data has no sentence split, so the range spans the whole text and [S05.T08](T08-spreadsheet-import.md)'s import narrows it later when the same text gets sentences.

**CLI.** `pnpm rules:import-attack-effects [--file <path>] [--dry-run] [--only twinleaf|groq] [--report <path>] [--json]`. Exit codes: 0 ok, 1 unmapped ops or unmatched texts exist (the report says how many), 2 the file or the map is unreadable, 3 the map fails its completeness check.

**Report** (`attack-effects-report.json`): `{ fileHash, ranAt, dryRun, entries: 413, matched, unmatched, written: { ruleCodes, textCodes }, bySource: { twinleaf, attack_effects }, drafts, perEntry: [{ nameKey, attack, textHash|null, reason?, codes: [{ ordinal, code, params, source }] }], unmappedOps: [], textChanged: [], ambiguous: [], conflicts: [], unrecognized: [{ nameKey, attack, names: [] }] }`.

## Implementation steps

1. Write the JSON reader and the entry zod schema; assert it against the real file and record the counts (346 cards, 413 attacks, 167 unsupported, 45 multipliers, 32 replaced, 7 unrecognized).
2. Write `attack_ops_map.json` with all four sections and the completeness check against the [S05.T03](T03-effect-ir-vocabulary.md) inventories; make the check fail on a deliberately removed op.
3. Write the matcher: legacy `name_key` + attack name → the printings in `cards`/`attacks` → `normText(attacks.text)` → `text_hash`, with `text_changed` and `ambiguous` branches.
4. Write the emitter for steps 1–6 of the emission order (the attack-field codes) and spec `multiplier → offset` and `coin_flips = -1 → until_tails`.
5. Write the emitter for step 7 (the effect list) with the `coin_then` wrapper; spec the wrapper ordering.
6. Write the `unsupported` branch (step 8) carrying `text`, `ops` and `unrecognized` into `notes`.
7. Add the conflict resolver with `sourceRank` and the `replaced` preservation; spec RN-62 in both directions.
8. Add the seed `rule_codes` rows the map names that [S05.T07](T07-rule-codes-composition-semantics.md) did not already create, each with a pattern, a params schema with ranges, a body and `status = 'draft'`.
9. Write the report, `--dry-run` and the exit codes; wire `pnpm rules:import-attack-effects`.
10. Run the real import, record the numbers in the completion note, and run `pnpm rules:export` ([S05.T15](T15-rules-export-import-seed.md)) so the result is in git and reviewable as a diff.
11. Compose every imported text (`composeProgram`) and assert that all of them compose without a `CompositionError` — the mechanical check that the import produced valid code lists, not just rows.

## Edge cases and error handling

- **An entry whose text changed upstream.** The attack name still resolves but `normText(attacks.text)` no longer matches the entry's `text`. Reported as `text_changed` with both strings; nothing is written. This is expected for a file dated 2026-09-17 against data reloaded later, and the count is worth watching.
- **An attack name shared by two different texts** — "Mind Bend" exists on Celebi `ecard3-145`, Jirachi `ex5-8` and Drifloon `dp6-92` with the same text, and on Munkidori with a different one. The matcher keys on the *text*, not the name, so the first three collapse to one `text_hash` and Munkidori's is separate. A name resolving to two different texts with neither matching the entry is `ambiguous`.
- **An entry with `approx = true`.** 167 of 413. A `RULE_UNCODED_ATTACK` draft code carrying the printed text, the `ops` summary and the `unrecognized` array. The card is not exact, the text sits in the authoring queue with its meta copies, and the note tells the author what the legacy could not express.
- **An entry with `replaced`.** 32 of 413. The outer entry (Twinleaf) is imported; the inner one (Groq) goes into `notes` as `superseded: <json>` and into the report. Nothing is lost and the ranking is visible (RN-62).
- **An op in the file that the map does not name.** Cannot happen for the 28 — `build_recipe` rejected anything else — but the guard exists because the file is data on disk and could be hand-edited. Reported as `unmappedOps` and the entry is skipped entirely; exit 1.
- **`coin_flips = -1`.** The legacy's "flip until tails" sentinel. Maps to `flips: "until_tails"`. A literal `-1` reaching the IR would fail its range check, which is the safety net.
- **`amount2 = 0` on `damage_to_opponents`.** `max(1, b)` in the legacy. The map's `"amount2|1"` reproduces it. Without this, "does 60 damage to 1 of your opponent's Pokémon" would import as "to 0 Pokémon".
- **A slot already occupied by a `manual` or `catalog` code.** The higher rank wins and the import reports the conflict with both code lists. [S05.T10](T10-import-catalog-recipes.md) runs in parallel and outranks this one, matching the legacy's own precedence (`catalog._with_attack_recipes`: the hand-written recipe wins, the classification fills the gaps).
- **The same text carried by several printings.** Written once, against the `text_hash`. The legacy wrote per `name_key` and needed `_wrap_reprints` to reach the other printings; here it is free.
- **An entry for a card no longer in Standard.** The text may still exist in `effect_texts` (the rebuild covers whatever the ETL loaded). If it does not, the entry is reported as `unmatched` with the card name; nothing is written.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/db test import-attack-effects.spec.ts` green, including `> the map covers all 28 ops, 7 plus-conditions, 39 counters and 5 conditions` and `> an entry with an unmapped op is reported, not guessed` (BR-S05.T09-01).
- [ ] `pnpm rules:import-attack-effects --dry-run --json` against the real file reports 413 entries, and **≥ 380 of 413 resolve to a `text_hash`** with the rest listed under `text_changed` / `ambiguous` / `unmatched` with their reasons (BR-S05.T09-04).
- [ ] The same run reports **≥ 240 entries producing a complete non-draft code list** and ~167 producing a `draft` placeholder, and the two numbers sum to the matched count (BR-S05.T09-03).
- [ ] `import-attack-effects.spec.ts > a twinleaf entry wins over a groq entry for the same text` and `> the superseded groq data is preserved in notes`; the real run's `bySource` shows the 69 Twinleaf entries ranked above their 32 replaced counterparts (RN-62).
- [ ] `import-attack-effects.spec.ts > no imported code is written with status exact` — every `rule_codes` row this import creates is `draft`, because provenance is not evidence (RN-62, RN-63).
- [ ] `import-attack-effects.spec.ts > Mega Zeraora ex imports with offset 1` and `> a non-multiplier plus_per imports with offset 0`; the real run reports 45 entries with `offset = 1` (BR-S05.T09-02).
- [ ] `import-attack-effects.spec.ts > coin_then emits WRAP_COIN_THEN before the effect` and the composed program's disassembly shows the effect nested inside the coin (BR-S05.T09-08).
- [ ] `import-attack-effects.spec.ts > importing twice writes nothing the second time` (BR-S05.T09-06).
- [ ] `import-attack-effects.spec.ts > a manual code list survives the import and is reported as a conflict` (BR-S05.T09-05).
- [ ] After the real run, `composeProgram` succeeds for every text this import touched — zero `CompositionError` — and `pnpm rules:export` produces a reviewable diff (step 11).
- [ ] The report's `unrecognized` section lists the seven entries with their arrays (`["COIN_FLIP_PROMPT","PREVENT_EFFECTS_OF_ATTACKS"]`, `["MOVE_CARDS","SHUFFLE_DECK"]`, `["AddSpecialConditionsEffect"]`, …), and they are carried into [S05.T03](T03-effect-ir-vocabulary.md)'s "unspellable" list.

## Risks and open questions

- **Risk — the import looks like a big win and is 60 % placeholders.** 167 of 413 entries are `unsupported`. Mitigation: the acceptance reports both numbers separately, the drafts are visibly `draft` in `card_status`, and the completion note records the split so the coverage number is never read as more than it is.
- **Risk — `text_changed` is large** because the file is dated 2026-09-17 and the new ETL loads current data. Mitigation: the report lists each one with both strings; a cluster with the same small difference is usually one normalization rule away, and the near-duplicate report from [S05.T02](T02-effect-texts-and-card-parts.md) helps. Do not loosen the matcher to raise the number — matching a changed text to an old classification is exactly the 1.4 % failure RN-05 exists to prevent.
- **Risk — a wrong-but-well-formed classification is imported as if it were right.** The legacy measured this: 25 of 27 sampled attacks were correct, so roughly 7 % are silently wrong, and `sim/lint.py` was written to catch the patterns (coin ignored, energy type ignored, "you may" treated as mandatory, "discarded in this way" read as the whole discard pile). Mitigation: every imported code is `draft`, the lint rules run in [S05.T13](T13-rules-editor-ui.md) against the composed programs, and nothing becomes `proven` without a scenario.
- **Question — should the `groq` entries be imported at all?** They are the bulk (344 of 413) and they are the least trustworthy source in the project. Recommendation: yes, as `draft` — a draft code with the right shape is a much better starting point than an empty text, and it costs nothing because `draft` does not count toward `exact`. The user decides whether to run `--only twinleaf` for a stricter first pass.
- **Question (D-004 semantics) — should an imported entry produce one code or several?** Several, one per legacy field and per effect, so that the code list reads like the sentence. The alternative — one `LEGACY_ATTACK_RECIPE` code with the whole `data` blob as params — would import in an afternoon and would defeat the model. Recommendation: keep the per-field emission; the user confirms.

## References

- `pokemon/src/pokesearch/sim/attack_effects.json` — verified by direct inspection: `version: 1`; 346 cards; 413 attack entries; entry keys `approx, at, data, multiplier, ops, printed, source, text` on all of them, `replaced` on 32, `unrecognized` on 7; sources `groq openai/gpt-oss-120b` (344) and `twinleaf <path> (impressão)` (69); `approx = true` on 167, always with `data.unsupported = true`; `multiplier = true` on 45; the most frequent ops are `discard_energy_self` (27), `apply_condition` (27), `self_damage` (21), `self_cannot_attack_next_turn` (18), `draw` (18), `defender_cannot_retreat_next_turn` (18). Consult for the entry shape and the counts; the file itself is the import's only input.
- `pokemon/src/pokesearch/sim/attackops.py` — verified: `OP_BUILDERS` (the 28 ops and their constructors, including `max(1, b)` on `damage_to_opponents` and `a or None` on `discard_energy_self`), `PLUS_CONDITIONS` (7), `CONDITIONS` (5), `MAX_AMOUNT` (the sanity ranges), `BOOL_FIELDS`, and `build_recipe`'s handling of `coin_flips == -1` (`0 if flips == -1 else flips`) and of `printed_multiplier` (`plus_per_offset = 1`). Consult for every mapping decision in `attack_ops_map.json`.
- `pokemon/src/pokesearch/sim/catalog.py` L516–539 (`_with_attack_recipes`) — verified: *"o que está escrito à mão aqui vence a classificação automática, porque foi lido e testado por alguém. A classificação entra onde não há receita escrita."* The precedence this import's `sourceRank` reproduces against [S05.T10](T10-import-catalog-recipes.md).
- `pokemon/src/pokesearch/sim/verified.py` L139–151 (`twinleaf_attacks`) — verified: a Twinleaf translation counts only when it is the recipe *in use* and is not approximate, because a hand-written recipe overrides it. Consult for why provenance and evidence are separate here (RN-62 vs RN-63).
- `pokemon/README.md` L155–168 — verified: the closed-vocabulary pipeline (*"o modelo só pode escolher itens dessa lista, valida cada resposta … e grava em `sim/attack_effects.json`, versionado com o texto de origem, o modelo e a data"*), the known limit (*"o validador barra resposta malformada, mas não resposta errada e bem formada. Numa amostra de 27 ataques conferidos contra uma segunda fonte, a classificação acertou 25"*), and the Twinleaf translation rule (*"A tradução exata vem de lógica implementada, não de prosa, e por isso prevalece sobre a classificação por IA"*). Consult for RN-61's limit and RN-62's justification.
- [S05.T07](T07-rule-codes-composition-semantics.md) — the code naming, the emission order's `attack_modifier` / `effect` split and the `phase` field; [S05.T03](T03-effect-ir-vocabulary.md) — the inventories the map is checked against.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
