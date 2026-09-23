# S07.T03 — Sequential confirmation

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 3 / 7 |
| Depends on | [S07.T02](T02-paired-seed-screening.md) |
| Unblocks | [S07.T04](T04-holdout-acceptance-and-versioning.md), [S07.T05](T05-optimize-job-orchestration.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` screening survivors with Δ/SE — from [S07.T02](T02-paired-seed-screening.md)
- `module` the paired estimator `pairedDelta` / `pairedCi` / `pairedRho` and the `OpponentPairs` contract — from [S07.T02](T02-paired-seed-screening.md)

## Outputs (proposed)
- `module` `optimizer/confirm.ts` — fresh seeds (`'confirm'` salt); blocks of `12 opponents × 500 paired games`; after each block compute Δ and the 95 % CI (paired); stop when the CI excludes 0 or after 4 blocks (≈ 24k pairs, ~80 % power for 1 point); α split by the number of survivors (Bonferroni); futility stop after block 1 if `Δ + 2·SE < 0` — consumed by [S07.T04](T04-holdout-acceptance-and-versioning.md), [S07.T05](T05-optimize-job-orchestration.md)

## Initial objective
Survivors are re-tested on seeds they have never seen, with an early stop for clear winners and losers and a correction for testing several candidates at once.

## Context

This is the second sieve of RN-83 and the only place in the stage where a number is allowed to mean "this swap is better". The screening stage forwarded a short list selected on its own noise; everything here exists to re-measure those candidates on seeds that had no hand in choosing them, and to be honest about how much a positive result from that re-measurement is worth.

The legacy did the re-measurement and got the structure right. `scripts/deck_optimize.py` changed the salt from `f"tri{it}"` to `f"conf{it}"` (L101) so confirmation ran on fresh seeds, and — the part that is easy to miss and is the reason the benchmark is readable at all — it **re-scored the incumbent on those same fresh seeds** (L102), so confirmation was paired too, just on unseen seeds. What it did not do was size the experiment or control the multiplicity. Screening used 50 games per opponent and confirmation 250, against RN-48's own rule of thumb that differences under about three points at 1,200 games are noise. The three finalists came back at 0.0, −2.2 and +0.9 against screening values of +4.6, +3.4 and +2.7. Those are the same three swaps observed twice, and the confirmation values are the ones without selection in them.

**Power is conditional on the pairing correlation, and the design says so out loud.** Detecting a one-point difference (`δ = 0.01`) at 80 % power with `α = 0.05` two-sided in an *unpaired* comparison needs about `2·(1.96 + 0.84)²·0.25 / 0.0001 ≈ 39,200` games per arm. Pairing replaces the per-arm variance with the variance of the difference, `Var(d) = 2σ²(1 − ρ)`, so the pair count becomes roughly `39,200·(1 − ρ)`: about **27,000 pairs at ρ ≈ 0.3** and about **20,000 at ρ ≈ 0.5**. Four blocks of 12 × 500 give **24,000 pairs**, which therefore reaches **80 % power at ρ ≥ 0.4** and roughly **70 % at ρ ≈ 0.3**. That is the honest statement of the budget, and it is a *conditional* statement: the design measures `ρ` from block 1 and reports it on every candidate row. When the measured `ρ` is below 0.4 there are exactly two acceptable responses and the job takes one of them — run more blocks if the budget allows, or keep four blocks and reduce the claimed power in the result, printed as the number the measured `ρ` actually supports. What is not acceptable is printing "80 % power" over a run whose `ρ` was 0.15.

**There are two sources of multiplicity and one correction is not enough.** The first is testing several candidates in one iteration, and Bonferroni handles it: `α` is divided by the number of survivors `m`, so each candidate's interval uses `z = Φ⁻¹(1 − α/(2m))` and the share it consumed is recorded as `alpha_spent`. The second is looking at the data four times. Nothing here corrects for that, and pretending otherwise would be worse than admitting it. The resolution is deliberately plain: **stop early only to declare a winner or to take a futility exit, and report the confidence interval computed from the blocks that were actually run.** The early stop buys wall-clock and nothing else — it is not an efficiency claim, it does not license a narrower interval, and no alpha-spending function is invented to dress it up. A candidate that stopped at block 2 carries the block-2 interval and the fact that it stopped at block 2; a reader who wants the four-block interval can re-run it. The residual inflation of the type-I rate from the four looks is real, it is stated on the row, and the thing that keeps the *reported* number unbiased is not this stage at all — it is the holdout of [S07.T04](T04-holdout-acceptance-and-versioning.md), measured on seeds no selection ever touched.

Two consequences follow from that honesty and are worth stating as design, not apology. Bonferroni is expensive: at `m = 4` survivors the multiplier moves from 1.96 to about 2.50, which at `ρ = 0.4` takes the power of a 24,000-pair confirmation from about 80 % down to about 63 %. So the number of survivors carried into confirmation is capped (`MAX_SURVIVORS`, 4), ordered by screening Δ — itself a selection, and one more reason the holdout exists. And the futility exit is asymmetric on purpose: `Δ + 2·SE < 0` after block 1 is a generous bar to clear, so a candidate is abandoned only when the first 6,000 pairs say it is clearly harmful. Confirming a loser costs four blocks; abandoning a winner costs the whole point of the stage.

RN-48 is where this subtask's disposition is recorded. The legacy's "under ~3 points at 1,200 games is noise" was a useful rule of thumb over an unpaired measurement, and it is replaced here by the thing it approximated: an interval computed from the data, at a stated level, over a stated number of pairs, with the pairing correlation that produced it reported next to it. The rule of thumb survives as a sanity check — a confirmation whose half-width is far from what `ρ` and `n` predict is a bug report, not a finding.

## Scope

- **In scope.** `apps/worker/src/optimizer/confirm.ts` (`confirm`, `confirmSeedBase`, `buildConfirmPairings`, `bonferroniZ`, `shouldStop`); the block structure, its sizes and its ordering; the fresh-seed salt and its disjointness from screening and holdout; the re-measured reference arm per block and its reuse across survivors; the cumulative estimate across blocks; the Bonferroni correction and `alpha_spent`; the futility rule; `MAX_SURVIVORS`; the measured `ρ` from block 1 and the power statement derived from it; the `ConfirmResult` contract [S07.T04](T04-holdout-acceptance-and-versioning.md) persists; the synthetic power harness.
- **Out of scope.** The estimator itself — `pairedDelta`, `pairedCi`, `pairedRho` and `OpponentPairs` are [S07.T02](T02-paired-seed-screening.md)'s and are imported unchanged; screening and its threshold ([S07.T02](T02-paired-seed-screening.md)); the acceptance decision, the practical threshold `Δ ≥ 0.5` point, the holdout and every database write ([S07.T04](T04-holdout-acceptance-and-versioning.md)); the loop, cancellation, progress and budget accounting ([S07.T05](T05-optimize-job-orchestration.md)); running games ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); the weighted score and its delta-method CI, a different statistic owned by [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) and [S06.T08](../06-bots/T08-measurement-score-and-mirror.md); any alpha-spending or group-sequential boundary, which is deliberately not implemented.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-83 | **Kept, extended (second sieve).** Survivors are re-tested on **fresh seeds** — the `'confirm'` salt, disjoint from screening's — and the **current list is re-measured on those same fresh seeds**, so confirmation is paired like screening but on seeds that had no part in the selection. The extension is the block structure, the Bonferroni correction over survivors and the futility exit. | `confirmSeedBase(seed0, jobId, iteration, block, opponentDeckId)`; `confirm()` requires a `ReferenceBlock` for every block it estimates | `confirm.spec.ts > the confirm salt is disjoint from the screen salt for every (job, iteration, block)`; `> the reference list is re-measured in every block`; `> candidate and reference share seed_base within a block` |
| RN-48 | **Revised into the statistics plan.** The legacy rule of thumb "differences under ~3 points at 1,200 games are noise" is replaced by a computed interval: Δ with a two-sided CI at the Bonferroni-adjusted level over the pairs actually run, reported with the measured pairing correlation `ρ` and the pair count. No fixed point threshold is used as a noise floor anywhere in this subtask; the practical threshold `Δ ≥ 0.5` point is a separate, explicit acceptance rule owned by [S07.T04](T04-holdout-acceptance-and-versioning.md). | `pairedCi(stats, bonferroniZ(alpha, m))` is the only interval; no constant in `confirm.ts` expresses a points-based noise band | `confirm.spec.ts > no points-based noise threshold exists` (a source assertion that `confirm.ts` contains no comparison of Δ against a literal other than 0); `power.spec.ts > the reported half-width tracks √(var(d)/n)` across four block counts |
| BR-S07.T03-01 | A confirmation block is `BLOCK_PAIRS` (500) paired games against each of the suite's opponents, run at most `MAX_BLOCKS` (4) times; blocks are cumulative — the estimate after block `b` uses every pair of blocks 1..b, not block `b` alone. | `confirm()` appends each block's `OpponentPairs` to the accumulator before calling `pairedDelta` | `confirm.spec.ts > the block-2 estimate uses 12,000 pairs, not 6,000`; `> n after four blocks is 24,000` |
| BR-S07.T03-02 | The per-candidate level is `α / m` where `m` is the number of survivors entering confirmation in that iteration (Bonferroni): the interval uses `z = bonferroniZ(α, m) = Φ⁻¹(1 − α/(2m))`, and `α / m` is recorded as that candidate's `alphaSpent`. `alphaSpent` is the Bonferroni share and **nothing else** — it is not a sequential spending schedule, and no alpha-spending function exists in this subtask. | `bonferroniZ()` is the only z source; `ConfirmResult.alphaSpent = alpha / m` | `confirm.spec.ts > bonferroniZ(0.05, 1) is 1.96 and bonferroniZ(0.05, 4) is 2.498` (to 3 decimals); `> alphaSpent equals alpha divided by the survivor count`; `policy.spec.ts > confirm.ts exports no alpha-spending function` |
| BR-S07.T03-03 | A candidate stops early **only** to declare a winner (`ci.low > 0` after any block) or to take the futility exit (`Δ + 2·SE < 0` after block 1); otherwise it runs to `MAX_BLOCKS`. The reported Δ, SE and CI are always those computed from the blocks **actually run**, and `blocksRun` is recorded with them. The early stop is a wall-clock saving and confers no statistical claim. | `shouldStop(stats, block, z)` returns the reason or `null`; `confirm()` never recomputes the interval at a different level or block count after stopping | `confirm.spec.ts > a candidate stopping at block 2 reports the block-2 interval and blocksRun = 2`; `> the interval after an early stop is not rescaled to four blocks`; `> a candidate whose CI never excludes 0 runs all four blocks` |
| BR-S07.T03-04 | The futility exit fires only after block 1 and only when `Δ + 2·SE < 0`; it never fires on a positive Δ and never fires at block 2 or later, where the accumulated estimate is trusted to the CI rule instead. | `shouldStop`'s `block === 1` guard | `confirm.spec.ts > futility fires at block 1 for Δ = −0.02, SE = 0.004`; `> futility does not fire at block 2`; `> futility never fires on a positive Δ` |
| BR-S07.T03-05 | At most `MAX_SURVIVORS` (4) screening survivors enter confirmation in one iteration, ordered by screening Δ descending; survivors beyond the cap are recorded with `decision: 'screened_out'` and the note `budget_cap`, never silently dropped. The cap exists because Bonferroni at `m = 4` already costs roughly a sixth of the power at `ρ = 0.4`. | `selectSurvivors(screenResults)` in `confirm.ts`; the excess rows are returned for [S07.T04](T04-holdout-acceptance-and-versioning.md) to persist | `confirm.spec.ts > six passing candidates yield four survivors and two budget_cap rows`; `> survivors are ordered by screening delta` |
| BR-S07.T03-06 | `ρ` is **measured** from block 1 (`pairedRho` over that block's pairs) and reported on every candidate; the result carries `powerAtMeasuredRho`, the power the run's own pair count supports at the measured `ρ`, `δ = 0.01` and the Bonferroni-adjusted level. No result claims 80 % power unless its measured `ρ` is at least 0.4. | `confirm()` computes `rhoBlock1` before block 2 is scheduled; `powerAtMeasuredRho()` is a pure function of `(rho, n, z, delta)` | `confirm.spec.ts > the result carries rho measured from block 1`; `power.spec.ts > powerAtMeasuredRho is ≈ 0.80 at rho 0.4, n 24000, z 1.96` and `≈ 0.70 at rho 0.3`; `> a run at rho 0.15 reports its lower power rather than 0.80` |
| BR-S07.T03-07 | When the measured `ρ` is below `RHO_FOR_FULL_POWER` (0.4), the job takes one of exactly two documented paths: extend to `extraBlocks` when the caller allowed it and the budget permits, or keep four blocks and report the reduced `powerAtMeasuredRho`. It never silently keeps the 80 % claim and never silently stops early. | the `onLowRho` branch in `confirm()`, driven by `ConfirmOpts.lowRhoPolicy ∈ "extend" \| "report"` (default `"report"`) | `confirm.spec.ts > lowRhoPolicy "extend" schedules extra blocks up to maxBlocksHard`; `> lowRhoPolicy "report" keeps four blocks and lowers the reported power`; `> there is no third branch` (an exhaustiveness assertion on the union) |
| BR-S07.T03-08 | Every block re-measures the reference list on that block's seeds, and the reference block is **shared by every survivor of that block**; a candidate is never compared against a reference from another block, another salt, another engine build or another rules snapshot. | `confirm()` asserts `ReferenceBlock.block`, `.engineBuild` and `.rulesSnapshot` against each candidate arm | `confirm.spec.ts > one reference block serves four survivors`; `> a reference from block 1 against a candidate arm from block 2 is refused with ReferenceMismatch` |
| BR-S07.T03-09 | `confirm()` writes nothing and spawns nothing: it builds `Pairing[]` for [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) and folds the resulting `games` rows through [S07.T02](T02-paired-seed-screening.md)'s estimator. Persistence is [S07.T04](T04-holdout-acceptance-and-versioning.md)'s and orchestration is [S07.T05](T05-optimize-job-orchestration.md)'s. | pure functions plus one read helper; the writer-ownership lint ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a fixture writing `optimizer_candidates` from `confirm.ts`; `confirm.spec.ts > read only` |

## Data operations

**Algorithm — confirmation of one iteration's survivors.**

| Step | Operation | Inputs | Output | Rule |
|---|---|---|---|---|
| 1 | Select survivors | `ScreenResult[]` with `pass = true` | ≤ 4 survivors ordered by screening Δ; the rest as `budget_cap` rows | BR-S07.T03-05 |
| 2 | Fix the level | `α` (0.05), `m = survivors.length` | `z = Φ⁻¹(1 − α/(2m))`, `alphaSpent = α/m` per candidate | BR-S07.T03-02 |
| 3 | Derive block-1 seeds | `seed0`, `jobId`, `iteration`, `block = 1`, `opponentDeckId` | `seedBases` for block 1 | RN-83 |
| 4 | Run the block-1 reference arm | reference list, 12 × 500 pairs | `ReferenceBlock 1` | BR-S07.T03-08 |
| 5 | Run each survivor's block-1 arm | the same `seedBases`, same bots | per-candidate `games` rows | RN-83 |
| 6 | Estimate cumulatively | blocks 1..b joined per opponent | `Δ`, `SE`, `n`, `CI = pairedCi(stats, z)` | BR-S07.T03-01 |
| 7 | Measure `ρ` | block 1's per-arm and difference variances | `rhoBlock1`, `powerAtMeasuredRho` | BR-S07.T03-06 |
| 8 | Apply the low-`ρ` policy | `rhoBlock1`, `lowRhoPolicy` | `plannedBlocks` (4, or more when extending) | BR-S07.T03-07 |
| 9 | Decide after each block | `Δ`, `SE`, `CI`, `block` | stop with `ci_excludes_zero`, stop with `futility` (block 1 only), or continue | BR-S07.T03-03, -04 |
| 10 | Exhaust or stop | blocks run | `ConfirmResult` with `blocksRun`, the interval from those blocks, `stopReason` | BR-S07.T03-03 |
| 11 | Hand over | `ConfirmResult[]` | to [S07.T04](T04-holdout-acceptance-and-versioning.md) for the acceptance decision and persistence | — |

**Tables read** (no writes — BR-S07.T03-09).

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `suites`, `suite_opponents` | R | worker | steps 3–5, per block | read-only; frozen weights, lists and `seed0` | [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) |
| `games` | R | worker | step 6, after each arm of each block | read-only; the blocks' jobs run with `store_games: true` | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) |
| `job_pairings` | R | worker | step 6, to map `pairing_idx` to an opponent and read `errors` | read-only | fingerprints compared against the block's reference |
| `jobs` | R | worker | step 9, to observe cancellation between blocks | read-only here; the worker owns the writes | [S07.T05](T05-optimize-job-orchestration.md) |
| `optimizer_candidates`, `user_deck_versions` | C/U/D | worker | never in this module | owned by [S07.T04](T04-holdout-acceptance-and-versioning.md) | Architecture principle 2 |
| the database | — | engine | never | pairings reach the engine as JSON | Architecture principle 1 |

## Interfaces

**`apps/worker/src/optimizer/confirm.ts`**

```ts
import { pairedDelta, pairedCi, pairedRho, type OpponentPairs, type PairedStats }
  from "./stats";                                   // S07.T02 owns these

export const BLOCK_PAIRS          = 500;   // paired games per opponent per block
export const MAX_BLOCKS           = 4;     // 4 × 12 × 500 = 24,000 pairs
export const MAX_BLOCKS_HARD      = 8;     // ceiling when lowRhoPolicy = "extend"
export const MAX_SURVIVORS        = 4;     // Bonferroni cost cap (BR-S07.T03-05)
export const ALPHA                = 0.05;  // two-sided, before the Bonferroni split
export const FUTILITY_K_SE        = 2;     // stop when Δ + FUTILITY_K_SE·SE < 0 after block 1
export const RHO_FOR_FULL_POWER   = 0.4;   // the ρ at which 24,000 pairs give 80 % power
export const TARGET_DELTA         = 0.01;  // δ = 1 point, the effect the budget is sized for

export type ConfirmOutcome    = "confirmed" | "rejected";
export type ConfirmStopReason = "ci_excludes_zero" | "futility" | "blocks_exhausted" | "cancelled";
export type LowRhoPolicy      = "extend" | "report";

export interface ConfirmOpts {
  jobId: number;
  iteration: number;
  seed0: number;
  alpha?: number;                 // default ALPHA
  blockPairs?: number;            // default BLOCK_PAIRS
  maxBlocks?: number;             // default MAX_BLOCKS
  lowRhoPolicy?: LowRhoPolicy;    // default "report" (BR-S07.T03-07)
  bot: string;                    // the cheap bot; the planner (S06.T03)
  opponentBot: string;
}

export interface ReferenceBlock {
  block: number;                                    // 1-based
  seedBases: ReadonlyMap<string, number>;
  gamesByOpponent: ReadonlyMap<string, GameRow[]>;
  engineBuild: string;
  rulesSnapshot: string;
}

export interface BlockRow {                         // one row per block, kept for the audit trail
  block: number; n: number; delta: number; se: number;
  ciLow: number; ciHigh: number; droppedPairs: number;
}

export interface ConfirmResult {
  idx: number;                    // the candidate's index inside the iteration
  move: Move;
  outcome: ConfirmOutcome;
  stopReason: ConfirmStopReason;
  blocksRun: number;              // the interval below is computed from THESE blocks (BR-S07.T03-03)
  n: number;                      // Σ surviving pairs over blocksRun
  delta: number;                  // Δ in win-rate units; ×100 for points
  se: number;
  ciLow: number; ciHigh: number;  // two-sided at z = bonferroniZ(alpha, m)
  z: number;
  alphaSpent: number;             // α / m — the Bonferroni share, not a spending schedule
  survivors: number;              // m, for reproducing z
  rho: number;                    // measured from block 1 (BR-S07.T03-06)
  powerAtMeasuredRho: number;     // power for δ = TARGET_DELTA at (rho, n, z)
  tieFraction: number;
  droppedPairs: number;
  blocks: BlockRow[];
  byOpponent: PairedStats["byOpponent"];
}

/** RN-46 salt for confirmation; disjoint from screen and holdout (BR-S07.T02-04). */
export function confirmSeedBase(
  seed0: number, jobId: number, iteration: number, block: number, opponentDeckId: string): number;

export function buildConfirmPairings(
  db: Db, list: readonly DeckLine[], opponents: readonly SuiteOpponent[],
  seedBases: ReadonlyMap<string, number>, opts: ConfirmOpts): Pairing[];

/** z = Φ⁻¹(1 − α/(2m)). m = 1 gives 1.960; m = 4 gives 2.498 (BR-S07.T03-02). */
export function bonferroniZ(alpha: number, m: number): number;

/** Power for a paired difference δ at correlation ρ over n pairs at level z, σ² = 0.25. */
export function powerAtMeasuredRho(rho: number, n: number, z: number, delta?: number): number;

/** The stop decision after a block. `null` means continue. */
export function shouldStop(stats: PairedStats, block: number, z: number): ConfirmStopReason | null;

export function selectSurvivors(results: readonly ScreenResult[], max?: number):
  { survivors: ScreenResult[]; budgetCapped: ScreenResult[] };

/** Drives the block loop; `runBlock` is injected so the module itself spawns nothing (BR-S07.T03-09). */
export function confirm(
  survivors: readonly ScreenResult[],
  runBlock: (block: number, lists: readonly DeckLine[][]) =>
    Promise<{ reference: ReferenceBlock; arms: ReadonlyMap<string, GameRow[]>[] }>,
  opponents: readonly SuiteOpponent[],
  opts: ConfirmOpts,
): Promise<ConfirmResult[]>;

export class ReferenceMismatch extends Error { readonly field: "block" | "seed_base" | "engine_build" | "rules_snapshot" }
```

**The decision rule, written out.** After block `b`, with `stats = pairedDelta(pairs of blocks 1..b)` and `z = bonferroniZ(α, m)`:

```text
[ciLow, ciHigh] = pairedCi(stats, z)        // Δ ± z·SE, the estimator of S07.T02

if ciLow > 0                    → stop, outcome "confirmed", reason "ci_excludes_zero"
else if b == 1 and Δ + 2·SE < 0 → stop, outcome "rejected",  reason "futility"
else if b == maxBlocks          → stop, outcome = ciLow > 0 ? "confirmed" : "rejected",
                                        reason "blocks_exhausted"
else                            → continue to block b + 1
```

The interval reported is the one computed at the stopping block. It is not rescaled, re-levelled or re-derived. A candidate that stopped at block 2 has a wider interval than it would have had at block 4, and that is the correct representation of what was run.

**Sizing and power, under the working model** `σ² = 0.25`, `Var(d) = 2σ²(1 − ρ)`, `δ = 0.01`:

| Design | Pairs (or games/arm) needed for 80 % power at α = 0.05 |
|---|---|
| Unpaired, per arm | `2·(1.96 + 0.84)²·0.25 / 0.0001 ≈ 39,200` |
| Paired, ρ = 0.3 | `≈ 39,200 × 0.7 ≈ 27,400` pairs |
| Paired, ρ = 0.4 | `≈ 39,200 × 0.6 ≈ 23,500` pairs |
| Paired, ρ = 0.5 | `≈ 39,200 × 0.5 ≈ 19,600` pairs |
| **This budget: 4 × 12 × 500** | **24,000 pairs → 80 % power at ρ ≥ 0.4; roughly 70 % at ρ ≈ 0.3** |

The table is a model, not a measurement. `ρ` is measured from block 1 on every run and `powerAtMeasuredRho` is recomputed from it, so the row a user reads carries the power their own run supports. Two further facts belong beside it, because leaving them out would make the budget look better than it is. First, the 80 % figure is for a **single** candidate at `α = 0.05`; Bonferroni over `m = 4` survivors replaces `z = 1.960` with `z = 2.498`, which at `ρ = 0.4` takes the power of the same 24,000 pairs from about 80 % down to about 63 %. That is why `MAX_SURVIVORS` is 4 and not 12. Second, the four looks are uncorrected, so the realised type-I rate over a full run is above `α/m`; the design accepts that and leans on the holdout instead of on a boundary function.

**Block costs**, on suite v6's twelve opponents with `m` survivors:

| Quantity | Value |
|---|---|
| Pairs per opponent per block | 500 |
| Pairs per block, per candidate | 6,000 |
| Games per block | `(m + 1) × 6,000` (candidate arms plus one shared reference arm) |
| Games for four blocks at `m = 4` | 120,000 |
| Pairs per candidate over four blocks | 24,000 |
| Wall-clock at the S04.T18 target of ≥ 5,000 games/s | ≈ 24 s |

**Seeds.** Every block has its own salt, so blocks are independent of each other and of screening:

```text
seedBase_{b,o} = seedBase(seed0, ["optimize", String(jobId), "confirm",
                                  String(iteration), String(b), opponentDeckId])
```

Within a block the reference arm and every survivor's arm use the identical `seedBase_{b,o}`, identical bot names and identical game counts, so the pairing holds exactly as in [S07.T02](T02-paired-seed-screening.md). Across blocks the salts differ, so block 2 is genuinely new information and the cumulative estimate is an estimate over `b × 6,000` independent pairs.

**The synthetic power harness** reuses [S07.T02](T02-paired-seed-screening.md)'s generator, parameterised by `(δ, ρ, τ, blockPairs, opponents, m)`, and runs the whole block loop including `shouldStop`. It reports, over repeated draws: the confirmation rate for a given `δ`, the mean `blocksRun`, the futility rate, and the realised rate at `δ = 0`. Those are measured numbers written into the completion note, not asserted constants.

## Implementation steps

1. Add `apps/worker/src/optimizer/confirm.ts` with the constants, the two unions and `bonferroniZ`; spec `bonferroniZ(0.05, 1) = 1.960` and `bonferroniZ(0.05, 4) = 2.498` to three decimals (BR-S07.T03-02). `pnpm --filter worker test` green.
2. Write `powerAtMeasuredRho(rho, n, z, delta)` and spec it against the table above: ≈ 0.80 at `(0.4, 24000, 1.96)`, ≈ 0.70 at `(0.3, 24000, 1.96)`, ≈ 0.63 at `(0.4, 24000, 2.498)` (BR-S07.T03-06).
3. Write `confirmSeedBase` and spec disjointness from the screen and holdout salts for every `(job, iteration, block)` in a 1,000-case sweep (RN-83, [S07.T02](T02-paired-seed-screening.md) BR-S07.T02-04).
4. Write `selectSurvivors` with the cap and the `budget_cap` remainder; spec the ordering and the six-into-four case (BR-S07.T03-05).
5. Write `shouldStop` with the three branches; spec the futility rule's block-1 guard, its sign guard, and the strict `ciLow > 0` (BR-S07.T03-03, -04).
6. Write `buildConfirmPairings` reusing [S07.T02](T02-paired-seed-screening.md)'s construction with the confirm salt and `store_games: true`; spec that the reference and candidate pairings of a block differ only in `deck_a` (RN-83).
7. Write `confirm()`'s block loop with the injected `runBlock`, the cumulative accumulator and the `ReferenceMismatch` checks; spec that block 2's estimate uses 12,000 pairs and that a cross-block reference is refused (BR-S07.T03-01, -08).
8. Add the block-1 `ρ` measurement and the `lowRhoPolicy` branch; spec `"extend"` against `MAX_BLOCKS_HARD` and `"report"` lowering the reported power, plus the union exhaustiveness assertion (BR-S07.T03-06, -07).
9. Add `alphaSpent`, `blocks[]` and the full `ConfirmResult`; spec that an early stop reports the stopping block's interval unchanged (BR-S07.T03-03).
10. Add the policy tests: no alpha-spending export, no points-based noise threshold, no write, read-only run (RN-48, BR-S07.T03-02, -09).
11. Run the synthetic power set — `δ ∈ {0, +0.005, +0.01, +0.02}` × `ρ ∈ {0.15, 0.3, 0.4}` × `m ∈ {1, 4}`, 200 draws each — and record every measured confirmation rate, futility rate and mean `blocksRun` in the completion note as a table.
12. Run one real confirmation of a single survivor on suite v6 and record the measured `ρ`, the half-width in points at each block, `blocksRun` and the wall-clock, next to the model figures of the sizing table.

## Edge cases and error handling

- **A candidate's CI excludes zero at block 1.** It stops with `ci_excludes_zero` and `blocksRun = 1`, carrying the block-1 interval — which is roughly twice as wide as a four-block interval would be. That is intended and is why [S07.T04](T04-holdout-acceptance-and-versioning.md)'s acceptance also requires `Δ ≥ 0.5` point: a wide interval whose lower bound just clears zero is not by itself an improvement worth a deck version.
- **Two survivors both confirm.** Both are returned with `outcome: "confirmed"`; this subtask does not rank them. [S07.T05](T05-optimize-job-orchestration.md) applies at most one swap per iteration, choosing the larger confirmation Δ and re-proposing from the new list, so the second confirmed candidate is re-screened against a changed reference rather than applied blind. The tie is deterministic (`Δ desc`, then `se asc`, then `idx asc`).
- **Every survivor takes the futility exit at block 1.** The iteration ends after 6,000 pairs per candidate with no confirmation, `stopReason: "futility"` on each, and [S07.T05](T05-optimize-job-orchestration.md) stops the run. This is the cheapest possible honest negative result and it is what the Dhelmise reproduction may well produce.
- **The measured `ρ` from block 1 is near zero.** `powerAtMeasuredRho` collapses toward the unpaired figure — at `ρ = 0`, 24,000 pairs support about 55 % power for a one-point effect at `z = 1.96`. Under `lowRhoPolicy: "report"` the run continues to four blocks and reports that number; under `"extend"` it schedules blocks up to `MAX_BLOCKS_HARD` and reports the power at the pair count it actually reached. Either way the claim matches the run (BR-S07.T03-07).
- **A block is cancelled mid-way.** Partial `games` rows exist for some opponents of that block. The block is discarded entirely — a block with three of twelve opponents would re-weight the estimate — and `confirm()` returns the candidates with `stopReason: "cancelled"`, `blocksRun` equal to the last *complete* block and the interval from those blocks. A candidate with zero complete blocks returns `outcome: "rejected"`, `stopReason: "cancelled"`, `n: 0` and no interval, and [S07.T04](T04-holdout-acceptance-and-versioning.md) persists it without a decision of merit.
- **A block's reference arm errors on an opponent.** The affected pairs drop from both arms exactly as in screening; above `MAX_DROP_FRACTION` (0.02) for that block, the block is discarded and re-run once with the same seeds, because the seeds are a pure function of `(job, iteration, block, opponent)` and a re-run is byte-identical apart from the error. A second failure fails the job.
- **A survivor's list stops being fully covered between screening and confirmation** — a rules edit changed a code's status mid-run. `rules_snapshot` differs from the reference block's and `ReferenceMismatch { field: "rules_snapshot" }` is raised; the iteration is abandoned rather than estimated across two rule sets, the same discipline [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) applies with `divergent`.
- **`m = 1`.** Bonferroni is a no-op, `z = 1.960`, `alphaSpent = 0.05`. The four looks are still uncorrected, which is why the row still carries `blocksRun` and why the holdout still runs.
- **`SE = 0` after a block** — the swap changed nothing on any pair of that block. `pairedCi` returns `[Δ, Δ]`, which excludes zero only when `Δ ≠ 0`; with `SE = 0` and `Δ = 0` the interval is `[0, 0]`, `ciLow > 0` is false and the futility rule's `Δ + 2·SE < 0` is also false, so the candidate runs to `blocks_exhausted` and is rejected. No division by zero occurs anywhere.
- **`maxBlocks` set to 1 by the caller** (a quick sanity run). The futility rule and the CI rule both apply at block 1 and the result is `blocks_exhausted` when neither fires. `powerAtMeasuredRho` reports the power of 6,000 pairs, which is low, and the row says so. The design does not forbid small runs; it forbids small runs that claim to be large ones.
- **A caller asks for `lowRhoPolicy: "extend"` with a budget that cannot afford it.** `confirm()` extends only while `block ≤ MAX_BLOCKS_HARD` and while [S07.T05](T05-optimize-job-orchestration.md)'s remaining game budget covers the next block; when it cannot, it falls back to `"report"` and records `lowRhoPolicyApplied: "report"` so the row shows which branch ran.

## Acceptance / verification

- [ ] `pnpm --filter worker test confirm.spec.ts` green, including `> bonferroniZ(0.05, 1) is 1.960 and bonferroniZ(0.05, 4) is 2.498` to three decimals and `> alphaSpent equals alpha divided by the survivor count` (BR-S07.T03-02).
- [ ] `power.spec.ts > powerAtMeasuredRho matches the sizing table` — ≈ 0.80 at `(ρ = 0.4, n = 24000, z = 1.96)`, ≈ 0.70 at `(ρ = 0.3, n = 24000, z = 1.96)`, ≈ 0.63 at `(ρ = 0.4, n = 24000, z = 2.498)`, each within 0.02 (BR-S07.T03-06).
- [ ] `synthetic power set`: `δ ∈ {0, +0.005, +0.01, +0.02}` × `ρ ∈ {0.15, 0.3, 0.4}` × `m ∈ {1, 4}`, 200 draws each. The test **records the measured confirmation rate, futility rate and mean `blocksRun` for every cell** in the completion note. It fails only on two sanity conditions: the `δ = +0.02, ρ = 0.4, m = 1` cell confirms in at least 90 % of draws, and the `δ = 0` cells confirm in at most 15 % of draws. No cell asserts a power figure that the measured `ρ` does not support (RN-48, BR-S07.T03-06).
- [ ] `confirm.spec.ts > a candidate stopping at block 2 reports the block-2 interval and blocksRun = 2` and `> the interval after an early stop is not rescaled to four blocks` — the reported `ciLow`/`ciHigh` are byte-equal to `pairedCi` over blocks 1–2 (BR-S07.T03-03).
- [ ] `confirm.spec.ts > futility fires at block 1 for Δ = −0.02, SE = 0.004`, `> futility does not fire at block 2`, `> futility never fires on a positive Δ` (BR-S07.T03-04).
- [ ] `confirm.spec.ts > the block-2 estimate uses 12,000 pairs, not 6,000` and `> n after four blocks is 24,000` on suite v6's twelve opponents (BR-S07.T03-01).
- [ ] `confirm.spec.ts > the confirm salt is disjoint from the screen salt for every (job, iteration, block)` over a 1,000-case sweep, and `> candidate and reference share seed_base within a block` (RN-83).
- [ ] `confirm.spec.ts > one reference block serves four survivors` and `> a reference from block 1 against a candidate arm from block 2 is refused with ReferenceMismatch` (BR-S07.T03-08).
- [ ] `confirm.spec.ts > six passing candidates yield four survivors and two budget_cap rows` with the survivors ordered by screening Δ (BR-S07.T03-05).
- [ ] `confirm.spec.ts > lowRhoPolicy "extend" schedules extra blocks up to maxBlocksHard`, `> lowRhoPolicy "report" keeps four blocks and lowers the reported power`, and `> a run at rho 0.15 reports its lower power rather than 0.80` (BR-S07.T03-06, -07).
- [ ] `policy.spec.ts > confirm.ts exports no alpha-spending function` and `confirm.spec.ts > no points-based noise threshold exists` — a source assertion that no comparison of Δ against a numeric literal other than 0 appears in `confirm.ts` (RN-48, BR-S07.T03-02).
- [ ] `pnpm lint` fails on a fixture writing `optimizer_candidates` from `confirm.ts`; `confirm.spec.ts > read only` passes against a `readonly: true` connection (BR-S07.T03-09).
- [ ] One real confirmation of a single survivor on suite v6 completes, and the measured `ρ`, the half-width in points after each block, `blocksRun`, `powerAtMeasuredRho` and the wall-clock are recorded in the completion note beside the model figures of the sizing table.

## Risks and open questions

- **Risk — the four uncorrected looks inflate the type-I rate and someone reads the CI as exact.** The design admits this rather than hiding it behind a boundary function. Mitigation: `blocksRun` and `stopReason` are on every row and on the page ([S07.T06](T06-web-optimizer-page.md)), the interval is always the one from the blocks run, and the only number presented as unbiased is the holdout ([S07.T04](T04-holdout-acceptance-and-versioning.md)). If a future run needs a defensible nominal α under early stopping, an O'Brien–Fleming or Pocock boundary is the standard answer and is a deliberate, recorded change — not something to slip in as a constant.
- **Risk — the measured `ρ` is consistently below 0.4 and the stage never has 80 % power.** Two 60-card lists differing by one card diverge fast, so this is plausible rather than hypothetical. Mitigation: `ρ` is measured and reported, `lowRhoPolicy: "extend"` doubles the budget when the user wants it, and the honest fallback is a run that reports 70 % or 55 % power. If `ρ` turns out to be near zero in practice, the design conclusion is that this comparison needs either far more games or a lower-variance outcome measure (prize differential rather than win/loss), and that conclusion should be recorded in the decision log rather than absorbed silently.
- **Risk — `MAX_SURVIVORS = 4` discards a real winner.** A candidate that passes screening but ranks fifth is recorded as `budget_cap` and never confirmed. Mitigation: it stays in the move log and in `optimizer_candidates`, so a user who wants it confirmed re-runs with a smaller `k` or fewer opponents; and because the cap is applied on screening Δ, which is the biased quantity, the note on the row says so.
- **Risk — the shared reference block correlates the survivors' estimates within a block.** An unusually lucky reference realisation makes every candidate's Δ smaller together, so the survivors' decisions are not independent and Bonferroni is conservative in one direction and wrong in another. Mitigation: it is the affordable design — a private reference per candidate would multiply the block cost by `m` — and the dependence is stated here, on the row's `survivors` field, and again in the risks of [S07.T04](T04-holdout-acceptance-and-versioning.md).
- **Risk — the working model `σ² = 0.25` is wrong.** It assumes a near-50 % win rate; on a lopsided matchup the per-arm variance is smaller and the sizing table is pessimistic, and the model's `Var(d) = 2σ²(1 − ρ)` is only an approximation for a three-outcome variable with ties at 0.5. Mitigation: nothing in the code uses the model — `SE` comes from the observed `var(d_o)` on every run, and the table is labelled as sizing guidance whose predictions the acceptance check compares against measurement.
- **Question — should the futility rule also fire at block 2?** It would save a block on candidates that are drifting negative, at the cost of abandoning a true positive that started unlucky. Recommendation: keep the block-1-only rule for the first real runs and record how often a candidate that survived block 1 ended negative; the constant and the guard are both exported so the change is one line and one recorded decision.
- **Question — should `α` be 0.05 or something looser, given the holdout is the reported number?** Confirmation is a gate before an expensive holdout, not a publication. A looser `α` would raise power at the cost of more holdout runs, which are cheap relative to four confirmation blocks. Recommendation: keep 0.05 for the first runs, record the survivor and acceptance counts, and let the user decide with real numbers in front of them.

## References

- `pokemon/scripts/deck_optimize.py` L101–103 — verified: `conf, cci, _ = score(cand, a.confirm, f"conf{it}")` followed by `atual, aci, _ = score(best, a.confirm, f"conf{it}")` and `ok = conf - atual > (cci[1] - cci[0]) / 2`. The salt changes from `f"tri{it}"` to `f"conf{it}"`, so confirmation ran on fresh seeds, and the incumbent was re-scored on those same fresh seeds — the paired-on-new-seeds structure RN-83 describes and this subtask keeps. Note `aci` is computed and never used, and that the acceptance threshold there is the candidate's own CI half-width; that rule is [S07.T04](T04-holdout-acceptance-and-versioning.md)'s to revise.
- `pokemon/scripts/deck_optimize.py` L26–27 — verified: `--screen` defaulting to 50 games per opponent and `--confirm` to 250. Twelve opponents gives 600 screening games and 3,000 confirmation games per candidate, against RN-48's 1,200-game reference for a three-point noise band. The sizes this subtask replaces.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: three iterations, eight screened swaps each, three finalists screened at +4.6, +3.4 and +2.7 and confirmed at 0.0 (58.7 % against 58.7 %), −2.2 (57.3 % against 59.5 %) and +0.9 (59.6 % against 58.7 %); the final list unchanged at 56.9 % (CI 55.2–58.7). The paired second observation of the same three swaps, and the reason the reported number is the one taken after selection rather than during it.
- `pokemon/ESPECIFICACAO.md` §4.7 RN-83 — verified: *"Duas peneiras: triagem barata e pareada (mesma semente para candidata e referência), depois confirmação da melhor com amostra grande e sementes novas, reavaliando também a lista atual"*. §4.4 RN-48 — verified: *"Diferença abaixo de ~3 pontos com 1200 partidas é ruído; mudança pequena se decide com `--games 250 --mirror 200`"*. §5.3 — verified: *"3 iterações, 24 trocas na triagem, 3 finalistas, nenhuma confirmada (ganhos de +2,7 a +4,6 pontos na triagem viraram −2,2 a +0,9 na confirmação). Lista final = lista inicial, 56,9 % (IC 55,2–58,7)"*.
- `pokemon/src/pokesearch/sim/optimizer.py` L465–509 (`run_optimization`) — verified: the library path's own two-phase loop, screening at `max(games // 2, 10)` games with `seed0 = 1000 * it` and confirming at `games` with `seed0 = 5000 * it`, while the baseline was measured once at `seed0 = 0` and never re-measured. Its screening was therefore **not** paired with its baseline, unlike `deck_optimize.py`'s. Consult for the contrast; RN-83 describes the script's behaviour, which is the one kept here.
- [S07.T02](T02-paired-seed-screening.md) — `pairedDelta`, `pairedCi`, `pairedRho`, `OpponentPairs`, the `var(d)` rule this subtask depends on entirely, and the screening survivors it consumes.
- [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) (`seed_base`, stream separation, fingerprints), [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) (the `Pairing` shape and `store_games`), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) (who runs the blocks), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) (the frozen suite, weights and `seed0`), [S07.T04](T04-holdout-acceptance-and-versioning.md) (the acceptance rule, `alpha_spent` and the holdout that carries the unbiased number).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
