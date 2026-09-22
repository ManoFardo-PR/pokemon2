# S06.T03 — Planner bot: turn policy

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 3 / 8 |
| Depends on | [S04.T05](../04-game-engine-core/T05-actions-and-legality.md), [S06.T01](T01-honest-information-view.md), [S06.T02](T02-deck-profile-analysis.md) |
| Unblocks | [S06.T04](T04-need-scoring-and-prompt-resolvers.md), [S06.T05](T05-rollout-bot.md) |
| Parallel with | [S06.T08](T08-measurement-score-and-mirror.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` legal actions — from [S04.T05](../04-game-engine-core/T05-actions-and-legality.md)
- `module` `PlayerView` — from [S06.T01](T01-honest-information-view.md)
- `module` `Profile` — from [S06.T02](T02-deck-profile-analysis.md)
- `doc` ESPECIFICACAO.md RN-32..RN-35

## Outputs (proposed)
- `module` `ptcg-core::bots::planner::PlannerBot` (v1) — fixed phase order: win-now attack → bench Basics (main line first, always keep a second attacker) → evolve (main line first) → attach energy (tuple sort: useful, not fragile, on main line, reaches ≥ 60 now, stage, attacks unlocked, missing energy, HP) → stadium/tool → search items before draws → abilities → items → supporter (hand-dumpers only with ≤ 3 cards) → retreat (only if the incoming Pokémon hits ≥ max(60, 2× current)) → attack (max prizes, then max damage) → end turn; brakes `FULL_HAND = 12`, `SAFE_DECK = 7` for optional draws (RN-33); gust rule (RN-34); never promote a 2-prize Pokémon that cannot attack (RN-35) — consumed by [S06.T04](T04-need-scoring-and-prompt-resolvers.md), [S06.T05](T05-rollout-bot.md)

## Initial objective
A competent baseline that plays like a disciplined human — sets up, avoids decking out, attacks last — reproducing the legacy pilot's measured behaviour on the new engine.

## Summary
- Pure heuristics, no search; each rule cites its RN so measured regressions can be traced.
- Attack value = printed + expected bonus (no coins consumed) − target prevention, × W/R.

## Acceptance / verification
- [ ] Never returns an illegal action (property test); loss-by-deck-out rate < 5 % in mirror on suite v6 decks (legacy went 32.8 % → 3.1 %).

## Notes for the elaboration pass
- Legacy reference: `sim/pilot.py::_p` (turn order), `attack_value`, `gust_pays`; frozen snapshots `frozen/planner_v9.py` for comparison only.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
