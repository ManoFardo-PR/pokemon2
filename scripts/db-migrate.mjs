#!/usr/bin/env node

import { resolve } from "node:path";
import { openDatabase } from "../packages/db/src/client.ts";
import {
  migrate,
  MigrationValidationError,
  MigrationChecksumError,
  MigrationError,
} from "../packages/db/src/migrate.ts";

function parseArgs() {
  const args = process.argv.slice(2);
  let dbPath = process.env.DATABASE_PATH || "local.db";
  let dir;
  let to;
  let dryRun = false;
  let json = false;
  let allowChecksumDrift = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--db" && i + 1 < args.length) {
      dbPath = args[++i];
    } else if (arg === "--dir" && i + 1 < args.length) {
      dir = args[++i];
    } else if (arg === "--to" && i + 1 < args.length) {
      to = parseInt(args[++i], 10);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--allow-checksum-drift") {
      allowChecksumDrift = true;
    }
  }

  return { dbPath: resolve(dbPath), dir, to, dryRun, json, allowChecksumDrift };
}

async function main() {
  const opts = parseArgs();
  let db;
  try {
    db = openDatabase(opts.dbPath);
    const result = migrate(db, {
      dir: opts.dir,
      to: opts.to,
      dryRun: opts.dryRun,
      allowChecksumDrift: opts.allowChecksumDrift,
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `Migration complete: ${result.applied.length} applied, current version: ${result.schemaVersion}`
      );
    }
    process.exit(0);
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
    } else if (err instanceof MigrationError) {
      if (opts.json) {
        console.error(JSON.stringify({ error: err.message, type: err.name }));
      } else {
        console.error(`Migration Failed: ${err.message}`);
      }
      process.exit(1);
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
