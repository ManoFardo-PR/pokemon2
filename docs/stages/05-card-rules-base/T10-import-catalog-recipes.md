# S05.T10 — Import legacy catalog recipes (262 recipes)

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 10 / 16 |
| Depends on | [S05.T07](T07-rule-codes-composition-semantics.md) |
| Unblocks | — |
| Parallel with | [S05.T08](T08-spreadsheet-import.md), [S05.T09](T09-import-attack-effects-json.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `doc` composition contract — from [S05.T07](T07-rule-codes-composition-semantics.md)
- `file` `pokemon/src/pokesearch/sim/catalog.py` (262 hand-written recipes over `effects.py` primitives, ~25 lambda shapes) and `cardfilters.py`
- `external` verified file contents (2026-09-22): one `CATALOG` literal plus four `CATALOG.update({…})` blocks; **255 distinct keys** (`alakazam` appears twice — L274 and L309 — and the later definition wins); by constructor, 106 `PokemonRecipe`, 30 `ToolRecipe`, 26 `StadiumRecipe`, 17 `EnergyRecipe` and the remainder bare `Effect` compositions for Items and Supporters; a `NOTES` dict with 6 approximation notes
- `external` Python 3 with the legacy virtual environment, or any Python 3.11+ with only the standard library (`ast`), since the exporter parses rather than imports

## Outputs (proposed)
- `script` `scripts/rules/export-catalog.py` (Python, runs in the legacy venv, `ast`-based) → `catalog_recipes.json`; `pnpm rules:import-catalog` → codes + params per `text_hash` with provenance `import:catalog`; hand-written table `lambda_map.json` translating the ~25 lambda shapes (`_active_ex`, `_attacker_type`, `F.named(lambda s,t,st: …)`, `Require(lambda ctx: …)`) into IR conditions
- `file` report of recipes that could not be mapped (kept as `draft` with the Python source in `notes`)
- `file` `packages/db/seed/legacy/catalog_recipes.json` — the exporter's output, committed so the import is reproducible without the legacy tree

## Initial objective
The 262 recipes the user wrote by hand for the legacy simulator — Items, Supporters, Tools, Stadiums, Special Energies and abilities — seed the codes for the most-played trainers without re-reading every card.

## Context

These recipes are the highest-quality input the stage has. Unlike the 413 classified attacks ([S05.T09](T09-import-attack-effects-json.md)), every one of them was written by hand, read against the printed card, and in many cases carries a comment explaining a ruling or a bug it fixes: *"o do motor não conferia primeiro turno nem Básico recém-jogado"* on Rare Candy, *"o motor punha os Pokémon no Banco por fora do redutor, e o gatilho de campo (Risky Ruins) não disparava"* on Buddy-Buddy Poffin, *"o Cruel Arrow do motor punha 10 marcadores: passava por cima da regra Tera"* on Fezandipiti ex. Those comments are worth as much as the recipes and they go into `rule_codes.notes` and into the report.

They are also the hardest input to import, for one reason: **a recipe is Python, and some of its meaning is in lambdas**. `catalog.py` imports `cardfilters` and composes `effects.py` classes, and most of it is pure data — `"nest ball": SearchDeck(F.is_basic, 1, to="bench")` is a code and a params object waiting to be written down. But a recurring minority reaches into Python: module-level helpers with a `.desc` string (`_active_ex`, `_attacker_type`, `_bench_no_rule_box`, `_holder_is`, `_festival_grounds`), inline `F.named(lambda s, t, st: …, "description")` predicates, and `Require(lambda ctx: …)` preconditions. Those cannot be translated mechanically and must not be guessed at: `cardfilters.describe()` itself gives up on an anonymous lambda and returns *"condição escrita em código (ver sim/catalog.py)"*, which is precisely the opacity D-004 exists to remove.

The design is therefore two-stage and deliberately conservative. A Python script parses `catalog.py` with `ast` — never importing it, so no third-party engine and no database are needed — and emits `catalog_recipes.json`: a literal, lossless transcription of each recipe as a tree of constructor names, positional arguments and keyword arguments, with every lambda reduced to a **shape key** (its source text, normalized) plus its `.desc` string where one exists. A hand-written `lambda_map.json` then maps each distinct shape key to an IR `Cond` or `Filter`. Roughly 25 shapes cover all of them, and each is reviewed once by a human and reused everywhere it occurs. A shape with no mapping does not block the recipe: the surrounding structure still imports, the conditional part becomes a `draft` code with the Python source in `notes`, and the report lists it.

The second thing to get right is **precedence**, and the legacy states it: `catalog._with_attack_recipes` merges the classified attacks under the hand-written ones with the comment *"o que está escrito à mão aqui vence a classificação automática, porque foi lido e testado por alguém"*. This import therefore outranks [S05.T09](T09-import-attack-effects-json.md) (`sourceRank`: `manual` 3 > `catalog` 2 > `twinleaf` 1 > `attack_effects` 0), and the two can run in either order because the resolver, not the order, decides.

Two legacy behaviours must **not** be carried over, because they were workarounds for a name-keyed world. `_wrap_reprints` copied a recipe onto every other printing with the same ability and attack names; here a text hash is shared by construction, so it is unnecessary. `"dunsparce@TEF-128"`, the pinned-printing escape hatch, is likewise unnecessary — the two Dunsparce texts have different hashes. The importer resolves both forms to text hashes and reports how many recipes the pinning was covering, as a small proof that RN-05 paid for itself.

## Scope

- **In scope.** `scripts/rules/export-catalog.py` (the `ast` walker, the lambda shape extractor, `catalog_recipes.json`); `packages/db/seed/legacy/{catalog_recipes.json, lambda_map.json}`; `packages/db/src/rules/import-catalog.ts`; `pnpm rules:import-catalog`; the five recipe-kind translators (bare `Effect`, `ToolRecipe`, `StadiumRecipe`, `PokemonRecipe`, `EnergyRecipe`); the filter translator (`cardfilters` expression → IR `Filter`); the `NOTES` and comment carry-over; the report.
- **Out of scope.** Running any legacy Python beyond `ast.parse` — the exporter imports nothing. The attack-effects import ([S05.T09](T09-import-attack-effects-json.md)); the spreadsheet ([S05.T08](T08-spreadsheet-import.md)); the target codes' bodies, which are [S05.T07](T07-rule-codes-composition-semantics.md)'s starter vocabulary plus the ones this import seeds; modifiers and triggers at run time ([S05.T05](T05-continuous-modifiers-and-triggers.md)); evidence ([S05.T12](T12-evidence-and-coverage-metrics.md)); scenarios ([S05.T11](T11-legacy-tests-to-scenarios.md)); `generated_cards/` and anything the third-party engine implemented natively, which has no recipe to import at all.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S05.T10-01 | The exporter parses, it does not execute: `export-catalog.py` uses `ast.parse` and touches no import of `pokesearch`, `ptcg` or the database. Running it needs nothing but a Python 3 interpreter. | the script imports only `ast`, `json`, `pathlib`, `re`, `sys`; a self-check asserts `sys.modules` contains none of the legacy packages after the run | `export-catalog.spec.py > the exporter runs with the legacy package uninstalled`; a grep check over the script's imports |
| BR-S05.T10-02 | Every lambda is reduced to a stable shape key (normalized source text) and is never interpreted. A shape key with no entry in `lambda_map.json` produces a `draft` code carrying the Python source and the `.desc` string in `notes`; it never produces a condition. | the `LambdaShape` branch of the exporter and the `unmappedShapes` branch of the importer | `import-catalog.spec.ts > an unmapped lambda shape yields a draft code with the source in notes`; `> no code is written from an unmapped shape` |
| BR-S05.T10-03 | A `cardfilters` expression translates to an IR `Filter` structurally (`F.all_of`, `F.any_of`, `F.not_`, and the 29 predicates and factories) or the recipe is reported; the translator never approximates a filter. | the filter translator's exhaustive match over the `cardfilters` inventory from [S05.T03](T03-effect-ir-vocabulary.md) | `import-catalog.spec.ts > F.all_of(F.is_basic, F.hp_at_most(70)) translates to the nested IR filter`; `> an unknown filter name is reported, not dropped` |
| BR-S05.T10-04 | `approx = True` on a recipe or on one of its attacks becomes `rule_codes.status = 'approx'` with the recipe's `note` copied verbatim into `approx_note`; an entry in the `NOTES` dict is appended to `notes`. An approximation is never imported as `exact`. | the status branch of the importer; the `CHECK (status <> 'approx' OR approx_note IS NOT NULL)` on `rule_codes` ([S05.T01](T01-rules-schema-migration.md)) | `import-catalog.spec.ts > "meganium" imports as approx with its note`; `> the six NOTES entries land in notes` |
| BR-S05.T10-05 | A `PokemonRecipe` that fills none of the 13 `ABILITY_FIELDS` while its card has an ability is imported as `draft` with the note the legacy's `_declare_missing_ability` wrote, not as a complete code list. | the ability-completeness check, using `card_parts` to see whether the printing has an `ability` part | `import-catalog.spec.ts > a recipe with attacks only, on a card with an ability, leaves the ability part uncoded and reports it` |
| BR-S05.T10-06 | The import outranks [S05.T09](T09-import-attack-effects-json.md) and yields to hand-authored rows: `sourceRank` is `manual` 3 > `catalog` 2 > `twinleaf` 1 > `attack_effects` 0, and the two imports produce the same result in either order. | the shared conflict resolver in `packages/db/src/rules/import-common.ts` | `import-catalog.spec.ts > catalog wins over attack_effects for the same text`; `> running the two imports in both orders yields identical rows` |
| BR-S05.T10-07 | The import is idempotent and never overwrites an occupied slot it does not outrank: a second run on unchanged inputs writes nothing and reports zero writes. | insert-if-absent keyed on `(text_hash, ordinal)`; the input files' SHA-256 in the report | `import-catalog.spec.ts > importing twice writes nothing the second time` |
| BR-S05.T10-08 | Every recipe resolves to a `text_hash` through the printed text, never through the legacy `name_key`. A recipe whose card has several printings with different texts is reported as `ambiguous` with the candidates, and a `"name@SET-NNN"` pinned key resolves to that printing's text. | the matcher, which reads `cards` + `card_parts` and matches on `normText` | `import-catalog.spec.ts > "dunsparce" and "dunsparce@TEF-128" resolve to two different text hashes`; `> a recipe whose card has two differing texts is reported as ambiguous` |
| BR-S05.T10-09 | Every ruling comment adjacent to a recipe line is carried into `rule_codes.notes` (or `text_codes`' report entry) verbatim, in its original Portuguese, attributed to its source line. | the exporter attaches preceding `#` comment lines to the recipe node | `export-catalog.spec.py > the Rare Candy and Buddy-Buddy Poffin comments are attached to their entries`; `import-catalog.spec.ts > a recipe comment appears in notes with its source line` |
| BR-S05.T10-10 | The duplicate `alakazam` key is resolved the way Python resolves it — the later definition wins — and the fact is reported, not silently absorbed. | the exporter emits both definitions with their line numbers and marks the earlier one `shadowed` | `export-catalog.spec.py > alakazam is emitted twice with shadowed set on the first`; the report's `shadowed[]` lists it |

## Data operations

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `pokemon/src/pokesearch/sim/catalog.py`, `cardfilters.py`, `effects.py` | R | script (`export-catalog.py`) | when regenerating the seed | parsed with `ast`, never imported; the legacy tree is never written | BR-S05.T10-01 |
| `packages/db/seed/legacy/catalog_recipes.json` | C | script (`export-catalog.py`) | on demand | deterministic output (sorted keys, stable formatting) so a re-export is a clean diff | committed to git |
| `packages/db/seed/legacy/lambda_map.json` | C/U | developer | when a new lambda shape appears | hand-written; each entry reviewed; an entry is never generated | BR-S05.T10-02 |
| `effect_texts`, `card_parts`, `cards`, `attacks`, `abilities` | R | script (`rules:import-catalog`) | resolving each recipe to a `text_hash` | read-only | BR-S05.T10-08 |
| `rule_codes` | C | script | when the translation names a code that does not exist yet | insert-if-absent; the seed body comes from the translator and is reviewed in the pull request | [S05.T07](T07-rule-codes-composition-semantics.md) |
| `rule_codes` | U | script | only `notes` and `approx_note` | an import never changes `ir_body_json`, `params_schema_json` or a status set by a human | BR-S05.T10-04 |
| `text_codes` | C | script | per translated recipe | insert into free `(text_hash, ordinal)` slots; `source = 'catalog'` | BR-S05.T10-06 |
| `text_codes` | U | script | only to supersede a lower-ranked row (`twinleaf`, `attack_effects`) | the superseded row is written into the report and into `notes` first | BR-S05.T10-06 |
| `<out>/catalog-report.json` | C | script | every run, including `--dry-run` | always written | the artefact the user reads |
| `cards`, `attacks`, `abilities`, `sets` | — | this subtask | never written | the ETL owns them (D-003) | — |
| `rule_evidence` | — | this subtask | never | a recipe is an intention, not a proof (RN-63); evidence comes from scenarios | [S05.T11](T11-legacy-tests-to-scenarios.md), [S05.T12](T12-evidence-and-coverage-metrics.md) |

## Interfaces

**`scripts/rules/export-catalog.py`** → `catalog_recipes.json`, a literal transcription.

```jsonc
{
  "version": 1,
  "sourceSha256": "…",                       // of catalog.py
  "generatedAt": "2026-09-22T…Z",
  "recipes": [
    {
      "key": "buddy-buddy poffin",
      "pinnedPrinting": null,                 // "TEF-128" for "dunsparce@TEF-128"
      "line": 64,
      "shadowed": false,                      // true for the first "alakazam" (BR-S05.T10-10)
      "comments": ["o do motor punha os Pokémon no Banco por fora do redutor, e o gatilho de campo (Risky Ruins) não disparava"],
      "kind": "effect",                       // effect | tool | stadium | pokemon | energy
      "node": {
        "ctor": "SearchDeck",
        "args": [ { "ctor": "F.all_of", "args": [ { "ctor": "F.is_basic" },
                                                  { "ctor": "F.hp_at_most", "args": [ { "int": 70 } ] } ] },
                  { "int": 2 } ],
        "kwargs": { "to": { "str": "bench" } }
      },
      "note": null,
      "notesEntry": null                      // from the NOTES dict, when present
    },
    {
      "key": "brave bangle",
      "kind": "tool",
      "node": { "ctor": "ToolRecipe",
                "kwargs": { "target": { "ctor": "F.no_rule_box" },
                            "damage_plus": { "int": 30 },
                            "plus_when": { "lambdaShape": "L07", "desc": "o alvo é o Pokémon ex Ativo do oponente",
                                            "src": "def _active_ex(_s, t, _st): return F.is_ex(t) and F.on_active(t)" } } }
    }
  ],
  "lambdaShapes": { "L07": { "src": "…", "desc": "…", "occurrences": 3, "arity": 3, "kind": "pred3" } }
}
```

A lambda's **shape key** is a hash of its normalized source (whitespace collapsed, parameter names renamed positionally), so `lambda s, t, st: …` and `lambda a, b, c: …` with the same body share a key. `kind` is `pred3` (attacker, target, state), `pred1` (a card filter) or `ctx` (a `Require` predicate), which tells the map which IR shape it must produce.

**`lambda_map.json`** — the hand-written half, roughly 25 entries.

```jsonc
{
  "version": 1,
  "shapes": {
    "L07": { "desc": "o alvo é o Pokémon ex Ativo do oponente",
             "as": "cond",
             "cond": { "matches": { "of": { "active": { "of": "opponent" } }, "filter": { "tag": "ex" } } } },
    "L12": { "desc": "o atacante é do tipo Metal",
             "as": "cond", "params": ["type"],
             "cond": { "matches": { "of": "attacker", "filter": { "pokemon_type": { "param": "type" } } } } },
    "L19": { "desc": "o portador está Envenenado e o alvo é o Ativo",
             "as": "cond",
             "cond": { "all_of": [ { "has_condition": { "of": "holder", "condition": "poisoned" } },
                                   { "matches": { "of": "target", "filter": { "on_active": true } } } ] } },
    "L24": { "desc": "o oponente tem carta com \"Colress\" no nome no descarte",
             "as": "cond",
             "cond": { "exists": { "of": { "zone": { "of": "opponent", "zone": "discard" } },
                                   "filter": { "name_contains": "colress" } } } }
  }
}
```

A shape with `"as": "unmapped"` (or no entry at all) is what produces a `draft` code. The map is data, reviewed in a pull request; it is never written by a script.

**Recipe-kind translators**, one per legacy dataclass. Each turns the parsed node into an ordered `(code, params)` list on the recipe's `text_hash`.

| Legacy kind | Count | Target slot | Translation |
|---|---|---|---|
| bare `Effect` (Items, Supporters) | ~76 | `effect` | the effect tree flattens to an ordered code list; `Seq` becomes adjacent items; `CoinThen`, `MayDo`, `IfCan`, `ChooseOne` become `WRAP_*` items; `ForOpponent`/`EachPlayer` become the corresponding ops; a leading `Require` becomes a `RULE_REQUIRE_*` item at ordinal 0 |
| `ToolRecipe` | 30 | `modifier` + `trigger` | `hp_bonus` → `hp_max`; `retreat_delta` → `retreat_cost`; `damage_plus`/`plus_when` → `damage_out`; `damage_minus`/`minus_when` → `damage_in`; `discard_on_reduce` → a `damaged_by_attack` trigger discarding the tool; `on_damaged` → a `damaged_by_attack` trigger program; `prize_reduction` → `prize_value`; `on_ko` → a `knocked_out` trigger; `target` → the attach filter |
| `StadiumRecipe` | 26 | `modifier` + `trigger` + `effect` | `use` → an `effect` code with `once_scope = 'per_name'`; `bench_size`, `hp_delta`, `attack_cost_delta`, `counters_blocked`, `blocks_conditions`, `extra_poison`, `tools_off`, `abilities_off`, `retreat_zero`, `evolve_same_turn` → modifiers on the matching hooks; `on_bench_placed` → an `enter_bench` trigger; `neutral` → a note only |
| `PokemonRecipe` | 106 | all four | `ability` → an `effect` code on the ability part with `once_scope` from `_limit_per_name`; `on_play`/`on_evolve` → `play_from_hand`/`evolve` triggers; `damage_plus`/`damage_minus`/`prevent_when` (+ the three `*_self_only` flags) → modifiers with `scope`; `no_stack` → `no_stack_key`; `checkup_counters`, `weakness_override`, `retreat_zero`, `locks_counter_move`, `prevents_effects` → modifiers; `attacks{}` → attack-field and effect codes on each attack's own text; `alt_cost` → `cost_alt`; `attack_twice_when` → a `grant_attacks`-adjacent modifier, reported if [S04.T05](../04-game-engine-core/T05-actions-and-legality.md) has no equivalent |
| `EnergyRecipe` | 17 | `modifier` + `trigger` | `provides`/`provides_when` → `energy_provision`; `on_attach`/`on_attach_when` → an `attach_energy` trigger; `hp_bonus`, `retreat_zero_when`, `damage_plus`, `prevent_when`, `blocks_conditions_when`, `prevents_effects_when`, `prize_reduction` → modifiers; `discard_end_of_turn` → `end_of_turn_discard`; `reattach_after_attack` → a `attack_used` trigger; `target` → the attach filter |

The `PokemonRecipe` row is where the value is: 106 of the 255 recipes, and they carry the abilities the classified-attack import cannot reach at all.

**CLI.**

```
python scripts/rules/export-catalog.py --catalog <path/to/catalog.py> --out packages/db/seed/legacy/catalog_recipes.json
pnpm rules:import-catalog [--recipes <path>] [--map <path>] [--dry-run] [--report <path>] [--json]
```

Exporter exit codes: 0 ok, 1 a construct the walker does not recognise (reported with its line), 2 the file is unreadable. Importer exit codes: 0 ok, 1 unmapped shapes or unmatched recipes exist, 2 an input is unreadable, 3 `lambda_map.json` references a shape the recipes file does not contain.

**Report** (`catalog-report.json`): `{ recipesSha256, mapSha256, ranAt, dryRun, recipes: 255, byKind: {…}, matched, ambiguous, unmatched, written: { ruleCodes, textCodes }, drafts, perRecipe: [{ key, line, textHash|null, kind, codes: [{ ordinal, code, params }], status, reason?, comments: [] }], unmappedShapes: [{ shape, src, desc, occurrences, recipes: [] }], unknownFilters: [], abilityGaps: [], shadowed: [], conflicts: [], pinnedResolved: [] }`.

## Implementation steps

1. Write `export-catalog.py`: walk the module, collect the `CATALOG` literal and the four `CATALOG.update({…})` calls, transcribe each value as a constructor tree, attach preceding comments, and record line numbers and the `shadowed` flag. Spec it on a three-recipe fixture module.
2. Add the lambda shape extractor (module-level helpers with `.desc`, inline `F.named(lambda …)`, bare lambdas in `plus_when`/`minus_when`/`prevent_when`/`ability_when`/`nothing_unless`/`alt_cost`) and the `lambdaShapes` section; run it on the real file and record how many distinct shapes there are.
3. Run the exporter on the real `catalog.py`, commit `catalog_recipes.json`, and confirm the counts (255 distinct keys, 106/30/26/17 typed recipes, 6 `NOTES` entries, one shadowed key).
4. Write the filter translator (`cardfilters` expression → IR `Filter`) with the exhaustive match and the `unknownFilters` branch; spec `F.all_of(F.is_basic, F.hp_at_most(70))` and `F.any_of(F.pokemon_type("fighting"), F.basic_energy_of("fighting"))`.
5. Write `lambda_map.json` by reading each distinct shape once and mapping it, leaving genuinely opaque ones unmapped; this is the one human-hours step and it is bounded by the shape count from step 2.
6. Write the bare-`Effect` translator (Items and Supporters) with the wrapper mapping; spec Nest Ball, Gwynn, Iono, Judge and Escape Rope.
7. Write the `ToolRecipe` and `EnergyRecipe` translators; spec Brave Bangle, Babiri Berry, Lucky Helmet, Growing Grass Energy and Ignition Energy.
8. Write the `StadiumRecipe` translator; spec Area Zero Underdepths, Jamming Tower, Risky Ruins and Prism Tower.
9. Write the `PokemonRecipe` translator, including the ability-completeness check and the per-attack path; spec Munkidori, Fezandipiti ex, Dudunsparce, Banette and Dhelmise.
10. Add the shared conflict resolver and the `sourceRank`; spec both orders against [S05.T09](T09-import-attack-effects-json.md).
11. Write the report, `--dry-run` and the exit codes; wire `pnpm rules:import-catalog`.
12. Run the real import, record the numbers, compose every touched text (zero `CompositionError`), and run `pnpm rules:export` ([S05.T15](T15-rules-export-import-seed.md)) so the result is a reviewable diff.

## Edge cases and error handling

- **A lambda with no mapping.** The surrounding recipe still imports; the conditional part becomes a `draft` code whose `notes` carry the Python source and the `.desc` string. Kyurem's `alt_cost` condition (*"o oponente tem carta com 'Colress' no nome no descarte"*) is a good example of one that maps cleanly; a bare `lambda ctx: …` with no `.desc` is one that will not.
- **A filter the translator does not know.** Reported in `unknownFilters` and the recipe is skipped, not approximated. `cardfilters` is a closed set of 29 predicates and factories plus three combinators, so this should only fire on a hand-edited file — but a dropped filter silently widens a search, which is the worst kind of wrong.
- **A recipe whose card has two printings with different texts.** Reported as `ambiguous` with both hashes and their meta copies; nothing is written. The legacy's answer was `"name@SET-NNN"`, and where the file already uses it the importer resolves it to that printing.
- **`"dunsparce"` and `"dunsparce@TEF-128"`.** Two recipes, two text hashes, both imported. The report's `pinnedResolved` records that the pinning was needed once, which is the measurable payoff of RN-05.
- **The duplicate `alakazam` key.** Python keeps the later definition (L309, with `on_evolve` *and* the `Powerful Hand` attack recipe); the earlier one (L274, `on_evolve` only) is shadowed. Both are exported, the first with `shadowed: true`, and only the later one is imported. Reported so it is a fact rather than a coincidence.
- **A `PokemonRecipe` with attacks and no ability field, on a card that has an ability.** The attack texts get their codes; the ability text is left uncoded and listed under `abilityGaps`. The legacy found 54 such cards, 0.95 % of the meta, and marked the whole card approximate; here only the ability part is uncovered, which is both more accurate and more actionable.
- **`approx = True` on one attack of a multi-attack recipe.** Only that attack's text gets `status = 'approx'` with its note; the other attack's text is unaffected. Per-text status is the whole point of keying on texts.
- **A recipe for a card the third-party engine implemented natively.** `register_all` skipped those (`if name in engine_names … continue`), so the recipe was a reserve that never ran — Nest Ball, Professor's Research, Iono, Boss's Orders, Night Stretcher, Super Rod, Energy Retrieval, Arven and Lillie's Determination are all marked as such in the file. Here there is no third-party engine, so those reserves become the primary implementation, which is a direct answer to the ~100 cards that had no recipe to import. They are flagged in the report as `wasReserve` because they have never actually run.
- **A `StadiumRecipe` with `neutral = True`** (Academy at Night). The flag was a hint for the legacy's stall detector, not behaviour. It is carried into `notes` and mapped to nothing; the stall rule belongs to [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md).
- **`attack_twice_when`** (Dipplin, Goldeen, Seaking with Festival Grounds). There may be no equivalent hook in [S04.T05](../04-game-engine-core/T05-actions-and-legality.md). Reported rather than approximated; if the hook is missing, the three recipes land as `draft` with the condition in `notes`.
- **The exporter meets a construct it does not recognise** — a new helper function, a comprehension. Exit 1 with the line number. The walker covers constructor calls, attribute access, literals, lambdas and names; anything else is a deliberate stop, because guessing at Python is how a recipe silently changes meaning.

## Acceptance / verification

- [ ] `python scripts/rules/export-catalog.py --catalog <legacy>/src/pokesearch/sim/catalog.py --out packages/db/seed/legacy/catalog_recipes.json` exits 0 and emits 255 distinct keys — 106 `PokemonRecipe`, 30 `ToolRecipe`, 26 `StadiumRecipe`, 17 `EnergyRecipe` and the rest bare `Effect` — with one `shadowed` entry (`alakazam`) and the 6 `NOTES` entries attached (BR-S05.T10-10).
- [ ] `export-catalog.spec.py > the exporter runs with the legacy package uninstalled` and `> the Rare Candy and Buddy-Buddy Poffin comments are attached to their entries` (BR-S05.T10-01, -09).
- [ ] `pnpm rules:import-catalog --dry-run --json` reports **≥ 220 of 255 recipes producing a non-draft code list**, with the remainder listed under `unmappedShapes`, `unknownFilters`, `ambiguous`, `unmatched` or `abilityGaps`, each with a reason.
- [ ] `import-catalog.spec.ts > F.all_of(F.is_basic, F.hp_at_most(70)) translates to the nested IR filter` and `> an unknown filter name is reported, not dropped` (BR-S05.T10-03).
- [ ] `import-catalog.spec.ts > an unmapped lambda shape yields a draft code with the source in notes` and the real run's `unmappedShapes` lists every unmapped shape with its occurrence count (BR-S05.T10-02).
- [ ] `import-catalog.spec.ts > "meganium" imports as approx with its note` (*"energia de Grama valendo por duas não modelada"*) and the six `NOTES` entries appear in `notes` (BR-S05.T10-04).
- [ ] `import-catalog.spec.ts > "dunsparce" and "dunsparce@TEF-128" resolve to two different text hashes` and the report's `pinnedResolved` names the pinning (BR-S05.T10-08).
- [ ] `import-catalog.spec.ts > catalog wins over attack_effects for the same text` and `> running the two imports in both orders yields identical rows` (BR-S05.T10-06).
- [ ] `import-catalog.spec.ts > a recipe with attacks only, on a card with an ability, leaves the ability part uncoded and reports it`; the real run's `abilityGaps` count is recorded and compared with the legacy's 54 (BR-S05.T10-05).
- [ ] `import-catalog.spec.ts > importing twice writes nothing the second time` (BR-S05.T10-07).
- [ ] After the real run, `composeProgram` succeeds for every text this import touched — zero `CompositionError` — and `pnpm rules:export` produces a reviewable diff (step 12).

## Risks and open questions

- **Risk — the lambda map is the bottleneck and is done badly under time pressure.** A wrong condition is a card that behaves wrongly with an `exact`-looking code. Mitigation: every shape is reviewed once, the `.desc` string written by the original author is right there, the entry count is bounded (~25) and known after step 2, and an unmapped shape degrades to `draft` rather than to a guess.
- **Risk — the translators silently lose a keyword argument.** `ToolRecipe` alone has 13 fields and `PokemonRecipe` has 26. Mitigation: each translator is written against the dataclass field list as a data file, and a test asserts that every field is either mapped or explicitly listed as ignored with a reason (`approx`, `note`, `neutral`, `ability_name`). An unlisted field fails the test.
- **Risk — the exporter and the file drift** if the legacy tree is edited. Mitigation: `sourceSha256` is recorded in `catalog_recipes.json` and the importer reports when it differs from the file it can see; the seed file is committed, so the import works without the legacy tree at all.
- **Risk — the reserve recipes have never run.** Nest Ball, Iono, Boss's Orders, Professor's Research and the rest were written as backups behind the third-party engine's own implementations and were never exercised by a test. Mitigation: they are flagged `wasReserve` in the report, and [S05.T11](T11-legacy-tests-to-scenarios.md)'s converted tests are the first thing that will exercise them.
- **Question (D-004 semantics) — should a `PokemonRecipe`'s passive modifier be a code on the *ability* text or on the Pokémon?** On the ability text, per [S05.T05](T05-continuous-modifiers-and-triggers.md)'s decision. A Pokémon with a passive ability and no ability text in the source (there are a few, where the behaviour comes from a rule box) has nowhere to put it; those are reported rather than forced. The user confirms.
- **Question — should the import create `rule_codes` rows at all, or only `text_codes`?** It creates them when the translation needs a code that does not exist, because the alternative is 255 recipes that cannot be written down. Every created code is `draft` and appears in the pull request diff through [S05.T15](T15-rules-export-import-seed.md). Recommendation: keep it, and review the created codes as a batch before merging.

## References

- `pokemon/src/pokesearch/sim/catalog.py` — verified by direct reading: the module docstring (*"name_key -> receita (composição das primitivas de sim/effects.py)"*, the runtime class generation, the rule that engine-implemented cards are never overwritten); 255 distinct keys across one literal and four `CATALOG.update` blocks, with `alakazam` defined twice (L274, L309); 106 `PokemonRecipe`, 30 `ToolRecipe`, 26 `StadiumRecipe`, 17 `EnergyRecipe`; the `NOTES` dict (6 entries) at L505–512; `_with_attack_recipes` (L516–539) with the hand-written-wins comment; `register_all` (L550–619) with the engine and AI-generated skip lists and the `"name@SET-NNN"` handling; `_wrap_reprints` (L622–640); `_declare_missing_ability` (L643–653) with the 54-cards / 0.95 %-of-meta note; the ruling comments on Rare Candy (L60), Buddy-Buddy Poffin (L63), Ciphermaniac's Codebreaking (L65), Munkidori (L247), Fezandipiti ex (L251–252), Dunsparce (L255–256), Dudunsparce (L260) and Dedenne (L262). Consult for every translator and for the comments carried into `notes`.
- `pokemon/src/pokesearch/sim/effects.py` L1528–1701 — verified: the five recipe dataclasses with their full field lists (`AttackRecipe` 15 fields, `ToolRecipe` 13, `PokemonRecipe` 26, `EnergyRecipe` 21, `StadiumRecipe` 20) and `ABILITY_FIELDS` (13 names). Consult for the translator field maps and for the ability-completeness check.
- `pokemon/src/pokesearch/sim/cardfilters.py` — verified: 29 filter predicates and factories, the three combinators `all_of`/`any_of`/`not_`, the `named()` helper that attaches `.desc`, and `describe()`'s fallback *"condição escrita em código (ver sim/catalog.py)"* for an anonymous lambda. Consult for the filter translator's exhaustive match and for why lambdas need a hand-written map.
- `pokemon/src/pokesearch/sim/catalog.py` L135–145 and L465–468 — verified: the module-level lambda helpers `_active_ex` (with its `.desc`), `_attacker_type(*types)` returning a `F.named` closure, `_bench_no_rule_box`, `_holder_is(f)`, `_festival_grounds`. Consult for the shape-key extractor and for the four representative entries of `lambda_map.json`.
- [S05.T07](T07-rule-codes-composition-semantics.md) — the composition contract, the wrapper semantics the `CoinThen`/`MayDo`/`IfCan`/`ChooseOne` mapping targets, and the `sourceRank` ordering; [S05.T05](T05-continuous-modifiers-and-triggers.md) — the hooks and trigger events the four typed recipes translate into; [S05.T09](T09-import-attack-effects-json.md) — the lower-ranked import this one supersedes.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
