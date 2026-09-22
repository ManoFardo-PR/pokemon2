# S03.T01 — Tournaments and decks schema migration

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 1 / 13 |
| Depends on | [S01.T04](../01-foundation/T04-database-migration-framework.md), [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) |
| Unblocks | [S03.T04](T04-deck-resolver.md) |
| Parallel with | [S03.T02](T02-limitless-api-client.md), [S03.T03](T03-limitless-web-scraper.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` migration runner and conventions — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `table` `cards`, `sets` (foreign keys) — from [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md)

## Outputs (proposed)
- `file` `packages/db/migrations/0003_tournaments.sql` — `tournaments(id, source, source_id, name, date, format, players, organizer_id, organizer, platform, is_online, has_decklists, complete, url, fetched_at)`, `archetypes(id, name, icons_json, web_id)`, `decks(id, tournament_id, player, name, country, placing, wins, losses, ties, dropped, archetype_id, url, card_total, resolved_count, updated_at)`, `deck_cards(deck_id, idx, category, count, name, name_key, set_code, number, card_id NULL, match_kind, image_fallback_url)` PK `(deck_id, idx)` — consumed by [S03.T04](T04-deck-resolver.md)
- `table` indexes: `tournaments(format, date)`, `decks(tournament_id)`, `decks(archetype_id)`, `deck_cards(category, name_key)`, covering `deck_cards(name_key, card_id, set_code, number, count)`, `deck_cards(card_id)`

## Initial objective
The meta domain has its tables and the one index that made 'which printing of this card is most played' a 0.1 s query instead of 8.5 s in the legacy project.

## Summary
- Ids: tournaments `api:<limitless id>` | `web:<int>`; decks `<tournament_id>:<player|index>` | `web:<list id>:<player|placing>`; archetypes = Limitless slug or `web:<slug>`.
- `deck_cards.card_id` is nullable with `ON DELETE SET NULL`; `match_kind ∈ exact|override|digits|name|none`.
- Cascade deletes from tournaments → decks → deck_cards support pruning.

## Acceptance / verification
- [ ] Migration applies; inserting a tournament + deck + cards through the typed layer works; cascade delete verified.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/db/schema.sql` L200–260 (comment documents the covering-index fix).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
