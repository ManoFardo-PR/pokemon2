import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// S01.T10 — BR-S01.T10-01: `pnpm check` covers every workspace member; a member without real
// typecheck / lint / test scripts is a failure here, never a silent skip.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

type Pkg = { name?: string; scripts?: Record<string, string>; devDependencies?: Record<string, string> };

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf-8")) as T;
}

/** Workspace globs from pnpm-workspace.yaml (`packages:` list; only `<dir>/*` globs are used here). */
function workspaceGlobs(): string[] {
  const yaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf-8").split(/\r?\n/);
  const globs: string[] = [];
  let inPackages = false;
  for (const line of yaml) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line)) inPackages = false;
    const item = inPackages ? /^\s*-\s*["']?([^"']+)["']?\s*$/.exec(line) : null;
    if (item?.[1]) globs.push(item[1]);
  }
  return globs;
}

/** A member is a directory matched by a workspace glob that holds a package.json. */
function members(): Array<{ dir: string; pkg: Pkg }> {
  const out: Array<{ dir: string; pkg: Pkg }> = [];
  for (const glob of workspaceGlobs()) {
    const m = /^([a-z0-9_-]+)\/\*$/.exec(glob);
    expect(m, `workspace glob "${glob}" is of the form <dir>/*`).not.toBeNull();
    const parent = join(repoRoot, m![1]!);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = `${m![1]}/${entry.name}`;
      if (existsSync(join(parent, entry.name, "package.json"))) out.push({ dir: rel, pkg: readJson<Pkg>(`${rel}/package.json`) });
    }
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}

const EXPECTED_MEMBERS = ["apps/api", "apps/web", "apps/worker", "packages/db", "packages/etl", "packages/shared"];

describe("S01.T10: workspace members and root scripts (BR-S01.T10-01)", () => {
  it("six workspace members are discovered", () => {
    expect(workspaceGlobs()).toEqual(["apps/*", "packages/*"]);
    const found = members();
    expect(found.map((m) => m.dir)).toEqual(EXPECTED_MEMBERS);
    for (const { dir, pkg } of found) expect(pkg.name, `${dir} has a name`).toBeTruthy();
  });

  it("every member declares typecheck, lint and test", () => {
    const found = members();
    const lintStrings = new Set<string>();
    for (const { dir, pkg } of found) {
      const scripts = pkg.scripts ?? {};
      expect(scripts["typecheck"], `${dir} typecheck`).toBe("tsc --noEmit");
      expect(scripts["lint"], `${dir} lint`).toMatch(/^eslint( --config \.\.\/\.\.\/eslint\.config\.js)? \.$/);
      expect(scripts["test"], `${dir} test`).toMatch(/^vitest run( --passWithNoTests)?$/);
      for (const key of ["typecheck", "lint", "test"]) {
        expect(scripts[key], `${dir} ${key} is a real command`).not.toMatch(/\becho\b/);
      }
      lintStrings.add(scripts["lint"]!);
    }
    expect([...lintStrings], "one identical lint string across members").toHaveLength(1);
  });

  it("every member pins vitest on the same ^3.2 line as the root", () => {
    const root = readJson<Pkg>("package.json");
    const rootVitest = root.devDependencies?.["vitest"];
    expect(rootVitest, "root devDependencies.vitest").toMatch(/^\^3\.(?:[2-9]|\d{2,})/);
    for (const { dir, pkg } of members()) {
      expect(pkg.devDependencies?.["vitest"], `${dir} devDependencies.vitest`).toBe(rootVitest);
    }
    expect(root.devDependencies?.["typescript"], "root devDependencies.typescript").toMatch(/^\^5\./);
    expect(root.devDependencies?.["eslint"], "root devDependencies.eslint").toMatch(/^\^9\./);
    const web = readJson<Pkg>("apps/web/package.json");
    expect(web.devDependencies?.["eslint"], "eslint lives at the root only").toBeUndefined();
    expect(web.devDependencies?.["eslint-plugin-react"], "eslint-plugin-react lives at the root only").toBeUndefined();
  });

  it("every member has a vitest config naming its project after the package", () => {
    for (const { dir, pkg } of members()) {
      const config = join(repoRoot, dir, "vitest.config.ts");
      expect(existsSync(config), `${dir}/vitest.config.ts`).toBe(true);
      expect(readFileSync(config, "utf-8"), `${dir}/vitest.config.ts sets test.name`).toContain(`name: "${pkg.name}"`);
    }
    const rootConfig = readFileSync(join(repoRoot, "vitest.config.ts"), "utf-8");
    for (const dir of EXPECTED_MEMBERS) expect(rootConfig, `root vitest.config.ts lists ${dir}`).toContain(`"./${dir}"`);
    expect(rootConfig).toContain('name: "scripts"');
  });

  it("root check composes typecheck, lint, the specialised linters and test in order", () => {
    const root = readJson<Pkg>("package.json");
    const check = root.scripts?.["check"] ?? "";
    const steps = check.split("&&").map((s) => s.trim());
    expect(steps).toEqual([
      "pnpm typecheck",
      "pnpm lint",
      "node scripts/sql-lint.mjs",
      "node scripts/notice-lint.mjs",
      "pnpm schema:check",
      "pnpm test",
    ]);
    expect(root.scripts?.["notice:lint"]).toBe("node scripts/notice-lint.mjs");
  });

  it("root docs:lint is separate from check", () => {
    const root = readJson<Pkg>("package.json");
    expect(root.scripts?.["docs:lint"]).toBe("node scripts/docs-lint.mjs");
    expect(root.scripts?.["check"]).not.toContain("docs:lint");
    expect(root.scripts?.["check"]).not.toContain("docs-lint");
  });

  it("root typecheck covers scripts/", () => {
    const root = readJson<Pkg>("package.json");
    expect(root.scripts?.["typecheck"]).toContain("pnpm -r run typecheck");
    expect(root.scripts?.["typecheck"]).toContain("tsc -p scripts/tsconfig.json");
    expect(root.scripts?.["lint"]).toContain("pnpm -r run lint");
    expect(root.scripts?.["lint"]).toContain("eslint scripts");
    expect(root.scripts?.["test"]).toBe("vitest run");
    expect(existsSync(join(repoRoot, "scripts/tsconfig.json")), "scripts/tsconfig.json").toBe(true);
  });

  it("CI runs exactly the local commands with versions from package.json (BR-S01.T10-07)", () => {
    const path = join(repoRoot, ".github/workflows/check.yml");
    expect(existsSync(path), ".github/workflows/check.yml").toBe(true);
    const yml = readFileSync(path, "utf-8");
    for (const cmd of ["pnpm install --frozen-lockfile", "pnpm check", "pnpm docs:lint", "corepack enable"]) {
      expect(yml, `workflow runs ${cmd}`).toContain(cmd);
    }
    expect(yml).toContain("node-version-file");
    expect(yml).not.toMatch(/continue-on-error/);
    expect(yml).not.toMatch(/--skip/);
    expect(yml).not.toMatch(/^\s+if:/m);
    expect(yml).not.toMatch(/node-version:\s*["']?\d/);
  });
});
