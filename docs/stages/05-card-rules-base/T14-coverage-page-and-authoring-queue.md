# S05.T14 — Web: coverage page and authoring queue

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 14 / 16 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Unblocks | — |
| Parallel with | [S05.T13](T13-rules-editor-ui.md), [S05.T16](T16-measurement-model-and-suite-v6-freeze.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `module` coverage endpoint — from [S05.T12](T12-evidence-and-coverage-metrics.md)

## Outputs (proposed)
- `module` route `/rules/coverage` — exact × proven headline (meta copies), split by evidence kind, trend over rules snapshots, authoring queue = uncovered texts ordered by meta copies (top 200 names ≈ 93.8 % of copies), each row linking to the editor

## Initial objective
Effort goes where the meta is: the queue always shows the most-played unmodelled text first, and the two coverage numbers make progress and regressions visible.

## Summary
- First items in the queue will be the ~100 cards the legacy engine implemented natively (Ultra Ball, Boss's Orders, Night Stretcher, Dreepy line…) since they had no recipe to import.

## Acceptance / verification
- [ ] Queue order matches `cardUsage` descending; clicking a row opens the text in the editor.

## Notes for the elaboration pass
- Legacy reference: `/sim/cards` coverage dashboard.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
