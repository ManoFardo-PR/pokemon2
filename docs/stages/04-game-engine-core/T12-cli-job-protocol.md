# S04.T12 — CLI job protocol (JSON Lines)

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 12 / 18 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S04.T01](T01-engine-workspace-and-crates.md), [S04.T10](T10-termination-stall-and-determinism.md), [S04.T11](T11-baseline-bots-random-heuristic.md) |
| Unblocks | [S04.T15](T15-worker-job-runner.md), [S04.T18](T18-performance-baseline.md), [S06.T07](../06-bots/T07-bot-registry-and-freezing.md), [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md) |
| Parallel with | [S04.T13](T13-scenario-format-and-runner.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/jobs` placeholder + JSON Schema export — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `module` `ptcg-cli` crate + build hash — from [S04.T01](T01-engine-workspace-and-crates.md)
- `module` outcomes, RNG, fingerprint — from [S04.T10](T10-termination-stall-and-determinism.md)
- `module` bots — from [S04.T11](T11-baseline-bots-random-heuristic.md)

## Outputs (proposed)
- `contract` request line `{ type: 'job', id, contract_version, card_defs: CardDef[], programs: {}, pairings: [{ idx, deck_a: [{ def, count }], deck_b, bot_a: { name, params, seed }, bot_b, games, seed_base, weight?, label? }], options: { workers, store_games, store_logs, stall_turns: 12, max_steps: 3000, progress_every: 200 } }`; response lines `{ type: 'progress', pairing, done, total, w, l, t }`, `{ type: 'game', pairing, game_idx, seed, first, winner, reason, turns, duration_us, log? }` (optional), `{ type: 'result', pairing, games, wins, losses, ties, outcomes: { prizes, deck_out, no_pokemon, stall, step_limit }, avg_turns, invalid_actions, errors, fingerprint }`, `{ type: 'done', seconds }`, `{ type: 'error', message }`; job kinds `evaluate | scenarios | replay` — consumed by [S04.T15](T15-worker-job-runner.md), [S04.T18](T18-performance-baseline.md), [S06.T07](../06-bots/T07-bot-registry-and-freezing.md), [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)
- `module` `ptcg-cli` main loop: read stdin lines, run pairings on a `rayon` pool sized by `options.workers`, aggregate in game order, write stdout lines; `--version`

## Initial objective
The engine is a black box that reads one self-contained job and streams results, so the worker, tests and future WASM/host integrations all speak the same protocol.

## Summary
- The Rust `serde` structs are checked against the exported JSON Schema in a test.
- Unknown `contract_version` major → `error` line and exit 3.

## Acceptance / verification
- [ ] End-to-end: a job with 2 pairings × 100 games returns 2 `result` lines with fingerprints; `progress` lines appear every 200 games; malformed input yields one `error` line.

## Notes for the elaboration pass
- Legacy reference: `runner.py` (ProcessPool of 8, one task per game) — here one process, rayon threads, one task per game.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
