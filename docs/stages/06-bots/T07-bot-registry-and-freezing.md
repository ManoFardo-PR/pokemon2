# S06.T07 — Bot registry and freezing

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 7 / 8 |
| Depends on | [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) |
| Unblocks | [S06.T08](T08-measurement-score-and-mirror.md) |
| Parallel with | [S06.T01](T01-honest-information-view.md), [S06.T02](T02-deck-profile-analysis.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` job protocol `bot: { name, params, seed }` — from [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)
- `table` `bots` — from [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)
- `doc` ESPECIFICACAO.md RN-37

## Outputs (proposed)
- `module` `ptcg-core::bots::registry` — `name → constructor`, `--bots` listing; `bots` rows with `code_hash` = SHA-256 of the bot's source file(s); `frozen = 1` bots are copied to `engine/ptcg-core/src/bots/frozen/<name>.rs` and a test fails if the hash changes; naming `planner_rs_v1`, `rollout_v1`, … — consumed by [S06.T08](T08-measurement-score-and-mirror.md)

## Initial objective
A bot used as a suite opponent can never drift: its code is frozen by hash and by copy, and every job names bots exactly.

## Context

A measurement is a comparison, and a comparison is only meaningful when exactly one thing changed. [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) froze everything on the board's side — the evaluated list, the opponents, the weights, the seeds, the rules snapshot, the engine build — and left one variable deliberately free: the bot under test. That leaves one thing still able to move without anybody noticing, which is the bot on the **other** side of the table. RN-40's whole promise, *"entre duas medições só muda quem pilota o baralho avaliado"*, is worth nothing if the opponent's pilot quietly improves between Tuesday and Thursday. This subtask is what makes the opponent immovable.

The legacy stated the rule and built three layers for it, and reading how those layers behaved is the best available specification. `sim/frozen/__init__.py` carries the policy in one sentence: *"Pilotos congelados: cópias exatas do piloto no dia em que viraram oponente de uma régua. NUNCA editar."* `policies.py` repeats it above the registry — *"`heuristic` e `smart` estão CONGELADOS: são a referência da régua (benchmarks/regua_v1.json). Bot novo é em pilot.py"* — and `POLICIES` maps seven names to constructors, three of them (`planner_v4`, `planner_v7`, `planner_v9`) loaded through a `_frozen(module)` helper that imports `pokesearch.sim.frozen.<module>` lazily. Each frozen module opens with a dated banner naming the suite it became the opponent of and repeating the prohibition. `progress.py` closes the loop with `CURRENT_SUITE = 5` and the comment that every three rounds of improvement the optimized pilot is frozen and becomes the next ruler's opponent — RN-43 in a constant and a sentence.

Three layers, and every one of them is a convention. A comment cannot stop an edit, a naming rule cannot stop a rename, and — this is the part worth carrying forward — a *copy* does not freeze anything if the copy still calls live code. The legacy's frozen planners import seven helpers from the living `policies.py` module: `MAX_CHOICE_SCAN`, `_attack_recipe`, `_can_pay`, `_discards_hand`, `_is_neutral_stadium`, `_missing` and `_turn_is_empty`. Changing `_can_pay` — the function that decides whether an attack's cost is payable — would silently change the behaviour of all three frozen pilots at once, and therefore silently change what suites v2, v3 and v4 were measuring. Nobody edited it, so nothing went wrong. That is luck, not design, and it is the single most valuable thing this subtask takes from the legacy.

So the freezing here has four layers, and each one is mechanical.

**A hash the binary knows about itself.** `code_hash` is SHA-256 over the bot's declared source files, in declared order, computed at build time by `build.rs` and baked into the binary with `cargo:rustc-env`. `ptcg-cli --bots` prints it. Nothing has to trust a developer to recompute anything, and a hash that lives only in a database row cannot be compared against the code that is actually running.

**A copy that is genuinely self-contained.** A frozen bot lives at `engine/ptcg-core/src/bots/frozen/<name>.rs` and may import **nothing** from the live bot modules — no shared helper, no shared constant, no `use super::`. It may use the engine's public API (`Game`, `Action`, `Prompt`, `PlayerView`) because those are versioned by `engine_build` and every measurement records that; it may not use anything whose change would be invisible. A policy test walks the module's import graph and fails on a single edge back into `bots::planner`, `bots::rollout` or `bots::ismcts`.

**A manifest and a test.** `engine/ptcg-core/src/bots/frozen/MANIFEST.toml` records, per frozen bot, its file, its SHA-256, the date it was frozen and the suite version it became the opponent of. `cargo test -p ptcg-core frozen::frozen_bot_files_match_the_manifest` recomputes every hash and fails on any difference. Editing a frozen file is not discouraged; it is a red test.

**A database constraint.** [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) already installed `bots_frozen_immutable`, a `BEFORE UPDATE` trigger rejecting a change to `code_hash` or `params_json` when `frozen = 1`. This subtask is what fills the rows and what detects the reverse direction — a binary whose registry hash no longer matches a frozen row — and refuses the job rather than the row.

RN-43 is a process rule, and the traceability doc is right to call it one: nothing can mechanically decide that three rounds of improvement have happened, because "an improvement" is a judgement about a measurement. What *can* be mechanical is the counting and the reminder, so `pnpm bots:status` prints how many accepted measurements have been taken on the current suite since the last freeze and says plainly when the count reaches three. The freeze itself is one command with a checklist, and the checklist is in this file.

One naming rule follows from all of it and is worth stating alone: **a bot's name is its identity, and params are part of that identity**. `planner_rs_v1` with `safe_deck: 5` is not `planner_rs_v1`; it is a different bot that has not been measured. The registry stores each bot's default params, the `bots` row stores them too, and a job that overrides the params of a *frozen* bot is refused. An improvement is always a new name, never an edited one — which is exactly RN-37, and the reason the `_rs` in `planner_rs_v1` exists: it distinguishes this engine's planner from the legacy `planner`, whose numbers live in `HISTORICO.md` and were measured on a different engine entirely.

## Scope

- **In scope.** `ptcg-core::bots::registry` with `BotEntry`, `REGISTRY`, `make(name, params)` and the listing; the `build.rs` hash computation and its `cargo:rerun-if-changed` wiring; `ptcg-cli --bots` and its JSON and table formats; `engine/ptcg-core/src/bots/frozen/` with its banner convention, `MANIFEST.toml` and the self-containment policy test; the freeze procedure as a command (`pnpm bots:freeze`) and as a checklist; `pnpm bots:sync` writing registry entries into the `bots` table; `pnpm bots:status` counting rounds for RN-43; the drift detection between the binary and the database; the params-identity rule and the frozen-params refusal; the bot-name vocabulary and the `engine/BOTS.md` bot table.
- **Out of scope.** The bots themselves ([S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md), [S06.T03](T03-planner-turn-policy.md)–[S06.T06](T06-ismcts-bot.md)) — this subtask registers and freezes them, it does not write them; the `bots` table's DDL and its immutability trigger ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)); the suite tables and the freeze of a *suite* ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), RN-40, RN-41); the measurement job and its statistics ([S06.T08](T08-measurement-score-and-mirror.md)); the job protocol's `bot` field and the CLI's exit codes ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)) — this subtask supplies the names that field carries; `rules_snapshot` and `engine_build` ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); the decision about *which* bot to freeze next, which is the user's.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-37 | **Kept, made mechanical.** A frozen bot is never edited. Its source lives under `bots/frozen/<name>.rs`, its SHA-256 is recorded in `MANIFEST.toml` and in `bots.code_hash`, it imports nothing from a live bot module, and a change to any of its declared source files fails `cargo test`. An improvement is a **new bot with a new name**; a name is never reused and never renamed. | four layers: `build.rs`'s baked `code_hash`; `frozen::frozen_bot_files_match_the_manifest`; the import-graph policy test; `bots_frozen_immutable` in the database ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) BR-S05.T16-10) | `frozen.rs > frozen_bot_files_match_the_manifest` (editing one byte of a frozen file fails it); `policy.rs > a_frozen_bot_imports_no_live_bot_module`; `registry.rs > names_are_unique_and_never_reused`; `bots.spec.ts > updating a frozen bot's code_hash raises` |
| RN-43 | **Kept as a process rule with a mechanical reminder.** Every three rounds of accepted improvement on a suite, the current bot is frozen and becomes the opponent of the next suite version. Nothing decides automatically what an "improvement" is; `pnpm bots:status` counts measurements on the current suite since the last freeze, prints the count and warns at three, and `pnpm bots:freeze` runs the checklist. The freeze is an act with a date, an author and a suite number. | `pnpm bots:status`'s counter over `measurements` joined to `suites`; the checklist in this file and in `engine/BOTS.md` | `bots.spec.ts > status counts measurements on the current suite since the last freeze`; `> status warns at three rounds`; review: `engine/BOTS.md` records each freeze with its date and suite version |
| BR-S06.T07-01 | `code_hash` is SHA-256 over the bot's `source_files`, concatenated in the declared order with each file's repo-relative path and byte length as a framed prefix, computed by `build.rs` and baked into the binary via `cargo:rustc-env=PTCG_BOT_HASH_<NAME>`. `build.rs` emits `cargo:rerun-if-changed` for every listed file, so a touched file rebuilds the hash. | `engine/ptcg-core/build.rs`; `BotEntry::code_hash` reading `env!` | `registry.rs > the_hash_is_stable_across_builds` (two clean builds agree); `> the_hash_changes_when_a_source_file_changes` (a build-script test over a fixture tree); `> the_hash_covers_every_declared_file` (removing a file from the list changes it) |
| BR-S06.T07-02 | A frozen bot module is **self-contained**: it may reference the engine's public API and the standard library, and it may not reference `bots::planner`, `bots::rollout`, `bots::ismcts`, `bots::profile`, `bots::registry` or any other live bot module, directly or transitively. A frozen bot that needs a helper carries its own copy. | the import-graph policy test walking `use` statements and path expressions in `bots/frozen/*.rs` | `policy.rs > a_frozen_bot_imports_no_live_bot_module` (a fixture frozen file with `use super::planner::need;` fails it); `> a_frozen_bot_may_use_the_engine_api` (the same fixture with `use crate::view::PlayerView;` passes) |
| BR-S06.T07-03 | `MANIFEST.toml` is the record of what is frozen and is append-only in practice: one entry per frozen bot with `name`, `file`, `sha256`, `frozen_at`, `suite_version` and `note`. Removing or rewriting an entry fails the same test that guards the files, because the test compares the manifest against the directory in both directions. | `frozen/MANIFEST.toml`; `frozen::frozen_bot_files_match_the_manifest` checking manifest→file and file→manifest | `frozen.rs > a_file_without_a_manifest_entry_fails`; `> a_manifest_entry_without_a_file_fails`; `> a_changed_sha256_fails` |
| BR-S06.T07-04 | Bot names are permanent, lowercase `snake_case`, and version-suffixed: `random`, `heuristic`, `planner_rs_v1`, `rollout_v1`, `ismcts_v1`, then `_v2` and onward. A name once registered is never reused for different behaviour and never renamed; a behavioural change of any kind — code, defaults, or a constant — produces the next version number. | `REGISTRY` as a `const` slice; a test asserting the name pattern and uniqueness; the `engine/BOTS.md` table as the human record | `registry.rs > every_name_matches_the_pattern`; `> names_are_unique_and_never_reused`; `> the_registry_is_sorted_by_name` |
| BR-S06.T07-05 | Params are part of a bot's identity. `BotEntry::default_params` is what `bots.params_json` stores; a job may override params for an **unfrozen** bot (the override is recorded in `jobs.params_json`), and an override on a **frozen** bot is refused with exit code 4 before any game runs. | `registry::make(name, params)` checking `entry.frozen` against a non-empty override; the CLI's validation pass | `registry.rs > an_override_on_a_frozen_bot_is_refused`; `> an_override_on_an_unfrozen_bot_is_accepted_and_echoed`; `cli.rs > exit_codes_match_the_documented_table` still green |
| BR-S06.T07-06 | `ptcg-cli --bots` is the single source of truth about what the binary can run: it prints one JSON object listing every registered bot with `name`, `kind`, `frozen`, `code_hash`, `default_params`, `params_schema` and, for frozen bots, `frozen_at` and `suite_version`. `--bots --format table` prints the same data for a human. Nothing else enumerates bots. | `ptcg-cli`'s `--bots` handler reading `REGISTRY`; the worker parses this output and never hard-codes a name | `cli.rs > bots_listing_parses_as_one_json_object`; `> the_listing_covers_every_registry_entry`; `bots.spec.ts > sync reads the listing and writes one row per bot` |
| BR-S06.T07-07 | `pnpm bots:sync` reconciles the binary with the database: insert-if-absent on `name`; for an unfrozen row, update `code_hash`, `params_json` and `kind`; for a frozen row, **compare** and fail loudly when the binary's hash differs, naming the bot, both hashes and the suite that depends on it. It never writes a frozen row and never silently re-freezes. | `apps/worker/src/bots/sync.ts`; the trigger of [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) BR-S05.T16-10 as the second line of defence | `bots.spec.ts > sync inserts a new bot`; `> sync updates an unfrozen bot's hash`; `> sync fails when a frozen bot's hash drifted, naming both hashes`; `> sync never issues an UPDATE against a frozen row` |
| BR-S06.T07-08 | A job that names a bot whose `code_hash` differs from the `bots` row it will be attributed to is refused before any game runs. A measurement attributed to the wrong code is worse than a missing measurement. | the worker's pre-flight check comparing `--bots` output against the `bots` rows for the named bots ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)) | `job-runner.spec.ts > a job naming a drifted frozen bot fails before spawning`; `> the failure message names the bot and both hashes` |
| BR-S06.T07-09 | An unknown bot name is an error with exit code 4 and the name in the message; there is no fallback to `random` and no fuzzy matching. The default bot when a job names none is `heuristic`, stated once in the job schema. | `registry::make`'s `None` branch; [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) BR-S04.T12-10 | `registry.rs > unknown_bot_name_is_an_error`; `cli.rs > an_unknown_bot_name_exits_4`; `> ismcts_is_not_a_default_bot` ([S06.T06](T06-ismcts-bot.md) BR-S06.T06-12) |
| BR-S06.T07-10 | Freezing a bot is one command and it is transactional across the repository and the database: it copies the source, writes the banner, appends the manifest entry, runs the manifest test, and only then marks `bots.frozen = 1`. Any failing step leaves nothing behind. | `pnpm bots:freeze --name <name> --suite <n>`; its ordered steps with a rollback of the copied file on failure | `bots.spec.ts > freeze writes the file, the manifest and the row`; `> a failing manifest test leaves no file and no row change`; `> freezing twice is refused` |
| BR-S06.T07-11 | `engine/BOTS.md` carries the human record: one row per bot with name, kind, the subtask that wrote it, default params, `code_hash`, frozen flag, freeze date, the suite version it opposes, and its headline measured result. A bot without a row is not considered registered for review purposes. | the file, updated by the same commit that registers or freezes a bot; a docs-lint check that every `REGISTRY` name appears in it | `pnpm docs:lint` fails when a registry name has no `engine/BOTS.md` row; review of the table after each freeze |

## Data operations

`bots` is a measurement table, so the **worker** is its only writer (Architecture principle 2); the `pnpm bots:*` commands live in `apps/worker` and run as the worker. The engine never opens the database — it only prints `--bots`.

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl/user) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `bots` | C | worker (`pnpm bots:sync`) | a registry name is seen that has no row | insert-if-absent on `name UNIQUE`; `code_hash`, `kind`, `params_json` from the `--bots` listing; `frozen = 0` | BR-S06.T07-07 |
| `bots` | U (`code_hash`, `params_json`, `kind`) | worker (`pnpm bots:sync`) | an **unfrozen** row's hash differs from the binary's | no-op when unchanged; never issued against `frozen = 1` | BR-S06.T07-07 |
| `bots` | U (`frozen`, `note`) | worker (`pnpm bots:freeze`) | the freeze's last step, after the manifest test passes | `frozen` goes 0 → 1 only; the trigger blocks any later `code_hash`/`params_json` change | RN-37, BR-S06.T07-10 |
| `bots` | U (`code_hash`, `params_json`) on a frozen row | — | never | `bots_frozen_immutable` aborts ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)) | RN-37 |
| `bots` | D | — | never | a deleted bot orphans every measurement that cites it; `suites.opponent_bot_id` and `measurements.bot_id` are foreign keys | RN-37 |
| `bots` | R | worker, api | every job pre-flight, the measurements page, `bots:status` | read-only | BR-S06.T07-08 |
| `suites` | R | worker (`pnpm bots:status`) | counting rounds since the last freeze | read-only; joins `opponent_bot_id` | RN-43 |
| `measurements` | R | worker (`pnpm bots:status`) | counting accepted rounds on the current suite | read-only; counts rows with `divergent = 0` | RN-43 |
| `jobs` | R (`params_json`) | worker | the pre-flight hash check | read-only | BR-S06.T07-08 |
| `engine/ptcg-core/src/bots/frozen/<name>.rs` | C | worker (`pnpm bots:freeze`) | the freeze's first step | created once; never rewritten; a second freeze of the same name is refused | RN-37, BR-S06.T07-10 |
| `engine/ptcg-core/src/bots/frozen/MANIFEST.toml` | C (append an entry) | worker (`pnpm bots:freeze`) | the freeze's third step | one entry per name; entries are never edited or removed | BR-S06.T07-03 |
| `engine/BOTS.md` | U (append a row) | worker (`pnpm bots:freeze`), developer | registration and freeze | one row per registry name | BR-S06.T07-11 |
| any table | C/U/D | engine | never | `ptcg-cli` has no database driver ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) BR-S04.T12-01) | Architecture principle 1 |

