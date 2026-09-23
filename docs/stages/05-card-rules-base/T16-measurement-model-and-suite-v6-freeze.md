# S05.T16 — Measurement model and benchmark suite v6 freeze

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 16 / 16 |
| Depends on | [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md), [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md), [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Unblocks | [S06.T07](../06-bots/T07-bot-registry-and-freezing.md), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md), [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md) |
| Parallel with | [S05.T13](T13-rules-editor-ui.md), [S05.T14](T14-coverage-page-and-authoring-queue.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` meta queries (archetype shares → weights, representative decks) — from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)
- `module` heuristic bot (first frozen opponent) — from [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md)
- `module` worker (`evaluate` job kind, `engine_build`) — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `module` `rulesSnapshot`, coverage per deck — from [S05.T12](T12-evidence-and-coverage-metrics.md)
- `file` `pokemon/src/pokesearch/sim/progress.py` and `pokemon/benchmarks/regua_v5.json` — the legacy suite structure, the CRC seeds and the weighted CI; read-only reference

## Outputs (proposed)
- `file` `packages/db/migrations/0007_measurement.sql` — `bots(id, name UNIQUE, kind, code_hash, params_json, frozen, created_at, note)`, `suites(id, version UNIQUE, name, frozen_at, seed0, deck_version_id, opponent_bot_id, rules_snapshot, engine_build, note)`, `suite_opponents(suite_id, idx, archetype_id, deck_id, weight, share, list_json)`, `measurements(id, suite_id, bot_id, job_id, engine_build, rules_snapshot, git_commit, games, score, ci_low, ci_high, mirror_games, mirror_rate, mirror_ci_low, mirror_ci_high, outcomes_json, avg_turns, note, measured_at)`, `measurement_opponents(measurement_id, idx, games, wins, losses, ties, win_rate, avg_turns, outcomes_json)` — consumed by [S06.T07](../06-bots/T07-bot-registry-and-freezing.md), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md)
- `script` `pnpm suite:freeze --deck <versionId> --top 12 --bot heuristic` → suite v6 row with opponents, weights, seeds (`seed0`), `rules_snapshot`, `engine_build`; `pnpm suite:measure --suite 6 --bot <name>` (thin wrapper until [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) delivers the full measure job)
- `module` `packages/db/src/measure/seeds.ts` — `matchupSeed(seed0, kind, deckId)` = `(seed0 + crc32(parts.join("|"))) % 1_000_000_007`, the CRC-based stable seed the legacy used, exported so the worker and any later bot use the identical function

## Initial objective
A frozen ruler exists for the new engine (RN-40..RN-43): the evaluated deck, its 12 weighted opponents, seeds, the opponent bot, the rules snapshot and the engine build — so every future bot or rules change is measured against the same thing.

## Context

The end goal of the whole project is *"say with a reproducible measurement how much a list wins against the current meta"*. This subtask builds the thing that makes a measurement reproducible, and it closes S05 rather than opening S06 for a specific reason: a score is only comparable when the rules that produced it are pinned, and the rules base only exists now.

The legacy's `sim/progress.py` is the design document. Its opening paragraph states the contract: everything that could vary between two measurements is frozen in a versioned file — the evaluated deck, the opponents' lists, the weights they had in the meta on the day the suite was taken, the seeds and the opponents' pilot — so that *"entre duas medições só muda quem pilota o baralho avaliado"*. `freeze()` carries the instruction in its own docstring: *"Rodar de novo só para criar uma régua NOVA (v2), nunca para 'atualizar'"*. That is RN-41 in one line, and it is the rule most likely to be broken by accident, which is why it is a database constraint here rather than a comment.

Three things are added to the legacy's model and one is corrected.

**Added: `rules_snapshot` and `engine_build`.** This is the revision RN-40 takes. In the legacy, a card's behaviour could change under a frozen suite without anything recording it — `catalog.py` was edited, the score moved, and the history said only that the pilot had changed. With rules as data, the snapshot is a SHA-256 over every active code body and every `text_codes` row ([S05.T07](T07-rule-codes-composition-semantics.md)) and the build is the hash `ptcg-cli --version` prints. A suite freezes both; a measurement records both; a measurement whose pair differs from its suite's is a different experiment and is labelled as one. Without this, the coverage work of this entire stage would silently invalidate every number it touches.

**Added: coverage at freeze time.** A suite whose lists contain cards the engine only approximates measures the approximation, not the list — the legacy said as much in RN-81, which kept approximate cards out of the optimizer's pool. Here the freeze records `exact` and `proven` for the evaluated deck and for every opponent list and refuses outright when the evaluated deck's exact coverage is below a threshold, because a ruler made of rubber is worse than no ruler.

**Added: a real database.** The legacy kept suites as JSON files (`benchmarks/regua_v1.json` … `v5.json`) and history as a JSONL file rendered into Markdown. Tables give foreign keys, an immutability trigger and a join to the deck versions and archetypes that produced them.

**Corrected: the seed function's home.** `_seed` is `(seed0 + zlib.crc32("|".join(parts))) % 1_000_000_007`, with a comment explaining that Python's `hash()` of a string changes per process and is useless for a ruler. The function is right and is kept exactly; what changes is that it lives in one exported module used by the freeze, the worker and every bot, instead of being a private function in the script that happened to need it.

Suite v6 itself uses the user's own list as the evaluated deck, as v5 did (`regua_v5.json`: `deck_id: "usuario:dhelmise-2026-09-21"`, twelve opponents, `seed0: 20260918`, `opponent_pilot: "planner_v9"`). The opponent bot here is the heuristic bot from [S04.T11](../04-game-engine-core/T11-baseline-bots-random-heuristic.md), because it is the only frozen bot that exists; S06 replaces it in later suites as RN-43's three-round cycle turns.

## Scope

- **In scope.** `packages/db/migrations/0007_measurement.sql` with the five tables, their constraints and the suite immutability triggers; `@pokesearch/db/schema` row types; `packages/db/src/measure/seeds.ts`; `pnpm suite:freeze` with its validation, its coverage gate and its refusal to update; `pnpm suite:measure` as a thin wrapper over the `evaluate` job; the weighted score and its delta-method CI; the Wilson CI per pairing with ties = 0.5; the first stored measurement; `GET /api/suites` and `GET /api/suites/:id/measurements`.
- **Out of scope.** The full measure job with its mirror pass and its reporting ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)); bot registration, `code_hash` computation and the freezing process ([S06.T07](../06-bots/T07-bot-registry-and-freezing.md), RN-37, RN-43); the score UI ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)); the optimizer's use of suites ([S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md)–[S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)); the sequential statistics ([S07.T03](../07-deck-optimizer/T03-sequential-confirmation.md)); the meta query that produces archetype shares ([S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)); the engine, the bots and the job protocol.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-40 | **Revised.** A suite freezes the evaluated deck version, the opponents with their lists and weights, `seed0` and the opponent bot — and, new here, the `rules_snapshot` and the `engine_build` in force at freeze time. Between two measurements on one suite, only the bot under test may change; anything else makes the numbers a different experiment. | `suites` stores all seven, all `NOT NULL`; `pnpm suite:measure` compares the current pair against the suite's and labels a mismatch; `measurements` records its own pair | `suite.spec.ts > freeze records deck version, opponents, weights, seed0, bot, rules_snapshot and engine_build`; `> measuring under a different snapshot sets divergent = 1 and the warning is in the response` |
| RN-41 | **Kept.** Suites never update. Every column of `suites` and of `suite_opponents` is immutable after insert; a change is a new `version`. | `BEFORE UPDATE` and `BEFORE DELETE` triggers on both tables; `pnpm suite:freeze` refuses an existing `--version` and always allocates the next one | `suite.spec.ts > UPDATE on suites raises`; `> DELETE on suite_opponents raises`; `> freeze twice creates v6 and v7, never rewrites v6` |
| BR-S05.T16-01 | Every number a measurement reports is reproducible from what the suite and the measurement store: the same suite, bot, `engine_build` and `rules_snapshot` yield the same score, the same per-opponent record and the same fingerprint. | `matchupSeed` is CRC-based and process-independent; the worker passes `seed0` and the derived seeds into the job; [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)'s fingerprint covers the rest | `suite.spec.ts > two measurements of the same bot on the same suite and build produce identical scores and fingerprints`; `> at 1 and at 8 workers the fingerprints match` |
| BR-S05.T16-02 | `matchupSeed(seed0, kind, deckId)` is `(seed0 + crc32(parts.join("|"))) % 1_000_000_007` and is the only seed derivation used anywhere; no code path derives a seed from a language hash, a timestamp or a row id. | `packages/db/src/measure/seeds.ts` is the single export; `pnpm check` greps for `Math.random` and for hash-based seeding in the measurement path | `seeds.spec.ts > matchupSeed matches the legacy values for a fixed seed0 and deck id`; `> the function is pure and process-independent` |
| BR-S05.T16-03 | A suite refuses to freeze when any of its lists is not exactly 60 cards, contains an unresolved line, or falls below the exact-coverage threshold (default 90 % of its own copies); the refusal names the offending cards. | the validation pass in `suite:freeze`, using `coverageForList` from [S05.T12](T12-evidence-and-coverage-metrics.md) | `suite.spec.ts > a 59-card opponent list is refused with its name`; `> a list at 82 % exact coverage is refused with the uncovered cards and their copies` |
| BR-S05.T16-04 | Opponent weights are stored as frozen numbers, normalized to sum to 1 within ±1e-9, and are never recomputed from the live meta at measurement time. | `suite_opponents.weight` is `NOT NULL` and the freeze normalizes; the measure path reads the stored weight | `suite.spec.ts > stored weights sum to 1`; `> changing the live meta does not change a frozen suite's weights` |
| BR-S05.T16-05 | The weighted score is `Σ wᵢ·rᵢ / Σ wᵢ` with ties counted as 0.5, and its 95 % CI is the delta-method interval `± 1.96·√( Σ (wᵢ/Σw)² · rᵢ(1−rᵢ) / max(nᵢ − errorsᵢ, 1) )`, clamped to [0, 1]. Per-opponent intervals are Wilson with z = 1.96. | `weightedScore()` and `wilson()` in `packages/db/src/measure/stats.ts` | `stats.spec.ts > the weighted score and CI match the legacy formula on a fixed fixture`; `> ties count as 0.5`; `> the interval is clamped at the bounds` |
| BR-S05.T16-06 | Every measurement records the git commit, with `+` appended when the working tree is dirty, alongside the build and the snapshot. | `gitCommit()` running `rev-parse --short HEAD` and `status --porcelain`, as the legacy did | `stats.spec.ts > a dirty tree yields a commit ending in +`; `suite.spec.ts > the stored measurement carries commit, engine_build and rules_snapshot` |
| BR-S05.T16-07 | A measurement is written by the worker only, in one transaction with its per-opponent rows, and only for a job that completed; a cancelled or failed job writes nothing. | the worker's completion handler; `measurements.job_id` references `jobs(id)` | `suite.spec.ts > a cancelled evaluate job writes no measurement`; `pnpm check` greps `apps/api` for writes to `measurements` |
| BR-S05.T16-08 | A suite records the evaluated deck's and every opponent's exact and proven coverage at freeze time, so a later reading knows what the ruler was made of. | `suites.deck_exact`/`deck_proven` and `suite_opponents.exact`/`proven`, written by the freeze | `suite.spec.ts > the freeze stores per-list coverage`; the values match `coverageForList` at that moment |
| BR-S05.T16-09 | Scores from different suites are never compared by anything this subtask exposes: the API returns measurements grouped by suite and carries no cross-suite delta. | `GET /api/suites/:id/measurements` is scoped to one suite; there is no endpoint taking two suite ids | `api.spec.ts > there is no cross-suite comparison endpoint` (RN-42, enforced in the UI by [S06.T08](../06-bots/T08-measurement-score-and-mirror.md)) |
| BR-S05.T16-10 | A bot row is identified by `name` and carries a `code_hash`; a frozen bot's `code_hash` and `params_json` may not change. | `bots.name UNIQUE`; a `BEFORE UPDATE` trigger rejecting a change to `code_hash` or `params_json` when `frozen = 1` | `suite.spec.ts > updating a frozen bot's code_hash raises` (the constraint [S06.T07](../06-bots/T07-bot-registry-and-freezing.md) relies on for RN-37) |

## Data operations

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `bots` | C | script (`suite:freeze`), worker | when a bot name is first seen | insert-if-absent on `name`; `code_hash` from the bot registry | [S06.T07](../06-bots/T07-bot-registry-and-freezing.md) |
| `bots` | U | script | only `note`, and only while `frozen = 0` | the trigger rejects `code_hash`/`params_json` changes on a frozen bot | RN-37, BR-S05.T16-10 |
| `suites` | C | script (`pnpm suite:freeze`) | once per new ruler | `version` allocated as `MAX(version) + 1`; all seven frozen fields `NOT NULL` | RN-40 |
| `suites` | U / D | — | never | the two triggers abort | RN-41 |
| `suite_opponents` | C | script (`suite:freeze`) | inside the freeze transaction | one row per opponent, `idx` dense from 0; `list_json` is the full 60-card list | RN-40 |
| `suite_opponents` | U / D | — | never | the two triggers abort | RN-41 |
| `suites`, `suite_opponents` | R | worker, api | every measurement, the suite page | read-only | — |
| `measurements` | C | worker | at the end of a completed `evaluate` job | one row per completed job, in the same transaction as its opponent rows | BR-S05.T16-07 |
| `measurements` | U | worker | only `note` | the score, CI, build, snapshot and commit are never rewritten | — |
| `measurement_opponents` | C | worker | with the measurement | `idx` matching `suite_opponents.idx` | — |
| `measurements`, `measurement_opponents` | R | api | the suite page, [S06.T08](../06-bots/T08-measurement-score-and-mirror.md), [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md) | read-only | — |
| `jobs` | C | api (`pnpm suite:measure` posts one) | starting a measurement | one `evaluate` job per measurement | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) |
| `user_deck_versions`, `decks`, `deck_cards`, `archetypes` | R | script (`suite:freeze`) | building the lists and the weights | read-only | [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md) |
| `card_status`, `card_usage_cache` | R | script (`suite:freeze`) | the coverage gate | read-only | [S05.T12](T12-evidence-and-coverage-metrics.md) |
| `rule_codes`, `text_codes` | R | script (`suite:freeze`) | computing `rules_snapshot` | read-only | [S05.T07](T07-rule-codes-composition-semantics.md) |
| any measurement table | — | engine | never | the engine receives the job JSON and returns lines | Architecture principle 1 |

## Interfaces

**`packages/db/migrations/0007_measurement.sql`**

```sql
-- 0007_measurement.sql — frozen rulers and the measurements taken on them (RN-40..RN-49).
-- Owner: S05.T16 (schema + suite v6). Rows: S05.T16 (freeze), S06.T07 (bots), S06.T08 (measurements).
-- Postgres: *_json TEXT -> jsonb; the immutability triggers become BEFORE triggers calling RAISE EXCEPTION.

CREATE TABLE bots (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,      -- 'heuristic', 'planner_v1', 'rollout_v2'
    kind        TEXT    NOT NULL,             -- random | heuristic | planner | rollout | ismcts
    code_hash   TEXT    NOT NULL,             -- sha256 over the bot's source, from the registry (S06.T07)
    params_json TEXT    NOT NULL DEFAULT '{}',
    frozen      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    note        TEXT,
    CHECK (kind IN ('random', 'heuristic', 'planner', 'rollout', 'ismcts')),
    CHECK (frozen IN (0, 1))
);

CREATE TABLE suites (
    id               INTEGER PRIMARY KEY,
    version          INTEGER NOT NULL UNIQUE,     -- 6, 7, … ; never reused
    name             TEXT    NOT NULL,
    frozen_at        TEXT    NOT NULL,            -- 'YYYY-MM-DD'
    seed0            INTEGER NOT NULL,            -- the base of every matchup seed
    deck_version_id  INTEGER NOT NULL REFERENCES user_deck_versions(id),
    deck_list_json   TEXT    NOT NULL,            -- the 60-card list, frozen (the version may be superseded)
    opponent_bot_id  INTEGER NOT NULL REFERENCES bots(id),
    rules_snapshot   TEXT    NOT NULL,            -- RN-40 revision
    engine_build     TEXT    NOT NULL,            -- RN-40 revision
    meta_format      TEXT    NOT NULL,            -- 'STANDARD'
    meta_days        INTEGER NOT NULL,            -- 90 (RN-03)
    meta_tournaments INTEGER NOT NULL,            -- how many were in the window on that day
    deck_exact       REAL    NOT NULL,            -- coverage of the evaluated list at freeze time
    deck_proven      REAL    NOT NULL,
    note             TEXT,
    CHECK (seed0 > 0),
    CHECK (deck_exact >= 0 AND deck_exact <= 1),
    CHECK (deck_proven >= 0 AND deck_proven <= deck_exact)
);

CREATE TABLE suite_opponents (
    suite_id     INTEGER NOT NULL REFERENCES suites(id),
    idx          INTEGER NOT NULL,
    archetype_id TEXT,
    archetype    TEXT    NOT NULL,
    deck_id      TEXT    NOT NULL,              -- the tournament deck the list came from
    source       TEXT,                          -- player · tournament (date)
    weight       REAL    NOT NULL,              -- normalized; Σ = 1
    share        REAL    NOT NULL,              -- the raw meta share on the freeze day
    list_json    TEXT    NOT NULL,              -- the full 60-card list, frozen
    exact        REAL    NOT NULL,
    proven       REAL    NOT NULL,
    PRIMARY KEY (suite_id, idx),
    CHECK (idx >= 0),
    CHECK (weight > 0 AND weight <= 1)
);

-- RN-41: suites never update. A change is a new version.
-- @postgres: BEFORE triggers calling a RAISE EXCEPTION function; see packages/db/PORTABILITY.md.
-- @sqlite-only
CREATE TRIGGER suites_no_update BEFORE UPDATE ON suites
BEGIN SELECT RAISE(ABORT, 'a suite is immutable; create a new version (RN-41)'); END;
CREATE TRIGGER suites_no_delete BEFORE DELETE ON suites
BEGIN SELECT RAISE(ABORT, 'a suite is immutable; create a new version (RN-41)'); END;
CREATE TRIGGER suite_opponents_no_update BEFORE UPDATE ON suite_opponents
BEGIN SELECT RAISE(ABORT, 'a suite is immutable; create a new version (RN-41)'); END;
CREATE TRIGGER suite_opponents_no_delete BEFORE DELETE ON suite_opponents
BEGIN SELECT RAISE(ABORT, 'a suite is immutable; create a new version (RN-41)'); END;
-- RN-37: a frozen bot's identity may not change (S06.T07 relies on this).
CREATE TRIGGER bots_frozen_immutable BEFORE UPDATE ON bots
WHEN OLD.frozen = 1 AND (NEW.code_hash <> OLD.code_hash OR NEW.params_json <> OLD.params_json)
BEGIN SELECT RAISE(ABORT, 'a frozen bot may not change (RN-37)'); END;
-- @end

CREATE TABLE measurements (
    id             INTEGER PRIMARY KEY,
    suite_id       INTEGER NOT NULL REFERENCES suites(id),
    bot_id         INTEGER NOT NULL REFERENCES bots(id),
    job_id         INTEGER          REFERENCES jobs(id),
    engine_build   TEXT    NOT NULL,
    rules_snapshot TEXT    NOT NULL,
    git_commit     TEXT    NOT NULL,          -- short hash, '+' when the tree was dirty (RN-49)
    divergent      INTEGER NOT NULL DEFAULT 0, -- 1 when build or snapshot differs from the suite's
    games          INTEGER NOT NULL,
    score          REAL    NOT NULL,          -- Σ w·r / Σ w, ties = 0.5
    ci_low         REAL    NOT NULL,
    ci_high        REAL    NOT NULL,
    mirror_games   INTEGER NOT NULL DEFAULT 0,
    mirror_rate    REAL,
    mirror_ci_low  REAL,
    mirror_ci_high REAL,
    outcomes_json  TEXT    NOT NULL DEFAULT '{}',   -- {'loss:deck_out': n, 'win:prizes': n, …}
    avg_turns      REAL,
    errors         INTEGER NOT NULL DEFAULT 0,
    invalid_actions INTEGER NOT NULL DEFAULT 0,
    fingerprint    TEXT,                       -- S04.T10's per-run hash
    seconds        REAL,
    note           TEXT,
    measured_at    TEXT    NOT NULL,
    CHECK (divergent IN (0, 1)),
    CHECK (score >= 0 AND score <= 1),
    CHECK (ci_low <= score AND score <= ci_high)
);
CREATE INDEX measurements_suite_bot_idx ON measurements (suite_id, bot_id, measured_at DESC);

CREATE TABLE measurement_opponents (
    measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
    idx            INTEGER NOT NULL,           -- matches suite_opponents.idx
    games          INTEGER NOT NULL,
    wins           INTEGER NOT NULL,
    losses         INTEGER NOT NULL,
    ties           INTEGER NOT NULL,
    win_rate       REAL    NOT NULL,           -- (wins + ties/2) / games
    ci_low         REAL    NOT NULL,           -- Wilson, z = 1.96
    ci_high        REAL    NOT NULL,
    avg_turns      REAL,
    outcomes_json  TEXT    NOT NULL DEFAULT '{}',
    PRIMARY KEY (measurement_id, idx),
    CHECK (wins + losses + ties <= games)
);
```

**Seeds** — `packages/db/src/measure/seeds.ts`:

```ts
/** (seed0 + crc32(parts.join("|"))) % 1_000_000_007 — process-independent, unlike a language hash. */
export function matchupSeed(seed0: number, ...parts: string[]): number;
export function scoreSeed(seed0: number, deckId: string): number;   // matchupSeed(seed0, "nota", deckId)
export function mirrorSeed(seed0: number, deckId: string): number;  // matchupSeed(seed0, "espelho", deckId)
```

The two literal part strings `"nota"` and `"espelho"` are kept in their legacy Portuguese, because changing them would change every seed and make v6 incomparable with anything derived from the legacy's numbers. They are the one place in the codebase where a pt-BR identifier is deliberate (D-006 allows quoting legacy identifiers verbatim), and the module says so in a comment.

**Statistics** — `packages/db/src/measure/stats.ts`:

```ts
export interface PairResult { games: number; wins: number; losses: number; ties: number; errors: number; }
export function winRate(r: PairResult): number;                       // (wins + ties/2) / games  (RN-45)
export function wilson(successes: number, n: number, z?: number): [number, number];   // z = 1.96
export function weightedScore(rows: { weight: number; result: PairResult }[]):
  { score: number; ciLow: number; ciHigh: number };                   // delta method, clamped to [0,1]
export function gitCommit(cwd: string): string;                       // short hash + '+' when dirty (RN-49)
```

**`pnpm suite:freeze`** — the procedure, in order; any failure aborts before writing anything.

```
pnpm suite:freeze --deck <userDeckVersionId> [--top 12] [--bot heuristic]
                  [--seed0 <n>] [--name "v6"] [--min-exact 0.90] [--dry-run] [--json]
```

1. **Resolve the bot.** Look up `--bot` in `bots` or insert it from the registry with its `code_hash`; refuse when the bot is not `frozen` and `--allow-unfrozen` was not passed, because an opponent that can change is not a ruler.
2. **Resolve the evaluated list.** Read the `user_deck_versions` row, materialize its 60 cards, and freeze them into `deck_list_json` — the version may later be superseded, and the suite must not follow it.
3. **Resolve the opponents.** `metaOpponents(db, { top })` from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md): the top *N* archetypes by share in the RN-03 window, each with a representative 60-card tournament list and its share. Record `meta_format`, `meta_days` and the tournament count in the window that day.
4. **Normalize the weights** so they sum to 1 (the raw `share` is kept alongside).
5. **Validate every list**: exactly 60 cards, no unresolved line, every card present in `cards`. A failure names the list and the offending lines.
6. **Coverage gate**: `coverageForList` for the evaluated deck and each opponent; refuse when the evaluated deck's exact coverage is below `--min-exact` (default 0.90), listing the uncovered cards with their copies. Opponents below the threshold are reported as a warning and recorded, not refused — a weak opponent distorts one weight, a weak evaluated deck distorts everything.
7. **Snapshot the rules and the build**: `rulesSnapshot(db)` and `ptcg-cli --version`.
8. **Allocate the version**: `MAX(version) + 1`, starting at 6. `--version` is not offered; a suite number is never chosen by hand.
9. **Write** `suites` + `suite_opponents` in one transaction, then print the summary: version, deck, twelve opponents with their weights and shares, `seed0`, bot, snapshot, build, and the per-list coverage.

`--dry-run` performs steps 1–8 and prints the summary without writing. Exit codes: 0 ok, 1 a validation failure, 2 the coverage gate, 3 the bot is not frozen, 4 the database or the engine binary is unavailable.

**`pnpm suite:measure`** — the thin wrapper, replaced by [S06.T08](../06-bots/T08-measurement-score-and-mirror.md)'s full job:

```
pnpm suite:measure --suite 6 --bot <name> [--games 100] [--mirror-games 60] [--workers <n>] [--note "…"] [--json]
```

It reads the suite, derives one seed per opponent with `scoreSeed(seed0, deckId)`, posts one `evaluate` job carrying the frozen lists, the bot names, the per-pairing seeds and the game counts, waits for it, computes the weighted score and the CI, and writes `measurements` + `measurement_opponents`. It sets `divergent = 1` and prints a warning when the current `engine_build` or `rules_snapshot` differs from the suite's. The mirror pass is implemented here only as far as recording zeroes when `--mirror-games 0`; the real mirror belongs to [S06.T08](../06-bots/T08-measurement-score-and-mirror.md).

**Endpoints.** `GET /api/suites` → the suite list with version, name, frozen date, deck, opponent count, snapshot and build (short forms), and the latest measurement per bot. `GET /api/suites/:id` → the suite with its opponents, weights and per-list coverage. `GET /api/suites/:id/measurements` → the measurements for that suite only, newest first, with their per-opponent rows. There is deliberately no endpoint that takes two suite ids (RN-42, BR-S05.T16-09).

**The legacy reference point.** `regua_v5.json` is `version 5`, `frozen_at 2026-09-21`, `opponent_pilot "planner_v9"`, `seed0 20260918`, evaluated deck `usuario:dhelmise-2026-09-21`, twelve opponents (the heaviest being Dragapult at weight 0.149546 / share 0.092823). The legacy's best reading on it was 57.3 % (CI 55.5–59.0) for the user's list. Suite v6 keeps `seed0 = 20260918` by default so the matchup seeds are the same numbers, which makes the two rulers as comparable as two rulers on different engines can be — while RN-42 still forbids treating the scores as the same measurement.

## Implementation steps

1. Write `0007_measurement.sql` with `bots`, `suites` and `suite_opponents`, their checks and the five triggers; apply on a temp database and run `PRAGMA foreign_key_check`.
2. Add `measurements` and `measurement_opponents` with their checks and the index.
3. Add the row types in `@pokesearch/db/schema` and run the drift test.
4. Write `packages/db/src/measure/seeds.ts` and spec `matchupSeed` against values computed from the legacy formula for a fixed `seed0` and deck id.
5. Write `packages/db/src/measure/stats.ts` (`winRate`, `wilson`, `weightedScore`, `gitCommit`) and spec each against a fixed fixture, including ties = 0.5 and the clamping.
6. Write `pnpm suite:freeze` steps 1–5 (bot, deck, opponents, weights, list validation) with `--dry-run`; spec the 59-card refusal.
7. Add step 6, the coverage gate, using `coverageForList`; spec the below-threshold refusal and the opponent warning.
8. Add steps 7–9 (snapshot, build, version allocation, transactional write) and the summary output; spec RN-41 by freezing twice.
9. Write `pnpm suite:measure`: seed derivation, job creation, wait, score computation, transactional write of the measurement and its opponent rows, `divergent` detection.
10. Add the three read endpoints.
11. Freeze suite v6 against the user's list with the heuristic bot and record the summary — version, deck, the twelve opponents with weights, `seed0`, `rules_snapshot`, `engine_build`, per-list coverage — in the completion note.
12. Run the first measurement with the heuristic bot, store it, re-run it, and confirm the score and the fingerprint are identical; record both numbers.

## Edge cases and error handling

- **An opponent list is 59 cards or has an unresolved line.** The freeze aborts at step 5 naming the archetype and the lines, exactly as the legacy's `freeze` did (*"{conv.total} cartas, sem implementação: {conv.missing}"*). A ruler with a broken list is worse than no ruler, so this is a refusal, not a warning.
- **The evaluated deck is below the coverage threshold.** Exit 2 with the uncovered cards and their copies in that list. The path forward is the authoring queue ([S05.T14](T14-coverage-page-and-authoring-queue.md)), not a lower threshold — although `--min-exact` exists for a deliberate, recorded exception.
- **An opponent is below the threshold.** Recorded and warned, not refused: it distorts one weight out of twelve and the suite stores its `exact`/`proven` so the distortion is legible later. Refusing would make a suite impossible early in the stage.
- **Someone re-runs `suite:freeze` intending to update.** A new version is created. The trigger makes an actual update impossible, and the command's output leads with the version it allocated so the mistake is visible immediately (RN-41).
- **A card in a frozen list is reprinted or errata'd.** The list is frozen as `list_json`, so the suite keeps playing the cards it froze. What can change under it is the *rules* — a code edit changes `rules_snapshot` and any measurement taken afterwards is `divergent`. That is the whole point of the RN-40 revision.
- **The engine is rebuilt between two measurements.** The second is `divergent = 1`, the API and the UI label it, and the two are not presented as a trend. Comparing them is a judgement the user makes with the labels in front of them, not one the system makes silently.
- **A measurement job is cancelled or the engine crashes.** No measurement row. The job row records the failure ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)); a partial measurement is never stored, because a score over an unknown number of games is not a score.
- **`ci_low > score` from a degenerate result** — every game an error, `n − errors = 0`. The delta-method denominator uses `max(nᵢ − errorsᵢ, 1)`, as the legacy did, and the interval is clamped to [0, 1]; the `CHECK (ci_low <= score AND score <= ci_high)` catches anything that still escapes, so a broken statistic fails loudly at the insert.
- **Two measurements of the same bot on the same suite and build.** Both are stored; the scores must be identical (BR-S05.T16-01) and the test asserts it. A difference means non-determinism, which is [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)'s problem and is exactly what this check is for.
- **The bot is not frozen.** Exit 3. A suite's *opponent* must be frozen (RN-40); the bot *under test* need not be, and `suite:measure` accepts an unfrozen bot while recording its `code_hash` so the measurement still says what it measured.
- **`seed0` collides across suites.** It is intentional: v6 reuses 20260918 so the matchup seeds line up with v5's. Seeds are not required to be unique across suites; what must be stable is the derivation, and `matchupSeed` includes the deck id.

## Acceptance / verification

- [ ] `pnpm db:migrate` applies 0007 on a fresh temp database, `schema_migrations.version = 7`, zero rows, `PRAGMA foreign_key_check` clean, and `schema-drift.spec.ts > 0007 tables match their TypeScript row types` passes.
- [ ] `suite.spec.ts > UPDATE on suites raises`, `> DELETE on suite_opponents raises`, `> freeze twice creates v6 and v7, never rewrites v6` (RN-41).
- [ ] `suite.spec.ts > freeze records deck version, opponents, weights, seed0, bot, rules_snapshot and engine_build` — all seven are non-null in the stored row (RN-40).
- [ ] `seeds.spec.ts > matchupSeed matches the legacy values for a fixed seed0 and deck id` — `(20260918 + crc32("nota|api:…")) % 1_000_000_007`, and the same value in two processes (BR-S05.T16-02).
- [ ] `stats.spec.ts > the weighted score and CI match the legacy formula on a fixed fixture`, `> ties count as 0.5`, `> the interval is clamped at the bounds`, `> a dirty tree yields a commit ending in +` (BR-S05.T16-05, -06).
- [ ] `suite.spec.ts > a 59-card opponent list is refused with its name` and `> a list at 82 % exact coverage is refused with the uncovered cards and their copies` (BR-S05.T16-03).
- [ ] `suite.spec.ts > stored weights sum to 1` within 1e-9 and `> changing the live meta does not change a frozen suite's weights` (BR-S05.T16-04).
- [ ] Suite v6 is frozen against the user's deck version with the heuristic bot: the summary lists the twelve opponents with their weights and shares, `seed0`, the rules snapshot, the engine build and the per-list coverage, and is recorded in the completion note (RN-40, BR-S05.T16-08).
- [ ] A first measurement with the heuristic bot is stored with its score, CI, per-opponent rows, commit, build, snapshot and fingerprint; re-running it produces an identical score and an identical fingerprint, at 1 worker and at 8 (BR-S05.T16-01).
- [ ] `suite.spec.ts > measuring under a different snapshot sets divergent = 1` — edit a code, re-measure, and the row is labelled (RN-40).
- [ ] `suite.spec.ts > a cancelled evaluate job writes no measurement`; `pnpm check` finds no write to `measurements` from `apps/api` (BR-S05.T16-07).
- [ ] `suite.spec.ts > updating a frozen bot's code_hash raises` (BR-S05.T16-10) and `api.spec.ts > there is no cross-suite comparison endpoint` (BR-S05.T16-09).

## Risks and open questions

- **Risk — suite v6 is frozen before the rules base is good enough**, and every S06 measurement is taken against a ruler whose cards are half approximate. Mitigation: the coverage gate (step 6) with a 90 % default on the evaluated deck, the per-list coverage stored on the suite, and the position of this subtask last in the stage, after the importers and the first scenario run.
- **Risk — the `divergent` label is ignored** and two incomparable numbers are read as a trend. Mitigation: it is a column, it is in the API response, and [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) renders divergent measurements in a separate group. RN-42 already forbids comparing across suites; this extends the same caution inside one.
- **Risk — the immutability triggers make a legitimate correction impossible** (a typo in `name` or `note`). Mitigation: `note` and `name` are covered by the blanket trigger here, which is stricter than necessary. If that proves painful, the narrow fix is a `WHEN` clause allowing only those two columns — a decision to record rather than to make silently, since every loosening of RN-41 is a step back toward a ruler that moves.
- **Risk — `metaOpponents` returns a different twelve than the legacy's**, making v6 unrecognisable beside v5. Mitigation: `seed0` is kept, the shares are stored beside the weights, and the freeze summary prints both sets so the difference is visible and attributable to the meta window rather than to the code.
- **Question — should suite v6 reuse the legacy's `seed0 = 20260918`?** It does by default, so matchup seeds line up. The counter-argument is that identical seeds invite exactly the cross-suite comparison RN-42 forbids. Recommendation: keep it and rely on the labelling; the user decides, and it is one flag.
- **Question — should the evaluated deck be frozen as a list or as a version reference?** Both are stored: `deck_version_id` for provenance and `deck_list_json` for the actual cards, because a user deck version can be superseded and a suite must not follow. Worth confirming, since it means editing the deck does not change the suite — which is the intent.
- **Question — where does the mirror pass belong?** The columns are here so the schema is complete, but the implementation is [S06.T08](../06-bots/T08-measurement-score-and-mirror.md)'s (RN-44). `pnpm suite:measure` records zeroes until then. If the user wants a mirror number from suite v6 immediately, it is a small addition to the wrapper.
- **DEPENDENCY-PROPOSAL: S05.T16 should depend on S03.T11 because** `suites.deck_version_id` references `user_deck_versions(id)` and the freeze reads that table to materialize the evaluated list; today the dependency is only implied through [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md).
- **DEPENDENCY-PROPOSAL: S05.T16 should depend on S04.T14 because** `measurements.job_id` references `jobs(id)` and migration 0007 cannot apply before 0005; today the jobs schema is reached only transitively through [S04.T15](../04-game-engine-core/T15-worker-job-runner.md).
- **Sizing — this subtask is a migration and a procedure, and could be two.** Steps 1–5 deliver `0007_measurement.sql`, the row types and the two pure modules (`seeds.ts`, `stats.ts`); steps 6–12 deliver the freeze command, the measure wrapper, the endpoints and suite v6 itself. That is exactly the split the stage already makes between [S05.T01](T01-rules-schema-migration.md) and everything that writes into it, and it would let S06 start against the schema before v6 is frozen. Not applied here, because both halves are in this file's Outputs and renumbering is not this pass's to do. Proposed for the user's decision.

## References

- `pokemon/src/pokesearch/sim/progress.py` — verified: the module docstring stating exactly what a ruler freezes and why (*"Entre duas medições só muda quem pilota o baralho avaliado — é isso que faz o número medir a evolução do bot"*) and the two readings (weighted score and mirror); `freeze(conn, deck_id, top=12)` with its *"Rodar de novo só para criar uma régua NOVA (v2), nunca para 'atualizar'"* and its 60-card / no-missing validation; `_seed(suite, *parts) = (suite["seed0"] + zlib.crc32("|".join(parts).encode())) % 1_000_000_007` with the note that `hash()` of a string changes per process; `measure(suite, pilot, games=100, mirror_games=60)` with `_seed(suite, "nota", deck_id)` and `_seed(suite, "espelho", deck_id)`; `_weighted(per)` computing `Σ w·r / Σw` and the delta-method half-width `1.96·√(Σ (w/Σw)² · r(1−r) / max(games − errors, 1))`; `_commit()` appending `+` on a dirty tree; `CURRENT_SUITE = 5` and the three-round freezing cycle. Consult for every formula and for the freeze procedure.
- `pokemon/benchmarks/regua_v5.json` — verified: `version 5`, `frozen_at "2026-09-21"`, `opponent_pilot "planner_v9"`, `seed0 20260918`, `deck.deck_id "usuario:dhelmise-2026-09-21"`, twelve opponents each with `archetype_id`, `archetype`, `weight`, `share`, `deck_id`, `source` and `export` (the heaviest being Dragapult, weight 0.149546 / share 0.092823), and a `note` recording what changed from v4. The structure the five tables normalize.
- `pokemon/src/pokesearch/sim/progress.py` L182–196 (`render_history`) — verified: the history table's columns (régua, contra, data, piloto, nota, IC 95 %, espelho, IC 95 %, turnos, perde por fim de deck, perde sem Pokémon, erros, commit, o que mudou) and the note that scores from different rulers are not comparable because the opponent got stronger (RN-42). Consult for what a measurement must store to be readable a month later.
- `pokemon/src/pokesearch/sim/runner.py` — the Wilson CI and ties = 0.5 that `stats.ts` reproduces (RN-45); consulted through [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), which owns that pairing code.
- [Vision and scope](../../project/01-vision-and-scope.md) §"Success metrics" — verified: the legacy score of 57.3 % (CI 55.5–59.0) for the user's list on suite v5, and "suite v6 baseline established in S05".
- [S05.T07](T07-rule-codes-composition-semantics.md) (`rulesSnapshot` and its field list), [S05.T12](T12-evidence-and-coverage-metrics.md) (`coverageForList`, the coverage gate's input), [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md) (archetype shares and representative decks), [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) (fingerprints and the 1-versus-N-worker guarantee), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) (the `evaluate` job and `engine_build`), [S06.T07](../06-bots/T07-bot-registry-and-freezing.md) (bot registration, `code_hash`, RN-37, RN-43) and [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) (the full measure job and the mirror).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
