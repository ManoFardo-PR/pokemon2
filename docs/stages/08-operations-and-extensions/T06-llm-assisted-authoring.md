# S08.T06 — LLM-assisted rule authoring (optional)

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 6 / 6 |
| Depends on | [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md), [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T03](T03-hosted-postgres-migration-path.md), [S08.T04](T04-wasm-replay-and-play.md), [S08.T05](T05-twinleaf-differential-oracle.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `doc` composition contract, code naming, `validateParams` — from [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md)
- `module` rules editor (review queue UI) — from [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md)
- `doc` ESPECIFICACAO.md RN-60, RN-61, RN-63
- `doc` ESPECIFICACAO.md RN-68 and `pokemon/README.md` L299–300 — the free-tier rate-limit measurement this subtask's batch sizing respects
- `file` `pokemon/src/pokesearch/llm/backends.py` and `roles.py` — the provider abstraction, the forced-tool JSON call, the `Retry-After` handling and the provider chain; read-only reference
- `env` `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` — all optional; defined under Interfaces and added to the environment table of `project/03-architecture-overview.md`

## Outputs (proposed)
- `module` `apps/worker/src/authoring/` — for an uncovered text: propose a code sequence with params using only existing codes (closed vocabulary, JSON schema-constrained output), validated by `validateParams`; proposals land in a review queue with `status = draft`, never active; batch mode for the authoring queue; provider abstraction (Anthropic SDK / OpenAI-compatible) with retries and rate-limit handling
- `file` `packages/db/migrations/0011_authoring.sql` — `rule_proposals(id, text_hash, status, items_json, rationale, confidence, provider, model, prompt_version, batch_id, input_tokens, output_tokens, created_at, reviewed_at, reviewed_action, note)` — the review queue, written by the worker and never read by the engine
- `module` `packages/llm/` — `resolveProvider()`, `complete()` and the two backends, with a `stub` provider that makes every test run without a key
- `doc` `docs/rules/AUTHORING-LLM.md` — the prompt, the closed vocabulary handed to the model, what the validator can and cannot catch, the batch sizing and the review workflow

## Initial objective
Speed up authoring of the long tail without letting a model's opinion become behaviour: proposals are data to review, evidence comes only from scenarios.

## Context

The long tail is the problem this addresses and the reason to be careful about it. The legacy measured roughly 1,046 of 1,157 raw sentence templates occurring exactly once, and parametrizing numbers and types shrank ~1,574 sentences only to ~1,297 templates. Those are texts that will never be worth a bespoke code but still have to be classified, and classifying them by hand is the slowest part of S05. A model is genuinely good at the shape of that task — read a sentence, pick from a list of 150–300 named codes, fill in their parameters — and genuinely untrustworthy about whether the answer is right.

So the design is built around one sentence from RN-61, which `ESPECIFICACAO.md` §4.5 states plainly: the validator *"barra resposta malformada, **não resposta errada e bem formada**"*, with the legacy's own sample of 25 correct out of 27 attacks. That is the honest limit and it is worth repeating rather than softening. A JSON Schema with sanity ranges stops a model from inventing an operation, from writing `n: 400` where the range is 0–12, and from returning prose instead of a structure. It does nothing about a plausible, well-formed proposal that happens to misread "each of your Benched Pokémon" as "one of your Benched Pokémon". Only a human reading the printed text catches that, and only a scenario proves it. Everything below follows from accepting that.

Three properties make the feature safe rather than merely useful. **It proposes nothing new**: the model chooses from the existing `rule_codes` vocabulary and fills parameters that are then validated by `validateParams` against the code's own `params_schema_json` ([S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md) BR-S05.T07-03). A proposal naming a code that does not exist is rejected before it is stored — the model cannot extend the vocabulary, which is what "closed vocabulary" means and what keeps RN-61's guarantee meaningful. **It writes to its own table**: `rule_proposals` is not `text_codes` and is not `rule_evidence`. [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) made the evidence `kind` enum a four-member `CHECK` with no LLM member and stated that the review queue *"writes to its own table and cannot reach `rule_evidence` at all"*; this file is the other end of that statement (RN-63). **A proposal becomes behaviour only through a human action**: accepting one is the ordinary editor save, `PUT /api/rules/texts/:hash/codes`, with the same validation, the same composition and the same stale-evidence banner as any other edit ([S05.T13](../05-card-rules-base/T13-rules-editor-ui.md) BR-S05.T13-01). There is no "apply all".

The legacy's provider layer is the shape reference and it is better than one might expect. `llm/roles.py` resolves `LLM_PROVIDER` through the chain `auto → anthropic → groq → local → none`, where `auto` picks Anthropic if there is a key, then Groq if there is a key, then local if a model is named. `llm/backends.py` has two backends: an Anthropic one that forces structured output with a single tool, and an OpenAI-compatible one that Groq and a local Ollama-style server share because they speak the same protocol. Two details carry over verbatim because they are correct. The forced tool is named `emit_result`, the JSON Schema is passed as its `input_schema`, and `tool_choice` is `{ "type": "tool", "name": "emit_result" }` — the model answers by calling a function whose arguments *are* the schema, which is far more reliable than asking for JSON in prose. And the rate-limit handling reads the server rather than guessing: `_retry_after_seconds` takes the `Retry-After` header when present, otherwise parses the "try again in 1.5s" phrasing out of the error body, and clamps the result to `[1 s, 90 s]` with a default of 8 s — **no exponential backoff at all**, up to 4 waited retries. On a free tier, waiting exactly as long as the server said is strictly better than doubling.

One legacy behaviour is deliberately not carried over. `roles.py`'s `auto` chain falls through to `local` whenever `LOCAL_LLM_MODEL` is set, and that variable has a non-empty default, so an unconfigured install resolves to `local` and then fails at connection time rather than reporting "no provider". RN-60 says everything works with no key; here `resolveProvider()` returns `none` when nothing is configured, the feature is hidden, and no request is attempted.

## Scope

- **In scope.** `packages/llm/` (the provider resolution, the two backends, the `stub` backend, `extractJson`, the retry and rate-limit policy, the token accounting); `apps/worker/src/authoring/` (the prompt builder, the candidate-code shortlist, the response validator, the batch runner, the queue writer); `packages/db/migrations/0011_authoring.sql`; the four review-queue endpoints; the queue panel and the per-text "sugerir códigos" control in the rules editor; `docs/rules/AUTHORING-LLM.md`; the environment variables and their defaults.
- **Out of scope.** The composition contract, `validateParams`, `composeProgram` and the code vocabulary itself ([S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md)); the editor's forms, panels and save path ([S05.T13](../05-card-rules-base/T13-rules-editor-ui.md)); evidence and coverage ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)) — this feature produces none; the authoring queue's ordering by meta copies ([S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md)), which decides *which* texts are proposed for; the spreadsheet import ([S05.T08](../05-card-rules-base/T08-spreadsheet-import.md)) and the two code importers; the coach ([S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md)), which shares `packages/llm` but has its own rules (RN-65, RN-66); the natural-language search parser ([S02.T10](../02-card-data-and-search/T10-natural-language-parser.md)), which RN-60 keeps LLM-free; generating code **bodies** or IR — RN-67 is superseded because no code is generated, and a new code is always human-authored.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-60 | **Kept.** No LLM is on the critical path. With no provider configured, `resolveProvider()` returns `none`, the authoring controls are hidden, the queue endpoints return an empty list with `providerAvailable: false`, and every job, import, search and measurement behaves identically. The whole test suite passes with `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` and `LLM_PROVIDER` all unset. Unlike the legacy chain, an unconfigured install resolves to `none` rather than falling through to a local server that is not running. | `resolveProvider()` returns `none` unless a key or an explicit base URL is present; the worker registers the `propose` kind only when a provider resolves; the editor reads `providerAvailable` | `llm.spec.ts > no configuration resolves to none`; `authoring.spec.ts > with no provider the queue is empty and no request is attempted`; CI runs the full suite with every LLM variable unset |
| RN-61 | **Kept.** Model output becomes behaviour only through the closed vocabulary with its sanity ranges: a proposal is a list of `{ code, params, sentenceFrom, sentenceTo }` whose `code` must already exist in `rule_codes` and whose `params` must validate against that code's `params_schema_json` through the same `validateParams` the editor and the importers use. Malformed output is rejected and stored as a rejection with its reason. **The honest limit, stated in the UI and in `docs/rules/AUTHORING-LLM.md`: the validator stops malformed answers, not wrong-but-well-formed ones** — the legacy's own sample was 25 correct out of 27. Only review and scenarios catch the other kind. | `validateProposal()` runs the vocabulary check then `validateParams` per item; the response schema is the `emit_result` tool's `input_schema`; the queue panel carries the limit as fixed copy | `authoring.spec.ts > a proposal naming an unknown code is rejected with the code name`; `> n = 400 against a maximum of 12 is rejected with the field`; `> a well-formed but semantically wrong proposal is stored as draft` (the limit, asserted rather than implied) |
| RN-63 | **Kept.** A model's opinion is never evidence; it is a review queue. Proposals are written to `rule_proposals` and nothing in this subtask can insert into `rule_evidence`, whose `kind` enum has no LLM member ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)). A proposal changes coverage only after a human accepts it in the editor, and even then it changes `exact`, never `proven`. | `apps/worker/src/authoring/` and `packages/llm/` contain no reference to `rule_evidence`; the `pnpm check` grep [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) BR-S05.T12-03 already installs covers both paths | `pnpm check` fails on a fixture inserting into `rule_evidence` from `packages/llm` or `apps/worker/src/authoring`; `evidence.spec.ts > an evidence row with kind 'llm' is rejected` |
| RN-68 | **Kept as an implementation note.** Free-tier rate limits mean small batches. A batch is `LLM_BATCH_SIZE` texts (default 10), one request per text, with `LLM_BATCH_PAUSE_MS` (default 1000) between them and a hard `LLM_BATCH_MAX_MINUTES` (default 30) after which the batch stops and reports what it completed. A 429 waits exactly what the server asked — `Retry-After`, or the interval parsed from the body, clamped to `[1 s, 90 s]` — for at most 4 retries, with no exponential backoff. The legacy's measurement is the sizing input: on Groq's free account, a 400-card round delivered 30 opinions in an hour before the rest was lost to the rate limit. | `runBatch()`'s size, pause and deadline; `retryAfterSeconds(response)` in `packages/llm/src/http.ts` | `llm.spec.ts > a Retry-After header of 12 waits 12 s`; `> "try again in 1.5s" in the body waits 2.0 s`; `> a header of 300 is clamped to 90`; `> the fifth 429 fails with the rate-limit message`; `authoring.spec.ts > a batch stops at the deadline and reports partial progress` |
| BR-S08.T06-01 | A proposal may reference only codes that exist **at proposal time**, and the shortlist handed to the model is drawn from `rule_codes` at request time — so the vocabulary the model sees and the vocabulary the validator enforces are the same snapshot, recorded as `prompt_version` plus the rules snapshot on the row. | `buildPrompt()` reads `rule_codes` and records the snapshot; `validateProposal()` re-reads it | `authoring.spec.ts > the prompt's code list equals the rule_codes rows at request time`; `> a code deleted between request and validation is rejected` |
| BR-S08.T06-02 | Every proposal is stored with `status = 'draft'` and no path in this subtask writes `text_codes`, `rule_codes` or any card table. Accepting is an editor action that calls `PUT /api/rules/texts/:hash/codes` with the same validation and composition as a hand-authored save. | `writeProposal()` is the only writer and sets `'draft'`; the module imports no write helper for those tables | `authoring.spec.ts > 20 texts produce 20 draft rows and zero text_codes rows`; `pnpm check` finds no `INSERT INTO text_codes` under `apps/worker/src/authoring` |
| BR-S08.T06-03 | Accepting a proposal is recorded but is not the write: the editor saves the code list through its own endpoint, and only on a 200 does the queue mark the proposal `accepted` with the resulting `rulesSnapshot`. A failed save leaves the proposal `draft`, so nothing is ever marked accepted without the codes actually being stored. | the accept handler performs the save first and the status update second, in that order, in one request | `api.spec.ts > a save that fails composition leaves the proposal draft and writes no codes`; `> a successful accept records the new rulesSnapshot` |
| BR-S08.T06-04 | A proposal is a proposal about a **text**, and at most one is open per text: a second request for a text with an open draft returns the existing row unless `--force` is given, in which case the older draft becomes `superseded`. Proposal history is never deleted. | a partial unique index on `(text_hash)` where `status = 'draft'`; `supersede()` on force | `authoring.spec.ts > a second proposal for the same text returns the open one`; `> --force supersedes and inserts, keeping both rows` |
| BR-S08.T06-05 | The model never sees the card's name, its set or its price, and never sees another card's answer: the prompt carries the printed effect text, its kind (`ability`/`attack`/`trainer`/`energy`), its sentence split, and the candidate code shortlist. A proposal must therefore be derivable from the wording alone, which is also what RN-05 says meaning depends on. | `buildPrompt()`'s explicit field list; the request is one text per call | `authoring.spec.ts > the prompt contains no card name, set code or price` (string assertion over a fixture); `> one request per text` |
| BR-S08.T06-06 | Structured output is requested, never parsed out of prose when it can be avoided: Anthropic is called with the single forced tool `emit_result` whose `input_schema` is the proposal schema; an OpenAI-compatible provider is called with `response_format: { type: "json_schema" }`, degrading to `json_object` and then to none only on a 4xx that names the parameter. `extractJson()` is the last resort and its use is recorded on the row. | `AnthropicBackend.complete()` and `OpenAICompatBackend.complete()`; `usedFallbackParse` stored in the row | `llm.spec.ts > the anthropic call sends tool_choice { type: "tool", name: "emit_result" }`; `> a 400 naming response_format degrades to json_object and then to none`; `> extractJson recovers a fenced object and a trailing comma` |
| BR-S08.T06-07 | A rejected response is stored with its reason and its raw text, truncated to `LLM_RAW_MAX_CHARS` (2000): the point of the feature is to learn whether the prompt works, and discarding failures makes that unanswerable. | `writeProposal()` with `status = 'rejected'` and `note` carrying the reason | `authoring.spec.ts > a malformed response is stored as rejected with its reason and truncated raw text` |
| BR-S08.T06-08 | Cost and usage are recorded per proposal — `provider`, `model`, `input_tokens`, `output_tokens` — and the queue reports batch totals, so "is this worth it?" is a measurement rather than an impression. | the backends return usage; `writeProposal()` stores it; `GET /api/rules/proposals/batches` aggregates | `authoring.spec.ts > usage is recorded per row`; `api.spec.ts > the batch summary sums tokens per provider` |
| BR-S08.T06-09 | No secret is logged or stored: the API key never enters a log line, a proposal row, an error message or the queue response, and `packages/llm` redacts any field matching `/key\|token\|secret\|authorization/i` before logging. | the logger's redaction list; the backends log the base URL and the model only | `llm.spec.ts > a failing request logs neither the key nor the Authorization header`; `pnpm check` greps the repository for a committed key shape |
| BR-S08.T06-10 | The worker's `propose` job kind spawns no engine and blocks no other job: it is a network-bound job that yields between texts, and the job queue's single-job-at-a-time rule ([S04.T15](../04-game-engine-core/T15-worker-job-runner.md)) means a long batch must be cancellable through the ordinary `status = 'cancelled'` path. | the handler checks the cancel flag between texts and stops at the next boundary | `authoring.spec.ts > cancelling a batch stops it before the next request and reports partial progress` |

## Data operations

**CRUD.** The **worker** writes proposals; the api reads them and performs the accept/reject transitions. Nothing here writes `text_codes`, `rule_codes`, `rule_evidence` or any baseline table.

| Entity | Operation (C/R/U/D) | Actor (api/worker) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `rule_proposals` | C | worker | one row per text per request, on success or rejection | `status ∈ draft\|rejected`; at most one `draft` per `text_hash` (BR-S08.T06-04); `items_json` already validated when `draft` | BR-S08.T06-02, -07 |
| `rule_proposals` | U (`status='superseded'`) | worker | a forced re-proposal for a text with an open draft | only from `draft`; the old row is kept | BR-S08.T06-04 |
| `rule_proposals` | U (`status='accepted'`, `reviewed_at`, `reviewed_action`, `note`) | api | after the editor's save returned 200 | only from `draft`; written **after** the codes are stored, never before | BR-S08.T06-03 |
| `rule_proposals` | U (`status='rejected'`, `reviewed_at`, `note`) | api | the user dismisses a draft | only from `draft`; the note is required | the queue's other exit |
| `rule_proposals` | R | api, worker | the queue panel, the per-text banner, the batch summary, the "already open?" check | read-only | [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md) renders it |
| `rule_proposals` | D | — | never | history is what says whether the prompt works (BR-S08.T06-07) | no retention |
| `rule_codes` | R | worker | building the shortlist and validating the response | read-only; the same snapshot for both (BR-S08.T06-01) | [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md) |
| `rule_codes`, `text_codes` | C/U/D | this subtask | never | a proposal is data about a possible edit, not an edit (BR-S08.T06-02) | the editor owns the write |
| `effect_texts`, `text_sentences`, `card_parts` | R | worker | the printed text, its kind and its sentence split | read-only; no card name, set or price is read into the prompt (BR-S08.T06-05) | RN-05 |
| `card_usage_cache` | R | worker | ordering a batch by meta copies | read-only | [S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md) owns the queue's ordering |
| `rules_current` | R | worker | recording the rules snapshot on each row | read-only | staleness context for the reviewer |
| `rule_evidence` | C/R/U/D | this subtask | **never** | no code path exists; the `kind` enum has no LLM member (RN-63) | [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) BR-S05.T12-03 |
| `jobs` | C | api | `POST /api/jobs { kind: "propose" }` | the batch runs as an ordinary job so it is listable and cancellable | [S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md) |
| `jobs` | U (`progress_json`, terminal) | worker | during and at the end of a batch | the existing throttled-progress path | [S04.T15](../04-game-engine-core/T15-worker-job-runner.md) |

**Endpoints** — the review queue.

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/rules/proposals` | `?status=draft&textHash=&batchId=&limit=50&offset=0` | `{ total, providerAvailable, provider, model, items: [{ id, textHash, status, items, rationale, confidence, provider, model, batchId, inputTokens, outputTokens, createdAt, reviewedAt, reviewedAction, note, validation: { ok, errors } }] }` | `503 database_unavailable` |
| GET | `/api/rules/proposals/batches` | `?limit=20` | `{ items: [{ batchId, startedAt, finishedAt, texts, drafts, rejected, inputTokens, outputTokens, provider, model, stoppedReason }] }` | `503 database_unavailable` |
| POST | `/api/rules/proposals/:id/accept` | `{ note?: string }` | `{ proposal, program, rulesSnapshot, staleTexts, staleCopies }` — the save's own response, plus the updated row | `409 CompositionError { kind, ordinal }`; `422 ParamsInvalid { ordinal, field }`; `409 conflict` when the proposal is not `draft`; `404 not_found` |
| POST | `/api/rules/proposals/:id/reject` | `{ note: string }` | the updated row | `422 unprocessable` when the note is empty; `409 conflict` when not `draft`; `404 not_found` |
| POST | `/api/jobs` | `{ kind: "propose", params: { textHashes?: string[], top?: number, force?: boolean } }` | the job row | `409 conflict` when a `propose` job is running; `422 unprocessable` when no provider is available |

**User actions** in the editor ([S05.T13](../05-card-rules-base/T13-rules-editor-ui.md)) are two: "Sugerir códigos" on a text page, which enqueues a one-text `propose` job and then shows the draft beside the empty code list with an "Aplicar" button per item and one "Aceitar tudo" that pre-fills the form without saving; and the queue page's accept/reject pair. Both controls are absent when `providerAvailable` is false (RN-60).

## Interfaces

**Environment.** Five variables, all optional. The environment table in `project/03-architecture-overview.md` currently names only `ANTHROPIC_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL`; `LLM_PROVIDER` and `GROQ_API_KEY` are defined here and must be added there (see Risks).

| Variable | Default | Effect |
|---|---|---|
| `LLM_PROVIDER` | `auto` | `auto \| anthropic \| groq \| local \| stub \| none`. `auto` resolves Anthropic if `ANTHROPIC_API_KEY` is set, else Groq if `GROQ_API_KEY` is set, else `local` if `LLM_BASE_URL` is set, else `none` — the legacy chain with the "falls through to a local server that is not running" defect removed |
| `ANTHROPIC_API_KEY` | — | selects and authenticates the Anthropic backend |
| `GROQ_API_KEY` | — | selects and authenticates the Groq backend, which is the OpenAI-compatible one against `https://api.groq.com/openai/v1` |
| `LLM_BASE_URL` | — | an OpenAI-compatible endpoint (a local Ollama-style server, or any compatible host); required for `LLM_PROVIDER=local` |
| `LLM_MODEL` | — | the model id; required for `groq` and `local`, optional for `anthropic`, where the backend's own default applies |
| `LLM_TIMEOUT_MS` | `180000` | per-request budget, the legacy's 180 s |
| `LLM_MAX_RETRIES` | `4` | waited retries after a 429; the legacy value |
| `LLM_MAX_TOKENS` | `1024` | response budget, the legacy default |
| `LLM_TEMPERATURE` | `0.2` | the legacy default for the OpenAI-compatible path; omitted for Anthropic models that reject sampling parameters |
| `LLM_BATCH_SIZE` | `10` | texts per batch (RN-68) |
| `LLM_BATCH_PAUSE_MS` | `1000` | pause between texts inside a batch |
| `LLM_BATCH_MAX_MINUTES` | `30` | hard deadline; the batch stops and reports partial progress |
| `LLM_RAW_MAX_CHARS` | `2000` | truncation of a rejected response's raw text |

**`packages/llm`**

```ts
export type Provider = "anthropic" | "groq" | "local" | "stub" | "none";
export interface LlmConfig { provider: Provider; model: string; baseUrl?: string;
  timeoutMs: number; maxRetries: number; maxTokens: number; temperature?: number; }
export interface LlmResponse<T> { data: T | null; text: string; provider: Provider; model: string;
  inputTokens?: number; outputTokens?: number; usedFallbackParse: boolean; }

export function resolveProvider(env?: NodeJS.ProcessEnv): LlmConfig;          // "none" when unconfigured (RN-60)
export function isAvailable(cfg?: LlmConfig): boolean;
export async function complete<T>(cfg: LlmConfig, req: {
  system: string; messages: { role: "user" | "assistant"; content: string }[];
  jsonSchema: object;                      // the emit_result input_schema / response_format schema
  signal?: AbortSignal;
}): Promise<LlmResponse<T>>;
export function extractJson(text: string): unknown | null;
export function retryAfterSeconds(res: { headers: Headers; body: string },
                                  opts?: { default_?: number; cap?: number }): number;  // default 8, cap 90, floor 1
export class LlmError extends Error { provider: Provider; status?: number; retryable: boolean; }
export const RETRY_AFTER_DEFAULT_S = 8;
export const RETRY_AFTER_CAP_S = 90;
```

`AnthropicBackend` sends one tool — `{ name: "emit_result", description: "Return the structured result requested.", input_schema: <schema> }` — with `tool_choice: { type: "tool", name: "emit_result" }`, and reads the answer from the `tool_use` block whose `name` is `emit_result`, falling back to `extractJson(text)` only if no such block arrives. `OpenAICompatBackend` posts to `${baseUrl}/chat/completions` with `response_format: { type: "json_schema", json_schema: { name: "result", schema } }`, degrading to `{ type: "json_object" }` and then to no `response_format` on a 4xx that names the parameter — the legacy's three-step ladder. `StubBackend` returns a fixture keyed by the prompt hash, which is what lets every test and the whole CI run with no key (RN-60).

**Rate limiting** follows the server, not a curve (RN-68). On a 429: read `Retry-After`; if absent, parse the interval out of the body (`try again in 1.5s`, `… 800ms`, `… 2m`); clamp to `[1, 90]` seconds; default to 8 when nothing parses; sleep exactly that; retry up to `LLM_MAX_RETRIES` (4), which is five requests in total. There is no exponential backoff and no jitter, because a free tier that tells you when to come back is more accurate than any heuristic, and doubling past 90 s only wastes the batch's deadline.

**The proposal contract** (`@pokesearch/shared`), which is both the tool's `input_schema` and the validator's input:

```ts
export const ProposalItem = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),          // must exist in rule_codes (BR-S08.T06-01)
  params: z.record(z.unknown()).default({}),            // validated by validateParams (RN-61)
  sentenceFrom: z.number().int().min(0),
  sentenceTo: z.number().int().min(0),
  why: z.string().max(200),                             // one line per item, for the reviewer
});
export const Proposal = z.object({
  items: z.array(ProposalItem).max(12),                 // an empty list is a legitimate "I cannot classify this"
  rationale: z.string().max(1000),
  confidence: z.enum(["high", "medium", "low"]),
  unsupported: z.boolean().default(false),              // the text needs a code that does not exist
});
export const PROPOSAL_PROMPT_VERSION = 1;
```

`unsupported: true` with an empty `items` list is the answer the long tail needs most: *"this text cannot be expressed with the codes you gave me."* It is stored as a `draft` with no items and surfaces in the queue as a request for a new code — which a human authors, because RN-67 is superseded and nothing here generates a code body.

**The prompt** (`docs/rules/AUTHORING-LLM.md` §2). System: the composition contract in ten lines — a text's meaning is an ordered list of `(code, params)` items, the four category slots, the wrapper rule, the `phase` rule on attack parts, and the instruction to use only the codes given and to set `unsupported` rather than invent one. User: the effect text's `kind`, its printed wording, its sentence split with indices, and the candidate shortlist. The shortlist is not the whole vocabulary: it is the 40 most-used codes plus every code whose `pattern` shares a stem with the text, capped at `PROMPT_CODES_MAX` (60), each rendered as `CODE{param: type[min..max]} — pattern — one example card`. Capping it keeps the request inside a free tier's token budget and keeps the model's choice legible; the cap and the selection are recorded as `prompt_version` so a change is visible in the queue's history.

**`packages/db/migrations/0011_authoring.sql`**

```sql
-- 0011_authoring.sql — the LLM review queue. A proposal is data to review, never behaviour (RN-63).
-- Owner: S08.T06. Written by apps/worker; reviewed through apps/api. Never deleted.
-- Postgres: items_json TEXT -> jsonb. No SQLite-only construct in this file.

CREATE TABLE rule_proposals (
    id              INTEGER PRIMARY KEY,
    text_hash       TEXT    NOT NULL REFERENCES effect_texts(text_hash) ON DELETE CASCADE,
    status          TEXT    NOT NULL DEFAULT 'draft',
    items_json      TEXT    NOT NULL DEFAULT '[]',   -- [{ code, params, sentenceFrom, sentenceTo, why }]
    rationale       TEXT,
    confidence      TEXT,                            -- 'high' | 'medium' | 'low'
    unsupported     INTEGER NOT NULL DEFAULT 0,
    provider        TEXT    NOT NULL,
    model           TEXT    NOT NULL,
    prompt_version  INTEGER NOT NULL,
    rules_snapshot  TEXT    NOT NULL,
    batch_id        TEXT,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    used_fallback   INTEGER NOT NULL DEFAULT 0,
    raw_excerpt     TEXT,                            -- only for rejected rows, truncated
    created_at      TEXT    NOT NULL,
    reviewed_at     TEXT,
    reviewed_action TEXT,                            -- 'accepted' | 'rejected'
    note            TEXT,
    CHECK (status IN ('draft','accepted','rejected','superseded')),
    CHECK (confidence IS NULL OR confidence IN ('high','medium','low')),
    CHECK ((reviewed_at IS NULL) = (reviewed_action IS NULL)),
    CHECK (unsupported IN (0,1))
);

CREATE UNIQUE INDEX rule_proposals_open_idx ON rule_proposals (text_hash) WHERE status = 'draft';
CREATE INDEX rule_proposals_status_idx ON rule_proposals (status, created_at DESC);
CREATE INDEX rule_proposals_batch_idx  ON rule_proposals (batch_id);
```

## Implementation steps

1. Write `packages/llm/src/config.ts` with `resolveProvider()` over the five variables and the corrected `auto` chain; spec that an unconfigured environment resolves to `none` (RN-60).
2. Write `http.ts` with `retryAfterSeconds()` — header, then body parse, then the 8 s default, clamped to `[1, 90]` — and the four-retry loop with no backoff; spec all four cases (RN-68).
3. Write `AnthropicBackend` with the `emit_result` forced tool and its `input_schema`, and `OpenAICompatBackend` with the three-step `response_format` ladder; spec both call shapes (BR-S08.T06-06).
4. Write `extractJson()` (fenced block first, then the first-brace-to-last-brace slice, then the trailing-comma repair) and `StubBackend`; spec the recovery cases and that the stub needs no key.
5. Add the redaction list and spec that a failing request logs neither the key nor the `Authorization` header (BR-S08.T06-09).
6. Write `0011_authoring.sql`, `RuleProposalRow` and its `TABLES` entry; run the drift test.
7. Write `buildPrompt()`: the system contract, the text and its sentence split, and the capped shortlist from `rule_codes`; spec that no card name, set code or price appears (BR-S08.T06-05, -01).
8. Write `validateProposal()`: the existence check against `rule_codes`, then `validateParams` per item, then the sentence-range bounds; spec the unknown-code and out-of-range rejections (RN-61).
9. Write `writeProposal()` and the draft/rejected/superseded transitions with the partial unique index; spec the one-open-draft rule and `--force` (BR-S08.T06-04, -07).
10. Register the `propose` job kind in the worker with the batch runner — size, pause, deadline, cancel check between texts — and its progress reporting (RN-68, BR-S08.T06-10).
11. Add the four API routes, with accept performing the editor save first and the status update second (BR-S08.T06-03).
12. Add the queue page and the per-text "Sugerir códigos" control to the rules editor, both hidden when `providerAvailable` is false, with the RN-61 limit as fixed copy beside every draft.
13. Write `docs/rules/AUTHORING-LLM.md` — the prompt, the vocabulary, what the validator catches and what it cannot, the batch sizing with the legacy measurement, and the review workflow.
14. Run one real batch of 10 uncovered texts with a provider configured, review every draft with the user, and record in the completion note how many were accepted unchanged, accepted after edits, and rejected — the number that says whether the feature is worth its keys.

## Edge cases and error handling

- **The model returns an unknown code.** The commonest failure and the one RN-61 is built for: a plausible-looking `DISCARD_HAND_AND_DRAW` that does not exist in `rule_codes`. The proposal is rejected before storage with the offending code name, the row is kept as `rejected` with its reason and its truncated raw text, and the queue shows it — a recurring invented name is the signal that a real code is missing from the vocabulary, which is useful information rather than noise.
- **The model returns an unknown operation or an out-of-range parameter.** `n: 400` against a `maximum: 12`, or a `filter` shape that is not in the closed filter list. `validateParams` rejects with the field name, exactly as it would for a human's `PUT` ([S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md) BR-S05.T07-03). The two validators are the same function, so the model gets no weaker check than a person.
- **The model returns something well formed and wrong.** It picks `SEARCH_DECK_FILTER_TO_HAND` where the text says "onto your Bench", and every parameter validates. Nothing rejects it, and nothing should: the validator's remit is form, not truth. It lands as `draft`, the reviewer sees the printed text beside the proposal in the editor, and if it is accepted the scenario is what eventually catches it. This is the limit RN-61 names and the reason the queue's copy repeats it rather than implying a guarantee it does not have (RN-61, RN-63).
- **No key is configured.** `resolveProvider()` returns `none`, the `propose` job kind is not registered, `POST /api/jobs { kind: "propose" }` returns 422 saying no provider is available, the queue returns `providerAvailable: false` with an empty list, and both editor controls are absent. No request is attempted and no error is logged, because nothing went wrong (RN-60).
- **The free tier rate-limits in the middle of a batch.** The first 429 waits exactly what the server asked, clamped to 90 s; the fifth fails that text with the rate-limit message, stores it as `rejected`, and the batch moves to the next one rather than aborting. If the deadline passes first, the batch stops and reports how many texts it completed — the legacy's 400-card round that delivered 30 opinions in an hour is precisely this shape, and reporting partial progress is what makes it usable instead of frustrating (RN-68).
- **The provider returns 200 with prose instead of a tool call.** `extractJson()` tries the fenced block, then the first-brace-to-last-brace slice, then a trailing-comma repair. If it succeeds the proposal proceeds with `used_fallback = 1` recorded, because a provider that needs the fallback is a provider whose structured-output support is worth knowing about; if it fails, the row is `rejected` with the raw excerpt.
- **The request times out or the connection fails.** `LlmError { retryable: false }` for a connection failure, one rejected row for that text, and the batch continues. A local `LLM_BASE_URL` pointing at a server that is not running is the everyday version of this, and it produces a clear message naming the base URL rather than a stack trace.
- **Two proposals for the same text.** The partial unique index on `(text_hash)` where `status = 'draft'` refuses the second; the job returns the open one unless `force` is set, in which case the old draft becomes `superseded` and both rows remain. A queue with two live opinions about one text is a queue that cannot be worked through (BR-S08.T06-04).
- **A code is edited between the proposal and the review.** `rules_snapshot` on the row differs from `rules_current`, so the queue marks the draft stale and re-validates it on open; if `validateParams` now fails, the accept button is disabled with the field named. A proposal built against an older vocabulary is not silently applied.
- **The text is deleted by an ETL reload** — a wording correction changes the hash. The `ON DELETE CASCADE` on `text_hash` removes the proposal with the text it was about. That is the right outcome: a proposal about wording that no longer exists is not evidence of anything, and [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md)'s near-duplicate report is where the codes get repointed.
- **Accepting a proposal whose composition fails.** The save runs first and returns 409 with the ordinal; the proposal stays `draft` and no codes are written, so the queue never shows `accepted` for codes that are not stored (BR-S08.T06-03).
- **A batch is cancelled.** The handler checks `jobs.status` between texts and stops at the next boundary, leaving the proposals already written in place and reporting partial progress. Cancelling mid-request is not attempted; one in-flight call finishing is cheaper than an aborted connection the provider may still bill (BR-S08.T06-10).

## Acceptance / verification

- [ ] With a stub provider, 20 uncovered texts produce 20 rows in `rule_proposals` with `status = 'draft'`, and `SELECT COUNT(*) FROM text_codes` is unchanged; no proposal becomes active without an explicit accept (BR-S08.T06-02, RN-63).
- [ ] The full suite passes with `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL` all unset: `llm.spec.ts > no configuration resolves to none`, `authoring.spec.ts > with no provider the queue is empty and no request is attempted`, and the editor renders neither control (RN-60).
- [ ] `authoring.spec.ts > a proposal naming an unknown code is rejected with the code name` and `> n = 400 against a maximum of 12 is rejected with the field name`; both rows are stored as `rejected` with their reasons (RN-61, BR-S08.T06-07).
- [ ] `authoring.spec.ts > a well-formed but semantically wrong proposal is stored as draft` — the explicit assertion of RN-61's limit, with the queue copy naming it.
- [ ] `llm.spec.ts`: a `Retry-After: 12` waits 12 s; `try again in 1.5s` in the body waits 2.0 s; `Retry-After: 300` is clamped to 90 s; a body with no interval waits 8 s; the fifth consecutive 429 fails with the rate-limit message after 4 waits (RN-68).
- [ ] `authoring.spec.ts > a batch of 10 pauses between texts and stops at LLM_BATCH_MAX_MINUTES`, reporting the texts completed; `> cancelling a batch stops it before the next request` (RN-68, BR-S08.T06-10).
- [ ] `llm.spec.ts > the anthropic call sends one tool named emit_result with the proposal schema as input_schema and tool_choice { type: "tool", name: "emit_result" }`; `> a 400 naming response_format degrades json_schema → json_object → none` (BR-S08.T06-06).
- [ ] `llm.spec.ts > extractJson recovers a fenced object, a bare object with surrounding prose, and an object with a trailing comma`, and returns null on prose with no JSON (BR-S08.T06-06).
- [ ] `authoring.spec.ts > the prompt contains no card name, set code or price` and `> the prompt's code list equals the rule_codes rows at request time` (BR-S08.T06-05, -01).
- [ ] `api.spec.ts > a save that fails composition leaves the proposal draft and writes no codes`, and `> a successful accept records the new rulesSnapshot` (BR-S08.T06-03).
- [ ] `authoring.spec.ts > a second proposal for the same text returns the open one` and `> force supersedes and inserts, keeping both rows` (BR-S08.T06-04).
- [ ] `pnpm check` fails on a fixture inserting into `rule_evidence` from `packages/llm` or `apps/worker/src/authoring`, and finds no `INSERT INTO text_codes` under the authoring module (RN-63, BR-S08.T06-02).
- [ ] `llm.spec.ts > a failing request logs neither the key nor the Authorization header` (BR-S08.T06-09).
- [ ] One real batch of 10 uncovered texts with a provider configured: the completion note records how many drafts were accepted unchanged, accepted after edits and rejected, plus the token totals per provider from `GET /api/rules/proposals/batches` (BR-S08.T06-08).

## Risks and open questions

- **Risk — a plausible proposal is accepted without being read.** The whole value of the queue collapses if "Aceitar tudo" becomes a habit. Mitigation: accepting pre-fills the editor form rather than saving, so the printed text and the proposal are on screen together at the moment of the decision; the RN-61 limit is fixed copy beside every draft; and the completion note's accepted/edited/rejected split is the number that says whether review is really happening.
- **Risk — the shortlist decides the answer.** Capping the vocabulary at 60 codes means a text whose right code is not in the shortlist gets a wrong one instead of `unsupported`. Mitigation: the selection is stem-matched against the text as well as usage-ranked, `unsupported` is explicitly offered in the system prompt, and `prompt_version` makes a change to the selection visible in the queue's history so its effect can be compared.
- **Risk — cost is invisible until a bill arrives.** Mitigation: tokens are recorded per row and summed per batch (BR-S08.T06-08); the default provider chain prefers a free tier; and `LLM_BATCH_SIZE` plus `LLM_BATCH_MAX_MINUTES` bound any single run.
- **Risk — `0011` collides with a migration number another subtask claims.** This stage adds three tables: `0009_ops.sql` ([S08.T02](T02-etl-monitoring-and-alerts.md)), `0010_twinleaf.sql` ([S08.T05](T05-twinleaf-differential-oracle.md)) and `0011_authoring.sql` here. All three must be confirmed against `packages/db/migrations/` before the first is applied, and `project/04-data-model-overview.md`'s table inventory stops at 0008 and needs all three rows added.
- **Question — should a proposal be allowed to suggest a *new* code?** It cannot today: the vocabulary is closed and `unsupported: true` is the escape. Allowing a proposed code name plus a pattern would speed up the long tail further and would move the closed-vocabulary boundary, which is the one RN-61 rests on. Recommendation: keep it closed; let `unsupported` drafts accumulate and read them as a prioritised list of codes to author by hand. The user decides if that list grows faster than they can work it.
- **Question — should the coach and this feature share one provider configuration?** They already would, since both use `packages/llm` and the same five variables, but their model needs differ (a classification task against a game-analysis task). Recommendation: one configuration now, with per-role overrides added only if a measurement shows the same model is wrong for both — the legacy split them into `code`, `play` and `chat` roles with separate model variables, which is the shape to copy if it becomes necessary. [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md) owns that decision.
- **DEPENDENCY-PROPOSAL: S08.T06 should depend on S01.T04 because** it adds `packages/db/migrations/0011_authoring.sql` and needs the migration runner, the `NNNN_*.sql` convention and the `TABLES` drift test.
- **DEPENDENCY-PROPOSAL: S08.T06 should depend on S05.T12 because** RN-63's guarantee is expressed there — the four-member evidence `kind` enum and the `pnpm check` grep that forbids this module from writing `rule_evidence` — and because the queue's staleness display reads `rules_current`. Today the edge does not exist.
- **DEPENDENCY-PROPOSAL: S08.T06 should depend on S04.T14 and S04.T15 because** the batch runs as a `propose` job with a row in `jobs`, progress reporting and the ordinary cancellation path, all owned by those two subtasks.
- **DEPENDENCY-PROPOSAL: S08.T06 should depend on S05.T14 because** a batch's default selection is the authoring queue's ordering by meta copies, which that subtask owns; without it, `top: n` has no defined meaning.
- **Sizing — this file is probably two subtasks, and the first has a second consumer.** Its prose runs past the ~2,400-word guidance in [Conventions](../../project/08-conventions.md) because it builds a provider layer and an authoring feature. `packages/llm` — provider resolution, the two backends, the `Retry-After` policy, `extractJson`, the stub, the redaction — is needed verbatim by [S07.T07](../07-deck-optimizer/T07-coach-lost-game-review.md)'s coach, which today would either duplicate it or depend on an *optional* subtask. A split would be "LLM provider layer" (steps 1–5), which both S07.T07 and this file depend on, and "S08.T06 LLM-assisted rule authoring" (steps 6–14). Not applied here, because renumbering is not this pass's to do; proposed for the user's decision, and it is the split with the clearest external justification of the six in this stage.

## References

- `pokemon/ESPECIFICACAO.md` §4.5 — verified: RN-60 (*"IA nunca está no caminho crítico: sem chave, tudo funciona"*), RN-61 (*"Saída de IA que vira comportamento passa por vocabulário fechado com faixas de sanidade; operação desconhecida é recusada. O validador barra resposta malformada, não resposta errada e bem formada (amostra: 25 de 27 ataques corretos)"*), RN-63 (*"Parecer de IA não é evidência de que uma carta está certa; é fila de revisão"*), RN-64 (*"Auditoria e lint nunca alteram carta"*), RN-67 (AI-generated code sandboxing, superseded here because nothing is generated) and RN-68 (*"Conta gratuita da Groq: trabalhar em lotes pequenos (uma rodada de 400 cartas rendeu 30 pareceres em uma hora)"*).
- `pokemon/README.md` L299–300 — verified: *"Limite conhecido do parecer: na conta gratuita da Groq, uma rodada de 400 cartas entregou 30 pareceres em uma hora e perdeu o resto no limite de taxa. A camada de atributos não depende de IA e cobre as 716 cartas em segundos."* The measurement `LLM_BATCH_SIZE` and `LLM_BATCH_MAX_MINUTES` are set against.
- `pokemon/src/pokesearch/llm/backends.py` — verified: `AnthropicBackend` sending `tools = [{ "name": "emit_result", "description": …, "input_schema": json_schema }]` with `tool_choice = { "type": "tool", "name": "emit_result" }` (and `{"type": "auto"}` plus a system instruction for models that reject a forced tool), harvesting the `tool_use` block named `emit_result` and falling back to `extract_json(text)`; `OpenAICompatBackend(base_url, default_model, api_key, timeout = 180.0, max_retries = 4)` posting to `${base_url}/chat/completions` with the `json_schema` → `json_object` → none ladder, `max_tokens = 1024` and `temperature = 0.2`; `_retry_after_seconds(response, default = 8.0, cap = 90.0)` reading the `retry-after` header, else parsing `try again in ([\d.]+)\s*(ms|s|m)?` from the body and returning `min(cap, max(1.0, seconds + 0.5))`, with **no exponential backoff**; and `extract_json` trying fenced blocks, then the first-`{`/`[`-to-last-`}`/`]` slice, then a trailing-comma repair. Consult for the call shapes and the retry policy, all carried over.
- `pokemon/src/pokesearch/llm/roles.py` — verified: the module docstring *"LLM_PROVIDER: anthropic | groq | local | none | auto. `auto` usa anthropic se houver ANTHROPIC_API_KEY, senão groq se houver GROQ_API_KEY, senão local se houver LOCAL_LLM_MODEL"*, `PROVIDERS = ("anthropic", "groq", "local", "none")`, the key-gated returns for explicit `anthropic` and `groq`, and the `lru_cache`d backend construction in which Groq and local share `OpenAICompatBackend` and differ only in URL, key and model. Consult for the chain; the "falls through to `local` because `LOCAL_LLM_MODEL` has a default" behaviour is the one defect this subtask removes (RN-60).
- [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md) — the composition contract the prompt states in ten lines, `validateParams(code, params)` against `params_schema_json`, the four category slots, the wrapper and `phase` rules, the `UPPER_SNAKE` naming, and the error taxonomy the accept path surfaces.
- [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md) — the text page a draft is rendered beside, the generated params form an accepted proposal pre-fills, `PUT /api/rules/texts/:hash/codes` with its validate-compose-write ordering, and the stale banner the accept response carries.
- [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) — the four-member evidence `kind` enum with no LLM member, the statement that this feature writes to its own table and cannot reach `rule_evidence`, and the `pnpm check` grep that enforces it (RN-63).
- [Architecture](../../project/03-architecture-overview.md) principle 8 — "No LLM on the critical path. Everything works without API keys; LLM output is a proposal or a review, never evidence" — and the environment table this subtask extends with `LLM_PROVIDER` and `GROQ_API_KEY`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
