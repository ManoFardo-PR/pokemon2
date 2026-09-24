# Shared Contracts System

Version: `1.0.0`
Major: `1`

## 1. What a Contract Is and the Four Boundaries

In PokéSearch, boundaries between different processes and execution runtimes are strictly declared using Zod schemas with mirrored, pre-rendered JSON Schema (Draft 2020-12) specifications. This eliminates drift by construction across:

1. **Web ⇄ API**: Next.js client issuing search requests and receiving deck validation reports.
2. **Worker ⇄ Engine**: Background worker delegating simulation jobs to the Rust simulation engine over JSON Lines.
3. **ETL ⇄ Database / Loaders**: Transformation pipelines consuming external Pokémon card data and emitting canonical `CardDef` entities.
4. **Scenario & IR Files (Git / Disk) ⇄ Engine**: Scenario regression files (`engine/scenarios/*.json`) and effect IR ASTs executed deterministically by the simulator VM.

## 2. Structural Schema Rules

All contracts in `@pokesearch/shared` must adhere to the following invariants, continuously verified in `src/contracts.spec.ts`:

- **Strict Objects (`.strict()`)**: Unknown properties are immediately rejected (`BR-S01.T05-04`). Forward compatibility is managed exclusively via version negotiation, never by ignoring fields.
- **English Field Documentation (`.describe(...)`)**: Every top-level and branch property must include clear English documentation (`BR-S01.T05-07`).
- **Discriminated Unions**: Unions crossing process boundaries must define a discriminant key (`type` for stream events, `kind` for jobs) (`BR-S01.T05-08`).
- **Pure JSON Serializable Types**: Non-JSON data structures (`Date`, `BigInt`, `Map`, `Set`, `undefined`) are prohibited (`BR-S01.T05-05`). Timestamps must be ISO-8601 strings.

## 3. Versioning Semantics (`CONTRACT_VERSION`)

Version format: `MAJOR.MINOR.PATCH` (SemVer 2.0).

| Change Type | Impact | Version Bump | Changelog Required |
|---|---|---|---|
| Field removal or renaming | Breaking | **MAJOR** | Yes |
| Narrowing existing type / constraints | Breaking | **MAJOR** | Yes |
| Changing union discriminator | Breaking | **MAJOR** | Yes |
| Additive optional field with default | Non-breaking | **MINOR** | Yes |
| Non-functional doc / metadata update | Non-breaking | **PATCH** | Optional |

## 4. Engine Handshake

When invoking the Rust simulation engine via CLI or streaming protocol, every job request envelope carries `contractVersion: string`.
- The engine checks compatibility using `CONTRACT_MAJOR`.
- If the major versions do not match, the engine refuses the job immediately with:
  ```json
  {"type":"error","code":"contract_major_mismatch"}
  ```

## 5. Adding or Updating a Contract

To register a new contract:
1. Define the schema, inferred type, and sample in its dedicated folder (`src/<name>/index.ts`).
2. Add the contract definition entry to `CONTRACTS` inside `src/registry.ts`.
3. Export the contract through the package entrypoint `src/index.ts`.
4. Run `pnpm --filter @pokesearch/shared schema:build` to emit the JSON Schema in `packages/shared/schema/`.
5. Run tests: `pnpm --filter @pokesearch/shared test`.
6. Record the change in the changelog below.

## 6. Changelog

| Date | Version | Contract | Change Summary | Reason |
|---|---|---|---|---|
| 2025-05-18 | 1.0.0 | All (8 core schemas) | Initial contract placeholders (`search-query`, `decklist`, `validation-report`, `effect-ir`, `job-request`, `job-event`, `scenario`, `card-def`) | Baseline schema foundation for S01.T05 |
