# S04.T13 — Scenario format and runner

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 13 / 18 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S04.T07](T07-damage-pipeline.md), [S04.T08](T08-special-conditions-and-checkup.md), [S04.T09](T09-prompt-protocol.md) |
| Unblocks | [S05.T11](../05-card-rules-base/T11-legacy-tests-to-scenarios.md), [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md) |
| Parallel with | [S04.T12](T12-cli-job-protocol.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/scenario` placeholder — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `module` damage calc observables — from [S04.T07](T07-damage-pipeline.md)
- `module` conditions/checkup — from [S04.T08](T08-special-conditions-and-checkup.md)
- `contract` prompts and answers — from [S04.T09](T09-prompt-protocol.md)

## Outputs (proposed)
- `contract` scenario JSON `{ id, title, verifies: ['text:<hash>' | 'rule:<name>'], source, setup: { turn, p1: { active: { card, energies, damage?, conditions? }, bench: [...], hand: [...], deck: [...], prizes: n, discard: [...] }, p2: {...}, stadium? }, steps: [ { action }, { answer: { purpose, pick } }, { expect: { damage_calc | zone_contains | counters | conditions | prizes | legal_actions_include | prompt_pending | outcome } }, { checkup } ] }` — consumed by [S05.T11](../05-card-rules-base/T11-legacy-tests-to-scenarios.md), [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md)
- `module` `ptcg-core::scenario` runner used by `cargo test` (every `engine/scenarios/**/*.json`) and by the CLI job kind `scenarios` (emits pass/fail + diff per scenario)
- `file` `engine/scenarios/rules/*.json` — the rulebook fixes: evolve keeps damage; only the starter skips the first attack; the starter draws on turn 1; tool persists after evolving; benching a Basic fires field triggers; a card returned to hand cannot evolve the turn it is replayed; nobody evolves on their own first turn (RN-11)

## Initial objective
Rules and card behaviours are asserted by data files that cite their source, runnable by the engine test suite and by the worker, so evidence for 'proven coverage' is produced by the same mechanism as the engine's own tests.

## Summary
- Card references in scenarios use printing ids (`sv4pt5-54`) resolved through `card_defs` supplied with the job.
- Runner reports the first failing step with the expected vs actual JSON.

## Acceptance / verification
- [ ] All `rules/*.json` pass; a deliberately wrong expectation fails with a readable diff.

## Notes for the elaboration pass
- Legacy reference: `tests/test_rules.py` (rulebook citations), `sim/testkit/__init__.py` helpers (`make_state`, `drive_choices`) that map to `setup`/`answer` steps.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
