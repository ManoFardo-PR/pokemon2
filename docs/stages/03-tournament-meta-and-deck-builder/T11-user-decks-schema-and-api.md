# S03.T11 — User decks: schema and API

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 11 / 13 |
| Depends on | [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S03.T09](T09-decklist-parser-and-exporter.md), [S03.T10](T10-deck-validation-rules.md) |
| Unblocks | [S03.T12](T12-web-deck-builder.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md), [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md) |
| Parallel with | [S03.T07](T07-api-meta-endpoints.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Fastify app — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `contract` decklist parse/serialize + resolution — from [S03.T09](T09-decklist-parser-and-exporter.md)
- `module` `validateDeck` — from [S03.T10](T10-deck-validation-rules.md)
- `module` migration runner and `cards_market_usd` — the price source a version's `price_usd` is computed from

## Outputs (proposed)
- `file` migration `0004_user_decks.sql` — `user_decks(id, name, format, archetype_id, notes, created_at, updated_at)`, `user_deck_versions(id, deck_id, version_no, parent_id, change_desc, list_json, list_text, validation_json, price_usd, coverage_exact, coverage_proven, created_at)` UNIQUE `(deck_id, version_no)` — consumed by [S03.T12](T12-web-deck-builder.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md), [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)
- `contract` `POST /api/user-decks` (name, text | cards), `GET /api/user-decks`, `GET /api/user-decks/:id`, `POST /api/user-decks/:id/versions` (new list + change description; server computes diff `−1 X, +1 Y`), `GET /api/user-decks/:id/versions/:v/export.txt`, `POST /api/user-decks/from-tournament/:deckId` — consumed by [S03.T12](T12-web-deck-builder.md), [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md)
- `module` `decks/diff.ts` — `describeDiff(a, b)`; `decks/price.ts` — Σ market USD × count with coverage %

## Initial objective
A user's deck is a first-class record with an immutable version history, each version carrying its validation report, price and (later) rule-coverage numbers.

## Context

Everything the product promises after S03 hangs off a *deck version*: [S04.T17](../04-game-engine-core/T17-web-evaluate-page.md) measures one, [S05.T16](../05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md) freezes one, [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md) accepts a swap by writing one. A version must therefore be immutable and self-describing: its list as data and as canonical text, the validation report as it stood, the price as it stood, and later the coverage numbers as they stood. A measurement that cannot say which 60 cards it measured is not a measurement.

The legacy model was close but differently shaped: `deck_projects` held a *concept* (Pokémon names, a budget) and `deck_versions` held lists under it, with `version_no` per project, a `change_desc`, `list_text`, `list_json`, `price_usd` and one `coverage` column. Here the entity is the **deck itself** — the user pastes or builds a list, names it, and the versions are its history — because the concept-first flow only made sense for the optimizer's list generator, which this stage does not have. What carries over is the shape of a version and the human-readable diff: `describe_diff` produced strings such as `-1 Spiritomb, +1 Shaymin`, exactly how the Dhelmise optimisation log reads and what the builder's history should show.

D-007 applies: a single local user, so no ownership column and no authorisation check anywhere. The api writes these tables (architecture principle 2), and the coverage columns stay `NULL` until [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) fills them.

## Scope

- **In scope.** Migration `0004_user_decks.sql`; the six endpoints; `decks/versions.ts` (create deck, add version, read, export); `decks/diff.ts`; `decks/price.ts`; the zod request/response schemas; the "from tournament" copy path.
- **Out of scope.** The builder UI ([S03.T12](T12-web-deck-builder.md)); comparison with the meta ([S03.T13](T13-deck-comparison-with-tournament-lists.md)); parsing, serialisation and resolution ([S03.T09](T09-decklist-parser-and-exporter.md)); validation rules ([S03.T10](T10-deck-validation-rules.md)); coverage computation ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)); jobs and scores ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md), [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md)); deletion of decks, deliberately left out of the first cut (see Risks).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It is, however, where RN-10's verdict is persisted (`validation_json.ok`) and where the versioning discipline RN-41 demands of suites is first practised on user data.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S03.T11-01 | A version is immutable: `user_deck_versions` rows are only inserted, never updated or deleted, except for the two coverage columns, which [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) fills once. Editing a list creates a new version. | no `UPDATE`/`DELETE` statement against the table outside the coverage updater; the SQL lint's writer-ownership rule | `user-decks.spec.ts > versions are insert only` — a grep of the route module finds no UPDATE on the table; editing a deck yields `version_no = 2` with version 1 unchanged |
| BR-S03.T11-02 | `version_no` starts at 1 and increments per deck: `MAX(version_no) + 1` computed inside the insert transaction, with `UNIQUE (deck_id, version_no)` as the backstop against a race. | `addVersion()` and the unique index | `user-decks.spec.ts > version numbering` — three sequential versions are 1, 2, 3; two concurrent inserts leave 1, 2 with no duplicate |
| BR-S03.T11-03 | `parent_id` of a new version points at the version it was derived from (the latest of the deck, or an explicitly requested one) and must belong to the same deck; version 1 has `parent_id NULL`. | `CHECK`-backed application guard plus `FOREIGN KEY (parent_id) REFERENCES user_deck_versions(id)` | `user-decks.spec.ts > parent` — a parent from another deck is rejected with 400 |
| BR-S03.T11-04 | `list_text` is exactly `serializeDecklist(list_json)` ([S03.T09](T09-decklist-parser-and-exporter.md)); both columns are written in the same statement from the same parsed list, so they can never disagree. | `buildVersionPayload()` | `user-decks.spec.ts > list_text is canonical` — for every stored version, re-serialising `list_json` equals `list_text` |
| BR-S03.T11-05 | An invalid list is stored, not rejected: the version is created with `validation_json.ok = false` and the endpoint answers 201. Only a list that cannot be parsed into at least one line is a 400. | the create/add-version handlers | `user-decks.spec.ts > invalid list stored` — a 59-card list returns 201 and `validation_json.errors[0].code === "SIZE_NOT_60"` |
| BR-S03.T11-06 | `describeDiff(a, b)` returns a comma-separated string of `"<signed delta> <name>"` entries over the union of both lists' name keys, ordered by name key, deltas of 0 omitted, positive deltas prefixed with `+`; an unchanged list returns `sem mudanças`. | `decks/diff.ts` | `diff.spec.ts > describeDiff` — swapping one card yields `-1 Spiritomb, +1 Shaymin`; identical lists yield `sem mudanças` |
| BR-S03.T11-07 | `price_usd` of a version is `Σ cards_market_usd.market_usd × count` over lines with a resolved, priced card, and the report also carries `priceCoverage = priced copies ÷ total copies`; unpriced lines contribute 0 and are never estimated. | `decks/price.ts` | `price.spec.ts > deck price` — a 60-card list with 6 unpriced copies gives coverage 0.9 and a total excluding them |
| BR-S03.T11-08 | `change_desc` is the server's diff when the client sends none, and the client's text otherwise; version 1's default is `lista inicial`. | `addVersion()` | `user-decks.spec.ts > change description` — omitting the field stores the computed diff |
| BR-S03.T11-09 | These tables carry no ownership column and no endpoint performs an authorisation check (D-007); the API binds to loopback. | schema review; route review | `user-decks.spec.ts > schema` — `PRAGMA table_info` shows no `user_id`/`owner` column |
| BR-S03.T11-10 | `POST /api/user-decks/from-tournament/:deckId` copies the tournament deck's lines into a new user deck whose name defaults to `<archetype> — <player>` and whose version 1 carries `change_desc = importado de <tournament>`; the tournament deck itself is never modified. | the from-tournament handler, which reads through [S03.T06](T06-meta-queries.md) and writes only user tables | `user-decks.spec.ts > from tournament` — the new version's 60 lines equal the source deck's, and `decks`/`deck_cards` row counts are unchanged |
| BR-S03.T11-11 | Only `apps/api` writes `user_decks` and `user_deck_versions`; the etl never touches them and the engine never opens the database at all. | architecture principle 2; the SQL lint writer-ownership rule ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pnpm lint` fails on a fixture writing `user_decks` from `packages/etl` |

## Data operations

**CRUD**

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `user_decks` | C | api | `POST /api/user-decks`, `POST /api/user-decks/from-tournament/:deckId` | insert-only; `id` is an autoincrement integer; `created_at = updated_at` | no ownership column (D-007) |
| `user_decks` | R | api | list and detail endpoints, [S03.T13](T13-deck-comparison-with-tournament-lists.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) | — | listing is ordered by `updated_at DESC` |
| `user_decks` | U | api | a new version is added, or name/notes/archetype are edited | only `name`, `notes`, `archetype_id`, `format`, `updated_at` are mutable | the list itself lives in versions, never here |
| `user_deck_versions` | C | api | `POST /api/user-decks/:id/versions` and both creation paths | insert-only (BR-S03.T11-01); `version_no = MAX + 1` inside the transaction; `UNIQUE (deck_id, version_no)` | `list_json`, `list_text`, `validation_json`, `price_usd` all written together |
| `user_deck_versions` | R | api, worker | export, comparison, evaluation, optimisation | — | a version is the unit every later stage references |
| `user_deck_versions.coverage_exact/_proven` | U | api (coverage updater) | once, when [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) computes them | the only permitted update; both columns set in one statement | `NULL` until then |
| `cards`, `cards_market_usd` | R | api | when a version is created | read-only join to compute `price_usd` | price is a snapshot at version time, not recomputed later |
| `decks`, `deck_cards` | R | api | `from-tournament` | read-only (BR-S03.T11-10) | the meta tables stay ETL-owned |

**Endpoints**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| POST | `/api/user-decks` | `{ name?: string, format?: string, notes?: string, text?: string, cards?: DeckLine[] }` — exactly one of `text`/`cards` | 201 `{ deck, version }` with version 1, its validation report, price and diff `lista inicial` | 400 `INVALID_BODY` (neither or both of `text`/`cards`; zero parsable lines) |
| GET | `/api/user-decks` | query `limit` (1–100, default 50) | 200 `UserDeckSummary[]` — deck plus `versionCount`, `latestVersionNo`, `latestOk`, `latestPriceUsd`, `updatedAt` | — |
| GET | `/api/user-decks/:id` | path `id`; query `version` (default latest) | 200 `{ deck, versions: VersionSummary[], version: UserDeckVersion }` with the resolved lines of the selected version | 404 `NOT_FOUND` |
| POST | `/api/user-decks/:id/versions` | `{ text?: string, cards?: DeckLine[], changeDesc?: string, parentVersionNo?: number }` | 201 `{ version }` with `changeDesc` defaulted to the computed diff (BR-S03.T11-06, -08) | 404 deck; 400 body or cross-deck `parentVersionNo` |
| GET | `/api/user-decks/:id/versions/:v/export.txt` | path `id`, `v` (version number) | 200 `text/plain; charset=utf-8`, body = `list_text`, `Content-Disposition: inline; filename="deck.txt"` | 404 deck or version |
| POST | `/api/user-decks/from-tournament/:deckId` | path: tournament deck id (URL-encoded); body `{ name? }` | 201 `{ deck, version }` copying the 60 lines (BR-S03.T11-10) | 404 tournament deck |
| PATCH | `/api/user-decks/:id` | `{ name?, notes?, format?, archetypeId? }` | 200 `{ deck }` | 404; 400 on an unknown format |

## Interfaces

**`packages/db/migrations/0004_user_decks.sql`**

```sql
CREATE TABLE user_decks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    format       TEXT    NOT NULL DEFAULT 'STANDARD',
    archetype_id TEXT    REFERENCES archetypes(id),   -- optional: the meta archetype the user claims
    notes        TEXT,
    created_at   TEXT    NOT NULL,                    -- ISO-8601 UTC
    updated_at   TEXT    NOT NULL,
    CHECK (length(name) BETWEEN 1 AND 120)
);

