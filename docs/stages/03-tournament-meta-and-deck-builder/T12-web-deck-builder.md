# S03.T12 — Web: deck builder

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 12 / 13 |
| Depends on | [S02.T12](../02-card-data-and-search/T12-web-search-page.md), [S03.T11](T11-user-decks-schema-and-api.md) |
| Unblocks | [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) |
| Parallel with | [S03.T08](T08-web-meta-pages.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` `addToDeck(cardId)` hook and the search page as an embeddable panel — from [S02.T12](../02-card-data-and-search/T12-web-search-page.md)
- `contract` user-deck endpoints, diff and price — from [S03.T11](T11-user-decks-schema-and-api.md)

## Outputs (proposed)
- `module` routes `/builder`, `/builder/:deckId` — two-pane layout (search panel with filters | current list grouped by category with ± controls and counts), live validation panel (errors/warnings with card links), price total, coverage placeholders (filled by S05), paste-import dialog with per-line resolution feedback, version history with diffs, export/copy, 'evaluate' button placeholder (enabled by S04) — consumed by [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)

## Initial objective
Building or fixing a 60-card list is a fast loop: search, add, see legality and price change instantly, save a version with a note.

## Summary
- Local editing state; save creates a version (server computes the diff).
- Keyboard: `Enter` in the search box adds the first result; `+`/`−` on rows.

## Acceptance / verification
- [ ] Paste the Dhelmise list → 60/60 resolved, `ok`, price shown; change one card → save → diff shows `−1 …, +1 …`.

## Notes for the elaboration pass
- Legacy: no builder existed; projects were created from a concept or a tournament deck (`routes_sim.py`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
