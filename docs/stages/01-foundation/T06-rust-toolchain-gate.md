# S01.T06 — Rust toolchain gate

| Field | Value |
|---|---|
| Stage | S01 — Foundation |
| Status | TODO |
| Order in stage | 6 / 10 |
| Depends on | [S01.T01](T01-monorepo-skeleton.md) |
| Unblocks | [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md) |
| Parallel with | [S01.T02](T02-sqlite-database-client.md), [S01.T05](T05-shared-contracts-package.md), [S01.T09](T09-licensing-and-notice.md) |
| Gate | yes — fallback: TypeScript engine on `worker_threads` implementing the same contracts (JSON Lines job protocol, IR, scenarios); decision recorded as D-001b |
| Owner / Updated | — / — |

## Inputs (required)
- `env` `CARGO_TARGET_DIR` — from [S01.T01](T01-monorepo-skeleton.md)
- `decision` D-001 — Rust engine, GNU target — from `project/02-decision-log.md`
- `external` machine facts: no MSVC `cl.exe`/`link.exe`, no Windows SDK, no C compiler; 22 threads, 39 GB RAM
- `external` no `rustup` and no `gcc` are installed today — the gate starts from zero; git 2.52 and gh 2.83 are available for the build-identity string
- `file` repository path `…\OneDrive\AmbVir\VS Code\Trabalhos\pokemon2` — contains a space and sits in a synced folder, which is why `CARGO_TARGET_DIR` must be redirected before the first build

## Outputs (proposed)
- `file` `engine/Cargo.toml` (workspace), `engine/ptcg-cli/` hello binary using `rayon` + `serde_json`, `engine/rust-toolchain.toml` (`stable-x86_64-pc-windows-gnu`), `engine/.cargo/config.toml` — consumed by [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md); plus `engine/ptcg-core/`, the crate that must build for `wasm32-unknown-unknown`
- `decision` D-001 confirmed (or fallback D-001b) with measured build times — written to `project/02-decision-log.md`, including the evidence table below
- `doc` `engine/README.md` — install steps (`rustup-init.exe --default-toolchain stable-x86_64-pc-windows-gnu`, `rustup target add wasm32-unknown-unknown`) and the pure-Rust dependency policy

## Initial objective
Know within one working day whether Rust builds on this machine without MSVC: a release build of a hello CLI with `rayon` and `serde_json` on the GNU target, plus a `wasm32-unknown-unknown` build, both green — or switch the engine language before any engine subtask starts.

## Context

D-001 puts the engine and bots in Rust for a measured reason: the legacy simulator ran 22–40 complete games per second on a third-party Python engine kept alive by monkeypatches, while the optimizer needs 10–100× more games per candidate and lookahead bots need cheap state cloning. The target for the rewrite is ≥ 5,000 games/s with heuristic bots.

The risk is equally concrete: this machine has no MSVC `cl.exe`/`link.exe`, no Windows SDK and no C compiler, and Rust's default Windows toolchain is the MSVC one. The `x86_64-pc-windows-gnu` host ships its own MinGW linker, so in principle nothing else is needed and no administrator rights are involved. This gate converts "in principle" into a fact before twenty engine subtasks are scheduled on it.

The gate is cheap because the fallback is prepared. D-001b is a TypeScript engine on `worker_threads` implementing the same contracts from [S01.T05](T05-shared-contracts-package.md), so S04's file structure and every downstream subtask stay as written, with `packages/engine-ts` in place of the crates. What changes is throughput, and therefore which bots are practical: rollout and ISMCTS ([S06.T05](../06-bots/T05-rollout-bot.md), [S06.T06](../06-bots/T06-ismcts-bot.md)) become doubtful and [S04.T18](../04-game-engine-core/T18-performance-baseline.md) must re-baseline.

## Scope

