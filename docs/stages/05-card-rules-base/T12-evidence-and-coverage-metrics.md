# S05.T12 — Evidence recording and coverage metrics

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 12 / 16 |
| Depends on | [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md), [S04.T15](../04-game-engine-core/T15-worker-job-runner.md), [S05.T01](T01-rules-schema-migration.md), [S05.T11](T11-legacy-tests-to-scenarios.md) |
| Unblocks | [S05.T13](T13-rules-editor-ui.md), [S05.T14](T14-coverage-page-and-authoring-queue.md), [S05.T16](T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md), [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md) |
| Parallel with | [S05.T08](T08-spreadsheet-import.md), [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T15](T15-rules-export-import-seed.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `cardUsage` denominator (meta copies over the RN-03 window) — from [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)
- `module` worker (job kind `scenarios`) — from [S04.T15](../04-game-engine-core/T15-worker-job-runner.md)
- `table` `rule_evidence`, view `card_status` — from [S05.T01](T01-rules-schema-migration.md)
- `file` scenarios — from [S05.T11](T11-legacy-tests-to-scenarios.md)
- `file` `pokemon/src/pokesearch/sim/coverage.py` and `sim/verified.py` — the legacy metric and its 3.5 s denominator query; read-only reference

## Outputs (proposed)
- `module` worker kind `scenarios` → `rule_evidence` rows `(text_hash, code, kind: scenario, ref: scenario id, passed, engine_build, rules_snapshot)`; `attr_only` evidence for parts without text; `builtin` evidence when the builtin's scenario passes — consumed by [S05.T13](T13-rules-editor-ui.md), [S05.T14](T14-coverage-page-and-authoring-queue.md), [S05.T16](T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md), [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md)
- `module` `apps/api/src/rules/coverage.ts` — `coverage(db, format, days) → { exact, proven, byKind: { scenario, twinleaf_diff, attr_only, builtin }, byCard: [...] }` weighted by meta copies (Basic Energy counted, as the legacy did: 12.6 points of the denominator); `GET /api/rules/coverage`; `user_deck_versions.coverage_exact/proven` filled on version creation
- `table` `card_usage_cache(format, days, computed_at, card_id, name_key, copies, decks)` — the precomputed RN-03 denominator, refreshed by the worker after every deck sync; added during this elaboration because the legacy query takes ~3.5 s and is read on every coverage request

## Initial objective
Two honest numbers, always together: how much of the played meta the engine *claims* to model exactly and how much of that is *proven* by passing evidence on the current engine build (RN-70) — the metric that guards against the coverage regression of switching engines.

## Context

This subtask turns the rules base into a number the user can act on, and it is the only place in the stage where "how much works" is decided. Everything else produces inputs: texts and parts ([S05.T02](T02-effect-texts-and-card-parts.md)), codes and programs ([S05.T07](T07-rule-codes-composition-semantics.md)), scenarios ([S05.T11](T11-legacy-tests-to-scenarios.md)). Here they become `exact` and `proven`, weighted by what the meta actually plays.

The legacy had the right idea and three structural problems. Its metric lived in `sim/coverage.py::exact_coverage`, which merged `card_impl.status`, the engine's own card registry and `verified.proofs()` at request time, and classified every played card name into one of seven kinds (`engine`, `catalog`, `generated`, `vanilla_exact` counting as exact; `catalog_approx`, `vanilla` and `missing` not). The problems: it keyed on **card name**, so two printings with different text shared one verdict (`ESPECIFICACAO.md` §6.1 prices that at 1.4 % of meta copies); it recomputed a **3.5 s aggregate** over roughly a million `deck_cards` rows on every visit to `/sim/cards`, cached in a process-local dict that died with the process; and its proof store was a **JSON file with no engine build attached**, so a proof recorded against one build silently counted for the next.

The design here fixes all three. Coverage is keyed on `text_hash` through `card_parts`, so RN-05 holds by construction. The denominator is precomputed into `card_usage_cache` by the worker after every deck sync, so a coverage request is a join, not an aggregate. And every evidence row carries `engine_build` and `rules_snapshot`, so "proven" is a statement about a specific binary running a specific set of code bodies — which is RN-73 as revised: *a new build makes proof stale until the scenarios rerun*.

The rules that matter most are the ones about what does **not** count. RN-63: an LLM opinion is never evidence. The legacy already said so in `verified.py`'s docstring — *"Parecer de IA não é evidência: serve para achar suspeita, não para provar"* — and it is enforced here by the `kind` enum, which has exactly four members and no way to add a fifth without a migration. The LLM review queue of [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md) writes to its own table and cannot reach `rule_evidence` at all. RN-71: a card counts only when *every* part with text has evidence; a Pokémon with a proven attack and an unproven ability is not proven. RN-74: the invariant `0 < proven ≤ exact` is asserted as a test, not hoped for — the legacy asserted the same thing in `test_verified.py::test_verified_never_exceeds_exact`.

The fourth evidence kind, `attr_only`, is the one that needs explaining. A printing whose parts carry no text — Dreepy, with two attacks and no effect text — has nothing to code and nothing to prove about behaviour. What it *does* need proving is that its attributes match the official card: HP, types, stage, retreat, weakness, resistance, prize value, attack costs and damage. That is RN-75, kept by construction because [S04.T02](../04-game-engine-core/T02-card-definition-model.md) derives the `CardDef` from the card tables rather than hand-writing it, and it is *recorded* by an `attr_only` evidence row per printing per build. The legacy proved the same thing with `tests/test_audit.py` over 721 registered cards; here the derivation check runs as part of the scenario job and writes a row, so `proven` has a defensible meaning for a vanilla card instead of an exemption.

## Scope

- **In scope.** The worker job kind `scenarios` (run a scenario set, write evidence, update `rules_current`); the `attr_only` derivation check and its rows; the staleness definition and the automatic re-run trigger; `card_usage_cache` and its refresh; `apps/api/src/rules/coverage.ts` with the weighted formulas and the split by kind; `GET /api/rules/coverage`; filling `user_deck_versions.coverage_exact/proven`; the invariant tests; the `byCard` and `byText` breakdowns the authoring queue and the optimizer pool consume.
- **Out of scope.** The schema and the `card_status` view DDL ([S05.T01](T01-rules-schema-migration.md)); writing scenarios ([S05.T11](T11-legacy-tests-to-scenarios.md)); the scenario runner itself ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)); the job queue and the engine spawn ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)); the meta window query that produces raw usage ([S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)); the pages that display the numbers ([S05.T13](T13-rules-editor-ui.md), [S05.T14](T14-coverage-page-and-authoring-queue.md)); `twinleaf_diff` evidence production ([S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md)) — this subtask only defines its shape and counts it.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-03 | **Kept, reused as the denominator.** Coverage is weighted by copies in Standard tournament lists of the meta window — last 90 days, ≥ 16 players, at most 400 tournaments — the same window [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) defines. Basic Energy is counted (12.6 points of the legacy denominator), because a deck that cannot play its energy cannot be simulated. | `card_usage_cache` is built from `deck_cards` joined to `decks` and `tournaments` with the RN-03 predicates, taken verbatim from [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)'s constants | `coverage.spec.ts > the denominator matches the RN-03 window` (a fixture with an out-of-window tournament is excluded); `> Basic Energy copies are in the denominator` |
| RN-63 | **Kept.** An AI opinion is not evidence, it is a review queue. `rule_evidence.kind` admits exactly `scenario`, `twinleaf_diff`, `attr_only` and `builtin`; there is no LLM kind and no code path from [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md) into the table. | the `CHECK (kind IN (…))` on `rule_evidence` ([S05.T01](T01-rules-schema-migration.md)); the worker's evidence writer accepts only the four kinds; the LLM feature writes to its own review table | `evidence.spec.ts > an evidence row with kind 'llm' is rejected`; `pnpm check` greps `apps/worker` and `packages/llm` for `INSERT INTO rule_evidence` and allows it only in the evidence writer |
| RN-70 | **Kept.** The two numbers are always produced and returned together: `coverage()` has no mode that returns one without the other, and `GET /api/rules/coverage` always carries both plus the split by kind. | the `Coverage` return type has both fields required; the endpoint has no `?only=` parameter | `coverage.spec.ts > the response always carries exact and proven`; `api.spec.ts > GET /api/rules/coverage returns both numbers and byKind` |
| RN-71 | **Kept.** A card counts as proven only when every part of that printing carrying a text has evidence, and `rule_box` parts never count. A part with no text contributes nothing to `exact` and requires an `attr_only` row for `proven`. | the `part_state` CTE of `card_status` ([S05.T01](T01-rules-schema-migration.md)); the coverage query reads the view, never re-derives the rule | `coverage.spec.ts > a Pokémon with a proven attack and an unproven ability is not proven`; `> a printing whose only parts are textless is proven once attr_only evidence exists` |
| RN-72 | **Kept, with the four kinds named.** Accepted evidence is a passing scenario (`scenario`), agreement with an implemented second source when that translation is the code in use (`twinleaf_diff`), the attribute-derivation check for textless parts (`attr_only`), and a passing scenario over a builtin (`builtin`). Nothing else. | the `kind` enum; the evidence writer's four entry points | `evidence.spec.ts > the four kinds are the only ones accepted`; `> a twinleaf_diff row is written only when the code in use has source 'twinleaf'` |
| RN-73 | **Revised.** The legacy removed a proof when its test failed or was skipped. Here evidence is a ledger (RN-64) and is scoped to an engine build: a new `engine_build` makes every proof stale until the scenarios rerun, and within a build a later `passed = 0` row supersedes an earlier pass. The effect is the same — a failing test stops proving — without deleting history. | the `proven_pair` / `attr_ok` CTEs keyed on `rules_current.engine_build` with `MAX(id)` per `(text_hash, code, kind, ref, engine_build)`; the worker's build-change trigger | `coverage.spec.ts > bumping engine_build drops proven to 0 and leaves exact unchanged`; `> appending a failing rerun removes the proof without a delete` |
| RN-74 | **Kept.** The invariant `0 < proven ≤ exact` holds for the weighted shares and per evidence kind, and it is a test that runs against the real database, not a comment. | `coverage()` asserts it in development and the invariant test asserts it in CI | `coverage.spec.ts > 0 < proven <= exact`; `> proven_by_kind[k] <= exact_copies for every kind`; `> textless printings are proven exactly as often as they are exact` |
| RN-75 | **Kept by construction, recorded as `attr_only`.** Every registered printing matches the official card in all attributes because the `CardDef` is derived from the card tables ([S04.T02](../04-game-engine-core/T02-card-definition-model.md)) rather than hand-written; the derivation check runs per build and writes one `attr_only` row per printing. | the `attr_only` step of the `scenarios` job, comparing a round-tripped `CardDef` against `cards`/`attacks`/`abilities` plus `card_overrides` | `evidence.spec.ts > a printing whose CardDef round-trips gets a passing attr_only row`; `> a deliberately corrupted CardDef yields passed = 0 and the card stops being proven` |
| BR-S05.T12-01 | An evidence row is keyed by `(text_hash, code, kind, ref, engine_build)` for behavioural kinds and `(card_id, kind, ref, engine_build)` for `attr_only`; `rules_snapshot` is recorded but is **not** part of the key, because it is what makes a row stale rather than what identifies it. | the writer's insert; the `rule_evidence_latest_idx` and `rule_evidence_card_build_idx` indexes ([S05.T01](T01-rules-schema-migration.md)) | `evidence.spec.ts > two runs of one scenario on one build produce two rows and one effective proof`; `> the snapshot does not split the key` |
| BR-S05.T12-02 | Evidence is **stale** when its `rules_snapshot` differs from `rules_current.rules_snapshot`, even though it still counts as proof. Staleness is reported everywhere the number is shown, and the worker re-runs the affected scenarios automatically. | `isStale(evidence) = evidence.rules_snapshot <> rules_current.rules_snapshot`; the coverage response carries `staleTexts` and `staleCopies` | `coverage.spec.ts > editing a code body marks its texts' evidence stale without lowering proven`; `> the response reports staleCopies` |
| BR-S05.T12-03 | The worker is the only writer of `rule_evidence` and of `rules_current`; the api and the scripts never write either. | the evidence writer lives in `apps/worker`; `pnpm check` greps `apps/api` and `packages/db` for writes to both tables | `pnpm check` fails on a fixture writing `rule_evidence` from `apps/api` (Architecture principle 2) |
| BR-S05.T12-04 | `card_usage_cache` is a derived table with a single writer (the worker) and an explicit `computed_at`; a coverage request never triggers an aggregate over `deck_cards`. | the refresh runs at the end of the deck sync and on demand; `coverage()` reads only the cache | `coverage.spec.ts > coverage performs no aggregate over deck_cards` (statement capture); `> a stale cache is reported with its age, not silently used as fresh` |
| BR-S05.T12-05 | A `draft`, `approx` or `unimplemented` code makes its texts' cards not exact, and therefore not proven, regardless of any evidence that exists for them. Evidence never lifts a status. | the `part_state` CTE's `status NOT IN ('exact','builtin')` test, evaluated before the proven test | `coverage.spec.ts > a card with a passing scenario over a draft code is neither exact nor proven` |
| BR-S05.T12-06 | Coverage is reported per card **and** per text, and the per-text breakdown carries the meta copies of every printing that shares the text, so the authoring queue can order by value. | `coverage()` returns `byCard` and `byText`; the weights come from `card_usage_cache` joined through `card_parts` | `coverage.spec.ts > byText sums to the same denominator as byCard`; `> a text shared by three printings carries the sum of their copies` |
| BR-S05.T12-07 | `user_deck_versions.coverage_exact` and `coverage_proven` are computed from the version's own 60 cards, weighted by copies in that list, and are written once at version creation; they are never back-filled silently. | the deck-version creation path ([S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)) calls `coverageForList()`; a recompute is an explicit action | `coverage.spec.ts > a 60-card list with one uncovered 4-of reports 56/60 exact`; `> creating a version twice yields the same numbers` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `rule_evidence` | C | worker (`scenarios` job) | after each scenario run | append only; one row per `(text_hash, code, kind, ref, engine_build)` per run; never an upsert | RN-64, RN-72 |
| `rule_evidence` | C | worker (`attr_only` step) | once per printing per engine build | append only; `card_id` set, `text_hash`/`code` null | RN-75 |
| `rule_evidence` | C | worker (`twinleaf_diff`) | when the oracle job runs | append only; written only for codes whose `text_codes.source = 'twinleaf'` | [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md), RN-72 |
| `rule_evidence` | U / D | — | never | the two triggers abort; there is no code path | RN-64 |
| `rules_current` | U | worker | at startup, after an engine build change, after any write to `rule_codes`/`text_codes` | single row `id = 1`; `engine_build` from `ptcg-cli --version`, `rules_snapshot` from `rulesSnapshot(db)` | BR-S05.T12-03 |
| `card_usage_cache` | C/D | worker | after every deck sync ([S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)) and on demand | delete-then-insert per `(format, days)`; `computed_at` set | BR-S05.T12-04 |
| `card_usage_cache` | R | api | every coverage request, every authoring-queue request | read-only; age reported | [S05.T14](T14-coverage-page-and-authoring-queue.md) |
| `card_status` (view) | R | api, worker, script | coverage, queue, optimizer pool | read-only by definition | [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) |
| `rule_scenarios` | R | worker | building the scenario job's set | read-only; git is the source ([S05.T11](T11-legacy-tests-to-scenarios.md)) | — |
| `rule_codes`, `text_codes`, `card_parts`, `effect_texts` | R | api, worker | composing, weighting, reporting | read-only here | — |
| `user_deck_versions.coverage_exact`, `coverage_proven` | U | api | at version creation | written once per version; recompute is an explicit action | BR-S05.T12-07 |
| `jobs`, `job_pairings` | C/U | worker | the `scenarios` job's own bookkeeping | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) owns the tables | — |
| any rules table | — | engine | never | the engine receives programs and card defs in the job JSON | Architecture principle 1 |

