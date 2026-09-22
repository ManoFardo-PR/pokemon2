# S02.T04 — Set and card id mapping between sources

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 4 / 14 |
| Depends on | [S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md) |
| Unblocks | [S02.T06](T06-load-cards.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `file` canonical sets/cards JSON — from [S02.T02](T02-fetch-pokemon-tcg-data.md)
- `file` TCGdex set list and set briefs — from [S02.T03](T03-fetch-tcgdex.md)
- `file` `pokemon/src/pokesearch/etl/idmap.py` and `pokemon/tests/test_idmap.py` — the heuristics and their assertions; read-only reference

## Outputs (proposed)
- `module` `etl/idmap.ts` — `setIdCandidates(ptcgSetId) → string[]` (ordered), `normNumber(n)`, `matchCards(ptcgCards, tcgdexBrief) → Map<ptcgId, tcgdexId>` + unmatched lists — consumed by [S02.T06](T06-load-cards.md)
- `file` `packages/etl/idmap-overrides.json` — `{ sets: {}, cards: {} }` manual overrides
- `file` reports `RAW_CACHE_DIR/reports/idmap_unmatched_sets.csv`, `idmap_unmatched_cards.csv`

## Initial objective
Every canonical set and card is paired with its TCGdex counterpart by deterministic heuristics plus a small override file, and whatever cannot be paired is reported instead of silently dropped.

## Context

The two sources number the same physical cards differently. pokemon-tcg-data uses ids like `sv3pt5`, `swsh45`, `pgo`, `cel25c`; TCGdex uses `sv03.5`, `swsh4.5`, `swsh10.5`, `cel25cc`. Worse, galleries are modelled differently: Trainer Gallery and Shiny Vault cards are *inside* the main set in pokemon-tcg-data and are *separate sets* (`swsh9tg`, `swsh12.5gg`, `swsh4.5sv`) in TCGdex. Without a mapping, a card gets no price, no variants, no WebP image and no TCGdex legality — i.e. the search filters that use `COALESCE(tcgdex_legal_standard, …)` silently fall back for that card.

This subtask is pure: two JSON inputs in, a map and two CSV reports out, no database and no network. That is deliberate. The heuristics are a pile of era-specific rules discovered empirically; the only way to keep them honest is to make every branch a unit test, which the legacy already did in `pokemon/tests/test_idmap.py`. Those assertions are ported one-for-one and become the regression suite for the TypeScript rewrite.

The legacy result is the baseline to beat or match: the shipped `data/reports/idmap_unmatched_sets.csv` contains only its header (**zero** unmatched sets) and `idmap_unmatched_cards.csv` contains **six** rows, all `cel25c → cel25cc` alt-art printings (`cel25c-93_A` Gardevoir ex δ, `cel25c-17_A` Umbreon ★, `cel25c-54_A` Mewtwo-EX, `cel25c-97_A` Xerneas-EX, `cel25c-76_A` M Rayquaza-EX, `cel25c-60_A` Tapu Lele-GX). The cause is instructive: Celebrations Classic Collection numbers differ between the sources (`93` vs `CC…`), so those cards fall through to the name fallback, which refuses to guess when the same name occurs twice on the canonical side — exactly the alt-art pairs. Also verified: the legacy `idmap_overrides.json` is `{"sets": {}, "cards": {}}` — the heuristics alone were enough, and the override file exists as an escape hatch, not as a crutch.

## Scope

- **In scope.** `packages/etl/src/idmap.ts` (pure functions, no I/O), the override file and its schema, the CSV report writer, the ported test suite, and the `resolveTcgdexSet(ptcgSetId, knownTcgdexSetIds)` helper that walks the candidate list.
- **Out of scope.** Fetching either side ([S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md)); writing any row ([S02.T06](T06-load-cards.md)); resolving decklist lines to printings, which is a different problem with its own order (RN-02, [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md)); image URLs ([S02.T06](T06-load-cards.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask. It is a precondition of RN-01: without a pairing there is no second raw document to preserve.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T04-01 | `setIdCandidates` is a pure, deterministic function of its argument and the override file: the same input always yields the same ordered list, with no duplicates. | the dedupe-preserving-order pass at the end of `setIdCandidates` | `idmap.spec.ts > candidates are deduped and stable` (two calls deep-equal; no repeated entry) |
| BR-S02.T04-02 | An override always wins: when `overrides.sets[id]` exists, it is the whole candidate list and no heuristic runs. | the early return at the top of `setIdCandidates` | `idmap.spec.ts > set override short-circuits the heuristics` |
| BR-S02.T04-03 | A canonical set maps to the first candidate that exists in the TCGdex set list; when none exists the set maps to `null` and is written to `idmap_unmatched_sets.csv`. | `resolveTcgdexSet()` | `idmap.spec.ts > unknown set resolves to null and is reported` |
| BR-S02.T04-04 | `normNumber` strips case and leading zeros while preserving alphabetic prefixes and suffixes, and returns its input unchanged when it does not match the pattern. | the single regex `^([a-z-]*)0*(\d+)([a-z]*)$` applied to the trimmed, lowercased value | `idmap.spec.ts > normNumber` table: `001→1`, `TG01→tg1`, `SV045→sv45`, `12a→12a`, `CC001→cc1`, `H31→h31`, `""→""` |
| BR-S02.T04-05 | A canonical card matches at most one TCGdex card, and a TCGdex card is claimed by at most one canonical card during the name fallback. | the `taken` set built from already-resolved values before the fallback | `idmap.spec.ts > name fallback never reuses a claimed tcgdex id` |
| BR-S02.T04-06 | The name fallback fires only when the normalized name is unique on **both** sides; otherwise the card stays unmatched. | the `ptcgNameCounts[n] === 1 && candidates.length === 1` guard | `idmap.spec.ts > duplicate name on the canonical side stays unmatched` (the `cel25c` alt-art case) |
| BR-S02.T04-07 | When several TCGdex cards share a normalized number, the tie is broken by exact lowercase name; if no name matches, the first candidate in brief order is used and the pair is flagged in `stats_json.idmap_ambiguous`. | the multi-candidate branch of `matchCards` | `idmap.spec.ts > number collision resolved by name`; `> unresolvable collision takes the first and is counted` |
| BR-S02.T04-08 | Every canonical card that ends without a TCGdex id appears in `idmap_unmatched_cards.csv` with its set, the resolved TCGdex set, its id, number and name — nothing is dropped silently. | `writeUnmatchedReports()` called once per load | acceptance check on the real data: report row count equals `stats_json.unmatched_cards` |
| BR-S02.T04-09 | `idmap-overrides.json` is validated against its schema at load time; an unknown key or a non-string value fails the run before any fetch result is consumed. | zod schema `OverridesSchema` parsed in `loadOverrides()` | `idmap.spec.ts > malformed overrides file throws with the offending path` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `$RAW_CACHE_DIR/pokemon-tcg-data/**` | R | etl | during a load | read-only, via `loadSets()` / `loadCards()` | canonical side of the pairing |
| `$RAW_CACHE_DIR/tcgdex/sets.json`, `tcgdex/sets/<id>.json` | R | etl | during a load | read-only, via `fetchSetList()` / `fetchSetBrief()` | TCGdex side |
| `packages/etl/idmap-overrides.json` | R | etl | once per process | validated against `OverridesSchema`; ships as `{"sets":{},"cards":{}}` | edited by hand when a new era breaks a heuristic |
| `$RAW_CACHE_DIR/reports/idmap_unmatched_sets.csv` | C/U | etl | end of every load that did not `--skip-tcgdex` | rewritten whole, header always present; same input ⇒ byte-identical file | columns `ptcg_set_id,name,release_date` |
| `$RAW_CACHE_DIR/reports/idmap_unmatched_cards.csv` | C/U | etl | end of every load that did not `--skip-tcgdex` | rewritten whole, header always present; rows ordered by set then number | columns `ptcg_set_id,tcgdex_set_id,ptcg_card_id,number,name` |
| `etl_runs.stats_json` | U | etl | end of the step | flat counters | `unmatched_sets`, `unmatched_cards`, `idmap_by_number`, `idmap_by_name`, `idmap_by_override`, `idmap_ambiguous` |
| `cards.tcgdex_id`, `sets.tcgdex_id` | — | — | — | not written here — the map is returned, not stored | [S02.T06](T06-load-cards.md) persists it |

## Interfaces

**`packages/etl/src/idmap.ts`** (pure — no `node:fs`, no network; the overrides are injected)

```ts
export interface Overrides { sets: Record<string, string | string[]>; cards: Record<string, string>; }
export interface BriefCard { id: string; localId: string; name: string; }
export interface CanonicalCard { id: string; number: string; name: string; }
export interface MatchResult {
  matches: Map<string, string>;                 // ptcgCardId -> tcgdexCardId
  unmatched: CanonicalCard[];
  byNumber: number; byName: number; byOverride: number; ambiguous: string[];
}
export function setIdCandidates(ptcgSetId: string, overrides?: Overrides): string[];
export function resolveTcgdexSet(ptcgSetId: string, known: ReadonlySet<string>, overrides?: Overrides): string | null;
export function normNumber(num: string | null | undefined): string;
export function cardOverride(ptcgCardId: string, overrides?: Overrides): string | undefined;
export function matchCards(ptcg: CanonicalCard[], brief: BriefCard[], overrides?: Overrides): MatchResult;
export const OverridesSchema: z.ZodType<Overrides>;
```

**Set-id heuristics, in the exact order the candidate list is built.** Each block *appends*; the list is deduped at the end, so an earlier block wins.

| # | Pattern (on the canonical set id) | Candidates appended | Examples |
|---|---|---|---|
| 0 | `overrides.sets[id]` | that string or array, and nothing else | — |
| 1 | `^sv(\d+)(pt5)?$` | `sv{n:02}{.5?}`, `sv{n}{.5?}` | `sv1→sv01`, `sv10→sv10`, `sv3pt5→sv03.5`, `sv8pt5→sv08.5` |
| 2 | `^me(\d+)(pt5)?$` | `me{n:02}{.5?}`, `me{n}{.5?}` | `me1→me01`, `me2pt5→me02.5` |
| 3 | `^swsh(\d+)(pt5)?(tg\|sv\|gg)?$` | base = `swsh{n}.5` when `pt5`; else `swsh{d}.5` when `n` has 2 digits, ends in `5` and is not `15`; else `swsh{n}`. With a gallery suffix: `base+suffix`, then `base`. Without: `base`, then `swsh{n}` | `swsh45→swsh4.5`, `swsh35→swsh3.5`, `swsh12pt5→swsh12.5`, `swsh9tg→[swsh9tg, swsh9]`, `swsh45sv→swsh4.5sv`, `swsh12pt5gg→swsh12.5gg`, `swsh10→swsh10`, `swsh11→swsh11` |
| 4 | `pgo` / `sm115sv` | `swsh10.5` / `sma` | Pokémon GO; Hidden Fates Shiny Vault |
| 5 | `zsv10pt5` / `rsv10pt5` | `sv10.5b` / `sv10.5w` | Black Bolt / White Flare |
| 6 | `^sm(\d+)$` | `sm{n[:-1]}.5` when `n` ends in `5` and `n ∉ {5, 15}`; then `sm{n}` | `sm35→sm3.5`, `sm115→sm11.5`, `sm5→sm5` |
| 7 | `^mcd(\d{2})$` | `{2000+yy}{era}`, `mcd{yy}`, `{2000+yy}` — era `swsh` up to 2022, `sv` after | `mcd21→2021swsh`, `mcd23→2023sv` |
| 8 | `cel25c` | `cel25cc` | Celebrations Classic Collection |
| 9 | `^(sm\d+\|swsh\d+)sv$` | first candidate of the base id | `sm115sv→sm11.5` (after `sma`) |
| 10 | `svp`, `sve` | themselves | promos, basic energies |
| 11 | fallback | the id itself, then the id with `pt5`→`.5` | `xy1→xy1` |

**Card matching, in order.** (1) `overrides.cards[ptcgId]`. (2) Index the TCGdex brief by `normNumber(localId)`; a unique candidate matches. (3) Several candidates → the one whose lowercase trimmed name equals the canonical one; otherwise the first, recorded in `ambiguous`. (4) Leftovers → name fallback over the *unclaimed* briefs, only when the normalized name occurs exactly once on each side. (5) Whatever remains is `unmatched`.

**`normNumber`.** `String(num).trim().toLowerCase()` then `^([a-z-]*)0*(\d+)([a-z]*)$` → `prefix + Number(digits) + suffix`; no match → the lowercased trimmed input. Null/undefined → `""`.

**`packages/etl/idmap-overrides.json`** — ships as `{ "sets": {}, "cards": {} }`. `sets` maps a canonical set id to a TCGdex set id or an ordered array of them; `cards` maps a canonical card id to a TCGdex card id. Every entry carries a one-line comment in the sibling `idmap-overrides.md` saying why it exists and when it can be removed (a JSON file cannot hold comments and an undocumented override is how heuristics rot).

**Reports.** UTF-8, CRLF-free, `\n` line endings, header row always written, fields quoted per RFC 4180 (card names contain `,`, `★` and `δ`). Written by `writeUnmatchedReports(dir, { sets, cards })` from [S02.T01](T01-etl-cli-and-raw-cache.md)'s `reports.file()` helper.

## Implementation steps

1. Create `packages/etl/src/idmap.ts` with `normNumber` and its table-driven spec (the six legacy assertions plus `CC001` and the empty string).
2. Implement `setIdCandidates` block by block, adding the corresponding legacy assertion as each block lands; finish with the dedupe pass (BR-S02.T04-01).
3. Add `OverridesSchema`, `loadOverrides()` and the early-return override branch; ship the empty override file and its `.md` companion (BR-S02.T04-02, -09).
4. Implement `resolveTcgdexSet(ptcgSetId, known)` walking the candidate list; spec the null case (BR-S02.T04-03).
5. Implement `matchCards` steps 1–3 (override, unique number, name tie-break) with the `ambiguous` counter (BR-S02.T04-07).
6. Add the name fallback with the `taken` set and the both-sides-unique guard; spec it with a reduced `cel25c`/`cel25cc` fixture reproducing the six alt-art rows (BR-S02.T04-05, -06).
7. Write `writeUnmatchedReports()` with RFC 4180 quoting and a deterministic row order; spec that a name containing a comma round-trips.
8. Wire the step into the load orchestrator: resolve each set, fetch its brief, match its cards, accumulate the counters, write both reports at the end (BR-S02.T04-08).
9. Run against the full cache and compare with the legacy baseline (0 sets, 6 cards); record the actual numbers in `packages/etl/README.md` so a future drift is visible.

## Edge cases and error handling

- **A canonical set has no TCGdex counterpart** (a brand-new set, or an era TCGdex does not carry). `resolveTcgdexSet` returns `null`, the set is written to `idmap_unmatched_sets.csv`, and [S02.T06](T06-load-cards.md) loads its cards from the canonical source alone — no prices, `tcgdex_id IS NULL`, `tcgdex_legal_* IS NULL`.
- **A card numbered `TG01`.** `normNumber("TG01") → "tg1"`, which is also what the TCGdex brief's `localId` `TG01` normalizes to, so Trainer Gallery cards match inside the gallery set (`swsh9tg`) — provided candidate block 3 resolved the set to `swsh9tg` before falling back to `swsh9`.
- **A card numbered `SV045`** (Shiny Vault). `normNumber → "sv45"`; the leading-zero strip must not eat the `sv` prefix, which is why the regex captures `[a-z-]*` before `0*`.
- **Two TCGdex cards share a normalized number** (a set that reuses numbers across subsets). The exact-name tie-break decides; if names also collide, the first brief entry wins and the pair is counted in `idmap_ambiguous`, which is a signal to add an override, not a failure.
- **Two canonical cards share a number** (`cel25c-93` and `cel25c-93_A`). Both look up the same number bucket; if that bucket has one entry, both would claim it — prevented because step 2 only matches when the *number* index is used and step 4's `taken` set blocks the second claim. The alt-art therefore ends unmatched, which is the observed legacy outcome and the honest one: guessing would attach the wrong price.
- **A set's brief has no `cards` array** (empty or not yet populated). `matchCards` receives `[]`, every canonical card is unmatched and reported; the load still writes the set and its cards.
- **`idmap-overrides.json` is missing.** Treated as `{ sets: {}, cards: {} }` — the shipped default; a *malformed* file is a hard error, because silently ignoring a typo would silently change the mapping.
- **An override points at a TCGdex set that does not exist.** `resolveTcgdexSet` finds no candidate in `known` and returns `null`; the set is reported as unmatched with its override id in the log line, so the stale override is obvious.
- **A canonical card id appears twice in one set file** (upstream duplication). The map keeps the first; the duplicate is counted in `idmap_ambiguous` and the loader's upsert makes the second a no-op.

## Acceptance / verification

- [ ] `idmap.spec.ts` ports every assertion of `pokemon/tests/test_idmap.py` and passes: `sv1→sv01`, `sv10→sv10`, `sv3pt5→sv03.5`, `sv8pt5→sv08.5`, `me1→me01`, `me2pt5→me02.5`, `swsh45→swsh4.5`, `swsh35→swsh3.5`, `swsh12pt5→swsh12.5`, `swsh9tg→[swsh9tg, swsh9]`, `swsh45sv→swsh4.5sv`, `swsh12pt5gg→swsh12.5gg`, `pgo→swsh10.5`, `swsh10→swsh10`, `swsh11→swsh11`, `zsv10pt5→sv10.5b`, `rsv10pt5→sv10.5w`, `cel25c→cel25cc`, `2021swsh ∈ mcd21`, `2023sv ∈ mcd23`, `sm35→sm3.5`, `sm115→sm11.5`, `sm5→sm5`.
- [ ] `> normNumber` table green for `001→1`, `TG01→tg1`, `SV045→sv45`, `12a→12a`, `CC001→cc1`, `""→""` (BR-S02.T04-04).
- [ ] `> matchCards` reproduces the legacy case: canonical `[x-1 #1 A, x-TG01 #TG01 B, x-99 #99 C]` against brief `[y-001 A, y-TG01 B]` yields exactly `{x-1→y-001, x-TG01→y-TG01}` and one unmatched (BR-S02.T04-05).
- [ ] `> duplicate name on the canonical side stays unmatched` on a `cel25c`-shaped fixture, and the six alt-art ids are the ones reported (BR-S02.T04-06).
- [ ] `> set override short-circuits the heuristics` and `> malformed overrides file throws with the offending path` (BR-S02.T04-02, -09).
- [ ] `pnpm etl full` on the full cache writes both reports; `idmap_unmatched_sets.csv` has ≤ 1 data row and `idmap_unmatched_cards.csv` ≤ 10 (legacy baseline: 0 and 6), and the row counts equal `etl_runs.stats_json.unmatched_sets` / `.unmatched_cards` (BR-S02.T04-03, -08).
- [ ] Re-running the same load rewrites both CSVs byte-identically (determinism, BR-S02.T04-01).
- [ ] `grep -R "node:fs\|undici" packages/etl/src/idmap.ts` returns nothing — the module is pure and browser-testable.

## Risks and open questions

- **Risk — a new era breaks a heuristic silently.** A wrong-but-existing candidate (e.g. a future `sv13` colliding with something) would attach the wrong prices. Mitigation: the unmatched counters are in `etl_runs.stats_json` and [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) alerts when they grow; `idmap_ambiguous` surfaces the near-misses; overrides are one line.
- **Risk — the name fallback matches the wrong printing** when a set reprints a name. Mitigated by the both-sides-unique guard (BR-S02.T04-06); the cost is six unmatched cards, which is the right trade for a price column.
- **Risk — the heuristics are ported with a subtle regression** (zero-padding, the `n != "15"` exception). Mitigation: the ported assertions are the acceptance gate, and the first full run is compared against the recorded legacy baseline.
- **Question — should unmatched cards be retried by `image` URL comparison?** Both sources expose image URLs that encode the set and number. Recommendation: no, not for six cards; revisit if the count ever exceeds ~50. Owner: whoever runs the first full load.
- **Question — should `idmap_ambiguous` fail the run above a threshold?** Recommendation: warn only, with the ids listed, until a real ambiguity is observed on current data. Decide with [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) when alert thresholds are set.

## References

- `pokemon/src/pokesearch/etl/idmap.py` — verified (184 lines): `set_id_candidates` in the block order reproduced above, including the `swsh` two-digit `.5` rule with the `n != "15"` exception and the gallery-suffix pair; `norm_number` with `re.fullmatch(r"([a-z\-]*)0*(\d+)([a-z]*)", s)`; `match_cards` with the override → number → name tie-break → unclaimed-name-fallback order and its `taken` set. Consult for the heuristics; rewrite in TypeScript.
- `pokemon/tests/test_idmap.py` — verified: the 23 assertions listed in Acceptance, in four test functions (`test_set_candidates_sv`, `test_set_candidates_me_swsh`, `test_set_candidates_special`, `test_norm_number`, `test_match_cards`).
- `pokemon/src/pokesearch/etl/idmap_overrides.json` — verified: exactly `{"sets": {}, "cards": {}}`; the heuristics needed no manual exception.
- `pokemon/data/reports/idmap_unmatched_sets.csv` and `idmap_unmatched_cards.csv` — verified: header-only (0 sets) and 6 rows, all `cel25c → cel25cc` alt-art printings, with the column layout this subtask reproduces.
- `pokemon/src/pokesearch/etl/run.py` — verified: `_resolve_tcgdex_set()` walks `set_id_candidates` against the TCGdex id set, and the two CSVs are written at the end of `run_load`.
- External: `https://api.tcgdex.net/v2/en/sets` for the TCGdex set universe; `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json` for the canonical one.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
