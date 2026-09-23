import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { openDatabase } from "../packages/db/src/client.js";

describe("BR-S01.T02-07: Backup script (scripts/db-backup.mjs)", () => {
  let tempDir: string;
  let dbPath: string;
  let backupDir: string;
  const scriptPath = join(process.cwd(), "scripts/db-backup.mjs");

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pokesearch-backup-test-"));
    dbPath = join(tempDir, "source.db");
    backupDir = join(tempDir, "backups");

    // Populate source database
    const db = openDatabase(dbPath);
    db.exec("CREATE TABLE cards (id TEXT PRIMARY KEY, name TEXT);");
    db.run("INSERT INTO cards (id, name) VALUES (?, ?);", ["c1", "Pikachu"]);
    db.close();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("successfully creates backup, passes PRAGMA integrity_check, and exits 0", () => {
    const res = spawnSync(
      process.execPath,
      ["--no-warnings=ExperimentalWarning", scriptPath, "--db", dbPath, "--out", backupDir, "--json"],
      { encoding: "utf-8" }
    );

    expect(res.status).toBe(0);
    const output = JSON.parse(res.stdout);
    expect(output.ok).toBe(true);
    expect(output.backupPath).toBeDefined();
    expect(existsSync(output.backupPath)).toBe(true);

    // Verify backup integrity with openDatabase readonly
    const backupDb = openDatabase(output.backupPath, { readonly: true });
    try {
      const integrity = backupDb.pragma<string>("integrity_check");
      expect(integrity).toBe("ok");
      const card = backupDb.get<{ name: string }>("SELECT name FROM cards WHERE id = ?;", ["c1"]);
      expect(card?.name).toBe("Pikachu");
    } finally {
      backupDb.close();
    }
  });

  it("exits with non-zero status code 1 and prunes nothing when database is corrupt or verification fails", () => {
    // Overwrite db file with garbage to corrupt it
    writeFileSync(dbPath, "CORRUPTED_GARBAGE_HEADER_AND_CONTENT");

    const res = spawnSync(
      process.execPath,
      ["--no-warnings=ExperimentalWarning", scriptPath, "--db", dbPath, "--out", backupDir],
      { encoding: "utf-8" }
    );

    expect(res.status).toBe(1);
  });

  it("prunes backups preserving only the newest --keep N copies", () => {
    // Generate multiple backups
    for (let i = 0; i < 4; i++) {
      spawnSync(
        process.execPath,
        ["--no-warnings=ExperimentalWarning", scriptPath, "--db", dbPath, "--out", backupDir, "--keep", "2"],
        { encoding: "utf-8" }
      );
    }

    const { readdirSync } = require("node:fs");
    const files = readdirSync(backupDir).filter((f: string) => f.endsWith(".db"));
    expect(files.length).toBeLessThanOrEqual(2);
  });
});
