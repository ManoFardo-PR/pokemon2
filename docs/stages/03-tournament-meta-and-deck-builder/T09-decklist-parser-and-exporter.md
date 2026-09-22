# S03.T09 — Decklist text parser and exporter

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 9 / 13 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S03.T04](T04-deck-resolver.md) |
| Unblocks | [S03.T10](T10-deck-validation-rules.md), [S03.T11](T11-user-decks-schema-and-api.md) |
| Parallel with | [S03.T05](T05-decks-sync-and-prune.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/decklist` placeholder — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `module` resolver (`resolve`, `nameKey`) — from [S03.T04](T04-deck-resolver.md)

## Outputs (proposed)
- `contract` `@pokesearch/shared/decklist`: `parseDecklist(text) → { lines: [{ count, name, setCode, number, section }], warnings }`, `serializeDecklist(list) → string` (TCG Live format: `Pokémon: N` / `4 Dragapult ex TWM 130` / blank line between sections), `ResolvedDeck` type — consumed by [S03.T10](T10-deck-validation-rules.md), [S03.T11](T11-user-decks-schema-and-api.md)
- `module` `apps/api/src/decks/resolve-list.ts` — applies the resolver to parsed lines, maps basic energies (`MEE`/`SVE`, `Basic {Type} Energy`) — consumed by [S03.T10](T10-deck-validation-rules.md), [S03.T11](T11-user-decks-schema-and-api.md)

## Initial objective
Any list a player can copy from TCG Live or Limitless parses into structured lines and back into byte-identical text, with resolution to card ids reusing the same rules as the meta ingestion.

## Summary
- Skip blanks, `#` comments and section headers; a line needs `count` numeric and ≥ 4 tokens: `count`, `name…`, `SET`, `number`; section header (`Pokémon:/Trainer:/Energy:`) assigns the category when present, otherwise the card's supertype decides.
- Pure parsing in the shared package (browser-safe, used for instant feedback in the builder); resolution on the API side.

## Acceptance / verification
- [ ] Round-trip test on 20 real tournament exports: parse → serialize → identical text.
- [ ] Malformed lines produce warnings with line numbers, never exceptions.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/sim/engine_adapter.py::convert_decklist` (L373–418) and `search/decks.py::export_text`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
