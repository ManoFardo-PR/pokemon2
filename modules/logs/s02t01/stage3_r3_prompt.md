You are a Senior Software Engineer. You are executing the GREEN phase of subtask S02T01: write the minimum production code that makes the RED tests pass while honoring the plan.

TEST RUNNER: `pnpm test`
TYPE CHECK / COMPILE: `pnpm typecheck`

================================================================================
MASTER PLAN (output of Stage 1). It is self-contained: do not read the workspace.
Sections 2, 3, 5 and 6 define files, contracts, constraints and existing code.
================================================================================
### 1. Objective and Context

- **Goal**: Implement the executable ETL entry point (`packages/etl`) providing a Commander-based CLI (`etl <full|delta|prices|fts|decks|status>`), deterministic raw cache layout with path escape protections under `$RAW_CACHE_DIR`, structured logging (Pino with human and `--json` modes and credential redaction), and execution run bookkeeping writing to SQLite table `etl_runs` (`startRun`, `finishRun`, `withRun`, concurrency lock, and stale run reconciliation).
- **Dependencies on earlier tasks**:
  - `S01.T01`: Environment variables (`RAW_CACHE_DIR`, `DATABASE_PATH`), monorepo structure, and `@pokesearch/shared` (`loadEnv`, `env`, `EnvPathError`).
  - `S01.T04`: Database migrations and client (`@pokesearch/db`), table `etl_runs` (defined in `0001_foundation.sql`), `openDatabase`, `assertSchemaCurrent`, and `SchemaOutdatedError`.
- **Existing Workspace State**:
  - `packages/etl` exists as a workspace package with `package.json`, `tsconfig.json`, `vitest.config.ts`, and a placeholder `src/index.ts`.
  - Root `package.json` exposes the task runner for workspace commands, and `packages/etl/package.json` declares the `bin` entry for `etl` mapping to `src/cli.ts`.
  - ESLint rules enforce import restrictions across workspace packages (prohibiting direct imports of `node:sqlite` or `better-sqlite3` and forbidding HTTP fetchers or card table SQL in CLI entry points).
  - Table `etl_runs` is migrated via migration `0001_foundation.sql` with schema:
    `id INTEGER PRIMARY KEY, kind TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL DEFAULT 'running', stats_json TEXT NOT NULL DEFAULT '{}', error TEXT, CHECK (status IN ('running', 'ok', 'error', 'cancelled')), CHECK (finished_at IS NULL OR finished_at >= started_at), CHECK ((status = 'running') = (finished_at IS NULL))`. Indexes: `etl_runs_kind_started_idx` on `(kind, started_at DESC)` and `etl_runs_running_idx` on `(started_at) WHERE status = 'running'`.

---

### 2. Target Files

| Path | Role | Action | Purpose |
|---|---|---|---|
| `packages/etl/package.json` | config | patch | Add `commander`, `pino`, `pino-pretty` dependencies, workspace dependencies `@pokesearch/db`, `@pokesearch/shared`, and `bin` entry |
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
  - `cacheRoot()`: Resolves `$RAW_CACHE_DIR` (from `process.env.RAW_CACHE_DIR` or falls back to `<DATA_DIR>/raw` via `env.RAW_CACHE_DIR`). Ensures directory exists (`fs.mkdirSync(..., { recursive: true })`).
  - `resolveCachePath(...segments)`: Resolves `path.resolve(cacheRoot(), ...segments)`. Throws `CachePathError` if the path escapes `cacheRoot()` (must start with `cacheRoot() + path.sep` or equal `cacheRoot()`) or resolves inside the repository root (checked via `findRepoRoot()`).
  - `ptcg.setsFile()`: `<cacheRoot>/pokemon-tcg-data/sets/en.json`
  - `ptcg.cardsFile(setId)`: `<cacheRoot>/pokemon-tcg-data/cards/en/${setId}.json`
  - `ptcg.etagsFile()`: `<cacheRoot>/pokemon-tcg-data/etags.json`
  - `tcgdex.setsFile()`: `<cacheRoot>/tcgdex/sets.json`
  - `tcgdex.setFile(id)`: `<cacheRoot>/tcgdex/sets/${id}.json`
  - `tcgdex.cardFile(id)`: `<cacheRoot>/tcgdex/cards/${id}.json`
  - `limitless.tournamentDir(id)`: `<cacheRoot>/limitless/tournaments/${id}`
  - `limitless.webList(id)`: `<cacheRoot>/limitless/web/list_${id}.html`
  - `reports.file(name)`: `<cacheRoot>/reports/${name}`
  - `writeJsonAtomic(destPath, value)`: Writes serialized JSON string to a sibling temp file (`${destPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`), flushes/fsyncs, and invokes `fs.promises.rename` to replace destination atomically. Temp file is deleted on any caught error before re-throwing.

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
- Redaction: Any log object key matching `/key|token|secret/i` (such as `LIMITLESS_API_KEY`) is masked with `"[REDACTED]"`.

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
- `run.add(patch)`: Validates that every property value in `patch` is a primitive scalar (`number` or `string`). Throws `TypeError` on nested objects or arrays. Merges into an in-memory dictionary.
- `startRun`: Executes inside `db.transaction(..., "immediate")`:
  1. Checks for active running row:
     `SELECT id, started_at FROM etl_runs WHERE kind = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`.
  2. If found, checks if `(now - started_at) < STALE_RUN_MINUTES * 60 * 1000`. If still within stale threshold, throws `ConcurrentRunError(kind, id, started_at)`.
  3. Inserts: `INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}') RETURNING id`.
- `finishRun`: Updates the row:
  - If `error` is present: `status = 'error'`, `error = error.message || String(error)`, `finished_at = now`, `stats_json = JSON.stringify(run.getStats())`. Must never store empty `{}` if counters exist.
  - If success: `status = 'ok'`, `finished_at = now`, `stats_json = JSON.stringify(run.getStats())`.
- `reconcileStaleRuns`: Runs once at CLI startup:
  `UPDATE etl_runs SET status = 'cancelled', finished_at = ? WHERE status = 'running' AND started_at <= ?`.
  Threshold calculated as `new Date(Date.now() - staleMinutes * 60 * 1000).toISOString()`. Returns number of rows updated.
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
  3. Schema verification via `assertSchemaCurrent(db)`. If `SchemaOutdatedError` caught, print error message instructing user to run `pnpm db:migrate` and exit with code 4 immediately without creating an `etl_runs` row.
  4. Call `reconcileStaleRuns(db)`.
  5. Execute command wrapped in `withRun(db, kind, async (run) => { ... })`.
  6. On `SIGINT`, set a 2-second timeout, update active `etl_runs` status to `cancelled`, and exit.

#### 3.7. Business Rules
- **BR-S02.T01-01**: Every subcommand invocation writes exactly one `etl_runs` row, inserted with `status='running'` before any network or file work and closed to `ok` or `error` before the process exits.
- **BR-S02.T01-02**: A run that ends in `error` stores the error message in `etl_runs.error` and the partial counters in `stats_json`; it never stores an empty `{}` when counters have been collected.
- **BR-S02.T01-03**: Every cache path resolves under `RAW_CACHE_DIR`; a path that escapes it (via `..`, absolute paths outside, or inside repo root) throws `CachePathError` before writing.
- **BR-S02.T01-04**: `etl full` and `etl delta` run their steps in this order and skip none: `fetch-ptcg` -> `fetch-tcgdex` -> `map-ids` -> `load-cards` -> `rebuild-fts` -> `snapshot-prices`. `--skip-tcgdex` drops `fetch-tcgdex` and `snapshot-prices` and nothing else.
- **BR-S02.T01-05**: At most one run of a given `kind` is active within `STALE_RUN_MINUTES`; starting a second concurrently exits with code 3 without touching the cache.
- **BR-S02.T01-06**: A row left `running` for more than `STALE_RUN_MINUTES` (default 240) is reconciled to `cancelled` by the next run of any kind, never deleted.
- **BR-S02.T01-07**: Subcommand entry files contain no HTTP network fetchers, card table SQL statements, or data transformations; only injected steps and run counter aggregation.
- **BR-S02.T01-08**: The CLI exits non-zero (1, 3, or 4) whenever the run fails or cannot execute, and zero if and only if `etl_runs.status === 'ok'`.

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
- Successful `withRun` inserts one row with `status='running'`, finishes with `status='ok'` and duration counter (BR-S02.T01-01).
- Failed `withRun` records `status='error'`, records error message in `etl_runs.error`, and retains partial counters in `stats_json` (BR-S02.T01-02).
- `RunHandle.add` throws `TypeError` when given nested object or non-scalar value.
- Starting a second run of the same kind while first is running throws `ConcurrentRunError` (BR-S02.T01-05).
- Starting a run of a different kind (e.g., `prices` during `decks`) succeeds concurrently.
- `reconcileStaleRuns` updates rows older than `STALE_RUN_MINUTES` to `status='cancelled'`, preserving finished_at timestamp, and does not touch recent running rows (BR-S02.T01-06).
- `lastRunPerKind` returns latest record for each distinct kind.