**Endpoints.**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/rules/coverage` | `?format=STANDARD&days=90&byCard=1&byText=1&limit=200` | `{ window, denominator, exact, proven, exactCopies, provenCopies, byKind, staleTexts, staleCopies, usageComputedAt, byCard?, byText? }` | 409 `NoUsageCache` when the denominator has never been computed |
| GET | `/api/rules/coverage/text/:hash` | — | `{ textHash, copies, printings, codes, evidence: [{ kind, ref, passed, engineBuild, rulesSnapshot, stale, runAt }] }` | 404 |
| POST | `/api/jobs` | `{ kind: "scenarios", params: { only?: string[], reason: "manual" \| "build_change" \| "code_edit" } }` | the job row | 409 when a `scenarios` job is already running |

## Interfaces

**The `card_status` contract.** The view's DDL lives in [S05.T01](T01-rules-schema-migration.md); what matters here is the decision it encodes, restated as the three predicates the coverage query depends on.

```sql
-- counted part  : card_parts.text_hash IS NOT NULL AND part_kind <> 'rule_box'
-- part is exact : the text has at least one text_codes row AND every referenced code
--                 has status IN ('exact','builtin')
-- part is proven: part is exact AND for every text_codes row of that text there is a
--                 LATEST passing rule_evidence row of kind IN ('scenario','twinleaf_diff','builtin')
--                 for rules_current.engine_build
-- card.exact    : no counted part fails "is exact"          (a card with no counted part is exact)
-- card.proven   : card.exact AND no counted part fails "is proven"
--                 AND the printing has a latest passing attr_only row for the current build
```

**Staleness** is deliberately separate from proof, because an edited code body under a passing scenario is a real risk and hiding it would be worse than either failing or ignoring it.

```sql
-- every text whose proof was produced under a different rules snapshot than the one in force
CREATE VIEW stale_evidence AS
SELECT e.text_hash, e.code, e.ref, e.rules_snapshot AS proved_under, c.rules_snapshot AS current
FROM rule_evidence e
JOIN rules_current c ON c.id = 1
WHERE e.engine_build = c.engine_build
  AND e.passed = 1
  AND e.rules_snapshot <> c.rules_snapshot
  AND e.id = (SELECT MAX(e2.id) FROM rule_evidence e2
               WHERE e2.text_hash = e.text_hash AND e2.code = e.code
                 AND e2.kind = e.kind AND e2.ref = e.ref
                 AND e2.engine_build = e.engine_build);
