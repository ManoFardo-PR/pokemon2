# S04.T01 — Engine workspace and crates

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 1 / 18 |
| Depends on | [S01.T06](../01-foundation/T06-rust-toolchain-gate.md) |
| Unblocks | [S04.T02](T02-card-definition-model.md), [S04.T03](T03-game-state-model.md), [S04.T12](T12-cli-job-protocol.md) |
| Parallel with | [S04.T14](T14-jobs-schema-migration.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `file` `engine/Cargo.toml`, toolchain file, `.cargo/config.toml`, dependency policy — from [S01.T06](../01-foundation/T06-rust-toolchain-gate.md)
- `decision` D-001 confirmed — from [S01.T06](../01-foundation/T06-rust-toolchain-gate.md)
- `env` `CARGO_TARGET_DIR` = `$DATA_DIR/target`, `ENGINE_BIN` = `$CARGO_TARGET_DIR/release/ptcg-cli.exe` — from `project/03-architecture-overview.md`

## Outputs (proposed)
- `module` crate `ptcg-core` (library: no I/O, no threads, no global state; `#![forbid(unsafe_code)]`), crate `ptcg-cli` (binary: stdio, `rayon`), workspace-level `clippy`/`fmt` config — consumed by [S04.T02](T02-card-definition-model.md), [S04.T03](T03-game-state-model.md), [S04.T12](T12-cli-job-protocol.md)
- `contract` `ptcg-cli --version` prints `{ name, version, build_hash }` where `build_hash` = SHA-256 of the core crate sources embedded at build time (build script) — consumed by [S04.T12](T12-cli-job-protocol.md)
- `script` `pnpm engine:build` / `engine:test` wrappers setting `CARGO_TARGET_DIR`

## Initial objective
The engine has a clean two-crate shape whose core can be tested, fuzzed and later compiled to WASM, and every build is identifiable by a hash that measurements will record.

## Context

[S01.T06](../01-foundation/T06-rust-toolchain-gate.md) answers one question — can this machine build Rust at all, on the GNU host toolchain, with no MSVC and no C compiler — and leaves behind a hello-world workspace. This subtask turns that workspace into the shape seventeen further subtasks build inside, and it does so before any rule exists, because the boundaries are what make the rules cheap to write.

Two crates, not one. `ptcg-core` is a pure library: no file system, no clock, no threads, no process environment, no global mutable state, no randomness except the seeded generator carried inside the game state. That list is not style. It is exactly the set of things that would make a game non-reproducible on a second run or on a second thread, and it is the reason the same crate compiles to `wasm32-unknown-unknown` for [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md) without a shim. `ptcg-cli` owns everything impure: reading stdin, writing stdout, spawning the `rayon` pool, printing the version. The split is enforced by the dependency graph — `ptcg-core` cannot name `rayon` or `std::fs` — so a mistake is a compile error, not a code review comment.

The build hash matters more than it looks. RN-49 and RN-50 require every measurement to be attributable to the exact code that produced it, and [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) makes scenario evidence stale when the engine build changes. A version string like `0.1.0` does not do that: it stays constant across a hundred behaviour-changing commits. A build script that hashes the core crate's sources does, and it works whether or not the repository is a clean git checkout, which `git rev-parse` does not. `engine_build` is written into `jobs` ([S04.T14](T14-jobs-schema-migration.md)), into measurements ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)) and into evidence rows, so the hash is a contract, not a convenience.

The dependency policy inherited from D-001 is pure-Rust only: `serde`, `serde_json`, `rand_xoshiro`, `rayon` (cli only), `smallvec`, `indexmap`, `sha2`. Nothing else may enter without a decision-log entry, because a single transitive `cc`-building crate re-opens the toolchain question this stage exists to avoid. The legacy project is the cautionary tale here: its engine came from a third-party package that had to be kept alive with about ten monkeypatched functions (`pokemon/src/pokesearch/sim/status.py::install`), and every upstream change broke them. Here there is no upstream.

## Scope

- **In scope.** `engine/ptcg-core/` and `engine/ptcg-cli/` as workspace members with their `Cargo.toml`, lint configuration and release profile; the `build.rs` that computes and embeds `build_hash`; the public facade of `ptcg-core` (types and signatures that later subtasks fill in, compiling today with `todo!()` bodies or inert returns); the `--version` output; `pnpm engine:build`, `engine:test`, `engine:lint` wrappers that set `CARGO_TARGET_DIR` out of OneDrive; a workspace-level test that asserts the dependency policy; the `wasm32-unknown-unknown` check for `ptcg-core`.
- **Out of scope.** Any rule logic — state ([S04.T03](T03-game-state-model.md)), setup and turns ([S04.T04](T04-setup-and-turn-structure.md)), actions ([S04.T05](T05-actions-and-legality.md)), damage ([S04.T07](T07-damage-pipeline.md)); the job protocol and the `rayon` driver ([S04.T12](T12-cli-job-protocol.md)); the scenario runner ([S04.T13](T13-scenario-format-and-runner.md)); the IR crate module ([S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md)) — it lives inside `ptcg-core` but is authored in S05; the WASM packaging itself ([S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)); the CI wiring of `cargo clippy` into the repository quality gate ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)), which only has to call the scripts defined here.

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. Architecture principle 1 — the engine never touches the database — is first made structural here, by a crate that cannot express file access.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S04.T01-01 | `ptcg-core` performs no I/O: it does not depend on `std::fs`, `std::net`, `std::process`, `std::time`, `std::env` or any crate that does, and declares `#![forbid(unsafe_code)]`. | `engine/ptcg-core/src/lib.rs` inner attributes plus a `clippy.toml` `disallowed-types`/`disallowed-methods` list | `cargo clippy -p ptcg-core -- -D warnings`; `policy.rs > core_has_no_io_dependencies` walks `cargo metadata` for the crate's transitive set |
| BR-S04.T01-02 | `ptcg-core` holds no global mutable state: no `static mut`, no `lazy_static`/`OnceLock` cache of game data, no thread-local. Every cache lives inside `Game` or is rebuilt from its inputs. | code review checklist plus the disallowed-types list; `Game` owns the modifier index of [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) | `policy.rs > core_declares_no_statics` (source scan for `static mut`, `thread_local!`, `OnceLock`, `OnceCell`) |
| BR-S04.T01-03 | Only the approved dependency set appears in the workspace lockfile: `serde`, `serde_json`, `rand_xoshiro`, `rayon`, `smallvec`, `indexmap`, `sha2` and their pure-Rust transitives; no crate with a `build.rs` invoking a C compiler. | `engine/DEPENDENCIES.md` policy + `policy.rs` reading `cargo metadata --locked` | `cargo test -p ptcg-cli policy` → `policy.rs > dependency_allowlist` fails when a crate is added without amending the list |
| BR-S04.T01-04 | `ptcg-cli --version` prints a single JSON object `{ name, version, build_hash }` on stdout and exits 0; `build_hash` is 64 lowercase hex characters. | `main.rs` version branch; `build.rs` writes `PTCG_BUILD_HASH` | `version.rs > version_line_is_json_with_64_hex_hash` |
| BR-S04.T01-05 | `build_hash` changes when any `ptcg-core` source file changes and is stable otherwise: it is SHA-256 over the sorted list of `(relative path, file bytes)` under `ptcg-core/src/` plus `ptcg-core/Cargo.toml`. | `engine/ptcg-core/build.rs`, re-run via `cargo:rerun-if-changed` on the source directory | `version.rs > hash_is_stable_across_rebuilds`; manual acceptance: touch a byte in a core file, rebuild, hash differs |
| BR-S04.T01-06 | `ptcg-core` compiles for `wasm32-unknown-unknown` with `--no-default-features`; `ptcg-cli` is never built for WASM. | `[features]` split: `std` default in core, `rayon` only in the cli crate | `pnpm engine:check-wasm` → `cargo check -p ptcg-core --target wasm32-unknown-unknown --no-default-features` exits 0 |
| BR-S04.T01-07 | Build artifacts never land inside OneDrive: every engine script exports `CARGO_TARGET_DIR=$DATA_DIR/target` before calling `cargo`. | `scripts/engine.mjs` used by all three pnpm scripts | `pnpm engine:build` then asserting `engine/target/` does not exist and `$CARGO_TARGET_DIR/release/ptcg-cli.exe` does (D-005) |
| BR-S04.T01-08 | The release profile is fixed and recorded: `opt-level = 3`, `lto = "thin"`, `codegen-units = 1`, `panic = "abort"`, `debug = 1`; changing it requires re-running [S04.T18](T18-performance-baseline.md). | `[profile.release]` in `engine/Cargo.toml` | `policy.rs > release_profile_matches_documented_values` reads the manifest and compares against the table in `engine/README.md` |

