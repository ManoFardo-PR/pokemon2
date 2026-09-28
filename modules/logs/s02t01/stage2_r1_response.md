### FILE: packages/etl/src/paths.spec.ts
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findRepoRoot } from "@pokesearch/shared/env";
import {
  cacheRoot,
  resolveCachePath,
  ptcg,
  tcgdex,
  limitless,
  reports,
  writeJsonAtomic,
  CachePathError,
} from "./paths.js";

describe("paths", () => {
  let tempCacheDir: string;
  const originalRawCacheDir = process.env.RAW_CACHE_DIR;

  beforeEach(() => {
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-cache-test-"));
    process.env.RAW_CACHE_DIR = tempCacheDir;
  });

  afterEach(() => {
    if (originalRawCacheDir === undefined) {
      delete process.env.RAW_CACHE_DIR;
    } else {
      process.env.RAW_CACHE_DIR = originalRawCacheDir;
    }
    if (fs.existsSync(tempCacheDir)) {
      fs.rmSync(tempCacheDir, { recursive: true, force: true });
    }
  });

  describe("cacheRoot", () => {
    it("returns normalized directory and ensures it exists", () => {
      const nonExistentSub = path.join(tempCacheDir, "nested", "cache");
      process.env.RAW_CACHE_DIR = nonExistentSub;

      const root = cacheRoot();
      expect(root).toBe(path.resolve(nonExistentSub));
      expect(fs.existsSync(root)).toBe(true);
      expect(fs.statSync(root).isDirectory()).toBe(true);
    });
  });

  describe("resolveCachePath", () => {
    it("resolves valid subpath inside cacheRoot", () => {
      const resolved = resolveCachePath("test", "subfile.json");
      expect(resolved).toBe(path.join(path.resolve(tempCacheDir), "test", "subfile.json"));
    });

    it("throws CachePathError when given path traversal outside cacheRoot", () => {
      expect(() => resolveCachePath("..", "outside.json")).toThrow(CachePathError);
      expect(() => resolveCachePath("nested", "..", "..", "outside.json")).toThrow(CachePathError);
    });

    it("throws CachePathError when given an absolute path outside RAW_CACHE_DIR", () => {
      const outsideDir = os.tmpdir();
      const outsidePath = path.join(outsideDir, "escape.json");
      expect(() => resolveCachePath(outsidePath)).toThrow(CachePathError);
    });

    it("throws CachePathError when target resolves inside repository root", () => {
      const repoRoot = findRepoRoot();
      const insideRepo = path.join(repoRoot, "packages", "etl", "escaped.json");
      expect(() => resolveCachePath(insideRepo)).toThrow(CachePathError);
    });
  });

  describe("source path generators", () => {
    it("ptcg.setsFile returns expected path under cacheRoot", () => {
      const p = ptcg.setsFile();
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "pokemon-tcg-data", "sets", "en.json"));
    });

    it("ptcg.cardsFile returns expected path under cacheRoot", () => {
      const p = ptcg.cardsFile("sv3pt5");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "pokemon-tcg-data", "cards", "en", "sv3pt5.json"));
    });

    it("ptcg.etagsFile returns expected path under cacheRoot", () => {
      const p = ptcg.etagsFile();
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "pokemon-tcg-data", "etags.json"));
    });

    it("tcgdex.setsFile returns expected path under cacheRoot", () => {
      const p = tcgdex.setsFile();
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "tcgdex", "sets.json"));
    });

    it("tcgdex.setFile returns expected path under cacheRoot", () => {
      const p = tcgdex.setFile("sv03.5");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "tcgdex", "sets", "sv03.5.json"));
    });

    it("tcgdex.cardFile returns expected path under cacheRoot", () => {
      const p = tcgdex.cardFile("sv03.5-001");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "tcgdex", "cards", "sv03.5-001.json"));
    });

    it("limitless.tournamentDir returns expected path under cacheRoot", () => {
      const p = limitless.tournamentDir("T123");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "limitless", "tournaments", "T123"));
    });

    it("limitless.webList returns expected path under cacheRoot", () => {
      const p = limitless.webList("L456");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "limitless", "web", "list_L456.html"));
    });

    it("reports.file returns expected path under cacheRoot", () => {
      const p = reports.file("idmap_unmatched_cards.csv");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "reports", "idmap_unmatched_cards.csv"));
    });
  });

  describe("writeJsonAtomic", () => {
    it("writes JSON cleanly and replaces file atomically", async () => {
      const dest = resolveCachePath("test-atomic", "data.json");
      const payload = { hello: "world", count: 42, active: true };

      await writeJsonAtomic(dest, payload);

      expect(fs.existsSync(dest)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(dest, "utf8"));
      expect(parsed).toEqual(payload);

      // Overwrite atomically
      const updated = { hello: "world-updated", count: 99 };
      await writeJsonAtomic(dest, updated);
      expect(JSON.parse(fs.readFileSync(dest, "utf8"))).toEqual(updated);
    });

    it("cleans up temporary files on write error", async () => {
      const targetDir = path.join(tempCacheDir, "test-atomic-err");
      fs.mkdirSync(targetDir, { recursive: true });
      const dest = path.join(targetDir, "failing.json");

      // Circular object causes JSON.stringify to throw
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      await expect(writeJsonAtomic(dest, circular)).rejects.toThrow();

      // Ensure no dangling .tmp files exist in targetDir
      const files = fs.readdirSync(targetDir);
      const tmpFiles = files.filter((f) => f.includes(".tmp."));
      expect(tmpFiles).toHaveLength(0);
      expect(fs.existsSync(dest)).toBe(false);
    });
  });
});
```

### FILE: packages/etl/src/logger.spec.ts
```ts
import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { createEtlLogger, REDACTED_KEYS } from "./logger.js";

