# S02.T08 — Full-text search index and query builder

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 8 / 14 |
| Depends on | [S02.T05](T05-cards-schema-migration.md), [S02.T06](T06-load-cards.md) |
| Unblocks | [S02.T09](T09-search-query-model-and-sql.md), [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) |
| Parallel with | [S02.T07](T07-prices-snapshot.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `cards_fts` (FTS5) — from [S02.T05](T05-cards-schema-migration.md)
- `table` populated `cards`, `attacks`, `abilities` — from [S02.T06](T06-load-cards.md)

## Outputs (proposed)
- `module` `db/dialect/sqlite/fts.ts` — `rebuildFts(db)` (wipe + repopulate from cards/attacks/abilities/rules + `optimize`), `buildMatch(text, { or, columns }) → string`, `rankExpr` = `bm25(cards_fts, 0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5)` — consumed by [S02.T09](T09-search-query-model-and-sql.md), [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)
- `doc` `db/dialect/README.md` — the dialect module contract and the Postgres counterpart design (`tsvector` with weights A/B/C/D, `websearch_to_tsquery`, prefix `:*`) — consumed by [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md)
- `script` `etl fts` subcommand wiring

## Initial objective
Free text (English card wording, after pt→en translation) ranks cards by relevance with name matches first, supports prefix and column-restricted matching, and lives behind one module so the Postgres path replaces it without touching the search service.

## Summary
- Standalone FTS5 table rebuilt after every load (no triggers): `name`, `attack_names`/`attack_text` (joined with ' | '), `ability_names`/`ability_text`, `rules` (from `rules_json`), `flavor`.
- Tokenization for query building: strip diacritics → lower → `[a-z0-9]+`, keep tokens of length ≥ 2 or digits; default query `"tok"*` AND-joined; `or: true` variant for the fallback; optional column filter `{name attack_text}: (...)`.
- Weights favour names (10) over attack/ability names (6), texts (3), rules (2), flavor (0.5).

## Acceptance / verification
- [ ] `rebuildFts` row count equals `cards` count; query 'heal bench' returns cards whose texts contain both stems ranked with name matches first.
- [ ] Prefix query 'charizar' matches Charizard printings.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/search/fts.py` (26 lines) and `etl/load.py::rebuild_fts` (SQL with `group_concat` + `json_each`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
