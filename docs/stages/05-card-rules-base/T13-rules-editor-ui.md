# S05.T13 — Web: rules editor

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 13 / 16 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Unblocks | [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md) |
| Parallel with | [S05.T14](T14-coverage-page-and-authoring-queue.md), [S05.T16](T16-measurement-model-and-suite-v6-freeze.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `contract` codes/params composition, `GET /api/rules/programs/:hash`, `validateParams` — from [S05.T07](T07-rule-codes-composition-semantics.md)
- `module` evidence and coverage endpoints — from [S05.T12](T12-evidence-and-coverage-metrics.md)

## Outputs (proposed)
- `module` routes `/rules`, `/rules/texts/:hash`, `/rules/codes/:code` — official text with sentence boundaries beside the ordered code list (add/reorder/remove, params form generated from `params_schema_json`), compiled IR preview and the prompts it would open, status controls, evidence list (green/red per scenario, engine build), lint warnings, list of cards sharing the text; code page: pattern, params schema, IR body editor with schema validation, usages — consumed by [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md)
- `contract` API `PUT /api/rules/texts/:hash/codes`, `PUT /api/rules/codes/:code`, `POST /api/rules/scenarios/run?text=`

## Initial objective
Authoring a card's behaviour is a form over data, with the official text, the proof status and the affected cards always in view — no code editing, no redeploy.

## Summary
- Lint warnings (from legacy lint rules): coin mentioned but no `coin_then`; energy type in text but not in params; 'you may' without `may`; ability present but no ability code; attack with text but no codes.
- Every save recomputes `rules_snapshot` and marks dependent evidence stale.

## Acceptance / verification
- [ ] Author a new text end-to-end: add two codes, run its scenario from the page, see evidence turn green.

## Notes for the elaboration pass
- Legacy reference: `/sim/card/{id}` and `/sim/audit` screens; `sim/lint.py` rules.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
