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

## Outputs (proposed)
- `doc` `docs/rules/CODES.md` — the authoring contract: a text = ordered `(code, params)` items; each code body is an IR fragment; fragments of one text are concatenated into one program with shared locals; a code may span several sentences (`sentence_from..sentence_to`) or be a *wrapper* (`coin_then`, `may`, `if`) that applies to the next item; `params_json` must validate against `params_schema_json`; attack-level fields (`plus`, `nothing_unless`, …) come from codes flagged `category = attack_modifier`; once-per-turn scope declared per ability code (RN-16) — consumed by [S05.T08](T08-spreadsheet-import.md), [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T13](T13-rules-editor-ui.md), [S05.T15](T15-rules-export-import-seed.md), [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md)
- `module` `packages/db/src/rules/compose.ts` — `composeProgram(textHash) → ProgramJson` and `rulesSnapshot(db) → sha256` over all active code bodies + text_codes; `validateParams(code, params)`; `apps/api` route `GET /api/rules/programs/:textHash` — consumed by the same subtasks
- `contract` code naming: `UPPER_SNAKE` verbs + object, e.g. `DRAW_N`, `SEARCH_DECK_FILTER_TO_HAND`, `DMG_PLUS_IF_TARGET_TAG`, `COND_APPLY_OPPONENT_ACTIVE`, `WRAP_COIN_THEN`

## Initial objective
The user's authoring model — one code per sentence, parameters per card — is precisely defined so that a text's meaning is the deterministic composition of its codes, and the engine receives one compiled program per text without knowing about sentences.

## Summary
- The rules snapshot hash is what suites and measurements record (RN-40 extension).
- A code with `status = draft` compiles but marks the card as not exact; `approx` executes a documented approximation.

## Acceptance / verification
- [ ] Compose 'Discard 2 cards from your hand. Then draw 3 cards for each card you discarded.' as `DISCARD_HAND_N{n:2}` + `DRAW_PER_DISCARDED{n:3}` → one program whose scenario passes.
- [ ] Params failing the schema are rejected by the API with the field name.

## Notes for the elaboration pass
- This is the design centre of D-004; review it with the user before importing the spreadsheet ([S05.T08](T08-spreadsheet-import.md)).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
