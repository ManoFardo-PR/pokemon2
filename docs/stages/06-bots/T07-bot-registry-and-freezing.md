# S06.T07 — Bot registry and freezing

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 7 / 8 |
| Depends on | [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) |
| Unblocks | [S06.T08](T08-measurement-score-and-mirror.md) |
| Parallel with | [S06.T01](T01-honest-information-view.md), [S06.T02](T02-deck-profile-analysis.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` job protocol `bot: { name, params, seed }` — from [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)
- `table` `bots` — from [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)
- `doc` ESPECIFICACAO.md RN-37

## Outputs (proposed)
- `module` `ptcg-core::bots::registry` — `name → constructor`, `--bots` listing; `bots` rows with `code_hash` = SHA-256 of the bot's source file(s); `frozen = 1` bots are copied to `engine/ptcg-core/src/bots/frozen/<name>.rs` and a test fails if the hash changes; naming `planner_rs_v1`, `rollout_v1`, … — consumed by [S06.T08](T08-measurement-score-and-mirror.md)

## Initial objective
A bot used as a suite opponent can never drift: its code is frozen by hash and by copy, and every job names bots exactly.

## Summary
- Unfrozen bots evolve in place; freezing happens when a bot becomes a suite opponent (RN-43: every 3 improvement rounds).

## Acceptance / verification
- [ ] Editing a frozen bot file fails `cargo test`; `--bots` lists all registered bots with hashes matching the DB.

## Notes for the elaboration pass
- Legacy reference: `sim/frozen/` ('NEVER edit') and `policies.py::POLICIES`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
