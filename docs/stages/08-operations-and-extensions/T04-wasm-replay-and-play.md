# S08.T04 — WASM replay and play

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 4 / 6 |
| Depends on | [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md), [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T03](T03-hosted-postgres-migration-path.md), [S08.T05](T05-twinleaf-differential-oracle.md), [S08.T06](T06-llm-assisted-authoring.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` job kind `replay` and event log format — from [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)
- `table` `games` with `log_blob` — from [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)

## Outputs (proposed)
- `module` crate `ptcg-wasm` (wasm-bindgen over `ptcg-core`): `replay(log) → states[]`, `Session::new(defs, decks, seed)` for interactive play vs a bot in the browser; web routes `/games/:id/replay` (board view, step through turns, show prompts and answers) and `/play` (human vs bot)

## Initial objective
Watching a stored game and playing against the bot in the browser, using the exact engine that produced the numbers — the best way to audit rules and bot behaviour.

## Summary
- Same crate, second target; the WASM build is already part of the [S01.T06](../01-foundation/T06-rust-toolchain-gate.md) gate.

## Acceptance / verification
- [ ] Replay of a stored game reproduces the final outcome from the log; a human can play a full game against the planner in the browser.

## Notes for the elaboration pass
- Board rendering can start as a simple list view; card images hotlinked.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
