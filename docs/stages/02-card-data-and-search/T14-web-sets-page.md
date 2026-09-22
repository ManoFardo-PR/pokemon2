# S02.T14 — Web: sets page

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 14 / 14 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S02.T11](T11-api-cards-search-sets.md) |
| Unblocks | — |
| Parallel with | [S02.T12](T12-web-search-page.md), [S02.T13](T13-web-card-detail-page.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell, API client — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `contract` `GET /api/sets`, `GET /api/stats` — from [S02.T11](T11-api-cards-search-sets.md)

## Outputs (proposed)
- `module` route `/sets` — table: symbol, set name (→ search filtered by set, sorted by number), series, release date, PTCGO code, card count / total, Standard legality, TCGdex id; header with global counts and last price date

## Initial objective
A compact browse-by-set entry point that doubles as a sanity dashboard of what the ETL loaded.

## Summary
- Sortable columns client-side; no pagination (≈174 rows).
- Not in scope: set detail pages.

## Acceptance / verification
- [ ] Row count equals `sets` count; clicking a set opens the search page filtered by that set.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/templates/sets.html`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
