# S03.T13 — Deck comparison with tournament lists

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 13 / 13 |
| Depends on | [S03.T06](T06-meta-queries.md), [S03.T11](T11-user-decks-schema-and-api.md) |
| Unblocks | — |
| Parallel with | [S03.T08](T08-web-meta-pages.md), [S03.T12](T12-web-deck-builder.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` meta queries (`findDecks`, `cardUsage`, archetype detection by core Pokémon) — from [S03.T06](T06-meta-queries.md)
- `table` `user_deck_versions` — from [S03.T11](T11-user-decks-schema-and-api.md)

## Outputs (proposed)
- `module` `apps/api/src/decks/compare.ts` — `compareWithMeta(db, versionId, { archetypeId?, days }) → { archetype, sample, rows: [{ name, myCount, inclusionRate, avgCount, delta }], missingPopular, unusual }`; `GET /api/user-decks/:id/versions/:v/compare` ; web view under the builder

## Initial objective
Before simulating anything, the user sees how their list differs from what the same archetype plays in tournaments: which cards are unusual, which popular cards are missing, and by how many copies.

## Summary
- Archetype is inferred from the deck's most-copied Pokémon when not given; the sample is the archetype's decks in the window.
- This is the seed of the optimizer's candidate pool ([S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md)) — same inclusion statistics.

## Acceptance / verification
- [ ] Dhelmise list vs its archetype shows sensible inclusion rates; a deck with no archetype match returns an explicit empty sample.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/sim/optimizer.py::card_usage / candidate_pool`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
