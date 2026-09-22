# S04.T17 — Web: Evaluate page

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 17 / 18 |
| Depends on | [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md), [S04.T16](T16-api-jobs-and-sse.md) |
| Unblocks | [S07.T06](../07-deck-optimizer/T06-web-optimizer-page.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` meta queries (archetype shares for opponent weights, representative decks) — from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)
- `module` deck builder route and 'evaluate' placeholder button — from [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)
- `contract` job endpoints + SSE — from [S04.T16](T16-api-jobs-and-sse.md)

## Outputs (proposed)
- `module` route `/evaluate/:deckId` — opponent panel (top-N archetypes by share in the window with derived weights, manual fixed weights `id=0.3`, exclusions, representative deck link), mode `rápido` (≈ 200 games/opponent) / `longo` (≈ 1,000), bot choice, start → live progress per opponent → result: weighted score with 95 % CI (Wilson, tie = 0.5, RN-45), per-opponent W/L/T, win %, avg turns, end reasons, engine build; history of evaluations for the deck — consumed by [S07.T06](../07-deck-optimizer/T06-web-optimizer-page.md)
- `module` `apps/api/src/stats/wilson.ts` — `wilson(successes, n, z = 1.96)`; `weightedScore(perOpponent)` with the delta-method CI

## Initial objective
The user picks a deck version and sees, in minutes, how it fares against the weighted field — the first time the new engine produces a number a player can act on.

## Summary
- Opponent weights default to normalized archetype shares (RN-03 window); fixed weights and exclusions are stored with the job params for reproducibility.
- Scores are labelled with the engine build and, later, the rules snapshot; different builds are not compared silently.

## Acceptance / verification
- [ ] Evaluate a fixture deck vs 3 opponents in fast mode: progress bars move, final score and CI shown, results persisted and reloadable.

## Notes for the elaboration pass
- Legacy reference: `templates/sim_project.html`, `sim_run.html`; `runner.py::wilson`; `progress.py::_weighted`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
