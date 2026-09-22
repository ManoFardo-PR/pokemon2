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
- `doc` pt-BR UI strings module and the image fallback chain used by the card pages (D-006)

## Outputs (proposed)
- `module` routes `/meta` and `/decks/:id` — selection chips (≤ 6, mirrored in `localStorage`, nav badge), autocomplete with images and usage counts, format/window/sort selects, sync status bar with 'atualizar agora' (polls while running), archetype panels (share, best placing, top-8, win rate, core-card strip with avg counts), decklists table (placing, archetype, player/country, tournament + official chip, date, players, record), partners (Pokémon and Trainers, support %, lift tooltip, '+'), alternatives (printings with cheapest-legal highlight, evolution line, similar role); deck detail grouped Pokémon / Treinadores / Energias with ×N badges, price total + coverage %, unresolved warning, copy list, `.txt`, 'usar como base no construtor' link into the deck builder (route provided by the builder subtask of this stage)
- `module` `apps/web/src/meta/useSelection.ts` — the selection hook shared with the search page: URL as source of truth, `localStorage` mirror, nav badge count

## Initial objective
The user explores what is actually being played around any Pokémon they care about and can jump from any tournament list into the deck builder.

## Context

This is the first screen where the meta becomes a product rather than a table. The user picks up to six Pokémon — by typing, or with the `+ deck` button on any search result ([S02.T12](../02-card-data-and-search/T12-web-search-page.md)) — and the page answers four questions at once: which archetypes play all of them, which tournament lists exist, what else those lists play, and what the alternatives to each chosen card are. One request to `GET /api/meta/decks` ([S03.T07](T07-api-meta-endpoints.md)) returns all of it, so the page is one fetch and one shareable URL.

The legacy version proved two interaction rules worth keeping. **The URL is the state**: the selection lives in repeated `p` parameters, so a page can be bookmarked, shared and reloaded; `localStorage` only mirrors it, so the `+ deck` button and the nav badge know the selection when the meta page is closed. **The sync is visible**: a status bar shows when the window was last refreshed and offers "atualizar agora", which starts a background ETL run and polls while it runs — without it, a user looking at a three-week-old window has no way to know.

The deck detail page is the hand-off point of the stage: 60 cards as images with ×N badges, the estimated price with the share of cards that have one, a warning when a line could not be matched, the list as TCG Live text with a copy button, a `.txt` link, and the button that carries the list into the deck builder ([S03.T12](T12-web-deck-builder.md)). D-006 applies: all copy is pt-BR through the strings module, while code, props and tests are English.

## Scope

