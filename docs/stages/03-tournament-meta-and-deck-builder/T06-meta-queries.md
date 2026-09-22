# S03.T06 — Meta queries: archetypes, partners, alternatives, deck read

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 6 / 13 |
| Depends on | [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md), [S03.T04](T04-deck-resolver.md), [S03.T05](T05-decks-sync-and-prune.md) |
| Unblocks | [S03.T07](T07-api-meta-endpoints.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) |
| Parallel with | [S03.T10](T10-deck-validation-rules.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `cards_market_usd`, `price_history` — from [S02.T07](../02-card-data-and-search/T07-prices-snapshot.md)
- `table` populated meta tables and `status(db)` — from [S03.T05](T05-decks-sync-and-prune.md)
- `module` `nameKey`, `speciesName`, `legalSql` — imported, never re-implemented, from the resolver of [S03.T04](T04-deck-resolver.md)

## Outputs (proposed)
- `module` `apps/api/src/meta/queries.ts` — `parseSelection(names) → nameKeys (≤ 6)`, `findDecks(db, keys, format, days)`, `deckWeight(date, placing)`, `rankDecklists(decks, sort ∈ quality|recent|placing, limit)`, `archetypesFor(db, decks, …)` with `coreCards` (≥ 60 % inclusion), `partners(db, decks, keys, category)` (support, avg count, lift), `alternatives(db, name, format, days) → { reference, printings (cheapest legal flag), evolutionLine, similar }`, `suggest(db, q)`, `windowStats(db)`, `getDeck(db, id)` (grouped cards, counts, `priceUsd`, `priceCoverage`, unresolved), `exportText(deck)`, `cardUsage(db, format, days)` (copies per name_key over the window) — consumed by [S03.T07](T07-api-meta-endpoints.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md)
- `contract` the `DeckRow`, `ArchetypePanel`, `PartnerRow`, `AlternativesResult`, `DeckDetail`, `CardUsage` and `WindowStats` types these functions return, shared with the API layer

## Initial objective
Every question the meta pages and the optimizer ask about tournament decks has one tested function with the legacy semantics (quality weighting, core cards, lift, similarity), computed live over the meta window.

## Context

The meta tables hold what tournaments played; this module turns them into the handful of answers the product actually asks. It lives in `apps/api` and is pure read, so it can run on a read-only connection while an ETL sync is in flight.

Four semantics are preserved exactly, because the legacy tuned them against real data and every downstream number inherits them. **Deck weight** is recency times a placing bonus — a 1st place two weeks ago outranks a 33rd place yesterday. **Quality** multiplies that by event size and by 1.5 for official in-person events, which is why 3 scraped tournaments matter next to 400 online ones. **Core cards** are those in at least 60 % of an archetype's decks, which makes a panel readable instead of a 60-row table. **Lift** compares a partner's weighted support inside the selection with its frequency across the window, so "every deck plays Ultra Ball" is not mistaken for a discovery.

The reach goes beyond the meta pages: `cardUsage` is the coverage denominator ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)), archetype shares become opponent weights ([S04.T17](../04-game-engine-core/T17-web-evaluate-page.md), [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md)), and inclusion statistics seed the optimizer's pool ([S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md)). A formula change here moves numbers in four later stages — hence one business rule and one test per formula.

Everything is computed live: the window is a parameter (7–365 days), nothing is materialised, and the one query that would be slow ("which printing of this card is most played") is served by the covering index of [S03.T01](T01-tournaments-schema-migration.md) — 8.5 s → 0.11 s in the legacy database.

## Scope

