# S07.T04 — Holdout acceptance and versioning

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 4 / 7 |
| Depends on | [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md), [S07.T02](T02-paired-seed-screening.md), [S07.T03](T03-sequential-confirmation.md) |
| Unblocks | [S07.T05](T05-optimize-job-orchestration.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` new-version endpoint and diff — from [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)
- `module` confirmation results — from [S07.T03](T03-sequential-confirmation.md)
- `doc` ESPECIFICACAO.md RN-84

## Outputs (proposed)
- `module` `optimizer/accept.ts` — accept iff CI lower bound > 0 **and** Δ ≥ 0.5 point; the accepted list is re-measured on a holdout seed set (`'holdout'` salt, never used for selection) and that score is the reported one; creates a `user_deck_versions` row with `change_desc` = the swap and the holdout score; `optimizer_candidates(job_id, iteration, idx, move_desc, candidate_list_json, screen_*, confirm_*, holdout_*, decision screened_out|rejected|confirmed|accepted)` rows — consumed by [S07.T05](T05-optimize-job-orchestration.md)
- `file` migration `packages/db/migrations/0009_optimizer.sql` — the `optimizer_candidates` table, recording `holdout_seed_set` and `alpha_spent` per candidate so a completed run can be audited — consumed by [S07.T05](T05-optimize-job-orchestration.md)

## Initial objective
What the user is told is an unbiased estimate: selection happens on one set of seeds, the reported gain on another, and tiny statistically-significant gains are not accumulated into noise.

## Context

Two things happen here, and keeping them separate is the whole design. **Acceptance is decided on confirmation.** **The holdout is measured afterwards and reported, never re-gated.** Every other property of this subtask follows from that separation, and the most likely way for someone to break it later is to add one plausible-sounding line of code.

RN-84 is revised because the legacy rule does not survive being read closely. `ESPECIFICACAO.md` §4.7 states it as *"Troca só é aceita se o ganho na confirmação exceder meia largura do IC"* and cites two lines that do not agree. `scripts/deck_optimize.py` L103 is `ok = conf - atual > (cci[1] - cci[0]) / 2` — the gain must exceed **half the candidate's CI width**, that is, its full half-width. `optimizer.py` L501–502 computes `margin = (best_eval.ci_high - best_eval.ci_low) / 2` and then tests `full.score > best_eval.score + 0.5 * margin` — a **quarter** of the **incumbent's** CI width. One documented rule, two thresholds differing by a factor of two, evaluated on two different intervals. That alone would be reason to restate it.

The deeper problem is what the rule measures. A threshold proportional to a confidence interval scales with the *imprecision of the measurement*, so a noisy run demands a large gain and a very precise run demands almost none. That is backwards. Statistical significance and practical significance are different questions and they deserve two independent conditions, which is what this subtask specifies: the confirmation CI lower bound must be above zero — *the measurement can distinguish this swap from no swap at the level it was run at* — **and** the confirmation Δ must be at least 0.5 percentage points — *the swap is worth a deck version*. Neither implies the other. A 0.1-point gain measured to death clears the first and fails the second; a 3-point gain over one block may clear the second and fail the first. Both conditions are checked against the interval [S07.T03](T03-sequential-confirmation.md) actually reported, at the Bonferroni-adjusted level and over the blocks that were actually run.

**Then the holdout, and then nothing.** An accepted swap is re-measured against the pre-swap list on a third, disjoint seed set — the `'holdout'` salt, recorded per candidate as `holdout_seed_set` — with the strong bot rather than the cheap one, and *that* number is what the user is shown as the gain. It is not a gate. It does not revoke the acceptance, it does not roll back the deck version, and no code path compares it against a threshold. This is the single most important constraint in the file and it is worth being blunt about why: **re-gating on the holdout would make the holdout part of the selection procedure, and a seed set that participates in selection is no longer unbiased.** The design exists to produce exactly one number that nothing has optimised against. Adding "…and reject if the holdout is negative" would consume it, and the run would be left with three selected estimates and no honest one.

That has a consequence the interface has to handle rather than hide. **The holdout will often land below the confirmation estimate**, because the confirmed candidate was chosen from a set partly on its confirmation Δ — that is regression to the mean, the same mechanism that turned the legacy's +4.6, +3.4 and +2.7 into 0.0, −2.2 and +0.9. So the candidate row carries both numbers side by side with a warning flag when `holdout_delta < confirm_delta` outside the holdout interval, and a **holdout below zero is surfaced loudly**: `holdout_below_zero = 1`, a prominent marker on the page ([S07.T06](T06-web-optimizer-page.md)), and the phrase in the run summary. The deck version still exists — the user asked for a swap that confirmed, and they get it — but the number attached to it is the holdout's, negative sign included. A tool that quietly suppressed that case would be a tool whose positive results could not be believed either.

**Auditability is a schema property, not a convention.** A finished run must be re-derivable months later, which means two columns that are easy to omit. `holdout_seed_set` is the salt string the holdout seeds were derived from; without it the reported number cannot be reproduced, and "measured on a holdout" becomes an unverifiable claim. `alpha_spent` is the Bonferroni share the candidate consumed, `α / m` where `m` is that iteration's survivor count; without it a reader cannot reconstruct the `z` that produced the confirmation interval, and the CI on the row is a number with no level attached. Both are in the DDL, and `CHECK (decision <> 'accepted' OR holdout_seed_set IS NOT NULL)` makes the first one structural.

One ownership detail. `optimizer_candidates` is a job table, so the worker writes it (architecture principle 2). `user_deck_versions` is a user-facing table, and [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) BR-S03.T11-11 reserves its writes to `apps/api` — so the worker does not insert the accepted version directly; it calls `POST /api/user-decks/:id/versions` with the swapped list and lets the api compute the diff, the validation report and the price exactly as it would for a hand edit. The `change_desc` is the swap plus the holdout number, and the returned version id lands on the candidate row.

## Scope

- **In scope.** `packages/db/migrations/0009_optimizer.sql` with the full `optimizer_candidates` DDL, its constraints and its indexes; the `OptimizerCandidateRow` type and its `TABLES` descriptor entry; `apps/worker/src/optimizer/accept.ts` (`accept`, `holdoutSeedBase`, `buildHoldoutPairings`, `measureHoldout`, `createAcceptedVersion`, `writeCandidates`); the two acceptance conditions and their constants; the `CandidateDecision` enum; the holdout salt and its disjointness; the regression-to-the-mean flags (`holdout_below_confirm`, `holdout_below_zero`); the change-description format; the synthetic tests of the acceptance rule and of the holdout's relationship to the confirmation interval.
- **Out of scope.** Generating candidates ([S07.T01](T01-candidate-pool-and-move-generation.md)); screening and the paired estimator ([S07.T02](T02-paired-seed-screening.md)); the block loop, the Bonferroni `z`, the futility rule and the power statement ([S07.T03](T03-sequential-confirmation.md)); the iteration loop, the job's params and progress, cancellation and the budget ([S07.T05](T05-optimize-job-orchestration.md)); the page that renders the rows ([S07.T06](T06-web-optimizer-page.md)); running games ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); the `user_deck_versions` schema, the diff, the price and the validation report ([S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)), which are consumed through the endpoint and never reimplemented; the strong bot itself ([S06.T05](../06-bots/T05-rollout-bot.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-84 | **Revised.** The legacy accepted when the confirmation gain exceeded half a confidence-interval width (`scripts/deck_optimize.py` L103 used half the candidate's CI width; `optimizer.py` L501–502 used a quarter of the incumbent's — one documented rule, two thresholds). Here acceptance requires **two independent conditions**: the confirmation CI lower bound is strictly above 0 **and** the confirmation Δ is at least `MIN_DELTA` (0.005, i.e. 0.5 percentage points). The reported gain is then the **holdout** Δ, measured on seeds never used for selection, and it is reported, not re-gated. | `accept()`'s single `isAccepted()` predicate; `CHECK (decision <> 'accepted' OR (confirm_ci_low > 0 AND confirm_delta >= 0.005))` on `optimizer_candidates` | `accept.spec.ts > a candidate with ciLow 0.001 and delta 0.003 is confirmed but not accepted`; `> a candidate with delta 0.02 and ciLow −0.001 is not accepted`; `> both conditions together accept`; `optimizer-schema.spec.ts > an accepted row with confirm_delta 0.004 is rejected by the CHECK` |
| BR-S07.T04-01 | The holdout is **reported, never re-gated**: no code path compares `holdout_delta` against any threshold to alter `decision`, to revoke a version or to change which candidate is applied. `decision` is a pure function of the confirmation result; the holdout only populates the `holdout_*` columns and the flags. | `accept()` computes `decision` before `measureHoldout` is called, and `measureHoldout`'s return value is never an input to `isAccepted` | `accept.spec.ts > decision is computed before the holdout runs` (the holdout callback is asserted not to have been invoked at decision time); `> a holdout of −0.05 leaves decision 'accepted' and the version in place`; `policy.spec.ts > accept.ts contains no comparison of holdout_delta against a non-zero literal` |
| BR-S07.T04-02 | The holdout seed set is disjoint from every screening and confirmation seed set of the same job, and its salt string is stored verbatim on the row as `holdout_seed_set`. An accepted row without it is rejected by the schema. | `holdoutSeedBase(seed0, jobId, iteration, opponentDeckId)` with the salt `optimize:<jobId>:holdout:<iteration>`; `CHECK (decision <> 'accepted' OR holdout_seed_set IS NOT NULL)` | `accept.spec.ts > the holdout salt collides with no screen or confirm salt over a 1,000-case sweep`; `optimizer-schema.spec.ts > an accepted row without holdout_seed_set is rejected`; `> re-deriving the seeds from the stored salt reproduces the stored holdout Δ` |
| BR-S07.T04-03 | `alpha_spent` is recorded for every candidate that entered confirmation: the Bonferroni share `α / m` for that iteration's survivor count `m`, together with `confirm_z` and `confirm_survivors`, so the stored interval's level is reconstructible. It is not a sequential spending schedule ([S07.T03](T03-sequential-confirmation.md) BR-S07.T03-02). | `writeCandidates` copies `ConfirmResult.alphaSpent`, `.z` and `.survivors`; `CHECK (alpha_spent IS NULL OR (alpha_spent > 0 AND alpha_spent <= 1))` | `accept.spec.ts > every confirmed or rejected row carries alpha_spent, confirm_z and confirm_survivors`; `> bonferroniZ(0.05 / alpha_spent ⁻¹) reproduces the stored z` |
| BR-S07.T04-04 | A holdout below the confirmation estimate is expected, recorded and shown, never hidden: `holdout_below_confirm = 1` when `holdout_delta < confirm_delta` and `confirm_delta` lies outside `[holdout_ci_low, holdout_ci_high]`; `holdout_below_zero = 1` when `holdout_delta < 0`. Both flags reach the run summary and the page. | the two derived flags written by `writeCandidates`; [S07.T06](T06-web-optimizer-page.md) renders them | `accept.spec.ts > a holdout inside the confirmation estimate sets neither flag`; `> a holdout of −0.02 sets holdout_below_zero and appears in the run summary`; `> holdout_below_confirm is not set when the confirmation estimate lies inside the holdout interval` |
| BR-S07.T04-05 | Every candidate the job considered gets exactly one `optimizer_candidates` row, keyed `(job_id, iteration, idx)`, including those that never reached screening (`screened_out` with a reason) and those the survivor cap excluded. Rows are insert-only within a job; a decision is written once. | `PRIMARY KEY (job_id, iteration, idx)`; `writeCandidates` uses `INSERT`, never `INSERT OR REPLACE` ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) BR-S04.T14-03) | `optimizer-schema.spec.ts > a duplicate (job_id, iteration, idx) is rejected`; `accept.spec.ts > twenty-four proposals yield twenty-four rows`; `pnpm check` fails on a fixture using `INSERT OR REPLACE` |
| BR-S07.T04-06 | The accepted list becomes a `user_deck_versions` row through `POST /api/user-decks/:id/versions` — the worker never writes that table directly (architecture principle 2, [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) BR-S03.T11-11) — with `parentVersionNo` set to the version the swap was applied to, and `changeDesc` = the diff plus the holdout figure. The returned id is stored as `optimizer_candidates.deck_version_id`. | `createAcceptedVersion()` issuing the HTTP call; `CHECK (decision <> 'accepted' OR deck_version_id IS NOT NULL)` | `accept.spec.ts > the accepted version is created through the api endpoint, not by a direct insert`; `pnpm lint` fails on a fixture writing `user_deck_versions` from `apps/worker`; `> the created version's change_desc carries the diff and the holdout number` |
| BR-S07.T04-07 | A rejected, screened-out or cancelled candidate creates no deck version and no holdout measurement: `deck_version_id`, `holdout_seed_set` and every `holdout_*` column stay NULL. | the `decision === "accepted"` guard before `measureHoldout` and `createAcceptedVersion` | `accept.spec.ts > rejected swaps never create versions`; `> a screened-out candidate has no holdout columns`; `> user_deck_versions row count is unchanged after a run that accepted nothing` |
| BR-S07.T04-08 | The holdout is measured with the **strong** bot (`strongBot`, the rollout bot) against the same frozen opponents and the pre-swap list, and the bot used is recorded as `holdout_bot`; the confirmation's `screen_bot`/cheap bot is recorded separately. A holdout whose bot is missing from the registry fails the job rather than silently falling back to the planner. | `measureHoldout` reads `opts.strongBot` and asserts it resolves in the bot registry ([S06.T07](../06-bots/T07-bot-registry-and-freezing.md)) | `accept.spec.ts > the holdout pairings name the strong bot`; `> an unknown strongBot fails with UnknownBot before any game runs`; `> holdout_bot and screen_bot are both stored` |
| BR-S07.T04-09 | `0009_optimizer.sql` creates no row, runs in one transaction, uses no SQLite-only construct and leaves `schema_migrations.version = 9`. | the migration file; the framework of [S01.T04](../01-foundation/T04-database-migration-framework.md) | `migrate.spec.ts > 0009 applies on a fresh temp DB, version 9, zero rows, PRAGMA foreign_key_check clean`; `schema-drift.spec.ts > 0009 tables match their TypeScript row types` |
| BR-S07.T04-10 | The holdout estimate uses the same paired estimator as screening and confirmation — `pairedDelta` over per-pair differences ([S07.T02](T02-paired-seed-screening.md) BR-S07.T02-02) — so the three numbers on a row are the same statistic computed on three disjoint seed sets, and are directly comparable. | `measureHoldout` imports `pairedDelta`/`pairedCi` from `./stats` and defines no estimator of its own | `accept.spec.ts > the holdout Δ uses pairedDelta`; `policy.spec.ts > accept.ts declares no variance function`; `> holdout, confirm and screen deltas are all in win-rate units` |

## Data operations

**CRUD.**

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `optimizer_candidates` | C | worker | once per proposed candidate, at the end of its iteration | insert-only; `PRIMARY KEY (job_id, iteration, idx)`; never `INSERT OR REPLACE` | BR-S07.T04-05 |
| `optimizer_candidates` | R | api, worker | the optimizer page, the run summary, resuming a job | read-only | [S07.T06](T06-web-optimizer-page.md) |
| `optimizer_candidates` | U | — | never | a decision is written once, with the row | BR-S07.T04-05 |
| `optimizer_candidates` | D | api | only by cascade when its `jobs` row is deleted | `ON DELETE CASCADE` on `job_id` | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) |
| `user_deck_versions` | C | **api**, called by the worker over HTTP | on acceptance only | `POST /api/user-decks/:id/versions`; one version per accepted swap; the api computes diff, validation and price | BR-S07.T04-06; principle 2 |
| `user_deck_versions` | R | worker | reading the pre-swap list and its `version_no` for `parentVersionNo` | read-only | [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) |
| `user_deck_versions` | C/U/D | worker (directly) | never | the worker writes job tables only | BR-S07.T04-06 |
| `games` | R | worker | folding the holdout arms into per-pair differences | read-only; holdout jobs run with `store_games: true` | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) |
| `job_pairings` | R | worker | mapping `pairing_idx` to an opponent, reading `errors` | read-only | — |
| `suites`, `suite_opponents` | R | worker | building holdout pairings from the frozen lists and weights | read-only; frozen (RN-41) | [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) |
| `bots` | R | worker | resolving `strongBot` | read-only | BR-S07.T04-08, [S06.T07](../06-bots/T07-bot-registry-and-freezing.md) |
| `jobs` | R/U | worker | reading params, writing the run summary into `result_json` | [S07.T05](T05-optimize-job-orchestration.md) owns the writes | — |
| any table | C/R/U/D | engine | never | the engine receives pairings as JSON | Architecture principle 1 |