CREATE TABLE user_deck_versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id         INTEGER NOT NULL REFERENCES user_decks(id) ON DELETE CASCADE,
    version_no      INTEGER NOT NULL,                 -- 1-based, per deck
    parent_id       INTEGER REFERENCES user_deck_versions(id),
    change_desc     TEXT    NOT NULL,                 -- 'lista inicial' | '-1 X, +1 Y' | user text
    list_json       TEXT    NOT NULL,                 -- [{ cardId|null, name, setCode, number, count, category }]
    list_text       TEXT    NOT NULL,                 -- canonical serializeDecklist(list_json)
    validation_json TEXT    NOT NULL,                 -- ValidationReport (S03.T10)
    price_usd       REAL,                             -- Σ market_usd × count over priced lines
    price_coverage  REAL,                             -- priced copies ÷ total copies
    coverage_exact  REAL,                             -- NULL until S05.T12
    coverage_proven REAL,                             -- NULL until S05.T12
    created_at      TEXT    NOT NULL,
    UNIQUE (deck_id, version_no),
    CHECK (version_no >= 1),
    CHECK (price_coverage IS NULL OR (price_coverage BETWEEN 0 AND 1)),
    CHECK (coverage_exact IS NULL OR (coverage_exact BETWEEN 0 AND 1)),
    CHECK (coverage_proven IS NULL OR (coverage_proven BETWEEN 0 AND 1))
);

