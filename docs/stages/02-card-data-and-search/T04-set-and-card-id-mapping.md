# S02.T04 — Set and card id mapping between sources

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 4 / 14 |
| Depends on | [S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md) |
| Unblocks | [S02.T06](T06-load-cards.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `file` canonical sets/cards JSON — from [S02.T02](T02-fetch-pokemon-tcg-data.md)
- `file` TCGdex set list and set briefs — from [S02.T03](T03-fetch-tcgdex.md)

## Outputs (proposed)
- `module` `etl/idmap.ts` — `setIdCandidates(ptcgSetId) → string[]` (ordered), `normNumber(n)`, `matchCards(ptcgCards, tcgdexBrief) → Map<ptcgId, tcgdexId>` + unmatched lists — consumed by [S02.T06](T06-load-cards.md)
- `file` `packages/etl/idmap-overrides.json` — `{ sets: {}, cards: {} }` manual overrides
- `file` reports `RAW_CACHE_DIR/reports/idmap_unmatched_sets.csv`, `idmap_unmatched_cards.csv`

## Initial objective
Every canonical set and card is paired with its TCGdex counterpart by deterministic heuristics plus a small override file, and whatever cannot be paired is reported instead of silently dropped.

## Summary
- Set heuristics, in order: override → `sv(\d+)(pt5)?` → zero-padded + `.5` (`sv1→sv01`, `sv3pt5→sv03.5`) → same for `me` → `swsh(\d+)(pt5)?(tg|sv|gg)?` (`swsh12pt5→swsh12.5`, two-digit ending in 5 except 15 → `swsh45→swsh4.5`; gallery suffixes are separate TCGdex sets, try `base+suffix` then `base`) → fixed cases (`pgo→swsh10.5`, `sm115sv→sma`, `zsv10pt5→sv10.5b`, `rsv10pt5→sv10.5w`, `cel25c→cel25cc`) → `sm(\d+)` (`sm35→sm3.5`, `sm115→sm11.5`) → `mcd(\d{2})` (`2000+yy` + era) → `(sm\d+|swsh\d+)sv` recursion → `svp`, `sve` passthrough → identity.
- Card matching: per-card override → index TCGdex brief by `normNumber(localId)` (strip leading zeros/case: `TG01→tg1`) → unique → match; several → tie-break by lowercase name; leftovers → name fallback only when the name is unique on both sides.
- Pure functions, fully unit-tested (port the legacy `test_idmap.py` cases).

## Acceptance / verification
- [ ] Unit tests for every heuristic branch above.
- [ ] On the full data, unmatched sets ≤ 1 and unmatched cards ≤ 10 (legacy baseline: 0 sets, 6 alt-art cards of `cel25c`).

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/idmap.py` (184 lines) and `tests/test_idmap.py`.
- Known quirk: galleries (Trainer Gallery, Shiny Vault) are separate sets in TCGdex but part of the main set in pokemon-tcg-data (ESPECIFICACAO.md §6.2).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
