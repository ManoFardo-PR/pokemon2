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
  const dbToClose = activeDb;
  if (dbToClose) {
    try {
      dbToClose.close();
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
  const currentDb = activeDb as Db | null;
  if (err instanceof CommanderError) {
    if (currentDb) {
      try {
        currentDb.close();
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