**Algorithm — deciding and recording one confirmed candidate.**

| Step | Operation | Inputs | Output | Rule |
|---|---|---|---|---|
| 1 | Evaluate the two conditions | `ConfirmResult.ciLow`, `.delta` | `accepted = ciLow > 0 && delta >= MIN_DELTA` | RN-84 |
| 2 | Fix the decision | step 1, `ConfirmResult.outcome` | `decision ∈ screened_out \| rejected \| confirmed \| accepted` | BR-S07.T04-01 |
| 3 | Stop here unless accepted | `decision` | rejected/confirmed rows written with NULL holdout columns | BR-S07.T04-07 |
| 4 | Derive the holdout salt and seeds | `seed0`, `jobId`, `iteration`, opponents | `holdoutSeedSet`, `seedBases` | BR-S07.T04-02 |
| 5 | Run both arms on holdout seeds | swapped list and pre-swap list, `strongBot` | `games` rows per arm | BR-S07.T04-08 |
| 6 | Estimate | the two arms, suite weights | `holdout_delta`, `se`, `ci`, `rho` via `pairedDelta` | BR-S07.T04-10 |
| 7 | Derive the flags | `holdout_delta`, `confirm_delta`, holdout CI | `holdout_below_confirm`, `holdout_below_zero` | BR-S07.T04-04 |
| 8 | Create the version | swapped list, parent version, `changeDesc` | `deck_version_id` from the api | BR-S07.T04-06 |
| 9 | Write the row | everything above plus `alpha_spent`, `confirm_z`, build and snapshot | one `optimizer_candidates` row | BR-S07.T04-03, -05 |

