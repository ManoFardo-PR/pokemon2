# S02.T06 — Load cards into the database

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 6 / 14 |
| Depends on | [S02.T04](T04-set-and-card-id-mapping.md), [S02.T05](T05-cards-schema-migration.md) |
| Unblocks | [S02.T07](T07-prices-snapshot.md), [S02.T08](T08-full-text-search.md), [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md), [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md), [S04.T02](../04-game-engine-core/T02-card-definition-model.md), [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `etl/idmap.ts` (set candidates, card matches) — from [S02.T04](T04-set-and-card-id-mapping.md)
- `table` empty card tables and row types — from [S02.T05](T05-cards-schema-migration.md)

## Outputs (proposed)
- `module` `etl/load.ts` — `loadSet(db, ptcgSet, tcgdexSetId, cardMatches)` upserting `sets` and every card in one transaction; helpers `norm()`, `parseDamage()`, `deriveStage()`, `isoDate()` — consumed by [S02.T07](T07-prices-snapshot.md), [S02.T08](T08-full-text-search.md), [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md), [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md), [S04.T02](../04-game-engine-core/T02-card-definition-model.md), [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md)
- `table` `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances` populated (≈174 / 20.4k / 28k / 4.1k / 16.8k / 4.9k rows) — consumed by the same subtasks
- `contract` normalization rule: `norm(s) = strip diacritics (NFD, remove \p{Mn}) → lower → trim`; used identically for `name_norm`, `text_norm` and the deck resolver's `name_key` so joins by normalized name are byte-exact

## Initial objective
Every cached card document from both sources becomes rows in the card tables with a documented field provenance, in idempotent per-set transactions fast enough for a full reload in minutes.

## Summary
- Provenance: canonical (pokemon-tcg-data) → `id, number, name, supertype, subtypes, hp, types, evolves_from/to, rules, flavor, rarity, artist, national_dex, retreat, legal_*, img_small/large`, attacks, abilities, weaknesses, resistances; TCGdex → `tcgdex_id, local_id, variants, tcgdex_legal_*, tcgdex_updated, img_webp_high/low` (`image + '/high.webp' | '/low.webp'`); `stage` = TCGdex `stage` (`Stage1→Stage 1`) else first of `[Basic, Stage 1, Stage 2, BREAK, LEGEND, Restored, MEGA, V-UNION, VMAX, VSTAR, Baby, Level-Up]` present in subtypes; `regulation_mark` from either; `retreat_cost` = `convertedRetreatCost ?? retreatCost.length`; `release_date` copied from the set; both raw documents stored.
- `parseDamage('120+') → (120, '+')`, `'30×' | '30x' | '30*' → (30, '×')`, non-numeric text → `(null, raw)`; `converted_cost = convertedEnergyCost ?? cost.length`.
- Children are delete-then-insert per card; batches of ~500 statements per transaction; a set is either fully loaded or unchanged.
- Not in scope: FTS rebuild ([S02.T08](T08-full-text-search.md)) and price snapshot ([S02.T07](T07-prices-snapshot.md)), which `etl full` calls afterwards.

## Acceptance / verification
- [ ] Loading the fixture set twice yields identical row counts and `updated_at` changes only when content changed.
- [ ] Full load of all cached sets completes in under 10 minutes on this machine; counts within ±2 % of the legacy baseline above.
- [ ] `norm()` unit tests: 'Pokémon' → 'pokemon', 'Flabébé' → 'flabebe'.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/load.py` (215 lines: provenance table, `parse_damage` regex `^\s*(\d+)\s*([+\-×x*]?)\s*$`, `derive_stage`). Consult, do not copy.
- Measure `node:sqlite` insert throughput here; if too slow, enable the alternative driver behind the adapter ([S01.T02](../01-foundation/T02-sqlite-database-client.md) open question).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
