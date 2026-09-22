# S03.T04 — Decklist line resolver

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 4 / 13 |
| Depends on | [S02.T06](../02-card-data-and-search/T06-load-cards.md), [S03.T01](T01-tournaments-schema-migration.md) |
| Unblocks | [S03.T05](T05-decks-sync-and-prune.md), [S03.T09](T09-decklist-parser-and-exporter.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` populated `cards`, `sets` (`ptcgo_code`, `release_date`, legality flags) and the `norm()` rule — from [S02.T06](../02-card-data-and-search/T06-load-cards.md)
- `table` `deck_cards` shape (`match_kind`, `image_fallback_url`) — from [S03.T01](T01-tournaments-schema-migration.md)

## Outputs (proposed)
- `module` `etl/deck-resolver.ts` — `Resolver.fromDb(db, format)` building in-memory indexes; `resolve({ setCode, number, name, category }) → { cardId, matchKind, fallbackImageUrl }`; `nameKey(name)`, `speciesName(name)` ('Mega Venusaur ex' → 'Venusaur') — consumed by [S03.T05](T05-decks-sync-and-prune.md), [S03.T09](T09-decklist-parser-and-exporter.md)
- `file` `packages/etl/limitless-overrides.json` — set-code aliases `{ SVP: 'svp', 'PR-SV': 'svp', MEE: 'sve', SWSHP: 'swshp', 'PR-SW': 'swshp', SMP: 'smp', 'PR-SM': 'smp' }` and per-card overrides `{}`
- `contract` `image_fallback_url` = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/<CODE>/<CODE>_<NNN>_R_EN_XS.png`

## Initial objective
Any decklist line — from Limitless or pasted by the user — maps to a card id by the same deterministic order of rules (RN-02), and the rare unresolvable line keeps its name and a fallback image instead of disappearing.

## Summary
- Order: per-card override → set alias + normalized number → exact `(ptcgo_code, normalized number)` → digits-only number → name (`(supertype, name_key)`, newest printing legal in the format first; category's supertype tried first) → unresolved.
- Several candidates for one number: prefer same `name_key`, then newest `release_date`.
- `nameKey` = `norm()` + strip a trailing `(…)` + strip a leading `basic ` for energies — byte-identical with `cards.name_norm` conventions.
- Legacy facts: 982k lines resolved as exact 915,913 · override 66,547 (all from the `MEE`/`SVP` aliases) · name 93 · none 4.

## Acceptance / verification
- [ ] Unit tests: exact, gallery codes shared between sets, alias override, name fallback picks newest legal printing, unresolved keeps fallback image, `nameKey` cases.
- [ ] On real data, `match_kind = none` ≤ 0.001 % of lines.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/etl/deck_resolver.py` (165 lines) and `tests/test_deck_resolver.py`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
