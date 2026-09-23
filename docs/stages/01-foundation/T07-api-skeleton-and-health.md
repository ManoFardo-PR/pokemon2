# S01.T07 — API skeleton and health endpoint

| Field | Value |
|---|---|
| Stage | S01 — Foundation |
| Status | TODO |
| Order in stage | 7 / 10 |
| Depends on | [S01.T04](T04-database-migration-framework.md), [S01.T05](T05-shared-contracts-package.md) |
| Unblocks | [S01.T08](T08-web-skeleton.md), [S02.T11](../02-card-data-and-search/T11-api-cards-search-sets.md), [S03.T07](../03-tournament-meta-and-deck-builder/T07-api-meta-endpoints.md), [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md), [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md), [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/db/migrate` and `@pokesearch/db/client` — from [S01.T04](T04-database-migration-framework.md)
- `module` `@pokesearch/shared` (`env.ts`, contract placeholders) — from [S01.T05](T05-shared-contracts-package.md)
- `module` `@pokesearch/db/testing` — from [S01.T04](T04-database-migration-framework.md) (re-exported test helper with migrations applied)
- `external` Fastify 5 with a zod type provider, `@fastify/cors` and pino — the only server dependencies this subtask adds

## Outputs (proposed)
- `module` `apps/api/src/app.ts` — Fastify 5 app factory (pino logging, zod type provider, error handler, CORS for the web dev server), `apps/api/src/server.ts` bound to `127.0.0.1:$API_PORT` — consumed by [S01.T08](T08-web-skeleton.md), [S02.T11](../02-card-data-and-search/T11-api-cards-search-sets.md), [S03.T07](../03-tournament-meta-and-deck-builder/T07-api-meta-endpoints.md), [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md), [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md); plus `apps/api/src/config.ts` and the error-envelope helper
- `contract` `GET /health` → `{ ok, sqliteVersion, databasePath, schemaVersion, counts: { sets, cards, decks } }`; `GET /api/version`
- `doc` route conventions: one file per domain under `apps/api/src/routes/`, JSON only, HTML rendered by the web app; pagination and error envelope shapes — written as `apps/api/ROUTES.md`

## Initial objective
The API process starts, opens the database, refuses to run on an outdated schema, and answers `/health` with facts a person can use to verify the setup (SQLite version, file path, counts).

## Context

Everything the user sees passes through this process, and the stage's exit criterion — "`GET /health` returns the SQLite version, database path and zero counts" — is the first end-to-end proof that workspace, database client, migrations and contracts fit together.

The legacy equivalent is instructive in what it did not do. `pokemon/src/pokesearch/api/main.py` builds a FastAPI app whose lifespan calls `get_conn()` (one shared connection), mounts `/static`, includes four routers mixing JSON endpoints with HTMX HTML fragments, starts the scheduler in-process when `ENABLE_SCHEDULER=1`, and exposes `@app.get("/health")` returning literally `{"ok": True}`. So health said nothing; the schema was whatever `connect()` had just created; site and API were one thing; and a long ETL ran inside the web process. Here those four are separated — the worker owns the scheduler, the web app owns HTML, migrations own the schema — and `/health` is what proves it, by naming the file it opened, the SQLite version it got and the schema version it asserted.

The second job is to fix the conventions once, because five later subtasks add routes to this app. The error envelope, the pagination shape, the mandatory response schema and the writer discipline are far cheaper to impose now than to retrofit.

## Scope

- **In scope.** `buildApp()` and `server.ts`; the API config schema; zod type-provider wiring; the error envelope, error handler and not-found handler; request ids and pino logging; CORS for the Vite origin; graceful shutdown; the startup schema assertion and `MIGRATE_ON_START`; `GET /health` and `GET /api/version`; `apps/api/ROUTES.md`; route tests through `app.inject` on a migrated temp database.
- **Out of scope.** Every domain route — cards/search/sets ([S02.T11](../02-card-data-and-search/T11-api-cards-search-sets.md)), meta ([S03.T07](../03-tournament-meta-and-deck-builder/T07-api-meta-endpoints.md)), user decks ([S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)), jobs and SSE ([S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md)); authentication (D-007: none); OpenAPI generation; rate limiting; the worker and scheduler; any HTML.

## Business rules

The traceability doc assigns no `RN-nn` here. Architecture principle 2 (the api writes only user-facing tables) and D-007 (single local user, loopback, no auth) are first enforced in this file.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T07-01 | The API never serves on an outdated schema: startup calls `assertSchemaCurrent(db)` and exits 2 on `SchemaOutdatedError`, unless `MIGRATE_ON_START=1`, in which case it migrates first and then asserts. | `server.ts` startup sequence, before `listen()` | `server.spec.ts > exits 2 when a migration is pending`; `> migrates when MIGRATE_ON_START=1` |
| BR-S01.T07-02 | The server binds to loopback only; an `API_HOST` that is not `127.0.0.1` or `::1` is refused at startup (D-007: no authentication exists). | a refinement on `apiConfigSchema.API_HOST` + the `listen({ host })` call | `config.spec.ts > rejects a non-loopback host`; `server.spec.ts` asserts the bound address |
| BR-S01.T07-03 | Every route declares a response schema and its payload is serialized through it; a field outside the schema never reaches the client. | the zod type provider's serializer compiler | `routes.spec.ts > every registered route has a response schema` |
| BR-S01.T07-04 | Every non-2xx response is the envelope `{ error: { code, message, details?, requestId } }` with a stable machine `code`; no stack trace, SQL or unexpected path reaches the client. | `setErrorHandler` + `setNotFoundHandler` + `toEnvelope()`; pino logs the original with the same `requestId` | `errors.spec.ts > unknown route`, `> validation failure`, `> internal error hides the cause` |
| BR-S01.T07-05 | `GET` routes never write: no `INSERT`, `UPDATE`, `DELETE` or DDL runs while handling a `GET`. | convention plus a test hook counting write statements through the adapter | `routes.spec.ts > GET /health performs no writes` |
| BR-S01.T07-06 | `/health` answers in under 100 ms on an empty database and opens no transaction; a failed read returns 503 with the envelope rather than a partial health object. | four single-row queries in the handler, catching `DbError` | `health.spec.ts > responds under 100 ms`; `> returns 503 when the database is closed` |
| BR-S01.T07-07 | `/health` counts are defensive: a table absent from `sqlite_master` counts 0, so the endpoint works on the foundation schema. | `countOrZero(db, table)` | `health.spec.ts > counts are zero on the foundation schema` |
| BR-S01.T07-08 | CORS allows exactly the configured web origins; no wildcard, no credentials. | `@fastify/cors` with `origin: config.CORS_ORIGINS`, `credentials: false` | `cors.spec.ts > allows the dev origin`, `> rejects an unknown origin` |
| BR-S01.T07-09 | Every request carries a `requestId` (from `x-request-id` when present, else generated) that appears in the log line and in any error envelope. | `genReqId` plus the envelope mapper | `errors.spec.ts > envelope echoes the request id` |

## Data operations

**Endpoints**

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/health` | — | `200 { ok: true, sqliteVersion: string, databasePath: string, schemaVersion: number, counts: { sets: number, cards: number, decks: number } }` | `503 database_unavailable` |
| GET | `/api/version` | — | `200 { name: "pokesearch-api", version: string, contractVersion: string, schemaVersion: number, node: string, commit: string \| null, engineBuild: string \| null }` | `503 database_unavailable` |
| * | any unmatched path | — | — | `404 not_found` in the envelope |

`engineBuild` stays `null` until [S01.T06](T06-rust-toolchain-gate.md) produces a binary and the worker reports it; `commit` is `null` in a plain dev run.

**Database access** — one read/write connection, nothing written in this subtask.

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl/user) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `schema_migrations` | R | api | startup and per `/health`, `/api/version` | read-only; `MAX(version)` | a pending migration stops startup |
| `schema_migrations` | C | api, only under `MIGRATE_ON_START=1` | startup | delegated to `migrate()`, one transaction per file | off by default; the explicit path is `pnpm db:migrate` |
| `sets`, `cards`, `decks` | R (count) | api | per `/health` | `countOrZero` returns 0 for an absent table | the tables arrive in [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) and [S03.T01](../03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md) |
| `etl_runs` | — | — | not read here | — | a "last ETL run" field is proposed under Risks, not implemented |
| `user_decks`, `user_deck_versions`, `jobs` | C/U/D | api | from [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) and [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md) onwards | short transactions, `BEGIN IMMEDIATE` | the api never writes baseline tables (etl) or job-progress/measurement tables (worker) |

