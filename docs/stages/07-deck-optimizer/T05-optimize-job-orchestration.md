# S07.T05 — Optimize job orchestration

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 5 / 7 |
| Depends on | [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S07.T02](T02-paired-seed-screening.md), [S07.T03](T03-sequential-confirmation.md), [S07.T04](T04-holdout-acceptance-and-versioning.md) |
| Unblocks | [S07.T06](T06-web-optimizer-page.md), [S07.T07](T07-coach-lost-game-review.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` worker dispatcher — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `module` screening — from [S07.T02](T02-paired-seed-screening.md)
- `module` confirmation — from [S07.T03](T03-sequential-confirmation.md)
- `module` acceptance/versioning — from [S07.T04](T04-holdout-acceptance-and-versioning.md)

## Outputs (proposed)
- `module` worker kind `optimize { deckVersionId, suiteId | opponents, maxIterations, k, bot, strongBot?, priceCap, fixed }` — loop: propose → screen → confirm → accept → next iteration from the accepted list; cancellation between blocks; progress with current phase and candidate; budget rule: run screening/confirmation with the cheap bot (planner), validate the final list with the strong bot (rollout) on holdout seeds — consumed by [S07.T06](T06-web-optimizer-page.md), [S07.T07](T07-coach-lost-game-review.md)

## Initial objective
One job runs the whole method end to end in minutes, resumable and cancellable, with every decision persisted.

## Context

Four modules exist by now and none of them runs a game. [S07.T01](T01-candidate-pool-and-move-generation.md) proposes swaps, [S07.T02](T02-paired-seed-screening.md) builds pairings and folds results, [S07.T03](T03-sequential-confirmation.md) drives a block loop through an injected callback, [S07.T04](T04-holdout-acceptance-and-versioning.md) decides and records. This subtask is the thing that holds an engine process in one hand and a database transaction in the other, and it is deliberately last so that every statistical decision is already fixed before anything is orchestrated.

The legacy's equivalent is `optimizer.py::run_optimization` (L422–511), and its shape carries over: a hill-climb over iterations, each proposing `k` moves, screening them cheaply, confirming the best and applying it when it clears the bar. What does not carry over is the plumbing around it. The legacy ran inside the web process on a daemon thread (`sim/jobs.py`), cancelled through a `threading.Event` the loop polled, and wrote progress into a growing text column. A run died with the page that started it. Here the optimize job is a `jobs` row of kind `optimize` claimed by the worker exactly like an `evaluate` job ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)), it survives reloads, it is cancelled by a status change the loop observes between blocks, and its progress is a small JSON document written at most twice a second.

**One `jobs` row, many engine invocations.** An optimize run is dozens of arms — a reference arm and up to twenty-four candidate arms per screening iteration, then a reference arm and up to four candidate arms per confirmation block, then two holdout arms per accepted swap. Each arm is one `ptcg-cli` invocation. They are *not* separate `jobs` rows: they are pairings of the one optimize job, with `idx` allocated monotonically and `label` naming the phase, the iteration and the candidate, so `job_pairings` and `games` stay joinable to the run that produced them and [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)'s open question about a `parent_job_id` column is answered by not needing one. `optimizer_candidates` then hangs off the same `job_id`, and one delete removes a run whole.

**The budget rule is what makes the method affordable.** Screening and confirmation run with the cheap bot — the planner ([S06.T03](../06-bots/T03-planner-turn-policy.md)) — because they are where the games are: a full run at six iterations is on the order of half a million games, and a rollout bot doing 128 playouts per decision is orders of magnitude slower per game. The strong bot ([S06.T05](../06-bots/T05-rollout-bot.md)) appears exactly twice: on each accepted swap's holdout, and on the end-of-run holdout of the final list against the list the run started from. That last measurement is the run's headline, and it exists because per-swap holdouts do not compound — three accepted swaps each measured against their own predecessor say nothing rigorous about the final list against the original one, so the job measures that directly on its own seed set.

**No card is authored during an optimize job.** The legacy's `prepare_deck` (L350–359) called `cardgen.ensure_cards_for_deck(conn, export_text, use_llm=use_llm)` at L352, reached with `use_llm=True` through `OptimizeConfig.use_llm_cards`, and it was called **inside the loop** — at L481 for every screened candidate and at L497 for the confirmation. A list that reached the engine with an unmodelled card had that card generated by a language model during the very run that measured it, so the resulting number depended on a definition nobody had reviewed and which did not exist when the run began. Under D-004 rules are data authored ahead of time, and Architecture principle 8 keeps LLMs off the critical path (RN-60). So the job's position is absolute: a card without exact coverage is excluded from the candidate pool (RN-81, [S07.T01](T01-candidate-pool-and-move-generation.md) BR-S07.T01-06), and a card without exact coverage in a list that *must* be played — the evaluated deck or an opponent — fails the job before the first game with `UncoveredCard`. The path forward is the authoring queue ([S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md)), not an improvisation. This is BR-S07.T05-03 and it has an import-graph test behind it.

**Resumability is coarse and honest.** The unit of resumption is the iteration, not the block: a resumed job re-reads its `optimizer_candidates` rows, skips every iteration already recorded, and continues from the next one. Blocks are not resumed because a half-finished block is discarded by [S07.T03](T03-sequential-confirmation.md) anyway, and because the seeds are a pure function of `(job, iteration, block, opponent)`, so re-running a block reproduces it exactly rather than producing a second, different sample. That property — seeds derived from identity, never from a counter or a clock — is what makes "resume" mean "continue" rather than "start something new with the same name".

**Cancellation is observed between blocks and between arms**, never in the middle of one. The worker re-reads `jobs.status` on the same cadence [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) already uses, and a cancelled job finishes the arm in flight, discards the incomplete block, writes the candidate rows it can justify with `decision_note: 'cancelled'`, and terminates. A run that is cancelled after two accepted swaps keeps both versions: they were accepted under the stated rule, and revoking them would make cancellation a decision rather than a stop.

## Scope

- **In scope.** The `optimize` job kind registered against [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)'s dispatcher; `apps/worker/src/optimizer/run.ts` (the iteration loop) and `kinds/optimize.ts` (params schema, build, progress, result); the `OptimizeParams`, `OptimizeProgress` and `OptimizeResult` contracts; the arm runner that turns a `Pairing[]` into one engine invocation and returns `games` rows; pairing `idx` allocation and `label` format; the game-retention policy for arms; the budget accounting and its caps; the bot-assignment rule (cheap for screening and confirmation, strong for holdouts); the end-of-run holdout of the final list; cancellation and resumption; the coverage precondition; the run summary written into `jobs.result_json`.
- **Out of scope.** Proposing moves ([S07.T01](T01-candidate-pool-and-move-generation.md)); the screening threshold and the paired estimator ([S07.T02](T02-paired-seed-screening.md)); the block loop's stopping rules, the Bonferroni level and the power statement ([S07.T03](T03-sequential-confirmation.md)); the acceptance conditions, the per-swap holdout and `optimizer_candidates` ([S07.T04](T04-holdout-acceptance-and-versioning.md)); spawning and parsing the engine process, the job claim, the progress throttle and the cancellation primitives ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); the page ([S07.T06](T06-web-optimizer-page.md)); the coach ([S07.T07](T07-coach-lost-game-review.md)), which consumes this job's stored logs; the scheduler ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It is where RN-81's pool filter becomes a job-level refusal (BR-S07.T05-03), where RN-46's seeds are threaded through every arm, and where RN-83's two sieves are sequenced; each is owned elsewhere.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S07.T05-01 | An optimize run is exactly one `jobs` row of kind `optimize`. Every arm is a pairing of that job, with `idx` allocated monotonically from 0 and `label` = `"<phase>\|it<iteration>\|<ref\|c<idx>>\|<archetype>"`; no child `jobs` row is created and no `parent_job_id` is needed. | `run.ts::nextPairingIdx()`; the `optimize` handler never calls the job-creation path | `optimize.spec.ts > a full run creates one jobs row`; `> pairing labels identify phase, iteration and candidate`; `> pairing idx is strictly increasing across arms` |
| BR-S07.T05-02 | Screening and confirmation run with `params.bot` (the cheap bot, default `planner_rs_v1`); **every** holdout — per accepted swap and the end-of-run one — runs with `params.strongBot` (default `rollout_v1`). A holdout never silently falls back to the cheap bot, and the bot actually used is recorded on the row. | `armBot(phase, params)`, the single source of the bot name; [S07.T04](T04-holdout-acceptance-and-versioning.md) BR-S07.T04-08's `UnknownBot` check | `optimize.spec.ts > screening arms name params.bot and holdout arms name params.strongBot`; `> an unresolvable strongBot fails the job before the first holdout game`; `> there is no code path from a holdout phase to params.bot` |
| BR-S07.T05-03 | **No card is authored, generated or approximated during an optimize job.** A card without `card_status.exact = 1` is excluded from the candidate pool (RN-81); a card without exact coverage in the evaluated list or in any opponent list fails the job with `UncoveredCard` naming the card, its status and which list it was in, before the first game. `apps/worker/src/optimizer/**` imports nothing from `apps/worker/src/authoring` or `packages/llm`. | `assertListCovered` ([S07.T01](T01-candidate-pool-and-move-generation.md)) called for the evaluated list and every opponent list in `build()`, before any pairing is constructed; an import-graph assertion over the whole optimizer directory | `optimize.spec.ts > an opponent list with an approx card fails the job with UncoveredCard and zero games`; `> an evaluated list with an uncovered card fails before the pool is built`; `policy.spec.ts > apps/worker/src/optimizer/** imports no authoring or llm module`; `pnpm check` greps the directory for `cardgen`, `ensure_cards`, `use_llm` and fails on a match |
| BR-S07.T05-04 | Cancellation is observed between arms and between blocks, never inside one: on `status = 'cancelled'` the loop finishes the arm in flight, discards any incomplete confirmation block, writes the candidate rows it can justify with `decision_note: 'cancelled'`, writes the partial run summary and terminates. Deck versions already created are kept. | the `checkCancelled()` call at the top of each arm and each block in `run.ts`; [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) BR-S04.T15-06's watcher | `optimize.spec.ts > cancelling mid-block leaves status cancelled within 2 s and discards that block`; `> an accepted version created before the cancel still exists`; `> the partial result_json names the completed iterations` |
| BR-S07.T05-05 | A resumed job resumes by **iteration**: it re-reads `optimizer_candidates` for its `job_id`, skips every iteration that already has rows, and continues from the next. Because every seed is a pure function of `(job, phase, iteration, block, opponent)`, a re-run arm reproduces its games exactly rather than sampling again. | `resumeFrom(db, jobId)` returning the first unrecorded iteration; the seed constructors of [S07.T02](T02-paired-seed-screening.md), [S07.T03](T03-sequential-confirmation.md) and [S07.T04](T04-holdout-acceptance-and-versioning.md) | `optimize.spec.ts > a job resumed after iteration 2 starts at iteration 3`; `> re-running a completed iteration produces byte-identical pairing fingerprints`; `> resume never rewrites an existing candidate row` |
| BR-S07.T05-06 | At most one swap is applied per iteration: when two candidates accept, the larger confirmation Δ becomes the new list and the other is recorded `confirmed` with `decision_note: 'deferred_to_next_iteration'`, to be re-proposed and re-screened against the changed list rather than applied blind. | `run.ts`'s `pickApplied(accepted)` with the `(Δ desc, se asc, idx asc)` order | `optimize.spec.ts > two accepted candidates yield one applied swap and one deferred row`; `> the deferred move is re-proposable in the next iteration` |
| BR-S07.T05-07 | The run's headline number is an **end-of-run holdout**: the final list against the list the run started from, on a seed set (`'final-holdout'`) disjoint from every screening, confirmation and per-swap holdout set, with the strong bot. It is reported, never re-gated: it cannot revoke a version or change a decision. | `finalHoldout()` called after the loop; its result written only into `jobs.result_json` | `optimize.spec.ts > the final holdout salt is disjoint from every other salt in the run`; `> a negative final holdout leaves every accepted version in place`; `> the result carries the final holdout with its CI, n and bot` |
| BR-S07.T05-08 | The job has a hard game budget (`gamesBudget`, default 1,200,000) and an optional wall-clock budget; the loop checks both before scheduling each arm and stops with `budget_exhausted` or `time_budget` rather than starting an arm it cannot finish. The estimated cost of the next arm is computed from its pairing sizes, not guessed. | `budget.ts::canAfford(next, spent, params)` called before every arm | `optimize.spec.ts > a run whose budget covers two iterations stops with budget_exhausted at the third`; `> the budget check precedes the arm, so no partial arm is ever started`; `> spent games equal the sum of the pairings' games` |
| BR-S07.T05-09 | `games` rows of an arm are folded into per-pair differences and then deleted, unless `params.storeGames` asks to keep them; `params.storeLogs` additionally keeps event logs and may only be set together with `storeGames`. The default keeps `job_pairings` aggregates and drops the per-game rows, so a full run does not leave a million rows behind. | `persistArm()`'s fold-then-drop step, in the same transaction as the pairing result; a zod refinement rejecting `storeLogs` without `storeGames` | `optimize.spec.ts > a default run leaves zero games rows and complete job_pairings rows`; `> storeGames keeps them`; `> storeLogs without storeGames is a 400 from the api`; `> the folded statistics are identical with and without storeGames` |
| BR-S07.T05-10 | Every arm of a run uses one `engine_build` and one `rules_snapshot`, recorded on the `jobs` row at claim time; if either changes mid-run — the binary is rebuilt, a code is edited — the loop stops with `stopReason: 'environment_changed'` rather than mixing arms. | the check at the top of each arm comparing the live values against `jobs.engine_build` / `jobs.rules_snapshot` | `optimize.spec.ts > a rules_snapshot change mid-run stops the job with environment_changed`; `> the stored candidates all carry the job's build and snapshot` |
| BR-S07.T05-11 | The worker writes `jobs`, `job_pairings`, `games` and `optimizer_candidates` only; the accepted deck version is created through `apps/api` ([S07.T04](T04-holdout-acceptance-and-versioning.md) BR-S07.T04-06), and no baseline, meta or rules table is ever written. | the eslint table-ownership rule of [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) BR-S04.T14-08 | `pnpm lint` fails on a fixture writing `user_deck_versions` or `cards` from `apps/worker/src/optimizer`; `grep` finds no `INSERT INTO cards` under the directory |

## Data operations

**CRUD.**

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `jobs` | C | api | `POST /api/jobs { kind: "optimize", params }` | inserted `queued`; `params_json` validated by `OptimizeParams` | [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md) |
| `jobs` | U (`status`, `started_at`, `engine_build`, `rules_snapshot`, `workers`) | worker | at claim | the conditional claim of [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) BR-S04.T15-02 | BR-S07.T05-10 |
| `jobs` | U (`progress_json`) | worker | at most every 500 ms, and once at each phase change | last-write-wins, single statement | BR-S07.T05-04 |
| `jobs` | R (`status`) | worker | between arms and between blocks | cancellation observation | BR-S07.T05-04 |
| `jobs` | U (`status`, `result_json`, `finished_at`) | worker | once, at the end | terminal; `done` requires `engine_build` | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) |
| `job_pairings` | C | worker | once per arm, before its games run | `ON CONFLICT (job_id, idx) DO UPDATE`; `idx` monotonic; `label` names the phase | BR-S07.T05-01 |
| `job_pairings` | U (counters, `outcomes_json`, `avg_turns`, `fingerprint`) | worker | on each arm's `progress` and `result` lines | `fingerprint` written once | [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) |
| `games` | C | worker | during each arm | batches of 500; required for the per-pair fold | [S07.T02](T02-paired-seed-screening.md) BR-S07.T02-01 |
| `games` | R | worker | immediately after each arm, to build `OpponentPairs` | read-only | — |
| `games` | D | worker | right after the fold, unless `params.storeGames` | same transaction as the pairing result | BR-S07.T05-09 |
| `optimizer_candidates` | C | worker | at the end of each iteration | insert-only; one row per proposal | [S07.T04](T04-holdout-acceptance-and-versioning.md) BR-S07.T04-05 |
| `optimizer_candidates` | R | worker | at claim, to resume | read-only | BR-S07.T05-05 |
| `user_deck_versions` | C | **api**, called by the worker | on each accepted swap | `POST /api/user-decks/:id/versions` | BR-S07.T05-11 |
| `user_deck_versions`, `user_decks` | R | worker | reading the evaluated list, its `version_no`, its archetype and its fixed set | read-only | [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) |
| `suites`, `suite_opponents`, `bots` | R | worker | building every arm; resolving both bots | read-only; frozen (RN-41) | [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) |
| `decks`, `deck_cards`, `tournaments`, `cards`, `cards_market_usd`, `card_status` | R | worker | the pool and the coverage precondition | read-only | [S07.T01](T01-candidate-pool-and-move-generation.md) |
| any baseline / meta / rules table | C/U/D | worker | never | the worker writes job tables only | BR-S07.T05-11 |
| any table | C/R/U/D | engine | never | arms are spawned without `DATABASE_PATH` | Architecture principle 1 |

## Interfaces

**Module layout.**

```
apps/worker/src/optimizer/
  run.ts          the iteration loop: propose -> screen -> confirm -> accept -> apply -> next
  arm.ts          runArm(pairings) -> one ptcg-cli invocation, then fold-then-drop
  budget.ts       canAfford(), estimateArm(), spent accounting
  moves.ts        S07.T01     screen.ts / stats.ts  S07.T02
  confirm.ts      S07.T03     accept.ts             S07.T04
apps/worker/src/kinds/optimize.ts   the JobKindHandler registered with S04.T15's dispatcher
```

**Params** (`@pokesearch/shared/jobs`, validated by the api before insert and re-validated by the worker):

```ts
export const OptimizeParams = z.object({
  deckVersionId:   z.number().int(),
  suiteId:         z.number().int().optional(),          // exactly one of suiteId / opponents
  opponents:       z.array(z.object({ deckId: z.string(), weight: z.number().positive(),
                                      archetypeId: z.string().optional() })).min(3).optional(),
  archetypeId:     z.string().optional(),                // pool scope; defaults to the deck's
  days:            z.number().int().min(7).max(365).default(90),

  maxIterations:   z.number().int().min(1).max(12).default(6),
  k:               z.number().int().min(1).max(24).default(24),   // S07.T01 MAX_CANDIDATES
  screenPairs:     z.number().int().min(20).max(2000).default(200),
  blockPairs:      z.number().int().min(50).max(2000).default(500),
  maxBlocks:       z.number().int().min(1).max(8).default(4),
  maxSurvivors:    z.number().int().min(1).max(8).default(4),
  alpha:           z.number().min(0.001).max(0.2).default(0.05),
  minDelta:        z.number().min(0).max(0.1).default(0.005),     // RN-84 practical condition
  lowRhoPolicy:    z.enum(["extend", "report"]).default("report"),
  holdoutPairs:    z.number().int().min(50).max(2000).default(500),

  bot:             z.string().default("planner_rs_v1"),  // screening + confirmation (cheap)
  strongBot:       z.string().default("rollout_v1"),     // every holdout (strong)
  opponentBot:     z.string().optional(),                // defaults to the suite's frozen bot

  priceCap:        z.number().nonnegative().nullable().default(null),
  fixed:           z.array(z.string()).optional(),       // name keys; defaults to the archetype core
  seed0:           z.number().int().nonnegative().default(20260918),

  gamesBudget:     z.number().int().min(10_000).max(10_000_000).default(1_200_000),
  timeBudgetS:     z.number().int().min(60).max(86_400).optional(),
  storeGames:      z.boolean().default(false),
  storeLogs:       z.boolean().default(false),
  workers:         z.number().int().min(1).optional(),
}).refine(p => (p.suiteId == null) !== (p.opponents == null),
          { message: "exactly one of suiteId or opponents" })
  .refine(p => !p.storeLogs || p.storeGames,
          { message: "storeLogs requires storeGames" });                 // BR-S07.T05-09
```

**Progress** (`jobs.progress_json`, written at most twice a second and once at every phase change):

```ts
export interface OptimizeProgress {
  iteration: number;              // 1-based
  maxIterations: number;
  phase: "propose" | "screen" | "confirm" | "holdout" | "apply" | "final_holdout" | "done";
  candidate: { idx: number; moveDesc: string } | null;   // null outside per-candidate phases
  block: number | null;           // confirmation block in flight
  blocksPlanned: number | null;
  arm: { label: string; done: number; total: number } | null;
  gamesDone: number;
  gamesBudget: number;
  proposed: number; screened: number; survivors: number; confirmed: number; accepted: number;
  elapsedMs: number;
  updatedAt: string;              // ISO-8601 UTC
}
```

**Result** (`jobs.result_json`, written once at the end):

```ts
export interface OptimizeResult {
  suiteId: number | null;
  startDeckVersionId: number;
  finalDeckVersionId: number;                 // === start when nothing was accepted
  iterationsRun: number;
  counts: { proposed: number; screened: number; survivors: number;
            confirmed: number; accepted: number; budgetCapped: number };
  acceptedMoves: {
    iteration: number; moveDesc: string;
    confirmDelta: number; confirmCi: [number, number]; blocksRun: number; alphaSpent: number;
    holdoutDelta: number; holdoutCi: [number, number]; holdoutBelowZero: boolean;
    deckVersionId: number;
  }[];
  /** The run's headline: final list vs the starting list, on its own seed set (BR-S07.T05-07). */
  finalHoldout: {
    seedSet: string; bot: string; n: number; rho: number;
    delta: number; se: number; ciLow: number; ciHigh: number; belowZero: boolean;
  } | null;
  stopReason: OptimizeStopReason;
  games: number; seconds: number;
  engineBuild: string; rulesSnapshot: string;
  unmodelledExcluded: { name: string; status: string; copies: number }[];   // RN-81 report
}

