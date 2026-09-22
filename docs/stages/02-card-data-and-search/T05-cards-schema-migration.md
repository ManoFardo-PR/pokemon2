# S02.T05 — Cards schema migration

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 5 / 14 |
| Depends on | [S01.T04](../01-foundation/T04-database-migration-framework.md) |
| Unblocks | [S02.T06](T06-load-cards.md), [S02.T08](T08-full-text-search.md), [S02.T09](T09-search-query-model-and-sql.md), [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md), [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md) |
| Parallel with | [S02.T01](T01-etl-cli-and-raw-cache.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` migration runner and conventions (`-- @sqlite-only` blocks) — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `doc` `project/04-data-model-overview.md` (baseline domain)

## Outputs (proposed)
- `file` `packages/db/migrations/0002_cards.sql` — tables `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `price_history`; view `cards_latest_price`; maintained table `cards_market_usd(card_id PK, market_usd, snapshot_date)`; FTS5 virtual table `cards_fts(card_id UNINDEXED, name, attack_names, attack_text, ability_names, ability_text, rules, flavor, tokenize='unicode61 remove_diacritics 2')` — consumed by [S02.T06](T06-load-cards.md), [S02.T08](T08-full-text-search.md), [S02.T09](T09-search-query-model-and-sql.md), [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md), [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)
- `table` indexes: `cards(set_id)`, `(hp)`, `(supertype)`, `(regulation_mark)`, `(release_date)`, `(name_norm)`, `(name, release_date)`; `attacks(card_id)`, `(damage_num)`; `abilities(card_id)`; `weaknesses(card_id)`, `resistances(card_id)`; `price_history(card_id, snapshot_date)`
- `module` `@pokesearch/db/schema` row types for these tables

## Initial objective
The relational home of every card fact from both sources exists, indexed for the search filters, with both raw JSON documents preserved (RN-01) and the SQLite-only objects (FTS5, maintained price table) isolated so the schema stays Postgres-portable.

## Summary
- `cards` columns: `id` (pokemon-tcg-data id, PK), `set_id`, `tcgdex_id`, `number`, `local_id`, `name`, `name_norm`, `supertype`, `subtypes_json`, `hp`, `types_json`, `evolves_from`, `evolves_to_json`, `stage`, `rules_json`, `flavor_text`, `regulation_mark`, `rarity`, `artist`, `national_dex_json`, `retreat_cost`, `retreat_json`, `legal_unlimited|standard|expanded`, `tcgdex_legal_standard|expanded` (0/1/NULL), `variants_json`, `img_small|large|webp_high|webp_low`, `raw_ptcg_json NOT NULL`, `raw_tcgdex_json`, `release_date` (denormalized from set), `tcgdex_updated`, `updated_at`.
- `attacks(id, card_id, idx, name, name_norm, cost_json, converted_cost, damage_text, damage_num, damage_mod, text, text_norm)`; `abilities(id, card_id, idx, name, name_norm, type, text, text_norm)`; `weaknesses/resistances(card_id, type, value)` with PK `(card_id, type)`.
- `price_history(card_id, snapshot_date, source, variant, currency, low, mid, high, market, direct_low, trend, avg1, avg7, avg30)` PK `(card_id, snapshot_date, source, variant)`.
- `cards_market_usd` is a table refreshed by [S02.T07](T07-prices-snapshot.md) (SQLite has no materialized views); `cards_latest_price` is a plain view over the latest snapshot per (card, source, variant).
- Postgres note in the file header: `*_json TEXT` → `jsonb`, FTS5 → generated `tsvector`, maintained table → materialized view ([S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)).

## Acceptance / verification
- [ ] Migration applies on a temp DB; `PRAGMA foreign_key_check` clean; FTS5 table accepts an insert and a `MATCH`.
- [ ] Row types compile against the migration (a test inserts one fixture card through the typed layer).

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/db/schema.sql` L1–160 (same shape; `weaknesses/resistances` lacked indexes there).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
