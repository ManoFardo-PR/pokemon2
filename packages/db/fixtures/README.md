# Database Test Fixtures

This directory contains static, realistic test fixtures used across `@pokesearch/db`, `@pokesearch/etl`, resolver, and search test suites.

## Delivered Fixtures

- `empty.json`: Minimal valid fixture document with all row arrays empty.
- `cards-basic.json`: 5 realistic Pokémon card printings covering:
  1. Basic (`Pikachu`)
  2. Stage 2 with an ability (`Gardevoir ex`)
  3. Tera ex with attack and ability (`Charizard ex`)
  4. Trainer Supporter (`Professor's Research`)
  5. Special Energy (`Double Turbo Energy`)
- `decks-basic.json`: 2 tournament decks with resolved cards and one deliberately unresolved card line to test resolution fallback logic.

## Security & Data Integrity Checklist (BR-S01.T03-06)

All fixtures must strictly satisfy the following rules:
- [x] **Public-Source Only**: All card and deck data are public domain or openly published tournament decklists.
- [x] **No Secrets or Credentials**: Fixtures must never contain API keys (`ANTHROPIC_API_KEY`, `LIMITLESS_API_KEY`, Bearer tokens, passwords, or hashes).
- [x] **No Binary Blobs**: No raw binary images, buffers, or base64 data URIs. Image references must be public URLs or omitted.
- [x] **No Personal Data**: No PII beyond public tournament player screen names.
- [x] **Referential Integrity**: Every `card_id` referenced in `deck_cards` must either exist in `cards` within the same fixture or be explicitly marked `card_id: null` / `unresolved: 1`.
- [x] **Schema Drift Prevention**: When database schemas are migrated or updated, fixture documents must be updated to keep `source` and `rows` synchronized.
