# PokéSearch 2

This is the monorepo for PokéSearch 2, a local web application for Pokémon TCG players.

## Environment Variables

The application uses the following environment variables:

- `DATA_DIR` - Where all heavy artifacts are stored (default: %LOCALAPPDATA%\pokemon2)
- `DATABASE_PATH` - SQLite file location (default: $DATA_DIR/pokesearch.db)
- `RAW_CACHE_DIR` - Where fetched data is cached (default: $DATA_DIR/raw)
- `CARGO_TARGET_DIR` - Where Rust builds are stored (default: $DATA_DIR/target)
- `ENGINE_BIN` - Location of the Rust CLI (default: $CARGO_TARGET_DIR/release/ptcg-cli.exe)
- `API_PORT` - Port for the API server (default: 8000)
- `WEB_PORT` - Port for the web server (default: 5173)
- `SCHEDULER_ENABLED` - Whether to run the scheduler (default: 0)
- `LOG_LEVEL` - Verbosity of logging (default: info)
- `NODE_ENV` - Development, production, or test (default: development)

## Optional Variables

- `LIMITLESS_API_KEY` - API key for tournament data
- `ANTHROPIC_API_KEY` - API key for LLM features
- `LLM_BASE_URL` - LLM base URL
- `LLM_MODEL` - LLM model name

For more information, see the documentation in the `docs/` directory.