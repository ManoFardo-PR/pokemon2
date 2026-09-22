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
- `module` `parseDecklist`, `serializeDecklist`, `validateDeck` from `@pokesearch/shared` — the same pure functions the server runs, used here for instant feedback

## Outputs (proposed)
- `module` routes `/builder`, `/builder/:deckId` — two-pane layout (search panel with filters | current list grouped by category with ± controls and counts), live validation panel (errors/warnings with card links), price total, coverage placeholders (filled by S05), paste-import dialog with per-line resolution feedback, version history with diffs, export/copy, 'evaluate' button placeholder (enabled by S04) — consumed by [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)
- `module` `apps/web/src/builder/useDeckDraft.ts` — the local editing state (lines, dirty flag, undo of the last change) that the save action turns into a version

## Initial objective
Building or fixing a 60-card list is a fast loop: search, add, see legality and price change instantly, save a version with a note.

## Context

The legacy project had **no deck builder**. A list could only be created from a concept (Pokémon names, from which the optimizer generated 60 cards) or copied from a tournament deck; no screen let a human edit a list card by card. This subtask is new work, and its shape is dictated by what comes after: [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) evaluates a *version*, so the builder's job is to make producing a good version cheap.

The loop has to be tight. Every edit re-runs validation and the price locally — both are pure functions in `@pokesearch/shared` ([S03.T09](T09-decklist-parser-and-exporter.md), [S03.T10](T10-deck-validation-rules.md)) — so the user sees "59 cartas" and "5 cópias de Ultra Ball" without a round trip. The server recomputes both on save and stores its own report, because the stored report must reflect the card data at save time rather than the browser's cache; when the two disagree, the server wins and the panel refreshes.

The second requirement is the paste dialog, which is how a real list enters the system: the user copies from TCG Live or from a tournament list ([S03.T08](T08-web-meta-pages.md)), pastes 60 lines, and needs to see per line whether it matched exactly, by an alias, by name, or not at all — precisely the `matchKind` the resolver returns ([S03.T04](T04-deck-resolver.md)), surfaced instead of hidden.

D-006 applies: all copy is pt-BR through the strings module. D-007 means no ownership, no sharing, no permissions — a single-user tool bound to loopback.

## Scope