## Data operations

This subtask writes no database row (architecture principle 1). It produces files and one command contract.

| Artifact | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| `engine/ptcg-core/` (crate) | create | developer | here | library only; no binary target; `#![forbid(unsafe_code)]` |
| `engine/ptcg-cli/` (crate) | create | developer | here | one binary target `ptcg-cli`; depends on `ptcg-core` by path |
| `engine/Cargo.toml` (workspace) | amend | developer | here and whenever a member is added | members list, shared `[workspace.dependencies]`, `[profile.release]`, `[workspace.lints]` |
| `engine/ptcg-core/build.rs` | create | developer | here | reads only its own crate sources; emits `PTCG_BUILD_HASH` and `cargo:rerun-if-changed` |
| `$CARGO_TARGET_DIR/release/ptcg-cli.exe` | build | `pnpm engine:build` | on demand, before any job run | path is the value of `ENGINE_BIN` used by [S04.T15](T15-worker-job-runner.md) |
| `ptcg-cli --version` (stdout) | read | worker, `pnpm engine:build`, [S04.T18](T18-performance-baseline.md) | before each job; after each build | one JSON line; the `build_hash` field is stored as `jobs.engine_build` ([S04.T14](T14-jobs-schema-migration.md)) |
| `engine/DEPENDENCIES.md` | create / amend | developer | here; on every new dependency | each entry names crate, version, licence and why a pure-Rust alternative was not preferred (feeds [S01.T09](../01-foundation/T09-licensing-and-notice.md)) |
| `engine/README.md` | amend | developer | here | gains the crate map, the profile table and the build-hash definition; [S04.T10](T10-termination-stall-and-determinism.md) appends the determinism rules |
| the database | — | engine | never | the engine opens no file at all; the job arrives on stdin ([S04.T12](T12-cli-job-protocol.md)) |

