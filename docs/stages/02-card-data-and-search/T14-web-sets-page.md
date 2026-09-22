# S02.T14 — Web: sets page

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 14 / 14 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S02.T11](T11-api-cards-search-sets.md) |
| Unblocks | — |
| Parallel with | [S02.T12](T12-web-search-page.md), [S02.T13](T13-web-card-detail-page.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell, API client — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `contract` `GET /api/sets`, `GET /api/stats` — from [S02.T11](T11-api-cards-search-sets.md)
- `file` `pokemon/src/pokesearch/templates/sets.html` — the column inventory and the per-set search link; read-only reference

## Outputs (proposed)
- `module` route `/sets` — table: symbol, set name (→ search filtered by set, sorted by number), series, release date, PTCGO code, card count / total, Standard legality, TCGdex id; header with global counts and last price date

## Initial objective
A compact browse-by-set entry point that doubles as a sanity dashboard of what the ETL loaded.

## Context

The page has two audiences at once, which is why it is worth its own route rather than a facet on the search page.

For the **player**, it is the "browse by set" entry point: ≈174 rows, one click to every printing of a set ordered by collector number. That is how someone opens a new release or checks what a PTCGO code refers to.

For the **operator** — the same person, wearing the other hat — it is the cheapest possible ETL dashboard. Each row exposes the three facts that go wrong in ingestion: the **card count against the set's printed total** (a set at 240/252 means twelve cards failed to load or the source file is incomplete), the **TCGdex id** (empty means [S02.T04](T04-set-and-card-id-mapping.md) found no counterpart, so none of that set's cards has prices, variants or TCGdex legality), and the **release date** (a missing one means the filters that default to 2021+ will hide the set). The header adds the global counts and the last price snapshot date. The stage exit criterion — "`etl full` ends with ≈174 sets and ≈20.4k cards" — is verifiable by looking at this page.

The legacy `sets.html` is 20 lines and already has the right column set; this subtask reproduces it with client-side sorting, a real "incomplete" signal on the count cell, and no pagination — ≈174 rows render fine, and a sortable table beats a pager for this job. It is deliberately read-only: repairing anything it reveals is an `etl` command, not a button. A later operational screen ([S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)) owns run history and alerts.

## Scope

