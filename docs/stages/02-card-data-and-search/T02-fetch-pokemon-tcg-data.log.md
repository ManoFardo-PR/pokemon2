# S02.T02 Execution Log: Fetch pokemon-tcg-data (canonical card JSON)

- **Status**: COMPLETED
- **Completion Date**: 2026-09-29
- **Subtask ID**: S02.T02
- **Files Created/Modified**:
  - `packages/etl/src/fetch-ptcg.ts` (fetcher, conditional requests, retry policy, offline readers)
  - `packages/etl/src/fetch-ptcg.spec.ts` (19 tests; every rule BR-S02.T02-01 to -08 cited)
  - `packages/etl/src/orchestrator.ts` (`createFetchPtcgStep` replaces the `fetch-ptcg` stub; spec implementation step 7)
  - `packages/etl/src/orchestrator.spec.ts` (step passes CLI options to `fetchAll` and records the counters)
  - `packages/etl/src/cli.ts` (`--sets` parsing; `PTCG_RAW_BASE` / `PTCG_BACKOFF_MS` developer hooks)
  - `packages/etl/src/cli.spec.ts` (failure test kept offline through the hooks)
  - `packages/etl/src/index.ts` (exports)
  - `packages/etl/README.md` ("Data sources" section, two new counters)
  - `packages/db/fixtures/cards-ptcg-sample.json` (sample card fixture)
  - `packages/db/src/testing/index.ts` (fixture listing ignores the sample card fixture)
- **Test Status**: PASSED (19/19 in `fetch-ptcg.spec.ts`, 56/56 in `@pokesearch/etl`, 336/336 workspace; `pnpm check` exit 0)

## Execution summary

- 2026-09-28: first pass done by hand in the VS Code chat (commits `25e040e`, `2ec03ee`, `627b6cc`). It left BR-06 and BR-07 without tests, a hard-coded 100/200/400 ms backoff, 403 responses being retried, and the `fetch-ptcg` step still a stub.
- 2026-09-29: closure (commits `7eb64ce` RED, `cb5af7b` GREEN):
  - Retry policy now follows BR-S02.T02-07: transport errors and 500/502/503/504 retried three times with backoff 1 s, 2 s, 4 s (injectable); 404 handled by the caller; every other non-2xx fails immediately. **Decision**: 429 is no longer retried, to match the rule text; revisit if GitHub raw ever rate-limits the ETL.
  - The response body is read inside the retry scope, so a transfer dropped mid-body is a transport error and nothing reaches the cache (BR-06).
  - `createFetchPtcgStep` wires `fetchAll` into `etl full` / `etl delta` and records `http_requests`, `http_304`, `sets`, `sets_changed`, `missing_card_files`, `bytes_downloaded`. `RunHandle.add` overwrites keys; later steps that share a counter name (`http_requests` with TCGdex) must add to the current value.
- Acceptance item 8, measured 2026-09-29 against the real repository with `--sets sv1`, throwaway DB and cache: run 1 wrote `sets/en.json` (78 KB), `cards/en/sv1.json` (324 KB) and `etags.json`; run 2 made 2 requests, both 304, `sets_changed = 0`, `bytes_downloaded = 0`, finished in under 1 s. The full-index run (about 176 files, 26 MB) was not executed; the pipeline stops at the `map-ids` stub until S02.T04.
- Working copies checked out before `.gitattributes` pinned LF must be renormalized once (`git rm --cached -r -q . && git reset --hard` on a clean tree), otherwise `pnpm check` fails on `schema:check` and vitest on `scripts/*.spec.mjs`.