## Interfaces

**Workspace layout.**

```
engine/
  Cargo.toml              # [workspace] members = ["ptcg-core", "ptcg-cli"]
  rust-toolchain.toml     # from S01.T06: stable-x86_64-pc-windows-gnu
  .cargo/config.toml      # from S01.T06
  clippy.toml             # disallowed-types / disallowed-methods for the core crate
  DEPENDENCIES.md
  README.md
  ptcg-core/
    Cargo.toml
    build.rs
    src/lib.rs            # facade re-exports; #![forbid(unsafe_code)]
    src/{defs,state,setup,turn,actions,energy,damage,conditions,checkup,prompt,terminal,rng,bots,scenario}.rs
    tests/policy.rs
  ptcg-cli/
    Cargo.toml
    src/main.rs
    tests/version.rs
```

**`engine/Cargo.toml` (the parts that are contract, not taste).**

```toml
[workspace]
members = ["ptcg-core", "ptcg-cli"]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
rust-version = "1.80"

[workspace.dependencies]
serde        = { version = "1", features = ["derive"] }
serde_json   = "1"
rand_xoshiro = "0.6"
smallvec     = { version = "1", features = ["union", "const_generics"] }
indexmap     = "2"
sha2         = "0.10"
rayon        = "1"

[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
panic = "abort"
debug = 1            # keeps symbols for the profiler used in S04.T18
```

