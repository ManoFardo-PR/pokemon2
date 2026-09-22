# S02.T07 — Price snapshots

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 7 / 14 |
| Depends on | [S02.T03](T03-fetch-tcgdex.md), [S02.T06](T06-load-cards.md) |
| Unblocks | [S02.T11](T11-api-cards-search-sets.md), [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md) |
| Parallel with | [S02.T08](T08-full-text-search.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `fetchCards(ids, { force })` and cached TCGdex card documents (`pricing` block) — from [S02.T03](T03-fetch-tcgdex.md)
- `table` `cards` (for `tcgdex_id` list) and `price_history`, `cards_market_usd` — from [S02.T06](T06-load-cards.md)
- `file` `pokemon/src/pokesearch/etl/prices.py` — the variant keys, the Cardmarket synthetic variants and the currency defaults; read-only reference

## Outputs (proposed)
- `module` `etl/prices.ts` — `snapshotFromCache(db, date = today)`, `refreshAndSnapshot(db)` (re-downloads all TCGdex cards with `force`, updates `raw_tcgdex_json`, `tcgdex_legal_*`, `tcgdex_updated`, then snapshots), `refreshMarketUsd(db)` — consumed by [S02.T11](T11-api-cards-search-sets.md), [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S08.T01](../08-operations-and-extensions/T01-scheduler.md)
- `table` `price_history` rows per (card, date, source, variant); `cards_market_usd` refreshed (min TCGplayer market USD across variants per card)

## Initial objective
Prices from both marketplaces exposed by TCGdex are recorded as dated snapshots (idempotent per day), and a single 'market USD' per card is always available for search filters, sorting and deck price totals.

## Context

Prices do three jobs in this product: they are a column on the search page, a table and a sparkline on the card page, and the **price cap** the deck optimizer respects (RN-80, [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md)). The first two want detail per marketplace and variant; the third wants one number per card. That is why there are two outputs: an append-only `price_history` keyed by `(card_id, snapshot_date, source, variant)` and a maintained `cards_market_usd` with one row per card.

TCGdex exposes both marketplaces inside the card document, so a snapshot is a pure read of the cache — *if* the cache is fresh. It is not, by design: [S02.T03](T03-fetch-tcgdex.md) caches by presence, so a card document downloaded in January still carries January's prices. Hence the two entry points. `snapshotFromCache` records what is on disk (fast, offline, used right after a full load); `refreshAndSnapshot` re-downloads every TCGdex card with `force`, writes the refreshed document back into `cards.raw_tcgdex_json` together with the legality flags and `tcgdex_updated`, and only then snapshots. The nightly job ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)) uses the second.

The legacy `pokemon/src/pokesearch/etl/prices.py` defines the shape and has two defects worth naming. It declares `_TCGPLAYER_KEYS = ("normal", "holofoil", "reverse-holofoil", "1st-edition", "1st-edition-holofoil", "unlimited", "unlimited-holofoil")` and then **never uses it**: `rows_from_pricing` iterates every dict-valued key under `pricing.tcgplayer`, so an unknown variant silently becomes a row. And it writes with `INSERT OR REPLACE`, which `packages/db/PORTABILITY.md` forbids because it deletes and re-inserts, firing cascades. Here the key list is the allow-list it was meant to be (unknown keys are counted and reported, not dropped in silence and not inserted blindly), and every write is `ON CONFLICT … DO UPDATE`.

The legacy database carried 90,709 `price_history` rows over 7 snapshot dates — cardmarket 38,206, tcgplayer 31,613, wjsutton 20,890. The third source is the optional wjsutton CSV seed (Feb/Mar 2025) and is **not** part of this subtask; the `source` `CHECK` in [S02.T05](T05-cards-schema-migration.md) accepts only `tcgplayer` and `cardmarket`, so adding it later is a migration plus a decision, not an accident.

## Scope

- **In scope.** `packages/etl/src/prices.ts`: `rowsFromPricing()` (pure), `snapshotFromCache`, `refreshAndSnapshot`, `refreshMarketUsd`, the `etl prices [--no-refresh] [--date]` wiring, the unknown-variant report, and the counters.
- **Out of scope.** Fetching ([S02.T03](T03-fetch-tcgdex.md)); the schema ([S02.T05](T05-cards-schema-migration.md)); rendering prices ([S02.T13](T13-web-card-detail-page.md)) and exposing them over HTTP ([S02.T11](T11-api-cards-search-sets.md)); deck price totals ([S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)); currency conversion — EUR is stored as EUR and never converted; the wjsutton seed (a possible extension, to be recorded in `docs/NOTICE.md` by [S01.T09](../01-foundation/T09-licensing-and-notice.md) if it is ever taken).

## Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` here.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S02.T07-01 | A snapshot is idempotent per day: re-running for the same `snapshot_date` updates the same rows and never changes the row count. | `INSERT … ON CONFLICT (card_id, snapshot_date, source, variant) DO UPDATE` | `prices.spec.ts > second run on the same date inserts nothing` (count stable, values refreshed) |
| BR-S02.T07-02 | A TCGplayer row is emitted only for a variant in the allow-list `normal, holofoil, reverse-holofoil, 1st-edition, 1st-edition-holofoil, unlimited, unlimited-holofoil`; any other key is counted in `stats_json.unknown_price_variants` and written to `reports/price_unknown_variants.csv`. | `TCGPLAYER_VARIANTS` allow-list in `rowsFromPricing` | `prices.spec.ts > unknown tcgplayer variant is reported, not inserted` |
| BR-S02.T07-03 | A Cardmarket row is emitted only when at least one of its value fields is non-null: `normal` needs one of `low`/`avg`/`trend`, `holofoil` one of `low-holo`/`avg-holo`/`trend-holo`. | the two `hasAnyValue(...)` guards | `prices.spec.ts > cardmarket block with only nulls emits no row` |
| BR-S02.T07-04 | Currency defaults are applied per source and never guessed per value: `pricing.tcgplayer.unit ?? 'USD'`, `pricing.cardmarket.unit ?? 'EUR'`. | `currencyFor(source, block)` | `prices.spec.ts > missing unit defaults to USD/EUR`; `> explicit unit is preserved` |
| BR-S02.T07-05 | `market` carries the comparable "market" number per source: TCGplayer `marketPrice`, Cardmarket `avg` (`avg-holo` for the holofoil variant). Cardmarket `trend` goes to `trend`, never to `market`. | the two field mappings in `rowsFromPricing` | `prices.spec.ts > cardmarket avg lands in market and trend in trend` |
| BR-S02.T07-06 | `cards_market_usd` holds, per card, the **minimum** `market` across TCGplayer variants of the latest snapshot in USD, plus that snapshot's date; a card with no TCGplayer market price has no row. | `refreshMarketUsd()`: delete-then-insert from `cards_latest_price WHERE source='tcgplayer' AND currency='USD' AND market IS NOT NULL` | `prices.spec.ts > market_usd equals the cheapest variant`; `> card without tcgplayer prices has no row` |
| BR-S02.T07-07 | `cards_market_usd` is refreshed inside the same transaction as the snapshot it derives from, so a reader never sees a snapshot without its aggregate. | `snapshotFromCache` calls `refreshMarketUsd` before committing | `prices.spec.ts > a failed refresh rolls the snapshot back too` |
| BR-S02.T07-08 | `refreshAndSnapshot` updates only the four TCGdex-owned columns of `cards` (`raw_tcgdex_json`, `tcgdex_legal_standard`, `tcgdex_legal_expanded`, `tcgdex_updated`); it never touches a canonical column (RN-01). | the single `UPDATE cards SET …` statement | `prices.spec.ts > refresh leaves name, hp and raw_ptcg_json untouched` |
| BR-S02.T07-09 | `--date` accepts only `YYYY-MM-DD` and refuses a date in the future; the default is today in UTC. | `parseSnapshotDate()` | `prices.spec.ts > tomorrow's date exits 2 with a message` |
| BR-S02.T07-10 | A card whose TCGdex document is missing from the cache is skipped and counted, never inserted with null prices. | the `readCachedCard(tid) ?? continue` branch | `prices.spec.ts > missing cached document is counted in skipped, no rows written` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `cards` | R | etl | start of every snapshot | `SELECT id, tcgdex_id FROM cards WHERE tcgdex_id IS NOT NULL` | the id pairing produced by [S02.T04](T04-set-and-card-id-mapping.md)/[S02.T06](T06-load-cards.md) |
| `cards` | U | etl | `refreshAndSnapshot` only | only `raw_tcgdex_json`, `tcgdex_legal_standard`, `tcgdex_legal_expanded`, `tcgdex_updated`, keyed by `tcgdex_id`; batched ≤ 1,000 rows per transaction | BR-S02.T07-08 |
| `price_history` | C/U | etl | once per snapshot date | upsert on `(card_id, snapshot_date, source, variant)`; same-day re-run leaves the count unchanged | ≈10k rows per day at current data (legacy: 90,709 rows over 7 dates) |
| `price_history` | R | etl | inside `refreshMarketUsd`, through `cards_latest_price` | read-only | — |
| `price_history` | R | api | card page price table and sparkline | read-only, `days` bounded by the endpoint | [S02.T11](T11-api-cards-search-sets.md) |
| `cards_market_usd` | D then C | etl | immediately after every snapshot, same transaction | full refresh; cards that lost all TCGplayer prices lose their row | BR-S02.T07-06, -07 |
| `cards_market_usd` | R | api, worker | price filters and sorts, deck price totals | read-only, `LEFT JOIN` | [S02.T09](T09-search-query-model-and-sql.md), [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md) |
| `$RAW_CACHE_DIR/tcgdex/cards/<id>.json` | R (and C/U under refresh) | etl | per card | reads are offline; the refresh path is [S02.T03](T03-fetch-tcgdex.md)'s `fetchCards(ids, { force: true })` | ≈20k requests, 30–60 min (legacy measurement) |
| `$RAW_CACHE_DIR/reports/price_unknown_variants.csv` | C/U | etl | end of a snapshot with unknown variants | rewritten whole; header always present | columns `card_id,source,variant,seen_at` |
| `etl_runs.stats_json` | U | etl | end of the step | flat counters | `price_rows`, `price_cards`, `price_skipped`, `unknown_price_variants`, `market_usd_rows`, `snapshot_date` |
| `cards_fts`, `sets`, `attacks`, … | — | — | — | not written here | [S02.T06](T06-load-cards.md), [S02.T08](T08-full-text-search.md) |

## Interfaces

**`packages/etl/src/prices.ts`**

```ts
export const TCGPLAYER_VARIANTS = ["normal", "holofoil", "reverse-holofoil",
  "1st-edition", "1st-edition-holofoil", "unlimited", "unlimited-holofoil"] as const;
export type TcgplayerVariant = (typeof TCGPLAYER_VARIANTS)[number];

export interface PriceRow {
  cardId: string; snapshotDate: string; source: "tcgplayer" | "cardmarket"; variant: string;
  currency: string | null;
  low: number | null; mid: number | null; high: number | null; market: number | null;
  directLow: number | null; trend: number | null;
  avg1: number | null; avg7: number | null; avg30: number | null;
}
export interface SnapshotResult {
  snapshotDate: string; rows: number; cards: number; skipped: number;
  unknownVariants: { cardId: string; source: string; variant: string }[]; marketUsdRows: number; ms: number;
}

export function rowsFromPricing(cardId: string, pricing: unknown, snapshotDate: string):
  { rows: PriceRow[]; unknown: { source: string; variant: string }[] };          // pure
export function snapshotFromCache(db: Db, date?: string): SnapshotResult;         // no network
export async function refreshAndSnapshot(db: Db, date?: string): Promise<SnapshotResult>;
export function refreshMarketUsd(db: Db): number;                                 // rows written
export function parseSnapshotDate(input?: string): string;                        // 'YYYY-MM-DD', UTC today by default
```

**Field mapping.** TCGplayer, per allowed variant key `v` under `pricing.tcgplayer`:

| Column | From |
|---|---|
| `currency` | `pricing.tcgplayer.unit ?? 'USD'` |
| `low`, `mid`, `high` | `v.lowPrice`, `v.midPrice`, `v.highPrice` |
| `market` | `v.marketPrice` |
| `direct_low` | `v.directLowPrice` |
| `trend`, `avg1`, `avg7`, `avg30` | NULL (TCGplayer exposes none) |

Cardmarket, as two synthetic variants because the source is a flat object, not a per-variant map:

| Variant | `low` | `market` | `trend` | `avg1` / `avg7` / `avg30` | emitted when |
|---|---|---|---|---|---|
| `normal` | `low` | `avg` | `trend` | `avg1`, `avg7`, `avg30` | any of `low`, `avg`, `trend` is non-null |
| `holofoil` | `low-holo` | `avg-holo` | `trend-holo` | `avg1-holo`, `avg7-holo`, `avg30-holo` | any of `low-holo`, `avg-holo`, `trend-holo` is non-null |

`currency` for both: `pricing.cardmarket.unit ?? 'EUR'`. `mid`, `high` and `direct_low` are NULL for Cardmarket.

**`refreshMarketUsd` SQL** (through the dialect module for the upsert form):

```sql
DELETE FROM cards_market_usd;
INSERT INTO cards_market_usd (card_id, market_usd, snapshot_date)
SELECT card_id, MIN(market), MAX(snapshot_date)
FROM cards_latest_price
WHERE source = 'tcgplayer' AND currency = 'USD' AND market IS NOT NULL
GROUP BY card_id;
```

**CLI.** `etl prices [--no-refresh] [--date YYYY-MM-DD] [--json]`. Without `--no-refresh` it calls `refreshAndSnapshot` (≈20k TCGdex requests, 30–60 min on a cold run); with it, `snapshotFromCache` (seconds, offline). `etl full` calls `snapshotFromCache` as its last step, because the cards were just fetched. Exit codes follow [S02.T01](T01-etl-cli-and-raw-cache.md); a malformed or future `--date` is a usage error (exit 2).

**Progress.** `prices: 12,500/20,444 cards, 9,812 rows (tcgplayer 5,004 · cardmarket 4,808), 23 skipped`.

## Implementation steps

1. Write `rowsFromPricing()` as a pure function with the allow-list, the two Cardmarket guards and the currency defaults; spec it against the three TCGdex fixture documents from [S02.T03](T03-fetch-tcgdex.md) (BR-S02.T07-02, -03, -04, -05).
2. Write `parseSnapshotDate()` with the format and future-date checks (BR-S02.T07-09).
3. Implement `snapshotFromCache`: read the `(id, tcgdex_id)` pairs, read each cached document, build rows, upsert in batches of ≤ 1,000 inside one immediate transaction, count skips (BR-S02.T07-01, -10).
4. Implement `refreshMarketUsd` and call it inside the same transaction before commit (BR-S02.T07-06, -07).
5. Implement `refreshAndSnapshot`: `fetchCards(tcgdexIds, { force: true })`, then the batched `UPDATE cards` of the four TCGdex columns, then `snapshotFromCache` (BR-S02.T07-08).
6. Add the unknown-variant report writer and the counters; wire `etl prices` and the `etl full` tail step.
7. Run `etl prices --no-refresh` against the loaded database; record rows per source and the wall time in `packages/etl/README.md`.
8. Run it twice on the same date and assert the row count is unchanged — the idempotency check the nightly job depends on.

## Edge cases and error handling

- **A card with no prices at all** (no `pricing` block, or an empty one). No `price_history` row, no `cards_market_usd` row; the card page shows "no price" and the search still lists it because [S02.T09](T09-search-query-model-and-sql.md) uses a `LEFT JOIN`. A price *filter*, however, excludes it — which is correct and documented on the search page.
- **A card whose TCGdex document is missing from the cache** (fetch failed, or the pairing points at a 404 id). Counted in `skipped`, logged once per 100, never inserted as null rows (BR-S02.T07-10).
- **Cardmarket exposes only `trend`.** The `normal` row is emitted with `market` NULL and `trend` set; the card therefore has a Cardmarket row but no `cards_market_usd` entry, because that table is USD/TCGplayer only.
- **TCGplayer reports an unknown variant key** (a new finish). It is not inserted; it goes to `stats_json.unknown_price_variants` and `reports/price_unknown_variants.csv`, so adding it to the allow-list is a one-line, reviewed change. The legacy inserted it blindly, which is how an unreviewed variant could win the `MIN(market)` aggregate.
- **`pricing.tcgplayer.unit` is something other than `USD`.** The row is stored with that currency, and `refreshMarketUsd` ignores it (`currency = 'USD'` filter), so the "market USD" column never mixes currencies.
- **Two snapshots on the same calendar day** (a manual run after the nightly one). Same primary key, values updated, count unchanged; the card page's sparkline keeps one point per day (BR-S02.T07-01).
- **`--date 2026-09-23` (tomorrow).** Refused with exit 2: a future-dated snapshot would sort after real data and break the "latest" view.
- **`--date 2025-01-01` (backfill).** Allowed: it upserts a historic date from whatever is in the cache. The card page will show it, so the log line says explicitly which date was written.
- **The refresh finds a card that is no longer legal.** `tcgdex_legal_standard` flips to 0 in the same statement as the refreshed document; the search legality filter picks it up immediately, and `raw_ptcg_json` is untouched (RN-01).
- **The refresh is interrupted after 10k of 20k cards.** The already-refreshed documents are in the cache, the `cards` updates are committed in batches, and the snapshot has not run; re-running `etl prices` refetches only what is missing from the cache and then snapshots a mix of ages — visible through `cards.tcgdex_updated` and each document's `_fetched_at`.
- **The database is locked by another writer.** The snapshot transaction waits `busy_timeout` (5 s) and then fails the run with `SQLITE_BUSY`; batching keeps each transaction short enough that this is a real signal, not routine.

## Acceptance / verification

- [ ] `prices.spec.ts > rowsFromPricing` produces the expected rows for the three fixture documents: one with both marketplaces (TCGplayer `normal` + `holofoil`, Cardmarket `normal`), one Cardmarket-only, one with no `pricing` block → zero rows (BR-S02.T07-02..05).
- [ ] `> second run on the same date inserts nothing`: `SELECT COUNT(*) FROM price_history` identical, and a changed value is visible in the row (BR-S02.T07-01).
- [ ] `> unknown tcgplayer variant is reported, not inserted` — a `foil-etched` key produces no row, one counter and one CSV line (BR-S02.T07-02).
- [ ] `> cardmarket block with only nulls emits no row` (BR-S02.T07-03); `> missing unit defaults to USD/EUR` (BR-S02.T07-04); `> cardmarket avg lands in market and trend in trend` (BR-S02.T07-05).
- [ ] `> market_usd equals the cheapest variant` for a card with `normal` 3.20 and `holofoil` 11.50 → 3.20, with the snapshot date recorded; `> card without tcgplayer prices has no row` (BR-S02.T07-06).
- [ ] `> a failed refresh rolls the snapshot back too` — an injected failure in `refreshMarketUsd` leaves `price_history` unchanged (BR-S02.T07-07).
- [ ] `> refresh leaves name, hp and raw_ptcg_json untouched` after `refreshAndSnapshot` on a fixture card (BR-S02.T07-08, RN-01).
- [ ] `> tomorrow's date exits 2 with a message` and `> 2025-13-01 exits 2` (BR-S02.T07-09).
- [ ] On the real database, `pnpm etl prices --no-refresh` writes rows for both sources; `SELECT source, COUNT(*) FROM price_history GROUP BY source` shows a tcgplayer/cardmarket split in the same order of magnitude as the legacy per-date average (≈4.5k and ≈5.5k rows per snapshot date), and `SELECT COUNT(*) FROM cards_market_usd` is within ±2 % of the count of cards with a TCGplayer market price.
- [ ] `SELECT COUNT(*) FROM cards_market_usd c WHERE NOT EXISTS (SELECT 1 FROM cards WHERE id = c.card_id)` is 0 (the foreign key holds after a card is deleted).

## Risks and open questions

- **Risk — the nightly refresh costs ≈20k requests every night.** Mitigation: it runs once a day at most, at concurrency 8 with backoff ([S02.T03](T03-fetch-tcgdex.md)); [S08.T01](../08-operations-and-extensions/T01-scheduler.md) decides the hour and whether to refresh only cards above a price threshold. Recorded there, not decided here.
- **Risk — `price_history` grows without bound.** ≈10k rows per day is ≈3.6 M rows per year; SQLite handles it, but the card-page query must stay indexed on `(card_id, snapshot_date)`. Mitigation: the index exists; a retention policy (e.g. weekly beyond 180 days) is an [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) decision once real growth is measured.
- **Risk — `cards_market_usd` silently diverges** from `price_history`. Mitigation: it is rebuilt from scratch in the same transaction as every snapshot (BR-S02.T07-06, -07), and the acceptance compares the table against the equivalent aggregate.
- **Risk — `MIN(market)` picks a variant the user does not own** (a reverse-holo cheaper than the normal print). Accepted and documented: the number is a lower bound for deck cost, the card page shows every variant, and the deck price total names the assumption ([S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)).
- **Question — should the wjsutton Feb/Mar 2025 CSVs be seeded as history?** They would give the sparkline two extra points and account for 20,890 of the legacy's 90,709 rows. Recommendation: skip for now (a third `source` value needs a migration and a NOTICE entry); the user decides, and [S01.T09](../01-foundation/T09-licensing-and-notice.md) records the licence if the answer is yes.
- **Question — should EUR prices feed a second aggregate** (`cards_market_eur`)? Not needed by any current consumer; the Cardmarket rows are already stored, so adding it later is an aggregate, not a re-fetch.

## References

- `pokemon/src/pokesearch/etl/prices.py` — verified (85 lines): `_TCGPLAYER_KEYS` declared and **unused**; `rows_from_pricing` iterating every dict value under `pricing["tcgplayer"]` with `tp.get("unit", "USD")` and the fields `lowPrice/midPrice/highPrice/marketPrice/directLowPrice`; the two Cardmarket synthetic variants guarded by `any(cm.get(k) is not None for k in ("avg","low","trend"))` and the `-holo` counterpart, with `cm.get("avg")` mapped to `market`; `insert_rows` using `INSERT OR REPLACE`; `snapshot_from_cache` reading `SELECT id, tcgdex_id FROM cards WHERE tcgdex_id IS NOT NULL`; `snapshot_refresh` re-fetching with `force=True` then `UPDATE cards SET raw_tcgdex_json, tcgdex_legal_standard, tcgdex_legal_expanded, tcgdex_updated WHERE tcgdex_id = ?`. Consult for the mapping; the allow-list and `ON CONFLICT` are the corrections.
- `pokemon/src/pokesearch/db/schema.sql` L99–151 — verified: `price_history` with its four-column primary key and the `-- tcgplayer | cardmarket | wjsutton` comment; the `cards_latest_price` view; `cards_market_usd` as a **view** computing `MIN(market)` over `cards_latest_price` filtered to `source = 'tcgplayer'`, which is the aggregate this subtask materializes.
- `pokemon/src/pokesearch/etl/run.py` — verified: `prices` subcommand with `--no-refresh` and `--date`, and `run_load` calling `prices.snapshot_from_cache(conn)` as its final step.
- [S02.T05](T05-cards-schema-migration.md) — the `price_history` and `cards_market_usd` DDL, the `source` `CHECK` that excludes `wjsutton`, and the `cards_latest_price` view definition.
- External: `https://api.tcgdex.net/v2/en/cards/{id}` — the `pricing.tcgplayer` / `pricing.cardmarket` blocks, their `unit` fields and the `-holo` key family; TCGdex documentation at `https://tcgdex.dev/`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