## Interfaces

```rust
// ptcg-core::bots::registry

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BotKind { Random, Heuristic, Planner, Rollout, Ismcts }   // == bots.kind CHECK (S05.T16)

pub struct BotEntry {
    pub name:           &'static str,        // permanent, snake_case, version-suffixed (BR-S06.T07-04)
    pub kind:           BotKind,
    pub ctor:           fn(&serde_json::Value) -> Result<Box<dyn Bot>, EngineError>,
    pub default_params: &'static str,        // JSON object literal
    pub params_schema:  &'static str,        // JSON Schema, include_str!
    pub source_files:   &'static [&'static str],   // repo-relative, order matters (BR-S06.T07-01)
    pub code_hash:      &'static str,        // env!("PTCG_BOT_HASH_<NAME>"), baked by build.rs
    pub frozen:         Option<FrozenInfo>,  // Some only for bots/frozen/*.rs entries
}

#[derive(Debug, Clone, Copy)]
pub struct FrozenInfo { pub frozen_at: &'static str, pub suite_version: u32 }

pub const REGISTRY: &[BotEntry] = &[ /* sorted by name (BR-S06.T07-04) */ ];

pub fn find(name: &str) -> Option<&'static BotEntry>;
pub fn make(name: &str, params: &serde_json::Value) -> Result<Box<dyn Bot>, EngineError>;
pub fn listing() -> BotListing;              // what --bots prints
```

