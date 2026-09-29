# S02.T03 — Fetch TCGdex — completion log

Companion log for [T03-fetch-tcgdex.md](T03-fetch-tcgdex.md). The specification file itself is unchanged.

| Field | Value |
|---|---|
| **Status** | `COMPLETED` |
| **Completion Date** | 2026-09-29 |
| **Subtask ID** | S02.T03 |
| **Test Status** | `PASSED` |

## Files created / modified

| Path | Change |
|---|---|
| `packages/etl/src/fetch-tcgdex.ts` | created — the whole module (704 lines) |
| `packages/etl/src/index.ts` | modified — re-exports `./fetch-tcgdex.js` |
| `packages/db/src/testing/index.ts` | modified — `listFixtures()` lists envelope fixtures only |
| `packages/db/fixtures/README.md` | modified — documents the raw source documents |
| `packages/etl/src/fetch-tcgdex.spec.ts` | RED phase, unchanged |
| `packages/db/fixtures/tcgdex-card-*.json` | RED phase, unchanged (3 fixtures) |

## Test status

`npx vitest run` at the repository root: **35 files, 395 tests, all passing.** The subtask suite, `packages/etl/src/fetch-tcgdex.spec.ts`, contributes 59 tests and was run four times to confirm the two timing-sensitive cases are stable. `tsc --noEmit` and `eslint` are clean for `@pokesearch/db` and `@pokesearch/etl`.

## Business rules

| Rule | Enforcement point in `fetch-tcgdex.ts` |
|---|---|
| BR-S02.T03-01 | `readJsonFileOrPurge()` guard at the top of each `fetchCards` worker, `fetchSetBrief` and `fetchSetList`; a file that no longer parses is deleted and re-fetched once |
| BR-S02.T03-02 | the `_fetched_at` stamp is added in the `fetchCards` write path only; `fetchSetList` and `fetchSetBrief` write the document untouched |
| BR-S02.T03-03 | `limiter()` wraps `performRequest` alone; `getJson` sleeps between two limited calls, with the slot already released |
| BR-S02.T03-04 | the `notFound` branch of `performRequest` returns before any write; 404 is not in `RETRYABLE_STATUSES` |
| BR-S02.T03-05 | `backoffDelay(attempt, response?)` — 1/2/4/8/16 s capped at 16 s, ±20 % jitter, `Retry-After` in seconds or as an HTTP-date taking precedence |
| BR-S02.T03-06 | per-id `try`/`catch` in `fetchCards` fills `failedIds`; `fetchSetList` throws |
| BR-S02.T03-07 | `consecutiveFailures` in `fetchCards`, reset by every verdict, raising `TcgdexUnavailableError` at 50 |
| BR-S02.T03-08 | the body is parsed inside `performRequest`, so `writeJsonAtomic` only ever runs on a document that already parsed |
| BR-S02.T03-09 | `REQUEST_HEADERS` is the single header source; the module never reads the environment and sends no credential |

## Contract points settled during implementation

Three details the subtask document left open. All three are pinned by the RED-phase suite.

1. **`baseUrl` and `backoffMs` are test hooks on every entry point**, matching `fetch-ptcg.ts`. Without them the retry and circuit-breaker cases would sleep for minutes.
2. **`results` and `failedIds` are disjoint.** `null` in `results` means a confirmed 404; an id that exhausted its five attempts is absent from `results` and named in `failedIds`.
3. **`backoffDelay` is exported**, `attempt` is 1-based, and `retries` counts attempts beyond the first.

## Implementation notes worth carrying forward

- **The circuit breaker counts cards, not requests.** Fifty cards in a row that exhaust their attempts abort the step; a card resolved from cache, from the network or as a 404 resets the counter. Counting raw requests would trip on a merely flaky endpoint, because a single dead card contributes five failures on its own.
- **A retry re-enters the limiter at the front of the queue.** A card's five attempts therefore stay close together instead of being pushed behind every id that has not been tried yet. Without this, on a half-failing endpoint every failing card would finish only after every healthy one, bunching all failures at the tail of the run and tripping the breaker on an endpoint that is answering half its requests correctly.
- **An unparseable 200 body is treated as a transport failure**, so it is retried and, if it never parses, leaves the previous cached document untouched (BR-S02.T03-08).
- **`listFixtures()` now filters on the envelope marker**, not on the file name. The three TCGdex fixtures are raw source documents living in `packages/db/fixtures/`, and the S01.T03 loader was enumerating them and failing schema validation. This was a regression introduced by the RED-phase commit and is fixed here rather than left for S02.T07.
- **`headersTimeout` / `bodyTimeout` are not set.** The interface section of the subtask describes them as `undici` `Agent` options; the module uses the global `fetch` (which is `undici` underneath) without a custom dispatcher, exactly as `fetch-ptcg.ts` does. Adding per-request timeout signals is a follow-up, not a requirement of any rule.

## Not done here (by design)

- **CLI wiring** (implementation step 8) — `etl full [--skip-tcgdex] [--seed-tcgdex-from <dir>]`, the `run.add` counters and the request-rate/ETA line. The module exposes everything those need (`FetchCardsResult` counters, `onProgress`, `seedCacheFrom`), and no acceptance check of this subtask asserts CLI behaviour. It belongs with the other stage-2 step wiring.
- Id mapping ([S02.T04](T04-set-and-card-id-mapping.md)), turning `pricing` into rows ([S02.T07](T07-prices-snapshot.md)) and card columns ([S02.T06](T06-load-cards.md)) — out of scope as stated.
