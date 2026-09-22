# S02.T12 — Web: search page

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 12 / 14 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S02.T11](T11-api-cards-search-sets.md) |
| Unblocks | [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md), [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md) |
| Parallel with | [S02.T13](T13-web-card-detail-page.md), [S02.T14](T14-web-sets-page.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell, API client, image fallback pattern — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `contract` `GET /api/search`, `GET /api/facets`, `GET /api/stats` — from [S02.T11](T11-api-cards-search-sets.md)
- `file` `pokemon/src/pokesearch/templates/index.html` and `_results.html` — the eight filter groups, the tile layout and the pt-BR copy; read-only reference

## Outputs (proposed)
- `module` route `/` (`apps/web/src/routes/index.tsx`) — search box with pt-BR placeholder examples, 'interpretei como' chips, OR-fallback notice, sidebar filter groups (Período, Categoria, Tipo de energia, Números, Habilidade/ataque, Legalidade/marca/raridade, Série/set/artista, Ordenação + page size 24/48/96) auto-submitting on change, URL-synced state, results grid (image with fallback, name, set · number, HP, type pills, rarity · reg mark · price), pager, footer stats — consumed by [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md), [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)
- `contract` `+ deck` button hook on each Pokémon tile: emits `addToSelection(cardName)` (implemented by [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md)) and `addToDeck(cardId)` (implemented by [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md))

## Initial objective
The user searches by phrase or by filters and sees immediately how the phrase was understood, with results and pagination reflected in the URL so any search is shareable and the back button works.

## Context

This is the first screen of the product and the one the user opens most. It has to do three things the legacy did well and one it did badly.

Well: **one box that understands sentences**, with the interpretation shown as chips so a wrong guess is visible; **filters that prevail over the phrase**, so correcting one facet does not mean rewriting the sentence; and a **dense tile grid** that fits a lot of cards on screen (the legacy CSS locks images to `aspect-ratio: 245/337` in a `minmax(170px, 1fr)` grid, which [S01.T08](../01-foundation/T08-web-skeleton.md) carried over).

Badly: **state**. The legacy is one big `<form>` with `hx-get="/ui/results"`, `hx-trigger="submit, change from:.filters"` and `hx-push-url="true"`; the URL is updated by htmx, and `/ui/results` has to detect a non-htmx request and re-render the whole page to survive a reload. D-008 replaces that with TanStack Router: the URL *is* the state, validated by `SearchQuerySchema`, and the results are a TanStack Query keyed on it. A reload, a back button, a shared link and a bookmark then all behave identically without a special case.

The page is also where two later stages hook in. The `+ deck` button on each Pokémon tile exists here as a contract with no implementation: [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md) wires it to the archetype selection and [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md) to the deck builder. The legacy had the same button (`class="add-deck" data-add="{{ it.name }}"`, rendered only for `supertype == 'Pokémon'`), so the shape is proven.

All copy is pt-BR through the `strings.ts` module of [S01.T08](../01-foundation/T08-web-skeleton.md) (D-006); card data stays English because the sources have no pt-BR text.

## Scope

- **In scope.** `apps/web/src/routes/index.tsx` and its components (`SearchBox`, `InterpretationChips`, `FilterSidebar` with the eight groups, `ResultGrid`, `CardTile`, `Pager`, `FooterStats`, `EmptyState`); URL validation and synchronization; the facets and stats queries; the debounce and auto-submit behaviour; the `+ deck` event contract; the pt-BR strings for this page; keyboard and focus behaviour.
- **Out of scope.** The API ([S02.T11](T11-api-cards-search-sets.md)); parsing ([S02.T10](T10-natural-language-parser.md)); the card page ([S02.T13](T13-web-card-detail-page.md)) and the sets page ([S02.T14](T14-web-sets-page.md)); deck selection state and the deck builder ([S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md), [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)); the shell, navigation, tokens and `CardImage` ([S01.T08](../01-foundation/T08-web-skeleton.md)); saved searches — not a requirement.

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask. It is the UI face of RN-60: the interpretation shown here is always the deterministic parser's, available with no key.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T12-01 | Every piece of search state lives in the URL search params — phrase, every filter, `sort`, `page`, `page_size` — and nothing that affects results lives in component state. | TanStack Router `validateSearch: SearchGetQuerySchema`; all setters go through `navigate({ search })` | `search-page.spec.tsx > changing a filter updates the URL`; `> reloading a result URL reproduces the same page` |
| BR-S02.T12-02 | The interpretation is always visible when a phrase produced filters: one chip per interpreted fact, in the API's order, each removable. | `<InterpretationChips chips={data.interpretation.chips} />` rendered whenever `chips.length > 0` | `search-page.spec.tsx > phrase shows chips`; `> removing a chip drops exactly that filter from the URL` |
| BR-S02.T12-03 | A sidebar change overrides the phrase for that field and leaves the phrase in the box, so the user sees both the sentence and the correction. | the field setter writes the explicit param; `q` is never rewritten by a filter change | `search-page.spec.tsx > q stays in the box after a filter change` and the URL carries both |
| BR-S02.T12-04 | Changing a filter, the sort or the page size resets `page` to 1. | `setFilter()` always writes `page: 1` | `search-page.spec.tsx > filter change on page 3 returns to page 1` |
| BR-S02.T12-05 | Filter changes auto-submit (debounced 300 ms for text inputs, immediately for checkboxes, selects and dates); the phrase submits on Enter or on the button, never on every keystroke. | one `useDebouncedNavigate(300)` for text, direct navigation for discrete controls; `<form onSubmit>` for the box | `search-page.spec.tsx > typing in the box does not query`; `> checking a type queries once` |
| BR-S02.T12-06 | The OR fallback is announced: when `usedOrFallback` is true the page shows the warning line above the results. | the notice rendered from the response flag | `search-page.spec.tsx > usedOrFallback renders the aviso` |
| BR-S02.T12-07 | The default period is 2021+ and the "todos os anos" toggle is the only control that clears it; the toggle's state is derived from the URL, never from local state. | the checkbox bound to `all_years`, which the API maps to `release_from: null` | `search-page.spec.tsx > toggling todos os anos sets all_years=1 and widens the result count` |
| BR-S02.T12-08 | Every tile image uses the fallback chain `img_webp_low → img_small → placeholder`, and a broken image never leaves an empty box. | the shared `CardImage` component ([S01.T08](../01-foundation/T08-web-skeleton.md)) | `card-tile.spec.tsx > falls back to img_small on error`; `> placeholder when both are null` |
| BR-S02.T12-09 | The `+ deck` button appears only on `supertype === 'Pokémon'` tiles and emits the documented event; this page implements no deck state. | `<CardTile onAddToDeck>` calling the injected handler; no store in this route | `card-tile.spec.tsx > trainer tile has no + deck button`; `> click calls the injected handler once with the card id and name` |
| BR-S02.T12-10 | An invalid URL (`page_size=999`) is repaired to the defaults for the offending field, with a one-line notice, instead of rendering an error page. | `validateSearch` catch → defaults + `notice` state | `search-page.spec.tsx > invalid page_size in the URL renders results with a notice` |
| BR-S02.T12-11 | The results region announces itself to assistive technology: the count is in an `aria-live="polite"` region and the grid is a labelled list. | `role="status"` on the count line; `aria-label` on the grid | `search-page.spec.tsx > count line is aria-live`; axe check has no critical violations |
| BR-S02.T12-12 | All copy on this page comes from `strings.ts`; no pt-BR literal is inlined in a component. | eslint `no-literal-strings` restricted to `apps/web/src/routes` | `pnpm lint` fails on a fixture component containing a bare `"Buscar"` |

## Data operations

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Search by phrase | `SearchBox` input + `Buscar` button (placeholder: `Ex.: água com mais de 200 de HP que cura · ataque que descarta energia e causa 120+ · supporter que compra cartas`) | `GET /api/search?q=…` on submit | URL gains `q`; chips render under the box; grid and count update |
| Clear the phrase | the `×` inside the box | `GET /api/search` without `q` | `q` removed from the URL; chips disappear; filters stay |
| Remove one interpreted filter | chip `×` in `InterpretationChips` | `GET /api/search` with that field pinned to its default | that field leaves the URL; the phrase stays in the box |
| Set the period | `Período` group: `De` / `Até` date inputs, `todos os anos` checkbox | `GET /api/search?release_from=…&release_to=…` or `all_years=1` | immediate re-query; count updates; `page` → 1 |
| Choose a category | `Categoria` group: `supertype` select, `stage` select, 24 subtype checkboxes | `…&supertype=…&stage=…&subtypes=…` (repeated) | immediate re-query |
| Choose energy types | `Tipo de energia` group: 11 checkboxes with coloured pills | `…&types=Fire&types=Water` | immediate re-query |
| Set numeric bounds | `Números` group: `HP mín`, `HP máx`, `Dano mín`, `Custo máx`, `Recuo máx`, `Preço máx US$` | `…&hp_min=…&attack_damage_min=…&attack_cost_max=…&retreat_max=…&price_max_usd=…` | debounced 300 ms re-query |
| Filter by ability / attack | `Habilidade / ataque` group: `has_ability` select, `Texto da habilidade`, `Texto do ataque`, `Nome do ataque` | `…&has_ability=1&ability_text=…&attack_text=…&attack_name=…` | debounced re-query |
| Filter by legality / mark / rarity | `Legalidade / marca / raridade` group: two selects, mark checkboxes, top-16 rarity checkboxes | `…&legal_standard=1&regulation_marks=H&rarity=…` | immediate re-query |
| Filter by series / set / artist | `Série / set / artista` group: series checkboxes, `Set (nome/código)` text, `Artista` text, `Fraqueza a` select | `…&series=…&set_name=…&artist=…&weakness_type=…` | debounced for text, immediate for select |
| Change ordering | `Ordenação` group: `sort` select (relevância · mais recente · nome · maior HP · mais caro · mais barato · nº no set) | `…&sort=…` | immediate re-query; `page` → 1 |
| Change page size | `Ordenação` group: 24 / 48 / 96 select | `…&page_size=48` | immediate re-query; `page` → 1 |
| Page forward / back | `Pager` links `← anterior` / `próxima →` | `…&page=N` | grid replaced; the page scrolls to the top of the results |
| Open a card | tile click (whole tile is the link) | navigates to `/card/:id` ([S02.T13](T13-web-card-detail-page.md)) | full card page |
| Add a Pokémon to a deck | `+ deck` button on a Pokémon tile | none in this stage | emits `addToSelection(cardName)` / `addToDeck(cardId)` for [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md) / [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md); a toast confirms |
| Load the filter vocabulary | on mount | `GET /api/facets` (10-minute cache) | checkbox and select options are populated |
| Show the corpus size | footer line under the sidebar | `GET /api/stats` | `20.444 cards · 174 sets · N desde 2021 · preços de YYYY-MM-DD` |

No database entity is written or read directly: every operation above goes through the API (Architecture principle 2).

## Interfaces

**Route.** `apps/web/src/routes/index.tsx`, TanStack Router file-based.

```tsx
export const Route = createFileRoute("/")({
  validateSearch: (raw): SearchPageParams => searchPageSchema.catch(repairSearch).parse(raw),
  loaderDeps: ({ search }) => search,
  loader: ({ deps, context }) => context.queryClient.ensureQueryData(searchQuery(deps)),
  component: SearchPage,
});

export const searchPageSchema = SearchQuerySchema.partial()
  .extend({ q: z.string().max(300).optional(), all_years: z.enum(["0", "1"]).optional() });
export type SearchPageParams = z.infer<typeof searchPageSchema>;
```

**Query keys** (the conventions [S01.T08](../01-foundation/T08-web-skeleton.md) fixed): `["search", params]`, `["facets"]` (`staleTime: 10 * 60_000`), `["stats"]` (`staleTime: 60_000`). `placeholderData: keepPreviousData` on the search query, so the grid does not flash on a filter change.

**Components.**

```tsx
function SearchBox(props: { value: string; onSubmit(q: string): void; onClear(): void }): JSX.Element;
function InterpretationChips(props: { chips: string[]; filters: Partial<SearchQuery>;
  onRemove(field: keyof SearchQuery): void }): JSX.Element;
function FilterSidebar(props: { facets: Facets; value: SearchPageParams;
  onChange(patch: Partial<SearchPageParams>): void }): JSX.Element;
function ResultGrid(props: { items: CardListItem[]; onAddToDeck?(item: CardListItem): void }): JSX.Element;
function CardTile(props: { item: CardListItem; onAddToDeck?(item: CardListItem): void }): JSX.Element;
function Pager(props: { page: number; pages: number; onGo(page: number): void }): JSX.Element;
```

**The `+ deck` contract** (the `contract` output):

```ts
export interface DeckHooks {
  addToSelection?(cardName: string): void;   // implemented by S03.T08
  addToDeck?(cardId: string, cardName: string): void;   // implemented by S03.T12
}
export const DeckHooksContext = createContext<DeckHooks>({});
```

The tile renders `+ deck` only when `item.supertype === "Pokémon"` **and** at least one hook is present; in S02 no provider supplies one, so the button is absent until [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md) lands. The component and its test exist now so the later wiring is a provider, not a redesign.

**Tile contents** (all from one `/api/search` response, no second request): image, `name`, `set_name #number`, `HP` when present, type pills (`ENERGY_ABBR`-style single letters coloured by type), and a third line with `rarity · regulation_mark · US$ market_usd`.

**Sidebar groups**, in order, each a collapsible `<details>` with the first three open by default: `Período`, `Categoria`, `Tipo de energia`, `Números`, `Habilidade / ataque`, `Legalidade / marca / raridade`, `Série / set / artista`, `Ordenação`. Facet lists are truncated the way the legacy did — 24 subtypes, 16 rarities — with a `ver todos` disclosure.

**Strings.** `apps/web/src/strings/search.ts` holds every label quoted above plus: `Buscar`, `Interpretei como:`, `nenhum card com todas as palavras; mostrando qualquer uma`, `Nenhum card encontrado. Tente menos filtros, marque "todos os anos", ou use termos em inglês (os textos dos cards são em inglês).`, `← anterior`, `próxima →`, `adicionar à seleção de deck`.

**URL shape.** `/?q=pokémon+de+fogo&types=Fire&hp_min=200&sort=hp&page=2&page_size=48`. List fields repeat (`types=Fire&types=Water`); defaults are omitted from the URL so a shared link stays short and a future default change is picked up.

## Implementation steps

1. Add the route with `validateSearch`, the repair function and a bare grid rendering `/api/search`; confirm reload and back/forward work (BR-S02.T12-01, -10).
2. Add `SearchBox` with the pt-BR placeholder and submit-on-Enter; wire `q` into the URL (BR-S02.T12-05).
3. Add `InterpretationChips` with removal, using the chip strings from the API response and `activeFilters` for the mapping chip → field (BR-S02.T12-02, -03).
4. Add `CardTile` and `ResultGrid` on top of `CardImage`, including the type pills and the price line (BR-S02.T12-08).
5. Add `FilterSidebar` group by group, each wired to `onChange` with the `page: 1` reset and the right debounce class (BR-S02.T12-04, -05, -07).
6. Add `Pager`, the count line with `aria-live`, the OR-fallback notice and the empty state (BR-S02.T12-06, -11).
7. Add the footer stats line from `/api/stats`.
8. Add `DeckHooksContext`, the conditional `+ deck` button and its tests (BR-S02.T12-09).
9. Move every label into `strings/search.ts` and enable the lint rule (BR-S02.T12-12).
10. Run an axe accessibility pass and a keyboard pass (tab order box → chips → sidebar → grid → pager); fix what they report.

## Edge cases and error handling

- **Zero results.** The empty state shows the legacy's advice — fewer filters, "todos os anos", English terms — plus a one-click button that clears every filter but keeps the phrase.
- **Zero results with the OR fallback already applied.** The warning line and the empty state both show: the user learns that even the loosened query found nothing.
- **A phrase the parser did not understand at all** (`!!`). No chips; the box keeps the text; results are the default listing. A small hint says the phrase was not interpreted and is being used as free text — or, when even the residual is empty, that it was ignored.
- **`page=9` on a 3-page result.** The grid is empty, the pager shows `9 / 3` and a `voltar para a página 1` link; no error page, because stale bookmarks are normal.
- **`page_size=999` in a pasted URL.** Repaired to 24 with a notice `valor inválido para page_size; usando 24` (BR-S02.T12-10).
- **A tile image 404s.** `CardImage` falls back `img_webp_low → img_small → placeholder`; the layout does not shift because the aspect ratio is fixed.
- **A card with no price.** The third tile line omits the price entirely rather than showing `—`, so the grid stays scannable.
- **The API answers 503 `schema_outdated`.** A full-width banner says the database is behind and names `pnpm db:migrate`; the filters stay usable so the state is not lost.
- **The API is unreachable** (dev server not started). The shell's error boundary renders the offline state from [S01.T08](../01-foundation/T08-web-skeleton.md) with a retry button; the URL is untouched, so a retry resumes the same search.
- **Rapid typing in `HP mín`.** Debounced 300 ms; in-flight requests are cancelled by TanStack Query, and `keepPreviousData` prevents the grid from blanking between keystrokes.
- **A very long phrase** (> 300 characters). The input caps at 300 with a counter, so the API's 400 is never reached from the UI.
- **Narrow viewport.** The sidebar collapses into a `Filtros` disclosure above the grid; the grid falls to two columns at ~480 px. No horizontal scroll.

## Acceptance / verification

- [ ] `search-page.spec.tsx > typing a phrase and pressing Enter updates the URL and shows chips` — `?q=…` appears and `Interpretei como:` is rendered with at least one chip (BR-S02.T12-02).
- [ ] `> changing a filter re-queries without a full reload` — checking `Fire` issues exactly one `/api/search` request and adds `types=Fire` to the URL (BR-S02.T12-01, -05).
- [ ] `> reloading a result URL reproduces the same page` — a full remount of `/?q=…&types=Fire&page=2` renders the same items and the same chips (BR-S02.T12-01).
- [ ] `> filter change on page 3 returns to page 1` (BR-S02.T12-04); `> q stays in the box after a filter change` (BR-S02.T12-03).
- [ ] `> toggling todos os anos sets all_years=1` and the result count grows on the fixture data (BR-S02.T12-07).
- [ ] `> usedOrFallback renders the aviso` with the exact pt-BR string from `strings.ts` (BR-S02.T12-06).
- [ ] `> removing a chip drops exactly that filter from the URL` and leaves the others (BR-S02.T12-02).
- [ ] `card-tile.spec.tsx > falls back to img_small on error`, `> placeholder when both are null`, `> trainer tile has no + deck button`, `> click calls the injected handler once` (BR-S02.T12-08, -09).
- [ ] `> invalid page_size in the URL renders results with a notice` (BR-S02.T12-10).
- [ ] `> count line is aria-live` and an axe run on the rendered page reports no critical or serious violation (BR-S02.T12-11).
- [ ] `pnpm lint` fails on a component with an inlined pt-BR literal in `apps/web/src/routes` (BR-S02.T12-12).
- [ ] Manual check against the stage exit criterion: `pokémon de fogo com mais de 200 hp desde 2023` shows the chips `tipo Fire`, `HP ≥ 200`, `lançado desde 2023`, and every filter and sort of the legacy sidebar is reachable from the eight groups.

## Risks and open questions

- **Risk — the URL becomes unreadably long** with many repeated list parameters. Mitigation: defaults are omitted, list values are deduplicated, and the shared link is still valid; a short-link scheme is not worth a server-side store for a single local user.
- **Risk — auto-submit produces a request storm.** Mitigation: 300 ms debounce on text inputs only, cancellation through TanStack Query, `keepPreviousData` to avoid visual thrash; the request count is asserted in the tests.
- **Risk — chips and effective filters disagree** when the URL overrides the phrase. Mitigation: chips come from `interpretation.chips` and the sidebar reflects `interpretation.filters`, both from the same response, so the two are always the server's view; BR-S02.T12-03 keeps the phrase visible next to the correction.
- **Risk — the facet lists are truncated** (24 subtypes, 16 rarities) and the user cannot find a value. Mitigation: the `ver todos` disclosure shows the full facet list; the rarity filter is substring-based, so typing in the phrase also works.
- **Question — should the parser run client-side for instant chips** as the user types, before submitting? `@pokesearch/shared/nl` is browser-safe precisely to allow it ([S02.T10](T10-natural-language-parser.md), BR-S02.T10-11). Recommendation: yes, as a follow-up once the page is stable — render local chips while typing and replace them with the server's on submit. The user decides whether the extra motion is welcome.
- **Question — should the grid support infinite scroll** instead of a pager? Recommendation: keep the pager, because the page number is part of the shareable URL and the count is a useful sanity number. Revisit only if the user asks.

## References

- `pokemon/src/pokesearch/templates/index.html` — verified (119 lines): the single `<form>` with `hx-get="/ui/results"`, `hx-trigger="submit, change from:.filters"` and `hx-push-url="true"`; the pt-BR placeholder quoted above; the eight `<details>` groups in the order `Período`, `Categoria`, `Tipo de energia`, `Números`, `Habilidade / ataque`, `Legalidade / marca / raridade`, `Série / set / artista`, `Ordenação`; the `facets.subtypes[:24]` and `facets.rarities[:16]` truncations; the seven sort labels and the 24/48/96 page sizes; the footer stats line. Consult for the control inventory and the copy.
- `pokemon/src/pokesearch/templates/_results.html` — verified (55 lines): the `Interpretei como:` chip row, the OR-fallback chip text `nenhum card com todas as palavras; mostrando qualquer uma`, the count line, the tile markup (image `img_webp_low or img_small` with an `onerror` fallback to `img_small`, name, `set_name #number`, HP, type pills, `rarity · regulation_mark · price`), the `+ deck` button rendered only for `supertype == 'Pokémon'` with `data-add="{{ it.name }}"`, the pager links `← anterior` / `próxima →`, and the empty-state sentence quoted in Interfaces.
- `pokemon/README.md` L42–56 — verified: the example phrases used as the placeholder and the statement that sidebar filters prevail over the phrase interpretation.
- [S02.T11](T11-api-cards-search-sets.md) — the `/api/search`, `/api/facets` and `/api/stats` contracts and the `CardListItem` shape; [S01.T08](../01-foundation/T08-web-skeleton.md) — the shell, `strings.ts`, `CardImage`, the CSS tokens and the query-key conventions.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
