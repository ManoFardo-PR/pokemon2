# S07.T07 — Coach: lost-game review (optional LLM)

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 7 / 7 |
| Depends on | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md), [S07.T05](T05-optimize-job-orchestration.md) |
| Unblocks | — |
| Parallel with | [S07.T06](T06-web-optimizer-page.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `games.log_blob` (event logs with decision margins) — from [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)
- `module` per-decision `margin = best − second` written into the game log by the prompt resolvers — from [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md)
- `module` optimize/evaluate jobs with `store_logs` — from [S07.T05](T05-optimize-job-orchestration.md)
- `doc` ESPECIFICACAO.md RN-60, RN-63, RN-65, RN-66

## Outputs (proposed)
- `module` `apps/worker/src/coach/` — select lost games of the worst matchup, pick ≤ 6 critical moments per game by decision margin, present only what the player saw, ask an LLM (Anthropic or OpenAI-compatible, optional) for a closed-vocabulary verdict `{ agree|disagree, better_action_index, category, reason }`, reject verdicts naming non-existent actions; store as hypotheses to measure on the suite — never applied automatically
- `file` migration `packages/db/migrations/0010_coach.sql` — `coach_reviews` (one row per accepted verdict, insert-only) and `coach_hypotheses` (one row per hypothesis with the suite measurement that confirmed or denied it, RN-66)
- `contract` worker job kind `coach { sourceJobId, opponentDeckId?, games, limit, provider? }` and the `GET /api/coach/reviews` / `GET /api/coach/hypotheses` read endpoints

## Initial objective
A review tool for humans: where did the bot (or the list) lose the game, phrased as testable hypotheses — with the LLM strictly off the critical path.

## Context

Every other subtask in this stage produces a number. This one produces a question, and the discipline that matters is keeping the two apart. The coach reads games that were already played, picks the moments where the bot's choice was close, shows a model exactly what the player could see, and collects a structured opinion. An opinion is not evidence (RN-63) and it is not a gain (RN-66): it becomes a hypothesis, the hypothesis is measured on the frozen suite, and what the suite denies is reverted and recorded so it is not tried again.

The legacy built this and — unusually — also measured whether it worked, which makes `benchmarks/COACH.md` the most useful document in the whole reference set. Round 1 used a Groq model over 12 games: 765 decisions with a real choice, 58 critical moments, 40 sent, 31 valid verdicts (14 agree, 15 disagree, 2 indifferent). Half the disagreements were the model getting a game rule wrong despite the rules being in the prompt. The one hypothesis it produced — *only retreat from an Active that does nothing if the incoming Pokémon deals 30 or more* — was measured on ruler v3 over 3,000 + 2,400 games and moved the score from 74.1 % to 74.3 % with the mirror going 50.4 % to 50.1 %: **no measurable gain**. Round 2 used Claude over the same 12 games and the same 40 moments: 40 valid verdicts out of 40, 20 agree / 18 disagree / 2 indifferent, and *no rule errors at all*. Its hypothesis became planner v10, was measured on the same ruler over the same 3,000 + 2,400 games, and moved the score from 74.3 % to **73.4 %** with the mirror falling 50.1 % to 49.5 %: worse, and reverted.

Two conclusions come straight from that file and are the design here. *"Parecer bom não é o mesmo que ganho"* — a good opinion is not a gain: the decisions a model criticises are, in the legacy's measured experience, low-leverage ones, while what actually moved the ruler were gross errors found by watching lost games from the inside (an Active stuck, an attack with no effect, drawing until deck-out). And the file's own recommendation for the next round is exactly this subtask's scope: *send only the LOST games of a bad matchup, and ask about the turn the game turned, instead of reviewing scattered choices.*

So the mechanism is kept and narrowed. RN-65's shape is unchanged: at most six critical moments per game, the reviewer sees only what the player saw, the answer vocabulary is closed, and a verdict pointing at an action that does not exist is rejected. What changes is the source of the moments and the destination of the output. The source is the per-decision `margin` that [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md) writes into the game log — in the legacy this lived in a policy's `memo` dictionary, `memo["margin"] = None if second is None else round(best_score - second, 3)` (`pilot.py` L380–381), which meant a decision was reviewable only while the process that made it was alive. Here it is a field in the event log stored in `games.log_blob`, so any game with `store_logs` can be reviewed later, by a different process, on a different day. The destination is a pair of tables rather than a JSONL file under `data/reports/`, so a hypothesis carries the measurement that settled it.

**RN-60 is the hardest constraint and it is structural.** Nothing in the project depends on this feature: with no key configured, the job kind refuses at creation with a clear message, the page section is not rendered at all (not rendered disabled), and every other job — evaluate, scenarios, measure, optimize — produces byte-identical results. The optimizer in particular never calls a model ([S07.T05](T05-optimize-job-orchestration.md) BR-S07.T05-03), and the coach reads what the optimizer already stored rather than participating in it. This is also the rule the legacy broke elsewhere and which this stage repairs: `optimizer.py::prepare_deck` generated card definitions with an LLM mid-run. The coach is the only place in S07 where a model is called at all, and it runs after the games, never during them.

## Scope

- **In scope.** `apps/worker/src/coach/` (`select.ts`, `moments.ts`, `prompt.ts`, `verdict.ts`, `hypotheses.ts`); the `coach` job kind and its params; the lost-game and worst-matchup selection; critical-moment selection by `margin` and flags; the player-view snapshot and the legal-action list with its truncation; the closed verdict vocabulary and its JSON schema; the four rejection rules; migration `0010_coach.sql` with `coach_reviews` and `coach_hypotheses`; the hypothesis lifecycle and its link to a `measurements` row (RN-66); the provider abstraction and the no-key behaviour; the two read endpoints and the page section mounted into [S07.T06](T06-web-optimizer-page.md); the stub-provider test harness.
- **Out of scope.** The event-log format inside `log_blob` ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) and [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)); computing `margin` ([S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md)); the planner's policy ([S06.T03](../06-bots/T03-planner-turn-policy.md)) and any change a hypothesis proposes to it; running the suite measurement that settles a hypothesis ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)); the optimize job ([S07.T05](T05-optimize-job-orchestration.md)); LLM-assisted rule authoring, a different feature with its own queue ([S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md)); `rule_evidence`, which this subtask may never write (RN-63); the provider SDK wrappers themselves, which come from `packages/llm`.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-60 | **Kept.** The LLM is never on the critical path: with no key configured the `coach` job kind refuses at creation with `LLM_NOT_CONFIGURED`, the page section is not rendered, and every other job kind produces byte-identical results. No evaluate, scenarios, measure or optimize code path imports `packages/llm`. | `providerAvailable()` checked by the api before inserting a `coach` job; the web section's mount guard on `GET /api/coach/status`; an import-graph assertion over `apps/worker/src/{optimizer,kinds}` and `engine/` | `coach.spec.ts > with no key the coach job is refused at creation and no other job changes`; `> the full worker suite passes with ANTHROPIC_API_KEY and LLM_BASE_URL unset`; `policy.spec.ts > no optimizer or engine module imports packages/llm`; `optimize.spec.tsx > the coach section is absent, not disabled, when status says unavailable` |
| RN-65 | **Kept.** The coach reviews at most `PER_GAME` (6) critical moments per game; the context it sends contains only what the acting player could legitimately see (own hand, board, discards, counts for the opponent's hidden zones — RN-30's rule applied to the reviewer); the answer is a closed vocabulary (`verdict ∈ agree/disagree/indifferent`, `category` one of nine); and a verdict is rejected when `betterActionIndex` is outside the listed legal actions, when `verdict` or `category` is outside the vocabulary, or when it is `disagree` while pointing at the action the bot already chose. Recording a game never changes it. | `selectMoments()`'s per-game cap; `playerSnapshot()` built from the log's view record, never from the full state; `VERDICT_SCHEMA` as a JSON-schema-constrained response; `validateVerdict()`'s four rejections | `moments.spec.ts > at most six moments per game`; `verdict.spec.ts > a betterActionIndex of 99 over 12 legal actions is rejected`; `> a disagree pointing at the chosen action is rejected`; `> a verdict outside the vocabulary is rejected`; `prompt.spec.ts > the rendered context contains no opponent card identity` (a sweep over 1,000 fixture moments) |
| RN-66 | **Kept.** A coach suggestion is a **hypothesis**, never a change: it is stored with `status = 'proposed'`, and it becomes `confirmed` or `denied` only by a `measurements` row on a frozen suite ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)). A denied hypothesis keeps its row, its measurement and its reversion note so it is not retried. Nothing in this subtask edits a bot, a rule or a deck. | `coach_hypotheses.status` with `CHECK (status IN ('proposed','measuring','confirmed','denied','withdrawn'))` and `CHECK (status NOT IN ('confirmed','denied') OR measurement_id IS NOT NULL)`; the worker has no write path to `rule_codes`, `bots` or `user_deck_versions` from `coach/` | `coach.spec.ts > a hypothesis cannot reach confirmed without a measurement_id`; `> a denied hypothesis is never deleted`; `pnpm lint` fails on a fixture writing `bots` or `rule_codes` from `apps/worker/src/coach` |
| BR-S07.T07-01 | The coach reads games only from `games.log_blob`; a source job without `store_logs` yields `NoLogs` naming the job, and the coach never re-runs games to produce its own. | `loadGames()`'s guard on `log_blob IS NULL`; the `coach` handler spawns no engine process | `coach.spec.ts > a source job without store_logs fails with NoLogs`; `> the coach job spawns no engine process` (a spawn spy) |
| BR-S07.T07-02 | Games are selected as **lost games of the worst matchup**: the opponent with the lowest win rate in the source job's `job_pairings`, then that pairing's games where the evaluated deck lost, newest game index first, capped at `params.games` (default 12). An explicit `opponentDeckId` overrides the automatic choice. | `selectGames(db, sourceJobId, params)` | `select.spec.ts > the worst matchup is the lowest win_rate pairing`; `> only lost games are selected`; `> an explicit opponentDeckId overrides`; `> fewer lost games than requested returns what exists` |
| BR-S07.T07-03 | A decision is eligible for review only when it offered at least 2 legal actions **and** either carries a flag or has `margin < MARGIN_TIGHT` (0.5). Eligible decisions are ranked by `(strong flags desc, tight first, pre-defeat flag first, margin asc)` and the first `PER_GAME` per game are kept. | `selectMoments()`; the ranking comparator is a single exported function | `moments.spec.ts > a forced decision with one legal action is never a moment`; `> a decision with margin 0.2 and no flag is eligible`; `> ranking puts flagged, tight, pre-defeat decisions first`; `> a null margin sorts last` |
| BR-S07.T07-04 | The five flags are `passed_with_attack_available`, `retreated`, `gusted`, `discarded` and `pre_defeat:<end_reason>`; the last is applied to every decision in the final three turns of a lost game. `pre_defeat` alone is a weak flag and ranks below the other four. | `flagDecision()` over the log's event stream; the comparator's `strong = flags.filter(f => !f.startsWith("pre_defeat")).length` | `moments.spec.ts > the five flags are produced from the log`; `> pre_defeat covers the last three turns of a lost game`; `> a pre_defeat-only decision ranks below a retreated one` |
| BR-S07.T07-05 | The legal-action list sent to the model is capped at `MAX_LEGAL` (30) entries, and **the action the bot actually chose is always among them**, with the indices renumbered so `chosenIndex` and `betterActionIndex` refer to the list as sent. | `truncateActions(actions, chosenIdx)` keeping the first `MAX_LEGAL − 1` plus the chosen one, then re-indexing | `prompt.spec.ts > a 60-action decision is truncated to 30 with the chosen action present`; `> the chosen index is remapped`; `> betterActionIndex is validated against the truncated list` |
| BR-S07.T07-06 | Requests are batched at `BATCH` (5) moments per call with a total cap of `limit` (default 40) per job; a failed batch is logged and skipped, never retried in a loop, and the job still completes with the verdicts it obtained. | `review()`'s batching and its per-batch try/catch; `params.limit` validated at 1–200 | `coach.spec.ts > 40 moments produce 8 calls of 5`; `> a batch that throws is skipped and the job completes`; `> the job reports batchesFailed` |
| BR-S07.T07-07 | `coach_reviews` is insert-only and every row records the provider, the model, the source job, the game and decision it refers to, the chosen action, the suggested action and the verdict; a rejected verdict is counted but not stored as a review. | `INSERT` only; `CHECK (verdict IN ('agree','disagree','indifferent'))` and `CHECK (category IN (…nine…))`; the rejection counters live in `jobs.result_json` | `coach-schema.spec.ts > a verdict value outside the enum is rejected`; `> UPDATE on coach_reviews is not performed by any code path`; `coach.spec.ts > rejected verdicts are counted in result_json and absent from coach_reviews` |
| BR-S07.T07-08 | `reason` is stored truncated to `MAX_REASON` (300) characters and is never parsed, matched or used to drive behaviour — it is text for a human. No code branches on its content. | `validateVerdict()`'s `String(...).slice(0, 300)`; a source assertion that `reason` is never compared or regex-matched | `verdict.spec.ts > a 900-character reason is stored at 300`; `policy.spec.ts > coach/ never matches on reason` |
| BR-S07.T07-09 | A hypothesis is created by a human from one or more reviews, never automatically: the job writes reviews only, and `POST /api/coach/hypotheses` is the sole creation path. Its `source_review_ids` records which verdicts it came from. | the `coach` handler has no insert into `coach_hypotheses`; the api route is the only writer | `coach.spec.ts > a completed coach job creates zero hypotheses`; `api.spec.ts > POST /api/coach/hypotheses is the only creation path` |
| BR-S07.T07-10 | `0010_coach.sql` creates no row, runs in one transaction, uses no SQLite-only construct and leaves `schema_migrations.version = 10`. | the migration file; the framework of [S01.T04](../01-foundation/T04-database-migration-framework.md) | `migrate.spec.ts > 0010 applies on a fresh temp DB, version 10, zero rows, PRAGMA foreign_key_check clean`; `schema-drift.spec.ts > 0010 tables match their TypeScript row types` |