```

**The coverage query.** One statement, weighted by `card_usage_cache`, split by the evidence kind that carried each proven card. The "kind" of a proven card is the *weakest* kind among its parts, ordered `scenario` > `twinleaf_diff` > `builtin` > `attr_only`, so a card proven partly by scenario and partly by attributes is reported under `attr_only` — the conservative reading, and the one that keeps the four numbers summing to `provenCopies`.

```sql
-- @postgres: identical; card_usage_cache becomes a materialized view refreshed by the same worker step.
WITH usage AS (
    SELECT card_id, copies FROM card_usage_cache WHERE format = :format AND days = :days
),
kinds AS (                       -- the weakest evidence kind per proven card
    SELECT p.card_id,
           MIN(CASE e.kind WHEN 'scenario' THEN 1 WHEN 'twinleaf_diff' THEN 2
                           WHEN 'builtin'  THEN 3 ELSE 4 END) AS rank
    FROM card_parts p
    JOIN text_codes tc ON tc.text_hash = p.text_hash
    JOIN rule_evidence e ON e.text_hash = tc.text_hash AND e.code = tc.code
    JOIN rules_current c ON c.id = 1 AND c.engine_build = e.engine_build
    WHERE e.passed = 1 AND p.part_kind <> 'rule_box'
    GROUP BY p.card_id
)
SELECT
  SUM(u.copies)                                                   AS denominator,
  SUM(CASE WHEN s.exact  = 1 THEN u.copies ELSE 0 END)            AS exact_copies,
  SUM(CASE WHEN s.proven = 1 THEN u.copies ELSE 0 END)            AS proven_copies,
  SUM(CASE WHEN s.proven = 1 AND COALESCE(k.rank, 4) = 1 THEN u.copies ELSE 0 END) AS by_scenario,
  SUM(CASE WHEN s.proven = 1 AND COALESCE(k.rank, 4) = 2 THEN u.copies ELSE 0 END) AS by_twinleaf_diff,
  SUM(CASE WHEN s.proven = 1 AND COALESCE(k.rank, 4) = 3 THEN u.copies ELSE 0 END) AS by_builtin,
  SUM(CASE WHEN s.proven = 1 AND COALESCE(k.rank, 4) = 4 THEN u.copies ELSE 0 END) AS by_attr_only
