You are a Principal Software Architect and Tech Lead. Your job is to gather every piece of context needed for subtask S02T01 and produce a SELF-CONTAINED MASTER PLAN. The later stages (test writer, implementer, auditor) will NOT read the workspace: everything they need must be inside your plan.

SUBTASK: S02T01
PROJECT: pokemon2
TEST RUNNER: `pnpm test`
TYPE CHECK / COMPILE: `pnpm typecheck`
PROJECT CONVENTIONS (hint from config, may be empty): pnpm monorepo (workspaces apps/* and packages/*). Production code lives in apps/<name>/src and packages/<name>/src; tests are *.spec.ts next to the code they cover (apps/web also uses apps/web/test/). Root Node scripts live in scripts/*.mjs with *.spec.mjs specs. Database migrations live in packages/db/migrations. The Rust engine lives in engine/ptcg-core and engine/ptcg-cli (Cargo workspace at engine/Cargo.toml, created by S04.T01) and is tested through `pnpm engine:test`, never by touching the database.
FILES TO READ FIRST (from the task, may be empty): docs/stages/02-card-data-and-search/T01-etl-cli-and-raw-cache.md
================================================================================
REWORK REQUESTED (round 1 of 2)
================================================================================
A reviewer compared your previous output with this prompt and asked for rework. Review your previous output against the points below, then return the corrected, COMPLETE output (not just the delta), in the required format.

REVIEWER POINTS:
- section 2 path rejected: caminho fora dos prefixos permitidos ['apps', 'packages', 'engine', 'scripts', 'docs']: package.json
- section 2 path rejected: caminho fora dos prefixos permitidos ['apps', 'packages', 'engine', 'scripts', 'docs']: eslint.config.js

YOUR PREVIOUS OUTPUT:
--------------------------------------------------------------------------------
### 1. Objective and Context

- **Goal**: Implement the executable ETL entry point (`packages/etl`) providing a Commander-based CLI (`etl <full|delta|prices|fts|decks|status>`), deterministic raw cache layout with path escape protections under `$RAW_CACHE_DIR`, structured logging (Pino with human and `--json` modes and credential redaction), and execution run bookkeeping writing to SQLite table `etl_runs` (`startRun`, `finishRun`, `withRun`, concurrency lock, and stale run reconciliation).
- **Dependencies on earlier tasks**:
  - `S01.T01`: Environment variables (`RAW_CACHE_DIR`, `DATABASE_PATH`), monorepo structure, and `@pokesearch/shared` (`loadEnv`, `env`, `EnvPathError`).
  - `S01.T04`: Database migrations and client (`@pokesearch/db`), table `etl_runs` (defined in `0001_foundation.sql`), `openDatabase`, `assertSchemaCurrent`, and `SchemaOutdatedError`.
- **Existing Workspace State**:
  - `packages/etl` already exists as a workspace package with `package.json`, `tsconfig.json`, `vitest.config.ts`, and a placeholder `src/index.ts`.
  - Root `package.json` needs an `etl` script: `"etl": "node --no-warnings=ExperimentalWarning packages/etl/src/cli.ts"`.
  - `eslint.config.js` restricts imports: `packages/etl/**` cannot import `node:sqlite` or `better-sqlite3`. We must enforce linting rules preventing HTTP clients (`undici`) or direct card table SQL from being imported in CLI entry points.
  - Table `etl_runs` is migrated via migration `0001_foundation.sql` with schema:
    `id INTEGER PRIMARY KEY, kind TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL DEFAULT 'running', stats_json TEXT NOT NULL DEFAULT '{}', error TEXT, CHECK (status IN ('running', 'ok', 'error', 'cancelled')), CHECK (finished_at IS NULL OR finished_at >= started_at), CHECK ((status = 'running') = (finished_at IS NULL))`. Indexes: `etl_runs_kind_started_idx` on `(kind, started_at DESC)` and `etl_runs_running_idx` on `(started_at) WHERE status = 'running'`.

---

### 2. Target Files

| Path | Role | Action | Purpose |
|---|---|---|---|
| `packages/etl/package.json` | config | patch | Add `commander`, `pino`, `pino-pretty` dependencies, workspace dependencies `@pokesearch/db`, `@pokesearch/shared`, and `bin` entry |
| `package.json` | config | patch | Add root script `"etl": "node --no-warnings=ExperimentalWarning packages/etl/src/cli.ts"` |
| `packages/etl/src/paths.ts` | src | create | Cache directory resolution, path security checks, source path generators, atomic JSON writing |
| `packages/etl/src/paths.spec.ts` | test | create | Unit tests for `paths.ts` path containment, atomic writing, and sub-paths |
| `packages/etl/src/logger.ts` | src | create | Pino logger configuration with human step formatting, `--json` NDJSON mode, and secret redaction |
| `packages/etl/src/logger.spec.ts` | test | create | Unit tests for logging output formats and secret redaction |
| `packages/etl/src/run-log.ts` | src | create | `etl_runs` manager: `startRun`, `finishRun`, `withRun`, `reconcileStaleRuns`, `lastRunPerKind`, concurrency checks |
| `packages/etl/src/run-log.spec.ts` | test | create | Unit tests for run lifecycle, counter aggregation, concurrency conflict (exit 3), stale reconciliation |
| `packages/etl/src/orchestrator.ts` | src | create | Ingestion pipeline step registry and `runLoad()` step sequence orchestrator |
| `packages/etl/src/orchestrator.spec.ts` | test | create | Unit tests verifying strict step execution order and flag filtering (`--skip-tcgdex`) |
| `packages/etl/src/cli.ts` | src | create | Commander CLI application entry point handling subcommands, flags, exit codes (0, 1, 2, 3, 4), and signal handlers |
| `packages/etl/src/cli.spec.ts` | test | create | Integration tests for CLI subcommands, exit code contract, schema check, and bogus command usage |
| `packages/etl/src/index.ts` | src | rewrite | Export public APIs from `paths.ts`, `run-log.ts`, `logger.ts`, and `orchestrator.ts` |
| `packages/etl/README.md` | doc | create | Documentation of CLI subcommands, flags, cache layout, agreed counter metrics, and exit code specifications |
| `eslint.config.js` | config | patch | Add `no-restricted-imports` rule for `packages/etl/src/cli.ts` restricting `undici`, `fetch`, and SQL drivers |

---

### 3. Technical Requirements and Contracts

#### 3.1. Error Classes
```ts
export class CachePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CachePathError";
  }
}

export class ConcurrentRunError extends Error {
  readonly activeRunId: number;
  readonly startedAt: string;
  constructor(kind: string, activeRunId: number, startedAt: string) {
    super(`Another run of kind '${kind}' is currently active (id: ${activeRunId}, started at: ${startedAt}).`);
    this.name = "ConcurrentRunError";
    this.activeRunId = activeRunId;
    this.startedAt = startedAt;
  }
}

export class NotImplementedError extends Error {
  constructor(stepName: string) {
    super(`Step '${stepName}' is not implemented yet.`);
    this.name = "NotImplementedError";
  }
}
```

#### 3.2. Cache Paths Contract (`packages/etl/src/paths.ts`)
```ts
export function cacheRoot(): string;
export function resolveCachePath(...segments: string[]): string;

export const ptcg: {
  setsFile: () => string;
  cardsFile: (setId: string) => string;
  etagsFile: () => string;
};

export const tcgdex: {
  setsFile: () => string;
  setFile: (id: string) => string;
  cardFile: (id: string) => string;
};

export const limitless: {
  tournamentDir: (id: string) => string;
  webList: (id: string) => string;
};

export const reports: {
  file: (name: string) => string;
};

export async function writeJsonAtomic(path: string, value: unknown): Promise<void>;
```

- **Layout Structure**:
  - `cacheRoot()` resolves `$RAW_CACHE_DIR` (from `process.env.RAW_CACHE_DIR` or defaults to `<DATA_DIR>/raw` via `env.RAW_CACHE_DIR`). Ensures directory exists (`fs.mkdirSync(..., { recursive: true })`).
  - `resolveCachePath(...segments)` resolves `path.resolve(cacheRoot(), ...segments)`. Refuses paths that escape `cacheRoot()` (must start with `cacheRoot() + path.sep` or equal `cacheRoot()`) or target inside repository root (via `findRepoRoot()`). Throws `CachePathError`.
  - `ptcg.setsFile()`: `<cacheRoot>/pokemon-tcg-data/sets/en.json`
  - `ptcg.cardsFile(setId)`: `<cacheRoot>/pokemon-tcg-data/cards/en/${setId}.json`
  - `ptcg.etagsFile()`: `<cacheRoot>/pokemon-tcg-data/etags.json`
  - `tcgdex.setsFile()`: `<cacheRoot>/tcgdex/sets.json`
  - `tcgdex.setFile(id)`: `<cacheRoot>/tcgdex/sets/${id}.json`
  - `tcgdex.cardFile(id)`: `<cacheRoot>/tcgdex/cards/${id}.json`
  - `limitless.tournamentDir(id)`: `<cacheRoot>/limitless/tournaments/${id}`
  - `limitless.webList(id)`: `<cacheRoot>/limitless/web/list_${id}.html`
  - `reports.file(name)`: `<cacheRoot>/reports/${name}`
  - `writeJsonAtomic(destPath, value)`: Writes JSON stringified text to a temporary sibling file (`${destPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`), fsyncs, and calls `fs.promises.rename` to replace destination atomically. Cleans up temp file on failure.

#### 3.3. Logging Contract (`packages/etl/src/logger.ts`)
```ts
import type { Logger } from "pino";

export interface LoggerOptions {
  json?: boolean;
  verbose?: boolean;
}

export function createEtlLogger(options?: LoggerOptions): Logger;
export const REDACTED_KEYS: RegExp; // /key|token|secret/i
```
- Human format: `${timestamp} ${LEVEL} ${step ? step + ": " : ""}${message}`.
- JSON mode (`--json`): Outputs NDJSON containing `{ run_id, kind, step, ...counters }`.
- Redaction: Any log object key matching `/key|token|secret/i` is masked with `"[REDACTED]"`.

#### 3.4. Run Log Contract (`packages/etl/src/run-log.ts`)
```ts
import type { Db } from "@pokesearch/db";

export type EtlRunKind = "full" | "delta" | "prices" | "fts" | "decks" | "decks-web" | "seed";

export interface RunHandle {
  readonly id: number;
  readonly kind: EtlRunKind;
  readonly startedAt: string;
  add(patch: Record<string, number | string>): void;
  getStats(): Readonly<Record<string, number | string>>;
}

export interface EtlRunRow {
  id: number;
  kind: EtlRunKind;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error" | "cancelled";
  stats_json: string;
  error: string | null;
}

export const STALE_RUN_MINUTES = 240;

export function startRun(db: Db, kind: EtlRunKind): RunHandle;
export function finishRun(db: Db, run: RunHandle, outcome: { error?: unknown }): void;
export function withRun<T>(db: Db, kind: EtlRunKind, fn: (run: RunHandle) => Promise<T>): Promise<T>;
export function reconcileStaleRuns(db: Db, staleMinutes?: number): number;
export function lastRunPerKind(db: Db, kind?: EtlRunKind): EtlRunRow[];
```

- **Agreed Counter Names**: `sets`, `sets_changed`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `unmatched_sets`, `unmatched_cards`, `http_requests`, `http_304`, `cache_hits`, `price_rows`, `fts_rows`, `duration_ms`.
- `run.add(patch)`: Validates that every value in `patch` is a scalar (`number` or `string`). Throws `TypeError` on non-scalar objects or arrays. Merges into an in-memory dictionary.
- `startRun`: Executes inside `db.transaction(..., "immediate")`:
  1. Checks for any active running row:
     `SELECT id, started_at FROM etl_runs WHERE kind = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`.
  2. If found, checks if `(now - started_at) < STALE_RUN_MINUTES * 60 * 1000`. If still fresh, throws `ConcurrentRunError(kind, id, started_at)`.
  3. Inserts: `INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}') RETURNING id`.
- `finishRun`: Updates the row:
  - If `error` is present: `status = 'error'`, `error = error.message || String(error)`, `finished_at = now`, `stats_json = JSON.stringify(run.getStats())`. Must never store empty `{}` if counters exist.
  - If success: `status = 'ok'`, `finished_at = now`, `stats_json = JSON.stringify(run.getStats())`.
- `reconcileStaleRuns`: Runs at startup:
  `UPDATE etl_runs SET status = 'cancelled', finished_at = ? WHERE status = 'running' AND started_at <= ?`.
  Threshold calculated as `new Date(Date.now() - staleMinutes * 60 * 1000).toISOString()`. Returns number of updated rows.
- `lastRunPerKind`: Queries `SELECT * FROM etl_runs WHERE id IN (SELECT MAX(id) FROM etl_runs GROUP BY kind) ORDER BY kind ASC` or filtered by `WHERE kind = ? ORDER BY started_at DESC LIMIT 1`.

#### 3.5. Pipeline Orchestrator Contract (`packages/etl/src/orchestrator.ts`)
```ts
import type { RunHandle } from "./run-log.js";
import type { Db } from "@pokesearch/db";

export interface LoadOptions {
  sets?: string[];
  force?: boolean;
  skipTcgdex?: boolean;
  concurrency?: number;
  verbose?: boolean;
}

export interface PipelineStep {
  name: string;
  execute: (ctx: StepContext) => Promise<void>;
}

export interface StepContext {
  db: Db;
  run: RunHandle;
  options: LoadOptions;
}

export interface StepRegistry {
  fetchPtcg: PipelineStep;
  fetchTcgdex: PipelineStep;
  mapIds: PipelineStep;
  loadCards: PipelineStep;
  rebuildFts: PipelineStep;
  snapshotPrices: PipelineStep;
  [key: string]: PipelineStep;
}

export const defaultStepRegistry: StepRegistry;
export function runLoad(
  db: Db,
  run: RunHandle,
  options: LoadOptions,
  registry?: Partial<StepRegistry>
): Promise<void>;
```
- **Order of Execution** (`runLoad`):
  1. `fetch-ptcg` (`registry.fetchPtcg`)
  2. `fetch-tcgdex` (`registry.fetchTcgdex`) — omitted if `options.skipTcgdex === true`
  3. `map-ids` (`registry.mapIds`)
  4. `load-cards` (`registry.loadCards`)
  5. `rebuild-fts` (`registry.rebuildFts`)
  6. `snapshot-prices` (`registry.snapshotPrices`) — omitted if `options.skipTcgdex === true`
- If registry steps are not provided, default stubs throw `NotImplementedError(stepName)`.

#### 3.6. CLI Contract and Exit Codes (`packages/etl/src/cli.ts`)
- **CLI Commands**:
  - `etl full [--sets <id,...>] [--force] [--skip-tcgdex] [--concurrency <n>] [--json] [--verbose]`
  - `etl delta [--skip-tcgdex] [--json]`
  - `etl prices [--no-refresh] [--date <YYYY-MM-DD>] [--json]`
  - `etl fts [--json]`
  - `etl decks [--web] [--skip-api] [--days <n>] [--min-players <n>] [--max-tournaments <n>] [--refresh-recent-days <n>] [--prune-days <n>] [--force] [--json]`
  - `etl status [--kind <kind>] [--json]`
- **Global Options**:
  - `--db <path>` (default: `process.env.DATABASE_PATH` or `env.DATABASE_PATH`)
  - `--cache <dir>` (default: `process.env.RAW_CACHE_DIR` or `env.RAW_CACHE_DIR`)
- **Exit Codes**:
  - `0`: Success (`etl_runs.status = 'ok'`).
  - `1`: Run failed (`etl_runs.status = 'error'`).
  - `2`: Usage error (Commander unknown option/argument or missing required flags).
  - `3`: Concurrency conflict (another active run of the same kind found within `STALE_RUN_MINUTES`).
  - `4`: Database schema outdated (`assertSchemaCurrent` threw `SchemaOutdatedError`).
- **Initialization sequence for subcommands**:
  1. Parse CLI options using `commander`.
  2. Open database via `openDatabase(dbPath)`.
  3. Bootstrap / schema verification via `assertSchemaCurrent(db)`. If `SchemaOutdatedError` caught, print error message instructing user to run `pnpm db:migrate` and exit with code 4 immediately without creating an `etl_runs` row.
  4. Call `reconcileStaleRuns(db)`.
  5. Execute command wrapped in `withRun(db, kind, async (run) => { ... })`.
  6. On `SIGINT`, set a 2-second timeout, update active `etl_runs` status to `cancelled`, and exit.

#### 3.7. Business Rules
- **BR-S02.T01-01**: Every subcommand invocation writes exactly one `etl_runs` row, inserted with `status='running'` before any network or file work and closed to `ok` or `error` before the process exits.
- **BR-S02.T01-02**: A run ending in `error` stores the error message in `etl_runs.error` and partial counters in `stats_json`; never stores empty `{}` when counters have been recorded.
- **BR-S02.T01-03**: Every cache path resolves under `RAW_CACHE_DIR`; a path that escapes it (via `..`, absolute paths outside, or inside repo root) throws `CachePathError` before writing.
- **BR-S02.T01-04**: `etl full` and `etl delta` run steps in exact sequence: `fetch-ptcg` -> `fetch-tcgdex` -> `map-ids` -> `load-cards` -> `rebuild-fts` -> `snapshot-prices`. `--skip-tcgdex` skips only `fetch-tcgdex` and `snapshot-prices`.
- **BR-S02.T01-05**: At most one run of a given `kind` is active within `STALE_RUN_MINUTES`; starting a second concurrently exits with code 3 without touching the cache.
- **BR-S02.T01-06**: Stale rows left `running` for longer than `STALE_RUN_MINUTES` (240 min) are marked `cancelled` upon CLI startup by `reconcileStaleRuns()`, never deleted.
- **BR-S02.T01-07**: Subcommand entry files contain no HTTP network fetchers, card table SQL statements, or data transformations; only injected steps and run counter aggregation.
- **BR-S02.T01-08**: The CLI exits 0 if and only if `etl_runs.status === 'ok'`, and exits non-zero (1, 3, or 4) on error.

---

### 4. Test Scenarios (RED phase)

#### 4.1. Cache Paths (`packages/etl/src/paths.spec.ts`)
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cacheRoot, resolveCachePath, ptcg, tcgdex, limitless, reports, writeJsonAtomic, CachePathError } from "./paths.js";
```
- `resolveCachePath` throws `CachePathError` when given path traversal `../outside.json`.
- `resolveCachePath` throws `CachePathError` when given an absolute path outside `RAW_CACHE_DIR`.
- `resolveCachePath` throws `CachePathError` when target resolves inside repository root.
- `cacheRoot` returns normalized directory and creates it if not existent.
- `ptcg.setsFile()` returns path ending with `pokemon-tcg-data/sets/en.json` under `RAW_CACHE_DIR`.
- `ptcg.cardsFile("sv3pt5")` returns path ending with `pokemon-tcg-data/cards/en/sv3pt5.json`.
- `ptcg.etagsFile()` returns path ending with `pokemon-tcg-data/etags.json`.
- `tcgdex.setsFile()` returns path ending with `tcgdex/sets.json`.
- `tcgdex.setFile("sv03.5")` returns path ending with `tcgdex/sets/sv03.5.json`.
- `tcgdex.cardFile("sv03.5-001")` returns path ending with `tcgdex/cards/sv03.5-001.json`.
- `limitless.tournamentDir("T123")` returns path ending with `limitless/tournaments/T123`.
- `limitless.webList("L456")` returns path ending with `limitless/web/list_L456.html`.
- `reports.file("idmap_unmatched_cards.csv")` returns path ending with `reports/idmap_unmatched_cards.csv`.
- `writeJsonAtomic` writes JSON cleanly and replaces file atomically.
- `writeJsonAtomic` cleans up temporary files on write error.

#### 4.2. Run Log Bookkeeping (`packages/etl/src/run-log.spec.ts`)
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { withTempDb } from "@pokesearch/db/testing";
import { migrate } from "@pokesearch/db";
import { startRun, finishRun, withRun, reconcileStaleRuns, lastRunPerKind, STALE_RUN_MINUTES, ConcurrentRunError } from "./run-log.js";
```
- Successful `withRun` inserts one row with `status='running'`, finishes with `status='ok'` and duration counter.
- Failed `withRun` records `status='error'`, records error message in `etl_runs.error`, and retains partial counters in `stats_json`.
- `RunHandle.add` throws `TypeError` when given nested object or non-scalar value.
- Starting a second run of the same kind while first is running throws `ConcurrentRunError` (BR-S02.T01-05).
- Starting a run of a different kind (e.g., `prices` during `decks`) succeeds concurrently.
- `reconcileStaleRuns` updates rows older than `STALE_RUN_MINUTES` to `status='cancelled'`, preserving finished_at timestamp, and does not touch recent running rows.
- `lastRunPerKind` returns latest record for each distinct kind.

#### 4.3. Pipeline Orchestrator (`packages/etl/src/orchestrator.spec.ts`)
```ts
import { describe, it, expect } from "vitest";
import { runLoad, NotImplementedError } from "./orchestrator.js";
```
- `runLoad` invokes steps in exact order: `fetch-ptcg, fetch-tcgdex, map-ids, load-cards, rebuild-fts, snapshot-prices`.
- `runLoad` with `--skip-tcgdex` executes `fetch-ptcg, map-ids, load-cards, rebuild-fts` and skips `fetch-tcgdex` and `snapshot-prices`.
- `runLoad` throws `NotImplementedError` when default stub steps are invoked.

#### 4.4. Logger (`packages/etl/src/logger.spec.ts`)
```ts
import { describe, it, expect } from "vitest";
import { createEtlLogger, REDACTED_KEYS } from "./logger.js";
```
- Redacts sensitive keys matching `/key|token|secret/i` (`LIMITLESS_API_KEY`, `secret_token`, `apiKey`).
- Formats log outputs correctly in JSON NDJSON mode.

#### 4.5. CLI Integration & Exit Codes (`packages/etl/src/cli.spec.ts`)
```ts
import { describe, it, expect } from "vitest";
```
- `etl status` on freshly migrated database outputs `no runs` and exits with code 0.
- `etl bogus` exits with code 2 and displays usage help.
- `etl full --nope` exits with code 2.
- Running CLI against a database that is behind migrations exits with code 4, outputs `pnpm db:migrate` instruction, and inserts no row into `etl_runs`.
- Concurrent run of the same kind exits with code 3.
- Failed run exits with code 1, and `etl_runs.status` is `'error'`.

---

### 5. Architecture and Coding Constraints

- **Language & Runtime**: Node.js >= 24.13 with ESM (`"type": "module"`).
- **Workspace Architecture**: `packages/etl` depends only on `@pokesearch/db` and `@pokesearch/shared`.
- **Database Access Restriction**: `packages/etl` must never import `node:sqlite` or `better-sqlite3` directly (enforced by `eslint.config.js`). It must interact with the database exclusively via `@pokesearch/db` (`openDatabase`, `assertSchemaCurrent`, `migrate`, `Db`).
- **Network / SQL Segregation (BR-S02.T01-07)**: `packages/etl/src/cli.ts` must contain no HTTP clients (`undici`, `fetch`) and no SQL queries touching card, set, deck, or price tables. The CLI is strictly an orchestrator.
- **Cache Path Invariant (D-005 & BR-S02.T01-03)**: `RAW_CACHE_DIR` must never resolve inside OneDrive and must never resolve inside the repository. Path containment must be verified before any write.
- **Process Signals**: Intercept `SIGINT` (Ctrl+C); attempt graceful cancellation of active `etl_runs` within a strict 2-second timeout before exiting.

---

### 6. Existing Code This Task Depends On

#### 6.1. `@pokesearch/db` (`packages/db/src/client.ts`)
```ts
export type SqlValue = null | number | bigint | string | Uint8Array;
export type Params = readonly SqlValue[] | Readonly<Record<string, SqlValue>>;

export interface Db {
  readonly path: string;
  readonly isReadonly: boolean;
  run(sql: string, params?: Params): { changes: number; lastInsertRowid: number | bigint };
  get<T>(sql: string, params?: Params): T | undefined;
  all<T>(sql: string, params?: Params): T[];
  exec(sql: string): void;
  transaction<T>(fn: (tx: Db) => T, mode?: "deferred" | "immediate"): T;
  close(): void;
}

export function openDatabase(path: string, opts?: OpenOptions): Db;
```

#### 6.2. `@pokesearch/db/migrate` (`packages/db/src/migrate.ts`)
```ts
export class SchemaOutdatedError extends Error {
  applied: number;
  expected: number;
}
export function assertSchemaCurrent(db: Db, dir?: string): void;
export function migrate(db: Db, opts?: MigrateOptions): MigrateResult;
```

#### 6.3. `@pokesearch/db/testing` (`packages/db/src/testing/index.ts`)
```ts
export interface TempDbInfo {
  db: Db;
  path: string;
  dir: string;
  schemaApplied: boolean;
}
export function withTempDb<T>(fn: (info: TempDbInfo) => T, opts?: TempDbOptions): T;
export function withTempDbAsync<T>(fn: (info: TempDbInfo) => Promise<T>, opts?: TempDbOptions): Promise<T>;
```

#### 6.4. `@pokesearch/shared/env` (`packages/shared/src/env.ts`)
```ts
export class EnvPathError extends Error {
  readonly variable: string;
  readonly resolvedPath: string;
}
export function findRepoRoot(startDir?: string): string;
export function defaultDataDir(platform?: NodeJS.Platform): string;
export function assertArtifactPath(variable: string, targetPath: string, repoRoot: string): void;
export const env: Env;
```

#### 6.5. Database Schema: `etl_runs` Table (`packages/db/migrations/0001_foundation.sql`)
```sql
CREATE TABLE etl_runs (
    id          INTEGER PRIMARY KEY,
    kind        TEXT    NOT NULL,
    started_at  TEXT    NOT NULL,
    finished_at TEXT,
    status      TEXT    NOT NULL DEFAULT 'running',
    stats_json  TEXT    NOT NULL DEFAULT '{}',
    error       TEXT,
    CHECK (status IN ('running', 'ok', 'error', 'cancelled')),
    CHECK (finished_at IS NULL OR finished_at >= started_at),
    CHECK ((status = 'running') = (finished_at IS NULL))
);

CREATE INDEX etl_runs_kind_started_idx ON etl_runs (kind, started_at DESC);
CREATE INDEX etl_runs_running_idx      ON etl_runs (started_at) WHERE status = 'running';
```
--------------------------------------------------------------------------------
================================================================================

RULES:
1. The full specification of the subtask is at the end of this prompt (SPECIFICATION section). Do NOT look for a specification file on disk.
2. You MAY read files in the workspace (read-only tools) to learn what already exists: modules produced by earlier tasks, project layout, conventions. Start with FILES TO READ FIRST when given. Do not write or edit anything.
3. Decide where every file goes based on what you read in the project and on the specification. Use paths relative to the repository root. Do not invent a layout that contradicts the existing project.
4. If the specification provides interfaces or test scenarios, copy them exactly; do not reinterpret them. Do not add requirements that are not in the specification. If something is ambiguous, choose the simplest interpretation and record it in section 5.
5. Section 6 must contain the exact signatures (and short relevant excerpts) of every existing function, class or module that this task will call, extend or must stay compatible with. Later stages depend on this section instead of reading files.

OUTPUT FORMAT (mandatory: exactly these six sections, in this order, with these exact headings):

### 1. Objective and Context
[goal, dependencies on earlier tasks, what already exists in the workspace]

### 2. Target Files
A markdown table with one row per file to create or modify. Columns: Path | Role | Action | Purpose.
- Role is one of: test, src, config, doc
- Action is one of: create (new file), patch (edit an existing file with exact search/replace edits), rewrite (replace an existing file entirely; use only when a patch would be impractical)
Example:
| Path | Role | Action | Purpose |
|---|---|---|---|
| path/to/module.py | src | create | implements X |
| path/to/test_module.py | test | create | tests for X |

### 3. Technical Requirements and Contracts
[exact function/class signatures (name, parameters, types, return), numbered business rules (BR-...), error handling, edge cases]

### 4. Test Scenarios (RED phase)
[complete list of assertions the tests must cover, including edge cases; one line per assertion; include the exact import statement the tests must use]

### 5. Architecture and Coding Constraints
[language and runtime constraints, allowed dependencies, naming conventions, assumptions made]

### 6. Existing Code This Task Depends On
[for each existing file the implementation relies on: path, exact signatures, and short excerpts needed to use it correctly; write "None" if the task depends on nothing]

================================================================================
SPECIFICATION (source of truth for this subtask):
================================================================================
# [S02T01] S02T01 — ETL CLI, raw cache layout and run log

# S02T01 — ETL CLI, raw cache layout and run log

| Campo | Valor |
|---|---|
| Estágio | S02 — Card data and search |
| ID Tarefa | S02T01 |
| Depende de | Nenhuma |
| Desbloqueia | S02T02, S02T03 |
| Ordem de lançamento | 1 |
| Depende de (outros estágios) | S01T01, S01T04 |
| Desbloqueia (outros estágios) | S03T02, S03T03, S08T02 |
| Especificação | `docs/stages/02-card-data-and-search/T01-etl-cli-and-raw-cache.md` |

<!-- depends_on: Nenhuma -->
<!-- seq: 1 -->

## 🎯 Objetivo
One executable entry point for every ingestion job, with a predictable on-disk cache (so a full reload can run offline) and a database log of every run's statistics and errors.

## 🔍 Contexto
### Context

D-003 rebuilds the whole ingestion pipeline in TypeScript from the public sources. Six later subtasks in this stage and four in S03 are *fetchers and loaders*; this one is the frame they plug into. Writing it first means every fetcher inherits the same cache root, the same logging, the same run bookkeeping and the same exit-code contract, instead of each inventing them.

The legacy CLI is the shape reference. `pokemon/src/pokesearch/etl/run.py` is a 149-line `argparse` program with subcommands `full`, `delta`, `prices`, `fts`, `seed-wjsutton` and `decks`, and a `run_load()` that fixes the order inside a full load: download pokemon-tcg-data → read the set list → fetch the TCGdex set list → per set (fetch canonical cards, resolve the TCGdex set id, match cards, fetch the matched TCGdex cards, `load_set`) → `rebuild_fts` → write `last_load` → write the two unmatched CSVs → `prices.snapshot_from_cache`. That order is kept because it is correct: FTS needs loaded rows and the price snapshot needs `cards.tcgdex_id`.

Two things are added. First, **a run log**: the legacy recorded a single `etl_meta.last_load` string, so a failed nightly run was invisible and nothing could be alerted on. [S01.T04](../01-foundation/T04-database-migration-framework.md) already ships `etl_runs(id, kind, started_at, finished_at, status, stats_json, error)` with `CHECK (status IN ('running','ok','error','cancelled'))` and `CHECK ((status = 'running') = (finished_at IS NULL))`; this subtask is its only writer, and [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) its only reader for alerting. Second, **a cache outside the repository**: the legacy resolved `RAW_DIR` against the repo root, which under D-005 would put tens of thousands of small JSON files inside OneDrive; here everything hangs off `RAW_CACHE_DIR` (default `$DATA_DIR/raw`).

### Scope

- **In scope.** `packages/etl` as a workspace member with a `bin` entry; the commander program, its flags and exit codes; `etl/paths.ts` (cache-root resolution and per-source path helpers); `etl/run-log.ts`; `etl/logger.ts` (pino, human and `--json` modes); `etl status`; the reconciliation of stale `running` rows; the orchestration order of `etl full` / `etl delta` with the fetcher and loader modules injected.
- **Out of scope.** Every fetcher and loader body ([S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md), [S02.T06](T06-load-cards.md), [S02.T07](T07-prices-snapshot.md), [S02.T08](T08-full-text-search.md), [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md)–[S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md)); id mapping ([S02.T04](T04-set-and-card-id-mapping.md)); running the ETL on a schedule ([S08.T01](../08-operations-and-extensions/T01-scheduler.md)); alerting on the rows written here ([S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)).

### Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` to this subtask. Architecture principle 2 — the etl writes baseline tables only — is first enforced here, by the fact that the only table this module writes is `etl_runs`.

### Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `etl_runs` | C | etl | first statement of every subcommand | insert-only; `status='running'`, `finished_at NULL`, `stats_json='{}'` | id is the run handle passed to every step |
| `etl_runs` | U | etl | when a subcommand returns or throws | one update per run, sets `finished_at`, `status`, `stats_json`, `error`; a closed row is never updated again | `CHECK ((status='running') = (finished_at IS NULL))` from 0001 makes a half-write fail loudly |
| `etl_runs` | U | etl | CLI start, for rows older than `STALE_RUN_MINUTES` | `status='cancelled'`, `finished_at = now`; no-op when nothing is stale | recovers from a killed process |
| `etl_runs` | R | etl (`etl status`), api, [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) | on demand | read-only; last row per `kind` via `etl_runs_kind_started_idx` | `--json` prints the rows verbatim |
| `$RAW_CACHE_DIR/<source>/…` | C/U | etl (the fetcher modules, through `paths.ts`) | during fetch steps | directory created on demand; write is atomic (temp file + rename); path must stay under the cache root | contents owned by [S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md), [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md) |
| `$RAW_CACHE_DIR/reports/*.csv` | C | etl | end of a load or a deck sync | overwritten per run; header row always written even when empty | consumed by a human and by [S02.T04](T04-set-and-card-id-mapping.md)'s acceptance |
| card/set/price/deck tables | — | — | — | not written here | this subtask owns no baseline table |

### Interfaces

**CLI.** `pnpm etl <command>` → `node --no-warnings=ExperimentalWarning packages/etl/src/cli.ts`.

```
etl full     [--sets <id,…>] [--force] [--skip-tcgdex] [--concurrency <n>] [--json] [--verbose]
etl delta    [--skip-tcgdex] [--json]
etl prices   [--no-refresh] [--date <YYYY-MM-DD>] [--json]
etl fts      [--json]
etl decks    [--web] [--skip-api] [--days <n>] [--min-players <n>] [--max-tournaments <n>]
             [--refresh-recent-days <n>] [--prune-days <n>] [--force] [--json]
etl status   [--kind <kind>] [--json]
```

Global: `--db <path>` (default `$DATABASE_PATH`), `--cache <dir>` (default `$RAW_CACHE_DIR`). Exit codes: `0` ok · `1` run failed (`etl_runs.status='error'`) · `2` usage error (unknown command or flag; commander prints help) · `3` another run of the same kind is active · `4` the database schema is behind (`assertSchemaCurrent` threw; the message names `pnpm db:migrate`).

**`packages/etl/src/run-log.ts`**

```ts
export type EtlRunKind = "full" | "delta" | "prices" | "fts" | "decks" | "decks-web" | "seed";
export interface RunHandle { id: number; kind: EtlRunKind; startedAt: string; add(patch: Record<string, number | string>): void; }
export function startRun(db: Db, kind: EtlRunKind): RunHandle;            // throws ConcurrentRunError (exit 3)
export function finishRun(db: Db, run: RunHandle, outcome: { error?: unknown }): void;
export function withRun<T>(db: Db, kind: EtlRunKind, fn: (run: RunHandle) => Promise<T>): Promise<T>;
export function reconcileStaleRuns(db: Db, staleMinutes?: number): number; // default STALE_RUN_MINUTES = 240
export function lastRunPerKind(db: Db): EtlRunRow[];
export const STALE_RUN_MINUTES = 240;
```

`run.add({ sets: 174 })` accumulates into an in-memory object that `finishRun` serialises into `stats_json`. Agreed counter names, so [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) can chart them without parsing prose: `sets`, `sets_changed`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`, `unmatched_sets`, `unmatched_cards`, `http_requests`, `http_304`, `cache_hits`, `price_rows`, `fts_rows`, `duration_ms`.

**`packages/etl/src/paths.ts`**

```ts
export function cacheRoot(): string;                       // $RAW_CACHE_DIR, created on demand
export function resolveCachePath(...segments: string[]): string;   // throws CachePathError when it escapes the root
export const ptcg = { setsFile: () => …, cardsFile: (setId: string) => …, etagsFile: () => … };
export const tcgdex = { setsFile: () => …, setFile: (id: string) => …, cardFile: (id: string) => … };
export const limitless = { tournamentDir: (id: string) => …, webList: (id: string) => … };
export const reports = { file: (name: string) => … };
export async function writeJsonAtomic(path: string, value: unknown): Promise<void>;  // temp + rename
```

**Cache layout** (paths are exactly what the fetchers use):

```
$RAW_CACHE_DIR/
  pokemon-tcg-data/ sets/en.json · cards/en/<ptcgSetId>.json · etags.json
  tcgdex/           sets.json · sets/<tcgdexSetId>.json · cards/<tcgdexCardId>.json
  limitless/        tournaments/<id>/{tournament.json,standings.json,decks.json} · web/list_<id>.html
  reports/          idmap_unmatched_sets.csv · idmap_unmatched_cards.csv · decks_unresolved.csv
```

**Logging.** pino; default human output `HH:mm:ss LEVEL step: message` with a per-step progress line; `--json` emits one NDJSON object per event with `{ run_id, kind, step, ...counters }`. No secret is ever logged: the logger redacts any field whose name matches `/key|token|secret/i` (only `LIMITLESS_API_KEY` exists today).

### Implementation steps

1. Add `packages/etl` to the workspace with a `bin` entry, a `test` script and dependencies on `@pokesearch/db` and `@pokesearch/shared` only; an empty CLI prints help and exits 2.
2. Write `paths.ts` with `cacheRoot`, `resolveCachePath`, the four per-source helpers and `writeJsonAtomic`; spec the escape check (BR-S02.T01-03).
3. Write `logger.ts` (human + `--json`, redaction) and wire `--verbose`.
4. Write `run-log.ts`: `startRun`/`finishRun`/`withRun`, the concurrency guard and `reconcileStaleRuns`; spec all three rules (BR-S02.T01-01, -02, -05, -06).
5. Add `etl status` reading `lastRunPerKind`, printing a table or JSON; on an empty database it prints `no runs` and exits 0.
6. Add the database bootstrap shared by all subcommands: open through `openDatabase`, call `assertSchemaCurrent`, map `SchemaOutdatedError` to exit 4.
7. Register the six subcommands with commander, each wrapped in `withRun`, each calling a step module resolved through an injectable registry (stubs that throw `NotImplemented` until their subtask lands).
8. Write `runLoad()` with the ordered step array and the `--sets`/`--force`/`--skip-tcgdex`/`delta` variations; spec the order with stub modules (BR-S02.T01-04).
9. Add the exit-code mapping and the `no-restricted-imports` lint rule for `cli.ts` (BR-S02.T01-07, -08).
10. Document the commands and the cache layout in `packages/etl/README.md`, and add the counter-name list so later fetchers use the agreed names.

### Edge cases and error handling

- **The process is killed mid-run (Ctrl-C, reboot).** The row stays `running`. The next CLI start reconciles it to `cancelled` after `STALE_RUN_MINUTES`; a `SIGINT` handler tries to close it as `cancelled` immediately, but never blocks the exit for more than 2 s.
- **A second `etl full` starts while the first is running.** `startRun` sees the live row inside its `BEGIN IMMEDIATE` and exits 3 with the first run's id and start time; nothing in the cache is touched. Different kinds (`prices` during `decks`) are allowed — they write different tables.
- **The database is behind the migrations.** `assertSchemaCurrent` throws before any fetch; the CLI exits 4 telling the user to run `pnpm db:migrate`. No `etl_runs` row is written, because the table may not exist yet.
- **`RAW_CACHE_DIR` does not exist or is not writable.** It is created on demand with `recursive: true`; an `EACCES`/`EROFS` fails the run with `status='error'` and a message naming the resolved path, because a silent fallback to the repository would put 53 MB of TCGdex JSON inside OneDrive.
- **`--sets sv99` names a set that does not exist.** The run proceeds over the zero matching sets, `stats_json.sets = 0`, status `ok`, and a warning line lists the unknown ids — an empty selection is a user error, not a pipeline failure.
- **A step module is not implemented yet.** The registry stub throws `NotImplemented`; the run closes as `error` with that message, so a half-built pipeline is visible in `etl status` instead of silently succeeding.
- **Disk fills during a fetch.** `writeJsonAtomic` removes its temp file, the error propagates, the run closes as `error`; the cache keeps only complete files, so the next run re-fetches exactly what is missing.
- **`stats_json` grows unbounded** (e.g. a step tries to store per-set detail). Only flat scalar counters are accepted; `run.add` throws on a non-scalar value, keeping the column small enough to read in a terminal.

### Risks and open questions

- **Risk — the run log becomes a job queue.** `etl_runs` is a log, not a queue; the worker's `jobs` table ([S04.T14](../04-game-engine-core/T14-jobs-schema-migration.md)) is the queue. Mitigation: no `status='queued'` value exists in the 0001 `CHECK`, so the mistake cannot compile.
- **Risk — the concurrency guard is advisory only.** Two CLIs started in the same millisecond both pass if the `BEGIN IMMEDIATE` is not respected. Mitigation: the check and the insert share one immediate transaction (BR-S02.T01-05); the worst case is two runs writing the same idempotent upserts.
- **Risk — `--force` on `etl full` re-downloads ~20k TCGdex documents** (30–60 min, legacy measurement). Mitigation: `--force` prints the estimate and the request count before starting; [S02.T07](T07-prices-snapshot.md) owns the routine refresh path, which is the one the scheduler uses.
- **Question — should `etl` be a `pnpm` script or a globally linked binary?** Recommendation: a workspace script (`pnpm etl …`), so no global state exists on the machine; revisit only if [S08.T01](../08-operations-and-extensions/T01-scheduler.md) needs a path-stable executable for Task Scheduler. The user decides during S08.T01.
- **Question — is `decks-web` a separate `kind` or a flag on `decks`?** The `CHECK` in 0001 already allows both values. Recommendation: one `decks` run with `web: true` in `stats_json`, so the monitoring page has one series. Confirm with [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) before its first run.

### References

- `pokemon/src/pokesearch/etl/run.py` — verified: `argparse` with `full`/`delta`/`prices`/`fts`/`seed-wjsutton`/`decks`; `run_load()` fixes the step order and writes the two unmatched CSVs before calling `prices.snapshot_from_cache(conn)`; `--skip-tcgdex`, `--sets`, `--force` flags. Consult for the order and the flag names, not for the structure.
- `pokemon/src/pokesearch/config.py` — verified: `RAW_DIR = ROOT / "data" / "raw"` with `PTCG_RAW_DIR`, `TCGDEX_RAW_DIR`, `REPORTS_DIR`, `LIMITLESS_RAW_DIR` under it; `TCGDEX_CONCURRENCY = 8`; `PTCG_RAW_BASE`, `TCGDEX_API_BASE`. Consult for the cache sub-tree names this subtask reuses and for what "resolved against the repository root" costs.
- [S01.T04](../01-foundation/T04-database-migration-framework.md) — the `etl_runs` DDL, its `CHECK` constraints and `etl_runs_running_idx`; `assertSchemaCurrent` and `SchemaOutdatedError`.
- [S01.T02](../01-foundation/T02-sqlite-database-client.md) — `openDatabase`, `transaction(fn, "immediate")`, and the `--no-warnings=ExperimentalWarning` rule every entry point follows.
- [Architecture](../../project/03-architecture-overview.md) — the environment table (`DATA_DIR`, `RAW_CACHE_DIR`) and principle 2 (who writes what).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)

## 📥 Entradas (Inputs)
- `env` `RAW_CACHE_DIR`, `DATABASE_PATH` — from [S01.T01](../01-foundation/T01-monorepo-skeleton.md)
- `module` `@pokesearch/db/migrate` and `table etl_runs` — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `file` `pokemon/src/pokesearch/etl/run.py` and `config.py` — the legacy subcommand set, the fixed order inside a full load and the source constants; read-only reference

## 📤 Saídas Esperadas (Outputs)
- `module` `packages/etl` CLI `etl <full|delta|prices|fts|decks|status> [--sets id,…] [--force] [--skip-tcgdex] [--web]` (commander), structured logging, exit codes — consumed by [S02.T02](T02-fetch-pokemon-tcg-data.md), [S02.T03](T03-fetch-tcgdex.md), [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)
- `file` cache layout under `RAW_CACHE_DIR`: `pokemon-tcg-data/` (+ `etags.json`), `tcgdex/{sets.json, sets/<id>.json, cards/<id>.json}`, `limitless/{tournaments/<id>/…, web/list_<id>.html}`, `reports/*.csv`
- `module` `etl/run-log.ts` — `startRun(kind)` / `finishRun(id, stats | error)` writing `etl_runs`; `etl status` prints the last run per kind — consumed by [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md), [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md)

## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)
```
etl full     [--sets <id,…>] [--force] [--skip-tcgdex] [--concurrency <n>] [--json] [--verbose]
etl delta    [--skip-tcgdex] [--json]
etl prices   [--no-refresh] [--date <YYYY-MM-DD>] [--json]
etl fts      [--json]
etl decks    [--web] [--skip-api] [--days <n>] [--min-players <n>] [--max-tournaments <n>]
             [--refresh-recent-days <n>] [--prune-days <n>] [--force] [--json]
etl status   [--kind <kind>] [--json]
```

```
export type EtlRunKind = "full" | "delta" | "prices" | "fts" | "decks" | "decks-web" | "seed";
export interface RunHandle { id: number; kind: EtlRunKind; startedAt: string; add(patch: Record<string, number | string>): void; }
export function startRun(db: Db, kind: EtlRunKind): RunHandle;            // throws ConcurrentRunError (exit 3)
export function finishRun(db: Db, run: RunHandle, outcome: { error?: unknown }): void;
export function withRun<T>(db: Db, kind: EtlRunKind, fn: (run: RunHandle) => Promise<T>): Promise<T>;
export function reconcileStaleRuns(db: Db, staleMinutes?: number): number; // default STALE_RUN_MINUTES = 240
export function lastRunPerKind(db: Db): EtlRunRow[];
export const STALE_RUN_MINUTES = 240;
```

```
export function cacheRoot(): string;                       // $RAW_CACHE_DIR, created on demand
export function resolveCachePath(...segments: string[]): string;   // throws CachePathError when it escapes the root
export const ptcg = { setsFile: () => …, cardsFile: (setId: string) => …, etagsFile: () => … };
export const tcgdex = { setsFile: () => …, setFile: (id: string) => …, cardFile: (id: string) => … };
export const limitless = { tournamentDir: (id: string) => …, webList: (id: string) => … };
export const reports = { file: (name: string) => … };
export async function writeJsonAtomic(path: string, value: unknown): Promise<void>;  // temp + rename
```

```
$RAW_CACHE_DIR/
  pokemon-tcg-data/ sets/en.json · cards/en/<ptcgSetId>.json · etags.json
  tcgdex/           sets.json · sets/<tcgdexSetId>.json · cards/<tcgdexCardId>.json
  limitless/        tournaments/<id>/{tournament.json,standings.json,decks.json} · web/list_<id>.html
  reports/          idmap_unmatched_sets.csv · idmap_unmatched_cards.csv · decks_unresolved.csv
```

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-S02.T01-01 | Every subcommand invocation writes exactly one `etl_runs` row, inserted with `status='running'` before any network or file work and closed to `ok` or `error` before the process exits. — Enforcement: `withRun(kind, fn)` wrapper in `etl/run-log.ts`; every subcommand body is its `fn` — Verification: `run-log.spec.ts > one row per invocation, ok on success`; `> error carries the message` |
| BR-S02.T01-02 | A run that ends in `error` stores the error message in `etl_runs.error` and the partial counters in `stats_json`; it never stores an empty `{}`. — Enforcement: `finishRun(id, { error, stats })` merges the counters collected so far — Verification: `run-log.spec.ts > failing fetcher leaves status=error with message and partial stats` |
| BR-S02.T01-03 | Every cache path resolves under `RAW_CACHE_DIR`; a path that escapes it (absolute, `..`, or inside the repository) is refused before any write. — Enforcement: `resolveCachePath()` in `etl/paths.ts` (resolve, then `startsWith` check) — Verification: `paths.spec.ts > rejects ../ and repo-relative targets` |
| BR-S02.T01-04 | `etl full` and `etl delta` run their steps in this order and skip none: fetch canonical → fetch TCGdex → map ids → load cards per set → rebuild FTS → snapshot prices. — Enforcement: the `runLoad()` orchestrator, a single ordered array of named steps — Verification: `orchestrator.spec.ts > step order` with stubbed modules recording their call order |
| BR-S02.T01-05 | At most one run of a given `kind` is active: starting a second one while an `etl_runs` row of that kind is `running` and younger than `STALE_RUN_MINUTES` exits 3 without touching the cache. — Enforcement: `startRun` checks the `etl_runs_running_idx` partial index inside the same `BEGIN IMMEDIATE` that inserts — Verification: `run-log.spec.ts > second concurrent run of the same kind exits 3` |
| BR-S02.T01-06 | A row left `running` for more than `STALE_RUN_MINUTES` (default 240) is reconciled to `cancelled` by the next run of any kind, never deleted. — Enforcement: `reconcileStaleRuns()` called once at CLI start — Verification: `run-log.spec.ts > stale running row becomes cancelled, not removed` |
| BR-S02.T01-07 | Subcommand bodies contain no HTTP, no SQL against card tables and no parsing; they only call injected modules and aggregate their counters. — Enforcement: `packages/etl/src/cli.ts` imports no `undici`/`node:sqlite`; eslint `no-restricted-imports` for the CLI folder — Verification: `pnpm lint` fails on a fixture that fetches from `cli.ts` |
| BR-S02.T01-08 | The CLI exits non-zero whenever the run log says `error`, and zero whenever it says `ok` — the two can never disagree. — Enforcement: one `process.exitCode` assignment, derived from the closed run row — Verification: `cli.spec.ts > exit code matches etl_runs.status for both outcomes` |


## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)
- (nenhum)

## ✅ Critérios de aceite (done_when)
- `pnpm etl status` against a freshly migrated temp database prints `no runs` and exits 0.
- `pnpm etl bogus` exits 2 and prints the usage block; `pnpm etl full --nope` exits 2 (BR-S02.T01-08).
- `run-log.spec.ts` green: one row per invocation; success → `status='ok'` with counters; a step that throws → `status='error'` with the message and the partial counters (BR-S02.T01-01, -02).
- `run-log.spec.ts > second concurrent run of the same kind exits 3` and leaves the first row untouched (BR-S02.T01-05); `> stale running row becomes cancelled` (BR-S02.T01-06).
- `orchestrator.spec.ts > step order` records exactly `fetch-ptcg, fetch-tcgdex, map-ids, load-cards, rebuild-fts, snapshot-prices` with stub modules; `--skip-tcgdex` drops the TCGdex and price steps and nothing else (BR-S02.T01-04).
- `paths.spec.ts` green: `resolveCachePath("../x")`, an absolute path and a repo-relative path all throw `CachePathError`; the four source helpers return paths under `RAW_CACHE_DIR` (BR-S02.T01-03).
- Running any subcommand against a database one migration behind exits 4 and writes no `etl_runs` row.
- `pnpm lint` fails on a fixture that imports `undici` from `packages/etl/src/cli.ts` (BR-S02.T01-07).

## 📖 Arquivos para ler primeiro (o planejador começa por estes)
- `docs/stages/02-card-data-and-search/T01-etl-cli-and-raw-cache.md`

## 📁 Arquivos Alvo a Criar/Editar
- `packages/etl/src/run-log.ts`
- `packages/etl/src/paths.ts`
- `packages/etl/README.md`

