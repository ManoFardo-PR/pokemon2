# S05.T16 — Measurement model and benchmark suite v6 freeze

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 16 / 16 |
| Depends on | [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Unblocks | [S06.T07](../06-bots/T07-bot-registry-and-freezing.md), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) |
| Parallel with | [S05.T13](T13-rules-editor-ui.md), [S05.T14](T14-coverage-page-and-authoring-queue.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` meta queries (archetype shares → weights, representative decks) — from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)
- `module` heuristic bot (first frozen opponent) — from [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md)
- `module` worker (`evaluate` job kind, `engine_build`) — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `module` `rulesSnapshot`, coverage per deck — from [S05.T12](T12-evidence-and-coverage-metrics.md)

## Outputs (proposed)
- `file` `packages/db/migrations/0007_measurement.sql` — `bots(id, name UNIQUE, kind, code_hash, params_json, frozen, created_at, note)`, `suites(id, version UNIQUE, name, frozen_at, seed0, deck_version_id, opponent_bot_id, rules_snapshot, engine_build, note)`, `suite_opponents(suite_id, idx, archetype_id, deck_id, weight, share, list_json)`, `measurements(id, suite_id, bot_id, job_id, engine_build, rules_snapshot, git_commit, games, score, ci_low, ci_high, mirror_games, mirror_rate, mirror_ci_low, mirror_ci_high, outcomes_json, avg_turns, note, measured_at)`, `measurement_opponents(measurement_id, idx, games, wins, losses, ties, win_rate, avg_turns, outcomes_json)` — consumed by [S06.T07](../06-bots/T07-bot-registry-and-freezing.md), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md)
- `script` `pnpm suite:freeze --deck <versionId> --top 12 --bot heuristic` → suite v6 row with opponents, weights, seeds (`seed0`), `rules_snapshot`, `engine_build`; `pnpm suite:measure --suite 6 --bot <name>` (thin wrapper until [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) delivers the full measure job)

## Initial objective
A frozen ruler exists for the new engine (RN-40..RN-43): the evaluated deck, its 12 weighted opponents, seeds, the opponent bot, the rules snapshot and the engine build — so every future bot or rules change is measured against the same thing.

## Summary
- Suites are immutable; a change means a new version (RN-41); scores across suites are not comparable (RN-42).
- Suite v6 uses the user's deck (imported in S03) as the evaluated list, like legacy v5.

## Acceptance / verification
- [ ] Suite v6 frozen; a first measurement row written with the heuristic bot; re-running yields an identical score (same fingerprints).

## Notes for the elaboration pass
- Legacy reference: `sim/progress.py` (`freeze`, `measure`, `_seed` CRC), `benchmarks/regua_v5.json` structure.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
