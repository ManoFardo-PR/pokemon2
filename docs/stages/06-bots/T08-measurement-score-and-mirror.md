# S06.T08 — Measurement job: score and mirror

| Field | Value |
|---|---|
| Stage | S06 — Bots |
| Status | TODO |
| Order in stage | 8 / 8 |
| Depends on | [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S06.T07](T07-bot-registry-and-freezing.md) |
| Unblocks | — |
| Parallel with | [S06.T03](T03-planner-turn-policy.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` worker dispatcher — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `module` `wilson()` and `weightedScore()` — from [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)
- `table` `suites`, `suite_opponents`, `measurements` — from [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)
- `module` bot registry — from [S06.T07](T07-bot-registry-and-freezing.md)
- `doc` ESPECIFICACAO.md RN-44..RN-49

## Outputs (proposed)
- `module` worker kind `measure { suiteId, botName, games, mirrorGames }` — score: for each opponent, `games` paired games with `seed_base = crc32(suite.seed0, 'score', deck_id)`; weighted score Σ weight × win rate with the delta-method 95 % CI; mirror: same list on both sides for the evaluated deck and every opponent list; writes `measurements` + `measurement_opponents` with `engine_build`, `rules_snapshot`, `git_commit` (+`+` when the tree is dirty, RN-49)
- `module` web route `/measurements` — history table per suite (score, CI, mirror, avg turns, deck-out losses, bot, build, commit, note); cross-suite comparisons are not offered (RN-42)

## Initial objective
Bot progress is measured the legacy way — fixed suite, weighted score, mirror to separate bot skill from deck quality — but on the new engine, with every input that affects the number recorded.

## Context

This is the last subtask of the stage and it is the one the stage exists for. Everything before it produced bots; this produces the number that says whether a bot is better, and the number is only worth having if it cannot lie. The legacy's `sim/progress.py` is the design document, and its opening paragraph is the contract: everything that could vary between two measurements is frozen in a versioned file, so *"entre duas medições só muda quem pilota o baralho avaliado — é isso que faz o número medir a evolução do bot"*. [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) built that frozen side; [S06.T07](T07-bot-registry-and-freezing.md) made the opponent immovable; this file runs the games and writes the row.

RN-44 asks for **two** readings, and the reason is worth restating because a single number would be cheaper and wrong. The **score** is the evaluated list, piloted by the bot under test, against each ruler opponent piloted by the frozen bot, weighted by the archetype's meta share. It answers "how does this list do against the field", which is what the optimizer consumes. The **mirror** is the bot under test against the frozen bot with the *same list on both sides*, across the evaluated list and every opponent list. It answers "is this bot better", with the deck held constant. The legacy history shows why both are needed: between suite v2's first and last rows the score moved 74.9 % → 76.6 %, barely outside noise, while the mirror moved 49.4 % → 54.6 % — the improvement was real and the score was mostly measuring a deck that was already good. The mirror is the reading that cannot be explained by the list.

Six rules govern the arithmetic and each is inherited exactly. RN-45: a tie counts as half a win and the interval is Wilson with `z = 1.96` — [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) already owns `wilson()` and `weightedScore()`, and this subtask calls them rather than reimplementing them, because two implementations of one formula is how a measurement stops being comparable with itself. RN-46: every matchup's seed is `(seed0 + crc32(parts.join("|"))) mod 1_000_000_007`, from [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)'s `matchupSeed`, with the legacy's literal part strings `"nota"` and `"espelho"` kept in Portuguese so the numbers line up. RN-49: the commit, with `+` appended when the tree was dirty. RN-42: scores from different suites are never compared — no endpoint takes two suite ids and the page offers no control that would. RN-48: differences under about three points at 1,200 games are noise, so the page shows the interval and never a bare point estimate, and never a verdict.

And then there is the defect this subtask exists to make impossible. `ESPECIFICACAO.md` §6.3 records it as pending item P1: *"Espelho da régua v5 não produz dado: as duas linhas mostram `0.0 % (IC 0.0 %–100.0 %)`. Ninguém investigou."* Both suite v5 rows in `HISTORICO.md` carry that mirror, and §1.3 lists the mirror metric for v5 as *"sem dado válido"*. The mechanism is verifiable from the source and from the history file, and it is three small pieces fitting together: `measure()` skips the mirror loop entirely when `mirror_games` is falsy (`for entry in lists if mirror_games else []`), so `mirror.games` stays 0; `BatchResult.win_rate` returns `0.0` when the denominator is zero; and `wilson(successes, 0)` returns `(0.0, 1.0)`. Three defensible local choices compose into a row that is indistinguishable, in the rendered table, from a bot that lost every mirror game with enormous uncertainty. `historico.jsonl` confirms it directly: both v5 rows carry `"mirror": {"games": 0, "win_rate": 0.0, "ci": [0.0, 1.0], "record": [0, 0, 0]}`.

The fix chosen here is **impossible at the schema, and loud at the job**, in that order.

*Impossible*: the mirror columns are "absent or complete". `mirror_rate`, `mirror_ci_low` and `mirror_ci_high` stay `NULL` when `mirror_games` is 0, and a `CHECK ((mirror_games = 0) = (mirror_rate IS NULL))` makes the v5 row literally unrepresentable — the insert raises. A second `CHECK` forbids a stored interval spanning the whole `[0, 1]` range, because an interval that says nothing is not a measurement. The UI renders `NULL` as `—`, never as `0.0 %`.

*Loud*: the measure job refuses `mirrorGames = 0` unless `--no-mirror` is passed explicitly, records `mirror_skipped_reason` when it is, and asserts `mirror_lists` against the suite's list count before writing. A mirror that ran on fewer lists than the suite has is a partial mirror and is stored as one, with the count visible.

The `wilson()` of [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) keeps its `n <= 0 → [0, 1]` contract, because the Evaluate page's own BR-S04.T17-05 already guards it with an explicit zero-games failure state. The measurement path uses a sibling, `wilsonOrNull`, which returns `null` instead. Changing the shared function would be a wider blast radius than the bug deserves.

## Scope

- **In scope.** The `measure` worker job kind: its params schema, its two passes, its progress shape and its `result_json`; the fan-out into engine `evaluate` requests and the aggregation back; the seed derivation per matchup through [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)'s `scoreSeed`/`mirrorSeed`; `wilsonOrNull` and the mirror nullability discipline; migration `0008_measurement_mirror.sql` adding the mirror columns, the `bot_code_hash` column and the CHECK constraints to `measurements` and `measurement_opponents`; the transactional write of a measurement with its opponent rows; the `divergent` and RN-49 provenance; `GET /api/suites/:id/measurements` extensions and the `/measurements` web route with its per-suite history table and its Δ-with-interval comparison; the noise statement of RN-48; the pre-flight bot-hash check.
- **Out of scope.** The suite tables, the freeze command, `matchupSeed`, `weightedScore` and `wilson` ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)); the worker's lifecycle, claim, spawn and cancellation ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); the engine, the job protocol and the `evaluate` kind ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)); the bots and their registry ([S06.T03](T03-planner-turn-policy.md)–[S06.T07](T07-bot-registry-and-freezing.md)); the Evaluate page, which measures against a chosen field rather than a frozen ruler ([S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)); sequential confirmation, holdout acceptance and the optimizer's statistics ([S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md)–[S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)); coverage numbers ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-42 | **Kept.** Scores from different suites are never compared. The API exposes no endpoint taking two suite ids; the `/measurements` page groups rows by suite, renders one suite at a time, offers no control that places two suites' numbers in one comparison, and states in the page header why. | `GET /api/suites/:id/measurements` scoped to one suite ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) BR-S05.T16-09); the route's single-suite data model | `api.spec.ts > there is no cross-suite comparison endpoint`; `measurements.spec.tsx > the page renders one suite at a time`; `> there is no control that compares two suites` |
| RN-44 | **Kept.** A measurement has two readings. **Score**: the evaluated list piloted by the bot under test against each of the suite's opponents piloted by the suite's frozen bot, `games` games per opponent, combined as Σ weight × win rate. **Mirror**: the bot under test against the frozen bot with the same list on both sides, over the evaluated list and every distinct opponent list, `mirrorGames` games per list. Both are stored with their intervals; neither substitutes for the other. | the `measure` handler's two passes; `measurements.score`/`ci_*` and `mirror_rate`/`mirror_ci_*` | `measure.spec.ts > a measurement stores both readings`; `> the mirror covers the evaluated list and every distinct opponent list`; `> the score pass and the mirror pass use different seeds` |
| RN-45 | **Kept.** A tie counts as half a win: per pairing `p = (wins + 0.5·ties) / (wins + losses + ties)`, and its interval is `wilson(wins + 0.5·ties, wins + losses + ties, 1.96)`. The weighted score is `Σ wᵢ·pᵢ / Σ wᵢ` with the delta-method half-width `1.96·√( Σ (wᵢ/Σw)² · pᵢ(1−pᵢ) / max(nᵢ − errorsᵢ, 1) )`, clamped to `[0, 1]`. Both come from [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)'s module; this subtask reimplements neither. | `winRate`, `wilson`, `weightedScore` imported from `apps/api/src/stats/wilson.ts` ([S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)) | `measure.spec.ts > ties count as half a win in every stored rate`; `> the weighted score matches weightedScore on the same fixture`; `> errored games leave the denominator`; `pnpm check` finds no second implementation of `wilson` in the measurement path |
| RN-46 | **Kept.** Every matchup's seed is `(seed0 + crc32(parts.join("\|"))) mod 1_000_000_007`: the score pass uses `scoreSeed(seed0, deckId)` = `matchupSeed(seed0, "nota", deckId)`, the mirror pass `mirrorSeed(seed0, listDeckId)` = `matchupSeed(seed0, "espelho", listDeckId)`. Game *i* of a pairing uses `seed_base + i`, and sides alternate by game index so each pairing is balanced for the first-player advantage. No seed is derived from a timestamp, a row id or a language hash. | `packages/db/src/measure/seeds.ts` ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) BR-S05.T16-02) as the only source; the engine's index-based side alternation ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)) | `measure.spec.ts > the score seeds match matchupSeed for a fixed seed0 and deck id`; `> the mirror seeds use the espelho part`; `> the same measurement re-run produces identical seeds and identical fingerprints` |
| RN-48 | **Revised into the statistics plan.** A point estimate is never shown alone. Every score, every mirror rate and every per-opponent rate is rendered with its 95 % interval; the page shows the interval half-width for the run's game count and states the noise floor in the same units; and a comparison between two measurements on one suite renders Δ **with the interval of Δ**, saying plainly when that interval contains zero. The page renders no "better"/"worse" verdict. | the `ScoreCard` and `MeasurementDelta` components; `deltaCi(a, b)` for two independent proportions | `measurements.spec.tsx > a score is never rendered without its interval`; `> a delta is rendered with its own interval`; `> a delta whose interval contains zero is labelled inconclusive`; `> the page renders no verdict word` |
| RN-49 | **Kept.** Every measurement records the git commit with `+` appended when the working tree was dirty, alongside `engine_build`, `rules_snapshot` and — new here — the bot's `code_hash` at the moment of measurement. | `gitCommit()` ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) BR-S05.T16-06); `measurements.git_commit`, `engine_build`, `rules_snapshot`, `bot_code_hash`, all `NOT NULL` | `measure.spec.ts > a dirty tree yields a commit ending in +`; `> the stored measurement carries commit, build, snapshot and bot hash`; `> the four provenance columns are NOT NULL` |
| BR-S06.T08-01 | **The mirror is absent or complete, never zero.** `mirror_rate`, `mirror_ci_low` and `mirror_ci_high` are `NULL` exactly when `mirror_games = 0`, enforced by `CHECK ((mirror_games = 0) = (mirror_rate IS NULL))`; a stored interval may not span `[0, 1]`, enforced by `CHECK (mirror_rate IS NULL OR mirror_ci_high - mirror_ci_low < 0.999)`. The measurement path uses `wilsonOrNull`, which returns `null` for `n = 0` rather than `[0, 1]`. The legacy's v5 row — `mirror_games = 0` with `mirror_rate = 0.0` and `ci = [0, 1]` — cannot be inserted. | the two `CHECK`s in `0008_measurement_mirror.sql`; `packages/db/src/measure/stats.ts::wilsonOrNull` | `measure.spec.ts > inserting the legacy v5 mirror row raises` (the exact `{games: 0, rate: 0.0, ci: [0,1]}` tuple); `> a zero-game mirror stores NULLs`; `stats.spec.ts > wilsonOrNull returns null at n = 0`; `measurements.spec.tsx > a null mirror renders an em dash, not 0 %` |
| BR-S06.T08-02 | **A skipped mirror is loud.** `mirrorGames = 0` is refused unless `noMirror: true` is passed explicitly; when it is, `mirror_skipped_reason` is stored and the row is rendered with a "mirror not run" marker rather than an empty cell. A mirror that ran on fewer lists than the suite has is stored with its real `mirror_lists` and marked partial. | the params schema's refinement; the handler's assertion of `mirror_lists` against `suite_opponents` count + 1 | `measure.spec.ts > mirrorGames 0 without noMirror is rejected with a named error`; `> noMirror stores a reason`; `> a partial mirror stores its real list count`; `measurements.spec.tsx > a skipped mirror is marked, not blank` |
| BR-S06.T08-03 | The mirror covers the evaluated list **plus every distinct opponent list**: `mirror_lists = 1 + |{opponent deck_id} \ {evaluated deck_id}|`. Each list's own mirror record is stored in `measurement_opponents`, the evaluated list at `idx = -1` and each opponent at its `suite_opponents.idx`. | the handler's list construction, mirroring `progress.py`'s `[deck] + [o for o in opponents if o.deck_id != deck.deck_id]`; the `idx = -1` convention | `measure.spec.ts > a twelve-opponent suite mirrors thirteen lists`; `> an opponent whose deck id equals the evaluated deck is not mirrored twice`; `> the evaluated list's mirror row is idx -1` |
| BR-S06.T08-04 | A measurement is written **once**, by the worker, in one transaction with all its `measurement_opponents` rows, and only for a job that reached `done`. A cancelled, failed or partial job writes nothing. A score over an unknown number of games is not a score. | the `measure` handler's `onDone`; `measurements.job_id` referencing `jobs(id)` ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) BR-S05.T16-07) | `measure.spec.ts > a cancelled measure job writes no measurement`; `> a failed score pass writes no measurement`; `> the measurement and its opponent rows are one transaction`; `pnpm check` finds no write to `measurements` from `apps/api` |
| BR-S06.T08-05 | A measurement is reproducible: the same suite, bot, bot params, `engine_build` and `rules_snapshot` produce an identical score, identical per-opponent records and identical `fingerprint` values, at any worker count. | `matchupSeed`'s purity, the engine's index-ordered aggregation ([S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md) BR-S04.T10-06) and the frozen `list_json` | `measure.spec.ts > two measurements of the same bot on the same suite and build give identical scores and fingerprints`; `> at 1 and at 8 workers the fingerprints match` |
| BR-S06.T08-06 | The bot under test is identified by name **and** by `code_hash` at measurement time: `measurements.bot_code_hash` is written from the `--bots` listing, a params override on a frozen bot is refused, and a job whose bot hash differs from its `bots` row fails before any game runs. Without the stored hash, an unfrozen bot could improve and every historical row would silently point at the new code. | the pre-flight check of [S06.T07](T07-bot-registry-and-freezing.md) BR-S06.T07-08; `measurements.bot_code_hash NOT NULL` | `measure.spec.ts > the stored measurement carries the bot code hash from the listing`; `> a params override on a frozen bot is refused`; `> a drifted bot fails the job before spawning` |
| BR-S06.T08-07 | Every pairing's engine request carries the suite's **frozen** `list_json`, never a live deck version or a live tournament list; the suite's `seed0` and its opponent bot name come from the suite row. Nothing in the measurement path reads the current meta. | the handler building `deck_a`/`deck_b` from `suites.deck_list_json` and `suite_opponents.list_json` | `measure.spec.ts > the request uses the frozen lists`; `> editing the underlying deck version does not change a measurement's request`; `> editing the live meta does not change the weights` |
| BR-S06.T08-08 | `invalid_actions` and `errors` are aggregated across both passes, stored on the measurement, and rendered next to the score. A non-zero `invalid_actions` means RN-21's default resolver partly played the game, so the number is partly the engine's and not the bot's; the page marks such a row. | the handler summing the `result` lines' counters ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md)); `measurements.invalid_actions`, `errors` | `measure.spec.ts > invalid actions and errors are summed across both passes`; `measurements.spec.tsx > a row with invalid actions is marked` |
| BR-S06.T08-09 | Progress is reported per phase and per pairing: `jobs.progress_json` carries `{ phase: "score" \| "mirror", done, total, perPairing: [...] }`, written at most every 500 ms by the worker's throttle, so a measurement that takes minutes is legible while it runs. | the handler's progress mapper on top of [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) BR-S04.T15-03 | `measure.spec.ts > progress names the phase`; `> progress writes are at most one per 500 ms`; `> the final progress reflects both phases complete` |
| BR-S06.T08-10 | `outcomes_json` records how the games ended **from the evaluated side**, so `loss:deck_out` is this bot drawing itself to death and is reported as its own figure. The page shows the deck-out and no-Pokémon loss shares next to the score, as the legacy's history table did. | the handler's orientation of the engine's `outcomes` object by pairing side; `measurements.outcomes_json`, `loss_by_deck_out`, `loss_by_no_pokemon` | `measure.spec.ts > outcomes are oriented to the evaluated side`; `> the deck-out share matches the outcomes object`; `measurements.spec.tsx > the history table shows the deck-out share` |

## Data operations

The engine never opens the database; the **worker** is the only writer of measurement tables (Architecture principle 2). The api reads.

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl/user) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `jobs` | C | api | the user starts a measurement | one `measure` job per request; params validated against `MeasureParams` | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) |
| `jobs` | U (`status`, `engine_build`, `rules_snapshot`, `progress_json`, `result_json`) | worker | claim, pre-flight, throttled progress, completion | as [S04.T15](../04-game-engine-core/T15-worker-job-runner.md); `progress_json` carries the phase (BR-S06.T08-09) | RN-49 |
| `suites`, `suite_opponents` | R | worker | building both passes | read-only; `deck_list_json` and `list_json` are the frozen lists (BR-S06.T08-07) | RN-40 |
| `bots` | R | worker | pre-flight hash and frozen-params check | read-only; a drift fails the job (BR-S06.T08-06) | [S06.T07](T07-bot-registry-and-freezing.md) |
| `job_pairings` | C/U | worker | per engine pairing of both passes | as [S04.T15](../04-game-engine-core/T15-worker-job-runner.md); `fingerprint` written once | RN-50 |
| `measurements` | C | worker | once, at `done`, in one transaction with its opponent rows | one row per completed job; the mirror CHECKs make a zero-game mirror with a rate unrepresentable (BR-S06.T08-01, -04) | RN-44, RN-45, RN-49 |
| `measurements` | U (`note`) | worker, api | a user note | the score, intervals, build, snapshot, commit and bot hash are never rewritten | — |
| `measurements` | D | — | never | a deleted measurement erases the history RN-43's cycle depends on | RN-41's spirit |
| `measurement_opponents` | C | worker | with the measurement, one row per opponent plus one at `idx = -1` for the evaluated list's mirror | `PRIMARY KEY (measurement_id, idx)`; score columns from the score pass, mirror columns from the mirror pass (BR-S06.T08-03) | RN-44 |
| `measurements`, `measurement_opponents` | R | api | `GET /api/suites/:id/measurements`, the `/measurements` page | read-only; scoped to one suite (RN-42) | [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) |
| any measurement table | C/U/D | api | never | `pnpm check` greps `apps/api` for writes | BR-S06.T08-04 |
| any table | C/U/D | engine | never | the engine receives the job JSON and returns lines | Architecture principle 1 |

**The `measure` job's protocol messages.** `measure` is a *worker* kind; it fans out into engine `evaluate` requests, which are the only thing the engine understands ([S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) kinds are `evaluate | scenarios | replay`).

| Direction | Message | Fields | When |
|---|---|---|---|
| in (api → `jobs`) | `measure` params | `suiteId`, `botName`, `botParams`, `games`, `mirrorGames`, `noMirror`, `workers`, `note` | the user starts a measurement |
| worker → engine (stdin) | `job` (`kind: "evaluate"`), score pass | `card_defs` for the union of all frozen lists; one `pairing` per opponent: `deck_a` = the evaluated list, `deck_b` = opponent *i*'s list, `bot_a` = the bot under test, `bot_b` = the suite's frozen bot, `games`, `seed_base = scoreSeed(seed0, deckId)`, `weight`, `label` = archetype | after the pre-flight |
| engine → worker | `progress` | `pairing`, `done`, `total`, `w`, `l`, `t` | every `progress_every` (200) games |
| engine → worker | `result` | `pairing`, `games`, `wins`, `losses`, `ties`, `outcomes`, `avg_turns`, `invalid_actions`, `errors`, `fingerprint` | once per pairing |
| engine → worker | `done` | `seconds`, `games`, `engine_build` | once per pass |
| worker → `jobs` | `progress_json` | `{ phase: "score", done, total, perPairing: [{ idx, label, done, total, w, l, t }] }` | throttled to 500 ms (BR-S06.T08-09) |
| worker → engine (stdin) | `job` (`kind: "evaluate"`), mirror pass | one `pairing` per mirrored list: `deck_a = deck_b =` that list, `bot_a` = the bot under test, `bot_b` = the frozen bot, `games = mirrorGames`, `seed_base = mirrorSeed(seed0, deckId)`, `label` = the list's archetype | after the score pass completes |
| worker → `jobs` | `progress_json` | `{ phase: "mirror", … }` | as above |
| worker → database | `measurements` + `measurement_opponents` | the full row set, in one transaction | at `done` of the mirror pass (BR-S06.T08-04) |
| worker → `jobs` | `result_json` | `{ measurementId, score, ci, mirror, mirrorCi, mirrorLists, games, seconds, invalidActions, errors, opponentModelledShare? }` | at completion |
| engine → worker | `error` | `message`, `pairing?` | a pairing failed; the pass records it and no measurement is written if the score pass failed |

**Score and mirror, exactly** (RN-44, RN-45, RN-46):

```text
score pass
  for each opponent i of the suite:
      seed_base_i = matchupSeed(suite.seed0, "nota", opponents[i].deck_id)
      pairing_i   = (evaluated list, opponents[i].list, bot_under_test, suite.opponent_bot,
                     games, seed_base_i, weight_i)
  p_i   = (wins_i + 0.5·ties_i) / (wins_i + losses_i + ties_i)          -- RN-45
  ci_i  = wilson(wins_i + 0.5·ties_i, wins_i + losses_i + ties_i, 1.96) -- RN-45
  score = Σ w_i·p_i / Σ w_i                                              -- weightedScore (S04.T17)
  half  = 1.96·√( Σ (w_i/Σw)² · p_i(1−p_i) / max(games_i − errors_i, 1) )
  ci    = clamp([score − half, score + half], 0, 1)

mirror pass                                                             -- RN-44
  lists = [evaluated] + [o for o in opponents if o.deck_id != evaluated.deck_id]
  for each list L:
      seed_base_L = matchupSeed(suite.seed0, "espelho", L.deck_id)
      pairing_L   = (L.list, L.list, bot_under_test, suite.opponent_bot,
                     mirrorGames, seed_base_L)
  mirror_games = Σ played
  mirror_rate  = mirror_games > 0 ? (Σwins + 0.5·Σties) / mirror_games : null   -- BR-S06.T08-01
  mirror_ci    = wilsonOrNull(Σwins + 0.5·Σties, mirror_games, 1.96)            -- null at n = 0
  mirror_lists = |lists|
```

## Interfaces

**Migration `packages/db/migrations/0008_measurement_mirror.sql`** — the DDL region this subtask owns. SQLite cannot add a `CHECK` to an existing table, so `measurements` is rebuilt; `measurement_opponents` only gains columns.

```sql
-- 0008_measurement_mirror.sql — the mirror reading, its provenance and the constraints that make
-- a zero-game mirror unrepresentable (RN-44, RN-48; ESPECIFICACAO §6.3 P1).
-- Owner: S06.T08. Builds on 0007_measurement.sql (S05.T16).
-- Postgres: the rebuild becomes ALTER TABLE … ADD COLUMN / ADD CONSTRAINT; see packages/db/PORTABILITY.md.

PRAGMA foreign_keys = OFF;                                            -- @sqlite-only

CREATE TABLE measurements_new (
    id              INTEGER PRIMARY KEY,
    suite_id        INTEGER NOT NULL REFERENCES suites(id),
    bot_id          INTEGER NOT NULL REFERENCES bots(id),
    job_id          INTEGER          REFERENCES jobs(id),
    engine_build    TEXT    NOT NULL,
    rules_snapshot  TEXT    NOT NULL,
    git_commit      TEXT    NOT NULL,          -- short hash, '+' when dirty (RN-49)
    bot_code_hash   TEXT    NOT NULL,          -- NEW: the bot's hash at measurement time (BR-S06.T08-06)
    bot_params_json TEXT    NOT NULL DEFAULT '{}',   -- NEW: the params actually used
    divergent       INTEGER NOT NULL DEFAULT 0,
    -- score reading (RN-44)
    games                INTEGER NOT NULL,
    games_per_opponent   INTEGER,              -- NEW
    score           REAL    NOT NULL,          -- Σ w·p / Σ w, ties = 0.5 (RN-45)
    ci_low          REAL    NOT NULL,
    ci_high         REAL    NOT NULL,
    -- mirror reading: absent or complete, never zero (BR-S06.T08-01)
    mirror_games          INTEGER NOT NULL DEFAULT 0,
    mirror_lists          INTEGER NOT NULL DEFAULT 0,   -- NEW (BR-S06.T08-03)
    mirror_games_per_list INTEGER,                      -- NEW
    mirror_rate           REAL,
    mirror_ci_low         REAL,
    mirror_ci_high        REAL,
    mirror_skipped_reason TEXT,                         -- NEW (BR-S06.T08-02)
    -- how the games ended, from the evaluated side (BR-S06.T08-10)
    outcomes_json      TEXT NOT NULL DEFAULT '{}',
    loss_by_deck_out   REAL,                            -- NEW
    loss_by_no_pokemon REAL,                            -- NEW
    avg_turns          REAL,
    errors             INTEGER NOT NULL DEFAULT 0,
    invalid_actions    INTEGER NOT NULL DEFAULT 0,
    fingerprint        TEXT,
    seconds            REAL,
    note               TEXT,
    measured_at        TEXT NOT NULL,
    CHECK (divergent IN (0, 1)),
    CHECK (score >= 0 AND score <= 1),
    CHECK (ci_low <= score AND score <= ci_high),
    -- ESPECIFICACAO §6.3 P1: the v5 mirror row (games 0, rate 0.0, ci [0,1]) cannot exist.
    CHECK ((mirror_games = 0) = (mirror_rate IS NULL)),
    CHECK (mirror_rate IS NULL OR (mirror_ci_low IS NOT NULL AND mirror_ci_high IS NOT NULL
           AND mirror_ci_low <= mirror_rate AND mirror_rate <= mirror_ci_high)),
    CHECK (mirror_rate IS NULL OR mirror_ci_high - mirror_ci_low < 0.999),
    CHECK ((mirror_games = 0) = (mirror_lists = 0)),
    CHECK (mirror_games > 0 OR mirror_skipped_reason IS NOT NULL)
);

INSERT INTO measurements_new (id, suite_id, bot_id, job_id, engine_build, rules_snapshot,
       git_commit, bot_code_hash, divergent, games, score, ci_low, ci_high,
       mirror_games, mirror_rate, mirror_ci_low, mirror_ci_high, mirror_skipped_reason,
       outcomes_json, avg_turns, errors, invalid_actions, fingerprint, seconds, note, measured_at)
SELECT id, suite_id, bot_id, job_id, engine_build, rules_snapshot,
       git_commit, 'unknown:pre-0008', divergent, games, score, ci_low, ci_high,
       0, NULL, NULL, NULL, 'recorded before 0008',
       outcomes_json, avg_turns, errors, invalid_actions, fingerprint, seconds, note, measured_at
  FROM measurements;                    -- S05.T16's wrapper stored zeroes; they become NULLs here

DROP TABLE measurements;
ALTER TABLE measurements_new RENAME TO measurements;
CREATE INDEX measurements_suite_bot_idx ON measurements (suite_id, bot_id, measured_at DESC);

-- measurement_opponents gains the per-list mirror record; idx = -1 is the evaluated list (BR-S06.T08-03).
ALTER TABLE measurement_opponents ADD COLUMN mirror_games   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE measurement_opponents ADD COLUMN mirror_wins    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE measurement_opponents ADD COLUMN mirror_losses  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE measurement_opponents ADD COLUMN mirror_ties    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE measurement_opponents ADD COLUMN mirror_rate    REAL;
ALTER TABLE measurement_opponents ADD COLUMN mirror_ci_low  REAL;
ALTER TABLE measurement_opponents ADD COLUMN mirror_ci_high REAL;
ALTER TABLE measurement_opponents ADD COLUMN invalid_actions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE measurement_opponents ADD COLUMN errors          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE measurement_opponents ADD COLUMN fingerprint     TEXT;

PRAGMA foreign_keys = ON;                                             -- @sqlite-only
PRAGMA foreign_key_check;
```

The same nullability discipline applies per row through the application (`wilsonOrNull`); `measurement_opponents` keeps its `CHECK`s light because a partial per-list row is legitimate when a pairing errored, and the aggregate row is where the guarantee has to bite.

**Job params** — `packages/shared/src/jobs/measure.ts`:

```ts
export const MeasureParams = z.object({
  suiteId:     z.number().int(),
  botName:     z.string(),
  botParams:   z.record(z.unknown()).default({}),
  games:       z.number().int().min(1).max(20000).default(100),   // per opponent (legacy default)
  mirrorGames: z.number().int().min(0).max(20000).default(60),    // per list (legacy default)
  noMirror:    z.boolean().default(false),
  workers:     z.number().int().min(1).optional(),
  note:        z.string().max(500).optional(),
}).refine(p => p.mirrorGames > 0 || p.noMirror, {
  message: "mirrorGames: 0 needs noMirror: true — a mirror of zero games is not a measurement " +
           "(ESPECIFICACAO §6.3 P1)",                              // BR-S06.T08-02
  path: ["mirrorGames"],
});

export const MeasureResult = z.object({
  measurementId: z.number().int(),
  score: z.number(), ci: z.tuple([z.number(), z.number()]),
  mirror: z.number().nullable(), mirrorCi: z.tuple([z.number(), z.number()]).nullable(),
  mirrorLists: z.number().int(), mirrorGames: z.number().int(),
  games: z.number().int(), seconds: z.number(),
  invalidActions: z.number().int(), errors: z.number().int(),
  divergent: z.boolean(),
});
```

**Statistics added here** — `packages/db/src/measure/stats.ts`, beside [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)'s existing exports:

```ts
/** Wilson, but null rather than [0, 1] when there is nothing to measure (BR-S06.T08-01).
 *  S04.T17's `wilson` keeps its [0, 1] contract; the measurement path never calls it with n = 0. */
export function wilsonOrNull(successes: number, n: number, z = 1.96): [number, number] | null;

/** Δ between two measurements on one suite, with the interval of the difference (RN-48). */
export function deltaCi(a: PairResult, b: PairResult, z = 1.96):
  { delta: number; ciLow: number; ciHigh: number; inconclusive: boolean };

/** The half-width a run of this size can resolve — the noise floor RN-48 names. */
export function noiseFloor(games: number, p = 0.5, z = 1.96): number;
```

**The handler** — `apps/worker/src/kinds/measure.ts`, registered through [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)'s dispatcher:

```ts
export const measureKind: JobKindHandler<MeasureParams> = {
  kind: "measure",
  paramsSchema: MeasureParams,
  async build(db, job, p) {
    const suite = readSuite(db, p.suiteId);                 // frozen lists, seed0, opponent bot
    await preflightBot(db, p.botName, p.botParams);         // S06.T07 BR-S06.T07-08, -05
    return buildScorePass(db, suite, p);                    // the mirror pass follows onDone
  },
  onResult(db, job, line) { accumulate(job, line); },
  onDone(db, job, done) { /* phase 1 -> build phase 2, or write the measurement */ },
};
```

The two passes are two engine invocations because their pairings differ in every field; the handler keeps its phase in `jobs.progress_json` so a restart is visible rather than ambiguous.

**Endpoints and the page.**

```
GET /api/suites/:id/measurements          one suite only (RN-42); newest first; per-opponent rows
GET /api/measurements/:id                 one measurement with its opponent rows and both readings
POST /api/jobs { kind: "measure", params } 202 { id }
```

Route `/measurements` (pt-BR through the strings module, D-006), with `?suite=` in the URL:

| Column | Source | Notes |
|---|---|---|
| suite | `suites.version` + `frozen_at` | one suite rendered at a time (RN-42) |
| opponent bot | `suites.opponent_bot_id` → `bots.name` | frozen; shown with its hash prefix |
| date | `measured_at` | |
| bot | `bots.name` + `bot_code_hash` prefix + `bot_params_json` | params are part of identity ([S06.T07](T07-bot-registry-and-freezing.md)) |
| score | `score` **with** `ci_low`–`ci_high` | never alone (RN-48) |
| mirror | `mirror_rate` **with** its interval, or `—` when `NULL`, or "não executado" with the reason | BR-S06.T08-01, -02 |
| lists | `mirror_lists` | marked partial when below the suite's count |
| turns | `avg_turns` | |
| deck-out losses | `loss_by_deck_out` | the legacy's *"perde por fim de deck"* (BR-S06.T08-10) |
| no-Pokémon losses | `loss_by_no_pokemon` | |
| errors / invalid | `errors`, `invalid_actions` | a non-zero invalid count marks the row (BR-S06.T08-08) |
| build / snapshot | `engine_build`, `rules_snapshot` prefixes; `divergent` marker | [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) |
| commit | `git_commit` | `+` rendered as a dirty-tree marker (RN-49) |
| note | `note` | the legacy's *"o que mudou"* |

Selecting two rows **of the same suite** renders `MeasurementDelta`: Δ score, Δ mirror, each with `deltaCi`, and the sentence "the interval of the difference contains zero — this is not a difference at this sample size" when it does (RN-48). There is no control that selects rows from two suites.

## Implementation steps

1. Write `0008_measurement_mirror.sql` with the rebuild, the new columns and the five mirror `CHECK`s; apply it on a temp database seeded with a 0007-era row, and run `PRAGMA foreign_key_check`. Spec that the legacy v5 tuple raises (BR-S06.T08-01).
2. Add the row types in `@pokesearch/db/schema` and run the drift test; add `wilsonOrNull`, `deltaCi` and `noiseFloor` to `packages/db/src/measure/stats.ts` with their unit tests (BR-S06.T08-01, RN-48).
3. Write `MeasureParams` and `MeasureResult` in `packages/shared` with the `mirrorGames`/`noMirror` refinement and export their JSON Schema; spec the refusal message (BR-S06.T08-02).
4. Implement `preflightBot`: read `--bots`, compare against the `bots` row, refuse a params override on a frozen bot, refuse a hash drift; spec all three (BR-S06.T08-06).
5. Implement `buildScorePass`: read the suite, use the frozen lists, derive one `scoreSeed` per opponent, build the `evaluate` request with weights and labels; spec the seeds against `matchupSeed` and the frozen-list rule (RN-46, BR-S06.T08-07).
6. Implement the score aggregation over `result` lines — per-opponent `winRate` and `wilson`, then `weightedScore` — reusing [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)'s module; spec ties as half a win and the errors-excluded denominator (RN-45).
7. Implement `buildMirrorPass` with the list set of BR-S06.T08-03 and one `mirrorSeed` per list; spec the thirteen-list count and the de-duplication of an opponent equal to the evaluated deck (RN-44, BR-S06.T08-03).
8. Implement the two-phase progress mapper and spec the phase names and the throttle (BR-S06.T08-09).
9. Implement the transactional write of `measurements` + `measurement_opponents`, including the `idx = -1` mirror row, the provenance columns, the oriented outcomes and the deck-out shares; spec the transaction and the cancelled-job case (BR-S06.T08-04, -10, RN-49).
10. Add the three endpoints and the `/measurements` route with its table, its interval rendering, the `—` for a null mirror and the skipped-mirror marker; spec that a score is never rendered without its interval (RN-42, RN-48, BR-S06.T08-01, -02).
11. Implement `MeasurementDelta` with `deltaCi` and the inconclusive sentence; spec that no verdict word is rendered and that no control crosses suites (RN-42, RN-48).
12. **Acceptance run**: measure `heuristic` and `planner_rs_v1` on suite v6, store two rows with their intervals and mirrors, re-run one of them and confirm the score and every fingerprint are identical, record both rows' numbers in the completion note, and write `docs/MEASUREMENT.md` — the two readings, the seed derivation, the mirror-nullability rule with its §6.3 P1 provenance, the noise statement of RN-48 and the rule that suites are never compared (RN-44, RN-48, BR-S06.T08-05).

## Edge cases and error handling

- **`mirrorGames: 0` without `noMirror`** → the params schema rejects the job before it is inserted, with a message naming §6.3 P1. This is the precise input that produced the legacy's invalid rows, and it is now a validation error rather than a silent zero (BR-S06.T08-02).
- **A mirror pairing errors on every game** → `mirror_games` is 0 for that list, the aggregate `mirror_games` may still be positive from the other lists, and `mirror_lists` records how many actually produced games. If *every* list fails, the aggregate `mirror_games` is 0, `mirror_rate` is `NULL`, `mirror_skipped_reason` records "every mirror pairing errored", and the `CHECK` that ties `mirror_games = 0` to a non-null reason forces the explanation to exist.
- **The score pass fails entirely** → no measurement is written at all, the job ends `error`, and the `jobs` row carries the reason. A measurement with a mirror and no score is not a measurement; the score is the primary reading (BR-S06.T08-04).
- **A stored interval that spans `[0, 1]`** → refused by `CHECK (mirror_ci_high - mirror_ci_low < 0.999)`. An interval that admits every possible value carries no information, and rendering one next to a real score invites exactly the misreading that left §6.3 P1 open for a week.
- **The suite's opponent bot is no longer in the binary** (an old suite, a rebuilt engine) → the pre-flight fails the job naming the bot and the suite. The alternative — substituting a different opponent — would silently redefine the ruler, which RN-40 exists to prevent.
- **`engine_build` or `rules_snapshot` differs from the suite's** → `divergent = 1`, the row is stored, the API returns the flag and the page groups divergent rows separately ([S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)). The measurement is real; it is just not the same experiment, and saying so is cheaper than refusing it.
- **Two measurements of the same bot on the same suite and build give different scores** → a determinism defect, not a statistical one. BR-S06.T08-05's test is what surfaces it, and the diagnosis path is [S04.T10](../04-game-engine-core/T10-termination-stall-and-determinism.md)'s fingerprint machinery: the per-pairing fingerprints identify which pairing diverged.
- **An opponent list whose `deck_id` equals the evaluated deck's** (the user's own archetype is in the meta) → it is mirrored once, not twice, exactly as `progress.py`'s list comprehension did; `mirror_lists` is then the opponent count rather than the opponent count plus one, and the count is stored rather than assumed (BR-S06.T08-03).
- **A pairing with `invalid_actions > 0`** → stored and marked. RN-21's default resolver played part of those games, so the row partly measures the engine's defaults rather than the bot; the page shows the count next to the bot name and `docs/MEASUREMENT.md` says what it means (BR-S06.T08-08).
- **The job is cancelled during the mirror pass** → the score pass's numbers exist in `job_pairings` but no `measurements` row is written. The partial work is visible in the job, and nothing enters the history half-measured (BR-S06.T08-04).
- **A suite whose every opponent weight is equal** (a hand-built test suite) → `weightedScore` reduces to the unweighted mean and the delta-method variance is still correct; the fixture used by `stats.spec.ts` includes this case so the weighting code is exercised at its degenerate point.
- **`games` large enough that the run takes hours** (a rollout bot on a twelve-opponent suite) → the job reports phase progress throughout, is cancellable, and the page shows elapsed time. The measurement is not chunked or resumed: a partially measured suite is not a suite, and re-running is the supported answer.

## Acceptance / verification

- [ ] `pnpm db:migrate` applies `0008_measurement_mirror.sql` on a database carrying a 0007-era row; `schema_migrations.version = 8`, `PRAGMA foreign_key_check` clean, the pre-existing row survives with `mirror_rate IS NULL` and `mirror_skipped_reason = 'recorded before 0008'`, and `schema-drift.spec.ts` passes.
- [ ] **The legacy defect is unrepresentable**: `measure.spec.ts > inserting the legacy v5 mirror row raises` — an insert of `mirror_games = 0, mirror_rate = 0.0, mirror_ci_low = 0.0, mirror_ci_high = 1.0` fails the `CHECK`; and `> a zero-game mirror stores NULLs` passes (BR-S06.T08-01, ESPECIFICACAO §6.3 P1).
- [ ] `stats.spec.ts > wilsonOrNull returns null at n = 0` and returns the same interval as `wilson` for every `n > 0` over 1,000 random inputs; `> deltaCi labels an overlapping difference inconclusive`; `> noiseFloor at 1200 games is about 3 points` (BR-S06.T08-01, RN-48).
- [ ] `measure.spec.ts > mirrorGames 0 without noMirror is rejected with a named error` and `> noMirror stores a reason` (BR-S06.T08-02).
- [ ] **Measure heuristic and `planner_rs_v1` on suite v6**: two `measurements` rows, each with a score and its 95 % interval, a mirror rate and its interval over thirteen lists, per-opponent rows, `engine_build`, `rules_snapshot`, `git_commit`, `bot_code_hash` and `bot_params_json` all non-null; both rows recorded in the completion note (RN-44, RN-49).
- [ ] **Repeated measurement is identical**: re-running the `planner_rs_v1` measurement on the same suite and build produces an identical `score`, identical per-opponent records and identical `fingerprint` values, at `--workers 1` and at `--workers 8` (BR-S06.T08-05).
- [ ] `measure.spec.ts > the score seeds match matchupSeed for a fixed seed0 and deck id`, `> the mirror seeds use the espelho part`, `> the request uses the frozen lists`, `> editing the live meta does not change the weights` (RN-46, BR-S06.T08-07).
- [ ] `> a twelve-opponent suite mirrors thirteen lists`, `> an opponent whose deck id equals the evaluated deck is not mirrored twice`, `> the evaluated list's mirror row is idx -1` (BR-S06.T08-03).
- [ ] `> ties count as half a win in every stored rate`, `> the weighted score matches weightedScore on the same fixture`, `> errored games leave the denominator`; `pnpm check` finds no second implementation of `wilson` in the measurement path (RN-45).
- [ ] `> a cancelled measure job writes no measurement`, `> a failed score pass writes no measurement`, `> the measurement and its opponent rows are one transaction`; `pnpm check` finds no write to `measurements` from `apps/api` (BR-S06.T08-04).
- [ ] `> the stored measurement carries the bot code hash from the listing`, `> a params override on a frozen bot is refused`, `> a drifted bot fails the job before spawning` (BR-S06.T08-06).
- [ ] `pnpm --filter web test measurements` green: `> a score is never rendered without its interval`, `> a null mirror renders an em dash, not 0 %`, `> a skipped mirror is marked, not blank`, `> a delta whose interval contains zero is labelled inconclusive`, `> the page renders no verdict word` (RN-48, BR-S06.T08-01, -02).
- [ ] `api.spec.ts > there is no cross-suite comparison endpoint` and `measurements.spec.tsx > there is no control that compares two suites` (RN-42).

## Risks and open questions

- **Risk — the mirror's thirteen lists cost more than the score's twelve pairings.** At the legacy's defaults (100 games per opponent, 60 per mirrored list) the mirror is 780 games against the score's 1,200, which is fine for a planner and punishing for a rollout bot at seconds per game ([S06.T05](T05-rollout-bot.md)). Mitigation: `mirrorGames` is a parameter, the page shows the total game count and the elapsed time, and a reduced mirror is stored with its real `mirror_games` so its wider interval is visible rather than implied. What is not offered is a mirror of zero.
- **Risk — RN-48's noise floor is stated for one sample size and read as universal.** "Three points at 1,200 games" is the legacy's figure for its own suite; a suite with different weights or a bot with a different win rate has a different floor. Mitigation: `noiseFloor(games, p)` computes it for the run in front of the user, the page renders that number rather than the remembered one, and `docs/MEASUREMENT.md` says where the legacy's figure came from.
- **Risk — the migration number collides.** `docs/project/04-data-model-overview.md` assigns migration 0008 to `optimizer_candidates` ([S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)). S06 runs before S07, so this subtask takes 0008 and `optimizer_candidates` moves to 0009. Mitigation: the data-model table needs that one-line correction, which is recorded here rather than edited across stages during a parallel elaboration pass; the alternative — folding these constraints into 0007 — is forbidden because an applied migration's checksum is fixed ([S01.T04](../01-foundation/T04-database-migration-framework.md)).
- **Risk — rebuilding `measurements` loses data.** The 0008 rebuild copies every row explicitly and a missed column would be silently dropped. Mitigation: the migration test seeds a 0007-era row with every column populated and asserts each value survives, plus `PRAGMA foreign_key_check`; the rebuild runs when the table holds at most a handful of rows, which is the cheapest moment it will ever have.
- **Risk — `divergent` rows accumulate and the history becomes unreadable.** Every engine rebuild or rules edit marks subsequent measurements divergent, and on an active project that is most of them. Mitigation: the page groups divergent rows separately and the suite's own build and snapshot are in the header, so "divergent" is legible as "taken under different rules" rather than as "wrong"; if the group dominates, that is the signal to freeze a new suite (RN-41), not to hide the flag.
- **Question — should a measurement store the full per-pairing fingerprints, or only the aggregate?** `job_pairings` already holds one per pairing ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)) and `measurements.fingerprint` holds one for the run. Duplicating them would make a measurement self-contained after a job is pruned. Recommendation: keep the aggregate here and the per-pairing values in `job_pairings`, and add a retention rule for `jobs` only when pruning is actually implemented ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)).
- **Question — should the page offer a chart of a suite's measurements over time?** The legacy rendered a Markdown table and nothing else, and a line chart of scores with overlapping intervals is precisely the artefact that invites reading noise as progress. Recommendation: table first, with intervals in every cell; a chart only if it plots the intervals as bands rather than the point estimates as a line. The user decides, and RN-48 is the constraint either way.
- **Sizing — this subtask is a job, a migration and a page, and could be two.** Steps 1–9 deliver `0008_measurement_mirror.sql`, the statistics additions and the `measure` handler with both passes — the number and the row. Steps 10–12 deliver the endpoints, the `/measurements` route, the Δ rendering and `docs/MEASUREMENT.md` — how the number is read. That is the same split the stage already makes between [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) and [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), and it would let the acceptance measurement run before the page exists. Not applied here, because both halves are named in this file's Outputs and renumbering is not this pass's to do. Proposed for the user's decision.
- **DEPENDENCY-PROPOSAL: S06.T08 should depend on S04.T12 because** the handler builds engine `evaluate` request lines and parses `progress`/`result`/`done`/`error` lines directly, and the `bot: { name, params, seed }` field is this file's interface to the engine; today the job protocol reaches this subtask only transitively through [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) and [S06.T07](T07-bot-registry-and-freezing.md). Adding it to `Depends on` (and to S04.T12's `Unblocks`) would make the file self-contained; not applied here, because a dependency edit touches two files in another stage.
- **DEPENDENCY-PROPOSAL: S06.T08 should depend on S04.T14 because** migration 0008 rebuilds `measurements`, whose `job_id` references `jobs(id)`, and the handler reads and writes `job_pairings`; today the jobs schema reaches this subtask only through [S04.T15](../04-game-engine-core/T15-worker-job-runner.md). The same note applies as above.