## Interfaces

**`packages/db/migrations/0009_optimizer.sql`** — the full DDL.

```sql
-- 0009_optimizer.sql — one row per swap an optimize job considered, with the three estimates and the decision.
-- Owner: S07.T04 (schema + rows). Written by apps/worker only; the accepted deck version is created
-- through apps/api (architecture principle 2).
-- Postgres: *_json TEXT -> jsonb. No SQLite-only construct in this file.

CREATE TABLE optimizer_candidates (
    job_id                INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    iteration             INTEGER NOT NULL,          -- 1-based
    idx                   INTEGER NOT NULL,          -- the candidate's position inside the iteration
    move_desc             TEXT    NOT NULL,          -- '-1 Spiritomb, +1 Shaymin' (S03.T11 describeDiff)
    remove_card_id        TEXT,
    add_card_id           TEXT,
    remove_name           TEXT    NOT NULL,
    add_name              TEXT    NOT NULL,
    prior                 REAL    NOT NULL,          -- S07.T01 BR-S07.T01-01
    candidate_list_json   TEXT    NOT NULL,          -- the swapped 60-card list, frozen

    -- screening (S07.T02) -------------------------------------------------------------
    screen_seed_set       TEXT    NOT NULL,          -- salt string, e.g. 'optimize:41:screen:2'
    screen_bot            TEXT    NOT NULL,          -- the cheap bot (planner)
    screen_pairs          INTEGER NOT NULL,          -- surviving pairs, Σ over opponents
    screen_delta          REAL,                      -- win-rate units; ×100 for points
    screen_se             REAL,
    screen_rho            REAL,                      -- measured pairing correlation
    screen_tie_fraction   REAL,
    screen_dropped        INTEGER NOT NULL DEFAULT 0,
    screen_pass           INTEGER,                   -- 0 | 1 | NULL when never screened

    -- confirmation (S07.T03) ----------------------------------------------------------
    confirm_seed_set      TEXT,                      -- salt prefix, e.g. 'optimize:41:confirm:2'
    confirm_blocks        INTEGER,                   -- blocks ACTUALLY run (BR-S07.T03-03)
    confirm_pairs         INTEGER,
    confirm_delta         REAL,
    confirm_se            REAL,
    confirm_ci_low        REAL,                      -- at confirm_z, over confirm_blocks
    confirm_ci_high       REAL,
    confirm_z             REAL,                      -- bonferroniZ(alpha, confirm_survivors)
    confirm_survivors     INTEGER,                   -- m, the Bonferroni denominator
    alpha_spent           REAL,                      -- alpha / m; NOT a spending schedule
    confirm_rho           REAL,                      -- measured from block 1
    confirm_power         REAL,                      -- powerAtMeasuredRho for delta = 0.01
    confirm_stop_reason   TEXT,
    blocks_json           TEXT,                      -- [{ block, n, delta, se, ciLow, ciHigh }]

    -- holdout (this subtask; reported, never re-gated) --------------------------------
    holdout_seed_set      TEXT,                      -- the salt; without it the number is unauditable
    holdout_bot           TEXT,                      -- the strong bot (rollout)
    holdout_pairs         INTEGER,
    holdout_delta         REAL,
    holdout_se            REAL,
    holdout_ci_low        REAL,
    holdout_ci_high       REAL,
    holdout_rho           REAL,
    holdout_below_confirm INTEGER NOT NULL DEFAULT 0,  -- regression to the mean, shown not hidden
    holdout_below_zero    INTEGER NOT NULL DEFAULT 0,  -- surfaced loudly

    -- decision ------------------------------------------------------------------------
    decision              TEXT    NOT NULL,
    decision_note         TEXT,                      -- 'budget_cap', 'price_cap', 'cancelled', …
    deck_version_id       INTEGER REFERENCES user_deck_versions(id),
    engine_build          TEXT    NOT NULL,
    rules_snapshot        TEXT    NOT NULL,
    decided_at            TEXT    NOT NULL,          -- 'YYYY-MM-DDTHH:MM:SSZ'

    PRIMARY KEY (job_id, iteration, idx),
    CHECK (iteration >= 1 AND idx >= 0),
    CHECK (decision IN ('screened_out','rejected','confirmed','accepted')),
    CHECK (screen_pass IS NULL OR screen_pass IN (0,1)),
    CHECK (confirm_stop_reason IS NULL OR confirm_stop_reason IN
           ('ci_excludes_zero','futility','blocks_exhausted','cancelled')),
    CHECK (confirm_blocks IS NULL OR (confirm_blocks >= 1 AND confirm_blocks <= 8)),
    CHECK (alpha_spent IS NULL OR (alpha_spent > 0 AND alpha_spent <= 1)),
    CHECK (holdout_below_confirm IN (0,1) AND holdout_below_zero IN (0,1)),
    -- RN-84, revised: both conditions, on the confirmation interval only.
    CHECK (decision <> 'accepted' OR (confirm_ci_low IS NOT NULL AND confirm_ci_low > 0
                                      AND confirm_delta IS NOT NULL AND confirm_delta >= 0.005)),
    -- auditability: an accepted row must say which seeds produced its reported number.
    CHECK (decision <> 'accepted' OR holdout_seed_set IS NOT NULL),
    CHECK (decision <> 'accepted' OR deck_version_id IS NOT NULL),
    -- a candidate that never confirmed carries no holdout.
    CHECK (decision = 'accepted' OR holdout_delta IS NULL)
);

CREATE INDEX optimizer_candidates_job_idx      ON optimizer_candidates (job_id, iteration, idx);
CREATE INDEX optimizer_candidates_decision_idx ON optimizer_candidates (job_id, decision);
CREATE INDEX optimizer_candidates_version_idx  ON optimizer_candidates (deck_version_id);
```