- **In scope.** `apps/web/src/routes/builder.tsx` and `builder.$deckId.tsx`; `useDeckDraft` (local lines, dirty tracking, single-level undo); the two-pane layout with the embedded search panel; the grouped list with `+`/`−` controls; the live validation and price panel; the paste-import dialog with per-line feedback; the version history with diffs and version switching; export and copy; the disabled "avaliar" button and the coverage placeholders; keyboard shortcuts; unsaved-changes guarding.
- **Out of scope.** The endpoints, versioning, diff and price computation ([S03.T11](T11-user-decks-schema-and-api.md)); the validation rules ([S03.T10](T10-deck-validation-rules.md)); parsing and serialisation ([S03.T09](T09-decklist-parser-and-exporter.md)); the search panel itself ([S02.T12](../02-card-data-and-search/T12-web-search-page.md)); the meta comparison view, which [S03.T13](T13-deck-comparison-with-tournament-lists.md) mounts inside this page; the evaluation flow ([S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)); real coverage numbers ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It is where RN-10's verdict becomes visible before a game is ever requested: the "avaliar" button cannot be pressed while the list is not exactly 60 legal cards.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S03.T12-01 | Editing is local: `+`, `−`, add-from-search and paste mutate the draft only. Nothing reaches the server until "salvar versão", and the draft is marked dirty on the first change. | `useDeckDraft` — the only mutator of the draft; no mutation calls inside its reducers | `builder.spec.tsx > local editing` — five edits issue zero requests and set `dirty: true` |
| BR-S03.T12-02 | Validation and price shown while editing come from the same pure functions the server uses (`validateDeck`, and the client-side price over the resolved lines already in the draft); on save, the server's report replaces the local one. | the draft selector calls `@pokesearch/shared`; `onSuccess` of the save mutation overwrites the panel | `builder.spec.tsx > local then server validation` — a 59-card draft shows `SIZE_NOT_60` before saving and the same code from the server afterwards |
| BR-S03.T12-03 | "salvar versão" posts to `POST /api/user-decks/:id/versions` (or `POST /api/user-decks` for a new deck), and the version history then shows the server-computed diff; the client never computes the stored `change_desc`. | the save mutation and the history query | `builder.spec.tsx > save shows server diff` — changing one card and saving renders `-1 <removed>, +1 <added>` from the response (BR-S03.T11-06) |
| BR-S03.T12-04 | The paste dialog shows, per line, the count, the name, the set/number and the resolution outcome (`exato`, `alias`, `por número`, `por nome`, `não encontrada`), and refuses to import only when zero lines parse; otherwise the user imports and fixes the flagged lines in the list. | the dialog's preview table, fed by `POST /api/user-decks` dry-run mode or by `resolveText` through the create call | `builder.spec.tsx > paste feedback` — a list with one unmatched line renders it highlighted and still imports the other 59 |
| BR-S03.T12-05 | The `+`/`−` controls change a line by one copy, clamp at 0 (removing the line) and at 99, and never enforce the 4-copy rule themselves — the copy limit is reported by validation, so the user can see *why* a fifth copy is wrong. | the `increment`/`decrement` reducers | `builder.spec.tsx > copy controls` — pressing `+` a fifth time yields 5 copies and a `COPY_LIMIT` error in the panel, not a blocked click |
| BR-S03.T12-06 | `Enter` in the search box adds the first result to the draft; `+`/`−` on a focused list row change it; `Ctrl`/`Cmd`+`S` saves; every shortcut has a visible control with the same effect. | the keyboard handler in the builder shell | `builder.spec.tsx > keyboard` — each shortcut fires the same reducer as its button |
| BR-S03.T12-07 | Leaving the route with a dirty draft asks for confirmation (`Você tem alterações não salvas. Sair mesmo assim?`); the draft is also mirrored to `localStorage` per deck id and restored on return. | a router `beforeLoad` block plus the draft's storage effect | `builder.spec.tsx > unsaved guard` — navigation is blocked once and the draft survives a remount |
| BR-S03.T12-08 | The "avaliar" button is disabled while the current version is not `ok`, and — until [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) exists — is disabled with the tooltip `disponível quando o motor estiver pronto`; the coverage figures render as `—` with the same explanation until [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md). | the button's `disabled` predicate and the placeholder components | `builder.spec.tsx > evaluate placeholder` — disabled for an invalid list and for a valid one, with different tooltips |
| BR-S03.T12-09 | A version is never mutated from the UI: selecting an older version loads it read-only, and "editar a partir desta versão" copies it into the draft with `parentVersionNo` set. | the version-history component | `builder.spec.tsx > older version is read only` — the `+`/`−` controls are absent until the copy action is used (BR-S03.T11-01) |
| BR-S03.T12-10 | All user-visible text comes from the pt-BR strings module, including every validation message, which is rendered from the code and `meta` returned by the API rather than from a server-built sentence. | the strings module and the `ValidationIssue` renderer | `pnpm lint` fails on an inline literal; `builder.spec.tsx > messages` renders all eight codes |

