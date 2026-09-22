# S02.T03 — Fetch TCGdex (prices, legality, variants, images)

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 3 / 14 |
| Depends on | [S02.T01](T01-etl-cli-and-raw-cache.md) |
| Unblocks | [S02.T04](T04-set-and-card-id-mapping.md), [S02.T07](T07-prices-snapshot.md) |
| Parallel with | [S02.T02](T02-fetch-pokemon-tcg-data.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` CLI + cache layout + run log — from [S02.T01](T01-etl-cli-and-raw-cache.md)
- `external` `https://api.tcgdex.net/v2/en/sets`, `/sets/{id}` (brief card list `id, localId, name`), `/cards/{id}` (full card incl. `pricing`, `legal`, `variants`, `image`)

## Outputs (proposed)
- `module` `etl/fetch-tcgdex.ts` — `fetchSetList()`, `fetchSetBrief(id)`, `fetchCards(ids, { force, concurrency = 8 })` with file-per-entity cache (presence = cached), `_fetched_at` stamp, retry policy — consumed by [S02.T04](T04-set-and-card-id-mapping.md), [S02.T07](T07-prices-snapshot.md)
- `file` cached JSON under `RAW_CACHE_DIR/tcgdex/` (≈20k card files, ≈53 MB)

## Initial objective
All TCGdex card documents needed to complement the canonical data (prices, legality flags, variants, WebP images) are cached locally, fetched with bounded concurrency and polite retries, and refreshable in bulk for price snapshots.

## Summary
- Concurrency limit 8 (`p-limit`), held only around the HTTP request; 5 attempts with exponential backoff from 1 s on 429/500/502/503/504 and transport errors; 404 → `null`.
- First full fetch is ≈20k requests (30–60 min); with cache it is seconds. `--force` bypasses the cache (used by the price refresh).
- Progress logged every 250 cards; failures collected and reported, not fatal.
- Not in scope: matching TCGdex ids to canonical ids ([S02.T04](T04-set-and-card-id-mapping.md)).

## Acceptance / verification
- [ ] Fetching a set brief and 10 cards writes 11 files; re-running makes zero HTTP requests.
- [ ] Injected 429 responses in a test double trigger the documented backoff sequence.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/fetch_tcgdex.py` (138 lines).
- Optional accelerator (not default): copying the legacy `pokemon/data/raw/tcgdex` folder into `RAW_CACHE_DIR` skips the first download; the data is then re-parsed by the new loader — the legacy database itself is never used (D-003).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
