# S05.T02 — Effect texts and card parts derivation

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 2 / 16 |
| Depends on | [S02.T06](../02-card-data-and-search/T06-load-cards.md), [S05.T01](T01-rules-schema-migration.md) |
| Unblocks | [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T08](T08-spreadsheet-import.md), [S05.T11](T11-legacy-tests-to-scenarios.md), [S05.T13](T13-rules-editor-ui.md) |
| Parallel with | [S05.T04](T04-ir-compiler-and-vm.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `cards` (`rules_json`, supertype), `attacks`, `abilities` and `norm()` — from [S02.T06](../02-card-data-and-search/T06-load-cards.md)
- `table` `effect_texts`, `card_parts` — from [S05.T01](T01-rules-schema-migration.md)
- `file` `pokemon/src/pokesearch/sim/verified.py` L123–136 (`_required`) — the legacy's definition of "a part with effect text"; read-only reference

## Outputs (proposed)
- `module` `packages/db/src/rules/texts.ts` — `textHash(kind, name, text)` = SHA-256 of `kind | norm(name) | normText(text)` (whitespace collapsed, curly quotes straightened, diacritics kept in card names inside text); `rebuildCardParts(db)` (idempotent, runs after every ETL load) — consumed by [S05.T08](T08-spreadsheet-import.md)
- `table` `effect_texts` (~1,100 distinct texts for Standard, ~5–6k for all sets) and `card_parts` populated
- `contract` part kinds: `ability` (idx = abilities.idx), `attack` (only attacks with non-empty text), `trainer` (rules text of Items/Supporters/Stadiums/Tools), `energy` (Special Energy text), `rule_box` (ex/V/Tera/ACE SPEC boilerplate — recorded but excluded from coverage)
- `script` `pnpm rules:rebuild-parts` — the CLI wrapper the ETL calls and a developer can run by hand, with a `--dry-run` diff of what would change

## Initial objective
Reprints that share the same wording share one effect text (and thus one code sequence), while printings with different wording are different texts — RN-05 by construction, with no per-card duplication of rules.

## Context

Everything else in this stage keys on a text hash, so this subtask decides what a text *is*. It runs after every card load and is the only writer of `effect_texts` and `card_parts`.

The legacy keyed rules on `name_key` — a normalized card name. That is wrong twice. It is wrong when two printings of one name carry different text: `sim/catalog.py` had to invent the escape hatch `"dunsparce@TEF-128"` for exactly one card, with the comment that Dunsparce is really two cards, "Trading Places" (JTG, four of every five meta copies) and "Dig" (TEF, the one the third-party engine shipped). It is wrong again when two *different* names carry identical text: `SearchDeck(F.is_basic, 1, to="bench")` was written once for Nest Ball and repeated for every other "search your deck for a Basic Pokémon and put it onto your Bench" card. `ESPECIFICACAO.md` §6.1 prices the first failure at 1.4 % of meta copies counted as covered when they were not. Keying on the printed wording fixes both directions at once, which is why RN-05 is listed as *kept by construction* rather than enforced by a check.

A **part** is a place on a printing that can carry an effect text, and the legacy already had the right definition (`verified.py::_required`): every ability, every attack *whose text is non-empty*, and one whole-card part for a Trainer or a Special Energy. Two things are added here. First, `rule_box` parts: the "Pokémon ex, Pokémon V, etc. have Rule Boxes", "You may play only 1 Supporter card during your turn" and "ACE SPEC: You can't have more than 1 ACE SPEC card in your deck" sentences that `cards.rules_json` mixes into the same array as the real effect. They are recorded — so the editor can show the full printed card and so the spreadsheet import has somewhere to put them — but `card_status` skips them, because they are engine rules, not card behaviour. Second, parts with **no** text are recorded with `text_hash = NULL` rather than omitted, so that "this printing has two attacks and neither has text" is a positive fact in the database instead of an absence, which is what makes `attr_only` evidence meaningful (RN-71, RN-72).

Normalization is where a hash design goes wrong quietly. `normText` must be aggressive enough that the same card printed twice with a different number of spaces hashes the same — Area Zero Underdepths is stored with two spaces after the first sentence in `sv8pt5-94` and four in `sv7-131` — and conservative enough that a real wording change never collapses. The rule adopted here: collapse all whitespace runs to one space, straighten curly quotes and dashes, strip a trailing period-space, and *stop there*. Case is preserved, diacritics are preserved, and energy symbols are preserved, because "Pokémon" versus "Pokemon" and `[L]` versus "Lightning" are exactly the kind of difference that `sim/lint.py` had to hunt down by hand in the third-party engine's card texts. The name component of the hash uses the project-wide `norm()` from [S02.T06](../02-card-data-and-search/T06-load-cards.md), because "Adrena-Brain" and "adrena brain" are the same ability in every source (the legacy's `verified.norm_part` did the same thing by stripping non-alphanumerics).