- **In scope.** `apps/web/src/routes/meta.tsx` and `apps/web/src/routes/decks.$id.tsx`; the `useSelection` hook (URL ↔ `localStorage` ↔ nav badge); the autocomplete input with debounce and keyboard handling; the sync status bar with polling; the archetype, decklist, partner and alternatives sections; the deck detail layout with copy/export/builder actions; loading, empty and error states; the pt-BR strings for all of it.
- **Out of scope.** The endpoints and all query semantics ([S03.T07](T07-api-meta-endpoints.md), [S03.T06](T06-meta-queries.md)); the builder itself ([S03.T12](T12-web-deck-builder.md)); the comparison view ([S03.T13](T13-deck-comparison-with-tournament-lists.md)); the search page and card detail ([S02.T12](../02-card-data-and-search/T12-web-search-page.md), [S02.T13](../02-card-data-and-search/T13-web-card-detail-page.md)); an LLM deck explanation, which the legacy had and this stage deliberately does not (RN-60: nothing on the critical path).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It renders RN-03's window and must make that window legible — which is why the window statistics and the sync freshness are part of the page, not a footnote.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S03.T08-01 | The selection is the `p` parameters of the URL; every add, remove and reorder rewrites the URL first, and the component renders from it. `localStorage["meta.selection"]` is written after, never read while the URL carries a selection. | `useSelection()` in `apps/web/src/meta/useSelection.ts` | `use-selection.spec.tsx > url is the source of truth` — pushing a state then reloading the route restores the same chips; a divergent `localStorage` value is overwritten |
| BR-S03.T08-02 | At most 6 Pokémon can be selected; the 7th attempt is refused with the pt-BR message `No máximo 6 Pokémon.` and does not modify the URL. | the cap in `useSelection.add()` | `use-selection.spec.tsx > cap` — the 7th add leaves 6 chips and shows the message |
| BR-S03.T08-03 | The autocomplete requests `GET /api/meta/suggest` at most once per 250 ms of typing and never for a query shorter than 2 characters; `Enter` adds the first suggestion, or the typed text when there is none. | the debounced query in the picker component | `meta-page.spec.tsx > autocomplete` — typing `dra` fires one request; typing `d` fires none; `Enter` adds the first item |
| BR-S03.T08-04 | While `GET /api/meta/status` reports `status: "running"`, the status bar polls every 5 s and disables "atualizar agora"; polling stops as soon as the status leaves `running`, and never runs when the tab is hidden. | the polling query's `refetchInterval` plus a `visibilitychange` guard | `meta-page.spec.tsx > sync polling` — 3 polls while running, 0 after `done`, 0 while hidden |
| BR-S03.T08-05 | Clicking "atualizar agora" posts `POST /api/meta/refresh`; a 202 shows `Atualização iniciada.` and a 409 shows the reason (`já em execução` / `aguarde alguns minutos entre atualizações`) without clearing the page. | the refresh mutation's `onSuccess`/`onError` | `meta-page.spec.tsx > refresh feedback` — both responses render their message and leave the results mounted |
| BR-S03.T08-06 | Every card image uses the chain `img_webp_low → img_small → image_fallback_url → name-only tile`, falling through on the image's `error` event at most once per step. | the shared `<CardImage>` component ([S02.T13](../02-card-data-and-search/T13-web-card-detail-page.md)) | `card-image.spec.tsx > fallback chain` — a failing primary source renders the secondary, then the Limitless CDN URL, then the text tile |
| BR-S03.T08-07 | The deck detail shows the copy total, the per-category counts, the price as `≈ US$ <total>` with `(<n>% das cartas com preço)`, and, when `unresolved > 0`, a warning chip naming the count — the price is never presented as exact when coverage is below 100 %. | the `DeckSummary` component | `deck-detail.spec.tsx > summary` — a fixture with 6 unpriced copies renders `90% das cartas com preço` and the warning chip |
| BR-S03.T08-08 | "copiar lista" writes the exact export text to the clipboard and confirms with `copiado!` for 1.5 s; the `.txt` link points at `GET /api/decks/:id/export.txt`, so both paths deliver identical bytes. | the copy handler and the anchor `href` | `deck-detail.spec.tsx > copy` — the clipboard receives the same string the `.txt` endpoint returns |
| BR-S03.T08-09 | All user-visible text comes from the pt-BR strings module; no literal user-facing string appears in a component file. | eslint rule `no-literal-jsx-text` scoped to `apps/web/src` ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a component with an inline pt-BR label |
| BR-S03.T08-10 | The page never queries the database and never re-implements a formula: shares, lift, prices and core-card inclusion are rendered as delivered by the API. | the route modules import only the generated API client | code review; `meta-page.spec.tsx` runs entirely against a mocked client |

