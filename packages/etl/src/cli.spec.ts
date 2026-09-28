// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openDatabase, migrate } from "@pokesearch/db";
import { findRepoRoot } from "@pokesearch/shared/env";

const execFileAsync = promisify(execFile);

describe("CLI entry point (etl)", () => {
  let tempDir: string;
  let dbPath: string;
  let cacheDir: string;
  const repoRoot = findRepoRoot();
  const cliPath = path.join(repoRoot, "packages", "etl", "src", "cli.ts");

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-cli-test-"));
    dbPath = path.join(tempDir, "test.db");
    cacheDir = path.join(tempDir, "raw-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Windows file lock delay safety
      }
    }
  });

  async function runCli(args: string[], envOverrides: Record<string, string> = {}) {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ["--import=tsx", cliPath, ...args],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            NODE_ENV: "development",
            DATABASE_PATH: dbPath,
            RAW_CACHE_DIR: cacheDir,
            ...envOverrides,
          },
        }
      );
      return { code: 0, stdout, stderr };
    } catch (err: unknown) {
      const error = err;
      return {
        code: typeof error?.code === "number" ? error.code : 1,
        stdout: error?.stdout ?? "",
        stderr: error?.stderr ?? "",
      };
    }
  }

  it("etl status on freshly migrated database outputs 'no runs' and exits with code 0", async () => {
    const db = openDatabase(dbPath);
    migrate(db);
    db.close();

    const result = await runCli(["status"]);
    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("no runs");
  });

  it("etl bogus command exits with code 2 and displays usage help block", async () => {
    const result = await runCli(["bogus"]);
    expect(result.code).toBe(2);
    expect(result.stderr + result.stdout).toMatch(/error: unknown command|usage:/i);
  });

  it("etl full with unknown flag exits with code 2", async () => {
    const result = await runCli(["full", "--nope"]);
    expect(result.code).toBe(2);
    expect(result.stderr + result.stdout).toMatch(/unknown option/i);
  });

  it("exits with code 4 and prints 'pnpm db:migrate' when database schema is outdated", async () => {
    // Database exists without migrations applied
    const db = openDatabase(dbPath);
    db.exec("CREATE TABLE placeholder (id INTEGER PRIMARY KEY);");
    db.close();

    const result = await runCli(["status"]);
    expect(result.code).toBe(4);
    expect(result.stderr + result.stdout).toContain("pnpm db:migrate");

    // Must not create any etl_runs row
    const dbCheck = openDatabase(dbPath);
    const tableCheck = dbCheck.get(
      "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='etl_runs'"
    );
    expect(tableCheck?.count).toBe(0);
    dbCheck.close();
  });

  it("exits with code 3 on concurrent run conflict (BR-S02.T01-05)", async () => {
    const db = openDatabase(dbPath);
    migrate(db);
    // Seed an active running run
    db.run(
      "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES ('full', ?, 'running', '{}')",
      [new Date().toISOString()]
    );
    db.close();

    const result = await runCli(["full"]);
    expect(result.code).toBe(3);
    expect(result.stderr + result.stdout).toMatch(/concurrent|active/i);
  });

  it("exits with code 1 when step execution fails and logs status='error' (BR-S02.T01-08)", async () => {
    const db = openDatabase(dbPath);
    migrate(db);
    db.close();

    // Default step stubs throw NotImplementedError
    const result = await runCli(["full"]);
    expect(result.code).toBe(1);

    const dbCheck = openDatabase(dbPath);
    const runRow = dbCheck.get(
      "SELECT status, error FROM etl_runs WHERE kind = 'full' ORDER BY id DESC LIMIT 1"
    );
    expect(runRow).toBeDefined();
    expect(runRow?.status).toBe("error");
    expect(runRow?.error).toBeDefined();
    dbCheck.close();
  });
});