#### 4.3. Pipeline Orchestrator (`packages/etl/src/orchestrator.spec.ts`)
```ts
import { describe, it, expect } from "vitest";
import { runLoad, NotImplementedError } from "./orchestrator.js";
```
- `runLoad` invokes steps in exact order: `fetch-ptcg, fetch-tcgdex, map-ids, load-cards, rebuild-fts, snapshot-prices` (BR-S02.T01-04).
- `runLoad` with `--skip-tcgdex` executes `fetch-ptcg, map-ids, load-cards, rebuild-fts` and skips `fetch-tcgdex` and `snapshot-prices` (BR-S02.T01-04).
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
- `etl bogus` exits with code 2 and displays usage help block.
- `etl full --nope` exits with code 2.
- Running CLI against a database that is behind migrations exits with code 4, outputs `pnpm db:migrate` instruction, and inserts no row into `etl_runs`.
- Concurrent run of the same kind exits with code 3 (BR-S02.T01-05).
- Failed run exits with code 1, and `etl_runs.status` is `'error'` (BR-S02.T01-08).

---

### 5. Architecture and Coding Constraints

- **Language & Runtime**: Node.js >= 24.13 with native ESM (`"type": "module"`).
- **Workspace Architecture**: `packages/etl` depends only on `@pokesearch/db` and `@pokesearch/shared` internally, plus `commander`, `pino`, and `pino-pretty` as production dependencies.
- **Database Access Restriction**: `packages/etl` must never import `node:sqlite` or `better-sqlite3` directly (enforced by ESLint). All database interactions must use `@pokesearch/db` (`openDatabase`, `assertSchemaCurrent`, `migrate`, `Db`).
- **Network / SQL Segregation (BR-S02.T01-07)**: `packages/etl/src/cli.ts` must contain no HTTP clients (`undici`, `fetch`) and no SQL queries against card, set, deck, or price tables. The CLI is strictly an orchestrator and run logger.
- **Cache Path Invariant (D-005 & BR-S02.T01-03)**: `RAW_CACHE_DIR` must never resolve inside OneDrive and must never resolve inside the repository. Path containment must be verified before any write; failure throws `CachePathError`.
- **Process Signals**: Intercept `SIGINT` (Ctrl+C); attempt graceful cancellation of active `etl_runs` within a strict 2-second timeout before exiting.
- **Workspace Scripting Note**: The root workspace script `"etl": "node --no-warnings=ExperimentalWarning packages/etl/src/cli.ts"` and the ESLint `no-restricted-imports` rule for `packages/etl/src/cli.ts` (restricting `undici` and direct SQL drivers) govern entry execution and code hygiene.

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
================================================================================
RED TESTS (output of Stage 2). The production code MUST make all of them pass:
================================================================================
### FILE: packages/etl/src/paths.spec.ts
```typescript
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findRepoRoot } from "@pokesearch/shared/env";
import {
  cacheRoot,
  resolveCachePath,
  ptcg,
  tcgdex,
  limitless,
  reports,
  writeJsonAtomic,
  CachePathError,
} from "./paths.js";

describe("paths", () => {
  let tempCacheDir: string;
  const originalRawCacheDir = process.env.RAW_CACHE_DIR;

  beforeEach(() => {
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-cache-test-"));
    process.env.RAW_CACHE_DIR = tempCacheDir;
  });

  afterEach(() => {
    if (originalRawCacheDir === undefined) {
      delete process.env.RAW_CACHE_DIR;
    } else {
      process.env.RAW_CACHE_DIR = originalRawCacheDir;
    }
    if (fs.existsSync(tempCacheDir)) {
      fs.rmSync(tempCacheDir, { recursive: true, force: true });
    }
  });

  describe("cacheRoot", () => {
    it("returns normalized directory and ensures it exists", () => {
      const nonExistentSub = path.join(tempCacheDir, "nested", "cache");
      process.env.RAW_CACHE_DIR = nonExistentSub;

      const root = cacheRoot();
      expect(root).toBe(path.resolve(nonExistentSub));
      expect(fs.existsSync(root)).toBe(true);
      expect(fs.statSync(root).isDirectory()).toBe(true);
    });
  });

  describe("resolveCachePath", () => {
    it("resolves valid subpath inside cacheRoot", () => {
      const resolved = resolveCachePath("test", "subfile.json");
      expect(resolved).toBe(path.join(path.resolve(tempCacheDir), "test", "subfile.json"));
    });

    it("throws CachePathError when given path traversal outside cacheRoot", () => {
      expect(() => resolveCachePath("..", "outside.json")).toThrow(CachePathError);
      expect(() => resolveCachePath("nested", "..", "..", "outside.json")).toThrow(CachePathError);
    });

    it("throws CachePathError when given an absolute path outside RAW_CACHE_DIR", () => {
      const outsideDir = os.tmpdir();
      const outsidePath = path.join(outsideDir, "escape.json");
      expect(() => resolveCachePath(outsidePath)).toThrow(CachePathError);
    });

    it("throws CachePathError when target resolves inside repository root", () => {
      const repoRoot = findRepoRoot();
      const insideRepo = path.join(repoRoot, "packages", "etl", "escaped.json");
      expect(() => resolveCachePath(insideRepo)).toThrow(CachePathError);
    });
  });

  describe("source path generators", () => {
    it("ptcg.setsFile returns expected path under cacheRoot", () => {
      const p = ptcg.setsFile();
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "pokemon-tcg-data", "sets", "en.json"));
    });

    it("ptcg.cardsFile returns expected path under cacheRoot", () => {
      const p = ptcg.cardsFile("sv3pt5");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "pokemon-tcg-data", "cards", "en", "sv3pt5.json"));
    });

    it("ptcg.etagsFile returns expected path under cacheRoot", () => {
      const p = ptcg.etagsFile();
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "pokemon-tcg-data", "etags.json"));
    });

    it("tcgdex.setsFile returns expected path under cacheRoot", () => {
      const p = tcgdex.setsFile();
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "tcgdex", "sets.json"));
    });

    it("tcgdex.setFile returns expected path under cacheRoot", () => {
      const p = tcgdex.setFile("sv03.5");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "tcgdex", "sets", "sv03.5.json"));
    });

    it("tcgdex.cardFile returns expected path under cacheRoot", () => {
      const p = tcgdex.cardFile("sv03.5-001");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "tcgdex", "cards", "sv03.5-001.json"));
    });

    it("limitless.tournamentDir returns expected path under cacheRoot", () => {
      const p = limitless.tournamentDir("T123");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "limitless", "tournaments", "T123"));
    });

    it("limitless.webList returns expected path under cacheRoot", () => {
      const p = limitless.webList("L456");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "limitless", "web", "list_L456.html"));
    });

    it("reports.file returns expected path under cacheRoot", () => {
      const p = reports.file("idmap_unmatched_cards.csv");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "reports", "idmap_unmatched_cards.csv"));
    });
  });

  describe("writeJsonAtomic", () => {
    it("writes JSON cleanly and replaces file atomically", async () => {
      const dest = resolveCachePath("test-atomic", "data.json");
      const payload = { hello: "world", count: 42, active: true };

      await writeJsonAtomic(dest, payload);

      expect(fs.existsSync(dest)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(dest, "utf8"));
      expect(parsed).toEqual(payload);

      // Overwrite atomically
      const updated = { hello: "world-updated", count: 99 };
      await writeJsonAtomic(dest, updated);
      expect(JSON.parse(fs.readFileSync(dest, "utf8"))).toEqual(updated);
    });

    it("cleans up temporary files on write error", async () => {
      const targetDir = path.join(tempCacheDir, "test-atomic-err");
      fs.mkdirSync(targetDir, { recursive: true });
      const dest = path.join(targetDir, "failing.json");

      // Circular object causes JSON.stringify to throw
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      await expect(writeJsonAtomic(dest, circular)).rejects.toThrow();

      // Ensure no dangling .tmp files exist in targetDir
      const files = fs.readdirSync(targetDir);
      const tmpFiles = files.filter((f) => f.includes(".tmp."));
      expect(tmpFiles).toHaveLength(0);
      expect(fs.existsSync(dest)).toBe(false);
    });
  });
});
```