CREATE INDEX ix_user_deck_versions_deck ON user_deck_versions(deck_id, version_no);
CREATE INDEX ix_user_decks_updated      ON user_decks(updated_at);
```

`price_coverage` is not in the original column list but is required by BR-S03.T11-07: without it, `price_usd` is an unqualified number. It is added here rather than recomputed at read time so a version's price is a true snapshot.

**`apps/api/src/decks/diff.ts`**

```ts
export interface DiffEntry { nameKey: string; name: string; delta: number }
export function diffLists(a: readonly DeckLine[], b: readonly DeckLine[]): DiffEntry[];
export function describeDiff(a: readonly DeckLine[], b: readonly DeckLine[]): string;
export const NO_CHANGES = "sem mudanças";
```

`describeDiff` counts copies per `nameKey` on both sides, walks the union in name-key order, and joins the non-zero deltas as `"-1 Spiritomb, +1 Shaymin"`. Names come from either side (the newer wins), so a removed card still prints its name.

**`apps/api/src/decks/price.ts`**

```ts
export interface DeckPrice { priceUsd: number; pricedCopies: number; totalCopies: number; priceCoverage: number }
export function priceDeck(db: Db, lines: readonly ResolvedLine[]): DeckPrice;
```

One query joins the distinct `cardId`s against `cards_market_usd`; lines with no `cardId` or no price contribute 0 copies to `pricedCopies`. This is the same definition `getDeck` uses for tournament decks ([S03.T06](T06-meta-queries.md) BR-S03.T06-07), so a user deck and the tournament list it was copied from report the same number.

**`apps/api/src/decks/versions.ts`**

```ts
export interface CreateDeckInput { name?: string; format?: string; notes?: string; text?: string; cards?: DeckLine[] }
export interface AddVersionInput  { text?: string; cards?: DeckLine[]; changeDesc?: string; parentVersionNo?: number }
export function createDeck(db: Db, input: CreateDeckInput): { deck: UserDeck; version: UserDeckVersion };
export function addVersion(db: Db, deckId: number, input: AddVersionInput): UserDeckVersion;
export function getDeckWithVersion(db: Db, deckId: number, versionNo?: number):
  { deck: UserDeck; versions: VersionSummary[]; version: UserDeckVersion } | null;
