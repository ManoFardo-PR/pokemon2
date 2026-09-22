# S01.T03 — Test database helper and fixtures

| Field | Value |
|---|---|
| Stage | S01 — Foundation |
| Status | TODO |
| Order in stage | 3 / 10 |
| Depends on | [S01.T02](T02-sqlite-database-client.md) |
| Unblocks | [S01.T04](T04-database-migration-framework.md) |
| Parallel with | [S01.T10](T10-quality-gates-and-docs-lint.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/db/client` — from [S01.T02](T02-sqlite-database-client.md)
- `file` a handful of real card/deck JSON records to seed fixtures (initially hand-copied from the public sources) — 5 printings covering a Basic, a Stage 2 with an ability, an ex with two attacks, a Trainer and a Special Energy; 2 decklists in TCG Live format
- `external` `os.tmpdir()` on this machine resolves to a local disk outside OneDrive — the precondition that makes temp databases safe for WAL

## Outputs (proposed)
- `module` `@pokesearch/db/testing` — `withTempDb(fn)` (fresh SQLite file in the OS temp dir per test, deleted afterwards), `loadFixture(db, name)`; vitest setup file — consumed by [S01.T04](T04-database-migration-framework.md) (which re-exports it with migrations applied to every later test suite)
- `file` `packages/db/fixtures/*.json` — small realistic samples (5 cards with attacks/abilities, 2 decks) reused by search, resolver and engine tests

## Initial objective
Tests never touch the real database: each test gets a disposable SQLite file with the current schema and optional fixtures, fast enough to run hundreds of times per minute.

## Context

Every subtask from [S01.T04](T04-database-migration-framework.md) onwards needs a database in its tests. If each invents its own, the suite becomes slow and order-dependent — what happened in the legacy project, where 14 test files are gated by `pytest.mark.skipif(... not config.DB_PATH.exists(), ...)` and run against the developer's real database (verified in `pokemon/tests/test_engine_cards.py` and siblings). Two consequences: on a machine without that file a third of the suite skipped and still reported green, and the tests that ran shared mutable state. The few that used `connect(":memory:")` (`test_search.py:38`, `test_decks.py:30`) only worked because `connect()` applied the whole schema on every connect — the anti-pattern [S01.T02](T02-sqlite-database-client.md) removed.

The helper therefore comes before the migration runner, which is itself tested through it. That ordering creates one problem — the helper must apply a schema that does not exist yet — solved with a registry: `@pokesearch/db/testing` owns a slot for a schema initializer and knows nothing about migrations; the vitest setup file imports both and wires them. No circular import, and the helper stays usable in a package with no migrations.

Fixtures serve two audiences at once: a loader test needs the **source documents** as the fetchers return them, a query test needs the **rows** the loaders produce. One file carries both, so a fixture is simultaneously input and expected output for the loaders of [S02.T06](../02-card-data-and-search/T06-load-cards.md), and drift between them is a test failure rather than a later discovery.

## Scope

- **In scope.** `packages/db/src/testing/` — temp-database lifecycle, the template-copy optimisation, the schema-initializer registry, `loadFixture`, a `vitest.setup.ts` shared by every package; the fixture JSON shape and its zod validator; the five card and two deck fixtures; the guard that forbids opening the real database from a test.
- **Out of scope.** The migration runner ([S01.T04](T04-database-migration-framework.md)); the tables the fixtures will populate ([S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md), [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md)); large realistic datasets behind an env flag; HTTP/HTML fixtures for the fetchers, owned by their subtasks; factories for job, measurement and evidence rows, owned by S04–S06.

## Business rules

The traceability doc assigns no `RN-nn` to this subtask.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T03-01 | No test opens `$DATABASE_PATH`; every test database lives under `os.tmpdir()` (or `$POKESEARCH_TEST_TMPDIR`). | `withTempDb` builds the path; `vitest.setup.ts` throws `TestDbError` if `openDatabase` receives the resolved `DATABASE_PATH` while `NODE_ENV === "test"` | `testing.spec.ts > refuses to open the real database` |
| BR-S01.T03-02 | A temp database and its `-wal`/`-shm` sidecars are removed when the callback returns **and** when it throws. | `try/finally`: `close()` then `rm(dir, { recursive: true, force: true, maxRetries: 3 })` | `testing.spec.ts > cleans up after a throwing callback` |
| BR-S01.T03-03 | `loadFixture(db, name)` is idempotent: loading twice leaves identical row counts and contents. | upsert by primary key, never blind `INSERT` | `fixtures.spec.ts > loading twice is a no-op` (per-table counts + checksum) |
| BR-S01.T03-04 | Every file in `packages/db/fixtures/` parses against `fixtureSchema`, and every card id referenced by a deck line exists in the same file. | `fixtureSchema` (zod) + a referential check in `validateFixture()` | `fixtures.spec.ts > every fixture validates`, fails on a dangling id |
| BR-S01.T03-05 | `withTempDb` applies the registered schema initializer before the test body; with none registered the database is empty and the helper reports it. | the registry, read once per call | `testing.spec.ts > applies the registered initializer`, `> reports an empty schema when none is registered` |
| BR-S01.T03-06 | Fixtures carry only public-source data: no API key, no personal data, no image bytes (URLs only). | `packages/db/fixtures/README` checklist + a pattern test | `fixtures.spec.ts > fixtures carry no secrets` |

## Data operations

The helper is the only thing allowed to create databases outside the migration path, and it writes through the same adapter as everyone else.

| Artifact | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| `<tmpdir>/pokesearch-test-<pid>-<n>-<rand>/db.sqlite` | create, open read/write, delete | `withTempDb` | per test | never under the repo, OneDrive or `$DATA_DIR`; deleted in `finally` |
| `<tmpdir>/pokesearch-template-<schemaHash>.sqlite` | create once, then copy per test | `withTempDb`, per vitest worker | first call after the initializer changes | keyed by a hash of the initializer's inputs, so a new migration invalidates it; copied with `fs.copyFile` after a WAL checkpoint |
| `packages/db/fixtures/<name>.json` | read | `loadFixture`, `validateFixture` | on demand | read-only; never written by a test |
| baseline tables (`sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `tournaments`, `decks`, `deck_cards`) | upsert by primary key — `test` acting in the `etl` role | `loadFixture` | one transaction per fixture; parents before children; `deck_cards` delete-then-insert per deck |
| `user_decks`, `user_deck_versions` | insert — `test` acting in the `api` role | `loadFixture`, when the fixture declares them | fixed string ids so assertions are stable |
| job / measurement / evidence tables | **not written here** | — | — | worker-owned; S04–S06 bring their own factories, so a foundation fixture can never fake a measurement |

## Interfaces

**`packages/db/src/testing/index.ts`**

```ts
export interface TempDbInfo { db: Db; path: string; dir: string; schemaApplied: boolean; }
export interface TempDbOptions { fixtures?: readonly string[]; readonly?: boolean; keepOnFailure?: boolean; }
export function withTempDb<T>(fn: (info: TempDbInfo) => T, opts?: TempDbOptions): T;
export function withTempDbAsync<T>(fn: (info: TempDbInfo) => Promise<T>, opts?: TempDbOptions): Promise<T>;
export type SchemaInitializer = { key: string; apply: (db: Db) => void };
export function registerSchemaInitializer(init: SchemaInitializer): void;
export function resetSchemaInitializer(): void;
export function loadFixture(db: Db, name: string): { tables: Record<string, number> };
export function readFixture(name: string): Fixture;
export function validateFixture(doc: unknown): Fixture;
export function listFixtures(): string[];
```

**Fixture document** (`packages/db/fixtures/<name>.json`):

```jsonc
{
  "fixture": "cards-basic",        // = file name
  "version": 1,
  "description": "5 printings covering Basic, Stage 2 + ability, ex, Trainer, Special Energy",
  "source": {                       // what the fetchers return — input of the ETL loaders
    "ptcg":    { "sets": [ /* pokemon-tcg-data set docs */ ], "cards": [ /* card docs */ ] },
    "tcgdex":  { "cards": [ /* tcgdex card docs */ ] },
    "limitless": { "tournaments": [], "decklists": [] }
  },
  "rows": {                         // what the loaders must produce — input of query tests
    "sets":  [ { "id": "sv4pt5", "name": "Paldean Fates" } ],
    "cards": [ { "id": "sv4pt5-54", "set_id": "sv4pt5" } ],
    "attacks": [], "abilities": [], "weaknesses": [], "resistances": []
  }
}
```

`loadFixture` inserts `rows` only, in a fixed dependency order (`sets` → `cards` → card children → `tournaments` → `decks` → `deck_cards` → `user_decks` → `user_deck_versions`), skips empty arrays and throws `FixtureTableMissing` for a table that does not exist yet. `source` is never inserted; it is what [S02.T06](../02-card-data-and-search/T06-load-cards.md)'s loader test feeds through the loader and compares against `rows`.

**Fixtures delivered here.** `cards-basic.json` (the 5 printings), `decks-basic.json` (2 TCG Live lists plus their resolved `deck_cards`, one line deliberately unresolved to exercise RN-02 later), `empty.json` (valid document with every array empty).

**vitest wiring.** Root `vitest.config.ts` sets `setupFiles: ["./packages/db/src/testing/vitest.setup.ts"]`, `environment: "node"`, `pool: "forks"` (one template per worker) and `poolOptions.forks.execArgv = ["--no-warnings=ExperimentalWarning"]`. The setup file sets `NODE_ENV=test`, installs the real-database guard, and — where migrations exist — calls `registerSchemaInitializer({ key: migrationsHash(), apply: migrate })` from `@pokesearch/db/migrate` ([S01.T04](T04-database-migration-framework.md)). `POKESEARCH_TEST_TMPDIR` relocates every temp database for a machine whose `%TEMP%` is slow or scanned.

## Implementation steps

1. Create `testing/index.ts` with `withTempDb` in its simplest form (mkdtemp → `openDatabase` → `fn` → close → `rm`) and `testing.spec.ts` for creation and cleanup.
2. Add the `SchemaInitializer` registry and apply it inside `withTempDb`; spec both branches (BR-S01.T03-05).
3. Add `keepOnFailure` and the failure path that prints the kept directory; spec the throwing callback (BR-S01.T03-02).
4. Write `vitest.setup.ts` with `NODE_ENV=test` and the real-database guard; wire it in the root config (BR-S01.T03-01).
5. Define `fixtureSchema` and `validateFixture`; write `empty.json` and the directory-sweep spec (BR-S01.T03-04).
6. Write `cards-basic.json` and `decks-basic.json` by hand from the public sources, filling `source` and `rows` consistently; add the no-secrets check (BR-S01.T03-06).
7. Implement `loadFixture` with the fixed order, upsert semantics and `FixtureTableMissing`; spec idempotency against a temp database whose initializer creates the two tables that exist today (BR-S01.T03-03).
8. Add the template-copy optimisation (build once per worker, keyed by the initializer key) and the timing spec: 50 `withTempDb` tests under 5 s.

## Edge cases and error handling

- **A fixture references a table that does not exist yet** — the normal situation during S01, where only `schema_migrations` and `etl_runs` exist → `FixtureTableMissing: cards (fixture cards-basic)` instead of opaque SQL; specs needing those tables arrive in [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md).
- **Windows refuses to delete the temp directory** (`EBUSY`/`EPERM`, antivirus or an open handle) → `rm` retries 3× at 50 ms; if it still fails the helper logs the path at `warn` and does not fail an otherwise passing test; an `afterAll` sweep removes `pokesearch-test-*` directories older than an hour.
- **A test leaks its own connection** → `withTempDb` closes only what it opened, so the `rm` warning above is the intended signal.
- **Two workers build the template simultaneously** → each writes to a unique name and renames atomically; the loser deletes its copy and uses the winner's.
- **The registered initializer throws** (a broken migration) → the directory is deleted, the template for that key invalidated, and the error rethrown with the key in the message, so it reads as "migration 0003 failed", not "cannot open table".
- **`source` and `rows` disagree** after a schema change → the loader round-trip test in [S02.T06](../02-card-data-and-search/T06-load-cards.md) fails and the fixture, not the test, is corrected; stated in `fixtures/README`.
- **`POKESEARCH_TEST_TMPDIR` inside the repo or OneDrive** → rejected at setup with the same message as [S01.T01](T01-monorepo-skeleton.md)'s path guard; WAL sidecars in a synced folder corrupt silently.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/db test testing.spec.ts` green: the database is created under `os.tmpdir()`, the registered initializer runs, and the directory with its sidecars is gone after both a returning and a throwing callback (BR-S01.T03-02, -05).
- [ ] `testing.spec.ts > refuses to open the real database` fails the call and names `DATABASE_PATH` (BR-S01.T03-01).
- [ ] `fixtures.spec.ts` validates every file in `packages/db/fixtures/`, rejects a deck line citing an unknown card id, and finds no secret-shaped value (BR-S01.T03-04, -06).
- [ ] `loadFixture` applied twice returns identical `tables` counts and an identical row checksum (BR-S01.T03-03).
- [ ] A generated spec of 50 `withTempDb` tests completes in under 5 s on this machine.
- [ ] `loadFixture(db, "cards-basic")` against today's schema throws `FixtureTableMissing: sets`, proving the documented error path.
- [ ] After a full `pnpm test`, no `pokesearch-test-*` directory remains in the temp folder.

