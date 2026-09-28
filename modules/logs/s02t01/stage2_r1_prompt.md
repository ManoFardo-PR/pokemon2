You are a Senior QA Automation Engineer and TDD specialist. You are executing the RED phase (tests first) of subtask S02T01.

TEST RUNNER: `pnpm test`

================================================================================
MASTER PLAN (output of Stage 1). It is self-contained: do not read the workspace.
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
CURRENT CONTENT OF FILES THAT ALREADY EXIST (injected by the orchestrator; empty if none):
================================================================================
(none)
================================================================================

RULES:
1. Do NOT write production code. Only the files marked with Role = test in section 2 of the plan.
2. Cover EVERY assertion in section 4 of the plan, plus the edge cases of the business rules in section 3.
3. Tests must be syntactically valid and runnable by the test runner above. They MUST fail now (production code does not exist yet) and pass once the code in section 3 is implemented.
4. Import the production code exactly as section 4 of the plan states. Never use relative imports unless the plan says so.
5. If the task has no testable logic (for example, it only creates a package), write at least one test that checks the module can be imported.
6. You have no write tools. Return the files in the format below; the orchestrator writes them to disk.
7. Return only what you create or change. Never return a file that is unchanged.

OUTPUT FORMAT (mandatory).
For a NEW file (Action = create) or a full rewrite (Action = rewrite):

### FILE: relative/path/from/repo/root/test_example.py
```python
import unittest
from package.module import function

class TestExample(unittest.TestCase):
    def test_case(self):
        self.assertEqual(function(1), 1)

if __name__ == "__main__":
    unittest.main()
```

For an EXISTING file (Action = patch), one or more exact edits. SEARCH must be copied verbatim from CURRENT CONTENT above and must match exactly one place:

### PATCH: relative/path/from/repo/root/test_example.py
<<<<<<< SEARCH
    def test_case(self):
        self.assertEqual(function(1), 1)
=======
    def test_case(self):
        self.assertEqual(function(1), 1)

    def test_other(self):
        self.assertEqual(function(2), 2)
>>>>>>> REPLACE

The code fence must come IMMEDIATELY after the `### FILE:` line. Nothing between the heading and the fence. Any short explanation goes before the first heading.