## Data operations

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Start an empty deck | `/builder` → `novo deck` | none yet | empty draft, panel shows `0 / 60` and `SIZE_NOT_60` |
| Open an existing deck | `/builder/:deckId` | `GET /api/user-decks/:id` (optionally `?version=`) | draft seeded from the selected version; history listed |
| Search for a card | embedded search panel ([S02.T12](../02-card-data-and-search/T12-web-search-page.md)) | `GET /api/cards/search` | results with an `+ adicionar` action per card |
| Add a card | `+ adicionar` or `Enter` in the search box | none (local) | a line appears or its count increments; validation and price refresh |
| Change copies | `+` / `−` on a list row | none (local) | count changes, clamped 0–99; a 5th copy shows `COPY_LIMIT` (BR-S03.T12-05) |
| Remove a card | `×` on a row, or `−` at 1 copy | none (local) | the line disappears; totals refresh |
| Paste a list | `importar lista` dialog → textarea → `pré-visualizar` | `POST /api/user-decks` (or the version endpoint) with `text` | per-line preview with `matchKind` badges; `importar` replaces the draft |
| See legality | validation panel | none (local); refreshed by the server on save | error and warning rows with links to the offending cards |
| See the price | summary bar | none (local); the stored value comes back on save | `≈ US$ <total>` with `(<n>% das cartas com preço)` |
| See coverage | summary bar | — | `—` placeholders until [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) (BR-S03.T12-08) |
| Save a version | `salvar versão` (+ optional note) | `POST /api/user-decks` or `POST /api/user-decks/:id/versions` | 201 → history gains a row with the server diff; draft becomes clean |
| Browse history | version list | `GET /api/user-decks/:id` | selecting a version loads it read-only with its diff, price and validation |
| Branch from a version | `editar a partir desta versão` | none (local) | the draft is replaced and `parentVersionNo` is remembered for the next save |
| Rename / annotate | name field, notes field | `PATCH /api/user-decks/:id` | inline confirmation; `updated_at` refreshes |
| Copy the list | `copiar lista` | none (uses the serialized draft) | clipboard write, `copiado!` for 1.5 s |
| Download the list | `.txt` | `GET /api/user-decks/:id/versions/:v/export.txt` | plain-text file (saved versions only) |
| Compare with the meta | `comparar com o meta` tab | `GET /api/user-decks/:id/versions/:v/compare` ([S03.T13](T13-deck-comparison-with-tournament-lists.md)) | the comparison table mounts inside this page |
| Evaluate | `avaliar` | — (disabled) | tooltip explaining why (BR-S03.T12-08) |

## Interfaces

**Routes.** `/builder` (new deck) and `/builder/$deckId` (search param `version` optional, `tab` ∈ `lista` \| `comparar`). Both render the same shell; the first has no history panel until the first save, after which it redirects to `/builder/:id`.

```ts
// apps/web/src/builder/useDeckDraft.ts
export interface DraftLine extends DeckLine {
  cardId: string | null;
  matchKind: MatchKind | null;          // null for lines added from search (always exact)
  card: ResolvedCardBrief | null;
}
export interface DeckDraft {
  deckId: number | null;
  parentVersionNo: number | null;
  name: string;
  format: string;
  lines: DraftLine[];
  dirty: boolean;
  add(card: ResolvedCardBrief, n?: number): void;
  increment(nameKey: string, delta: number): void;   // clamps 0..99 (BR-S03.T12-05)
  remove(nameKey: string): void;
  replaceAll(lines: DraftLine[], meta?: { parentVersionNo?: number }): void;
  undo(): void;                                      // single level, last change only
  reset(): void;
}
export function useDeckDraft(deckId?: number): DeckDraft;
export const DRAFT_KEY = (deckId: number | "new") => `builder.draft.${deckId}`;
```

**Derived, recomputed on every draft change** (memoised): `total`, `counts` per category, `validation = validateDeck(toResolvedDeck(draft), format)`, `priceUsd` and `priceCoverage` over the draft's resolved cards, and `text = serializeDecklist(draft.lines)`.

**Components.** `BuilderShell` → `SearchPane` (the embedded search panel), `DeckPane` (`DeckSection` ×3 with `DeckRow`), `SummaryBar` (counts, price, coverage placeholders, `avaliar`), `ValidationPanel`, `PasteDialog`, `VersionHistory`, `ExportBlock`, and the `CompareTab` slot filled by [S03.T13](T13-deck-comparison-with-tournament-lists.md).

**Layout.** Two panes side by side above 1024 px (search left, list right), stacked below with a sticky summary bar; the validation panel is a collapsible strip under the summary; the paste dialog is a modal with a textarea and a preview table.

**pt-BR labels** (quoted as UI copy, D-006): `Construtor`, `novo deck`, `importar lista`, `pré-visualizar`, `importar`, `salvar versão`, `descrição da mudança (opcional)`, `versões`, `editar a partir desta versão`, `somente leitura`, `avaliar`, `disponível quando o motor estiver pronto`, `cobertura`, `— (disponível na etapa de regras)`, `copiar lista`, `copiado!`, `.txt`, `comparar com o meta`, `{n} / 60 cartas`, `≈ US$ {total}`, `({n}% das cartas com preço)`, `exato`, `alias`, `por número`, `por nome`, `não encontrada`, `Você tem alterações não salvas. Sair mesmo assim?`, `sem mudanças`.

