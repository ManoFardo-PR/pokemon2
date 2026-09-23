import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { openDatabase } from "./client.js";

describe("BR-S01.T02-04: Multi-process concurrency spec", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pokesearch-concurrency-test-"));
    dbPath = join(tempDir, "concurrent.db");

    // Initialize database schema
    const db = openDatabase(dbPath);
    db.exec(`
      CREATE TABLE test_inserts (
        id TEXT PRIMARY KEY,
        worker_id INTEGER NOT NULL,
        val INTEGER NOT NULL
      );
    `);
    db.close();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("completes 2 processes x 1000 inserts with zero SQLITE_BUSY errors", () => {
    // Child script code that opens database and runs 1000 inserts in transactions
    const childWorkerScript = `
      import { openDatabase } from "./src/client.ts";
      const dbPath = process.argv[1];
      const workerId = Number(process.argv[2]);
      const db = openDatabase(dbPath, { busyTimeoutMs: 5000 });

      try {
        for (let i = 0; i < 1000; i++) {
          db.transaction((tx) => {
            tx.run("INSERT INTO test_inserts (id, worker_id, val) VALUES (?, ?, ?);", [
              \`worker-\${workerId}-\${i}\`,
              workerId,
              i
            ]);
          }, "immediate");
        }
        process.exit(0);
      } catch (err) {
        console.error("Worker " + workerId + " error:", err);
        process.exit(1);
      } finally {
        db.close();
      }
    `;

    // Run two processes concurrently
    const scriptPath = join(tempDir, "worker.mjs");
    // We write worker.mjs or execute node with inline code.
    // Notice: in RED phase, packages/db/src/client.ts doesn't exist yet, so this will fail to run or import.
    const dbPkgDir = process.cwd().endsWith("packages/db") || process.cwd().endsWith("packages\\db")
      ? process.cwd()
      : join(process.cwd(), "packages/db");

    const proc1 = spawnSync(
      process.execPath,
      ["--no-warnings=ExperimentalWarning", "--input-type=module", "-e", childWorkerScript, dbPath, "1"],
      { cwd: dbPkgDir, encoding: "utf-8" }
    );

    const proc2 = spawnSync(
      process.execPath,
      ["--no-warnings=ExperimentalWarning", "--input-type=module", "-e", childWorkerScript, dbPath, "2"],
      { cwd: dbPkgDir, encoding: "utf-8" }
    );

    expect(proc1.status).toBe(0);
    expect(proc2.status).toBe(0);

    const verifyDb = openDatabase(dbPath);
    try {
      const row = verifyDb.get<{ total: number }>("SELECT count(*) as total FROM test_inserts;");
      expect(row?.total).toBe(2000);
    } finally {
      verifyDb.close();
    }
  });
});