FROM usage u
JOIN card_status s ON s.card_id = u.card_id
LEFT JOIN kinds  k ON k.card_id = u.card_id;
```

`exact = exact_copies / denominator`, `proven = proven_copies / denominator`, and each `byKind[k] = <that column> / denominator`. The four `byKind` values sum to `proven` by construction, which is the property the test asserts.

**The denominator.** `card_usage_cache` is the legacy's `meta_usage` query, run once per window instead of once per request.

```sql
CREATE TABLE card_usage_cache (
    format      TEXT    NOT NULL,
    days        INTEGER NOT NULL,
    card_id     TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    name_key    TEXT    NOT NULL,
    copies      INTEGER NOT NULL,
    decks       INTEGER NOT NULL,
    computed_at TEXT    NOT NULL,
    PRIMARY KEY (format, days, card_id)
);
CREATE INDEX card_usage_cache_copies_idx ON card_usage_cache (format, days, copies DESC);
```

It resolves to `card_id`, not to `name_key` — the legacy aggregated by name and could not tell two printings apart, which is the same bug RN-05 fixes on the other side. An unresolved decklist line ([S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md)) contributes to the denominator under a synthetic `card_id` of `unresolved:<name_key>` and is always counted as not exact, so unresolved lines depress coverage rather than vanishing from it.

**The evidence writer** (`apps/worker/src/rules/evidence.ts`):

```ts
export interface EvidenceRow {
  textHash: string | null; code: string | null; cardId: string | null;
  kind: "scenario" | "twinleaf_diff" | "attr_only" | "builtin";
  ref: string;                 // scenario id, oracle diff id, or "carddef"
  passed: boolean;
  engineBuild: string;         // ptcg-cli --version
  rulesSnapshot: string;       // rulesSnapshot(db) at run time
  runAt: string;
}
export function writeEvidence(db: Db, rows: EvidenceRow[]): { inserted: number };
export function refreshRulesCurrent(db: Db, engineBin: string): { engineBuild: string; rulesSnapshot: string; changed: boolean };
export function runScenarioJob(db: Db, opts: { only?: string[]; reason: ScenarioRunReason }): ScenarioJobResult;
export function checkCardDefs(db: Db): EvidenceRow[];    // the attr_only step (RN-75)
```

**One scenario, several evidence rows.** A scenario declares `verifies: ["text:<hash>", …]`. For each declared text, the writer emits one row per `text_codes` entry of that text — because RN-71 counts *parts*, and a part is proven only when every code of its text is proven. A scenario covering a two-code text therefore writes two rows with the same `ref`. This is deliberate: it means a text whose second code is added later immediately becomes unproven, which is correct, rather than silently keeping the old scenario's blanket pass.

**Coverage module** (`apps/api/src/rules/coverage.ts`):

```ts
export interface Coverage {
  window: { format: string; days: number; tournaments: number; usageComputedAt: string };
  denominator: number;
  exact: number; proven: number;            // shares in [0, 1]
  exactCopies: number; provenCopies: number;
  byKind: { scenario: number; twinleaf_diff: number; attr_only: number; builtin: number };
  staleTexts: number; staleCopies: number;
  byCard?: { cardId: string; name: string; copies: number; exact: boolean; proven: boolean;
             missingCodes: number; unprovenCodes: number }[];
  byText?: { textHash: string; kind: string; name: string; copies: number; printings: number;
             codes: number; status: CodeStatus; proven: boolean }[];
}
export function coverage(db: Db, format?: string, days?: number, opts?: CoverageOpts): Coverage;
export function coverageForList(db: Db, lines: { cardId: string; count: number }[]): { exact: number; proven: number };
```

**The build-change trigger.** At worker startup and whenever `ptcg-cli --version` changes, `refreshRulesCurrent` writes the new build into `rules_current` and enqueues a `scenarios` job with `reason: "build_change"`. Until it finishes, `proven` is legitimately low and the coverage response says why (`staleTexts`, plus a `rebuilding: true` flag derived from the running job). A code edit enqueues the same job with `reason: "code_edit"` and `only` set to the scenarios of the affected texts.

## Implementation steps

1. Add `card_usage_cache` in migration `0006_rules.sql` ([S05.T01](T01-rules-schema-migration.md)) and write its refresh from [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)'s window constants; measure the refresh against the legacy's ~3.5 s and record it.
2. Write `refreshRulesCurrent` and wire it into worker startup; spec that a build change is detected and recorded.
3. Write `writeEvidence` with the four kinds, the `(text_hash, code, kind, ref, engine_build)` keying and the "one row per code of every declared text" rule; spec the two-code text case.
4. Write `checkCardDefs` (the `attr_only` step): derive every Standard printing's `CardDef` ([S04.T02](../04-game-engine-core/T02-card-definition-model.md)), compare it field by field against the card tables plus `card_overrides`, and emit a row per printing; spec the corrupted-definition case.
5. Write the worker job kind `scenarios`: build the set from `rule_scenarios`, run it through the engine ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)), write evidence, run the `attr_only` step, report pass/fail per scenario.
6. Add the build-change and code-edit triggers that enqueue the job with the right `reason` and `only` set.
7. Write the `stale_evidence` view and the staleness counts in the coverage response.
8. Write the coverage query and `coverage()`, with `byCard` and `byText`; spec the weakest-kind rule and the sum-to-`proven` property.
9. Write `coverageForList` and wire it into deck-version creation ([S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)).
10. Add `GET /api/rules/coverage` and `GET /api/rules/coverage/text/:hash`.
11. Write the invariant tests (RN-74) and run them against the real database; record the first real `exact` and `proven` numbers in the completion note, with the split by kind, so the stage has a baseline.

## Edge cases and error handling

- **A code edited while evidence exists.** The evidence keeps counting (it is a pass on the current build) and is marked stale, because the snapshot changed. The coverage response reports `staleCopies` and the worker re-runs the affected scenarios. If a rerun fails, a `passed = 0` row supersedes the pass and `proven` drops — without a delete (RN-64, RN-73).
- **A new engine build.** Every proof becomes invalid at once because `proven_pair` filters on `rules_current.engine_build`. `proven` falls to 0, `exact` is unchanged, and the response carries `rebuilding: true` while the automatic `scenarios` job runs. This is the behaviour RN-73's revision asks for and it is asserted directly.
- **A scenario deleted or renamed.** Its old evidence rows remain in the ledger, keyed on a `ref` no scenario matches any more. They still count until superseded, which is wrong, so `GET /api/rules/coverage` reports `orphanedRefs` and [S05.T11](T11-legacy-tests-to-scenarios.md) keeps ids permanent. A rename without a redirect is a reported defect.
- **A text with codes but no scenario at all.** `exact` can be 1, `proven` is 0. This is the normal state of most of the base at the start of the stage and is exactly what the authoring queue orders by.
- **A printing that is in the meta but not in `cards`** — an unresolved decklist line. It enters the denominator as `unresolved:<name_key>` and is never exact, so coverage falls rather than the card disappearing. The count of unresolved copies is reported beside the two numbers.
- **The denominator has never been computed.** `GET /api/rules/coverage` returns 409 `NoUsageCache` with the command to run, instead of silently computing a 3.5 s aggregate on the request thread or reporting a share of zero.
- **The denominator is stale** because the deck sync has not run for days. The response carries `usageComputedAt`; the page shows the age. Coverage over an old window is still meaningful, and pretending it is fresh is not.
- **A card proven by `attr_only` alone that later gains a text** (a reprint with an effect). Its `card_status.exact` drops the moment `card_parts` gains a texted part with no codes. The `attr_only` row stays valid and simply stops being sufficient.
- **Two scenarios proving the same `(text, code)` pair, one passing and one failing.** They have different `ref` values, so they are different groups and both count: the pair is proven by the passing one. That is correct — a scenario is a claim about a situation, and one failing situation does not unprove another. The failing scenario is nevertheless red in the runner and in the editor, which is where it gets attention.
- **`0 < proven` fails because nothing is proven yet.** The invariant is asserted only once the first scenarios have run; before that the test asserts `proven = 0 ≤ exact` and the completion note records when the strict form starts applying. Asserting a strict inequality against an empty database would be theatre.

## Acceptance / verification

- [ ] `pnpm --filter api test coverage.spec.ts` green, including `> 0 < proven <= exact` and `> proven_by_kind[k] <= exact_copies for every kind` against the real database (RN-74).
- [ ] `coverage.spec.ts > the response always carries exact and proven` and `api.spec.ts > GET /api/rules/coverage returns both numbers and byKind`, with the four `byKind` values summing to `provenCopies` (RN-70).
- [ ] `coverage.spec.ts > a Pokémon with a proven attack and an unproven ability is not proven` and `> a printing whose only parts are textless is proven once attr_only evidence exists` (RN-71, RN-75).
- [ ] `coverage.spec.ts > bumping engine_build drops proven to 0 and leaves exact unchanged` and `> appending a failing rerun removes the proof without a delete` — the row count only grows (RN-73, RN-64).
- [ ] `evidence.spec.ts > an evidence row with kind 'llm' is rejected`, and `pnpm check` fails on a fixture writing `rule_evidence` from `apps/api` or from the LLM package (RN-63, BR-S05.T12-03).
- [ ] `coverage.spec.ts > the denominator matches the RN-03 window` — a fixture tournament outside 90 days or under 16 players is excluded, and Basic Energy copies are included (RN-03).
- [ ] `coverage.spec.ts > coverage performs no aggregate over deck_cards` (statement capture) and the `card_usage_cache` refresh time is recorded against the legacy's ~3.5 s (BR-S05.T12-04).
- [ ] `coverage.spec.ts > a card with a passing scenario over a draft code is neither exact nor proven` (BR-S05.T12-05).
- [ ] `coverage.spec.ts > editing a code body marks its texts' evidence stale without lowering proven` and the response's `staleCopies` is non-zero (BR-S05.T12-02).
- [ ] `coverage.spec.ts > byText sums to the same denominator as byCard` and `> a text shared by three printings carries the sum of their copies` (BR-S05.T12-06).
- [ ] `coverage.spec.ts > a 60-card list with one uncovered 4-of reports 56/60 exact` and creating the same version twice yields identical numbers (BR-S05.T12-07).
- [ ] A real run of the `scenarios` job writes evidence for every converted scenario, and the first real `exact` / `proven` pair with its split by kind is recorded in the completion note as the stage's baseline.

