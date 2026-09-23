# S08.T05 — Twinleaf differential oracle

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 5 / 6 |
| Depends on | [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T03](T03-hosted-postgres-migration-path.md), [S08.T04](T04-wasm-replay-and-play.md), [S08.T06](T06-llm-assisted-authoring.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` scenario format — from [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)
- `module` evidence recording (`kind = twinleaf_diff`) — from [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)
- `external` local clone of `the-epsd/twinleafgg` at `C:\tmp\tw` (MIT; `ptcg-server/src/game/store`, 10,316 card files incl. 2,023 SV/ME)
- `external` the clone pinned at commit `b26ec9c`, with `ptcg-server/package.json` declaring `"license": "MIT"` — verified in the planning session
- `file` `pokemon/src/pokesearch/sim/twinleaf_import.py` — the exact-printing matching order and the translation table; read-only reference

## Outputs (proposed)
- `module` `tools/twinleaf-oracle/` — TypeScript harness compiling only the store, translating a scenario's setup/steps into Twinleaf store actions/prompt answers, comparing observable outcomes (zones, damage, conditions, prizes); agreement → `rule_evidence` rows of kind `twinleaf_diff` referencing the Twinleaf commit; disagreement → report for human ruling
- `file` `packages/db/migrations/0010_twinleaf.sql` — `twinleaf_reports(id, text_hash, card_id, scenario_id, twinleaf_commit, twinleaf_path, status, step, field, ours_json, theirs_json, engine_build, rules_snapshot, first_seen_at, ruled_at, ruling, note)` — the human-ruling queue a disagreement lands in
- `doc` `docs/rules/ORACLE.md` — what agreement means, what it does not mean, the mapping tables between the two engines' vocabularies, and the attribution obligation the MIT licence carries
- `script` `pnpm oracle:index`, `pnpm oracle:match`, `pnpm oracle:run`, `pnpm oracle:report` — the four steps of a comparison round

## Initial objective
A second, independently written implementation of the same cards becomes a source of evidence and a translation reference for codes, closing the gap between 'exact' and 'proven' faster than hand-written scenarios alone.

## Context

`exact` and `proven` diverge for a boring reason: codes arrive in bulk from three importers and scenarios are written by hand, one at a time. The legacy lived with the same gap — exact 94.7 %, proven 72.6 % — and the only lever that moved `proven` was writing more tests. This subtask adds a second lever. twinleafgg is an independently written TypeScript implementation of the same card pool, 10,316 card files of which 2,023 cover the SV and ME eras, and it is MIT licensed. If our engine and theirs, given the same board and the same decisions, arrive at the same observable state, that is a fact about behaviour that nobody wrote a test for.

RN-72 already names the evidence kind: *"second-source agreement when it is the code in use"*. The qualifier is load-bearing and it comes from the legacy's own `verified.twinleaf_attacks()`, which counted a translation only when that translation was the recipe actually running — because a translation proves nothing about a hand-written recipe that happens to sit in its place. [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) kept that rule and left this subtask one question to answer: may the oracle also *contradict* a hand-authored code? The answer here is yes to reporting and no to recording. A disagreement is written to `twinleaf_reports` for a human to rule on, and it never writes a `rule_evidence` row — not even a failing one — because `passed = 0` would drop `proven` on the say-so of a second implementation that might itself be wrong. That is RN-63's shape applied to a non-AI source and RN-64's rule that an audit never alters a card.

The legacy already mined this clone and its method is the thing that changes. `pokemon/src/pokesearch/sim/twinleaf_import.py` **reads the TypeScript as text**: a brace-matching reader that skips strings and comments, a regex for `class X extends PokemonCard`, and a `TRANSLATION_RULES` table mapping ALL-CAPS prefab calls such as `DISCARD_X_ENERGY_FROM_THIS_POKEMON` onto our closed vocabulary. It works, and it has a declared ceiling: a block containing `store.prompt(`, `forEach(`, `for(`, `while(` or `filter(` is marked imperative and left untranslated, which is why `ESPECIFICACAO.md` §6.1 lists *"Efeito do Twinleaf que abre janela de escolha não é traduzido."* Here the harness **executes the store** instead. A prompt is no longer an untranslatable construct; it is a question the harness answers from the scenario's script. That single change is what turns a translation table into an oracle.

Executing it is affordable exactly once per comparison and never in a batch, and the clone's own design says why. `ptcg-server/src/game/store/store.ts` calls `deepClone(state, [Card])` on every action (L350), so the whole game state is copied per step; `prompt(state, prompts, then)` (L206) is continuation-passing, with `store-like.ts` declaring overloaded `prompt<T>` signatures that take a callback rather than returning a value; `reduceEffect` (L140) and `card.reduceEffect` (L548) dispatch effects through that same closure machinery. A design that deep-clones per action and expresses choices as closures is unsuited to the 5,000 games/s [S04.T18](../04-game-engine-core/T18-performance-baseline.md) targets, and D-001 already rejected adopting it for that reason. It is, however, ideal for what is wanted here: one scenario, a few dozen steps, an authoritative second opinion.

Two obligations come with the source. The MIT licence permits use and modification and requires the copyright notice and the licence text to travel with any substantial portion — and a rule translated out of their card files into our `ir_body_json` is derived logic, not merely an observation. So `docs/NOTICE.md` carries the twinleafgg notice, every `text_codes` row produced this way records `source = 'twinleaf'` with the commit, and `docs/rules/ORACLE.md` states the obligation in the same place as the method. The clone itself stays outside the repository at `C:\tmp\tw`, passed by path, exactly as the legacy did with `--root`.

## Scope

- **In scope.** `tools/twinleaf-oracle/` — the store compilation, the card index over `ptcg-server/src/sets`, the printing matcher, the scripted `StoreLike` that answers prompts, the setup translator, the observation normaliser and the comparator; the three-outcome verdict (`agree` / `disagree` / `inconclusive`); the evidence write for agreement and the report write for disagreement; `packages/db/migrations/0010_twinleaf.sql`; the four `pnpm oracle:*` commands; `docs/rules/ORACLE.md`; the `docs/NOTICE.md` entry; the first real round over the top 50 meta texts.
- **Out of scope.** The scenario format and our own runner ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)); the evidence table, the staleness rule and the coverage arithmetic ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)); writing `text_codes` rows from a translation, which is [S05.T09](../05-card-rules-base/T09-import-attack-effects-json.md)'s importer and its provenance ranks; the rules editor where a ruling is applied ([S05.T13](../05-card-rules-base/T13-rules-editor-ui.md)); using twinleafgg as a playable engine, which D-001 rejected; running the oracle on a schedule ([S08.T01](T01-scheduler.md) does not fire it, because a comparison round is a deliberate act); any change to the clone.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-62 | **Kept.** A translation from an implemented second source outranks a classification derived from prose. When the oracle's executed result and a prose-derived classification (the spreadsheet's or [S08.T06](T06-llm-assisted-authoring.md)'s proposal) disagree about the same text, the oracle's reading wins: the existing entry is replaced and the replaced value is preserved, never discarded. The rank is recorded as `text_codes.source = 'twinleaf'` with the commit, above `llm` and `sheet` in [S05.T09](../05-card-rules-base/T09-import-attack-effects-json.md)'s provenance order. | the importer's precedence check, which refuses to lower a `twinleaf`-sourced row to a prose-sourced one and stores the superseded value in the report's `ours_json` | `oracle.spec.ts > a twinleaf translation supersedes an llm-sourced row and preserves the old value`; `> a prose classification never overwrites a twinleaf-sourced row` |
| RN-72 | **Kept, with `twinleaf_diff` defined here.** Accepted evidence is a passing scenario (`scenario`), the attribute-derivation check (`attr_only`), a passing scenario over a builtin (`builtin`), and **second-source agreement when the agreeing code is the code in use** (`twinleaf_diff`). A `twinleaf_diff` row is therefore written only for `(text_hash, code)` pairs whose `text_codes.source = 'twinleaf'`; agreement about a hand-authored code is reported, never recorded. | `writeEvidence` is called only for pairs passing the `source = 'twinleaf'` filter; the four-member `kind` enum of [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) is unchanged | `oracle.spec.ts > agreement on a twinleaf-sourced code writes one twinleaf_diff row per code of the text`; `> agreement on a hand-authored code writes no evidence row` |
| BR-S08.T05-01 | **Agreement is equality of the observed state at every checkpoint.** After each translated step, both engines are reduced to the same `ObservedState` — for each player: the active slot and each bench slot by `card_id` with its stack, attached energy and attached tools as multisets; damage counters per slot; special conditions per slot as a sorted set; hand, discard and lost zone as multisets of `card_id`; deck and prize **counts**; plus whose turn it is and the turn number — and the two must be equal field by field. A scenario agrees only when every checkpoint matches and both engines reach the same terminal verdict. | `observe(ourGame)` and `observe(twinState)` produce the same canonical JSON shape; `compare()` walks it field by field | `oracle.spec.ts > observe produces the documented field set`; `> a single differing damage counter is a disagreement`; `> an identical board on both engines agrees` |
| BR-S08.T05-02 | **What is not compared is enumerated, not implied.** Deck order, card instance identity, prompt order, the number of internal steps, markers, turn-effect bookkeeping and any display field are outside the comparison, because the two engines model them differently and a difference in them is not a difference in behaviour. A prompt asked in a different order, or split into two questions, is an acceptable difference as long as the checkpoint after it matches. | `observe()` builds only the fields BR-S08.T05-01 lists; the comparator has no fall-through that reaches other state | `oracle.spec.ts > shuffling both decks identically-sized does not affect the verdict`; `> the same effect resolved through two prompts instead of one still agrees` |
| BR-S08.T05-03 | A comparison has **three** outcomes, and `inconclusive` is never silently folded into either of the others: `agree`, `disagree`, and `inconclusive` when the printing cannot be matched, when a prompt cannot be answered from the script, when Twinleaf raises, or when a setup element has no counterpart. An `inconclusive` writes neither evidence nor a report row — it is a coverage gap, counted in the round summary. | `Verdict` is a three-member union; `runOne()` returns it and the writers switch on it exhaustively | `oracle.spec.ts > an unmatched printing yields inconclusive and writes nothing`; `> an unanswerable prompt yields inconclusive naming the purpose` |
| BR-S08.T05-04 | A disagreement is **a report for a human ruling and never an automatic change**: it writes one `twinleaf_reports` row with the first differing checkpoint, the field, both values, our engine build and rules snapshot — and it writes no `rule_evidence` row, not even `passed = 0`, because a failing row would lower `proven` on a second implementation's opinion. No code, param, status or card is modified (RN-63, RN-64). | `writeReport()` is the only write on the disagree branch; the oracle module contains no `UPDATE` against `rule_codes`, `text_codes` or `cards` | `oracle.spec.ts > a disagreement writes one report row and zero evidence rows`; `pnpm check` greps `tools/twinleaf-oracle` and finds no write to `rule_codes`, `text_codes` or `cards` |
| BR-S08.T05-05 | Evidence carries the Twinleaf commit in its key: `ref = "twinleaf:<commit>:<scenario id>"`, so the same agreement re-verified against a newer clone is a different evidence group and a ruling change in the clone cannot silently keep proving an old claim. The commit, the matched file path and the match mode are also stored in the report and in the round summary. | `refFor(commit, scenarioId)` in the writer; the commit is read from `git -C <root> rev-parse --short HEAD` at the start of the round, never hard-coded | `oracle.spec.ts > the evidence ref carries the commit`; `> a round against a different commit produces a distinct ref`; a round refuses to start when the clone is not a git checkout |
| BR-S08.T05-06 | A printing is matched the legacy's way and **never by name alone**: first by exact printing (set code and number and normalised name), then by identical name **and** identical tuples of attack names and ability names — what a reprint preserves. Anything else is `inconclusive`. | `match(spec, index)` returning `{ card, mode: "printing" \| "reprint" \| "none" }` | `oracle.spec.ts > Dipplin TWM and Dipplin DRI match their own printings and not each other`; `> a name-only candidate yields mode "none"` |
| BR-S08.T05-07 | The oracle runs read-only against the clone: it compiles and imports from `C:\tmp\tw` (or `--root`), writes nothing under it, and the path is a required argument with no default, so the clone is never assumed present. | the harness opens the root read-only and resolves every path under it; no write API is imported | `oracle.spec.ts > the harness writes nothing under the clone root` (filesystem snapshot before and after); `> a missing --root exits 2` |
| BR-S08.T05-08 | The oracle is never on the critical path of any measurement: it runs on demand, its results reach the database only through the evidence writer and the report table, and the engine, the worker's job runner and every score are unaffected by whether the clone is present. | `tools/twinleaf-oracle` is a separate workspace package that nothing else imports; the worker's kinds registry has no oracle entry | `pnpm check` greps `apps/*` and `packages/*` for an import of `@pokesearch/twinleaf-oracle` and finds none; the full suite passes with `C:\tmp\tw` absent |
| BR-S08.T05-09 | Attribution travels with translated logic: `docs/NOTICE.md` carries the twinleafgg copyright notice and the MIT text, every `text_codes` row whose behaviour came from the clone records `source = 'twinleaf'` with the commit, and `docs/rules/ORACLE.md` states the obligation beside the method. | the NOTICE entry; the importer's `source`/`source_ref` columns; a `pnpm check` rule requiring a NOTICE entry for every distinct `source` value in `text_codes` | `pnpm check` fails when a `twinleaf`-sourced row exists and `docs/NOTICE.md` has no twinleafgg entry; `notice.spec.ts > the entry names the licence and the commit` |
| BR-S08.T05-10 | A round is reproducible and reportable: `pnpm oracle:run` writes a summary naming the clone commit, our engine build, the rules snapshot, and the counts of `agree` / `disagree` / `inconclusive` with the reason for every inconclusive, and re-running the same round against the same two commits produces the same verdicts. | the round summary written to `$DATA_DIR/reports/oracle-<commit>-<timestamp>.json`; no wall-clock or random input reaches a verdict | `oracle.spec.ts > two rounds over the same inputs produce identical verdicts`; the summary file exists with all five header fields |

## Data operations

**CRUD.** The **worker** is the only writer of `rule_evidence` (Architecture principle 2, [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) BR-S05.T12-03), so the harness runs as a worker-hosted round rather than writing from a script process; the api only reads the report queue and rules on it.

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `rule_evidence` | C | worker | on an `agree` verdict, for each `(text_hash, code)` of the text whose `text_codes.source = 'twinleaf'` | append-only; `kind = 'twinleaf_diff'`, `passed = 1`, `ref = "twinleaf:<commit>:<scenario id>"`, `engine_build` and `rules_snapshot` from `rules_current`; re-running a round appends a new row and the latest wins | RN-72, BR-S08.T05-05 |
| `rule_evidence` | C | worker | on a `disagree` or `inconclusive` verdict | **never** — a disagreement is a report, not a failing proof (BR-S08.T05-04) | RN-63, RN-64 |
| `rule_evidence` | U / D | — | never | the insert-only triggers abort ([S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)) | RN-64 |
| `twinleaf_reports` | C | worker | on a `disagree` verdict | one open row per `(text_hash, scenario_id, twinleaf_commit)`; a repeat round updates `first_seen_at`'s sibling fields rather than inserting again | the human-ruling queue |
| `twinleaf_reports` | U (`status`, `ruled_at`, `ruling`, `note`) | api | the user rules on a report in the editor | only from `open`; the four rulings are `ours_correct`, `theirs_correct`, `both_valid`, `unclear` | the only api write here |
| `twinleaf_reports` | R | api, worker | the editor's panel, the round summary, the "already open?" check | read-only | [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md) renders it |
| `twinleaf_reports` | D | — | never | a ruled report is the record of why a code says what it says | RN-64 |
| `text_codes` | R | worker | building the code list of the text under test and applying the `source = 'twinleaf'` filter | read-only in this subtask | writing them is [S05.T09](../05-card-rules-base/T09-import-attack-effects-json.md)'s |
| `text_codes` | C / U | worker | never from the oracle | a translation becomes a row through the importer, under RN-62's precedence, not as a side effect of a comparison (BR-S08.T05-04) | keeps "compare" and "author" separate |
| `rule_codes`, `effect_texts`, `card_parts`, `cards`, `attacks`, `abilities` | R | worker | matching, setup translation, observation | read-only | — |
| `rules_current` | R | worker | at the start of a round | supplies `engine_build` and `rules_snapshot` for every row written | [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) |
| `card_usage_cache` | R | worker | choosing the round's texts, ordered by meta copies | read-only; the "top 50 texts" selection | [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) |
| `rule_scenarios` | R | worker | the scenarios to translate | read-only; git is the source ([S05.T11](../05-card-rules-base/T11-legacy-tests-to-scenarios.md)) | — |
| `$DATA_DIR/reports/oracle-<commit>-<ts>.json` | C | worker | end of every round | overwritten per round id; outside the repository (D-005) | BR-S08.T05-10 |
| `C:\tmp\tw` (the clone) | R | worker | throughout | read-only; never written (BR-S08.T05-07) | passed by `--root`, no default |

**Endpoints.**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/rules/oracle/reports` | `?status=open&textHash=&limit=100` | `{ total, items: [{ id, textHash, cardId, scenarioId, twinleafCommit, twinleafPath, step, field, ours, theirs, engineBuild, rulesSnapshot, firstSeenAt, status, ruling, note }] }` | `503 database_unavailable` |
| POST | `/api/rules/oracle/reports/:id/rule` | `{ ruling: "ours_correct" \| "theirs_correct" \| "both_valid" \| "unclear", note: string }` | the updated row | `404 not_found`; `409 conflict` when already ruled; `422 unprocessable` on an unknown ruling |
| GET | `/api/rules/oracle/rounds` | `?limit=20` | the round summaries with their counts | `503 database_unavailable` |

## Interfaces

**The harness** (`tools/twinleaf-oracle/`), a workspace package nothing else imports (BR-S08.T05-08).

```
tools/twinleaf-oracle/
  src/compile.ts     ts-node/tsc over ptcg-server/src/game/store + the matched card files only
  src/index-cards.ts walks <root>/ptcg-server/src/sets/**/*.ts, skipping /tests/, *.spec.ts, index.ts, /set-test/
  src/match.ts       match(spec, index) -> { card, mode: "printing" | "reprint" | "none" }
  src/store-script.ts a StoreLike whose prompt() resolves from the scenario's answer script
  src/setup.ts       scenario setup -> a Twinleaf State
  src/observe.ts     both engines -> ObservedState (the comparison surface)
  src/compare.ts     ObservedState x ObservedState -> Verdict
  src/round.ts       selection, execution, evidence and report writing, the summary file
```

```ts
export type MatchMode = "printing" | "reprint" | "none";
export type Verdict =
  | { kind: "agree";        checkpoints: number }
  | { kind: "disagree";     step: number; field: string; ours: unknown; theirs: unknown }
  | { kind: "inconclusive"; reason: "unmatched" | "unanswerable_prompt" | "unsupported_setup"
                                  | "twinleaf_error" | "no_codes"; detail: string };

export interface ObservedSlot {
  card_id: string; under: string[]; energies: string[]; tools: string[];   // multisets, sorted
  damage: number; conditions: ("asleep"|"paralyzed"|"confused"|"poisoned"|"burned")[];   // sorted
}
export interface ObservedPlayer {
  active: ObservedSlot | null; bench: (ObservedSlot | null)[];
  hand: string[]; discard: string[]; lost_zone: string[];                  // multisets, sorted
  deck_count: number; prizes_remaining: number;
}
export interface ObservedState {
  turn: number; current: 0 | 1;
  p: [ObservedPlayer, ObservedPlayer];
  ended: { winner: 0 | 1 | null; reason: string } | null;
}

export function observeOurs(game: OurGame): ObservedState;
export function observeTwinleaf(state: TwinState, map: CardIdMap): ObservedState;
export function compare(a: ObservedState, b: ObservedState): { equal: boolean; field?: string; a?: unknown; b?: unknown };
export function runOne(ctx: RoundContext, scenario: Scenario): Verdict;
```

**What agreement means, exactly.** Both engines are driven through the same translated step list. After every step the harness takes an `ObservedState` from each and compares it field by field. The comparison surface is precisely the five families above: **zones by card identity** (active and each bench slot as `card_id` plus its stack, attached energy and tools as sorted multisets; hand, discard and lost zone as sorted multisets of `card_id`; deck and prizes as counts, because the two engines shuffle differently and a deck's order is not behaviour), **damage counters per slot**, **special conditions per slot**, **prizes remaining**, and **whose turn it is** with the turn number. A scenario **agrees** when every checkpoint is equal and, if the scenario runs to a terminal state, both engines report the same winner and a reason that maps to the same end condition. A **disagreement** is the first checkpoint where any of those fields differs, recorded with the step index, the field path and both values.

**What is an acceptable difference** is the other half of the definition, and it is enumerated rather than left to judgement (BR-S08.T05-02). Deck order differs because the shufflers differ. Card instance identity differs because the two engines allocate differently; identity is compared as `card_id` multisets, so two copies of the same printing are interchangeable. Prompt *ordering* differs, and legitimately: Twinleaf's continuation-passing `prompt(state, prompts, then)` (`store.ts` L206) may ask one question where we ask two, or ask them in the other order, and as long as the checkpoint after the effect matches, both engines resolved the same rule. Internal step counts, markers, turn-effect bookkeeping and any display field are outside the surface entirely. The rule of thumb written into `docs/rules/ORACLE.md`: *if a player looking at the two boards could not tell them apart, the engines agree.*

**Driving the clone.** The harness supplies its own `StoreLike`. `store-like.ts` declares `prompt<T>` in overloaded continuation-passing form, and `prompts/prompt.ts` gives every prompt an `abstract Prompt<T>` base with `perspectivePlayerId`, `decode` and `validate`. The scripted implementation therefore: takes the pending prompt, looks up the scenario's next `answer` step whose `purpose` maps to that prompt's class, builds the Twinleaf-shaped result, runs it through `prompt.decode()` and `prompt.validate()`, and invokes the `then` continuation with it. A prompt with no scripted answer, or one whose candidates cannot be expressed, ends the comparison as `inconclusive` naming the purpose — never as a disagreement, because failing to ask a question is not evidence about the answer. `reduceEffect` (`store.ts` L140) and `card.reduceEffect` (L548) are left untouched; the harness only feeds actions in and reads state out.

**Why this is an oracle and not an engine.** `store.ts` L350 calls `deepClone(state, [Card])` on every action, so each step copies the entire game state, and prompts are closures rather than values, so a search algorithm cannot snapshot a decision point and explore alternatives from it. Those two properties make it excellent as an authoritative second reading of one situation and unusable as the batch engine [S04.T18](../04-game-engine-core/T18-performance-baseline.md) needs — which is exactly the trade-off D-001 recorded when it rejected adopting twinleafgg wholesale. `docs/rules/ORACLE.md` states it in one line so nobody re-opens the question.

**Matching.** The legacy's two-pass order, kept verbatim in behaviour (BR-S08.T05-06): first an exact printing — same set code, same normalised number, same normalised name; then a reprint — same normalised name **and** identical tuples of normalised attack names and ability names, which is what a reprint preserves; otherwise no match. Never by name alone, for the reason `twinleaf_import.py` records: Dipplin from TWM has *"Do the Wave"* and Dipplin from DRI has *"Energy Loop"*, so a name-only match would claim coverage that does not exist. Attack identity inside a matched card is by **position**, not by name, because the two sources' names diverge — *"Smolder-sault"* in our data against *"Burning Assault"* in the clone — and the printing has already been established.

**Commands.**

| Command | Arguments | Effect | Exit codes |
|---|---|---|---|
| `pnpm oracle:index` | `--root <path>` | walks `<root>/ptcg-server/src/sets/**/*.ts`, skipping `/tests/`, `*.spec.ts`, `index.ts` and `/set-test/`, and writes a card index with set, number, name, attack names and ability names | 0 ok · 2 root missing or not a git checkout |
| `pnpm oracle:match` | `--root <path> [--top <n>] [--json]` | matches our Standard printings against the index and reports the mode distribution and the unmatched list | 0 ok · 2 no index |
| `pnpm oracle:run` | `--root <path> [--top <n>] [--text <hash>] [--scenario <id>] [--dry-run]` | compiles the store, runs the round, writes evidence and reports, emits the summary file | 0 ok · 1 a round-level failure · 2 bad arguments · 3 a round is already running |
| `pnpm oracle:report` | `[--status open] [--json]` | prints the open report queue, newest first | 0 ok |

**`packages/db/migrations/0010_twinleaf.sql`**

```sql
-- 0010_twinleaf.sql — disagreements between our engine and the twinleafgg oracle, awaiting a human ruling.
-- Owner: S08.T05. Written by apps/worker; ruled on by apps/api. Never deleted (RN-64).
-- Postgres: ours_json / theirs_json TEXT -> jsonb. No SQLite-only construct in this file.

CREATE TABLE twinleaf_reports (
    id              INTEGER PRIMARY KEY,
    text_hash       TEXT,                       -- null when the disagreement is about a printing, not a text
    card_id         TEXT REFERENCES cards(id) ON DELETE SET NULL,
    scenario_id     TEXT    NOT NULL,
    twinleaf_commit TEXT    NOT NULL,           -- short hash of the clone at round time
    twinleaf_path   TEXT    NOT NULL,           -- the matched .ts file, relative to ptcg-server/
    match_mode      TEXT    NOT NULL,           -- 'printing' | 'reprint'
    status          TEXT    NOT NULL DEFAULT 'open',
    step            INTEGER NOT NULL,
    field           TEXT    NOT NULL,           -- e.g. 'p[1].active.damage'
    ours_json       TEXT    NOT NULL,
    theirs_json     TEXT    NOT NULL,
    engine_build    TEXT    NOT NULL,
    rules_snapshot  TEXT    NOT NULL,
    first_seen_at   TEXT    NOT NULL,
    ruled_at        TEXT,
    ruling          TEXT,                       -- 'ours_correct' | 'theirs_correct' | 'both_valid' | 'unclear'
    note            TEXT,
    CHECK (status IN ('open','ruled')),
    CHECK (match_mode IN ('printing','reprint')),
    CHECK ((status = 'ruled') = (ruled_at IS NOT NULL)),
    CHECK (ruling IS NULL OR ruling IN ('ours_correct','theirs_correct','both_valid','unclear'))
);

CREATE UNIQUE INDEX twinleaf_reports_open_idx
    ON twinleaf_reports (text_hash, scenario_id, twinleaf_commit) WHERE status = 'open';
CREATE INDEX twinleaf_reports_status_idx ON twinleaf_reports (status, first_seen_at DESC);
```

**`docs/rules/ORACLE.md` — eight sections.** (1) What the oracle is and why twinleafgg is not the engine (the deep clone per action, the closure prompts, D-001). (2) The comparison surface of BR-S08.T05-01 and the enumerated acceptable differences of BR-S08.T05-02, with the player-looking-at-two-boards rule of thumb. (3) The three verdicts and what each writes. (4) The matching order and the Dipplin example. (5) The vocabulary maps: our `card_id` to their set-plus-number, our conditions to their `SpecialCondition`, our end reasons to their `GameWinner`, our prompt purposes to their `Prompt` subclasses. (6) Ruling a report: the four rulings, what each implies, and the fact that applying a ruling is an edit in [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md) and never automatic. (7) Running a round and reading its summary. (8) Licence and attribution: MIT, the notice obligation for translated logic, the commit recorded on every row, and the `docs/NOTICE.md` entry.

## Implementation steps

1. Add `tools/twinleaf-oracle` as a workspace package with no dependants, a `--root` argument with no default, and a read-only guard over the clone; spec both (BR-S08.T05-07, -08).
2. Write `index-cards.ts` with the four exclusions and the extracted fields, and run it against the clone; record how many of the 10,316 files index and how many are SV/ME.
3. Write `match.ts` with the two passes and the normalisers; run `pnpm oracle:match --top 200` and record the mode distribution and the unmatched list (BR-S08.T05-06).
4. Write `compile.ts`: a `tsc` pass over `ptcg-server/src/game/store` plus the matched card files only, into a scratch directory outside the clone; confirm nothing is written under the root.
5. Write `store-script.ts`: the `StoreLike` whose `prompt` resolves the scenario's next answer through `decode()` and `validate()` and calls the continuation; make an unanswerable prompt return `inconclusive` naming the purpose (BR-S08.T05-03).
6. Write `setup.ts`, translating a scenario's zones, slots, energies, tools, damage, conditions, turn and stadium into a Twinleaf `State`; anything untranslatable is `inconclusive: unsupported_setup`.
7. Write `observe.ts` for both engines and `compare.ts`, with the field paths; spec the documented field set, the damage-counter difference and the two acceptable-difference cases (BR-S08.T05-01, -02).
8. Write `0010_twinleaf.sql`, `TwinleafReportRow` and the `TABLES` entry; run the drift test.
9. Write `round.ts`: read the commit with `git rev-parse --short HEAD`, select texts by meta copies, run each scenario, and write evidence on `agree` (filtered to `source = 'twinleaf'` pairs) and a report on `disagree`; spec that a disagreement writes zero evidence rows (RN-72, BR-S08.T05-04, -05).
10. Add the two API routes and the report panel in the rules editor, with the four rulings and their notes.
11. Add the `docs/NOTICE.md` entry and the `pnpm check` rule tying a `source` value to a notice entry (BR-S08.T05-09).
12. Run the first real round over the top 50 meta texts, triage every disagreement with the user, and record in the completion note the three counts, the mode distribution and the number of `twinleaf_diff` evidence rows written (BR-S08.T05-10).

## Edge cases and error handling

- **twinleafgg disagrees because of a ruling change.** The most valuable and most misread case. A card's behaviour changed by an official ruling, and one of the two implementations tracks it while the other does not — or the clone at commit `b26ec9c` predates a ruling we have already applied. The verdict is `disagree`, the report carries both values and the matched file path, and the ruling options are exactly what this case needs: `theirs_correct` when we are behind, `ours_correct` when they are, `both_valid` when the two readings are defensible and the difference is not in the printed text, `unclear` when it needs a judge. Nothing changes automatically in either direction (BR-S08.T05-04), and because `ref` carries the commit, re-running against a newer clone produces a fresh evidence group rather than silently inheriting the old verdict (BR-S08.T05-05).
- **The clone has no matching printing.** A card from a set the clone has not implemented, or a promo. `inconclusive: unmatched`, counted in the round summary, no row written. The unmatched list is the input to deciding whether a round is worth repeating after the clone updates (BR-S08.T05-03).
- **Twinleaf matches by name but not by printing.** The reprint pass requires identical attack and ability name tuples; a card whose reprint changed an attack name fails it and is `inconclusive`, not a disagreement. Dipplin is the worked example: TWM's *"Do the Wave"* and DRI's *"Energy Loop"* would have matched under a name-only rule and produced a confident, false comparison (BR-S08.T05-06).
- **A prompt the script cannot answer.** The scenario answers `choose_bench_target`; Twinleaf asks a `ChoosePokemonPrompt` with a filter that admits a slot our engine did not offer. The harness cannot invent an answer, so the verdict is `inconclusive: unanswerable_prompt` with the prompt class and the purpose. This is the case the legacy could not reach at all — its reader marked any block containing `store.prompt(` as imperative and skipped it — and reaching it as an explicit gap rather than a silent omission is the improvement.
- **Twinleaf throws.** A card implementation that assumes state the translated setup did not build, or a genuine bug in the clone. Caught per comparison, recorded as `inconclusive: twinleaf_error` with the message and the file path, and the round continues. One broken card must not end a fifty-text round.
- **The two engines resolve the same effect through different prompts.** We ask one question with four candidates; the clone asks two questions with two each. Both checkpoints after the effect match, so the verdict is `agree` — prompt shape is outside the comparison surface (BR-S08.T05-02). This is the single most common source of false disagreements in a differential harness and the reason the surface is enumerated rather than "compare the states".
- **Agreement on a code we wrote by hand.** The comparison passes, but the `(text_hash, code)` pair has `source <> 'twinleaf'`, so no evidence row is written (RN-72). The agreement still appears in the round summary as an informational count, because "our hand-written code matches an independent implementation" is worth knowing even when it cannot be proof.
- **A text with no codes at all.** `inconclusive: no_codes`. There is nothing to prove and nothing to contradict; the text belongs to the authoring queue ([S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md)), not to the oracle.
- **A disagreement recurs in a later round.** The partial unique index on `(text_hash, scenario_id, twinleaf_commit)` where `status = 'open'` means a second round against the same commit updates the existing open row rather than inserting a duplicate; a round against a **different** commit inserts a new row, because a different clone is a different claim.
- **Our engine build changes between rounds.** Evidence is already scoped to `engine_build` ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) RN-73), so every `twinleaf_diff` row goes stale with the build exactly as a scenario proof does, and the round has to be re-run to restore `proven`. The oracle is not exempt from staleness, and `docs/rules/ORACLE.md` says so.
- **The clone is absent.** `pnpm oracle:*` exits 2 naming the missing `--root`, and nothing else in the repository notices: the package has no dependants, the worker's kind registry has no oracle entry, and the full test suite passes (BR-S08.T05-08).
- **A round is started while one is running.** Exit 3, matching the ETL's concurrency convention. Two rounds writing evidence for the same texts under the same build would produce duplicate rows that the latest-wins rule would then have to arbitrate on insertion order.

## Acceptance / verification

- [ ] `pnpm oracle:index --root C:/tmp/tw` indexes the clone and reports the file count and the SV/ME subset; `pnpm oracle:match --top 200` reports the `printing` / `reprint` / `none` distribution and writes the unmatched list (BR-S08.T05-06).
- [ ] `oracle.spec.ts > Dipplin TWM and Dipplin DRI match their own printings and not each other`, and `> a name-only candidate yields mode "none"` (BR-S08.T05-06).
- [ ] `oracle.spec.ts > observe produces the documented field set` — zones by `card_id` with stack, energy and tools as multisets, damage per slot, conditions per slot, deck and prize counts, current player and turn — and nothing else (BR-S08.T05-01).
- [ ] `oracle.spec.ts > a single differing damage counter is a disagreement` naming the field path, and `> the same effect resolved through two prompts instead of one still agrees` (BR-S08.T05-01, -02).
- [ ] `oracle.spec.ts > agreement on a twinleaf-sourced code writes one twinleaf_diff row per code of the text` with `passed = 1` and `ref` matching `^twinleaf:[0-9a-f]{7}:`; `> agreement on a hand-authored code writes no evidence row` (RN-72, BR-S08.T05-05).
- [ ] `oracle.spec.ts > a disagreement writes one twinleaf_reports row and zero rule_evidence rows`, and `pnpm check` finds no write to `rule_codes`, `text_codes` or `cards` anywhere under `tools/twinleaf-oracle` (BR-S08.T05-04, RN-63, RN-64).
- [ ] `oracle.spec.ts > an unmatched printing yields inconclusive and writes nothing` and `> an unanswerable prompt yields inconclusive naming the purpose` (BR-S08.T05-03).
- [ ] `oracle.spec.ts > a twinleaf translation supersedes an llm-sourced row and preserves the old value`, and `> a prose classification never overwrites a twinleaf-sourced row` (RN-62).
- [ ] `oracle.spec.ts > the harness writes nothing under the clone root` (filesystem snapshot before and after a full round) and `> a missing --root exits 2` (BR-S08.T05-07).
- [ ] The whole suite passes with `C:\tmp\tw` absent, and `pnpm check` finds no import of the oracle package from `apps/*` or `packages/*` (BR-S08.T05-08).
- [ ] `pnpm check` fails when a `twinleaf`-sourced `text_codes` row exists and `docs/NOTICE.md` has no twinleafgg entry naming the MIT licence and the commit (BR-S08.T05-09).
- [ ] First real round: `pnpm oracle:run --root C:/tmp/tw --top 50` over the top 50 meta texts produces a summary naming the clone commit, our engine build, the rules snapshot and the three counts; every disagreement is triaged with the user into one of the four rulings; `SELECT COUNT(*) FROM rule_evidence WHERE kind = 'twinleaf_diff'` is non-zero and `GET /api/rules/coverage` shows a non-zero `byKind.twinleaf_diff` (the stage exit criterion).

## Risks and open questions

- **Risk — the harness is a second engine adapter and rots.** The clone moves, its store API changes, and the harness stops compiling. Mitigation: it compiles only `ptcg-server/src/game/store` plus the matched card files, it is pinned to a commit recorded on every row, and it has no dependants, so a broken harness costs a comparison round and nothing else (BR-S08.T05-08).
- **Risk — false disagreements drown the real ones.** A comparison surface that is too wide reports prompt shapes and instance ids as behaviour differences, and a queue of forty noise reports is a queue nobody triages. Mitigation: the surface is enumerated (BR-S08.T05-01) and the acceptable differences are enumerated beside it (BR-S08.T05-02); the first round's disagreement count is recorded, and a rate above roughly one in five is the signal that the surface is wrong rather than that the engines are.
- **Risk — the reach is smaller than it looks.** RN-72 means only `twinleaf`-sourced codes can be proved, so a base authored mostly from the spreadsheet gains little. Mitigation: the round summary reports agreements on hand-authored codes separately, which measures the ceiling honestly; and [S05.T09](../05-card-rules-base/T09-import-attack-effects-json.md)'s importer is where that share grows, under RN-62's precedence.
- **Risk — translated logic without attribution.** MIT is permissive and its one obligation is the notice; a rule lifted from their card files into our `ir_body_json` is derived work. Mitigation: BR-S08.T05-09 makes the notice a `pnpm check` failure rather than a good intention, and `source = 'twinleaf'` with the commit makes every affected row findable.
- **Question — should the oracle run on a schedule?** [S08.T01](T01-scheduler.md) deliberately does not fire it: a round depends on an external clone at a pinned commit and produces a queue a human must work through, so an unattended round would accumulate reports nobody asked for. Recommendation: keep it on demand, and revisit only if the clone becomes a tracked dependency with its own update process. The user decides.
- **Question — should a `both_valid` ruling be recorded as anything more than a note?** It is the honest answer when a difference is real but the printed text does not settle it, and it recurs on every future round against a newer commit. Recommendation: add an `ignored_until_commit` column if that recurrence becomes annoying; not added now, because guessing at the shape of a suppression rule before seeing real reports is how a queue acquires a filter that hides the interesting ones.
- **DEPENDENCY-PROPOSAL: S08.T05 should depend on S05.T09 because** RN-62's precedence is implemented by that importer's provenance ranks, and this subtask both writes translations through it and asserts its "never lower a `twinleaf`-sourced row" rule. Today the edge does not exist in either header.
- **DEPENDENCY-PROPOSAL: S08.T05 should depend on S01.T04 because** it adds `packages/db/migrations/0010_twinleaf.sql` and therefore needs the migration runner, the `NNNN_*.sql` convention and the `TABLES` drift test — the edge every other migration-owning subtask has.
- **DEPENDENCY-PROPOSAL: S08.T05 should depend on S05.T13 because** the ruling panel and the four rulings live in the rules editor, and a report with nowhere to be ruled on is a table nobody reads. Today only [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) is in the header.
- **DEPENDENCY-PROPOSAL: S08.T05 should depend on S01.T09 because** BR-S08.T05-09 adds the twinleafgg entry to `docs/NOTICE.md`, the file [S01.T09](../01-foundation/T09-licensing-and-notice.md) owns, and makes a missing entry a `pnpm check` failure.
- **Sizing — this file is probably two subtasks.** Its prose runs past the ~2,400-word guidance in [Conventions](../../project/08-conventions.md) because it holds a harness and a workflow: the card index, the printing matcher, the scripted `StoreLike`, the setup translator, `observe` and `compare` on one side; the evidence filter, `0010_twinleaf.sql`, the two API routes and the ruling panel on the other. A split would be "twinleaf oracle harness" (steps 1–7) and "S08.T05 oracle evidence and ruling queue" (steps 8–12) depending on it. Not applied here, because renumbering is not this pass's to do; proposed for the user's decision.

## References

- `C:\tmp\tw` at commit `b26ec9c`, MIT (`ptcg-server/package.json` declares `"license": "MIT"`) — verified in the planning session. `ptcg-server/src/game/store/store.ts`: `reduceEffect` at L140, `prompt(state, prompts, then)` at L206, `promptItems.push` at L234, `deepClone(state, [Card])` at L350 and `card.reduceEffect` at L548. `store-like.ts`: the overloaded continuation-passing `prompt<T>` signatures the scripted `StoreLike` implements. `state/state.ts` L1–70: `GamePhase`, `GameWinner`, `promptControllerId` and `abilityLockOrderCounter`, the fields the end-condition and turn mapping read. `prompts/prompt.ts` L1–45: `abstract Prompt<T>` with `perspectivePlayerId`, `decode` and `validate`, which is how a scripted answer is checked before the continuation runs. The deep clone per action and the closure-based prompts are why this is an oracle and not a batch engine.
- `pokemon/src/pokesearch/sim/twinleaf_import.py` — verified: `load_index(root)` walking `<root>/ptcg-server/src/sets` with `rglob("*.ts")` and skipping `/tests/`, `*.spec.ts`, `index.ts` and `/set-test/`; `_match_bracket` as a brace counter that skips string literals, escapes and both comment forms, because the file is read *as text*, with no parser; `match(spec, index)` whose docstring states the order — *"(1) mesma impressão, set e número; (2) mesmo nome e mesmos NOMES de ataque e habilidade, que é o que uma reimpressão preserva. Nunca casa só por nome."* — returning the modes `"impressão"`, `"reimpressão"` and `"sem correspondência"`; the Dipplin caveat in the module docstring (*"Dipplin de TWM tem \"Do the Wave\", o de DRI tem \"Energy Loop\". Casar só por nome dá cobertura falsa."*); `TRANSLATION_RULES` mapping fifteen ALL-CAPS prefabs plus a generated condition family onto the closed vocabulary; `_IMPERATIVE` marking any block containing `store.prompt(`, `forEach(`, `for(`, `while(` or `filter(` as unsupported; `translate_meta`'s precedence docstring — an exact Twinleaf translation prevails over any earlier entry and the replaced value is kept in `replaced`, a partial translation only fills a gap, and attacks are matched **by position** because the names diverge (*"Smolder-sault"* against *"Burning Assault"*) — which is RN-62 in the legacy's own words; and `TranslateStats` with `matched_cards`, `translated_exact`, `translated_partial`, `replaced_groq`, `disagreements` and `kept_existing`. Consult for the matching order and the precedence rule; executing the store instead of reading it is what this subtask changes.
- `pokemon/ESPECIFICACAO.md` §6.1 L315 — verified: *"Efeito do Twinleaf que abre janela de escolha não é traduzido."* — the declared limitation the scripted `StoreLike` removes. §6.1 L64 — verified: the clone is an external, unversioned checkout passed by path (`--root`), read by pattern matching without a parser, yielding **69 attacks** today, with the licence declared MIT in `ptcg-server/package.json`.
- [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md) — the scenario JSON this translates: `setup` with per-player zones, slots, energies, tools, damage, conditions and prizes; the step kinds `action`, `answer` (carrying its `purpose`), `expect`, `checkup` and `end_turn`; the permanent scenario ids evidence references; and the exported `packages/shared/schema/scenario.json` the harness generates its types from.
- [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) — the four-member evidence `kind` enum, the `(text_hash, code, kind, ref, engine_build)` key with `rules_snapshot` as a staleness marker, the `writeEvidence` entry point, the rule that a `twinleaf_diff` row is written only when the code in use has `source = 'twinleaf'`, and the open question about contradicting a hand-authored code that this subtask answers.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-62, RN-63, RN-64, RN-72; [Legacy reference map](../../project/06-legacy-reference-map.md) — the clone's inventory (10,316 card files, 2,023 for SV/ME) and its status as "oracle and translation source, not an engine"; [Decision log](../../project/02-decision-log.md) D-001, whose alternatives record why twinleafgg was not adopted as the engine.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
