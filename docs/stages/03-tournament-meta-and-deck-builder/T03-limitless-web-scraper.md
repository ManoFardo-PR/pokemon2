# S03.T03 — Limitless web scraper (official events)

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 3 / 13 |
| Depends on | [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) |
| Unblocks | [S03.T05](T05-decks-sync-and-prune.md) |
| Parallel with | [S03.T01](T01-tournaments-schema-migration.md), [S03.T02](T02-limitless-api-client.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` CLI, cache layout (`limitless/web/list_<id>.html`), run log — from [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)
- `external` `https://limitlesstcg.com/decks/lists?format=standard&time=<1|3|6|12>months&type=<worlds|international|regional|special|national>&show=100&page=N` and `/decks/list/<id>`

## Outputs (proposed)
- `module` `etl/limitless-web.ts` — `parseLists(html) → { tournaments, rows }`, `parseDecklist(html)`, `WebClient` (≥ 0.6 s spacing, 4 retries, browser-like UA), permanent cache of decklist HTML — consumed by [S03.T05](T05-decks-sync-and-prune.md)
- `file` HTML fixtures for both page types under `packages/etl/test/fixtures/limitless-web/`
- `contract` estimated players by event type `{ worlds: 1500, international: 1500, regional: 800, special: 300, national: 400 }` × division factor `{ sr: 0.15, jr: 0.10 }` (RN-06)

## Initial objective
Decklists from in-person Play! Pokémon events, which the API does not expose, are scraped politely and parsed defensively so that an HTML change degrades to 'no web decks today' instead of corrupting data.

## Summary
- `parseLists`: walk `table tr`; sub-heading rows carry the tournament (`/tournaments/(\d+)`, date like '28th August 2026', name after ' - '); a `(MA|SR|JR)` suffix splits divisions into their own tournament id (`<id>-sr`); data rows give placing, archetype icons (`img.pokemon[alt]`), list link and player (from `span.annotation`).
- `parseDecklist`: `.decklist-column` → heading `^(Pokémon|Trainer|Energy)` → `.decklist-card` with `.card-count`, `.card-name`, `data-set`, `data-number`.
- Web tournaments get `source='limitless_web'`, `has_decklists=1`, `complete=1`, `is_online=0`, organizer `Play! Pokémon (<type>)`; archetype reuses an API archetype with the same lower-cased name, else `web:<slug>`.

## Acceptance / verification
- [ ] Fixture tests: list page parses N rows with correct tournament attribution and division split; decklist page yields 60 cards in three sections.
- [ ] A mangled fixture returns empty results and a warning, never throws.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/limitless_web.py` (254 lines) and `tests/test_limitless_web.py`. Fragility is declared in ESPECIFICACAO.md §6.2.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
