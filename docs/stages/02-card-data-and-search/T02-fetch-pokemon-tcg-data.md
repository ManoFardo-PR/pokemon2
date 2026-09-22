# S02.T02 — Fetch pokemon-tcg-data (canonical card JSON)

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 2 / 14 |
| Depends on | [S02.T01](T01-etl-cli-and-raw-cache.md) |
| Unblocks | [S02.T04](T04-set-and-card-id-mapping.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md) |
| Parallel with | [S02.T03](T03-fetch-tcgdex.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` CLI + cache layout + run log — from [S02.T01](T01-etl-cli-and-raw-cache.md)
- `external` `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json` and `cards/en/<setId>.json`
- `file` `pokemon/src/pokesearch/etl/fetch_ptcg.py` — the ETag strategy and the changed-set detection this subtask re-expresses in TypeScript; read-only reference

## Outputs (proposed)
- `module` `etl/fetch-ptcg.ts` — `fetchSets()`, `fetchSetCards(setId)`, `fetchAll({ force }) → { changedSetIds }` with `If-None-Match` per file stored in `pokemon-tcg-data/etags.json`; 304 = unchanged — consumed by [S02.T04](T04-set-and-card-id-mapping.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md)
- `file` cached JSON under `RAW_CACHE_DIR/pokemon-tcg-data/` (≈176 files, ≈26 MB)

## Initial objective
The canonical English card data (names, attacks, abilities, HP, types, rarity, artist, legalities, `ptcgoCode`, image URLs) is on disk and refreshable in seconds when nothing changed, with the list of changed sets driving incremental loads.

## Context

pokemon-tcg-data is the **canonical** source of this project: every word of English card text, every attack cost and every legality string comes from it, and the rules base of S05 hashes that text (RN-05). TCGdex ([S02.T03](T03-fetch-tcgdex.md)) only complements it with prices, variants, WebP images and a second legality opinion. The split matters for provenance ([S02.T06](T06-load-cards.md)) and for the promise in RN-01 that neither source overwrites the other.

The repository is plain files on GitHub raw — no API key, no rate limit worth engineering around, ~176 files and ~26 MB in total. The only real requirement is that the second run costs nothing. The legacy solved that with per-file ETags: `pokemon/src/pokesearch/etl/fetch_ptcg.py` keeps `{relativePath: etag}` in `etags.json`, sends `If-None-Match` when the destination file exists *and* an ETag is known, treats 304 as "unchanged", and returns the list of set ids whose card file was rewritten. `etl delta` then loads only those sets. That design is kept verbatim in behaviour, with one correction: the legacy sends a conditional request even when the cached file was later deleted only because it checks `dest.exists()` first — but it never verifies that the *cached bytes* are still readable JSON, so a truncated file survives forever. Here the cache entry is validated before it is trusted (BR-S02.T02-04).

D-003 forbids reusing the legacy database; it does not forbid reusing a downloaded file. Nothing here needs the legacy cache anyway — 26 MB downloads in well under a minute.

## Scope

- **In scope.** `packages/etl/src/fetch-ptcg.ts`: the HTTP client configuration, the ETag store, conditional requests, atomic writes, retry on transport errors and 5xx, the `changedSetIds` computation, the reader helpers `loadSets()` / `loadCards(setId)` used by [S02.T04](T04-set-and-card-id-mapping.md) and [S02.T06](T06-load-cards.md), and the counters this step adds to `etl_runs.stats_json`.
- **Out of scope.** Parsing card documents into rows ([S02.T06](T06-load-cards.md)); id mapping ([S02.T04](T04-set-and-card-id-mapping.md)); TCGdex ([S02.T03](T03-fetch-tcgdex.md)); recording the repository's licence in `docs/NOTICE.md` ([S01.T09](../01-foundation/T09-licensing-and-notice.md)) — a prerequisite for production use, tracked there; scheduling the refresh ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask; RN-01 (both raw documents preserved) is enforced downstream in [S02.T05](T05-cards-schema-migration.md)/[S02.T06](T06-load-cards.md), and this fetcher is what makes the canonical half of it available.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T02-01 | A conditional request is sent only when the cached file exists, parses as JSON and has a stored ETag; otherwise the file is fetched unconditionally. | `shouldRevalidate()` in `fetch-ptcg.ts`, evaluated before every request | `fetch-ptcg.spec.ts > deleted cache file is re-downloaded unconditionally`; `> corrupt cache file is re-downloaded` |
| BR-S02.T02-02 | A `304 Not Modified` never rewrites the cached file and never marks the set as changed. | the 304 branch returns `{ changed: false }` before touching disk | `fetch-ptcg.spec.ts > second run reports 0 changed sets and writes no file` (mtimes unchanged) |
| BR-S02.T02-03 | `changedSetIds` contains exactly the sets whose `cards/en/<id>.json` bytes were rewritten in this run — not sets whose ETag rotated without a content change. | the changed flag is set after comparing the SHA-256 of the new bytes with the cached file's | `fetch-ptcg.spec.ts > same body with a new ETag reports 0 changed sets` |
| BR-S02.T02-04 | A cache file is only trusted after it parses as JSON and is an array (cards) or an array of objects with an `id` (sets); a file that fails is deleted and re-fetched once. | `readCachedJson()` validation in the reader helpers | `fetch-ptcg.spec.ts > truncated cards file is deleted and re-fetched` |
| BR-S02.T02-05 | A `404` on `cards/en/<id>.json` is a warning counted in `stats_json.missing_card_files`, not a failure; a `404` on `sets/en.json` fails the run. | the per-file error branch distinguishes the set index from a set's cards | `fetch-ptcg.spec.ts > 404 on one set warns and continues`; `> 404 on sets/en.json throws` |
| BR-S02.T02-06 | Every write is atomic: a partially downloaded body never replaces a valid cache file. | `writeJsonAtomic()` from [S02.T01](T01-etl-cli-and-raw-cache.md) (temp file + `rename`) | `fetch-ptcg.spec.ts > aborted body leaves the previous file intact` |
| BR-S02.T02-07 | Transport errors and 5xx are retried up to 3 times with backoff 1 s → 2 s → 4 s; 4xx other than 404 fail immediately. | `getWithRetry()` retry predicate | `fetch-ptcg.spec.ts > 503 then 200 succeeds with two requests`; `> 403 fails without retry` |
| BR-S02.T02-08 | `etags.json` is rewritten once, at the end of the run, from the in-memory map; a failed run leaves the previous file untouched. | `saveEtags()` called from the `finally` of a successful pass only | `fetch-ptcg.spec.ts > run that throws leaves etags.json unchanged` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `$RAW_CACHE_DIR/pokemon-tcg-data/sets/en.json` | C/U | etl | every `full`/`delta` run | written only on a 200 with a body that parses as a non-empty array; atomic rename | ≈1 file, the set index |
| `$RAW_CACHE_DIR/pokemon-tcg-data/cards/en/<setId>.json` | C/U | etl | per set in the index (filtered by `--sets`) | no-op on 304 or on identical bytes; atomic rename | ≈175 files, ≈26 MB together |
| `$RAW_CACHE_DIR/pokemon-tcg-data/etags.json` | C/U | etl | once, at the end of a successful pass | rewritten whole from the in-memory map; keys are repo-relative paths | never partially updated (BR-S02.T02-08) |
| cache files | D | etl | when a cached file fails validation | deleted then re-fetched once in the same run | BR-S02.T02-04 |
| `$RAW_CACHE_DIR/pokemon-tcg-data/**` | R | etl (`loadSets`, `loadCards`) | [S02.T04](T04-set-and-card-id-mapping.md), [S02.T06](T06-load-cards.md) | read-only, no network | makes a full reload possible offline |
| `etl_runs.stats_json` | U | etl | end of the run, via `run.add()` | flat counters only | `http_requests`, `http_304`, `sets`, `sets_changed`, `missing_card_files`, `bytes_downloaded` |
| card tables | — | — | — | not written here | rows are [S02.T06](T06-load-cards.md)'s |

## Interfaces

**`packages/etl/src/fetch-ptcg.ts`**

```ts
export const PTCG_RAW_BASE = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master";

export interface PtcgSet { id: string; name: string; series?: string; printedTotal?: number; total?: number;
  releaseDate?: string; ptcgoCode?: string; legalities?: Record<string, string>;
  images?: { symbol?: string; logo?: string }; updatedAt?: string; }
export interface PtcgCard { id: string; name: string; number: string; supertype?: string; subtypes?: string[];
  hp?: string; types?: string[]; evolvesFrom?: string; evolvesTo?: string[]; rules?: string[];
  flavorText?: string; regulationMark?: string; rarity?: string; artist?: string;
  nationalPokedexNumbers?: number[]; retreatCost?: string[]; convertedRetreatCost?: number;
  attacks?: { name?: string; cost?: string[]; convertedEnergyCost?: number; damage?: string; text?: string }[];
  abilities?: { name?: string; type?: string; text?: string }[];
  weaknesses?: { type?: string; value?: string }[]; resistances?: { type?: string; value?: string }[];
  legalities?: Record<string, string>; images?: { small?: string; large?: string }; }

export interface FetchAllOptions { force?: boolean; onlySets?: string[]; signal?: AbortSignal; }
export interface FetchAllResult { sets: PtcgSet[]; changedSetIds: string[]; missingCardFiles: string[];
  requests: number; notModified: number; bytes: number; }

export async function fetchSets(opts?: { force?: boolean }): Promise<PtcgSet[]>;
export async function fetchSetCards(setId: string, opts?: { force?: boolean }): Promise<PtcgCard[]>;
export async function fetchAll(opts?: FetchAllOptions): Promise<FetchAllResult>;

export function loadSets(): PtcgSet[];              // cache only, throws CacheMissError
export function loadCards(setId: string): PtcgCard[];  // cache only, [] when the set has no card file
export class CacheMissError extends Error { path: string; }
```

**HTTP.** `undici` `request` with `headers: { "user-agent": "pokesearch2-etl/0.1 (+local)", "accept": "application/json" }`, `bodyTimeout: 60_000`, `headersTimeout: 15_000`, redirects followed (max 3). Concurrency 4 over the set files (GitHub raw is a CDN; 176 files at 4 in flight finish in seconds and stay polite). Retry: 3 attempts, backoff 1 s → 2 s → 4 s, on `ECONNRESET`/`ETIMEDOUT`/`ENOTFOUND` and on 429/500/502/503/504.

**ETag store.** `pokemon-tcg-data/etags.json` = `{ "sets/en.json": "W/\"…\"", "cards/en/sv8.json": "…" }`, keys relative to `PTCG_RAW_BASE`, pretty-printed with one-space indent so a diff is readable. Missing or unparsable → treated as `{}` (every file re-fetched unconditionally, which is correct and costs 26 MB).

**Progress.** One log line per 25 set files plus a final summary: `fetch-ptcg: 176 files, 3 changed, 173 not modified, 1.2 MB downloaded in 4.1 s`.

**Env.** None of its own. `RAW_CACHE_DIR` comes through `etl/paths.ts`; `--force` and `--sets` come from the CLI.

## Implementation steps

1. Add `undici` to `packages/etl` and write `http.ts` with `getWithRetry(url, { etag, signal })` returning `{ status, body, etag }`; spec the retry predicate (BR-S02.T02-07).
2. Write the ETag store (`loadEtags`, `saveEtags`) with the "unparsable → `{}`" rule; spec that a failing run leaves the file untouched (BR-S02.T02-08).
3. Implement `fetchSets()`: conditional GET of `sets/en.json`, validation, atomic write; spec 200, 304 and a corrupt cache file.
4. Implement `fetchSetCards(setId)` with the same shape, plus the 404 branch that returns `[]` and records the set id; spec both 404 branches (BR-S02.T02-05).
5. Implement `fetchAll()`: read the index, apply `--sets`, fan out at concurrency 4, collect `changedSetIds` by comparing content hashes, and return the counters; spec the "same body, new ETag" case (BR-S02.T02-03).
6. Add `loadSets()` / `loadCards()` offline readers with the validation rule and `CacheMissError`; spec that they never touch the network.
7. Wire the step into the CLI registry so `etl full` and `etl delta` call it, and feed `run.add({ http_requests, http_304, sets, sets_changed, missing_card_files, bytes_downloaded })`.
8. Record the two counters the stage exit criteria need (`sets`, `sets_changed`) in `packages/etl/README.md`, and add a fixture set (3 cards) under `packages/db/fixtures/` shared with [S02.T06](T06-load-cards.md).

## Edge cases and error handling

- **A 304 arrives but the cached file was deleted meanwhile.** Cannot happen by construction: the conditional header is only sent when the file exists and parses (BR-S02.T02-01). If it happens anyway (file removed between the check and the response), the 304 branch detects the missing file and re-issues one unconditional request; a second miss fails the run.
- **A set's `cards/en/<id>.json` returns 404.** The set exists in the index but has no card file yet (a freshly announced set). The id is added to `missingCardFiles`, a warning is logged, the run continues. [S02.T06](T06-load-cards.md) will upsert the set row with zero cards.
- **`sets/en.json` returns 404 or an HTML error page.** The run fails with `status='error'`: without the index nothing downstream is meaningful, and an HTML body fails the "array of objects with `id`" validation before it can be written.
- **GitHub answers 429 or 403 (secondary rate limit).** 429 is retried with backoff; 403 fails immediately with the response's `x-ratelimit-reset` echoed in the message, because retrying a hard block is how a client gets banned.
- **A cached card file is truncated** (a previous crash before atomic writes existed, or an interrupted OneDrive sync). `readCachedJson` fails, the file is deleted, one unconditional re-fetch replaces it; the set counts as changed.
- **The ETag rotates without a content change** (GitHub re-packs the object). The bytes hash equal, the file is not rewritten, the set is not in `changedSetIds`, so `etl delta` does no useless work — only the ETag entry is updated.
- **A set is removed from `sets/en.json`.** Its cached card file stays on disk and is ignored; nothing is deleted from the cache automatically, and [S02.T06](T06-load-cards.md) leaves the existing rows alone. Removing stale sets is a manual `--prune` decision, not a fetcher's.
- **`--sets sv8,sv8pt5` is passed.** Only those card files are considered; `sets/en.json` is still refreshed, because the index is what maps the ids, and `changedSetIds` is restricted to the selection.
- **The run is aborted (`SIGINT`).** The `AbortSignal` cancels in-flight requests; partially written temp files are removed by `writeJsonAtomic`; `etags.json` is not saved, so the next run revalidates everything it already had.

## Acceptance / verification

- [ ] `fetch-ptcg.spec.ts` green against a local HTTP double: first run downloads index + N set files and reports `sets_changed = N`; second consecutive run issues only conditional requests, reports `0` changed and leaves every file mtime unchanged (BR-S02.T02-02).
- [ ] `> deleted cache file is re-downloaded unconditionally` — remove one cached set file, re-run, exactly that file is requested without `If-None-Match` and rewritten (BR-S02.T02-01).
- [ ] `> same body with a new ETag reports 0 changed sets` (BR-S02.T02-03).
- [ ] `> truncated cards file is deleted and re-fetched` — write `{"a":` into a cache file, re-run, the file is valid afterwards and the set counts as changed (BR-S02.T02-04).
- [ ] `> 404 on one set warns and continues` with `stats_json.missing_card_files` naming it; `> 404 on sets/en.json throws` and the run closes as `error` (BR-S02.T02-05).
- [ ] `> aborted body leaves the previous file intact` — the double closes the connection mid-body; the cached file still parses and holds the old content (BR-S02.T02-06).
- [ ] `> 503 then 200 succeeds with two requests` and `> 403 fails without retry` (BR-S02.T02-07).
- [ ] Against the real repository, `pnpm etl full --skip-tcgdex` populates `RAW_CACHE_DIR/pokemon-tcg-data/` with ≈176 files / ≈26 MB (legacy measurement) and a second run finishes in under 30 s with `sets_changed = 0`.
- [ ] `loadSets()` / `loadCards()` work with the network disabled (offline reload guarantee).

## Risks and open questions

- **Risk — the repository changes layout or stops being updated.** It is community-maintained and the paid Scrydex migration removed the free pokemontcg.io API. Mitigation: the cache is a complete offline copy, so the project keeps working; TCGdex already provides an independent card list and could become canonical, at the cost of different English wording (which would invalidate the S05 text hashes — a real cost, recorded here so it is not discovered later).
- **Risk — 26 MB of JSON re-parsed on every load.** Mitigation: [S02.T06](T06-load-cards.md) streams per set, and `etl delta` only touches `changedSetIds`.
- **Risk — the licence of pokemon-tcg-data is not recorded before first use.** Mitigation: [S01.T09](../01-foundation/T09-licensing-and-notice.md) owns `docs/NOTICE.md`; this subtask's README links to it and the first production run is gated on it.
- **Question — should `etl delta` also re-check sets whose set-index entry changed** (e.g. `total` corrected) even when the card file did not? Recommendation: yes, add those ids to `changedSetIds`, since `sets` rows are cheap to upsert. Decide with [S02.T06](T06-load-cards.md)'s owner before the first delta run; today the legacy behaviour (card file only) is what is specified.
- **Question — conditional requests via `If-Modified-Since` as a fallback** when GitHub omits `ETag`? Not needed today (raw.githubusercontent.com always sends one); noted so the absence of an ETag is understood as "always re-download", not as a bug.

## References

- `pokemon/src/pokesearch/etl/fetch_ptcg.py` — verified (81 lines): `SETS_FILE = PTCG_RAW_DIR/"sets"/"en.json"`, `CARDS_DIR = PTCG_RAW_DIR/"cards"/"en"`, `ETAG_FILE = etags.json`; `_download()` sends `If-None-Match` when `not force and dest.exists() and rel in etags`, returns `False` on 304, `raise_for_status()` otherwise, writes `r.content` and stores `r.headers["etag"]`; `fetch_all()` returns the changed set ids and downgrades an `HTTPStatusError` on a set's card file to `log.warning("set %s sem arquivo de cards")`. Consult for the conditional-request strategy; the missing content check is what this subtask adds.
- `pokemon/src/pokesearch/config.py` — verified: `PTCG_RAW_BASE = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master"`.
- `pokemon/README.md` L11–18 — verified: the sources table stating that pokemon-tcg-data is the canonical English text, downloaded straight from GitHub, and that pokemontcg.io is not used because it is migrating to the paid Scrydex.
- External: `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master` (`sets/en.json`, `cards/en/<setId>.json`); the repository's own `README`/licence for [S01.T09](../01-foundation/T09-licensing-and-notice.md).
- [S02.T01](T01-etl-cli-and-raw-cache.md) — `paths.ts`, `writeJsonAtomic`, `withRun` and the agreed counter names.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
