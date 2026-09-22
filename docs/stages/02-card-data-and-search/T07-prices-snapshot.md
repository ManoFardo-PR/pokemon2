# S02.T07 — Price snapshots

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 7 / 14 |
| Depends on | [S02.T03](T03-fetch-tcgdex.md), [S02.T06](T06-load-cards.md) |
| Unblocks | [S02.T11](T11-api-cards-search-sets.md), [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md) |
| Parallel with | [S02.T08](T08-full-text-search.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `fetchCards(ids, { force })` and cached TCGdex card documents (`pricing` block) — from [S02.T03](T03-fetch-tcgdex.md)
- `table` `cards` (for `tcgdex_id` list) and `price_history`, `cards_market_usd` — from [S02.T06](T06-load-cards.md)

## Outputs (proposed)
- `module` `etl/prices.ts` — `snapshotFromCache(db, date = today)`, `refreshAndSnapshot(db)` (re-downloads all TCGdex cards with `force`, updates `raw_tcgdex_json`, `tcgdex_legal_*`, `tcgdex_updated`, then snapshots), `refreshMarketUsd(db)` — consumed by [S02.T11](T11-api-cards-search-sets.md), [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md)
- `table` `price_history` rows per (card, date, source, variant); `cards_market_usd` refreshed (min TCGplayer market USD across variants per card)

## Initial objective
Prices from both marketplaces exposed by TCGdex are recorded as dated snapshots (idempotent per day), and a single 'market USD' per card is always available for search filters, sorting and deck price totals.

## Summary
- tcgplayer: one row per variant key present (`normal, holofoil, reverse-holofoil, 1st-edition, 1st-edition-holofoil, unlimited, unlimited-holofoil`), currency `unit ?? 'USD'`, fields `lowPrice/midPrice/highPrice/marketPrice/directLowPrice`.
- cardmarket: two synthetic variants `normal` (`low, avg→market, trend, avg1, avg7, avg30`) and `holofoil` (`*-holo` keys), currency `unit ?? 'EUR'`, emitted only when at least one value is present.
- Upsert by primary key so re-running on the same day is a no-op; `etl prices --no-refresh` snapshots from cache only.
- History starts at the first snapshot; the card page needs ≥2 snapshots for a sparkline (documented limitation).

## Acceptance / verification
- [ ] Snapshot of the fixture cards produces the expected rows for both sources; second run inserts nothing.
- [ ] `cards_market_usd` has one row per card with any TCGplayer market price.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/prices.py` (85 lines). The optional wjsutton CSV seed (Feb/Mar 2025) is not part of this subtask; record as a possible extension in NOTICE.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
