# S03.T06 — Meta queries: archetypes, partners, alternatives, deck read

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 6 / 13 |
| Depends on | [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md), [S03.T05](T05-decks-sync-and-prune.md) |
| Unblocks | [S03.T07](T07-api-meta-endpoints.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) |
| Parallel with | [S03.T10](T10-deck-validation-rules.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `cards_market_usd`, `price_history` — from [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md)
- `table` populated meta tables and `status(db)` — from [S03.T05](T05-decks-sync-and-prune.md)

## Outputs (proposed)
- `module` `apps/api/src/meta/queries.ts` — `parseSelection(names) → nameKeys (≤ 6)`, `findDecks(db, keys, format, days)`, `deckWeight(date, placing)`, `rankDecklists(decks, sort ∈ quality|recent|placing, limit)`, `archetypesFor(db, decks, …)` with `coreCards` (≥ 60 % inclusion), `partners(db, decks, keys, category)` (support, avg count, lift), `alternatives(db, name, format, days) → { reference, printings (cheapest legal flag), evolutionLine, similar }`, `suggest(db, q)`, `windowStats(db)`, `getDeck(db, id)` (grouped cards, counts, `priceUsd`, `priceCoverage`, unresolved), `exportText(deck)`, `cardUsage(db, format, days)` (copies per name_key over the window) — consumed by [S03.T07](T07-api-meta-endpoints.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md)

## Initial objective
Every question the meta pages and the optimizer ask about tournament decks has one tested function with the legacy semantics (quality weighting, core cards, lift, similarity), computed live over the meta window.

## Summary
- `deckWeight` = `0.5 ** (ageDays / 30)` × placing bonus (1st 2.0, top-4 1.6, top-8 1.3, top-16 1.1, else 1.0); `quality` = weight × (1 + log10(players)/2) × 1.5 for official (web) events.
- `findDecks`: decks in the window containing all selected Pokémon (`GROUP BY deck HAVING COUNT(DISTINCT name_key) = n`).
- `partners`: weighted co-occurrence support and lift vs global frequency; deck ids chunked for `IN (…)`.
- `similar`: 0.30·HP + 0.25·max damage + 0.15·min cost + 0.10·has ability + 0.10·rule box + 0.10·meta usage, with pt-BR reason strings.
- `cardUsage` is the meta-copies denominator reused by coverage ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)) and by the optimizer's candidate pool ([S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md)).

## Acceptance / verification
- [ ] Ported legacy `test_decks.py` cases: ingestion + `findDecks`, ranking/archetypes, partners, alternatives, `getDeck`/export, `suggest`.
- [ ] `exportText(getDeck(id))` round-trips through the decklist parser ([S03.T09](T09-decklist-parser-and-exporter.md)) with identical counts.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/search/decks.py` (460 lines).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
