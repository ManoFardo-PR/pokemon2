# S03.T01 — Tournaments and decks schema migration

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 1 / 13 |
| Depends on | [S01.T04](../01-foundation/T04-database-migration-framework.md), [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) |
| Unblocks | [S03.T04](T04-deck-resolver.md) |
| Parallel with | [S03.T02](T02-limitless-api-client.md), [S03.T03](T03-limitless-web-scraper.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` migration runner and conventions — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `table` `cards`, `sets` (foreign keys) — from [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md)
- `doc` `packages/db/PORTABILITY.md` naming and tagging rules (text primary keys, `*_json`, `*_at`, `-- @sqlite-only` blocks) — applied here without exception

## Outputs (proposed)
- `file` `packages/db/migrations/0003_tournaments.sql` — `tournaments(id, source, source_id, name, date, format, players, organizer_id, organizer, platform, is_online, has_decklists, complete, url, fetched_at)`, `archetypes(id, name, icons_json, web_id)`, `decks(id, tournament_id, player, name, country, placing, wins, losses, ties, dropped, archetype_id, url, card_total, resolved_count, updated_at)`, `deck_cards(deck_id, idx, category, count, name, name_key, set_code, number, card_id NULL, match_kind, image_fallback_url)` PK `(deck_id, idx)` — consumed by [S03.T04](T04-deck-resolver.md)
- `table` indexes: `tournaments(format, date)`, `decks(tournament_id)`, `decks(archetype_id)`, `deck_cards(category, name_key)`, covering `deck_cards(name_key, card_id, set_code, number, count)`, `deck_cards(card_id)`
- `contract` typed row types `Tournament`, `Archetype`, `Deck`, `DeckCard` exported from `packages/db/src/rows/meta.ts`, with `MatchKind = "exact" | "override" | "digits" | "name" | "none"`

## Initial objective
The meta domain has its tables and the one index that made 'which printing of this card is most played' a 0.1 s query instead of 8.5 s in the legacy project.

## Context

Everything S03 produces lands in four tables. The ETL writes them ([S03.T05](T05-decks-sync-and-prune.md)); the API only reads them ([S03.T06](T06-meta-queries.md), [S03.T07](T07-api-meta-endpoints.md)); later stages read them as the meta window that defines opponent weights, the coverage denominator and the optimizer's candidate pool. The shape therefore has to be settled before any fetcher exists, which is why this is the first subtask of the stage and runs in parallel with the two clients.

The legacy schema (`pokemon/src/pokesearch/db/schema.sql` L153–224) already has the right shape and one hard-won lesson written into a comment above line 222: the query "which printing of this card is the most played" aggregates `deck_cards` by name for every registered card, and with only `ix_deck_cards_namekey` (a single-column index) SQLite visited every matching row to read the printing and the count — **8.5 s for 200 names**. Extending the index to cover the columns the query reads made it answer entirely from the index: **0.11 s**. That index is reproduced here verbatim in intent, and the old single-column index is dropped because it is a prefix of the new one.

Two things change versus the legacy file. First, this is a numbered forward-only migration applied by `pnpm db:migrate` and recorded in `schema_migrations`, not `CREATE TABLE IF NOT EXISTS` re-executed on every connect. Second, the id shapes and the `match_kind` vocabulary become `CHECK` constraints instead of comments, so a bug in the ETL fails at insert time rather than surfacing months later as a silently wrong ranking. D-002 applies: only portable types (`TEXT`, `INTEGER`, `REAL`), no `INSERT OR REPLACE`, ISO-8601 text dates, named indexes.

## Scope

- **In scope.** The migration file `0003_tournaments.sql`; the four tables, their constraints and their six indexes; the typed row interfaces in `packages/db/src/rows/meta.ts`; a fixture helper that inserts a tournament + deck + cards so later subtasks test against a real schema.
- **Out of scope.** Any data ([S03.T05](T05-decks-sync-and-prune.md) is the only writer); the resolution of `card_id` ([S03.T04](T04-deck-resolver.md)); read queries and derived numbers ([S03.T06](T06-meta-queries.md)); the user's own decks, which are a separate domain with its own migration ([S03.T11](T11-user-decks-schema-and-api.md)); the `cards`/`sets` tables ([S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask; RN-02, RN-03 and RN-04 are enforced by the subtasks that write these tables ([S03.T04](T04-deck-resolver.md), [S03.T02](T02-limitless-api-client.md), [S03.T05](T05-decks-sync-and-prune.md)). What this file owns is the set of constraints that make those rules representable and violations detectable.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S03.T01-01 | A tournament id is `api:<limitless id>` or `web:<digits>` with an optional `-sr`/`-jr` division suffix, and `source` is `limitless_api` or `limitless_web`; the two agree. | `CHECK (id LIKE 'api:%' OR id LIKE 'web:%')` and `CHECK (source IN ('limitless_api','limitless_web'))` in `0003_tournaments.sql` | `meta-schema.spec.ts > tournament id and source constraints` — inserting `id='foo:1'` raises `SQLITE_CONSTRAINT` |
| BR-S03.T01-02 | `deck_cards.match_kind` is one of `exact`, `override`, `digits`, `name`, `none`, and `card_id IS NULL` exactly when `match_kind = 'none'`. | `CHECK (match_kind IN (...))` plus `CHECK ((card_id IS NULL) = (match_kind = 'none'))` | `meta-schema.spec.ts > match_kind vocabulary`; `> none implies null card_id` |
| BR-S03.T01-03 | Deleting a tournament deletes its decks and their cards in the same statement. | `decks.tournament_id REFERENCES tournaments(id) ON DELETE CASCADE`, `deck_cards.deck_id REFERENCES decks(id) ON DELETE CASCADE`, with `foreign_keys=ON` from the client | `meta-schema.spec.ts > cascade delete` — one `DELETE FROM tournaments` empties all three tables |
| BR-S03.T01-04 | Deleting a card never deletes a decklist line; the line keeps its name, set code, number and fallback image and becomes unresolved. | `deck_cards.card_id REFERENCES cards(id) ON DELETE SET NULL` | `meta-schema.spec.ts > card deletion keeps the line` — row survives with `card_id IS NULL` |
| BR-S03.T01-05 | The printing query reads only the index: `EXPLAIN QUERY PLAN` for `SELECT name_key, card_id, set_code, number, SUM(count) FROM deck_cards WHERE name_key IN (…) GROUP BY name_key, card_id, set_code, number` names `ix_deck_cards_printing` as a covering index and no table access. | index `ix_deck_cards_printing(name_key, card_id, set_code, number, count)` | `meta-schema.spec.ts > printing query is covered` — plan string contains `USING COVERING INDEX ix_deck_cards_printing` |
| BR-S03.T01-06 | `decks.card_total` and `decks.resolved_count` are `NOT NULL` and satisfy `0 <= resolved_count <= card_total`. | `CHECK (resolved_count BETWEEN 0 AND card_total)` | `meta-schema.spec.ts > resolved_count bounds` |
| BR-S03.T01-07 | Only `packages/etl` issues `INSERT`/`UPDATE`/`DELETE` against these four tables; api and worker code opens them read-only. | architecture principle 2; `scripts/sql-lint.mjs` writer-ownership rule ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a fixture writing `deck_cards` from `apps/api` |
| BR-S03.T01-08 | The migration is forward-only and idempotent as a set: a second `pnpm db:migrate` applies nothing and leaves `schema_migrations` with one `0003` row. | migration runner ledger ([S01.T04](../01-foundation/T04-database-migration-framework.md)) | `meta-schema.spec.ts > migrate twice` — row count 1, no error |

## Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `tournaments` | C / U | etl | every sync of the meta window | upsert on `id` (`ON CONFLICT (id) DO UPDATE`), never `INSERT OR REPLACE` — it would cascade-delete the decks | `complete = 1` means "no need to re-fetch" |
| `tournaments` | D | etl | prune step, RN-04 | `DELETE … WHERE date < :cutoff`; cascades to `decks`, `deck_cards` | the only delete path in the domain |
| `archetypes` | C / U | etl | when a standing carries a `deck` object, or a web list needs a slug | upsert on `id`; `web:<slug>` rows are insert-if-absent | never deleted; an archetype may outlive its decks |
| `decks` | C / U | etl | per decklist ingested | upsert on `id`; `card_total`/`resolved_count` recomputed each time | `updated_at` always rewritten |
| `deck_cards` | C / D | etl | per deck, inside the deck's transaction | delete-then-insert per `deck_id`; `idx` is 0-based in category order pokemon → trainer → energy | never updated in place |
| `deck_cards` | U (`card_id → NULL`) | database | a referenced card row is deleted | `ON DELETE SET NULL`; `match_kind` is then corrected by the next sync | keeps historical lists readable |
| all four | R | api, worker | meta pages, coverage, optimizer pool | read-only connections | [S03.T06](T06-meta-queries.md) owns the queries |

## Interfaces

**`packages/db/migrations/0003_tournaments.sql`**

```sql
CREATE TABLE tournaments (
    id            TEXT PRIMARY KEY,               -- 'api:<limitless id>' | 'web:<n>' | 'web:<n>-sr' | 'web:<n>-jr'
    source        TEXT NOT NULL,                  -- limitless_api | limitless_web
    source_id     TEXT NOT NULL,                  -- id at the source, without the prefix
    name          TEXT NOT NULL,
    date          TEXT NOT NULL,                  -- ISO-8601 UTC as delivered by the source
    format        TEXT NOT NULL,                  -- STANDARD | EXPANDED | ...
    players       INTEGER,                        -- real (API) or estimated (web, RN-06)
    organizer_id  INTEGER,
    organizer     TEXT,
    platform      TEXT,                           -- PTCGL | TCG | NULL
    is_online     INTEGER NOT NULL DEFAULT 1,
    has_decklists INTEGER NOT NULL DEFAULT 0,
    complete      INTEGER NOT NULL DEFAULT 0,     -- 1 = closed, never re-fetched without --force
    url           TEXT,
    fetched_at    TEXT NOT NULL,
    CHECK (id LIKE 'api:%' OR id LIKE 'web:%'),
    CHECK (source IN ('limitless_api','limitless_web')),
    CHECK (is_online IN (0,1) AND has_decklists IN (0,1) AND complete IN (0,1)),
    CHECK (players IS NULL OR players >= 0)
);

CREATE TABLE archetypes (
    id         TEXT PRIMARY KEY,                  -- Limitless slug ('dragapult-dusknoir') | 'web:<slug>'
    name       TEXT NOT NULL,
    icons_json TEXT,                              -- JSON array of icon names, e.g. ["dragapult","dusknoir"]
    web_id     INTEGER
);

CREATE TABLE decks (
    id             TEXT PRIMARY KEY,              -- '<tournament_id>:<player|index>' | 'web:<list id>:<player|placing>'
    tournament_id  TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player         TEXT,
    name           TEXT,
    country        TEXT,
    placing        INTEGER,
    wins           INTEGER,
    losses         INTEGER,
    ties           INTEGER,
    dropped        INTEGER,
    archetype_id   TEXT REFERENCES archetypes(id),
    url            TEXT,
    card_total     INTEGER NOT NULL,
    resolved_count INTEGER NOT NULL,
    updated_at     TEXT NOT NULL,
    CHECK (placing IS NULL OR placing >= 1),
    CHECK (resolved_count BETWEEN 0 AND card_total)
);

CREATE TABLE deck_cards (
    deck_id            TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    idx                INTEGER NOT NULL,          -- 0-based, pokemon → trainer → energy, source order inside
    category           TEXT NOT NULL,             -- pokemon | trainer | energy
    count              INTEGER NOT NULL,
    name               TEXT NOT NULL,             -- as the source wrote it (what TCG Live re-imports)
    name_key           TEXT NOT NULL,             -- nameKey(); canonical name when resolved
    set_code           TEXT,                      -- PTCGO code as printed on the list ('TWM', 'MEE')
    number             TEXT,
    card_id            TEXT REFERENCES cards(id) ON DELETE SET NULL,
    match_kind         TEXT NOT NULL,             -- exact | override | digits | name | none
    image_fallback_url TEXT,
    PRIMARY KEY (deck_id, idx),
    CHECK (category IN ('pokemon','trainer','energy')),
    CHECK (count > 0),
    CHECK (match_kind IN ('exact','override','digits','name','none')),
    CHECK ((card_id IS NULL) = (match_kind = 'none'))
);

CREATE INDEX ix_tournaments_fmt_date  ON tournaments(format, date);
CREATE INDEX ix_decks_tournament      ON decks(tournament_id);
CREATE INDEX ix_decks_archetype       ON decks(archetype_id);
CREATE INDEX ix_deck_cards_key        ON deck_cards(category, name_key);
-- Covering index: "which printing of this card is the most played" aggregates deck_cards by name for every
-- registered card. With name_key alone the legacy database visited each row to read printing and count —
-- 8.5 s for 200 names; covering the read columns keeps the query inside the index — 0.11 s.
CREATE INDEX ix_deck_cards_printing   ON deck_cards(name_key, card_id, set_code, number, count);
CREATE INDEX ix_deck_cards_card       ON deck_cards(card_id);
```

**`packages/db/src/rows/meta.ts`**

```ts
export type MatchKind = "exact" | "override" | "digits" | "name" | "none";
export type DeckCategory = "pokemon" | "trainer" | "energy";
export interface Tournament {
  id: string; source: "limitless_api" | "limitless_web"; source_id: string; name: string;
  date: string; format: string; players: number | null; organizer_id: number | null;
  organizer: string | null; platform: string | null; is_online: 0 | 1;
  has_decklists: 0 | 1; complete: 0 | 1; url: string | null; fetched_at: string;
}
export interface Archetype { id: string; name: string; icons_json: string | null; web_id: number | null }
export interface Deck {
  id: string; tournament_id: string; player: string | null; name: string | null; country: string | null;
  placing: number | null; wins: number | null; losses: number | null; ties: number | null;
  dropped: number | null; archetype_id: string | null; url: string | null;
  card_total: number; resolved_count: number; updated_at: string;
}
export interface DeckCard {
  deck_id: string; idx: number; category: DeckCategory; count: number; name: string; name_key: string;
  set_code: string | null; number: string | null; card_id: string | null;
  match_kind: MatchKind; image_fallback_url: string | null;
}
```

**Portability.** No SQLite-only construct appears, so no `-- @sqlite-only` block is needed. On Postgres, `icons_json TEXT` becomes `jsonb` and the `CHECK ((card_id IS NULL) = (match_kind = 'none'))` expression is valid as written; the six indexes carry over unchanged.

## Implementation steps

1. Write `0003_tournaments.sql` with the four `CREATE TABLE` statements in dependency order (`tournaments`, `archetypes`, `decks`, `deck_cards`).
2. Add the `CHECK` constraints of the Business rules table; run `scripts/sql-lint.mjs` to confirm no untagged dialect construct.
3. Add the six indexes, with the covering-index comment quoting the 8.5 s → 0.11 s measurement and its source.
4. Run `pnpm db:migrate` on a fresh temp database; confirm `schema_migrations` gains one `0003` row and a second run is a no-op.
5. Add `packages/db/src/rows/meta.ts` with the row interfaces and `MatchKind`/`DeckCategory` unions; export them from the package index.
6. Add `packages/db/test/fixtures/meta.ts`: `insertTournament()`, `insertDeck()`, `insertDeckCards()` helpers used by [S03.T05](T05-decks-sync-and-prune.md) and [S03.T06](T06-meta-queries.md) tests.
7. Write `meta-schema.spec.ts` covering every rule above, including the `EXPLAIN QUERY PLAN` assertion on the covering index.
8. Record in `packages/db/PORTABILITY.md` that this migration is dialect-free, so [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) inherits nothing to translate here.

## Edge cases and error handling

- **A division tournament id (`web:515-sr`) is inserted** → accepted by `CHECK (id LIKE 'web:%')`; Masters keep the bare id `web:515`, so the Seniors table row is a separate tournament with its own estimated player count.
- **The same `(deck_id, idx)` is inserted twice** → primary-key violation. The writer avoids it by deleting the deck's cards before inserting; the constraint exists so a partial rewrite fails loudly instead of duplicating a card.
- **A decklist line has `count = 0`** (an empty section row on a malformed page) → `CHECK (count > 0)` rejects it; the loader must drop such lines before the insert, as the legacy `build_card_rows` did.
- **A card row is removed by a later card reload** → the `deck_cards` line keeps `name`, `set_code`, `number` and `image_fallback_url` and gets `card_id = NULL`; `match_kind` still reads `exact` until the next sync corrects it, which is why BR-S03.T01-02 is checked at insert time only.
- **A deck references an archetype that no longer exists** → `archetype_id` has no `ON DELETE` clause and archetypes are never deleted; if one ever is, the foreign key blocks the delete rather than orphaning decks.
- **Pruning a tournament while the API is reading it** → WAL gives the reader a consistent snapshot; the delete is one short transaction ([S01.T02](../01-foundation/T02-sqlite-database-client.md) BR-S01.T02-04).
- **A tournament with `has_decklists = 0`** → legal and expected: it is stored so the next sync knows not to re-fetch it, and it has zero decks. Read queries must not assume every tournament has decks.

## Acceptance / verification

- [ ] `pnpm db:migrate` on an empty database creates exactly four tables and six indexes; `sqlite_master` names match the DDL above (BR-S03.T01-08).
- [ ] `pnpm --filter @pokesearch/db test -t "meta-schema"` green: id/source constraints, `match_kind` vocabulary, `card_id`/`none` agreement, `resolved_count` bounds (BR-S03.T01-01, -02, -06).
- [ ] `meta-schema.spec.ts > cascade delete`: insert 1 tournament + 2 decks + 30 card lines, `DELETE FROM tournaments WHERE id = …`, then all three tables are empty (BR-S03.T01-03).
- [ ] `meta-schema.spec.ts > card deletion keeps the line`: deleting the `cards` row leaves the `deck_cards` row with `card_id IS NULL` and its name intact (BR-S03.T01-04).
- [ ] `meta-schema.spec.ts > printing query is covered`: the `EXPLAIN QUERY PLAN` output contains `USING COVERING INDEX ix_deck_cards_printing` (BR-S03.T01-05).
- [ ] `pnpm lint` fails for a fixture that writes `deck_cards` from `apps/api` and passes for the same statement in `packages/etl` (BR-S03.T01-07).
- [ ] Running `pnpm db:migrate` twice leaves one `0003` row in `schema_migrations` and no error (BR-S03.T01-08).

## Risks and open questions

- **Risk — the `CHECK ((card_id IS NULL) = (match_kind = 'none'))` constraint blocks a legitimate future match kind** (for example a `manual` kind from the deck builder). Mitigation: the vocabulary lives in one `CHECK` and one TypeScript union; adding a kind is a one-line migration plus a type change, and the invariant stays meaningful.
- **Risk — `ON DELETE SET NULL` masks a card-id churn problem**: a set reload that changes `cards.id` would silently unresolve thousands of lines. Mitigation: [S03.T05](T05-decks-sync-and-prune.md) reports `match_kind` counts per run; a jump in `none` is visible in `etl_runs` and in the monitoring of [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md).
- **Risk — the covering index costs write throughput** on a table that reaches ~1 M rows (legacy: 982,557). Mitigation: writes are bulk inserts inside one transaction per deck; measure insert time in [S03.T05](T05-decks-sync-and-prune.md) and record it there.
- **Question — should `tournaments.format` be constrained to a vocabulary?** Left open: Limitless exposes formats beyond Standard/Expanded and the window filter already restricts reads. Decided by whoever first needs a non-Standard window, at the latest in [S03.T06](T06-meta-queries.md).
- **Question — does `archetypes.web_id` still earn its place?** The legacy column exists but the web scraper derives `web:<slug>` ids instead. Kept for now because the Limitless site exposes numeric archetype ids that a future partner query may want; drop it in a later migration if [S03.T03](T03-limitless-web-scraper.md) never fills it.

## References

- `pokemon/src/pokesearch/db/schema.sql` L153–224 — verified: the four table definitions, the six index statements, and the pt-BR comment above `ix_deck_cards_printing` documenting "8,5 s para 200 nomes" → "0,11 s" and that the old index is a prefix of the new one. Consult for column order and the id comments.
- `pokemon/src/pokesearch/etl/decks.py` L43–119 — verified: `upsert_tournament` / `upsert_deck` use `ON CONFLICT(id) DO UPDATE` and `DELETE FROM deck_cards WHERE deck_id = ?` followed by `executemany`, which is where the delete-then-insert idempotency in the CRUD table comes from.
- `pokemon/src/pokesearch/etl/limitless_web.py` L215, L223 — verified: web deck ids are `web:<list id>:<player or placing>` and tournament ids `web:<n>`, with the `-sr`/`-jr` suffix added in `parse_lists` (L91).
- [Data model overview](../../project/04-data-model-overview.md) — migration `0003` ownership, id conventions, ISO-8601 dates, `*_json` columns.
- [Decision log](../../project/02-decision-log.md) D-002 (SQLite, Postgres-portable); [Architecture](../../project/03-architecture-overview.md) principle 2 (the etl writes baseline tables).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