**Validation rendering.** Each `ValidationIssue` is rendered from its `code` plus `meta` through the same templates as [S03.T10](T10-deck-validation-rules.md); the affected `cardIds` become links to the card detail and highlight the matching rows in the list pane.

## Implementation steps

1. Build `useDeckDraft` with its reducers, the dirty flag, the single-level undo and the `localStorage` mirror; unit-test it before any UI.
2. Build `DeckPane` with the three sections, `DeckRow` and the `+`/`−`/`×` controls wired to the reducers.
3. Add the derived selectors (`total`, `counts`, `validation`, `price`, `text`) and the `SummaryBar`.
4. Add `ValidationPanel` with the code→template rendering and the row highlighting.
5. Embed the search pane from [S02.T12](../02-card-data-and-search/T12-web-search-page.md) and wire `addToDeck(cardId)` plus the `Enter` shortcut.
6. Build `PasteDialog`: textarea, preview table with `matchKind` badges, import action replacing the draft.
7. Wire the save mutation for both paths (new deck and new version), including the optional note and the redirect after the first save.
8. Build `VersionHistory` with read-only version loading and "editar a partir desta versão".
9. Add `ExportBlock` (copy and `.txt`), the disabled `avaliar` button, the coverage placeholders and the `comparar com o meta` tab slot.
10. Add the unsaved-changes guard, the keyboard shortcuts and the accessibility pass (each row is a group with labelled controls; the paste preview is a table with a caption; the validation panel is an `aria-live` region).

## Edge cases and error handling

- **Pasting the Dhelmise list** → 60 of 60 lines resolve (including `3 Psychic Energy MEE 5` as `alias`), the preview shows no red rows, importing gives `60 / 60 cartas`, `ok`, and a price with its coverage.
- **A paste containing `4 Ultra Ball`** (no set code) → the preview flags that line as `linha inválida` with its line number, the other lines import normally, and the flagged line is not added; the user fixes it in the textarea and previews again.
- **A paste of prose** → zero parsable lines, so `importar` stays disabled with the message `nenhuma linha reconhecida`; the draft is untouched.
- **Pressing `+` a fifth time on a card** → 5 copies in the list and a `COPY_LIMIT` error naming the card; the row is highlighted. Blocking the click would leave the user guessing.
- **A list at 59 cards** → the summary reads `59 / 60 cartas`, the panel shows `SIZE_NOT_60`, and `avaliar` stays disabled; saving is still allowed and produces a version with `ok: false` (BR-S03.T11-05).
- **Navigating away with unsaved changes** → one confirmation; if the user leaves anyway, the draft is still in `localStorage` and is restored when they return to the same deck.
- **`localStorage` unavailable** → the draft lives in memory only; the guard still fires, and the feature degrades to "do not close the tab".
- **The save request fails** (the API is down) → the draft stays dirty, an inline error appears with a retry, and nothing is lost; the version history is not optimistically updated.
- **The server's validation disagrees with the local one** (the card data changed since the page loaded) → the server's report replaces the panel on save, and a notice explains that the list was re-checked against the current card data.
- **Opening an older version** → the list renders read-only with its stored price, diff and validation; the `+`/`−` controls are absent until "editar a partir desta versão" is used, which sets `parentVersionNo` so the history stays a tree.
- **A deck whose version contains unresolved lines** (imported from a tournament list) → those rows render as name-only tiles with the `não encontrada` badge and an `UNRESOLVED_LINE` error; the user can delete them or search for a replacement.
- **A very large paste (thousands of lines)** → the textarea is capped at a documented size and the preview virtualises past 100 rows; parsing is linear, so the dialog stays responsive.

## Acceptance / verification

