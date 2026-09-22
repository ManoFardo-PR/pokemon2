# Legacy reference map

| Field | Value |
|---|---|
| Doc | project/06 |
| Status | DRAFT — to be enriched in the elaboration pass |
| Inputs | The legacy project at `C:\Users\mfard\OneDrive\AmbVir\VS Code\Trabalhos\pokemon` (Python, commit `079b487`, 2026-09-21) and its `ESPECIFICACAO.md` |
| Outputs | For each legacy file: what to consult it for and which subtask uses it — as documentation, never as code to copy (D-003) |

## Rules of use

- **Consult, do not port.** The legacy code documents algorithms and edge cases (in pt-BR comments). New code is written from the subtask files; legacy tests are re-expressed as vitest cases or engine scenarios.
- **Not reused at all**: the legacy database file `data/pokesearch.db` (D-003); the third-party `ptcg-engine` package in `.venv` (MIT, different architecture); generated card modules under `sim/generated_cards/`.
- **Imported as data** (the user's own work products): `sim/attack_effects.json`, the recipes in `sim/catalog.py`, the spreadsheet `data/reports/cartas_standard.xlsx`, and the 136 `@pytest.mark.verifies` tests (as scenarios).

## Map

| Legacy path (under `pokemon/`) | Consult for | Used by |
|---|---|---|
| `ESPECIFICACAO.md` | Objectives, metrics, the 84 business rules with their legacy pointers, limitations | every stage README; [traceability](05-business-rules-traceability.md) |
| `README.md` | Screen-by-screen description of the legacy UI; coverage numbers; performance notes (L123–132) | S02.T12–T14, S03.T08, S04.T17, S04.T18 |
| `src/pokesearch/config.py` | Source URLs, defaults (`TCGDEX_CONCURRENCY = 8`, `DEFAULT_RELEASE_FROM = 2021-01-01`, meta window constants) | S02.T01, S02.T09, S03.T02 |
| `src/pokesearch/db/schema.sql` | Table shapes and the covering-index note (8.5 s → 0.11 s) | S02.T05, S03.T01, [data model](04-data-model-overview.md) |
| `src/pokesearch/db/connection.py` | Pragmas; the schema-on-connect anti-pattern | S01.T02, S01.T04 |
| `src/pokesearch/etl/fetch_ptcg.py` | ETag strategy, changed-set detection | S02.T02 |
| `src/pokesearch/etl/fetch_tcgdex.py` | Endpoints, retry/backoff, concurrency, cache-by-presence | S02.T03 |
| `src/pokesearch/etl/idmap.py`, `tests/test_idmap.py` | Set/card id heuristics and their test cases | S02.T04 |
| `src/pokesearch/etl/load.py` | Field provenance, `parse_damage` regex, `derive_stage`, delete-then-insert of children, `rebuild_fts` SQL | S02.T06, S02.T08 |
| `src/pokesearch/etl/prices.py` | TCGplayer variant keys, Cardmarket synthetic variants, currencies | S02.T07 |
| `src/pokesearch/etl/limitless.py` | Endpoints, 0.4 s spacing, pagination cutoff rules | S03.T02 |
| `src/pokesearch/etl/limitless_web.py`, `tests/test_limitless_web.py` | Selectors, date parsing, division split, estimated players; HTML fixtures | S03.T03 |
| `src/pokesearch/etl/deck_resolver.py`, `limitless_overrides.json`, `tests/test_deck_resolver.py` | Resolution order, aliases, `name_key`, fallback image URL | S03.T04 |
| `src/pokesearch/etl/decks.py` | Sync orchestration, `complete` flag, prune, unresolved report, background lock | S03.T05 |
| `src/pokesearch/scheduler.py` | Cron times and timezone | S08.T01 |
| `src/pokesearch/search/filters.py` | `SearchQuery` fields and SQL builder semantics (attack conditions AND-ed on the same attack; legality COALESCE; sorts) | S02.T09 |
| `src/pokesearch/search/nl_parser.py`, `synonyms.py`, `tests/test_nl_parser.py` | Extraction order, vocabulary, pt→en synonyms, 17 test phrases | S02.T10 |
| `src/pokesearch/search/fts.py` | Token rules, `"tok"*` syntax, column filters | S02.T08 |
| `src/pokesearch/search/service.py`, `tests/test_search.py` | OR fallback, set-name resolution, facets, stats; end-to-end cases | S02.T09, S02.T11 |
| `src/pokesearch/search/decks.py`, `tests/test_decks.py` | Quality weight, core cards, partners/lift, alternatives/similarity, export text | S03.T06 |
| `src/pokesearch/api/*.py`, `templates/*.html`, `static/*` | Routes, parameter buckets, screen contents, image fallback chain | S02.T11–T14, S03.T07–T08, S04.T17 |
| `src/pokesearch/sim/engine_adapter.py` | `convert_decklist` (L373–418), `run_game` loop, stall signature, end reasons, 60-card refusal (L444–447) | S03.T09, S04.T04, S04.T10 |
| `src/pokesearch/sim/status.py` | Damage pipeline order, special conditions, checkup, `HOOK_NAMES` (19 hooks), rulebook fixes, perf notes (L162, L201) | S04.T07, S04.T08, S05.T05 |
| `src/pokesearch/sim/effects.py` | 64 primitives, 10 combinators, 39 counters, 5 recipe types; edge semantics in docstrings | S05.T03, S05.T04 |
| `src/pokesearch/sim/attackops.py`, `attackgen.py`, `attack_effects.json` | 28 closed ops, 7 plus-conditions, sanity ranges; 412 classified attacks | S05.T03, S05.T09 |
| `src/pokesearch/sim/catalog.py`, `catalog_cards.py`, `cardfilters.py` | 262 recipes with rulings in comments; 11-step attack resolution; 25 filters | S05.T03, S05.T10 |
| `src/pokesearch/sim/cardspec.py` | Card → engine spec, prize parsing, evolution line | S04.T02 |
| `src/pokesearch/sim/verified.py`, `tests/test_verified.py`, `verified_cards.json` | Parts/evidence semantics, invariant | S05.T02, S05.T12 |
| `src/pokesearch/sim/audit.py`, `engine_fixes.json`, `lint.py`, `tests/test_lint.py` | Attribute audit; corrections as data; lint rules | S05.T01 (overrides), S05.T13 (lint warnings) |
| `src/pokesearch/sim/coverage.py` | Meta-copies denominator (slow query to precompute) | S05.T12 |
| `src/pokesearch/sim/testkit/__init__.py`, `tests/test_{abilities,tools_stadiums,effects,engine_cards,special_energy,attack_effects,rules}.py` | Helpers and the 136 verified parts to convert into scenarios | S04.T13, S05.T11 |
| `src/pokesearch/sim/pilot.py`, `frozen/planner_v*.py`, `policies.py`, `tests/test_pilot.py`, `tests/test_policies.py` | Knowledge model, profile, turn order, `need()`, prompt choice by zone; baseline heuristic | S06.T01–T04, S04.T11 |
| `src/pokesearch/sim/progress.py`, `benchmarks/regua_v5.json`, `benchmarks/HISTORICO.md`, `historico.jsonl` | Suite structure, CRC seeds, weighted CI, history format | S05.T16, S06.T08 |
| `src/pokesearch/sim/runner.py` | Wilson CI, ties = 0.5, worker pool | S04.T17 |
| `src/pokesearch/sim/optimizer.py`, `scripts/deck_optimize.py`, `benchmarks/otimizacao_dhelmise.md` | Move generation, two sieves, the documented failure (screening gains vanished) and the Dhelmise list used as acceptance | S07.T01–T05 |
| `src/pokesearch/sim/coach.py`, `benchmarks/COACH.md` | Critical-moment selection, closed verdicts, "opinion ≠ gain" | S07.T07 |
| `src/pokesearch/sim/twinleaf_import.py`, `tests/test_twinleaf_import.py` | Exact-printing matching against twinleafgg; translation rules | S08.T05 |
| `src/pokesearch/llm/backends.py`, `roles.py` | Provider abstraction, 429 handling | S08.T06 |
| `data/reports/cartas_standard.xlsx` | The user's rules spreadsheet (7 sheets; ~1,636 distinct sentences; 7 classification columns) | S05.T08 |
| `data/raw/` (164 MB) | Optional seed for the new raw cache (TCGdex 20k files) — cache, not database | S02.T03 |

## Legacy facts worth remembering

- Throughput: ~30 ms/game; 3,000 games in 133 s on 8 processes (22–40 games/s).
- Coverage: exact 94.7 %, proven 72.6 % of 2.3 M meta copies (12.6 points are Basic Energy); 632 cards implemented, 109 with proof.
- Meta concentration: the 200 most-played names ≈ 93.8 % of copies; ~100 cards lived only in the third-party engine (no recipe to import).
- Optimizer failure: screening gains +2.7..+4.6 pt became −2.2..+0.9 pt at confirmation; noise ≈ 3 pt at 1,200 games.
- Spreadsheet: 2,950 Standard cards × 38 columns; 13,004 id→text rows; parametrizing numbers/types shrinks ~1,574 sentences only to ~1,297 templates (long tail is real).
- twinleafgg clone at `C:\tmp\tw` (commit `b26ec9c`, MIT): 10,316 card files, 2,023 for SV/ME eras — oracle and translation source, not an engine.

[Docs index](../README.md) · [Business rules traceability](05-business-rules-traceability.md) · [Decision log](02-decision-log.md)
