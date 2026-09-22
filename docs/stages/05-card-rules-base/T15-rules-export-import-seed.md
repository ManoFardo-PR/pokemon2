# S05.T15 — Rules export/import (versioned seed)

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 15 / 16 |
| Depends on | [S05.T01](T01-rules-schema-migration.md), [S05.T07](T07-rule-codes-composition-semantics.md) |
| Unblocks | — |
| Parallel with | [S05.T08](T08-spreadsheet-import.md), [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` rules tables — from [S05.T01](T01-rules-schema-migration.md)
- `module` `rulesSnapshot` — from [S05.T07](T07-rule-codes-composition-semantics.md)

## Outputs (proposed)
- `script` `pnpm rules:export` → `packages/db/seed/rules/{codes.json, text_codes/<xx>.json, sentences/<xx>.json, overrides.json}` (sharded by hash prefix, sorted, stable formatting) and `pnpm rules:import` (upsert; `--replace` to mirror exactly); `engine/scenarios/` stays the source for scenarios

## Initial objective
The rules base lives in git as well as in the database: every change is diffable and reviewable, and a fresh database can be rebuilt from the repository plus the ETL.

## Summary
- Export runs in `pnpm check` to catch un-exported edits (fails when the DB differs from the seed and `--allow-dirty` is not set).

## Acceptance / verification
- [ ] Export → wipe rules tables → import → identical `rulesSnapshot`.

## Notes for the elaboration pass
- Legacy analogue: `attack_effects.json`, `verified_cards.json`, `engine_fixes.json` versioned in git.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
