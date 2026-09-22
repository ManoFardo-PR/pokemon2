# S03.T11 — User decks: schema and API

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 11 / 13 |
| Depends on | [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S03.T09](T09-decklist-parser-and-exporter.md), [S03.T10](T10-deck-validation-rules.md) |
| Unblocks | [S03.T12](T12-web-deck-builder.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md), [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md) |
| Parallel with | [S03.T07](T07-api-meta-endpoints.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Fastify app — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `contract` decklist parse/serialize + resolution — from [S03.T09](T09-decklist-parser-and-exporter.md)
- `module` `validateDeck` — from [S03.T10](T10-deck-validation-rules.md)

## Outputs (proposed)
- `file` migration `0004_user_decks.sql` — `user_decks(id, name, format, archetype_id, notes, created_at, updated_at)`, `user_deck_versions(id, deck_id, version_no, parent_id, change_desc, list_json, list_text, validation_json, price_usd, coverage_exact, coverage_proven, created_at)` UNIQUE `(deck_id, version_no)` — consumed by [S03.T12](T12-web-deck-builder.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md), [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)
- `contract` `POST /api/user-decks` (name, text | cards), `GET /api/user-decks`, `GET /api/user-decks/:id`, `POST /api/user-decks/:id/versions` (new list + change description; server computes diff `−1 X, +1 Y`), `GET /api/user-decks/:id/versions/:v/export.txt`, `POST /api/user-decks/from-tournament/:deckId` — consumed by [S03.T12](T12-web-deck-builder.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)
- `module` `decks/diff.ts` — `describeDiff(a, b)`; `decks/price.ts` — Σ market USD × count with coverage %

## Initial objective
A user's deck is a first-class record with an immutable version history, each version carrying its validation report, price and (later) rule-coverage numbers.

## Summary
- `list_json` = `[{ cardId | null, name, setCode, number, count, category }]`; `list_text` = canonical export.
- Coverage columns are filled by [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) later; NULL until then.
- Single user: no ownership column (D-007).

## Acceptance / verification
- [ ] Create → add version → diff text correct; export equals canonical serialization; invalid list stored with `validation_json.ok = false` but not rejected.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/sim/store.py` and tables `deck_projects`/`deck_versions` (project = concept + versions; here the deck itself is the entity).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