**`@pokesearch/db/schema`** gains `OptimizerCandidateRow` mirroring every column above, plus its `TABLES` descriptor entry for the drift test of [S01.T04](../01-foundation/T04-database-migration-framework.md).

**`apps/worker/src/optimizer/accept.ts`**

```ts
import { pairedDelta, pairedCi, type PairedStats } from "./stats";   // S07.T02
import type { ConfirmResult } from "./confirm";                      // S07.T03

export const MIN_DELTA = 0.005;   // 0.5 percentage points — the practical condition (RN-84)

export type CandidateDecision = "screened_out" | "rejected" | "confirmed" | "accepted";

export interface AcceptOpts {
  jobId: number;
  iteration: number;
  seed0: number;
  deckId: number;                 // the user deck the versions belong to
  parentVersionNo: number;        // the version the swap is applied to
  strongBot: string;              // the rollout bot (S06.T05), used for the holdout only
  opponentBot: string;
  holdoutPairs?: number;          // default HOLDOUT_PAIRS (500 per opponent)
  apiBaseUrl: string;             // the api the version is created through (BR-S07.T04-06)
}

export interface HoldoutResult {
  seedSet: string;                // the salt, stored verbatim (BR-S07.T04-02)
  bot: string;
  n: number;
  delta: number; se: number; ciLow: number; ciHigh: number; rho: number;
  belowConfirm: boolean;          // derived (BR-S07.T04-04)
  belowZero: boolean;
}

export interface AcceptResult {
  idx: number;
  decision: CandidateDecision;
  reportedDelta: number | null;   // the HOLDOUT delta when accepted, else null
  holdout: HoldoutResult | null;
  deckVersionId: number | null;
  note: string | null;
}

/** The two conditions of RN-84, on the confirmation interval only. Never sees the holdout. */
export function isAccepted(c: Pick<ConfirmResult, "ciLow" | "delta">, minDelta?: number): boolean;

/** RN-46 salt for the holdout; disjoint from screen and confirm (BR-S07.T04-02). */
export function holdoutSeedSet(jobId: number, iteration: number): string;           // 'optimize:41:holdout:2'
export function holdoutSeedBase(seed0: number, jobId: number, iteration: number, opponentDeckId: string): number;

export function buildHoldoutPairings(
  db: Db, list: readonly DeckLine[], opponents: readonly SuiteOpponent[],
  seedBases: ReadonlyMap<string, number>, opts: AcceptOpts): Pairing[];

/** Paired holdout measurement of the swapped list against the pre-swap list (BR-S07.T04-10). */
export function measureHoldout(
  swapped: ReadonlyMap<string, GameRow[]>, reference: ReadonlyMap<string, GameRow[]>,
  opponents: readonly SuiteOpponent[], confirmDelta: number, opts: AcceptOpts): HoldoutResult;

/** POSTs to the api; the worker never writes user_deck_versions itself (BR-S07.T04-06). */
export function createAcceptedVersion(
  opts: AcceptOpts, list: readonly DeckLine[], move: Move, holdout: HoldoutResult): Promise<number>;

/**
 * Decides, then (only when accepted) measures the holdout, then records.
 * `decision` is computed from `confirmed` alone, before `runHoldout` is called (BR-S07.T04-01).
 */
export function accept(
  confirmed: readonly ConfirmResult[],
  runHoldout: (lists: readonly DeckLine[][], seedBases: ReadonlyMap<string, number>) =>
    Promise<{ swapped: ReadonlyMap<string, GameRow[]>; reference: ReadonlyMap<string, GameRow[]> }>,
  opponents: readonly SuiteOpponent[],
  opts: AcceptOpts,
): Promise<AcceptResult[]>;

/** Insert-only; one row per considered candidate, including screened-out ones (BR-S07.T04-05). */
export function writeCandidates(db: Db, jobId: number, rows: readonly OptimizerCandidateRow[]): { inserted: number };

export class UnknownBot extends Error { readonly name_: string }
```