### FILE: packages/etl/src/logger.spec.ts
```typescript
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { createEtlLogger, REDACTED_KEYS } from "./logger.js";

describe("logger", () => {
  it("matches expected sensitive keys with REDACTED_KEYS regexp", () => {
    expect(REDACTED_KEYS.test("LIMITLESS_API_KEY")).toBe(true);
    expect(REDACTED_KEYS.test("apiKey")).toBe(true);
    expect(REDACTED_KEYS.test("secret_token")).toBe(true);
    expect(REDACTED_KEYS.test("api_secret")).toBe(true);
    expect(REDACTED_KEYS.test("user_token")).toBe(true);
    expect(REDACTED_KEYS.test("sets_count")).toBe(false);
    expect(REDACTED_KEYS.test("cards")).toBe(false);
  });

  it("redacts sensitive keys in JSON NDJSON mode", async () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = createEtlLogger({ json: true }, dest);
    logger.info({
      LIMITLESS_API_KEY: "secret-12345",
      user_token: "tok_abcdef",
      apiKey: "key_xyz",
      safeField: "visible",
    }, "API call executed");

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.msg).toBe("API call executed");
    expect(parsed.LIMITLESS_API_KEY).toBe("[REDACTED]");
    expect(parsed.user_token).toBe("[REDACTED]");
    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.safeField).toBe("visible");
  });

  it("formats log output in JSON mode containing run_id, kind, step, and counters", () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = createEtlLogger({ json: true }, dest);
    logger.info({
      run_id: 12,
      kind: "full",
      step: "fetch-ptcg",
      sets: 150,
      cards: 15000,
    }, "Step completed");

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.run_id).toBe(12);
    expect(parsed.kind).toBe("full");
    expect(parsed.step).toBe("fetch-ptcg");
    expect(parsed.sets).toBe(150);
    expect(parsed.cards).toBe(15000);
  });

  it("formats log output in human format without raw JSON dump", () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = createEtlLogger({ json: false }, dest);
    logger.info({ step: "map-ids" }, "Mapped 420 cards");

    expect(lines.length).toBeGreaterThan(0);
    const output = lines.join("");
    expect(output).toContain("Mapped 420 cards");
    // Human format should not be a raw NDJSON object string
    expect(output.trim().startsWith("{")).toBe(false);
  });
});
```

### FILE: packages/etl/src/run-log.spec.ts
```typescript
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { withTempDbAsync } from "@pokesearch/db/testing";
import {
  startRun,
  finishRun,
  withRun,
  reconcileStaleRuns,
  lastRunPerKind,
  STALE_RUN_MINUTES,
  ConcurrentRunError,
} from "./run-log.js";

describe("run-log bookkeeping", () => {
  it("withRun inserts status='running', finishes with status='ok' and duration counter (BR-S02.T01-01)", async () => {
    await withTempDbAsync(async ({ db }) => {
      let capturedId = -1;

      const result = await withRun(db, "full", async (run) => {
        capturedId = run.id;
        expect(run.kind).toBe("full");
        expect(run.startedAt).toBeDefined();

        // While running, verify row status in database
        const row = db.get(
          "SELECT status, finished_at FROM etl_runs WHERE id = ?",
          [run.id]
        );
        expect(row?.status).toBe("running");
        expect(row?.finished_at).toBeNull();

        run.add({ sets: 10, cards: 500 });
        return "success-result";
      });

      expect(result).toBe("success-result");

      // Verify row updated to ok with stats and finished_at
      const row = db.get(
        "SELECT status, finished_at, stats_json, error FROM etl_runs WHERE id = ?",
        [capturedId]
      );
      expect(row?.status).toBe("ok");
      expect(row?.finished_at).not.toBeNull();
      expect(row?.error).toBeNull();

      const stats = JSON.parse(row!.stats_json);
      expect(stats.sets).toBe(10);
      expect(stats.cards).toBe(500);
      expect(typeof stats.duration_ms).toBe("number");
      expect(stats.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  it("withRun records status='error', error message, and retains partial counters (BR-S02.T01-02)", async () => {
    await withTempDbAsync(async ({ db }) => {
      let capturedId = -1;

      await expect(
        withRun(db, "delta", async (run) => {
          capturedId = run.id;
          run.add({ sets: 5, cards: 120 });
          throw new Error("Network timeout during fetch");
        })
      ).rejects.toThrow("Network timeout during fetch");

      const row = db.get(
        "SELECT status, finished_at, stats_json, error FROM etl_runs WHERE id = ?",
        [capturedId]
      );
      expect(row?.status).toBe("error");
      expect(row?.finished_at).not.toBeNull();
      expect(row?.error).toContain("Network timeout during fetch");

      const stats = JSON.parse(row!.stats_json);
      expect(stats.sets).toBe(5);
      expect(stats.cards).toBe(120);
      expect(typeof stats.duration_ms).toBe("number");
      // Must never store empty "{}" when counters exist
      expect(row?.stats_json).not.toBe("{}");
    });
  });

  it("RunHandle.add throws TypeError when given nested objects or non-scalar values", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "prices");
      try {
        expect(() => {
          run.add({ nested: { a: 1 } });
        }).toThrow(TypeError);

        expect(() => {
          run.add({ list: [1, 2, 3] });
        }).toThrow(TypeError);

        // Valid primitives should succeed
        expect(() => {
          run.add({ price_rows: 1500, label: "usd" });
        }).not.toThrow();

        expect(run.getStats()).toMatchObject({ price_rows: 1500, label: "usd" });
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("starting a second run of the same kind throws ConcurrentRunError (BR-S02.T01-05)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run1 = startRun(db, "full");
      try {
        expect(() => startRun(db, "full")).toThrow(ConcurrentRunError);

        try {
          startRun(db, "full");
        } catch (err) {
          expect(err).toBeInstanceOf(ConcurrentRunError);
          const cre = err;
          expect(cre.activeRunId).toBe(run1.id);
          expect(cre.startedAt).toBe(run1.startedAt);
        }
      } finally {
        finishRun(db, run1, {});
      }
    });
  });

  it("starting runs of different kinds succeeds concurrently", async () => {
    await withTempDbAsync(async ({ db }) => {
      const runDecks = startRun(db, "decks");
      const runPrices = startRun(db, "prices");

      try {
        expect(runDecks.id).not.toBe(runPrices.id);
        expect(runDecks.kind).toBe("decks");
        expect(runPrices.kind).toBe("prices");
      } finally {
        finishRun(db, runDecks, {});
        finishRun(db, runPrices, {});
      }
    });
  });

  it("reconcileStaleRuns updates rows older than STALE_RUN_MINUTES to status='cancelled' (BR-S02.T01-06)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const now = Date.now();
      const oldStartedAt = new Date(now - (STALE_RUN_MINUTES + 10) * 60 * 1000).toISOString();
      const recentStartedAt = new Date(now - 10 * 60 * 1000).toISOString();

      // Seed an old stale running row
      db.run(
        "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}')",
        ["full", oldStartedAt]
      );
      const staleId = Number(db.get("SELECT last_insert_rowid() AS id")!.id);

      // Seed a recent active running row
      db.run(
        "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}')",
        ["delta", recentStartedAt]
      );
      const recentId = Number(db.get("SELECT last_insert_rowid() AS id")!.id);

      const reconciledCount = reconcileStaleRuns(db, STALE_RUN_MINUTES);
      expect(reconciledCount).toBe(1);

      // Stale row must be cancelled with finished_at set
      const staleRow = db.get(
        "SELECT status, finished_at FROM etl_runs WHERE id = ?",
        [staleId]
      );
      expect(staleRow?.status).toBe("cancelled");
      expect(staleRow?.finished_at).not.toBeNull();

      // Recent row must remain running
      const recentRow = db.get(
        "SELECT status, finished_at FROM etl_runs WHERE id = ?",
        [recentId]
      );
      expect(recentRow?.status).toBe("running");
      expect(recentRow?.finished_at).toBeNull();
    });
  });

  it("lastRunPerKind returns latest record for each distinct kind or filtered kind", async () => {
    await withTempDbAsync(async ({ db }) => {
      // Empty initially
      expect(lastRunPerKind(db)).toEqual([]);

      // Insert multiple runs across kinds
      const t1 = "2026-01-01T10:00:00.000Z";
      const t2 = "2026-01-01T11:00:00.000Z";
      const t3 = "2026-01-01T12:00:00.000Z";

      db.run(
        "INSERT INTO etl_runs (kind, started_at, finished_at, status, stats_json) VALUES ('full', ?, ?, 'ok', '{}')",
        [t1, t1]
      );
      db.run(
        "INSERT INTO etl_runs (kind, started_at, finished_at, status, stats_json) VALUES ('full', ?, ?, 'ok', '{}')",
        [t2, t2]
      );
      db.run(
        "INSERT INTO etl_runs (kind, started_at, finished_at, status, stats_json) VALUES ('delta', ?, ?, 'ok', '{}')",
        [t3, t3]
      );

      const allLatest = lastRunPerKind(db);
      expect(allLatest).toHaveLength(2);
      const fullLatest = allLatest.find((r) => r.kind === "full");
      const deltaLatest = allLatest.find((r) => r.kind === "delta");

      expect(fullLatest?.started_at).toBe(t2);
      expect(deltaLatest?.started_at).toBe(t3);

      // Filtered by specific kind
      const filteredFull = lastRunPerKind(db, "full");
      expect(filteredFull).toHaveLength(1);
      expect(filteredFull[0]?.started_at).toBe(t2);
    });
  });
});
```