export type OptimizeStopReason =
  | "max_iterations" | "no_moves_left" | "no_candidate_passed" | "no_candidate_confirmed"
  | "budget_exhausted" | "time_budget" | "environment_changed" | "cancelled";
```

**The loop**, in order. Every step that runs games goes through `runArm`, which builds one engine invocation from a `Pairing[]`, streams its lines into `job_pairings` and `games`, folds the games into `OpponentPairs`, and drops the rows unless `storeGames`.

```text
claim:   record engine_build + rules_snapshot on the job          (BR-S07.T05-10)
build:   resolve the deck version, the suite (or the opponent list), both bots,
         the fixed set and the price cap; assertListCovered on the evaluated list
         and every opponent list                                   (BR-S07.T05-03)
resume:  iteration0 = resumeFrom(db, jobId)                        (BR-S07.T05-05)

for it in iteration0 .. maxIterations:
  0. cancelled? budget? environment changed?  -> stop with the matching reason
  1. propose   proposeMoves(current, pool, { k, tried })           (S07.T01)
               no moves -> stop "no_moves_left"
  2. screen    run the reference arm once, then one arm per candidate, all on the
               screen salt; screen() applies Δ − SE > 0             (S07.T02)
               no survivor -> record rows, stop "no_candidate_passed"
  3. confirm   selectSurvivors(<= maxSurvivors); for each block 1..maxBlocks:
               reference arm, then one arm per survivor, all on that block's confirm
               salt; shouldStop() after each block                  (S07.T03)
  4. accept    isAccepted(ciLow > 0 && delta >= minDelta) per candidate; for each
               accepted: holdout arms on the holdout salt with strongBot, then
               POST the new version                                 (S07.T04)
  5. record    one optimizer_candidates row per proposal            (S07.T04)
  6. apply     at most one swap: the largest confirmation Δ         (BR-S07.T05-06)
               nothing accepted -> stop "no_candidate_confirmed"
               something accepted -> current = swapped list, tried cleared, pool rebuilt

