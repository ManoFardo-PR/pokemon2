# S05.T14 — Web: coverage page and authoring queue

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 14 / 16 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Unblocks | — |
| Parallel with | [S05.T13](T13-rules-editor-ui.md), [S05.T16](T16-measurement-model-and-suite-v6-freeze.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `module` coverage endpoint — from [S05.T12](T12-evidence-and-coverage-metrics.md)
- `file` `pokemon/src/pokesearch/api/routes_sim.py` (`GET /sim/cards`) and `pokemon/README.md` L166–180 — the legacy dashboard and the numbers it reported; read-only reference

## Outputs (proposed)
- `module` route `/rules/coverage` — exact × proven headline (meta copies), split by evidence kind, trend over rules snapshots, authoring queue = uncovered texts ordered by meta copies (top 200 names ≈ 93.8 % of copies), each row linking to the editor
- `table` `coverage_history(id, measured_at, format, days, engine_build, rules_snapshot, denominator, exact_copies, proven_copies, by_scenario, by_twinleaf_diff, by_attr_only, by_builtin, stale_copies)` — one insert-only row per completed `scenarios` job, which is what makes the trend line possible; added during this elaboration because a trend cannot be derived from the current state alone

## Initial objective
Effort goes where the meta is: the queue always shows the most-played unmodelled text first, and the two coverage numbers make progress and regressions visible.

## Context

This is the page the user opens to decide what to do next, and the page that tells them whether yesterday's work moved anything. It has two halves and they answer different questions: the dashboard answers "where are we", the queue answers "what now".

The legacy's `/sim/cards` did the first half and half of the second. It showed exact and proven side by side with their kind breakdown, and it listed `top_approx` (the most-played approximate or missing cards) and `top_unverified` (the most-played exact cards without complete proof), each capped at 30. What it could not do was show a trend, because nothing recorded yesterday's number, and what it got wrong was the unit: it listed *cards by name*, so two printings with different text appeared as one row and the work of coding them appeared as one job. Here the queue lists **texts**, because a text is the unit of work — coding one text can cover four printings and thirty thousand meta copies, and the queue should say so before the user starts.

The ordering is the whole value of the page. The legacy's own measurement is the argument: the 200 most-played card names account for roughly 93.8 % of copies, and the top 300 effect texts cover about 97.3 % of effect copies. A queue ordered by meta copies therefore front-loads almost all of the achievable coverage into a few dozen decisions. The first rows will be predictable and are worth naming in advance: roughly a hundred cards lived only inside the legacy's third-party engine and have no recipe to import — Ultra Ball, Boss's Orders, Night Stretcher, the Dreepy line — so the three importers ([S05.T08](T08-spreadsheet-import.md)–[S05.T10](T10-import-catalog-recipes.md)) leave them untouched and they surface at the top on day one.

The trend needs a table. `coverage()` ([S05.T12](T12-evidence-and-coverage-metrics.md)) reports the present; a regression is only visible against a past. `coverage_history` takes one insert-only row per completed `scenarios` job, carrying the engine build and the rules snapshot that produced it, so a drop in `proven` can be attributed to a build change, a code edit or a scenario failure rather than guessed at. This is the same discipline as `rule_evidence`: numbers that depend on a build record the build.

One presentation rule governs everything on the page. RN-70 says the two numbers are always shown together, and that is not a layout preference — a single number is what lets a project believe it models 95 % of the meta when it has checked 45 % of it. The headline is one component that renders both or neither, the queue rows carry both chips, the deck-version badge carries both, and there is no view, filter or export that yields one alone.

## Scope

- **In scope.** The `/rules/coverage` route with its four sections (headline, split by kind, trend, queue); the queue's ordering, filters and grouping; the `coverage_history` table and the worker step that appends to it; `GET /api/rules/coverage/history`; the queue endpoint `GET /api/rules/queue`; the CSV export of the queue; the deck-version coverage badge component reused by [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md); pt-BR copy through the strings module (D-006).
- **Out of scope.** Computing coverage ([S05.T12](T12-evidence-and-coverage-metrics.md)); authoring anything ([S05.T13](T13-rules-editor-ui.md) owns every write); the lint itself, whose output this page only counts ([S05.T13](T13-rules-editor-ui.md)); running scenarios ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); the deck builder's own screens ([S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)); the measurement dashboard ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-70 | **Kept.** Exact and proven are always shown together: the headline renders both or renders an error, every queue row carries both chips, the deck badge carries both, and no filter, tab or export can produce one without the other. | `<CoverageHeadline>` takes a `Coverage` object with both fields required and has no single-number mode; the CSV export writes both columns | `coverage-page.spec.tsx > the headline renders both numbers`; `> there is no view that shows exact without proven` (component-prop assertion); `> the CSV export has both columns` |
| BR-S05.T14-01 | The authoring queue is ordered by meta copies descending, and the copies shown for a text are the **sum over every printing that carries it**, not one printing's. | `GET /api/rules/queue` orders by the `byText` weights of [S05.T12](T12-evidence-and-coverage-metrics.md), which sum through `card_parts` | `coverage-page.spec.tsx > queue order matches cardUsage descending`; `api.spec.ts > a text on three printings reports the sum of their copies` |
| BR-S05.T14-02 | Every queue row states *why* it is in the queue — `sem códigos`, `código rascunho`, `código aproximado`, `sem cenário`, `prova obsoleta` — and links to the exact place that fixes it. | the queue item's `reason` is derived from `card_status.missing_codes`, the item statuses and the evidence state; each reason maps to a route | `coverage-page.spec.tsx > every row has a reason and a working link`; `api.spec.ts > the five reasons are exhaustive over a fixture base` |
| BR-S05.T14-03 | The page never computes a coverage number in the browser: every figure comes from `GET /api/rules/coverage`, `GET /api/rules/coverage/history` or `GET /api/rules/queue`. | the components take server data as props; `apps/web` imports no coverage module | `pnpm check` greps `apps/web` for imports of the coverage module; `coverage-page.spec.tsx > every displayed number appears in the fixture response` |
| BR-S05.T14-04 | The four evidence-kind figures sum to `proven`, and the page shows them as a decomposition of the proven bar rather than as four independent numbers. | the stacked bar takes the four values and asserts the sum in development; the server guarantees it ([S05.T12](T12-evidence-and-coverage-metrics.md)) | `coverage-page.spec.tsx > the four kind segments sum to the proven bar`; the same assertion in `coverage.spec.ts` |
| BR-S05.T14-05 | `coverage_history` is insert-only and every row carries its `engine_build` and `rules_snapshot`, so a step in the trend is attributable. | one `INSERT` at the end of the `scenarios` job; no update or delete path | `history.spec.ts > the worker appends one row per completed scenarios job`; `> there is no UPDATE or DELETE path` (grep check) |
| BR-S05.T14-06 | The page states the age and the window of the denominator (`usageComputedAt`, format, days, tournaments) next to the numbers; a stale denominator is labelled, never silently presented as current. | the header strip renders `window` and `usageComputedAt` from the response; over 48 h old renders a warning chip | `coverage-page.spec.tsx > a denominator older than 48h shows the stale chip with its age` |
| BR-S05.T14-07 | When the denominator has never been computed the page shows the `NoUsageCache` state with the command to run, not a zero or an empty chart. | the 409 branch of the loader renders a dedicated empty state | `coverage-page.spec.tsx > NoUsageCache renders the instruction, not 0 %` |
| BR-S05.T14-08 | While a `scenarios` job is running after a build change the page says so and labels `proven` as rebuilding, because a temporarily low number is not a regression. | the response's `rebuilding` flag ([S05.T12](T12-evidence-and-coverage-metrics.md)) drives a banner and a hatched bar | `coverage-page.spec.tsx > rebuilding renders the banner and does not draw a trend point` |
| BR-S05.T14-09 | The queue can be filtered and grouped but never reordered by anything other than meta copies descending; sorting by name or by status is not offered, because the page exists to impose an order. | the queue table has filters and a grouping toggle, no sort controls | `coverage-page.spec.tsx > the queue table exposes no sort control` |
| BR-S05.T14-10 | Clicking a queue row opens that text in the editor at the panel its reason names (`sem códigos` → the code list, `sem cenário` → the evidence panel). | the row's link carries a `#panel` anchor consumed by [S05.T13](T13-rules-editor-ui.md) | `coverage-page.spec.tsx > a "sem cenário" row links to /rules/texts/:hash#provas` |

