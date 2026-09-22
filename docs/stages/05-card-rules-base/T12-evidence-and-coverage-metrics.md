# S05.T12 — Evidence recording and coverage metrics

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 12 / 16 |
| Depends on | [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S05.T01](T01-rules-schema-migration.md), [S05.T11](T11-legacy-tests-to-scenarios.md) |
| Unblocks | [S05.T13](T13-rules-editor-ui.md), [S05.T14](T14-coverage-page-and-authoring-queue.md), [S05.T16](T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md), [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md) |
| Parallel with | [S05.T08](T08-spreadsheet-import.md), [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T15](T15-rules-export-import-seed.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `cardUsage` denominator (meta copies over the RN-03 window) — from [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)
- `module` worker (job kind `scenarios`) — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `table` `rule_evidence`, view `card_status` — from [S05.T01](T01-rules-schema-migration.md)
- `file` scenarios — from [S05.T11](T11-legacy-tests-to-scenarios.md)

## Outputs (proposed)
- `module` worker kind `scenarios` → `rule_evidence` rows `(text_hash, code, kind: scenario, ref: scenario id, passed, engine_build, rules_snapshot)`; `attr_only` evidence for parts without text; `builtin` evidence when the builtin's scenario passes — consumed by [S05.T13](T13-rules-editor-ui.md), [S05.T14](T14-coverage-page-and-authoring-queue.md), [S05.T16](T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md), [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md)
- `module` `apps/api/src/rules/coverage.ts` — `coverage(db, format, days) → { exact, proven, byKind: { scenario, twinleaf_diff, attr_only, builtin }, byCard: [...] }` weighted by meta copies (Basic Energy counted, as the legacy did: 12.6 points of the denominator); `GET /api/rules/coverage`; `user_deck_versions.coverage_exact/proven` filled on version creation

## Initial objective
Two honest numbers, always together: how much of the played meta the engine *claims* to model exactly and how much of that is *proven* by passing evidence on the current engine build (RN-70) — the metric that guards against the coverage regression of switching engines.

## Summary
- Evidence is per (text, code, engine build): a new build invalidates 'proven' until scenarios rerun (the worker reruns them automatically after an engine build change).
- Coverage denominator and window follow RN-03; both numbers also reported per deck version.

## Acceptance / verification
- [ ] Invariant test `0 < proven ≤ exact`; deleting a scenario's evidence row lowers `proven` only; coverage endpoint returns the split by kind.

## Notes for the elaboration pass
- Legacy reference: `sim/coverage.py` (3.5 s query over ~1M rows — precompute `cardUsage` once per window), `sim/verified.py`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
