# S04.T18 — Performance baseline

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 18 / 18 |
| Depends on | [S04.T11](T11-baseline-bots-random-heuristic.md), [S04.T12](T12-cli-job-protocol.md) |
| Unblocks | — |
| Parallel with | [S04.T15](T15-worker-job-runner.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` heuristic bot — from [S04.T11](T11-baseline-bots-random-heuristic.md)
- `contract` CLI job protocol — from [S04.T12](T12-cli-job-protocol.md)
- `external` this machine: Windows 11, 22 hardware threads, 39 GB RAM — verified in the planning session
- `file` `pokemon/README.md` L112–132 — the legacy throughput and the fixed-seed fingerprint script; read-only reference

## Outputs (proposed)
- `file` `docs/PERF.md` — table of games/s and µs/game at 1, 8, 16, 22 workers for random×random and heuristic×heuristic on two vanilla decks; memory per game; method to reproduce (`pnpm engine:bench`)
- `script` `engine/ptcg-cli --bench` mode and `pnpm engine:bench`

## Initial objective
Speed is measured, not assumed: the number that decides how many games the optimizer can afford is recorded with its method, and regressions are visible.

## Context

Every number the rest of the project promises is bought with throughput. The optimizer screens a candidate list against the field, confirms the survivors on fresh seeds and measures the winner on holdout seeds ([S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md), [S07.T03](../07-deck-optimizer/T03-sequential-confirmation.md), [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)); lookahead bots play thousands of rollouts per decision ([S06.T05](../06-bots/T05-rollout-bot.md), [S06.T06](../06-bots/T06-ismcts-bot.md)). How many games per second the engine plays is therefore not a vanity metric — it is the budget those subtasks spend, and it has to be a measured number with a stated method rather than an assumption.

The legacy is the baseline to beat, and it is precise. `pokemon/README.md` records about 30 ms per game with the third-party Python engine, and the planning notes put a full run at 3,000 games in 133 s on 8 processes — 22 to 40 games per second depending on the deck pair. That is the number D-001 was argued against: the optimizer needs 10–100× more games per candidate than that allows, and a suite measurement is on the order of 465 thousand decisions. The target for this engine is ≥ 5,000 games/s with heuristic bots at 16 workers on this machine; if the measured figure is below 1,000, the right move is to profile before starting S05 rather than to build a rules layer on top of a slow core.

The legacy also got the *discipline* right, and it is carried over verbatim. `scripts/sim_fingerprint.py` ran fixed-seed games and printed a hash of the results together with the elapsed time, and RN-50 made that hash the acceptance condition for any optimisation: same hash, less time. The README records the payoff — one optimisation round took a game from 84 ms to 32 ms, the card-registry reload from 8.6 s to 1.6 s and the test suite from 198 s to 24 s, "com hash idêntico". Without that rule a performance change is indistinguishable from a rules change that happens to be faster.

So this subtask produces three things. A `--bench` mode in `ptcg-cli` that runs a fixed, self-contained job with fixed seeds and prints both the timing and the fingerprint. A `docs/PERF.md` file that records the numbers measured on this machine, with enough method that they can be reproduced and enough context that they can be read a year later. And a regression check: a later change that makes the engine slower by more than a stated margin, or that changes the fingerprint at all, fails visibly.

One thing this subtask deliberately does not do is optimise. It measures. If the target is missed, the finding and its profile go into `docs/PERF.md` and into a risk entry; the optimisation work that follows is a separate, hash-guarded exercise.

## Scope

- **In scope.** The `--bench` mode of `ptcg-cli` (its built-in job, its flags, its output format, its fingerprint); `pnpm engine:bench` and its arguments; the bench decks (two effect-less vanilla lists checked into `engine/fixtures/`); the measurement protocol (warm-up, repetitions, which figure is reported); the memory-per-game measurement; `docs/PERF.md` with its tables and its method section; the regression check and its threshold; the three configurations measured (`store_games` off, on, and with logs).
- **Out of scope.** Any optimisation of the engine itself — a change made in response to these numbers belongs to the subtask that owns the code; the fingerprint's definition and the determinism rules ([S04.T10](T10-termination-stall-and-determinism.md)); the job protocol ([S04.T12](T12-cli-job-protocol.md)) — `--bench` is a thin wrapper over it; the worker's own overhead ([S04.T15](T15-worker-job-runner.md)), which is measured separately once it exists; bot quality ([S04.T11](T11-baseline-bots-random-heuristic.md) records the win rate, this file records the speed); CI enforcement of the threshold ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md) decides whether `pnpm check` runs the bench at all).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-50 | **Kept.** A performance change is accepted only when the result hash is unchanged: `--bench` prints the `pairing_fingerprint` of every bench pairing, and a change whose fingerprint differs from the one recorded in `docs/PERF.md` is a behaviour change, not an optimisation, whatever it does to the timing. | `ptcg-cli --bench` printing `result` lines with `fingerprint` ([S04.T10](T10-termination-stall-and-determinism.md)); `pnpm engine:bench --check` comparing against the recorded values | `pnpm engine:bench --check` exits 0 on an unchanged build and exits 1 naming the pairing when a core rule is deliberately altered; `bench.rs > bench_fingerprints_match_the_recorded_values` |
| BR-S04.T18-01 | The bench is fully fixed: the same two decklists from `engine/fixtures/bench-decks.json`, the same `seed_base` per pairing, the same game count, the same bots, the same `stall_turns` and `max_steps`. Nothing about the workload varies between runs except `--workers` and the configuration under test. | the built-in job constructed by `--bench`; no environment input other than the flags | `bench.rs > the_bench_job_is_byte_identical_across_invocations` (the serialized request is hashed and compared) |
| BR-S04.T18-02 | A reported figure is the **median of five timed repetitions after one discarded warm-up**, not a single run and not the best run; the spread (min, max) is recorded next to it so a noisy measurement is visible. | `scripts/engine-bench.mjs`'s repetition loop | `engine-bench.spec.mjs > reports the median of five runs and the spread`; `docs/PERF.md` contains a min/max column |
| BR-S04.T18-03 | Every recorded figure carries its provenance: the `build_hash` from `ptcg-cli --version`, the commit (with `+` when the tree is dirty), the date, the machine description, the Rust toolchain version and the release profile. A figure without all six is not written to `docs/PERF.md`. | `scripts/engine-bench.mjs` collecting them before the first run and refusing to emit a table row otherwise | `engine-bench.spec.mjs > refuses to emit a row without a build hash`; review of `docs/PERF.md`'s header block |
| BR-S04.T18-04 | The regression check compares against the recorded median for the same configuration and the same worker count: a drop of more than `REGRESSION_PCT` (15 %) in games/s fails `pnpm engine:bench --check` with the two figures and the threshold named. A gain is never a failure. | `scripts/engine-bench.mjs --check` | `engine-bench.spec.mjs > a 20 % slowdown fails the check`; `> a 10 % slowdown passes`; `> a speed-up passes` |
| BR-S04.T18-05 | Timing measures game play, not process startup: the reported games/s uses the engine's own `done.seconds`, and process startup plus job parsing is reported separately as `startup_ms`. | `--bench` timing the pairing loop; the script timing the whole invocation and subtracting | `bench.rs > done_seconds_excludes_startup`; `docs/PERF.md` has a `startup_ms` row |
| BR-S04.T18-06 | Memory is measured, not estimated: peak resident set size of the bench process is recorded per worker count, and the derived "bytes per concurrent game" is stated as a derivation, not as a measurement. | `scripts/engine-bench.mjs` reading the process peak working set after each run | `engine-bench.spec.mjs > records a peak rss per run`; `docs/PERF.md` has a memory column with the derivation spelled out |
| BR-S04.T18-07 | The three storage configurations are measured separately and never averaged together: `store_games: false` (the measurement default), `store_games: true`, and `store_games + store_logs`. Each has its own row, because the third can be orders of magnitude slower. | the script's configuration matrix | `docs/PERF.md` has three configuration blocks; `engine-bench.spec.mjs > runs the three configurations` |
| BR-S04.T18-08 | `docs/PERF.md` is append-friendly history, not a single snapshot: every measurement session adds a dated block and no block is edited afterwards, so a regression is visible as a trend rather than discovered as a surprise. | the script appending a block with its date and build hash | review: the file contains at least the session written here; `engine-bench.spec.mjs > appends rather than overwrites` |

## Data operations

This subtask writes no database row and opens no database; the engine cannot (architecture principle 1, [S04.T12](T12-cli-job-protocol.md) BR-S04.T12-01). What it produces are artifacts.

| Artifact | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| `engine/fixtures/bench-decks.json` | create | developer | here | two 60-card effect-less lists plus the `CardDef`s they need, checked in; never edited after the first recorded session, because editing it invalidates every stored figure and fingerprint |
| `ptcg-cli --bench` | add mode | developer | here | builds the fixed job in memory; reads no file; emits the same `progress`/`result`/`done` lines as a normal job ([S04.T12](T12-cli-job-protocol.md)) |
| `scripts/engine-bench.mjs` | create | developer | here | drives `--bench` across the worker counts and configurations, does the warm-up, the five repetitions and the median, collects provenance, writes the block |
| `pnpm engine:bench` | add script | developer | here | wraps the above with `CARGO_TARGET_DIR` set ([S04.T01](T01-engine-workspace-and-crates.md) BR-S04.T01-07); accepts `--check`, `--games`, `--workers`, `--config`, `--json` |
| `docs/PERF.md` | create, then append | developer (`pnpm engine:bench`) | here; after every performance-relevant change | one dated block per session with the six provenance fields (BR-S04.T18-03); blocks are never edited (BR-S04.T18-08) |
| `docs/PERF.md` recorded fingerprints | read | `pnpm engine:bench --check` | on every check run | a mismatch fails with the pairing named (RN-50) |
| `docs/PERF.md` recorded medians | read | `pnpm engine:bench --check` | on every check run | a drop beyond 15 % fails (BR-S04.T18-04) |
| `engine/README.md` | amend | developer | here | gains a pointer to `docs/PERF.md` and the rule that the release profile is fixed by [S04.T01](T01-engine-workspace-and-crates.md) BR-S04.T01-08 |
| the database | — | engine, bench script | never | the bench is self-contained; no `DATABASE_PATH` is read |

## Interfaces

**`ptcg-cli --bench`.**

```text
ptcg-cli --bench [--games <n>] [--workers <n>] [--config <name>] [--seed0 <n>] [--json]

  --games    <n>       games per pairing                      default 2000
  --workers  <n>       rayon pool size                        default: available parallelism
  --config   <name>    plain | games | logs                   default plain
                         plain = store_games false, store_logs false
                         games = store_games true,  store_logs false
                         logs  = store_games true,  store_logs true
  --seed0    <n>       base seed for the two pairings         default 20260918
  --json               emit one summary object instead of the protocol lines
```

The built-in job has two pairings and is otherwise an ordinary `evaluate` job, so the bench measures the same code path a real run uses:

| Pairing | deck A | deck B | bot A | bot B |
|---|---|---|---|---|
| 0 | `bench-vanilla-a` | `bench-vanilla-b` | `random` | `random` |
| 1 | `bench-vanilla-a` | `bench-vanilla-b` | `heuristic` | `heuristic` |

`seed_base` per pairing is `rng::seed_base(seed0, ["bench", "a", "b", bot_a, bot_b])`, so it follows RN-46 like every other pairing and is stable across machines.

**Output.** Without `--json`, `--bench` emits the normal protocol lines ([S04.T12](T12-cli-job-protocol.md)) and nothing else, so a bench run is also an end-to-end protocol test. With `--json`, one object:

```jsonc
{
  "type": "bench",
  "build_hash": "…64 hex…",
  "workers": 16,
  "config": "plain",
  "games_per_pairing": 2000,
  "startup_ms": 41,                     // process start to the first game (BR-S04.T18-05)
  "pairings": [
    { "idx": 0, "bots": "random×random",       "games": 2000, "seconds": 0.212,
      "games_per_s": 9434.0, "us_per_game": 106.0, "avg_turns": 19.4,
      "fingerprint": "…64 hex…" },
    { "idx": 1, "bots": "heuristic×heuristic", "games": 2000, "seconds": 0.331,
      "games_per_s": 6042.3, "us_per_game": 165.5, "avg_turns": 23.1,
      "fingerprint": "…64 hex…" }
  ],
  "total_seconds": 0.543
}
```

**`pnpm engine:bench`.**

```text
pnpm engine:bench [--check] [--games <n>] [--workers 1,8,16,22] [--config plain,games,logs] [--json]

  (no flag)   run the matrix, print a table, append a dated block to docs/PERF.md
  --check     run the matrix, compare fingerprints and medians against the newest recorded
              block for the same configuration; exit 0 on pass, 1 on a fingerprint mismatch
              or a >15 % slowdown, 2 when no baseline block exists
```

Protocol per cell: one warm-up run (discarded), then five timed runs; the reported figure is the median games/s with the min and max recorded (BR-S04.T18-02). Peak working-set bytes are read after each run and the maximum kept (BR-S04.T18-06).

**`docs/PERF.md` layout.**

```markdown
# Engine performance

How to reproduce: `pnpm engine:bench` (matrix), `pnpm engine:bench --check` (regression gate).
Method: one discarded warm-up, five timed repetitions, median reported with min/max.
Figures use the engine's own `done.seconds`; process startup is the separate `startup_ms` row.

## 2026-__-__ — build `<build_hash>` — commit `<sha>[+]`

| Field | Value |
|---|---|
| Machine | Windows 11, 22 hardware threads, 39 GB RAM |
| Toolchain | rustc <version>, stable-x86_64-pc-windows-gnu |
| Profile | release: opt-level 3, lto thin, codegen-units 1, panic abort |
| Games per pairing | 2000 |
| Startup | <n> ms |

### Configuration `plain` (store_games off)

| Workers | random×random games/s | µs/game | heuristic×heuristic games/s | µs/game | min–max (heur.) | peak RSS |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 8 | | | | | | |
| 16 | | | | | | |
| 22 | | | | | | |

### Configuration `games` (store_games on) — same table
### Configuration `logs` (store_games + store_logs) — same table

### Fingerprints (RN-50)

| Pairing | bots | fingerprint |
|---|---|---|
| 0 | random×random | `<64 hex>` |
| 1 | heuristic×heuristic | `<64 hex>` |

### Comparison

| | games/s |
|---|---|
| Legacy Python engine (8 processes) | 22–40 |
| This build, heuristic×heuristic, 16 workers | <n> |
| Target | ≥ 5,000 |

### Notes
<what changed since the previous block; any anomaly; the profile if the target was missed>
```

**Derived numbers stated as derivations, not measurements:** "bytes per concurrent game" is `peak RSS / workers`, and "games a 1,200-game suite costs" is `1200 × opponents / games_per_s`. Both are labelled as arithmetic over the measured figures (BR-S04.T18-06).

## Implementation steps

1. Build the two vanilla decklists and their `CardDef`s into `engine/fixtures/bench-decks.json`, using only effect-less printings so the bench stays valid before S05 exists; check the file in and note in its header that it must not be edited after the first recorded session (BR-S04.T18-01).
2. Add `--bench` to `ptcg-cli`, constructing the two-pairing job in memory and running it through the ordinary job path; `cargo test -p ptcg-cli bench` green on a small `--games 20` run.
3. Add `startup_ms` (process start to the first game) and the `--json` summary; spec `> done_seconds_excludes_startup` (BR-S04.T18-05).
4. Add `bench.rs > the_bench_job_is_byte_identical_across_invocations`, hashing the serialized request (BR-S04.T18-01).
5. Write `scripts/engine-bench.mjs`: the worker-count × configuration matrix, the warm-up, the five repetitions, the median and spread, the peak-RSS read and the provenance collection; spec the median, the spread and the provenance refusal (BR-S04.T18-02, -03, -06, -07).
6. Add the `docs/PERF.md` writer that appends a dated block and never edits an existing one; spec `> appends rather than overwrites` (BR-S04.T18-08).
7. Add `--check`: read the newest block for each configuration, compare fingerprints first and medians second, exit 0/1/2 with a message naming the pairing or the cell; spec the three threshold cases (RN-50, BR-S04.T18-04).
8. Wire `pnpm engine:bench` with `CARGO_TARGET_DIR` set, and add a one-line pointer from `engine/README.md`.
9. Run the full matrix on this machine at 1, 8, 16 and 22 workers for all three configurations, and write the first dated block with the real numbers.
10. Fill the comparison table with the legacy baseline (22–40 games/s, ~30 ms per game) and the target (≥ 5,000 at 16 workers), and write the Notes section — including, if the target is missed, a `cargo flamegraph`-style profile summary and a risk entry rather than a silent number.
11. Re-run `pnpm engine:bench --check` immediately after writing the block and confirm it exits 0, so the gate is known to work before anyone depends on it.

## Edge cases and error handling

- **Thermal throttling between runs.** A laptop that heats up over a five-repetition loop reports a falling curve, and the median hides it. The script records min and max per cell (BR-S04.T18-02) and the writer emits a warning in the Notes when max/min exceeds 1.3; the fix is to re-run on a cool machine, not to take the best figure.
- **A bench run on a machine with fewer cores** than the requested worker count. `rayon` oversubscribes happily, so the run still produces a valid fingerprint but a meaningless throughput for that cell. The script records `availableParallelism()` in the block header, and `--check` refuses to compare a cell whose worker count exceeds the current machine's parallelism, exiting 2 with "no comparable baseline" rather than reporting a false regression.
- **The fingerprint changes because a bot changed, not the engine.** The bench includes a `heuristic×heuristic` pairing, so editing `HeuristicBot` legitimately changes pairing 1's fingerprint while pairing 0 (`random×random`) stays fixed. `--check` reports which pairing moved, and the rule is explicit: a fingerprint change in pairing 0 means the rules changed; a change only in pairing 1 means the heuristic changed, which is a bot change that [S06.T07](../06-bots/T07-bot-registry-and-freezing.md) governs (RN-37) and which requires a new recorded block with the reason in Notes.
- **A run interrupted mid-pairing** (Ctrl-C, a closed terminal, the machine sleeping). The engine emits no `done` line, the script discards that repetition entirely rather than extrapolating from a partial `progress` count, and if fewer than five timed runs survive, no block is written and the script exits 2. A partial measurement is worse than none.
- **Memory growth across a long run.** Peak RSS is read after every repetition; if the peak of repetition five exceeds repetition one by more than 20 %, the script records "possible growth" in the Notes and the figure is not used as a per-game derivation. The likely causes are the `games` buffer or the event log, both of which are bounded by design ([S04.T15](T15-worker-job-runner.md) BR-S04.T15-09, [S04.T03](T03-game-state-model.md) BR-S04.T03-08), so the observation is a bug report, not a tuning knob.
- **`--config logs` producing gigabytes of stdout.** At 2,000 games with logs the output is tens of megabytes per pairing; the script pipes it to a counting sink rather than to a file or to memory, so the configuration measures the engine's serialisation cost without also measuring the disk's.
- **`ENGINE_BIN` pointing at a debug build.** A debug binary is roughly an order of magnitude slower and would be recorded as a catastrophic regression. The script reads `--version` and refuses to write a block unless the binary was produced by `pnpm engine:build` (release), exiting 2 with the reason.
- **The target is missed.** The script still writes the block with the real numbers; the miss is recorded in Notes with a profile summary, and a risk entry says whether S05 proceeds. The rule from the stage objective stands: below 1,000 games/s, profile before continuing.
- **No baseline block exists yet** (the first `--check` on a fresh clone). Exit 2 with "no baseline for configuration X at N workers", not exit 0 — an absent baseline must not read as a pass.
- **Two blocks on the same day from different builds.** Both are appended; the block header carries the build hash, and `--check` uses the newest block whose configuration matches, so same-day iteration works without editing history (BR-S04.T18-08).

## Acceptance / verification

- [ ] `pnpm engine:bench` runs the full matrix (1, 8, 16, 22 workers × `plain`, `games`, `logs`) on this machine and appends one dated block to `docs/PERF.md` with all six provenance fields populated (BR-S04.T18-03, -07, -08).
- [ ] `docs/PERF.md` records **≥ 5,000 games/s for `heuristic×heuristic` at 16 workers, configuration `plain`**; if it does not, the block carries a profile summary in Notes and a risk entry, and the figure is still recorded as measured.
- [ ] The comparison table in `docs/PERF.md` shows the legacy baseline of **22–40 games/s** (~30 ms per game, 3,000 games in 133 s on 8 processes) next to this build's figure, so the speed-up factor is explicit.
- [ ] `pnpm engine:bench --check` immediately after writing the block exits 0; running it against a deliberately slowed build (a `std::hint::black_box` loop inserted in the game loop) exits 1 naming the cell and the two figures (BR-S04.T18-04).
- [ ] `pnpm engine:bench --check` against a build with a deliberately altered damage constant exits 1 naming pairing 0's fingerprint mismatch, and the message distinguishes a fingerprint failure from a timing failure (RN-50).
- [ ] `cargo test -p ptcg-cli bench::the_bench_job_is_byte_identical_across_invocations` — the serialized bench request hashes to the same value across ten invocations (BR-S04.T18-01).
- [ ] `cargo test -p ptcg-cli bench::done_seconds_excludes_startup` — `done.seconds` is smaller than the wall-clock invocation time by at least the measured `startup_ms` (BR-S04.T18-05).
- [ ] `node --test scripts/engine-bench.spec.mjs` green: `> reports the median of five runs and the spread`, `> refuses to emit a row without a build hash`, `> a 20 % slowdown fails the check`, `> a 10 % slowdown passes`, `> records a peak rss per run`, `> appends rather than overwrites` (BR-S04.T18-02, -03, -04, -06, -08).
- [ ] `pnpm engine:bench --check` on a fresh clone with no baseline exits 2 with "no baseline", not 0.
- [ ] Running `ptcg-cli --bench --games 200 --workers 1` and `--workers 16` produces identical `fingerprint` values for both pairings — the same determinism property the stage exit criteria assert ([S04.T10](T10-termination-stall-and-determinism.md), [S04.T12](T12-cli-job-protocol.md)).

## Risks and open questions

- **Risk — the target is missed and S05 starts anyway.** A slow core makes the optimizer's budget unaffordable, and the cost compounds through S06 and S07. Mitigation: the stage objective already states the rule (below 1,000 games/s, profile before continuing to S05), the miss is recorded in `docs/PERF.md` Notes rather than in someone's memory, and the profile summary points at the hot path so the follow-up work is scoped.
- **Risk — the bench becomes unrepresentative.** Two effect-less vanilla decks are not what the optimizer will actually run once S05 gives cards their effects and programs execute on every attack. Mitigation: the bench decks are frozen so the historical series stays comparable, and [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) adds a second, realistic bench configuration when real programs exist — as a new block, not as an edit to this one.
- **Risk — the 15 % regression threshold is either noisy or lax.** Five repetitions on a busy desktop can spread more than that; a genuine 10 % regression would pass. Mitigation: the min/max column makes the noise visible, and the threshold is a named constant in the script that is revised once the first few sessions show the real variance — with the revision recorded in `docs/PERF.md`.
- **Risk — nobody runs the check.** A gate that is only run by hand is run when it is already too late. Mitigation: `pnpm engine:bench --check` is cheap at `--games 200` and is offered to [S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md) as an opt-in step of `pnpm check`; the decision on whether it runs by default belongs there, because a machine-dependent timing gate in a shared check has its own costs.
- **Question — should `--bench` also measure the worker's end-to-end overhead** (spawn, JSON parse, database writes)? That is the number that decides how long a real evaluation takes, and it is not the engine's. Recommendation: measure it separately in [S04.T15](T15-worker-job-runner.md)'s own acceptance once the worker exists, and record it as a second table in `docs/PERF.md`; keeping the two apart is what makes an engine regression attributable.
- **Question — which figure does the Evaluate page's time estimate read?** [S04.T17](T17-web-evaluate-page.md) shows an estimate derived from the recorded throughput, and the honest source is the `heuristic×heuristic`, `plain`, 16-worker cell of the newest block. Recommendation: pin that cell explicitly and have the page show "—" when no block exists, so the estimate never comes from a guess.

## References

- `pokemon/README.md` L112–132 — verified: "bots heurísticos (`sim/policies.py`), lotes em paralelo (`sim/runner.py`), ~30 ms por partida"; fast mode ≈ 40 games per opponent and long ≈ 200 in the background; `scripts/sim_fingerprint.py` running fixed-seed games and printing the result hash plus the time, "é o que permite otimizar sem mudar o jogo (mesmo hash, tempo menor)", with `PYTHONHASHSEED=0` required because enum sets iterate in a per-process order; and the recorded optimisation round that took a game from 84 ms to 32 ms, the card-registry reload from 8.6 s to 1.6 s and the test suite from 198 s to 24 s "com hash idêntico". This is RN-50's legacy form and the discipline `--bench` reproduces.
- `pokemon/src/pokesearch/sim/runner.py` — verified: `play_batch` using a `ProcessPoolExecutor` sized `min(cpu_count, 8)` with one task per game, the shape behind the 22–40 games/s figure.
- `pokemon/ESPECIFICACAO.md` §4.4 RN-50 — verified: "Otimização de desempenho só é aceita com **hash de resultados idêntico**".
- [S04.T10](T10-termination-stall-and-determinism.md) — `pairing_fingerprint` and the index-order aggregation rule the bench's fingerprints depend on.
- [S04.T12](T12-cli-job-protocol.md) — the job the bench builds, the `result`/`done` lines it reads, and the `--bench` flag declared there.
- [S04.T01](T01-engine-workspace-and-crates.md) — the fixed release profile (BR-S04.T01-08), `CARGO_TARGET_DIR` and `ptcg-cli --version`, the source of the build hash every block records.
- [Vision and scope](../../project/01-vision-and-scope.md) — the throughput metric row (legacy 22–40, target ≥ 5,000 measured in S04.T18) and the machine description.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