- **In scope.** Installing rustup with the GNU host (no admin); adding the wasm target; the `engine/` workspace with two crates and a hello CLI exercising `rayon` and `serde_json`; the four checkpoints; the evidence record; `engine/README.md`; the decision-log entry (D-001 confirmed or D-001b adopted).
- **Out of scope.** Any game logic, state model, bot or scenario ([S04](../04-game-engine-core/README.md)); the real job protocol ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)); `engine/ptcg-wasm` as a product ([S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)) — only the wasm *build* is tested; benchmarks ([S04.T18](../04-game-engine-core/T18-performance-baseline.md)); wiring `cargo` into `pnpm check` ([S01.T10](T10-quality-gates-and-docs-lint.md) adds it once [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md) exists).

## Business rules

The traceability doc assigns no `RN-nn` here. This is the precondition for RN-46 (stable seeds), RN-47 (superseded: no hashing-order dependence in Rust game logic) and RN-50 (performance changes accepted only with an identical result hash); BR-S01.T06-07 is their first tiny instance.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T06-01 | The gate closes within one working day of hands-on time; at the end either D-001 is confirmed or D-001b is adopted. "Undecided" is not an allowed outcome. | the timebox below; the owner stops at the 7 h mark and writes the entry | a dated entry under D-001 (or a new D-001b) exists in the decision log |
| BR-S01.T06-02 | No S04 subtask starts before this file's status is `DONE`. | the `Unblocks` edge to [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md), mirrored by its `Depends on` | `pnpm docs:lint` checks 1–3; the stage README shows the gate |
| BR-S01.T06-03 | Every crate in `engine/`'s graph is pure Rust: no `*-sys` crate, no `cc`/`cmake` build script. | the allow-list in `engine/README.md`, reviewed at every dependency addition | `cargo tree --edges normal --prefix none` contains no `-sys` crate |
| BR-S01.T06-04 | No `target/` directory is created inside the repository; all build output goes to `$CARGO_TARGET_DIR` outside OneDrive. | `CARGO_TARGET_DIR` exported before the first `cargo` run; `engine/target/` in `.gitignore` as the net | after a full build, `engine/target` does not exist and `$CARGO_TARGET_DIR/release/ptcg-cli.exe` does |
| BR-S01.T06-05 | `ptcg-core` compiles for `wasm32-unknown-unknown`: no threading, no file or process I/O, no `SystemTime`, no OS randomness. `rayon` and stdio live only in `ptcg-cli`. | the crate boundary; the RNG is seeded explicitly (`rand_xoshiro`, no `getrandom`) | checkpoint C: `cargo build --target wasm32-unknown-unknown -p ptcg-core --release` |
| BR-S01.T06-06 | `ptcg-cli --version` prints a stable build identity (crate version + git commit hash) on one line; that string is the "engine build" every later measurement records. | a pure-Rust `build.rs` capturing the commit, or the commit passed as a build-time env var | checkpoint B: output matches `^ptcg-cli \d+\.\d+\.\d+ [0-9a-f]{7,40}( \+)?$` |
| BR-S01.T06-07 | The hello CLI's output is byte-identical for the same input at any thread count. | the reduction is order-independent and assembled in index order, not completion order | checkpoint B: three runs at `RAYON_NUM_THREADS=1` and three at `=22` produce identical stdout |

## Data operations

No database, no endpoint: the gate produces toolchain state, build artifacts and a decision.

