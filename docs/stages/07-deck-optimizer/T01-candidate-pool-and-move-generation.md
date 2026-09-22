# S07.T01 — Candidate pool and move generation

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 1 / 7 |
| Depends on | [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) |
| Unblocks | [S07.T02](T02-paired-seed-screening.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `cardUsage`, archetype decks in the window — from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)
- `table` `user_deck_versions` (list, fixed concept cards, price cap) — from [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)
- `table` `card_status` (exact coverage per card) — from [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)
- `doc` ESPECIFICACAO.md RN-80..RN-82

## Outputs (proposed)
- `module` `apps/worker/src/optimizer/moves.ts` — `candidatePool(db, version, { archetypeId, days })` = cards in same-archetype tournament lists with inclusion rate and avg count, filtered to `card_status.exact = 1` or Basic Energy (RN-81), within price cap; `proposeMoves(version, pool, { k, tried }) → [{ remove, add, prior }]` with prior = inclusion × (wanted − current) − (own inclusion × excess), ≤ 4 copies, concept fixed, 60 cards kept, diversity ≤ 2 moves per added/removed card — consumed by [S07.T02](T02-paired-seed-screening.md)

## Initial objective
Only sensible, legal, faithfully-modelled swaps are ever simulated, ranked by how much the archetype's real lists disagree with the user's.

## Summary
- Moves already tried in this job are excluded; a move log is kept for the report.

## Acceptance / verification
- [ ] On the Dhelmise list, the top-8 proposals are all cards with ≥ 30 % inclusion in the archetype; no proposal breaks the 4-copy rule or the price cap.

## Notes for the elaboration pass
- Legacy reference: `sim/optimizer.py::propose_moves` (prior formula, diversity filter), `scripts/deck_optimize.py` (faithful-only filter).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