## Data operations

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Add a Pokémon by typing | picker input + suggestion list (image, name, usage count) | `GET /api/meta/suggest?q=&format=&days=` (debounced 250 ms) | chip appended, URL `p` rewritten, results refetched; `Enter` takes the first suggestion |
| Add a Pokémon from search results | `+ deck` button on a search card | none (local) | `addToSelection(cardName)` from [S02.T12](../02-card-data-and-search/T12-web-search-page.md) updates the mirror and the nav badge; opening `/meta` restores it |
| Remove a Pokémon | `×` on a chip | none (local) | chip removed, URL rewritten, results refetched |
| Change format / window / sort | three selects (`Formato`, `Janela` 30/60/90/180, `Ordenar` melhores / mais recentes / melhor colocação) | `GET /api/meta/decks` with the new parameters | the whole result block refetches; the echoed `sort`/`days` re-sync the selects |
| See the meta window state | status bar (last sync, tournament/deck/archetype counts, newest event date) | `GET /api/meta/status` (poll 5 s while running) | freshness line; spinner and disabled button while running |
| Refresh the meta | `atualizar agora` button | `POST /api/meta/refresh` | 202 → `Atualização iniciada.`; 409 → the returned reason; polling starts |
| Read an archetype panel | panel card (share %, best placing, top-8, win rate, core-card strip with avg counts) | data from `GET /api/meta/decks` | clicking a core card opens the card detail ([S02.T13](../02-card-data-and-search/T13-web-card-detail-page.md)) |
| Open a tournament list | row of the decklists table (placing, archetype, player/country, tournament + `oficial` chip, date, players, record) | navigate to `/decks/:id` | deck detail page |
| Add a partner to the selection | `+` on a partner row (support %, `lift` in the tooltip, avg copies) | none (local) | the partner becomes a chip; the results narrow |
| Explore alternatives | alternatives block per selected Pokémon (printings with the cheapest-legal highlight, evolution line, similar role with reasons) | data from `GET /api/meta/decks` | each printing links to the card detail |
| Open a deck | route `/decks/:id` | `GET /api/decks/:id` | grouped `Pokémon` / `Treinadores` / `Energias` with ×N badges, summary chips, export block |
| Copy the list | `copiar lista` | none (uses the `export` field of the response) | clipboard write, `copiado!` for 1.5 s |
| Download the list | `.txt` link | `GET /api/decks/:id/export.txt` | plain-text file in a new tab |
| Start a deck from this list | `usar como base no construtor` | `POST /api/user-decks/from-tournament/:deckId` ([S03.T11](T11-user-decks-schema-and-api.md)) | navigates to `/builder/:deckId` ([S03.T12](T12-web-deck-builder.md)) |
| Go back to the selection | `← voltar aos decks` | none | returns to `/meta` with the selection intact, because it lives in the URL |

## Interfaces

**Routes.** `/meta` (search params `p` repeatable, `format`, `days`, `sort`) and `/decks/$id` (path parameter is the URL-encoded deck id). Both are TanStack Router routes with loaders that prefetch through TanStack Query, so a reload renders from cache and refetches in the background.

```ts
// apps/web/src/meta/useSelection.ts
export const SELECTION_KEY = "meta.selection";
export const MAX_SELECTION = 6;
export interface Selection {
  names: string[];                       // in URL order
  add(name: string): { ok: boolean; reason?: "max" | "duplicate" };
  remove(name: string): void;
  clear(): void;
}
export function useSelection(): Selection;          // URL first, localStorage mirror (BR-S03.T08-01)
export function useSelectionBadge(): number;        // nav badge, reads the mirror only
```

**Components.** `MetaPage` → `SelectionChips`, `PokemonPicker`, `MetaFilters`, `SyncStatusBar`, `ArchetypePanels`, `DecklistTable`, `PartnerList` (×2), `AlternativesBlock`. `DeckDetailPage` → `DeckHeader`, `DeckSummary`, `DeckGrid` (×3), `ExportBlock`. All of them are presentational over the API types generated from the zod schemas of [S03.T07](T07-api-meta-endpoints.md).

