#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

const SQLITE_ONLY_PATTERNS = [
  /\bjson_each\b/i,
  /\bjson_tree\b/i,
  /\bMATCH\b/i,
  /\bbm25\b/i,
  /\bVACUUM\b/i,
  /\bPRAGMA\b/i,
  /\bfts5\b/i,
];

function scanSqlFiles(dir, fileList = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanSqlFiles(fullPath, fileList);
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function scanSourceFiles(dir, fileList = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanSourceFiles(fullPath, fileList);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function lintSqlFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const errors = [];

  let inSqliteOnlyBlock = false;
  let hasPostgresNote = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Check BR-S01.T04-04: Migration SQL is written WITHOUT IF NOT EXISTS
    if (/\bIF\s+NOT\s+EXISTS\b/i.test(line)) {
      errors.push({
        line: i + 1,
        message: "Forbidden 'IF NOT EXISTS' in migration SQL. Migrations must be exact and idempotent via runner.",
      });
    }

    if (line.startsWith("-- @postgres:")) {
      hasPostgresNote = true;
      continue;
    }

    if (line.startsWith("-- @sqlite-only")) {
      if (!hasPostgresNote) {
        errors.push({
          line: i + 1,
          message: "Found -- @sqlite-only block without preceding -- @postgres: note",
        });
      }
      inSqliteOnlyBlock = true;
      continue;
    }

    if (line.startsWith("-- @end")) {
      inSqliteOnlyBlock = false;
      hasPostgresNote = false;
      continue;
    }

    if (!inSqliteOnlyBlock) {
      for (const pattern of SQLITE_ONLY_PATTERNS) {
        if (pattern.test(line)) {
          errors.push({
            line: i + 1,
            message: `SQLite-only construct "${line}" outside -- @sqlite-only block`,
          });
          break;
        }
      }
    }
  }

  return errors;
}

function lintSourceDdl(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  // Allow DDL in packages/db/src/migrate.ts, dialect files, tests and test fixtures
  if (
    normalized.includes("/packages/db/src/migrate.ts") ||
    normalized.includes("/packages/db/src/dialect/") ||
    normalized.includes(".spec.") ||
    normalized.includes(".test.") ||
    normalized.includes("/testing/")
  ) {
    return [];
  }

  const content = readFileSync(filePath, "utf-8");
  const errors = [];
  // Look for DDL execution outside migrations: CREATE TABLE, ALTER TABLE, DROP TABLE
  const ddlRegex = /\b(CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i;
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ddlRegex.test(line)) {
      errors.push({
        line: i + 1,
        message: `DDL statement found outside migration runner: "${line.trim()}" (BR-S01.T04-07)`,
      });
    }
  }

  return errors;
}

const rootDir = process.cwd();
const sqlFiles = scanSqlFiles(rootDir);
let failed = false;

for (const file of sqlFiles) {
  const errs = lintSqlFile(file);
  if (errs.length > 0) {
    failed = true;
    console.error(`Lint errors in ${file}:`);
    for (const e of errs) {
      console.error(`  Line ${e.line}: ${e.message}`);
    }
  }
}

const sourceFiles = [
  ...scanSourceFiles(join(rootDir, "packages")),
  ...scanSourceFiles(join(rootDir, "apps")).catch?.(() => []) ?? [],
];

for (const file of sourceFiles) {
  const errs = lintSourceDdl(file);
  if (errs.length > 0) {
    failed = true;
    console.error(`DDL Lint errors in ${file}:`);
    for (const e of errs) {
      console.error(`  Line ${e.line}: ${e.message}`);
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  process.exit(0);
}
