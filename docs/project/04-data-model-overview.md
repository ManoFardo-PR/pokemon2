# Data model overview

| Field | Value |
|---|---|
| Doc | project/04 |
| Status | DRAFT — to be enriched in the elaboration pass (column-level detail lives in the owning subtask files) |
| Inputs | [Decision log](02-decision-log.md) D-002, D-004; legacy `schema.sql` (shape reference only) |
| Outputs | Table inventory by domain with the subtask that owns each migration; conventions every migration follows |

## Conventions

- **Ids**: text primary keys from the sources (`cards.id = 'sv4pt5-54'`, tournaments `api:<id>` / `web:<n>`); integer autoincrement only for internal rows (jobs, versions, evidence).
- **Dates/times**: ISO-8601 text (`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:SSZ`).
- **Arrays/objects**: JSON text in columns named `*_json`; queried with `json_each` through the dialect module (Postgres: `jsonb`).
- **Normalized text**: `norm(s)` = strip diacritics → lower → trim; `name_norm`, `text_norm`, `name_key` all use it byte-identically.
- **Migrations**: `packages/db/migrations/NNNN_name.sql`, forward-only, applied by `pnpm db:migrate`, recorded in `schema_migrations`; SQLite-only statements sit in blocks tagged `-- @sqlite-only` with a `-- @postgres:` note.
- **Snapshots**: `rules_snapshot` = SHA-256 over all active code bodies and text_codes; `engine_build` = hash printed by `ptcg-cli --version`. Both are recorded wherever a number depends on them.

## Domains and tables

### Baseline (written by the ETL)

| Table / object | Purpose | Migration | Owner |
|---|---|---|---|
| `schema_migrations`, `etl_runs` | schema version (with each migration's `checksum`, so an applied file cannot be edited unnoticed, and `duration_ms`); one row per ETL run with stats/error | 0001 | S01.T04 |
| `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances` | canonical card facts (pokemon-tcg-data) complemented by TCGdex; both raw documents preserved (RN-01) | 0002 | S02.T05 (schema), S02.T06 (load) |
| `price_history`, view `cards_latest_price`, table `cards_market_usd` | dated price snapshots per source/variant; latest per card; single market USD per card | 0002 | S02.T05, S02.T07 |
| `cards_fts` (FTS5) | full-text index rebuilt after each load; bm25 weights name 10 / attack names 6 / attack text 3 / ability names 6 / ability text 3 / rules 2 / flavor 0.5 | 0002 | S02.T08 |
| `tournaments`, `archetypes`, `decks`, `deck_cards` | the meta window (Standard, 90 days, ≥ 16 players, ≤ 400 tournaments — RN-03); every decklist line resolved to a card (RN-02) | 0003 | S03.T01, S03.T05 |

### User decks

| Table | Purpose | Migration | Owner |
|---|---|---|---|
| `user_decks` | a deck of the user (name, format, archetype, notes) | 0004 | S03.T11 |
| `user_deck_versions` | immutable list versions with parent, change description, validation report, price, exact/proven coverage | 0004 | S03.T11 (coverage columns filled by S05.T12) |

### Jobs (written by the worker)

| Table | Purpose | Migration | Owner |
|---|---|---|---|
| `jobs` | every engine invocation: kind, status, params, progress, result, engine build, rules snapshot | 0005 | S04.T14 |
| `job_pairings` | per (deck A, deck B, bots, seed block): W/L/T, outcomes, avg turns, fingerprint | 0005 | S04.T14 |
| `games` | optional per-game rows and compressed event logs | 0005 | S04.T14 |
| `optimizer_candidates` | every swap considered by an optimize job with screening/confirmation/holdout numbers and decision | 0008 | S07.T04 |

### Card rules base (D-004)

| Table / view | Purpose | Migration | Owner |
|---|---|---|---|
| `effect_texts` | one row per distinct effect text (kind, name, text) keyed by hash; reprints share it (RN-05) | 0006 | S05.T01, S05.T02 |
| `card_parts` | which printing parts (ability i, attack j, trainer text, energy text, rule box) point at which text | 0006 | S05.T02 |
| `rule_codes` | the sentence codes: pattern with placeholders, params schema, IR body or builtin, status `draft/exact/approx/builtin/unimplemented` | 0006 | S05.T01, S05.T07 |
| `text_codes` | ordered `(code, params)` per text — the per-card parametrization | 0006 | S05.T07, imports S05.T08–T10 |
| `text_sentences` | sentence split of each text with the spreadsheet's classification columns | 0006 | S05.T08 |
| `card_overrides` | attribute corrections of source data (values only, never names — RN-76) | 0006 | S05.T01, applied by S04.T02 |
| `rule_scenarios` | mirror of `engine/scenarios/*.json` (git is the source) | 0006 | S05.T11 |
| `rule_evidence` | insert-only proofs per (text, code, kind, engine build, rules snapshot) | 0006 | S05.T12 |
| view `card_status` | `exact` / `proven` per card derived from codes and evidence | 0006 | S05.T01 |

### Measurement

| Table | Purpose | Migration | Owner |
|---|---|---|---|
| `bots` | registered bots with kind, params, `code_hash`, frozen flag (RN-37) | 0007 | S05.T16, S06.T07 |
| `suites`, `suite_opponents` | frozen rulers: evaluated deck version, opponents with weights/lists, `seed0`, opponent bot, rules snapshot, engine build (RN-40..43) | 0007 | S05.T16 |
| `measurements`, `measurement_opponents` | score + CI, mirror + CI, outcomes, avg turns, commit per measurement (RN-44..49) | 0007 | S05.T16, S06.T08 |

## Derived numbers

- **Coverage** (`S05.T12`): denominator = copies in Standard tournament lists of the window (`cardUsage`); numerator by `card_status`; split by evidence kind.
- **Deck price**: Σ `cards_market_usd.market_usd × count` with the share of priced cards.
- **Score**: Σ weight × win rate with a delta-method 95 % CI; per-pairing Wilson CI with ties = 0.5.

## Postgres portability notes (for S08.T03)

`*_json TEXT` → `jsonb` with GIN; `cards_fts` → generated `tsvector` (weights A: name, B: attack/ability names, C: texts/rules, D: flavor) + GIN; `cards_market_usd` → materialized view; `json_each` filters → `jsonb` operators; `CAST(number AS INTEGER)` ordering → `NULLIF(regexp_replace(number,'\D','','g'),'')::int`; views unchanged.

[Docs index](../README.md) · [Architecture](03-architecture-overview.md) · [Glossary](07-glossary.md)