**`ptcg-core` facade** — the signatures later subtasks fill in. They compile today; bodies are `todo!()` or trivial.

```rust
#![forbid(unsafe_code)]

pub const CONTRACT_VERSION: u32 = 1;              // mirrors packages/shared CONTRACT_VERSION (S01.T05)
pub const BUILD_HASH: &str = env!("PTCG_BUILD_HASH");

pub use crate::defs::{CardDef, DefIdx};           // S04.T02
pub use crate::state::{Game, PlayerIdx, Slot, Zone};  // S04.T03
pub use crate::actions::Action;                   // S04.T05
pub use crate::prompt::{Answer, Prompt, Purpose}; // S04.T09
pub use crate::terminal::{EndReason, Outcome};    // S04.T10
pub use crate::bots::Bot;                         // S04.T11

impl Game {
    pub fn new(defs: &[CardDef], decks: [&[DefIdx]; 2], seed: u64) -> Result<Game, EngineError>;
    pub fn legal_actions(&self) -> &[Action];
    pub fn apply(&mut self, action: Action) -> Result<(), EngineError>;
    pub fn pending_prompt(&self) -> Option<&Prompt>;
    pub fn answer(&mut self, answer: Answer) -> Result<(), EngineError>;
    pub fn status(&self) -> Option<&Outcome>;
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub enum EngineError {
    DeckSize { player: u8, cards: u16 },          // RN-10, raised by S04.T04
    UnknownDef(DefIdx),
    IllegalAction { action: Action, reason: &'static str },
    InvalidAnswer { prompt_id: u32, reason: &'static str },
    ContractVersion { got: u32, expected: u32 },
}
```

**`build.rs`.** Walks `src/` recursively, sorts entries by relative path with `/` separators (so Windows and Linux agree), feeds `path.as_bytes()` then the file bytes into one `Sha256`, adds `Cargo.toml`, then emits `cargo:rustc-env=PTCG_BUILD_HASH=<hex>` and one `cargo:rerun-if-changed=` line per file plus the directory.

**CLI surface defined here** (the job loop belongs to [S04.T12](T12-cli-job-protocol.md)):

| Flag | Meaning | Exit code |
|---|---|---|
| `--version` | prints `{"name":"ptcg-cli","version":"0.1.0","build_hash":"<64 hex>"}` | 0 |
| `--help` | usage to stdout | 0 |
| anything else, today | `{"type":"error","message":"not implemented"}` on stdout | 4 |

**pnpm wrappers** (`package.json` at the repository root, implemented by `scripts/engine.mjs`):

| Script | Command | Notes |
|---|---|---|
| `pnpm engine:build` | `cargo build --release --locked` | sets `CARGO_TARGET_DIR`, then prints `ptcg-cli --version` |
| `pnpm engine:test` | `cargo test --locked` | debug profile; used by every later subtask's acceptance |
| `pnpm engine:lint` | `cargo fmt --check && cargo clippy --all-targets -- -D warnings` | called by `pnpm check` ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) |
| `pnpm engine:check-wasm` | `cargo check -p ptcg-core --target wasm32-unknown-unknown --no-default-features` | BR-S04.T01-06 |

## Implementation steps