**The acceptance predicate, written out.**

```text
accepted  =  confirm.ciLow > 0                    // statistical: distinguishable from no swap
          && confirm.delta >= 0.005               // practical:   worth a deck version (0.5 point)

decision  =  "screened_out"  when the candidate never entered confirmation
          |  "rejected"      when confirmation ran and `accepted` is false and outcome = "rejected"
          |  "confirmed"     when confirmation ran, outcome = "confirmed", but `accepted` is false
          |  "accepted"      when `accepted` is true

reported  =  holdout.delta                        // ALWAYS the holdout when accepted; never re-gated
```

`decision` never reads `holdout.*`. The `confirmed`-but-not-`accepted` state exists precisely so a statistically-real 0.2-point gain is visible on the page without becoming a deck version.

**Holdout seeds.**

```text
holdoutSeedSet(jobId, it)      = `optimize:${jobId}:holdout:${it}`                  // stored verbatim
holdoutSeedBase(seed0, …, o)   = seedBase(seed0, ["optimize", String(jobId), "holdout",
                                                   String(it), opponentDeckId])
```

Disjoint from `"screen"` and `"confirm"` by the third part, which makes the three salts distinct for every `(job, iteration, block, opponent)` — asserted by a sweep rather than by inspection.

**Change description.** `changeDesc` sent to `POST /api/user-decks/:id/versions` is the [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) diff string followed by the holdout figure, so a user reading the builder's history sees the same number the optimizer page shows:

```text
-1 Spiritomb, +1 Shaymin (holdout +0.8 pt, IC −0.3 a +1.9, 6.000 pares, rollout_v1)
```

**Sizes.** The holdout is `HOLDOUT_PAIRS` (500) pairs per opponent across the suite's twelve — 6,000 pairs, 12,000 games with the shared reference arm — run with the rollout bot. It is the most expensive game per unit in the stage and the cheapest part of the run in total, because it happens at most once per accepted swap.

## Implementation steps

1. Write `0009_optimizer.sql` with the full DDL, every `CHECK` and the three indexes; apply it on a temp database and run `PRAGMA foreign_key_check` (BR-S07.T04-09).
2. Add `OptimizerCandidateRow` and its `TABLES` entry; run the drift test until green.
3. Write `optimizer-schema.spec.ts`: the decision enum, the two RN-84 `CHECK`s, the `holdout_seed_set` and `deck_version_id` requirements on `accepted`, the duplicate-key rejection and the `holdout_delta IS NULL` rule for non-accepted rows (RN-84, BR-S07.T04-02, -05).
4. Write `isAccepted` and spec the four combinations of the two conditions, including the exact boundary at `delta = 0.005` and `ciLow = 0` (RN-84).
5. Write `holdoutSeedSet`/`holdoutSeedBase` and spec disjointness from the screen and confirm salts over a 1,000-case sweep (BR-S07.T04-02).
6. Write `buildHoldoutPairings` with `store_games: true`, the strong bot and the `UnknownBot` check (BR-S07.T04-08).
7. Write `measureHoldout` over `pairedDelta`/`pairedCi` and the two derived flags; spec that the estimator is the shared one and that the flags fire exactly as specified (BR-S07.T04-04, -10).
8. Write `accept()` with the decision computed **before** `runHoldout` is invoked; spec it with a callback that records whether it was called at decision time (BR-S07.T04-01).
9. Write `createAcceptedVersion` against the api endpoint with `parentVersionNo` and the change description; spec the endpoint call and the lint rule forbidding a direct write (BR-S07.T04-06).
10. Write `writeCandidates` as an insert-only batch and spec the twenty-four-rows case and the `INSERT OR REPLACE` ban (BR-S07.T04-05).
11. Add the policy tests: no comparison of `holdout_delta` against a non-zero literal, no local variance function, no worker write to `user_deck_versions` (BR-S07.T04-01, -06, -10).
12. Run the synthetic acceptance set — a true +1-point swap, a true +0.2-point swap and a true-zero swap through screening, confirmation and holdout, 200 draws each — and record the measured acceptance rate, the mean gap between the confirmation and holdout Δ, and how often the holdout landed below zero after a positive confirmation.

## Edge cases and error handling

- **The holdout lands below the confirmation estimate.** Expected, and the common case for an accepted candidate, because the candidate was selected partly on its confirmation Δ. `holdout_below_confirm` is set when the confirmation Δ falls outside the holdout interval, both numbers are stored, and the page shows them side by side with a warning. Nothing is re-decided (BR-S07.T04-01, -04).
- **The holdout is negative after a positive confirmation.** `holdout_below_zero = 1`, the row is marked prominently, the run summary names the swap and its holdout figure, and the deck version's `change_desc` carries the negative number verbatim. The version is still created: the user asked for a swap that met the stated acceptance rule, and hiding the outcome would be worse than showing it. This is the case the design exists to make visible.
- **Two candidates both accept in one iteration.** Both rows are written with `decision: 'accepted'`, but [S07.T05](T05-optimize-job-orchestration.md) applies only one swap per iteration and re-proposes from the new list. The second row carries `decision_note: 'deferred_to_next_iteration'` and no holdout, so the CHECK forbidding a holdout on a non-accepted row does not bite — the deferred candidate is recorded as `confirmed`, not `accepted`, precisely because it did not become a version.
- **The holdout run is cancelled mid-way.** The candidate has already been accepted (the decision is final) but has no reportable number. The row is written with `decision: 'accepted'`, `decision_note: 'holdout_cancelled'` and NULL holdout columns — which the `CHECK (decision <> 'accepted' OR holdout_seed_set IS NOT NULL)` would reject, so `holdout_seed_set` is written as soon as the salt is derived, before the first holdout game runs. The number is missing; the provenance is not.
- **The api refuses the new version** (the swapped list fails validation — an impossible state, since [S07.T01](T01-candidate-pool-and-move-generation.md) BR-S07.T01-05 validates every proposal, but reachable if the card tables changed mid-run). The job fails with the validation codes; no `optimizer_candidates` row claims `accepted` without a `deck_version_id`, because the row is written after the version is created.
- **`confirm_delta` exactly 0.005 and `confirm_ci_low` exactly 0.** The practical condition uses `>=` and the statistical one uses `>`, so this candidate is *not* accepted: a lower bound of exactly zero does not exclude zero. Both boundaries have their own test.
- **A candidate confirmed with `blocksRun = 1`.** Its interval is roughly twice as wide as a four-block interval, so `ciLow > 0` is a stronger statement than it looks, not a weaker one; no special case is needed. The row records `confirm_blocks = 1` so a reader can see what was run.
- **`alpha_spent` for a candidate that was screened out.** NULL — it never consumed any of the iteration's α. The CHECK permits NULL and the page renders an em dash rather than `0`, which would imply a level of zero.
- **A holdout with `SE = 0`** (the swap changed nothing on any holdout pair, although it confirmed on other seeds). `holdout_ci_low = holdout_ci_high = holdout_delta = 0`, `holdout_below_zero = 0` and `holdout_below_confirm = 1`, which is the honest reading: the confirmation estimate is outside a zero-width interval around zero.
- **Re-running the same job id.** Impossible: `job_id` is an autoincrement on `jobs`, and rows cascade with it. A *resumed* job reuses its id and its already-written iterations; `writeCandidates` inserts only the iterations it produced, and a duplicate `(job_id, iteration, idx)` is a primary-key violation that fails the job rather than overwriting a recorded decision.
- **The strong bot is unavailable** (the registry has no `rollout_v1` yet, early in S06). `UnknownBot` before any holdout game runs. The job fails rather than measuring the holdout with the planner and labelling it as a strong-bot number — the bot is part of what the holdout figure means, which is why `holdout_bot` is a stored column.

