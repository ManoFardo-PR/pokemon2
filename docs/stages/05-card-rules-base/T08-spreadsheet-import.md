# S05.T08 — Spreadsheet import (sentences and codes)

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 8 / 16 |
| Depends on | [S05.T02](T02-effect-texts-and-card-parts.md), [S05.T07](T07-rule-codes-composition-semantics.md) |
| Unblocks | — |
| Parallel with | [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `effect_texts`, `card_parts` and `textHash` — from [S05.T02](T02-effect-texts-and-card-parts.md)
- `doc` composition contract + `validateParams` — from [S05.T07](T07-rule-codes-composition-semantics.md)
- `file` `pokemon/data/reports/cartas_standard.xlsx` (sheets: 2,950 cards × 38 columns; 13,004 rows id → texts; ~1,636 distinct sentences with 7 classification columns)
- `external` verified workbook shape (read-only inspection of `xl/workbook.xml` and the sheet dimensions, 2026-09-22): seven sheets — `cartas_standard` `A1:AL2950`, `cartas_standard (2)` `A1:AL2950`, `cartas_standard (6)` `A1:E11809`, `Planilha8` `A1` (empty), `cartas_standard (3)` `A1:H13008`, `cartas_standard (4)` `A1:H1637`, `cartas_standard (5)` `A1:H1637`; the seven classification columns are `B`–`H` of sheets `(4)` and `(5)` and are **currently empty**

## Outputs (proposed)
- `script` `pnpm rules:import-xlsx <file>` — reads the sheets (no Excel needed; SheetJS or a zip+XML reader), links each sentence to its `text_hash` and ordinal, writes `text_sentences.classification_json` from the 7 columns, and when a column holds a code known in `rule_codes` writes `text_codes` with the parsed params; idempotent; report of unmatched sentences and unknown codes
- `doc` `docs/rules/SPREADSHEET.md` — proposed column names for the 7 classification columns: `part_kind, code, primary_op, params, condition, target, notes`, plus the sentence-splitting rules so future exports match `text_sentences` splitting
- `script` `pnpm rules:export-xlsx` — the round trip: writes a workbook with the same sheets, the proposed header row, every sentence linked to its `text_hash`, the current codes and params filled in, and the meta-copy weight per sentence, so the user authors against a sheet that already knows what the database knows

## Initial objective
The work already done in the spreadsheet lands in the rules tables without retyping, and the spreadsheet keeps being a valid authoring surface because its columns and splitting rules are aligned with the database.

## Context

The spreadsheet is the user's own authoring surface and the reason D-004 exists. It has to keep working after the import, which means the import is a bridge in both directions, not a one-off load.

A read-only inspection of the workbook (its zip entries and sheet dimensions; the file was never opened in Excel) gives the exact shape, and one fact in it changes how this subtask should be planned. **The seven classification columns are reserved but empty.** Sheets `cartas_standard (4)` and `cartas_standard (5)` are both `A1:H1637` with no header row: column A holds the deduplicated sentence (about 1,578 and 1,574 non-blank cells respectively, out of 1,637 rows), and columns B through H — the seven the brief refers to — carry no values at all. The classification work has a place to go and has not started.

That is not a problem; it is the schedule. It means the first run of `rules:import-xlsx` imports **sentences**, not codes: it links each of the ~1,578 deduplicated sentences to the `effect_texts` rows that contain it, writes `text_sentences`, and produces a report of what it could not match. It writes few or no `text_codes` rows, and it should say so plainly rather than reporting a near-zero import as a failure. The value of that first run is the linkage and the report — which sentences resolve, which do not, and which are worth the user's attention first, ordered by meta copies. The second half of the subtask, `rules:export-xlsx`, is what makes the surface usable: it writes the workbook back with a header row, the `text_hash` beside each sentence, the codes and params already known from the other two importers ([S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md)), and the meta-copy weight, so the user fills the columns where they matter most and re-imports.

The other sheets carry the supporting data. `cartas_standard` and `cartas_standard (2)` are two copies of the same 38-column card export (id, name, supertype, subtypes, stage, hp, types, evolves_from/to, regulation_mark, set_id/code/name, series, number, release_date, rarity, ability1_type/name/text, attack1/2_name/cost/energy_count/damage/text, weakness, resistance, retreat_cost, rules_text, pokedex_numbers, artist, flavor_text, image_url). **None of it is imported.** Every one of those facts comes from the ETL, from the two sources, with both raw documents preserved (RN-01, D-003); importing card attributes from a spreadsheet would create a fourth source of truth. The card sheets are used for exactly one thing: a cross-check report saying which of the 2,949 rows no longer matches the loaded `cards` table, which is how a stale export becomes visible.

`cartas_standard (3)` (`A1:H13008`, columns `id, ability1_text, attack1_text, attack2_text, rules_text`) is the id → text index. It is what turns an ambiguous sentence back into a text: a sentence like "Then, shuffle your deck." appears in hundreds of texts, and this sheet says which printings carry which text. `cartas_standard (6)` (`A1:E11809`) is the raw sentence list before deduplication — the provenance of the ~1,578 distinct ones. `Planilha8` is empty and is ignored.

The last piece is **splitting**. `text_sentences` is written by this subtask, and its split must agree with the spreadsheet's or the linkage fails on every multi-sentence text. The legacy's CSV on disk was overwritten with a naive split that produced truncated fragments, which is why the instruction is to read the xlsx and not the csv. The rules are fixed here, in `docs/rules/SPREADSHEET.md`, and both the importer and the exporter use the same function.

## Scope

- **In scope.** `packages/db/src/rules/xlsx.ts` (a dependency-light reader over the zip + `sharedStrings.xml`, or SheetJS if the licence check in [S01.T09](../01-foundation/T09-licensing-and-notice.md) clears it); `splitSentences(text)` and its rule set; `pnpm rules:import-xlsx` with its matching, its writes and its report; `pnpm rules:export-xlsx`; `docs/rules/SPREADSHEET.md`; the card-sheet cross-check report; the fixtures (a small workbook committed under `packages/db/fixtures/`).
- **Out of scope.** Authoring any classification — that is the user's work, and this subtask only gives it somewhere to land. Deriving texts and parts ([S05.T02](T02-effect-texts-and-card-parts.md)); the composition contract and `validateParams` ([S05.T07](T07-rule-codes-composition-semantics.md)); importing the two legacy artefacts ([S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md)); coverage ([S05.T12](T12-evidence-and-coverage-metrics.md)); the editor ([S05.T13](T13-rules-editor-ui.md)); the git seed ([S05.T15](T15-rules-export-import-seed.md)); anything about card attributes, which come from the ETL.

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S05.T08-01 | The import never writes a card attribute. `cards`, `attacks`, `abilities`, `sets` and every other ETL-owned table are read-only to this script; the card sheets produce a report and nothing else. | `xlsxImport` opens no write statement against an ETL table; the import runs inside a transaction that only touches `text_sentences` and `text_codes` | `xlsx.spec.ts > the import writes only text_sentences and text_codes` (statement capture); `pnpm check` greps the module for writes to ETL tables |
| BR-S05.T08-02 | The import never deletes or overwrites a hand-authored row. A `(text_hash, ordinal)` slot already occupied in `text_codes` is left alone and reported as a conflict with both values. | the `INSERT … ON CONFLICT DO NOTHING` plus a pre-pass that collects conflicts | `xlsx.spec.ts > an occupied ordinal is reported, not overwritten` |
| BR-S05.T08-03 | The import is idempotent: running it twice on an unchanged workbook produces identical rows and a report with zero writes on the second run. | delete-then-insert of `text_sentences` per `text_hash`; insert-if-absent for `text_codes`; a content hash of the workbook recorded in the report | `xlsx.spec.ts > importing the fixture twice writes nothing the second time` |
| BR-S05.T08-04 | `splitSentences` is the single splitter: the importer, the exporter and [S05.T13](T13-rules-editor-ui.md) all call it, and its rules are written in `docs/rules/SPREADSHEET.md`. A sentence produced by the spreadsheet that the splitter would not produce is a reported mismatch, never a silent re-split. | one exported function; the mismatch branch in the matcher | `split.spec.ts > the 30 committed cases`; `xlsx.spec.ts > a sentence that does not appear in any split is reported with its nearest match` |
| BR-S05.T08-05 | A sentence matching no `text_hash` is reported with the card ids that contain it (resolved through `cartas_standard (3)`) and is not written anywhere. | the unmatched branch of the matcher; the report's `unmatched[]` carries `{ sentence, nearestTextHash, distance, cardIds }` | `xlsx.spec.ts > an invented sentence lands in unmatched with candidate card ids` |
| BR-S05.T08-06 | A `code` cell naming a code absent from `rule_codes` is reported, not created. The importer never invents a code, because a code without a body, a schema and a status is not a code. | the `unknownCodes[]` branch; no `INSERT INTO rule_codes` anywhere in the module | `xlsx.spec.ts > an unknown code is reported and no rule_codes row is created` |
| BR-S05.T08-07 | A `params` cell that does not validate against the code's `params_schema_json` is reported with the field name and the row, and no `text_codes` row is written for it. | `validateParams` from [S05.T07](T07-rule-codes-composition-semantics.md), called per cell before the insert | `xlsx.spec.ts > params failing the schema are reported with the field name and the sheet row` |
| BR-S05.T08-08 | Every written `text_sentences` row carries its provenance: the sheet name, the 1-based row number and the workbook's content hash, inside `classification_json.source`. | the `source` object built by the reader | `xlsx.spec.ts > every imported row records sheet, row and workbook hash` |
| BR-S05.T08-09 | `rules:export-xlsx` round-trips: exporting the current database and re-importing the result changes nothing. | the exporter writes the same splitter's sentences and the same `(code, params)` pairs the importer reads | `xlsx.spec.ts > export then import is a no-op` (zero writes reported) |
| BR-S05.T08-10 | The card sheets are checked, not trusted: the cross-check report lists rows whose `id` is absent from `cards` and rows whose `ability1_text`/`attack1_text`/`attack2_text`/`rules_text` differ from the loaded card, so a stale export is visible before it misleads anyone. | the `cardDrift[]` section of the report, comparing on `normText` from [S05.T02](T02-effect-texts-and-card-parts.md) | `xlsx.spec.ts > a fixture row with an edited attack text appears in cardDrift` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `cartas_standard.xlsx` | R | script (`rules:import-xlsx`) | on demand | opened as a zip; never written; never opened by Excel | the file stays in the legacy tree |
| `effect_texts` | R | script | matching every sentence | read-only; matched on `text_norm` containment and on the split | [S05.T02](T02-effect-texts-and-card-parts.md) |
| `card_parts`, `cards` | R | script | resolving a sentence's candidate printings for the report | read-only | BR-S05.T08-01 |
| `rule_codes` | R | script | validating a `code` cell and its params | read-only; an unknown code is reported | BR-S05.T08-06 |
| `text_sentences` | C/D | script (`rules:import-xlsx`) | every run | delete-then-insert per `text_hash`, in one transaction per 500 texts | BR-S05.T08-03 |
| `text_codes` | C | script (`rules:import-xlsx`) | when a `code` cell names a known code and its params validate | insert into a free `(text_hash, ordinal)` slot only; conflicts reported | BR-S05.T08-02 |
| `text_codes`, `rule_codes`, `text_sentences` | R | script (`rules:export-xlsx`) | writing the workbook back | read-only | BR-S05.T08-09 |
| `<out>/cartas_standard.export.xlsx` | C | script (`rules:export-xlsx`) | on demand | written outside the legacy tree by default (`$DATA_DIR/exports/`) | the user copies it where they want |
| `<out>/import-report.json` | C | script | every import run | always written, even on a clean run | the artefact the user reads |
| `cards`, `attacks`, `abilities`, `sets`, `price_history` | — | this subtask | never written | the ETL owns them (D-003, RN-01) | BR-S05.T08-01 |
| `rule_evidence` | — | this subtask | never | a classification is not evidence (RN-63) | [S05.T12](T12-evidence-and-coverage-metrics.md) |

## Interfaces

**Sheet-to-table mapping**, with the verified dimensions.

| Sheet | Dimension | Content | Imported into | Notes |
|---|---|---|---|---|
| `cartas_standard` | `A1:AL2950` | header row + 2,949 cards × 38 columns (`id, name, supertype, subtypes, stage, hp, types, evolves_from, evolves_to, regulation_mark, set_id, set_code, set_name, series, number, release_date, rarity, ability1_type, ability1_name, ability1_text, attack1_name, attack1_cost, attack1_energy_count, attack1_damage, attack1_text, attack2_name, attack2_cost, attack2_energy_count, attack2_damage, attack2_text, weakness, resistance, retreat_cost, rules_text, pokedex_numbers, artist, flavor_text, image_url`) | **nothing** | cross-check report only (BR-S05.T08-10) |
| `cartas_standard (2)` | `A1:AL2950` | a second copy of the same export | **nothing** | compared with sheet 1; a difference is reported so the user knows which is current |
| `cartas_standard (3)` | `A1:H13008` | header row + 13,007 rows `id, ability1_text, attack1_text, attack2_text, rules_text` (`F`–`H` unused) | **nothing directly** | the id → text index used to resolve an ambiguous sentence to its printings |
| `cartas_standard (6)` | `A1:E11809` | 11,808 raw sentences in column A, no header | **nothing directly** | provenance: the "before dedup" list; used to report how many raw occurrences a deduplicated sentence stands for |
| `cartas_standard (4)` | `A1:H1637` | 1,637 rows, no header; `A` = deduplicated sentence (~1,578 non-blank); `B`–`H` = the seven classification columns, **currently empty** | `text_sentences` (+ `text_codes` when `C`/`E` are filled) | the authoring sheet |
| `cartas_standard (5)` | `A1:H1637` | same shape (~1,574 non-blank in `A`), **`B`–`H` empty** | same | a second pass over the same list; the importer merges both and reports cells where they disagree |
| `Planilha8` | `A1` | empty | — | ignored |

**The seven classification columns**, proposed names and positions. `rules:export-xlsx` writes this as row 1 of sheets `(4)` and `(5)`, which is the only change it makes to their shape.

| Col | Name | Meaning | Values | Example |
|---|---|---|---|---|
| A | `sentence` | the deduplicated sentence (unchanged) | free text | `Flip a coin for each Fire Energy attached to this Pokémon.` |
| B | `part_kind` | where the sentence occurs | `ability` `attack` `trainer` `energy` `rule_box` | `attack` |
| C | `code` | the `rule_codes` code this sentence maps to | `UPPER_SNAKE`, must exist | `COIN_FLIPS_PER_COUNTER` |
| D | `primary_op` | the dominant IR op or hook, for grouping and for the queue | an IR op, hook or `noop` | `for_each` |
| E | `params` | the per-card parameters | JSON object, or `k=v; k=v` shorthand | `{"counter":{"energy_count":{"slot":"self","type":"Fire"}}}` |
| F | `condition` | the guard the sentence carries, if any | a `Cond` as JSON, or prose while drafting | `exists(in_play(hook_owner), tag=tera)` |
| G | `target` | who or what the sentence acts on | a Selector name, or prose while drafting | `self` |
| H | `notes` | ruling, doubt, or a reason the sentence is hard | free text | `printed 80×, so offset = 1` |

Two of the seven are load-bearing (`code` and `params`); the other five are the user's working notes and are stored verbatim in `text_sentences.classification_json` whatever they contain. `D`, `F` and `G` are read as hints by the authoring queue ([S05.T14](T14-coverage-page-and-authoring-queue.md)) and are never parsed into behaviour — prose in them is fine and expected while drafting. This split matters: it means the user can fill the sheet in any order and only `C` and `E` change the database.

**`params` shorthand.** A cell may hold JSON, or the shorthand `n=2; filter=is_basic & hp<=70`, which `parseParamsCell` expands using a small, documented grammar (`&` for `all_of`, `|` for `any_of`, `!` for `not`, `<=`/`>=` for the bounded filters, bare words for the enum filters). The shorthand exists because typing JSON into a spreadsheet cell is miserable; the JSON form is always accepted and is what the exporter writes back. Anything the shorthand cannot express is written as JSON.

**Sentence splitting** — `splitSentences(text): string[]`, the rules `docs/rules/SPREADSHEET.md` fixes:

1. Split after `.`, `!` or `?` followed by whitespace and an uppercase letter, a digit or `(`.
2. Never split inside parentheses; a sentence that opens a parenthesis runs to its close.
3. A sentence consisting only of a parenthetical (`(Pokémon ex, Pokémon V, etc. have Rule Boxes.)`, `(Apply Weakness as ×2.)`, `(Damage from attacks is still taken.)`) attaches to the **previous** sentence; when it is the first, it stands alone.
4. Abbreviations never split: `ex.`, `No.`, `vs.`, `etc.`, `Mr.`, `Jr.`, `Sr.`, and a single capital letter followed by `.`.
5. Energy symbols (`[G]`, `{C}`) and a `.` inside a number (`3.0`) never split.
6. Whitespace is collapsed and the result trimmed; an empty fragment is dropped.
7. The output is stable: `splitSentences(normText(t))` and `splitSentences(t)` yield the same list, so a hash-normalized text and a raw one agree.

**CLI.**

```
pnpm rules:import-xlsx <file> [--sheets 4,5] [--dry-run] [--report <path>] [--json]
pnpm rules:export-xlsx [--out <path>] [--format standard] [--only-uncovered]
```

`import-xlsx` exit codes: 0 ok, 1 there are unmatched sentences or unknown codes (the report says how many), 2 the file is unreadable or is not a workbook, 3 the two authoring sheets disagree on a cell. `--dry-run` produces the report and writes nothing.

**Report shape** (`import-report.json`), the artefact the user actually reads:

```ts
interface XlsxImportReport {
  workbookHash: string; ranAt: string; dryRun: boolean;
  sheets: { name: string; dimension: string; rows: number; used: boolean }[];
  sentences: { total: number; matched: number; unmatched: number; ambiguous: number };
  written:   { textSentences: number; textCodes: number };
  unmatched: { sentence: string; rawOccurrences: number; nearestTextHash: string | null;
               distance: number; cardIds: string[]; metaCopies: number }[];
  unknownCodes: { code: string; sheet: string; row: number; sentence: string }[];
  badParams:   { code: string; field: string; detail: string; sheet: string; row: number }[];
  conflicts:   { textHash: string; ordinal: number; existing: string; incoming: string }[];
  sheetDisagreements: { row: number; column: string; inSheet4: string; inSheet5: string }[];
  cardDrift:   { id: string; column: string; inSheet: string; inDatabase: string | null }[];
  topUnclassified: { sentence: string; metaCopies: number; texts: number }[];   // the queue, by value
}
```

`topUnclassified` is the point of the first run: the sentences that matched a text, carry no code, and cover the most meta copies. It is the same ordering the authoring queue uses ([S05.T14](T14-coverage-page-and-authoring-queue.md)) and it is what turns "1,578 sentences" into "these forty are worth an afternoon".

## Implementation steps

1. Write `packages/db/src/rules/xlsx.ts`: open the zip, parse `xl/workbook.xml` for the sheet names and relationship ids, parse `xl/sharedStrings.xml` once, and stream one sheet's rows at a time. Spec it against the committed fixture workbook.
2. Write `splitSentences` with the seven rules and the 30 committed cases, including the three parenthetical examples taken verbatim from the workbook's own sheet `(4)`.
3. Write the matcher: for each deduplicated sentence, find the `effect_texts` rows whose split contains it, and record `matched` / `ambiguous` / `unmatched`. Use `cartas_standard (3)` to attach candidate card ids to the unmatched ones.
4. Write `text_sentences` for every matched text (delete-then-insert per `text_hash`), with `classification_json` carrying all seven columns plus the `source` provenance.
5. Add the `code` and `params` path: `parseParamsCell`, `validateParams`, insert into free `text_codes` slots, collect `unknownCodes`, `badParams` and `conflicts`.
6. Add the sheet `(4)` / `(5)` merge with disagreement reporting, and the card-sheet cross-check.
7. Write the report, `--dry-run` and the exit codes; wire `pnpm rules:import-xlsx`.
8. Write `docs/rules/SPREADSHEET.md`: the sheet map, the seven column names with their values, the `params` shorthand grammar, the splitting rules, and the round-trip instructions.
9. Write `pnpm rules:export-xlsx` producing the same seven sheets with a header row on `(4)` and `(5)`, `text_hash`, meta copies and the currently known `(code, params)` filled in; spec the round trip.
10. Run the real import against the current workbook, record the report numbers in the subtask's completion note, and hand the user the top-40 `topUnclassified` list.

## Edge cases and error handling

- **The seven classification columns are empty** (the state today). The run reports `written.textCodes = 0` and a full `topUnclassified` list, and exits 0 — an import with nothing to import is a successful import. The acceptance below therefore measures *linkage*, not codes.
- **A sentence matching no text hash.** Reported with its nearest text by edit distance, the raw occurrence count from sheet `(6)`, and the candidate card ids from sheet `(3)`. Nothing is written. The usual cause is a text that changed upstream after the export, which the `cardDrift` section confirms.
- **A sentence matching hundreds of texts** — "Then, shuffle your deck." The sentence is written into `text_sentences` for every one of them (it genuinely occurs in all of them) and its classification applies to all of them. That is the point of a deduplicated sentence list and it is the largest single saving in the whole stage.
- **A sentence appearing twice inside one text.** Both occurrences get a `text_sentences` row with their own ordinal, and the classification applies to both. The importer writes the code into the first free ordinal for each, and reports it once.
- **Sheets `(4)` and `(5)` disagree on a cell.** Exit 3 with the row, the column and both values. The importer does not guess which pass is newer; the user resolves it and re-runs. A blank in one sheet and a value in the other is not a disagreement — the value wins.
- **A `params` cell whose JSON is malformed** or whose shorthand does not parse. Reported in `badParams` with the sheet row and the parser's message; no `text_codes` row is written for that sentence, and the rest of the import proceeds.
- **A `code` cell holding prose** ("draw N cards"). Reported in `unknownCodes`. The importer never creates a `rule_codes` row, because a code needs a body, a schema and a status, and those are authored in [S05.T13](T13-rules-editor-ui.md) or seeded by [S05.T07](T07-rule-codes-composition-semantics.md).
- **An occupied `(text_hash, ordinal)` slot.** Reported in `conflicts` with both the existing and the incoming code; nothing is overwritten. This is how a hand-authored code survives a re-import of an older sheet.
- **A workbook with a sheet renamed or added.** The reader resolves sheets by name and reports any sheet it does not recognise as `used: false`; an unknown sheet is ignored, never guessed at. A *missing* expected sheet exits 2.
- **The workbook is open in Excel.** The file is read through the zip with a shared read; if the lock file blocks it, exit 2 with the path and the suggestion to close it. The script never writes to the source.
- **The card sheets are stale.** `cardDrift` lists every row whose text no longer matches the loaded card. Nothing is imported from them either way; the report exists so that an unmatched sentence can be explained rather than investigated twice.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/db test xlsx.spec.ts` green, including `> the reader parses the fixture workbook's seven sheets with their dimensions`.
- [ ] `split.spec.ts > the 30 committed cases` pass, including `(Apply Weakness as ×2.)` and `(Damage from attacks is still taken.)` attaching to the previous sentence, `ex.`/`No.` not splitting, and `splitSentences(normText(t)) === splitSentences(t)` for the whole Standard text corpus (BR-S05.T08-04).
- [ ] `pnpm rules:import-xlsx pokemon/data/reports/cartas_standard.xlsx --dry-run --json` runs against the real workbook, exits 0 or 1, and reports ≥ 95 % of the ~1,578 deduplicated sentences matched to an existing `text_hash`; the unmatched ones are listed with their candidate card ids and their meta copies (BR-S05.T08-05).
- [ ] The same command without `--dry-run` writes `text_sentences` for every matched text and zero `text_codes` (columns `C`/`E` being empty today), and the report's `topUnclassified` lists the forty highest-value sentences.
- [ ] `xlsx.spec.ts > importing the fixture twice writes nothing the second time` — the second report shows `written.textSentences = 0, written.textCodes = 0` (BR-S05.T08-03).
- [ ] `xlsx.spec.ts > the import writes only text_sentences and text_codes` — a statement capture over a full fixture run finds no write to an ETL table (BR-S05.T08-01).
- [ ] `xlsx.spec.ts > an occupied ordinal is reported, not overwritten`; `> an unknown code is reported and no rule_codes row is created`; `> params failing the schema are reported with the field name and the sheet row` (BR-S05.T08-02, -06, -07).
- [ ] `xlsx.spec.ts > export then import is a no-op` — `rules:export-xlsx` followed by `rules:import-xlsx` on the result reports zero writes (BR-S05.T08-09).
- [ ] `xlsx.spec.ts > a fixture row with an edited attack text appears in cardDrift`, and the real run's `cardDrift` count is recorded in the completion note (BR-S05.T08-10).
- [ ] `docs/rules/SPREADSHEET.md` exists with the sheet map, the seven column names, the `params` shorthand grammar and the seven splitting rules, and `pnpm rules:export-xlsx` produces a workbook whose sheets `(4)` and `(5)` carry that header row.

## Risks and open questions

- **Risk — the import is planned as a code import and delivers a sentence import**, and the stage's coverage expectations are built on codes that do not exist yet. This is the finding that matters most in this file. Mitigation: the acceptance measures linkage, the exporter makes the columns fillable with the database's help, and [S05.T09](T09-import-attack-effects-json.md) and [S05.T10](T10-import-catalog-recipes.md) — which import real codes from the legacy artefacts — are the subtasks the early coverage number should lean on.
- **Risk — the splitter and the spreadsheet disagree** on more than a handful of texts, and the 95 % linkage target is missed. Mitigation: the unmatched report names the nearest text with its edit distance, so a systematic disagreement shows up as a cluster with the same small distance and is fixed by one splitting rule rather than by 200 manual matches.
- **Risk — a spreadsheet reader dependency.** SheetJS's licence has to clear [S01.T09](../01-foundation/T09-licensing-and-notice.md). Mitigation: the fallback is the zip + XML reader described above, which is roughly 150 lines because the workbook uses only shared strings, inline strings and numbers — no formulas, no styles that matter, and a single `dimension` per sheet.
- **Risk — the user keeps authoring in the workbook while the database also changes**, and the two diverge. Mitigation: `rules:export-xlsx` is the reconciliation path and the round trip is asserted; `docs/rules/SPREADSHEET.md` states the workflow as export → fill → import, never fill-both-sides.
- **Question — which of sheets `(4)` and `(5)` is the authoring sheet?** They have the same shape, both are empty in `B`–`H`, and their column-A contents differ slightly (~1,578 vs ~1,574 non-blank). The importer merges both and reports disagreements, but the user should say which is current. Recommendation: keep `(4)` as the authoring sheet and let the exporter rewrite `(5)` as a read-only mirror with meta copies.
- **Question (D-004 semantics) — should the `params` column hold JSON or the shorthand?** Both are accepted and the exporter writes JSON. If the user prefers the shorthand, the exporter can be switched to write it, at the cost of a lossy round trip for the params the shorthand cannot express. The user decides.
- **Question (D-004 semantics) — should `primary_op`, `condition` and `target` ever become authoritative?** They are hints here. Making `condition` and `target` authoritative would let a sentence be coded without a `code` at all — a "code-free" classification that the importer assembles into an IR body — which is a genuinely different authoring model and a much bigger change. Recommendation: keep them as hints for now and revisit once a few hundred sentences are classified; the user owns this.

## References

- `pokemon/data/reports/cartas_standard.xlsx` — inspected read-only through its zip entries (`xl/workbook.xml`, `xl/sharedStrings.xml`, `xl/worksheets/sheet*.xml`), never opened in Excel. Verified: the seven sheet names and ids, the five `_FilterDatabase` ranges, the seven `<dimension>` values quoted under Inputs, the 38 header names of `cartas_standard` quoted in the mapping table, the header `id, ability1_text, attack1_text, attack2_text, rules_text` of `cartas_standard (3)`, the absence of a header row on `(4)`/`(5)`, and the emptiness of columns `B`–`H` on both.
- `pokemon/src/pokesearch/sim/verified.py` L123–136 — verified: the legacy's part definition, which is what `part_kind` in column `B` must agree with ([S05.T02](T02-effect-texts-and-card-parts.md) implements it).
- [Legacy reference map](../../project/06-legacy-reference-map.md) — the spreadsheet row (*"2,950 Standard cards × 38 columns; 13,004 id→text rows; parametrizing numbers/types shrinks ~1,574 sentences only to ~1,297 templates (long tail is real)"*) and the note that the deduplicated CSV on disk is a naive split with truncated fragments, which is why this subtask reads the xlsx.
- [S05.T07](T07-rule-codes-composition-semantics.md) — the composition contract, `validateParams`, the code-naming rules and the `params_schema_json` shape the `code`/`params` columns are checked against; [S05.T02](T02-effect-texts-and-card-parts.md) — `textHash`, `normText` and the parts the sentences attach to.
- [Decision log](../../project/02-decision-log.md) D-003 (the ETL is the only source of card facts, which is why the card sheets are not imported) and D-004 (the model this workbook is the authoring surface for).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