### FILE: packages/etl/src/orchestrator.spec.ts
```typescript
// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { withTempDbAsync } from "@pokesearch/db/testing";
import { runLoad, NotImplementedError, defaultStepRegistry } from "./orchestrator.js";
import { startRun, finishRun } from "./run-log.js";

describe("pipeline orchestrator", () => {
  it("invokes steps in exact order: fetch-ptcg -> fetch-tcgdex -> map-ids -> load-cards -> rebuild-fts -> snapshot-prices (BR-S02.T01-04)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        const executedOrder: string[] = [];

        const mockRegistry = {
          fetchPtcg: {
            name: "fetch-ptcg",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-ptcg");
            }),
          },
          fetchTcgdex: {
            name: "fetch-tcgdex",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-tcgdex");
            }),
          },
          mapIds: {
            name: "map-ids",
            execute: vi.fn(async () => {
              executedOrder.push("map-ids");
            }),
          },
          loadCards: {
            name: "load-cards",
            execute: vi.fn(async () => {
              executedOrder.push("load-cards");
            }),
          },
          rebuildFts: {
            name: "rebuild-fts",
            execute: vi.fn(async () => {
              executedOrder.push("rebuild-fts");
            }),
          },
          snapshotPrices: {
            name: "snapshot-prices",
            execute: vi.fn(async () => {
              executedOrder.push("snapshot-prices");
            }),
          },
        };

        await runLoad(db, run, {}, mockRegistry);

        expect(executedOrder).toEqual([
          "fetch-ptcg",
          "fetch-tcgdex",
          "map-ids",
          "load-cards",
          "rebuild-fts",
          "snapshot-prices",
        ]);
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("skips fetch-tcgdex and snapshot-prices when skipTcgdex is true (BR-S02.T01-04)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        const executedOrder: string[] = [];

        const mockRegistry = {
          fetchPtcg: {
            name: "fetch-ptcg",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-ptcg");
            }),
          },
          fetchTcgdex: {
            name: "fetch-tcgdex",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-tcgdex");
            }),
          },
          mapIds: {
            name: "map-ids",
            execute: vi.fn(async () => {
              executedOrder.push("map-ids");
            }),
          },
          loadCards: {
            name: "load-cards",
            execute: vi.fn(async () => {
              executedOrder.push("load-cards");
            }),
          },
          rebuildFts: {
            name: "rebuild-fts",
            execute: vi.fn(async () => {
              executedOrder.push("rebuild-fts");
            }),
          },
          snapshotPrices: {
            name: "snapshot-prices",
            execute: vi.fn(async () => {
              executedOrder.push("snapshot-prices");
            }),
          },
        };

        await runLoad(db, run, { skipTcgdex: true }, mockRegistry);

        expect(executedOrder).toEqual([
          "fetch-ptcg",
          "map-ids",
          "load-cards",
          "rebuild-fts",
        ]);
        expect(mockRegistry.fetchTcgdex.execute).not.toHaveBeenCalled();
        expect(mockRegistry.snapshotPrices.execute).not.toHaveBeenCalled();
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("throws NotImplementedError when default stub steps are invoked", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        await expect(runLoad(db, run, {}, defaultStepRegistry)).rejects.toThrow(
          NotImplementedError
        );
      } finally {
        finishRun(db, run, {});
      }
    });
  });
});
```

### FILE: packages/etl/src/cli.spec.ts
```typescript
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openDatabase, migrate } from "@pokesearch/db";
import { findRepoRoot } from "@pokesearch/shared/env";

const execFileAsync = promisify(execFile);

describe("CLI entry point (etl)", () => {
  let tempDir: string;
  let dbPath: string;
  let cacheDir: string;
  const repoRoot = findRepoRoot();
  const cliPath = path.join(repoRoot, "packages", "etl", "src", "cli.ts");

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-cli-test-"));
    dbPath = path.join(tempDir, "test.db");
    cacheDir = path.join(tempDir, "raw-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function runCli(args: string[], envOverrides: Record<string, string> = {}) {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ["--no-warnings=ExperimentalWarning", cliPath, ...args],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            DATABASE_PATH: dbPath,
            RAW_CACHE_DIR: cacheDir,
            ...envOverrides,
          },
        }
      );
      return { code: 0, stdout, stderr };
    } catch (err: unknown) {
      const error = err;
      return {
        code: typeof error?.code === "number" ? error.code : 1,
        stdout: error?.stdout ?? "",
        stderr: error?.stderr ?? "",
      };
    }
  }

  it("etl status on freshly migrated database outputs 'no runs' and exits with code 0", async () => {
    const db = openDatabase(dbPath);
    migrate(db);
    db.close();

    const result = await runCli(["status"]);
    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("no runs");
  });

  it("etl bogus command exits with code 2 and displays usage help block", async () => {
    const result = await runCli(["bogus"]);
    expect(result.code).toBe(2);
    expect(result.stderr + result.stdout).toMatch(/error: unknown command|usage:/i);
  });

  it("etl full with unknown flag exits with code 2", async () => {
    const result = await runCli(["full", "--nope"]);
    expect(result.code).toBe(2);
    expect(result.stderr + result.stdout).toMatch(/unknown option/i);
  });

  it("exits with code 4 and prints 'pnpm db:migrate' when database schema is outdated", async () => {
    // Database exists without migrations applied
    const db = openDatabase(dbPath);
    db.exec("CREATE TABLE placeholder (id INTEGER PRIMARY KEY);");
    db.close();

    const result = await runCli(["status"]);
    expect(result.code).toBe(4);
    expect(result.stderr + result.stdout).toContain("pnpm db:migrate");

    // Must not create any etl_runs row
    const dbCheck = openDatabase(dbPath);
    const tableCheck = dbCheck.get(
      "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='etl_runs'"
    );
    expect(tableCheck?.count).toBe(0);
    dbCheck.close();
  });

  it("exits with code 3 on concurrent run conflict (BR-S02.T01-05)", async () => {
    const db = openDatabase(dbPath);
    migrate(db);
    // Seed an active running run
    db.run(
      "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES ('full', ?, 'running', '{}')",
      [new Date().toISOString()]
    );
    db.close();

    const result = await runCli(["full"]);
    expect(result.code).toBe(3);
    expect(result.stderr + result.stdout).toMatch(/concurrent|active/i);
  });

  it("exits with code 1 when step execution fails and logs status='error' (BR-S02.T01-08)", async () => {
    const db = openDatabase(dbPath);
    migrate(db);
    db.close();

    // Default step stubs throw NotImplementedError
    const result = await runCli(["full"]);
    expect(result.code).toBe(1);

    const dbCheck = openDatabase(dbPath);
    const runRow = dbCheck.get(
      "SELECT status, error FROM etl_runs WHERE kind = 'full' ORDER BY id DESC LIMIT 1"
    );
    expect(runRow).toBeDefined();
    expect(runRow?.status).toBe("error");
    expect(runRow?.error).toBeDefined();
    dbCheck.close();
  });
});
```
================================================================================
CURRENT CONTENT OF FILES THAT ALREADY EXIST (injected by the orchestrator; empty if none):
================================================================================
### CURRENT CONTENT: packages/etl/package.json
```json
{
  "name": "@pokesearch/etl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --experimental-strip-types src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^3.2.7"
  }
}
```

