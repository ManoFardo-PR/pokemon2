import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createTestDb } from "@pokesearch/db/testing";

describe("Server Startup & Schema Invariants (BR-S01.T07-01)", () => {
  let tempDir: string;
  const serverPath = fileURLToPath(new URL("./server.ts", import.meta.url));

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pokesearch-api-server-test-"));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("exits with code 2 when database has pending migrations and MIGRATE_ON_START=0", () => {
    // Fresh unmigrated database path
    const dbPath = join(tempDir, "unmigrated.db");
    const testDb = createTestDb();
    // Do not run migrations on unmigrated.db or create an empty file
    testDb.cleanup();

    const res = spawnSync(
      process.execPath,
      [
        "--no-warnings=ExperimentalWarning",
        "--import",
        "tsx",
        serverPath,
      ],
      {
        env: {
          ...process.env,
          DATABASE_PATH: dbPath,
          MIGRATE_ON_START: "0",
        },
        encoding: "utf-8",
      }
    );

    expect(res.status).toBe(2);
  });
});