## Data operations

**User actions.**

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Open the page | `/rules/coverage` | `GET /api/rules/coverage?byText=1&limit=0` + `GET /api/rules/coverage/history?limit=60` + `GET /api/rules/queue?limit=50` | headline, split, trend and the first page of the queue |
| Change the window | format and days selects in the header strip | the same three calls with new parameters | every figure recomputes; the window is reflected in the URL |
| Read the split | the stacked proven bar | none | hovering a segment names the kind and its copies; the four sum to proven |
| Read the trend | the sparkline with one point per `coverage_history` row | none | hovering a point shows the date, both numbers, the engine build (short) and the rules snapshot (short) |
| Attribute a step | click a trend point | `GET /api/rules/coverage/history/:id` | a panel naming what changed since the previous point: build, snapshot, scenarios added or failing |
| Filter the queue | chips — `sem códigos`, `rascunho`, `aproximado`, `sem cenário`, `obsoleto`; kind — `ability`/`attack`/`trainer`/`energy` | `GET /api/rules/queue?reason=&kind=` | the list narrows; the header shows the copies the filtered subset represents |
| Group the queue | toggle "por texto / por carta" | `GET /api/rules/queue?group=text\|card` | by text is the default and the unit of work; by card is for reading a specific deck's gaps |
| Load more | infinite scroll / "carregar mais" | `GET /api/rules/queue?offset=` | the next 50 rows |
| Open a row | row click | — | the editor at `/rules/texts/:hash#<panel>` (BR-S05.T14-10) |
| Export the queue | "Exportar CSV" | `GET /api/rules/queue?format=csv` | a CSV with text hash, kind, name, excerpt, copies, printings, reason, status, both coverage columns |
| See a deck's coverage | the badge on a deck version ([S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)) | `GET /api/decks/:id/versions/:vid` | both numbers, with a link into the queue filtered to that list's uncovered texts |