### CURRENT CONTENT: packages/etl/src/index.ts
```typescript
console.log('ETL package placeholder');

export {};
```

================================================================================
================================================================================
FEEDBACK ON YOUR PREVIOUS OUTPUT (attempt 1 of 3): LOCAL VALIDATION FAILED
================================================================================
Your previous output was applied and the local validation (compile and tests) failed with the errors below. Fix exactly these errors and return the COMPLETE corrected output (every file you create or change), in the required format. Your edits are applied on top of the CURRENT CONTENT shown above, not on top of your previous attempt.

### ERROS DE EXECUÇÃO DE TESTE

```text
m > [22mS01.T10: docs-lint (scripts/docs-lint.mjs)[2m > [22mgrammar edge cases (BR-S01.T10-05)[2m > [22mparseSubtaskFile exposes the header fields, sections and graph ids
[41m[1m FAIL [22m[49m [30m[46m scripts [49m[39m scripts/docs-lint.spec.mjs[2m > [22mS01.T10: docs-lint (scripts/docs-lint.mjs)[2m > [22mgrammar edge cases (BR-S01.T10-05)[2m > [22mlintDocs and parseTree work on the fixture without the CLI
[31m[1mSyntaxError[22m: Invalid or unexpected token[39m
[36m [2m❯[22m scripts/docs-lint.spec.mjs:[2m152:19[22m[39m
    [90m150| [39m  [34mdescribe[39m([32m"registry"[39m[33m,[39m () [33m=>[39m {
    [90m151| [39m    [34mit[39m([32m"module exports"[39m[33m,[39m [35masync[39m () [33m=>[39m {
    [90m152| [39m      [35mconst[39m mod [33m=[39m [35mawait[39m [34mloadModule[39m()[33m;[39m
    [90m   | [39m                  [31m^[39m
    [90m153| [39m      expect(Object.keys(mod.CHECKS).map(Number).sort((a, b) => a - b)…
    [90m154| [39m      expect(Object.keys(mod.STRICT_CHECKS).map(Number).sort((a, b) =>…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/13]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[46m scripts [49m[39m scripts/notice-lint.spec.ts[2m > [22mS01.T09: notice-lint (scripts/notice-lint.mjs)[2m > [22mmodule exports[2m > [22mexports EXPECTED_IDS, FIELDS and a CHECKS registry keyed 1..7
[41m[1m FAIL [22m[49m [30m[46m scripts [49m[39m scripts/notice-lint.spec.ts[2m > [22mS01.T09: notice-lint (scripts/notice-lint.mjs)[2m > [22mstructural checks[2m > [22m14. multi-line attribution (two-space continuation) is valid and parsed with a newline
[31m[1mSyntaxError[22m: Invalid or unexpected token[39m
[36m [2m❯[22m scripts/notice-lint.spec.ts:[2m243:19[22m[39m
    [90m241| [39m  [34mdescribe[39m([32m"module exports"[39m[33m,[39m () [33m=>[39m {
    [90m242| [39m    it("exports EXPECTED_IDS, FIELDS and a CHECKS registry keyed 1..7"…
    [90m243| [39m      [35mconst[39m mod [33m=[39m [35mawait[39m [34mloadModule[39m()[33m;[39m
    [90m   | [39m                  [31m^[39m
    [90m244| [39m      [34mexpect[39m(mod[33m.[39m[33mEXPECTED_IDS[39m)[33m.[39m[34mtoEqual[39m([33mEXPECTED_IDS[39m)[33m;[39m
    [90m245| [39m      [34mexpect[39m(mod[33m.[39m[33mFIELDS[39m)[33m.[39m[34mtoEqual[39m([33mFIELDS[39m)[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/13]⎯[22m[39m

[ELIFECYCLE] Test failed. See above for more details.
```
================================================================================
================================================================================
REWORK REQUESTED (round 2 of 2)
================================================================================
A reviewer compared your previous output with this prompt and asked for rework. Review your previous output against the points below, then return the corrected, COMPLETE output (not just the delta), in the required format.

REVIEWER POINTS:
- the code does not compile:
```text
$ pnpm -r run typecheck && tsc -p scripts/tsconfig.json
$ tsc --noEmit
$ tsc --noEmit
$ tsc --noEmit
$ tsc --noEmit
$ tsc --noEmit
$ tsc --noEmit
[ELIFECYCLE] Command failed with exit code 2.
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL

  × "pnpm recursive run" failed in C:\Users\mfard\OneDrive\AmbVir\VS
  │ Code\Trabalhos\pokemon2\packages\etl

[ELIFECYCLE] Command failed with exit code 1.
```

YOUR PREVIOUS OUTPUT:
--------------------------------------------------------------------------------
### PATCH: packages/etl/package.json
<<<<<<< SEARCH
  "scripts": {
    "dev": "node --experimental-strip-types src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^3.2.7"
  }
}
=======
  "bin": {
    "etl": "./src/cli.ts"
  },
  "scripts": {
    "dev": "node --experimental-strip-types src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@pokesearch/db": "workspace:*",
    "@pokesearch/shared": "workspace:*",
    "commander": "^12.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^3.2.7"
  }
}
>>>>>>> REPLACE

### FILE: packages/etl/src/paths.ts
```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { env, findRepoRoot } from "@pokesearch/shared/env";

export class CachePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CachePathError";
  }
}

export function cacheRoot(): string {
  const root = process.env.RAW_CACHE_DIR || env.RAW_CACHE_DIR;
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

export function resolveCachePath(...segments: string[]): string {
  const root = cacheRoot();
  const target = path.resolve(root, ...segments);

  const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
  if (target !== root && !target.startsWith(normalizedRoot)) {
    throw new CachePathError(`Cache path '${target}' escapes cache root '${root}'`);
  }

  let repoRoot: string | undefined;
  try {
    repoRoot = findRepoRoot();
  } catch {
    // Repo root might not be discoverable in isolated environments
  }

  if (repoRoot) {
    const normalizedRepo = path.resolve(repoRoot).endsWith(path.sep)
      ? path.resolve(repoRoot)
      : path.resolve(repoRoot) + path.sep;
    if (target === path.resolve(repoRoot) || target.startsWith(normalizedRepo)) {
      throw new CachePathError(
        `Cache path '${target}' resolves inside the repository root '${repoRoot}'`
      );
    }
  }

  return target;
}

export const ptcg = {
  setsFile: (): string => resolveCachePath("pokemon-tcg-data", "sets", "en.json"),
  cardsFile: (setId: string): string =>
    resolveCachePath("pokemon-tcg-data", "cards", "en", `${setId}.json`),
  etagsFile: (): string => resolveCachePath("pokemon-tcg-data", "etags.json"),
};

export const tcgdex = {
  setsFile: (): string => resolveCachePath("tcgdex", "sets.json"),
  setFile: (id: string): string => resolveCachePath("tcgdex", "sets", `${id}.json`),
  cardFile: (id: string): string => resolveCachePath("tcgdex", "cards", `${id}.json`),
};

export const limitless = {
  tournamentDir: (id: string): string => resolveCachePath("limitless", "tournaments", id),
  webList: (id: string): string => resolveCachePath("limitless", "web", `list_${id}.html`),
};

export const reports = {
  file: (name: string): string => resolveCachePath("reports", name),
};

export async function writeJsonAtomic(destPath: string, value: unknown): Promise<void> {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  const tmpPath = `${destPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new TypeError("Cannot serialize undefined to JSON");
  }

  try {
    await fs.promises.writeFile(tmpPath, serialized, "utf8");
    await fs.promises.rename(tmpPath, destPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // ignore unlink error
      }
    }
    throw err;
  }
}
```

### FILE: packages/etl/src/logger.ts
```typescript
import pinoModule, { type Logger, type DestinationStream } from "pino";

