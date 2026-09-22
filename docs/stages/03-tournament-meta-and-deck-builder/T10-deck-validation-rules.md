# S03.T10 — Deck validation rules

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 10 / 13 |
| Depends on | [S02.T06](../02-card-data-and-search/T06-load-cards.md), [S03.T09](T09-decklist-parser-and-exporter.md) |
| Unblocks | [S03.T11](T11-user-decks-schema-and-api.md) |
| Parallel with | [S03.T06](T06-meta-queries.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `cards` (supertype, subtypes, stage, regulation mark, `tcgdex_legal_standard`) — from [S02.T06](../02-card-data-and-search/T06-load-cards.md)
- `contract` `ResolvedDeck` — from [S03.T09](T09-decklist-parser-and-exporter.md)

## Outputs (proposed)
- `module` `@pokesearch/shared/decklist/validate.ts` (pure, takes resolved cards) — `validateDeck(deck, format) → { ok, errors: [{ code, message, cardIds }], warnings }` with codes `SIZE_NOT_60`, `COPY_LIMIT`, `NOT_LEGAL`, `NO_BASIC`, `ACE_SPEC_LIMIT`, `RADIANT_LIMIT`, `UNRESOLVED_LINE`, `REGULATION_MARK` — consumed by [S03.T11](T11-user-decks-schema-and-api.md)

## Initial objective
The user learns before any simulation whether a list is tournament-legal in Standard and exactly why not (closing legacy open item P4).

## Summary
- Rules: exactly 60 cards; ≤ 4 copies per card name except Basic Energy; every card legal (TCGdex Standard flag, with the regulation-mark set of the current rotation as a documented fallback); ≥ 1 Basic Pokémon; ≤ 1 `ACE SPEC`; ≤ 1 Radiant when the format has any; unresolved lines are errors.
- Data-driven: the legal regulation marks and the format live in a small config table/constant updated at rotation.

## Acceptance / verification
- [ ] Table-driven tests for each code; the legacy Dhelmise list validates `ok`.

## Notes for the elaboration pass
- Legacy: no validation existed (ESPECIFICACAO.md §4.2 'what the system does not validate').

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
