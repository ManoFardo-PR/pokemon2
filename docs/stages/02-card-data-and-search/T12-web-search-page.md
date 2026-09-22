# S02.T12 — Web: search page

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 12 / 14 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S02.T11](T11-api-cards-search-sets.md) |
| Unblocks | [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md), [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md) |
| Parallel with | [S02.T13](T13-web-card-detail-page.md), [S02.T14](T14-web-sets-page.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell, API client, image fallback pattern — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `contract` `GET /api/search`, `GET /api/facets`, `GET /api/stats` — from [S02.T11](T11-api-cards-search-sets.md)

## Outputs (proposed)
- `module` route `/` (`apps/web/src/routes/index.tsx`) — search box with pt-BR placeholder examples, 'interpretei como' chips, OR-fallback notice, sidebar filter groups (Período, Categoria, Tipo de energia, Números, Habilidade/ataque, Legalidade/marca/raridade, Série/set/artista, Ordenação + page size 24/48/96) auto-submitting on change, URL-synced state, results grid (image with fallback, name, set · number, HP, type pills, rarity · reg mark · price), pager, footer stats — consumed by [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md), [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)
- `contract` `+ deck` button hook on each Pokémon tile: emits `addToSelection(cardName)` (implemented by [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md)) and `addToDeck(cardId)` (implemented by [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md))

## Initial objective
The user searches by phrase or by filters and sees immediately how the phrase was understood, with results and pagination reflected in the URL so any search is shareable and the back button works.

## Summary
- State lives in the URL search params (TanStack Router validated with the `SearchQuery` schema); facets come from `/api/facets`.
- Default period 2021+ with a 'todos os anos' toggle.
- Not in scope: deck selection state ([S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md)) and deck builder ([S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)); this page only exposes the hooks.

## Acceptance / verification
- [ ] Typing a phrase and pressing Enter updates the URL and shows chips; changing a filter re-queries without a full reload.
- [ ] Reloading a result URL reproduces the same page.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/templates/index.html` and `_results.html` (filter groups and tile layout).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
