# S03.T09 — Decklist text parser and exporter

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 9 / 13 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S03.T04](T04-deck-resolver.md) |
| Unblocks | [S03.T10](T10-deck-validation-rules.md), [S03.T11](T11-user-decks-schema-and-api.md) |
| Parallel with | [S03.T05](T05-decks-sync-and-prune.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared/decklist` placeholder — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `module` resolver (`resolve`, `nameKey`) — from [S03.T04](T04-deck-resolver.md)
- `external` the TCG Live / Limitless export format, as produced by the game client and by the meta pages of this stage

## Outputs (proposed)
- `contract` `@pokesearch/shared/decklist`: `parseDecklist(text) → { lines: [{ count, name, setCode, number, section }], warnings }`, `serializeDecklist(list) → string` (TCG Live format: `Pokémon: N` / `4 Dragapult ex TWM 130` / blank line between sections), `ResolvedDeck` type — consumed by [S03.T10](T10-deck-validation-rules.md), [S03.T11](T11-user-decks-schema-and-api.md)
- `module` `apps/api/src/decks/resolve-list.ts` — applies the resolver to parsed lines, maps basic energies (`MEE`/`SVE`, `Basic {Type} Energy`) — consumed by [S03.T10](T10-deck-validation-rules.md), [S03.T11](T11-user-decks-schema-and-api.md)
- `file` `packages/shared/test/fixtures/decklists/` — 20 real tournament exports plus the Dhelmise list, used for the round-trip suite

## Initial objective
Any list a player can copy from TCG Live or Limitless parses into structured lines and back into byte-identical text, with resolution to card ids reusing the same rules as the meta ingestion.

## Context

The decklist text is the interchange format of the whole product: the user pastes it from TCG Live, the meta pages export it, the deck builder saves it, the engine job carries it. It has to be parsed in two places with one implementation — in the browser for instant feedback in [S03.T12](T12-web-deck-builder.md), and on the server where lines become card ids. The split: **parsing is pure and lives in `packages/shared`** (no database, no Node built-ins, browser-safe); **resolution lives in `apps/api`**, wrapping the resolver of [S03.T04](T04-deck-resolver.md).

That resolver is why this subtask depends on S03.T04 instead of duplicating anything: a pasted list must resolve by exactly the same RN-02 order as the tournament lists it will be compared with ([S03.T13](T13-deck-comparison-with-tournament-lists.md)). If the two diverged, copying a tournament list would yield a different deck from the one copied.

The legacy parsed this format in one place — `convert_decklist` in the engine adapter — and its rules are the specification here: skip blanks, `#` comments and any non-numeric line containing a colon (covering both `Pokémon: 20` headers and the `Total Cards: 60` trailer); require a numeric count and at least four whitespace-separated tokens; take the set code and number from the last two tokens and the name from everything between; map basic energies by name to the current Basic Energy printing. What it lacked — a serializer guaranteeing a round trip, warnings with line numbers, a section concept — is this subtask's addition, and is what makes a paste dialog usable.

## Scope

- **In scope.** `packages/shared/src/decklist/parse.ts` (`parseDecklist`, the grammar, warnings), `packages/shared/src/decklist/serialize.ts` (`serializeDecklist`), the `ParsedDeck` / `ResolvedDeck` / `DeckLine` types and their zod schemas, and `apps/api/src/decks/resolve-list.ts` (resolution, section inference from the card's supertype, basic-energy mapping, per-line feedback).
- **Out of scope.** Legality and deck-construction rules ([S03.T10](T10-deck-validation-rules.md)); persistence, versions and diffs ([S03.T11](T11-user-decks-schema-and-api.md)); the resolution order itself ([S03.T04](T04-deck-resolver.md)); the export of a *tournament* deck read from the database, which [S03.T06](T06-meta-queries.md) produces from its own row shape (the two formats must agree, and a round-trip test enforces it); the builder UI ([S03.T12](T12-web-deck-builder.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask; it produces the `ResolvedDeck` that RN-10's 60-card rule is checked against in [S03.T10](T10-deck-validation-rules.md), and it reuses RN-02 through the resolver.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S03.T09-01 | A card line is `<count> <name…> <SET> <NUMBER>`: the first token is a non-negative integer, there are at least 4 whitespace-separated tokens, the last two are the set code (upper-cased) and the number (kept verbatim), and everything between is the name. | `parseLine()` in `parse.ts` | `decklist-parse.spec.ts > card line` — `4 Dragapult ex TWM 130` → `{ count: 4, name: "Dragapult ex", setCode: "TWM", number: "130" }` |
| BR-S03.T09-02 | A line is ignored — with no warning — when it is empty, starts with `#`, or contains `:` while not starting with a digit. A ignored line matching `^(Pokémon\|Pokemon\|Trainer\|Energy)\b` also sets the current section. | the skip chain at the top of the line loop | `decklist-parse.spec.ts > headers and comments` — `Pokémon: 23`, `Total Cards: 60` and `# note` produce no lines and no warnings; the first sets `section = "pokemon"` |
| BR-S03.T09-03 | A line that starts with a digit but does not satisfy BR-S03.T09-01 produces a warning `{ line: <1-based>, code: "MALFORMED_LINE", text }` and no parsed line; `parseDecklist` never throws for any input, including binary noise. | the fallthrough branch and the absence of any `throw` in `parse.ts` | `decklist-parse.spec.ts > malformed` — `4 Ultra Ball` yields one warning at line 7 and zero lines; a 1 MB random string returns `{ lines: [], warnings: [...] }` |
| BR-S03.T09-04 | `serializeDecklist(parseDecklist(text).lines)` reproduces the canonical form: sections in the order Pokémon → Trainer → Energy, each headed `"<Title>: <copies>"`, one `"<count> <name> <SET> <NUMBER>"` line per entry in input order, a single blank line between sections, and exactly one trailing newline. Re-parsing the output yields identical lines. | `serialize.ts` | `decklist-parse.spec.ts > round trip` over the 21 fixtures — `serialize(parse(serialize(parse(t))))` equals `serialize(parse(t))`, and counts per card are preserved |
| BR-S03.T09-05 | Parsing is pure: `packages/shared/src/decklist/` imports nothing from `node:*`, no database and no network, and the module runs unchanged in a browser bundle. | an eslint `no-restricted-imports` rule on the folder ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a `node:fs` import there; `decklist-parse.spec.ts` runs in the jsdom environment |
| BR-S03.T09-06 | `resolveList` assigns each line's category from the section header when one applies, and otherwise from the resolved card's supertype (`Pokémon`→pokemon, `Trainer`→trainer, `Energy`→energy); an unresolved line with no section defaults to `trainer` and carries a warning. | `resolve-list.ts` | `resolve-list.spec.ts > category` — a headerless list categorises every line correctly against the fixture card tables |
| BR-S03.T09-07 | A basic-energy line matching `^(basic )?<type> energy$` after normalisation resolves to the current Basic Energy printing of that type regardless of the printed set code, and re-serialises with the set code and number the user typed. | the basic-energy branch of `resolve-list.ts`, which delegates to the resolver's `MEE → sve` alias and its name fallback | `resolve-list.spec.ts > basic energy` — `3 Psychic Energy MEE 5`, `3 Basic Psychic Energy SVE 5` and `3 Psychic Energy XYZ 1` all resolve to the same card id, with kinds `override`, `exact`, `name` |
| BR-S03.T09-08 | `resolveList` returns one result per input line, in input order, each carrying `cardId`, `matchKind` and (when unresolved) `fallbackImageUrl`; it never drops, merges or reorders lines. | `resolveList()` return contract | `resolve-list.spec.ts > one result per line` — a list with two separate `4 Ultra Ball` lines yields two results, not one merged 8-copy line |
| BR-S03.T09-09 | A count of 0 is parsed and reported as a warning `ZERO_COUNT` and excluded from `lines`; a count above 99 is parsed as-is and left to [S03.T10](T10-deck-validation-rules.md) to reject. | `parseLine()` | `decklist-parse.spec.ts > zero count` and `> large count` |

## Data operations

This subtask reads no table and writes none. Its operations are the parse steps and the resolution pass.

| Step | Input | Rule | Output |
|---|---|---|---|
| normalise input | raw text | strip a UTF-8 BOM, split on `\r\n` \| `\n` \| `\r`, trim each line, keep 1-based line numbers | `string[]` with positions |
| skip | one line | empty, `#…`, or `:` present while the first character is not a digit (BR-S03.T09-02) | nothing (may set the section) |
| section | an ignored line | `^(Pokémon\|Pokemon\|Trainer\|Energy)\b` (case-insensitive, accent-insensitive) | `section ∈ pokemon \| trainer \| energy` |
| card line | one line | BR-S03.T09-01 tokenisation | `{ count, name, setCode, number, section, sourceLine }` |
| warn | one line | starts with a digit but fails tokenisation, or `count = 0` | `{ line, code, text }` |
| serialize | `DeckLine[]` | BR-S03.T09-04 canonical form | TCG Live text |
| resolve | `DeckLine` + `Resolver` | RN-02 order ([S03.T04](T04-deck-resolver.md)); category from the section or the supertype (BR-S03.T09-06); basic energy by name (BR-S03.T09-07) | `ResolvedLine` with `cardId`, `matchKind`, `card`, `fallbackImageUrl` |
| summarise | `ResolvedLine[]` | count copies, resolved copies, and per-`matchKind` totals | `ResolvedDeck` with `total`, `resolved`, `unresolvedLines` |

## Interfaces

**Grammar of the TCG Live text format** (what `parseDecklist` accepts; `WS` is one or more spaces or tabs):

```
decklist     = { line } ;
line         = blank | comment | header | trailer | card | garbage ;

blank        = WS? EOL ;
comment      = WS? "#" { any } EOL ;
header       = WS? section WS? ":" WS? [ integer ] { any } EOL ;      (* "Pokémon: 23" *)
trailer      = WS? word { WS word } ":" { any } EOL ;                 (* "Total Cards: 60" — ignored *)
card         = WS? count WS name WS setcode WS number WS? EOL ;
garbage      = WS? digit { any } EOL ;                                (* starts like a card, is not one → warning *)

section      = "Pokémon" | "Pokemon" | "Trainer" | "Energy" ;          (* case- and accent-insensitive *)
count        = integer ;                                               (* 0 warns, ≥ 1 accepted *)
name         = token { WS token } ;                                    (* ≥ 1 token; may contain digits, apostrophes, parentheses *)
setcode      = token ;                                                 (* upper-cased on parse: "TWM", "PR-SV", "MEE" *)
number       = token ;                                                 (* kept verbatim: "130", "TG01", "SV122" *)
```

Disambiguation is positional, not lexical: the **last two tokens** are always the set code and the number, and everything between the count and them is the name. This is what lets `4 Lillie's Clefairy ex ASC 76` and `1 Professor's Research (Professor Sada) SVI 189` parse without a card database. A card line with fewer than four tokens is `garbage`, because a name-only line cannot be distinguished from a truncated one.

**`packages/shared/src/decklist/index.ts`**

```ts
export type DeckSection = "pokemon" | "trainer" | "energy";

export interface DeckLine {
  count: number;
  name: string;
  setCode: string | null;      // upper-cased, null only for lines built programmatically
  number: string | null;       // verbatim
  section: DeckSection | null; // from the header that governs the line, null when headerless
  sourceLine?: number;         // 1-based position in the pasted text
}
export interface ParseWarning {
  line: number;
  code: "MALFORMED_LINE" | "ZERO_COUNT" | "UNKNOWN_SECTION";
  text: string;                // the offending line, trimmed
}
export interface ParsedDeck { lines: DeckLine[]; warnings: ParseWarning[] }

export function parseDecklist(text: string): ParsedDeck;
export function serializeDecklist(lines: readonly DeckLine[]): string;

export const DeckLineSchema: z.ZodType<DeckLine>;
export const ParsedDeckSchema: z.ZodType<ParsedDeck>;
export const ResolvedDeckSchema: z.ZodType<ResolvedDeck>;

export interface ResolvedLine extends DeckLine {
  section: DeckSection;                 // always assigned after resolution
  cardId: string | null;
  matchKind: "exact" | "override" | "digits" | "name" | "none";
  card: ResolvedCardBrief | null;       // name, supertype, subtypes, regulationMark, legal, marketUsd, image
  fallbackImageUrl: string | null;
}
export interface ResolvedDeck {
  lines: ResolvedLine[];
  warnings: ParseWarning[];
  total: number;                        // Σ count
  resolved: number;                     // Σ count over lines with a cardId
  unresolvedLines: number;
  kinds: Record<ResolvedLine["matchKind"], number>;
}
```

**`apps/api/src/decks/resolve-list.ts`**

```ts
export function resolveList(db: Db, parsed: ParsedDeck, opts?: { format?: string }): ResolvedDeck;
export function resolveText(db: Db, text: string, opts?: { format?: string }): ResolvedDeck;  // parse + resolve
export const BASIC_ENERGY_PATTERN = /^(?:basic\s+)?([a-z]+)\s+energy$/;   // applied to nameKey(name, "energy")
```

`resolveList` builds (or reuses, per request) a `Resolver` from [S03.T04](T04-deck-resolver.md), maps each line, and fills `section` by the rule of BR-S03.T09-06. Basic energies need no special case in the happy path — the resolver's `MEE → sve` alias and its name fallback already handle `MEE`, `SVE` and an unknown code — so the pattern above exists only to tag the line as `energy` when the list has no headers.

**Canonical output** (`serializeDecklist`), the exact shape the exit criterion compares against:

```
Pokémon: 23
4 Shuppet PBL 33
…

Trainer: 30
4 Lillie's Determination ASC 192
…

Energy: 7
4 Telepathic Psychic Energy POR 88
3 Psychic Energy MEE 5
```

A line whose `setCode` is null is written as `"<count> <name>"` with no trailing pair; a section with no lines is omitted; the text ends with a single `\n`.

## Implementation steps

1. Write `parseDecklist` with the skip chain and the positional tokenisation; test each grammar production in isolation.
2. Add warnings with 1-based line numbers, including `MALFORMED_LINE` and `ZERO_COUNT`; assert that no input throws.
3. Add section tracking from headers, accent- and case-insensitive.
4. Write `serializeDecklist` and the round-trip property over a handful of hand-written lists.
5. Collect the fixtures: 20 real exports (from the meta pages of [S03.T06](T06-meta-queries.md) and from TCG Live) plus the Dhelmise list; commit them verbatim.
6. Add the round-trip suite over all 21 fixtures, comparing canonical text and per-card counts.
7. Add the zod schemas and export them from `@pokesearch/shared` with their JSON Schema, so the API and the builder share one type.
8. Write `resolve-list.ts`: resolver construction, per-line mapping, category assignment, summary counters.
9. Add `resolve-list.spec.ts` with the basic-energy trio, the duplicate-line case and the headerless list.
10. Assert cross-module agreement: `parseDecklist(exportText(getDeck(id)))` from [S03.T06](T06-meta-queries.md) yields the same counts as the stored deck.

## Edge cases and error handling

- **`4 Basic Psychic Energy MEE 5`** → parses as count 4, name `Basic Psychic Energy`, set `MEE`, number `5`; `nameKey` strips the `Basic ` prefix and the resolver's alias maps `MEE → sve`, so the line resolves with `matchKind = "override"` and re-serialises with `MEE 5` exactly as typed.
- **`3 Psychic Energy XYZ 1`** (a set code that does not exist) → the resolver's name fallback returns the current Basic Psychic Energy with `matchKind = "name"`; the line keeps `XYZ 1` in the text so the user sees what they pasted.
- **`Total Cards: 60`** at the end of a TCG Live export → ignored by the colon rule, with no warning and no effect on the section.
- **A name containing digits: `1 Pokégear 3.0 POR 81`** → the last two tokens are `POR` and `81`, so `3.0` stays inside the name; positional parsing is what makes this work.
- **A name containing a parenthetical: `1 Professor's Research (Professor Sada) SVI 189`** → parsed whole; `nameKey` strips the parenthetical only for matching, never for display or export.
- **`4 Ultra Ball`** (set code and number omitted, as some hand-written lists do) → fewer than 4 tokens, so it is `garbage`: one `MALFORMED_LINE` warning naming the line number, and no parsed line. The builder shows it in red next to the paste box rather than silently losing four cards.
- **The same card on two lines** (`2 Ultra Ball ASC 213` and `2 Ultra Ball ASC 213`) → two `DeckLine`s and two `ResolvedLine`s; merging is a deck-editing decision, not a parsing one, and [S03.T10](T10-deck-validation-rules.md) sums copies per name when checking the 4-copy limit.
- **`0 Iono JTG 154`** → `ZERO_COUNT` warning, line excluded; a zero-copy line usually means the user edited a list by hand and forgot to delete it.
- **`5 Ultra Ball ASC 213`** → parsed as 5 copies without complaint; the copy limit is [S03.T10](T10-deck-validation-rules.md)'s business, and refusing it here would hide the real error message.
- **CRLF line endings and a UTF-8 BOM** (a list pasted from Windows Notepad) → normalised before parsing; the BOM would otherwise make the first line's count non-numeric and lose the first card.
- **A list with no section headers at all** (Limitless "copy as text") → every line parses with `section = null`; `resolveList` assigns the category from each resolved card's supertype, and `serializeDecklist` then emits proper headers.
- **A 5,000-line paste** → parsing is O(n) with no backtracking; the builder caps the textarea at a documented size and the parser still returns in milliseconds.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/shared test -t "decklist"` green, running in the jsdom environment to prove browser safety (BR-S03.T09-05).
- [ ] `decklist-parse.spec.ts > round trip`: for all 21 fixtures, `serializeDecklist(parseDecklist(t).lines)` re-parses to the same lines and preserves every per-card count (BR-S03.T09-04).
- [ ] `decklist-parse.spec.ts > Dhelmise`: the benchmark list parses to 60 copies across 23 / 30 / 7, and re-serialises to text identical to the committed fixture.
- [ ] `decklist-parse.spec.ts > headers and comments`: `Pokémon: 23`, `Total Cards: 60` and `# note` yield no lines and no warnings; the first sets the section (BR-S03.T09-02).
- [ ] `decklist-parse.spec.ts > malformed`: `4 Ultra Ball` produces exactly one `MALFORMED_LINE` warning carrying its 1-based line number; a random-bytes input returns empty lines and does not throw (BR-S03.T09-03).
- [ ] `decklist-parse.spec.ts > zero count` and `> large count`: `0 Iono JTG 154` warns and is excluded; `5 Ultra Ball ASC 213` parses as 5 (BR-S03.T09-09).
- [ ] `resolve-list.spec.ts > basic energy`: the three energy spellings resolve to one card id with kinds `override`, `exact`, `name` (BR-S03.T09-07).
- [ ] `resolve-list.spec.ts > one result per line` and `> category`: duplicate lines stay separate; a headerless list gets correct categories from supertypes (BR-S03.T09-06, -08).
- [ ] Cross-module: `parseDecklist(exportText(getDeck(id)))` from [S03.T06](T06-meta-queries.md) reproduces the stored deck's per-card counts for 10 sampled tournament decks.
- [ ] `pnpm lint` fails on a `node:fs` import inside `packages/shared/src/decklist/` (BR-S03.T09-05).

## Risks and open questions

- **Risk — TCG Live changes its export format** (a new section, a different trailer). Mitigation: the grammar is explicit and fixture-driven; a new section keyword is one entry in the `section` production plus a fixture, and the colon rule already absorbs unknown trailers.
- **Risk — positional parsing misreads a name ending in two short tokens** (a hypothetical card named `… SV 1`). Mitigation: no such Standard card exists today; the per-line feedback in the builder makes a misparse visible immediately, and a per-card override in [S03.T04](T04-deck-resolver.md) corrects the resolution.
- **Risk — two serializers drift**: `serializeDecklist` here and `exportText` in [S03.T06](T06-meta-queries.md) produce the same format from different row shapes. Mitigation: the cross-module acceptance check compares them on 10 real decks; if drift recurs, `exportText` should build `DeckLine[]` and delegate here — not done now, because S03.T06 reads columns this package must not know about.
- **Question — should `parseDecklist` merge duplicate lines?** Recommendation: no — merging loses the user's structure and makes per-line feedback impossible; [S03.T10](T10-deck-validation-rules.md) already aggregates by name for the copy limit.
- **Question — should the parser accept the `4 Dreepy TWM 128 PH` holo suffix** some exports carry? Not observed in the fixtures collected so far; if it appears, the rule would be "drop a trailing token that is not the number", and it needs a fixture before it is written.

## References

- `pokemon/src/pokesearch/sim/engine_adapter.py` L373–418 (`convert_decklist`) — verified: the skip rule `not line or line.startswith("#") or (":" in line and not line[0].isdigit())`, the `len(parts) < 4 or not parts[0].isdigit()` guard, `set_code, number = parts[-2].upper(), parts[-1]` with `name = " ".join(parts[1:-2])`, and the basic-energy branch matching `(?:basic )?(\w+) energy` and rewriting the line to the current `SVE` printing.
- `pokemon/src/pokesearch/search/decks.py` L412–424 (`export_text`) — verified: section titles `Pokémon` / `Trainer` / `Energy`, the `"<Title>: <copies>"` header, `"<count> <name> <set> <number>"` lines with the set/number pair omitted when no code exists, a blank line between sections, and `"\n".join(...).strip() + "\n"`.
- `pokemon/src/pokesearch/sim/optimizer.py` L49–58 (`DeckList.export_text`) — verified: the same three-section format produced from the optimizer's own row shape, which is why the round-trip test spans both producers.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: the final 60-card list (`Pokémon: 23`, `Trainer: 30`, `Energy: 7`) used as the primary fixture, including `3 Psychic Energy MEE 5` and `1 Pokégear 3.0 POR 81`.
- `pokemon/src/pokesearch/etl/deck_resolver.py` — the `nameKey` normalisation and the alias table this module relies on through [S03.T04](T04-deck-resolver.md).
- [Glossary](../../project/07-glossary.md) "Decklist (TCG Live format)"; [Decision log](../../project/02-decision-log.md) D-008 (`packages/shared` holds the pure contracts).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