1. Promote the [S01.T06](../01-foundation/T06-rust-toolchain-gate.md) workspace: add `ptcg-core` as a library member, move the hello binary into `ptcg-cli`, add `[workspace.dependencies]` and `[profile.release]`. `cargo test` green on two empty crates.
2. Add `#![forbid(unsafe_code)]`, the module files as empty `pub mod`s, and `clippy.toml` with the disallowed types/methods. `cargo clippy -- -D warnings` green.
3. Write `build.rs` and the `BUILD_HASH` constant; wire `--version` in `ptcg-cli`; add `version.rs` asserting the JSON shape and the 64-hex hash (BR-S04.T01-04, -05).
4. Write `tests/policy.rs`: dependency allowlist from `cargo metadata --locked`, the no-I/O transitive check, the statics source scan, and the release-profile comparison (BR-S04.T01-01, -02, -03, -08).
5. Declare the facade types and `impl Game` signatures with `todo!()` bodies and `#[allow(unused)]` where needed, so [S04.T02](T02-card-definition-model.md) and [S04.T03](T03-game-state-model.md) can start in parallel against real names.
6. Add the feature split (`default = ["std"]` in core, `rayon` only in cli) and `pnpm engine:check-wasm`; fix whatever the WASM check rejects now rather than in S08 (BR-S04.T01-06).
7. Write `scripts/engine.mjs` and the four pnpm scripts, exporting `CARGO_TARGET_DIR` from `DATA_DIR`; verify no `engine/target/` directory appears (BR-S04.T01-07).
8. Write `engine/DEPENDENCIES.md` (crate, version, licence, reason) and extend `engine/README.md` with the crate map, the profile table, the build-hash definition and the rule that `ENGINE_BIN` is the only path the worker knows.
9. Record the cold and warm `pnpm engine:build` times on this machine in `engine/README.md`, next to the [S01.T06](../01-foundation/T06-rust-toolchain-gate.md) gate measurement, so a future dependency addition shows its cost.

## Edge cases and error handling

- **`rustup` is missing or the GNU toolchain was removed** → `pnpm engine:build` exits 2 with the exact `rustup-init.exe --default-toolchain stable-x86_64-pc-windows-gnu` line from `engine/README.md`; the worker treats a missing `ENGINE_BIN` as a job error, never as an empty result ([S04.T15](T15-worker-job-runner.md)).
- **`$DATA_DIR` is unset** → the scripts refuse rather than defaulting to `engine/target`, because a Cargo target directory inside OneDrive produces multi-gigabyte sync churn and intermittent file-lock build failures (D-005).
- **A build with a dirty working tree** → `build_hash` is computed from the files on disk, so an uncommitted edit produces a different hash than the committed build. That is intended: measurements must not claim to come from a commit they do not. The commit id with a `+` suffix (RN-49) is recorded separately by [S06.T08](../06-bots/T08-measurement-score-and-mirror.md).
- **A file added under `src/` but not referenced by any `mod`** → still hashed, so the hash changes while behaviour does not. Accepted: a false "stale evidence" signal is safe, a false "still valid" signal is not.
- **`--version` run against a debug build** → prints the same JSON; the hash covers sources, not the profile. `engine/README.md` states that performance numbers are only comparable within one profile, and [S04.T18](T18-performance-baseline.md) records which one it used.
- **A dependency pulls in a `cc`-building transitive** → `policy.rs > dependency_allowlist` fails the build with the offending crate named; the fix is either a pure-Rust alternative or a decision-log entry amending D-001.
- **`rayon` accidentally imported into `ptcg-core`** → compile error, because the core manifest does not list it; this is the mechanism that keeps [S04.T12](T12-cli-job-protocol.md)'s parallelism outside the rules.
- **Two developers, two machines, one hash** → line-ending translation would change file bytes and therefore the hash. `.gitattributes` marks `engine/**` as `text eol=lf`, and `policy.rs` fails when a core source contains `\r\n`.

## Acceptance / verification