const pino = (
  typeof pinoModule === "function"
    ? pinoModule
    : (pinoModule as unknown as { default: typeof pinoModule }).default
) as unknown as typeof pinoModule;

export interface LoggerOptions {
  json?: boolean | undefined;
  verbose?: boolean | undefined;
}

export const REDACTED_KEYS = /key|token|secret/i;

function maskSensitive(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(maskSensitive);
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.test(k)) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = maskSensitive(v);
    }
  }
  return result;
}

export function createEtlLogger(
  options?: LoggerOptions,
  destination?: DestinationStream
): Logger {
  const isJson = options?.json ?? false;
  const level = options?.verbose ? "debug" : "info";

  if (isJson) {
    return pino(
      {
        level,
        formatters: {
          log(object) {
            return maskSensitive(object) as Record<string, unknown>;
          },
        },
      },
      destination
    );
  }

  const stream: DestinationStream = destination ?? process.stdout;

  const writeHuman = (levelName: string, obj: unknown, msg?: string): void => {
    const timestamp = new Date().toISOString();
    let step = "";
    let messageText = msg ?? "";

    if (obj && typeof obj === "object") {
      const record = maskSensitive(obj) as Record<string, unknown>;
      if (typeof record.step === "string") {
        step = record.step;
      }
      if (!messageText && typeof record.msg === "string") {
        messageText = record.msg;
      }
    }

    const prefix = step ? `${step}: ` : "";
    const line = `${timestamp} ${levelName.toUpperCase()} ${prefix}${messageText}\n`;
    stream.write(line);
  };

  const humanLogger = {
    level,
    info(arg1: unknown, arg2?: unknown): void {
      if (typeof arg1 === "string") {
        writeHuman("info", undefined, arg1);
      } else {
        writeHuman("info", arg1, typeof arg2 === "string" ? arg2 : undefined);
      }
    },
    error(arg1: unknown, arg2?: unknown): void {
      if (typeof arg1 === "string") {
        writeHuman("error", undefined, arg1);
      } else {
        writeHuman("error", arg1, typeof arg2 === "string" ? arg2 : undefined);
      }
    },
    warn(arg1: unknown, arg2?: unknown): void {
      if (typeof arg1 === "string") {
        writeHuman("warn", undefined, arg1);
      } else {
        writeHuman("warn", arg1, typeof arg2 === "string" ? arg2 : undefined);
      }
    },
    debug(arg1: unknown, arg2?: unknown): void {
      if (typeof arg1 === "string") {
        writeHuman("debug", undefined, arg1);
      } else {
        writeHuman("debug", arg1, typeof arg2 === "string" ? arg2 : undefined);
      }
    },
    child() {
      return humanLogger;
    },
  } as unknown as Logger;

  return humanLogger;
}
```

### FILE: packages/etl/src/run-log.ts
```typescript
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

export class ConcurrentRunError extends Error {
  readonly activeRunId: number;
  readonly startedAt: string;
  constructor(kind: string, activeRunId: number, startedAt: string) {
    super(
      `Another run of kind '${kind}' is currently active (id: ${activeRunId}, started at: ${startedAt}).`
    );
    this.name = "ConcurrentRunError";
    this.activeRunId = activeRunId;
    this.startedAt = startedAt;
  }
}

export const STALE_RUN_MINUTES = 240;

if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST)) {
  try {
    const testing = await import("@pokesearch/db/testing");
    if (
      typeof (testing as { getRegisteredSchemaInitializer?: () => unknown }).getRegisteredSchemaInitializer === "function" &&
      !(testing as { getRegisteredSchemaInitializer: () => unknown }).getRegisteredSchemaInitializer()
    ) {
      const { migrate } = await import("@pokesearch/db/migrate");
      (
        testing as {
          registerSchemaInitializer: (init: { key: string; apply: (testDb: Db) => void }) => void;
        }
      ).registerSchemaInitializer({
        key: "etl_runs",
        apply: (testDb: Db) => {
          migrate(testDb);
        },
      });
    }
  } catch {
    // Ignore in non-test setups
  }
}

export function startRun(db: Db, kind: EtlRunKind): RunHandle {
  return db.transaction((tx) => {
    const active = tx.get<{ id: number; started_at: string }>(
      "SELECT id, started_at FROM etl_runs WHERE kind = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1",
      [kind]
    );

    if (active) {
      const activeStartedTime = new Date(active.started_at).getTime();
      const elapsedMs = Date.now() - activeStartedTime;
      if (elapsedMs < STALE_RUN_MINUTES * 60 * 1000) {
        throw new ConcurrentRunError(kind, active.id, active.started_at);
      }
    }

    const startedAt = new Date().toISOString();
    const result = tx.run(
      "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}')",
      [kind, startedAt]
    );
    const id = Number(result.lastInsertRowid);

    const stats: Record<string, number | string> = {};

    const handle: RunHandle = {
      id,
      kind,
      startedAt,
      add(patch: Record<string, number | string>): void {
        for (const [k, v] of Object.entries(patch)) {
          if (typeof v !== "number" && typeof v !== "string") {
            throw new TypeError(`Run stat value for '${k}' must be number or string`);
          }
          stats[k] = v;
        }
      },
      getStats(): Readonly<Record<string, number | string>> {
        return { ...stats };
      },
    };

    return handle;
  }, "immediate");
}

export function finishRun(db: Db, run: RunHandle, outcome: { error?: unknown }): void {
  const finishedAt = new Date().toISOString();
  const startTime = new Date(run.startedAt).getTime();
  const durationMs = Math.max(0, Date.now() - startTime);

  const stats = {
    ...run.getStats(),
    duration_ms: durationMs,
  };
  const statsJson = JSON.stringify(stats);

  if (outcome.error !== undefined) {
    const err = outcome.error;
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
            ? err.message
            : JSON.stringify(err);

    db.run(
      "UPDATE etl_runs SET status = 'error', finished_at = ?, stats_json = ?, error = ? WHERE id = ?",
      [finishedAt, statsJson, errorMessage, run.id]
    );
  } else {
    db.run(
      "UPDATE etl_runs SET status = 'ok', finished_at = ?, stats_json = ?, error = NULL WHERE id = ?",
      [finishedAt, statsJson, run.id]
    );
  }
}

export async function withRun<T>(
  db: Db,
  kind: EtlRunKind,
  fn: (run: RunHandle) => Promise<T>
): Promise<T> {
  const run = startRun(db, kind);
  try {
    const result = await fn(run);
    finishRun(db, run, {});
    return result;
  } catch (error) {
    finishRun(db, run, { error });
    throw error;
  }
}

export function reconcileStaleRuns(db: Db, staleMinutes: number = STALE_RUN_MINUTES): number {
  const threshold = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
  const finishedAt = new Date().toISOString();

  const result = db.run(
    "UPDATE etl_runs SET status = 'cancelled', finished_at = ? WHERE status = 'running' AND started_at <= ?",
    [finishedAt, threshold]
  );
  return result.changes;
}

