# S02.T13 — Web: card detail page

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 13 / 14 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S02.T11](T11-api-cards-search-sets.md) |
| Unblocks | — |
| Parallel with | [S02.T12](T12-web-search-page.md), [S02.T14](T14-web-sets-page.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell, API client — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `contract` `GET /api/cards/:id`, `GET /api/cards/:id/prices` — from [S02.T11](T11-api-cards-search-sets.md)
- `file` `pokemon/src/pokesearch/templates/card.html` and `routes_ui.py::sparkline_svg` — the section inventory and the sparkline geometry; read-only reference

## Outputs (proposed)
- `module` route `/card/:id` — large image (webp high → png → small fallback), identity block (name, supertype · subtypes, set link, number/printed total, series, release date, rarity, regulation mark, artist → filtered search), stats (HP, types, stage, evolves from/to links, dex, retreat pills, weakness, resistance), abilities and attacks with energy-cost pills and damage, rules box, flavor, legality table (Standard/Expanded/Unlimited × pokemon-tcg-data vs TCGdex), variants, price table (source, variant, low/mid/high/market/trend/avg7/avg30, currency), 730-day price sparkline (inline SVG), 'other printings' strip, collapsible raw JSON, link to the JSON API

## Initial objective
Everything a player wants to know about one printing is on one page, in the official English wording, with legality and prices from both sources shown side by side and quick paths to other printings and related searches.

## Context

This page is the product's answer to "what does this card actually do, is it legal, and what does it cost". Three properties make it worth more than a link to an image.

**Official wording, verbatim.** The attack and ability text shown here is the same string that [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md) hashes into `effect_texts` and that the rules base is audited against (RN-05). If the page paraphrased, trimmed or re-punctuated anything, the user would be reading something different from what the engine executes. So the page renders `attacks[].text` and `abilities[].text` exactly as stored.

**Both sources side by side.** Legality comes from two places that disagree often enough to matter: the canonical `legal_standard` string and TCGdex's boolean. The search filter resolves the conflict with `COALESCE` ([S02.T09](T09-search-query-model-and-sql.md)); the page shows both columns and lets the user judge — a 3 × 2 table, exactly as the legacy did (RN-01 made visible).

**Prices with their date.** A price with no date is a rumour. The table header carries the snapshot date and the sparkline is explicitly "TCGplayer market USD" for one named variant, with a message when there are fewer than two points. The legacy note applies unchanged: history only starts at the first snapshot this installation took.

The legacy `card.html` is 117 lines of Jinja and its section list is complete; this subtask reproduces it in React with three improvements. Data arrives in **one** request (the legacy assembled the "other printings" strip inside the HTML route with an extra query and never exposed it over HTTP; [S02.T11](T11-api-cards-search-sets.md) now returns it). The sparkline becomes a **component** rather than a server-built SVG string, so hover and focus work without `dangerouslySetInnerHTML`. And every empty section is **hidden**, not rendered with dashes.

## Scope

- **In scope.** `apps/web/src/routes/card.$id.tsx` and its components (`CardIdentity`, `CardStats`, `AbilityBlock`, `AttackBlock`, `RulesBox`, `LegalityTable`, `VariantList`, `PriceTable`, `PriceSparkline`, `OtherPrintings`, `RawJsonDetails`); the energy pill vocabulary; the image fallback chain for the large image; deep links back into search; the pt-BR strings for this page; the 730-day history query.
- **Out of scope.** The API ([S02.T11](T11-api-cards-search-sets.md)); the search page ([S02.T12](T12-web-search-page.md)); the shell and `CardImage` ([S01.T08](../01-foundation/T08-web-skeleton.md)); rulings — no source provides them, and the page must not invent a section for them; coverage and rules-base status of the card ([S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md) owns that screen); adding the card to a deck ([S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask; it is where RN-01's "both documents preserved" becomes visible to the user.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T13-01 | Attack, ability, rules and flavor text are rendered verbatim from the API payload — no trimming, case change, re-punctuation or markdown interpretation. | the text nodes render `{value}` directly; no transform helper is applied | `card-page.spec.tsx > attack text renders byte-identically` for a fixture text containing `’`, `×` and a non-breaking space |
| BR-S02.T13-02 | Legality is shown as a 3 × 2 table (Standard / Expanded / Unlimited × pokemon-tcg-data / TCGdex); a missing value renders `—` and is never shown as "not legal". | `LegalityTable` mapping `null → '—'`, `1 → 'Legal'`, `0 → 'Não'` | `card-page.spec.tsx > null tcgdex legality renders an em dash, 0 renders Não` |
| BR-S02.T13-03 | A section with no data is hidden entirely; the page never shows a label with an empty value. | each section returns `null` when its data is empty | `card-page.spec.tsx > a Trainer shows no HP/types/retreat block`; `> a card with no flavor has no flavor node` |
| BR-S02.T13-04 | The large image follows `img_webp_high → img_large → img_small → placeholder`, each step triggered by an `error` event, and the layout never shifts. | `CardImage` with the ordered source list and a fixed `aspect-ratio: 245 / 337` | `card-image.spec.tsx > walks the whole chain on repeated errors`; `> stops at the first source that loads` |
| BR-S02.T13-05 | The sparkline is drawn only with at least two points; with fewer it is replaced by the explanatory message, never by an empty or single-point chart. | the `points.length > 1` guard in `PriceSparkline` | `card-page.spec.tsx > one snapshot renders the message, two render an svg` |
| BR-S02.T13-06 | The sparkline series is one variant of one source: TCGplayer market USD, preferring `normal`, then `holofoil`, then the first variant present; the chosen variant is named in the caption. | `chooseSeries(history)` | `sparkline.spec.ts > prefers normal over holofoil`; `> falls back to the first variant when neither exists` |
| BR-S02.T13-07 | The price table shows the snapshot date of the rows it displays, and every money cell carries its currency symbol (`US$` / `€`). | the section header reads `prices[0].snapshot_date`; `formatMoney(value, currency)` | `card-page.spec.tsx > header shows the snapshot date`; `> EUR rows render €` |
| BR-S02.T13-08 | The page invents no section: there is no rulings block, no "similar cards" block and no derived legality verdict. | component inventory fixed by this file | code review against the section list; `card-page.spec.tsx > rendered section headings match the expected list` |
| BR-S02.T13-09 | Identity fields that can be searched link to a pre-filtered search with `all_years=1`: set, artist, `evolves_from`. | `<Link to="/" search={{ set_name: setId, all_years: "1" }} />` and the artist/evolves equivalents | `card-page.spec.tsx > artist link targets /?artist=…&all_years=1` |
| BR-S02.T13-10 | Both raw documents are available on the page, collapsed, pretty-printed, and clearly labelled by source. | two `<details>` blocks fed by `raw_ptcg` / `raw_tcgdex` | `card-page.spec.tsx > both raw blocks exist and are collapsed by default`; `> tcgdex block is absent when the document is null` |
| BR-S02.T13-11 | An unknown card id renders the not-found state with a link back to search, not an error boundary. | the route's 404 branch on `ApiError.code === 'not_found'` | `card-page.spec.tsx > unknown id renders the not-found state` |
| BR-S02.T13-12 | All copy comes from `strings.ts`; card data is English by source and is never translated. | the `no-literal-strings` lint rule for `apps/web/src/routes` | `pnpm lint` fails on an inlined pt-BR literal in the route |

## Data operations

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Open a card | navigation from a search tile, the other-printings strip or a direct URL `/card/sv4pt5-54` | `GET /api/cards/:id` | full page renders; document title becomes `<name> · <set> #<number> · PokéSearch` |
| Load the price history | on mount, after the card query resolves | `GET /api/cards/:id/prices?days=730` | sparkline renders, or the "needs more than one snapshot" message |
| See all printings of this name | `Outras impressões de <name>` strip (≤ 12 thumbnails) | none (already in the payload) | each thumbnail links to `/card/:otherId` |
| Browse the whole set | set name link in the identity block | navigates to `/?set_name=<set_id>&all_years=1&sort=number` | search page filtered to the set, ordered by number |
| Find other cards by this artist | artist link | `/?artist=<artist>&all_years=1` | filtered search |
| Find the pre-evolution | `Evolui de` link | `/?name=<evolves_from>&all_years=1` | filtered search |
| Open the full-size image | link under the image | external CDN URL in a new tab (`rel="noopener"`) | the PNG (pokemon-tcg-data) or the WebP (TCGdex) |
| Inspect the raw data | the two `<details>` blocks | none (already in the payload) | pretty-printed JSON, collapsed by default |
| Open the JSON API for this card | the `API` link in the footer line | `GET /api/cards/:id` in a new tab | raw response |
| Copy the card id | click on the id in the footer line | none | id copied; a toast confirms |

The page performs no database operation of its own; both requests are reads served by [S02.T11](T11-api-cards-search-sets.md).

## Interfaces

**Route.** `apps/web/src/routes/card.$id.tsx`.

```tsx
export const Route = createFileRoute("/card/$id")({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(cardQuery(params.id)),
  errorComponent: CardErrorState,
  component: CardPage,
});
export const cardQuery = (id: string) => queryOptions({ queryKey: ["card", id], queryFn: …, staleTime: 5 * 60_000 });
export const priceHistoryQuery = (id: string, days = 730) =>
  queryOptions({ queryKey: ["card", id, "prices", days], queryFn: …, staleTime: 60 * 60_000 });
```

**Section inventory** (the complete list; BR-S02.T13-08 forbids additions without editing this file):

1. `CardImage` — large, fallback chain, plus the two CDN links below it.
2. `CardIdentity` — `name`, `supertype · subtypes`, set link, `#number/printed_total`, series, `release_date`, rarity, `marca <regulation_mark>`, `ilustração: <artist>` link.
3. `CardStats` (Pokémon only) — `HP`, type pills, `Estágio`, `Evolui de` link, `Evolui para`, `Pokédex #…`, `Recuo` pills (or `grátis`), `Fraqueza` pill + value, `Resistência` pill + value.
4. `AbilityBlock` per ability — `<type or 'Ability'>` tag, name, text.
5. `AttackBlock` per attack — cost pills, name, `damage_text`, text.
6. `RulesBox` — one paragraph per entry of `rules`.
7. flavor paragraph.
8. `LegalityTable` — 3 rows × 2 source columns, plus the variant list.
9. `PriceTable` + `PriceSparkline`.
10. `OtherPrintings` strip.
11. `RawJsonDetails` × 2.
12. footer line: `id`, `tcgdex`, link to the JSON API.

**Energy pills.** One vocabulary shared with [S02.T12](T12-web-search-page.md), lifted from the legacy `ENERGY_ABBR`: `Grass G · Fire R · Water W · Lightning L · Psychic P · Fighting F · Darkness D · Metal M · Fairy Y · Dragon N · Colorless C · Free 0`, each with a CSS class `en-<lowercased type>` carrying its colour token. `<EnergyPill type="Fire" />` renders the letter with an `aria-label` of the full English type name, so a screen reader says "Fire" and not "R".

**`PriceSparkline`.**

```tsx
interface SparklinePoint { date: string; value: number }
function chooseSeries(history: PriceHistoryRow[]): { variant: string; points: SparklinePoint[] };
function PriceSparkline(props: { points: SparklinePoint[]; variant: string;
  width?: number; height?: number }): JSX.Element | null;   // defaults 320 × 72
```

Geometry carried over from `sparkline_svg`: padding 6 px, the polyline at `stroke-width: 2` with round joins and caps, one invisible hover target of `r = 6` per point carrying a `<title>` of `date: value`, and a filled marker of `r = 4` on the last point. The SVG has `role="img"` and an `aria-label` naming the point count, the minimum and the maximum. A flat series (`max === min`) uses a span of 1 so the line is drawn through the middle instead of dividing by zero. Values are plotted as received; no smoothing, no interpolation of missing days.

**Money formatting.** `formatMoney(value, currency)` → `US$ 12,34` / `€ 9,80` using `Intl.NumberFormat('pt-BR')` with the source currency; `null` renders `—` inside the price table only (elsewhere the section is hidden).

**Strings.** `apps/web/src/strings/card.ts`: `Legalidade`, `Preços`, `Variantes:`, `Regras / efeito`, `Outras impressões de {name}`, `JSON bruto (pokemon-tcg-data)`, `JSON bruto (TCGdex)`, `Evolui de`, `Evolui para`, `Recuo`, `grátis`, `Fraqueza`, `Resistência`, `Estágio`, `Pokédex`, `Histórico TCGplayer ({variant}, preço de mercado, US$) — {n} snapshots`, `O histórico aparece a partir do segundo snapshot diário.`, `Sem preço (card não casado com o TCGdex).`, `Card não encontrado.`

## Implementation steps

1. Add the route, the card query and a minimal render of name + image with the fallback chain (BR-S02.T13-04).
2. Add `CardIdentity` with the three search links and the document title (BR-S02.T13-09).
3. Add `EnergyPill` and `CardStats`, hidden for non-Pokémon (BR-S02.T13-03).
4. Add `AbilityBlock`, `AttackBlock` and `RulesBox`, rendering text verbatim; spec the verbatim rule with an awkward fixture string (BR-S02.T13-01).
5. Add `LegalityTable` and `VariantList` with the three-state mapping (BR-S02.T13-02).
6. Add `PriceTable` with the snapshot-date header and currency formatting (BR-S02.T13-07).
7. Add the price-history query, `chooseSeries` and `PriceSparkline` with its accessibility attributes; spec the one-point and flat-series cases (BR-S02.T13-05, -06).
8. Add `OtherPrintings`, the two `RawJsonDetails` blocks and the footer line (BR-S02.T13-10).
9. Add the not-found state and wire `ApiError` (BR-S02.T13-11).
10. Move every label into `strings/card.ts`; run axe and a keyboard pass over the collapsible blocks and the sparkline (BR-S02.T13-12).

## Edge cases and error handling

- **A card with no prices** (never matched to TCGdex, or matched but unpriced). The whole price section renders only the sentence `Sem preço (card não casado com o TCGdex).`; no empty table, no sparkline, no zero values.
- **A card with exactly one price snapshot.** The table renders; the sparkline is replaced by `O histórico aparece a partir do segundo snapshot diário.` (BR-S02.T13-05).
- **A card priced only on Cardmarket.** The table shows the EUR rows with `€`; `chooseSeries` finds no TCGplayer USD series, so the sparkline shows the same "needs more snapshots" message — the chart is deliberately single-source so two currencies are never drawn on one axis.
- **The WebP URL 404s.** The `error` handler advances to `img_large`, then `img_small`, then the placeholder; each step happens once, guarded by a state index so a persistent failure cannot loop (BR-S02.T13-04).
- **A card with no image at all** (both sources missing the URL). The placeholder renders at the right aspect ratio with the card name as its alt text.
- **A Trainer or Energy card.** `CardStats` is hidden entirely (no HP, types, retreat, weakness, resistance); `RulesBox` usually carries the whole text. Attacks exist on some Energy cards and render normally.
- **An attack with `damage_text: '30×'`.** Rendered as `30×` next to the attack name; `damage_num`/`damage_mod` are not shown — they exist for filtering, not for display.
- **An attack with no damage** (a pure effect). The damage badge is omitted; the name and the text carry the block.
- **A card with 40 printings** (a basic energy). The strip shows the 12 the API returns, with a `ver todas` link to `/?name=<name>&all_years=1`.
- **`raw_tcgdex` is null.** Only the pokemon-tcg-data block renders; the TCGdex block is absent rather than empty (BR-S02.T13-10).
- **An unknown card id** (`/card/xx-999`). The not-found state with a link back to search; the URL is preserved so a typo can be corrected in place (BR-S02.T13-11).
- **A very long ability text.** The block wraps; no truncation and no "read more", because the exact text is the point of the page.
- **Narrow viewport.** The image moves above the body column, the price table scrolls horizontally inside its own container, and the sparkline keeps its 320 × 72 viewBox while scaling to the container width.

## Acceptance / verification

- [ ] `card-page.spec.tsx > fixture card renders every section` — for a Pokémon fixture with an ability, two attacks, weakness, resistance, rules, flavor, prices and other printings, all twelve sections of the inventory are present.
- [ ] `> a Trainer shows no HP/types/retreat block` and `> a card with no flavor has no flavor node` — missing data hides the section instead of showing empty labels (BR-S02.T13-03).
- [ ] `card-image.spec.tsx > walks the whole chain on repeated errors` — with a broken WebP URL the `img` ends on `img_small`, and with all three broken it ends on the placeholder (BR-S02.T13-04).
- [ ] `> attack text renders byte-identically` for a string containing `’`, `×` and a non-breaking space (BR-S02.T13-01).
- [ ] `> null tcgdex legality renders an em dash, 0 renders Não` (BR-S02.T13-02).
- [ ] `> one snapshot renders the message, two render an svg` (BR-S02.T13-05); `sparkline.spec.ts > prefers normal over holofoil` and `> flat series does not divide by zero` (BR-S02.T13-06).
- [ ] `> header shows the snapshot date` and `> EUR rows render €` (BR-S02.T13-07).
- [ ] `> artist link targets /?artist=…&all_years=1`, and the set link targets `/?set_name=…&all_years=1&sort=number` (BR-S02.T13-09).
- [ ] `> both raw blocks exist and are collapsed by default`; `> tcgdex block is absent when the document is null` (BR-S02.T13-10).
- [ ] `> unknown id renders the not-found state` with a working link back to `/` (BR-S02.T13-11).
- [ ] `> rendered section headings match the expected list` — no unexpected section, in particular no rulings block (BR-S02.T13-08).
- [ ] An axe run on the rendered page reports no critical or serious violation; the sparkline has an `aria-label` naming the point count and range; energy pills announce their full type name.

## Risks and open questions

- **Risk — the page paraphrases card text** through a well-meaning formatting helper. Mitigation: BR-S02.T13-01 with a deliberately awkward fixture string, plus the note that [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md) hashes the same text.
- **Risk — a price is read as "current" when it is weeks old.** Mitigation: the snapshot date is in the section header and the sparkline caption names the source, the variant and the point count; [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) alerts when the nightly price run stops.
- **Risk — images hotlinked from two CDNs break.** Accepted ([Vision and scope](../../project/01-vision-and-scope.md) puts a local mirror out of scope); the fallback chain degrades gracefully and both original URLs stay visible under the image.
- **Question — should the page show the card's rules-base status** (exact / proven coverage) once S05 exists? It would be one badge reading `card_status`. Recommendation: yes, as a small addition when [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) lands; it is deliberately absent now so the page ships without a dependency on S05. The owner of S05.T12 decides the badge wording.
- **Question — should the sparkline offer a source/variant switch** (TCGplayer vs Cardmarket, normal vs holofoil)? Recommendation: not until there are enough snapshots for the chart to be interesting; the data is already in the payload, so it is a component change. Revisit after the first month of nightly snapshots.

## References

- `pokemon/src/pokesearch/templates/card.html` — verified (117 lines): the section order reproduced in the inventory; the image `img_webp_high or img_large` with an `onerror` fallback to `img_large or img_small` and the two CDN links below it; the identity line with the set link `/?set_name={{ c.set_id }}&all_years=1`, `#{{ c.number }}/{{ c.printed_total }}`, rarity, `marca {{ c.regulation_mark }}` and the artist link; the stats block guarded by `c.supertype == 'Pokémon'` with `Recuo … grátis`; the 3 × 2 legality table with `pokemon-tcg-data` and `TCGdex` columns and the `—` placeholders; the price table columns `Fonte · Variante · Baixo · Médio · Alto · Mercado/Avg · Trend · Avg 7d · Avg 30d`; the sparkline caption and the `Histórico aparece após mais de um snapshot diário` message; `Sem preço (card não casado com o TCGdex).`; the `Outras impressões de {{ c.name }}` strip; the two `JSON bruto` `<details>` blocks and the footer `id · tcgdex · API` line.
- `pokemon/src/pokesearch/api/routes_ui.py` — verified: `sparkline_svg(points, width=320, height=72)` with padding 6, `stroke-width: 2`, round joins, `r = 6` hover circles carrying `<title>{date}: {value}</title>`, an `r = 4` last-point marker, the `role="img"` and `aria-label` naming the point count and the min/max, and the `span = (hi - lo) or 1.0` guard; `card_page` requesting `days=730`, filtering to USD sources and choosing the variant `normal → holofoil → first`, with `spark` rendered only when `len(chosen) > 1`; `ENERGY_ABBR` with the twelve letters quoted in Interfaces.
- `pokemon/src/pokesearch/search/service.py::get_card` — verified: the payload the page consumes (expanded `*_json`, attacks and abilities ordered by `idx`, `prices` from `cards_latest_price`, `price_history_days`).
- [S02.T11](T11-api-cards-search-sets.md) — the `CardDetail` payload including `other_printings`, and the `days` bounds on the price endpoint; [S01.T08](../01-foundation/T08-web-skeleton.md) — the shell, `CardImage`, `strings.ts` and the CSS tokens.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
