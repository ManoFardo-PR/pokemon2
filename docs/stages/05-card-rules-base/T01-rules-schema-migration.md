# S05.T01 — Rules schema migration

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 1 / 16 |
| Depends on | [S01.T04](../01-foundation/T04-database-migration-framework.md), [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) |
| Unblocks | [S05.T02](T02-effect-texts-and-card-parts.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md) |
| Parallel with | [S05.T03](T03-effect-ir-vocabulary.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` migration runner and conventions — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `table` `cards`, `attacks`, `abilities` (foreign keys, part indexes) — from [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md)
- `decision` D-004 — codes per sentence, params per card — from `project/02-decision-log.md`

## Outputs (proposed)
- `file` `packages/db/migrations/0006_rules.sql` — `effect_texts(text_hash PK, kind ability|attack|trainer|energy|rule_box, name, text)`; `card_parts(card_id, part_kind, part_idx, text_hash)` PK `(card_id, part_kind, part_idx)`; `rule_codes(code PK, pattern, params_schema_json, category, ir_body_json, status draft|exact|approx|builtin|unimplemented, approx_note, notes, updated_at)`; `text_codes(text_hash, ordinal, code, params_json, sentence_from, sentence_to)` PK `(text_hash, ordinal)`; `text_sentences(text_hash, ordinal, sentence, classification_json)` PK `(text_hash, ordinal)`; `card_overrides(card_id, field, value_json, reason)` PK `(card_id, field)`; `rule_scenarios(id PK, title, scenario_json, verifies_json, source, updated_at)`; `rule_evidence(id, text_hash, code, kind scenario|twinleaf_diff|attr_only|builtin, ref, passed, engine_build, rules_snapshot, run_at)` insert-only; view `card_status(card_id, exact, proven, missing_codes, unproven_codes)` — consumed by [S05.T02](T02-effect-texts-and-card-parts.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md)
- `table` indexes: `card_parts(text_hash)`, `text_codes(code)`, `rule_evidence(text_hash, passed)`, `rule_evidence(code, engine_build)`

## Initial objective
The rules base has one home with a clear separation between what a text *is* (sentences), what it *means* (codes + params), how a code *executes* (IR body or builtin) and what has been *proven* (evidence) — replacing the legacy's three divergent notions of 'correct'.

## Summary
- `card_status.exact` = every part with text has all its `text_codes` pointing at codes with status `exact` or `builtin` (parts without text are exact by construction); `proven` = exact and every code of the card has a `passed` evidence row for the current `engine_build`.
- `rule_evidence` has no UPDATE/DELETE path in the application (RN-64): opinions and audits never alter behaviour, they only add rows.
- Postgres notes: `*_json` → `jsonb`, partial indexes fine, view identical.

## Acceptance / verification
- [ ] Migration applies; a fixture text with two codes and one passing evidence row yields `exact = 1, proven = 1` in the view; removing the evidence flips `proven`.

## Notes for the elaboration pass
- Legacy reference: tables `card_impl`, `card_audit` and files `verified_cards.json`, `engine_fixes.json` — all folded into this model (see `project/04-data-model-overview.md`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