describe("logger", () => {
  it("matches expected sensitive keys with REDACTED_KEYS regexp", () => {
    expect(REDACTED_KEYS.test("LIMITLESS_API_KEY")).toBe(true);
    expect(REDACTED_KEYS.test("apiKey")).toBe(true);
    expect(REDACTED_KEYS.test("secret_token")).toBe(true);
    expect(REDACTED_KEYS.test("api_secret")).toBe(true);
    expect(REDACTED_KEYS.test("user_token")).toBe(true);
    expect(REDACTED_KEYS.test("sets_count")).toBe(false);
    expect(REDACTED_KEYS.test("cards")).toBe(false);
  });

  it("redacts sensitive keys in JSON NDJSON mode", async () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = createEtlLogger({ json: true }, dest);
    logger.info({
      LIMITLESS_API_KEY: "secret-12345",
      user_token: "tok_abcdef",
      apiKey: "key_xyz",
      safeField: "visible",
    }, "API call executed");

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.msg).toBe("API call executed");
    expect(parsed.LIMITLESS_API_KEY).toBe("[REDACTED]");
    expect(parsed.user_token).toBe("[REDACTED]");
    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.safeField).toBe("visible");
  });

  it("formats log output in JSON mode containing run_id, kind, step, and counters", () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = createEtlLogger({ json: true }, dest);
    logger.info({
      run_id: 12,
      kind: "full",
      step: "fetch-ptcg",
      sets: 150,
      cards: 15000,
    }, "Step completed");

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.run_id).toBe(12);
    expect(parsed.kind).toBe("full");
    expect(parsed.step).toBe("fetch-ptcg");
    expect(parsed.sets).toBe(150);
    expect(parsed.cards).toBe(15000);
  });

  it("formats log output in human format without raw JSON dump", () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = createEtlLogger({ json: false }, dest);
    logger.info({ step: "map-ids" }, "Mapped 420 cards");

    expect(lines.length).toBeGreaterThan(0);
    const output = lines.join("");
    expect(output).toContain("Mapped 420 cards");
    // Human format should not be a raw NDJSON object string
    expect(output.trim().startsWith("{")).toBe(false);
  });
});
```

### FILE: packages/etl/src/run-log.spec.ts
```ts
import { describe, it, expect } from "vitest";
import { withTempDbAsync } from "@pokesearch/db/testing";
import {
  startRun,
  finishRun,
  withRun,
  reconcileStaleRuns,
  lastRunPerKind,
  STALE_RUN_MINUTES,
  ConcurrentRunError,
} from "./run-log.js";