## Interfaces

**`apps/api/src/config.ts`**

```ts
export const apiConfigSchema = sharedEnvSchema.extend({
  API_HOST:           z.string().default("127.0.0.1").refine(isLoopback, "API must bind to loopback (D-007)"),
  API_PORT:           z.coerce.number().int().min(1).max(65535).default(8000),
  MIGRATE_ON_START:   z.enum(["0", "1"]).default("0").transform(v => v === "1"),
  CORS_ORIGINS:       z.string().default("http://127.0.0.1:5173,http://localhost:5173")
                       .transform(s => s.split(",").map(o => o.trim()).filter(Boolean)),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  BODY_LIMIT_BYTES:   z.coerce.number().int().min(1024).default(1_000_000),
  LOG_LEVEL:          z.enum(["trace","debug","info","warn","error"]).default("info"),
});
export type ApiConfig = z.infer<typeof apiConfigSchema>;
```

Both loopback spellings are in the CORS default because Vite and the browser disagree about `localhost` versus `127.0.0.1`.

**`apps/api/src/app.ts`**

```ts
export interface BuildAppOptions { db: Db; config?: Partial<ApiConfig>; logger?: FastifyBaseLogger | boolean; }
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance>;  // decorates app.db, app.config
```

`buildApp` sets `genReqId`, the zod validator and serializer compilers, `bodyLimit`, `connectionTimeout`, registers `@fastify/cors`, installs the error and not-found handlers, and registers the `system` plugin (`/health`, `/api/version`). It does not open the database and does not listen — which is what makes `app.inject()` tests trivial.