**Endpoints.**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/rules/coverage` | `?format=&days=&byCard=&byText=&limit=` | the `Coverage` object of [S05.T12](T12-evidence-and-coverage-metrics.md), plus `rebuilding` | 409 `NoUsageCache` |
| GET | `/api/rules/queue` | `?format=&days=&reason=&kind=&group=text\|card&limit=50&offset=0&format=csv` | `{ total, totalCopies, items: [{ textHash, kind, name, excerpt, copies, printings, codes, status, reason, exact, proven, lintWarnings }] }` | 409 `NoUsageCache` |
| GET | `/api/rules/coverage/history` | `?format=&days=&limit=60` | `{ points: [{ id, measuredAt, engineBuild, rulesSnapshot, denominator, exactCopies, provenCopies, byKind, staleCopies }] }` | — |
| GET | `/api/rules/coverage/history/:id` | — | the point plus a diff against the previous one: `{ buildChanged, snapshotChanged, scenariosAdded, scenariosFailing, textsCoded }` | 404 |

**CRUD.** The page writes nothing. The one table it introduces is written by the worker.

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `coverage_history` | C | worker | at the end of every completed `scenarios` job | append only; one row per job; `engine_build` and `rules_snapshot` from `rules_current` at that moment | BR-S05.T14-05 |
| `coverage_history` | R | api | the trend and the attribution panel | read-only | — |
| `coverage_history` | U / D | — | never | insert-only, like `rule_evidence` | BR-S05.T14-05 |
| `card_status`, `card_usage_cache`, `card_parts`, `effect_texts`, `text_codes`, `rule_codes`, `rule_evidence`, `rule_scenarios` | R | api | every page load | read-only | [S05.T12](T12-evidence-and-coverage-metrics.md) |
| any rules table | — | api (this page) | never written | authoring belongs to [S05.T13](T13-rules-editor-ui.md) | — |

## Interfaces

**Route and layout.** `/rules/coverage`, four sections top to bottom.

**1 — Headline.** Two large percentages side by side, `Exata` and `Comprovada`, each with its copy count over the denominator, and the window strip under them: format, days, tournaments, `usageComputedAt` with its age. The numbers the legacy reported are the reference the page is read against and are shown as a faint baseline marker: exact 94.7 %, proven 72.6 % of 2.3 M meta copies. The project targets sit beside them (≥ 90 % and ≥ 60 % by the end of S05, per the vision doc), so the headline says both where the project is and what it is aiming at.

**2 — Split.** The proven bar is stacked into its four evidence kinds, each with its copy count and share:

| Segment | Meaning | Typical source |
|---|---|---|
| `cenário` | a passing scenario on the current build | [S05.T11](T11-legacy-tests-to-scenarios.md)'s converted tests |
| `oráculo` | agreement with the second source, where that translation is the code in use | [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md) |
| `builtin` | a passing scenario over a native code | [S05.T06](T06-builtins-escape-hatch.md) |
| `atributos` | a printing with no texted part, whose `CardDef` round-trips | RN-75 |

Beside it, three context figures that are *not* part of the two headline numbers and are labelled as such: the `approx` share (documented approximations), the `builtin` share of meta copies against its 2 % budget ([S05.T06](T06-builtins-escape-hatch.md)), and `staleCopies` (proven under an older rules snapshot). A fourth figure, `unresolvedCopies`, reports decklist lines that resolved to no card and therefore depress coverage without being anyone's fault to fix here.

**3 — Trend.** A sparkline over `coverage_history`, one point per completed `scenarios` job, two series (exact and proven). Points where `engine_build` changed are marked with a vertical rule, because that is the one cause that can move `proven` without anyone touching a code. Clicking a point opens the attribution panel.

**4 — Authoring queue.** The table, ordered by copies descending and not sortable (BR-S05.T14-09):

| Column | Content |
|---|---|
| Cópias | meta copies summed over every printing carrying the text |
| Texto | the effect text's first ~90 characters, with its kind chip (`habilidade`, `ataque`, `treinador`, `energia`) and, for abilities and attacks, its printed name |
| Impressões | how many printings share it, with the most-played one named |
| Códigos | the current item count and the worst status |
| Motivo | one of `sem códigos`, `código rascunho`, `código aproximado`, `sem cenário`, `prova obsoleta` |
| Estado | the exact and proven chips (RN-70) |
| Suspeitas | the lint warning count from [S05.T13](T13-rules-editor-ui.md), as a small badge |

The header above the table states what the filtered subset is worth: *"47 textos · 312.480 cópias · 13,6 % do meta"*, which turns the list into a budget rather than a backlog.

**`coverage_history` DDL** (migration `0006_rules.sql`, [S05.T01](T01-rules-schema-migration.md)):

```sql
-- One row per completed `scenarios` job. Insert-only: a trend that can be rewritten is not a trend.
-- @postgres: identical.
CREATE TABLE coverage_history (
    id               INTEGER PRIMARY KEY,
    measured_at      TEXT    NOT NULL,           -- 'YYYY-MM-DDTHH:MM:SSZ'
    format           TEXT    NOT NULL,
    days             INTEGER NOT NULL,
    engine_build     TEXT    NOT NULL,
    rules_snapshot   TEXT    NOT NULL,
    job_id           INTEGER,                    -- the scenarios job that produced it
    denominator      INTEGER NOT NULL,
    exact_copies     INTEGER NOT NULL,
    proven_copies    INTEGER NOT NULL,
    by_scenario      INTEGER NOT NULL,
    by_twinleaf_diff INTEGER NOT NULL,
    by_attr_only     INTEGER NOT NULL,
    by_builtin       INTEGER NOT NULL,
    stale_copies     INTEGER NOT NULL,
    approx_copies    INTEGER NOT NULL,
    unresolved_copies INTEGER NOT NULL,
    CHECK (proven_copies <= exact_copies),
    CHECK (by_scenario + by_twinleaf_diff + by_attr_only + by_builtin = proven_copies)
);
CREATE INDEX coverage_history_window_idx ON coverage_history (format, days, measured_at DESC);
```

The two `CHECK` constraints are RN-74 and BR-S05.T14-04 written into the schema, so a bug in the coverage query cannot quietly produce an impossible history row.

**Queue item type** (`@pokesearch/shared`):

```ts
export type QueueReason = "no_codes" | "draft_code" | "approx_code" | "no_scenario" | "stale_proof";