describe("run-log bookkeeping", () => {
  it("withRun inserts status='running', finishes with status='ok' and duration counter (BR-S02.T01-01)", async () => {
    await withTempDbAsync(async ({ db }) => {
      let capturedId = -1;

      const result = await withRun(db, "full", async (run) => {
        capturedId = run.id;
        expect(run.kind).toBe("full");
        expect(run.startedAt).toBeDefined();

        // While running, verify row status in database
        const row = db.get<{ status: string; finished_at: string | null }>(
          "SELECT status, finished_at FROM etl_runs WHERE id = ?",
          [run.id]
        );
        expect(row?.status).toBe("running");
        expect(row?.finished_at).toBeNull();

        run.add({ sets: 10, cards: 500 });
        return "success-result";
      });

      expect(result).toBe("success-result");

      // Verify row updated to ok with stats and finished_at
      const row = db.get<{
        status: string;
        finished_at: string | null;
        stats_json: string;
        error: string | null;
      }>(
        "SELECT status, finished_at, stats_json, error FROM etl_runs WHERE id = ?",
        [capturedId]
      );
      expect(row?.status).toBe("ok");
      expect(row?.finished_at).not.toBeNull();
      expect(row?.error).toBeNull();

      const stats = JSON.parse(row!.stats_json);
      expect(stats.sets).toBe(10);
      expect(stats.cards).toBe(500);
      expect(typeof stats.duration_ms).toBe("number");
      expect(stats.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  it("withRun records status='error', error message, and retains partial counters (BR-S02.T01-02)", async () => {
    await withTempDbAsync(async ({ db }) => {
      let capturedId = -1;

      await expect(
        withRun(db, "delta", async (run) => {
          capturedId = run.id;
          run.add({ sets: 5, cards: 120 });
          throw new Error("Network timeout during fetch");
        })
      ).rejects.toThrow("Network timeout during fetch");

      const row = db.get<{
        status: string;
        finished_at: string | null;
        stats_json: string;
        error: string | null;
      }>(
        "SELECT status, finished_at, stats_json, error FROM etl_runs WHERE id = ?",
        [capturedId]
      );
      expect(row?.status).toBe("error");
      expect(row?.finished_at).not.toBeNull();
      expect(row?.error).toContain("Network timeout during fetch");

      const stats = JSON.parse(row!.stats_json);
      expect(stats.sets).toBe(5);
      expect(stats.cards).toBe(120);
      expect(typeof stats.duration_ms).toBe("number");
      // Must never store empty "{}" when counters exist
      expect(row?.stats_json).not.toBe("{}");
    });
  });

  it("RunHandle.add throws TypeError when given nested objects or non-scalar values", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "prices");
      try {
        expect(() => {
          run.add({ nested: { a: 1 } as unknown as number });
        }).toThrow(TypeError);

        expect(() => {
          run.add({ list: [1, 2, 3] as unknown as string });
        }).toThrow(TypeError);

        // Valid primitives should succeed
        expect(() => {
          run.add({ price_rows: 1500, label: "usd" });
        }).not.toThrow();

        expect(run.getStats()).toMatchObject({ price_rows: 1500, label: "usd" });
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("starting a second run of the same kind throws ConcurrentRunError (BR-S02.T01-05)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run1 = startRun(db, "full");
      try {
        expect(() => startRun(db, "full")).toThrow(ConcurrentRunError);

        try {
          startRun(db, "full");
        } catch (err) {
          expect(err).toBeInstanceOf(ConcurrentRunError);
          const cre = err as ConcurrentRunError;
          expect(cre.activeRunId).toBe(run1.id);
          expect(cre.startedAt).toBe(run1.startedAt);
        }
      } finally {
        finishRun(db, run1, {});
      }
    });
  });

  it("starting runs of different kinds succeeds concurrently", async () => {
    await withTempDbAsync(async ({ db }) => {
      const runDecks = startRun(db, "decks");
      const runPrices = startRun(db, "prices");

      try {
        expect(runDecks.id).not.toBe(runPrices.id);
        expect(runDecks.kind).toBe("decks");
        expect(runPrices.kind).toBe("prices");
      } finally {
        finishRun(db, runDecks, {});
        finishRun(db, runPrices, {});
      }
    });
  });

  it("reconcileStaleRuns updates rows older than STALE_RUN_MINUTES to status='cancelled' (BR-S02.T01-06)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const now = Date.now();
      const oldStartedAt = new Date(now - (STALE_RUN_MINUTES + 10) * 60 * 1000).toISOString();
      const recentStartedAt = new Date(now - 10 * 60 * 1000).toISOString();

      // Seed an old stale running row
      db.run(
        "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}')",
        ["full", oldStartedAt]
      );
      const staleId = Number(db.get<{ id: number }>("SELECT last_insert_rowid() AS id")!.id);

      // Seed a recent active running row
      db.run(
        "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}')",
        ["delta", recentStartedAt]
      );
      const recentId = Number(db.get<{ id: number }>("SELECT last_insert_rowid() AS id")!.id);

      const reconciledCount = reconcileStaleRuns(db, STALE_RUN_MINUTES);
      expect(reconciledCount).toBe(1);

      // Stale row must be cancelled with finished_at set
      const staleRow = db.get<{ status: string; finished_at: string | null }>(
        "SELECT status, finished_at FROM etl_runs WHERE id = ?",
        [staleId]
      );
      expect(staleRow?.status).toBe("cancelled");
      expect(staleRow?.finished_at).not.toBeNull();

      // Recent row must remain running
      const recentRow = db.get<{ status: string; finished_at: string | null }>(
        "SELECT status, finished_at FROM etl_runs WHERE id = ?",
        [recentId]
      );
      expect(recentRow?.status).toBe("running");
      expect(recentRow?.finished_at).toBeNull();
    });
  });

  it("lastRunPerKind returns latest record for each distinct kind or filtered kind", async () => {
    await withTempDbAsync(async ({ db }) => {
      // Empty initially
      expect(lastRunPerKind(db)).toEqual([]);

      // Insert multiple runs across kinds
      const t1 = "2026-01-01T10:00:00.000Z";
      const t2 = "2026-01-01T11:00:00.000Z";
      const t3 = "2026-01-01T12:00:00.000Z";

      db.run(
        "INSERT INTO etl_runs (kind, started_at, finished_at, status, stats_json) VALUES ('full', ?, ?, 'ok', '{}')",
        [t1, t1]
      );
      db.run(
        "INSERT INTO etl_runs (kind, started_at, finished_at, status, stats_json) VALUES ('full', ?, ?, 'ok', '{}')",
        [t2, t2]
      );
      db.run(
        "INSERT INTO etl_runs (kind, started_at, finished_at, status, stats_json) VALUES ('delta', ?, ?, 'ok', '{}')",
        [t3, t3]
      );

      const allLatest = lastRunPerKind(db);
      expect(allLatest).toHaveLength(2);
      const fullLatest = allLatest.find((r) => r.kind === "full");
      const deltaLatest = allLatest.find((r) => r.kind === "delta");

      expect(fullLatest?.started_at).toBe(t2);
      expect(deltaLatest?.started_at).toBe(t3);

      // Filtered by specific kind
      const filteredFull = lastRunPerKind(db, "full");
      expect(filteredFull).toHaveLength(1);
      expect(filteredFull[0]?.started_at).toBe(t2);
    });
  });
});
```

### FILE: packages/etl/src/orchestrator.spec.ts
```ts
import { describe, it, expect, vi } from "vitest";
import { withTempDbAsync } from "@pokesearch/db/testing";
import { runLoad, NotImplementedError, defaultStepRegistry } from "./orchestrator.js";
import { startRun, finishRun } from "./run-log.js";

