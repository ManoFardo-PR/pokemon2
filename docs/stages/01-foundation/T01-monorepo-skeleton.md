# S01.T01 — Monorepo skeleton and environment layout

| Field | Value |
|---|---|
| Stage | S01 — Foundation |
| Status | DONE |
| Order in stage | 1 / 10 |
| Depends on | — |
| Unblocks | [S01.T02](T02-sqlite-database-client.md), [S01.T05](T05-shared-contracts-package.md), [S01.T06](T06-rust-toolchain-gate.md), [S01.T08](T08-web-skeleton.md), [S01.T09](T09-licensing-and-notice.md), [S01.T10](T10-quality-gates-and-docs-lint.md), [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `decision` D-001..D-007 — technology and layout decisions (Rust engine and its gate, SQLite file outside OneDrive, ETL rewritten in TypeScript, rules as data, repo in OneDrive with heavy artifacts outside, English repo / pt-BR UI, single local user) — from `project/02-decision-log.md`
- `external` Node 24.13, pnpm 12 (via corepack), git 2.52 — already installed on the machine
- `file` `pokemon/pyproject.toml` — the legacy entry points (`pokesearch-etl`, `pokesearch-web`, `pokesearch-sim`) this layout replaces with workspace members; read-only reference
- `file` `pokemon/.env.example` and `pokemon/src/pokesearch/config.py` — legacy variable names and defaults, to decide what is carried over, renamed or dropped

## Outputs (proposed)
- `file` `pnpm-workspace.yaml`, root `package.json` (scripts `dev`, `check`, `test`, `typecheck`, `lint`), `tsconfig.base.json`, `.gitignore`, `.editorconfig` — plus `.npmrc` and one `tsconfig.json` per workspace member extending the base
- `file` directory layout: `apps/api`, `apps/web`, `apps/worker`, `packages/shared`, `packages/db`, `packages/etl`, `engine/`, `docs/` — each member with a manifest, `src/` and an `index.ts` that compiles
- `env` names and defaults documented in `.env.example`: `DATA_DIR` (`%LOCALAPPDATA%\pokemon2`), `DATABASE_PATH` (`$DATA_DIR/pokesearch.db`), `RAW_CACHE_DIR` (`$DATA_DIR/raw`), `CARGO_TARGET_DIR` (`$DATA_DIR/target`), `ENGINE_BIN`, `API_PORT` (8000), `WEB_PORT` (5173) — plus the optional variables listed under Interfaces — consumed by [S01.T02](T02-sqlite-database-client.md), [S01.T06](T06-rust-toolchain-gate.md), [S01.T08](T08-web-skeleton.md) and, through the shared package, by every app
- `module` `packages/shared/src/env.ts` — typed env loader (zod) reused by api, worker and etl — consumed by [S01.T05](T05-shared-contracts-package.md)

## Initial objective
A single `pnpm install` produces a workspace where every later subtask has a home directory, TypeScript runs directly on Node 24 (type stripping, no build step for api/worker/etl), and every heavy artifact (database, raw cache, Cargo target) defaults to a folder outside OneDrive.

## Context

Two constraints shape this subtask. The machine: the repository lives inside OneDrive (D-005), a poor host for a 0.5 GB SQLite file written by three processes, for a raw cache of tens of thousands of small JSON files and for a Cargo `target/`. The legacy project put all of them there — `pokemon/src/pokesearch/config.py` resolves every path against the repository root (`DB_PATH` defaults to `data/pokesearch.db`, `RAW_DIR`, `REPORTS_DIR`, `IMAGES_DIR`) — and then excluded them by hand in `.gitignore`. Here the split is structural: source in OneDrive, artifacts under `DATA_DIR`, and a loader that refuses to resolve an artifact path back inside the repository.

The runtime: D-008 fixes Node 24 + TypeScript with no build step for server code. Type stripping cannot execute constructs that emit code (`enum`, value `namespace`, parameter properties), so the constraint goes into the compiler (`erasableSyntaxOnly`) rather than a style guide, and `module: nodenext` keeps `tsc` and Node resolving alike. The legacy shape maps one to one: its three console scripts (`pokesearch-etl = pokesearch.etl.run:main`, `pokesearch-web = pokesearch.api.main:run`, `pokesearch-sim = pokesearch.sim.cli:main`) become `packages/etl`, `apps/api` and `apps/worker` + `engine/`, and its single global `config.py` becomes one typed env loader.

## Scope

- **In scope.** `pnpm-workspace.yaml`; root `package.json` (`packageManager`, `engines`, fan-out scripts); `tsconfig.base.json` and a per-member `tsconfig.json`; `.gitignore`, `.editorconfig`, `.npmrc`; the eight directories with a compiling placeholder each; `.env.example` with every variable, default and purpose; `packages/shared/src/env.ts` (schema, `loadEnv`, path resolution, the outside-the-repo guard, `ensureDataDirs`); a root `README.md` stub.
- **Out of scope.** eslint/vitest config and CI ([S01.T10](T10-quality-gates-and-docs-lint.md)); the SQLite adapter and `db:*` scripts ([S01.T02](T02-sqlite-database-client.md)); contract schemas ([S01.T05](T05-shared-contracts-package.md)); the contents of `engine/` ([S01.T06](T06-rust-toolchain-gate.md)); the Fastify app ([S01.T07](T07-api-skeleton-and-health.md)); the Vite app ([S01.T08](T08-web-skeleton.md)); `NOTICE.md` and the project `LICENSE` ([S01.T09](T09-licensing-and-notice.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask; the legacy project had no equivalent of this layer.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T01-01 | `DATA_DIR`, `DATABASE_PATH`, `RAW_CACHE_DIR`, `CARGO_TARGET_DIR` and `ENGINE_BIN` never resolve inside the repository root or a OneDrive-synced folder. | `assertArtifactPath()` called by `loadEnv()`; throws `EnvPathError` naming the variable | `env.spec.ts > defaults resolve outside the repo`; `> rejects DATA_DIR inside the repo` |
| BR-S01.T01-02 | `.env.example` declares exactly the variables the loader knows — no extra, none missing. | test comparing `Object.keys(envSchema.shape)` with the keys parsed from `.env.example` | `env.spec.ts > .env.example matches the schema` |
| BR-S01.T01-03 | No source uses TypeScript syntax Node's type stripping cannot erase (`enum`, value `namespace`, parameter property). | `tsconfig.base.json`: `erasableSyntaxOnly`, `verbatimModuleSyntax` | `pnpm -r typecheck` (TS1294 on violation) |
| BR-S01.T01-04 | `loadEnv()` validates once at startup and either returns a fully typed `Env` or exits non-zero listing every invalid variable. | single `safeParse` in `loadEnv()`, error formatted from `ZodError.issues` | `env.spec.ts > invalid API_PORT names the variable and expected type` |
| BR-S01.T01-05 | `pnpm check` fails if any member fails typecheck, lint or test; it never reports success on a partial run. | root scripts using `pnpm -r`, which propagates the first non-zero exit | `pnpm check` exit code after breaking one member's types |
| BR-S01.T01-06 | Internal dependencies are `workspace:*`; no member resolves from the registry, and `.env` is never committed. | manifests + `.gitignore` entry `.env` (and `.env.*` except `.env.example`) | `pnpm install --frozen-lockfile`; `git check-ignore -v .env` |

## Data operations

No database exists yet; this subtask touches repository and filesystem artifacts only.

| Artifact | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| `pnpm-workspace.yaml` | create | developer | once | lists `apps/*`, `packages/*`; `engine/` is a Cargo workspace, not a member |
| root `package.json` | create | developer | once | `private`, `packageManager: pnpm@12.x`, `engines.node >= 24.13`; scripts fan out with `pnpm -r` |
| `tsconfig.base.json` + per-member `tsconfig.json` | create | developer | once | members extend the base and add only `include` |
| `.gitignore`, `.editorconfig`, `.npmrc` | create | developer | once | covers `node_modules/`, `.env`, `dist/`, `.vite/`, `*.tsbuildinfo`, `coverage/`, `engine/target/` |
| `.env.example` | create / amend | developer | once, then per new variable | one commented line per variable with its default; committed |
| `.env` | create | developer (local) | first setup | untracked; optional — defaults must work without it |
| member directories | create | developer | once | each has `package.json`, `src/index.ts`, `tsconfig.json` and typechecks empty |
| `packages/shared/src/env.ts` | create | developer | once | pure module; no filesystem write at import time |
| `$DATA_DIR`, `/raw`, `/backups`, `/target` | mkdir recursive via `ensureDataDirs()` | api / worker / etl | first run of any process | idempotent; never inside the repo; failure aborts startup with the resolved path |

## Interfaces

**Members.** `apps/api` (`api`), `apps/web` (`web`), `apps/worker` (`worker`) — unscoped, so `pnpm --filter api dev` works as written in [S01.T07](T07-api-skeleton-and-health.md) and [S01.T08](T08-web-skeleton.md); `packages/shared` (`@pokesearch/shared`), `packages/db` (`@pokesearch/db`), `packages/etl` (`@pokesearch/etl`) — scoped, imported by name.

**Root scripts.** `dev` = `pnpm -r --parallel run dev`; `typecheck` = `pnpm -r run typecheck` (`tsc --noEmit`); `lint`, `test` = `pnpm -r run …` (wired in [S01.T10](T10-quality-gates-and-docs-lint.md)); `check` = the three in order. `db:migrate` / `db:status` ([S01.T04](T04-database-migration-framework.md)) and `db:backup` ([S01.T02](T02-sqlite-database-client.md)) are appended by their owners; this subtask reserves the names.

**`tsconfig.base.json`.** `target`/`lib` `es2024`, `module` and `moduleResolution` `nodenext`, `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `allowImportingTsExtensions`, `noEmit`, `skipLibCheck`, `types: ["node"]`. Relative imports carry the `.ts` extension (`./env.ts`), which is what Node resolves at runtime. `apps/web` overrides `lib` with `["es2024","dom","dom.iterable"]` and `moduleResolution` with `bundler`.

**Environment variables** (`.env.example`, one commented line each):

| Variable | Type | Default | Used by |
|---|---|---|---|
| `DATA_DIR` | absolute path | `%LOCALAPPDATA%\pokemon2` | all |
| `DATABASE_PATH` | path | `$DATA_DIR/pokesearch.db` | api, worker, etl |
| `RAW_CACHE_DIR` | path | `$DATA_DIR/raw` | etl |
| `CARGO_TARGET_DIR` | path | `$DATA_DIR/target` | engine builds |
| `ENGINE_BIN` | path | `$CARGO_TARGET_DIR/release/ptcg-cli.exe` | worker |
| `API_PORT` / `WEB_PORT` | integer 1–65535 | `8000` / `5173` | api, web |
| `SCHEDULER_ENABLED` | `0` \| `1` | `0` | worker |
| `LOG_LEVEL` / `NODE_ENV` | enum | `info` / `development` | all |
| `LIMITLESS_API_KEY` | string, optional | — | etl |
| `ANTHROPIC_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | string, optional | — | worker |

Optional variables are `.optional()`: absence is legal and disables the feature. Legacy names are renamed or dropped: `DB_PATH` → `DATABASE_PATH`, `ENABLE_SCHEDULER` → `SCHEDULER_ENABLED`; `TCGDEX_CONCURRENCY` and the `DECKS_*` window constants move to ETL config in [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md); `IMAGE_MODE`, `GROQ_*` and `LOCAL_LLM_*` are not carried over.

**`packages/shared/src/env.ts`**

```ts
export const envSchema: z.ZodObject<…>;
export type Env = z.infer<typeof envSchema>;
export function defaultDataDir(platform?: NodeJS.Platform): string;
export function loadEnv(source?: NodeJS.ProcessEnv, opts?: { repoRoot?: string }): Env;
export function ensureDataDirs(env: Env): void;
export const env: Env;   // memoised loadEnv(process.env)
```

`loadEnv` reads `.env` via `process.loadEnvFile()` when present, applies defaults, coerces numbers and booleans, resolves relative paths against `DATA_DIR`, then runs `assertArtifactPath` on the five artifact variables.

## Implementation steps

1. `git init`; commit `.gitignore`, `.editorconfig`, `.npmrc` (`strict-peer-dependencies=true`) and a `README.md` pointing at `docs/README.md`.
2. Root `package.json` with `private`, `packageManager`, `engines` and the five fan-out scripts; `corepack enable` once on the machine.
3. `pnpm-workspace.yaml` (`apps/*`, `packages/*`); `pnpm install` produces an empty lockfile.
4. `tsconfig.base.json` with the option set above.
5. Create the six members with manifest, tsconfig and an empty `src/index.ts`; `pnpm -r typecheck` green — the first meaningful check.
6. Create `engine/` and `docs/`; add `engine/target/` to `.gitignore` for the case where `CARGO_TARGET_DIR` is unset.
7. Write `env.ts`: schema, `defaultDataDir` (`LOCALAPPDATA` → `XDG_DATA_HOME` → `$HOME/.local/share`), path resolution, `assertArtifactPath`. Add zod as the only dependency of `@pokesearch/shared`.
8. Write `.env.example` from the schema and the test that keeps the two in sync (BR-S01.T01-02).
9. Add `ensureDataDirs()` and `src/env.check.ts`, which prints the resolved paths — the manual "nothing under OneDrive" check.
10. Record the GitHub remote for O-2 once the user answers; push.

## Edge cases and error handling

- **`%LOCALAPPDATA%` unset** (POSIX shell, container, CI) → fall back to `$XDG_DATA_HOME/pokemon2`, then `$HOME/.local/share/pokemon2`; if none resolves, `loadEnv` throws asking for an explicit `DATA_DIR`.
- **`DATABASE_PATH` given as a relative path** → resolved against `DATA_DIR`, not `process.cwd()`, so processes started from different directories open the same file; an absolute path is used as given.
- **An artifact variable points inside the repo or OneDrive** → startup fails with `EnvPathError: DATABASE_PATH resolves to <path>, which is inside the repository (D-005)`. No "warn and continue": a half-synced WAL file is worse than a failed start.
- **`.env` absent** → every default applies and the workspace runs; `.env` is a convenience, never a requirement.
- **`API_PORT=abc`** → `loadEnv` exits non-zero with `API_PORT: expected integer 1–65535, received "abc"`; no socket is bound.
- **OneDrive "Files On-Demand" dehydrates `node_modules`** → `ENOENT`/`EIO` on files that exist in Explorer. Remedy in the root README: mark the folder "Always keep on this device"; if it recurs, apply the D-005 fallback (repo outside OneDrive, GitHub as source of truth).
- **Windows path length** → pnpm's nested store can exceed `MAX_PATH`; `git config core.longpaths true` is part of setup.

## Acceptance / verification

- [ ] `pnpm install` on a fresh clone with no `.env` exits 0, and `pnpm install --frozen-lockfile` then also exits 0 (BR-S01.T01-06).
- [ ] `pnpm -r typecheck` exits 0 over six members; adding `enum X { A }` anywhere fails with TS1294 (BR-S01.T01-03).
- [ ] `node --experimental-strip-types packages/shared/src/env.check.ts` prints the five artifact paths, none containing the repository root or `OneDrive` (BR-S01.T01-01).
- [ ] `pnpm --filter @pokesearch/shared test` runs `env.spec.ts` green: defaults outside the repo, a repo-internal `DATA_DIR` throws, an invalid `API_PORT` is named, `.env.example` matches the schema (BR-S01.T01-01, -02, -04).
- [ ] `pnpm check` exits 0 on the skeleton and non-zero after a deliberate type error in `apps/worker` (BR-S01.T01-05).
- [ ] `git check-ignore -v .env` prints the rule and `git status --porcelain` stays empty after creating a local `.env` (BR-S01.T01-06).
- [ ] `.env.example` lists every variable of the Interfaces table with a default and a one-line purpose.

## Risks and open questions

- **Risk — OneDrive interferes with `node_modules` or git metadata.** Mitigation: artifacts already live outside; the README documents "Always keep on this device"; D-005 names the fallback. Escalate after a second occurrence.
- **Risk — pnpm 12 defaults on Windows differ from those assumed** (linker mode, hoisting). Mitigation: pin `packageManager`, commit `.npmrc`, verify `--frozen-lockfile` in CI ([S01.T10](T10-quality-gates-and-docs-lint.md)).
- **Risk — a dependency ships CJS only or needs a build step**, breaking the no-build premise. Mitigation: server dependencies limited to Fastify, zod and pino; `apps/web` is the only member with a bundler.
- **Question — O-2, the GitHub repository name.** The user decides (recommendation in the decision log: `ManoFardo-PR/pokemon2`). Needed before the first push; blocks nothing else.
- **Question — should `docs/` be a pnpm member** so the docs lint lives there? Decided in [S01.T10](T10-quality-gates-and-docs-lint.md); the current plan keeps the script at the root under `scripts/`.

## References

- `pokemon/pyproject.toml` — verified: the three entry points, `requires-python >= 3.12`, the `sim` extra pinning `ptcg-engine` at commit `92c3cc4`, three pytest markers. Consult for the module→member mapping.
- `pokemon/src/pokesearch/config.py` — verified: every path resolved against `ROOT`; the anti-pattern this subtask reverses.
- `pokemon/.env.example` — verified (names only): `DB_PATH`, `IMAGE_MODE`, `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `LLM_MODEL_*`, `GROQ_*`, `LOCAL_LLM_*`, `ENABLE_SCHEDULER`, `TCGDEX_CONCURRENCY`, `LIMITLESS_API_KEY`, `DECKS_FORMAT|DAYS|MIN_PLAYERS|MAX_TOURNAMENTS`. Consult for what to rename or drop.
- `pokemon/.gitignore` — verified: `.env`, `data/raw/`, `data/*.db*`, `data/reports/` — exclusions that become unnecessary once artifacts live outside the repo.
- External: Node 24 docs on running TypeScript natively (unsupported syntax) and `process.loadEnvFile()`; TypeScript handbook on `erasableSyntaxOnly`, `verbatimModuleSyntax`, `nodenext`.
- [Decision log](../../project/02-decision-log.md) D-005, D-006, D-008, O-2; [Architecture](../../project/03-architecture-overview.md) "Environment layout".

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