## Acceptance / verification

- [ ] `pnpm db:migrate` applies 0009 on a fresh temp database: `schema_migrations.version = 9`, zero rows, `PRAGMA foreign_key_check` clean, and `schema-drift.spec.ts > 0009 tables match their TypeScript row types` passes (BR-S07.T04-09).
- [ ] `optimizer-schema.spec.ts > an accepted row with confirm_delta 0.004 is rejected by the CHECK` and `> an accepted row with confirm_ci_low 0 is rejected`; both are accepted at `0.005` / `0.0001` (RN-84).
- [ ] `optimizer-schema.spec.ts > an accepted row without holdout_seed_set is rejected` and `> an accepted row without deck_version_id is rejected`; `> a screened_out row with a holdout_delta is rejected` (BR-S07.T04-02, -06, -07).
- [ ] `accept.spec.ts > decision is computed before the holdout runs` — the injected `runHoldout` records the decision at call time and the test asserts it was already final (BR-S07.T04-01).
- [ ] `accept.spec.ts > a holdout of −0.05 leaves decision 'accepted' and the version in place`, and `policy.spec.ts > accept.ts contains no comparison of holdout_delta against a non-zero literal` — a source assertion (BR-S07.T04-01).
- [ ] `accept.spec.ts > a candidate with ciLow 0.001 and delta 0.003 is confirmed but not accepted`, `> a candidate with delta 0.02 and ciLow −0.001 is not accepted`, `> both conditions together accept` (RN-84).
- [ ] `accept.spec.ts > the holdout salt collides with no screen or confirm salt` over a 1,000-case `(job, iteration, block, opponent)` sweep, and `> re-deriving the seeds from the stored holdout_seed_set reproduces the stored holdout Δ` against the real binary on one opponent (BR-S07.T04-02).
- [ ] `accept.spec.ts > every confirmed or rejected row carries alpha_spent, confirm_z and confirm_survivors`, and the stored `confirm_z` equals `bonferroniZ(alpha, confirm_survivors)` to 3 decimals (BR-S07.T04-03).
- [ ] `accept.spec.ts > a holdout of −0.02 sets holdout_below_zero and appears in the run summary`; `> a holdout inside the confirmation estimate sets neither flag` (BR-S07.T04-04).
- [ ] `accept.spec.ts > rejected swaps never create versions` — a run whose every candidate is rejected leaves the `user_deck_versions` row count unchanged (BR-S07.T04-07).
- [ ] `accept.spec.ts > the accepted version is created through the api endpoint, not by a direct insert`, `> the created version's change_desc carries the diff and the holdout number`, and `pnpm lint` fails on a fixture writing `user_deck_versions` from `apps/worker` (BR-S07.T04-06).
- [ ] `accept.spec.ts > the holdout pairings name the strong bot` and `> an unknown strongBot fails with UnknownBot before any game runs` (BR-S07.T04-08).
- [ ] `accept.spec.ts > twenty-four proposals yield twenty-four rows` including the screened-out ones, and `pnpm check` fails on a fixture using `INSERT OR REPLACE` on `optimizer_candidates` (BR-S07.T04-05).
- [ ] Synthetic end-to-end acceptance set — true `δ ∈ {0, +0.002, +0.01}` through screening, confirmation and holdout, 200 draws each. The test **records** the acceptance rate per cell, the mean `confirm_delta − holdout_delta` gap, and the share of accepted candidates whose holdout was below zero. It fails only if a true `δ = 0` swap is accepted in more than 10 % of draws, or if the mean gap has the wrong sign (the holdout should sit at or below the confirmation estimate on average, not above it).

## Risks and open questions