## References

- `pokemon/src/pokesearch/sim/progress.py` L96–145 (`measure`) — verified: `rival = suite["opponent_pilot"]`; the score loop calling `play_batch(ours, opponent_lines, games, pilot, rival, seed0=_seed(suite, "nota", o["deck_id"]))` per opponent and accumulating `outcomes`, `turns_total`, `errors` and `invalid_actions`; the mirror loop `for entry in lists if mirror_games else []` over `lists = [suite["deck"]] + [o for o in suite["opponents"] if o["deck_id"] != suite["deck"]["deck_id"]]` with `_seed(suite, "espelho", entry["deck_id"])`; the returned shape (`score`, `ci`, `record`, `avg_turns`, `outcomes`, `loss_by_deck_out`, `loss_by_no_pokemon`, `mirror`, `per_opponent`, `seconds`) and `_commit()` appending `+` on a dirty tree. **The guard `if mirror_games else []` is the first of the three pieces behind §6.3 P1.**
- `pokemon/src/pokesearch/sim/runner.py` L32–43 and L81–88 — verified: `BatchResult.win_rate` returning `(wins + 0.5·ties) / n` **and `0.0` when `n` is zero**; `ci()` calling `wilson(wins + 0.5·ties, wins + losses + ties)`; and `wilson(successes, n, z=1.96)` returning **`(0.0, 1.0)` when `n <= 0`**, otherwise the standard interval with `denom = 1 + z²/n`. The second and third pieces behind §6.3 P1, and the exact formulas RN-45 keeps.
- `pokemon/benchmarks/historico.jsonl` — verified by reading the two suite-v5 records: each carries `"mirror": {"games": 0, "win_rate": 0.0, "ci": [0.0, 1.0], "record": [0, 0, 0]}` beside a valid score (`0.3653` and `0.5729`). The stored form of the defect, and the exact tuple BR-S06.T08-01's test inserts and expects to be rejected.
- `pokemon/benchmarks/HISTORICO.md` — verified: the rendered v5 rows showing `0.0% | 0.0%–100.0%` in the two mirror columns; the header note that a new ruler's scores are not comparable with the old one's *"porque o oponente ficou mais forte"* (RN-42); and the full column set (régua, contra, data, piloto, nota, IC 95 %, espelho, IC 95 %, turnos, perde por fim de deck, perde sem Pokémon, erros, commit, o que mudou) that the `/measurements` table reproduces. Also verified: suite v2's `planner_v4` → `planner v7` progression, score 74.9 % → 76.6 % against mirror 49.4 % → 54.6 %, the worked example of why RN-44 needs two readings.
- `pokemon/ESPECIFICACAO.md` §6.3 P1 — verified: *"Espelho da régua v5 não produz dado: as duas linhas mostram `0.0 % (IC 0.0 %–100.0 %)`. Ninguém investigou."*; §1.3 recording the v5 mirror as *"sem dado válido"* while the score row carries 36,5 % → **57,3 % (IC 55,5–59,0)**; §1.4's *"uma medição na régua são ~465 mil decisões"*; §4.4 RN-42, RN-44, RN-45 (with the note that `bot_bench` excludes ties so a stalled deck does not score 50 %), RN-46, RN-48 (*"diferença abaixo de ~3 pontos com 1200 partidas é ruído"*) and RN-49.
- `pokemon/src/pokesearch/sim/progress.py` L148–153 (`_weighted`) — verified: `score = Σ w·p / Σw`; `var = Σ (w/Σw)² · p(1−p) / max(games − errors, 1)`; `half = 1.96·√var`; clamped to `[0, 1]`. The delta-method interval `weightedScore` implements ([S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)).
- `pokemon/src/pokesearch/sim/progress.py` L88–90 (`_seed`) — verified: `(suite["seed0"] + zlib.crc32("|".join(parts).encode())) % 1_000_000_007`, with the comment that `hash()` of a string changes per process and is unusable for a ruler (RN-46); and L34's `CURRENT_SUITE = 5` with the three-round freezing cycle (RN-43, [S06.T07](T07-bot-registry-and-freezing.md)).
- `pokemon/src/pokesearch/sim/runner.py` L107–112 (`play_batch`) — verified: tasks built as `(deck_a, deck_b, policy_a, policy_b, seed0 + i, i % 2 == 0)`, so game *i* alternates which side is player 1 and each pairing is balanced for the first-player advantage; `_play_one` seeding the two policies with `seed*2+1` and `seed*2+2`, separately from the engine's seed. The orientation rule [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) already reproduces and RN-46 relies on.
- [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) — the `suites`, `suite_opponents`, `measurements` and `measurement_opponents` tables of 0007 that this subtask extends; `matchupSeed`/`scoreSeed`/`mirrorSeed` with their Portuguese part strings; `weightedScore`, `wilson`, `winRate`, `gitCommit`; the `divergent` rule; BR-S05.T16-07 (only the worker writes, only for a completed job) and BR-S05.T16-09 (no cross-suite endpoint). Note its own open question — *"where does the mirror pass belong?"* — which this subtask answers, and its statement that the wrapper *"records zeroes when `--mirror-games 0`"*, which BR-S06.T08-01 replaces with NULLs.
- [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) — `wilson`, `winRate`, `weightedScore` and their fixed-vector tests; the per-opponent table, the build-mismatch marking and the zero-games failure state whose discipline this page extends to the mirror.
- [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) — the dispatcher this kind registers with, the 500 ms progress throttle, the count assertions and the rule that the engine is spawned without `DATABASE_PATH`; [S04.T12](../04-game-engine-core/T12-cli-job-protocol.md) — the `evaluate` request, the five response lines and the `bot` field; [S06.T07](T07-bot-registry-and-freezing.md) — `--bots`, `code_hash`, the frozen-params refusal and the pre-flight drift check.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