| Artifact | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| rustup + `stable-x86_64-pc-windows-gnu` | install per-user (`%USERPROFILE%\.rustup`, `.cargo`) | developer | step 2 | no admin rights, no MSVC component |
| `wasm32-unknown-unknown` target | add | developer | step 3 | `rustup target add` |
| `engine/{rust-toolchain.toml,.cargo/config.toml,Cargo.toml,ptcg-core,ptcg-cli}` | create, commit | developer | step 4 | `Cargo.lock` committed (binary workspace) |
| `$CARGO_TARGET_DIR/**` | write | `cargo` | steps 5–8 | outside OneDrive and the repo; Defender exclusion if builds are slow |
| `$CARGO_TARGET_DIR/release/ptcg-cli.exe` | produce, run | `cargo`, developer | checkpoints A and B | the path `ENGINE_BIN` defaults to |
| `$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/*.wasm` | produce | `cargo` | checkpoint C | size recorded; not shipped anywhere yet |
| evidence table | append | developer | step 9 | written into the decision-log entry; numbers carry their source ("this machine, <date>") |
| `project/02-decision-log.md` | append a dated entry | developer | step 9 | append-only: D-001 confirmed, or D-001b added |
| `engine/README.md` | create | developer | step 9 | install steps, dependency policy, measured numbers, Defender/OneDrive notes |

## Interfaces

**Install (PowerShell, no admin).**

```powershell
Invoke-WebRequest https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-gnu/rustup-init.exe -OutFile $env:TEMP\rustup-init.exe
& $env:TEMP\rustup-init.exe -y --default-host x86_64-pc-windows-gnu --default-toolchain stable --profile default
rustup target add wasm32-unknown-unknown
rustc -Vv ; cargo -V ; rustup show
```

`rustup-init.exe --default-toolchain stable-x86_64-pc-windows-gnu` is the equivalent single-argument form; both select the GNU host, whose bundled MinGW linker replaces `link.exe`.

**`engine/rust-toolchain.toml`**: `channel = "stable-x86_64-pc-windows-gnu"`, `targets = ["x86_64-pc-windows-gnu", "wasm32-unknown-unknown"]`, `components = ["rustfmt", "clippy"]`, `profile = "minimal"`.

**`engine/.cargo/config.toml`**: no absolute paths (the file is committed); `[net] git-fetch-with-cli = true` so the installed git is used. The target directory comes from the `CARGO_TARGET_DIR` environment variable because it is machine-specific.

**`engine/Cargo.toml`**: `[workspace] members = ["ptcg-core", "ptcg-cli"]`; a `[workspace.package]` block (edition, `rust-version`, license left to open item O-1 in [S01.T09](T09-licensing-and-notice.md)); `[workspace.dependencies]` with the candidate crates `serde` (derive), `serde_json`, `rayon`, `rand_xoshiro`, `smallvec`, `indexmap`, `sha2`; `[profile.release]` with `lto = "thin"`, `codegen-units = 1`, `opt-level = 3`. `panic` stays at the default (`unwind`) so a later subtask can isolate a panicking game; changing it is [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md)'s call. Exact versions are whatever `Cargo.lock` resolves at gate time and are recorded in the evidence table rather than guessed here.

**Hello CLI.** Reads one JSON line from stdin, writes one to stdout: in `{"type":"ping","n":1000000,"seed":42}` → out `{"type":"pong","n":1000000,"sum":<u64>,"threads":<rayon threads>,"build":"<version hash>"}`. `sum` is a `rayon` parallel reduction over a seeded `rand_xoshiro` stream assembled in index order (BR-S01.T06-07). Flags: `--version`, `--bench` (repeat the reduction, print wall time), `--threads <n>` (default: available parallelism).

**Evidence to record** (one row each): `rustc -Vv` (version, host, LLVM), `cargo -V`, `rustup show`; cold release build time; incremental rebuild after touching one file; `ptcg-cli.exe` size; the `--version` string; wasm build time and `.wasm` size; observed rayon thread count; determinism result over six runs; `$CARGO_TARGET_DIR` path and Defender-exclusion state; disk used by toolchain plus target; every failure with its exact error text and the fix.

**Gate decision rule.** PASS = checkpoints A, B and C green inside the timebox → D-001 confirmed by a dated revision. FAIL = any still red at the 7 h mark → adopt D-001b, record it, and open the three follow-ups: [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md) creates `packages/engine-ts` instead of crates, [S04.T18](../04-game-engine-core/T18-performance-baseline.md) re-baselines throughput, [S06.T05](../06-bots/T05-rollout-bot.md)/[S06.T06](../06-bots/T06-ismcts-bot.md) are re-scoped. Installing the MSVC C++ workload plus the Windows SDK (several GB, admin) is **not** inside this timebox; it is a separate proposal to the user, made only if the GNU failure is specific and understood.

