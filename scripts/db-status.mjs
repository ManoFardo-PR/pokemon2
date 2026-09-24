#!/usr/bin/env node

import { resolve } from "node:path";
import { openDatabase } from "../packages/db/src/client.ts";
import {
  migrationStatus,
  MigrationValidationError,
  MigrationChecksumError,
} from "../packages/db/src/migrate.ts";

function parseArgs() {
  const args = process.argv.slice(2);
  let dbPath = process.env.DATABASE_PATH || "local.db";
  let dir;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--db" && i + 1 < args.length) {
      dbPath = args[++i];
    } else if (arg === "--dir" && i + 1 < args.length) {
      dir = args[++i];
    } else if (arg === "--json") {
      json = true;
    }
  }

  return { dbPath: resolve(dbPath), dir, json };
}

async function main() {
  const opts = parseArgs();
  let db;
  try {
    db = openDatabase(opts.dbPath);
    const status = migrationStatus(db, opts.dir);

    if (opts.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(`Database: ${status.databasePath}`);
      console.log(`SQLite Version: ${status.sqliteVersion}`);
      console.log(`Schema Version: ${status.schemaVersion}`);
      console.log(`Applied: ${status.applied.length}`);
      console.log(`Pending: ${status.pending.length}`);
      if (status.pending.length > 0) {
        console.log("Pending migrations:");
        for (const p of status.pending) {
          console.log(`  - ${p.version}: ${p.name}`);
        }
      }
    }

    if (status.pending.length > 0) {
      process.exit(3);
    } else {
      process.exit(0);
    }
  } catch (err) {
    if (
      err instanceof MigrationValidationError ||
      err instanceof MigrationChecksumError
    ) {
      if (opts.json) {
        console.error(JSON.stringify({ error: err.message, type: err.name }));
      } else {
        console.error(`Validation Error: ${err.message}`);
      }
      process.exit(2);
    } else {
      if (opts.json) {
        console.error(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          })
        );
      } else {
        console.error(
          `Unexpected Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      process.exit(1);
    }
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }
}

main();
