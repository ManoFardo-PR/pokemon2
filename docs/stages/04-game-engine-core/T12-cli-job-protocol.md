# S04.T12 — CLI job protocol (JSON Lines)

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 12 / 18 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S04.T01](T01-engine-workspace-and-crates.md), [S04.T10](T10-termination-stall-and-determinism.md), [S04.T11](T11-baseline-bots-random-heuristic.md) |
| Unblocks | [S04.T15](T15-worker-job-runner.md), [S04.T18](T18-performance-baseline.md), [S06.T07](../06-bots/T07-bot-registry-and-freezing.md), [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md) |
| Parallel with | [S04.T13](T13-scenario-format-and-runner.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/jobs` placeholder + JSON Schema export — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `module` `ptcg-cli` crate + build hash — from [S04.T01](T01-engine-workspace-and-crates.md)
- `module` outcomes, RNG, fingerprint — from [S04.T10](T10-termination-stall-and-determinism.md)
- `module` bots — from [S04.T11](T11-baseline-bots-random-heuristic.md)

## Outputs (proposed)
- `contract` request line `{ type: 'job', id, contract_version, card_defs: CardDef[], programs: {}, pairings: [{ idx, deck_a: [{ def, count }], deck_b, bot_a: { name, params, seed }, bot_b, games, seed_base, weight?, label? }], options: { workers, store_games, store_logs, stall_turns: 12, max_steps: 3000, progress_every: 200 } }`; response lines `{ type: 'progress', pairing, done, total, w, l, t }`, `{ type: 'game', pairing, game_idx, seed, first, winner, reason, turns, duration_us, log? }` (optional), `{ type: 'result', pairing, games, wins, losses, ties, outcomes: { prizes, deck_out, no_pokemon, stall, step_limit }, avg_turns, invalid_actions, errors, fingerprint }`, `{ type: 'done', seconds }`, `{ type: 'error', message }`; job kinds `evaluate | scenarios | replay` — consumed by [S04.T15](T15-worker-job-runner.md), [S04.T18](T18-performance-baseline.md), [S06.T07](../06-bots/T07-bot-registry-and-freezing.md), [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)
- `module` `ptcg-cli` main loop: read stdin lines, run pairings on a `rayon` pool sized by `options.workers`, aggregate in game order, write stdout lines; `--version`

## Initial objective
The engine is a black box that reads one self-contained job and streams results, so the worker, tests and future WASM/host integrations all speak the same protocol.

## Context

This is where architecture principle 1 becomes an executable contract. The engine opens no database, reads no configuration file and resolves no card id against anything: a job line carries every `CardDef` it needs ([S04.T02](T02-card-definition-model.md)), every rule program it needs (empty in this stage, filled by [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md)), the pairings, the bots and the seeds. What comes back is lines. That is the whole interface, and it is deliberately narrow enough that the D-001b fallback — a TypeScript engine — can implement it without changing anything else in the tree.

The legacy had no such boundary. `pokemon/src/pokesearch/sim/runner.py` ran a `ProcessPoolExecutor` of up to eight processes, one task per game, each child re-registering the card catalogue before playing; results came back through `as_completed`, i.e. in whatever order the operating system finished them. Throughput was about 30 ms per game, 3,000 games in 133 s on 8 processes — 22 to 40 games per second. Here there is one process, a `rayon` pool of threads sharing the already-parsed `card_defs`, and results written into a pre-sized vector by game index, so completion order cannot influence anything ([S04.T10](T10-termination-stall-and-determinism.md) BR-S04.T10-06). The target of ≥ 5,000 games/s is measured in [S04.T18](T18-performance-baseline.md); the protocol's job here is to not get in the way of it, which mostly means not emitting a line per game unless asked.

Three decisions shape the protocol. **One job per process invocation, but the loop reads lines**: the CLI reads stdin until EOF, so a caller may send several job lines in sequence and reuse a warm process; the worker sends one and closes ([S04.T15](T15-worker-job-runner.md)). **Progress is coarse and cheap**: a `progress` line every `progress_every` games per pairing, not per game; the per-game `game` line exists only when `store_games` is set, and its `log` field only when `store_logs` is. **Version mismatches are loud**: an unknown `contract_version` major produces one `error` line and exit code 3, never a best-effort parse, because a silently misread job produces numbers that look fine.

The `fingerprint` field on each `result` line is the artifact RN-50 rests on and the thing [S04.T18](T18-performance-baseline.md) compares before and after an optimisation. It is computed over the games of the pairing in index order, so `--workers 1` and `--workers 16` must produce the same bytes — the acceptance check of this subtask and of the stage.

## Scope

- **In scope.** The JSON Lines request and response schemas in `@pokesearch/shared/jobs` with their exported JSON Schema and the `serde` mirror; the `ptcg-cli` main loop (stdin reader, job dispatcher, `rayon` pool, aggregator, stdout writer); the three job kinds `evaluate`, `scenarios`, `replay` and their dispatch; `--workers`, `--version`, `--bench` and the environment variables the CLI reads; exit codes; the flush and back-pressure discipline on stdout; the schema-conformance test between the zod schema and the `serde` structs; the 1-versus-16-worker fingerprint test at CLI level.
- **Out of scope.** The scenario format and its runner ([S04.T13](T13-scenario-format-and-runner.md)) — `scenarios` dispatches into it; the worker that spawns the process and persists the lines ([S04.T15](T15-worker-job-runner.md)); the `jobs` tables ([S04.T14](T14-jobs-schema-migration.md)); the bench numbers themselves ([S04.T18](T18-performance-baseline.md)) — `--bench` is defined here, measured there; bot registration and freezing ([S06.T07](../06-bots/T07-bot-registry-and-freezing.md)); the WASM host ([S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)), which implements the same message shapes over a different transport; the `programs` payload's contents ([S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It is the carrier of two rules owned elsewhere: RN-50's fingerprint ([S04.T10](T10-termination-stall-and-determinism.md)) and RN-21's `invalid_actions` count ([S04.T09](T09-prompt-protocol.md)), both of which appear on the `result` line.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S04.T12-01 | A job is self-contained: the CLI reads only stdin and its own arguments, opens no file, no socket and no database, and resolves no identifier against anything outside the job line. | `ptcg-cli/src/main.rs`; `ptcg-core` cannot do I/O at all ([S04.T01](T01-engine-workspace-and-crates.md) BR-S04.T01-01) | `cli.rs > a_job_runs_with_no_filesystem_access` (run with the working directory deleted); `policy.rs > cli_opens_no_database` (no driver in the dependency set) |
| BR-S04.T12-02 | Every message is one JSON object on one line, terminated by `\n`, with no embedded newline; stdout carries only protocol lines and stderr only diagnostics. | the writer serializes with `serde_json::to_writer` then writes `b"\n"`; `log` fields are base64 or escaped JSON | `cli.rs > every_stdout_line_parses_as_one_json_object` over a 2-pairing job; `> stderr_is_empty_on_success` |
| BR-S04.T12-03 | `contract_version` is checked before anything else: a major different from the CLI's produces exactly one `error` line naming both versions and exit code 3; a higher minor is accepted and unknown optional fields are ignored. | `main::handle_job` first statement; `#[serde(deny_unknown_fields)]` on required objects only | `cli.rs > unknown_major_version_errors_with_exit_3`; `> a_higher_minor_is_accepted`; `> an_unknown_optional_field_is_ignored` |
| BR-S04.T12-04 | Line order is fixed per pairing: zero or more `progress`, then zero or more `game` (only with `store_games`), then exactly one `result`; after all pairings, exactly one `done`. A pairing that fails emits one `error` line and no `result`. | the aggregator emits `result` only when every game of the pairing has been written | `cli.rs > line_order_per_pairing`; `> a_failing_pairing_emits_error_and_no_result`; `> exactly_one_done_line` |
| BR-S04.T12-05 | Results are aggregated by game index, never by completion order, and `fingerprint` is computed over that order; the same job produces byte-identical `result` lines at `--workers 1` and `--workers 16`. | a pre-sized `Vec<Option<GameOutcome>>` per pairing filled by index; `rng::pairing_fingerprint` ([S04.T10](T10-termination-stall-and-determinism.md)) | `cli.rs > fingerprint_equal_at_1_and_16_workers` (200 games × 2 pairings, byte comparison of the two `result` lines minus timing fields) |
| BR-S04.T12-06 | The `serde` structs and the zod schemas describe the same messages: field names, required sets and enum members match, verified by a test that compares the exported JSON Schemas rather than by convention. | `packages/shared/schema/jobs.json` generated from zod; `schemars`-free hand-written mirror plus the comparison test | `pnpm check` → `jobs-schema.spec.ts > rust and zod schemas agree`; `cargo test -p ptcg-cli schema_conformance` parses every fixture in `packages/shared/fixtures/jobs/` |
| BR-S04.T12-07 | `options` defaults are fixed and documented: `workers` = available parallelism, `store_games` = false, `store_logs` = false, `stall_turns` = 12, `max_steps` = 3000, `progress_every` = 200. A job that omits `options` runs with exactly these. | `#[serde(default)]` plus a `Default` impl; the values are also printed by `--help` | `cli.rs > defaults_match_the_documented_table` |
| BR-S04.T12-08 | Timing fields never influence a result: `duration_us` and `done.seconds` are reported but excluded from `fingerprint` and from every comparison the worker makes. | `pairing_fingerprint` hashes `(idx, winner, reason, turns, final_state_hash)` only | `cli.rs > fingerprint_ignores_timing` (two runs with different durations, identical fingerprints) |
| BR-S04.T12-09 | A panic in one game does not lose the job: the pairing's remaining games still run, the failed game is counted in `errors`, and the `result` line reports a non-zero `errors` with the message on stderr. With `panic = "abort"` ([S04.T01](T01-engine-workspace-and-crates.md) BR-S04.T01-08) a panic ends the process, so every foreseeable failure is an `EngineError` and a panic is a bug. | per-game `Result` handling; the `errors` counter on the `result` line | `cli.rs > a_game_returning_an_engine_error_is_counted_not_fatal`; `> errors_are_reported_on_stderr_not_stdout` |
| BR-S04.T12-10 | Exit codes are a contract: 0 success, 2 malformed input (unparseable line), 3 contract-version mismatch, 4 unknown job kind or unknown bot name, 5 an engine error that prevented any result. | `main`'s single exit point | `cli.rs > exit_codes_match_the_documented_table` (one case per code) |

## Data operations

The engine writes no table. The protocol messages below are the whole of its externally visible behaviour; every one is persisted by [S04.T15](T15-worker-job-runner.md).

| Direction | Message type | Fields | When |
|---|---|---|---|
| in (stdin) | `job` | `type`, `id`, `contract_version`, `kind` (`evaluate \| scenarios \| replay`), `card_defs: CardDef[]`, `programs: { [ProgramId]: Program }`, `pairings: Pairing[]`, `options: Options` | once per job; the CLI reads lines until EOF and may handle several |
| out (stdout) | `progress` | `type`, `pairing`, `done`, `total`, `w`, `l`, `t` | every `options.progress_every` completed games of a pairing, and once when the pairing's last game completes |
| out (stdout) | `game` | `type`, `pairing`, `game_idx`, `seed`, `first`, `winner`, `reason`, `turns`, `duration_us`, `log?` | per game, only when `options.store_games`; `log` only when `options.store_logs` |
| out (stdout) | `result` | `type`, `pairing`, `games`, `wins`, `losses`, `ties`, `outcomes: { prizes, deck_out, no_pokemon, stall, step_limit, concede }`, `avg_turns`, `invalid_actions`, `errors`, `fingerprint` | once per pairing, after its last game (BR-S04.T12-04) |
| out (stdout) | `scenario` | `type`, `id`, `ok`, `step?`, `expected?`, `actual?` | one per scenario, for `kind: scenarios` ([S04.T13](T13-scenario-format-and-runner.md)) |
| out (stdout) | `done` | `type`, `seconds`, `games`, `engine_build` | once, after every pairing has reported |
| out (stdout) | `error` | `type`, `message`, `pairing?`, `game_idx?` | on a job-level or pairing-level failure; no `result` follows for that pairing |
| out (stderr) | diagnostics | free text, `LOG_LEVEL`-gated | never part of the protocol (BR-S04.T12-02) |
| — | the database | — | never; the worker is the only writer ([S04.T15](T15-worker-job-runner.md)) |

## Interfaces

**Request line** (`@pokesearch/shared/jobs`, zod; the `serde` mirror has the same field names):

```ts
export const Bot = z.object({
  name: z.string(),                        // "random" | "heuristic" | … (S06.T07 adds more)
  params: z.record(z.unknown()).default({}),
  seed: z.number().int().nonnegative().optional(),   // overrides the derived bot stream
});

export const Pairing = z.object({
  idx: z.number().int().nonnegative(),
  deck_a: z.array(z.object({ def: z.number().int(), count: z.number().int().min(1) })),
  deck_b: z.array(z.object({ def: z.number().int(), count: z.number().int().min(1) })),
  bot_a: Bot, bot_b: Bot,
  games: z.number().int().min(1),
  seed_base: z.number().int().nonnegative(),
  weight: z.number().optional(),           // carried through, never used by the engine
  label: z.string().optional(),
});

export const Options = z.object({
  workers: z.number().int().min(1).optional(),      // default: available parallelism
  store_games: z.boolean().default(false),
  store_logs: z.boolean().default(false),
  stall_turns: z.number().int().min(1).default(12),
  max_steps: z.number().int().min(1).default(3000),
  progress_every: z.number().int().min(1).default(200),
  allow_concede: z.boolean().default(true),
});

export const JobRequest = z.object({
  type: z.literal("job"),
  id: z.string(),
  contract_version: z.number().int(),
  kind: z.enum(["evaluate", "scenarios", "replay"]),
  card_defs: z.array(CardDef),
  programs: z.record(Program).default({}),          // empty in S04; filled by S05.T07
  pairings: z.array(Pairing).default([]),
  scenarios: z.array(Scenario).default([]),         // kind: scenarios (S04.T13)
  replay: ReplayRequest.optional(),                 // kind: replay (S08.T04)
  options: Options.default({}),
});
export const JOBS_CONTRACT_VERSION = 1;
```

**Response lines** (discriminated on `type`):

```ts
export const Progress = z.object({ type: z.literal("progress"), pairing: z.number().int(),
  done: z.number().int(), total: z.number().int(), w: z.number().int(), l: z.number().int(), t: z.number().int() });

export const GameLine = z.object({ type: z.literal("game"), pairing: z.number().int(),
  game_idx: z.number().int(), seed: z.number().int(), first: z.number().int().min(0).max(1),
  winner: z.number().int().min(0).max(1).nullable(), reason: EndReason, turns: z.number().int(),
  duration_us: z.number().int(), log: z.string().optional() });   // log = base64 of deflated JSON Lines

export const ResultLine = z.object({ type: z.literal("result"), pairing: z.number().int(),
  games: z.number().int(), wins: z.number().int(), losses: z.number().int(), ties: z.number().int(),
  outcomes: z.object({ prizes: z.number().int(), deck_out: z.number().int(), no_pokemon: z.number().int(),
                       stall: z.number().int(), step_limit: z.number().int(), concede: z.number().int() }),
  avg_turns: z.number(), invalid_actions: z.number().int(), errors: z.number().int(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/) });

export const DoneLine  = z.object({ type: z.literal("done"), seconds: z.number(),
  games: z.number().int(), engine_build: z.string() });
export const ErrorLine = z.object({ type: z.literal("error"), message: z.string(),
  pairing: z.number().int().optional(), game_idx: z.number().int().optional() });
```

**`wins`/`losses` orientation.** Always from deck A's point of view. Which physical side deck A occupies alternates by game index — game `i` has deck A as the first player when `i` is even — so a pairing of `games` games is balanced for the first-player advantage, exactly as the legacy's `play_batch` did with `i % 2 == 0`.

**CLI.**

```text
ptcg-cli                      read JSON Lines jobs from stdin, write JSON Lines to stdout
  --workers <n>               override options.workers
  --bench [--games <n>]       run the built-in benchmark job (S04.T18) and print result + done
  --version                   { name, version, build_hash }           (S04.T01)
  --help                      usage, including the options default table
```

| Env var | Default | Effect |
|---|---|---|
| `LOG_LEVEL` | `info` | stderr verbosity; never affects stdout |
| `PTCG_WORKERS` | — | fallback for `options.workers` when neither the job nor `--workers` sets it |

| Exit | Meaning |
|---|---|
| 0 | every job line handled, `done` emitted |
| 2 | a stdin line did not parse as JSON, or is not a known message |
| 3 | `contract_version` major mismatch |
| 4 | unknown job kind, unknown bot name, or a `def` index outside `card_defs` |
| 5 | an engine error prevented any `result` |

**Throughput discipline.** stdout is wrapped in a `BufWriter` flushed after each line; with `store_games: false` a 3,000-game job emits roughly 15 progress lines plus one result line per pairing, so the protocol is not on the hot path. With `store_games: true` the per-game line costs roughly 150 bytes, which [S04.T18](T18-performance-baseline.md) measures as a separate configuration.

## Implementation steps

1. Write the zod schemas in `packages/shared/src/jobs/` and export their JSON Schema; add `JOBS_CONTRACT_VERSION` to `packages/shared/CONTRACTS.md`. `pnpm --filter @pokesearch/shared test` green.
2. Write the `serde` mirror in `ptcg-cli/src/protocol.rs` and the conformance test that parses every fixture in `packages/shared/fixtures/jobs/` (BR-S04.T12-06).
3. Implement the stdin reader and the `contract_version` check with its three cases and exit code 3 (BR-S04.T12-03, -10).
4. Implement `kind: evaluate` sequentially (`workers` ignored): build the `Game` per pairing per game index, run it to an `Outcome`, write into the pre-sized vector; emit `result` and `done`. Spec line order and the defaults table (BR-S04.T12-04, -07).
5. Add `progress` lines at `progress_every` and the final one; add `game` lines behind `store_games` with `duration_us`; spec that neither appears by default.
6. Add `fingerprint` from `rng::pairing_fingerprint` and spec `> fingerprint_ignores_timing` (BR-S04.T12-05, -08).
7. Introduce the `rayon` pool sized by `options.workers`, keeping the index-ordered write; run the acceptance comparison at `--workers 1` versus `--workers 16` (BR-S04.T12-05).
8. Add per-game error handling and the `errors` counter, plus the pairing-level `error` line; spec both (BR-S04.T12-09).
9. Add `kind: scenarios` dispatching into [S04.T13](T13-scenario-format-and-runner.md)'s runner and emitting `scenario` lines, and `kind: replay` as a stub returning an `error` line until [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md).
10. Add `--bench` (a built-in two-vanilla-deck job at fixed seeds) and `--help` with the defaults table; wire `pnpm engine:bench` ([S04.T18](T18-performance-baseline.md)).
11. Write `engine/PROTOCOL.md`: the message table, the field semantics, the exit codes, the orientation rule and the versioning policy; link it from `packages/shared/CONTRACTS.md`.

## Edge cases and error handling

- **A job whose deck has 59 cards** → `Game::new` returns `EngineError::DeckSize` (RN-10), every game of that pairing fails identically, and the CLI emits one `error` line for the pairing with the message `deck a has 59 cards; a game requires 60` and no `result`. It does not retry, and the other pairings still run.
- **A `def` index outside `card_defs`** → detected while expanding the deck lists, before any game starts; one `error` line and exit code 4. Validating up front means a malformed job fails in milliseconds instead of after thousands of games.
- **An unknown bot name** → exit code 4 with the name in the message. There is no fallback to random: a measurement attributed to the wrong bot is worse than a failed job (BR-S04.T11-09).
- **A malformed stdin line** → one `error` line and exit code 2; the CLI does not attempt to resynchronise, because a truncated line means the caller's writer is broken and continuing would interleave garbage.
- **`contract_version` higher minor** → accepted; unknown optional fields are ignored so an older engine can still run a newer worker's job when nothing essential changed. A higher *major* is refused (BR-S04.T12-03).
- **`workers` greater than the available parallelism** → `rayon` is sized to the requested number anyway; oversubscription costs throughput but changes no result, and [S04.T18](T18-performance-baseline.md) measures 1/8/16/22 to show where the curve flattens on this 22-thread machine.
- **stdout blocked because the consumer stopped reading** → the write blocks, back-pressure propagates and the engine slows down rather than buffering without bound. The worker reads continuously ([S04.T15](T15-worker-job-runner.md)); a consumer that stops is a bug there, and the process is killed by the worker's cancellation path.
- **A pairing with `games: 1`** → one game, no first-player balancing, and a `progress` line only at completion. Useful for `replay` and for scenario-like debugging; the imbalance is the caller's responsibility.
- **Several job lines on one stdin** → handled in order, each producing its own `done`. The worker sends one and closes stdin, but `--bench` and the tests reuse a warm process, which is also how [S04.T18](T18-performance-baseline.md) separates process startup from game time.
- **`store_logs` without `store_games`** → `store_logs` implies `store_games`; the CLI raises the flag and notes it on stderr rather than silently dropping the logs.

## Acceptance / verification

- [ ] End-to-end: a job with 2 pairings × 100 games emits, per pairing, `progress` lines at every 200 games plus one at completion and exactly one `result` with a 64-hex `fingerprint`, then exactly one `done`; `cargo test -p ptcg-cli cli::line_order_per_pairing` (BR-S04.T12-04).
- [ ] `cargo test -p ptcg-cli cli::fingerprint_equal_at_1_and_16_workers` — the same job run with `--workers 1` and with `--workers 16` produces byte-identical `result` lines after removing `duration_us` and `done.seconds` (BR-S04.T12-05, -08).
- [ ] Running the same job twice in two separate processes produces identical `fingerprint` values for every pairing (RN-50, verified again in [S04.T18](T18-performance-baseline.md)).
- [ ] `pnpm check` → `jobs-schema.spec.ts > rust and zod schemas agree`, and `cargo test -p ptcg-cli schema_conformance` parses every fixture under `packages/shared/fixtures/jobs/` (BR-S04.T12-06).
- [ ] `> unknown_major_version_errors_with_exit_3`, `> a_higher_minor_is_accepted`, `> an_unknown_optional_field_is_ignored` (BR-S04.T12-03).
- [ ] `> exit_codes_match_the_documented_table`: one case each for 0, 2, 3, 4 and 5 (BR-S04.T12-10).
- [ ] A malformed stdin line yields exactly one `error` line on stdout, a diagnostic on stderr and exit code 2; a job with a 59-card deck yields one `error` line for that pairing and a `result` for the other (BR-S04.T12-09).
- [ ] `> every_stdout_line_parses_as_one_json_object` over a 2-pairing job with `store_games: true`, and `> stderr_is_empty_on_success` (BR-S04.T12-02).
- [ ] `> defaults_match_the_documented_table`: a job with no `options` runs with `stall_turns = 12`, `max_steps = 3000`, `progress_every = 200`, `store_games = false`, `store_logs = false` (BR-S04.T12-07).
- [ ] `> a_job_runs_with_no_filesystem_access` and `policy.rs > cli_opens_no_database` (BR-S04.T12-01).

## Risks and open questions

- **Risk — the protocol grows into an API.** Every field added is a field the worker, the WASM host and the D-001b fallback must implement. Mitigation: `JOBS_CONTRACT_VERSION` plus the rule in `packages/shared/CONTRACTS.md` that a field is added only when a subtask needs it, and `engine/PROTOCOL.md` records why each one exists.
- **Risk — `store_games: true` dominates the measured throughput.** Serialising 150 bytes per game at 5,000 games/s is 750 KB/s, which is fine, but `store_logs` is orders of magnitude larger. Mitigation: logs are deflated and base64-encoded, `store_logs` is off by default, and [S04.T18](T18-performance-baseline.md) reports the three configurations separately.
- **Risk — a long job produces no output for minutes** and looks hung. Mitigation: `progress_every` defaults to 200 games per pairing, and the worker's own progress write is throttled to 500 ms ([S04.T15](T15-worker-job-runner.md)); the Evaluate page shows per-opponent bars ([S04.T17](T17-web-evaluate-page.md)).
- **Risk — the D-001b fallback diverges from the Rust implementation.** Mitigation: the fixtures in `packages/shared/fixtures/jobs/` and the schema-agreement test are language-neutral; a TypeScript engine passes the same conformance suite or it is not the same engine.
- **Question — should the CLI accept a job file path as well as stdin?** A path would simplify manual debugging but weakens BR-S04.T12-01. Recommendation: keep stdin only, and let debugging use `Get-Content job.json | ptcg-cli`; revisit if [S04.T18](T18-performance-baseline.md) finds process startup dominated by piping.
- **Question — should `weight` be removed from the pairing?** The engine carries it through without using it, which is a small honesty cost. Recommendation: keep it: it makes a `result` line self-describing for the worker and for a human reading a captured stream, and the alternative is a second lookup table.

## References

- `pokemon/src/pokesearch/sim/runner.py` — verified: `play_batch` using a `ProcessPoolExecutor` sized `min(cpu_count, 8)`, one task per game, tasks built as `(deck_a, deck_b, policy_a, policy_b, seed0 + i, i % 2 == 0)` so sides alternate by game index, and results collected with `as_completed`; `BatchResult` with `games/wins/losses/ties/errors/first_player_wins/turns_total/invalid_actions/seconds/reasons/outcomes` and `win_rate` counting ties as 0.5. Consult for the field set the `result` line mirrors and for the aggregation habit this protocol replaces.
- `pokemon/README.md` (L112–132) — verified: "~30 ms por partida", fast mode ≈ 40 games per opponent and long ≈ 200 in the background, and `scripts/sim_fingerprint.py` running fixed-seed games and printing a result hash so an optimisation can be accepted only with the same hash (RN-50).
- `pokemon/src/pokesearch/sim/engine_adapter.py` — verified: `GameResult { winner, reason, steps, turns, seconds, error, invalid_actions }`, the per-game shape the `game` line mirrors.
- [S01.T05](../01-foundation/T05-shared-contracts-package.md) — `CONTRACT_VERSION`, the zod→JSON Schema export and the rule that both sides of a boundary validate.
- [S04.T10](T10-termination-stall-and-determinism.md) — `pairing_fingerprint`, the index-order aggregation rule and the end-reason enum the `outcomes` object counts.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