## Implementation steps

1. **(0:00–0:20) Preconditions.** Record `where cl`, `where link`, `where gcc` (expected: not found) as baseline evidence; confirm ≥ 10 GB free; resolve `CARGO_TARGET_DIR` and confirm it is outside OneDrive; add the Defender exclusion.
2. **(0:20–1:00) Install** rustup with the GNU host; record `rustc -Vv`, `cargo -V`, `rustup show`.
3. **(1:00–1:20) Add the wasm target**; confirm with `rustup target list --installed`.
4. **(1:20–2:00) Create the workspace**: the four config files, `ptcg-core` (pure library with the seeded reduction and one unit test), `ptcg-cli` (stdio + rayon + serde_json + `--version`). Commit.
5. **(2:00–3:00) Checkpoint A — native release build.** `cargo build --release -p ptcg-cli`; record cold time and binary size. This is the go/no-go on the linker question.
6. **(3:00–3:30) Checkpoint B — run.** Pipe the `ping` line; assert the `pong` shape, `threads >= 4`, byte-identical output over six runs, and the `--version` format.
7. **(3:30–4:30) Checkpoint C — wasm.** `cargo build --target wasm32-unknown-unknown -p ptcg-core --release`; record time and size. A failure here is usually a dependency pulling `getrandom` or `SystemTime`; fix by narrowing features, not by adding a shim.
8. **(4:30–5:00) Checkpoint D — hygiene.** `cargo test -p ptcg-core`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, incremental rebuild timing. Recorded, not part of pass/fail.
9. **(5:00–7:00) Troubleshooting reserve**, in order of likelihood: MinGW runtime not on `PATH`, a `-sys` dependency, Defender scanning `target/`, a path with a space breaking a build script, a proxy blocking crates.io (`cargo vendor` as the offline answer).
10. **(7:00–8:00) Decide and write.** Fill the evidence table, append the decision-log entry, write `engine/README.md`, set this file's status and the stage README row, and open the follow-ups if the gate failed.

## Edge cases and error handling

- **"linker `link.exe` not found"** → the MSVC toolchain was selected; `rustup show` confirms. Fix: `rustup default stable-x86_64-pc-windows-gnu`; the committed `rust-toolchain.toml` prevents a recurrence.
- **Missing `dlltool`/`ld` or a MinGW runtime DLL** → the bundled binaries are not on `PATH` for that shell. Fix: a fresh shell after install, or `rustup run stable-x86_64-pc-windows-gnu cargo …`. If it persists past 30 minutes it counts toward the timebox, not against the fallback.
- **A transitive `*-sys` dependency** → the build fails in its build script. Fix: `default-features = false` or drop the crate; the pure-Rust policy is a rule, not a preference (BR-S01.T06-03).
- **The wasm build fails on `getrandom`, `SystemTime` or threads** → those belong in `ptcg-cli`. Fix by moving code across the crate boundary or replacing the dependency; a browser shim is not the fix at this stage.
- **`CARGO_TARGET_DIR` unset or inside the repo/OneDrive** → hundreds of megabytes land in a synced folder. The env loader refuses the path (BR-S01.T01-01) and `.gitignore` catches a run with the variable unset.
- **Builds unexpectedly slow** (minutes for a hello binary) → Defender scanning object files. Add the exclusion, re-time, record both numbers.
- **The repository path contains a space** (verified) → quote every path in scripts; a dependency whose build script mishandles it is a reason to drop it.
- **`cargo` cannot reach crates.io** → `[net] git-fetch-with-cli = true` plus `cargo vendor` into `$DATA_DIR`; a network blocker pauses the gate, it does not fail it — record it as such.