**`apps/api/src/server.ts`** — order: load config → `openDatabase(config.DATABASE_PATH, { create: false })` → `migrate(db)` if `MIGRATE_ON_START` → `assertSchemaCurrent(db)` → `buildApp({ db, config })` → `listen({ host, port })` → log `{ databasePath, sqliteVersion, schemaVersion, address }` → install `SIGINT`/`SIGTERM` handlers that `await app.close()` then `db.close()`.

**Error envelope.** `{ error: { code: string, message: string, details?: { path: string; message: string }[], requestId: string } }`. Code → status: `validation_error` 400, `not_found` 404, `conflict` 409, `unprocessable` 422, `payload_too_large` 413, `database_unavailable` 503, `schema_outdated` 503, `internal_error` 500. The 500 message is always the constant `"Internal error"`; the cause goes to the log under the same `requestId`.

**`apps/api/ROUTES.md` — conventions.** (1) One file per domain under `src/routes/`, each exporting a Fastify plugin registered with its prefix; `system.ts` is the one added here. (2) JSON only, `application/json; charset=utf-8`; HTML belongs to `apps/web` — no template engine, no static mount. (3) Paths are `/api/<plural-noun>` in kebab-case with `:id` for a single resource; `/health` sits outside `/api` so an operator can curl it without thinking. (4) Every route declares `schema: { params, querystring, body, response }` built from `@pokesearch/shared`, and response schemas are mandatory. (5) Pagination: request `?page=1&pageSize=60`, response `{ items, page, pageSize, total, hasMore }`. (6) `GET` read-only, `POST` create or action, `PATCH` partial update, `DELETE` remove; no verbs in paths. (7) Timestamps are ISO-8601 UTC strings; ids are the source ids of the data model. (8) Handlers throw typed errors and never compose a response by hand. (9) Long-running work is a job, not a request: `POST /api/jobs` plus SSE progress ([S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md)); a request handler never spawns the engine, and the SSE route is the one documented exemption from the JSON serializer. (10) The api writes only user-facing tables; baseline tables belong to the etl and job/measurement tables to the worker. (11) No auth and loopback binding (D-007); do not add a header-based "API key", which would imply a security model the project does not have.

