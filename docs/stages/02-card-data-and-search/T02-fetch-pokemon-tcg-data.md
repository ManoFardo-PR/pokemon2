# S02.T02 — Fetch pokemon-tcg-data (canonical card JSON)

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 2 / 14 |
| Depends on | [S02.T01](T01-etl-cli-and-raw-cache.md) |
| Unblocks | [S02.T04](T04-set-and-card-id-mapping.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md) |
| Parallel with | [S02.T03](T03-fetch-tcgdex.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` CLI + cache layout + run log — from [S02.T01](T01-etl-cli-and-raw-cache.md)
- `external` `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json` and `cards/en/<setId>.json`

## Outputs (proposed)
- `module` `etl/fetch-ptcg.ts` — `fetchSets()`, `fetchSetCards(setId)`, `fetchAll({ force }) → { changedSetIds }` with `If-None-Match` per file stored in `pokemon-tcg-data/etags.json`; 304 = unchanged — consumed by [S02.T04](T04-set-and-card-id-mapping.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md)
- `file` cached JSON under `RAW_CACHE_DIR/pokemon-tcg-data/` (≈176 files, ≈26 MB)

## Initial objective
The canonical English card data (names, attacks, abilities, HP, types, rarity, artist, legalities, `ptcgoCode`, image URLs) is on disk and refreshable in seconds when nothing changed, with the list of changed sets driving incremental loads.

## Summary
- Sequential or low-concurrency downloads (≈176 files); retry on transport errors and 5xx; 404 on a set's card file is a warning, not a failure.
- `changedSetIds` = sets whose file content changed (ETag differs) — this is what `etl delta` consumes.
- Not in scope: parsing into tables ([S02.T06](T06-load-cards.md)).

## Acceptance / verification
- [ ] Second consecutive run performs only conditional requests and reports 0 changed sets.
- [ ] Deleting one cached set file makes the next run re-download exactly that file.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/fetch_ptcg.py` (81 lines; same ETag strategy).
- Licence status of the repository must be recorded in `docs/NOTICE.md` ([S01.T09](../01-foundation/T09-licensing-and-notice.md)) before the first download in production use.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
