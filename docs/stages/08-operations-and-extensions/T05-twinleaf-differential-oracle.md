# S08.T05 — Twinleaf differential oracle

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 5 / 6 |
| Depends on | [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T03](T03-hosted-postgres-migration-path.md), [S08.T04](T04-wasm-replay-and-play.md), [S08.T06](T06-llm-assisted-authoring.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` scenario format — from [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)
- `module` evidence recording (`kind = twinleaf_diff`) — from [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)
- `external` local clone of `the-epsd/twinleafgg` at `C:\tmp\tw` (MIT; `ptcg-server/src/game/store`, 10,316 card files incl. 2,023 SV/ME)

## Outputs (proposed)
- `module` `tools/twinleaf-oracle/` — TypeScript harness compiling only the store, translating a scenario's setup/steps into Twinleaf store actions/prompt answers, comparing observable outcomes (zones, damage, conditions, prizes); agreement → `rule_evidence` rows of kind `twinleaf_diff` referencing the Twinleaf commit; disagreement → report for human ruling

## Initial objective
A second, independently written implementation of the same cards becomes a source of evidence and a translation reference for codes, closing the gap between 'exact' and 'proven' faster than hand-written scenarios alone.

## Summary
- Twinleaf is never the batch engine (deep-clones per action, prompts as closures); it is an oracle.
- Attribution in `docs/NOTICE.md`.

## Acceptance / verification
- [ ] Top-50 meta texts compared; disagreements triaged; evidence rows present.

## Notes for the elaboration pass
- Legacy reference: `sim/twinleaf_import.py` (brace-matching TS reader, exact-printing matching) — the new harness executes the store instead of reading source text.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