final:   if finalDeckVersionId <> startDeckVersionId:
             finalHoldout: final list vs starting list, 'final-holdout' salt,
             strongBot, holdoutPairs per opponent                   (BR-S07.T05-07)
         write result_json, finish 'done'
```

**Arm identity and pairing labels.** `idx` is a monotonic counter over the whole run, so no two arms collide, and the label carries everything a reader needs:

```text
label = "<phase>|it<iteration>|<ref|c<idx>>|<archetype>"
        screen|it2|ref|dragapult-dusknoir
        screen|it2|c07|dragapult-dusknoir
        confirm-b3|it2|c01|gardevoir-ex
        holdout|it2|c01|dragapult-dusknoir
        final-holdout|it0|ref|gardevoir-ex
```

**Budget arithmetic**, at the defaults on suite v6's twelve opponents:

| Phase | Arms | Games | Notes |
|---|---|---|---|
| Screening, one iteration | 1 reference + 24 candidates | 2,400 + 57,600 = 60,000 | cheap bot |
| Confirmation, one block at `m = 4` | 1 reference + 4 candidates | 6,000 + 24,000 = 30,000 | cheap bot |
| Confirmation, four blocks | 20 | 120,000 | cheap bot |
| Per-swap holdout | 1 reference + 1 candidate | 6,000 + 6,000 = 12,000 | **strong bot** |
| One full iteration, worst case | ≈ 45 | ≈ 192,000 | |
| Six iterations plus the final holdout | ≈ 270 | ≈ 1,164,000 | inside the 1,200,000 default |
| Wall-clock at the S04.T18 target of ≥ 5,000 games/s (cheap bot) | | ≈ 4 min of cheap games | plus the strong-bot holdouts |

The stage exit criterion is a Dhelmise cycle in under fifteen minutes. The cheap-bot games fit comfortably; the strong-bot holdouts are the variable, which is why `holdoutPairs` is a parameter and why the holdout is the only place the strong bot appears.

**The arm runner.**

```ts
export interface ArmResult {
  pairingIdxBase: number;
  gamesByOpponent: ReadonlyMap<string, GameRow[]>;   // in memory; rows may already be dropped
  engineBuild: string;
  fingerprints: ReadonlyMap<string, string>;
  games: number;
}

