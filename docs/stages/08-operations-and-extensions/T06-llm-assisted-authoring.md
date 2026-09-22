# S08.T06 — LLM-assisted rule authoring (optional)

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 6 / 6 |
| Depends on | [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md), [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T03](T03-hosted-postgres-migration-path.md), [S08.T04](T04-wasm-replay-and-play.md), [S08.T05](T05-twinleaf-differential-oracle.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `doc` composition contract, code naming, `validateParams` — from [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md)
- `module` rules editor (review queue UI) — from [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md)
- `doc` ESPECIFICACAO.md RN-60, RN-61, RN-63

## Outputs (proposed)
- `module` `apps/worker/src/authoring/` — for an uncovered text: propose a code sequence with params using only existing codes (closed vocabulary, JSON schema-constrained output), validated by `validateParams`; proposals land in a review queue with `status = draft`, never active; batch mode for the authoring queue; provider abstraction (Anthropic SDK / OpenAI-compatible) with retries and rate-limit handling

## Initial objective
Speed up authoring of the long tail without letting a model's opinion become behaviour: proposals are data to review, evidence comes only from scenarios.

## Summary
- Never on the critical path (RN-60); a proposal is not evidence (RN-63); malformed proposals are rejected by schema, wrong-but-well-formed ones by review + scenarios (RN-61).

## Acceptance / verification
- [ ] With a stub provider, 20 texts → 20 draft proposals in the queue; none becomes active without a human action.

## Notes for the elaboration pass
- Legacy reference: `sim/attackgen.py` (closed-vocabulary classification), `llm/backends.py` (rate-limit handling).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