**`build.rs`** — how a binary learns its own source hash (BR-S06.T07-01):

```rust
// engine/ptcg-core/build.rs
for (name, files) in BOT_SOURCES {                       // the same table REGISTRY declares
    let mut h = Sha256::new();
    for f in files {
        let bytes = std::fs::read(f).expect(f);
        h.update(f.as_bytes());                          // framed: path, then length, then content
        h.update(&(bytes.len() as u64).to_le_bytes());
        h.update(&bytes);
        println!("cargo:rerun-if-changed={f}");
    }
    println!("cargo:rustc-env=PTCG_BOT_HASH_{}={:x}",
             name.to_uppercase(), h.finalize());
}
```

Framing the path and the length prevents two different file lists from hashing identically, which a plain concatenation would allow.

**`ptcg-cli --bots`** (BR-S06.T07-06) — one JSON object on one line, the same discipline as the job protocol:

```json
{ "type": "bots", "engine_build": "a3f19c4e", "contract_version": 1, "bots": [
  { "name": "heuristic", "kind": "heuristic", "frozen": true,
    "code_hash": "9f2c…", "default_params": {}, "params_schema": { "type": "object" },
    "frozen_at": "2026-09-23", "suite_version": 6 },
  { "name": "planner_rs_v1", "kind": "planner", "frozen": false,
    "code_hash": "41b0…",
    "default_params": { "full_hand": 12, "safe_deck": 7, "bench_need": 500 },
    "params_schema": { "type": "object", "additionalProperties": false, "properties": { … } } },
  { "name": "rollout_v1", "kind": "rollout", "frozen": false, "code_hash": "c7d5…",
    "default_params": { "playouts_per_action": 32, "max_depth_turns": 12,
                        "max_actions_scanned": 8 }, "params_schema": { … } }
] }
```