## Scope

- **In scope.** `packages/db/src/rules/texts.ts` (`textHash`, `normText`, `partsOf`, `rebuildCardParts`, `orphanTexts`); the `pnpm rules:rebuild-parts` CLI with `--dry-run` and `--format <fmt>`; the rule-box sentence classifier; the hook that makes the ETL call `rebuildCardParts` at the end of a load ([S02.T06](../02-card-data-and-search/T06-load-cards.md) owns the call site, this subtask owns the function); the fixture set and specs.
- **Out of scope.** Splitting a text into sentences and writing `text_sentences` ([S05.T08](T08-spreadsheet-import.md)); attaching codes to a text ([S05.T07](T07-rule-codes-composition-semantics.md)); deciding whether a text is covered ([S05.T12](T12-evidence-and-coverage-metrics.md)); the editor that shows texts ([S05.T13](T13-rules-editor-ui.md)); the schema itself ([S05.T01](T01-rules-schema-migration.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-05 | **Kept, by construction.** Effects match by exact printing text, not by name: a part's meaning is reached only through `text_hash`, and no table in the rules base is keyed by a card name. Two printings with identical wording share one `effect_texts` row; two printings of one name with different wording get two rows and can be coded differently. | `textHash(kind, name, text)` is the only key `card_parts` stores; `rule_codes` and `text_codes` have no name column ([S05.T01](T01-rules-schema-migration.md)) | `texts.spec.ts > two printings of Buddy-Buddy Poffin share one hash` (`sv8pt5-101`, `me1-167`, `me2pt5-184`); `> the two Dunsparce printings get different hashes` (Trading Places vs Dig) |
| RN-71 | **Kept.** A card is split into parts with text — each ability, each attack whose text is non-empty, and the single trainer or special-energy text — and a part with no text is recorded as such rather than omitted, so that "all parts have evidence" is decidable. | `partsOf(card)` follows `verified.py::_required`, plus `rule_box` parts and explicit `text_hash = NULL` rows | `texts.spec.ts > Dreepy yields two attack parts, both textless`; `> Drakloak yields one texted part (Recon Directive) and one textless (Dragon Headbutt)` |
| BR-S05.T02-01 | `textHash` is stable across runs, machines and processes: it is SHA-256 over `kind`, `norm(name)` and `normText(text)` joined by `0x1F`, lowercase hex, with no locale-dependent step. | `textHash` in `packages/db/src/rules/texts.ts`; no `toLocaleLowerCase`, no `Intl` | `texts.spec.ts > golden hashes` — a frozen fixture of 12 texts with their expected 64-char hashes; the test fails if normalization changes |
| BR-S05.T02-02 | `normText` collapses whitespace runs to one space, straightens `’ ‘ “ ” – —` and trims; it does **not** change case, strip diacritics, expand energy symbols or remove parentheses. | `normText` | `texts.spec.ts > Area Zero Underdepths printings sv8pt5-94 and sv7-131 hash equal` (two vs four spaces); `> "Pokémon" and "Pokemon" hash differently` |
| BR-S05.T02-03 | `rebuildCardParts(db)` is idempotent: running it twice with no card change produces byte-identical `card_parts` rows and inserts no new `effect_texts` row. | delete-then-insert per `card_id` inside one transaction; `INSERT … ON CONFLICT (text_hash) DO NOTHING` for texts | `texts.spec.ts > rebuildCardParts twice yields identical rows and an unchanged effect_texts count` |
| BR-S05.T02-04 | A `rule_box` part never affects coverage: it is stored with its hash and skipped by `card_status`. | the `part_kind <> 'rule_box'` filter in the view ([S05.T01](T01-rules-schema-migration.md)); the classifier that assigns the kind | `card-status.spec.ts > a Supporter whose only uncoded part is its rule box is exact` |
| BR-S05.T02-05 | Every sentence of `cards.rules_json` lands in exactly one part: a Trainer's or Special Energy's effect sentences in the `trainer`/`energy` part, the boilerplate in the `rule_box` part, and nothing is dropped. | `partsOf` partitions the array; a counter asserts `effect_sentences + rule_box_sentences = rules_json.length` | `texts.spec.ts > every rules_json entry is accounted for` over the whole Standard fixture set |
| BR-S05.T02-06 | `rebuildCardParts` never deletes an `effect_texts` row. A text whose last part disappears becomes an orphan, reported by `orphanTexts(db)`, and keeps its codes. | no `DELETE FROM effect_texts` anywhere | `texts.spec.ts > removing a card leaves its text and codes in place and lists it as an orphan` |
| BR-S05.T02-07 | A part's `part_idx` equals the source index (`abilities.idx`, `attacks.idx`) and is stable across reloads, even though `attacks.id` and `abilities.id` are surrogate keys that change on every reload. | `partsOf` reads `idx`, never `id` — the contract [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) records for this subtask | `texts.spec.ts > a simulated reload keeps (card_id, part_kind, part_idx) identical while attacks.id changes` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `cards`, `attacks`, `abilities` | R | script (`rules:rebuild-parts`) | at the end of every ETL load and on demand | read-only; ordered by `card_id`, `part_kind`, `idx` for a deterministic pass | source of the parts |
| `effect_texts` | C | script (`rules:rebuild-parts`) | when a part's hash is not yet present | `INSERT … ON CONFLICT (text_hash) DO NOTHING`; `first_seen` set once and never rewritten | RN-05 |
| `effect_texts` | U | — | never by this subtask | wording is immutable; a change is a new hash | BR-S05.T02-06 |
| `effect_texts` | D | — | never | orphans are reported, not removed | BR-S05.T02-06 |
| `card_parts` | C/D | script (`rules:rebuild-parts`) | same run | delete-then-insert per `card_id`, all cards in one transaction per batch of 1,000 | BR-S05.T02-03 |
| `card_parts` | R | api, worker, script | editor, coverage view, authoring queue, exports | read-only | [S05.T12](T12-evidence-and-coverage-metrics.md)–[S05.T14](T14-coverage-page-and-authoring-queue.md) |
| `effect_texts` | R | script (`rules:import-xlsx`) | spreadsheet import | read-only; matched by `text_norm` and by hash | [S05.T08](T08-spreadsheet-import.md) |
| `text_codes`, `rule_codes` | — | this subtask | never | deriving parts never touches meaning | separation of concerns |
| `rule_evidence` | — | this subtask | never | evidence is written by the worker only | RN-64 |

**CLI.** `pnpm rules:rebuild-parts [--dry-run] [--format standard|all] [--card <id>] [--json]`. Exit codes: 0 ok, 1 an unclassifiable `rules_json` sentence was found (see edge cases), 2 the database is missing or locked. `--dry-run` prints `+N texts, +N/-N parts` per card and writes nothing.

## Interfaces

**`packages/db/src/rules/texts.ts`**

```ts
export type PartKind = "ability" | "attack" | "trainer" | "energy" | "rule_box";

/** Whitespace collapsed, curly quotes and dashes straightened, trimmed. Case, diacritics and
 *  energy symbols are preserved on purpose (BR-S05.T02-02). */
export function normText(text: string): string;

/** sha256( kind ‖ 0x1F ‖ norm(name) ‖ 0x1F ‖ normText(text) ), lowercase hex, 64 chars. */
export function textHash(kind: PartKind, name: string, text: string): string;

export interface DerivedPart {
  cardId: string;
  partKind: PartKind;
  partIdx: number;
  name: string;            // printed ability/attack name; "" for trainer | energy | rule_box
  text: string | null;     // null = part with no text ("exact by construction")
  textHash: string | null;
}

/** All parts of one printing, in a deterministic order: abilities by idx, attacks by idx,
 *  then the single trainer/energy part, then the rule_box part. */
export function partsOf(card: CardWithChildren): DerivedPart[];

export interface RebuildReport {
  cards: number; parts: number; textsInserted: number;
  partsAdded: number; partsRemoved: number; orphans: string[];
  unclassified: { cardId: string; sentence: string }[];
}
export function rebuildCardParts(db: Db, opts?: { format?: "standard" | "all"; cardId?: string; dryRun?: boolean }): RebuildReport;

/** Texts no card_parts row points at any more, with the number of codes they still carry. */
export function orphanTexts(db: Db): { textHash: string; kind: PartKind; name: string; codes: number }[];
```

**Part derivation rules**, in order:

| Source | `part_kind` | `part_idx` | `name` | `text` |
|---|---|---|---|---|
| `abilities` row | `ability` | `abilities.idx` | `abilities.name` | `abilities.text` (never empty in practice; empty ⇒ `NULL`) |
| `attacks` row with non-empty `text` | `attack` | `attacks.idx` | `attacks.name` | `attacks.text` |
| `attacks` row with empty/NULL `text` | `attack` | `attacks.idx` | `attacks.name` | `NULL` |
| `cards.supertype = 'Trainer'`, effect sentences of `rules_json` | `trainer` | 0 | `""` | the effect sentences joined by one space |
| `cards.supertype = 'Energy'` and `subtypes_json` contains `Special`, effect sentences | `energy` | 0 | `""` | as above |
| boilerplate sentences of `rules_json` | `rule_box` | 0 | `""` | the boilerplate sentences joined by one space |

**Rule-box classifier.** A sentence of `rules_json` is boilerplate when its normalized form starts with one of a closed list, kept in `RULE_BOX_PREFIXES`: `You may play only 1 Supporter card during your turn`, `You may play any number of Item cards during your turn`, `You may play only 1 Stadium card during your turn`, `You may attach any number of Pokémon Tools`, `ACE SPEC: You can't have more than 1 ACE SPEC card in your deck`, `You can't have more than 1 ACE SPEC card in your deck`, `When your Pokémon ex is Knocked Out, your opponent takes 2 Prize cards`, `When your Pokémon V is Knocked Out, your opponent takes 2 Prize cards`, `When your Pokémon VSTAR is Knocked Out, your opponent takes 2 Prize cards`, `You can't have more than 1 Radiant Pokémon in your deck`, `Prism Star … you can't have more than 1`, `Rule Box`. A parenthetical trailing gloss such as `(Pokémon ex, Pokémon V, etc. have Rule Boxes.)` stays attached to the effect sentence that precedes it, because it qualifies that sentence's filter (Brave Bangle's "doesn't have a Rule Box") rather than standing alone. Anything unmatched and not recognisable as an effect is reported as `unclassified` and exits 1; the list is closed on purpose so that a new boilerplate wording is a visible, one-line change.

**Worked hashes** (verified card texts from the legacy database; the hash values themselves are computed by the golden test, not asserted here):

| Printing(s) | kind | name | text (verbatim) | outcome |
|---|---|---|---|---|
| `sv8pt5-101`, `me1-167`, `me2pt5-184` | `trainer` | `""` | `Search your deck for up to 2 Basic Pokémon with 70 HP or less and put them onto your Bench. Then, shuffle your deck.` | one row, three `card_parts` |
| `sv8pt5-94`, `sv7-131`, `sv7-174` | `trainer` | `""` | `Each player who has any Tera Pokémon in play can have up to 8 Pokémon on their Bench. …` | one row (the two- vs four-space difference is normalized away) |
| `sv9-120` | `attack` | `Trading Places` | `Switch this Pokémon with 1 of your Benched Pokémon.` | shared with Azelf `bw10-38` and Cascoon `me2pt5-14` — same text, three names, one row |
| the TEF Dunsparce | `attack` | `Dig` | (no text) | `text_hash = NULL`; not comparable with `Trading Places` |
| `me5-104` | `trainer` | `""` | `If the Pokémon this card is attached to doesn't have a Rule Box, the attacks it uses do 30 more damage to your opponent's Active Pokémon ex (before applying Weakness and Resistance). (Pokémon ex, Pokémon V, etc. have Rule Boxes.)` | one `trainer` part; `rsv10pt5-80` adds the Tool boilerplate and the attach sentence, which split into `rule_box` and `trainer` — and its effect sentence differs (`Pokémon V` vs `Pokémon V_atk` in `me5-104`), so the two printings get **different** hashes |
| `sv8pt5-117` | `trainer` | `""` | `Attacks used by the Pokémon this card is attached to do 50 more damage to your opponent's Active Pokémon ex (before applying Weakness and Resistance).` | one `trainer` part plus one `rule_box` part carrying both ACE SPEC and Tool sentences |

The Brave Bangle row is the case worth reading twice: `me5-104` and `rsv10pt5-80` differ only inside the parenthetical gloss, which is not effect-bearing — and they still get two hashes, two rows and, in practice, the same code list applied twice. That is the cost of RN-05 and it is the right cost: the alternative is a normalizer that decides which parentheses matter, which is the decision this design refuses to make automatically. [S05.T13](T13-rules-editor-ui.md) offers "copy codes from a near-identical text" for exactly this.

## Implementation steps

1. Write `normText` and `textHash` with the golden-hash spec (twelve fixtures, expected hex strings committed); no database involved.
2. Write `partsOf` for Pokémon only (abilities and attacks, texted and textless) against fixture cards from `packages/db/fixtures/`.
3. Add the Trainer/Energy path and the `RULE_BOX_PREFIXES` classifier; assert the partition rule (BR-S05.T02-05) over the whole Standard fixture set.
4. Write `rebuildCardParts` with the per-card delete-then-insert, batched at 1,000 cards per transaction; assert idempotency.
5. Add `orphanTexts` and the `--dry-run` report; wire `pnpm rules:rebuild-parts`.
6. Run the real rebuild over the loaded Standard set; record the counts (`cards`, `parts`, distinct texts, orphans, unclassified) in the run report and compare with the ~1,100-text expectation.
7. Add the call at the end of the card load in [S02.T06](../02-card-data-and-search/T06-load-cards.md) and confirm a full ETL run finishes with the same counts as the manual run.
8. Run the rebuild over all sets (`--format all`), record the count and the time, and confirm that nothing in Standard changed.

## Edge cases and error handling

- **One card name, two printed texts.** The legacy Dunsparce: `sv9-120` has the attack "Trading Places" with text, the TEF printing has "Dig" with no text at all in our source. Two printings, different part names, different hashes, and the TEF printing's attack part carries `text_hash = NULL` — so it is exact by construction and the JTG one needs a code. Nothing in the schema can confuse them.
- **Two names, one text.** "Switch this Pokémon with 1 of your Benched Pokémon." is Azelf's, Dunsparce's and Cascoon's attack text. They share one `effect_texts` row and therefore one code list; coding it once covers all three printings. This is the saving that pays for RN-05.
- **Near-identical texts that differ in a gloss.** Brave Bangle `me5-104` and `rsv10pt5-80` (`Pokémon V_atk` versus `Pokémon V` inside the parenthetical). Two hashes. The rebuild reports pairs whose `text_norm` differs by fewer than five characters as `near-duplicates` so the authoring queue can group them; it never merges them.
- **Whitespace-only difference.** Area Zero Underdepths `sv8pt5-94` (two spaces) and `sv7-131` (four). `normText` collapses both; one row. Asserted directly.
- **An attack with a damage modifier but no text** (`Dig` on the old Diglett printings, `damage_text = '10'`, `text = NULL`). A part with `text_hash = NULL`. It contributes nothing to `exact` and is covered by `attr_only` evidence, exactly as the legacy's `Dreepy` case (`test_verified.py > test_card_without_effect_text_is_proven_and_untested_part_is_not`).
- **A `rules_json` sentence that matches no prefix and is not an effect** — a new boilerplate wording from a new rotation. `rebuildCardParts` records it as `unclassified`, leaves the part alone, and exits 1. The fix is one entry in `RULE_BOX_PREFIXES`; a silent fallback would quietly inflate or deflate coverage.
- **A Trainer whose `rules_json` is empty or missing.** No `trainer` part is created at all. That is different from an empty text: the printing simply has no effect text in the source, which is a data problem reported by the run, not a coverage claim.
- **A card reloaded with reordered attacks.** `part_idx` follows `attacks.idx`, which the loader derives from the source document's order, so a genuine reorder moves the codes. The rebuild reports `partsRemoved`/`partsAdded` per card, and a reorder shows up as a pair; the editor's text page lists every printing using a text, so the move is visible.
- **A hash collision.** SHA-256 truncated to nothing — the full 64 hex chars are stored. Not handled beyond the `CHECK (length(text_hash) = 64)`; a collision here is not a credible failure mode and pretending to handle it would be theatre.
- **`--format all` on a 20k-card database.** ~5–6k texts, roughly 30k parts. The run is batched and streams; if it exceeds a minute it is reported, not optimized speculatively.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/db test texts.spec.ts` green, including `> golden hashes` (twelve frozen fixtures with committed hex values) (BR-S05.T02-01).
- [ ] `texts.spec.ts > two printings of Buddy-Buddy Poffin share one hash` — `sv8pt5-101`, `me1-167` and `me2pt5-184` produce one `effect_texts` row and three `card_parts` rows (RN-05).
- [ ] `texts.spec.ts > the two Dunsparce printings get different hashes` — the JTG "Trading Places" part has a hash, the TEF "Dig" part has `text_hash = NULL`, and neither points at the other (RN-05).
- [ ] `texts.spec.ts > Area Zero Underdepths printings sv8pt5-94 and sv7-131 hash equal` and `> "Pokémon" and "Pokemon" hash differently` (BR-S05.T02-02).
- [ ] `texts.spec.ts > rebuildCardParts twice yields identical rows` — a second run reports `partsAdded = 0, partsRemoved = 0, textsInserted = 0` and the row bytes compare equal (BR-S05.T02-03).
- [ ] `texts.spec.ts > every rules_json entry is accounted for` over the Standard fixture set: for every card, `effect_sentences + rule_box_sentences = rules_json.length` and `unclassified` is empty (BR-S05.T02-05).
- [ ] `texts.spec.ts > a simulated reload keeps (card_id, part_kind, part_idx) identical while attacks.id changes` (BR-S05.T02-07).
- [ ] `pnpm rules:rebuild-parts --format standard --json` on the loaded database exits 0, reports ~1,100 distinct texts over 2,950 printings, zero `unclassified`, and the number is recorded in the run report so a later drift is visible.
- [ ] `texts.spec.ts > removing a card leaves its text and codes in place` — the text appears in `orphanTexts` with its code count and no `effect_texts` row was deleted (BR-S05.T02-06).
- [ ] A full `pnpm etl:load` run ends with `rebuildCardParts` having produced the same counts as the manual run, and `card_status` returns a row for every printing.

## Risks and open questions

- **Risk — `normText` is too aggressive and merges two genuinely different texts.** Mitigation: it does four mechanical things and nothing semantic; the golden-hash fixture fails loudly when any of them changes; and the near-duplicate report makes over-merging visible from the other direction. Do not add case folding or diacritic stripping to raise the merge rate.
- **Risk — the rule-box classifier misses a new boilerplate wording at rotation** and a boilerplate sentence lands in the `trainer` part, changing that text's hash for every printing and orphaning its codes. Mitigation: exit 1 on `unclassified`, and the near-duplicate report surfaces the old and new hash side by side so the codes can be repointed in one action.
- **Risk — an ETL wording correction silently orphans coded texts.** Mitigation: `orphanTexts` is part of the run report and is shown on the coverage page ([S05.T14](T14-coverage-page-and-authoring-queue.md)) with the meta copies that used to be covered, so a quiet regression has a number attached.
- **Question — should `rule_box` parts be stored at all?** They cost ~2,900 rows and buy two things: a complete printed card in the editor, and a place for the spreadsheet's boilerplate sentences to land instead of being reported as unmatched. Recommendation: keep them, excluded from coverage. The user decides whether the editor should show them at all.
- **Question (D-004 semantics) — should a Trainer's several effect sentences be one part or several?** They are one part here, matching the legacy's `WHOLE = "*"`, and the *sentences* inside it are what get codes (`text_sentences.ordinal`, `text_codes.sentence_from/to`). The alternative — one part per sentence — would let evidence be per sentence, which is finer but multiplies parts by roughly 2.3. Recommendation: keep one part per Trainer; the user confirms, since it fixes how fine `proven` can ever be.
- **DEPENDENCY-PROPOSAL: S05.T13 should depend on S05.T02 because** the rules editor reads `effect_texts`, `card_parts` and `orphanTexts` directly to show the printed text with its sentence boundaries and the list of printings sharing it; today it reaches those tables only transitively through [S05.T07](T07-rule-codes-composition-semantics.md) and [S05.T12](T12-evidence-and-coverage-metrics.md).

## References

- `pokemon/src/pokesearch/sim/verified.py` L123–136 (`_required`) — verified: parts are `abilities.name` ordered by `idx`, then `attacks.name WHERE text IS NOT NULL AND TRIM(text) != ''` ordered by `idx`, then `WHOLE = "*"` when `supertype = 'Trainer'` or (`'Energy'` and `'Special' in subtypes_json`). Consult for the part definition this subtask reproduces and extends with `rule_box` and textless parts.
- `pokemon/src/pokesearch/sim/verified.py` L31–33 (`norm_part`) — verified: `"".join(ch for ch in norm_name(name) if ch.isalnum()) or WHOLE`. Consult for why the name component of the hash is normalized.
- `pokemon/src/pokesearch/sim/engine_adapter.py` L345–348 (`norm_name`) — verified: NFKD + ASCII-fold + lowercase + strip + parenthetical removal. Note that it *transliterates*, which our `norm()` deliberately does not ([data model](../../project/04-data-model-overview.md) conventions); legacy-derived keys are therefore not byte-comparable with ours.
- `pokemon/src/pokesearch/sim/catalog.py` L255–259 and L570–572 — verified: the `"dunsparce@TEF-128"` escape hatch with the comment that the JTG Trading Places printing is four of every five meta copies while the third-party engine shipped the TEF Dig printing. Consult for the concrete failure RN-05 removes.
- `pokemon/ESPECIFICACAO.md` §6.1 — verified: *"1,4 % das cópias do meta são Pokémon em impressão cujo texto difere da implementada; a cobertura ainda conta por nome"*. The gap this subtask closes.
- [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) — the surrogate-key warning that made `(card_id, part_kind, part_idx)` the part key; [S05.T01](T01-rules-schema-migration.md) — the tables written here and the `part_kind <> 'rule_box'` filter in `card_status`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
