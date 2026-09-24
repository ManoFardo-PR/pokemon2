# Subtask Execution Log: S01.T05 — Shared contracts package

- **Status**: COMPLETED
- **Completion Date**: 2025-05-18
- **Subtask ID**: S01.T05
- **Specification File**: docs/stages/01-foundation/T05-shared-contracts-package.md
- **Test Status**: PASSED

## Summary of Completed Work

1. **Versioning System (`packages/shared/src/version.ts`)**:
   - Implemented `CONTRACT_VERSION = "1.0.0"` and `CONTRACT_MAJOR = 1`.
   - Implemented `isCompatible(other: string): boolean` matching major version compatibility using SemVer matching.

2. **Core Contracts and Placeholders (`packages/shared/src/`)**:
   - `search/`: `searchQuerySchema`, `SearchQuery`, `searchQuerySample`
   - `decklist/`: `decklistLineSchema`, `decklistSchema`, `Decklist`, `validationReportSchema`, `ValidationReport` and samples
   - `ir/`: `effectIrSchema`, `EffectIr`, `effectIrSample` (closed vocabulary v0)
   - `jobs/`: `jobRequestSchema`, `JobRequest`, `jobEventSchema` (discriminated union on `type`), `JobEvent` and samples
   - `scenario/`: `scenarioSchema`, `Scenario`, `scenarioSample`
   - `card-def/`: `cardDefSchema`, `CardDef`, `cardDefSample`
   - All object schemas strictly enforce `.strict()` to reject unknown keys (`BR-S01.T05-04`).
   - Every top-level property and union variant is documented with English `.describe(...)` tags (`BR-S01.T05-07`).
   - Pure JSON data types only (no `Date`, `BigInt`, `Map`, `Set`, `undefined`) (`BR-S01.T05-05`).

3. **Registry and Exports (`packages/shared/src/registry.ts`, `packages/shared/src/index.ts`, `packages/shared/package.json`)**:
   - Defined `CONTRACTS: readonly ContractEntry[]` registering all 8 core contracts and their respective schema files.
   - Configured package entrypoints and subpath exports in `packages/shared/package.json` (`.`, `./env`, `./version`, `./registry`, `./search`, `./decklist`, `./ir`, `./jobs`, `./scenario`, `./card-def`).

4. **Deterministic Schema Exporter Pipeline (`packages/shared/scripts/`)**:
   - `schema-build.mjs`: Exports Zod schemas to JSON Schema draft 2020-12 with `$id = https://pokesearch.invalid/schema/v<major>/<file>`, sorted keys, 2-space indentation, and newline (`BR-S01.T05-03`).
   - `schema-check.mjs`: Validates committed schema files against in-memory generated schemas for byte-identical determinism.
   - Generated 8 JSON Schema files under `packages/shared/schema/*.json`.
   - Wired `schema:build` and `schema:check` npm scripts in `packages/shared` and workspace root `pnpm check`.

5. **Contracts Documentation (`packages/shared/CONTRACTS.md`)**:
   - Documented the 4 process/runtime boundaries, invariant rules, SemVer bump rules, engine handshake protocol, and the initial `1.0.0` changelog row.

6. **Verification & Invariant Tests (`packages/shared/src/contracts.spec.ts`, `packages/shared/src/version.spec.ts`)**:
   - All 53 tests in `@pokesearch/shared` passed cleanly.
   - Root `pnpm run check` (typecheck, lint, sql-lint, schema:check, test) passes cleanly across all workspaces.

## Files Created / Modified
- `packages/shared/package.json` (modified)
- `package.json` (modified)
- `packages/shared/src/version.ts` (created)
- `packages/shared/src/version.spec.ts` (created)
- `packages/shared/src/search/index.ts` (created)
- `packages/shared/src/decklist/index.ts` (created)
- `packages/shared/src/ir/index.ts` (created)
- `packages/shared/src/jobs/index.ts` (created)
- `packages/shared/src/scenario/index.ts` (created)
- `packages/shared/src/card-def/index.ts` (created)
- `packages/shared/src/registry.ts` (created)
- `packages/shared/src/index.ts` (modified)
- `packages/shared/src/contracts.spec.ts` (created)
- `packages/shared/scripts/schema-build.mjs` (created)
- `packages/shared/scripts/schema-check.mjs` (created)
- `packages/shared/schema/search-query.json` (created)
- `packages/shared/schema/decklist.json` (created)
- `packages/shared/schema/validation-report.json` (created)
- `packages/shared/schema/effect-ir.json` (created)
- `packages/shared/schema/job-request.json` (created)
- `packages/shared/schema/job-event.json` (created)
- `packages/shared/schema/scenario.json` (created)
- `packages/shared/schema/card-def.json` (created)
- `packages/shared/CONTRACTS.md` (created)
- `docs/stages/01-foundation/T05-shared-contracts-package.log.md` (created)