`--bots --format table` prints the same rows as columns for a human. Exit code 0 always; the listing cannot fail.

**The frozen directory.**

```
engine/ptcg-core/src/bots/frozen/
  mod.rs               // `//! Frozen bots: exact copies of a bot on the day it became a suite
                       //!  opponent. NEVER edit. The live bots are in bots/*.rs (RN-37).`
  MANIFEST.toml
  heuristic_v1.rs      // first line: the banner below
  planner_rs_v1.rs
```

Banner, first line of every frozen file (the legacy's, in English):

```rust
// FROZEN 2026-09-23: planner_rs_v1, opponent of suite v7. Do not edit; the live bot is bots/planner.rs.
```

`MANIFEST.toml`:

```toml
[[bot]]
name          = "heuristic"
file          = "heuristic_v1.rs"
sha256        = "9f2c1ab4…"
frozen_at     = "2026-09-23"
suite_version = 6
note          = "the first ruler's opponent; written in S04.T11"

[[bot]]
name          = "planner_rs_v1"
file          = "planner_rs_v1.rs"
sha256        = "41b0d7e2…"
frozen_at     = "2026-09-23"
suite_version = 7
note          = "three accepted rounds on suite v6 (RN-43)"
```

**`pnpm bots:freeze`** — the procedure, in order; any failure rolls back everything before it (BR-S06.T07-10).

```
pnpm bots:freeze --name <botName> --suite <nextSuiteVersion> [--note "…"] [--dry-run]
```

1. **Refuse a re-freeze.** `bots.frozen = 1` for that name, or a `MANIFEST.toml` entry, or a file at the target path → exit 3 naming which. A frozen bot is frozen once.
2. **Refuse a dirty tree.** `git status --porcelain` is non-empty → exit 1. A freeze must name a commit, and a dirty tree cannot (RN-49's discipline applied to code rather than to numbers).
3. **Copy the source.** Concatenate `BotEntry::source_files` that belong to this bot into `bots/frozen/<name>.rs`, rewriting the module paths so the copy is self-contained, and prepend the banner. A source file shared with another live bot is copied, not referenced (BR-S06.T07-02).
4. **Register the copy** in `bots/frozen/mod.rs` and add its `REGISTRY` entry with `frozen: Some(FrozenInfo { … })` and `source_files: ["bots/frozen/<name>.rs"]` — the frozen entry hashes the copy, not the originals.
5. **Append the manifest entry** with the recomputed SHA-256, the date and the suite version.
6. **Build and test.** `cargo test -p ptcg-core frozen` and `cargo test -p ptcg-core policy` must pass — the manifest test and the self-containment test. A failure rolls back steps 3–5.
7. **Verify behaviour.** Run 200 fixed-seed games of the live bot and of the frozen copy on the same pairing and compare `pairing_fingerprint`; a difference means the copy is not the bot and the freeze aborts.
8. **Mark the row.** `UPDATE bots SET frozen = 1, note = ? WHERE name = ? AND frozen = 0`; zero rows changed aborts.
9. **Record it.** Append the row to `engine/BOTS.md` with the date, the hash, the suite version and the bot's headline measured result, and print the summary.

`--dry-run` performs steps 1–2 and prints what steps 3–9 would do. Exit codes: 0 ok, 1 a dirty tree or a git failure, 2 a copy or manifest failure, 3 already frozen, 4 the test or fingerprint check failed, 5 the database was unavailable.

**`pnpm bots:sync` and `pnpm bots:status`.**

```
pnpm bots:sync   [--json]        # reconcile --bots with the bots table (BR-S06.T07-07)
pnpm bots:status [--suite <n>]   # rounds since the last freeze, for RN-43
```

`bots:status` output, which is the RN-43 reminder:

```text
suite v6  (opponent: heuristic, frozen 2026-09-23)
  accepted measurements since the last freeze: 3
  >> RN-43: three rounds reached. Freeze the current bot and open suite v7:
     pnpm bots:freeze --name planner_rs_v1 --suite 7
  bots under test on this suite: planner_rs_v1 (3), rollout_v1 (1)