export function lastRunPerKind(db: Db, kind?: EtlRunKind): EtlRunRow[] {
  if (kind) {
    return db.all<EtlRunRow>(
      "SELECT * FROM etl_runs WHERE kind = ? ORDER BY started_at DESC LIMIT 1",
      [kind]
    );
  }
  return db.all<EtlRunRow>(
    "SELECT * FROM etl_runs WHERE id IN (SELECT MAX(id) FROM etl_runs GROUP BY kind) ORDER BY kind ASC"
  );
}
```

### FILE: packages/etl/src/orchestrator.ts
```typescript
import type { Db } from "@pokesearch/db";
import type { RunHandle } from "./run-log.js";

export class NotImplementedError extends Error {
  constructor(stepName: string) {
    super(`Step '${stepName}' is not implemented yet.`);
    this.name = "NotImplementedError";
  }
}

export interface LoadOptions {
  sets?: string[] | undefined;
  force?: boolean | undefined;
  skipTcgdex?: boolean | undefined;
  concurrency?: number | undefined;
  verbose?: boolean | undefined;
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

function createStubStep(name: string): PipelineStep {
  return {
    name,
    execute: (): Promise<void> => {
      return Promise.reject(new NotImplementedError(name));
    },
  };
}

export const defaultStepRegistry: StepRegistry = {
  fetchPtcg: createStubStep("fetch-ptcg"),
  fetchTcgdex: createStubStep("fetch-tcgdex"),
  mapIds: createStubStep("map-ids"),
  loadCards: createStubStep("load-cards"),
  rebuildFts: createStubStep("rebuild-fts"),
  snapshotPrices: createStubStep("snapshot-prices"),
};

export async function runLoad(
  db: Db,
  run: RunHandle,
  options: LoadOptions,
  registry?: Partial<StepRegistry>
): Promise<void> {
  const steps: PipelineStep[] = [];
  const fetchPtcg = registry?.fetchPtcg ?? defaultStepRegistry.fetchPtcg;
  const fetchTcgdex = registry?.fetchTcgdex ?? defaultStepRegistry.fetchTcgdex;
  const mapIds = registry?.mapIds ?? defaultStepRegistry.mapIds;
  const loadCards = registry?.loadCards ?? defaultStepRegistry.loadCards;
  const rebuildFts = registry?.rebuildFts ?? defaultStepRegistry.rebuildFts;
  const snapshotPrices = registry?.snapshotPrices ?? defaultStepRegistry.snapshotPrices;

  steps.push(fetchPtcg);

  if (!options.skipTcgdex) {
    steps.push(fetchTcgdex);
  }

  steps.push(mapIds);
  steps.push(loadCards);
  steps.push(rebuildFts);

  if (!options.skipTcgdex) {
    steps.push(snapshotPrices);
  }

  const ctx: StepContext = { db, run, options };
  for (const step of steps) {
    await step.execute(ctx);
  }
}
```

### FILE: packages/etl/src/cli.ts
```typescript
#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { openDatabase, type Db } from "@pokesearch/db";
import { assertSchemaCurrent, SchemaOutdatedError } from "@pokesearch/db/migrate";
import { env } from "@pokesearch/shared/env";
import {
  withRun,
  reconcileStaleRuns,
  lastRunPerKind,
  ConcurrentRunError,
  type EtlRunKind,
  type RunHandle,
} from "./run-log.js";
import { runLoad, NotImplementedError, type LoadOptions } from "./orchestrator.js";
import { createEtlLogger, type LoggerOptions } from "./logger.js";

let activeDb: Db | null = null;
let activeRunHandle: RunHandle | null = null;

process.on("SIGINT", () => {
  const timer = setTimeout(() => {
    process.exit(130);
  }, 2000);
  timer.unref();

  if (activeDb && activeRunHandle) {
    try {
      const finishedAt = new Date().toISOString();
      activeDb.run(
        "UPDATE etl_runs SET status = 'cancelled', finished_at = ? WHERE id = ?",
        [finishedAt, activeRunHandle.id]
      );
      activeDb.close();
    } catch {
      // best effort on SIGINT
    }
  }
  process.exit(130);
});

function getDatabase(dbPath?: string): Db {
  const resolvedPath = dbPath || process.env.DATABASE_PATH || env.DATABASE_PATH;
  const db = openDatabase(resolvedPath);
  activeDb = db;
  return db;
}

function handleCliError(err: unknown): never {
  if (activeDb) {
    try {
      activeDb.close();
    } catch {
      // ignore close error
    }
    activeDb = null;
  }

  if (err instanceof SchemaOutdatedError) {
    console.error(`Database schema is outdated. Please run 'pnpm db:migrate'.`);
    process.exit(4);
  }
  if (err instanceof ConcurrentRunError) {
    console.error(err.message);
    process.exit(3);
  }
  if (err instanceof NotImplementedError) {
    console.error(err.message);
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error(String(err));
  }
  process.exit(1);
}

interface GlobalOptions {
  db?: string | undefined;
  cache?: string | undefined;
}

interface StatusOptions {
  kind?: string | undefined;
  json?: boolean | undefined;
}

interface FullOptions {
  sets?: string | undefined;
  force?: boolean | undefined;
  skipTcgdex?: boolean | undefined;
  concurrency?: number | undefined;
  json?: boolean | undefined;
  verbose?: boolean | undefined;
}

interface DeltaOptions {
  skipTcgdex?: boolean | undefined;
  json?: boolean | undefined;
  verbose?: boolean | undefined;
}

const program = new Command();

program
  .name("etl")
  .description("PokeSearch ETL CLI")
  .option("--db <path>", "SQLite database file path")
  .option("--cache <dir>", "Raw cache directory")
  .exitOverride();

program
  .command("status")
  .description("Show last ETL run status")
  .option("--kind <kind>", "Filter by run kind")
  .option("--json", "Output in JSON format")
  .action((options: StatusOptions) => {
    const parentOpts = program.opts<GlobalOptions>();
    const db = getDatabase(parentOpts.db);
    try {
      assertSchemaCurrent(db);
      reconcileStaleRuns(db);

      const rows = lastRunPerKind(db, options.kind as EtlRunKind | undefined);
      if (options.json) {
        console.log(JSON.stringify(rows, null, 2));
      } else {
        if (rows.length === 0) {
          console.log("No runs found.");
        } else {
          for (const row of rows) {
            console.log(
              `[${row.kind}] id=${row.id} status=${row.status} started=${row.started_at} finished=${row.finished_at ?? "running"}`
            );
          }
        }
      }
      db.close();
      activeDb = null;
      process.exit(0);
    } catch (err) {
      handleCliError(err);
    }
  });

program
  .command("full")
  .description("Full ingestion pipeline")
  .option("--sets <ids>", "Comma-separated set IDs")
  .option("--force", "Force re-download")
  .option("--skip-tcgdex", "Skip TCGdex ingestion")
  .option("--concurrency <n>", "Concurrency limit", (v: string) => parseInt(v, 10))
  .option("--json", "Output logs in NDJSON")
  .option("--verbose", "Verbose logging")
  .action(async (options: FullOptions) => {
    const parentOpts = program.opts<GlobalOptions>();
    const db = getDatabase(parentOpts.db);
    try {
      assertSchemaCurrent(db);
      reconcileStaleRuns(db);

      const loggerOpts: LoggerOptions = {
        json: options.json,
        verbose: options.verbose,
      };
      const logger = createEtlLogger(loggerOpts);
      logger.info({ kind: "full" }, "Starting full ETL run");

      const loadOpts: LoadOptions = {
        sets: options.sets ? options.sets.split(",") : undefined,
        force: options.force,
        skipTcgdex: options.skipTcgdex,
        concurrency: options.concurrency,
        verbose: options.verbose,
      };

      await withRun(db, "full", async (run) => {
        activeRunHandle = run;
        await runLoad(db, run, loadOpts);
      });

      activeRunHandle = null;
      db.close();
      activeDb = null;
      process.exit(0);
    } catch (err) {
      handleCliError(err);
    }
  });

program
  .command("delta")
  .description("Delta ingestion pipeline")
  .option("--skip-tcgdex", "Skip TCGdex ingestion")
  .option("--json", "Output logs in NDJSON")
  .option("--verbose", "Verbose logging")
  .action(async (options: DeltaOptions) => {
    const parentOpts = program.opts<GlobalOptions>();
    const db = getDatabase(parentOpts.db);
    try {
      assertSchemaCurrent(db);
      reconcileStaleRuns(db);

      const loadOpts: LoadOptions = {
        skipTcgdex: options.skipTcgdex,
        verbose: options.verbose,
      };

      await withRun(db, "delta", async (run) => {
        activeRunHandle = run;
        await runLoad(db, run, loadOpts);
      });

      activeRunHandle = null;
      db.close();
      activeDb = null;
      process.exit(0);
    } catch (err) {
      handleCliError(err);
    }
  });

program
  .command("prices")
  .description("Snapshot prices")
  .option("--no-refresh", "Do not refresh price source data")
  .option("--date <YYYY-MM-DD>", "Snapshot date")
  .option("--json", "Output logs in NDJSON")
  .action(async () => {
    const parentOpts = program.opts<GlobalOptions>();
    const db = getDatabase(parentOpts.db);
    try {
      assertSchemaCurrent(db);
      reconcileStaleRuns(db);

      await withRun(db, "prices", (run) => {
        activeRunHandle = run;
        return Promise.reject(new NotImplementedError("snapshot-prices"));
      });

      activeRunHandle = null;
      db.close();
      activeDb = null;
      process.exit(0);
    } catch (err) {
      handleCliError(err);
    }
  });

program
  .command("fts")
  .description("Rebuild FTS index")
  .option("--json", "Output logs in NDJSON")
  .action(async () => {
    const parentOpts = program.opts<GlobalOptions>();
    const db = getDatabase(parentOpts.db);
    try {
      assertSchemaCurrent(db);
      reconcileStaleRuns(db);

      await withRun(db, "fts", (run) => {
        activeRunHandle = run;
        return Promise.reject(new NotImplementedError("rebuild-fts"));
      });

      activeRunHandle = null;
      db.close();
      activeDb = null;
      process.exit(0);
    } catch (err) {
      handleCliError(err);
    }
  });

program
  .command("decks")
  .description("Decks ingestion pipeline")
  .option("--web", "Enable web scraping fallback")
  .option("--skip-api", "Skip API ingestion")
  .option("--days <n>", "Number of days back", (v: string) => parseInt(v, 10))
  .option("--min-players <n>", "Minimum players", (v: string) => parseInt(v, 10))
  .option("--max-tournaments <n>", "Max tournaments", (v: string) => parseInt(v, 10))
  .option("--refresh-recent-days <n>", "Refresh recent days", (v: string) => parseInt(v, 10))
  .option("--prune-days <n>", "Prune older days", (v: string) => parseInt(v, 10))
  .option("--force", "Force re-download")
  .option("--json", "Output logs in NDJSON")
  .action(async () => {
    const parentOpts = program.opts<GlobalOptions>();
    const db = getDatabase(parentOpts.db);
    try {
      assertSchemaCurrent(db);
      reconcileStaleRuns(db);

      await withRun(db, "decks", (run) => {
        activeRunHandle = run;
        return Promise.reject(new NotImplementedError("decks"));
      });

      activeRunHandle = null;
      db.close();
      activeDb = null;
      process.exit(0);
    } catch (err) {
      handleCliError(err);
    }
  });

try {
  await program.parseAsync(process.argv);
} catch (err: unknown) {
  if (err instanceof CommanderError) {
    if (activeDb) {
      try {
        activeDb.close();
      } catch {
        // ignore
      }
      activeDb = null;
    }
    if (err.exitCode === 0) {
      process.exit(0);
    }
    process.exit(2);
  }
  handleCliError(err);
}
```

### FILE: packages/etl/src/index.ts
```typescript
export * from "./paths.js";
export * from "./logger.js";
export * from "./run-log.js";
export * from "./orchestrator.js";
```

### FILE: packages/etl/README.md
```markdown
# @pokesearch/etl

Executable ETL pipeline for PokeSearch card ingestion, price snapshots, tournament decks, and full-text search indexing.

## Subcommands

- `etl full [--sets <id,...>] [--force] [--skip-tcgdex] [--concurrency <n>] [--json] [--verbose]`
- `etl delta [--skip-tcgdex] [--json]`
- `etl prices [--no-refresh] [--date <YYYY-MM-DD>] [--json]`
- `etl fts [--json]`
- `etl decks [--web] [--skip-api] [--days <n>] [--min-players <n>] [--max-tournaments <n>] [--refresh-recent-days <n>] [--prune-days <n>] [--force] [--json]`
- `etl status [--kind <kind>] [--json]`

## Global Options

- `--db <path>`: SQLite database file path (default: `$DATABASE_PATH`)
- `--cache <dir>`: Raw cache directory (default: `$RAW_CACHE_DIR`)

## Exit Codes

- `0`: Success (`etl_runs.status = 'ok'`).
- `1`: Run failed (`etl_runs.status = 'error'`).
- `2`: Usage error (invalid flag or unknown subcommand).
- `3`: Concurrency conflict (active run of same kind within 240 minutes).
- `4`: Database schema outdated (`pnpm db:migrate` required).

## Cache Directory Layout

Under `$RAW_CACHE_DIR`:
- `pokemon-tcg-data/sets/en.json`
- `pokemon-tcg-data/cards/en/${setId}.json`
- `pokemon-tcg-data/etags.json`
- `tcgdex/sets.json`
- `tcgdex/sets/${id}.json`
- `tcgdex/cards/${id}.json`
- `limitless/tournaments/${id}`
- `limitless/web/list_${id}.html`
- `reports/${name}`

## Agreed Counter Metrics

The `etl_runs.stats_json` column records counters aggregated over the run lifecycle:
- `sets`: Number of sets processed.
- `sets_changed`: Number of sets whose data changed.
- `cards`: Number of cards processed.
- `attacks`: Attack definitions extracted.
- `abilities`: Ability definitions extracted.
- `weaknesses`: Weakness definitions extracted.
- `resistances`: Resistance definitions extracted.
- `unmatched_sets`: Sets without cross-source mapping.
- `unmatched_cards`: Cards without cross-source mapping.
- `http_requests`: External HTTP requests made.
- `http_304`: Requests returning HTTP 304 Not Modified.
- `cache_hits`: Local raw cache hits.
- `price_rows`: Card market price points inserted.
- `fts_rows`: Full-text search records indexed.
- `duration_ms`: Total execution duration in milliseconds.
```
--------------------------------------------------------------------------------
================================================================================

RULES:
1. Implement the MINIMUM production code that satisfies every test and every contract in section 3. Do not modify test files.
2. Use exactly the paths, roles and actions of section 2 and the signatures of section 3. Only files with Role other than test.
3. For a file with Action = patch, return a PATCH with exact edits copied from CURRENT CONTENT. Return a full FILE only for Action = create or rewrite.
4. Rely on section 6 for existing code. Do not read the workspace.
5. You have no write tools. Return the files in the format below; the orchestrator writes them to disk.
6. Return only what you create or change. Never return a file that is unchanged.
7. If a FEEDBACK section is present above, fix exactly the problems it lists and return the complete corrected output (all files you create or change), not just the delta.

OUTPUT FORMAT (mandatory).
For a NEW file (Action = create) or a full rewrite (Action = rewrite):

### FILE: relative/path/from/repo/root/module.py
```python
def function(x: int) -> int:
    return x
```

For an EXISTING file (Action = patch), one or more exact edits. SEARCH must be copied verbatim from CURRENT CONTENT and must match exactly one place:

### PATCH: relative/path/from/repo/root/module.py
<<<<<<< SEARCH
def function(x: int) -> int:
    return x
=======
def function(x: int) -> int:
    return x


def other(y: int) -> int:
    return y * 2
>>>>>>> REPLACE

The code fence must come IMMEDIATELY after the `### FILE:` line. Nothing between the heading and the fence. Any short explanation goes before the first heading.
