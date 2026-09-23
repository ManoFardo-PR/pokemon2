#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const SQLITE_ONLY_PATTERNS = [
  /\bjson_each\b/i,
  /\bjson_tree\b/i,
  /\bMATCH\b/i,
  /\bbm25\b/i,
  /\bVACUUM\b/i,
  /\bPRAGMA\b/i,
  /\bfts5\b/i,
];

function scanDir(dir, fileList = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, fileList);
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
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
    const line = lines[i].trim();

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

const rootDir = process.cwd();
const sqlFiles = scanDir(rootDir);
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

if (failed) {
  process.exit(1);
} else {
  process.exit(0);
}
