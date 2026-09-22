# S02.T06 — Load cards into the database

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 6 / 14 |
| Depends on | [S02.T04](T04-set-and-card-id-mapping.md), [S02.T05](T05-cards-schema-migration.md) |
| Unblocks | [S02.T07](T07-prices-snapshot.md), [S02.T08](T08-full-text-search.md), [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md), [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md), [S04.T02](../04-game-engine-core/T02-card-definition-model.md), [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `etl/idmap.ts` (set candidates, card matches) — from [S02.T04](T04-set-and-card-id-mapping.md)
- `table` empty card tables and row types — from [S02.T05](T05-cards-schema-migration.md)
- `file` `pokemon/src/pokesearch/etl/load.py` — the field provenance, `parse_damage`, `derive_stage` and the delete-then-insert of children; read-only reference

## Outputs (proposed)
- `module` `etl/load.ts` — `loadSet(db, ptcgSet, tcgdexSetId, cardMatches)` upserting `sets` and every card in one transaction; helpers `norm()`, `parseDamage()`, `deriveStage()`, `isoDate()` — consumed by [S02.T07](T07-prices-snapshot.md), [S02.T08](T08-full-text-search.md), [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md), [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md), [S04.T02](../04-game-engine-core/T02-card-definition-model.md), [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md)
- `table` `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances` populated (≈174 / 20.4k / 28k / 4.1k / 16.8k / 4.9k rows) — consumed by the same subtasks
- `contract` normalization rule: `norm(s) = strip diacritics (NFD, remove \p{Mn}) → lower → trim`; used identically for `name_norm`, `text_norm` and the deck resolver's `name_key` so joins by normalized name are byte-exact

## Initial objective
Every cached card document from both sources becomes rows in the card tables with a documented field provenance, in idempotent per-set transactions fast enough for a full reload in minutes.

## Context

This is where the two sources stop being files and become the database the whole product reads. Six subtasks depend on it directly, and two of them depend on details that are easy to get subtly wrong: [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md) joins decklist lines to printings **by normalized name**, and [S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md) hashes **effect text** to share it across reprints (RN-05). If `norm()` here and `name_key` there differ by one Unicode normalization step, every `Flabébé` line fails to resolve; if the loader rewrites text (trims, collapses whitespace, "fixes" a dash), reprints stop hashing equal. Hence the `contract` output: one `norm()`, exported, used by everyone, and card text stored verbatim.

The legacy `pokemon/src/pokesearch/etl/load.py` is the provenance document. Three of its decisions are kept exactly because they encode real source quirks: `_iso_date` turns `'2024/11/08'` into `'2024-11-08'` (pokemon-tcg-data uses slashes); `parse_damage` accepts `^\s*(\d+)\s*([+\-×x*]?)\s*$` and maps `x`/`*` onto `×` (the sources use all three); `derive_stage` prefers the TCGdex `stage` field, mapping `Stage1`→`Stage 1` and `Stage2`→`Stage 2`, and otherwise takes the first of twelve known stage names present in `subtypes`. Two are changed: the legacy used `unidecode`, which transliterates beyond diacritics (`★`→`star`, `δ`→`d`), whereas the contract above is NFD + strip `\p{Mn}`, which is narrower and reversible in intent; and `INSERT OR REPLACE` is forbidden by `packages/db/PORTABILITY.md` (it deletes and re-inserts, firing cascades), so every write is `ON CONFLICT … DO UPDATE`.

The performance question is open and is answered here: this is the first bulk write of the project (~20.4k cards, ~28k attacks, ~16.8k weaknesses), and [S01.T02](../01-foundation/T02-sqlite-database-client.md) left "is `node:sqlite` fast enough for a bulk load?" as its open risk. The measurement belongs to this subtask's acceptance.

## Scope

- **In scope.** `packages/etl/src/load.ts`: `loadSet`, the per-card upsert, the delete-then-insert of children, batching and transaction boundaries; the pure helpers `norm`, `parseDamage`, `deriveStage`, `isoDate`, `toInt`, `jsonOrNull`; the provenance table below as executable code; the `cards.updated_at` "only when content changed" rule; the counters fed into `etl_runs.stats_json`; the throughput measurement.
- **Out of scope.** Fetching ([S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md)); id mapping ([S02.T04](T04-set-and-card-id-mapping.md)); the schema ([S02.T05](T05-cards-schema-migration.md)); the FTS rebuild ([S02.T08](T08-full-text-search.md)) and the price snapshot ([S02.T07](T07-prices-snapshot.md)), which `etl full` runs after this step; splitting texts into sentences or parts ([S05.T02](../05-card-rules-base/T02-effect-texts-and-card-parts.md)); deriving engine card definitions ([S04.T02](../04-game-engine-core/T02-card-definition-model.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-01 | **Kept.** Both raw documents are preserved and neither overwrites the other: `raw_ptcg_json` is the canonical document serialized verbatim, `raw_tcgdex_json` the TCGdex one (NULL when unmatched); no normalized column is ever derived from the other source's document except where the provenance table says so, and a TCGdex-only field is never written into a canonical column. | the single `upsertCard()` parameter list, which reads `ptcg` and `tcgdex` through separate accessors | `load.spec.ts > fixture card round-trip`: every normalized column is re-derivable from `raw_ptcg_json` (+ `raw_tcgdex_json` for the TCGdex-owned columns) |
| BR-S02.T06-01 | `norm(s)` = NFD → remove `\p{Mn}` → `toLowerCase()` → `trim()`, and nothing else; it is exported from `@pokesearch/shared` so the loader, the search builder and the deck resolver use one implementation. | `packages/shared/src/text/norm.ts`; eslint forbids a local re-implementation | `norm.spec.ts`: `'Pokémon'→'pokemon'`, `'Flabébé'→'flabebe'`, `'  Ho-Oh  '→'ho-oh'`, `'Umbreon ★'→'umbreon ★'`, `'Mewtwo & Mew-GX'→'mewtwo & mew-gx'` |
| BR-S02.T06-02 | A set and all of its cards are loaded in one transaction: either every row of the set is written or none is. | `db.transaction(..., "immediate")` wrapping `loadSet` | `load.spec.ts > a card that fails mid-set leaves zero rows for that set` |
| BR-S02.T06-03 | Loading the same set twice produces identical row counts and identical column values; `cards.updated_at` changes only when at least one stored value changed. | content hash of the upsert tuple compared with the stored row before writing `updated_at` | `load.spec.ts > second load is a no-op`: counts equal, `MAX(updated_at)` unchanged |
| BR-S02.T06-04 | Child rows are replaced per card, never merged: `attacks`, `abilities`, `weaknesses`, `resistances` are deleted for that `card_id` and re-inserted from the document. | `replaceChildren(cardId, doc)` inside the same transaction | `load.spec.ts > a card that loses an attack ends with one attack, not two` |
| BR-S02.T06-05 | `parseDamage` returns `{ num, mod }` with `mod ∈ {+, -, ×}`: `'120+'→(120,'+')`, `'30×'\|'30x'\|'30*'→(30,'×')`, `'10-'→(10,'-')`, `'90'→(90,null)`, `''\|null→(null,null)`, and any other text →`(null, null)` with the raw string kept in `damage_text`. | `parseDamage()` with the anchored regex `^\s*(\d+)\s*([+\-×x*]?)\s*$` | `load.spec.ts > parseDamage table` covering all eight cases |
| BR-S02.T06-06 | `stage` is the TCGdex `stage` when present (`Stage1`→`Stage 1`, `Stage2`→`Stage 2`), otherwise the first of `[Basic, Stage 1, Stage 2, BREAK, LEGEND, Restored, MEGA, V-UNION, VMAX, VSTAR, Baby, Level-Up]` found in the canonical `subtypes`, otherwise NULL. | `deriveStage(subtypes, tcgdexStage)` | `load.spec.ts > deriveStage table` including `Stage1→'Stage 1'`, a VMAX with no TCGdex document, and a Trainer (NULL) |
| BR-S02.T06-07 | Card text is stored byte-for-byte as the source gives it; only `*_norm` columns are transformed. | the upsert writes `a.text` and `norm(a.text)` into different columns | `load.spec.ts > attack text is stored verbatim` (a text with a non-breaking space and `’` round-trips) |
| BR-S02.T06-08 | `retreat_cost = convertedRetreatCost ?? retreatCost.length ?? NULL`; `converted_cost = convertedEnergyCost ?? cost.length`; `regulation_mark = ptcg.regulationMark ?? tcgdex.regulationMark`. | the three fallback expressions in the provenance mapping | `load.spec.ts > fallbacks` with a card lacking `convertedRetreatCost` and a card whose mark exists only on TCGdex |
| BR-S02.T06-09 | `tcgdex_legal_standard`/`_expanded` are `NULL` when there is no TCGdex document and `0`/`1` otherwise — never `0` standing in for "unknown". | `tcgdex ? Number(Boolean(tcgdex.legal?.standard)) : null` | `load.spec.ts > unmatched card has NULL tcgdex legality, matched illegal card has 0` |
| BR-S02.T06-10 | `release_date` on `cards` is copied from its set on every load, so the denormalized filter column can never diverge from `sets.release_date`. | the upsert takes the date from the set row, never from the card document | `load.spec.ts > release_date equals the set's after a set date correction` |
| BR-S02.T06-11 | The loader writes only baseline tables (`sets`, `cards` and the four child tables) and never `cards_fts`, `price_history` or `cards_market_usd`. | module boundaries; those tables have their own owners | `grep` in `load.ts` finds no reference to the three tables; `load.spec.ts > fts and price tables stay empty after a load` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `sets` | C/U | etl | once per set, first statement of the set transaction | `INSERT … ON CONFLICT (id) DO UPDATE`; upsert key `id`; `tcgdex_id` may go from NULL to a value, never silently back to NULL under `--skip-tcgdex` | `name_norm = norm(name)`, `release_date = isoDate(releaseDate)` |
| `cards` | C/U | etl | per card in the set | `ON CONFLICT (id) DO UPDATE` on the full column list; no-op in effect when every value is unchanged (`updated_at` preserved) | `raw_ptcg_json` always written; `raw_tcgdex_json` only when matched |
| `attacks` | D then C | etl | per card, inside the set transaction | delete by `card_id`, insert `idx` 0..n-1 in document order | surrogate ids change on every reload — nothing may reference them |
| `abilities` | D then C | etl | per card | same | `type` carries `'Ability'`, `'Poké-Power'`, `'Poké-Body'`, `'Ancient Trait'`… |
| `weaknesses` | D then C | etl | per card | same; PK `(card_id, type)` makes a duplicated type in the source fail loudly | value like `'×2'` |
| `resistances` | D then C | etl | per card | same | value like `'-30'` |
| `cards_fts`, `price_history`, `cards_market_usd` | — | — | — | not written here | [S02.T08](T08-full-text-search.md), [S02.T07](T07-prices-snapshot.md) |
| `etl_runs.stats_json` | U | etl | end of the load step | flat counters | `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `cards_changed`, `cards_without_tcgdex`, `load_ms`, `rows_per_s` |
| cached JSON under `$RAW_CACHE_DIR` | R | etl | during the load | read-only; a full reload runs offline | via `loadSets()`, `loadCards()`, `readCachedCard()` |

## Interfaces

**`packages/shared/src/text/norm.ts`** (browser-safe, no dependency — the `contract` output)

```ts
export function norm(s: string | null | undefined): string;   // NFD → strip \p{Mn} → toLowerCase → trim
export function normOrNull(s: string | null | undefined): string | null;  // "" becomes null
```

`norm(null) === ""`. Implementation: `s.normalize("NFD").replace(/\p{Mn}+/gu, "").toLowerCase().trim()`. Consumers: `cards.name_norm`, `sets.name_norm`, `attacks.name_norm`/`text_norm`, `abilities.name_norm`/`text_norm`, the `LIKE` predicates of [S02.T09](T09-search-query-model-and-sql.md), the FTS tokenizer input of [S02.T08](T08-full-text-search.md) and `name_key` in [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md).

**`packages/etl/src/load.ts`**

```ts
export interface LoadSetInput {
  ptcgSet: PtcgSet;
  cards: PtcgCard[];
  tcgdexSetId: string | null;
  cardMatches: Map<string, string>;                 // ptcgCardId -> tcgdexCardId (S02.T04)
  tcgdexCards: Map<string, TcgdexCard | null>;      // tcgdexCardId -> document (S02.T03)
}
export interface LoadSetResult {
  setId: string; cards: number; cardsChanged: number; attacks: number; abilities: number;
  weaknesses: number; resistances: number; withoutTcgdex: number; ms: number;
}
export function loadSet(db: Db, input: LoadSetInput): LoadSetResult;

export function parseDamage(text: string | null | undefined): { num: number | null; mod: "+" | "-" | "×" | null };
export function deriveStage(subtypes: string[] | undefined, tcgdexStage: string | undefined): string | null;
export function isoDate(d: string | null | undefined): string | null;   // '2024/11/08' -> '2024-11-08'
export function toInt(v: unknown): number | null;
export function tcgdexImageUrls(tcgdex: TcgdexCard | null): { high: string | null; low: string | null };
export const STAGES: readonly string[];       // the twelve names, in priority order
export const CHILD_BATCH = 500;               // statements per flush inside a set transaction
```

**Field provenance** — the authoritative table. `P` = pokemon-tcg-data, `T` = TCGdex, `D` = derived.

| Column | Src | Expression |
|---|---|---|
| `cards.id`, `number`, `name`, `supertype`, `subtypes_json`, `hp`, `types_json`, `evolves_from`, `evolves_to_json`, `rules_json`, `flavor_text`, `rarity`, `artist`, `national_dex_json`, `retreat_json`, `legal_unlimited/standard/expanded`, `img_small`, `img_large` | P | direct; `hp` through `toInt`; array/object fields JSON-serialized with no key reordering |
| `cards.tcgdex_id`, `local_id`, `variants_json`, `tcgdex_updated` | T | direct (`localId`, `variants`, `updated`) |
| `cards.tcgdex_legal_standard`, `tcgdex_legal_expanded` | T | `tcgdex ? Number(Boolean(tcgdex.legal?.x)) : null` (BR-S02.T06-09) |
| `cards.img_webp_high`, `img_webp_low` | T | `` `${image.replace(/\/$/,"")}/high.webp` `` and `/low.webp`; NULL when `image` is absent |
| `cards.name_norm` | D | `norm(name)` |
| `cards.stage` | D(T,P) | `deriveStage(subtypes, tcgdex.stage)` (BR-S02.T06-06) |
| `cards.regulation_mark` | P→T | `ptcg.regulationMark ?? tcgdex.regulationMark` |
| `cards.retreat_cost` | P | `convertedRetreatCost ?? retreatCost?.length ?? null` |
| `cards.release_date` | D | `isoDate(set.releaseDate)` — from the **set**, not the card (BR-S02.T06-10) |
| `cards.raw_ptcg_json`, `raw_tcgdex_json` | P, T | `JSON.stringify(doc)` of each document as fetched, including `_fetched_at` |
| `cards.updated_at` | D | now (UTC ISO) only when the content hash changed |
| `attacks.*` | P | `name`, `cost_json`, `converted_cost = convertedEnergyCost ?? cost.length`, `damage_text = damage \|\| null`, `(damage_num, damage_mod) = parseDamage(damage)`, `text`; `*_norm = norm(...)` |
| `abilities.*` | P | `name`, `type`, `text`; `*_norm = norm(...)` |
| `weaknesses`, `resistances` | P | `type`, `value` |
| `sets.*` | P, +T id | `printedTotal`, `total`, `ptcgoCode`, `legalities.*`, `images.symbol/logo`, `updatedAt`; `tcgdex_id` from [S02.T04](T04-set-and-card-id-mapping.md) |

**Transaction and batching.** One `BEGIN IMMEDIATE` per set. Statements are prepared once per process (the adapter's LRU cache) and executed per row; the set transaction flushes at most `CHILD_BATCH` child statements between progress callbacks but does **not** commit early — a set is atomic (BR-S02.T06-02). Sets are processed sequentially, so no two writers contend.

**Progress and counters.** One line per set: `[12/174] sv8 Surging Sparks: 252 cards (18 changed), tcgdex=sv08, matched 252, 431 ms`.

## Implementation steps

1. Add `norm()` to `@pokesearch/shared` with its spec and the eslint rule forbidding a second implementation (BR-S02.T06-01).
2. Write the pure helpers `isoDate`, `toInt`, `parseDamage`, `deriveStage`, `tcgdexImageUrls` with table-driven specs (BR-S02.T06-05, -06).
3. Write `upsertSet()` and spec it against a fixture set, including the `'2024/05/01'` date form.
4. Write `upsertCard()` from the provenance table, plus `replaceChildren()`; spec one fixture card end to end, asserting every column (RN-01 round trip).
5. Add the content-hash comparison that keeps `updated_at` stable on an unchanged reload; spec it (BR-S02.T06-03).
6. Wrap both in `loadSet()` with the immediate transaction and the result counters; spec atomicity by injecting a failure on the third card (BR-S02.T06-02).
7. Wire the step into the orchestrator of [S02.T01](T01-etl-cli-and-raw-cache.md): resolve set → brief → matches → cached TCGdex documents → `loadSet`, accumulating counters.
8. Run a full load from the populated cache; record wall time, rows/s and the six row counts in `packages/etl/README.md`.
9. If throughput is below ~5,000 rows/s, evaluate the alternative driver behind the [S01.T02](../01-foundation/T02-sqlite-database-client.md) adapter and record the measurement as a dated note in the decision log (the open risk that subtask left).

## Edge cases and error handling

- **A card has no TCGdex counterpart.** `tcgdex_id`, `local_id`, `variants_json`, `img_webp_*`, `tcgdex_updated`, `raw_tcgdex_json` and both `tcgdex_legal_*` are NULL; `stage` falls back to `subtypes`; the card is counted in `cards_without_tcgdex`. It is a complete, searchable card without prices.
- **A set has no TCGdex counterpart** (`tcgdexSetId === null`, from [S02.T04](T04-set-and-card-id-mapping.md)). `sets.tcgdex_id` stays NULL and every card in it takes the previous branch. Under `--skip-tcgdex` the loader must not *clear* an existing `tcgdex_id`: the upsert keeps the stored value when the input is null and the run skipped TCGdex.
- **Damage text `30×`** (and its `30x` / `30*` spellings). `damage_text` keeps the exact source string; `damage_num = 30`, `damage_mod = '×'`. The `CHECK` in [S02.T05](T05-cards-schema-migration.md) would reject `x`, so the mapping is mandatory, not cosmetic.
- **Damage text `varies`, `?` or empty.** `damage_num` and `damage_mod` NULL, `damage_text` the raw value (or NULL for the empty string). Damage-range filters simply skip the card.
- **A card numbered `TG01` in a gallery set.** Stored verbatim; `release_date` comes from the parent canonical set even though TCGdex models the gallery as a separate set, so gallery cards sort and filter with their set.
- **A source card repeats a weakness type** (`Fire` twice). The `(card_id, type)` primary key raises `SQLITE_CONSTRAINT_PRIMARYKEY`, the set transaction rolls back and the run fails with the card id — an upstream data error the report must show, not something to dedupe silently.
- **A card loses an attack between loads** (an upstream correction). Delete-then-insert leaves exactly the current attacks; the old surrogate ids disappear, which is why nothing stores them (BR-S02.T06-04).
- **`hp` arrives as the string `'220'` or as `'None'`.** `toInt` returns `220` and `null` respectively; a non-numeric HP never becomes `0`.
- **A card name contains `★`, `δ` or a non-breaking space.** `norm()` lowercases and strips combining marks but keeps `★` and `δ`; the stored `name` is untouched. This is deliberately narrower than the legacy `unidecode`, which mapped `★`→`star` — a difference to keep in mind when comparing the new `name_norm` with legacy values.
- **The process is interrupted between two sets.** Every completed set is committed; the next run re-upserts them as no-ops and continues. There is no partial set.
- **`raw_ptcg_json` would exceed the statement limit** (a very large document). Not reachable in practice — the largest canonical card document is a few kilobytes — but the loader uses parameter binding, never string interpolation, so size is bounded only by SQLite's `SQLITE_MAX_LENGTH`.

## Acceptance / verification

- [ ] `norm.spec.ts` green: `'Pokémon'→'pokemon'`, `'Flabébé'→'flabebe'`, `'  Ho-Oh  '→'ho-oh'`, `norm(null)===''` (BR-S02.T06-01).
- [ ] `load.spec.ts > parseDamage table` green for `'120+'`, `'30×'`, `'30x'`, `'30*'`, `'10-'`, `'90'`, `''`, `'varies'` (BR-S02.T06-05); `> deriveStage table` green including `Stage1→'Stage 1'` and a Trainer → NULL (BR-S02.T06-06).
- [ ] `> fixture card round-trip`: loading one fixture set yields exactly the expected rows in all six tables, and every normalized column is re-derivable from the stored raw documents (RN-01).
- [ ] `> second load is a no-op`: identical counts and `MAX(cards.updated_at)` unchanged; changing one field in the fixture makes exactly one `updated_at` move (BR-S02.T06-03).
- [ ] `> a card that fails mid-set leaves zero rows for that set` (BR-S02.T06-02) and `> a card that loses an attack ends with one attack` (BR-S02.T06-04).
- [ ] `> unmatched card has NULL tcgdex legality, matched illegal card has 0` (BR-S02.T06-09); `> release_date equals the set's after a set date correction` (BR-S02.T06-10).
- [ ] `> fts and price tables stay empty after a load` (BR-S02.T06-11).
- [ ] Full load from the populated cache completes in under 10 minutes on this machine and produces counts within ±2 % of the legacy baseline: 174 sets, 20,444 cards, 27,976 attacks, 4,092 abilities, 16,780 weaknesses, 4,928 resistances.
- [ ] `etl_runs.stats_json` of that run reports `rows_per_s` and `load_ms`; the value is recorded in `packages/etl/README.md` and, if below ~5,000 rows/s, in a dated decision-log note about the driver.
- [ ] `SELECT COUNT(*) FROM cards WHERE name_norm <> lower(name)` is greater than zero (proving normalization ran) and `SELECT COUNT(*) FROM cards WHERE raw_ptcg_json IS NULL` is zero.

## Risks and open questions

- **Risk — `node:sqlite` bulk-insert throughput.** ~74k inserts for a full load. Mitigation: one immediate transaction per set, cached prepared statements, and the driver-agnostic adapter; the measurement is an acceptance item, and `better-sqlite3` stays an option only if a prebuilt Node 24 Windows binary exists (no C compiler on this machine).
- **Risk — `norm()` diverges from the legacy `unidecode`.** Names with `★`, `δ`, `♀` normalize differently, so a legacy-derived expectation may be wrong. Mitigation: the contract is written down here and tested; [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md) uses the same function, so resolution stays self-consistent even where it differs from the legacy.
- **Risk — a silent provenance drift** (someone fills a canonical column from TCGdex). Mitigation: the provenance table is the spec, the round-trip test re-derives every column from the raw documents, and RN-01 is the rule that fails.
- **Question — should `--skip-tcgdex` preserve or clear existing TCGdex columns?** Specified here as *preserve* (clearing would destroy data on a convenience flag). Confirm with the first user-run of `etl full --skip-tcgdex`; if preserving proves confusing, add an explicit `--clear-tcgdex`.
- **Question — should a set be skipped entirely when its content hash is unchanged?** That would make `etl delta` nearly free, but it needs a per-set hash column on `sets`. Recommendation: defer until the full-load time is measured; `etl delta` already restricts to `changedSetIds` from [S02.T02](T02-fetch-pokemon-tcg-data.md). Decide with the owner of [S08.T01](../08-operations-and-extensions/T01-scheduler.md), who runs it nightly.

## References

- `pokemon/src/pokesearch/etl/load.py` — verified (215 lines): `norm()` via `unidecode(...).lower().strip()`; `_iso_date` (`'/'→'-'`, first 10 chars); `_DMG_RE = ^\s*(\d+)\s*([+\-×x*]?)\s*$` with `x`/`*`→`×`; `_STAGES` (the twelve names) and `derive_stage` preferring the TCGdex stage with `Stage1`/`Stage2` remapped; `_tcgdex_image_urls` appending `/high.webp` and `/low.webp`; `upsert_set` and `upsert_card` with `ON CONFLICT … DO UPDATE` over the exact column list; the four `DELETE FROM … WHERE card_id = ?` statements before re-inserting children; `retreat_cost = c.get("convertedRetreatCost", len(retreat) or None)`; `converted_cost = a.get("convertedEnergyCost", len(cost))`; `regulation_mark = c.get("regulationMark") or tcg.get("regulationMark")`; `tcgdex_legal_* = None if not tcg else int(bool(...))`; `load_set` wrapping everything in one `transaction(conn)`. Consult for provenance; rewrite in TypeScript with `ON CONFLICT` only.
- `pokemon/tests/test_search.py` L9–33 — verified: the fixture set and three cards (Vaporeon with an ability and a `120+` attack, Pikachu with `20` and a coin flip, Great Stadium with a `rules` array) whose shapes the new fixtures mirror; `test_get_card` asserts `damage_num == 120` and `damage_mod == '+'`.
- `pokemon/src/pokesearch/db/schema.sql` — verified: the column list this loader fills, and the absence of keys on `weaknesses`/`resistances` that [S02.T05](T05-cards-schema-migration.md) corrects.
- [S02.T05](T05-cards-schema-migration.md) — the DDL, the `damage_mod` `CHECK` and the row types; [S01.T02](../01-foundation/T02-sqlite-database-client.md) — `transaction(fn, "immediate")`, `BATCH_ROWS` and the `INSERT OR REPLACE` prohibition in `PORTABILITY.md`.
- External: `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master` (canonical card fields) and `https://api.tcgdex.net/v2/en` (`stage`, `variants`, `legal`, `image`, `updated`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
