# S02.T11 — API: search, cards, sets, facets

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 11 / 14 |
| Depends on | [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S02.T07](T07-prices-snapshot.md), [S02.T09](T09-search-query-model-and-sql.md), [S02.T10](T10-natural-language-parser.md) |
| Unblocks | [S02.T12](T12-web-search-page.md), [S02.T13](T13-web-card-detail-page.md), [S02.T14](T14-web-sets-page.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Fastify app factory and route conventions — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `table` `price_history`, `cards_market_usd` — from [S02.T07](T07-prices-snapshot.md)
- `module` search service + `SearchQuery` — from [S02.T09](T09-search-query-model-and-sql.md)
- `module` `parseNaturalLanguage` — from [S02.T10](T10-natural-language-parser.md)

## Outputs (proposed)
- `contract` `GET /api/search?…` (every `SearchQuery` field as query params + `q` free phrase) → `{ interpretation: { source: 'rules', chips, filters }, total, page, page_size, pages, usedOrFallback, items[] }`; `POST /api/search` (body = SearchQuery); `GET /api/nl/parse?q=`; `GET /api/cards/:id` (card + set + attacks + abilities + weaknesses + resistances + latest prices + other printings); `GET /api/cards/:id/prices?days=730`; `GET /api/sets`; `GET /api/facets`; `GET /api/stats` — consumed by [S02.T12](T12-web-search-page.md), [S02.T13](T13-web-card-detail-page.md), [S02.T14](T14-web-sets-page.md)
- `module` `apps/api/src/routes/{search,cards,sets}.ts`

## Initial objective
The web app (and any script) can search, read a card with everything the card page needs in one call, and list sets, with query parameters validated and documented by the shared schema.

## Summary
- Free phrase `q` runs the rules parser; explicit URL filters override parsed ones; the response echoes the interpretation so the UI can render chips.
- Card read returns both raw JSON documents (collapsed in the UI) and the 'other printings' list (same `name`, up to 12, newest first).
- OpenAPI generated from the zod schemas at `/docs`.

## Acceptance / verification
- [ ] Route tests with the temp DB + fixtures: search by type + HP, NL phrase → chips, card read shape, sets list.
- [ ] Invalid `page_size=999` → 400 with the schema error.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/api/routes_api.py`, `routes_ui.py::card`, `deps.py::query_from_request` (parameter buckets).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
