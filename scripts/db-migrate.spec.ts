import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { openDatabase } from "../packages/db/src/client.js";

describe("CLI Scripts: db:migrate and db:status (scripts/db-migrate.mjs, scripts/db-status.mjs)", () => {
  let tempDir: string;
  let dbPath: string;
  let migrationsDir: string;
  const migrateScriptPath = join(process.cwd(), "scripts/db-migrate.mjs");
  const statusScriptPath = join(process.cwd(), "scripts/db-status.mjs");

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pokesearch-cli-test-"));
    dbPath = join(tempDir, "cli-test.db");
    migrationsDir = join(tempDir, "migrations");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createMigration = (filename: string, content: string) => {
    if (!existsSync(migrationsDir)) {
      const fs = require("node:fs");
      fs.mkdirSync(migrationsDir, { recursive: true });
    }
    writeFileSync(join(migrationsDir, filename), content, "utf-8");
  };

  describe("scripts/db-status.mjs", () => {
    it("exits with code 3 when there are pending migrations", () => {
      createMigration(
        "0001_init.sql",
        `CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          duration_ms INTEGER NOT NULL
        );`
      );

      const res = spawnSync(
        process.execPath,
        [
          "--no-warnings=ExperimentalWarning",
          statusScriptPath,
          "--db",
          dbPath,
          "--dir",
          migrationsDir,
          "--json",
        ],
        { encoding: "utf-8" }
      );

      expect(res.status).toBe(3);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.pending).toHaveLength(1);
      expect(parsed.schemaVersion).toBe(0);
    });

    it("exits with code 0 when all migrations are applied and schema is up-to-date", () => {
      createMigration(
        "0001_init.sql",
        `CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          duration_ms INTEGER NOT NULL
        );`
      );

      // Run migrate first
      spawnSync(
        process.execPath,
        [
          "--no-warnings=ExperimentalWarning",
          migrateScriptPath,
          "--db",
          dbPath,
          "--dir",
          migrationsDir,
        ],
        { encoding: "utf-8" }
      );

      // Now check status
      const res = spawnSync(
        process.execPath,
        [
          "--no-warnings=ExperimentalWarning",
          statusScriptPath,
          "--db",
          dbPath,
          "--dir",
          migrationsDir,
          "--json",
        ],
        { encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.pending).toHaveLength(0);
      expect(parsed.applied).toHaveLength(1);
      expect(parsed.schemaVersion).toBe(1);
    });

    it("exits with code 2 on validation failure", () => {
      // Create invalid migration (gap)
      createMigration("0002_gap.sql", "CREATE TABLE t2 (id INT);");

      const res = spawnSync(
        process.execPath,
        [
          "--no-warnings=ExperimentalWarning",
          statusScriptPath,
          "--db",
          dbPath,
          "--dir",
          migrationsDir,
        ],
        { encoding: "utf-8" }
      );

      expect(res.status).toBe(2);
    });
  });

  describe("scripts/db-migrate.mjs", () => {
    it("applies migrations successfully, outputs JSON, and exits 0", () => {
      createMigration(
        "0001_init.sql",
        `CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          duration_ms INTEGER NOT NULL
        );
        CREATE TABLE t1 (id INT);`
      );

      const res = spawnSync(
        process.execPath,
        [
          "--no-warnings=ExperimentalWarning",
          migrateScriptPath,
          "--db",
          dbPath,
          "--dir",
          migrationsDir,
          "--json",
        ],
        { encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.applied).toHaveLength(1);
      expect(parsed.schemaVersion).toBe(1);

      // Verify table was created
      const db = openDatabase(dbPath);
      try {
        const row = db.get<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='t1';"
        );
        expect(row?.name).toBe("t1");
      } finally {
        db.close();
      }
    });

    it("supports --dry-run without applying any changes", () => {
      createMigration(
        "0001_init.sql",
        `CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          duration_ms INTEGER NOT NULL
        );
        CREATE TABLE t_dry (id INT);`
      );

      const res = spawnSync(
        process.execPath,
        [
          "--no-warnings=ExperimentalWarning",
          migrateScriptPath,
          "--db",
          dbPath,
          "--dir",
          migrationsDir,
          "--dry-run",
          "--json",
        ],
        { encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.applied).toHaveLength(1);

      // Database should not have t_dry
      const db = openDatabase(dbPath);
      try {
        const row = db.get<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='t_dry';"
        );
        expect(row).toBeUndefined();
      } finally {
        db.close();
      }
    });

    it("exits with code 1 when a migration SQL fails", () => {
      createMigration("0001_init.sql", "INVALID SQL HERE;");

      const res = spawnSync(
        process.execPath,
        [
          "--no-warnings=ExperimentalWarning",
          migrateScriptPath,
          "--db",
          dbPath,
          "--dir",
          migrationsDir,
        ],
        { encoding: "utf-8" }
      );

      expect(res.status).toBe(1);
    });

    it("exits with code 2 on validation failure (gap / missing files)", () => {
      createMigration("0002_gap.sql", "CREATE TABLE t2 (id INT);");

      const res = spawnSync(
        process.execPath,
        [
          "--no-warnings=ExperimentalWarning",
          migrateScriptPath,
          "--db",
          dbPath,
          "--dir",
          migrationsDir,
        ],
        { encoding: "utf-8" }
      );

      expect(res.status).toBe(2);
    });
  });
});
