# S05.T08 — Spreadsheet import (sentences and codes)

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 8 / 16 |
| Depends on | [S05.T02](T02-effect-texts-and-card-parts.md), [S05.T07](T07-rule-codes-composition-semantics.md) |
| Unblocks | — |
| Parallel with | [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `effect_texts`, `card_parts` and `textHash` — from [S05.T02](T02-effect-texts-and-card-parts.md)
- `doc` composition contract + `validateParams` — from [S05.T07](T07-rule-codes-composition-semantics.md)
- `file` `pokemon/data/reports/cartas_standard.xlsx` (sheets: 2,950 cards × 38 columns; 13,004 rows id → texts; ~1,636 distinct sentences with 7 classification columns)

## Outputs (proposed)
- `script` `pnpm rules:import-xlsx <file>` — reads the sheets (no Excel needed; SheetJS or a zip+XML reader), links each sentence to its `text_hash` and ordinal, writes `text_sentences.classification_json` from the 7 columns, and when a column holds a code known in `rule_codes` writes `text_codes` with the parsed params; idempotent; report of unmatched sentences and unknown codes
- `doc` `docs/rules/SPREADSHEET.md` — proposed column names for the 7 classification columns: `part_kind, code, primary_op, params, condition, target, notes`, plus the sentence-splitting rules so future exports match `text_sentences` splitting

## Initial objective
The work already done in the spreadsheet lands in the rules tables without retyping, and the spreadsheet keeps being a valid authoring surface because its columns and splitting rules are aligned with the database.

## Summary
- Sentence splitting: on `.` followed by space/uppercase, keeping parenthetical sentences attached to their predecessor; abbreviations list (`ex.`, `No.`).
- The import never deletes hand-authored rows; conflicts are reported.

## Acceptance / verification
- [ ] Import of the current file: ≥ 95 % of sentences linked to an existing `text_hash`; the report lists the rest with the card ids that contain them.

## Notes for the elaboration pass
- Legacy fact: the CSV on disk was overwritten with the deduplicated sentence list (1,636 lines, naive split with truncated fragments) — read the xlsx, not the csv.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
