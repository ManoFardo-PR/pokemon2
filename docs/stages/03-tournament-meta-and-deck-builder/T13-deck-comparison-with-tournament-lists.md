# S03.T13 — Deck comparison with tournament lists

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 13 / 13 |
| Depends on | [S03.T06](T06-meta-queries.md), [S03.T11](T11-user-decks-schema-and-api.md) |
| Unblocks | — |
| Parallel with | [S03.T08](T08-web-meta-pages.md), [S03.T12](T12-web-deck-builder.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` meta queries (`findDecks`, `cardUsage`, archetype detection by core Pokémon) — from [S03.T06](T06-meta-queries.md)
- `table` `user_deck_versions` — from [S03.T11](T11-user-decks-schema-and-api.md)
- `module` `nameKey` and `rankDecklists` — reused so the comparison groups cards exactly as the meta pages do

## Outputs (proposed)
- `module` `apps/api/src/decks/compare.ts` — `compareWithMeta(db, versionId, { archetypeId?, days }) → { archetype, sample, rows: [{ name, myCount, inclusionRate, avgCount, delta }], missingPopular, unusual }`; `GET /api/user-decks/:id/versions/:v/compare` ; web view under the builder
- `contract` the `sample` block — how many decks the comparison is based on, how they were selected and over which window — so a number is never shown without its denominator

## Initial objective
Before simulating anything, the user sees how their list differs from what the same archetype plays in tournaments: which cards are unusual, which popular cards are missing, and by how many copies.

## Context

A user's list is usually a variation on something the field already plays. The most useful thing the system can say before any simulation is therefore comparative: of the decks playing the same core Pokémon in the window, what do they run that this list does not, what does this list run that they do not, and where do the copy counts differ. That question is one aggregate over `deck_cards` — the cheap, honest counterpart to a measured score.

It is also the seed of the optimizer: [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) builds its candidate pool from exactly these inclusion statistics (RN-82), so the definitions fixed here are the ones it reuses rather than a second, prettier version.

Two legacy pieces define the shape. `card_usage(conn, deck_ids)` aggregated `deck_cards` over a set of decks into, per `name_key`, the decks containing it, total copies, inclusion, average count and the most common printing. `similar_decks(conn, concept_keys, fmt, days)` chose that set: decks containing *all* the concept's Pokémon; if that yielded fewer than 5 decks and more than one key was given, the union of the per-key searches instead; then only 60-card decks; then ranked by quality and capped at 300. Both are reproduced here, because a differently chosen sample gives different inclusion rates and would silently disagree with the optimizer.

The comparison never writes and never proposes a swap — proposing is the optimizer's job, and doing it here without a measurement is exactly the "screening gains that vanish at confirmation" trap the legacy documented.

## Scope

- **In scope.** `apps/api/src/decks/compare.ts`: archetype inference, sample selection, the per-card comparison rows, the `missingPopular` and `unusual` lists, the `sample` block; `GET /api/user-decks/:id/versions/:v/compare`; the comparison view mounted as the `comparar com o meta` tab of the builder ([S03.T12](T12-web-deck-builder.md)).
- **Out of scope.** Candidate generation, price caps, screening and any recommendation ([S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) onwards); the meta queries themselves ([S03.T06](T06-meta-queries.md)); user-deck storage ([S03.T11](T11-user-decks-schema-and-api.md)); the builder shell ([S03.T12](T12-web-deck-builder.md)); evaluation ([S04.T17](../04-game-engine-core/T17-web-evaluate-page.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It is where RN-82's "candidates come from same-archetype tournament lists" is first implemented as a read, and the definitions it fixes are the ones [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) inherits.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S03.T13-01 | When no `archetypeId` is given, the archetype is inferred from the version's Pokémon lines: the name keys with the most copies (up to 3, ties broken by descending copies then name key) are used as the selection, and the archetype reported is the one with the highest weighted score among the sampled decks. | `inferSelection()` and `inferArchetype()` in `compare.ts` | `compare.spec.ts > infer archetype` — the Dhelmise list infers its own archetype without an explicit id |
| BR-S03.T13-02 | The sample is: decks in the window containing **all** selected name keys; if that yields fewer than 5 decks and more than one key was used, the union of the single-key searches instead; then only decks whose `card_total = 60`; then ranked by quality and capped at 300. | `selectSample()` | `compare.spec.ts > sample fallback` — a two-key selection matching 2 decks falls back to the union; a 59-card deck is excluded |
| BR-S03.T13-03 | `inclusionRate(k) = decks in the sample containing k ÷ sample size`, and `avgCount(k) = total copies of k in the sample ÷ decks containing k` (not ÷ sample size) — the average among the decks that actually play the card. | `aggregateUsage()`, delegating to `cardUsage` semantics from [S03.T06](T06-meta-queries.md) | `compare.spec.ts > inclusion and average` — a card in 2 of 4 decks with 3 and 4 copies has `inclusionRate 0.5`, `avgCount 3.5` |
| BR-S03.T13-04 | `delta = myCount − avgCount`, rounded to one decimal; a card absent from the list has `myCount = 0`, and a card absent from the sample has `inclusionRate = 0` and `avgCount = 0`. Rows cover the union of both card sets. | `buildRows()` | `compare.spec.ts > rows cover the union` — a card only in the list and a card only in the sample both appear, with the documented zeros |
| BR-S03.T13-05 | `missingPopular` lists cards with `inclusionRate ≥ 0.6` and `myCount = 0`, ordered by descending inclusion — the same 60 % threshold the archetype panels use for core cards, so the two screens never disagree. | `buildRows()` post-pass, using the shared `CORE_THRESHOLD` constant | `compare.spec.ts > missing popular` — a card in 3 of 4 sampled decks and absent from the list appears; one in 2 of 4 does not |
| BR-S03.T13-06 | `unusual` lists cards with `myCount > 0` and `inclusionRate < 0.08` — the same floor the legacy candidate pool used — ordered by descending `myCount`. | `buildRows()` post-pass, using the shared `POOL_FLOOR` constant | `compare.spec.ts > unusual` — a card in the list and in none of the sampled decks appears with `inclusionRate 0` |
| BR-S03.T13-07 | Every response carries a `sample` block (`decks`, `selection`, `strategy ∈ all-keys \| union \| empty`, `days`, `format`, `archetypeId`); no rate is ever returned without the denominator it was computed from. | the response assembly | `compare.spec.ts > sample block` — each strategy is reported, and `decks` equals the number of sampled decks |
| BR-S03.T13-08 | A sample of zero decks returns 200 with `rows: []`, `missingPopular: []`, `unusual: []` and `sample.strategy = "empty"` plus a `reason` — never a 404 and never fabricated rates. | the empty-sample early return | `compare.spec.ts > empty sample` — a list whose Pokémon appear in no tournament deck returns the documented empty shape |
| BR-S03.T13-09 | The comparison groups cards by `nameKey` from [S03.T04](T04-deck-resolver.md), so two printings of the same card are one row and the list's printing choice never changes an inclusion rate. | `aggregateUsage()` keys on `nameKey` | `compare.spec.ts > printings collapse` — a list holding two printings of one card yields a single row with the summed count |
| BR-S03.T13-10 | `compare.ts` performs no write and proposes no change: it reports differences only. | code review; the module has no mutation import | `compare.spec.ts > read only` — the suite runs against a read-only connection |

## Data operations

**Read operations**

| Query | SQL sketch | Result shape |
|---|---|---|
| load the version | `SELECT v.*, d.format, d.archetype_id FROM user_deck_versions v JOIN user_decks d ON d.id = v.deck_id WHERE v.deck_id = ? AND v.version_no = ?` | the version with `list_json` decoded into lines |
| infer the selection | none (in memory over `list_json`) | up to 3 Pokémon name keys, most copies first (BR-S03.T13-01) |
| select the sample | `findDecks(db, keys, format, days)` — `… JOIN deck_cards dc ON dc.deck_id = d.id AND dc.category='pokemon' AND dc.name_key IN (…) WHERE t.format = ? AND t.date >= ? GROUP BY d.id HAVING COUNT(DISTINCT dc.name_key) = :n` | `DeckRow[]`, then the union fallback, the `card_total = 60` filter, quality ranking and the 300 cap (BR-S03.T13-02) |
| aggregate usage | `SELECT dc.name_key, dc.category, MIN(dc.name) name, COUNT(DISTINCT dc.deck_id) decks, SUM(dc.count) copies, MAX(dc.card_id) card_id, dc.set_code, dc.number FROM deck_cards dc WHERE dc.deck_id IN (…500…) GROUP BY dc.name_key, dc.set_code, dc.number` | per `nameKey`: `decks`, `copies`, `inclusionRate`, `avgCount`, most-played printing |
| identify the archetype | in memory over the sample: the archetype id with the greatest `Σ weight`, with its name and icons | `{ id, name, icons } \| null` |
| build the rows | none (in memory join of the list's counts with the usage map) | `CompareRow[]` over the union of name keys (BR-S03.T13-04) |

**User actions**

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Open the comparison | `comparar com o meta` tab in the builder | `GET /api/user-decks/:id/versions/:v/compare` | table of rows sorted by `|delta|` descending, with the sample line above it |
| Change the window | `Janela` select (30 / 60 / 90 / 180 days) | same endpoint with `?days=` | the table and the sample line refetch |
| Choose the archetype explicitly | archetype select, defaulted to the inferred one | same endpoint with `?archetypeId=` | the sample changes; `sample.strategy` updates |
| Read a difference | row (`name`, `myCount`, `inclusionRate` as %, `avgCount`, `delta` signed) | — | negative deltas in one colour, positive in another; the card name links to the card detail |
| See what is missing | `faltando (populares)` block | — | cards with `inclusionRate ≥ 60 %` and 0 copies, each with an `+ adicionar` action into the draft ([S03.T12](T12-web-deck-builder.md)) |
| See what is unusual | `incomum na lista` block | — | cards with `inclusionRate < 8 %`, each with a `−` action into the draft |
| Understand the sample | sample line (`N decks do arquétipo X, janela de 90 dias`) | — | explains the denominator; shows `amostra vazia` with its reason when there is none |
| Open a sampled list | `ver listas da amostra` link | navigates to `/meta?p=…` ([S03.T08](T08-web-meta-pages.md)) | the meta page opens with the inferred selection |

## Interfaces

**`apps/api/src/decks/compare.ts`**

```ts
export const CORE_THRESHOLD = 0.6;     // shared with archetypesFor() in S03.T06
export const POOL_FLOOR     = 0.08;    // shared with the optimizer's candidate pool (S07.T01)
export const SAMPLE_LIMIT   = 300;
export const SAMPLE_MIN_FOR_ALL_KEYS = 5;
export const MAX_INFERRED_KEYS = 3;

export interface CompareRow {
  nameKey: string; name: string; category: DeckCategory;
  myCount: number;            // copies in the user's version
  inclusionRate: number;      // 0..1 over the sample
  avgCount: number;           // average copies among decks that play it
  delta: number;              // myCount − avgCount, 1 decimal
  cardId: string | null; setCode: string | null; number: string | null;
}
export interface CompareSample {
  decks: number;
  selection: string[];                              // the name keys used
  strategy: "all-keys" | "union" | "empty";
  reason?: "no-pokemon" | "no-decks-in-window";     // only when strategy = "empty"
  days: number; format: string; archetypeId: string | null;
}
export interface CompareResult {
  archetype: { id: string; name: string; icons: string[] } | null;
  sample: CompareSample;
  rows: CompareRow[];
  missingPopular: CompareRow[];
  unusual: CompareRow[];
}
export function compareWithMeta(
  db: Db, versionId: { deckId: number; versionNo: number },
  opts?: { archetypeId?: string; days?: number; format?: string },
): CompareResult | null;                             // null only when the version does not exist
```

**Endpoint**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/user-decks/:id/versions/:v/compare` | query `days` (7–365, default 90), `archetypeId` (optional), `format` (defaults to the deck's) | 200 `CompareResult` | 404 `NOT_FOUND` when the deck or the version does not exist |

Parameters are clamped exactly as in [S03.T07](T07-api-meta-endpoints.md) BR-S03.T07-01, so a bookmarked comparison URL never 400s.

**Sample selection, precisely.**

```
keys = opts.archetypeId ? corePokemonKeysOf(archetypeId) : inferSelection(version)    // ≤ 3 keys
sample = findDecks(db, keys, format, days)
if (sample.length < 5 && keys.length > 1)
    sample = union over k in keys of findDecks(db, [k], format, days)   // strategy = "union"
sample = sample.filter(d => d.cardTotal === 60)
sample = rankDecklists(sample, "quality", 300)
```

The `card_total = 60` filter matters: a tournament deck whose list was published incomplete would otherwise depress every inclusion rate in the sample.

**`inferSelection(version)`.** Count copies per `nameKey` over the version's `pokemon` lines, drop Basic Energy and Trainers, sort by descending copies then by name key, take the first `MAX_INFERRED_KEYS`. A version with no Pokémon line returns `[]`, which produces the empty sample of BR-S03.T13-08 with `reason: "no-pokemon"`.

**pt-BR labels** (UI copy, D-006): `comparar com o meta`, `{n} decks do arquétipo {name}, janela de {days} dias`, `amostra vazia`, `nenhum Pokémon na lista`, `nenhum deck da janela joga esses Pokémon`, `faltando (populares)`, `incomum na lista`, `minhas cópias`, `inclusão`, `média`, `diferença`, `ver listas da amostra`, `+ adicionar`, `−`.

## Implementation steps

1. Write `inferSelection` and its spec over `list_json` fixtures, including the no-Pokémon case.
2. Write `selectSample` reusing `findDecks` and `rankDecklists` from [S03.T06](T06-meta-queries.md), with the union fallback, the 60-card filter and the 300 cap.
3. Write `aggregateUsage` over the sampled deck ids, chunked at 500 parameters, keyed by `nameKey`.
4. Write `inferArchetype` from the sample's weighted archetype scores.
5. Write `buildRows` over the union of the version's name keys and the usage map, with `delta` and the two post-pass lists.
6. Assemble `CompareResult` with the `sample` block and the empty-sample early return.
7. Register `GET /api/user-decks/:id/versions/:v/compare` with the shared parameter clamping and the 404 path.
8. Build the comparison view as the `comparar com o meta` tab of [S03.T12](T12-web-deck-builder.md): sample line, sorted table, the two blocks with their draft actions.
9. Export `CORE_THRESHOLD` and `POOL_FLOOR` from one module and import them in [S03.T06](T06-meta-queries.md)'s core-card check, so the thresholds cannot drift.
10. Run the Dhelmise version against the real database and record the resulting sample size and top differences in the stage README notes.

## Edge cases and error handling

- **A list whose Pokémon appear in no tournament deck of the window** (a rogue deck) → `sample.strategy = "empty"`, `reason: "no-decks-in-window"`, empty rows, and the UI says `amostra vazia` instead of showing 0 % inclusion for every card, which would read as "nobody plays any of this".
- **A list with no Pokémon at all** (an unfinished draft) → `reason: "no-pokemon"`, same empty shape; inferring an archetype from Trainers would be meaningless.
- **A two-key selection matching only 2 decks** → the union fallback widens the sample to the decks playing either Pokémon, and `sample.strategy = "union"` tells the user the comparison is looser than it looks.
- **An archetype with fewer than 3 decks in the window** → the comparison still runs (it is an aggregate, not a lift computation), but the sample line shows the deck count prominently and the UI marks rates below a 5-deck sample as indicative; unlike `partners` in [S03.T06](T06-meta-queries.md), there is no hard floor, because a 2-deck comparison is still informative when it is labelled.
- **A sampled deck with 59 cards** (an incompletely published list) → excluded by the `card_total = 60` filter, so it cannot depress every inclusion rate.
- **The list holds two printings of one card** (`2 Ultra Ball ASC 213` and `2 Ultra Ball SVI 196`) → one row keyed by `nameKey` with `myCount = 4`; the printing is irrelevant to inclusion.
- **A card the list plays 4 copies of that the sample plays 1.2 on average** → `delta = +2.8`; the row sorts near the top, which is the point of sorting by `|delta|`.
- **Basic Energy** → included in the rows like any other card; its inclusion rate is near 1 and its `delta` is often large, so the UI groups energies last rather than filtering them out, which would hide a real difference in energy counts.
- **A version whose deck was deleted between two requests** → 404 for the deck, distinct from a 404 for the version number.
- **`days=365` over a pruned database** → the window is effectively capped at the 180-day prune horizon of [S03.T05](T05-decks-sync-and-prune.md); the `sample` block reports `days` as requested and `decks` as found, so the truncation is visible.
- **A user-supplied `archetypeId` that no sampled deck uses** → the sample is built from that archetype's decks directly; if it has none in the window, the empty-sample shape is returned with `reason: "no-decks-in-window"`.

## Acceptance / verification

- [ ] `pnpm --filter api test -t "compare"` green against a fixture built by ingesting a recorded tournament ([S03.T05](T05-decks-sync-and-prune.md)) and creating a user deck version ([S03.T11](T11-user-decks-schema-and-api.md)).
- [ ] `compare.spec.ts > dhelmise`: the Dhelmise version compared against its archetype returns a non-empty sample, inclusion rates in (0, 1], and at least one row with a non-zero delta; the `sample` block names the archetype and the deck count (stage acceptance).
- [ ] `compare.spec.ts > infer archetype`: with no `archetypeId`, the inferred selection is the list's three most-copied Pokémon and the reported archetype is the sample's heaviest (BR-S03.T13-01).
- [ ] `compare.spec.ts > sample fallback`: a two-key selection matching fewer than 5 decks switches to `strategy: "union"`, and a 59-card tournament deck is excluded from the sample (BR-S03.T13-02).
- [ ] `compare.spec.ts > inclusion and average`: a card in 2 of 4 sampled decks with 3 and 4 copies reports `inclusionRate 0.5` and `avgCount 3.5` (BR-S03.T13-03).
- [ ] `compare.spec.ts > rows cover the union`: a card only in the list and a card only in the sample both appear with the documented zeros and the correct `delta` (BR-S03.T13-04).
- [ ] `compare.spec.ts > missing popular` and `> unusual`: the 0.6 and 0.08 thresholds select exactly the expected cards, using the shared constants (BR-S03.T13-05, -06).
- [ ] `compare.spec.ts > empty sample`: a list whose Pokémon appear in no deck of the window returns 200 with `strategy: "empty"` and a `reason`, not a 404 (BR-S03.T13-08).
- [ ] `compare.spec.ts > printings collapse` and `> read only`: two printings become one row; the suite passes on a read-only connection (BR-S03.T13-09, -10).
- [ ] `meta-queries.spec.ts` and `compare.spec.ts` both import `CORE_THRESHOLD` from the same module, and a test asserts the two screens report the same core-card set for one archetype.

## Risks and open questions

- **Risk — the comparison reads as advice.** Inclusion rates are descriptive; a card missing from 80 % of lists is not necessarily a mistake. Mitigation: the blocks are labelled `faltando (populares)` and `incomum na lista`, never "recommended"; no row claims a gain — only the optimizer does.
- **Risk — a small sample produces confident-looking percentages.** Mitigation: the `sample` block is mandatory (BR-S03.T13-07) and rendered above the table; below 5 decks the UI marks the rates as indicative.
- **Risk — drift from the optimizer's pool**, which would show one set of inclusion rates here and another there. Mitigation: `selectSample` and the two thresholds are exported here and imported by [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md); stated in both files.
- **Question — should the comparison run on an unsaved draft?** It currently needs a `versionId`. Recommendation: keep it version-based (a comparison is a fact about a stored list) and have the builder offer "salvar e comparar"; the user decides after using it.
- **Question — should `avgCount` be over decks that play the card or over the whole sample?** The legacy used the former (`copies ÷ decks containing it`), which reads as "when they play it, they play N". Recommendation: keep it and show `inclusionRate` next to it, so the other reading is one multiplication away.

## References

- `pokemon/src/pokesearch/sim/optimizer.py` L106–130 (`card_usage`) — verified: aggregation by `name_key` over a list of deck ids in 500-id chunks, `inclusion = decks ÷ n`, `avg_count = copies ÷ max(decks, 1)`, and the most common `(set_code, number)` printing kept per card.
- `pokemon/src/pokesearch/sim/optimizer.py` L139–148 (`similar_decks`) — verified: `find_decks` with all concept keys, the union fallback when fewer than 5 decks and more than one key, the `card_total == 60` filter, and `rank_decklists(..., "quality", 300)`.
- `pokemon/src/pokesearch/sim/optimizer.py` L271–282 (`candidate_pool`) — verified: `min_inclusion = 0.08` as the floor a card must clear to be considered, and the skip of cards already at 4 copies unless they are Basic Energy — the source of `POOL_FLOOR`.
- `pokemon/src/pokesearch/search/decks.py` L115–161 — verified: the 0.6 core-card threshold this module shares so the two screens agree.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: the 60-card list used as the comparison fixture and the vocabulary of one-card differences.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-82 (candidates come from same-archetype tournament lists), implemented in [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) on top of these definitions.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
