import { afterAll } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { registerSchemaInitializer } from "./index.js";
import { migrate, migrationsHash } from "../migrate.js";

process.env.NODE_ENV = "test";

// Register default schema initializer with current migrations
try {
  registerSchemaInitializer({
    key: migrationsHash(),
    apply: (db) => {
      migrate(db);
    },
  });
} catch {
  // Ignore initialization errors if migrations not ready
}

// Sweep old pokesearch-test-* directories older than 1 hour in temp folder
afterAll(() => {
  try {
    const baseDir = process.env.POKESEARCH_TEST_TMPDIR || os.tmpdir();
    if (!fs.existsSync(baseDir)) return;
    const entries = fs.readdirSync(baseDir);
    const now = Date.now();
    for (const entry of entries) {
      if (entry.startsWith("pokesearch-test-") || entry.startsWith("pokesearch-tmp-tmpl-")) {
        const fullPath = path.join(baseDir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > 3600 * 1000) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          }
        } catch {
          // Ignore sweep errors
        }
      }
    }
  } catch {
    // Ignore overall sweep errors
  }
});