describe("pipeline orchestrator", () => {
  it("invokes steps in exact order: fetch-ptcg -> fetch-tcgdex -> map-ids -> load-cards -> rebuild-fts -> snapshot-prices (BR-S02.T01-04)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        const executedOrder: string[] = [];

        const mockRegistry = {
          fetchPtcg: {
            name: "fetch-ptcg",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-ptcg");
            }),
          },
          fetchTcgdex: {
            name: "fetch-tcgdex",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-tcgdex");
            }),
          },
          mapIds: {
            name: "map-ids",
            execute: vi.fn(async () => {
              executedOrder.push("map-ids");
            }),
          },
          loadCards: {
            name: "load-cards",
            execute: vi.fn(async () => {
              executedOrder.push("load-cards");
            }),
          },
          rebuildFts: {
            name: "rebuild-fts",
            execute: vi.fn(async () => {
              executedOrder.push("rebuild-fts");
            }),
          },
          snapshotPrices: {
            name: "snapshot-prices",
            execute: vi.fn(async () => {
              executedOrder.push("snapshot-prices");
            }),
          },
        };

        await runLoad(db, run, {}, mockRegistry);

        expect(executedOrder).toEqual([
          "fetch-ptcg",
          "fetch-tcgdex",
          "map-ids",
          "load-cards",
          "rebuild-fts",
          "snapshot-prices",
        ]);
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("skips fetch-tcgdex and snapshot-prices when skipTcgdex is true (BR-S02.T01-04)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        const executedOrder: string[] = [];

        const mockRegistry = {
          fetchPtcg: {
            name: "fetch-ptcg",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-ptcg");
            }),
          },
          fetchTcgdex: {
            name: "fetch-tcgdex",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-tcgdex");
            }),
          },
          mapIds: {
            name: "map-ids",
            execute: vi.fn(async () => {
              executedOrder.push("map-ids");
            }),
          },
          loadCards: {
            name: "load-cards",
            execute: vi.fn(async () => {
              executedOrder.push("load-cards");
            }),
          },
          rebuildFts: {
            name: "rebuild-fts",
            execute: vi.fn(async () => {
              executedOrder.push("rebuild-fts");
            }),
          },
          snapshotPrices: {
            name: "snapshot-prices",
            execute: vi.fn(async () => {
              executedOrder.push("snapshot-prices");
            }),
          },
        };

        await runLoad(db, run, { skipTcgdex: true }, mockRegistry);

        expect(executedOrder).toEqual([
          "fetch-ptcg",
          "map-ids",
          "load-cards",
          "rebuild-fts",
        ]);
        expect(mockRegistry.fetchTcgdex.execute).not.toHaveBeenCalled();
        expect(mockRegistry.snapshotPrices.execute).not.toHaveBeenCalled();
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("throws NotImplementedError when default stub steps are invoked", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        await expect(runLoad(db, run, {}, defaultStepRegistry)).rejects.toThrow(
          NotImplementedError
        );
      } finally {
        finishRun(db, run, {});
      }
    });
  });
});
```

### FILE: packages/etl/src/cli.spec.ts
```ts
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
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function runCli(args: string[], envOverrides: Record<string, string> = {}) {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ["--no-warnings=ExperimentalWarning", cliPath, ...args],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            DATABASE_PATH: dbPath,
            RAW_CACHE_DIR: cacheDir,
            ...envOverrides,
          },
        }
      );
      return { code: 0, stdout, stderr };
    } catch (err: unknown) {
      const error = err as { code?: number; stdout?: string; stderr?: string };
      return {
        code: typeof error.code === "number" ? error.code : 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
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
    const tableCheck = dbCheck.get<{ count: number }>(
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
    const runRow = dbCheck.get<{ status: string; error: string | null }>(
      "SELECT status, error FROM etl_runs WHERE kind = 'full' ORDER BY id DESC LIMIT 1"
    );
    expect(runRow).toBeDefined();
    expect(runRow?.status).toBe("error");
    expect(runRow?.error).toBeDefined();
    dbCheck.close();
  });
});
```