## Implementation steps

1. Add `apps/api` dependencies and the `dev`/`start`/`test` scripts passing `--no-warnings=ExperimentalWarning`.
2. Write `config.ts` with its unit tests, including the loopback refinement (BR-S01.T07-02).
3. Write `app.ts` with `buildApp`, the type provider, request ids and logging; register a temporary `/health` so the app can be injected.
4. Add the envelope, `setErrorHandler`, `setNotFoundHandler` and the code→status map; write `errors.spec.ts` (BR-S01.T07-04, -09).
5. Implement the real `/health` with `countOrZero` and the 503 path; write `health.spec.ts` against a migrated temp database (BR-S01.T07-06, -07).
6. Implement `/api/version` from the package version, `CONTRACT_VERSION` and the schema version.
7. Write `server.ts` with the startup sequence, `MIGRATE_ON_START`, exit codes and graceful shutdown; drive it from `server.spec.ts` as a child process (BR-S01.T07-01).
8. Register `@fastify/cors` from config; write `cors.spec.ts` (BR-S01.T07-08).
9. Add `routes.spec.ts`: every route has a response schema, and `GET /health` performs zero writes (BR-S01.T07-03, -05).
10. Write `apps/api/ROUTES.md` with the eleven conventions.

## Edge cases and error handling

- **The database file does not exist** (fresh machine) → `create: false` raises `SQLITE_CANTOPEN`; exit 2 with `database not found at <path>; run "pnpm db:migrate"`. An API that silently creates an empty database is how the legacy project ended with divergent schemas.
- **A migration is pending** → `SchemaOutdatedError`; exit 2 naming both versions and the command to fix it.
- **`$API_PORT` already in use** → `EADDRINUSE`, exit 3 with the port and the hint; the web proxy then fails visibly rather than hanging.
- **The database becomes unreadable while running** (file moved, OneDrive reclaimed it) → `/health` answers `503 database_unavailable`, other routes do the same through the error handler, and the process stays up so the failure is observable.
- **Another process holds the write lock past `busy_timeout`** → `SQLITE_BUSY` surfaces as `503 database_unavailable` with `details`; the api does not retry silently.
- **Invalid query parameters** (`?page=abc`) → `400 validation_error` with one `details` entry per zod issue, `path` dotted (`querystring.page`); the web maps `code` to pt-BR, the API text stays English (D-006).
- **Body larger than `BODY_LIMIT_BYTES`** → `413 payload_too_large`, logged at `warn`.
- **Unknown route** → `404 not_found`; in particular `/` returns 404, because the site is served by Vite, not the API.
- **Shutdown with requests in flight** → `app.close()` drains, then the database closes; a second `SIGINT` forces exit 130.

## Acceptance / verification

