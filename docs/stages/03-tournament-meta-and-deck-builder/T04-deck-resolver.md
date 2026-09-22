# S03.T04 — Decklist line resolver

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 4 / 13 |
| Depends on | [S02.T06](../02-card-data-and-search/T06-load-cards.md), [S03.T01](T01-tournaments-schema-migration.md) |
| Unblocks | [S03.T05](T05-decks-sync-and-prune.md), [S03.T06](T06-meta-queries.md), [S03.T09](T09-decklist-parser-and-exporter.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` populated `cards`, `sets` (`ptcgo_code`, `release_date`, legality flags) and the `norm()` rule — from [S02.T06](../02-card-data-and-search/T06-load-cards.md)
- `table` `deck_cards` shape (`match_kind`, `image_fallback_url`) — from [S03.T01](T01-tournaments-schema-migration.md)
- `external` `normNumber()` semantics shared with the set/card id mapping (`TG01` → `tg1`, `001` → `1`) — the same normalisation the card ids were built with

## Outputs (proposed)
- `module` `etl/deck-resolver.ts` — `Resolver.fromDb(db, format)` building in-memory indexes; `resolve({ setCode, number, name, category }) → { cardId, matchKind, fallbackImageUrl }`; `nameKey(name)`, `speciesName(name)` ('Mega Venusaur ex' → 'Venusaur') — consumed by [S03.T05](T05-decks-sync-and-prune.md), [S03.T09](T09-decklist-parser-and-exporter.md)
- `file` `packages/etl/limitless-overrides.json` — set-code aliases `{ SVP: 'svp', 'PR-SV': 'svp', MEE: 'sve', SWSHP: 'swshp', 'PR-SW': 'swshp', SMP: 'smp', 'PR-SM': 'smp' }` and per-card overrides `{}`
- `contract` `image_fallback_url` = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/<CODE>/<CODE>_<NNN>_R_EN_XS.png`
- `contract` `MatchKind` ordering `override > exact > digits > name > none`, reported per run so a regression in resolution quality is visible

## Initial objective
Any decklist line — from Limitless or pasted by the user — maps to a card id by the same deterministic order of rules (RN-02), and the rare unresolvable line keeps its name and a fallback image instead of disappearing.

## Context

A decklist line is three weak identifiers: a PTCGO set code, a number and a printed name (`4 Dragapult ex TWM 130`). None of them is a key. Set codes are reused across a set and its gallery subset (`BRS` covers both `swsh9` and `swsh9tg`), promo codes differ between the exporter and the card database (`SVP` vs `svp`, `MEE` vs `sve`), numbers carry letters (`TG01`), and names carry parenthetical subtitles (`Professor's Research (Professor Sada)`) or a `Basic ` prefix on energies. RN-02 fixes one deterministic order through all of that, and the same order must serve both the tournament ingestion ([S03.T05](T05-decks-sync-and-prune.md)) and lists the user pastes ([S03.T09](T09-decklist-parser-and-exporter.md)) — otherwise the user's copy of a tournament list would resolve differently from the list itself.

The legacy implementation resolved **982,557** decklist lines with this order: `exact` 915,913, `override` 66,547 (every one of them coming from the `MEE` and `SVP` set aliases), `name` 93, and `none` 4. That distribution is the acceptance target: the alias table is not an afterthought, it carries 6.8 % of all lines, and the name fallback is a genuine rarity rather than a routine path.

The module builds its indexes once per run from a single query over `cards` joined to `sets`, then answers in memory — roughly 20k cards against up to a million lines, so nothing here may touch the database per line. It writes nothing: it returns a match, and [S03.T05](T05-decks-sync-and-prune.md) stores it.

## Scope

- **In scope.** `packages/etl/src/deck-resolver.ts`: the four in-memory indexes, `resolve` with the RN-02 order, candidate disambiguation, `nameKey`, `speciesName`, `normNumber` reuse, `fallbackImageUrl`, `packages/etl/limitless-overrides.json` and its loader, and the per-run `MatchKind` tally.
- **Out of scope.** Parsing text into lines ([S03.T09](T09-decklist-parser-and-exporter.md)); writing `deck_cards` ([S03.T05](T05-decks-sync-and-prune.md)); legality decisions beyond the "prefer a legal printing" tiebreak ([S03.T10](T10-deck-validation-rules.md) owns validation); prices ([S02.T07](../02-card-data-and-search/T07-prices-snapshot.md)); the card/set id mapping itself ([S02.T04](../02-card-data-and-search/T04-set-and-card-id-mapping.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-02 | **Kept.** Resolution order is: per-card override (`<CODE>-<NUM>`) → set alias + normalised number → exact `(ptcgo_code, normalised number)` → digits-only number → name (newest printing legal in the format first) → unresolved with a fallback image. Each step is tried only when the previous produced no candidate. | `Resolver.resolve()` in `deck-resolver.ts` — one branch per step, in this order | `deck-resolver.spec.ts` cases `exact`, `shared code gallery`, `override promo and energy`, `digits fallback`, `name fallback prefers legal newest`, `unresolved` |
| BR-S03.T04-01 | `nameKey(name, category)` = `norm(name)` (strip diacritics → lower → trim), then remove a trailing parenthetical group, then, when the category is `energy` or the result ends in ` energy`, remove a leading `basic `. It is byte-identical to the rule used for `cards.name_norm`. | `nameKey()` exported from `deck-resolver.ts` and imported (never re-implemented) by [S03.T06](T06-meta-queries.md) and [S03.T09](T09-decklist-parser-and-exporter.md) | `deck-resolver.spec.ts > nameKey` — `"Professor's Research (Professor Sada)" → "professor's research"`, `("Basic Fire Energy","energy") → "fire energy"`, `"Fire Energy" → "fire energy"` |
| BR-S03.T04-02 | `speciesName(name)` strips a leading `Mega `/`M ` and then repeatedly strips one trailing rule-box word (`ex`, `V`, `VMAX`, `VSTAR`, `GX`, `V-UNION`, `BREAK`, `LEGEND`, `Prism Star`, `◇`, `☆`) until the name is stable. | `speciesName()` | `deck-resolver.spec.ts > speciesName` — `"Mega Venusaur ex" → "Venusaur"`, `"Dragapult ex" → "Dragapult"`, `"Pikachu VMAX" → "Pikachu"`, `"Team Rocket's Mewtwo ex" → "Team Rocket's Mewtwo"` |
| BR-S03.T04-03 | When a `(code, number)` lookup returns several printings, the winner is a printing whose `nameKey` equals the line's; among those (or among all, if none matches) the one with the greatest `(release_date, id)`. | `pickCandidate()` | `deck-resolver.spec.ts > shared code gallery` — `("BRS","TG01","Flareon")` → the gallery card, `("BRS","1","Kricketot")` → the main-set card |
| BR-S03.T04-04 | The name fallback tries the supertype implied by the line's category first, then the other two supertypes, and inside each returns the printing that is legal in the format and, among legal ones, the newest. | the ordered `keys` list in `resolve()` and the sort of the `byName` index | `deck-resolver.spec.ts > name fallback prefers legal newest` — a Paldean Tauros printed both outside and inside Standard resolves to the legal one |
| BR-S03.T04-05 | An unresolved line returns `{ cardId: null, matchKind: "none" }` and a `fallbackImageUrl` built from the printed code and number: code upper-cased, a purely numeric number zero-padded to 3 digits, otherwise upper-cased. When code or number is missing, the URL is `null`. | `fallbackImageUrl()` | `deck-resolver.spec.ts > unresolved` — `("ZZZ","9")` ends in `/ZZZ/ZZZ_009_R_EN_XS.png`, `("BRS","TG01")` ends in `/BRS/BRS_TG01_R_EN_XS.png`, `("", "5") → null` |
| BR-S03.T04-06 | `resolve` performs no database access; all lookups hit indexes built once by `Resolver.fromDb`. | `Resolver` holds no `Db` reference after construction | `deck-resolver.spec.ts > no db access after build` — the resolver still answers after the connection is closed |
| BR-S03.T04-07 | Set aliases and per-card overrides come only from `limitless-overrides.json`; the code contains no hard-coded set code. Every alias value is an existing `sets.id` at build time, or the build fails with the offending key. | `loadOverrides()` validates against the `sets` table inside `Resolver.fromDb` | `deck-resolver.spec.ts > unknown alias target fails the build` — an alias pointing at `nope` throws with the key name |
| BR-S03.T04-08 | Over a full tournament sync, `matchKind = "none"` stays at or below 0.001 % of lines, and the per-run tally is reported so a drift is visible. | the counter returned by `Resolver.stats()`, written into `etl_runs` by [S03.T05](T05-decks-sync-and-prune.md) | acceptance check on real data (legacy reference: 4 of 982,557 lines = 0.0004 %) |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `cards` ⨝ `sets` | R | etl (`Resolver.fromDb`) | once per sync run, before any line is resolved | one `SELECT c.id, c.name, c.number, c.supertype, c.release_date, c.set_id, s.ptcgo_code, <legal>` — never per line (BR-S03.T04-06) | ~20k rows; four indexes built from it |
| `packages/etl/limitless-overrides.json` | R | etl | at `Resolver.fromDb` | validated against `sets.id`; a missing file means empty alias and card maps, not a failure | edited by hand; every entry earns a test |
| `deck_cards.card_id`, `.match_kind`, `.image_fallback_url` | (values produced, not written) | etl | per line | the resolver returns them; [S03.T05](T05-decks-sync-and-prune.md) inserts them; `card_id IS NULL ⇔ match_kind = 'none'` (BR-S03.T01-02) | the resolver is the only producer of these three values |
| `deck_cards.name_key` | (value produced) | etl | per line | `nameKey(resolvedName ?? printedName, category)` — the canonical name when resolution succeeded | this is what every meta query groups by |
| resolution tally | C (in memory) | etl | per run | counts per `MatchKind` plus a map of unresolved `(code, number, name, category)` → occurrences | consumed by `etl_runs` stats and `decks_unresolved.csv` |

## Interfaces

**`packages/etl/src/deck-resolver.ts`**

```ts
export type MatchKind = "exact" | "override" | "digits" | "name" | "none";
export type DeckCategory = "pokemon" | "trainer" | "energy";

export interface ResolveInput  { setCode?: string | null; number?: string | null; name?: string | null; category?: DeckCategory | null }
export interface ResolveResult { cardId: string | null; matchKind: MatchKind; cardName: string | null; fallbackImageUrl: string | null }

export interface Overrides { sets: Record<string, string>; cards: Record<string, string> }

export class Resolver {
  static fromDb(db: Db, format?: string): Resolver;          // format default "STANDARD"
  static fromRows(rows: CardIndexRow[], overrides?: Overrides): Resolver;   // for tests
  resolve(input: ResolveInput): ResolveResult;
  stats(): { kinds: Record<MatchKind, number>; unresolved: Map<string, number> };
}

export function nameKey(name: string | null | undefined, category?: DeckCategory | null): string;
export function speciesName(name: string): string;
export function normNumber(num: string | null | undefined): string;   // "TG01" → "tg1", "001" → "1"
export function fallbackImageUrl(setCode?: string | null, number?: string | null, size?: "XS" | "SM" | "LG"): string | null;
export const LIMITLESS_IMG_BASE = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci";
export const CATEGORY_SUPERTYPE: Record<DeckCategory, string> = { pokemon: "Pokémon", trainer: "Trainer", energy: "Energy" };
```

**Indexes built by `fromDb`** (all keyed on upper-cased codes and `normNumber`ed numbers):

| Index | Key | Used by step |
|---|---|---|
| `bySetNum` | `(sets.id, normNumber(number))` | set-alias override |
| `byCodeNum` | `(ptcgo_code, normNumber(number))` | exact |
| `byCodeDigits` | `(ptcgo_code, digitsOnly(number))` where `digitsOnly` keeps digits, strips leading zeros, `"" → "0"` | digits fallback |
| `byName` | `(supertype, nameKey(name, categoryOf(supertype)))`, each bucket sorted by `legal DESC, release_date DESC` | name fallback |

**Legality expression.** `legal` is `COALESCE(cards.tcgdex_legal_standard, cards.legal_standard = 'Legal')` for Standard and the `expanded` counterpart for Expanded — the same expression [S03.T06](T06-meta-queries.md) and [S03.T10](T10-deck-validation-rules.md) reuse, exported once as `legalSql(format, alias)`.

**`packages/etl/limitless-overrides.json`**

```json
{
  "sets": { "SVP": "svp", "PR-SV": "svp", "MEE": "sve", "SWSHP": "swshp", "PR-SW": "swshp", "SMP": "smp", "PR-SM": "smp" },
  "cards": {}
}
```

`sets` maps a printed PTCGO code to a `sets.id`; `cards` maps a literal `"<CODE>-<NUMBER>"` (as printed, not normalised) directly to a `cards.id` and wins over everything else. Every added entry must come with a `deck-resolver.spec.ts` case naming the list line that motivated it.

**`resolve` order, precisely.** 1) `cards["<CODE>-<NUM>"]` → `override`. 2) if both code and number exist: alias → `bySetNum[(aliasTarget, normNumber(num))]` with kind `override`; else `byCodeNum[(CODE, normNumber(num))]` with kind `exact`; else `byCodeDigits[(CODE, digitsOnly(num))]` with kind `digits`. 3) if candidates exist, disambiguate by BR-S03.T04-03 and return. 4) otherwise, for the supertype of `category` and then the other two, return the head of `byName[(supertype, nameKey)]` with kind `name`. 5) otherwise `{ cardId: null, matchKind: "none", fallbackImageUrl }`.

