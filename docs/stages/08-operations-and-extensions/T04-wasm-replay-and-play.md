# S08.T04 — WASM replay and play

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 4 / 6 |
| Depends on | [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md), [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T03](T03-hosted-postgres-migration-path.md), [S08.T05](T05-twinleaf-differential-oracle.md), [S08.T06](T06-llm-assisted-authoring.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` job kind `replay` and event log format — from [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)
- `table` `games` with `log_blob` — from [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)
- `external` `wasm-bindgen` and `wasm-pack` against the `wasm32-unknown-unknown` target installed by the Rust toolchain gate, with pure-Rust dependencies only (D-001)
- `decision` D-001 (Rust engine, `wasm32-unknown-unknown` among its targets) and its D-001b fallback — from `project/02-decision-log.md`

## Outputs (proposed)
- `module` crate `ptcg-wasm` (wasm-bindgen over `ptcg-core`): `replay(log) → states[]`, `Session::new(defs, decks, seed)` for interactive play vs a bot in the browser; web routes `/games/:id/replay` (board view, step through turns, show prompts and answers) and `/play` (human vs bot)
- `contract` `engine/LOG.md` — the event-log format stored in `games.log_blob` and carried by the protocol's `game.log` field: deflated JSON Lines of a decision stream with per-turn state checkpoints, its header, its event vocabulary and its versioning rule
- `contract` `GET /api/games/:jobId/:pairingIdx/:gameIdx/log` — the one endpoint the replay page needs, serving the stored blob with its provenance
- `module` `apps/web/src/engine/` — the loader that instantiates the WASM module once, the board renderer shared by both routes, and the `CardImage`-based card layer

## Initial objective
Watching a stored game and playing against the bot in the browser, using the exact engine that produced the numbers — the best way to audit rules and bot behaviour.

## Context

Everything before this stage produces numbers. A score with a confidence interval says a deck won 54 % of the time; it does not say why, and it cannot tell the difference between a bot that plays well and a rule that is implemented wrong in a way that happens to favour one side. The only cheap way to find out is to watch a game. That is what this subtask is for, and it is why the engine was written as a pure library with no I/O from the start ([S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md)): the same `ptcg-core` that `ptcg-cli` links compiles to `wasm32-unknown-unknown` and runs in a tab. D-001 lists that target beside the native one, and the toolchain gate already builds it, so nothing new has to be proven about the toolchain here.

Two products come out of one crate. **Replay** takes a stored game and walks it: board state, turn by turn, with every prompt and every answer visible. **Play** puts a human on one side of a fresh game against a registered bot, which is the fastest way to discover that a card does nothing, that the bot never retreats, or that a prompt offers a choice it should not. Both use the engine that produced the numbers, not a re-implementation, which is the whole point — a JavaScript board simulator would be a fourth notion of "correct", and this project has spent S05 removing the third.

The format question is the one that decides everything else. [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) put `log_blob BLOB` on `games` and deliberately left its contents to this subtask; [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) carries the same bytes base64-encoded in the `game` line's `log` field. A **thick** log — every state after every action — replays without an engine but costs megabytes per game and pins the replay to whatever the writer thought was worth recording. A **thin** log — the seed and the decisions — is tiny and complete, because the engine is deterministic ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)): one seeded RNG per game, a separate stream per bot, no hash-map iteration. Thin wins, with one correction: a thin log replayed on a *different* engine build can diverge silently and show a board that never existed. So the log is thin **and self-checking** — it carries the engine build, the contract version, the card-definition hash, and a state hash at the end of every turn. Replay re-simulates and compares; the first mismatch stops the playback and says which turn diverged. A wrong board is worse than no board.

Interactive play forces an honest statement about information. RN-30 says a bot sees only what a player sees, and inside the browser the bot really does: `ptcg-wasm` drives it through the same `PlayerView` the native engine uses, and the exported API has no full-state accessor. But the full state is in the module's linear memory, and anyone with dev tools can look. That is stated plainly in `engine/LOG.md` and on the page rather than papered over: `/play` is a practice and audit tool for a single local user (D-007), not a competitive client, and the honest-information guarantee here is about what the bot reads, not about what the human could dig out.

Finally, this subtask closes two stubs. `ptcg-cli`'s `kind: replay` returns an error line until now ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) step 9), and the worker's `replay` dispatcher fails with `not implemented` ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md) step 10). Both become real here, because a replay that can also run headless is how the format gets tested without a browser.

## Scope

- **In scope.** `engine/ptcg-wasm` (the wasm-bindgen surface, the loader glue, the size budget); the event-log writer in `ptcg-core` and the `store_logs` path that fills `games.log_blob`; `engine/LOG.md` (the format, the vocabulary, the versioning rule); the `replay` job kind in `ptcg-cli` and in the worker, so a log can be verified headless; `GET /api/games/:jobId/:pairingIdx/:gameIdx/log`; the web routes `/games/:id/replay` and `/play` with their board renderer, step controls and prompt panel; the WASM loading strategy in Vite; the determinism check that ties a browser replay to a CLI fingerprint.
- **Out of scope.** The engine's rules, damage pipeline, prompts and termination ([S04.T03](../04-game-engine-core/T03-game-state-model.md)–[S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)); the bots themselves ([S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md), S06); the `games` schema ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)); the job queue, SSE and the Evaluate page ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)–[S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)); the scenario runner, although a scenario could later assert an event log ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) defers that question here and it stays deferred — see Risks); the coach's critical-moment selection ([S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md)), which reads the same logs for a different purpose; multiplayer, networking or persistence of a `/play` session; deck building inside `/play` — it takes an existing deck version.

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask. It is where three rules owned elsewhere become visible to a person: RN-30's honest information (in the bot the browser drives), RN-20's end reasons (in the outcome the replay shows), and RN-50's determinism (in the fact that a replay reproduces the recorded result at all).

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S08.T04-01 | A replay is a re-simulation, not a recording: `ptcg-wasm` rebuilds every state from the log's seed and decision stream through `ptcg-core`, and the log contains no board state other than the per-turn checkpoint hashes. Nothing in the viewer can render a state the engine did not produce. | `replay()` calls the same `Game::apply` path as a live game; the log writer emits no zone contents | `wasm.rs > replay_rebuilds_states_from_decisions_only`; `log.rs > a written log contains no zone arrays` (schema assertion over a fixture game) |
| BR-S08.T04-02 | A replay verifies itself: the log carries `engine_build`, `contract_version`, `card_defs_hash` and a `state_hash` at every turn boundary, and playback stops at the first mismatch with the turn number, the expected hash and the actual hash. A divergent replay never renders past the divergence. | `Replay::step()` compares against the next checkpoint before yielding a state | `wasm.rs > a tampered checkpoint stops playback at that turn and reports both hashes`; the viewer shows the stop reason instead of a board |
| BR-S08.T04-03 | The final state of a replay equals the final state of the recorded game: replaying a log produced by `ptcg-cli` yields the same `winner`, `reason`, `turns` and final state hash as the `games` row it came from. | the `replay` job kind asserts it headless; the browser asserts it in the viewer's footer | `cli.rs > replay_of_a_recorded_game_matches_its_row` over 50 games; `> the reported reason is one of the RN-20 end reasons` |
| BR-S08.T04-04 | The exported WASM surface has no full-state accessor: a `Session` answers only `view(player)`, `legal_actions(player)`, `pending_prompt()` and `outcome()`, and the browser-side bot is driven through the same `PlayerView` the native engine uses (RN-30). The linear memory is nonetheless inspectable, which `engine/LOG.md` §7 and the `/play` page both state. | the `#[wasm_bindgen]` impl exports no method returning the full `Game`; the bot adapter takes a `PlayerView` | `wasm.rs > the exported surface exposes no full state` (symbol assertion over the generated `.d.ts`); `> the browser bot receives only a PlayerView` |
| BR-S08.T04-05 | An interactive session is deterministic and reproducible: `Session::new` takes an explicit seed, records the same decision stream a batch game would, and `Session::log()` produces a log that replays byte-identically to the session that was played. | one RNG per session seeded from the argument; the same log writer as the batch path | `wasm.rs > a session's log replays to the same final state hash`; `> two sessions with the same seed and the same actions produce identical logs` |
| BR-S08.T04-06 | The browser never opens the database and never receives card data it did not ask the API for: the WASM module is given `card_defs` and a log as arguments, exactly as the CLI is given a job line, and it performs no fetch of its own. | `ptcg-wasm` has no `web_sys` fetch dependency; the loader passes buffers in | `wasm.rs > the module makes no network call` (dependency assertion); `pnpm --filter web build` shows no additional network origin in the bundle |
| BR-S08.T04-07 | A missing or oversized log is reported, never faked: a `games` row with `log_blob IS NULL` — because the job did not set `store_logs`, or because the retention sweep removed it, or because the log exceeded `MAX_LOG_BYTES` — makes the endpoint return 404 with a machine `code` saying which, and the page explains it. | the endpoint distinguishes `log_not_stored`, `log_pruned` and `log_too_large` from `not_found` using the `games` row and the parent job's dates | `api.spec.ts > a game without a log returns 404 log_not_stored`; `> a game whose job is older than the retention window returns log_pruned` |
| BR-S08.T04-08 | The log format is versioned and refuses to guess: `LOG_FORMAT_VERSION` is a major/minor pair in the header; a different major is refused with both versions named, a higher minor is accepted and unknown optional fields are ignored — the same rule the job protocol uses. | `Replay::open` checks the header before anything else | `wasm.rs > an unknown major version is refused naming both`; `> a higher minor is accepted` |
| BR-S08.T04-09 | The WASM bundle is loaded once, lazily, and its size is budgeted: the module is dynamically imported only on `/games/:id/replay` and `/play`, cached for the page's lifetime, and `pnpm check` fails if the release `.wasm` exceeds `WASM_SIZE_BUDGET_KB` (600 KB, gzipped). | a single module-level promise in `apps/web/src/engine/load.ts`; a size assertion in `pnpm check` | `wasm-size.spec.ts > the release artifact is within budget`; `router.spec.tsx > the module is not requested on any other route` |
| BR-S08.T04-10 | `/play` never writes anything: a session lives in the tab, is not persisted, creates no `jobs` row and no `games` row, and its log is downloadable as a file rather than stored. Auditing is a read activity. | the route calls no mutation; the "download log" control uses a blob URL | `play.spec.tsx > no API mutation is issued during a full session`; `pnpm lint` finds no `POST /api/jobs` in the play route |

## Data operations

**User actions.** The web performs no database operation; everything goes through the API or stays inside the WASM module (Architecture principle 2).

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Open a replay | "Assistir" on a game row of the job detail page, or a direct link | `GET /api/games/:jobId/:pairingIdx/:gameIdx/log` + `GET /api/jobs/:jobId` for the card defs and deck lists | the WASM module is imported, the log is opened, turn 1 is rendered; the footer shows the recorded outcome and the engine build |
| Step one action forward / back | `→` / `←`, or the two buttons | none | the board re-renders at the next/previous decision; stepping back re-simulates from the last checkpoint rather than storing every state |
| Jump to a turn | the turn slider, or `Home` / `End` | none | playback re-simulates from the nearest earlier checkpoint; a turn beyond a divergence is not reachable (BR-S08.T04-02) |
| Play / pause the walk-through | the play button, or `Space` | none | one action every `REPLAY_SPEED_MS` (default 600), pausing at every prompt |
| Inspect a slot | click a Pokémon on the board | none | a panel with its evolution stack, attached energy, tools, damage counters, conditions, turn effects and markers |
| Show the prompt that was asked | the prompt panel, always visible | none | `purpose`, `actor`, `owner`, the candidate list and which candidate the bot chose — the audit surface the legacy's prose prompts never had |
| Toggle the perspective | "Ver como jogador 1 / 2 / árbitro" | none | in a replay both hands are visible by default, because a stored game has no secrets left; the toggle restricts the view to one player's `PlayerView` to check what the bot could actually see (RN-30) |
| Copy the divergence report | "Copiar divergência", only shown after a stop | none | the turn, both hashes, the engine build in the log and the build of the loaded module — the text to paste into a defect note |
| Download the log | "Baixar log" | none | the raw deflated bytes as a file, so a game can be replayed later or attached to a report |
| Start a session | "Jogar" on `/play`, choosing a deck version, an opponent deck, a bot and a seed | `GET /api/decks/versions/:id` and `GET /api/meta/decks/:id` for the two lists, `GET /api/cards/defs?ids=` for the definitions | `Session::new` is constructed in the browser; the opening board is rendered (BR-S08.T04-10) |
| Take an action | click a card or an action chip | none | `session.apply(action)`; an illegal action is refused client-side because `legal_actions(player)` produced the chips |
| Answer a prompt | the prompt panel's candidate list | none | `session.answer(answer)`; an invalid answer is rejected by the engine's validator with its reason, never substituted (RN-21's tolerance is for bots, not for a person auditing) |
| Let the bot move | automatic after the human's turn ends | none | `session.bot_step()` runs the registered bot over its own `PlayerView`; the action it chose appears in the event list |
| Undo in a session | "Desfazer" | none | re-simulates from the session's own log minus the last decision; available only in `/play`, because a replay has nothing to undo |
| Download the session log | "Baixar log" | none | the same format a batch game produces, replayable in the same viewer (BR-S08.T04-05) |

**WASM API** — every call crosses the JavaScript ↔ Rust boundary; nothing else does.

| Export | Signature | Arguments | Returns | Notes |
|---|---|---|---|---|
| `version` | `version() -> JsValue` | — | `{ name, version, build_hash, contract_version, log_format_version }` | the build hash compared against the log's `engine_build` |
| `replay` | `replay(card_defs: &str, log: &[u8]) -> Result<Replay, JsError>` | card definitions as the job's `card_defs` JSON; the deflated log bytes | a `Replay` handle | the `replay(log) → states[]` of the objective, with the definitions made explicit and the states materialised lazily |
| `Replay.len` | `len() -> usize` | — | number of decisions in the stream | the slider's range |
| `Replay.turns` | `turns() -> usize` | — | number of turn checkpoints | — |
| `Replay.state_at` | `state_at(i: usize) -> Result<JsValue, JsError>` | decision index | a `ViewState` | re-simulates from the nearest earlier checkpoint; stops on a checkpoint mismatch (BR-S08.T04-02) |
| `Replay.states` | `states() -> Result<JsValue, JsError>` | — | every `ViewState` in order | the eager form; used by tests and by the headless `replay` job |
| `Replay.event_at` | `event_at(i: usize) -> JsValue` | decision index | the log event, including any prompt and answer | what the prompt panel renders |
| `Replay.outcome` | `outcome() -> JsValue` | — | `{ winner, reason, turns, final_state_hash }` | `reason` is one of RN-20's end reasons |
| `Replay.header` | `header() -> JsValue` | — | the log header | engine build, contract version, seed, `card_defs_hash`, deck lists |
| `Session.new` | `Session::new(defs: &str, decks: &str, seed: u64) -> Result<Session, JsError>` | definitions; the two decklists as `[{ card_id, count }]`; the seed | a `Session` | the objective's `Session::new(defs, decks, seed)` |
| `Session.view` | `view(player: u8) -> JsValue` | 0 or 1 | that player's `PlayerView` | the only state accessor there is (BR-S08.T04-04) |
| `Session.legal_actions` | `legal_actions(player: u8) -> JsValue` | 0 or 1 | the legal action list | drives the clickable chips |
| `Session.apply` | `apply(action: &str) -> Result<JsValue, JsError>` | one action as JSON | the events produced | an illegal action is an error, not a substitution |
| `Session.pending_prompt` | `pending_prompt() -> JsValue` | — | the pending prompt or `null` | `purpose`, `actor`, `owner`, candidates |
| `Session.answer` | `answer(answer: &str) -> Result<JsValue, JsError>` | one answer as JSON | the events produced | validated by the engine's own validator |
| `Session.bot_step` | `bot_step(bot: &str) -> Result<JsValue, JsError>` | bot name and params as JSON | the events produced | the bot reads a `PlayerView` only |
| `Session.outcome` | `outcome() -> JsValue` | — | the outcome, or `null` while the game runs | same shape as `Replay.outcome` |
| `Session.log` | `log() -> Vec<u8>` | — | the deflated log of the session so far | replayable by `replay()` (BR-S08.T04-05) |
| `Session.undo` | `undo() -> Result<JsValue, JsError>` | — | the rebuilt `ViewState` | drops the last decision and re-simulates |

**Endpoint.**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/games/:jobId/:pairingIdx/:gameIdx/log` | — | `200 application/octet-stream` — the deflated log bytes, with headers `x-engine-build`, `x-log-format-version` and `x-game-seed` | `404 not_found` (no such game); `404 log_not_stored` (the job did not set `store_logs`); `404 log_pruned` (the retention sweep removed it); `404 log_too_large` (the writer dropped it); `503 database_unavailable` |
| GET | `/api/games/:jobId/:pairingIdx/:gameIdx` | — | the `games` row without the blob, plus the pairing's deck lists and bot names | `404 not_found` |

**CRUD.** This subtask writes nothing. `games.log_blob` is written by the worker on the `store_logs` path that [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) already owns; what changes is only the **format of the bytes**, which is defined here. The api reads `games` and `job_pairings`; the web reads through the api; the WASM module reads its arguments. `/play` performs no write at all (BR-S08.T04-10).

## Interfaces

**The event log** (`engine/LOG.md`). Deflated JSON Lines. Line 0 is the header; every later line is one event. The same bytes sit in `games.log_blob` and, base64-encoded, in the protocol's `game.log` field.

```jsonc
// line 0 — header
{ "v": [1, 0], "engine_build": "a3f19c…", "contract_version": 1,
  "card_defs_hash": "sha256:…", "seed": 8123407, "first": 0,
  "decks": { "a": [{ "card_id": "sv4pt5-54", "count": 4 }, …], "b": [...] },
  "bots": { "a": { "name": "heuristic", "params": {} }, "b": { "name": "heuristic", "params": {} } },
  "options": { "stall_turns": 12, "max_steps": 3000 } }

// a decision
{ "i": 41, "t": 7, "p": 0, "ev": "action", "action": { "kind": "attack", "idx": 1 } }
// a prompt and its answer, recorded as two events so the audit shows what was offered
{ "i": 42, "t": 7, "p": 1, "ev": "prompt", "purpose": "choose_bench_target", "actor": 1, "owner": 0,
  "candidates": [{ "slot": 1 }, { "slot": 2 }] }
{ "i": 43, "t": 7, "p": 1, "ev": "answer", "pick": { "slot": 2 }, "by": "bot", "invalid": false }
// a turn checkpoint, written at every turn boundary
{ "i": 44, "t": 7, "ev": "checkpoint", "state_hash": "9c21…", "prizes": [4, 5], "turn_ends": true }
// the terminal event
{ "i": 51, "t": 9, "ev": "end", "winner": 0, "reason": "prizes", "turns": 9, "state_hash": "f0aa…" }
```

`i` is a dense index from 0, `t` the turn number, `p` the acting player. The event vocabulary is closed: `action`, `prompt`, `answer`, `checkpoint`, `end`, plus `note` for a diagnostic the engine wants to surface (an `invalid_action` substitution under RN-21, a step-cap warning). There are **no** zone arrays, no card lists and no damage values — those are what re-simulation produces (BR-S08.T04-01), and their absence is what keeps a log at the 5–20 KB deflated that [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) budgeted. `card_defs_hash` is the SHA-256 over the canonical serialisation of the job's `card_defs`, so a replay against different definitions is caught before the first turn rather than at the first divergent damage number.

Versioning follows the job protocol's rule exactly (BR-S08.T04-08): `v: [major, minor]`, a different major refused naming both, a higher minor accepted with unknown optional fields ignored. `LOG_FORMAT_VERSION` starts at `[1, 0]` and is exported from `@pokesearch/shared` alongside `JOBS_CONTRACT_VERSION`.

**`ViewState`** — what the board renderer consumes, defined in `@pokesearch/shared` with a JSON Schema and a `serde` mirror, checked by the same schema-agreement test the job protocol uses ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) BR-S04.T12-06):

```ts
export const SlotView = z.object({
  card_id: z.string(), under: z.array(z.string()), energies: z.array(z.string()),
  tools: z.array(z.string()), damage: z.number().int(), hp_max: z.number().int(),
  conditions: z.array(Condition), turn_effects: z.array(TurnEffect), markers: z.array(z.string()),
  prize_value: z.number().int(),
});
export const PlayerBoard = z.object({
  active: SlotView.nullable(), bench: z.array(SlotView),
  hand: z.union([z.array(z.string()), z.number().int()]),   // cards, or a count from the other perspective
  deck: z.number().int(), discard: z.array(z.string()), lost_zone: z.array(z.string()),
  prizes: z.number().int(), supporter_played: z.boolean(),
});
export const ViewState = z.object({
  i: z.number().int(), turn: z.number().int(), current: z.number().int().min(0).max(1),
  phase: GamePhase, stadium: z.object({ card_id: z.string(), owner: z.number().int() }).nullable(),
  p: z.tuple([PlayerBoard, PlayerBoard]),
  pending_prompt: PromptView.nullable(),
  last_damage: DamageCalc.nullable(),          // the pipeline breakdown of S04.T07, so the board can explain a number
  outcome: z.object({ winner: z.number().nullable(), reason: EndReason }).nullable(),
});
```

`hand` is a union because the same renderer serves both perspectives: an array when the viewer is allowed to see it, a count when it is looking through a `PlayerView` (BR-S08.T04-04).

**`engine/ptcg-wasm/Cargo.toml`** — `crate-type = ["cdylib", "rlib"]`, dependencies `ptcg-core`, `wasm-bindgen`, `serde-wasm-bindgen`, `js-sys`, all pure Rust as D-001 requires; `[profile.release] opt-level = "z"`, `lto = true`, `panic = "abort"`, `codegen-units = 1`. Built with `wasm-pack build --target web --release`, output to `apps/web/src/engine/pkg/`, which is git-ignored and produced by `pnpm engine:wasm`. `pnpm --filter web build` depends on that script, and `pnpm check` asserts the size budget (BR-S08.T04-09).

**`apps/web/src/engine/load.ts`** holds one module-level promise so the instantiation happens once per tab:

```ts
let mod: Promise<typeof import("./pkg/ptcg_wasm")> | null = null;
export function loadEngine() { return (mod ??= import("./pkg/ptcg_wasm").then(async m => { await m.default(); return m; })); }
export const WASM_SIZE_BUDGET_KB = 600;
export const REPLAY_SPEED_MS = 600;
```

**The `replay` job kind**, now real in `ptcg-cli` and in the worker. Its request carries `replay: { log: "<base64>", card_defs_hash? }` and it emits one `game` line per replayed game plus a `result` line whose `fingerprint` is computed over the replayed outcomes, so a log can be verified against its `games` row without a browser. This is what makes BR-S08.T04-03 testable in CI, and it is the reason the stubs in [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) and [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) existed rather than the kind being omitted.

**The two routes.** `/games/:id/replay` takes `:id` as `<jobId>.<pairingIdx>.<gameIdx>` so a single path segment identifies a game, with the components also accepted as search params for links built by the Evaluate page. Layout: the board occupies the centre with the active Pokémon facing each other, benches above and below, prizes and deck/discard counts at the edges; the right column holds the event list (clickable, scrolls with playback) and the prompt panel; the footer carries the outcome, the engine build, the log format version and the divergence indicator. `/play` is the same board with the human's action chips enabled and a setup dialog in front of it.

**Card rendering** reuses `CardImage` from [S01.T08](../01-foundation/T08-web-skeleton.md) with its fallback chain and its reserved `245 × 337` box, so a CDN failure during a replay costs an image and not the layout. Cards are addressed by `card_id` throughout the log and the `ViewState`, and the page resolves names and images from the card endpoints it already has.

## Implementation steps

1. Write the log format in `@pokesearch/shared` (header, the five event kinds, `LOG_FORMAT_VERSION`) with its exported JSON Schema, and the `serde` mirror in `ptcg-core`; add the schema-agreement test (BR-S08.T04-08).
2. Write the log writer in `ptcg-core`: append a decision per action and per prompt/answer pair, a checkpoint at every turn boundary, and the terminal event; wire it to the existing `store_logs` flag so `ptcg-cli` fills `game.log`. Spec that a written log contains no zone arrays (BR-S08.T04-01).
3. Write `ViewState` and the projection from `Game` and from `PlayerView`, with the `hand` union; spec both perspectives.
4. Implement `Replay` in `ptcg-core` — `open`, `state_at`, `states`, `event_at`, `outcome`, with re-simulation from the nearest checkpoint and the mismatch stop; spec the tampered-checkpoint case (BR-S08.T04-02).
5. Implement the `replay` job kind in `ptcg-cli` and replace the worker's stub, so `cli.rs > replay_of_a_recorded_game_matches_its_row` can run over 50 recorded games (BR-S08.T04-03).
6. Create `engine/ptcg-wasm` with `version`, `replay` and the `Replay` methods; build with `wasm-pack`, add `pnpm engine:wasm`, and add the size assertion to `pnpm check` (BR-S08.T04-09).
7. Add `Session` with `new`, `view`, `legal_actions`, `apply`, `pending_prompt`, `answer`, `bot_step`, `outcome`, `log`, `undo`; spec the no-full-state assertion over the generated `.d.ts` and the session-replays-to-itself property (BR-S08.T04-04, -05).
8. Add `GET /api/games/:jobId/:pairingIdx/:gameIdx/log` and its sibling metadata route, with the four distinct 404 codes (BR-S08.T04-07).
9. Build the board renderer and the event/prompt panels in `apps/web/src/engine/`, with `CardImage` and pt-BR strings.
10. Build `/games/:id/replay`: loader, step controls, turn slider, perspective toggle, divergence banner and the "copiar divergência" control.
11. Build `/play`: the setup dialog, the action chips from `legal_actions`, the prompt panel, the bot step, undo and "baixar log"; assert no mutation is issued (BR-S08.T04-10).
12. Write `engine/LOG.md` — the format, the vocabulary, the versioning rule, the size figures measured on real games, and §7's plain statement about linear memory — and record in the completion note the measured deflated size per game and the replay time for a 30-turn game.

## Edge cases and error handling

- **A replay log from an older engine build.** The header's `engine_build` differs from the loaded module's. The viewer says so up front — "gravado com o build a3f19c, carregado b7e402" — and still attempts the replay, because most builds change nothing a given game touches. It then either completes, with the mismatch noted in the footer, or stops at the first checkpoint whose `state_hash` differs, naming the turn and both hashes. What it never does is render past the divergence: after that point the board would be this build's opinion of an old game, which is exactly the plausible-looking nonsense this rule exists to prevent (BR-S08.T04-02). The same applies to `card_defs_hash`: a card that was re-derived after a `card_overrides` edit invalidates the replay, and that is a finding, not a bug in the viewer.
- **A game with no stored log.** Three different reasons, three different messages: the job never set `store_logs` (`log_not_stored`, with the note that re-running the job with logs enabled is the way to get one); the retention sweep removed it after `GAMES_RETENTION_DAYS` ([S08.T01](T01-scheduler.md)) while keeping the aggregates (`log_pruned`); or the writer dropped it because it exceeded `MAX_LOG_BYTES` ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md) BR-S04.T15-09) (`log_too_large`). Collapsing them into one 404 would make the first two look like a defect (BR-S08.T04-07).
- **A log that decompresses to garbage or stops mid-line.** `Replay::open` fails with the byte offset; the page shows it and offers the download so the bytes can be inspected. A truncated log is not partially replayed: the header's counts and the terminal event are what say a log is complete, and half a game shown as a whole game is a worse outcome than an error.
- **A log whose decision stream ends before the terminal event** — a game the engine aborted with an `EngineError`, counted in the pairing's `errors`. Playback runs to the last recorded decision and the footer says the game did not finish and why, reading the pairing's row. This is a useful case, not a failure: it is how an engine error becomes inspectable.
- **The human answers a prompt with an invalid pick in `/play`.** The engine's validator rejects it with its reason, the panel shows the reason, and nothing is substituted. RN-21's default-resolver substitution exists so that a broken *bot* does not abort a 3,000-game batch; applying it to a person auditing the rules would hide the very thing they are looking at.
- **The bot takes a long turn in `/play`** — a rollout or ISMCTS bot thinking for seconds on the main thread freezes the tab. The bot step runs inside a Web Worker with the same module instance loaded there, and the page shows a thinking indicator with a cancel that abandons the step and restores the pre-step session from its own log. The heuristic bot is fast enough not to need this; the S06 bots are not.
- **The WASM module fails to instantiate** — an old browser, or a blocked `application/wasm` response. Both routes render an explanatory state naming the requirement, and every other page is unaffected because the import is dynamic and route-scoped (BR-S08.T04-09).
- **Stepping backwards across many turns.** States are not cached; `state_at(i)` re-simulates from the nearest earlier checkpoint, which is at most one turn of actions. A 30-turn game therefore steps backwards in roughly the cost of one turn, and memory stays flat instead of holding every state.
- **A session played to a stall tie.** RN-20's twelve-turn material-signature stall applies in the browser exactly as in a batch game, because it is the same code; the footer shows `reason: "stall"`. Someone auditing a bot that loops will see the tie arrive rather than a hung tab.
- **`store_logs` on a large job.** Nothing changes here — the worker already flushes every 500 games and drops oversized blobs — but the format choice is what keeps it affordable: a decision stream of a few hundred events deflates to single-digit kilobytes, while a state-per-action log of the same game would be two orders of magnitude larger and would make `store_logs` unusable in practice.
- **The D-001b fallback is in force** — the S01.T06 gate failed and the engine is TypeScript under `packages/engine-ts`. There is then no WASM crate and no build step: the same `Replay` and `Session` interfaces are implemented directly in TypeScript against the same log format and the same `ViewState` schema, the two web routes are unchanged, and only `apps/web/src/engine/load.ts` differs. The format is the contract; the language is not.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core log::` green: a written log contains no zone arrays, decompresses to the header plus a dense decision stream, and carries a checkpoint at every turn boundary (BR-S08.T04-01).
- [ ] `cargo test -p ptcg-cli cli::replay_of_a_recorded_game_matches_its_row` over 50 recorded games: each replay reproduces the row's `winner`, `reason`, `turns` and final state hash, and the `result` line's fingerprint equals the original pairing's (BR-S08.T04-03, RN-50).
- [ ] `wasm.rs > a tampered checkpoint stops playback at that turn` reporting the turn number and both hashes, and `> playback never yields a state past the divergence` (BR-S08.T04-02).
- [ ] `wasm.rs > an unknown major log version is refused naming both versions` and `> a higher minor is accepted with unknown optional fields ignored` (BR-S08.T04-08).
- [ ] `wasm.rs > the exported surface exposes no full state` — a symbol assertion over the generated `ptcg_wasm.d.ts` finds no method returning the whole `Game` — and `> the browser bot receives only a PlayerView` (BR-S08.T04-04, RN-30).
- [ ] `wasm.rs > a session's log replays to the same final state hash` and `> two sessions with the same seed and the same actions produce identical logs`, byte for byte (BR-S08.T04-05).
- [ ] `pnpm check` fails when the release `.wasm` exceeds 600 KB gzipped, and `router.spec.tsx > the module is not requested on any other route` (BR-S08.T04-09).
- [ ] `api.spec.ts`: a game with no log returns `404 log_not_stored`; a game whose job predates the retention window returns `404 log_pruned`; a game whose blob was dropped returns `404 log_too_large`; a real game returns the bytes with `x-engine-build` and `x-log-format-version` set (BR-S08.T04-07).
- [ ] End to end in the browser: run an `evaluate` job with `storeLogs: true` for 20 games, open `/games/<id>.0.3/replay`, step to the end, and the footer's outcome equals the `games` row; the prompt panel shows at least one prompt with its candidate list and the bot's pick.
- [ ] End to end in the browser: a human plays a full game against the heuristic bot on `/play` and reaches a terminal state with one of RN-20's reasons; `play.spec.tsx > no API mutation is issued during a full session` passes, and the downloaded log replays in `/games/.../replay` to the same final state (BR-S08.T04-05, -10).
- [ ] `engine/LOG.md` exists with the header, the five event kinds, the versioning rule, §7's statement about linear memory, and the measured figures: deflated bytes per game and replay time for a 30-turn game on this machine.

## Risks and open questions

- **Risk — the board renderer is the real cost, not the engine.** A Pokémon board has evolution stacks, attached energy, tools, counters, conditions, turn effects and markers, and rendering it legibly is a genuine design problem. Mitigation: the original note on this subtask — "board rendering can start as a simple list view; card images hotlinked" — is the plan for step 9, the `ViewState` contract is what the renderer consumes so a better renderer is a swap, and the audit value is in the event and prompt panels, which are text.
- **Risk — thin logs make replay depend on engine stability.** Every build change potentially invalidates every stored log. Mitigation: the checkpoints make invalidation visible instead of silent (BR-S08.T04-02); logs are opt-in twice and are swept after 30 days anyway ([S08.T01](T01-scheduler.md)); and a game is regenerable from its seed, which is recorded in `games.seed`. The alternative — thick logs — trades that for two orders of magnitude more storage, which would make `store_logs` unusable.
- **Risk — `/play` is read as a game.** It has no matchmaking, no persistence, no account and no protection of hidden information beyond what the API exposes (BR-S08.T04-04). Mitigation: the page says what it is in one line, `engine/LOG.md` §7 says it again, and D-007's single-local-user model is the frame.
- **Risk — the WASM bundle grows past its budget** as S05's IR VM and S06's bots land in `ptcg-core`. Mitigation: the budget is asserted in `pnpm check` so growth is a failing build rather than a slow page; `opt-level = "z"` and `lto` are on; if it is ever exceeded honestly, the answer is a feature flag excluding the heavy bots from the WASM build, which is a `Cargo.toml` change.
- **Question — should a scenario be able to assert an event log?** [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) deferred this here on the grounds that the log format did not exist yet. It exists now, and adding `expect: { events: [...] }` would be additive to the `Expect` enum. Recommendation: **not yet** — the ten value-based expectation kinds cover the assertions the 136 legacy verified tests make, and an event-sequence assertion is brittle against harmless reorderings. Revisit when a real scenario cannot be expressed without it; the format is stable enough that adding it later costs nothing.
- **Question — should `/play` be able to start from a replay's position?** "Take over from turn 7 and try the other line" is the most valuable auditing feature imaginable and needs only `Session::from_replay(replay, i)`. Recommendation: leave it out of the first version because it multiplies the setup surface, and record it as the first extension; the re-simulation machinery already produces the state it would need.
- **DEPENDENCY-PROPOSAL: S08.T04 should depend on S01.T06 because** the `ptcg-wasm` crate is built for `wasm32-unknown-unknown`, the target the Rust toolchain gate installs and verifies, and because a failed gate switches this subtask to the D-001b fallback described under Edge cases. The edge exists in neither header today, although this file's own summary already named the gate.
- **DEPENDENCY-PROPOSAL: S08.T04 should depend on S01.T05 and S01.T08 because** the log format, `LOG_FORMAT_VERSION` and `ViewState` are zod contracts with exported JSON Schema living in `packages/shared` ([S01.T05](../01-foundation/T05-shared-contracts-package.md)), and both web routes are built inside the shell, the router, the strings module and `CardImage` of [S01.T08](../01-foundation/T08-web-skeleton.md). Neither edge exists today.
- **DEPENDENCY-PROPOSAL: S08.T04 should depend on S04.T15 because** the `replay` job kind's dispatcher stub lives in the worker and is replaced here, and because the `store_logs` write path that fills `log_blob` is that subtask's. Today only the schema edge ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)) exists.