- [ ] `pnpm --filter api dev` then `curl :8000/health` returns the documented JSON with real SQLite version — `3.50.4` on this machine, and `databasePath` resolved outside OneDrive.
- [ ] Route test with the temp DB helper: `/health` counts are zero on an empty schema, and stay zero (not an error) when `sets`, `cards` and `decks` do not exist (BR-S01.T07-07).
- [ ] `server.spec.ts`: with a pending migration the process exits 2 printing `applied`/`expected`; with `MIGRATE_ON_START=1` it migrates and serves (BR-S01.T07-01).
- [ ] `curl -i :8000/nope` returns 404 with the envelope, and `curl -H 'x-request-id: abc' :8000/nope` echoes `abc` (BR-S01.T07-04, -09).
- [ ] `curl :8000/api/version` returns `contractVersion` equal to `CONTRACT_VERSION` and `schemaVersion` equal to `pnpm db:status`'s applied version.
- [ ] `cors.spec.ts`: `Origin: http://127.0.0.1:5173` allowed, `http://evil.example` not, and no response carries `Access-Control-Allow-Origin: *` (BR-S01.T07-08).
- [ ] `routes.spec.ts`: every registered route has a response schema and `GET /health` executes zero write statements (BR-S01.T07-03, -05).
- [ ] `health.spec.ts` measures the handler under 100 ms on an empty database and returns 503 after the database is closed (BR-S01.T07-06).
- [ ] Starting with `API_HOST=0.0.0.0` exits non-zero with the loopback message (BR-S01.T07-02).
- [ ] `apps/api/ROUTES.md` exists with all eleven conventions.

## Risks and open questions

- **Risk — the zod serializer rejects a shape a later route needs** (unions, streams). Mitigation: ROUTES.md convention 9 exempts `text/event-stream`, which carries its own event schema in [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md).
- **Risk — one shared read/write connection becomes a bottleneck** once search lands. Mitigation: an extra read-only connection is a one-line change through the adapter; revisit in [S02.T11](../02-card-data-and-search/T11-api-cards-search-sets.md) with a measurement.
- **Risk — `/health` grows into a status dashboard** and gets slow. Mitigation: BR-S01.T07-06 fixes a 100 ms budget and "no transaction"; anything richer belongs to a separate `/api/status` in [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md).
- **Question — should `/health` report the last `etl_runs` row?** Useful after [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md). Recommendation: keep `/health` as contracted and add it to `/api/status`; the user decides if they want it sooner.
- **Question — an OpenAPI document?** The legacy site linked `/docs` in its navigation (verified in `templates/base.html`). Recommendation: add it in [S02.T11](../02-card-data-and-search/T11-api-cards-search-sets.md) when there are real routes to document.
- **Question — `MIGRATE_ON_START` default in development.** Recommended `0`, which is what BR-S01.T07-01 assumes; the user may prefer `1` locally.

## References

- `pokemon/src/pokesearch/api/main.py` — verified: FastAPI with a lifespan calling `get_conn()`, `/static` mounted, four routers (`routes_api`, `routes_ui`, `routes_decks`, `routes_sim`), the scheduler started in-process under `ENABLE_SCHEDULER`, `@app.get("/health")` returning `{"ok": True}`, and `uvicorn.run(..., host="127.0.0.1", port=8000)`. Consult for the loopback/port defaults and as the record of what is being separated.
- `pokemon/src/pokesearch/api/deps.py` and `routes_api.py` — verified to exist; consult in [S02.T11](../02-card-data-and-search/T11-api-cards-search-sets.md) for the real routes' parameter buckets.
- [Architecture overview](../../project/03-architecture-overview.md) — the process model, principle 2 (writer ownership) and the job sequence diagram the SSE convention anticipates.
- [Decision log](../../project/02-decision-log.md) D-007 and D-008.
- `packages/db/MIGRATIONS.md` ([S01.T04](T04-database-migration-framework.md)) — `assertSchemaCurrent` semantics and the exit-code contract.
- External: Fastify 5 (`setErrorHandler`, `setNotFoundHandler`, `genReqId`, `inject`, `close`), `@fastify/cors`, the zod type provider's compilers, pino serializers.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