## Risks and open questions

- **Risk — the template copy hides a migration bug** (tests run against a copy built before the change). Mitigation: the template key is a hash of the migration files, so any edit invalidates it; [S01.T04](T04-database-migration-framework.md) exports `migrationsHash()` for exactly this.
- **Risk — fixtures rot** as the schema grows. Mitigation: the loader round-trip test in [S02.T06](../02-card-data-and-search/T06-load-cards.md) compares `source`-through-loader with `rows`; an unreflected schema change fails there.
- **Risk — temp-file churn on a scanned volume** breaks the 50-test budget. Mitigation: `POKESEARCH_TEST_TMPDIR`, and a Defender exclusion as a last resort.
- **Question — `:memory:` databases for speed?** Recommendation: no. They cannot exercise WAL, multi-process behaviour or `VACUUM INTO`, and the legacy `:memory:` tests are precisely the ones that depended on schema-on-connect. Revisit only with a measurement.
- **Question — where does the "real database behind an env flag" escape hatch live** for tests that need 20k cards? Proposed `POKESEARCH_TEST_DB=<path>` plus a separate `withRealDb`; decided by the first subtask that needs it, likely [S02.T11](../02-card-data-and-search/T11-api-cards-search-sets.md).

## References

- `pokemon/tests/test_engine_cards.py` and 13 sibling files — verified: `pytestmark = pytest.mark.skipif(not ea.ENGINE_AVAILABLE or not config.DB_PATH.exists(), ...)`, i.e. tests run against the real database and skip silently without it. Consult as the failure mode this subtask prevents.
- `pokemon/tests/test_search.py:38`, `pokemon/tests/test_decks.py:30` — verified: `connect(":memory:")`, which worked only because the legacy `connect()` applied `schema.sql` on every connect.
- `pokemon/tests/conftest.py` — verified: the `verifies` marker registry and `--write-verified`, which writes `sim/verified_cards.json` from the tests that passed; the model [S05.T12](../05-card-rules-base/T12-coverage-and-evidence.md) re-expresses as insert-only evidence.
- `pokemon/tests/fixtures/` — verified: only `limitless_details.json` and `limitless_standings.json`; card fixtures never existed, which is why the five printings are hand-built here.
- [Data model overview](../../project/04-data-model-overview.md) — the table inventory and the parent-before-child order `loadFixture` follows.
- External: vitest configuration (`setupFiles`, `pool: "forks"`, `poolOptions.forks.execArgv`); Node `fs.mkdtemp` and `fs.rm` retry options.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