export interface QueueItem {
  textHash: string;
  kind: "ability" | "attack" | "trainer" | "energy";
  name: string;            // printed ability/attack name, "" for trainer/energy
  excerpt: string;         // first ~90 chars of the text
  copies: number;          // summed over every printing carrying the text
  printings: number;
  topPrinting: { cardId: string; name: string; copies: number };
  codes: number;
  status: CodeStatus;      // the worst among the items
  reason: QueueReason;
  exact: boolean; proven: boolean;
  lintWarnings: number;
}
```

`reason` is derived in this order, first match wins: no `text_codes` rows → `no_codes`; any code `draft`/`unimplemented` → `draft_code`; any code `approx` → `approx_code`; exact but no passing evidence on the current build → `no_scenario`; proven but under a different `rules_snapshot` → `stale_proof`. The order is the order of work, which is why the first match is the right one to show.

## Implementation steps

1. Add `coverage_history` to `0006_rules.sql` ([S05.T01](T01-rules-schema-migration.md)) with its two `CHECK` constraints and its index.
2. Add the worker step that appends one row at the end of every completed `scenarios` job, reading `rules_current` for the build and snapshot; spec the insert-only rule.
3. Build `GET /api/rules/queue` on top of [S05.T12](T12-evidence-and-coverage-metrics.md)'s `byText` breakdown, with the `reason` derivation, the filters, the grouping and the total-copies header figure.
4. Build `GET /api/rules/coverage/history` and `/history/:id` with the diff against the previous point.
5. Build the `/rules/coverage` route shell with the loader calling the three endpoints, plus the `NoUsageCache` and `rebuilding` states.
6. Build `<CoverageHeadline>` with both numbers, the window strip, the denominator age and the legacy/target baseline markers.
7. Build the stacked split bar with the four kinds and the three context figures beside it; assert the sum in development.
8. Build the trend sparkline with the build-change rules and the attribution panel.
9. Build the queue table with its columns, filters, grouping toggle, infinite scroll and `#panel` links into the editor; no sort controls.
10. Add the CSV export and the deck-version coverage badge component, and wire the badge into [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)'s version list.
11. Run the page against the real database after the importers and the first scenario run; record the first queue's top 40 rows and their total copies in the completion note, so the stage has a starting backlog with a number attached.