## Risks and open questions

- **Risk — `proven` is near zero for most of the stage** because scenarios are converted by hand ([S05.T11](T11-legacy-tests-to-scenarios.md)) while codes arrive in bulk from three importers. The two numbers will diverge sharply and could read as failure. Mitigation: the exit criterion is `exact ≥ 90 %` and `proven ≥ 60 %`, the split by kind shows where the proof comes from, and `attr_only` alone covers a meaningful share of copies (the legacy's textless-exact bucket was 5.7 %).
- **Risk — the weakest-kind attribution is misread** as "this card was only checked by attributes". It means the *weakest* part was; the per-card and per-text breakdowns show the detail. Mitigation: the page labels it "weakest evidence per card" ([S05.T14](T14-coverage-page-and-authoring-queue.md)) and the tooltip says so.
- **Risk — a full rebuild after every engine build is expensive.** With ~1,100 Standard texts and a few hundred scenarios it is seconds, but it grows. Mitigation: the job takes `only`, the code-edit trigger uses it, and the build-change trigger runs the full set at a lower priority than a user-initiated job ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)).
- **Risk — the ledger grows without bound.** Every build writes roughly one row per `(text, code)` pair plus one per printing. Mitigation: measured, reported, and deferred to the retention question raised in [S05.T01](T01-rules-schema-migration.md).
- **Question — should a `twinleaf_diff` row be accepted for a code whose source is not `twinleaf`?** No, matching the legacy (`verified.twinleaf_attacks`: a translation proves nothing when a hand-written recipe is what actually runs). The consequence is that the oracle can only prove the codes it produced, which is correct but limits its reach. The user may want the oracle to also *contradict* a hand-authored code, which is a different feature ([S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md)) and should be decided there.
- **Question — should `exact` count `approx` codes at a discount?** It does not: `approx` is not exact, full stop, matching the legacy's `EXACT_KINDS`. A weighted "partially exact" number would be a third headline and would blur the one distinction the metric exists to make. Recommendation: keep two numbers; report the `approx` share separately on the coverage page.
- **Question (D-004 semantics) — should evidence be per `(text, code)` or per text?** It is per pair here, so adding a code to a proven text immediately unproves it. The alternative — per text — is simpler and would let a scenario blanket-prove a text whose codes later change. Recommendation: keep the pair; the user confirms, because it decides how often `proven` moves while authoring.