## Data operations

**CRUD.**

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `games` | R | worker | selecting games and decoding `log_blob` | read-only; requires `store_logs` on the source job | BR-S07.T07-01 |
| `job_pairings` | R | worker | finding the worst matchup by win rate | read-only | BR-S07.T07-02 |
| `jobs` | R | worker | resolving the source job, its params and its build | read-only | — |
| `jobs` | C | api | `POST /api/jobs { kind: "coach", params }` | refused with `LLM_NOT_CONFIGURED` when no provider is available | RN-60 |
| `jobs` | U (`status`, `progress_json`, `result_json`, timestamps) | worker | the coach job's own lifecycle | the standard handler contract | [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) |
| `cards`, `attacks`, `abilities` | R | worker | the oracle text of the cards named in a moment | read-only; cached per job | — |
| `coach_reviews` | C | worker | one row per **accepted** verdict | insert-only; `(job_id, game_key, decision_idx)` unique | BR-S07.T07-07 |
| `coach_reviews` | R | api | the reviews endpoint and the page section | read-only | [S07.T06](T06-web-optimizer-page.md) |
| `coach_reviews` | U / D | — | never | insert-only ledger, like `rule_evidence` (RN-64's discipline) | BR-S07.T07-07 |
| `coach_hypotheses` | C | **api** (`POST /api/coach/hypotheses`) | a human promotes reviews to a hypothesis | never by the worker | BR-S07.T07-09 |
| `coach_hypotheses` | U (`status`, `measurement_id`, `note`) | api | when a suite measurement settles it | `confirmed`/`denied` require `measurement_id` | RN-66 |
| `coach_hypotheses` | R | api | the hypotheses endpoint | read-only | — |
| `measurements` | R | api | linking a hypothesis to the measurement that settled it | read-only | [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) |
| `rule_evidence` | C/U/D | worker (coach) | **never** | an AI opinion is not evidence (RN-63); the `kind` enum has no LLM member | [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) |
| `bots`, `rule_codes`, `text_codes`, `user_deck_versions` | C/U/D | worker (coach) | never | a hypothesis is not a change (RN-66) | BR-S07.T07-09 |
| any table | C/R/U/D | engine | never | the coach spawns no engine process at all | BR-S07.T07-01 |

**Algorithm — one coach job.**

| Step | Operation | Inputs | Output | Rule |
|---|---|---|---|---|
| 1 | Check the provider | `ANTHROPIC_API_KEY` / `LLM_BASE_URL` | refusal at job creation, or proceed | RN-60 |
| 2 | Resolve the source job and the matchup | `sourceJobId`, `opponentDeckId?`, `job_pairings` | the worst-matchup pairing | BR-S07.T07-02 |
| 3 | Select lost games | that pairing's `games` rows with `log_blob` | ≤ `params.games` games | BR-S07.T07-01, -02 |
| 4 | Decode and flag decisions | `log_blob` event streams | decisions with `margin`, `legal[]`, `chosen`, flags | BR-S07.T07-04 |
| 5 | Select critical moments | eligible decisions per game | ≤ 6 per game, ranked | RN-65, BR-S07.T07-03 |
| 6 | Cap the total | all moments, newest game first | ≤ `params.limit` (40) | BR-S07.T07-06 |
| 7 | Build the context | the log's player-view record, card oracle text, truncated legal actions | one prompt block per moment | RN-65, BR-S07.T07-05 |
| 8 | Ask, in batches of 5 | blocks + `VERDICT_SCHEMA` | raw items, or a skipped batch | BR-S07.T07-06 |
| 9 | Validate | raw items against the moment they answer | accepted verdicts; four rejection counters | RN-65 |
| 10 | Store | accepted verdicts | `coach_reviews` rows, insert-only | BR-S07.T07-07 |
| 11 | Summarize | reviews + counters | `result_json`: totals, by verdict, by category, rejections, batches failed | — |
| 12 | Stop | — | no hypothesis, no change; a human promotes reviews later | RN-66, BR-S07.T07-09 |

## Interfaces

**`packages/db/migrations/0010_coach.sql`**

```sql
-- 0010_coach.sql — the coach's review ledger and the hypotheses drawn from it (RN-63, RN-65, RN-66).
-- Owner: S07.T07. coach_reviews is worker-written and insert-only; coach_hypotheses is api-written.
-- An AI opinion is never evidence: nothing here touches rule_evidence.
-- Postgres: *_json TEXT -> jsonb. No SQLite-only construct in this file.

CREATE TABLE coach_reviews (
    id             INTEGER PRIMARY KEY,
    job_id         INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,  -- the coach job
    source_job_id  INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,  -- the job whose games were read
    pairing_idx    INTEGER NOT NULL,
    game_idx       INTEGER NOT NULL,
    decision_idx   INTEGER NOT NULL,          -- index inside that game's decision stream
    turn           INTEGER NOT NULL,
    margin         REAL,                      -- best − second, from S06.T04; NULL when unavailable
    flags_json     TEXT    NOT NULL DEFAULT '[]',
    legal_count    INTEGER NOT NULL,          -- after truncation (BR-S07.T07-05)
    chosen_index   INTEGER NOT NULL,
    chosen_text    TEXT    NOT NULL,
    better_index   INTEGER NOT NULL,
    better_text    TEXT    NOT NULL,
    verdict        TEXT    NOT NULL,
    category       TEXT    NOT NULL,
    reason         TEXT    NOT NULL,          -- <= 300 chars; never parsed (BR-S07.T07-08)
    provider       TEXT    NOT NULL,          -- 'anthropic' | 'openai_compatible' | 'stub'
    model          TEXT    NOT NULL,
    engine_build   TEXT    NOT NULL,          -- of the SOURCE job, so a review is tied to what it saw
    created_at     TEXT    NOT NULL,
    UNIQUE (job_id, pairing_idx, game_idx, decision_idx),
    CHECK (verdict  IN ('agree','disagree','indifferent')),
    CHECK (category IN ('turn_order','attack_target','energy','bench','overdraw',
                        'discard','retreat','prize_race','other')),
    CHECK (better_index >= 0 AND better_index < legal_count),
    CHECK (length(reason) <= 300)
);
CREATE INDEX coach_reviews_job_idx      ON coach_reviews (job_id);
CREATE INDEX coach_reviews_category_idx ON coach_reviews (category, verdict);

CREATE TABLE coach_hypotheses (
    id                INTEGER PRIMARY KEY,
    title             TEXT    NOT NULL,        -- 'retreat only when the incoming Pokemon deals >= 30'
    statement         TEXT    NOT NULL,        -- what would change, in one paragraph, written by a human
    category          TEXT    NOT NULL,
    source_review_ids TEXT    NOT NULL,        -- JSON array of coach_reviews.id (BR-S07.T07-09)
    target            TEXT    NOT NULL,        -- 'bot' | 'list'
    status            TEXT    NOT NULL DEFAULT 'proposed',
    suite_id          INTEGER REFERENCES suites(id),
    measurement_id    INTEGER REFERENCES measurements(id),   -- what settled it (RN-66)
    baseline_score    REAL,
    measured_score    REAL,
    note              TEXT,                    -- why it was reverted, so it is not retried
    created_at        TEXT    NOT NULL,
    settled_at        TEXT,
    CHECK (status IN ('proposed','measuring','confirmed','denied','withdrawn')),
    CHECK (target IN ('bot','list')),
    CHECK (status NOT IN ('confirmed','denied') OR measurement_id IS NOT NULL),
    CHECK (status NOT IN ('confirmed','denied') OR settled_at IS NOT NULL)
);
CREATE INDEX coach_hypotheses_status_idx ON coach_hypotheses (status, created_at DESC);
```

**`apps/worker/src/coach/`**

```ts
export const PER_GAME      = 6;    // RN-65: critical moments per game (the legacy constant)
export const MAX_LEGAL     = 30;   // legal actions shown per moment (the legacy constant)
export const MARGIN_TIGHT  = 0.5;  // a decision this close is "tight" (the legacy threshold)
export const BATCH         = 5;    // moments per provider call
export const MAX_REASON    = 300;  // characters stored for `reason`
export const PRE_DEFEAT_TURNS = 3; // turns before the loss that carry the weak flag

export type Verdict  = "agree" | "disagree" | "indifferent";
export type Category =
  | "turn_order" | "attack_target" | "energy" | "bench" | "overdraw"
  | "discard" | "retreat" | "prize_race" | "other";
export type MomentFlag =
  | "passed_with_attack_available" | "retreated" | "gusted" | "discarded" | `pre_defeat:${string}`;

export interface Moment {
  pairingIdx: number; gameIdx: number; decisionIdx: number; turn: number;
  margin: number | null;
  flags: MomentFlag[];
  view: PlayerSnapshot;             // ONLY what the acting player saw (RN-65)
  legal: string[];                  // <= MAX_LEGAL, chosen always present (BR-S07.T07-05)
  chosenIndex: number;              // index into `legal` after truncation
  cardNames: string[];              // <= 8 names whose oracle text is attached
  promptTips: string | null;        // the engine prompt's tips string, when the decision was a prompt
}

/** Opponent hidden zones appear as counts only — RN-30's rule applied to the reviewer. */
export interface PlayerSnapshot {
  turn: number;
  me:  { active: SlotBrief[]; bench: SlotBrief[]; hand: string[]; discard: Record<string, number>;
         deck: number; prizesLeft: number; supporterPlayed: boolean; energyAttached: boolean;
         inDeck?: Record<string, number>; prized?: Record<string, number> };  // only after a deck search
  opp: { active: SlotBrief[]; bench: SlotBrief[]; hand: number; discard: Record<string, number>;
         deck: number; prizesLeft: number };                                   // counts only
  stadium: string[];
}

export function selectGames(db: Db, sourceJobId: number, params: CoachParams): GameRow[];
export function decodeDecisions(log: Uint8Array): RawDecision[];
export function flagDecision(d: RawDecision, ctx: GameContext): MomentFlag[];
export function selectMoments(decisions: readonly RawDecision[], perGame?: number): Moment[];
export function truncateActions(actions: readonly string[], chosenIdx: number):
  { legal: string[]; chosenIndex: number };
export function renderBlock(db: Db, i: number, m: Moment, cache: Map<string, string>): string;

export interface RawVerdictItem { index: number; verdict: string; betterIndex: number;
                                  category: string; reason: string }
export type VerdictRejection = "not_an_object" | "bad_vocabulary" | "index_out_of_range"
                             | "disagree_same_action";

/** The four rejections of RN-65. Returns null and a reason when the verdict is refused. */
export function validateVerdict(item: unknown, m: Moment):
  { ok: true; value: AcceptedVerdict } | { ok: false; why: VerdictRejection };

export function review(
  moments: readonly Moment[],
  complete: (system: string, content: string) => Promise<unknown>,   // injectable for the stub
  opts: { batch?: number; limit?: number },
): Promise<{ accepted: AcceptedVerdict[]; rejections: Record<VerdictRejection, number>;
             batchesFailed: number }>;

export function providerAvailable(): { available: boolean; provider: string | null; model: string | null };
```

**The response schema** — the model is constrained to it, and `validateVerdict` re-checks every field because a schema-constrained response is still an untrusted input:

```jsonc
{
  "type": "object", "additionalProperties": false, "required": ["results"],
  "properties": { "results": { "type": "array", "items": {
    "type": "object", "additionalProperties": false,
    "required": ["index", "verdict", "betterIndex", "category", "reason"],
    "properties": {
      "index":       { "type": "integer" },                       // which block in this batch
      "verdict":     { "enum": ["agree", "disagree", "indifferent"] },
      "betterIndex": { "type": "integer" },                       // into the block's numbered legal list
      "category":    { "enum": ["turn_order","attack_target","energy","bench","overdraw",
                                "discard","retreat","prize_race","other"] },
      "reason":      { "type": "string" }
    } } } }
}
```

**The four rejection rules** (RN-65), applied in this order:

| # | Condition | Rejection |
|---|---|---|
| 1 | the item is not an object | `not_an_object` |
| 2 | `verdict` or `category` outside its enum | `bad_vocabulary` |
| 3 | `betterIndex` is not an integer, or is outside `[0, legal.length)` | `index_out_of_range` |
| 4 | `verdict === "disagree"` and `betterIndex === chosenIndex` | `disagree_same_action` |

Rule 4 is the legacy's incoherence check: disagreeing while pointing at the same action means the model did not read the list. Rejections are counted in `result_json` and are the headline quality signal of a provider — the legacy's own rounds measured 31 valid of 40 with one model and 40 of 40 with another, which is the kind of difference that decides whether the feature is useful.

**The system prompt** carries the rules the legacy found the model getting wrong, plus the answer contract. It is English (D-006); the legacy's was pt-BR and its content is preserved:

```text
You review decisions a bot made in a Pokémon TCG game, after the game ended. For each situation you
receive what the player could see, the official text of the cards involved, the numbered legal actions
and the one the bot chose.

Rules you must not forget: attacking ends the turn, so everything else comes first; one Supporter and
one Energy from hand per turn; a damage counter is an effect and can be prevented, damage cannot;
Weakness and Resistance apply only to the Active; a player who cannot draw at the start of their turn
loses; the opponent's hand, deck and prizes are unknown to you as they were to the player.

Answer one item per index you received. `betterIndex` is the NUMBER of one of the listed legal actions
(the same as the bot's, when you agree). `category` says what kind of mistake it is. `reason` is one
short, concrete sentence. If the options are equivalent, answer "indifferent". Never name an action
that is not in the list.
```

**Job params, progress and result.**

```ts
export const CoachParams = z.object({
  sourceJobId:    z.number().int(),          // an evaluate or optimize job run with store_logs
  opponentDeckId: z.string().optional(),     // overrides the worst-matchup choice
  games:          z.number().int().min(1).max(50).default(12),
  limit:          z.number().int().min(1).max(200).default(40),
  perGame:        z.number().int().min(1).max(12).default(PER_GAME),   // RN-65 ceiling
  provider:       z.enum(["anthropic", "openai_compatible"]).optional(),
  model:          z.string().optional(),
});

export interface CoachResult {
  sourceJobId: number; opponentDeckId: string; opponentLabel: string;
  gamesReviewed: number; decisionsWithChoice: number; criticalMoments: number; sent: number;
  accepted: number;
  byVerdict:  Record<Verdict, number>;
  byCategory: Record<Category, number>;
  rejections: Record<VerdictRejection, number>;
  batchesFailed: number;
  provider: string; model: string;
  sourceEngineBuild: string;
}
```

**Endpoints.**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/coach/status` | — | `{ available, provider, model }` — the page's mount guard (RN-60) | — |
| GET | `/api/coach/reviews` | `?jobId` or `?sourceJobId`; `category?`, `verdict?`, `limit` (1–200, default 50) | `{ reviews: CoachReviewView[] }` with the moment, both actions and the reason | 404 |
| GET | `/api/coach/hypotheses` | `?status?`, `limit` | `{ hypotheses: CoachHypothesisView[] }` with the measurement that settled each | — |
| POST | `/api/coach/hypotheses` | `{ title, statement, category, target, sourceReviewIds[] }` | 201 `{ hypothesis }` with `status: "proposed"` | 400 `INVALID_BODY`; 404 unknown review id |
| PATCH | `/api/coach/hypotheses/:id` | `{ status, measurementId?, baselineScore?, measuredScore?, note? }` | 200 `{ hypothesis }` | 409 when `confirmed`/`denied` without a `measurementId` (RN-66) |

## Implementation steps

1. Write `0010_coach.sql` with both tables, every `CHECK` and the three indexes; apply on a temp database and run `PRAGMA foreign_key_check` (BR-S07.T07-10).
2. Add `CoachReviewRow` and `CoachHypothesisRow` with their `TABLES` entries; run the drift test; add `"coach"` to the `JobKind` union in `@pokesearch/db/schema`.
3. Write `providerAvailable()` over `packages/llm` and the `GET /api/coach/status` route; spec that the `coach` job is refused at creation with no key and that the rest of the worker suite passes unchanged (RN-60).
4. Write `selectGames` with the worst-matchup rule, the lost-game filter and the `NoLogs` guard; spec all four cases (BR-S07.T07-01, -02).
5. Write `decodeDecisions` over the `log_blob` event stream, reading `margin` from the per-decision record [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md) writes; spec a fixture log round-trip.
6. Write `flagDecision` with the five flags and the `pre_defeat` window; spec each flag and the three-turn rule (BR-S07.T07-04).
7. Write `selectMoments` with the eligibility test, the comparator and the per-game cap; spec the four ordering properties and the null-margin sort (RN-65, BR-S07.T07-03).
8. Write `truncateActions` and spec the 60-action case, the chosen-action guarantee and the re-indexing (BR-S07.T07-05).
9. Write `playerSnapshot` from the log's view record and `renderBlock` with the card oracle text; spec `> the rendered context contains no opponent card identity` over 1,000 fixture moments (RN-65).
10. Write `validateVerdict` with the four rejections in order and the 300-character truncation; spec each rejection and the truncation (RN-65, BR-S07.T07-08).
11. Write `review()` with the batching, the per-batch try/catch and the counters; spec the 8-calls-of-5 case and the skipped-batch case (BR-S07.T07-06).
12. Register the `coach` job kind with [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)'s dispatcher, writing `coach_reviews` and the `CoachResult` summary; spec that it spawns no engine process and creates no hypothesis (BR-S07.T07-01, -09).
13. Add the five endpoints, including the `PATCH` guard requiring a `measurementId` for `confirmed`/`denied` (RN-66).
14. Mount the coach section into [S07.T06](T06-web-optimizer-page.md)'s route behind the status guard, listing reviews by category and offering "promote to hypothesis"; confirm the section is absent, not disabled, with no key.
15. Run the stub-provider acceptance: 12 lost games → at most 72 critical moments → 40 sent → review rows stored, with the rejection counters exercised by a stub that returns one item of each invalid shape.

## Edge cases and error handling

- **The LLM key is missing.** `POST /api/jobs { kind: "coach" }` returns 400 `LLM_NOT_CONFIGURED` naming the environment variables; the page section is not rendered; every other job kind is unaffected and the whole test suite passes with the keys unset. This is RN-60 in its strictest form, and the test asserts the *absence* of the section rather than a disabled state, so a keyless install has no dead UI.
- **The source job ran without `store_logs`.** `NoLogs` naming the job id and the flag that was needed. The coach never re-runs games to manufacture logs — re-running would produce a different sample than the one whose loss the user wants explained, and would quietly cost thousands of games.
- **Fewer lost games than requested.** A matchup the deck wins 90 % of the time may have only four losses in the source job. `selectGames` returns those four and `CoachResult.gamesReviewed` says so; padding with won games would defeat the point, which is that lost games are where gross errors live.
- **A game whose every decision was forced.** No decision had two or more legal actions, so no moment is eligible and the game contributes nothing. It is counted in `decisionsWithChoice` as zero, which is itself informative — a deck that never has a choice is a deck the bot is not piloting.
- **Every `margin` is null** — the source job used a bot that does not publish one, such as the heuristic bot. Then eligibility rests entirely on the flags, the ranking's margin term is the sentinel for every decision, and the job still works at reduced sensitivity. `CoachResult` reports how many moments had a margin, so a run with none is visible rather than mysterious.
- **The model returns fewer items than the batch.** Only the indices it answered are validated and stored; missing indices are counted as unanswered and reported. No retry loop, per the legacy's behaviour and BR-S07.T07-06.
- **The model names an action that does not exist.** `index_out_of_range`, counted and discarded. This is the rejection RN-65 names explicitly, and it is the one that fires most often on weaker models.
- **The model disagrees and points at the bot's own action.** `disagree_same_action`, counted and discarded — an incoherent verdict, not a near-miss.
- **A provider rate limit (HTTP 429).** The batch throws, is logged at `warn`, is skipped, and the job continues with the next batch. `batchesFailed` is reported. Small batches are the mitigation the legacy recorded for free-tier limits (RN-68).
- **A verdict that is well-formed and wrong.** Nothing here can catch it — the legacy measured half of one model's disagreements as rule errors despite the rules being in the prompt. It is stored as a review like any other, and RN-66 is the filter: it only matters once a human turns it into a hypothesis and the suite measures it. This is why `coach_reviews` is a ledger and not an input to anything.
- **A hypothesis a measurement denies.** `status = 'denied'` with its `measurement_id`, `baseline_score`, `measured_score` and a `note` saying what was reverted. The row is never deleted, which is precisely RN-66's *"o que a régua nega é revertido e fica registrado para não ser tentado de novo"* — the legacy's planner v10 (74.3 % → 73.4 %, mirror 50.1 % → 49.5 %) is the worked example.
- **Someone tries to write `rule_evidence` from the coach.** There is no code path and no evidence kind for it: `rule_evidence.kind` admits exactly four values and none is an LLM verdict (RN-63, [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)). The lint greps for it.

## Acceptance / verification

- [ ] `pnpm db:migrate` applies 0010 on a fresh temp database: `schema_migrations.version = 10`, zero rows, `PRAGMA foreign_key_check` clean, and `schema-drift.spec.ts > 0010 tables match their TypeScript row types` passes (BR-S07.T07-10).
- [ ] **Keyless run**: with `ANTHROPIC_API_KEY` and `LLM_BASE_URL` unset, `pnpm --filter worker test` and `pnpm --filter api test` pass in full, `POST /api/jobs { kind: "coach" }` returns 400 `LLM_NOT_CONFIGURED`, `GET /api/coach/status` reports `available: false`, and `optimize.spec.tsx > the coach section is absent, not disabled` passes (RN-60).
- [ ] `policy.spec.ts > no optimizer or engine module imports packages/llm` — an import-graph assertion over `apps/worker/src/optimizer`, `apps/worker/src/kinds` (except `coach.ts`) and `engine/` (RN-60).
- [ ] **Stub-provider end to end**: a `coach` job over a fixture source job with 12 lost games produces at most 72 critical moments (`12 × 6`), sends 40, and stores the accepted verdicts in `coach_reviews` with their provider, model and source engine build; `result_json` carries `byVerdict`, `byCategory`, `rejections` and `batchesFailed` (RN-65).
- [ ] `verdict.spec.ts` exercises all four rejections with a stub returning one item of each invalid shape: `> a betterIndex of 99 over 12 legal actions is rejected`, `> a disagree pointing at the chosen action is rejected`, `> a verdict outside the vocabulary is rejected`, `> a non-object item is rejected`; each increments its counter and stores no row (RN-65, BR-S07.T07-07).
- [ ] `prompt.spec.ts > the rendered context contains no opponent card identity` — a sweep over 1,000 fixture moments asserting the opponent's hand and deck appear only as counts and that no card name outside public zones reaches the text (RN-65).
- [ ] `moments.spec.ts > at most six moments per game`, `> a forced decision with one legal action is never a moment`, `> ranking puts flagged, tight, pre-defeat decisions first`, `> a null margin sorts last` (RN-65, BR-S07.T07-03).
- [ ] `moments.spec.ts > the five flags are produced from the log` and `> pre_defeat covers the last three turns of a lost game` (BR-S07.T07-04).
- [ ] `prompt.spec.ts > a 60-action decision is truncated to 30 with the chosen action present` and `> the chosen index is remapped` (BR-S07.T07-05).
- [ ] `select.spec.ts > the worst matchup is the lowest win_rate pairing`, `> only lost games are selected`, `> an explicit opponentDeckId overrides`, and `coach.spec.ts > a source job without store_logs fails with NoLogs` (BR-S07.T07-01, -02).
- [ ] `coach.spec.ts > 40 moments produce 8 calls of 5`, `> a batch that throws is skipped and the job completes`, `> the coach job spawns no engine process` (BR-S07.T07-01, -06).
- [ ] `coach.spec.ts > a completed coach job creates zero hypotheses`; `api.spec.ts > POST /api/coach/hypotheses is the only creation path`; `> PATCH to confirmed without a measurementId returns 409` and `coach-schema.spec.ts > a hypothesis cannot reach confirmed without a measurement_id` (RN-66, BR-S07.T07-09).
- [ ] `coach-schema.spec.ts > a verdict value outside the enum is rejected`, `> a category outside the nine is rejected`, `> a reason longer than 300 characters is rejected`; `pnpm lint` fails on a fixture writing `bots`, `rule_codes` or `rule_evidence` from `apps/worker/src/coach` (RN-63, RN-66, BR-S07.T07-07, -08).
- [ ] With a real provider configured, one manual round over a real optimize job's lost games: the accepted/rejected counts, the by-category distribution and the provider are recorded in the completion note next to the legacy's own rounds (31 of 40 valid with one model, 40 of 40 with another), so the feature's usefulness is measured rather than assumed.

## Risks and open questions

- **Risk — good opinions, no gains.** The legacy measured this twice: two hypotheses, one worth +0.2 points (inside the noise) and one worth −0.9 points (reverted). The realistic expectation is that this feature finds few things that move a ruler. Mitigation: the design says so, RN-66 makes measurement the only path from opinion to change, and `coach_hypotheses` keeps the denied ones so the ratio is visible. If after three rounds no hypothesis confirms, the honest action is to record that in the decision log and stop spending on it.
- **Risk — the model gets game rules wrong.** Half of one legacy model's disagreements were rule errors with the rules in the prompt. Mitigation: the rules paragraph is kept verbatim in spirit, the closed vocabulary and the four rejections catch incoherence but not wrongness, and the by-category distribution plus the accepted/rejected ratio are reported per provider so a bad model is visible within one job.
- **Risk — the `margin` scale is not comparable across bots.** `MARGIN_TIGHT = 0.5` is a threshold on [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md)'s need-score scale, which a future bot may rescale, silently changing what "tight" means. Mitigation: the constant is exported and a job parameter; `CoachResult` reports the margin distribution of the moments it selected, so a shifted scale shows up as "every decision is tight" or "none is".
- **Risk — logs are large.** `store_logs` costs 5–20 KB deflated per game ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)), so a job whose games the coach will read is opt-in twice and is retained only as long as `GAMES_RETENTION_DAYS`. Mitigation: the coach job records the source job's id and build on every review, so a review outlives the log it came from even though the log itself is swept.
- **Risk — `coach_reviews` grows without bound.** Forty rows per job is small, but a habitual user accumulates them. Mitigation: it is a ledger like `rule_evidence`, rows are tiny, and the retention question is deferred to the same place that one is.
- **Question — should the coach also review *won* games?** A bot that wins while playing badly is invisible to a lost-game filter. Recommendation: keep the lost-game filter, which is `COACH.md`'s own recommendation for the next round; add a `wonGames` parameter only if a round of lost-game review stops producing new categories.
- **Question — should the prompt ask "which turn did the game turn?" instead of reviewing scattered decisions?** `COACH.md` recommends exactly that and it is a different prompt shape — one question per game rather than six per game. Recommendation: ship the per-decision form first, because it reuses the margin ranking and the validation, and add the per-game question as a second `mode` once there is a baseline to compare it against. Recorded here because it is the legacy's own stated next step.
- **Sizing — this subtask is a review job and a hypothesis ledger, and could be two.** Steps 1–12 deliver `0010_coach.sql`'s `coach_reviews`, the `coach` job kind, the moment selection, the prompt and the four rejections — everything that turns stored games into verdicts. Steps 13–15 deliver `coach_hypotheses`, its lifecycle and the endpoints that link a hypothesis to the measurement that settles it (RN-66), which is a different kind of work and is the half that only matters once [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) exists. Not applied here, because RN-65 and RN-66 are two halves of one rule — an opinion is worth having only because it can become a measured hypothesis — and splitting them would put the rule in two files. Proposed for the user's decision.
- **DEPENDENCY-PROPOSAL: S07.T07 should depend on S04.T15 because** the `coach` job kind registers with the worker's dispatcher and uses its claim, progress and completion handling; today the worker runner is reached only transitively through [S07.T05](T05-optimize-job-orchestration.md).
- **DEPENDENCY-PROPOSAL: S07.T07 should depend on S05.T16 because** `coach_hypotheses.suite_id` references `suites(id)` from migration 0007 and `coach_hypotheses.measurement_id` references `measurements(id)` from migration 0008 ([S06.T08](../06-bots/T08-measurement-score-and-mirror.md)), so migration 0010 cannot apply before either.
- **DEPENDENCY-PROPOSAL: S07.T07 should depend on S06.T08 because** RN-66's lifecycle requires a suite measurement to move a hypothesis to `confirmed` or `denied`, and the `PATCH` guard refuses without one; today no edge records that dependency.

## References

- `pokemon/src/pokesearch/sim/coach.py` L1–7 — verified, the design contract in the module docstring: *"IA como técnico do piloto: revisa jogadas DEPOIS da partida, nunca durante… uma medição na régua são ~465 mil decisões… A IA só vê o que o jogador via (mesma regra de informação honesta do piloto) e responde em vocabulário fechado. Parecer é pista: a discordância que se repete vira hipótese de regra, e quem decide se a regra fica é a régua fixa."*
- `pokemon/src/pokesearch/sim/coach.py` L24–31 — verified: `PER_GAME = 6`, `MAX_LEGAL = 30`, `VERDICTS = ("concordo", "discordo", "indiferente")` and the nine `CATEGORIES` (`ordem_do_turno`, `alvo_do_ataque`, `energia`, `banco`, `compra_demais`, `descarte`, `recuo`, `corrida_de_premios`, `outra`), which map one to one onto the English enum here (D-006).
- `pokemon/src/pokesearch/sim/coach.py` L163–178 (`critical`) — verified: only decisions with `len(d.legal) >= 2`; eligibility `d.flags or (d.margin is not None and d.margin < 0.5)`; the rank tuple `(-forte, not apertada, not any(f.startswith("antes_da_derrota")), d.margin if d.margin is not None else 9e9)` where `forte` counts flags other than `antes_da_derrota`; `[:per_game]` per game. The selection BR-S07.T07-03 and BR-S07.T07-04 reproduce.
- `pokemon/src/pokesearch/sim/coach.py` L110–112 — verified: `if len(acts) > MAX_LEGAL: keep = sorted(set(range(MAX_LEGAL - 1)) | {idx}); acts, idx = [acts[i] for i in keep], keep.index(idx)` — the first 29 actions plus the bot's own, with the chosen index remapped. BR-S07.T07-05.
- `pokemon/src/pokesearch/sim/coach.py` L114–124 and L148–153 — verified: the flags `passou_com_ataque`, `recuou`, `puxou_do_banco`, `descartou`, and `antes_da_derrota:{reason}` applied to every decision with `d.turn >= ultimo - 2` in a lost game. BR-S07.T07-04's five flags and their three-turn window.
- `pokemon/src/pokesearch/sim/coach.py` L45–61 (`snapshot`) — verified: *"Só informação pública ou do próprio jogador. Mão, deck e prêmios do oponente entram apenas como CONTAGEM."* — own hand by name, `"mao": len(other.hand)`, both decks as counts, both discards as counters, and `no_deck` / `nos_premios` added only when `knowledge.prizes_known`. The `PlayerSnapshot` shape, and RN-65's information rule.
- `pokemon/src/pokesearch/sim/coach.py` L195–200 and L229–238 — verified: the `ITEM` schema requiring `["index", "veredito", "melhor", "categoria", "motivo"]` with `additionalProperties: False`, and `validate()`'s four rejections — non-dict or vocabulary miss, `melhor` not an `int` (excluding `bool`) or outside `0 <= melhor < len(d.legal)`, and `veredito == "discordo" and melhor == d.chosen` with the comment *"discorda e aponta a mesma jogada: parecer incoerente"* — plus `str(item.get("motivo") or "")[:300]`. BR-S07.T07-07, -08 and RN-65's rejection rules.
- `pokemon/src/pokesearch/sim/coach.py` L241–264 (`review`) and L184–193 (`SYSTEM`) — verified: `limit=40`, `batch=5`, `roles.available("code")` returning `[]` when no provider is configured, `roles.complete("code", …, max_tokens=3000, json_schema=SCHEMA, temperature=0)`, a failed batch logged and skipped without retry, and the system prompt's rules paragraph (attacking ends the turn; one Supporter and one Energy per turn; a damage counter is an effect and can be prevented, damage cannot; Weakness and Resistance only on the Active; deck-out on the start-of-turn draw; the opponent's hand, deck and prizes unknown). BR-S07.T07-06 and the prompt above.
- `pokemon/src/pokesearch/sim/coach.py` L93–99 (`record`) — verified: *"Embrulha a política do lado avaliado. Não muda decisão nenhuma: só anota."* — recording never changes the game, which RN-65 states and which here is free, since the coach reads stored logs rather than wrapping a policy.
- `pokemon/src/pokesearch/sim/pilot.py` L380–381 — verified: `memo["margin"] = None if second is None else round(best_score - second, 3)` with the comment *"quão apertada foi a escolha: o técnico (sim/coach.py) revisa primeiro as decisões de margem pequena"*, reset to `None` at L391. The quantity [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md) writes into the game log instead of into a live policy's memo.
- `pokemon/benchmarks/COACH.md` — verified: round 1 (Groq `openai/gpt-oss-120b`, ruler v3) with 12 games, 765 decisions with a choice, 58 critical moments, 40 sent, 31 valid verdicts (14 agree / 15 disagree / 2 indifferent), and its hypothesis measured over 3,000 + 2,400 games at 74.1 % → 74.3 % with the mirror 50.4 % → 50.1 %, *"Sem ganho mensurável"*; round 2 (Anthropic `claude-opus-5`, same 12 games and 40 moments) with 40 of 40 valid (20 / 18 / 2) and *"Nenhum erro de regra"*, whose planner v10 measured 74.3 % → 73.4 % with the mirror 50.1 % → 49.5 %, *"A medição não sustentou: revertido"*; and the closing lesson *"Parecer bom não é o mesmo que ganho… O que moveu a régua até aqui foram erros grosseiros achados olhando partidas perdidas por dentro"* with the recommendation to *"mandar para o técnico só as partidas PERDIDAS de um confronto ruim (`--opponent`), e perguntar pelo turno em que a partida virou"*. RN-66's worked example and this subtask's scope.
- `pokemon/ESPECIFICACAO.md` §4.5 — verified: RN-60 *"IA nunca está no caminho crítico: sem chave, tudo funciona"*; RN-63 *"Parecer de IA não é evidência de que uma carta está certa; é fila de revisão"*; RN-65 *"a IA revisa até 6 momentos críticos por partida, vê só o que o jogador vê, responde em vocabulário fechado; parecer que aponta jogada inexistente ou 'discordo' com a mesma jogada é recusado. Gravar não muda a partida"*; RN-66 *"Sugestão do técnico vira hipótese medida na régua; o que a régua nega é revertido e fica registrado para não ser tentado de novo"*; RN-68 *"Conta gratuita da Groq: trabalhar em lotes pequenos"*.
- [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) (`games.log_blob`, `store_logs`, `MAX_LOG_BYTES`, the retention rule), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md) (the per-decision `margin` and the prompt resolvers), [S06.T01](../06-bots/T01-honest-information-view.md) (RN-30's player view, whose rule the reviewer's snapshot repeats), [S06.T08](../06-bots/T08-measurement-score-and-mirror.md) (the suite measurement that settles a hypothesis), [S07.T05](T05-optimize-job-orchestration.md) (the optimize job whose logs are read), [S07.T06](T06-web-optimizer-page.md) (the route the coach section mounts into), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) (the four evidence kinds that exclude an AI opinion, RN-63), [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md) (the other optional-LLM feature, with its own queue).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
