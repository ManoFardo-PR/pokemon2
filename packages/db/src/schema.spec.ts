import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, DbError, type Db } from "./client.js";
import { migrate, defaultMigrationsDir } from "./migrate.js";
import { TABLES, type SchemaMigrationRow, type EtlRunRow } from "./schema.js";

interface PragmaTableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

describe("Schema Drift & Constraints Specification (packages/db/src/schema.ts)", () => {
  let tempDir: string;
  let dbPath: string;
  let db: Db;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pokesearch-schema-test-"));
    dbPath = join(tempDir, "schema-test.db");
    db = openDatabase(dbPath);
    // Apply foundation migration
    migrate(db, { dir: defaultMigrationsDir() });
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("BR-S01.T04-09: Schema Drift against PRAGMA table_info", () => {
    it("matches TABLES descriptor exactly against SQLite PRAGMA table_info for schema_migrations", () => {
      const descriptor = TABLES.schema_migrations!;
      expect(descriptor).toBeDefined();

      const pragmaCols = db.all<PragmaTableInfo>("PRAGMA table_info(schema_migrations);");
      expect(pragmaCols.length).toBe(descriptor.columns.length);

      for (let i = 0; i < descriptor.columns.length; i++) {
        const expected = descriptor.columns[i]!;
        const actual = pragmaCols[i]!;

        expect(actual.name).toBe(expected.name);
        expect(actual.type.toUpperCase()).toBe(expected.type);
        expect(Boolean(actual.notnull)).toBe(expected.notnull);
        expect(Boolean(actual.pk)).toBe(expected.pk);
        expect(actual.dflt_value).toBe(expected.dflt_value);
      }
    });

    it("matches TABLES descriptor exactly against SQLite PRAGMA table_info for etl_runs", () => {
      const descriptor = TABLES.etl_runs!;
      expect(descriptor).toBeDefined();

      const pragmaCols = db.all<PragmaTableInfo>("PRAGMA table_info(etl_runs);");
      expect(pragmaCols.length).toBe(descriptor.columns.length);

      for (let i = 0; i < descriptor.columns.length; i++) {
        const expected = descriptor.columns[i]!;
        const actual = pragmaCols[i]!;

        expect(actual.name).toBe(expected.name);
        expect(actual.type.toUpperCase()).toBe(expected.type);
        expect(Boolean(actual.notnull)).toBe(expected.notnull);
        expect(Boolean(actual.pk)).toBe(expected.pk);
        expect(actual.dflt_value).toBe(expected.dflt_value);
      }
    });

    it("fails when an undocumented column is added to database schema", () => {
      db.exec("ALTER TABLE etl_runs ADD COLUMN rogue_col TEXT;");

      const descriptor = TABLES.etl_runs!;
      const pragmaCols = db.all<PragmaTableInfo>("PRAGMA table_info(etl_runs);");
      expect(pragmaCols.length).not.toBe(descriptor.columns.length);
    });
  });

  describe("BR-S01.T04-06: etl_runs Table Constraints & Invariants", () => {
    it("allows valid running etl_run insertion", () => {
      const now = new Date().toISOString();
      const res = db.run(
        `INSERT INTO etl_runs (id, kind, started_at, finished_at, status, stats_json, error)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [1, "full", now, null, "running", "{}", null]
      );
      expect(res.changes).toBe(1);

      const row = db.get<EtlRunRow>("SELECT * FROM etl_runs WHERE id = 1;");
      expect(row?.status).toBe("running");
      expect(row?.finished_at).toBeNull();
    });

    it("allows valid completed ok etl_run update", () => {
      const started = new Date(Date.now() - 1000).toISOString();
      const finished = new Date().toISOString();

      db.run(
        `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
         VALUES (?, ?, ?, ?, ?);`,
        [1, "delta", started, null, "running"]
      );

      db.run(
        `UPDATE etl_runs
         SET finished_at = ?, status = 'ok', stats_json = '{"processed": 100}'
         WHERE id = 1;`,
        [finished]
      );

      const row = db.get<EtlRunRow>("SELECT * FROM etl_runs WHERE id = 1;");
      expect(row?.status).toBe("ok");
      expect(row?.finished_at).toBe(finished);
    });

    it("rejects finished run with status 'running' (CHECK ((status = 'running') = (finished_at IS NULL)))", () => {
      const started = new Date().toISOString();
      const finished = started;

      expect(() => {
        db.run(
          `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
           VALUES (?, ?, ?, ?, ?);`,
          [1, "full", started, finished, "running"]
        );
      }).toThrow(DbError);
    });

    it("rejects completed status ('ok', 'error', 'cancelled') with finished_at IS NULL", () => {
      const started = new Date().toISOString();

      for (const invalidStatus of ["ok", "error", "cancelled"]) {
        expect(() => {
          db.run(
            `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
             VALUES (?, ?, ?, ?, ?);`,
            [Math.floor(Math.random() * 10000), "prices", started, null, invalidStatus]
          );
        }).toThrow(DbError);
      }
    });

    it("rejects finished_at earlier than started_at (CHECK (finished_at IS NULL OR finished_at >= started_at))", () => {
      const started = "2026-03-30T12:00:00Z";
      const finished = "2026-03-30T11:59:59Z";

      expect(() => {
        db.run(
          `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
           VALUES (?, ?, ?, ?, ?);`,
          [1, "fts", started, finished, "ok"]
        );
      }).toThrow(DbError);
    });

    it("rejects invalid status value not in enum", () => {
      const started = new Date().toISOString();

      expect(() => {
        db.run(
          `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
           VALUES (?, ?, ?, ?, ?);`,
          [1, "seed", started, null, "in_progress"]
        );
      }).toThrow(DbError);
    });
  });

  describe("Indexes on etl_runs", () => {
    it("has etl_runs_kind_started_idx and etl_runs_running_idx", () => {
      const indexes = db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name = 'etl_runs';"
      );
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("etl_runs_kind_started_idx");
      expect(indexNames).toContain("etl_runs_running_idx");
    });
  });
});
