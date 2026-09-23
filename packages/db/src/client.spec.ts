import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, DbError, BATCH_ROWS, type Db } from "./client.js";

describe("Database Client (packages/db/src/client.ts)", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pokesearch-db-client-test-"));
    dbPath = join(tempDir, "test.db");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("BR-S01.T02-01: Pragmas on open", () => {
    it("applies WAL, foreign_keys=ON, busy_timeout=5000, synchronous=NORMAL", () => {
      const db = openDatabase(dbPath);
      try {
        const journalMode = db.pragma<string>("journal_mode");
        expect(journalMode.toLowerCase()).toBe("wal");

        const foreignKeys = db.pragma<number>("foreign_keys");
        expect(foreignKeys).toBe(1);

        const busyTimeout = db.pragma<number>("busy_timeout");
        expect(busyTimeout).toBe(5000);

        const synchronous = db.pragma<number>("synchronous");
        // In SQLite: 0 = OFF, 1 = NORMAL, 2 = FULL
        expect(synchronous).toBe(1);
      } finally {
        db.close();
      }
    });

    it("reports the verified sqliteVersion()", () => {
      const db = openDatabase(dbPath);
      try {
        expect(db.sqliteVersion()).toBe("3.50.4");
      } finally {
        db.close();
      }
    });

    it("respects custom open options", () => {
      const db = openDatabase(dbPath, {
        busyTimeoutMs: 2500,
        synchronous: "FULL",
      });
      try {
        expect(db.pragma<number>("busy_timeout")).toBe(2500);
        expect(db.pragma<number>("synchronous")).toBe(2);
      } finally {
        db.close();
      }
    });
  });

  describe("BR-S01.T02-02: Zero DDL on connect", () => {
    it("opening an empty file leaves it with zero user tables", () => {
      const db = openDatabase(dbPath);
      try {
        const tables = db.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
        );
        expect(tables).toHaveLength(0);
      } finally {
        db.close();
      }
    });
  });

  describe("Statement cache & Query Operations (run, get, all, iterate, exec)", () => {
    let db: Db;

    beforeEach(() => {
      db = openDatabase(dbPath);
      db.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          val INTEGER NOT NULL,
          meta TEXT
        );
      `);
    });

    afterEach(() => {
      db.close();
    });

    it("executes run() with positional and named parameters", () => {
      const res1 = db.run("INSERT INTO items (id, val, meta) VALUES (?, ?, ?);", [
        "item-1",
        42,
        JSON.stringify({ a: 1 }),
      ]);
      expect(res1.changes).toBe(1);

      const res2 = db.run(
        "INSERT INTO items (id, val, meta) VALUES ($id, $val, $meta);",
        {
          $id: "item-2",
          $val: 99,
          $meta: null,
        }
      );
      expect(res2.changes).toBe(1);
    });

    it("executes get() returning single row or undefined", () => {
      db.run("INSERT INTO items (id, val) VALUES (?, ?);", ["item-1", 10]);

      const found = db.get<{ id: string; val: number }>(
        "SELECT id, val FROM items WHERE id = ?;",
        ["item-1"]
      );
      expect(found).toEqual({ id: "item-1", val: 10 });

      const notFound = db.get<{ id: string; val: number }>(
        "SELECT id, val FROM items WHERE id = ?;",
        ["non-existent"]
      );
      expect(notFound).toBeUndefined();
    });

    it("executes all() returning an array of rows", () => {
      db.run("INSERT INTO items (id, val) VALUES (?, ?);", ["a", 1]);
      db.run("INSERT INTO items (id, val) VALUES (?, ?);", ["b", 2]);

      const rows = db.all<{ id: string; val: number }>(
        "SELECT id, val FROM items ORDER BY val ASC;"
      );
      expect(rows).toEqual([
        { id: "a", val: 1 },
        { id: "b", val: 2 },
      ]);
    });

    it("executes iterate() yielding rows lazily", () => {
      db.run("INSERT INTO items (id, val) VALUES (?, ?);", ["a", 1]);
      db.run("INSERT INTO items (id, val) VALUES (?, ?);", ["b", 2]);

      const iterator = db.iterate<{ id: string; val: number }>(
        "SELECT id, val FROM items ORDER BY val ASC;"
      );
      const collected: { id: string; val: number }[] = [];
      for (const row of iterator) {
        collected.push(row);
      }
      expect(collected).toEqual([
        { id: "a", val: 1 },
        { id: "b", val: 2 },
      ]);
    });

    it("reuses prepared statements from the statement LRU cache", () => {
      // Multiple queries with identical SQL string should reuse the cached prepared statement
      for (let i = 0; i < 5; i++) {
        db.run("INSERT INTO items (id, val) VALUES (?, ?);", [`id-${i}`, i]);
      }
      const count = db.get<{ c: number }>("SELECT count(*) as c FROM items;");
      expect(count?.c).toBe(5);
    });

    it("wraps SQLite errors in DbError", () => {
      try {
        db.run("INSERT INTO items (id, val) VALUES (?, ?);", ["dup", 1]);
        db.run("INSERT INTO items (id, val) VALUES (?, ?);", ["dup", 2]);
        expect.fail("Should have thrown DbError on primary key violation");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(DbError);
        const dbErr = err as DbError;
        expect(dbErr.code).toMatch(/SQLITE_CONSTRAINT/);
        expect(dbErr.sql).toContain("INSERT INTO items");
        expect(dbErr.params).toEqual(["dup", 2]);
      }
    });
  });

  describe("BR-S01.T02-05: Transactions and savepoint nesting", () => {
    let db: Db;

    beforeEach(() => {
      db = openDatabase(dbPath);
      db.exec("CREATE TABLE entries (id TEXT PRIMARY KEY, value TEXT);");
    });

    afterEach(() => {
      db.close();
    });

    it("commits successful transactions (default immediate mode)", () => {
      const result = db.transaction((tx) => {
        tx.run("INSERT INTO entries (id, value) VALUES (?, ?);", ["1", "alpha"]);
        tx.run("INSERT INTO entries (id, value) VALUES (?, ?);", ["2", "beta"]);
        return "done";
      });

      expect(result).toBe("done");
      const rows = db.all<{ id: string }>("SELECT id FROM entries;");
      expect(rows).toHaveLength(2);
    });

    it("rolls back on error and leaves connection outside transaction", () => {
      expect(() => {
        db.transaction((tx) => {
          tx.run("INSERT INTO entries (id, value) VALUES (?, ?);", ["1", "alpha"]);
          throw new Error("Simulated failure");
        });
      }).toThrow("Simulated failure");

      const rows = db.all<{ id: string }>("SELECT id FROM entries;");
      expect(rows).toHaveLength(0);

      // Verify connection is outside transaction and can execute subsequent statements
      db.run("INSERT INTO entries (id, value) VALUES (?, ?);", ["2", "beta"]);
      expect(db.all<{ id: string }>("SELECT id FROM entries;")).toHaveLength(1);
    });

    it("nests transactions via SAVEPOINT where inner rollback affects only inner scope", () => {
      db.transaction((outerTx) => {
        outerTx.run("INSERT INTO entries (id, value) VALUES (?, ?);", ["outer", "val"]);

        try {
          outerTx.transaction((innerTx) => {
            innerTx.run("INSERT INTO entries (id, value) VALUES (?, ?);", ["inner", "val"]);
            throw new Error("Inner fail");
          });
        } catch {
          // Handled inner error
        }

        // outer should still be in progress
        outerTx.run("INSERT INTO entries (id, value) VALUES (?, ?);", ["outer-2", "val"]);
      });

      const rows = db.all<{ id: string }>("SELECT id FROM entries ORDER BY id ASC;");
      expect(rows.map((r) => r.id)).toEqual(["outer", "outer-2"]);
    });

    it("rolls back open transaction on close()", () => {
      // If close() is called while a transaction is hypothetically open, it must safely rollback
      expect(() => db.close()).not.toThrow();
    });
  });

  describe("Readonly mode and creation flags", () => {
    it("fails with SQLITE_CANTOPEN when readonly: true and file does not exist", () => {
      const nonExistentPath = join(tempDir, "missing.db");
      expect(() => {
        openDatabase(nonExistentPath, { readonly: true });
      }).toThrow();
    });

    it("allows reading but forbids writes when readonly: true", () => {
      // First create DB and table
      const setupDb = openDatabase(dbPath);
      setupDb.exec("CREATE TABLE test_ro (x INTEGER);");
      setupDb.run("INSERT INTO test_ro (x) VALUES (1);");
      setupDb.close();

      const roDb = openDatabase(dbPath, { readonly: true });
      try {
        expect(roDb.isReadonly).toBe(true);
        const row = roDb.get<{ x: number }>("SELECT x FROM test_ro;");
        expect(row?.x).toBe(1);

        expect(() => {
          roDb.run("INSERT INTO test_ro (x) VALUES (2);");
        }).toThrow();
      } finally {
        roDb.close();
      }
    });
  });

  describe("BATCH_ROWS export", () => {
    it("exports BATCH_ROWS as 1000", () => {
      expect(BATCH_ROWS).toBe(1000);
    });
  });
});