## Implementation steps

1. Port `normNumber` from the shared id-mapping module of [S02.T04](../02-card-data-and-search/T04-set-and-card-id-mapping.md) or re-export it; assert `TG01 → tg1` and `001 → 1` so the two never diverge.
2. Write `nameKey` and `speciesName` with their table-driven tests (BR-S03.T04-01, -02) — they are used far beyond this file.
3. Write `fallbackImageUrl` and its three cases, including the `null` when code or number is missing.
4. Add `limitless-overrides.json` with the seven set aliases and an empty `cards` map, plus `loadOverrides()` and its validation against `sets.id` (BR-S03.T04-07).
5. Build the four indexes in `Resolver.fromDb` from one SELECT; sort the `byName` buckets by `legal DESC, release_date DESC`.
6. Implement `resolve` step by step, adding one spec case per step before moving to the next.
7. Add `pickCandidate` and the gallery test (`BRS`/`TG01` vs `BRS`/`1`), which is the case a naive `(code, number)` map gets wrong.
8. Add `stats()` with the kind tally and the unresolved map keyed by `(code, number, name, category)`, ready for the CSV report of [S03.T05](T05-decks-sync-and-prune.md).
9. Add a benchmark spec resolving 100k synthetic lines to confirm the in-memory path stays well under a second.

