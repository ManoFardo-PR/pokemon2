# S03.T07 — API: meta endpoints

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 7 / 13 |
| Depends on | [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S03.T06](T06-meta-queries.md) |
| Unblocks | [S03.T08](T08-web-meta-pages.md) |
| Parallel with | [S03.T11](T11-user-decks-schema-and-api.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Fastify app and conventions — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `module` meta queries — from [S03.T06](T06-meta-queries.md)

## Outputs (proposed)
- `contract` `GET /api/meta/decks?p=…&p=…&format=STANDARD&days=90&sort=quality` → `{ selection, archetypes, decklists, partners: { pokemon, trainer }, alternatives, window }`; `GET /api/meta/suggest?q=`; `GET /api/meta/status`; `POST /api/meta/refresh` (202/409); `GET /api/decks/:id`; `GET /api/decks/:id/export.txt` — consumed by [S03.T08](T08-web-meta-pages.md)

## Initial objective
The meta pages get all their data from a handful of documented JSON endpoints with clamped parameters (days 7–365, ≤ 6 Pokémon).

## Summary
- Refresh triggers `tryStartBackgroundSync` and returns 409 while a sync is running.
- Deck export is `text/plain` in TCG Live format.

## Acceptance / verification
- [ ] Route tests with fixtures for each endpoint; parameter clamping verified.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/api/routes_decks.py` (174 lines).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