/** One ptcg-cli invocation for a whole phase-arm, then fold-then-drop (BR-S07.T05-09). */
export function runArm(
  db: Db, job: JobRow, pairings: readonly Pairing[], label: string, params: OptimizeParams,
): Promise<ArmResult>;

export function nextPairingIdx(db: Db, jobId: number): number;
export function resumeFrom(db: Db, jobId: number): number;                 // first unrecorded iteration
export function canAfford(next: readonly Pairing[], spent: number, params: OptimizeParams): boolean;
export function estimateArm(pairings: readonly Pairing[]): number;         // Σ games
export function armBot(phase: OptimizeProgress["phase"], params: OptimizeParams): string;  // BR-S07.T05-02
```

**Registration** with [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)'s dispatcher is the standard `JobKindHandler`, except that `build()` returns nothing to spawn: the optimize handler owns its own arm scheduling because the number and content of its engine invocations depend on results the dispatcher cannot know in advance. `kinds/optimize.ts` therefore implements `run(db, job, params)` and the dispatcher's `build`/`onDone` pair delegates to it — a documented second shape for that registry, added here and recorded in `apps/worker/README.md`.

## Implementation steps

1. Write `OptimizeParams`, `OptimizeProgress`, `OptimizeResult` and `OptimizeStopReason` in `@pokesearch/shared/jobs`, with both refinements; spec that `storeLogs` without `storeGames` fails validation (BR-S07.T05-09).
2. Add `kinds/optimize.ts` registering the kind with [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)'s dispatcher and the `run()` shape; spec that an `optimize` job is claimed and reaches `running` with `engine_build` and `rules_snapshot` recorded (BR-S07.T05-10).
3. Write `arm.ts::runArm` with the pairing upsert, the line handling, the fold into `OpponentPairs` and the fold-then-drop step; spec `> a default run leaves zero games rows and complete job_pairings rows` and `> the folded statistics are identical with and without storeGames` (BR-S07.T05-09).
4. Write `nextPairingIdx` and the label format; spec monotonicity and the five label shapes (BR-S07.T05-01).
5. Write `budget.ts` (`estimateArm`, `canAfford`, the spent counter) and spec that the check precedes the arm and that `spent` equals the sum of the pairings' games (BR-S07.T05-08).
6. Write `build()`: resolve the deck version, the suite or the custom opponent list, both bots, the fixed set and the price cap, and call `assertListCovered` on the evaluated list and every opponent list; spec the two `UncoveredCard` failures and the import-graph policy test (BR-S07.T05-03).
7. Write the loop's steps 1–2 (propose, screen) with the reference arm reused across candidates; spec `> a run with no survivor stops with no_candidate_passed` and the arm count of one screening iteration.
8. Add step 3 (confirm) driving [S07.T03](T03-sequential-confirmation.md)'s `confirm()` with `runBlock` implemented over `runArm`; spec the block discard on cancellation (BR-S07.T05-04).
9. Add steps 4–6 (accept, record, apply) with `pickApplied`; spec the two-accepted case and the deferred row (BR-S07.T05-06).
10. Add `armBot` and wire the strong bot into every holdout; spec `> screening arms name params.bot and holdout arms name params.strongBot` and the missing-bot failure (BR-S07.T05-02).
11. Add `resumeFrom` and the resumption path; spec `> a job resumed after iteration 2 starts at iteration 3` and `> re-running a completed iteration produces byte-identical pairing fingerprints` (BR-S07.T05-05).
12. Add the end-of-run holdout and the `result_json` writer, including `unmodelledExcluded`; spec salt disjointness and the negative-final-holdout case (BR-S07.T05-07).
13. Add the progress writer at the phase and candidate granularity, throttled by [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)'s existing mechanism; spec that a phase change always produces a write.
14. Run the Dhelmise reproduction end to end on suite v6 and record iterations, arms, games, wall-clock, every candidate's three estimates and the final holdout in the completion note.

## Edge cases and error handling

- **No candidate passes screening in iteration 1.** The run ends immediately with `stopReason: 'no_candidate_passed'`, `finalDeckVersionId === startDeckVersionId` and `finalHoldout: null` — there is nothing to hold out against. This is a legitimate result and the one the legacy's Dhelmise cycle produced; the page states it as "no swap outside noise" rather than as an error.
- **Two candidates tie on confirmation Δ to the last digit.** `pickApplied` orders by `(Δ desc, se asc, idx asc)`, so the tie resolves on the narrower interval and then on the candidate's position, which is a deterministic function of its prior. The loser is recorded `confirmed` with `deferred_to_next_iteration` and is re-proposed against the changed list, where it is a different swap.
- **A candidate removes a concept-fixed card.** It is never proposed ([S07.T01](T01-candidate-pool-and-move-generation.md) RN-80), so the loop never sees it; the move log records `reason: 'fixed'` and the page shows the blocked move, so the user can unfix the card and re-run rather than wondering why an obvious swap was absent.
- **The price cap excludes everything.** `proposeMoves` returns no moves with every log row carrying `reason: 'price_cap'`. The run stops with `no_moves_left`, and `result_json` carries the cap and the cheapest excluded candidate so the user sees what raising it would buy.
- **A confirmation block is cancelled mid-way.** The block is discarded entirely — a block covering three of twelve opponents would re-weight the estimate — and the candidates are recorded with the interval from the last *complete* block and `decision_note: 'cancelled'`. The job ends `cancelled`, not `error`.
- **The holdout is negative after a positive confirmation.** The version stays, `holdout_below_zero` is set, the run summary names the swap and its holdout figure, and the page marks it prominently ([S07.T04](T04-holdout-acceptance-and-versioning.md) BR-S07.T04-04). Nothing is re-decided: re-gating would destroy the only unbiased number in the run.
- **An opponent list contains an unresolved card.** `assertListCovered` fails with `status: 'unresolved'` before the first game; the job errors naming the opponent, the card and the list it was in. Nothing is generated to make the run possible (BR-S07.T05-03), and the fix is in the deck resolver ([S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md)) or the authoring queue, not in the job.
- **The LLM key is missing.** Entirely irrelevant to this job: the optimizer never calls a model, the params carry no LLM option, and `apps/worker/src/optimizer/**` imports nothing from `packages/llm` (BR-S07.T05-03). A run with no keys configured produces identical results to a run with every key set, which is RN-60 as it applies here. The only LLM-touching feature in the stage is the coach ([S07.T07](T07-coach-lost-game-review.md)), and it is a separate job kind.
- **The engine binary is rebuilt mid-run.** The per-arm check finds `ptcg-cli --version` differing from `jobs.engine_build` and stops with `environment_changed`; already-recorded candidates keep the build they ran under, and the result names both builds. Mixing arms across builds would make a paired comparison meaningless (BR-S07.T05-10).
- **The worker restarts mid-run.** `recoverOrphans` ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md) BR-S04.T15-07) marks the job `error: worker restarted`. The user re-queues; the new job gets a new id and therefore new seeds. Resumption within one job id (BR-S07.T05-05) covers the cancel-and-continue path, not the crash path, because a crashed job's arm state is not trustworthy — stated here rather than implied.
- **`maxIterations: 1` with `k: 1`.** A one-candidate run: screening with a single candidate against the reference, Bonferroni with `m = 1` (`z = 1.96`), four blocks if it survives. Legitimate and cheap, and the smallest useful end-to-end test of the whole pipeline.
- **A suite whose opponents number fewer than three.** The params require at least three custom opponents, and a suite is validated at freeze time ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)); a suite with fewer is refused at `build()` with the count, because `Σ w_o² · var/n_o` over two opponents is dominated by one matchup and the weighted Δ stops meaning "against the field".

## Acceptance / verification

- [ ] `pnpm --filter worker test optimize.spec.ts` green, including `> a full run creates one jobs row`, `> pairing idx is strictly increasing across arms` and `> pairing labels identify phase, iteration and candidate` (BR-S07.T05-01).
- [ ] `optimize.spec.ts > an opponent list with an approx card fails the job with UncoveredCard and zero games` and `> an evaluated list with an uncovered card fails before the pool is built`; `policy.spec.ts > apps/worker/src/optimizer/** imports no authoring or llm module`; `pnpm check` fails on a fixture containing `cardgen`, `ensure_cards` or `use_llm` under that directory (BR-S07.T05-03, RN-81, RN-60).
- [ ] `optimize.spec.ts > screening arms name params.bot and holdout arms name params.strongBot`, `> an unresolvable strongBot fails the job before the first holdout game`, and `> there is no code path from a holdout phase to params.bot` — an exhaustiveness assertion over `armBot` (BR-S07.T05-02).
- [ ] `optimize.spec.ts > cancelling mid-block leaves status cancelled within 2 s and discards that block` and `> an accepted version created before the cancel still exists` (BR-S07.T05-04).
- [ ] `optimize.spec.ts > a job resumed after iteration 2 starts at iteration 3`, `> re-running a completed iteration produces byte-identical pairing fingerprints`, and `> resume never rewrites an existing candidate row` (BR-S07.T05-05).
- [ ] `optimize.spec.ts > two accepted candidates yield one applied swap and one deferred row` with `decision_note: 'deferred_to_next_iteration'` (BR-S07.T05-06).
- [ ] `optimize.spec.ts > the final holdout salt is disjoint from every other salt in the run` over the whole salt set of a six-iteration run, and `> a negative final holdout leaves every accepted version in place` (BR-S07.T05-07).
- [ ] `optimize.spec.ts > a run whose budget covers two iterations stops with budget_exhausted at the third` and `> the budget check precedes the arm, so no partial arm is ever started` (BR-S07.T05-08).
- [ ] `optimize.spec.ts > a default run leaves zero games rows and complete job_pairings rows`, `> storeGames keeps them`, `> the folded statistics are identical with and without storeGames`, and `> storeLogs without storeGames is a 400 from the api` (BR-S07.T05-09).
- [ ] `optimize.spec.ts > a rules_snapshot change mid-run stops the job with environment_changed` and `> the stored candidates all carry the job's build and snapshot` (BR-S07.T05-10).
- [ ] `pnpm lint` fails on a fixture writing `user_deck_versions` or `cards` from `apps/worker/src/optimizer` and passes for the same write to `optimizer_candidates` (BR-S07.T05-11).
- [ ] **The Dhelmise reproduction, end to end.** An `optimize` job on suite v6 with the user's Dhelmise deck version, `k: 8`, `maxIterations: 3`, the planner for screening and confirmation and the rollout bot for holdouts, completes in **under 15 minutes** wall-clock and produces either an accepted swap with a holdout number and its CI, or an explicit `no_candidate_passed` / `no_candidate_confirmed` with every candidate's screening Δ ± SE and confirmation CI stored. Every `optimizer_candidates` row carries `holdout_seed_set` where applicable, `alpha_spent`, `confirm_blocks` and a `decision` (stage exit criteria).
- [ ] After that run, `SELECT count(*) FROM optimizer_candidates WHERE job_id = ?` equals the number of proposals across all iterations, and every row's `decision` is one of the four values with a non-null `engine_build` and `rules_snapshot`.

## Risks and open questions

- **Risk — the run is latency-bound rather than throughput-bound.** Two hundred and seventy arms means two hundred and seventy process spawns; at a second of startup each, that is four and a half minutes of pure overhead against a fifteen-minute exit criterion. Mitigation: one arm carries *every* opponent of a phase (twelve pairings in one invocation), the engine parallelises internally with `rayon`, and the measured spawn overhead is recorded in the completion note. If it dominates, the fix is batching several candidates into one invocation, which the `Pairing[]` shape already allows.
- **Risk — the fold-then-drop step loses data someone needed.** A user who wants to inspect a specific game after the fact cannot, because the rows are gone. Mitigation: `storeGames` exists and is one checkbox on the page; the aggregates in `job_pairings` (including fingerprints) survive, so a run can be re-executed byte-identically from its seeds to recover any game. The retention policy is stated in `apps/worker/README.md`.
- **Risk — one swap per iteration makes the hill-climb slow.** Six iterations explore six swaps, which is a small neighbourhood. Mitigation: it is the price of honesty — applying two swaps whose interaction was never measured would report a gain nobody measured — and the deferred candidate is re-screened immediately in the next iteration against the changed list, so a genuinely additive pair is found in two iterations rather than never.
- **Risk — `tried` is cleared on acceptance, so the run can cycle.** Swapping A for B and then B for A across two iterations is possible in principle when the reference changes. Mitigation: each swap must clear the acceptance bar against the *current* list, so a reversal would have to be a measured improvement over the improved list, which is not a cycle but a correction; and the move log makes any oscillation visible in the result. A hard cycle guard is deliberately not added, because forbidding a measured improvement would be worse than the pathology.
- **Risk — the default budget hides a truncated run.** A run that stops with `budget_exhausted` at iteration 4 looks much like one that stopped with `no_candidate_confirmed`. Mitigation: `stopReason` is a required field in `result_json`, it is rendered as its own line on the page ([S07.T06](T06-web-optimizer-page.md)), and the games spent versus the budget are shown beside it.
- **Question — should the optimize job be allowed to run two arms concurrently?** [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) runs one job at a time and the engine saturates the machine internally, so concurrency inside a job would mostly add contention. Recommendation: keep one arm at a time and revisit only if the spawn-overhead measurement of the first risk shows the machine idling between arms.
- **Question — should a custom opponent list be allowed at all, or only frozen suites?** A custom list makes the run unreproducible once the meta window moves, which is exactly the trap [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) exists to avoid; a suite-only rule would be stricter and simpler. Recommendation: keep both, because a user optimising against a specific expected field is a real use case, and store the opponent list and its weights in `params_json` so the run remains reproducible even when the window has moved. The user confirms.
- **Sizing — this subtask is an execution substrate and a control loop, and could be two.** Steps 1–5 deliver the `optimize` job kind, `arm.ts` (one invocation per phase-arm, the fold-then-drop retention rule, the pairing `idx`/`label` scheme) and `budget.ts` — machinery any multi-arm job kind would want. Steps 6–14 deliver the loop itself: the coverage precondition, propose → screen → confirm → accept → apply, resumption, the end-of-run holdout and the summary. A split would be "S07.T05 optimize arms and budget" and a new subtask "optimize loop" depending on it. Not applied here, because both halves are in this file's Outputs and renumbering is not this pass's to do. Proposed for the user's decision.
- **DEPENDENCY-PROPOSAL: S07.T05 should depend on S07.T01 because** `build()` constructs the candidate pool and calls `assertListCovered` directly (BR-S07.T05-03), and the loop calls `proposeMoves` every iteration; today [S07.T01](T01-candidate-pool-and-move-generation.md) is reached only transitively through [S07.T02](T02-paired-seed-screening.md).
- **DEPENDENCY-PROPOSAL: S07.T05 should depend on S06.T03 and S06.T05 because** the default `bot` is the planner and the default `strongBot` is the rollout bot, and BR-S07.T05-02 fails the job when either cannot be resolved in the registry; today neither bot subtask is named in the graph anywhere in S07.
- **DEPENDENCY-PROPOSAL: S07.T05 should depend on S05.T16 because** the job resolves a frozen suite — its opponents, lists, weights, `seed0` and opponent bot — for every arm; today the suite is reached only through [S07.T02](T02-paired-seed-screening.md).

## References

- `pokemon/src/pokesearch/sim/optimizer.py` L422–511 (`run_optimization`) — verified: the hill-climb loop with `OptimizeConfig(mode="fast", games_per_opp=None, max_iterations=6, k=6, time_budget_s=None, policy="heuristic", workers=None, use_llm_cards=True)`; `GAMES = {"fast": 40, "long": 200}` at L29 resolved at L430 as `cfg.games_per_opp or GAMES.get(cfg.mode, 40)`; screening at `max(games // 2, 10)` games with `seed0 = 1000 * it` (L485) and confirmation at `games` with `seed0 = 5000 * it` (L498); `tried.add(m.desc)` at L478; the pool rebuilt on acceptance at L507; and the returned summary `{"best_version_id", "best_score", "ci", "accepted_moves", "seconds", "opponents"}` at L510–511. Consult for the loop's shape; the sizes, the seeds and the acceptance rule are all replaced.
- `pokemon/src/pokesearch/sim/optimizer.py` L350–359 and L481, L497 (`prepare_deck`) — verified: `gen = cardgen.ensure_cards_for_deck(conn, export_text, use_llm=use_llm)` at L352, called inside the loop for every screened candidate and for the confirmation, with `use_llm` reaching it as `True` from `OptimizeConfig.use_llm_cards` (L419). Missing card definitions were generated by a language model mid-run. BR-S07.T05-03 removes this outright.
- `pokemon/src/pokesearch/sim/jobs.py` — verified through [S04.T15](../04-game-engine-core/T15-worker-job-runner.md): a daemon `threading.Thread` per run inside the web process, one run per project, cancellation through a `threading.Event` polled by the optimizer loop, and `_launch` turning any exception into `status='error'` with the last 2,000 characters of the traceback. The lifecycle a separate worker process replaces.
- `pokemon/scripts/deck_optimize.py` L76–113 — verified: the iteration loop rebuilding the pool per iteration (L77), `propose_moves` with `fixed_keys={"dhelmise"}` and `budget=None` (L78), the screening reference at L81, the per-candidate screening at L90, the `continue`-rather-than-`break` on a failed iteration (L99–100), the confirmation pair at L101–102, `if ok: best = cand` at L107–108, and the final measurement with salt `"base"` at L109 matching the starting measurement at L72. The two-sieve sequence this loop reproduces with sized statistics.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: three iterations of eight screened swaps at 50 games per opponent with confirmation at 250; the final line *"Lista final: 56.9% (IC 55.2%–58.7%) contra 56.9% na partida, mesmas sementes"*, i.e. the run ended where it began. The acceptance case this job must reproduce, either as a confirmed swap with a holdout number or as an explicit "no swap outside noise".
- [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) (the dispatcher, the claim, the progress throttle, cancellation, `recoverOrphans`, the engine spawn without `DATABASE_PATH`), [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) (`jobs`, `job_pairings`, `games`, the retention rule and the `parent_job_id` question this file answers), [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) (`Pairing`, `Options`, the response lines), [S07.T01](T01-candidate-pool-and-move-generation.md)–[S07.T04](T04-holdout-acceptance-and-versioning.md) (everything the loop calls), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) (the frozen suite), [S06.T03](../06-bots/T03-planner-turn-policy.md) and [S06.T05](../06-bots/T05-rollout-bot.md) (the cheap and strong bots), [Decision log](../../project/02-decision-log.md) D-004.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