## Edge cases and error handling

- **`4 Basic Psychic Energy MEE 5`** → the card override map misses; the set alias `MEE → sve` hits `bySetNum[("sve","5")]`; `matchKind = "override"`. This single alias plus `SVP` accounts for all 66,547 override matches in the legacy data.
- **A set code shared by a gallery: `BRS TG01` and `BRS 1`** → both live under `ptcgo_code = "BRS"` but in different sets (`swsh9tg`, `swsh9`). `normNumber` keeps them apart (`tg1` vs `1`), so the exact step already returns one candidate each; no name matching is needed.
- **`3 Psychic Energy XYZ 1`, a set code that does not exist** → the exact and digits steps find nothing, so the name fallback strips the implicit `Basic ` and returns the current Basic Psychic Energy with `matchKind = "name"`.
- **`1 Professor's Research (Professor Sada) SVI 189`** with that printing rotated out → the exact step still matches `SVI 189` (resolution is not legality), and `match_kind` stays `exact`; [S03.T10](T10-deck-validation-rules.md) is what tells the user the card is not Standard-legal.
- **`1 Professor's Research (Professor Sada)` with no code or number** (a hand-typed line) → straight to the name fallback: the parenthetical is stripped by `nameKey`, and the newest legal `Professor's Research` printing wins.
- **A number written as `0130`** → `normNumber` strips leading zeros to `130`, so the exact step matches; the digits step would have caught it too, but one step earlier means a better `matchKind`.
- **Two printings share `(code, digits)` and neither name matches** (a code reused by a promo run) → `pickCandidate` falls back to the newest `(release_date, id)`; the result is `digits`, and the line appears in the tally so the case can be added to `limitless-overrides.json` if it recurs.
- **An unresolved line (`ZZZ 9 Nonexistent Card`)** → `{ cardId: null, matchKind: "none" }` with `fallbackImageUrl` `…/ZZZ/ZZZ_009_R_EN_XS.png`; the deck keeps 60 cards and the meta pages render the CDN image, which is what kept the legacy lists visually complete despite 4 unresolved lines.
- **An override pointing at a card id that no longer exists after a card reload** → `Resolver.fromDb` validation catches alias targets, but a stale `cards` entry only shows up at resolve time; it is treated as a miss, the next step runs, and a warning names the override key.
- **The `cards` table is empty** (resolver built before [S02.T06](../02-card-data-and-search/T06-load-cards.md) ran) → `fromDb` throws `EmptyCardIndex` instead of quietly resolving everything to `none`; a sync that silently produced 982k unresolved lines would be far worse than a failure.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/etl test -t "deck-resolver"` green, with one case per RN-02 step.
- [ ] `deck-resolver.spec.ts > exact`: `("TWM","130","Dragapult ex","pokemon")` → `twm-130`, kind `exact`.
- [ ] `deck-resolver.spec.ts > shared code gallery`: `("BRS","TG01","Flareon")` → the `swsh9tg` printing and `("BRS","1","Kricketot")` → the `swsh9` printing (BR-S03.T04-03).
- [ ] `deck-resolver.spec.ts > override promo and energy`: `("SVP","149","Pecharunt")` and `("MEE","5","Psychic Energy","energy")` both return kind `override` (RN-02).
- [ ] `deck-resolver.spec.ts > name fallback prefers legal newest`: a name with an out-of-format older printing and a legal newer one returns the legal one, kind `name` (BR-S03.T04-04).
- [ ] `deck-resolver.spec.ts > unresolved`: kind `none`, `cardId` null, and the two fallback-image URL shapes above (BR-S03.T04-05).
- [ ] `deck-resolver.spec.ts > nameKey` and `> speciesName` pass all eight documented cases (BR-S03.T04-01, -02).
- [ ] `deck-resolver.spec.ts > unknown alias target fails the build` throws naming the offending alias key (BR-S03.T04-07).
- [ ] End-to-end on the Dhelmise list (`benchmarks/otimizacao_dhelmise.md`): all 60 cards resolve, including `3 Psychic Energy MEE 5` as `override` and `4 Telepathic Psychic Energy POR 88` as `exact`; zero `none`.
- [ ] After a real `etl decks` run, the `etl_runs` stats show `none ≤ 0.001 %` of lines and the kind distribution is within an order of magnitude of the legacy 915,913 / 66,547 / 93 / 4 (BR-S03.T04-08).

## Risks and open questions

- **Risk — the alias table rots at each new promo set.** A new `PR-ME`-style code would send tens of thousands of lines to the name fallback. Mitigation: the tally per run (BR-S03.T04-08) makes the shift visible in one number, and the unresolved CSV of [S03.T05](T05-decks-sync-and-prune.md) names the code; adding an alias is a one-line JSON edit plus a test.
- **Risk — `nameKey` drifting from `cards.name_norm`.** Two implementations of the same normalisation eventually disagree and silently split a card's usage in two. Mitigation: `nameKey` is exported from here and imported everywhere; a spec asserts `nameKey(card.name) === card.name_norm` for a sample of 500 loaded cards.
- **Risk — the name fallback picks a wrong printing for cards whose text differs between printings** (relevant from S05 on, where effects are keyed by text). Mitigation: the fallback is 93 lines in a million; [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) counts copies by text, so a wrong printing shows up as a coverage anomaly rather than as silence.
- **Question — should per-card overrides ever be authored automatically** (for instance from the unresolved CSV)? Recommendation: no — each entry is a claim about two data sources disagreeing and deserves a test. The user decides if the manual list ever exceeds a dozen entries.
- **Question — does the resolver need an Expanded index?** `legalSql` supports it and `Resolver.fromDb(db, "EXPANDED")` works today, but nothing calls it. Decided when a non-Standard window is first requested in [S03.T06](T06-meta-queries.md).

## References

- `pokemon/src/pokesearch/etl/deck_resolver.py` — verified: the docstring stating the resolution order, `name_key` (strip parenthetical, strip `basic ` for energies), `species_name` (`_MEGA_PREFIX_RE`, repeated `_RULEBOX_RE`), `fallback_image_url` (zero-pad to 3 for numeric, upper-case otherwise), `_LEGAL_SQL` for STANDARD/EXPANDED, the four indexes in `Resolver.__init__`, the `from_conn` query, `resolve` step order, and `_pick_by_name` (prefer same `name_key`, then newest `release_date`, then id).
- `pokemon/tests/test_deck_resolver.py` — verified: every acceptance case above, including the gallery pair (`BRS TG01` / `BRS 1`), the `SVP`/`MEE` overrides, the Paldean Tauros legal-newest case, `Professor's Research (Professor Sada)` and the two fallback-image URLs.
- `pokemon/src/pokesearch/etl/limitless_overrides.json` — verified: the seven set aliases and the empty `cards` object reproduced above.
- `pokemon/src/pokesearch/etl/idmap.py` L126–134 — verified: `norm_number` regex `([a-z\-]*)0*(\d+)([a-z]*)` with the documented `TG01 → tg1`, `001 → 1`.
- `pokemon/src/pokesearch/etl/load.py` L18–19 — verified: `norm(s) = unidecode(s).lower().strip()`, the rule `nameKey` builds on.
- `pokemon/src/pokesearch/etl/decks.py` L73–94 — verified: `build_card_rows` stores `name_key(m.name or item["name"], cat)`, i.e. the canonical name when resolved, and counts unresolved lines by `(code, number, name, category)`.
- `pokemon/src/pokesearch/config.py` L56 — verified: `LIMITLESS_IMG_BASE = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci"`.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — the 60-card fixture used by the end-to-end check.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-02.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
