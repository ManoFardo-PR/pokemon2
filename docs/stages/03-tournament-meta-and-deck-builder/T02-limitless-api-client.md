# S03.T02 — Limitless API client

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 2 / 13 |
| Depends on | [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) |
| Unblocks | [S03.T05](T05-decks-sync-and-prune.md) |
| Parallel with | [S03.T01](T01-tournaments-schema-migration.md), [S03.T03](T03-limitless-web-scraper.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` CLI, cache layout (`limitless/tournaments/<id>/…`), run log — from [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)
- `external` `https://play.limitlesstcg.com/api` — `GET /tournaments?game=PTCG&format=STANDARD&limit=50&page=N`, `GET /tournaments/{id}/details`, `GET /tournaments/{id}/standings`; optional header `X-Access-Key` (`LIMITLESS_API_KEY` raises the rate limit)

## Outputs (proposed)
- `module` `etl/limitless-api.ts` — `listTournaments({ format, days = 90, minPlayers = 16, maxTournaments = 400 })`, `details(id)`, `standings(id)` with per-tournament file cache — consumed by [S03.T05](T05-decks-sync-and-prune.md)
- `contract` politeness: ≥ 0.4 s between requests, 5 retries with exponential backoff honouring `Retry-After`, 404 → null, descriptive User-Agent

## Initial objective
Tournament lists, standings and decklists for the configured window arrive from the official API without ever tripping its rate limit, cached per tournament so re-syncs cost one request per new event.

## Summary
- Pagination newest-first; dedupe by id; stop when a full page is older than the cutoff; keep `players ≥ minPlayers`; cap at `maxTournaments` (RN-03).
- Standings already reveal whether decklists exist, so `details` is requested only when needed.
- Not in scope: writing to the database ([S03.T05](T05-decks-sync-and-prune.md)).

## Acceptance / verification
- [ ] Recorded-fixture tests for pagination cutoff, min players filter and Retry-After handling.
- [ ] A second sync of the same window issues requests only for tournaments not yet cached.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/limitless.py` (149 lines, `min_interval = 0.4`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