## Edge cases and error handling

- **The denominator has never been computed.** 409 `NoUsageCache` from both endpoints; the page renders an empty state naming the command to refresh the deck sync, rather than 0 % or a blank chart (BR-S05.T14-07).
- **A `scenarios` job is running after a build change.** `proven` is legitimately near zero. The banner says "recalculando provas para o build X", the proven bar is hatched, and no trend point is drawn until the job completes — otherwise the history would record a trough that never really happened (BR-S05.T14-08).
- **The queue is empty.** Every counted text has exact codes and a passing scenario. The page says so and switches the queue to "textos com prova obsoleta" and then to "textos aproximados", so there is always a next thing even when the main queue drains.
- **A text with enormous copies and a trivial fix** — "Then, shuffle your deck." shared by hundreds of printings. It will sit at the top with a very large copy count because the copies sum over printings. That is correct and is the single best row in the queue; the "Impressões" column makes it obvious why.
- **A text whose hash disappeared after an ETL reload.** It leaves the queue silently, which would hide lost work. The page therefore shows an "órfãos" strip fed by `orphanTexts` ([S05.T02](T02-effect-texts-and-card-parts.md)) with the copies those texts used to carry, so a wording change that orphans coded work is visible on the page that tracks coverage.
- **Unresolved decklist lines.** They are in the denominator as `unresolved:<name_key>` ([S05.T12](T12-evidence-and-coverage-metrics.md)) and can never become exact. They are shown as their own context figure with a link to the resolver's unresolved report ([S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md)), so the user does not spend effort in the queue trying to fix something that is a data problem.
- **The trend has one point.** The sparkline renders a single marker with its value and the date, not an empty chart or a flat line implying history.
- **The window is changed to a period with no tournaments.** The denominator is 0; every share would divide by zero. The page shows "sem dados na janela" with the tournament count, and the API returns `denominator: 0` with both shares null rather than 0 — a share of zero and an absence of data are different statements.
- **`proven > exact` arrives from the server.** Impossible by the view's construction and by the `CHECK` on `coverage_history`, but the component asserts it in development and renders an error state rather than a nonsensical bar, because a silently wrong coverage number is the failure this whole stage exists to prevent.
- **A queue row's text is `rule_box`.** It never appears: `rule_box` parts are excluded from counted parts ([S05.T02](T02-effect-texts-and-card-parts.md), [S05.T12](T12-evidence-and-coverage-metrics.md)), so boilerplate cannot clutter the queue.

