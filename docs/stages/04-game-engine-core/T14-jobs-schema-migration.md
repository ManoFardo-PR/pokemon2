# S04.T14 — Jobs schema migration

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 14 / 18 |
| Depends on | [S01.T04](../01-foundation/T04-database-migration-framework.md) |
| Unblocks | [S04.T15](T15-worker-job-runner.md), [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md), [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md) |
| Parallel with | [S04.T01](T01-engine-workspace-and-crates.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` migration runner and conventions — from [S01.T04](../01-foundation/T04-database-migration-framework.md)

## Outputs (proposed)
- `file` `packages/db/migrations/0005_jobs.sql` — `jobs(id, kind, status queued|running|done|error|cancelled, params_json, progress_json, result_json, error, engine_build, rules_snapshot, workers, created_at, started_at, finished_at)`, `job_pairings(job_id, idx, deck_a_json, deck_b_json, bot_a_id, bot_b_id, seed_base, weight, label, games, wins, losses, ties, outcomes_json, avg_turns, invalid_actions, errors, fingerprint)` PK `(job_id, idx)`, `games(job_id, pairing_idx, game_idx, seed, first, winner, reason, turns, duration_us, log_blob)` — consumed by [S04.T15](T15-worker-job-runner.md), [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md), [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)

## Initial objective
Every engine invocation and its results are durable rows, so runs can be listed, resumed, compared and audited long after the process exited.

## Summary
- `games` rows exist only when `store_games` is requested; `log_blob` (compressed JSON Lines of events) only with `store_logs`.
- Indexes on `jobs(status, created_at)` and `games(job_id, pairing_idx)`.

## Acceptance / verification
- [ ] Migration applies; inserting a job with two pairings and reading them back through the typed layer works.

## Notes for the elaboration pass
- Legacy reference: tables `sim_runs`, `sim_results` in the legacy schema.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