- **In scope.** `apps/api/src/meta/queries.ts` and its helpers: selection parsing, deck fetch and decoration, weights, ranking, archetype panels with core cards, partners with lift, alternatives, autocomplete, window statistics, single-deck read with price, TCG Live export, `cardUsage`.
- **Out of scope.** HTTP shape, clamping and errors ([S03.T07](T07-api-meta-endpoints.md)); rendering ([S03.T08](T08-web-meta-pages.md)); writes of any kind ([S03.T05](T05-decks-sync-and-prune.md)); the text parser and canonical serializer ([S03.T09](T09-decklist-parser-and-exporter.md) — `exportText` here formats a *tournament* deck read from the database); user-list comparison ([S03.T13](T13-deck-comparison-with-tournament-lists.md)); price collection ([S02.T07](../02-card-data-and-search/T07-prices-snapshot.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It does, however, own the formulas that RN-03's window is consumed through, and its `cardUsage` is the denominator RN-70's coverage numbers are computed over.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S03.T06-01 | `deckWeight(date, placing) = 0.5 ** (ageDays / 30) × bonus`, with `bonus` 2.0 for placing 1, 1.6 for ≤ 4, 1.3 for ≤ 8, 1.1 for ≤ 16 and 1.0 otherwise (including a null placing); a deck with no date is treated as 60 days old. | `deckWeight()` in `queries.ts` | `meta-queries.spec.ts > deckWeight` — a 30-day-old 1st place weighs `0.5 × 2.0 = 1.0`; a same-day 33rd weighs 1.0; a null date weighs `0.5 ** 2 = 0.25` |
| BR-S03.T06-02 | `quality = deckWeight × (1 + log10(max(players, 1)) / 2) × (official ? 1.5 : 1.0)`, where `official` means `tournaments.source = 'limitless_web'`. | `decorate()` in `queries.ts` | `meta-queries.spec.ts > quality` — two identical decks, one from a 800-player official event and one from a 32-player online event, rank official first |
| BR-S03.T06-03 | A selection is at most 6 name keys, deduplicated in input order; `findDecks` returns only decks containing **all** of them as Pokémon lines (`GROUP BY d.id HAVING COUNT(DISTINCT dc.name_key) = keys.length`), inside the format and window. | `parseSelection()` and the `findDecks` SQL | `meta-queries.spec.ts > selection` — 8 names collapse to 6; `> findDecks AND semantics` — selecting two Pokémon returns only the deck holding both |
| BR-S03.T06-04 | A core card of an archetype appears in at least `ceil(n × 0.6)` of that archetype's `n` decks in the window; at most 24 core cards are returned, Pokémon first, then by descending deck count and average copies. | `coreCards()` SQL `HAVING decks_with >= :threshold … LIMIT 24` | `meta-queries.spec.ts > core cards` — a card in 2 of 2 decks is core, a card in 1 of 3 is not |
| BR-S03.T06-05 | `partners` returns an empty list when the selection matched fewer than 3 decks; otherwise support is the weighted share of the selected decks containing the card, and `lift = support ÷ (decksWithCardInWindow ÷ decksInWindow)`. Selected cards themselves are excluded. | `partners()` | `meta-queries.spec.ts > partners` — a card in every selected deck has support 1.0; a card rarer in the window than in the selection has lift > 1; a 2-deck selection returns `[]` |
| BR-S03.T06-06 | The similarity score is `0.30·HP + 0.25·max damage + 0.15·min cost + 0.10·has ability + 0.10·rule box + 0.10·meta usage`, each term in [0, 1] and the weights summing to 1; candidates share the reference's stage and at least one type and are legal in the format, one printing per name. | `similar()` | `meta-queries.spec.ts > similarity weights` asserts the six constants sum to 1 and that an identical-stats card scores 1.0 |
| BR-S03.T06-07 | `getDeck` returns `priceUsd = Σ cards_market_usd.market_usd × count` over priced lines and `priceCoverage = pricedCopies ÷ totalCopies`; an unpriced line contributes 0 to the total and lowers the coverage. `unresolved` counts lines with no `card_id`. | `getDeck()` | `meta-queries.spec.ts > deck price` — a 60-card deck with 6 unpriced copies reports coverage 0.9 and a total excluding them |
| BR-S03.T06-08 | `exportText(getDeck(id))` produces TCG Live text whose sections are `Pokémon:`, `Trainer:`, `Energy:` with their copy totals, one `"<count> <name> <SET> <NUMBER>"` line per card in `idx` order, a blank line between sections and a trailing newline; the name is the one the source printed, not the canonical one. | `exportText()` | `meta-queries.spec.ts > export` — the fixture deck exports `Pokémon: 11`, `3 Dragapult ex TWM 130` and `3 Psychic Energy MEE 5`; round-trip through [S03.T09](T09-decklist-parser-and-exporter.md) yields identical counts |
| BR-S03.T06-09 | No function in this module issues `INSERT`, `UPDATE` or `DELETE`; the module is usable on a read-only connection. | code review plus the writer-ownership SQL lint ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `meta-queries.spec.ts > read only` — the whole suite runs against a database opened with `readonly: true` |
| BR-S03.T06-10 | `cardUsage` aggregates `deck_cards` by `name_key` over the window and reports copies, decks, inclusion and the most-played printing, reading only `ix_deck_cards_printing`. | the `cardUsage` SQL, whose projected columns are exactly the index columns | `meta-queries.spec.ts > cardUsage plan` — `EXPLAIN QUERY PLAN` names `ix_deck_cards_printing`; `> cardUsage counts` on the fixture |
| BR-S03.T06-11 | Any `IN (…)` list built from deck ids or name keys is chunked at 500 parameters, so a 5,000-deck window never exceeds the SQLite parameter limit. | `chunked()` helper used by `partners`, `similar` and `cardUsage` | `meta-queries.spec.ts > chunking` — a 1,200-id selection issues 3 statements and returns the same result as one |

## Data operations

All operations are reads. `<cutoff>` is `now − days` as ISO text, `<fmt>` the format.

| Query | SQL sketch | Result shape |
|---|---|---|
| `parseSelection(names)` | none (pure) | `string[]` of ≤ 6 name keys |
| `findDecks(db, keys, fmt, days)` | `SELECT d.*, t.*, a.name, a.icons_json FROM decks d JOIN tournaments t … LEFT JOIN archetypes a … [JOIN deck_cards dc ON dc.deck_id = d.id AND dc.category = 'pokemon' AND dc.name_key IN (…)] WHERE t.format = ? AND t.date >= ? GROUP BY d.id HAVING COUNT(DISTINCT dc.name_key) = :n ORDER BY t.date DESC LIMIT 5000` | `DeckRow[]` decorated with `weight`, `quality`, `official`, `icons` |
| `rankDecklists(decks, sort, limit)` | none (in memory) | the same rows sorted by `quality` desc / `date` desc then best placing / placing asc, cut at `limit` (default 30) |
| `archetypesFor(db, decks, fmt, days)` | grouping in memory + per archetype `coreCards` | `ArchetypePanel[]` (≤ 8) with `share`, `bestPlacing`, `top8`, `winRate`, `core` |
| `coreCards(db, archetypeId, fmt, cutoff)` | `SELECT dc.name_key, MIN(dc.name), dc.category, COUNT(DISTINCT dc.deck_id) decks_with, ROUND(AVG(dc.count),1) avg_count, MAX(dc.card_id) FROM deck_cards dc JOIN decks d … JOIN tournaments t … WHERE d.archetype_id = ? AND t.format = ? AND t.date >= ? GROUP BY dc.name_key, dc.category HAVING decks_with >= ? ORDER BY dc.category = 'pokemon' DESC, decks_with DESC, avg_count DESC LIMIT 24` | `CoreCard[]` with `inclusion` |
| `partners(db, decks, keys, category)` | `SELECT deck_id, name_key, name, count, card_id FROM deck_cards WHERE category = ? AND deck_id IN (…500…)` + one window-frequency query per candidate batch | `PartnerRow[]` with `support`, `avgCount`, `lift`, `decks` |
| `alternatives(db, name, fmt, days)` → reference | `SELECT … FROM cards c JOIN sets s … LEFT JOIN cards_market_usd m … WHERE c.supertype = 'Pokémon' AND c.name_norm LIKE ? ORDER BY c.release_date DESC` | one card, preferring a legal printing |
| ↳ printings | same projection `WHERE c.name = ?` | all printings with `cheapestLegal` on the cheapest priced legal one |
| ↳ evolution line | up to 3 hops up via `evolves_from`; 2 levels down via `SELECT DISTINCT name FROM cards WHERE evolves_from IN (…) AND supertype = 'Pokémon'` | ordered list with `relation` (`pré-evolução` / `evolução`) |
| ↳ similar | `WHERE c.supertype = 'Pokémon' AND <legal> = 1 AND c.stage IS ? AND EXISTS (SELECT 1 FROM json_each(c.types_json) WHERE value IN (…))` plus a usage count per name key | ≤ 12 scored cards with pt-BR `reasons` |
| `suggest(db, q, fmt, days)` | `SELECT c.name, MAX(c.release_date) newest, MAX(c.img_webp_low) FROM cards c WHERE c.supertype = 'Pokémon' AND <legal> = 1 AND (c.name_norm LIKE ? OR c.name_norm LIKE ?) GROUP BY c.name ORDER BY (c.name_norm LIKE ?) DESC, newest DESC LIMIT 60` + usage per name key | ≤ 12 `{ name, usage, img }`, most used first |
| `windowStats(db, fmt, days)` | `SELECT COUNT(DISTINCT d.id), COUNT(DISTINCT t.id), MAX(t.date) FROM decks d JOIN tournaments t … WHERE t.format = ? AND t.date >= ?` | `{ decks, tournaments, newest, format, days }` |
| `getDeck(db, id)` | the deck row plus `SELECT dc.*, c.name card_name, s.ptcgo_code, c.number card_number, c.img_*, m.market_usd FROM deck_cards dc LEFT JOIN cards c … LEFT JOIN sets s … LEFT JOIN cards_market_usd m … WHERE dc.deck_id = ? ORDER BY dc.idx` | `DeckDetail` with `groups`, `counts`, `total`, `priceUsd`, `priceCoverage`, `unresolved` |
| `exportText(deck)` | none (pure) | TCG Live text (BR-S03.T06-08) |
| `cardUsage(db, fmt, days)` | `SELECT dc.name_key, dc.category, MIN(dc.name), COUNT(DISTINCT dc.deck_id) decks, SUM(dc.count) copies, dc.card_id, dc.set_code, dc.number FROM deck_cards dc JOIN decks d … JOIN tournaments t … WHERE t.format = ? AND t.date >= ? GROUP BY dc.name_key, dc.card_id, dc.set_code, dc.number` | `Map<nameKey, CardUsage>` with `copies`, `decks`, `inclusion`, `avgCount`, most-played printing |

## Interfaces

**`apps/api/src/meta/queries.ts`**

```ts
export const MAX_SELECTION = 6;
export type Sort = "quality" | "recent" | "placing";

export function parseSelection(names: readonly string[] | null): string[];
export function deckWeight(dateIso: string | null, placing: number | null, now?: Date): number;
export function findDecks(db: Db, keys: readonly string[], format?: string, days?: number, limit?: number): DeckRow[];
export function rankDecklists(decks: DeckRow[], sort?: Sort, limit?: number): DeckRow[];          // limit default 30
export function archetypesFor(db: Db, decks: DeckRow[], format?: string, days?: number,
                              opts?: { top?: number; coreThreshold?: number }): ArchetypePanel[]; // 8 / 0.6
export function partners(db: Db, decks: DeckRow[], keys: readonly string[], category: DeckCategory,
                         format?: string, days?: number, opts?: { minDecks?: number; top?: number }): PartnerRow[]; // 3 / 20
export function alternatives(db: Db, name: string, format?: string, days?: number): AlternativesResult;
export function suggest(db: Db, q: string, format?: string, days?: number, limit?: number): SuggestItem[];
export function windowStats(db: Db, format?: string, days?: number): WindowStats;
export function getDeck(db: Db, deckId: string): DeckDetail | null;
export function exportText(deck: DeckDetail): string;
export function cardUsage(db: Db, format?: string, days?: number): Map<string, CardUsage>;

export interface DeckRow {          // the deck and tournament columns, plus the derived fields below
  id: string; player: string | null; playerName: string | null; country: string | null;
  placing: number | null; wins: number | null; losses: number | null; ties: number | null;
  archetypeId: string | null; archetype: string | null; icons: string[];
  cardTotal: number; resolvedCount: number; url: string | null;
  tournamentId: string; tournament: string; date: string; dateShort: string;
  players: number | null; format: string; source: string; platform: string | null;
  official: boolean; weight: number; quality: number;     // derived by decorate()
}
export interface ArchetypePanel { id: string | null; name: string; icons: string[]; n: number; share: number;
  score: number; bestPlacing: number | null; top8: number; winRate: number | null; core: CoreCard[] }
export interface CoreCard { nameKey: string; name: string; category: DeckCategory; decksWith: number;
  inclusion: number; avgCount: number; cardId: string | null; img: string | null }
export interface PartnerRow { nameKey: string; name: string; support: number; avgCount: number;
  lift: number; decks: number; cardId: string | null; img: string | null }
export interface AlternativesResult { reference: CardBrief | null; printings: PrintingBrief[];
  evolutionLine: LineEntry[]; similar: SimilarCard[] }
export interface DeckDetail extends DeckRow { groups: Record<DeckCategory, DeckCardDetail[]>;
  counts: Record<DeckCategory, number>; total: number; priceUsd: number; priceCoverage: number; unresolved: number }
export interface CardUsage { nameKey: string; name: string; category: DeckCategory; decks: number; copies: number;
  inclusion: number; avgCount: number; cardId: string | null; setCode: string | null; number: string | null }
export interface WindowStats { decks: number; tournaments: number; newest: string | null; format: string; days: number }
```

**Formulas, verbatim.**

```
weight  = 0.5 ** (ageDays / 30) × placingBonus(placing)
          placingBonus: 1 → 2.0 | ≤ 4 → 1.6 | ≤ 8 → 1.3 | ≤ 16 → 1.1 | else/null → 1.0
          ageDays = max(0, (now − date) / 86400); a null date counts as 60 days
quality = weight × (1 + log10(max(players, 1)) / 2) × (source = 'limitless_web' ? 1.5 : 1.0)
support(k) = Σ weight(d) over selected decks d containing k  ÷  Σ weight(d) over all selected decks
lift(k)    = support(k) ÷ max(decksWithK(window) / decksIn(window), 1e-9)
similarity = 0.30·max(0, 1 − |Δhp|/120) + 0.25·max(0, 1 − |Δmaxdmg|/150) + 0.15·max(0, 1 − |Δmincost|/3)
           + 0.10·(sameAbilityPresence ? 1 : 0.4) + 0.10·(sameRuleBox ? 1 : 0.5) + 0.10·min(1, usage/50)
price(deck)        = Σ market_usd × count over priced lines
priceCoverage(deck)= priced copies ÷ total copies
```

**Export format.** Sections in the fixed order Pokémon → Trainer → Energy, empty ones omitted; header `"<Title>: <copies>"`; lines `"<count> <name> <SET> <NUMBER>"` where `SET` is `deck_cards.set_code` or the resolved card's `sets.ptcgo_code`, and `NUMBER` is `deck_cards.number` or the card's `number`; the trailing pair is omitted when no code is known; one blank line between sections; exactly one trailing newline.

**pt-BR strings.** The `relation` labels (`pré-evolução`, `evolução`), the similarity `reasons` (`HP 320`, `dano 200`, `tem habilidade`, `ex`, `12 decks`) and the placeholder `Sem arquétipo` are UI labels returned as data (D-006). They live in one exported constant object, so [S03.T08](T08-web-meta-pages.md) can restyle them without touching the queries.

## Implementation steps

1. Port `deckWeight`, `quality` and `parseSelection` with table-driven tests; they gate every ranking below.
2. Write `findDecks` with and without a selection, plus `decorate()` (icons JSON, weight, quality, `official`, `dateShort`).
3. Write `rankDecklists` for the three sorts, asserting the legacy tie-breaks (placing sort puts null placings last).
4. Write `archetypesFor` and `coreCards`, including the `ceil(n × threshold)` boundary.
5. Write `partners` with chunking, the `minDecks` guard and the lift denominator.
6. Write `alternatives` in three independent pieces (printings with `cheapestLegal`, evolution line up and down, `similar` with the six-term score) so each has its own test.
7. Write `getDeck` and `exportText`; assert the round-trip against [S03.T09](T09-decklist-parser-and-exporter.md).
8. Write `suggest` and `windowStats`.
9. Write `cardUsage` and assert its query plan uses `ix_deck_cards_printing`.
10. Build the shared test fixture: load ~8 cards, ingest one fixture tournament with 2 decks through [S03.T05](T05-decks-sync-and-prune.md), and reuse it across the whole spec, as the legacy `test_decks.py` did.

## Edge cases and error handling

- **An archetype with fewer than 3 decks in the selection** → `partners` returns `[]` rather than reporting a 100 % support computed from two lists; the UI shows "sample too small" instead of a spurious partner.
- **A selection that matches no deck** → `findDecks` returns `[]`, `archetypesFor` and `partners` return `[]`, `alternatives` still answers (it depends only on the card tables), and `windowStats` still reports the window size, so the page explains itself.
- **A deck whose tournament has `players = NULL`** (a scraped event with an unknown type) → `log10(max(players, 1)) = 0`, so quality equals weight; the deck is not discarded.
- **A deck with a null placing** → placing bonus 1.0, and in the `placing` sort it goes after every placed deck rather than being treated as placing 0.
- **An archetype id that is null** (a deck Limitless did not classify) → grouped under the label `Sem arquétipo` with no core cards, since core cards need an archetype id to query by.
- **A card name that matches several species by prefix** (`Mega Venusaur ex` vs `Venusaur ex`) → `alternatives` keeps only candidates whose `nameKey` equals the requested key, so a prefix match never silently answers about another card.
- **An evolution line with a cycle or a repeated name** → the `seen` set and the fixed hop limits (3 up, 2 down) terminate it.
- **A reference Pokémon with no types** (a rules-box-only printing) → `similar` returns `[]` instead of comparing against every Pokémon in the format.
- **A deck line that is unresolved** → it has no `card_id`, so it contributes to `total` and to `unresolved`, contributes 0 to `priceUsd`, lowers `priceCoverage`, and still exports with its printed name, set code and number.
- **A query string shorter than 2 characters in `suggest`** → returns `[]` without touching the database, which is what keeps the autocomplete from scanning `cards` on every keystroke.
- **A window of 365 days over a pruned database** → the 180-day prune of [S03.T05](T05-decks-sync-and-prune.md) means the answer is truncated at 180 days; `windowStats.newest` and the deck count make that visible rather than implying missing data.

## Acceptance / verification

- [ ] `pnpm --filter api test -t "meta-queries"` green, with the fixture built by ingesting a recorded tournament through [S03.T05](T05-decks-sync-and-prune.md) (the legacy `test_decks.py` structure).
- [ ] `meta-queries.spec.ts > findDecks AND semantics`: selecting `["Dragapult ex"]` returns both fixture decks; `["Dragapult ex", "Dusknoir"]` returns only the deck holding both; `["Pikachu"]` returns `[]`; a 8-name selection collapses to 6 keys (BR-S03.T06-03).
- [ ] `meta-queries.spec.ts > ranking and archetypes`: the 1st-place deck leads both the `quality` and the `placing` sorts; the panel reports `bestPlacing = 1`, `winRate = 1.0` and core cards including `dragapult ex`, `dreepy` and `ultra ball` (BR-S03.T06-01, -02, -04).
- [ ] `meta-queries.spec.ts > partners`: a card present in every selected deck has support 1.0 and `avgCount` 4; a card in a subset has `0 < support < 1` and `lift > 1`; a 2-deck selection yields `[]` (BR-S03.T06-05).
- [ ] `meta-queries.spec.ts > alternatives`: the reference resolves to the expected printing, the evolution line starts with the two pre-evolutions in order, every similar card carries at least one reason, and the weights sum to 1 (BR-S03.T06-06).
- [ ] `meta-queries.spec.ts > getDeck and export`: totals and per-category counts match the ingested fixture, `unresolved` counts the unmatched line, and the export contains `Pokémon: 11`, `3 Dragapult ex TWM 130` and `3 Psychic Energy MEE 5`; `getDeck("nope")` returns `null` (BR-S03.T06-07, -08).
- [ ] `meta-queries.spec.ts > export round-trip`: `parseDecklist(exportText(getDeck(id)))` from [S03.T09](T09-decklist-parser-and-exporter.md) yields the same per-card counts, and re-serialising gives byte-identical text (BR-S03.T06-08).
- [ ] `meta-queries.spec.ts > cardUsage plan`: `EXPLAIN QUERY PLAN` for `cardUsage` names `ix_deck_cards_printing`, and on real data the call over a 90-day window returns in under 0.5 s (BR-S03.T06-10).
- [ ] `meta-queries.spec.ts > read only`: the entire suite passes against a connection opened with `readonly: true` (BR-S03.T06-09).
- [ ] `meta-queries.spec.ts > suggest`: `"drag"` returns the expected Pokémon first with its usage count; `"d"` returns `[]`.

## Risks and open questions

- **Risk — the formulas are tuned constants with no derivation.** A 30-day half-life becoming 21 would silently move opponent weights in S04–S07. Mitigation: every constant is exported, named and asserted in a test, so a change must update BR-S03.T06-01/-02 and is visible in review.
- **Risk — live computation gets slow as the window grows.** `findDecks` caps at 5,000 decks and `partners` chunks at 500, but `similar` and `cardUsage` scan wide. Mitigation: `cardUsage` is index-covered; measure all entry points on the real database during [S03.T07](T07-api-meta-endpoints.md) and, if needed, cache `cardUsage` per `(format, days)` for the process lifetime — it changes only after a sync.
- **Risk — `cardUsage` and the coverage denominator of [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) drift apart.** Mitigation: S05.T12 imports this function instead of writing its own aggregate; stated in both files.
- **Question — should `partners`' `minDecks` stay at 3?** A 3-deck sample can still produce confident-looking lift values. Recommendation: keep 3 and have [S03.T08](T08-web-meta-pages.md) show the sample size next to the panel; the user decides after seeing real pages.
- **Question — does `alternatives` belong in this stage?** It reads only card tables plus a usage count. Kept here because it shares `nameKey`, the legality expression and the usage query; revisit if [S02.T09](../02-card-data-and-search/T09-search-query-model-and-sql.md) grows a similar-cards feature.

## References

- `pokemon/src/pokesearch/search/decks.py` — verified: `MAX_SELECTION = 6`, `parse_selection`, `deck_weight` (0.5 ** (age/30), bonuses 2.0/1.6/1.3/1.1/1.0, 60-day default), `_decorate` (`quality = weight × (1 + log10(players)/2) × 1.5 for limitless_web`), `_DECK_SELECT` with `HAVING COUNT(DISTINCT dc.name_key) = n`, the three `rank_decklists` sorts, `archetypes_for` (top 8, `core_threshold = 0.6`, share, win rate) and `_core_cards` (`HAVING decks_with >= ceil(n×threshold)`, `LIMIT 24`, Pokémon first), `partners` (`min_decks = 3`, 500-id chunks, support and lift), `alternatives` (`cheapest_legal`, 3 up / 2 down evolution line, pt-BR relation strings), `_similar` (weights 0.30/0.25/0.15/0.10/0.10/0.10, scales 120/150/3, `usage/50`, top 12), `get_deck` (price, `price_coverage`, `unresolved`, `export_set`/`export_number` fallbacks), `export_text`, `suggest` (2-character minimum, prefix ordering) and `window_stats`.
- `pokemon/tests/test_decks.py` — verified: every acceptance expectation above, including `counts == {pokemon: 11, trainer: 6, energy: 3}`, `unresolved == 1`, `"3 Psychic Energy MEE 5" in txt`, `suggest("d") == []`, and the partner assertions (`support == 1.0`, `avg_count == 4`, `lift > 1`).
- `pokemon/src/pokesearch/sim/optimizer.py` L93–130 — verified: `price_table` (cheapest legal printing per name key) and `card_usage(conn, deck_ids)` returning inclusion, average count and the most common printing per `name_key` — the aggregation `cardUsage` generalises to a window.
- `pokemon/src/pokesearch/db/schema.sql` L218–222 — verified: the covering index and the 8.5 s → 0.11 s note behind BR-S03.T06-10.
- [Data model overview](../../project/04-data-model-overview.md) "Derived numbers" — coverage denominator, deck price, score definitions.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