**pt-BR labels** (in `apps/web/src/i18n/pt-BR.ts`, quoted here because they are the product's copy): `Decks`, `escolha Pokémon e veja decks reais, parceiros e alternativas`, `Nenhum Pokémon escolhido ainda.`, `No máximo 6 Pokémon.`, `Formato`, `Janela`, `<n> dias`, `Ordenar`, `melhores`, `mais recentes`, `melhor colocação`, `atualizar agora`, `Atualização iniciada.`, `já em execução`, `aguarde alguns minutos entre atualizações`, `nunca sincronizado`, `Sem arquétipo`, `oficial`, `participação`, `melhor colocação`, `top 8`, `aproveitamento`, `cartas core`, `parceiros`, `alternativas`, `pré-evolução`, `evolução`, `mais barata legal`, `Pokémon`, `Treinadores`, `Energias`, `<n> cartas`, `≈ US$ <total>`, `(<n>% das cartas com preço)`, `<n> carta(s) sem correspondência na base`, `copiar lista`, `copiado!`, `.txt`, `usar como base no construtor`, `← voltar aos decks`.

**Empty, loading and error states.** No selection → the filters and the status bar render, the result block shows `Nenhum Pokémon escolhido ainda.` with the window statistics. Selection with no decks → `Nenhum deck da janela contém esses Pokémon.` plus a hint to widen `Janela`. Fewer than 3 decks → the partners block renders `amostra pequena (<n> decks)` instead of a table. Request error → an inline retry panel; the selection chips stay mounted so the state is never lost.

## Implementation steps

1. Generate the API client types from the JSON Schema exported by [S03.T07](T07-api-meta-endpoints.md); no hand-written response types.
2. Build `useSelection` with URL-first semantics, the 6-item cap and the `localStorage` mirror; unit-test it before any page uses it.
3. Build the `/meta` shell: chips, picker with debounce, the three filters, and the single `GET /api/meta/decks` query.
4. Add `SyncStatusBar` with polling, the refresh mutation and the three message states.
5. Add `ArchetypePanels` and `DecklistTable`, including the `oficial` chip driven by the `official` flag.
6. Add both `PartnerList`s with the `+` action and the lift tooltip, and the small-sample state.
7. Add `AlternativesBlock` (printings with the cheapest-legal highlight, evolution line with its relation labels, similar cards with their reasons).
8. Build `/decks/:id`: header, summary chips, three grids with ×N badges and the shared `<CardImage>`, the export block with copy and `.txt`.
9. Wire `usar como base no construtor` behind a capability check so the page ships before [S03.T12](T12-web-deck-builder.md) exists and enables the button when the route is registered.
10. Add the accessibility pass: chips and `+`/`×` are buttons with labels, the picker is a combobox with `aria-activedescendant`, the decklists table has a caption, and every image has an `alt`.

## Edge cases and error handling

- **The user tries to add a 7th Pokémon** → the add is refused, `No máximo 6 Pokémon.` appears next to the picker, and the URL is untouched, so a shared link never carries 7 parameters.
- **`localStorage` holds a selection while the URL carries a different one** (an old tab) → the URL wins and the mirror is rewritten; only an empty URL with a non-empty mirror triggers a redirect to `/meta?p=…`.
- **`localStorage` is unavailable** (private window, blocked storage) → every read and write is wrapped in `try`/`catch`; the page works fully from the URL and the nav badge simply shows nothing.
- **A sync is running when the page loads** → the status bar starts in the running state, the button is disabled, polling begins immediately, and the results block still renders the current (pre-sync) data instead of a spinner.
- **The browser tab is hidden while a sync runs** → polling pauses on `visibilitychange` and resumes on focus, so a forgotten tab does not poll for hours.
- **A card image 404s** (a fallback CDN URL for an unresolved line) → the chain falls through to the name-only tile; the layout does not shift because the tile occupies the card's aspect ratio.
- **A deck with unresolved lines** → those cards render as name tiles inside their category grid, and the summary shows `<n> cartas sem correspondência na base`; the export still contains the lines.
- **A deck whose price coverage is 0** (no priced card) → the price chip is hidden entirely rather than showing `≈ US$ 0,00`, which would read as "free".
- **A deck id containing spaces or accents** (`api:1234:Ana Souza`) → encoded with `encodeURIComponent` in every link; the route decodes once, matching [S03.T07](T07-api-meta-endpoints.md) BR-S03.T07-04.
- **The clipboard API is unavailable** (non-secure context) → the copy button falls back to selecting the `<pre>` content and shows `selecione e copie`, instead of failing silently.
- **A window with zero tournaments** (fresh install, ETL never run) → the status bar shows `nunca sincronizado` with the "atualizar agora" button as the primary action, and the result block explains that the meta is empty rather than showing zeros.

## Acceptance / verification

- [ ] `pnpm --filter web test -t "meta-page"` and `-t "deck-detail"` green against a mocked API client built from the exported JSON Schema.
- [ ] `meta-page.spec.tsx > two Pokémon`: selecting two Pokémon renders archetype panels that contain both, and the decklists table lists only the matching deck (stage exit criterion).
- [ ] `use-selection.spec.tsx > url is the source of truth` and `> cap`: reload restores the chips from `p`, and the 7th add is refused with the pt-BR message (BR-S03.T08-01, -02).
- [ ] `meta-page.spec.tsx > autocomplete`: `dra` fires exactly one `GET /api/meta/suggest` within 250 ms, `d` fires none, `Enter` adds the first suggestion (BR-S03.T08-03).
- [ ] `meta-page.spec.tsx > sync polling` and `> refresh feedback`: polling runs only while `running` and only while visible; 202 and 409 each render their message (BR-S03.T08-04, -05).
- [ ] `deck-detail.spec.tsx > summary`: totals match `getDeck`, the coverage percentage matches `priceCoverage`, and the unresolved chip appears exactly when `unresolved > 0` (BR-S03.T08-07).
- [ ] `deck-detail.spec.tsx > copy`: the clipboard receives the same text the `.txt` endpoint returns, and the button shows `copiado!` for 1.5 s (BR-S03.T08-08).
- [ ] `card-image.spec.tsx > fallback chain`: the four-step chain is exercised end to end (BR-S03.T08-06).
- [ ] `pnpm lint` fails on a component containing an inline pt-BR literal and passes once it moves to the strings module (BR-S03.T08-09).
- [ ] Manual, against the real database: `/meta?p=Dragapult%20ex&p=Dusknoir` renders panels, lists, partners and alternatives; opening a list shows 60 cards with images, the price total and the copy button; `usar como base no construtor` reaches the builder once [S03.T12](T12-web-deck-builder.md) is done.

## Risks and open questions

- **Risk — the builder route does not exist yet.** `usar como base no construtor` targets a route owned by [S03.T12](T12-web-deck-builder.md), which is parallel with this subtask. Mitigation: the button sits behind a capability check (route registered?) and renders disabled with a tooltip until then, so this page ships without a broken link.
- **Risk — one heavy response makes the page feel slow** with 6 Pokémon selected. Mitigation: TanStack Query keeps previous data while refetching, sections render progressively from the single payload, and the decklists table is virtualised past 50 rows.
- **Risk — the `localStorage` mirror diverges** across tabs and confuses the nav badge. Mitigation: the mirror is written on every URL change and a `storage` listener refreshes the badge; the URL always wins on load (BR-S03.T08-01).
- **Question — should the meta page keep a deck-explanation feature?** The legacy had an LLM "explicar com IA" button. Recommendation: leave it out of S03 (RN-60 keeps LLMs off the critical path); the user decides whether it returns in [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md).
- **Question — which windows should `Janela` offer?** The legacy offered 30/60/90/180 while the API clamps to 7–365. Recommendation: keep the four presets and let the URL carry any clamped value, so `days=14` works. The user confirms on first use.

## References

- `pokemon/src/pokesearch/templates/decks.html` — verified: the selection chips with hidden `p` inputs, the picker with a 250 ms debounce and a focus trigger, and the three selects `Formato` / `Janela` (30, 60, 90, 180) / `Ordenar`, plus the status block and the results block.
- `pokemon/src/pokesearch/static/decks.js` — verified: `KEY = "decks.sel"`, `MAX = 6`, the `alert("No máximo 6 Pokémon.")` cap, the nav badge and its link built from the stored names, `Enter` adding the first suggestion (or the typed text), the `data-copy` handler writing to the clipboard and showing `copiado!` for 1.5 s, and the redirect from an empty URL to `/decks?p=…` when the mirror is non-empty.
- `pokemon/src/pokesearch/templates/deck.html` — verified: the header line (placing, player, country, tournament, date, players, format, record, source link), the summary chips (`<n> cartas`, `Pokémon`, `Treinadores`, `Energias`, `≈ price` with `(<n>% das cartas com preço)`, the warning chip `<n> cartas sem correspondência na base`), `copiar lista`, the `.txt` link, the three grids with `×N` badges, the `onerror` image fallback, and the `<pre>` block holding the TCG Live text.
- `pokemon/README.md` L80–89 — verified: the screen's four blocks (archetypes with core cards, decklists ranked by quality, partners, alternatives) as the legacy described them.
- [S03.T07](T07-api-meta-endpoints.md) — the six endpoints and their response shapes; [Decision log](../../project/02-decision-log.md) D-006 (pt-BR UI, English code) and D-008 (React 19, Vite, TanStack Router/Query).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