## Acceptance / verification

- [ ] `cargo build --release` produces `ptcg-cli.exe`; running it with a JSON line echoes a JSON line using 4+ rayon threads (checkpoints A and B).
- [ ] `cargo build --target wasm32-unknown-unknown` succeeds for the core crate and the `.wasm` size is recorded (BR-S01.T06-05).
- [ ] Decision log entry with build times and toolchain versions — the full evidence table, dated, confirming D-001 or adopting D-001b (BR-S01.T06-01).
- [ ] `ptcg-cli --version` matches `^ptcg-cli \d+\.\d+\.\d+ [0-9a-f]{7,40}( \+)?$` (BR-S01.T06-06).
- [ ] Six runs of the `ping` line (3 at 1 thread, 3 at 22) produce byte-identical stdout (BR-S01.T06-07).
- [ ] After a full build, `engine/target` does not exist and `$CARGO_TARGET_DIR/release/ptcg-cli.exe` does (BR-S01.T06-04).
- [ ] `cargo tree --edges normal --prefix none` lists no `-sys` crate; `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` are clean (BR-S01.T06-03).
- [ ] `engine/README.md` holds the install commands, the dependency policy with the candidate list, the measured numbers and the Defender/OneDrive notes.
- [ ] This file's `Status` and the stage README row agree, so [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md) may start (BR-S01.T06-02).

## Risks and open questions

- **Risk — the GNU toolchain works for a hello binary but breaks on a real dependency in S04.** Mitigation: the allow-list is fixed here and every addition is reviewed; [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md) re-runs the four checkpoints after adding the real crates, which is cheap once the toolchain exists.
- **Risk — the fallback is adopted and the throughput target becomes unreachable**, undermining the optimizer's economics (the legacy failure: screening gains of +2.7…+4.6 pt fell to −2.2…+0.9 pt at confirmation, noise ≈ 3 pt at 1,200 games). Mitigation: D-001b explicitly re-baselines [S04.T18](../04-game-engine-core/T18-performance-baseline.md) and re-scopes the lookahead bots, so the statistics plan in [S07.T03](../07-deck-optimizer/T03-sequential-confirmation.md) works with fewer games and wider CIs as a documented trade.
- **Risk — OneDrive or Defender makes builds slow enough to discourage iteration.** Mitigation: exclusion plus `CARGO_TARGET_DIR`, both verified here rather than discovered in S04.
- **Question — MSVC as a second attempt before the fallback?** The user decides: several GB and admin rights. Recommendation: try it only if the GNU failure is specific and understood; the proposal, if made, is its own decision-log entry.
- **Question — keep the wasm build green from here on?** Recommendation: yes, as a cheap invariant added to `pnpm check` in [S01.T10](T10-quality-gates-and-docs-lint.md) once [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md) exists, so [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md) never faces a year of drift.

## References

- [Decision log](../../project/02-decision-log.md) D-001 (decision, alternatives, gate), the D-001b fallback, D-005 (artifacts outside OneDrive) — this subtask writes back into it.
- [Vision and scope](../../project/01-vision-and-scope.md) "Constraints that shaped the plan" and the throughput metric (legacy 22–40 games/s → target ≥ 5,000).
- [Legacy reference map](../../project/06-legacy-reference-map.md) "Legacy facts worth remembering" — ~30 ms/game, 3,000 games in 133 s on 8 processes; the numbers Rust is meant to beat.
- `pokemon/pyproject.toml` — verified: the `sim` extra depends on `ptcg-engine` pinned at commit `92c3cc4`, the third-party Python engine being replaced.
- External: the rustup book (Windows installation, host toolchains, `rust-toolchain.toml`), the Cargo book (`[workspace.dependencies]`, `CARGO_TARGET_DIR`, `[net] git-fetch-with-cli`, `cargo vendor`), `rayon` and `serde_json` documentation.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
