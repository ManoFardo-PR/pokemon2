# S07.T06 — Web: optimizer page

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 6 / 7 |
| Depends on | [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), [S07.T05](T05-optimize-job-orchestration.md) |
| Unblocks | — |
| Parallel with | [S07.T07](T07-coach-lost-game-review.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Evaluate page (opponent panel, progress components) — from [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)
- `module` optimize job — from [S07.T05](T05-optimize-job-orchestration.md)

## Outputs (proposed)
- `module` route `/optimize/:deckId` — start form (suite or custom opponents, iterations, K, bots, price cap, fixed cards), live phase/candidate progress, candidates table (move, screening Δ ± SE, confirmation Δ with CI and blocks, holdout, decision), accepted versions with diffs and links to the builder
- `contract` `GET /api/optimize/jobs/:jobId/candidates` and `GET /api/optimize/decks/:deckId/runs` — the `optimizer_candidates` rows of a run and the run history of a deck, read-only, serving the candidates table and the history panel

## Initial objective
The user sees not just the suggested swap but the evidence behind it and the candidates that were rejected, in the same language as the Evaluate page.

## Context

This page is where the stage's honesty either becomes visible or quietly evaporates. Everything upstream was built so that three numbers exist per candidate — a screening estimate taken on the seeds that selected it, a confirmation estimate on fresh seeds with a stated level, and a holdout estimate on seeds nothing optimised against — and so that the rejected candidates are recorded rather than discarded. A page that showed only the winner and only its point estimate would reduce all of that to the same thing the legacy produced: a number with no error bar and no denominator.

So the page has one governing rule, and it is the first business rule below: **an interval, never a bare point estimate.** Every Δ on the screen is rendered with its uncertainty — `Δ ± SE` for screening, `Δ [low, high]` for confirmation and holdout — and there is no display mode, no compact view and no tooltip that strips it. The Evaluate page established the same discipline for the weighted score ([S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) BR-S04.T17-03 and its risk note about RN-48), and this page inherits its components so the two screens read the same way: the same `OpponentPanel`, the same live-progress bars, the same pt-BR strings module, the same URL-held state.

The second rule is that **the rejected candidates are on the screen**. The legacy's own report file is the argument: `benchmarks/otimizacao_dhelmise.md` prints all eight screened swaps of each iteration with their Δ, then names the finalist and its confirmation, then says *"dentro da margem, recusada"*. Reading that file is how anyone can tell that the three finalists were the tops of noisy distributions rather than three discoveries. A page that listed only the accepted swap would make the same run look like "the optimizer found nothing" instead of "the optimizer tested twenty-four swaps, seven survived a high-recall triage, two confirmed, one cleared the practical threshold, and here is what the holdout said about it". Rejected rows are evidence of work done, and they are the context that makes an accepted row believable.

The third point follows from [S07.T04](T04-holdout-acceptance-and-versioning.md)'s central constraint and is a presentation problem more than an engineering one. The holdout is **reported, never re-gated**, and by regression to the mean it will often land below the confirmation estimate. The page must therefore present a case that looks like a contradiction — "accepted, confirmed at +1.1 points, holdout +0.3 points" — without either hiding it or making it look like a bug. It does that by showing the two numbers adjacent with their intervals, by labelling the holdout explicitly as *the* reported gain, and by carrying a one-line explanation in the strings module that says why the holdout is the number to trust. When the holdout is below zero the row is marked prominently and the run summary repeats it: a negative holdout after a positive confirmation is the single most informative thing the tool can tell a user, and burying it would make every positive result less credible.

Two smaller decisions keep the page honest in the same spirit. A candidate that confirmed but did not clear the 0.5-point practical threshold gets its own visible state — `confirmada, abaixo do limiar` — rather than being lumped with the rejections, because "real but too small to be worth a version" is a different fact from "not distinguishable from zero", and RN-84's revision is exactly the separation of those two questions. And the run summary always states its `stopReason`: a run that ended because the game budget ran out looks identical to one that ended because nothing confirmed, unless the page says which.

The page is pt-BR through the strings module (D-006); the route, the code and the API stay English. The two new read endpoints live in `apps/api/src/optimizer/` rather than in [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md)'s job routes, because they serve `optimizer_candidates`, which is this stage's table.

## Scope

- **In scope.** The `/optimize/:deckId` route, its URL-held state and its start form; the reused `OpponentPanel`, `ModeSelector`-equivalent and `LiveProgress` components from [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md); the phase/candidate live view driven by `OptimizeProgress`; the candidates table with all four decision states and the three estimates; the accepted-versions panel with diffs and builder links; the run summary with `stopReason`, counts, budget spent and the final holdout; the excluded-cards panel (`unmodelledExcluded`, RN-81); the two read endpoints `GET /api/optimize/jobs/:jobId/candidates` and `GET /api/optimize/decks/:deckId/runs`; the `optimize.*` keys in `apps/web/src/strings/pt-BR.ts`; the empty, error and cancelled states.
- **Out of scope.** The job itself, its params validation and its progress semantics ([S07.T05](T05-optimize-job-orchestration.md)); the statistics ([S07.T02](T02-paired-seed-screening.md)–[S07.T04](T04-holdout-acceptance-and-versioning.md)); `optimizer_candidates`' schema ([S07.T04](T04-holdout-acceptance-and-versioning.md)); the job endpoints, SSE transport and cancel route ([S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md)); the Evaluate page itself and the `wilson`/`weightedScore` module ([S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)); the deck builder and its version history ([S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)), which this page links into; the coach panel ([S07.T07](T07-coach-lost-game-review.md)); any write endpoint — this page creates a job and cancels it, and nothing else.

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It is where RN-84's revised two-condition rule becomes two distinguishable states on screen, where RN-48's "show the interval, not the point" discipline is enforced in the UI, and where RN-81's excluded cards are reported; each is owned elsewhere.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S07.T06-01 | **No bare point estimate is ever rendered.** Every Δ appears with its uncertainty: screening as `Δ ± SE`, confirmation and holdout as `Δ [low, high]`. There is no compact mode, no sparkline and no tooltip that shows a Δ alone, and a Δ whose uncertainty is unavailable renders as `—`, never as a number. | the `<Delta>` component is the only way a Δ reaches the DOM, and it requires either `se` or `ci` as a prop; an eslint rule forbids formatting `delta` outside it | `optimize.spec.tsx > every delta in the candidates table is rendered with an interval` (a DOM sweep asserting each Δ cell contains `±` or `[`); `> a candidate with a null se renders an em dash`; `pnpm lint` fails on a fixture formatting a delta outside `<Delta>` |
| BR-S07.T06-02 | **Every candidate the run considered is listed**, including `screened_out` ones, with its move, prior, screening Δ ± SE, confirmation Δ with CI, blocks run and `alpha_spent`, holdout Δ with CI and bot, and its decision. Cells with no value render `—`; no row is filtered out by default and no decision state is collapsed into another. | the table maps the full `GET /api/optimize/jobs/:jobId/candidates` payload; the default filter is "all" | `optimize.spec.tsx > a run with 24 proposals and 1 acceptance renders 24 rows`; `> a screened_out row shows its screening numbers and em dashes for confirmation and holdout`; `> no decision state is absent from the legend` |
| BR-S07.T06-03 | The four decisions are four distinct, labelled states: `accepted` → *aceita*, `confirmed` → *confirmada, abaixo do limiar*, `rejected` → *recusada*, `screened_out` → *triada fora*. `confirmed` is never displayed as a rejection, because "real but below 0.5 point" and "not distinguishable from zero" are different facts (RN-84 revised). | the decision-to-label map in `pt-BR.ts`, exhaustive over `CandidateDecision` | `optimize.spec.tsx > the four decisions render four distinct labels`; `> a confirmed-but-not-accepted row is not styled as a rejection`; a TypeScript exhaustiveness assertion on the map |
| BR-S07.T06-04 | The holdout is labelled as **the reported gain** and the confirmation as the decision input; when `holdout_below_confirm` is set both are shown adjacent with the explanatory string, and when `holdout_below_zero` is set the row carries a prominent marker and the run summary repeats it. The page never presents the confirmation Δ as the headline of an accepted swap. | the `<HoldoutCell>` component and the two flags from the payload; the summary's warning block | `optimize.spec.tsx > an accepted row shows the holdout as the reported gain`; `> holdout_below_confirm renders both numbers and the explanation`; `> holdout_below_zero is marked on the row and repeated in the summary` |
| BR-S07.T06-05 | The run summary always states `stopReason`, the iterations run, the counts (proposed / screened / survivors / confirmed / accepted / budget-capped), the games spent against the budget, the engine build, the rules snapshot and the final holdout with its CI. A run that stopped on budget is visibly different from one that stopped because nothing confirmed. | the `<RunSummary>` component, whose props are the whole `OptimizeResult` | `optimize.spec.tsx > the summary names the stop reason for each of the eight values`; `> budget_exhausted and no_candidate_confirmed render differently`; `> the final holdout is shown with its CI or as an explicit "no final holdout" when null` |
| BR-S07.T06-06 | The page state lives in the URL: `?suite`, `?iterations`, `?k`, `?bot`, `?strongBot`, `?priceCap`, `?fixed`, `?exclude`, `?job` are query parameters, so a reload or a shared link reproduces the view and starting a run puts its id in `?job`. | the router's `validateSearch` schema ([S01.T08](../01-foundation/T08-web-skeleton.md), TanStack Router) | `optimize.spec.tsx > reloading with ?job=N restores the live view`; `> changing K updates the URL`; `> a shared link with fixed and exclude reproduces the form` |
| BR-S07.T06-07 | The live view ends deterministically and shows the current phase and candidate: on `done` it renders the summary and the table, on `error` the message, on `cancelled` the partial table marked incomplete; it falls back to polling `GET /api/jobs/:id` once a second when the SSE stream is refused with 503, exactly as the Evaluate page does. | the reused `useJobStream` hook of [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) plus an `OptimizeProgress` renderer | `optimize.spec.tsx > done renders the summary and the table`; `> a 503 stream falls back to polling`; `> a cancelled run shows its completed iterations marked incomplete`; `> the live view names the phase and the candidate` |
| BR-S07.T06-08 | Cards excluded from the pool for lack of exact coverage are shown in their own panel with the card, its status and its copies in the archetype (RN-81), so a user can see what the optimizer was not allowed to consider and send it to the authoring queue. The panel is present even when empty, with a count of zero. | `<ExcludedCards>` reading `OptimizeResult.unmodelledExcluded`; each row links to [S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md) | `optimize.spec.tsx > excluded cards are listed with status and copies`; `> the panel renders with a zero count when nothing was excluded`; `> each excluded card links to the authoring queue` |
| BR-S07.T06-09 | The page performs exactly two writes — `POST /api/jobs` to start a run and `POST /api/jobs/:id/cancel` to stop it. It never creates a deck version, never edits a candidate row and offers no "apply this swap anyway" action; an accepted swap already is a version, created by the job ([S07.T04](T04-holdout-acceptance-and-versioning.md) BR-S07.T04-06). | the route module's request list; a fetch-call assertion in the spec | `optimize.spec.tsx > the page issues only the two documented writes` (a fetch spy over a full interaction); `> there is no apply action in the candidates table` |
| BR-S07.T06-10 | The UI is pt-BR through the strings module (D-006); no literal user-facing string appears in a component, including the statistical labels (*triagem*, *confirmação*, *holdout*, *blocos*, *α gasto*, *ρ medido*). | `apps/web/src/strings/pt-BR.ts`; the eslint rule forbidding bare JSX text ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a fixture component with a hard-coded label; `optimize.spec.tsx` asserts every label through the strings module |
| BR-S07.T06-11 | Runs from a different `engine_build` or `rules_snapshot` than the current one are marked in the history panel and are never placed in the same comparison widget as a current-build run, the same discipline RN-42 applies to suites and [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) BR-S04.T17-03 applies to evaluations. | the history table's build column and the `GET /api/version` comparison | `optimize.spec.tsx > a run from another build is marked in the history`; `> two runs from different builds are not charted together` |

## Data operations

**User actions.**

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Open the optimizer for a deck | route `/optimize/:deckId`, reached from the builder and from the Evaluate page | `GET /api/user-decks/:id`, `GET /api/suites`, `GET /api/meta/archetypes?days=90` | deck header with the latest version, suite selector, opponent panel with shares and weights |
| Choose a frozen suite | select listing `suites` with version, date and opponent count | none (client state) | the opponent panel switches to the suite's frozen opponents and weights, read-only; `?suite=` updates |
| Use custom opponents instead | toggle, then the reused `OpponentPanel` of [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) | `GET /api/meta/archetypes`, `GET /api/decks/:deckId` | top-N archetypes with derived weights, exclusions and fixed-weight overrides; a warning that a custom field is not reproducible once the window moves |
| Set iterations, K and the block sizes | number inputs in the settings block | none | the estimated total games and wall-clock update from the recorded throughput in `docs/PERF.md`; `?iterations=`, `?k=` update |
| Choose the two bots | two selects: *piloto da triagem* and *piloto do holdout* | `GET /api/bots` ([S06.T07](../06-bots/T07-bot-registry-and-freezing.md)) | the cost estimate updates; the strong bot's cost is shown separately because it applies only to holdouts |
| Set the price cap | currency input | none | the estimate is unaffected; the cap is shown next to the pool size once a run starts; `?priceCap=` updates |
| Fix concept cards | chip list over the deck's names, prefilled with the archetype's core cards | none | fixed chips cannot be removed by the optimizer; `?fixed=` updates |
| Start the run | primary button *otimizar* | `POST /api/jobs` `{ kind: "optimize", params }` → 202 `{ id }` | `?job=<id>`, the live view replaces the form (BR-S07.T06-06) |
| Watch progress | live panel: phase, iteration, current candidate, block, per-arm bar | `GET /api/jobs/:id/events` (SSE), falling back to `GET /api/jobs/:id` | phase name, `it 2/6`, the candidate's move, `bloco 3/4`, games spent against the budget, elapsed time (BR-S07.T06-07) |
| Cancel | *cancelar* while running | `POST /api/jobs/:id/cancel` | within about two seconds the status becomes `cancelled`; the completed iterations are shown marked incomplete |
| Read the candidates table | table under the summary | `GET /api/optimize/jobs/:jobId/candidates` | one row per proposal with the three estimates and the decision (BR-S07.T06-02) |
| Filter the table | segmented control *todas / sobreviventes / aceitas* | none (client state) | the default is *todas*; the counts per state are shown on the control itself |
| Sort the table | column headers | none (client state) | default order is iteration then `idx`, which is the order the run produced |
| Open an accepted version | link on an accepted row and in the versions panel | `GET /api/user-decks/:id?version=N` in the builder | the builder opens at that version with its diff and the holdout figure in `change_desc` |
| Inspect an excluded card | row in the excluded-cards panel | link to [S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md) | the authoring queue opens filtered to that card (BR-S07.T06-08) |
| Browse the deck's run history | history table under the page | `GET /api/optimize/decks/:deckId/runs` | date, suite, iterations, counts, final holdout with CI, stop reason, engine build, status; other-build rows marked (BR-S07.T06-11) |
| Repeat a run | *repetir* on a history row | `GET /api/jobs/:id`, then `POST /api/jobs` with the stored params | a new job with identical params and a new id — and therefore new seeds, which the confirmation dialog states |
| Copy the result | *copiar* on the summary | none | the summary and the candidates table as text, for pasting into notes |

**Endpoints owned by this subtask** (read-only; `apps/api/src/optimizer/routes.ts`).

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/optimize/jobs/:jobId/candidates` | path `jobId`; query `decision?` (one of the four), `iteration?` | `{ job: { id, status, engineBuild, rulesSnapshot, params, result }, candidates: OptimizerCandidateView[] }` | 404 `NOT_FOUND`; 409 `WRONG_KIND` when the job is not an `optimize` job |
| GET | `/api/optimize/decks/:deckId/runs` | path `deckId`; query `limit` (1–50, default 20) | `{ runs: [{ jobId, status, createdAt, finishedAt, suiteId, iterationsRun, counts, finalHoldout, stopReason, engineBuild, rulesSnapshot }] }` | 404 `NOT_FOUND` |

**Database access behind them** — all reads; the api writes nothing here beyond the job insert and cancel that [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md) already owns.

| Entity | Operation (C/R/U/D) | Actor | When | Constraints |
|---|---|---|---|---|
| `optimizer_candidates` | R | api | both endpoints | ordered by `(iteration, idx)`; indexed by `optimizer_candidates_job_idx` |
| `jobs` | R | api | both endpoints | `kind = 'optimize'` enforced by the route |
| `user_decks`, `user_deck_versions` | R | api | the run history and the accepted-version links | read-only |
| `suites` | R | api | the suite label on a run row | read-only |
| anything | C/U/D | api | never in these two routes | the optimizer tables are worker-written ([S07.T04](T04-holdout-acceptance-and-versioning.md)) |

## Interfaces

**Route and state.**

```ts
// apps/web/src/routes/optimize.$deckId.tsx
export const Route = createFileRoute("/optimize/$deckId")({
  validateSearch: z.object({
    suite:      z.coerce.number().int().optional(),     // omit for custom opponents
    iterations: z.coerce.number().int().min(1).max(12).default(6),
    k:          z.coerce.number().int().min(1).max(24).default(24),
    bot:        z.string().default("planner_rs_v1"),
    strongBot:  z.string().default("rollout_v1"),
    priceCap:   z.coerce.number().nonnegative().optional(),
    fixed:      z.string().optional(),      // "dhelmise,sinistcha"
    exclude:    z.string().optional(),      // custom-opponent exclusions, as on the Evaluate page
    job:        z.coerce.number().int().optional(),
  }),
});
```

**The candidate view model** — what the endpoint returns per row, one to one with `optimizer_candidates` plus the derived labels:

```ts
export interface OptimizerCandidateView {
  iteration: number; idx: number;
  moveDesc: string; removeName: string; addName: string; prior: number;

  screen:  { pairs: number; delta: number | null; se: number | null;
             rho: number | null; tieFraction: number | null; pass: boolean | null } | null;
  confirm: { blocks: number; pairs: number; delta: number; se: number;
             ciLow: number; ciHigh: number; z: number; survivors: number;
             alphaSpent: number; rho: number; power: number;
             stopReason: "ci_excludes_zero" | "futility" | "blocks_exhausted" | "cancelled" } | null;
  holdout: { seedSet: string; bot: string; pairs: number; delta: number; se: number;
             ciLow: number; ciHigh: number; rho: number;
             belowConfirm: boolean; belowZero: boolean } | null;

  decision: "screened_out" | "rejected" | "confirmed" | "accepted";
  decisionNote: string | null;
  deckVersionId: number | null;
  engineBuild: string; rulesSnapshot: string; decidedAt: string;
}
```

**Components.**

| Component | Responsibility |
|---|---|
| `OptimizeForm` | suite-or-custom selector, the reused `OpponentPanel`, iterations/K/blocks, the two bot selects, price cap, fixed chips, the cost estimate |
| `OptimizeProgressPanel` | phase, `it n/N`, current candidate, `bloco b/B`, arm bar, games against budget, elapsed, cancel |
| `RunSummary` | `stopReason`, counts, games spent, engine build, rules snapshot, final holdout with CI, warnings (BR-S07.T06-05) |
| `CandidatesTable` | one row per proposal, all four states, the three estimates, the filter and the sort (BR-S07.T06-02, -03) |
| `Delta` | the **only** component that formats a Δ; requires `se` or `ci` (BR-S07.T06-01) |
| `HoldoutCell` | the holdout Δ with its CI, its bot, and the two flags' markers (BR-S07.T06-04) |
| `AcceptedVersions` | one card per accepted swap: diff, holdout figure, link into the builder |
| `ExcludedCards` | `unmodelledExcluded` with status, copies and a link to the authoring queue (BR-S07.T06-08) |
| `RunHistory` | past optimize runs for this deck, with build marks and *repetir* (BR-S07.T06-11) |

**The `Delta` component** — the single formatting point, so BR-S07.T06-01 is a type constraint rather than a convention:

```tsx
type DeltaProps =
  | { deltaPct: number; se: number;  ci?: never;                 kind: "screen" }
  | { deltaPct: number; ci: [number, number]; se?: number;       kind: "confirm" | "holdout" }
  | { deltaPct: null;   se?: never;  ci?: never;                 kind: "screen" | "confirm" | "holdout" };

/** Renders "+1.1 ± 0.9 pt" or "+1.1 pt [−0.3, +2.5]" or "—". Never a bare number. */
export function Delta(p: DeltaProps): JSX.Element;
```

Values arrive in win-rate units and are rendered as percentage points with one decimal and an explicit sign; the conversion happens inside `Delta` so no caller multiplies by 100 by hand.

**The candidates table**, as the user sees it (pt-BR labels from the strings module):

| troca | prior | triagem | confirmação | holdout | decisão |
|---|---|---|---|---|---|
| −1 Spiritomb, +1 Shaymin | 0.42 | `+3.4 ± 1.1 pt` · ρ 0.38 · n 2.400 | `+1.1 pt [+0.2, +2.0]` · 3 blocos · α 0,0125 | `+0.3 pt [−1.4, +2.0]` · rollout_v1 | **aceita** |
| −1 Night Stretcher, +1 Pokégear 3.0 | 0.31 | `+4.6 ± 1.2 pt` · ρ 0.35 · n 2.400 | `+0.2 pt [−0.7, +1.1]` · 4 blocos · α 0,0125 | — | recusada |
| −1 Patrat, +1 Dudunsparce | 0.18 | `+0.6 ± 1.1 pt` · ρ 0.41 · n 2.400 | — | — | triada fora |

The second row is the case the page exists for: a screening estimate of +4.6 that confirmed at +0.2 with an interval containing zero. It is on screen with both numbers, so the user learns what a screening number is worth.

**Warnings rendered on the summary**, each with its own string key:

| Condition | Rendering |
|---|---|
| `finalHoldout.belowZero` | prominent block: the final list measures worse than the starting list on holdout seeds, with both CIs |
| any accepted candidate with `holdout.belowZero` | prominent block naming the swap and its holdout figure (BR-S07.T06-04) |
| any accepted candidate with `holdout.belowConfirm` | inline note next to the row plus the one-line explanation of regression to the mean |
| `stopReason = "budget_exhausted"` or `"time_budget"` | the run was truncated; games spent against budget |
| `stopReason = "environment_changed"` | the engine build or rules snapshot changed mid-run; both values shown |
| `confirm.rho < 0.4` on any candidate | the run's power was below the design target; the measured ρ and the resulting `power` are shown |
| `unmodelledExcluded.length > 0` | *n* cards were excluded from the pool for lack of exact coverage (RN-81) |

**Strings.** `apps/web/src/strings/pt-BR.ts` gains the `optimize.*` keys: `optimize.title`, `optimize.start`, `optimize.cancel`, `optimize.repeat`, `optimize.phase.*` (seven phases), `optimize.decision.accepted` (*aceita*), `.confirmed` (*confirmada, abaixo do limiar*), `.rejected` (*recusada*), `.screenedOut` (*triada fora*), `optimize.col.*` (move, prior, screening, confirmation, holdout, decision), `optimize.holdout.reported` (*ganho relatado, em sementes nunca usadas na seleção*), `optimize.holdout.belowConfirm`, `optimize.holdout.belowZero`, `optimize.stop.*` (eight reasons), `optimize.excluded.*`, `optimize.empty.noCandidate`, `optimize.empty.noRuns`, `optimize.build.mismatch`, `optimize.customOpponents.warning`.

## Implementation steps

1. Add `apps/api/src/optimizer/routes.ts` with the two read endpoints, their zod response schemas and the `WRONG_KIND` guard; spec both against a fixture run (BR-S07.T06-02).
2. Add the route with its `validateSearch` schema and the deck header; render the suite selector and the reused `OpponentPanel` (BR-S07.T06-06).
3. Build `OptimizeForm`: iterations, K, block sizes, the two bot selects, price cap and fixed chips, with the cost estimate from `docs/PERF.md`; spec that the estimate names the strong-bot holdout cost separately.
4. Wire the start action to `POST /api/jobs` with `kind: "optimize"` and put the id in `?job`; spec that every form field reaches `params` (BR-S07.T06-09).
5. Write the `Delta` component with its three-way prop union and the eslint rule forbidding delta formatting elsewhere; spec the three renderings and the `—` case (BR-S07.T06-01).
6. Build `CandidatesTable` over the endpoint payload with the four decision labels, the filter and the sort; spec the 24-row case and the `screened_out` row's em dashes (BR-S07.T06-02, -03).
7. Build `HoldoutCell` with the reported-gain label and the two flag markers; spec `belowConfirm` and `belowZero` (BR-S07.T06-04).
8. Build `RunSummary` with `stopReason`, the counts, the budget line, the build and snapshot, the final holdout and the warning table; spec all eight stop reasons (BR-S07.T06-05).
9. Build `OptimizeProgressPanel` over `useJobStream` and `OptimizeProgress`, with the phase, candidate and block; spec the three terminations and the 503 fallback (BR-S07.T06-07).
10. Build `AcceptedVersions` and `ExcludedCards` with their links into the builder and the authoring queue; spec the zero-count panel (BR-S07.T06-08).
11. Build `RunHistory` over the second endpoint with the build mark and *repetir*, including the confirmation dialog stating that a repeat uses new seeds (BR-S07.T06-11).
12. Move every literal into `pt-BR.ts` and confirm `pnpm lint` fails on a hard-coded label (BR-S07.T06-10, D-006).
13. Run the manual acceptance: start a short optimize run from the page, watch the phase and candidate change, cancel it, re-run it to completion, and confirm every stored candidate appears with its decision and that the accepted version opens in the builder.

## Edge cases and error handling

- **A run in which no candidate passed screening.** The table lists every proposal with its screening numbers and `triada fora`, the summary states `no_candidate_passed`, and the empty-state string is *"nenhuma troca ficou fora do ruído"* — a result, not an error. There is no final holdout, and the panel says so rather than rendering a zero.
- **A run with zero proposals** (the price cap excluded everything, or every card is already at its archetype count). The table is empty with `optimize.empty.noCandidate`, and the summary names `no_moves_left` plus the cap and the cheapest excluded candidate, so the user can see what raising the cap would buy.
- **An accepted swap whose holdout is negative.** The row shows `aceita` with the negative holdout as the reported gain, marked prominently, and the summary repeats it in a warning block. The version link still works — the swap is a real version the user can inspect or discard in the builder. The page does not offer to revoke it, because acceptance was decided on confirmation and the holdout is not a gate ([S07.T04](T04-holdout-acceptance-and-versioning.md) BR-S07.T04-01).
- **A confirmed candidate that did not clear the practical threshold.** `confirmada, abaixo do limiar` with its confirmation CI and no holdout cell, plus the threshold's value in the summary so the user can see it was 0.4 against a 0.5 bar. Styling it as a rejection would erase RN-84's revision.
- **Two candidates tie and one is deferred.** The deferred row shows `confirmada, abaixo do limiar` with `decisionNote: deferred_to_next_iteration` rendered as an inline note, and the next iteration's rows show it re-proposed against the changed list. The page does not try to link the two; the iteration column is enough.
- **A run cancelled mid-block.** The table shows the completed iterations; the in-flight iteration's candidates carry `decisionNote: cancelled` and whatever estimates were complete. The header marks the run incomplete and no final holdout is shown. The Evaluate page's `incompleto` treatment is reused verbatim.
- **The job is still queued because the worker is not running.** The live view shows *na fila* with the elapsed time and the hint that the worker process must be started, reusing [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)'s state rather than spinning without explanation.
- **A history run from a different engine build or rules snapshot.** Marked with `optimize.build.mismatch`, and it is never placed in the same comparison widget as a current-build run (BR-S07.T06-11). Two runs of the same deck across a rules edit are two experiments.
- **The candidates payload is large.** A six-iteration run at `k = 24` is 144 rows with twenty-odd fields each — a few hundred kilobytes, fine as one response. The endpoint is nevertheless paginated by `iteration` so a pathological run (twelve iterations) does not block the render; the default fetches all iterations and the page shows a progressive skeleton.
- **A custom opponent set instead of a suite.** The form warns that a custom field is tied to today's meta window and will not be reproducible once it moves; the params still record the full opponent list with its weights, so the *run* stays reproducible even though the *field* is no longer current. The warning is a string, not a block.
- **`alpha_spent` is null on a screened-out row.** Rendered as `—`, never as `0`, which would imply a level of zero. The same applies to every null statistic (BR-S07.T06-01).
- **The LLM key is missing.** Irrelevant to this page: the optimizer never calls a model. The coach panel of [S07.T07](T07-coach-lost-game-review.md) is the only key-dependent element in the stage, and it is hidden rather than disabled when no key is configured (RN-60).

## Acceptance / verification

- [ ] `pnpm --filter web test optimize` green, including `> every delta in the candidates table is rendered with an interval` — a DOM sweep asserting every Δ cell contains `±` or `[` — and `> a candidate with a null se renders an em dash` (BR-S07.T06-01).
- [ ] `pnpm lint` fails on a fixture component formatting a delta outside `<Delta>`, and on a fixture with a hard-coded pt-BR label (BR-S07.T06-01, -10).
- [ ] `optimize.spec.tsx > a run with 24 proposals and 1 acceptance renders 24 rows` and `> a screened_out row shows its screening numbers and em dashes for confirmation and holdout` (BR-S07.T06-02).
- [ ] `optimize.spec.tsx > the four decisions render four distinct labels` and `> a confirmed-but-not-accepted row is not styled as a rejection`, with a TypeScript exhaustiveness assertion over `CandidateDecision` (BR-S07.T06-03).
- [ ] `optimize.spec.tsx > an accepted row shows the holdout as the reported gain`, `> holdout_below_confirm renders both numbers and the explanation`, `> holdout_below_zero is marked on the row and repeated in the summary` (BR-S07.T06-04).
- [ ] `optimize.spec.tsx > the summary names the stop reason for each of the eight values` and `> budget_exhausted and no_candidate_confirmed render differently` (BR-S07.T06-05).
- [ ] `optimize.spec.tsx > reloading with ?job=N restores the live view`, `> changing K updates the URL`, `> a shared link with fixed and exclude reproduces the form` (BR-S07.T06-06).
- [ ] `optimize.spec.tsx > the live view names the phase and the candidate`, `> a 503 stream falls back to polling`, `> a cancelled run shows its completed iterations marked incomplete` (BR-S07.T06-07).
- [ ] `optimize.spec.tsx > excluded cards are listed with status and copies`, `> the panel renders with a zero count when nothing was excluded`, `> each excluded card links to the authoring queue` (BR-S07.T06-08).
- [ ] `optimize.spec.tsx > the page issues only the two documented writes` — a fetch spy over a full start-watch-cancel-read interaction — and `> there is no apply action in the candidates table` (BR-S07.T06-09).
- [ ] `pnpm --filter api test optimizer-routes` green: `GET /api/optimize/jobs/:jobId/candidates` returns every stored row with its three estimates for a fixture run, `?decision=accepted` filters, and a non-`optimize` job id returns 409 `WRONG_KIND`.
- [ ] `optimize.spec.tsx > a run from another build is marked in the history` and `> two runs from different builds are not charted together` (BR-S07.T06-11).
- [ ] Manual, end to end: start an optimize run on the Dhelmise deck from the page, watch the phase and candidate change through screening and confirmation, cancel, re-run to completion, and confirm that every `optimizer_candidates` row of that job is visible with its decision and that an accepted version opens in the builder at the right version number with its holdout figure in the change description (stage exit criterion "every candidate's screening/confirmation numbers and decision are stored and visible").

## Risks and open questions

- **Risk — the table is too dense to read.** Six numbers plus an interval each, across up to 144 rows, is a lot of screen. Mitigation: the default filter is *todas* but the default sort is the run's own order, the survivors and accepted subsets are one click away, and the columns collapse on narrow viewports into a two-line card per candidate — never by dropping the intervals, which BR-S07.T06-01 forbids.
- **Risk — the holdout reads as a downgrade.** A user who sees "confirmada +1.1, holdout +0.3" may conclude the tool is inconsistent. Mitigation: the holdout is labelled as the reported gain, the explanatory string is one line and always present on a `belowConfirm` row, and the summary's warning block explains regression to the mean once per run rather than once per row.
- **Risk — the page becomes the place someone adds an "apply anyway" button.** It would let a user promote a rejected swap to a version, which would make the whole selection story decorative. Mitigation: BR-S07.T06-09 and its fetch-spy test; a user who wants an unmeasured swap makes it in the builder, where it is honestly labelled as a hand edit.
- **Risk — the cost estimate is wrong before [S04.T18](../04-game-engine-core/T18-performance-baseline.md) runs.** Mitigation: the estimate reads the recorded throughput and shows `—` when `docs/PERF.md` has no number, as the Evaluate page does, rather than guessing; the strong-bot holdout cost is estimated separately because its per-game cost differs by orders of magnitude.
- **Risk — custom opponents make runs incomparable.** Two runs a week apart against "the top 12" are two different fields. Mitigation: the warning string, the full opponent list stored in `params_json`, and the suite selector presented first so the reproducible path is the default.
- **Question — should the page offer a coach panel for the run's lost games?** [S07.T07](T07-coach-lost-game-review.md) produces exactly that, and this page is where a user would look for it. Recommendation: leave the panel out of this subtask's scope and let [S07.T07](T07-coach-lost-game-review.md) mount its own section into this route when a key is configured, so a keyless install renders a page with no empty placeholder (RN-60).
- **Question — should the candidates table show the per-opponent breakdown?** Each candidate has twelve opponent-level Δs, which is where a swap that helps one matchup and hurts another becomes visible — genuinely useful, and twelve times the data. Recommendation: keep it out of the first cut and add it as an expandable row once the table's density is settled with real runs; the endpoint already has the data in `blocks_json` and the per-opponent arrays.
- **DEPENDENCY-PROPOSAL: S07.T06 should depend on S07.T04 because** the page renders `optimizer_candidates` columns directly and its two endpoints read that table, whose schema and semantics [S07.T04](T04-holdout-acceptance-and-versioning.md) owns; today it is reached only transitively through [S07.T05](T05-optimize-job-orchestration.md).
- **DEPENDENCY-PROPOSAL: S07.T06 should depend on S04.T16 because** the page creates and cancels jobs through `POST /api/jobs` and `POST /api/jobs/:id/cancel` and consumes the SSE stream at `GET /api/jobs/:id/events`; today those routes are reached only through [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)'s components.

## References

- `pokemon/src/pokesearch/templates/sim_project.html` — verified through [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md): the versions table (change, price, exact coverage, score, 95 % CI, games, mode), the opponents panel with archetype, share, weight and a link to the list used, and the settings form with `budget_usd`, `top`, `days`, fixed weights written as `dragapult-ex=0.3, gardevoir=20%` and a comma-separated exclusion list. The screen this page reorganises around candidates rather than versions.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: each iteration printing all eight screened swaps as a `| troca | triagem | Δ |` table, then the finalist's confirmation line *"Confirmação de **−1 Spiritomb / +1 Shaymin** com sementes novas (250 por oponente): 57.3% contra 59.5% — dentro da margem, recusada"*, and the closing *"Lista final: 56.9% (IC 55.2%–58.7%)"*. The report whose completeness BR-S07.T06-02 turns into a screen: every candidate visible, not only the winner.
- `pokemon/ESPECIFICACAO.md` §5.3 — verified: *"3 iterações, 24 trocas na triagem, 3 finalistas, nenhuma confirmada (ganhos de +2,7 a +4,6 pontos na triagem viraram −2,2 a +0,9 na confirmação). Lista final = lista inicial, 56,9 % (IC 55,2–58,7)"*. The run the page must be able to present as an informative negative result rather than as a blank screen.
- `pokemon/ESPECIFICACAO.md` §4.4 RN-48 — verified: *"Diferença abaixo de ~3 pontos com 1200 partidas é ruído"*. The reason BR-S07.T06-01 forbids a bare point estimate anywhere on the page.
- [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) — the `OpponentPanel`, `LiveProgress` and `useJobStream` components this page reuses, the URL-state discipline, the build-mismatch mark and the pt-BR strings module.
- [S07.T04](T04-holdout-acceptance-and-versioning.md) (`optimizer_candidates` and every column rendered here; the "reported, never re-gated" rule behind BR-S07.T06-04), [S07.T05](T05-optimize-job-orchestration.md) (`OptimizeParams`, `OptimizeProgress`, `OptimizeResult`, `OptimizeStopReason`), [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md) (the job endpoints and the SSE contract), [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md) (the builder this page links into), [S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md) (the authoring queue the excluded cards link to), [Decision log](../../project/02-decision-log.md) D-006.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
