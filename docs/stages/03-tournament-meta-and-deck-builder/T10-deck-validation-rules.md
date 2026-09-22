# S03.T10 — Deck validation rules

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 10 / 13 |
| Depends on | [S02.T06](../02-card-data-and-search/T06-load-cards.md), [S03.T09](T09-decklist-parser-and-exporter.md) |
| Unblocks | [S03.T11](T11-user-decks-schema-and-api.md) |
| Parallel with | [S03.T06](T06-meta-queries.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `cards` (supertype, subtypes, stage, regulation mark, `tcgdex_legal_standard`) — from [S02.T06](../02-card-data-and-search/T06-load-cards.md)
- `contract` `ResolvedDeck` — from [S03.T09](T09-decklist-parser-and-exporter.md)
- `file` `packages/shared/src/formats.ts` — the format table (legal regulation marks per format, updated at rotation), the one place a rotation is applied

## Outputs (proposed)
- `module` `@pokesearch/shared/decklist/validate.ts` (pure, takes resolved cards) — `validateDeck(deck, format) → { ok, errors: [{ code, message, cardIds }], warnings }` with codes `SIZE_NOT_60`, `COPY_LIMIT`, `NOT_LEGAL`, `NO_BASIC`, `ACE_SPEC_LIMIT`, `RADIANT_LIMIT`, `UNRESOLVED_LINE`, `REGULATION_MARK` — consumed by [S03.T11](T11-user-decks-schema-and-api.md)
- `contract` `ValidationReport` — the object stored verbatim in `user_deck_versions.validation_json` and rendered by the builder

## Initial objective
The user learns before any simulation whether a list is tournament-legal in Standard and exactly why not (closing legacy open item P4).

## Context

The legacy project had **no deck validation at all** — `ESPECIFICACAO.md` §4.2 lists it under "what the system does not validate" and it remained open item P4. The cost is documented in the legacy engine adapter: an empty decklist was not rejected, the third-party engine silently loaded its own default deck, and a version with 0 cards was measured at 36.7 % — a score belonging to a different deck entirely. The adapter's only guard, added afterwards, was the refusal at `deck_size != 60`.

RN-10 is that guard promoted to a rule, enforced twice on purpose: here, where the user can act on it, and in the engine ([S04.T04](../04-game-engine-core/T04-setup-and-turn-structure.md)), as the last line of defence. This subtask is the friendly half — "is this list legal, and if not, why" in one pure function over a `ResolvedDeck` ([S03.T09](T09-decklist-parser-and-exporter.md)), with per-card ids so the builder can highlight the offending rows.

Two design commitments. **Pure and data-driven**: `validateDeck` takes resolved cards and a format descriptor, touches no database, and runs in the browser for instant feedback in [S03.T12](T12-web-deck-builder.md); the rotation lives in one table (`packages/shared/src/formats.ts`), so a rotation is a data edit plus a test. **Errors versus warnings**: an error means the list cannot be played as written, a warning means something suspicious but legal. Only errors set `ok: false`, and an invalid list is still storable ([S03.T11](T11-user-decks-schema-and-api.md)) — the user must be able to save work in progress.

Legality comes from the card data: TCGdex's Standard flag when present, falling back to the format's legal regulation marks. The two can disagree (a card with a legal mark that was banned, or a promo with no mark), which is why both codes exist: `NOT_LEGAL` for the flag and `REGULATION_MARK` for the mark-based fallback.

## Scope

- **In scope.** `packages/shared/src/decklist/validate.ts`: the eight error codes, their detection, their pt-BR message templates and their `cardIds`; the warning set; `packages/shared/src/formats.ts` with the format descriptors; the `ValidationReport` type and its zod schema.
- **Out of scope.** Parsing and resolution ([S03.T09](T09-decklist-parser-and-exporter.md)); persistence of the report ([S03.T11](T11-user-decks-schema-and-api.md)); rendering and highlighting ([S03.T12](T12-web-deck-builder.md)); the engine's own 60-card refusal ([S04.T04](../04-game-engine-core/T04-setup-and-turn-structure.md)); rules coverage of the cards in the list ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)); price ([S03.T11](T11-user-decks-schema-and-api.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-10 | **Kept.** A playable deck has exactly 60 cards. This subtask reports `SIZE_NOT_60` with the actual total; [S04.T04](../04-game-engine-core/T04-setup-and-turn-structure.md) refuses to start a game with any other total, so a list that slips through validation still cannot produce a score. | `checkSize()` in `validate.ts`; independently, the engine's setup guard | `validate.spec.ts > size` — 59 and 61 cards both yield `SIZE_NOT_60` with the total in the message; 60 yields none |
| BR-S03.T10-01 | At most 4 copies of cards sharing a `nameKey`, counted across all lines; Basic Energy cards are exempt. The check aggregates copies per name, not per printing. | `checkCopyLimit()` — groups `ResolvedLine[]` by `nameKey`, skipping lines whose card is a Basic Energy | `validate.spec.ts > copy limit` — `2 + 3` copies of one card across two lines yields `COPY_LIMIT` with count 5; 12 Basic Psychic Energy yields nothing |
| BR-S03.T10-02 | Every card must be legal in the format: `cards.tcgdex_legal_standard` when it is not null, otherwise `cards.legal_standard = 'Legal'`. A card failing this yields `NOT_LEGAL`. | `checkLegality()` using the shared legality predicate | `validate.spec.ts > not legal` — a rotated-out printing yields `NOT_LEGAL` naming the card |
| BR-S03.T10-03 | When a card carries a regulation mark and the format declares a mark set, a mark outside that set yields `REGULATION_MARK` — reported even when the legality flag is missing, which is the fallback path for promos and newly loaded sets. | `checkRegulationMark()` against `FORMATS[format].regulationMarks` | `validate.spec.ts > regulation mark` — a card with mark `F` in a format allowing `{G,H,I}` yields `REGULATION_MARK`; a card with no mark yields nothing from this check |
| BR-S03.T10-04 | A deck must contain at least one Basic Pokémon (`supertype = 'Pokémon'` and `stage = 'Basic'`); otherwise `NO_BASIC`. | `checkBasicPokemon()` | `validate.spec.ts > no basic` — a list of only Stage 1 Pokémon, Trainers and Energy yields `NO_BASIC` |
| BR-S03.T10-05 | At most one card whose subtypes contain `ACE SPEC` may appear in the deck, counted by copies across all ACE SPEC cards together. | `checkAceSpec()` | `validate.spec.ts > ace spec` — two different ACE SPEC cards yield one `ACE_SPEC_LIMIT` listing both card ids; two copies of the same one also yield it |
| BR-S03.T10-06 | At most one Radiant Pokémon (subtypes contain `Radiant`) may appear, when the format's `hasRadiant` flag is set; formats without Radiant cards skip the check entirely. | `checkRadiant()` gated by `FORMATS[format].hasRadiant` | `validate.spec.ts > radiant` — two Radiant Pokémon yield `RADIANT_LIMIT`; the same list in a format with `hasRadiant: false` yields nothing |
| BR-S03.T10-07 | Every line with `matchKind = "none"` yields one `UNRESOLVED_LINE` error naming the printed text; an unresolved line makes the deck invalid because its legality and identity are unknown. | `checkUnresolved()` | `validate.spec.ts > unresolved` — a list containing `1 Nonexistent Card ZZZ 9` is `ok: false` with `UNRESOLVED_LINE` |
| BR-S03.T10-08 | `ok` is true exactly when `errors` is empty; warnings never affect `ok`, and the report always lists every violated rule — validation does not stop at the first error. | the final assembly in `validateDeck()` | `validate.spec.ts > all errors reported` — a 59-card list with 5 copies of a card and no Basic Pokémon returns three distinct error codes |
| BR-S03.T10-09 | `validate.ts` is pure: no database, no `node:*` import, no clock; the format descriptor and the resolved cards are its only inputs, so the same call in the browser and on the server gives the same report. | eslint `no-restricted-imports` on the file ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `validate.spec.ts` runs in jsdom; `pnpm lint` fails on a `node:fs` import there |
| BR-S03.T10-10 | Rotation is data: the legal regulation marks, the format name and the `hasRadiant` flag live in `packages/shared/src/formats.ts` and nowhere else; no check hard-codes a mark letter. | `FORMATS` is the only source of marks; a lint rule forbids mark literals elsewhere in `validate.ts` | `validate.spec.ts > rotation is data` — changing the fixture's mark set flips `REGULATION_MARK` on and off with no code change |

## Data operations

This subtask reads no table and writes none: it runs over an already-resolved deck. The table below is its check pipeline, in order.

| Step | Input it reads | Condition | Emits |
|---|---|---|---|
| total | `Σ line.count` | `≠ 60` | `SIZE_NOT_60` (RN-10) |
| unresolved | `line.matchKind === "none"` | any | one `UNRESOLVED_LINE` per line |
| copies per name | `nameKey`, `card.supertype`, `card.subtypes` | `> 4` and the card is not a Basic Energy | `COPY_LIMIT` per offending name |
| legality flag | `card.legalStandard` / `card.tcgdexLegalStandard` | card not legal in the format | `NOT_LEGAL` per card |
| regulation mark | `card.regulationMark`, `FORMATS[format].regulationMarks` | mark present and outside the set | `REGULATION_MARK` per card |
| basic Pokémon | `card.supertype`, `card.stage` | no line with a Basic Pokémon | `NO_BASIC` |
| ACE SPEC | `card.subtypes` | `Σ count over ACE SPEC cards > 1` | `ACE_SPEC_LIMIT` |
| Radiant | `card.subtypes`, `FORMATS[format].hasRadiant` | flag set and `Σ count over Radiant Pokémon > 1` | `RADIANT_LIMIT` |
| warnings | `card.marketUsd`, `line.matchKind` | no price; `matchKind ∈ {digits, name}` | `NO_PRICE`, `WEAK_MATCH` |
| assemble | all of the above | — | `{ ok: errors.length === 0, errors, warnings, summary }` |

## Interfaces

**`packages/shared/src/decklist/validate.ts`**

```ts
export type ValidationCode =
  | "SIZE_NOT_60" | "COPY_LIMIT" | "NOT_LEGAL" | "NO_BASIC"
  | "ACE_SPEC_LIMIT" | "RADIANT_LIMIT" | "UNRESOLVED_LINE" | "REGULATION_MARK";
export type WarningCode = "NO_PRICE" | "WEAK_MATCH";

export interface ValidationIssue {
  code: ValidationCode | WarningCode;
  message: string;                  // pt-BR, rendered from the template below
  cardIds: string[];                // resolved ids of the cards involved; [] when none resolved
  lines?: number[];                 // 1-based source lines, when the issue points at text
  meta?: Record<string, string | number>;   // total, count, name, mark — the template's substitutions
}
export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: { total: number; pokemon: number; trainer: number; energy: number; distinctNames: number };
  format: string;
  checkedAt: string;                // ISO, supplied by the caller — the function itself has no clock
}
export function validateDeck(deck: ResolvedDeck, format?: string, opts?: { now?: string }): ValidationReport;
export const ValidationReportSchema: z.ZodType<ValidationReport>;
```

**Validation codes with their pt-BR message templates.** English descriptions are the rule; the quoted text is the UI copy (D-006).

| Code | Severity | Description (English) | Message template (pt-BR) |
|---|---|---|---|
| `SIZE_NOT_60` | error | The deck does not hold exactly 60 cards (RN-10). `meta.total` is the actual sum of copies. | `A lista tem {total} cartas; um deck precisa de exatamente 60.` |
| `COPY_LIMIT` | error | More than 4 copies of cards sharing a name; Basic Energy is exempt. One issue per offending name. | `{name}: {count} cópias. O limite é 4 por nome (exceto Energia Básica).` |
| `NOT_LEGAL` | error | The card is not legal in the format according to the source legality flag. | `{name} ({setCode} {number}) não é legal no formato {format}.` |
| `NO_BASIC` | error | The deck contains no Basic Pokémon, so it cannot set up. | `A lista não tem nenhum Pokémon Básico.` |
| `ACE_SPEC_LIMIT` | error | More than one ACE SPEC card in total. | `Você só pode usar 1 carta ACE SPEC; esta lista tem {count} ({names}).` |
| `RADIANT_LIMIT` | error | More than one Radiant Pokémon, in a format that has them. | `Você só pode usar 1 Pokémon Radiante; esta lista tem {count} ({names}).` |
| `UNRESOLVED_LINE` | error | A line could not be matched to any card, so its legality is unknown. | `Linha {line}: "{text}" não foi encontrada na base de cartas.` |
| `REGULATION_MARK` | error | The card's regulation mark is outside the set the format allows. | `{name} tem marca de regulamento {mark}; o formato {format} aceita {allowed}.` |
| `NO_PRICE` | warning | The card has no market price, so the deck total is partial. | `{name} está sem preço; o total do deck é parcial.` |
| `WEAK_MATCH` | warning | The line matched by digits or by name only, so the printing may differ from what was typed. | `Linha {line}: "{text}" foi casada por {kind}; confira a impressão.` |

**`packages/shared/src/formats.ts`**

```ts
export interface FormatDescriptor {
  id: string;                    // "STANDARD" | "EXPANDED"
  label: string;                 // pt-BR label for the UI
  regulationMarks: string[];     // e.g. ["G", "H", "I"] — updated at rotation, the only place
  hasRadiant: boolean;           // whether Radiant Pokémon exist in the format
  aceSpecLimit: number;          // 1
  copyLimit: number;             // 4
  deckSize: number;              // 60
  basicEnergyExempt: boolean;    // true
  rotatedAt: string;             // ISO date of the rotation this table describes
}
export const FORMATS: Record<string, FormatDescriptor>;
export function formatOf(id?: string): FormatDescriptor;   // defaults to STANDARD, throws on unknown
```

The current `regulationMarks` value is a rotation fact that must be confirmed against the official rotation announcement at implementation time — **to verify**; the table is written so that confirming it is a one-line edit plus the `rotation is data` test. `deckSize`, `copyLimit` and `aceSpecLimit` are constants of the game rather than of the format, but they live here so a hypothetical alternative format can override them without touching the checks.

**Basic Energy detection.** A card is a Basic Energy when `supertype = "Energy"` and its subtypes contain `Basic`. This is the exemption from `copyLimit` and the only exemption; Special Energy obeys the 4-copy limit.

## Implementation steps

1. Write `packages/shared/src/formats.ts` with the `STANDARD` descriptor and a test fixture format used by the spec, so no test depends on the live rotation.
2. Implement `checkSize` and `checkUnresolved`, the two checks that need no card attributes; wire the report assembly.
3. Implement `checkCopyLimit` with grouping by `nameKey` and the Basic Energy exemption.
4. Implement `checkLegality` and `checkRegulationMark` on top of the shared legality predicate.
5. Implement `checkBasicPokemon`, `checkAceSpec` and `checkRadiant`.
6. Add the warnings (`NO_PRICE`, `WEAK_MATCH`).
7. Write the pt-BR message templates in the strings module and render them with `meta` substitutions; assert every code has a template and every template's placeholders are provided.
8. Write the table-driven spec: one case per code, one case combining three violations, and the Dhelmise list as the `ok: true` case.
9. Export `ValidationReportSchema` so [S03.T11](T11-user-decks-schema-and-api.md) can store and re-read the report without a cast.

## Edge cases and error handling

- **A list with 59 cards** → one `SIZE_NOT_60` with `meta.total = 59` and the message naming 59. No other check is suppressed: a 59-card list with 5 copies of a card reports both.
- **5 copies of one card spread over two lines** (`2 Ultra Ball ASC 213` and `3 Ultra Ball ASC 213`) → aggregated by `nameKey` to 5, so one `COPY_LIMIT` naming Ultra Ball with `count = 5`, and both card ids listed.
- **12 Basic Psychic Energy** → legal; the Basic Energy exemption applies to the aggregate, so no `COPY_LIMIT`.
- **5 copies of a Special Energy** (for instance a Telepathic Psychic Energy) → `COPY_LIMIT`; the exemption covers Basic Energy only.
- **An unresolved line** (`1 Nonexistent Card ZZZ 9`) → `UNRESOLVED_LINE` naming line and text, `ok: false`. The deck may still be exactly 60 cards, so `SIZE_NOT_60` is absent; the two errors are independent.
- **A card whose `tcgdex_legal_standard` is null and whose mark is legal** → `checkLegality` falls back to `legal_standard = 'Legal'`; if that is also absent, only `checkRegulationMark` speaks, which is the intended behaviour for a freshly loaded promo.
- **A card with no regulation mark at all** (an older promo) → `REGULATION_MARK` is not emitted; only the legality flag decides. Emitting it would flag every pre-mark card in Expanded.
- **Two different ACE SPEC cards, one copy each** → one `ACE_SPEC_LIMIT` with `count = 2` and both names in `meta.names`; the limit is across all ACE SPEC cards, not per card.
- **Two Radiant Pokémon in a format with `hasRadiant: false`** → no error, because the check is skipped; the cards would already be caught by `NOT_LEGAL` if they were not in the format.
- **A deck whose only Pokémon is a Stage 1** → `NO_BASIC`. The game cannot start, which is exactly the class of error the legacy 36.7 % incident belongs to.
- **An empty list (0 cards)** → `SIZE_NOT_60` with `total = 0` plus `NO_BASIC`; the report is explicit rather than the list being quietly replaced by a default deck.
- **A list where every line resolved by name** → 60 `WEAK_MATCH` warnings but `ok: true`; the builder collapses repeated warnings into one summary row so the panel stays readable.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/shared test -t "validate"` green in the jsdom environment (BR-S03.T10-09).
- [ ] `validate.spec.ts > dhelmise`: the benchmark 60-card list validates `ok: true` with zero errors (stage exit criterion).
- [ ] `validate.spec.ts > size`: 59 and 61 cards yield `SIZE_NOT_60` carrying the actual total; 60 yields none (RN-10).
- [ ] `validate.spec.ts > copy limit`: 5 copies across two lines yield one `COPY_LIMIT` with `count: 5` and both card ids; 12 Basic Energy yield none; 5 Special Energy yield one (BR-S03.T10-01).
- [ ] `validate.spec.ts > not legal` and `> regulation mark`: a rotated printing yields `NOT_LEGAL`; a card with a mark outside the fixture format's set yields `REGULATION_MARK` naming the mark and the allowed set (BR-S03.T10-02, -03).
- [ ] `validate.spec.ts > no basic`, `> ace spec`, `> radiant`: each yields its code, with `ACE_SPEC_LIMIT` and `RADIANT_LIMIT` listing every card involved (BR-S03.T10-04, -05, -06).
- [ ] `validate.spec.ts > unresolved`: a list with one unmatched line is `ok: false` with `UNRESOLVED_LINE` naming the 1-based line (BR-S03.T10-07).
- [ ] `validate.spec.ts > all errors reported`: a 59-card list with 5 copies and no Basic Pokémon returns three codes in one report (BR-S03.T10-08).
- [ ] `validate.spec.ts > messages`: every `ValidationCode` and `WarningCode` has a template, and every template's placeholders are present in the issue's `meta` (no `{name}` survives rendering).
- [ ] `validate.spec.ts > rotation is data`: changing only `FORMATS.TEST.regulationMarks` flips `REGULATION_MARK` on and off (BR-S03.T10-10).

## Risks and open questions

- **Risk — the regulation-mark set is wrong or stale**, flagging a legal list as illegal, which is worse than missing an illegal one. Mitigation: `NOT_LEGAL` is the primary check and the mark check is the fallback; the set lives in one file with `rotatedAt` next to it, and [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) can compare it against the marks actually present in Standard-legal cards.
- **Risk — the card data disagrees with the official rules** for one printing (a card banned individually). Mitigation: `NOT_LEGAL` follows the source flag, so correcting the card data fixes validation with no code change; a persistent disagreement becomes a `card_overrides` row in [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md).
- **Risk — validation is too strict for work in progress.** Mitigation: an invalid list is still stored with `validation_json.ok = false` ([S03.T11](T11-user-decks-schema-and-api.md)); only starting a game is blocked.
- **Question — should Prism Star (`◇`) and other one-per-deck families be checked?** They do not exist in Standard today, so no code is defined. Recommendation: add a generic `oneOfKind` rule driven by `FORMATS` if Expanded is ever supported; whoever opens Expanded decides.
- **Question — should `UNRESOLVED_LINE` be an error or a warning?** As an error it blocks a list that may be legal but whose printing the card base lacks. Recommendation: keep it an error (an unknown card cannot be simulated) and let [S03.T12](T12-web-deck-builder.md) offer a "search for this card" action. Revisit if real lists trip it — the legacy data suggests they will not (4 unresolved lines in 982,557).

## References

- `pokemon/src/pokesearch/sim/engine_adapter.py` L438–447 — verified: the comment explaining that an empty decklist made the third-party engine silently load its own default deck and that a 0-card version was scored at 36.7 %, and the guard `if total != 60: return GameResult(..., f"deck {lado} tem {total} cartas; uma partida exige 60")`. This is the only legality-adjacent check the legacy project had.
- `pokemon/src/pokesearch/etl/deck_resolver.py` L73–76 — verified: `_LEGAL_SQL` = `COALESCE(c.tcgdex_legal_standard, c.legal_standard = 'Legal')`, the legality predicate reused here.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: the 60-card list (23 Pokémon, 30 Trainer, 7 Energy) used as the `ok: true` fixture, including two Special Energy and two Basic Energy lines.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-10 ("Games run only with exactly 60 cards per side", implemented in S04.T04 and S03.T10).
- [Glossary](../../project/07-glossary.md) "Regulation mark" and "Standard" — legality is the TCGdex flag plus a configured set of legal marks.
- Official rules reference (to consult at implementation time for the ACE SPEC and Radiant limits and the current legal marks): the Play! Pokémon tournament rules and the current rotation announcement.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
