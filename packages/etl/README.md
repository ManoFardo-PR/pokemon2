# @pokesearch/etl

Executable ETL pipeline for PokeSearch card ingestion, price snapshots, tournament decks, and full-text search indexing.

## Subcommands

- `etl full [--sets <id,...>] [--force] [--skip-tcgdex] [--concurrency <n>] [--json] [--verbose]`
- `etl delta [--skip-tcgdex] [--json]`
- `etl prices [--no-refresh] [--date <YYYY-MM-DD>] [--json]`
- `etl fts [--json]`
- `etl decks [--web] [--skip-api] [--days <n>] [--min-players <n>] [--max-tournaments <n>] [--refresh-recent-days <n>] [--prune-days <n>] [--force] [--json]`
- `etl status [--kind <kind>] [--json]`

## Global Options

- `--db <path>`: SQLite database file path (default: `$DATABASE_PATH`)
- `--cache <dir>`: Raw cache directory (default: `$RAW_CACHE_DIR`)

## Exit Codes

- `0`: Success (`etl_runs.status = 'ok'`).
- `1`: Run failed (`etl_runs.status = 'error'`).
- `2`: Usage error (invalid flag or unknown subcommand).
- `3`: Concurrency conflict (active run of same kind within 240 minutes).
- `4`: Database schema outdated (`pnpm db:migrate` required).

## Cache Directory Layout

Under `$RAW_CACHE_DIR`:
- `pokemon-tcg-data/sets/en.json`
- `pokemon-tcg-data/cards/en/${setId}.json`
- `pokemon-tcg-data/etags.json`
- `tcgdex/sets.json`
- `tcgdex/sets/${id}.json`
- `tcgdex/cards/${id}.json`
- `limitless/tournaments/${id}`
- `limitless/web/list_${id}.html`
- `reports/${name}`

## Data sources

### pokemon-tcg-data (canonical card JSON, S02.T02)

Plain files fetched from `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master`
by `src/fetch-ptcg.ts`, the first step of `etl full` and `etl delta`:

- `sets/en.json` is the index; `cards/en/<setId>.json` holds one set's cards. Both are cached
  under `$RAW_CACHE_DIR/pokemon-tcg-data/` with the same relative paths.
- Conditional requests: `etags.json` maps each relative path to the ETag last seen. A request
  sends `If-None-Match` only when the cached file exists **and** parses as a JSON array; a
  missing or truncated file is re-downloaded unconditionally (BR-S02.T02-01, -04). A 304, or a
  200 whose body equals the cached one, leaves the file untouched (BR-S02.T02-02, -03).
- `etags.json` is written once, atomically, after every set succeeded; a failed run leaves it
  as it was (BR-S02.T02-08). Every cache file is written through `writeJsonAtomic()`, so a body
  dropped mid-transfer never replaces a valid file (BR-S02.T02-06).
- Retry policy (BR-S02.T02-07): transport errors and 500/502/503/504 are retried up to three
  times with backoff 1 s, 2 s, 4 s; 404 on a set file is recorded in `missing_card_files` and the
  run continues; 404 on the index fails the run; every other 4xx (401, 403, 429, ...) fails
  immediately without retry.
- `--sets sv1,sv2` restricts the card files considered (the index is always refreshed);
  `--force` ignores the cache and the ETags.
- Offline readers: `loadSets()` and `loadCards(setId)` read the cache only; a missing index or a
  corrupted file (deleted on sight) raises `CacheMissError`; a missing set file returns `[]`.

Developer and test hooks, read by the CLI only: `PTCG_RAW_BASE` overrides the base URL and
`PTCG_BACKOFF_MS` (for example `0,0,0`) overrides the retry backoff.

## Agreed Counter Metrics

The `etl_runs.stats_json` column records counters aggregated over the run lifecycle:
- `sets`: Number of sets processed.
- `sets_changed`: Number of sets whose data changed.
- `missing_card_files`: Comma-separated ids of sets whose card file returned 404 (S02.T02).
- `bytes_downloaded`: Bytes received from pokemon-tcg-data, 304 responses excluded (S02.T02).
- `cards`: Number of cards processed.
- `attacks`: Attack definitions extracted.
- `abilities`: Ability definitions extracted.
- `weaknesses`: Weakness definitions extracted.
- `resistances`: Resistance definitions extracted.
- `unmatched_sets`: Sets without cross-source mapping.
- `unmatched_cards`: Cards without cross-source mapping.
- `http_requests`: External HTTP requests made.
- `http_304`: Requests returning HTTP 304 Not Modified.
- `cache_hits`: Local raw cache hits.
- `price_rows`: Card market price points inserted.
- `fts_rows`: Full-text search records indexed.
- `duration_ms`: Total execution duration in milliseconds.