## Acceptance / verification

- [ ] `pnpm --filter web test coverage-page.spec.tsx` green, including `> the headline renders both numbers` and `> there is no view that shows exact without proven` (RN-70).
- [ ] `coverage-page.spec.tsx > queue order matches cardUsage descending` and `api.spec.ts > a text on three printings reports the sum of their copies` (BR-S05.T14-01).
- [ ] `coverage-page.spec.tsx > every row has a reason and a working link`, and `> a "sem cenário" row links to /rules/texts/:hash#provas` (BR-S05.T14-02, -10).
- [ ] `coverage-page.spec.tsx > the four kind segments sum to the proven bar` and the same assertion holds in `coverage.spec.ts` over the real database (BR-S05.T14-04).
- [ ] `history.spec.ts > the worker appends one row per completed scenarios job` and a `UPDATE`/`DELETE` grep over `apps/worker` and `apps/api` finds none (BR-S05.T14-05).
- [ ] `migrate.spec.ts > coverage_history rejects proven_copies > exact_copies` and `> rejects a kind split that does not sum to proven_copies` — both `CHECK` constraints fire (RN-74, BR-S05.T14-04).
- [ ] `coverage-page.spec.tsx > a denominator older than 48h shows the stale chip with its age` and `> NoUsageCache renders the instruction, not 0 %` (BR-S05.T14-06, -07).
- [ ] `coverage-page.spec.tsx > rebuilding renders the banner and does not draw a trend point` (BR-S05.T14-08).
- [ ] `coverage-page.spec.tsx > the queue table exposes no sort control` (BR-S05.T14-09).
- [ ] `pnpm check` greps `apps/web` and finds no import of the coverage module; `coverage-page.spec.tsx > every displayed number appears in the fixture response` (BR-S05.T14-03).
- [ ] Against the real database after the importers and the first scenario run: the page loads, the queue's top rows include the cards the legacy implemented only natively (Ultra Ball, Boss's Orders, Night Stretcher, the Dreepy line), and the top 40 rows with their total copies are recorded in the completion note.

## Risks and open questions

