import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  withTempDb,
  withTempDbAsync,
  registerSchemaInitializer,
  resetSchemaInitializer,
  getRegisteredSchemaInitializer,
  TestDbError,
  type TempDbInfo,
} from "./index.js";
import { openDatabase } from "../client.js";

describe("Testing helper & withTempDb lifecycle", () => {
  beforeEach(() => {
    resetSchemaInitializer();
  });

  afterEach(() => {
    resetSchemaInitializer();
    vi.restoreAllMocks();
  });

  describe("BR-S01.T03-01: Real Database Guard", () => {
    it("refuses to open the real database when NODE_ENV === 'test'", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";
      const targetPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), "pokesearch.db");

      try {
        expect(() => openDatabase(targetPath)).toThrow(TestDbError);
        expect(() => openDatabase(targetPath)).toThrow(/DATABASE_PATH|real database/i);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("creates temp databases exclusively under os.tmpdir() or POKESEARCH_TEST_TMPDIR", () => {
      let createdDir = "";
      withTempDb((info) => {
        createdDir = info.dir;
        const expectedBase = process.env.POKESEARCH_TEST_TMPDIR || os.tmpdir();
        const normalizedBase = path.resolve(expectedBase);
        const normalizedDir = path.resolve(info.dir);
        expect(normalizedDir.startsWith(normalizedBase)).toBe(true);
        expect(info.path.endsWith("db.sqlite")).toBe(true);
      });
      expect(createdDir).not.toBe("");
    });
  });

  describe("BR-S01.T03-02: Deterministic Lifecycle, Cleanup & Retries", () => {
    it("cleans up temp database and directory after successful synchronous run", () => {
      let dirPath = "";
      let dbPath = "";
      withTempDb((info) => {
        dirPath = info.dir;
        dbPath = info.path;
        expect(existsSync(dbPath)).toBe(true);
        info.db.exec("CREATE TABLE foo (id INT); INSERT INTO foo VALUES (1);");
        expect(info.db.get<{ c: number }>("SELECT count(*) as c FROM foo")?.c).toBe(1);
      });

      expect(existsSync(dirPath)).toBe(false);
      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(`${dbPath}-wal`)).toBe(false);
      expect(existsSync(`${dbPath}-shm`)).toBe(false);
    });

    it("cleans up temp database and directory after successful asynchronous run", async () => {
      let dirPath = "";
      let dbPath = "";
      await withTempDbAsync(async (info) => {
        dirPath = info.dir;
        dbPath = info.path;
        expect(existsSync(dbPath)).toBe(true);
        info.db.exec("CREATE TABLE foo_async (id INT); INSERT INTO foo_async VALUES (42);");
        return Promise.resolve();
      });

      expect(existsSync(dirPath)).toBe(false);
      expect(existsSync(dbPath)).toBe(false);
    });

    it("cleans up temp database and sidecars even when the callback throws", () => {
      let dirPath = "";
      let dbPath = "";

      expect(() => {
        withTempDb((info) => {
          dirPath = info.dir;
          dbPath = info.path;
          info.db.exec("CREATE TABLE crash_test (val TEXT); INSERT INTO crash_test VALUES ('boom');");
          throw new Error("Deliberate test failure");
        });
      }).toThrow("Deliberate test failure");

      expect(existsSync(dirPath)).toBe(false);
      expect(existsSync(dbPath)).toBe(false);
    });

    it("retains the database directory when keepOnFailure is true and callback throws", () => {
      let dirPath = "";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        expect(() => {
          withTempDb(
            (info) => {
              dirPath = info.dir;
              info.db.exec("CREATE TABLE keep_me (id INT);");
              throw new Error("Failure with keepOnFailure");
            },
            { keepOnFailure: true }
          );
        }).toThrow("Failure with keepOnFailure");

        expect(existsSync(dirPath)).toBe(true);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining(`[withTempDb] Retaining failed test database at: ${dirPath}`)
        );
      } finally {
        if (dirPath && existsSync(dirPath)) {
          // Manual cleanup for test hygiene
          import("node:fs").then((fs) => fs.rmSync(dirPath, { recursive: true, force: true }));
        }
      }
    });
  });

  describe("BR-S01.T03-05: Schema Initializer Registry", () => {
    it("reports schemaApplied === false when no initializer is registered", () => {
      withTempDb((info) => {
        expect(info.schemaApplied).toBe(false);
        const tables = info.db.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
        );
        expect(tables.length).toBe(0);
      });
    });

    it("applies the registered schema initializer to the database", () => {
      let callCount = 0;
      registerSchemaInitializer({
        key: "test-v1",
        apply: (db) => {
          callCount++;
          db.exec("CREATE TABLE test_table (id TEXT PRIMARY KEY, val INT);");
        },
      });

      expect(getRegisteredSchemaInitializer()?.key).toBe("test-v1");

      withTempDb((info) => {
        expect(info.schemaApplied).toBe(true);
        const table = info.db.get<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table';"
        );
        expect(table?.name).toBe("test_table");
      });

      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it("allows resetting the schema initializer", () => {
      registerSchemaInitializer({
        key: "temporary",
        apply: (db) => {
          db.exec("CREATE TABLE temp_only (id INT);");
        },
      });
      resetSchemaInitializer();
      expect(getRegisteredSchemaInitializer()).toBeUndefined();

      withTempDb((info) => {
        expect(info.schemaApplied).toBe(false);
      });
    });
  });

  describe("Template Copy Optimization Performance Budget", () => {
    it("executes 50 withTempDb runs in under 5 seconds", () => {
      registerSchemaInitializer({
        key: "perf-bench-v1",
        apply: (db) => {
          db.exec(`
            CREATE TABLE bench_items (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              score REAL
            );
            CREATE INDEX idx_bench_items_score ON bench_items(score);
          `);
        },
      });

      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        withTempDb((info) => {
          info.db.run("INSERT INTO bench_items (id, name, score) VALUES (?, ?, ?)", [`item-${i}`, `Name ${i}`, i * 1.5]);
          const row = info.db.get<{ score: number }>("SELECT score FROM bench_items WHERE id = ?", [`item-${i}`]);
          expect(row?.score).toBe(i * 1.5);
        });
      }
      const elapsedMs = performance.now() - start;
      expect(elapsedMs).toBeLessThan(5000);
    });
  });
});
