# S02.T05 — Cards schema migration — completion log

| Field | Value |
|---|---|
| Subtask ID | S02.T05 |
| Status | IN_PROGRESS — P3-GREEN PASSED; DONE is P4-AUDIT's to set |
| Completion date | 2026-09-30 (P3-GREEN) |
| Phase | P3-GREEN, run 1 |
| Handoff | [T05-cards-schema-migration.handoff.md](handoff/T05-cards-schema-migration.handoff.md) |
| Base commit | `5859e54` |
| RED commit | `72c1ebd` (see Deviations) |
| GREEN commit | `62702c0` |

## Test status

From the final run, not from assertion:

| Command | Exit | Result |
|---|---|---|
| `pnpm test` | 0 | 39 test files passed, **476 tests passed**, 0 failed |
| `pnpm typecheck` | 0 | no diagnostics, 6 projects + `scripts` |
| `pnpm lint` | 0 | no findings, 6 projects + `scripts` |
| `node scripts/sql-lint.mjs` | 0 | no output |

At the RED baseline 28 tests failed and 448 passed; 448 + 28 = 476, so every RED test now passes and nothing
regressed. The full command output is in §3.6 of the handoff.

## Files created

| File | What |
|---|---|
| `packages/db/migrations/0002_cards.sql` | the DDL: tables `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `price_history`, `cards_market_usd`; view `cards_latest_price`; FTS5 virtual table `cards_fts` in a `-- @sqlite-only` block; 21 named indexes |
| `packages/db/migrations/0002_cards.md` | design note: the four deviations from the legacy schema, the `norm()` contract, the denormalized columns, the bm25 column-order contract, and the step-8 measurement |
| `docs/stages/02-card-data-and-search/T05-cards-schema-migration.log.md` | this log |

## Files modified

| File | What |
|---|---|
| `packages/db/src/schema.ts` | 9 `TABLES` descriptors for the 0002 tables and the view, generated from `PRAGMA table_info` of the migrated database (BR-S02.T05-10). The row types (`SetRow` … `CardsMarketUsdRow`, `PriceSource`, `DamageMod`) were written in P2 and left unchanged. |
| `packages/db/package.json` | `"./schema": "./src/schema.ts"` added to `exports`, so the subpath the spec and D-009 name resolves (§1.13 Q5) |
| `docs/stages/02-card-data-and-search/handoff/T05-cards-schema-migration.handoff.md` | §3 GREEN appended; header table updated |
| `docs/stages/02-card-data-and-search/T05-cards-schema-migration.md` | `Owner / Updated` → `P3-GREEN / 2026-09-30` |
| `docs/stages/02-card-data-and-search/README.md` | S02.T05 row status kept at `IN_PROGRESS`, matching the spec |

No test file, fixture, test helper, snapshot or test configuration was created, edited, renamed or deleted.

## BR coverage

| BR ID | Implementing code | Status |
|---|---|---|
| RN-01 | `0002_cards.sql:cards` — `raw_ptcg_json TEXT NOT NULL`, `raw_tcgdex_json TEXT` nullable | IMPLEMENTED (schema half) |
| BR-S02.T05-01 | `ON DELETE CASCADE` on all six child foreign keys | IMPLEMENTED |
| BR-S02.T05-02 | `cards.set_id REFERENCES sets(id)`, no `ON DELETE` | IMPLEMENTED |
| BR-S02.T05-03 | `attacks_card_idx_uq`, `abilities_card_idx_uq` | IMPLEMENTED |
| BR-S02.T05-04 | `PRIMARY KEY (card_id, type)` on `weaknesses`, `resistances` | IMPLEMENTED |
| BR-S02.T05-05 | `price_history` 4-column primary key + `CHECK` on `source` and `length(snapshot_date)` | IMPLEMENTED |
| BR-S02.T05-06 | `CREATE TABLE cards_market_usd` with `card_id` primary key; `cards_market_usd_price_idx` | IMPLEMENTED |
| BR-S02.T05-07 | the `-- @postgres:` / `-- @sqlite-only` / `-- @end` block around `cards_fts` | IMPLEMENTED |
| BR-S02.T05-08 | no `INSERT`, no `-- @no-transaction`, no `IF NOT EXISTS` in the file | IMPLEMENTED |
| BR-S02.T05-09 | the six `*_norm` definitions, each commented `BR-S02.T05-09`; contract quoted in `0002_cards.md` §2 | IMPLEMENTED (schema half) |
| BR-S02.T05-10 | `packages/db/src/schema.ts:TABLES` — 9 new descriptors | IMPLEMENTED |

Full table with the tests each BR is covered by: §3.3 of the handoff.

## Deferrals

Carried out of this subtask. **S02.T06's P1 must read this section.**

| Item | BR IDs | Blocking task | Why it cannot be done here |
|---|---|---|---|
| Loader round-trip re-deriving `name`, `hp`, `stage` from `raw_ptcg_json` and comparing | RN-01 (second verification) | S02.T06 | no loader exists; the schema half (NOT NULL / nullable) is verified here |
| `load.spec.ts > name_norm equals norm(name) for every fixture card` | BR-S02.T05-09 (`norm()` equality) | S02.T06 | `norm()` and its single call site belong to the loader; the schema can only document the contract in column comments, which it does |
| Migrate `packages/db/fixtures/cards-basic.json` to the 0002 column shape, and the hand-written schema in `packages/db/src/testing/fixtures.spec.ts` with it | — | S02.T06 | inherited debt from §1.15 Q1 option A. `cards-basic.json` uses the pre-0002 shape (`subtypes`, `types`, no `raw_ptcg_json` / `number` / `name_norm` / `updated_at`) and cannot be inserted into the 0002 schema; `fixtures.spec.ts` loads it into its own old-shape schema. S02.T06 is the first task that loads a fixture into the real schema, so it owns the migration. `packages/db/fixtures/cards-schema-0002.json` was added in P2 for this subtask's round-trip and is unaffected. |

No new deferral beyond §1.11 and the §1.15 Q1 debt. Nothing was deferred silently.

## Deviations worth carrying forward

- **RED commit made outside the phase.** The §2.1 test files, fixture, handoff, spec and stage README were
  committed as `72c1ebd feat: add fixture for Gardevoir ex card and implement schema drift tests` while P3's
  baseline run was in flight, not by P3 under the prescribed `test(S02.T05): RED — 28 failing tests` message.
  The working tree was clean at that moment, so the baseline evidence matches that commit's content exactly and
  the chain holds; `72c1ebd` is recorded as RED_COMMIT. Flagged for P4A and P4. Details: handoff §3.1, §3.5 D-1.
- **`f8a03e6`** removes `apps/api/src/__lint-fixture__.ts`, a runtime artifact of `scripts/lint-config.spec.ts`
  that `72c1ebd` tracked by accident. Committed on its own, before implementation, so the GREEN diff stays
  production-only.
- **21 named indexes, not 18.** The spec's Outputs list says "all 18 named indexes"; the DDL it specifies names
  21, and 21 are created and asserted. 18 is the count up to `resistances`. Corrected in `0002_cards.md` §5;
  the spec body was not rewritten, which is P4's call.
- **Open for the tasks that first consume them (§1.13 Q6, unchanged here).**
  `sqliteDialect.numericOrder(col)` returns only `CAST(<col> AS INTEGER)`, without the secondary `<col>` the
  spec's Interfaces section describes — S02.T09 is its first consumer. `sqliteDialect.rank()` builds
  `bm25(<weights>)` without the table argument that `bm25(cards_fts, …)` requires — S02.T08 is its first
  consumer. No migration uses either, so neither was touched.
- **`scripts/sql-lint.mjs` dead code**, noted in §2.6 decision 9 and still true:
  `scanSourceFiles(join(rootDir, "apps")).catch?.(() => []) ?? []` never lints `apps/`, because
  `scanSourceFiles` is synchronous and returns an array. It also throws if `apps/` is missing, before the
  `.catch` that was meant to absorb that. Out of scope for this subtask; it belongs to whoever owns sql-lint.

## Next phase

P4A-VERIFY, in a fresh Claude Code session.
