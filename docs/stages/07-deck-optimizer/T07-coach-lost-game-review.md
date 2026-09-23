# S07.T07 — Coach: lost-game review (optional LLM)

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 7 / 7 |
| Depends on | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md), [S07.T05](T05-optimize-job-orchestration.md) |
| Unblocks | — |
| Parallel with | [S07.T06](T06-web-optimizer-page.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `games.log_blob` (event logs with decision margins) — from [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)
- `module` optimize/evaluate jobs with `store_logs` — from [S07.T05](T05-optimize-job-orchestration.md)
- `doc` ESPECIFICACAO.md RN-60, RN-63, RN-65, RN-66

## Outputs (proposed)
- `module` `apps/worker/src/coach/` — select lost games of the worst matchup, pick ≤ 6 critical moments per game by decision margin, present only what the player saw, ask an LLM (Anthropic or OpenAI-compatible, optional) for a closed-vocabulary verdict `{ agree|disagree, better_action_index, category, reason }`, reject verdicts naming non-existent actions; store as hypotheses to measure on the suite — never applied automatically

## Initial objective
A review tool for humans: where did the bot (or the list) lose the game, phrased as testable hypotheses — with the LLM strictly off the critical path.

## Summary
- Runs only with an API key configured; everything else works without it (RN-60).
- Hypotheses confirmed on the suite become bot or list changes through the normal subtasks.

## Acceptance / verification
- [ ] With a stub LLM, 12 lost games → ≤ 72 moments → verdict rows stored; with no key, the feature is hidden and jobs unaffected.

## Notes for the elaboration pass
- Legacy reference: `sim/coach.py`, `benchmarks/COACH.md` (opinions ≠ gains).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
