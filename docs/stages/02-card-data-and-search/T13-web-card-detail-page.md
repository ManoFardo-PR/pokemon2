# S02.T13 — Web: card detail page

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 13 / 14 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S02.T11](T11-api-cards-search-sets.md) |
| Unblocks | — |
| Parallel with | [S02.T12](T12-web-search-page.md), [S02.T14](T14-web-sets-page.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell, API client — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `contract` `GET /api/cards/:id`, `GET /api/cards/:id/prices` — from [S02.T11](T11-api-cards-search-sets.md)

## Outputs (proposed)
- `module` route `/card/:id` — large image (webp high → png → small fallback), identity block (name, supertype · subtypes, set link, number/printed total, series, release date, rarity, regulation mark, artist → filtered search), stats (HP, types, stage, evolves from/to links, dex, retreat pills, weakness, resistance), abilities and attacks with energy-cost pills and damage, rules box, flavor, legality table (Standard/Expanded/Unlimited × pokemon-tcg-data vs TCGdex), variants, price table (source, variant, low/mid/high/market/trend/avg7/avg30, currency), 730-day price sparkline (inline SVG), 'other printings' strip, collapsible raw JSON, link to the JSON API

## Initial objective
Everything a player wants to know about one printing is on one page, in the official English wording, with legality and prices from both sources shown side by side and quick paths to other printings and related searches.

## Summary
- Sparkline is an inline SVG polyline over TCGplayer market USD of the cheapest variant; a message explains when fewer than two snapshots exist.
- Rulings are not available from the sources; do not fake a section.

## Acceptance / verification
- [ ] Fixture card renders every section; missing data hides the section instead of showing empty labels.
- [ ] Image fallback chain works when the WebP URL 404s (test with a broken URL).

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/templates/card.html` (117 lines) and `routes_ui.py::sparkline_svg`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