## References

- [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) — the `replay` job kind and `ReplayRequest`, the `game` line whose `log` field carries these bytes as base64, the `store_games` / `store_logs` flags and the rule that `store_logs` implies `store_games`, the version-check discipline this format copies, and the schema-agreement test between the zod and `serde` sides.
- [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) — `games(job_id, pairing_idx, game_idx, seed, first, winner, reason, turns, duration_us, log_blob)` with its composite key and cascade, the explicit statement that the event-log format inside `log_blob` belongs to this subtask, and the storage estimate (≈60 bytes per row without a log; 5–20 KB deflated with one) that the thin-log choice is measured against.
- [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) — one seeded RNG per game, a separate stream per bot, no hash-map iteration in game logic, and the per-pairing fingerprint; the determinism that makes a decision-stream log sufficient. [S04.T09](../04-game-engine-core/T09-prompt-protocol.md) — `Purpose`, `Answer` and the default resolver, the vocabulary the prompt panel renders.
- [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) — the `store_logs` write path, `MAX_LOG_BYTES` (1 MB deflated) and the rule that an oversized log becomes NULL with a note; the `replay` dispatcher stub replaced here.
- [S01.T08](../01-foundation/T08-web-skeleton.md) — the shell, TanStack Router and Query, the strings module (D-006) and `CardImage`'s fallback chain and reserved box, which the board reuses.
- [Architecture](../../project/03-architecture-overview.md) — the component table's `engine/ptcg-wasm` ("same core compiled for the browser: replay and interactive play", owned by S08) and principle 1 (the engine never touches the database), which the browser inherits by construction.
- [Decision log](../../project/02-decision-log.md) — D-001 (Rust engine, targets `x86_64-pc-windows-gnu` and `wasm32-unknown-unknown`, pure-Rust dependencies only), D-001b (the TypeScript fallback implementing the same JSON contracts) and D-007 (single local user, no authentication).
- External: `wasm-bindgen` and `wasm-pack` (`--target web`), `serde-wasm-bindgen`, the `DecompressionStream("deflate")` browser API used to sanity-check a downloaded log outside the module, and MDN on dynamic `import()` for route-scoped loading.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