```

**The RN-43 checklist**, which `bots:freeze` prints and `engine/BOTS.md` keeps:

1. Three accepted (`divergent = 0`) measurements on the current suite show the bot ahead of the previous ruler with a CI excluding 50 % in the mirror.
2. The tree is clean and the commit is recorded.
3. `pnpm bots:freeze --name <bot> --suite <n+1>` passes all nine steps.
4. `pnpm suite:freeze --bot <bot>` ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)) creates suite `n+1` with the newly frozen bot as its opponent.
5. The zero point of the new suite is measured — the newly frozen bot against itself — and recorded, exactly as `HISTORICO.md` records a *"ponto zero da régua"* row for every ruler.
6. Scores from suite `n` and suite `n+1` are never compared (RN-42, [S06.T08](T08-measurement-score-and-mirror.md)).

## Implementation steps

1. Declare `BotKind`, `BotEntry`, `FrozenInfo` and a `REGISTRY` holding `random` and `heuristic` from [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md); implement `find`, `make` and the unknown-name error. `cargo test -p ptcg-core registry` green (BR-S06.T07-09).
2. Write `build.rs` with the framed hash and the `cargo:rerun-if-changed` emission; spec hash stability across two clean builds, sensitivity to a content change and sensitivity to the file list (BR-S06.T07-01).
3. Add the name-pattern, uniqueness and sort tests, and register `planner_rs_v1`, `rollout_v1` and `ismcts_v1` as their subtasks land (BR-S06.T07-04).
4. Implement `listing()` and `ptcg-cli --bots` in both formats; spec that the JSON parses as one object and covers every entry (BR-S06.T07-06).
5. Implement the params-identity rule in `make`: an override on a frozen bot is refused, an override on an unfrozen one is accepted and echoed into the listing's `default_params` diff (BR-S06.T07-05).
6. Create `bots/frozen/` with its `mod.rs` banner and an empty `MANIFEST.toml`; write `frozen::frozen_bot_files_match_the_manifest` checking both directions and spec the three failure modes (BR-S06.T07-03).
7. Write the import-graph policy test over `bots/frozen/*.rs` with its two fixture files, one violating and one legal (BR-S06.T07-02).
8. Implement `pnpm bots:sync` in `apps/worker`: parse `--bots`, insert-if-absent, update unfrozen rows, fail loudly on frozen drift; spec all four behaviours (BR-S06.T07-07).
9. Add the worker's job pre-flight hash check and spec that a drifted frozen bot fails the job before spawning, with both hashes in the message (BR-S06.T07-08).
10. Implement `pnpm bots:freeze` steps 1–9 with rollback, including the fingerprint equality check between the live bot and its copy; spec the happy path, the re-freeze refusal and the rollback (BR-S06.T07-10).
11. Implement `pnpm bots:status` with the RN-43 counter and its warning; spec the count and the warning threshold (RN-43).
12. Freeze the heuristic bot as suite v6's opponent, record the manifest entry, the `engine/BOTS.md` row and the hash, run `pnpm bots:sync` to confirm the database agrees with the binary, then add the docs-lint check that every `REGISTRY` name has an `engine/BOTS.md` row and write the bot table, the freezing procedure and the RN-43 checklist into that file (RN-37, BR-S06.T07-11).

## Edge cases and error handling

- **A frozen bot shares a source file with a live bot.** `planner_rs_v1` lists `view.rs` and `bots/profile.rs` among its sources, and both are live modules that later subtasks will edit. If the freeze merely referenced them, editing `Profile` would change the frozen planner — precisely the legacy's defect. Step 3 of the freeze therefore **copies** everything into one self-contained file and rewrites the paths, and BR-S06.T07-02's policy test is what proves the copy is genuinely detached.
- **The frozen copy behaves differently from the live bot.** A path rewrite can change behaviour silently (a `use` resolving to a different item). Step 7 catches it by running 200 fixed-seed games with each and comparing `pairing_fingerprint` ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)); a mismatch aborts the freeze with both fingerprints printed. A frozen bot that is not the bot it claims to be would corrupt every future ruler.
- **A frozen bot is frozen again for a later suite.** Refused at step 1. A bot is frozen once; if suite v9 wants v7's opponent, it names the already-frozen bot, which is exactly what `suites.opponent_bot_id` is for. Re-copying would create two files claiming the same name.
- **The binary's registry hash differs from a frozen `bots` row.** Two directions, two responses. If the *source* changed, `cargo test` already failed and no binary exists. If a *different* binary is being used — an older checkout, a stale `ENGINE_BIN` — `bots:sync` fails naming both hashes, and the job pre-flight refuses the job (BR-S06.T07-08). Neither path runs games.
- **A job names a bot the binary does not have** (the worker is newer than the engine binary) → exit code 4 with the name, before any game ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)). There is no fallback to `random`: a suite measured against a silently substituted opponent is a number with no meaning attached.
- **A bot's default params change without a code change** — for example `playouts_per_action` moving from 32 to 64. That is a behavioural change, so BR-S06.T07-04 requires a new version name; because `default_params` is one of the hashed source files' contents, `code_hash` changes too, and `bots:sync` refuses to update the row if the bot was frozen. The mechanism and the rule agree.
- **`engine_build` changes under a frozen bot.** The bot's source is unchanged, so `code_hash` is unchanged, but the engine it runs on is different and the measurement is `divergent = 1` ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)). That is the correct split: freezing a bot freezes the bot, not the rules it plays under, and the suite records both hashes so the two are never confused.
- **The freeze is attempted with a dirty working tree** → exit 1 at step 2. A frozen bot's provenance is a commit; `HISTORICO.md`'s own rows carry `+` on nearly every line precisely because the legacy did not enforce this, and a `+` on a *freeze* is worse than a `+` on a measurement because everything downstream inherits it.
- **`MANIFEST.toml` and the directory disagree** (a file deleted by a bad merge) → `frozen::frozen_bot_files_match_the_manifest` fails in the manifest→file direction and names the missing file. The reverse case — a file with no entry — fails too, so neither a silent addition nor a silent deletion survives a test run.
- **Two bots share a name across a rename** → refused by the uniqueness test at compile time; `REGISTRY` is a `const` slice and the test walks it. Renaming a bot would orphan every `measurements` row that cites the old name through `bots.name`, which is why the rule is "never renamed" rather than "renamed carefully".
- **The `bots` row exists but the registry entry is gone** (a bot deleted from the code) → `bots:sync` leaves the row alone and reports it as orphaned; the row must survive because `measurements.bot_id` and possibly `suites.opponent_bot_id` reference it. Deleting a bot from the code is allowed; deleting its row is not.

## Acceptance / verification

- [ ] `cargo test -p ptcg-core registry` green, including `> unknown_bot_name_is_an_error`, `> every_name_matches_the_pattern`, `> names_are_unique_and_never_reused` and `> the_registry_is_sorted_by_name` (BR-S06.T07-04, -09).
- [ ] `> the_hash_is_stable_across_builds` (two clean builds produce the same `code_hash` for every bot), `> the_hash_changes_when_a_source_file_changes`, `> the_hash_covers_every_declared_file` (BR-S06.T07-01).
- [ ] **Editing a frozen bot fails `cargo test`**: changing one byte of `bots/frozen/heuristic_v1.rs` makes `cargo test -p ptcg-core frozen::frozen_bot_files_match_the_manifest` fail naming the file and both hashes; reverting it makes the suite green again (RN-37).
- [ ] `frozen.rs > a_file_without_a_manifest_entry_fails`, `> a_manifest_entry_without_a_file_fails`, `> a_changed_sha256_fails` (BR-S06.T07-03).
- [ ] `policy.rs > a_frozen_bot_imports_no_live_bot_module` fails on the violating fixture (`use super::planner::need;`) and `> a_frozen_bot_may_use_the_engine_api` passes on the legal one (BR-S06.T07-02).
- [ ] **`--bots` lists every registered bot with hashes matching the database**: `ptcg-cli --bots` parses as one JSON object, covers every `REGISTRY` entry, and after `pnpm bots:sync` every listed `code_hash` equals the `bots` row's for the same name (BR-S06.T07-06, -07).
- [ ] `bots.spec.ts > sync inserts a new bot`, `> sync updates an unfrozen bot's hash`, `> sync fails when a frozen bot's hash drifted, naming both hashes`, `> sync never issues an UPDATE against a frozen row` (BR-S06.T07-07).
- [ ] `job-runner.spec.ts > a job naming a drifted frozen bot fails before spawning` and `> the failure message names the bot and both hashes`; `cli.rs > an_unknown_bot_name_exits_4` (BR-S06.T07-08, -09).
- [ ] `> an_override_on_a_frozen_bot_is_refused` and `> an_override_on_an_unfrozen_bot_is_accepted_and_echoed` (BR-S06.T07-05).
- [ ] `bots.spec.ts > freeze writes the file, the manifest and the row`, `> a failing manifest test leaves no file and no row change`, `> freezing twice is refused`; and the step-7 check passes — the live bot and its frozen copy produce identical `pairing_fingerprint` values over 200 fixed-seed games (BR-S06.T07-10).
- [ ] `bots.spec.ts > status counts measurements on the current suite since the last freeze` and `> status warns at three rounds` (RN-43).
- [ ] The heuristic bot is frozen as suite v6's opponent: `MANIFEST.toml` has its entry, `bots.frozen = 1`, `engine/BOTS.md` has its row with the hash and the date, and `pnpm docs:lint` passes the registry↔`BOTS.md` check (RN-37, BR-S06.T07-11).

## Risks and open questions

- **Risk — the self-contained copy diverges from the engine API it was frozen against.** A frozen bot may use `PlayerView` and `Action`; if [S06.T01](T01-honest-information-view.md) or [S04.T05](../04-game-engine-core/T05-actions-and-legality.md) changes those types, the frozen file stops compiling, and the pressure to "just fix the frozen file" is exactly what RN-37 forbids. Mitigation: a compile break is loud and the fix is a *new* frozen version at a new name, with the old suite recorded as no longer runnable on the current build — which the `divergent` flag of [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) already expresses. The alternative, letting a frozen bot rot behind a `#[cfg]`, would be worse; the decision is recorded here so it is not made in a hurry.
- **Risk — hashing source files is not hashing behaviour.** A frozen bot's behaviour also depends on the engine, on the card definitions and on the programs, none of which the hash covers. Mitigation: they are covered by `engine_build` and `rules_snapshot`, and every measurement records all three ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) RN-40); `code_hash` answers only "is this the same bot code", which is the one question the legacy could not answer at all.
- **Risk — the freeze command's path rewriting is a source of silent bugs.** Concatenating several modules into one file and fixing up paths is a small code transformation, and a wrong one produces a bot that compiles and plays differently. Mitigation: step 7's fingerprint comparison over 200 fixed-seed games is the check that matters, and it runs inside the freeze rather than afterwards. If the rewrite proves fragile, the fallback is to keep the frozen bot as a directory of copied modules under `frozen/<name>/`, hashing all of them — a change to BR-S06.T07-01's file list, not to the rule.
- **Risk — RN-43's counter is advisory and will be ignored.** Nothing forces a freeze at three rounds, and a project that keeps improving one bot against one ruler eventually measures itself against a ruler nobody believes. Mitigation: `bots:status` prints the count on every run and [S06.T08](T08-measurement-score-and-mirror.md)'s measurements page shows "rounds since last freeze" next to the suite; making it an error would block legitimate exploratory runs, so it is a visible number rather than a gate.
- **Question — should `params_json` be part of `code_hash` rather than a separate column?** It already is, indirectly: `default_params` is a literal in a hashed source file. Keeping the column as well duplicates the fact, which is useful for querying and dangerous if the two disagree. Recommendation: keep both, and add a `bots:sync` assertion that the row's `params_json` equals the listing's `default_params`; a mismatch is a sync bug, not a policy question.
- **Question — should frozen bots live in the repository at all, or in a released artifact?** Keeping them in-tree means every future build compiles every historical bot, which grows without bound. Recommendation: in-tree while the count is small, with the compile cost measured at the third freeze; if it becomes a burden, the alternative is a per-suite tagged commit plus a recorded `code_hash`, which is weaker (it cannot be tested on every build) and should be a recorded decision rather than a drift.
- **Sizing — this subtask is a registry and a freezing procedure, and could be two.** Steps 1–5 deliver `ptcg-core::bots::registry`, the `build.rs` hash, `--bots` and the params-identity rule — everything a job needs to name a bot exactly. Steps 6–12 deliver `bots/frozen/`, the manifest, the self-containment test, `bots:sync`, `bots:freeze` and `bots:status` — everything RN-37 and RN-43 need. The first half unblocks [S06.T08](T08-measurement-score-and-mirror.md)'s pre-flight on its own; the second half is only needed when the first bot is actually frozen. Not applied here, because both halves are named in this file's Outputs and renumbering is not this pass's to do. Proposed for the user's decision.
- **Question — who decides that a round counts as an "improvement"?** RN-43 counts rounds, and `bots:status` counts measurements; those are not the same thing. Recommendation: the user decides, and the checklist's item 1 states the criterion used here (three accepted measurements with a mirror CI excluding 50 %); if that criterion changes, it changes in `engine/BOTS.md` where it can be read next to the freezes it produced.

## References

- `pokemon/src/pokesearch/sim/frozen/__init__.py` — verified, and it is the whole file: *"Pilotos congelados: cópias exatas do piloto no dia em que viraram oponente de uma régua. NUNCA editar."* The policy this subtask makes mechanical, stated in the legacy as a docstring and nothing more.
- `pokemon/src/pokesearch/sim/policies.py` L407–422 — verified: `_planner(seed)` importing `pilot.planner_policy` lazily with the note *"o piloto importa este módulo; a volta é tardia"*; `_frozen(module)` returning a constructor that `importlib.import_module(f"pokesearch.sim.frozen.{module}")`; the comment *"`heuristic` e `smart` estão CONGELADOS: são a referência da régua (benchmarks/regua_v1.json). Bot novo é em pilot.py."*; and `POLICIES = {"random", "heuristic", "smart", "planner", "planner_v4", "planner_v7", "planner_v9"}` mapping each name to its constructor. The `name → constructor` registry `ptcg-core::bots::registry` replaces, and the naming rule BR-S06.T07-04 keeps.
- `pokemon/src/pokesearch/sim/frozen/planner_v4.py`, `planner_v7.py`, `planner_v9.py` — **present in the clone**, contrary to the note in this pass's brief: 24,516, 27,271 and 29,331 bytes, dated 2026-09-20 in the working copy. Verified from `planner_v9.py`: its first line is the banner `# CONGELADO em 2026-09-20: planner v9, oponente da régua v4. Não editar; o piloto vivo é sim/pilot.py.` — the per-file, dated, suite-naming banner BR-S06.T07-02's convention reproduces; and its L30–32 import `MAX_CHOICE_SCAN, _attack_recipe, _can_pay, _discards_hand, _is_neutral_stadium, _missing, _turn_is_empty` **from the live `pokesearch.sim.policies`**, so all three frozen pilots share mutable helpers with a module that was never frozen. That is the defect BR-S06.T07-02 and the import-graph policy test exist to prevent; nothing in the legacy would have detected an edit to `_can_pay`.
- `pokemon/src/pokesearch/sim/progress.py` L34 — verified: `CURRENT_SUITE = 5` with the inline comment *"a cada 3 rodadas de evolução o piloto otimizado é congelado e vira o oponente da régua seguinte"*, and `BASELINE_PILOT = "heuristic"` at L41. RN-43's legacy form, reproduced here as `bots:status`'s counter and the checklist.
- `pokemon/benchmarks/HISTORICO.md` — verified: the header paragraph *"A cada 3 rodadas o piloto otimizado é congelado (`sim/frozen/`) e vira o oponente de uma régua nova; nota de réguas diferentes não se compara, porque o oponente ficou mais forte"*; the four ruler transitions (`v1 heuristic` → `v2 planner_v4` → `v3 planner_v7` → `v4 planner_v9`), each opening with a *"ponto zero da régua"* row of the newly frozen bot against itself — the checklist's step 5; and the `commit` column carrying `+` on every row, which is why the freeze refuses a dirty tree.
- `pokemon/tests/test_pilot.py::test_frozen_baselines_are_still_registered` — verified: `assert {"heuristic", "smart", "planner"} <= set(POLICIES)`. The legacy's entire mechanical guarantee about its registry: that three names are present. It cannot detect an edit, a rename or a behavioural change, which is the gap the four layers of RN-37 close here.
- `pokemon/ESPECIFICACAO.md` §4.3 RN-37 — verified: *"Bots `heuristic`, `smart`, `planner_v4/v7/v9` estão congelados; bot novo só em `pilot.py`"*, sourced to `sim/policies.py` and `sim/frozen/`; and §4.4 RN-43, sourced to `progress.py:34`.
- [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) — the `bots` table (`name UNIQUE`, `kind` CHECK, `code_hash`, `params_json`, `frozen`), the `bots_frozen_immutable` trigger this subtask relies on (BR-S05.T16-10), the suite freeze that consumes a frozen bot as `opponent_bot_id`, and the `--allow-unfrozen` refusal that makes an unfrozen opponent an explicit exception.
- [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) — the `bot: { name, params, seed }` field, exit code 4 for an unknown bot name, and the rule that the CLI opens no database; [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md) — the first two registry entries, `bots::make`'s shape and BR-S04.T11-10, which names this subtask as the enforcement of RN-37 for the heuristic bot.
- [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) — `pairing_fingerprint`, used by the freeze's step 7 to prove that a copy is the same bot; [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) — the worker's pre-flight, where the drift check runs before a process is spawned.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
