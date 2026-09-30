import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// S02.T05 / BR-S02.T05-07 — scripts/sql-lint.mjs (part of `pnpm check`) accepts 0002_cards.sql as written and
// rejects it once the `-- @sqlite-only` / `-- @end` lines around cards_fts are removed.
// sql-lint scans .sql files under process.cwd() and sources under <cwd>/packages and <cwd>/apps, so the run happens
// in a temp tree that has both folders; without them readdirSync throws and the exit code means nothing.

// Resolved from this file, not process.cwd().
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = join(repoRoot, "scripts/sql-lint.mjs");
const migrationPath = join(repoRoot, "packages/db/migrations/0002_cards.sql");

describe("BR-S02.T05-07: sql-lint guards the -- @sqlite-only block of 0002_cards.sql", () => {
  let tree: string;

  beforeEach(() => {
    tree = mkdtempSync(join(tmpdir(), "pokesearch-sqllint-"));
    mkdirSync(join(tree, "packages"));
    mkdirSync(join(tree, "apps"));
  });

  afterEach(() => {
    if (existsSync(tree)) {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  function lint(sql: string): { status: number | null; stderr: string } {
    writeFileSync(join(tree, "0002_cards.sql"), sql);
    const res = spawnSync(process.execPath, [scriptPath], { cwd: tree, encoding: "utf8" });
    return { status: res.status, stderr: res.stderr };
  }

  it("`pnpm check` fails when the `-- @sqlite-only` tag around `cards_fts` is removed, and passes with it", () => {
    const sql = readFileSync(migrationPath, "utf8");

    const tagged = lint(sql);
    expect(tagged.status, tagged.stderr).toBe(0);

    const stripped = sql
      .split("\n")
      .filter((line) => !/^\s*-- @(sqlite-only|end)\b/.test(line))
      .join("\n");
    expect(stripped).not.toBe(sql);

    const untagged = lint(stripped);
    expect(untagged.status).toBe(1);
    expect(untagged.stderr).toMatch(/outside -- @sqlite-only block/);
  });
});
