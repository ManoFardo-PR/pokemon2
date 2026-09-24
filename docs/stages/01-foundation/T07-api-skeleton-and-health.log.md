# Subtask S01.T07 Execution Log

- **Status**: `COMPLETED`
- **Completion Date**: 2025-04-18
- **Subtask ID**: S01.T07
- **Files Created/Modified**:
  - `apps/api/package.json`
  - `apps/api/tsconfig.json`
  - `apps/api/vitest.config.ts`
  - `apps/api/src/config.ts`
  - `apps/api/src/errors.ts`
  - `apps/api/src/routes/system.ts`
  - `apps/api/src/app.ts`
  - `apps/api/src/server.ts`
  - `apps/api/ROUTES.md`
  - `packages/db/src/testing/index.ts`
- **Test Status**: `PASSED`

## Summary of Implementation & Technical Decisions
- **Fastify 5 + Zod Type Provider**: Implemented `buildApp` factory with `fastify-type-provider-zod`, configured request-id echoing, pino logging, and payload serialization validation.
- **Config Invariants (BR-S01.T07-02)**: Implemented `apiConfigSchema` with loopback host validation (`127.0.0.1` and `::1`), string-to-boolean transform for `MIGRATE_ON_START`, and comma-separated origin list parsing.
- **CORS & Error Envelopes (BR-S01.T07-04, BR-S01.T07-08, BR-S01.T07-09)**: Wired `@fastify/cors` with explicit origin whitelist and no wildcards. Installed uniform error envelope handlers (`{ error: { code, message, details?, requestId } }`) ensuring internal error stack traces and internal messages are masked.
- **System Endpoints (BR-S01.T07-06, BR-S01.T07-07)**:
  - `GET /health`: Implemented defensive row counts (`countOrZero`) on `sets`, `cards`, and `decks` that return 0 if tables are missing; returns SQLite version and path; catches DB failure and returns 503 `database_unavailable`.
  - `GET /api/version`: Returns API version, `CONTRACT_VERSION`, runtime node version, and current DB schema version.
- **Server Startup Invariant (BR-S01.T07-01)**: `server.ts` asserts current migration schema and exits with code 2 on `SchemaOutdatedError` when `MIGRATE_ON_START=0`, or auto-migrates first when `MIGRATE_ON_START=1`.
- **Route Documentation**: Created `apps/api/ROUTES.md` specifying all 11 architectural route conventions.
