# S05.T13 — Web: rules editor

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 13 / 16 |
| Depends on | [S01.T08](../01-foundation/T08-web-skeleton.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Unblocks | [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md) |
| Parallel with | [S05.T14](T14-coverage-page-and-authoring-queue.md), [S05.T16](T16-measurement-model-and-suite-v6-freeze.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` web shell — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `contract` codes/params composition, `GET /api/rules/programs/:hash`, `validateParams` — from [S05.T07](T07-rule-codes-composition-semantics.md)
- `module` evidence and coverage endpoints — from [S05.T12](T12-evidence-and-coverage-metrics.md)
- `file` `pokemon/src/pokesearch/sim/lint.py` and `pokemon/src/pokesearch/api/routes_sim.py` (`/sim/card/{id}`, `/sim/audit`) — the lint rules and the legacy screens; read-only reference

## Outputs (proposed)
- `module` routes `/rules`, `/rules/texts/:hash`, `/rules/codes/:code` — official text with sentence boundaries beside the ordered code list (add/reorder/remove, params form generated from `params_schema_json`), compiled IR preview and the prompts it would open, status controls, evidence list (green/red per scenario, engine build), lint warnings, list of cards sharing the text; code page: pattern, params schema, IR body editor with schema validation, usages — consumed by [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md)
- `contract` API `PUT /api/rules/texts/:hash/codes`, `PUT /api/rules/codes/:code`, `POST /api/rules/scenarios/run?text=`
- `module` `packages/shared/src/rules/lint.ts` — the six text-versus-codes lint rules carried over from the legacy, pure functions over `(text, ProgramJson, items)`, used by the editor and by `pnpm check`

## Initial objective
Authoring a card's behaviour is a form over data, with the official text, the proof status and the affected cards always in view — no code editing, no redeploy.

## Context

D-004's promise is that changing what a card does is a data edit. This is the screen where that promise is either kept or quietly broken. If authoring a code means opening a repository, the rules base is code with extra steps.

The legacy had three screens and none of them could author anything. `/sim/cards` was a coverage dashboard listing the most-played approximate and unproven cards. `/sim/audit` listed attribute divergences and LLM verdicts, with a "run audit" button. `/sim/card/{id}` showed one card's parts, the evidence for each and the Python source of its recipe, read-only — to change a card you edited `catalog.py` and restarted. The one genuinely useful thing it had, and the thing this screen inherits, is the **lint**: `sim/lint.py` compares the official printed text against what the recipe implements and reports suspicions. Its docstring is the argument for building it here rather than later: *"O custo de um falso alarme é uma leitura de dois minutos; o de um erro não visto é uma carta errada contada como exata."* Six of its seven rules carry over — the seventh, `texto-do-motor`, compared the third-party engine's stored text against the official one and has no counterpart here, because there is no second text.

The screen is organised around a **text**, not a card, because that is what carries meaning (RN-05). `/rules/texts/:hash` shows the printed wording split into sentences on the left, the ordered `(code, params)` list on the right, and underneath: the composed IR with its disassembly, the prompts the program would open, the lint warnings, the evidence with its engine build and staleness, and the list of every printing that shares the text with their meta copies. That last panel is the one that changes behaviour: seeing "this text is on 4 printings worth 31,200 meta copies" before pressing save is what makes the effort legible. `/rules/codes/:code` is the other axis — one code, its pattern, its params schema, its IR body, and every text that uses it, so a fix to a shared code is visibly a fix to forty cards.

Three interaction decisions matter more than the layout. **The params form is generated**, never hand-written per code: `params_schema_json` is a JSON Schema subset ([S05.T07](T07-rule-codes-composition-semantics.md)) and the form renderer walks it, producing a number input with min/max from the RN-61 sanity range, a select for an enum, and a filter builder for a `Filter`-typed slot. A new code therefore gets a usable form for free, which is what keeps the cost of adding a code low enough that the long tail is worth coding at all. **Saving is atomic and validated server-side**: the editor sends the whole ordered list, the API validates every item and composes before writing, and a composition error comes back with the ordinal that caused it. **Running a scenario is one click** from the text page, and the evidence panel turns green or red from the real job — the editor never fakes a result, because a green light that is not an evidence row is exactly the kind of second notion of "correct" this stage exists to remove.

## Scope

- **In scope.** The three routes and their panels; the generated params form and the filter builder; the IR preview (composed JSON, disassembly, prompt list); the evidence panel with build and staleness; the lint panel and `packages/shared/src/rules/lint.ts`; the "printings sharing this text" panel; the code page with its usages and its IR body editor; the three API routes and their error rendering; keyboard-first editing (add/reorder/remove a code without the mouse); pt-BR copy through the strings module (D-006).
- **Out of scope.** The coverage dashboard and the authoring queue ([S05.T14](T14-coverage-page-and-authoring-queue.md)); the composition semantics and `validateParams` ([S05.T07](T07-rule-codes-composition-semantics.md)); evidence writing and the coverage query ([S05.T12](T12-evidence-and-coverage-metrics.md)); the scenario format and the runner ([S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)); authoring scenarios by hand, which is a file edit ([S05.T11](T11-legacy-tests-to-scenarios.md)); LLM suggestions ([S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md)); card attribute overrides, which are a different form owned by [S05.T01](T01-rules-schema-migration.md)'s schema.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S05.T13-01 | A save replaces a text's whole ordered code list atomically: the API validates every item, composes the program, and only then writes, in one transaction. A partial save is impossible. | `PUT /api/rules/texts/:hash/codes` validates → composes → `BEGIN IMMEDIATE` → delete-then-insert → commit | `api.spec.ts > a list whose third item fails validation leaves the stored list unchanged`; `> the response carries the recomposed program` |
| BR-S05.T13-02 | Every params input is generated from `params_schema_json` and cannot produce a value the schema rejects: numeric inputs carry the schema's `minimum`/`maximum`, enum slots are selects, and the form refuses to submit a value `validateParams` would reject. | `<ParamsForm schema={…}>` walking the schema; client-side validation mirrors `validateParams`, and the server validates again | `rules-editor.spec.tsx > a number slot with maximum 12 rejects 99 in the form`; `api.spec.ts > the same value is rejected server-side` (defence in depth) |
| BR-S05.T13-03 | The editor never displays a behaviour it has not obtained from the server: the IR preview, the prompt list and the evidence state all come from `GET /api/rules/programs/:hash` and `GET /api/rules/coverage/text/:hash`, never from client-side composition. | the components take server data as props; there is no composition code in `apps/web` | `pnpm check` greps `apps/web` for imports of `@pokesearch/db/rules/compose`; `rules-editor.spec.tsx > the preview renders only server-provided JSON` |
| BR-S05.T13-04 | Running a scenario from the page enqueues a real job and the evidence panel reflects the stored rows; there is no optimistic green. | `POST /api/rules/scenarios/run?text=` creates a `scenarios` job scoped to that text; the panel polls `GET /api/rules/coverage/text/:hash` | `rules-editor.spec.tsx > the evidence chip stays neutral until the job finishes and then shows the stored result`; `api.spec.ts > the run endpoint creates a job and returns its id` |
| BR-S05.T13-05 | Every save recomputes `rulesSnapshot` and the page shows which evidence became stale, with the meta copies affected — the user is told the cost of the edit at the moment they make it. | the API returns `{ rulesSnapshot, staleTexts, staleCopies }` from the same transaction's follow-up read; the editor renders a banner | `api.spec.ts > a save returns the new snapshot and the stale counts`; `rules-editor.spec.tsx > the stale banner names the affected copies` |
| BR-S05.T13-06 | The six lint rules run on every render and on every save, and a lint warning never blocks a save: it is a suspicion, not an error. | `lintText(text, program, items)` in `packages/shared/src/rules/lint.ts`, called by the editor and by `pnpm check`; the API does not consult it | `lint.spec.ts > the six rules fire on their fixtures and stay silent on the corrected ones`; `api.spec.ts > a save with three lint warnings succeeds` |
| BR-S05.T13-07 | A code is never renamed and never deleted from the editor: the code page offers "create a successor" and "repoint usages", and deletion is refused while any `text_codes` row references it. | the code page has no rename or delete control; `PUT /api/rules/codes/:code` creates or updates, never renames | `api.spec.ts > there is no rename route`; `> deleting a referenced code returns 409 with the usage count` |
| BR-S05.T13-08 | The text page always shows every printing that shares the text, with its meta copies and its `card_status`, before the code list can be saved. | the "printings" panel is rendered from `GET /api/rules/coverage/text/:hash`; the save button is disabled until that request resolves | `rules-editor.spec.tsx > the save button is disabled while the printings panel is loading`; `> the panel lists all printings with copies` |
| BR-S05.T13-09 | Changing a code's `status` to `exact` is a deliberate, separate action with a confirmation naming the meta copies it will move into exact coverage, because status is a claim of fidelity. | the status control is a separate control from the body editor, with a confirmation dialog reading the impact from the coverage endpoint | `rules-editor.spec.tsx > promoting a code to exact shows the copies it affects and requires confirmation` |
| BR-S05.T13-10 | All UI copy is pt-BR through the strings module, and every IR node is rendered through `describe(node, "pt-BR")` from [S05.T03](T03-effect-ir-vocabulary.md) — no raw enum names in the interface. | the strings module (D-006); `describe()` with a locale | `rules-editor.spec.tsx > no raw op name appears in the rendered output`; `pnpm check` fails on a hard-coded string in a component |

## Data operations

**User actions.**

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Find a text | search box on `/rules` (by card name, by text, by code) | `GET /api/rules/texts?q=` | a list of texts with kind, name, printings, meta copies, `status` and a proven chip |
| Open a text | row click, or a link from the queue ([S05.T14](T14-coverage-page-and-authoring-queue.md)) | `GET /api/rules/programs/:hash?explain=1` + `GET /api/rules/coverage/text/:hash` | the full text page |
| Add a code | "+" under the code list, with a type-ahead over `rule_codes` | none (local until save) | a new item at the end, its params form generated, focus in the first field |
| Edit params | the generated form | none (local until save) | live validation against the schema; the composed preview refreshes on blur via `POST /api/rules/programs/preview` |
| Reorder codes | drag handle, or `Alt+↑`/`Alt+↓` | none (local until save) | ordinals renumbered densely; the preview refreshes |
| Remove a code | "×" on the item | none (local until save) | the item is removed; an undo chip appears for 10 s |
| Set a sentence range | click a sentence, then "attach to item *n*" | none (local until save) | `sentence_from`/`sentence_to` set; the sentence highlights with the item |
| Save the code list | "Salvar" (`Ctrl+S`) | `PUT /api/rules/texts/:hash/codes` | 200 → the recomposed program, the new snapshot and the stale banner; 422/409 → the failing ordinal is highlighted with the message |
| Preview the IR | the "IR" tab | `POST /api/rules/programs/preview` | the composed JSON, the disassembly and the list of prompts the program would open |
| Run this text's scenarios | "Rodar cenários" | `POST /api/rules/scenarios/run?text=<hash>` | a job id; the evidence panel polls and then shows green/red per scenario with the engine build |
| Open a code | code chip on an item, or `/rules/codes/:code` | `GET /api/rules/codes/:code` | pattern, params schema, IR body, status, usages with meta copies |
| Edit a code body | the IR body editor on the code page | `PUT /api/rules/codes/:code` | 200 → the new snapshot and the stale count; 422 → the schema error with its JSON path |
| Promote a code to `exact` | status control + confirmation | `PUT /api/rules/codes/:code` | the dialog names the meta copies moving into exact coverage (BR-S05.T13-09) |
| Create a successor code | "Criar sucessor" on the code page | `PUT /api/rules/codes/:newCode` | a copy with a new name; usages stay on the old code until repointed |
| Repoint usages | "Repontar usos" with a text picker | `PUT /api/rules/texts/:hash/codes` per text | a progress list; each text is saved atomically |
| Dismiss a lint warning | "Ignorar" on a warning | `PUT /api/rules/texts/:hash/codes` with `lintAck` | the warning is recorded as acknowledged in `text_codes.source`-adjacent metadata and greys out |

**Endpoints.**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/rules/texts` | `?q=&kind=&status=&unproven=1&limit=50&offset=0` | `{ total, items: [{ textHash, kind, name, excerpt, printings, metaCopies, status, exact, proven, codes }] }` | — |
| GET | `/api/rules/programs/:textHash` | `?explain=1` | the composed program, the per-item breakdown, warnings ([S05.T07](T07-rule-codes-composition-semantics.md)) | 404; 409 `CompositionError` |
| POST | `/api/rules/programs/preview` | `{ textHash, items: [{ code, params, sentenceFrom, sentenceTo }] }` | the program that *would* be composed, plus lint warnings | 422 `ParamsInvalid`; 409 `CompositionError` |
| PUT | `/api/rules/texts/:hash/codes` | `{ items: [...], lintAck?: string[] }` | `{ program, rulesSnapshot, staleTexts, staleCopies }` | 422 `ParamsInvalid { ordinal, field }`; 409 `CompositionError { kind, ordinal }`; 404 unknown text or code |
| PUT | `/api/rules/codes/:code` | `{ pattern, paramsSchema, category, wraps, phase, onceScope, irBody, status, approxNote?, notes? }` | `{ code, rulesSnapshot, staleTexts, staleCopies, usages }` | 422 `IrInvalid { path }`; 409 `StatusRequiresNote`; 400 on a rename attempt |
| DELETE | `/api/rules/codes/:code` | — | 204 | 409 `CodeInUse { usages }` |
| GET | `/api/rules/codes/:code` | — | the row plus `usages: [{ textHash, printings, metaCopies }]` | 404 |
| POST | `/api/rules/scenarios/run` | `?text=<hash>` or `?code=<code>` | `{ jobId }` | 409 a `scenarios` job is already running; 404 nothing to run |
| GET | `/api/rules/coverage/text/:hash` | — | printings, copies, codes, evidence with build and staleness ([S05.T12](T12-evidence-and-coverage-metrics.md)) | 404 |

**CRUD**, for completeness of the writer story: this screen's API writes `rule_codes` and `text_codes` (api actor, upsert / delete-then-insert per text, validated before write) and creates `jobs` rows (api actor, one `scenarios` job at a time). It never writes `rule_evidence`, `rules_current`, `card_usage_cache` or any ETL table — the worker owns the first three and the ETL the last (Architecture principle 2, BR-S05.T12-03).

## Interfaces

**Routes and panels.**

`/rules` — the index. A search box over card name, text and code; filters for kind, status, "sem provas" and "obsoletas"; a result table with the meta copies, the status chip and the proven chip. The default sort is meta copies descending, which makes the index and the authoring queue agree without duplicating the queue's logic.

`/rules/texts/:hash` — the text page, five panels:

1. **Texto oficial.** The printed wording, split into sentences by `splitSentences` ([S05.T08](T08-spreadsheet-import.md)), each sentence clickable and highlighted with the code items whose `sentence_from..sentence_to` covers it. `rule_box` parts are shown greyed with a "não conta para cobertura" label.
2. **Códigos.** The ordered items. Each row: ordinal, code chip (linking to the code page), the generated params form, the sentence range, and the item's status chip. Add / reorder / remove, all local until save.
3. **Programa.** Tabs — *IR* (the composed JSON), *Desmontagem* (`Program::disassemble()` from [S05.T04](T04-ir-compiler-and-vm.md), with wrapper nesting indented), *Perguntas* (the prompts the program would open, with their `purpose` and `actor`), *Português* (`explain()`'s rendering, sentence by sentence).
4. **Provas.** One row per scenario in `rule_scenarios` whose `verifies` names this text: green/red, the engine build, the run time, a staleness badge when `rules_snapshot` differs, and a link to the scenario file. A "Rodar cenários" button. When there is no scenario at all, the panel says so and links to `engine/scenarios/CONVERSION.md`.
5. **Impressões.** Every printing sharing the text, with its set, its meta copies and its `card_status` chips, and the sum at the top.

`/rules/codes/:code` — the code page: pattern, `params_schema_json` (edited as JSON with schema validation), `ir_body_json` (edited as JSON with the IR schema validated on every keystroke, errors shown at their JSON path), `category`, `wraps`, `phase`, `once_scope`, `status` with its confirmation, `approx_note`, `notes`, and a usages table (`textHash`, printings, meta copies, sum). "Criar sucessor" and "Repontar usos" live here.

**The generated params form.** `<ParamsForm schema={paramsSchemaJson} value={params} onChange={…} />` walks the schema and renders one control per property:

| Schema shape | Control | Notes |
|---|---|---|
| `{ type: "integer", minimum, maximum }` | number input with the range as `min`/`max` and a helper text | the RN-61 sanity range is visible, not just enforced |
| `{ type: "string", enum: [...] }` | select | energy types, conditions, trainer kinds, tags |
| `{ type: "boolean" }` | switch | — |
| `{ $ref: "#/$defs/Filter" }` | **filter builder** | a nestable row editor over the closed filter list, with `all_of`/`any_of`/`not` as group operators and a live pt-BR rendering via `describe()` |
| `{ $ref: "#/$defs/Value" }` | value picker | `int`, `count`, `energy_count`, `prizes`, `hand_size`, `bench_size`, `damage_on`, `local`, each with its own small form |
| `{ $ref: "#/$defs/Cond" }` | condition builder | the same nesting editor over `cmp`/`exists`/`matches`/`has_marker`, rendered to pt-BR |
| anything else | raw JSON textarea with schema validation | the escape hatch; it warns that the code's schema could be more specific |

The filter and condition builders are the two components worth building well: they are what turn "params per card" from a JSON-typing exercise into a form, and they are used by every search, discard and modifier code in the base.

**The lint** — `packages/shared/src/rules/lint.ts`, pure functions over the printed text and the composed program. Six rules carried from `sim/lint.py`, each with the legacy's regex where it had one, each returning `{ rule, severity: "warn", excerpt, message, ordinal? }`.

| Rule | Fires when | Detection | Legacy name |
|---|---|---|---|
| `coin-missing` | the text says to flip a coin and the program has no coin | `/\bflip (a\|\d+) coins?\b/i` matches the text, and the program contains no `coin_then`, no `repeat_until_tails` and no `coin_plus` attack field | `moeda` |
| `energy-type-ignored` | the text names an energy type and the params do not distinguish it | `/\b(Grass\|Fire\|Water\|Lightning\|Psychic\|Fighting\|Darkness\|Metal) Energy\b/` matches, and no `energy_count.type`, `energy_type` filter or `basic_energy_of` param carries that type | `tipo-de-energia` |
| `optional-treated-as-mandatory` | the text says "you may …" and the program runs it unconditionally | `/\byou may (discard\|shuffle\|put\|move\|attach\|switch\|return)\b/i` matches, and the program contains no `may` wrapper and no `choose_one` | `opcional` |
| `discarded-in-this-way` | "discarded in this way" became "the whole discard pile" | `/\bdiscarded in this way\b/i` matches and a `plus_per` counter is `count{zone: discard}` rather than the `$discarded` local | `descartou-assim` |
| `ability-uncoded` | the printing has an `ability` part with text and that text has no codes | `card_parts` has an `ability` part whose text has zero `text_codes` rows | `habilidade-ausente` |
| `attack-uncoded` | the printing has an `attack` part with text and that text has no codes | same, for `attack` parts | `ataque-sem-receita` |

Two rules from the legacy do **not** carry over: `texto-do-motor` (no second stored text exists) and the `approx`/`copy_attack` exemption (`check_attack` returned early for those) — here an `approx` code is still linted, because a documented approximation can still be missing its coin. The lint runs in the editor, in `pnpm check` over the whole base (reporting, not failing), and its output is what [S05.T14](T14-coverage-page-and-authoring-queue.md) shows as "suspeitas".

## Implementation steps

1. Add the three routes to the web shell with TanStack Router, loaders calling the read endpoints, and a stub layout; confirm they render against a seeded database.
2. Build the text page's "Texto oficial" and "Impressões" panels (read-only), including the sentence split and the meta-copy sum.
3. Build the API read endpoints `GET /api/rules/texts` and `GET /api/rules/codes/:code`, and wire the index page.
4. Build `<ParamsForm>` for the scalar schema shapes (integer with range, enum select, boolean) and render the code list read-only with its params.
5. Build the filter builder and the condition builder with their pt-BR rendering through `describe()`; spec them against the Buddy-Buddy Poffin filter and the Brave Bangle condition.
6. Add local editing — add, reorder (`Alt+↑`/`Alt+↓`), remove, sentence-range attach — and `POST /api/rules/programs/preview` so the IR panel updates without saving.
7. Build `PUT /api/rules/texts/:hash/codes` with validate → compose → transactional write, and the error rendering that highlights the failing ordinal.
8. Build the "Programa" tabs: IR JSON, disassembly, prompt list, pt-BR explanation.
9. Write `packages/shared/src/rules/lint.ts` with the six rules and their fixtures; render the lint panel; add the `pnpm check` reporting mode.
10. Build the "Provas" panel and `POST /api/rules/scenarios/run`, with real polling and no optimistic state.
11. Build the code page, including the IR body editor with path-level schema errors, the status confirmation, "Criar sucessor" and "Repontar usos", and `PUT`/`DELETE /api/rules/codes/:code`.
12. Add the stale banner from the save response, the pt-BR strings pass, and a keyboard-only walkthrough of authoring one text end to end.

## Edge cases and error handling

- **A code is edited while evidence exists for it.** The save succeeds, the snapshot changes, and the banner names the texts and meta copies whose evidence just went stale. The evidence panel keeps showing green with a staleness badge, because the proof is still a pass on this build — it is simply a pass on an older body. The worker re-runs the affected scenarios and the badge clears ([S05.T12](T12-evidence-and-coverage-metrics.md)).
- **Params fail their schema.** The form refuses to submit and marks the field; if the value somehow reaches the API, it returns 422 with `{ ordinal, field }` and the editor scrolls to that item. Both layers validate, because the API is also called by [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md).
- **A composition error on save** — a dangling wrapper, a duplicate attack field, an ordinal gap. 409 with `{ kind, ordinal }`; the item is highlighted and the message explains the rule ([S05.T07](T07-rule-codes-composition-semantics.md)'s taxonomy). Nothing is written.
- **Two tabs editing the same text.** The `PUT` carries the `rulesSnapshot` the page loaded with; a mismatch returns 409 `Conflict` with the other tab's list, and the editor offers "recarregar" or "sobrescrever". Last-write-wins without a warning would silently discard authoring work.
- **A code used by 40 texts is edited.** The save response's `staleCopies` will be large; the banner says so before the user navigates away, and the code page's usages table shows exactly which texts. This is the intended good case — one edit fixing forty cards — and it should feel like one.
- **Deleting a code that is in use.** 409 `CodeInUse` with the count and a link to the usages table. The path forward is "Criar sucessor" and "Repontar usos", which keeps the old code's history and its evidence intact.
- **A "you may" wrapper spanning two sentences.** The sentence-range control allows one item to cover several sentences, and the wrapper's own item covers only the sentence that introduces it. The lint's `optional-treated-as-mandatory` rule looks at the whole program, not at one item, so a correctly wrapped pair is silent.
- **A text with no scenario.** The evidence panel says "sem cenários" and links to the conversion guide rather than showing an empty green area. `proven` for that card is 0 and the page says why.
- **A text hash that disappears after an ETL reload.** The route 404s with the message that the wording changed, plus a link to the near-duplicate report from [S05.T02](T02-effect-texts-and-card-parts.md) so the codes can be repointed to the new hash.
- **A `builtin` code opened in the editor.** The IR body is `{"builtin": "<name>"}` and the body editor is read-only with an explanation and a link to `docs/rules/BUILTINS.md` ([S05.T06](T06-builtins-escape-hatch.md)). The params form is empty, because builtins take no params.
- **A lint warning the user disagrees with.** "Ignorar" records the acknowledgement so it stops appearing for that text; the count of acknowledged warnings is shown on the coverage page, because a growing pile of dismissed suspicions is itself a signal.

## Acceptance / verification

- [ ] `pnpm --filter web test rules-editor.spec.tsx` green, including `> the save button is disabled while the printings panel is loading` and `> the panel lists all printings with copies` (BR-S05.T13-08).
- [ ] End-to-end: author a new text — open an uncovered text from `/rules`, add two codes, fill their params in the generated form, save, run its scenario from the page, and see the evidence chip turn green with the engine build shown (the acceptance the original file asked for).
- [ ] `api.spec.ts > a list whose third item fails validation leaves the stored list unchanged` and `> the response carries the recomposed program` (BR-S05.T13-01).
- [ ] `rules-editor.spec.tsx > a number slot with maximum 12 rejects 99 in the form` and `api.spec.ts > the same value is rejected server-side` (BR-S05.T13-02).
- [ ] `lint.spec.ts > the six rules fire on their fixtures and stay silent on the corrected ones` — using the legacy's own cases: the Paralyzed-without-a-coin text (Erika's Tangela), "for each Grass Energy" with an untyped counter (Mega Meganium ex), "You may discard 3 Metal Energy" run unconditionally (Metagross), "discarded in this way" counting the whole pile (Heatran), a card with an ability and no ability code, and an attack with text and no codes (BR-S05.T13-06).
- [ ] `api.spec.ts > a save with three lint warnings succeeds` — the lint never blocks (BR-S05.T13-06).
- [ ] `rules-editor.spec.tsx > the evidence chip stays neutral until the job finishes` and `api.spec.ts > the run endpoint creates a job and returns its id` (BR-S05.T13-04).
- [ ] `api.spec.ts > there is no rename route` and `> deleting a referenced code returns 409 with the usage count` (BR-S05.T13-07).
- [ ] `api.spec.ts > a save returns the new snapshot and the stale counts`, and `rules-editor.spec.tsx > the stale banner names the affected copies` (BR-S05.T13-05).
- [ ] `rules-editor.spec.tsx > promoting a code to exact shows the copies it affects and requires confirmation` (BR-S05.T13-09).
- [ ] `pnpm check` greps `apps/web` and finds no import of the composition module and no hard-coded UI string; `rules-editor.spec.tsx > no raw op name appears in the rendered output` (BR-S05.T13-03, -10).
- [ ] A keyboard-only walkthrough authors one text end to end (search, open, add code, fill params, reorder, save, run) with no mouse, recorded in the completion note.

## Risks and open questions

- **Risk — the filter and condition builders are the whole cost of this subtask** and are easy to underestimate. They are nested, recursive editors over a closed vocabulary. Mitigation: build them in step 5, before any editing exists, against two concrete fixtures; if they slip, the raw-JSON escape hatch keeps the screen usable while they land.
- **Risk — the editor becomes the only way to author**, and bulk work (hundreds of long-tail texts) is painful one form at a time. Mitigation: the spreadsheet round trip ([S05.T08](T08-spreadsheet-import.md)) is the bulk path and the editor is the precision path; the "Repontar usos" action is the bridge for shared codes. This division should be stated in the UI copy so the user knows which tool to reach for.
- **Risk — optimistic feedback creeps in** because polling a job feels slow. Mitigation: BR-S05.T13-04 and its test. A green light that is not an evidence row is the legacy's "three notions of correct" returning through the front door.
- **Risk — the conflict check (two tabs) is skipped as over-engineering** and authoring work is lost. Mitigation: it is one field on the request and one comparison on the server; it is specified here so it is not dropped as an afterthought.
- **Question — should the editor be able to create a code from scratch, or only from a successor?** It can: `PUT /api/rules/codes/:code` on an unused name creates one. The risk is a base full of near-duplicate codes authored ad hoc. Recommendation: the create form warns when an existing code's pattern is a close match and offers to reuse it, which is the same near-duplicate machinery [S05.T02](T02-effect-texts-and-card-parts.md) builds for texts. The user decides how aggressive that nudge should be.
- **Question (D-004 semantics) — should the editor let the user edit `params_schema_json`?** It does, on the code page, because a code's schema is part of its definition. But a schema change can invalidate the params of every text using the code. Recommendation: the save runs `validateParams` over every usage and refuses with the list of texts that would break, which is stricter than the database requires. The user confirms that refusing is better than warning.
- **DEPENDENCY-PROPOSAL: S05.T13 should depend on S05.T02 because** the text page reads `effect_texts`, `card_parts` and `splitSentences` directly for its "Texto oficial" and "Impressões" panels; today it reaches them only transitively through [S05.T07](T07-rule-codes-composition-semantics.md) and [S05.T12](T12-evidence-and-coverage-metrics.md).

## References

- `pokemon/src/pokesearch/sim/lint.py` — verified: the module docstring (*"regras determinísticas e baratas que teriam pegado os erros que a amostra da IA achou"*, and the false-alarm argument), `RULE_LABEL` with its seven rules, the regexes `_COIN = r"\bflip (a|\d+) coins?\b"`, `_OPTIONAL = r"\byou may (discard|shuffle|put|move|attach|switch|return)\b"`, `_THIS_WAY = r"\bdiscarded in this way\b"`, `_TYPED_ENERGY`, the `_walk` traversal over `Seq`/`ChooseOne`/`CoinThen`/`IfCan`, `_has_coin`, `_is_optional`, `check_attack`, `check_pokemon` (using `ABILITY_FIELDS`), and `summarize` ordering by meta copies. Consult for the six rules carried over and for the one that is not.
- `pokemon/tests/test_lint.py` — verified: one positive and one negative case per rule, with the real cards behind them (Erika's Tangela's forgotten coin, Mega Meganium ex's untyped energy counter, Metagross's mandatory "you may", Heatran's "discarded in this way", the 54 cards with an ability and no ability field), plus the regression test listing the fifteen corrected cards. Consult for the lint fixtures.
- `pokemon/src/pokesearch/api/routes_sim.py` — verified: the legacy screens `GET /sim/cards` (coverage dashboard), `GET /sim/audit` (attribute and LLM verdicts, with `POST /sim/audit/run`), `GET /sim/card/{engine_id}` (one card's parts and evidence), `GET /sim/cards/{name_key}/source` (the recipe's Python source, read-only) and `POST /sim/cards/{name_key}/review` (a status flip, the only write). Consult for what the legacy could and could not do, and for the per-card layout this page replaces.
- `pokemon/src/pokesearch/sim/cardfilters.py` — verified: `describe()` and the `.desc` strings that make a filter readable, and its fallback for an anonymous lambda. The reason the filter builder renders pt-BR through `describe()` rather than showing JSON.
- [S05.T07](T07-rule-codes-composition-semantics.md) (the composition contract, the error taxonomy, `validateParams`, `explain()`), [S05.T12](T12-evidence-and-coverage-metrics.md) (evidence, staleness, `GET /api/rules/coverage/text/:hash`), [S05.T03](T03-effect-ir-vocabulary.md) (`describe(node, locale)` and the closed vocabularies the builders enumerate), [S05.T04](T04-ir-compiler-and-vm.md) (`Program::disassemble()`), [S01.T08](../01-foundation/T08-web-skeleton.md) (the shell, the router and the strings module).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