export function createFromTournamentDeck(db: Db, tournamentDeckId: string, name?: string):
  { deck: UserDeck; version: UserDeckVersion } | null;
```

Every write path runs in one transaction: parse ([S03.T09](T09-decklist-parser-and-exporter.md)) → resolve → validate ([S03.T10](T10-deck-validation-rules.md)) → price → `version_no = MAX + 1` → insert → `UPDATE user_decks SET updated_at`.

**`list_json` entry shape.** `{ cardId: string | null, name: string, setCode: string | null, number: string | null, count: number, category: "pokemon" | "trainer" | "energy" }` — the resolved line reduced to what a later reader needs, with the printed name preserved so the export stays faithful.

## Implementation steps

1. Write `0004_user_decks.sql` with both tables, the unique constraint, the checks and the two indexes; migrate a temp database and assert the shape.
2. Add the row types to `packages/db/src/rows/user-decks.ts`.
3. Write `decks/diff.ts` with `diffLists`/`describeDiff` and its spec, including the `sem mudanças` case.
4. Write `decks/price.ts` with one batched query and its spec, including the zero-coverage case.
5. Write `versions.ts`: `buildVersionPayload` (parse → resolve → validate → price → serialise) and `addVersion` with `MAX(version_no) + 1` inside the transaction.
6. Register `POST /api/user-decks` and `GET /api/user-decks`; spec creation from `text` and from `cards`.
7. Register `GET /api/user-decks/:id` (with `?version=`) and the `.txt` export.
8. Register `POST /api/user-decks/:id/versions`, defaulting `changeDesc` to the computed diff.
9. Register `POST /api/user-decks/from-tournament/:deckId` reading through [S03.T06](T06-meta-queries.md)'s `getDeck`, plus `PATCH /api/user-decks/:id`.
10. Export the zod schemas as JSON Schema for the builder ([S03.T12](T12-web-deck-builder.md)) and add one `curl` example per endpoint to the API README.

## Edge cases and error handling

- **A 59-card list posted as a new version** → 201 with `validation_json.ok = false` and `SIZE_NOT_60`; the version exists, the user keeps working, and no evaluation can be started from it (BR-S03.T11-05).
- **A list whose every line is malformed** (the user pasted prose) → zero parsable lines, so 400 `INVALID_BODY` with the parser's warnings in `details`; storing an empty version would silently create a deck the engine would refuse.
- **Both `text` and `cards` in the body** → 400 `INVALID_BODY`; accepting both would make the canonical `list_text` ambiguous.
- **Saving a version identical to the previous one** → allowed, with `change_desc = "sem mudanças"`; a user may legitimately re-save after editing notes, and refusing would be surprising. The builder can warn before sending.
- **`parentVersionNo` pointing at a version of another deck** → 400; the parent link is what makes the history a tree rather than a soup (BR-S03.T11-03).
- **Two versions added concurrently** (the builder and the optimizer) → the `MAX + 1` read and the insert are in one transaction, and `UNIQUE (deck_id, version_no)` rejects the loser, which retries once. No version number is ever reused.
- **A card's market price changes after a version was saved** → the stored `price_usd` does not move; it is a snapshot. The builder shows the version's price and, for the latest version only, may show a recomputed "hoje" value.
- **A deck copied from a tournament list with unresolved lines** → those lines are copied verbatim with `cardId: null`, and the new version's validation report carries `UNRESOLVED_LINE`; the copy is faithful, and the user sees why it is not playable.
- **`GET …/versions/:v/export.txt` for a version that does not exist** → 404 naming the version number, distinct from a 404 for the deck.
- **Deleting a deck** → not exposed in this cut. The cascade is in place (`ON DELETE CASCADE`), so the endpoint is a later one-line addition; see Risks.
- **A deck name of 200 characters** → the `CHECK (length(name) BETWEEN 1 AND 120)` rejects it at the database level and the zod schema rejects it earlier with a 400 naming the limit.
- **The coverage updater running twice** ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)) → both columns are set in one idempotent statement; the rule permits that single update and nothing else (BR-S03.T11-01).

## Acceptance / verification

- [ ] `pnpm db:migrate` creates both tables with the unique constraint, the four checks and the two indexes; `PRAGMA table_info(user_decks)` shows no ownership column (BR-S03.T11-09).
- [ ] `pnpm --filter api test -t "user-decks"` green.
- [ ] `user-decks.spec.ts > create from text`: posting the Dhelmise list returns 201, `validation_json.ok = true`, `version_no = 1`, `change_desc = "lista inicial"`, `price_usd > 0` and a `price_coverage` in (0, 1].
- [ ] `user-decks.spec.ts > add version diff`: changing one card and posting a new version returns `version_no = 2` with `change_desc = "-1 <removed>, +1 <added>"`, and version 1 is byte-identical to before (BR-S03.T11-01, -06, -08).
- [ ] `user-decks.spec.ts > list_text is canonical`: for every stored version, `serializeDecklist(JSON.parse(list_json))` equals `list_text` (BR-S03.T11-04).
- [ ] `user-decks.spec.ts > invalid list stored`: a 59-card list returns 201 with `ok = false` and `SIZE_NOT_60`; prose returns 400 (BR-S03.T11-05).
- [ ] `user-decks.spec.ts > version numbering`: three sequential versions are 1, 2, 3; two concurrent inserts produce 1 and 2 with no duplicate and no gap (BR-S03.T11-02).
- [ ] `user-decks.spec.ts > from tournament`: importing a fixture tournament deck creates a user deck whose version 1 lines equal the source's, while `decks` and `deck_cards` counts are unchanged (BR-S03.T11-10).
- [ ] `user-decks.spec.ts > export`: `GET /api/user-decks/1/versions/1/export.txt` returns `list_text` byte for byte with the documented headers.
- [ ] `price.spec.ts > deck price`: a 60-card list with 6 unpriced copies reports `priceCoverage = 0.9` and a total excluding them, matching `getDeck` on the same cards (BR-S03.T11-07).
- [ ] `pnpm lint` fails on a fixture writing `user_decks` from `packages/etl` (BR-S03.T11-11).

## Risks and open questions

- **Risk — unbounded version growth**: [S07.T04](../07-deck-optimizer/T04-holdout-acceptance-and-versioning.md) writes a version per accepted swap. Mitigation: versions are small (a 60-line JSON plus text) and immutability is worth more than tidiness; past a few hundred, add a collapsed view in the builder, not a delete.
- **Risk — a stored price becomes misleading** months later. Mitigation: `created_at` sits next to `price_usd` and the builder labels it "preço na data da versão"; any "recompute today" action is read-only.
- **Risk — no delete endpoint** means a mistaken deck stays forever. Mitigation: the cascade is already in the schema, so `DELETE /api/user-decks/:id` is a small addition once the builder has a confirmation flow ([S03.T12](T12-web-deck-builder.md)). Left out to keep the first cut insert-only.
- **Question — should `archetype_id` be inferred automatically?** [S03.T13](T13-deck-comparison-with-tournament-lists.md) already infers one from the most-copied Pokémon. Recommendation: leave the column user-set and infer per request; the user decides whether the inferred value is written back.
- **Question — should `price_usd` use the cheapest legal printing per name** (the legacy `price_table`) rather than the exact printing? The two answer different questions. Recommendation: keep the exact printing here for consistency with tournament decks, and let [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) use the cheapest-printing table for its budget cap, documenting the difference there.

## References

- `pokemon/src/pokesearch/sim/store.py` — verified: `add_version` computing `COALESCE(MAX(version_no), 0) + 1` per project and inserting `(project_id, parent_id, version_no, change_desc, list_text, list_json, price_usd, coverage, created_at)`, `get_version`/`list_versions` decoding `list_json` into `cards`, `best_version`/`latest_version`, and `set_version_score` updating score/CI/games — the legacy `deck_projects` + `deck_versions` pair this schema reshapes into deck + versions.
- `pokemon/src/pokesearch/sim/optimizer.py` L40–41, L77–85 — verified: `DeckList.price()` as `Σ (price or 0) × count` and `describe_diff` producing `", ".join(f"{'+' if d > 0 else ''}{d} {name}")` over the sorted union of name keys, with `"sem mudanças"` when empty.
- `pokemon/src/pokesearch/sim/optimizer.py` L93–103 — verified: `price_table` returning the cheapest legal printing per `name_key`, the alternative price definition discussed under Risks.
- `pokemon/src/pokesearch/search/decks.py` L398–407 — verified: the price and `price_coverage` computation for tournament decks that `priceDeck` mirrors.
- `pokemon/benchmarks/otimizacao_dhelmise.md` — verified: diff strings of the form `-1 Spiritomb / +1 Shaymin` in the optimisation log, and the 60-card list used as the creation fixture.
- [Data model overview](../../project/04-data-model-overview.md) "User decks" — migration 0004 ownership and the note that coverage columns are filled by S05.T12.
- [Decision log](../../project/02-decision-log.md) D-007 (single user, no ownership columns); [Architecture](../../project/03-architecture-overview.md) principle 2 (the api writes user-facing tables).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
