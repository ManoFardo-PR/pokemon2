# S04.T17 — Web: Evaluate page

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 17 / 18 |
| Depends on | [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md), [S04.T16](T16-api-jobs-and-sse.md) |
| Unblocks | [S07.T06](../07-deck-optimizer/T06-web-optimizer-page.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` meta queries (archetype shares for opponent weights, representative decks) — from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)
- `module` deck builder route and 'evaluate' placeholder button — from [S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)
- `contract` job endpoints + SSE — from [S04.T16](T16-api-jobs-and-sse.md)
- `file` `pokemon/src/pokesearch/templates/sim_project.html`, `sim_run.html`, `sim/runner.py`, `sim/progress.py` — the legacy screen contents and the two statistics; read-only reference

## Outputs (proposed)
- `module` route `/evaluate/:deckId` — opponent panel (top-N archetypes by share in the window with derived weights, manual fixed weights `id=0.3`, exclusions, representative deck link), mode `rápido` (≈ 200 games/opponent) / `longo` (≈ 1,000), bot choice, start → live progress per opponent → result: weighted score with 95 % CI (Wilson, tie = 0.5, RN-45), per-opponent W/L/T, win %, avg turns, end reasons, engine build; history of evaluations for the deck — consumed by [S07.T06](../07-deck-optimizer/T06-web-optimizer-page.md)
- `module` `apps/api/src/stats/wilson.ts` — `wilson(successes, n, z = 1.96)`; `weightedScore(perOpponent)` with the delta-method CI

## Initial objective
The user picks a deck version and sees, in minutes, how it fares against the weighted field — the first time the new engine produces a number a player can act on.

## Context

This is the screen where the whole stage becomes a number the user can act on, and the number has to be honest about what it is. Three things make it honest: the opponents are the real meta window (RN-03), ties count as half a win with a Wilson interval (RN-45), and every score is labelled with the engine build that produced it.

The legacy screens are the model. `templates/sim_project.html` shows a versions table (change, price, exact coverage, score, 95 % CI, games, mode), an opponents panel listing archetype, share and weight with a link to the list used, and a collapsible settings form with a price cap, top-N, window in days, fixed weights written as `dragapult-ex=0.3, gardevoir=20%` and a comma-separated exclusion list. `templates/sim_run.html` shows the result — score with CI, games, coverage, seconds — plus a per-opponent table with W/L/T, win rate, average turns and errors. Those are the right contents; what changes is the plumbing: SSE instead of a three-second HTMX poll, URL-held state instead of server-rendered forms, and a per-opponent breakdown that includes the end reasons the legacy computed but never showed.

The two statistics come straight from the legacy and are worth stating exactly, because a score computed differently is not comparable. `runner.py::wilson(successes, n, z=1.96)` is the standard Wilson score interval, and `BatchResult.ci()` calls it with `wins + 0.5 * ties` over `wins + losses + ties` — that is RN-45's "ties = 0.5" in its exact form. `progress.py::_weighted(per)` computes `score = Σ wᵢ·pᵢ / Σ wᵢ` and its variance by the delta method, `Σ (wᵢ/Σw)² · pᵢ(1−pᵢ) / max(gamesᵢ − errorsᵢ, 1)`, with a half-width of `1.96·√var`. Note the denominator: games that errored are excluded, so a pairing that partly failed widens its own interval instead of quietly counting as losses.

Two design points follow from the stage's other work. **A job is reproducible from its params**: the opponent list, the weights (derived or fixed), the exclusions, the games per opponent, the bots and `seed0` are all stored in `jobs.params_json` ([S04.T14](T14-jobs-schema-migration.md)), so the same evaluation can be re-run and compared. **Scores from different engine builds are never compared silently**: each history row shows its `engine_build`, and a row whose build differs from the current binary is marked, the same discipline RN-42 applies to suites.

The page is pt-BR (D-006), which is why the modes are labelled `rápido` and `longo`; the code, the route and the API stay English.

## Scope

- **In scope.** The `/evaluate/:deckId` route and its URL-held state; the opponent panel (top-N by share, derived weights, fixed-weight overrides, exclusions, representative-deck links); the mode and bot selectors; the start action and its mapping to `POST /api/jobs`; the live view over SSE (per-opponent bars, partial record, elapsed time, cancel); the result view (weighted score with CI, per-opponent table, end reasons, engine build, invalid actions); the deck's evaluation history; `apps/api/src/stats/wilson.ts` with `wilson` and `weightedScore`; the empty, error and cancelled states; the strings entries in the pt-BR module.
- **Out of scope.** The job endpoints and the SSE transport ([S04.T16](T16-api-jobs-and-sse.md)); the worker ([S04.T15](T15-worker-job-runner.md)); meta shares and representative decks ([S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)); the deck builder itself ([S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)); the optimizer page that reuses these components ([S07.T06](../07-deck-optimizer/T06-web-optimizer-page.md)); frozen suites and the mirror reading ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md)) — this page evaluates against a chosen field, not against a frozen ruler; coverage numbers on the result ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) fills the placeholder).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-03 | **Kept (opponent weights here).** The default opponent set is the top-N archetypes of the meta window — Standard, last 90 days, ≥ 16 players, at most 400 tournaments — with weights equal to their normalized shares in that window; the window parameters are shown on the panel and stored in the job params. | `useOpponents()` calling `archetypesFor`/`windowStats` from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md); the panel header renders the window | `evaluate.spec.tsx > default weights equal normalized shares`; `> the window parameters are displayed and stored in params` |
| RN-45 | **Kept.** A tie counts as half a win and the interval is Wilson with `z = 1.96`: per opponent, `p = (wins + 0.5·ties) / (wins + losses + ties)` and the CI is `wilson(wins + 0.5·ties, wins + losses + ties, 1.96)`. The weighted score uses the delta method over the per-opponent rates. | `apps/api/src/stats/wilson.ts::wilson` and `weightedScore` | `wilson.spec.ts > matches the legacy values on fixed vectors`; `> a tie counts as half a win`; `> weightedScore matches the delta-method formula` |
| BR-S04.T17-01 | Weights are normalized to sum to 1 before the job is created, after exclusions and after fixed-weight overrides are applied; a fixed weight is honoured exactly and the remaining weight is distributed over the others in share proportion. | `buildOpponentSet()` in the page's model layer | `evaluate.spec.tsx > fixed weights are honoured and the rest renormalizes`; `> excluding an archetype renormalizes the remainder`; `> weights sum to 1 within 1e-9` |
| BR-S04.T17-02 | The evaluation is reproducible from its params: `deckVersionId`, the full opponent list with final weights, `gamesPerOpponent`, both bot names, `seed0` and `storeGames` are sent in `POST /api/jobs` and displayed on the result. Re-running an old evaluation re-sends the stored params verbatim. | the `EvaluateParams` body ([S04.T15](T15-worker-job-runner.md)); a "repetir" action reading `jobs.params_json` | `evaluate.spec.tsx > the created job carries every param`; `> repeat sends the stored params unchanged` |
| BR-S04.T17-03 | A score is always shown with its engine build; a history row whose `engine_build` differs from the current binary is marked, and the UI never renders a comparison between two different builds without that mark. | the result header and the history table's build column; `GET /api/version` for the current build | `evaluate.spec.tsx > the result shows the engine build`; `> a history row from another build is marked` |
| BR-S04.T17-04 | A pairing with `errors > 0` is shown as such: its errored games are excluded from its denominator (as in `weightedScore`) and the row displays the error count; the page never presents a partly failed pairing as a clean result. | `weightedScore`'s `max(games − errors, 1)` denominator; the per-opponent table's error column | `wilson.spec.ts > errored games are excluded from the denominator`; `evaluate.spec.tsx > a pairing with errors shows the count` |
| BR-S04.T17-05 | Every number that can be zero has an explicit empty state: no opponents in the window, a job that produced zero games, a deck version that is not valid for simulation — each renders a named message and no chart. | the page's guard clauses | `evaluate.spec.tsx > no opponents renders the empty state`; `> a job with zero games renders the failure state, not 0 %` |
| BR-S04.T17-06 | The page state lives in the URL: `?mode`, `?bot`, `?top`, `?exclude`, `?fixed`, `?job` are query parameters, so a reload or a shared link reproduces the view, and starting a job puts its id in `?job`. | the router's search-params binding ([S01.T08](../01-foundation/T08-web-skeleton.md), TanStack Router) | `evaluate.spec.tsx > reloading with ?job=N restores the live view`; `> changing the mode updates the URL` |
| BR-S04.T17-07 | The live view ends deterministically: on `done` it renders the result, on `error` the message, on `cancelled` the partial numbers marked as incomplete; it never spins forever, and it falls back to polling `GET /api/jobs/:id` once a second if the SSE stream is refused with 503. | the SSE hook's `onDone`/`onError` handlers and its 503 fallback ([S04.T16](T16-api-jobs-and-sse.md) BR-S04.T16-07) | `evaluate.spec.tsx > done renders the result`; `> a 503 stream falls back to polling`; `> a cancelled job shows partial results marked incomplete` |
| BR-S04.T17-08 | The two modes are fixed and labelled with their real cost: `rápido` ≈ 200 games per opponent, `longo` ≈ 1,000; the page shows the resulting total games and an estimate in seconds from the throughput recorded in `docs/PERF.md` ([S04.T18](T18-performance-baseline.md)). | the mode constants and the estimate helper | `evaluate.spec.tsx > the mode shows total games and an estimate` |
| BR-S04.T17-09 | The UI is pt-BR through the strings module (D-006); no literal user-facing string appears in a component. | `apps/web/src/strings/pt-BR.ts`; an eslint rule forbidding bare JSX text ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a fixture component with a hard-coded label; `evaluate.spec.tsx` asserts labels through the strings module |

## Data operations

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Open the page for a deck | route `/evaluate/:deckId` from the builder's "avaliar" button ([S03.T12](../03-tournament-meta-and-deck-builder/T12-web-deck-builder.md)) | `GET /api/user-decks/:id`, `GET /api/meta/archetypes?days=90&top=N` | deck version header; opponent panel with shares and derived weights (RN-03) |
| Change top-N | number input in the opponent panel | re-query archetypes | the list and the weights recompute; `?top=` updates |
| Exclude an archetype | checkbox per row | none (client state) | the row is struck through, the remaining weights renormalize (BR-S04.T17-01); `?exclude=` updates |
| Fix a weight | inline input `0.3` or `30%` per row | none (client state) | the row shows "fixo", the rest renormalizes; `?fixed=id=0.3,…` updates |
| Open the representative list | link per row | `GET /api/decks/:deckId` in a new tab | the tournament list used as that opponent |
| Choose mode | `rápido` / `longo` segmented control | none | total games and the time estimate update (BR-S04.T17-08); `?mode=` updates |
| Choose the bot | select (`heuristic`, `random`, later ones) | `GET /api/bots` when it exists ([S06.T07](../06-bots/T07-bot-registry-and-freezing.md)); a static list until then | the selection is stored in the job params |
| Start the evaluation | primary button "avaliar" | `POST /api/jobs` `{ kind: "evaluate", params }` → 202 `{ id }` | `?job=<id>`, the live view replaces the form (BR-S04.T17-02) |
| Watch progress | live panel, one bar per opponent | `GET /api/jobs/:id/events` (SSE) | per-opponent `done/total`, running W/L/T, elapsed time; a partial weighted score once every opponent has at least 20 games |
| Cancel | "cancelar" button while running | `POST /api/jobs/:id/cancel` | within about two seconds the status becomes `cancelled` and the partial numbers are marked incomplete (BR-S04.T17-07) |
| Read the result | result panel | `GET /api/jobs/:id` | weighted score with 95 % CI, per-opponent table (W/L/T, win %, CI, avg turns, end reasons, invalid actions, errors), engine build (RN-45, BR-S04.T17-03, -04) |
| Repeat an evaluation | "repetir" on a history row | `GET /api/jobs/:id` then `POST /api/jobs` with the stored params | a new job with identical params; the two rows sit side by side in the history (BR-S04.T17-02) |
| Browse history | history table under the result | `GET /api/jobs?kind=evaluate&limit=25` filtered client-side by deck version | date, mode, bot, games, score with CI, engine build, status; a row from another build is marked |
| Export | "copiar" on the result | none | the result as text (score, CI, per-opponent table) for pasting into notes |

## Interfaces

**`apps/api/src/stats/wilson.ts`** — the two statistics, unit-tested against the legacy values.

```ts
/** Wilson score interval. `successes` may be fractional: ties count as 0.5 (RN-45). */
export function wilson(successes: number, n: number, z = 1.96): [low: number, high: number] {
  if (n <= 0) return [0, 1];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export interface OpponentResult {
  archetypeId: string; label: string; weight: number;
  wins: number; losses: number; ties: number; errors: number; games: number;
  avgTurns: number | null; outcomes: Record<EndReason, number> | null;
}

export interface ScoreResult { score: number; ciLow: number; ciHigh: number; games: number }

/** Σ wᵢ·pᵢ / Σ wᵢ with a delta-method 95 % CI; errored games leave the denominator. */
export function weightedScore(per: readonly OpponentResult[], z = 1.96): ScoreResult;

export function winRate(r: OpponentResult): number;   // (wins + 0.5·ties) / (wins + losses + ties)
```

`weightedScore`'s variance is `Σ (wᵢ/Σw)² · pᵢ(1−pᵢ) / max(gamesᵢ − errorsᵢ, 1)` and the half-width is `z·√var`, clamped to `[0, 1]` — the legacy `_weighted` formula unchanged.

**Route and state.**

```ts
// apps/web/src/routes/evaluate.$deckId.tsx
export const Route = createFileRoute("/evaluate/$deckId")({
  validateSearch: z.object({
    mode: z.enum(["rapido", "longo"]).default("rapido"),
    bot: z.string().default("heuristic"),
    top: z.coerce.number().int().min(3).max(30).default(12),
    exclude: z.string().optional(),      // "dragapult-ex,gardevoir"
    fixed: z.string().optional(),        // "dragapult-ex=0.3,gardevoir=20%"
    job: z.coerce.number().int().optional(),
  }),
});

export const MODES = { rapido: 200, longo: 1000 } as const;   // games per opponent (BR-S04.T17-08)
```

**Opponent set building** (BR-S04.T17-01):

```text
1. shares   = archetypesFor(window).slice(0, top)              // RN-03
2. keep     = shares.filter(s => !excluded.has(s.id))
3. fixedSum = Σ fixed weights of kept archetypes               // parsed from "id=0.3" or "id=30%"
4. rest     = keep without a fixed weight
5. wᵢ       = fixed[i]                       for fixed rows
            = (1 - fixedSum) · shareᵢ / Σ shares(rest)   for the others
6. assert Σ w = 1 ± 1e-9, every w > 0
```

**Components.**

| Component | Responsibility |
|---|---|
| `OpponentPanel` | the table of archetypes with share, weight, fixed input, exclude checkbox and list link; reused by [S07.T06](../07-deck-optimizer/T06-web-optimizer-page.md) |
| `ModeSelector` | `rápido`/`longo`, total games, time estimate from `docs/PERF.md` |
| `LiveProgress` | one bar per opponent driven by the SSE `progress` and `pairing` events, plus elapsed time and cancel |
| `ScoreCard` | weighted score, 95 % CI, games, engine build, invalid actions |
| `PerOpponentTable` | W/L/T, win % with CI, avg turns, end-reason chips, errors |
| `EvaluationHistory` | past evaluate jobs for this deck, with build marks and "repetir" |

**SSE hook.**

```ts
export function useJobStream(jobId: number | undefined): {
  status: JobStatus | undefined;
  progress: JobProgress | undefined;
  pairings: Map<number, PairingView>;
  error: string | undefined;
  transport: "sse" | "poll";     // "poll" after a 503 (BR-S04.T17-07)
};
```

**Endpoints consumed.** `GET /api/user-decks/:id` and its `/versions` ([S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)), `GET /api/meta/archetypes` and `GET /api/decks/:id` ([S03.T07](../03-tournament-meta-and-deck-builder/T07-api-meta-endpoints.md)), `GET /api/version` ([S01.T07](../01-foundation/T07-api-skeleton-and-health.md)) and the five job endpoints of [S04.T16](T16-api-jobs-and-sse.md).

**Strings.** `apps/web/src/strings/pt-BR.ts` gains the `evaluate.*` keys: `evaluate.title`, `evaluate.mode.rapido`, `evaluate.mode.longo`, `evaluate.start`, `evaluate.cancel`, `evaluate.repeat`, `evaluate.score`, `evaluate.ci`, `evaluate.opponents`, `evaluate.weight`, `evaluate.share`, `evaluate.fixed`, `evaluate.exclude`, `evaluate.endReason.*`, `evaluate.empty.noOpponents`, `evaluate.empty.zeroGames`, `evaluate.build.mismatch`.

## Implementation steps

1. Write `apps/api/src/stats/wilson.ts` with `wilson`, `winRate` and `weightedScore`, and spec them against fixed vectors taken from the legacy formulas, including the ties-as-half case and the errors-excluded denominator (RN-45, BR-S04.T17-04). `pnpm --filter api test` green.
2. Add the route with its search-params schema and the deck header; render the opponent panel from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)'s archetype shares with derived weights (RN-03, BR-S04.T17-06).
3. Implement exclusions and fixed weights with the renormalization rule, and spec the three weight cases (BR-S04.T17-01).
4. Add `ModeSelector` and the bot select; show total games and the time estimate read from `docs/PERF.md`'s recorded throughput (BR-S04.T17-08).
5. Wire the start action to `POST /api/jobs` and put the returned id in `?job`; spec `> the created job carries every param` (BR-S04.T17-02).
6. Implement `useJobStream` over `GET /api/jobs/:id/events` with the 503 polling fallback, and `LiveProgress` with per-opponent bars and cancel; spec the three terminations (BR-S04.T17-07).
7. Implement `ScoreCard` and `PerOpponentTable` from `GET /api/jobs/:id`, computing the score with `weightedScore`; show the engine build and the invalid-action count (RN-45, BR-S04.T17-03).
8. Implement `EvaluationHistory` with the build mark and the "repetir" action reading stored params (BR-S04.T17-02, -03).
9. Add the empty and failure states — no opponents, zero games, invalid deck version — each with its own string key (BR-S04.T17-05).
10. Move every literal into `pt-BR.ts` and check that `pnpm lint` fails on a hard-coded label (BR-S04.T17-09, D-006).
11. Run the manual acceptance: evaluate a fixture deck against three opponents in `rápido` mode, watch the bars move, cancel one run, re-run it, and confirm the history shows both with the same engine build.

## Edge cases and error handling

- **No opponents in the window** (a fresh install with no tournament sync) → the panel renders `evaluate.empty.noOpponents` with a link to the meta sync page; the start button is disabled. No fabricated default field.
- **The deck version has fewer than 60 cards** → the start button is disabled with the validation message from [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md) (`SIZE_NOT_60`); the engine would refuse anyway (RN-10), but failing before the job is created saves a minute.
- **A job that produced zero games** (every pairing failed) → the result shows `evaluate.empty.zeroGames` with the per-pairing error messages, never "0 %". A score of zero and no score are different facts (BR-S04.T17-05).
- **An SSE client disconnecting** (tab switch on mobile, laptop sleep) → `EventSource` reconnects by itself and the hook resynchronises from the full state each poll; if the stream is refused with 503, the hook switches to polling `GET /api/jobs/:id` once a second and says so through `transport` (BR-S04.T17-07).
- **The user cancels mid-run** → the partial per-opponent numbers are shown with an "incompleto" mark, and no weighted score is computed, because a score over a truncated, unbalanced sample is misleading.
- **Fixed weights summing above 1** → the inputs are clamped and the panel shows an inline error; the start button is disabled until the sum is at most 1 (BR-S04.T17-01).
- **A fixed weight on an excluded archetype** → the exclusion wins and the fixed value is dropped with a note, so the two controls cannot contradict each other.
- **A history row from a different engine build** → marked with `evaluate.build.mismatch` and its score is never rendered inside the same comparison widget as a current-build score, the same discipline RN-42 applies to suites (BR-S04.T17-03).
- **A pairing with `invalid_actions > 0`** → the count is shown next to the bot name. A non-zero value means the bot returned illegal actions that RN-21 replaced with defaults, so the measurement partly reflects the default resolver rather than the bot ([S04.T09](T09-prompt-protocol.md)).
- **Two tabs evaluating the same deck** → both create their own job; the history shows both. The api does not deduplicate ([S04.T16](T16-api-jobs-and-sse.md) open question), and the page makes the duplication visible rather than hiding it.
- **The worker is not running** → the job stays `queued`; the live view shows "na fila" with the elapsed time and a hint that the worker process must be started. No spinner without an explanation.

## Acceptance / verification

- [ ] `pnpm --filter api test wilson` green: `> matches the legacy values on fixed vectors`, `> a tie counts as half a win` (10 wins, 2 ties, 8 losses → `p = 0.55`), `> weightedScore matches the delta-method formula`, `> errored games are excluded from the denominator` (RN-45, BR-S04.T17-04).
- [ ] `pnpm --filter web test evaluate` green: `> default weights equal normalized shares` and `> the window parameters are displayed and stored in params` (RN-03).
- [ ] `> fixed weights are honoured and the rest renormalizes`, `> excluding an archetype renormalizes the remainder`, `> weights sum to 1 within 1e-9` (BR-S04.T17-01).
- [ ] Manual, end to end: evaluate a fixture deck against three opponents in `rápido` mode → three progress bars advance, the final score with a 95 % CI is shown, the per-opponent table lists W/L/T, win %, average turns and end reasons, and the engine build matches `ptcg-cli --version`.
- [ ] Reloading the page at `?job=<id>` mid-run restores the live view and it completes normally; `> reloading with ?job=N restores the live view` (BR-S04.T17-06).
- [ ] `> a 503 stream falls back to polling` and `> a cancelled job shows partial results marked incomplete` (BR-S04.T17-07).
- [ ] `> the created job carries every param` and `> repeat sends the stored params unchanged`, verified by comparing the two `jobs.params_json` values byte for byte (BR-S04.T17-02).
- [ ] `> no opponents renders the empty state` and `> a job with zero games renders the failure state, not 0 %` (BR-S04.T17-05).
- [ ] `> a history row from another build is marked` after running the same evaluation before and after touching a core source file (BR-S04.T17-03).
- [ ] `pnpm lint` fails on a fixture component with a hard-coded pt-BR label and passes with the string moved into `pt-BR.ts` (BR-S04.T17-09).

## Risks and open questions

- **Risk — the weighted score is read as more precise than it is.** With 200 games per opponent the per-opponent intervals are wide, and the legacy's own note is that differences under about 3 points at 1,200 games are noise (RN-48). Mitigation: the CI is always rendered next to the score, never the score alone, and `longo` mode states its cost; [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) and [S07.T03](../07-deck-optimizer/T03-sequential-confirmation.md) own the statistical plan for decisions.
- **Risk — opponent weights drift as the window moves.** Two evaluations a week apart use different shares and are not strictly comparable. Mitigation: the exact weights are stored in the job params and shown on the result, and a frozen suite ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)) is the tool for comparison over time — this page is for "how does it do against today's field".
- **Risk — the time estimate is wrong before [S04.T18](T18-performance-baseline.md) runs.** Mitigation: the estimate reads the recorded throughput and shows "—" when `docs/PERF.md` has no number yet, rather than guessing.
- **Question — should the page offer a mirror reading** (the same list on both sides) as a third mode? It separates bot skill from deck quality (RN-44) and the plumbing is one more pairing. Recommendation: leave it to [S06.T08](../06-bots/T08-measurement-score-and-mirror.md), where the mirror is part of a measurement rather than of an ad-hoc evaluation; revisit if the user asks for it on this screen.
- **Question — should the result show exact and proven coverage** for the evaluated deck? The legacy showed "cobertura exata" on the run panel, and RN-70 says the two numbers always appear together. Recommendation: render both placeholders now and fill them in [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md); showing only the exact number would break RN-70.

## References

- `pokemon/src/pokesearch/sim/runner.py` — verified: `wilson(successes, n, z=1.96)` with `denom = 1 + z²/n`, `center = (p + z²/2n)/denom`, `half = z·√(p(1−p)/n + z²/4n²)/denom`, clamped to `[0,1]`; `BatchResult.win_rate = (wins + 0.5·ties)/n` and `ci()` calling `wilson(wins + 0.5·ties, wins+losses+ties)` (RN-45); `BatchResult.to_dict()`'s field list, which the per-opponent table mirrors.
- `pokemon/src/pokesearch/sim/progress.py` — verified: `_weighted(per)` computing `score = Σ w·p / Σ w`, `var = Σ (w/Σw)²·p(1−p)/max(games − errors, 1)`, `half = 1.96·√var`, clamped; `measure()`'s returned shape (`score`, `ci`, `record`, `avg_turns`, `outcomes`, `loss_by_deck_out`, `loss_by_no_pokemon`, `per_opponent`) — the fields this page displays.
- `pokemon/src/pokesearch/templates/sim_project.html` — verified: the versions table (change, price, exact coverage, score, CI, games, mode), the opponents panel with archetype, share, weight and the list used, and the settings form with `budget_usd`, `top`, `days`, fixed weights written as `dragapult-ex=0.3, gardevoir=20%` and a comma-separated exclusion list.
- `pokemon/src/pokesearch/templates/sim_run.html` — verified: the result panel (score, CI, games, exact coverage, seconds) and the per-opponent table (version, archetype, weight, games, W/D/E, win %, average turns, errors).
- [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md) — `archetypesFor`, `windowStats` and `getDeck`, the sources of the shares, the window description and the representative lists (RN-03).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
