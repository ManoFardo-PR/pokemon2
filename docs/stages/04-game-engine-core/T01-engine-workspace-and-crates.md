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

## Outputs (proposed)
- `module` crate `ptcg-core` (library: no I/O, no threads, no global state; `#![forbid(unsafe_code)]`), crate `ptcg-cli` (binary: stdio, `rayon`), workspace-level `clippy`/`fmt` config — consumed by [S04.T02](T02-card-definition-model.md), [S04.T03](T03-game-state-model.md), [S04.T12](T12-cli-job-protocol.md)
- `contract` `ptcg-cli --version` prints `{ name, version, build_hash }` where `build_hash` = SHA-256 of the core crate sources embedded at build time (build script) — consumed by [S04.T12](T12-cli-job-protocol.md)
- `script` `pnpm engine:build` / `engine:test` wrappers setting `CARGO_TARGET_DIR`

## Initial objective
The engine has a clean two-crate shape whose core can be tested, fuzzed and later compiled to WASM, and every build is identifiable by a hash that measurements will record.

## Summary
- Only pure-Rust dependencies: `serde`, `serde_json`, `rand_xoshiro`, `rayon` (cli only), `smallvec`, `indexmap`, `sha2`.
- Core exposes `Game::new(defs, decks, seed)`, `legal_actions()`, `apply(action)`, `pending_prompt()`, `answer(prompt_answer)`, `status()` — filled by later subtasks.
- Not in scope: any rule logic.

## Acceptance / verification
- [ ] `cargo test` and `cargo clippy -- -D warnings` pass on the empty crates; `--version` hash changes when a core source file changes.

## Notes for the elaboration pass
- Legacy: the third-party `ptcg-engine` is not ported; the design borrows only the list of concepts in ESPECIFICACAO.md §4.2.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