## References

- `pokemon/src/pokesearch/sim/coverage.py` — verified: `meta_usage` (the `deck_cards` × `decks` × `tournaments` aggregate with the format and cutoff predicates, its comment that the query takes ~3.5 s over nearly a million rows and was run twice per page, and its process-local cache keyed on database, format, window, day, deck count and max rowid); `EXACT_KINDS = ("engine", "catalog", "generated", "vanilla_exact")`, `APPROX_KINDS = ("catalog_approx", "vanilla")`; `exact_coverage` merging `card_impl.status`, the engine registry and `verified.proofs`; `ExactCoverage.verified_*` fields. Consult for the metric this subtask re-keys on texts and precomputes.
- `pokemon/src/pokesearch/sim/verified.py` L1–16 — verified: the docstring defining exact versus proven, the two accepted evidence kinds (`teste`, `twinleaf`), the rule that a card with no effect-text part is exact by construction because attributes are audited, and *"Parecer de IA não é evidência: serve para achar suspeita, não para provar"* (RN-63). `L103–116` — `Proof.complete = all(parts.values())` (RN-71). `L139–151` — `twinleaf_attacks()` counting only translations that are the recipe in use (RN-72).
- `pokemon/tests/test_verified.py` L75–89 — verified: `assert 0 < x.verified_copies <= x.exact_copies`, the per-kind inequality, and `assert x.verified_by_kind["vanilla_exact"] == x.copies_by_kind["vanilla_exact"]` (textless printings are proven exactly as often as they are exact). The RN-74 assertions reproduced here.
- `pokemon/tests/conftest.py` — verified: proof is written by the test runner, and a test that ran and failed or was skipped leaves the store (`merge_run`). The behaviour RN-73's revision preserves through per-build scoping instead of deletion.
- `pokemon/README.md` L166–180 — verified: exact 94.7 % (motor 29.4 · catálogo 59.7 · esqueleto sem texto 5.7) against 3.9 + 1.2 + 0.1 approximate/missing; proven 72.6 %; the denominator of 2.3 M copies from Standard lists of the last 90 days with 12.6 points of Basic Energy; and the note that the metric started at 45.1 % and rose to 72.6 % by checking the engine's own cards. Consult for the baseline this stage is measured against.
- `pokemon/ESPECIFICACAO.md` §4.6 RN-70..RN-77 and §6.1 — verified: the rule texts and the declared 1.4 % gap from counting by name.
- [S05.T01](T01-rules-schema-migration.md) (`rule_evidence`, `rules_current`, the `card_status` DDL), [S05.T11](T11-legacy-tests-to-scenarios.md) (scenarios and their permanent ids), [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) (the RN-03 window), [S04.T02](../04-game-engine-core/T02-card-definition-model.md) (the `CardDef` derivation `attr_only` checks).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