- **Risk — someone adds a holdout gate.** It is the single most plausible future change: a negative holdout looks like a bug, and rejecting it looks like a fix. Mitigation: BR-S07.T04-01, the ordering inside `accept()` (the decision is final before `runHoldout` is even called), the `policy.spec.ts` source assertion, and this paragraph. The consequence of such a change is that the run would have three selected estimates and no unbiased one, which is the failure mode the whole stage was built to avoid.
- **Risk — the 0.5-point threshold is arbitrary.** It is a judgement about what is worth a deck version, not a statistic, and it has no derivation. Mitigation: it is exported as `MIN_DELTA`, it is a job parameter with 0.005 as the default ([S07.T05](T05-optimize-job-orchestration.md)), the `CHECK` in the schema uses the same literal so a looser run is visibly a schema-level exception, and the page prints it next to the decision. The user changes it deliberately or not at all.
- **Risk — the holdout is too small to say much.** 6,000 pairs give a half-width of roughly 2 points at `ρ = 0.4` under the working model, so the holdout interval will usually contain both zero and the confirmation estimate. Mitigation: that is honest — the holdout's job is to be unbiased, not to be precise, and it is reported with its interval, never as a bare number. A user who wants a precise holdout runs a full measurement on the accepted version through [S06.T08](../06-bots/T08-measurement-score-and-mirror.md), which is what suites are for.
- **Risk — accumulating small accepted gains across iterations.** Six iterations each accepting a 0.5-point confirmed gain would report a compound improvement that no single measurement supports, which is the "tiny significant gains accumulated into noise" the objective warns about. Mitigation: each iteration's holdout is measured against *that iteration's* pre-swap list, so the numbers do not compound by construction, and [S07.T05](T05-optimize-job-orchestration.md) measures the final list against the original list on its own holdout seeds and reports that as the run's headline. The per-swap holdouts are evidence; the end-to-end holdout is the claim.
- **Risk — the strong bot changes between runs.** A holdout measured with `rollout_v1` and another with `rollout_v2` are not comparable, and `holdout_bot` alone does not stop someone putting them in one chart. Mitigation: `engine_build` and `rules_snapshot` are on every row too, and [S07.T06](T06-web-optimizer-page.md) groups by them the way [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) groups measurements; RN-42's discipline applies here as well.
- **Question — should a `confirmed`-but-not-`accepted` candidate get a holdout anyway?** It would give the page a number for every confirmed swap and cost 12,000 games each. Recommendation: no, because measuring a holdout for a candidate that will not become a version invites reading it as a decision input, which is exactly what BR-S07.T04-01 forbids. Revisit only if the user asks to see the number for a near-miss, and if so, label that column differently.
- **Question — should the accepted version be created before or after the holdout runs?** After, as specified, so `change_desc` can carry the holdout figure; the cost is that a cancelled holdout leaves an accepted decision with no version. The alternative — create first, patch the description later — conflicts with [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) BR-S03.T11-01's immutability. Recommendation: keep the current order and record `holdout_cancelled` in `decision_note`; the user confirms.
- **Sizing — this subtask is a migration and a decision module, and could be two.** Steps 1–3 deliver `0009_optimizer.sql`, the row type and the schema spec; steps 4–12 deliver `accept.ts`, the two RN-84 conditions, the holdout measurement and the version creation. That is the same split [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) proposed for itself, and it would let [S07.T05](T05-optimize-job-orchestration.md) build against the table before the acceptance logic exists. Not applied here, because both halves are in this file's Outputs and renumbering is not this pass's to do — and because the `CHECK` constraints *are* the acceptance rule, so separating them would put one rule in two files. Proposed for the user's decision.
- **DEPENDENCY-PROPOSAL: S07.T04 should depend on S04.T14 because** `optimizer_candidates.job_id` references `jobs(id)` and migration 0009 cannot apply before 0005; today the jobs schema is reached only transitively through [S07.T03](T03-sequential-confirmation.md) and [S07.T02](T02-paired-seed-screening.md).
- **DEPENDENCY-PROPOSAL: S07.T04 should depend on S05.T16 because** the holdout pairings are built from the frozen `suites` / `suite_opponents` lists, weights and `seed0`, and BR-S07.T04-08 resolves `strongBot` against the `bots` table that migration 0007 creates; today those are reached only through [S07.T03](T03-sequential-confirmation.md).
- **DEPENDENCY-PROPOSAL: S07.T04 should depend on S06.T05 because** BR-S07.T04-08 requires the rollout bot to exist for the holdout measurement, and a job configured with a `strongBot` the registry cannot resolve fails; today no edge records that the holdout needs a bot S06 delivers.

## References

- `pokemon/src/pokesearch/sim/optimizer.py` L501–509 — verified: `margin = (best_eval.ci_high - best_eval.ci_low) / 2` followed by `if full.score > best_eval.score + 0.5 * margin:` — a quarter of the **incumbent's** CI width — and, on acceptance, `save_version(cand, m.desc, best_vid, cov, full)` recording the *confirmation* score as the version's number. The rule RN-84 revises, and the practice this subtask replaces by recording the holdout instead.
- `pokemon/scripts/deck_optimize.py` L101–103 — verified: `ok = conf - atual > (cci[1] - cci[0]) / 2` — half the **candidate's** CI width, on the candidate's own interval. The second, incompatible form of the same documented rule; `ESPECIFICACAO.md` §4.7 RN-84 cites both lines as one rule.
- `pokemon/ESPECIFICACAO.md` §4.7 RN-84 — verified: *"Troca só é aceita se o ganho na confirmação exceder meia largura do IC"*, citing `deck_optimize.py:103` and `optimizer.py:502`.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: three finalists screened at +4.6, +3.4 and +2.7 and confirmed at 0.0, −2.2 and +0.9 on fresh seeds, with the final list unchanged at 56.9 % (CI 55.2–58.7) and the report's own line *"dentro da margem, recusada"* on each. The regression-to-the-mean pattern BR-S07.T04-04 expects between confirmation and holdout, one stage further along.
- `pokemon/src/pokesearch/sim/optimizer.py` L399–406 (`_combine`) — verified: the weighted, unpaired delta-method interval the legacy's CI-width threshold was computed from. Consult to see what "half the CI width" was half of; it is a per-arm interval, not a paired one, which is a second reason the threshold did not mean what it appeared to.
- `pokemon/src/pokesearch/sim/store.py` — verified through [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md): `add_version` computing `COALESCE(MAX(version_no), 0) + 1` and `set_version_score` writing score, CI and games onto the version row. Here the score is not written onto the version at all — it lives on `optimizer_candidates` with its seed set and its level — and the version carries the holdout figure only in its `change_desc`.
- [S07.T02](T02-paired-seed-screening.md) (`pairedDelta`, `pairedCi`, the `var(d)` rule, the screen salt), [S07.T03](T03-sequential-confirmation.md) (`ConfirmResult`, `bonferroniZ`, `alphaSpent`, `blocksRun`, the confirm salt), [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) (`user_deck_versions`, `describeDiff`, the versions endpoint and the api-only write rule), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) (frozen opponents, weights, `seed0`, the `bots` table), [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) (`jobs`, `games`, the cascade and the `INSERT OR REPLACE` ban), [Data model overview](../../project/04-data-model-overview.md) (the Jobs domain and `optimizer_candidates`' owner).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