- **In scope.** `apps/web/src/routes/sets.tsx` and its components (`SetsHeader`, `SetsTable`, `SortableHeader`, `SetRow`); the client-side sort and its URL persistence; the per-set deep link into search; the `incomplete` and `no TCGdex` markers; the pt-BR strings for this page; the empty state for a database with no sets.
- **Out of scope.** The API ([S02.T11](T11-api-cards-search-sets.md)); set *detail* pages — the set link goes to a filtered search instead; ETL run history, error listing and alerts ([S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)); triggering an ETL run from the UI (not a requirement; the ETL is a CLI, [S02.T01](T01-etl-cli-and-raw-cache.md)); the shell and tokens ([S01.T08](../01-foundation/T08-web-skeleton.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T14-01 | The table shows every set the API returns, with no pagination and no client-side filtering that could hide a row. | `SetsTable` maps the full array; there is no slice and no filter input | `sets-page.spec.tsx > row count equals the API row count` for a 200-row fixture |
| BR-S02.T14-02 | A set name links to the search page filtered to that set, ordered by collector number, with the year filter disabled: `/?set_name=<id>&all_years=1&sort=number`. | the `<Link>` in `SetRow` | `sets-page.spec.tsx > set link targets the filtered search` and the target page returns that set's cards |
| BR-S02.T14-03 | The count cell shows `card_count` and, when `total` is present and differs, `/ total` plus an `incompleto` marker with the difference in its tooltip. | `CountCell` comparing `card_count` and `total` | `sets-page.spec.tsx > 240 of 252 renders the incompleto marker`; `> equal counts render no marker` |
| BR-S02.T14-04 | A set with no `tcgdex_id` shows `—` with the title `sem contrapartida no TCGdex: sem preços, variantes ou legalidade TCGdex`, so the consequence is stated, not just the gap. | `TcgdexCell` | `sets-page.spec.tsx > null tcgdex_id renders the em dash with the explanatory title` |
| BR-S02.T14-05 | Sorting is client-side, stable, and persisted in the URL (`?sort=<column>&dir=asc\|desc`), defaulting to `release_date` descending. | `useSortedRows` + `navigate({ search })` | `sets-page.spec.tsx > clicking Série sorts by series and updates the URL`; `> reloading the sorted URL keeps the order` |
| BR-S02.T14-06 | Nulls sort last in every column, in both directions, so a missing release date never floats to the top. | the comparator's `null` branch | `sets-page.spec.tsx > sets without a release date are last ascending and descending` |
| BR-S02.T14-07 | The header shows the global counts and the last price snapshot date from `/api/stats`; when there is no snapshot it shows `—`, never today's date. | `SetsHeader` reading `stats.last_price_date` | `sets-page.spec.tsx > empty price history renders an em dash in the header` |
| BR-S02.T14-08 | The page is read-only: it issues no `POST`, `PUT`, `PATCH` or `DELETE`, and offers no action that changes data. | the route imports only the two read queries | `pnpm lint` custom rule finds no mutation in `routes/sets.tsx`; `sets-page.spec.tsx > no non-GET request is issued` |
| BR-S02.T14-09 | The table is accessible: a real `<table>` with a `<caption>`, `<th scope="col">` headers, and `aria-sort` on the active column. | `SetsTable` markup | `sets-page.spec.tsx > active column has aria-sort`; axe reports no critical or serious violation |
| BR-S02.T14-10 | All copy comes from `strings.ts`; set names, series and PTCGO codes are source data and are never translated. | the `no-literal-strings` lint rule for `apps/web/src/routes` | `pnpm lint` fails on an inlined pt-BR literal in the route |

## Data operations

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Open the page | nav item `Sets` | `GET /api/sets` and `GET /api/stats` | header counts + the full table render |
| Browse a set's cards | set name link in the `Set` column | none (navigation) | `/?set_name=<id>&all_years=1&sort=number` — the search page filtered to that set, ordered by number |
| Sort by a column | click a `<th>` (Set · Série · Lançamento · Código · Cards · Standard · TCGdex) | none (client-side) | rows reorder; `?sort=…&dir=…` written to the URL; `aria-sort` moves to the active header |
| Reverse a sort | click the active `<th>` again | none | direction flips between `asc` and `desc`; the URL updates |
| See why a set has no prices | hover / focus the `—` in the TCGdex column | none | tooltip `sem contrapartida no TCGdex: sem preços, variantes ou legalidade TCGdex` |
| See how incomplete a set is | hover / focus the `incompleto` marker | none | tooltip `12 cards a menos que o total impresso (240/252)` |
| Check the corpus size | header line | `GET /api/stats` | `174 sets · 20.444 cards · preços de 2026-09-21` |
| Recover from an empty database | empty state under the header | none | message `Nenhum set carregado. Rode` + `pnpm etl full` in a `<code>` block |

The page reads no database entity directly; both calls are reads served by [S02.T11](T11-api-cards-search-sets.md), and it writes nothing (BR-S02.T14-08).

## Interfaces

**Route.** `apps/web/src/routes/sets.tsx`.

```tsx
export const Route = createFileRoute("/sets")({
  validateSearch: (raw): SetsPageParams => setsPageSchema.catch({ sort: "release_date", dir: "desc" }).parse(raw),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(setsQuery()),
    context.queryClient.ensureQueryData(statsQuery()),
  ]),
  component: SetsPage,
});

export const setsPageSchema = z.object({
  sort: z.enum(["name", "series", "release_date", "ptcgo_code", "card_count", "legal_standard", "tcgdex_id"])
        .default("release_date"),
  dir:  z.enum(["asc", "desc"]).default("desc"),
});
export const setsQuery  = () => queryOptions({ queryKey: ["sets"],  queryFn: …, staleTime: 10 * 60_000 });
export const statsQuery = () => queryOptions({ queryKey: ["stats"], queryFn: …, staleTime: 60_000 });
```

**Row shape** (from `GET /api/sets`, one row per set):

```ts
interface SetListRow {
  id: string; tcgdex_id: string | null; name: string; series: string | null;
  printed_total: number | null; total: number | null; release_date: string | null;
  ptcgo_code: string | null; legal_standard: string | null; legal_expanded: string | null;
  symbol_url: string | null; logo_url: string | null; card_count: number; updated_at: string;
}
```

**Columns**, in order, with their cell rendering:

| # | Header | Cell | Sort key |
|---|---|---|---|
| 1 | *(none)* | set symbol image, 20 px, `alt=""` (decorative), omitted when `symbol_url` is null | — |
| 2 | `Set` | `<Link>` on `name` + the set `id` in muted small text | `name` |
| 3 | `Série` | `series` or `—` | `series` |
| 4 | `Lançamento` | `release_date` (`YYYY-MM-DD`) or `—` | `release_date` |
| 5 | `Código` | `ptcgo_code` or empty | `ptcgo_code` |
| 6 | `Cards` | `card_count`, plus `/ total` and the `incompleto` marker when they differ | `card_count` |
| 7 | `Standard` | `legal_standard` (source wording: `Legal`, `Banned`, …) or empty | `legal_standard` |
| 8 | `TCGdex` | `tcgdex_id` or the annotated `—` | `tcgdex_id` |

**Components.**

```tsx
function SetsHeader(props: { stats: Stats }): JSX.Element;
function SetsTable(props: { rows: SetListRow[]; sort: SetsPageParams; onSort(key: string): void }): JSX.Element;
function SortableHeader(props: { label: string; sortKey: string; active: boolean;
  dir: "asc" | "desc"; onClick(): void }): JSX.Element;   // renders aria-sort
function CountCell(props: { count: number; total: number | null }): JSX.Element;
function TcgdexCell(props: { id: string | null }): JSX.Element;
```

**Comparator.** `compareBy(key, dir)` uses `localeCompare('pt-BR')` for strings, numeric comparison for `card_count`, ISO string comparison for `release_date`, and always puts `null`/`''` last regardless of direction (BR-S02.T14-06). The sort is stable, with `id` as the final tiebreak, so equal keys keep a deterministic order across re-sorts.

**Strings.** `apps/web/src/strings/sets.ts`: `Sets`, `Série`, `Lançamento`, `Código`, `Cards`, `Standard`, `TCGdex`, `incompleto`, `{n} cards a menos que o total impresso ({count}/{total})`, `sem contrapartida no TCGdex: sem preços, variantes ou legalidade TCGdex`, `{sets} sets · {cards} cards · preços de {date}`, `Nenhum set carregado. Rode`, `ordenar por {column}`.

## Implementation steps

1. Add the route with `validateSearch`, both queries and a plain unsorted table of the eight columns.
2. Add `SetsHeader` reading `/api/stats`, including the `—` fallback for a missing price date (BR-S02.T14-07).
3. Add the set link with its three search parameters (BR-S02.T14-02).
4. Add `CountCell` and `TcgdexCell` with their markers and tooltips (BR-S02.T14-03, -04).
5. Add `SortableHeader`, `useSortedRows` and the comparator with the null-last rule, persisting `sort`/`dir` in the URL (BR-S02.T14-05, -06).
6. Add the empty state and the loading skeleton.
7. Move every label into `strings/sets.ts`; add the `aria-sort`, `<caption>` and `scope="col"` markup and run axe (BR-S02.T14-09, -10).
8. Verify against the real database that the row count equals `/api/stats.sets` and that a set link lands on that set's cards.

## Edge cases and error handling

- **An empty database** (migrations applied, no ETL run). The table is replaced by the empty state naming `pnpm etl full`; the header shows `0 sets · 0 cards · preços de —`. No error, because this is the state right after setup.
- **A set with no TCGdex counterpart.** The TCGdex cell shows the annotated `—` (BR-S02.T14-04). On the legacy data this row set is empty (0 unmatched sets, verified in [S02.T04](T04-set-and-card-id-mapping.md)), so any row appearing here is a real regression signal.
- **A set whose `card_count` is below `total`.** The count cell shows `240 / 252` with the `incompleto` marker — typically a 404 on that set's card file ([S02.T02](T02-fetch-pokemon-tcg-data.md)) or an interrupted load.
- **A set whose `card_count` exceeds `total`.** Possible: `total` is the printed total, and secret rares push the real count higher. The marker only fires when `card_count < total`, so this common case is not flagged as a defect.
- **A set with no `release_date`** (promo sets sometimes lack one). It renders `—` and sorts last in both directions; the row is a reminder that the 2021+ default filter hides that set on the search page (BR-S02.T14-06).
- **A set with no `ptcgo_code`.** Empty cell. Not an error — many older and promo sets have none — which is why it shows nothing instead of `—`.
- **A missing set symbol image** (`symbol_url` null or 404). The cell is empty and the row height does not change, because the image slot has a fixed size.
- **`?sort=bogus` in a pasted URL.** `validateSearch`'s `catch` repairs it to `release_date desc` and the page renders normally.
- **Two sets released on the same day.** The stable sort plus the `id` tiebreak keeps a deterministic order, so re-sorting twice returns to the same arrangement.
- **The API answers 503 `schema_outdated`.** The shell's banner names `pnpm db:migrate`; the page shows no table rather than a partial one.
- **Narrow viewport.** The table scrolls horizontally inside its own container with the `Set` column sticky, so the name stays visible while scanning the other columns.

## Acceptance / verification

- [ ] `sets-page.spec.tsx > row count equals the API row count` — with the real database, the rendered row count equals `SELECT COUNT(*) FROM sets` and the header's `sets` number (BR-S02.T14-01).
- [ ] `> set link targets the filtered search` — clicking a set name navigates to `/?set_name=<id>&all_years=1&sort=number` and that page lists that set's cards ordered by number (BR-S02.T14-02).
- [ ] `> 240 of 252 renders the incompleto marker` with the difference in the tooltip; `> equal counts render no marker` (BR-S02.T14-03).
- [ ] `> null tcgdex_id renders the em dash with the explanatory title` (BR-S02.T14-04).
- [ ] `> clicking Série sorts by series and updates the URL`; `> reloading the sorted URL keeps the order` (BR-S02.T14-05).
- [ ] `> sets without a release date are last ascending and descending` (BR-S02.T14-06).
- [ ] `> empty price history renders an em dash in the header` (BR-S02.T14-07).
- [ ] `> no non-GET request is issued` while exercising every interaction on the page (BR-S02.T14-08).
- [ ] `> active column has aria-sort` and an axe run reports no critical or serious violation (BR-S02.T14-09).
- [ ] `> empty database renders the empty state` naming `pnpm etl full`.
- [ ] `pnpm lint` fails on an inlined pt-BR literal in `routes/sets.tsx` (BR-S02.T14-10).

## Risks and open questions

- **Risk — the page is mistaken for an operations console.** It shows a snapshot, not run history; a failed ETL run is invisible here. Mitigation: [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) owns `etl_runs` visibility and alerting, and this file states the boundary.
- **Risk — `card_count` vs `total` produces false alarms** on sets where the printed total excludes secret rares. Mitigation: the marker fires only when the count is *below* the total, and the tooltip states the exact difference so the user can judge.
- **Risk — client-side sorting stops scaling** if the set list grows far beyond ≈174 rows. Mitigation: at ten times the size it is still a single render; server-side sorting would be a `?sort=` parameter on `/api/sets`, a small change.
- **Question — should the page show `legal_expanded` too?** The API returns it. Recommendation: no — eight columns already crowd a narrow viewport, and Expanded is not a format the product simulates ([Vision and scope](../../project/01-vision-and-scope.md)). Add it only if the user asks.
- **Question — should a set row link to a set *detail* page** with its own card grid, rather than to a filtered search? Recommendation: keep the filtered search, since it reuses every filter and sort the user already knows and adds no route. Revisit if set-level facts (logo, release notes, price index) ever justify a page of their own.

## References

- `pokemon/src/pokesearch/templates/sets.html` — verified (20 lines): the header `Sets · {{ stats.sets }} sets · {{ stats.cards }} cards`; the eight columns in the order reproduced above; the set link `/?set_name={{ s.id }}&all_years=1&sort=number` with the set id shown in muted small text; the count cell `{{ s.card_count }}` plus `/ {{ s.total }}` only when `s.total and s.total != s.card_count`; `{{ s.legal_standard or '' }}`; `{{ s.tcgdex_id or '—' }}`; the decorative symbol image. Consult for the column inventory and the link shape.
- `pokemon/src/pokesearch/search/service.py::list_sets` — verified: `SELECT s.*, (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) AS card_count FROM sets s ORDER BY release_date DESC, id`, which fixes both the row shape and the default sort.
- `pokemon/src/pokesearch/search/service.py::stats` — verified: the seven keys the header uses, including `last_price_date = MAX(snapshot_date)` and the counts of sets and cards.
- [S02.T11](T11-api-cards-search-sets.md) — the `/api/sets` and `/api/stats` contracts; [S02.T05](T05-cards-schema-migration.md) — the `sets` columns, in particular `total`, `printed_total` and `tcgdex_id`; [S01.T08](../01-foundation/T08-web-skeleton.md) — the shell, navigation, `strings.ts` and the CSS tokens.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
