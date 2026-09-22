# S03.T08 — Web: meta pages (archetypes, decklists, deck detail)

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 8 / 13 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S02.T12](../02-card-data-and-search/T12-web-search-page.md), [S03.T07](T07-api-meta-endpoints.md) |
| Unblocks | — |
| Parallel with | [S03.T12](T12-web-deck-builder.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `contract` `+ deck` selection hook `addToSelection(cardName)` — from [S02.T12](../02-card-data-and-search/T12-web-search-page.md)
- `contract` meta endpoints — from [S03.T07](T07-api-meta-endpoints.md)

## Outputs (proposed)
- `module` routes `/meta` and `/decks/:id` — selection chips (≤ 6, mirrored in `localStorage`, nav badge), autocomplete with images and usage counts, format/window/sort selects, sync status bar with 'atualizar agora' (polls while running), archetype panels (share, best placing, top-8, win rate, core-card strip with avg counts), decklists table (placing, archetype, player/country, tournament + official chip, date, players, record), partners (Pokémon and Trainers, support %, lift tooltip, '+'), alternatives (printings with cheapest-legal highlight, evolution line, similar role); deck detail grouped Pokémon / Treinadores / Energias with ×N badges, price total + coverage %, unresolved warning, copy list, `.txt`, 'usar como base no construtor' link into the deck builder (route provided by the builder subtask of this stage)

## Initial objective
The user explores what is actually being played around any Pokémon they care about and can jump from any tournament list into the deck builder.

## Summary
- Selection state is the source of truth in the URL (`p` params) and mirrored to `localStorage`.
- Not in scope: LLM deck explanation (optional, later).

## Acceptance / verification
- [ ] Selecting two Pokémon shows archetypes containing both; deck detail totals match `getDeck`; copy button writes the export text.

## Notes for the elaboration pass
- Legacy reference: templates `decks.html`, `_deck_results.html`, `deck.html`, `static/decks.js`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