- [ ] `pnpm --filter web test -t "builder"` green against a mocked API client generated from the exported JSON Schema.
- [ ] `builder.spec.tsx > dhelmise paste`: pasting the benchmark list shows 60/60 resolved in the preview, imports to `60 / 60 cartas`, `ok: true`, and a price with a coverage percentage (stage exit criterion).
- [ ] `builder.spec.tsx > save shows server diff`: changing one card and saving creates version 2 whose history row reads `-1 <removed>, +1 <added>` (BR-S03.T12-03).
- [ ] `builder.spec.tsx > local editing`: five edits issue zero network requests and mark the draft dirty (BR-S03.T12-01).
- [ ] `builder.spec.tsx > local then server validation`: a 59-card draft shows `SIZE_NOT_60` before saving and the server's equivalent afterwards (BR-S03.T12-02).
- [ ] `builder.spec.tsx > paste feedback`: a list with one unmatched line highlights it with the `não encontrada` badge and still imports the rest (BR-S03.T12-04).
- [ ] `builder.spec.tsx > copy controls`: a fifth `+` yields 5 copies plus a `COPY_LIMIT` error rather than a blocked click (BR-S03.T12-05).
- [ ] `builder.spec.tsx > unsaved guard`: navigation is intercepted once and the draft is restored after a remount (BR-S03.T12-07).
- [ ] `builder.spec.tsx > older version is read only` and `> evaluate placeholder`: read-only rendering and the two disabled-button tooltips (BR-S03.T12-08, -09).
- [ ] `pnpm lint` fails on an inline pt-BR literal in a builder component (BR-S03.T12-10).
- [ ] Manual, against the real API: paste the Dhelmise list into `/builder`, save, swap one Trainer, save again, and confirm the history shows two versions with the expected diff and both prices.

## Risks and open questions

- **Risk — two validators drift** (the browser's local run and the server's stored report). Mitigation: both call the same `@pokesearch/shared` function; the only legitimate difference is the card-data snapshot, and the save path always overwrites the panel with the server's answer (BR-S03.T12-02).
- **Risk — the draft in `localStorage` goes stale** across card reloads, so a saved card id no longer exists. Mitigation: the draft keeps printed names, set codes and numbers alongside ids, so it re-resolves on the next save; a vanished id becomes a visible `UNRESOLVED_LINE`.
- **Risk — the two-pane layout is cramped on a laptop.** Mitigation: the search pane collapses to a drawer below 1024 px and the summary bar sticks; measured on the real screen before the page is called done.
- **Question — should saving be automatic** (every edit a version)? Recommendation: no — versions are the unit later stages measure, and one per keystroke would make the history unreadable. The `localStorage` mirror already covers loss of work; the user decides whether an autosave *draft* is wanted.
- **Question — should the builder offer a "completar com energia básica" helper**, as the legacy list generator did? A genuine convenience for a 57-card list. Recommendation: defer until after the first real use; it is a draft-level action with no schema impact.

## References

- `pokemon/src/pokesearch/sim/optimizer.py` L49–85 — verified: `DeckList.export_text`, `add`/`remove` (increment by name key, drop at zero copies) and `describe_diff` — the editing semantics and the diff string this UI renders.
- `pokemon/src/pokesearch/sim/store.py` L64–73 — verified: a version is an insert with `change_desc`, `list_text`, `list_json` and `price_usd`, which is why the builder's save is a create, never an update.
- `pokemon/src/pokesearch/templates/deck.html` — verified: the summary chips (`<n> cartas`, per-category counts, `≈ price` with `(<n>% das cartas com preço)`, the unresolved warning), the `copiar lista` / `.txt` pair and the `<pre>` export block this page reuses in an editable form.
- `pokemon/src/pokesearch/static/decks.js` L70–78 — verified: `Enter` in the picker adding the first suggestion, and the clipboard handler showing `copiado!` for 1.5 s.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: the 60-card acceptance fixture and the `-1 X / +1 Y` diff vocabulary.
- [S03.T11](T11-user-decks-schema-and-api.md) (endpoints, diff, price), [S03.T10](T10-deck-validation-rules.md) (codes and messages), [S03.T09](T09-decklist-parser-and-exporter.md) (parse/serialize) — the three contracts this page composes.
- [Decision log](../../project/02-decision-log.md) D-006 (pt-BR UI), D-007 (single user), D-008 (React 19, TanStack Router/Query).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
