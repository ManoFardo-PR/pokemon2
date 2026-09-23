# S07.T02 — Paired-seed screening

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 2 / 7 |
| Depends on | [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](T01-candidate-pool-and-move-generation.md) |
| Unblocks | [S07.T03](T03-sequential-confirmation.md), [S07.T04](T04-holdout-acceptance-and-versioning.md), [S07.T05](T05-optimize-job-orchestration.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` seeding (`seed_base` per pairing, bot streams separate) — from [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)
- `module` worker (`evaluate` pairings) — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `module` frozen suite (opponents, weights, `seed0`, opponent bot) and `matchupSeed` — from [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)
- `module` candidate moves — from [S07.T01](T01-candidate-pool-and-move-generation.md)

## Outputs (proposed)
- `module` `optimizer/screen.ts` — for K candidates: candidate and reference play the same `(opponent, seed)` pairs (`seed_base = crc32(job, 'screen', iteration, opponent)`); per pair `d ∈ {−1, −0.5, 0, 0.5, 1}` (tie = 0.5); `Δ = mean(d)` weighted by opponent weight, `SE = sd(d)/√n`; pass rule `Δ − 1·SE > 0`; sizes `K ≤ 24 × 12 opponents × 200 games` — consumed by [S07.T03](T03-sequential-confirmation.md), [S07.T05](T05-optimize-job-orchestration.md)
- `module` `optimizer/stats.ts` — the shared paired-difference estimator: `pairedDelta(perOpponent) → { delta, se, n, varByOpponent }`, `pairedCi(stats, z)`, `pairedRho(perOpponent)`; every later stage of the method computes its Δ and SE with these functions and none defines its own — consumed by [S07.T03](T03-sequential-confirmation.md), [S07.T04](T04-holdout-acceptance-and-versioning.md), [S07.T05](T05-optimize-job-orchestration.md)

## Initial objective
Cheap, high-recall triage: common random numbers cancel most seed noise so a real 1-point gain shows up in a few thousand games, while clearly harmful swaps are dropped early.

## Context

This is the first sieve of RN-83 and the place where the legacy's documented failure is actually repaired. In `benchmarks/otimizacao_dhelmise.md`, three swaps screened at **+4.6, +3.4 and +2.7** points and confirmed at **0.0, −2.2 and +0.9**. Those are not three independent misses. They are paired observations of the same three swaps, taken twice: once on the seeds that selected them and once on fresh seeds. A screening pass that ranks twenty-four noisy differences and promotes the largest is selecting on noise as well as on signal, so the winner's screening number is biased upward by construction and the fresh-seed number regresses toward the truth. That is the whole story, and it is a property of *how the number was used*, not of the pairing — which the legacy got right.

What the legacy did not have was any measure of how noisy that ranking was. `scripts/deck_optimize.py` scored the reference once per iteration with the salt `f"tri{it}"` (L81) and every candidate with the *same* salt (L90), with the comment *"mesmas sementes da referência: comparação pareada"* — genuinely paired, and the reported `Δ` was simply `sc - ref` (L93), the difference of two aggregate win rates. There is no standard error anywhere in that file. The best screened move was `max(results, key=lambda t: t[0])` (L96) and the only test was `if sc <= ref: continue` (L97). Twenty-four differences, no uncertainty, take the maximum: the screening stage had no threshold at all, so it could not be too loose or too tight — it was uncalibrated.

**The single most important thing this subtask specifies is which variance is used.** `var(d_o)` is the variance of the **per-pair differences** `d`, never the variance of either arm's win rate and never the sum of the two arms' variances. The reason is arithmetic: `Var(d) = Var(r_cand) + Var(r_ref) − 2·Cov(r_cand, r_ref)`, and common random numbers exist entirely to make that covariance large. Using a per-arm variance drops the covariance term, which computes the standard error of an *unpaired* comparison and then attaches it to a *paired* estimate — Δ with the seed noise removed, SE with the seed noise still in it. The two numbers then describe different experiments, and a threshold built from them is calibrated against nothing. That is precisely the position the legacy was in when it promoted +4.6 to a finalist, and reproducing it here would waste the entire cost of running both arms on the same seeds. Every implementation of `pairedDelta` must compute `var` over the difference vector, and `stats.spec.ts > se is computed from the difference variance, not from either arm` is the test that pins it.

**Screening is a threshold, not a test.** `Δ − SE > 0` is a one-sided cut at roughly one standard error; it is chosen for recall, and it will pass some null candidates every iteration by design. That is intended: this stage's job is to hand [S07.T03](T03-sequential-confirmation.md) a short list cheaply, and confirmation is the filter. It is also why the acceptance criterion below **measures** the realised null pass rate in the synthetic test and records it rather than asserting a bound. The realised rate is not 16 % or any other textbook number, because `d` is discrete with a large atom at zero — a candidate and its reference winning or losing the same game produce `d = 0` — so the pass rate depends on the tie fraction, which depends on the decks, the bots and the opponent list. A number asserted in advance would be a number the test would eventually have to be weakened to satisfy.

**Why the threshold is where it is**, and what RN-48 has to do with it. RN-48 records the legacy's own rule of thumb: *"Diferença abaixo de ~3 pontos com 1200 partidas é ruído"*. That is an unpaired band, and it is the yardstick the screening threshold is calibrated against — the legacy screened at 50 games per opponent over twelve opponents, 600 games, half of RN-48's reference size, and then treated +2.7 points as a finding. Here the size is 200 pairs per opponent, 2,400 pairs, and the threshold is not a fixed number of points at all: it is the measured `SE`, recomputed from the observed `var(d_o)` on every run. Under the working model `Var(d) = 2σ²(1 − ρ)` with `σ² = 0.25`, twelve equally weighted opponents at 200 pairs give `SE = √(Var(d)/2400)` — about **1.4 points at ρ = 0** and about **1.1 points at ρ = 0.4**. Those are model figures, not measurements; the real weights are the suite's and are not equal, so `Σ w_o²` exceeds `1/12` and the real SE is somewhat larger. The implementation reports the number it actually computed, which is the point.

**Seeds must be CRC-based.** `optimizer.py::evaluate` L387 derives its offset as `seed0 + hash(o.deck_id) % 10000`. `o.deck_id` is a string, and Python salts string hashing per process, so that seed is reproducible only inside one interpreter — which is exactly why `scripts/deck_optimize.py` L20–21 re-executes itself with `PYTHONHASHSEED=0` before doing anything else. The consequence is sharp: the legacy's screening was paired *within a single process* and nothing else. A crash and a resume, a second process re-checking a number, or a comparison against a figure recorded last week were all comparing different games. Here `seed_base` is the RN-46 CRC formula from [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md), identical in Rust and TypeScript against a shared fixture, so a pairing is reproducible across processes, machines and days — and RN-47 is superseded rather than re-enforced, because there is no hash iteration left to seed.

## Scope

- **In scope.** `apps/worker/src/optimizer/screen.ts` (`screen`, `buildScreenPairings`, `screenSeedBase`); `apps/worker/src/optimizer/stats.ts` (`pairedDelta`, `pairedCi`, `pairedRho`, `PairedStats`, `OpponentPairs`) shared with [S07.T03](T03-sequential-confirmation.md) and [S07.T04](T04-holdout-acceptance-and-versioning.md); the per-pair difference vector and how it is extracted from `games` rows; the reference arm and its reuse across candidates inside one iteration; the pass rule and its constant; the screening sizes and their budget arithmetic; the synthetic-gain harness that measures the null pass rate; the `ScreenResult` contract [S07.T04](T04-holdout-acceptance-and-versioning.md) persists.
- **Out of scope.** Generating candidates ([S07.T01](T01-candidate-pool-and-move-generation.md)); confirmation, its blocks, its multiplicity control and its power claim ([S07.T03](T03-sequential-confirmation.md)); acceptance, the holdout and `optimizer_candidates` ([S07.T04](T04-holdout-acceptance-and-versioning.md)); the job loop, cancellation and progress ([S07.T05](T05-optimize-job-orchestration.md)); running games at all — this module builds pairings and reads results, and [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) owns the engine process; the weighted score and its delta-method CI, which is a different statistic owned by [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) and [S06.T08](../06-bots/T08-measurement-score-and-mirror.md).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-83 | **Kept, extended (first sieve).** Screening is cheap and **paired**: for one iteration, the reference list and every candidate play the same `(opponent, seed_base, game_idx)` triples, so the shuffles and the bot streams are identical across arms and only the swapped card differs. Screening never accepts anything; it forwards survivors to [S07.T03](T03-sequential-confirmation.md), which re-tests them on seeds this stage never used. | `screenSeedBase(seed0, jobId, iteration, opponentDeckId)` is called once per opponent and reused for both arms; `screen()` returns `ScreenResult[]` with no accept path | `screen.spec.ts > candidate and reference share seed_base for every opponent`; `> the same iteration reproduces identical fingerprints for the reference arm across two processes`; `> screen never returns an accept decision` |
| BR-S07.T02-01 | A **pair** is one `(opponent, game_idx)` with the same `seed_base` played by both arms; its difference is `d = r_cand − r_ref` with `r ∈ {1, 0.5, 0}` for win/tie/loss from the evaluated deck's point of view, so `d ∈ {−1, −0.5, 0, 0.5, 1}`. A pair with a missing or errored game on either side is dropped from both arms and counted in `droppedPairs`; it is never imputed. | `pairDifferences(candGames, refGames)` joining on `game_idx`; the drop counter on `OpponentPairs` | `stats.spec.ts > d takes only the five documented values`; `> an errored candidate game drops the pair from both arms and increments droppedPairs`; `> the arms are joined on game_idx, not on position` |
| BR-S07.T02-02 | `Δ = Σ_o w_o · mean(d_o)` and `SE² = Σ_o w_o² · var(d_o) / n_o`, where `w_o` are the suite's opponent weights normalized to sum to 1, `n_o` is the surviving pair count for opponent `o`, and **`var(d_o)` is the sample variance of that opponent's per-pair differences `d`** — never the variance of either arm's win rate and never the sum of the two arms' variances. | `pairedDelta()` computes `var` over the difference vector only; `stats.ts` has no function that returns a per-arm variance | `stats.spec.ts > se is computed from the difference variance, not from either arm` — a fixture where the two arms are perfectly correlated gives `SE = 0` while the per-arm formula would give a positive value; `> delta and se match hand-computed values on a fixed 5-opponent fixture` |
| BR-S07.T02-03 | A candidate passes screening when `Δ − SE > 0`. This is a one-sided, high-recall **threshold, not a hypothesis test**: it is expected to pass some candidates whose true Δ is zero on every iteration, and no false-pass rate is asserted anywhere in the code or the docs. The realised null pass rate is measured by the synthetic harness and recorded in the completion note. | `screen()`'s single comparison; `SCREEN_K_SE = 1` exported as a named constant | `screen.spec.ts > a candidate with Δ = SE exactly does not pass` (strict inequality); `synthetic.spec.ts > the measured null pass rate is reported` — the test prints and stores the rate and fails only if it is above 0.5, which would mean the threshold is not one-sided at all |
| BR-S07.T02-04 | Every seed in this subtask comes from `seedBase(seed0, parts)`, the RN-46 CRC-32 formula of [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md); no seed is derived from a language hash, a timestamp, a row id or `Math.random`. The screening salt is `["optimize", jobId, "screen", iteration, opponentDeckId]` and it is disjoint from the confirmation and holdout salts. | `screenSeedBase()` is the only seed constructor in `screen.ts`; `pnpm check` greps the optimizer directory for `Math.random` and for `hash`-based seeding | `screen.spec.ts > screenSeedBase matches the shared RN-46 fixture vectors`; `> the screen salt never collides with the confirm or holdout salt for the same job and iteration`; `pnpm check` fails on a fixture using `Math.random` under `apps/worker/src/optimizer` |
| BR-S07.T02-05 | The reference arm is computed **once per iteration** and reused for every candidate of that iteration; it is re-run only when the iteration changes, because the reference list changes only when a swap is accepted. A candidate is never compared against a reference measured under a different `seed_base`, `engine_build` or `rules_snapshot`. | `screen()` takes a `ReferenceArm` carrying its `seedBases`, `engineBuild` and `rulesSnapshot`, and asserts they match the candidate jobs' | `screen.spec.ts > the reference arm is played once for twenty-four candidates`; `> a reference from a different engine build is refused with ReferenceMismatch` |
| BR-S07.T02-06 | Screening sizes are bounded: at most `MAX_CANDIDATES` (24) candidates, the suite's opponents (12 in suite v6) and `SCREEN_PAIRS` (200) pairs per opponent — 57,600 candidate games plus one shared 2,400-game reference arm per iteration. A request above any bound is rejected before a game runs, not truncated silently. | `assertScreenBudget(opts)` called at the top of `screen()` | `screen.spec.ts > 25 candidates is rejected with ScreenBudget naming the limit`; `> the total game count of one iteration is 60,000 on suite v6` |
| BR-S07.T02-07 | `screen()` performs no database write and starts no engine process itself: it builds `Pairing[]` for [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) and consumes the `games` rows those jobs produced. All persistence belongs to [S07.T04](T04-holdout-acceptance-and-versioning.md) and [S07.T05](T05-optimize-job-orchestration.md). | the module exports pure functions plus one read helper; the writer-ownership lint ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a fixture writing `optimizer_candidates` from `screen.ts`; `screen.spec.ts > read only` runs the suite against a `readonly: true` connection |
| BR-S07.T02-08 | `pairedRho(perOpponent)` reports the realised pairing correlation `ρ = 1 − var(d) / (var(r_cand) + var(r_ref))` per opponent and pooled, and `screen()` returns it. It is a diagnostic here — nothing in this subtask branches on it — and it is the number [S07.T03](T03-sequential-confirmation.md) needs before it may claim a power figure. | `pairedRho()` in `stats.ts`; `ScreenResult.rho` | `stats.spec.ts > rho is 1 for identical arms and 0 for independent arms` (two fixtures); `screen.spec.ts > the screening result carries a pooled rho` |
| BR-S07.T02-09 | Screening requires that both lists be fully covered: `assertListCovered` ([S07.T01](T01-candidate-pool-and-move-generation.md) BR-S07.T01-06) is called for the reference list, every candidate list and every opponent list before the first pairing is built. No card is generated, authored or approximated to make a screening run possible (RN-81, RN-60). | the precondition block of `buildScreenPairings`; `screen.ts` imports nothing from the authoring or LLM packages | `screen.spec.ts > an opponent list with an uncovered card fails before any pairing is built`; `policy.spec.ts > optimizer/screen.ts imports no authoring or llm module` |

## Data operations

**Algorithm — one screening iteration.**

| Step | Operation | Inputs | Output | Rule |
|---|---|---|---|---|
| 1 | Check the budget and the coverage | `candidates[]`, suite opponents, reference list | refusal or proceed | BR-S07.T02-06, -09 |
| 2 | Derive one `seed_base` per opponent | `seed0`, `jobId`, `iteration`, `opponentDeckId` | `seedBases: Map<deckId, number>` | BR-S07.T02-04, RN-46 |
| 3 | Build the reference pairings | reference list, opponents, `seedBases`, `SCREEN_PAIRS` | 12 `Pairing` records with `store_games: true` | BR-S07.T02-05 |
| 4 | Run the reference arm once | the pairings, via [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) | `games` rows: `(pairing_idx, game_idx, winner, reason)` | RN-83 |
| 5 | Build the candidate pairings | each candidate list, the **same** `seedBases`, same bots, same counts | K × 12 `Pairing` records | RN-83, BR-S07.T02-01 |
| 6 | Run the candidate arms | the pairings, via [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) | `games` rows per candidate | RN-83 |
| 7 | Join the arms per opponent | candidate and reference `games` rows, joined on `(opponent, game_idx)` | `d[]` per opponent; `droppedPairs` for unmatched or errored pairs | BR-S07.T02-01 |
| 8 | Estimate | `d[]`, suite weights | `Δ = Σ w_o·mean(d_o)`, `SE² = Σ w_o²·var(d_o)/n_o` | BR-S07.T02-02 |
| 9 | Diagnose the pairing | per-arm and difference variances | `ρ` per opponent and pooled | BR-S07.T02-08 |
| 10 | Apply the threshold | `Δ`, `SE` | `pass = Δ − SE > 0` | BR-S07.T02-03 |
| 11 | Order the survivors | `Δ` descending, `SE` ascending as a tie-break | `ScreenResult[]` for [S07.T03](T03-sequential-confirmation.md) | RN-83 |

**Tables read** (no writes — BR-S07.T02-07).

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `suites`, `suite_opponents` | R | worker | step 1–2, once per job | read-only; weights and `seed0` are frozen ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) RN-41) | `list_json`, `weight`, `deck_id` |
| `games` | R | worker | steps 7–8, after each arm finishes | read-only; requires `store_games` on the screening jobs | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) BR-S04.T14-05 |
| `job_pairings` | R | worker | step 7, to map `pairing_idx` to an opponent and to read `errors` | read-only | fingerprints checked against the reference arm |
| `card_status` (view) | R | worker | step 1, through `assertListCovered` | read-only | BR-S07.T02-09 |
| `optimizer_candidates`, `jobs`, `user_deck_versions` | C/U/D | worker | never in this module | owned by [S07.T04](T04-holdout-acceptance-and-versioning.md) and [S07.T05](T05-optimize-job-orchestration.md) | Architecture principle 2 |
| the database | — | engine | never | pairings reach the engine as JSON | Architecture principle 1 |

## Interfaces

**`apps/worker/src/optimizer/stats.ts`** — the paired estimator, shared by this subtask, [S07.T03](T03-sequential-confirmation.md) and [S07.T04](T04-holdout-acceptance-and-versioning.md).

```ts
/** One opponent's paired outcomes. `d[i] = r_cand[i] − r_ref[i]`, each r ∈ {1, 0.5, 0}. */
export interface OpponentPairs {
  opponentDeckId: string;
  weight: number;                 // the suite's frozen weight; normalized by pairedDelta
  d: Float64Array;                // values in {−1, −0.5, 0, 0.5, 1} (BR-S07.T02-01)
  rCand: Float64Array;            // kept only for pairedRho; never used for SE (BR-S07.T02-02)
  rRef: Float64Array;
  droppedPairs: number;           // pairs dropped because either arm errored or was missing
}

export interface PairedStats {
  delta: number;                  // Δ = Σ w_o · mean(d_o), in win-rate units; ×100 for points
  se: number;                     // SE = √( Σ w_o² · var(d_o) / n_o )   (BR-S07.T02-02)
  n: number;                      // Σ n_o, surviving pairs
  tieFraction: number;            // share of pairs with d === 0; drives the null pass rate
  byOpponent: { opponentDeckId: string; weight: number; n: number;
                meanD: number; varD: number; rho: number }[];
  droppedPairs: number;
}

/**
 * Δ and its standard error from PAIRED differences.
 * `varD` is the sample variance (denominator n−1) of `d`, NOT of `rCand` or `rRef`
 * and NOT their sum: dropping Cov(rCand, rRef) discards the pairing (BR-S07.T02-02).
 */
export function pairedDelta(per: readonly OpponentPairs[]): PairedStats;

/** Two-sided interval at the given z; z is supplied by the caller (S07.T03 sets it from Bonferroni). */
export function pairedCi(s: PairedStats, z: number): [low: number, high: number];

/** ρ = 1 − var(d) / (var(rCand) + var(rRef)); 1 for identical arms, 0 for independent ones. */
export function pairedRho(per: readonly OpponentPairs[]): { pooled: number; byOpponent: number[] };

/** Joins two arms on game_idx and drops pairs where either side errored (BR-S07.T02-01). */
export function pairDifferences(
  cand: readonly GameRow[], ref: readonly GameRow[], evaluatedSide: 0 | 1,
): { d: Float64Array; rCand: Float64Array; rRef: Float64Array; droppedPairs: number };
```

**`apps/worker/src/optimizer/screen.ts`**

```ts
export const MAX_CANDIDATES = 24;   // re-exported from S07.T01; the hard ceiling per iteration
export const SCREEN_PAIRS   = 200;  // paired games per opponent per candidate
export const SCREEN_K_SE    = 1;    // the threshold is Δ − SCREEN_K_SE·SE > 0 (BR-S07.T02-03)

export interface ScreenOpts {
  jobId: number;
  iteration: number;
  seed0: number;                    // the suite's frozen seed0 (S05.T16)
  pairsPerOpponent?: number;        // default SCREEN_PAIRS
  bot: string;                      // the cheap bot; the planner (S06.T03)
  opponentBot: string;              // the suite's frozen opponent bot
}

export interface ReferenceArm {
  listJson: DeckLine[];
  seedBases: ReadonlyMap<string, number>;   // opponentDeckId -> seed_base
  gamesByOpponent: ReadonlyMap<string, GameRow[]>;
  engineBuild: string;
  rulesSnapshot: string;
  jobId: number;
}

export interface ScreenResult {
  idx: number;                      // the candidate's index inside the iteration
  move: Move;                       // from S07.T01
  delta: number;                    // Δ, win-rate units
  se: number;
  n: number;                        // surviving pairs, Σ over opponents
  games: number;                    // candidate-arm games actually played
  rho: number;                      // pooled pairing correlation (BR-S07.T02-08)
  tieFraction: number;
  droppedPairs: number;
  pass: boolean;                    // Δ − SE > 0
  byOpponent: PairedStats["byOpponent"];
}

/** Pairings for one arm; the caller hands them to the worker's `evaluate` dispatcher (S04.T15). */
export function buildScreenPairings(
  db: Db, list: readonly DeckLine[], opponents: readonly SuiteOpponent[],
  seedBases: ReadonlyMap<string, number>, opts: ScreenOpts,
): Pairing[];

/** RN-46 salt for screening (BR-S07.T02-04). */
export function screenSeedBase(seed0: number, jobId: number, iteration: number, opponentDeckId: string): number;

/** Pure: joins each candidate arm against the shared reference arm and applies the threshold. */
export function screen(
  candidates: readonly { idx: number; move: Move; gamesByOpponent: ReadonlyMap<string, GameRow[]>;
                         engineBuild: string; rulesSnapshot: string }[],
  reference: ReferenceArm,
  opponents: readonly SuiteOpponent[],
  opts: ScreenOpts,
): ScreenResult[];

export function assertScreenBudget(opts: { candidates: number; opponents: number; pairsPerOpponent: number }): void;

export class ScreenBudget extends Error { readonly limit: number; readonly requested: number; readonly field: string }
export class ReferenceMismatch extends Error { readonly field: "seed_base" | "engine_build" | "rules_snapshot" }
```

**The estimator, written out.** Notation: opponents `o` with frozen weights `w_o` normalized so `Σ w_o = 1`; `n_o` surviving pairs for opponent `o`; per pair `d ∈ {−1, −0.5, 0, 0.5, 1}` with a tie scoring 0.5 on each arm (RN-45).

```text
r_cand[i], r_ref[i] ∈ {1, 0.5, 0}          win / tie / loss, evaluated deck's point of view
d[i]      = r_cand[i] − r_ref[i]           ∈ {−1, −0.5, 0, 0.5, 1}

mean(d_o) = (1/n_o) Σ_i d_o[i]
var(d_o)  = (1/(n_o − 1)) Σ_i (d_o[i] − mean(d_o))²      ← the DIFFERENCE variance (BR-S07.T02-02)

Δ    = Σ_o w_o · mean(d_o)
SE²  = Σ_o w_o² · var(d_o) / n_o
pass = Δ − SE > 0
ρ_o  = 1 − var(d_o) / (var(r_cand,o) + var(r_ref,o))      ← diagnostic only (BR-S07.T02-08)
```

`var(r_cand,o)` and `var(r_ref,o)` appear in exactly one place, the `ρ` diagnostic. They must never reach `SE`. A fixture in which the two arms are identical — the same list screened against itself — has `d ≡ 0`, so `var(d) = 0` and `SE = 0`, while the per-arm formula would report a positive standard error for a comparison that has no uncertainty at all. That fixture is the test.

**Pairing construction.** Both arms use the identical `seed_base`, the identical bot names and the identical game count, so game `i` of opponent `o` runs the same shuffle and the same bot streams on both sides ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-04), and the first-player alternation by game index ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)) lines up too. Only the swapped card differs.

```text
seedBase_o = seedBase(seed0, ["optimize", String(jobId), "screen", String(iteration), opponentDeckId])

reference pairing o : { idx: o, deck_a: referenceList, deck_b: opponentList,
                        bot_a: bot, bot_b: opponentBot, games: 200, seed_base: seedBase_o,
                        weight: w_o, label: archetype }
candidate  pairing o : the same record with deck_a = applyMove(referenceList, move)
options             : { store_games: true, store_logs: false, stall_turns: 12, max_steps: 3000 }
```

`store_games: true` is required: the per-pair difference cannot be recovered from `job_pairings` aggregates, only from the `games` rows. A screening iteration therefore writes 60,000 `games` rows at roughly 60 bytes each — about 3.6 MB per iteration, which the retention sweep of [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) clears after `GAMES_RETENTION_DAYS`.

**Budget arithmetic**, on suite v6's twelve opponents:

| Quantity | Value |
|---|---|
| Candidates per iteration | ≤ 24 |
| Opponents | 12 (suite v6) |
| Pairs per opponent | 200 |
| Candidate-arm games | 24 × 12 × 200 = 57,600 |
| Reference-arm games (shared) | 12 × 200 = 2,400 |
| Total games per iteration | 60,000 |
| Surviving pairs per candidate | 2,400 (before drops) |
| Wall-clock at the S04.T18 target of ≥ 5,000 games/s | ≈ 12 s |

**The synthetic harness** (`apps/worker/src/optimizer/__fixtures__/synthetic.ts`) is what makes the acceptance checks runnable without a real engine run. It generates paired outcomes directly from a model — a per-pair latent `u ~ U(0,1)` shared by both arms to induce correlation `ρ`, a tie probability `τ`, and a true difference `δ` — and feeds them through `pairDifferences` and `pairedDelta` unchanged. It parameterises `(δ, ρ, τ, n_o, weights)` and reports the realised pass rate over repeated draws. It is a test of the estimator and the threshold, not of the engine.

## Implementation steps

1. Add `apps/worker/src/optimizer/stats.ts` with `OpponentPairs`, `PairedStats` and `pairedDelta`; spec `Δ` and `SE` against a hand-computed five-opponent fixture, and spec the identical-arms fixture giving `SE = 0` (BR-S07.T02-02). `pnpm --filter worker test` green.
2. Add `pairDifferences` joining on `game_idx` with the error-drop rule; spec the five permitted values of `d` and the `droppedPairs` counter (BR-S07.T02-01).
3. Add `pairedCi(stats, z)` and `pairedRho`; spec `ρ = 1` for identical arms and `ρ ≈ 0` for independent ones (BR-S07.T02-08).
4. Write the synthetic harness with `(δ, ρ, τ, n_o, weights)` and a repeated-draw runner returning the realised pass rate.
5. Write `screenSeedBase` against the shared RN-46 fixture vectors and assert salt disjointness from the confirm and holdout salts (BR-S07.T02-04).
6. Write `buildScreenPairings` with `store_games: true`, the coverage precondition and the identical-`seed_base` construction; spec that the candidate and reference pairings differ only in `deck_a` (RN-83, BR-S07.T02-09).
7. Write `assertScreenBudget` and spec the three bounds with their error fields (BR-S07.T02-06).
8. Write `screen()`: the reference-arm consistency check, the per-candidate join, `pairedDelta`, `ρ`, the threshold and the ordering; spec `ReferenceMismatch` and the strict inequality at `Δ = SE` (BR-S07.T02-03, -05).
9. Add the import-graph policy test and the read-only spec run (BR-S07.T02-07, -09).
10. Run the synthetic acceptance set: a +2-point gain at `ρ ∈ {0.2, 0.4}`, a +1-point gain, and a true-zero gain at three tie fractions; record the measured pass rate of each in the completion note, with the tie fractions that produced them.
11. Run one real screening iteration on suite v6 with the Dhelmise list and eight candidates from [S07.T01](T01-candidate-pool-and-move-generation.md); record the measured `ρ`, the measured `SE` in points and the wall-clock next to the model figures in the Context, so the next reader knows whether the model was optimistic.

## Edge cases and error handling

- **No candidate passes screening.** `screen()` returns every result with `pass: false`. This is a normal outcome, not a failure: the iteration ends, [S07.T05](T05-optimize-job-orchestration.md) records the survivors count as zero and the run stops with `no_candidate_passed`. The Dhelmise reproduction is allowed to end this way — "no swap outside noise" is a result.
- **Two candidates have identical Δ and SE.** They are ordered by `(Δ desc, SE asc, idx asc)`, so the tie is broken deterministically by the candidate's position in the iteration, which is itself a deterministic function of the prior ([S07.T01](T01-candidate-pool-and-move-generation.md)). Both proceed to confirmation if both pass; the tie is resolved there or on the holdout, never by a coin flip here.
- **A candidate whose arm errored on some games.** Those pairs are dropped from both arms — dropping only the failed side would leave an unpaired remainder and silently break the design. `droppedPairs` is carried into `ScreenResult` and surfaced on the page; above `MAX_DROP_FRACTION` (0.02) the candidate is marked `pass: false` with `reason: "too_many_dropped"`, because an estimate over a self-selected subset of seeds is not a paired estimate.
- **`var(d_o) = 0` for every opponent.** The swap changed nothing on any of the 2,400 pairs — common for a swap between two cards that never both appear, and for a card the bot never plays. `SE = 0`, so `Δ − SE > 0` reduces to `Δ > 0`, and `Δ` is also 0, so the candidate does not pass. The zero-variance case is reported explicitly (`tieFraction = 1`) rather than dividing by zero anywhere.
- **A tie fraction near 1.** The estimator is fine, but the threshold is operating on a handful of informative pairs. `ScreenResult.tieFraction` is returned for exactly this reason, and it is the quantity the acceptance check records alongside the measured null pass rate, because the rate is a function of it.
- **An opponent list contains a card without exact coverage.** `assertListCovered` throws `UncoveredCard` before step 2, so no game runs and the job fails naming the card and its status. Nothing generates a definition to make the run possible (RN-81, BR-S07.T02-09) — the path forward is the authoring queue ([S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md)).
- **The reference arm's engine build differs from a candidate arm's** — the binary was rebuilt between two jobs of one iteration. `ReferenceMismatch { field: "engine_build" }`; the iteration is abandoned rather than compared across builds, the same discipline [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) applies with `divergent`.
- **The job is cancelled mid-arm.** Partial `games` rows exist for some opponents and not others. `screen()` refuses to estimate from a partial arm: an opponent missing from `gamesByOpponent` is an error, not a zero weight, because silently dropping an opponent re-weights the score. [S07.T05](T05-optimize-job-orchestration.md) discards the iteration and leaves the candidate rows with `decision: 'screened_out'` and a cancellation note.
- **A candidate list is identical to the reference** (a move that adds and removes the same card, which [S07.T01](T01-candidate-pool-and-move-generation.md) L300's analogue forbids). Every `d` is 0 and `SE` is 0, so it cannot pass; the property test asserts that the self-comparison of the reference list yields `Δ = 0, SE = 0, pass = false`. It is the cheapest end-to-end check that the pairing is real.
- **More opponents than the suite has** (a caller passing a custom opponent list longer than 12). `assertScreenBudget` does not bound the opponent count on its own — the budget is a product — but the total game count is bounded at 120,000 per iteration, and a request above it is refused with the requested and permitted totals.
- **Weights that do not sum to 1.** The suite normalizes at freeze time ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) BR-S05.T16-04), and `pairedDelta` re-normalizes defensively and asserts the input sum was within 1e-9 of 1. A silent renormalization of genuinely wrong weights would move Δ without telling anyone.

## Acceptance / verification

- [ ] `pnpm --filter worker test stats.spec.ts` green, including `> se is computed from the difference variance, not from either arm`: a fixture in which both arms have win rate 0.55 and identical per-game outcomes gives `SE = 0`, while the per-arm formula would give ≈ 0.0144 (BR-S07.T02-02).
- [ ] `stats.spec.ts > delta and se match hand-computed values on a fixed 5-opponent fixture` and `> d takes only the five documented values` over 10,000 random `(r_cand, r_ref)` pairs (BR-S07.T02-01, -02).
- [ ] `stats.spec.ts > rho is 1 for identical arms and 0 for independent arms`, and `screen.spec.ts > the screening result carries a pooled rho` (BR-S07.T02-08).
- [ ] `synthetic.spec.ts > a +2-point swap passes screening` — 200 pairs per opponent, 12 opponents, 20 repeated draws at `ρ = 0.4`: the pass rate is at least 0.95, and the realised rate is printed and recorded.
- [ ] `synthetic.spec.ts > the measured null pass rate is reported` — a true `δ = 0` swap at tie fractions 0.3, 0.5 and 0.7, 200 draws each. The test **records the measured pass rate for each tie fraction** in the completion note and fails only if any rate exceeds 0.5. No fixed bound such as "≤ 20 %" is asserted, because `d` is discrete with an atom at zero and the realised rate is a function of the tie fraction (BR-S07.T02-03).
- [ ] `synthetic.spec.ts > a −2-point swap is dropped` — the pass rate is below 0.02 at `ρ = 0.4`, and the measured value is recorded.
- [ ] `screen.spec.ts > candidate and reference share seed_base for every opponent` and `> the candidate and reference pairings differ only in deck_a` — a field-by-field comparison of the two `Pairing` records (RN-83).
- [ ] `screen.spec.ts > screenSeedBase matches the shared RN-46 fixture vectors` (the same file `cargo test` and `pnpm --filter worker test` both read) and `> the screen salt never collides with the confirm or holdout salt for the same job and iteration` (BR-S07.T02-04).
- [ ] `screen.spec.ts > a candidate with Δ = SE exactly does not pass` and `> the reference arm is played once for twenty-four candidates` (BR-S07.T02-03, -05).
- [ ] `screen.spec.ts > 25 candidates is rejected with ScreenBudget naming the limit` and `> the total game count of one iteration is 60,000 on suite v6` (BR-S07.T02-06).
- [ ] `screen.spec.ts > an opponent list with an uncovered card fails before any pairing is built`; `policy.spec.ts > optimizer/screen.ts imports no authoring or llm module`; `pnpm lint` fails on a fixture writing `optimizer_candidates` from `screen.ts` (BR-S07.T02-07, -09).
- [ ] `screen.spec.ts > screening the reference list against itself yields Δ = 0, SE = 0 and pass = false` — the end-to-end check that the pairing is real, run against the real engine binary on one opponent at 200 pairs.
- [ ] One real screening iteration on suite v6 with the Dhelmise list and eight candidates completes, and the measured pooled `ρ`, the measured `SE` in points and the wall-clock are recorded in the completion note beside the model figures of the Context (≈ 1.4 points at `ρ = 0`, ≈ 1.1 at `ρ = 0.4`).

## Risks and open questions

- **Risk — the measured `ρ` is much lower than the model assumes.** Two 60-card lists differing by one card diverge quickly: the shared seed fixes the shuffle, but the first differing decision re-orders everything afterwards, so the correlation may be far below the 0.3–0.5 the confirmation power calculation needs. Mitigation: `ρ` is measured here and reported on every screening result, it is measured again from confirmation block 1 ([S07.T03](T03-sequential-confirmation.md)), and the power claim is conditional on it rather than assumed. If the measured `ρ` is near zero, the honest conclusion is that pairing buys nothing for this comparison and the sizes must grow — which the data will say rather than the design.
- **Risk — the threshold is read as a significance test.** `Δ − SE > 0` looks like a one-sigma test and someone will quote it as "84 % confidence". Mitigation: BR-S07.T02-03 states it is a threshold, the constant is named `SCREEN_K_SE` rather than `ALPHA`, the acceptance check measures the realised rate instead of asserting one, and [S07.T06](T06-web-optimizer-page.md) labels the screening column "triagem" and never prints a p-value.
- **Risk — selection on Δ biases every downstream number.** Ranking twenty-four candidates and forwarding the top few means the survivors' screening Δ is upward-biased, which is exactly the legacy's +4.6 → 0.0. Mitigation: nothing downstream reuses the screening Δ as an estimate. [S07.T03](T03-sequential-confirmation.md) re-measures on fresh seeds and [S07.T04](T04-holdout-acceptance-and-versioning.md) reports a third, unselected number; the screening Δ is displayed as provenance, with the confirmation and holdout values beside it.
- **Risk — `store_games: true` on every screening arm fills the database.** 60,000 rows per iteration, six iterations per run, several runs a week. Mitigation: no logs (`store_logs: false`), the retention sweep of [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) keeps aggregates and drops `games`, and the per-iteration cost is stated above so it is a budgeted decision rather than a surprise.
- **Risk — reusing the reference arm across candidates correlates the survivors.** Every candidate is compared against the same reference realisation, so an unusually lucky reference makes every Δ smaller together. Mitigation: it is the correct trade — re-running the reference per candidate would cost 24× more and would *not* remove the selection bias — and the consequence is a correlated set of survivors, which [S07.T03](T03-sequential-confirmation.md)'s fresh seeds break by construction. Stated here so the correlation is not mistaken for independence.
- **Question — should the screening threshold be `Δ − SE > 0` or `Δ > 0`?** The looser rule maximises recall and lets confirmation do all the filtering, at the cost of roughly twice the confirmation budget. Recommendation: keep `Δ − SE > 0` for the first real runs, record the measured survivor counts and null pass rates, and let the user choose after seeing what a real iteration produces — the constant is exported for exactly that.
- **DEPENDENCY-PROPOSAL: S07.T04 should add S07.T02 to its `Depends on`, completing the edge this file's `Unblocks` already declares, because** `optimizer/stats.ts` is this subtask's output and [S07.T04](T04-holdout-acceptance-and-versioning.md) BR-S07.T04-10 requires the holdout estimate to use `pairedDelta`/`pairedCi` rather than an estimator of its own. Until the reverse edge is added by hand, `Unblocks` of S07.T02 and the set of files depending on it disagree, which is docs-lint check 2.
- **Question — should screening use the strong bot rather than the planner?** A swap that only a rollout bot can exploit is invisible to a planner, and screening with the cheap bot may systematically miss it. Recommendation: keep the planner for screening and confirmation (the budget is what makes the method possible) and validate the final list with the rollout bot on holdout seeds, as [S07.T05](T05-optimize-job-orchestration.md) specifies; record any case where the holdout and confirmation disagree in sign, because that is the evidence that would change this answer.

## References

- `pokemon/scripts/deck_optimize.py` L66–69, L81, L90–93 — verified: `score(deck, games, salt)` building `seed0 = suite["seed0"] + sum(map(ord, salt))`, the reference scored once per iteration with salt `f"tri{it}"` and every candidate with the same salt, carrying the comment *"mesmas sementes da referência: comparação pareada"*, and the reported `Δ` computed as `sc - ref`, the difference of two aggregate win rates. Consult for the pairing, which is kept; note that no standard error is computed anywhere in the file.
- `pokemon/scripts/deck_optimize.py` L96–99 — verified: `sc, m, cand = max(results, key=lambda t: t[0])` followed by `if sc <= ref: continue`. Twenty-four differences, no uncertainty, take the maximum: the selection step that makes the screening number upward-biased and produced the +4.6 → 0.0 result.
- `pokemon/scripts/deck_optimize.py` L20–21 — verified: `if os.environ.get("PYTHONHASHSEED") != "0": return subprocess.call([sys.executable, *sys.argv], env={**os.environ, "PYTHONHASHSEED": "0"})`. The script re-executes itself before doing anything, which is what made the legacy's seeds reproducible **inside one process** and nowhere else.
- `pokemon/src/pokesearch/sim/optimizer.py` L387 — verified: `play_batch(..., seed0=seed0 + hash(o.deck_id) % 10000, ...)`. `o.deck_id` is a string, so `hash()` is salted per process; this is the concrete mechanism behind the previous reference and the reason RN-46 exists. Contrast `sim/progress.py` L88–90, `_seed(suite, *parts) = (suite["seed0"] + zlib.crc32("|".join(parts).encode())) % 1_000_000_007`, with its comment *"`hash()` de string muda a cada processo e não serve para régua"* — the formula this subtask uses through [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md).
- `pokemon/src/pokesearch/sim/optimizer.py` L399–406 (`_combine`) — verified: the weighted score `Σ w·p / Σ w` with the delta-method variance `Σ (w/Σw)² · p(1−p) / max(games − errors, 1)` and a `1.96·√var` half-width. This is the *unpaired* statistic of a single arm; it is what [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) and [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) own, and it is deliberately **not** the statistic used here. Consult it to see the shape `SE² = Σ w_o² · var/n` borrows, and note that the quantity inside is a per-arm binomial variance rather than a difference variance.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: three iterations at 50 games per opponent in screening and 250 in confirmation; the three finalists `-1 Night Stretcher / +1 Pokégear 3.0` (screened +4.6, confirmed 58.7 % against 58.7 %), `-1 Spiritomb / +1 Shaymin` (screened +3.4, confirmed 57.3 % against 59.5 %) and `-1 Spiritomb / +1 Night Stretcher` (screened +2.7, confirmed 59.6 % against 58.7 %); the final list unchanged at 56.9 % (CI 55.2–58.7). The paired re-measurement of the same three swaps that makes this a regression-to-the-mean result.
- `pokemon/ESPECIFICACAO.md` §4.7 RN-83 — verified: *"Duas peneiras: triagem barata e pareada (mesma semente para candidata e referência), depois confirmação da melhor com amostra grande e sementes novas, reavaliando também a lista atual"*. §4.4 RN-48 — verified: *"Diferença abaixo de ~3 pontos com 1200 partidas é ruído; mudança pequena se decide com `--games 250 --mirror 200`"*, the unpaired band the screening threshold is calibrated against. §5.3 — verified: *"3 iterações, 24 trocas na triagem, 3 finalistas, nenhuma confirmada"*.
- [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) (`seed_base`, `game_rng`/`bot_rng` stream separation, fingerprints, RN-46 and the superseded RN-47), [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) (the `Pairing` shape, `store_games`, the first-player alternation by game index), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) (who runs the pairings and writes `games`), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) (frozen opponents, weights, `seed0`, `matchupSeed`), [S07.T01](T01-candidate-pool-and-move-generation.md) (`Move`, `applyMove`, `assertListCovered`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
