# S02.T09 — Search query model and SQL builder

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 9 / 14 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S02.T05](T05-cards-schema-migration.md), [S02.T08](T08-full-text-search.md) |
| Unblocks | [S02.T10](T10-natural-language-parser.md), [S02.T11](T11-api-cards-search-sets.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/search` placeholder to replace — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `table` card tables, indexes, `cards_market_usd` — from [S02.T05](T05-cards-schema-migration.md)
- `module` FTS query builder and rank expression — from [S02.T08](T08-full-text-search.md)

## Outputs (proposed)
- `contract` `SearchQuery` (zod, in `@pokesearch/shared/search`): lists `types, subtypes, series, rarity, regulation_marks, set_ids, attack_energy_types`; ints `hp_min/max, retreat_min/max, attack_cost_min/max, attack_damage_min/max, page (1), page_size (24, ≤200)`; numbers `price_min_usd/max_usd`; booleans `legal_standard, legal_expanded, has_ability`; strings `text, name, supertype, stage, set_name, artist, attack_name, attack_text, ability_name, ability_text, weakness_type, resistance_type, evolves_from, release_from ('2021-01-01' default), release_to, sort ∈ relevance|release_date|name|hp|price_desc|price_asc|number`; `activeFilters(q)` diff against defaults — consumed by [S02.T10](T10-natural-language-parser.md), [S02.T11](T11-api-cards-search-sets.md)
- `module` `apps/api/src/search/sql.ts` — `buildSearchSql(q, { useOr }) → { items, count, params }`; `apps/api/src/search/service.ts` — `search(db, q) → { total, page, pages, items, usedOrFallback }`, `getCard(db, id)`, `getPriceHistory(db, id, days)`, `facets(db)`, `stats(db)`, `listSets(db)` — consumed by [S02.T10](T10-natural-language-parser.md), [S02.T11](T11-api-cards-search-sets.md)

## Initial objective
A single typed query object drives both the attribute filters and the free-text search, compiled into one parameterized SQL statement whose semantics match the legacy service (same filters, same sorts, same fallback), verified by ported tests.

## Summary
- Base: `FROM cards c JOIN sets s ON s.id = c.set_id LEFT JOIN cards_market_usd m ON m.card_id = c.id`; with `text`: `JOIN (SELECT card_id, <rankExpr> AS rank FROM cards_fts WHERE cards_fts MATCH ?) f`.
- Filters: `name_norm LIKE`, equality on supertype/stage, `set_id IN`, `lower(series) IN`, rarity `LIKE` OR-ed, `upper(regulation_mark) IN`, artist `LIKE`, hp/retreat/release/price ranges (`retreat_max` forces `supertype='Pokémon'` and `COALESCE(retreat_cost,0)`); array columns via `EXISTS (SELECT 1 FROM json_each(col) WHERE lower(value) IN (…))` (dialect module); legality `COALESCE(c.tcgdex_legal_standard, c.legal_standard = 'Legal') = ?`; all attack conditions inside one `EXISTS (… FROM attacks a WHERE a.card_id = c.id AND …)` so they hold for the same attack (name/text word-wise `LIKE`, `converted_cost`, `damage_num`, cost types); abilities likewise, `has_ability` → EXISTS / NOT EXISTS; weakness/resistance EXISTS.
- Sorts: relevance = `f.rank ASC, release_date DESC, number` when text present else `release_date DESC, set_id, number`; `hp DESC NULLS LAST`; prices `NULLS LAST`; numeric-aware `number` ordering.
- `set_name` resolves to `set_ids` by id, `ptcgo_code` or name `LIKE`; no match → sentinel that yields zero rows. OR fallback: when total is 0 and the text has > 1 token, re-run with OR and flag `usedOrFallback`.
- Facets (distinct types/subtypes/supertypes/rarities/regulation marks/series/stages, top-300 artists) computed with a 10-minute in-memory cache.

## Acceptance / verification
- [ ] Ported legacy `test_search.py` cases pass: default release filter, FTS, damage/text, types/HP, legality, retreat, `has_ability`.
- [ ] Every `sort` value produces valid SQL; `page_size > 200` rejected by the schema.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/search/filters.py` (246 lines) and `service.py` (129 lines). Consult for semantics, rewrite in TS.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