- **Risk — the queue is dominated by one enormous shared text** and the user reads the page as "one job left". Mitigation: the header figure states the filtered subset's copies and its share of the meta, and the "Impressões" column shows the spread; after the first few rows the distribution flattens quickly, which the top-40 record from step 11 will show.
- **Risk — the trend is too sparse to be useful** because a `scenarios` job runs rarely. Mitigation: the job runs automatically on every build change and on every code edit ([S05.T12](T12-evidence-and-coverage-metrics.md)), so points accumulate with authoring rather than with ceremony. If it is still sparse, a nightly job is one scheduler line ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)).
- **Risk — the page becomes a score to maximise** and authoring drifts toward whatever raises the number fastest, which is exactly what `approx` codes do. Mitigation: `approx` copies are shown as a context figure and are excluded from both headline numbers, and the queue's `approx_code` reason keeps them visible as work rather than as achievement.
- **Risk — `coverage_history` rows are written for windows nobody looks at** and the trend fragments across `(format, days)` combinations. Mitigation: the worker writes one row for the default window only; other windows are computed live and not recorded. Stated here so it is a decision, not an omission.
- **Question — should the queue show cards or texts by default?** Texts, because a text is the unit of work and the saving from RN-05 is only visible that way. The grouping toggle offers cards for reading a specific list's gaps. The user may prefer cards by default, since that is how a deck is thought about; it is a one-line default.
- **Question — should the page offer "mark as won't do"** for texts the user has decided not to code (a card nobody plays in their archetype, a stadium that never resolves)? It would keep the queue honest but adds a state with no home in the current schema. Recommendation: not in S05; if the queue proves noisy, the natural place is a `rule_codes` row with `status = 'unimplemented'` and a note, which already exists and already excludes the text from `exact`. The user decides whether that is expressive enough.

## References

- `pokemon/src/pokesearch/api/routes_sim.py` — verified: `GET /sim/cards` as the coverage dashboard and `GET /sim/card/{engine_id}` as the per-card sheet. Consult for what the legacy page showed and for the two lists (`top_approx`, `top_unverified`) this queue generalises from names to texts.
- `pokemon/src/pokesearch/sim/coverage.py` — verified: `ExactCoverage` with `copies_by_kind`, `names_by_kind`, `verified_by_kind`, `verified_names_by_kind`, `top_approx` (default 30) and `top_unverified` (default 30, carrying each card's `missing` parts); `KIND_LABEL` mapping the seven kinds to Portuguese labels; `TOP_MARKS = (24, 94, 155, 219, 386)`, the cumulative-coverage checkpoints the legacy reported. Consult for the dashboard figures and for the queue's ancestry.
- `pokemon/README.md` L166–180 — verified: exact 94.7 % split `motor 29,4 % · catálogo 59,7 % · esqueleto sem texto 5,7 %` against `catálogo aprox. 3,9 % · esqueleto aprox. 1,2 % · sem implementação 0,1 %`; proven 72.6 %; the denominator of 2.3 M copies over 90 days with 12.6 points of Basic Energy; and the note that the metric rose from 45.1 % to 72.6 % by checking the engine's own cards one at a time. The baseline markers the headline shows.
- [Legacy reference map](../../project/06-legacy-reference-map.md) — verified: *"the 200 most-played names ≈ 93.8 % of copies; ~100 cards lived only in the third-party engine (no recipe to import)"*. The argument for the queue's ordering and the prediction about its first rows.
- [Vision and scope](../../project/01-vision-and-scope.md) §"Success metrics" — the targets shown beside the headline (exact ≥ 90 %, proven ≥ 60 % by the end of S05) and RN-70's statement that the two are always shown together.
- [S05.T12](T12-evidence-and-coverage-metrics.md) (the `Coverage` object, `byText`, the four kinds, `rebuilding`, `staleCopies`, `NoUsageCache`), [S05.T13](T13-rules-editor-ui.md) (the editor this page links into, and the lint whose warnings it counts), [S05.T02](T02-effect-texts-and-card-parts.md) (`orphanTexts` for the orphan strip), [S01.T08](../01-foundation/T08-web-skeleton.md) (the shell, the router and the strings module).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
