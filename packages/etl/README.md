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

## Agreed Counter Metrics

The `etl_runs.stats_json` column records counters aggregated over the run lifecycle:
- `sets`: Number of sets processed.
- `sets_changed`: Number of sets whose data changed.
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
