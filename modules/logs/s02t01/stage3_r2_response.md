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