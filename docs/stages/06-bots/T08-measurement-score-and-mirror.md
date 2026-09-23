# S06.T08 — Measurement job: score and mirror

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 8 / 8 |
| Depends on | [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S06.T07](T07-bot-registry-and-freezing.md) |
| Unblocks | — |
| Parallel with | [S06.T03](T03-planner-turn-policy.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` worker dispatcher — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `table` `suites`, `suite_opponents`, `measurements` — from [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)
- `module` bot registry — from [S06.T07](T07-bot-registry-and-freezing.md)
- `doc` ESPECIFICACAO.md RN-44..RN-49

## Outputs (proposed)
- `module` worker kind `measure { suiteId, botName, games, mirrorGames }` — score: for each opponent, `games` paired games with `seed_base = crc32(suite.seed0, 'score', deck_id)`; weighted score Σ weight × win rate with the delta-method 95 % CI; mirror: same list on both sides for the evaluated deck and every opponent list; writes `measurements` + `measurement_opponents` with `engine_build`, `rules_snapshot`, `git_commit` (+`+` when the tree is dirty, RN-49)
- `module` web route `/measurements` — history table per suite (score, CI, mirror, avg turns, deck-out losses, bot, build, commit, note); cross-suite comparisons are not offered (RN-42)

## Initial objective
Bot progress is measured the legacy way — fixed suite, weighted score, mirror to separate bot skill from deck quality — but on the new engine, with every input that affects the number recorded.

## Summary
- Ties count 0.5 (RN-45); mirror pairs alternate sides per game.
- Differences under ~3 points at 1,200 games are noise (RN-48): the page shows the CI, not just the point estimate.

## Acceptance / verification
- [ ] Measure heuristic and `planner_rs_v1` on suite v6: two rows with CIs; repeated measurement of the same bot gives identical score and fingerprints.

## Notes for the elaboration pass
- Legacy reference: `sim/progress.py` (`measure`, `_weighted`, `append_history`), `benchmarks/HISTORICO.md`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
