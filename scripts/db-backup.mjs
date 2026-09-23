#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { openDatabase } from "../packages/db/src/client.ts";

function parseArgs() {
  const args = process.argv.slice(2);
  let dbPath = process.env.DATABASE_PATH;
  let outDir = process.env.DATA_DIR ? join(process.env.DATA_DIR, "backups") : undefined;
  let keep = 7;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--db" && i + 1 < args.length) {
      dbPath = args[++i];
    } else if (arg === "--out" && i + 1 < args.length) {
      outDir = args[++i];
    } else if (arg === "--keep" && i + 1 < args.length) {
      keep = Number(args[++i]);
    } else if (arg === "--json") {
      json = true;
    }
  }

  if (!dbPath) {
    dbPath = resolve(process.cwd(), "pokesearch.db");
  }
  if (!outDir) {
    outDir = resolve(process.cwd(), "backups");
  }

  return { dbPath: resolve(dbPath), outDir: resolve(outDir), keep, json };
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function run() {
  const { dbPath, outDir, keep, json } = parseArgs();

  if (!existsSync(dbPath)) {
    if (json) {
      console.log(JSON.stringify({ ok: false, error: `Database file not found: ${dbPath}` }));
    } else {
      console.error(`Database file not found: ${dbPath}`);
    }
    process.exit(2);
  }

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const now = new Date();
  let filename = `pokesearch-${formatDate(now)}.db`;
  let backupPath = join(outDir, filename);

  if (existsSync(backupPath)) {
    filename = `pokesearch-${formatDate(now)}-2.db`;
    backupPath = join(outDir, filename);
  }

  // Step 1: Open source DB, checkpoint WAL, and VACUUM INTO target
  let sourceDb;
  try {
    sourceDb = openDatabase(dbPath);
    try {
      sourceDb.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // Best-effort WAL truncate
    }

    const escapedTarget = backupPath.replace(/'/g, "''");
    sourceDb.exec(`VACUUM INTO '${escapedTarget}';`);
  } catch (err) {
    if (existsSync(backupPath)) {
      try {
        unlinkSync(backupPath);
      } catch {
        // Ignore deletion error
      }
    }
    if (json) {
      console.log(JSON.stringify({ ok: false, error: (err && err.message) || String(err) }));
    } else {
      console.error("Backup failed:", err);
    }
    process.exit(1);
  } finally {
    if (sourceDb) {
      try {
        sourceDb.close();
      } catch {
        // Ignore close error
      }
    }
  }

  // Step 2: Reopen backup read-only and verify integrity
  let verified = false;
  let backupDb;
  try {
    backupDb = openDatabase(backupPath, { readonly: true });
    const check = backupDb.pragma("integrity_check");
    if (check === "ok") {
      verified = true;
    }
  } catch (err) {
    verified = false;
  } finally {
    if (backupDb) {
      try {
        backupDb.close();
      } catch {
        // Ignore close error
      }
    }
  }

  if (!verified) {
    if (existsSync(backupPath)) {
      try {
        unlinkSync(backupPath);
      } catch {
        // Ignore cleanup error
      }
    }
    if (json) {
      console.log(JSON.stringify({ ok: false, error: "PRAGMA integrity_check failed" }));
    } else {
      console.error("PRAGMA integrity_check failed");
    }
    process.exit(1);
  }

  // Step 3: Prune old backups, preserving newest --keep N copies
  if (keep > 0 && existsSync(outDir)) {
    try {
      const files = readdirSync(outDir)
        .filter((f) => f.endsWith(".db"))
        .map((f) => {
          const fullPath = join(outDir, f);
          return { fullPath, mtime: statSync(fullPath).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > keep) {
        const toDelete = files.slice(keep);
        for (const item of toDelete) {
          try {
            unlinkSync(item.fullPath);
          } catch {
            // Ignore deletion error
          }
        }
      }
    } catch {
      // Ignore prune errors
    }
  }

  if (json) {
    console.log(JSON.stringify({ ok: true, backupPath }));
  } else {
    console.log(`Backup successfully created at ${backupPath}`);
  }
  process.exit(0);
}

run();