- [ ] `pnpm engine:build` exits 0 and produces `$CARGO_TARGET_DIR/release/ptcg-cli.exe`; `engine/target/` does not exist (BR-S04.T01-07).
- [ ] `ptcg-cli --version` prints one JSON line parsing to `{ name: "ptcg-cli", version, build_hash }` with a 64-character lowercase hex hash, exit code 0 (`cargo test -p ptcg-cli version_line_is_json_with_64_hex_hash`, BR-S04.T01-04).
- [ ] Appending a comment to `ptcg-core/src/state.rs`, rebuilding and re-running `--version` yields a different `build_hash`; rebuilding again without changes yields the same one (BR-S04.T01-05).
- [ ] `cargo test -p ptcg-cli policy` green: `dependency_allowlist`, `core_has_no_io_dependencies`, `core_declares_no_statics`, `release_profile_matches_documented_values` (BR-S04.T01-01, -02, -03, -08).
- [ ] `pnpm engine:lint` green: `cargo fmt --check` clean and `cargo clippy --all-targets -- -D warnings` with no output.
- [ ] `pnpm engine:check-wasm` exits 0 for `ptcg-core` on `wasm32-unknown-unknown` (BR-S04.T01-06).
- [ ] Adding `rayon` to `ptcg-core/Cargo.toml` makes `cargo test -p ptcg-cli policy` fail, and removing it makes it pass again — the allowlist is not decorative.
- [ ] `engine/DEPENDENCIES.md` lists all seven approved crates with version and licence, and `engine/README.md` contains the crate map, the release-profile table and the build-hash definition.

## Risks and open questions

- **Risk — the GNU toolchain links but a later dependency needs MSVC.** Mitigation: the allowlist test fails at the moment the dependency is added, long before a linker error; the escape is D-001b (TypeScript engine on the same contracts), which costs nothing extra here because all boundaries are JSON.
- **Risk — the `todo!()` facade rots.** A signature declared here and changed in [S04.T03](T03-game-state-model.md) breaks parallel work in [S04.T02](T02-card-definition-model.md). Mitigation: the facade is deliberately tiny (six methods plus five error variants) and every change to it is a change to this file's Interfaces section in the same commit.
- **Risk — `panic = "abort"` loses a per-game panic.** With abort, one malformed game kills the whole CLI process and the worker reports the job as `error`. Mitigation: game logic returns `Result` for every foreseeable failure, so a panic means a genuine bug; [S04.T12](T12-cli-job-protocol.md) decides whether to switch to `unwind` plus `catch_unwind` per game if fuzzing finds panics worth surviving — and records the decision, because the profile is fixed by BR-S04.T01-08.
- **Question — should `ptcg-core` expose a C ABI for a future host?** Recommendation: no, until [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md) says otherwise; WASM plus JSON covers the known consumers and a C ABI would force `unsafe`. Decided by the user when S08 starts.
- **Question — separate `ptcg-bots` crate?** Bots live in `ptcg-core::bots` today. If [S06.T06](../06-bots/T06-ismcts-bot.md) grows heavy dependencies, splitting is a mechanical move; deciding now would cost a crate boundary for no benefit. Revisit at [S06.T07](../06-bots/T07-bot-registry-and-freezing.md), when bot code hashes become a contract.

## References

- `pokemon/src/pokesearch/sim/status.py` — verified: `install()` and `_install_rule_fixes()` patch `ptcg.core.player`, `ptcg.core.reducer`, `ptcg.utils.utils` and `ptcg.utils.checker` at import time. Consult as the record of what depending on a third-party engine cost; nothing here is ported.
- [S01.T06](../01-foundation/T06-rust-toolchain-gate.md) — the toolchain file, `.cargo/config.toml` and the measured gate result this subtask builds on.
- [S01.T05](../01-foundation/T05-shared-contracts-package.md) — `CONTRACT_VERSION` and the exported JSON Schemas the `serde` structs of [S04.T12](T12-cli-job-protocol.md) must match.
- [Decision log](../../project/02-decision-log.md) D-001 (Rust, GNU target, pure-Rust dependencies, fallback D-001b) and D-005 (heavy artifacts outside OneDrive).
- [Architecture](../../project/03-architecture-overview.md) — the `engine/ptcg-core`, `engine/ptcg-cli`, `engine/ptcg-wasm` rows and principle 1.
- External: the Cargo book on workspaces, build scripts and `cargo:rerun-if-changed`; `rustup` documentation for the `x86_64-pc-windows-gnu` host toolchain.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
