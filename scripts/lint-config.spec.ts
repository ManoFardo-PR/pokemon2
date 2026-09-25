import { describe, it, expect } from "vitest";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// S01.T10 — the root eslint flat config (eslint.config.js) and the business rules it mechanises:
//   BR-S01.T02-03  only packages/db/src/client.ts opens the database (node:sqlite / better-sqlite3)
//   BR-S01.T05-01  @pokesearch/shared is pure; only env.ts may touch Node
//   BR-S01.T08-03  apps/web imports no server-only module
//   BR-S01.T08-01  user-visible strings come from src/strings.ts (react/jsx-no-literals)
// BR-S01.T10-06: every restriction block carries the BR id it enforces in its `name` and in a comment.
// eslint and the config are imported dynamically so their absence fails each test, not the file load.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const configPath = join(repoRoot, "eslint.config.js");
const fixturesDir = join(repoRoot, "scripts/__fixtures__/eslint");

const BR_IDS = ["BR-S01.T02-03", "BR-S01.T05-01", "BR-S01.T08-03", "BR-S01.T08-01"] as const;
const RESTRICTION_RULES = ["no-restricted-imports", "react/jsx-no-literals"];

type ConfigObject = { name?: string; files?: unknown; rules?: Record<string, unknown> };
type LintMessage = { ruleId: string | null; message: string; severity: number; line?: number };
type LintResult = { filePath: string; messages: LintMessage[] };
type ESLintLike = { lintFiles(patterns: string[]): Promise<LintResult[]> };

type Fixture = { name: string; fixture: string; target: string; rule: string; br: string };

/** Each fixture is copied into the directory a restriction guards and must be rejected there. */
const FIXTURES: Fixture[] = [
  { name: "node:sqlite from apps/api fails", fixture: "api-node-sqlite.ts.txt", target: "apps/api/src/__lint-fixture__.ts", rule: "no-restricted-imports", br: "BR-S01.T02-03" },
  { name: "node:fs from packages/shared/src/search fails", fixture: "shared-node-fs.ts.txt", target: "packages/shared/src/search/__lint-fixture__.ts", rule: "no-restricted-imports", br: "BR-S01.T05-01" },
  { name: "@pokesearch/db from apps/web fails", fixture: "web-db-import.ts.txt", target: "apps/web/src/__lint-fixture__.ts", rule: "no-restricted-imports", br: "BR-S01.T08-03" },
  { name: "a literal string in JSX fails", fixture: "web-jsx-literal.tsx.txt", target: "apps/web/src/__lint-fixture__.tsx", rule: "react/jsx-no-literals", br: "BR-S01.T08-01" },
];

/** Files whose imports are the legitimate exception of each restriction. */
const LEGITIMATE = ["packages/db/src/client.ts", "packages/shared/src/env.ts", "apps/web/src/components/RootLayout.tsx"];

// A plain path, not pathToFileURL(): Vite cannot resolve the %20-encoded file URL of "VS Code".
async function loadConfig(): Promise<ConfigObject[]> {
  const mod = (await import(/* @vite-ignore */ configPath)) as { default: ConfigObject[] };
  const config = mod.default;
  expect(Array.isArray(config), "eslint.config.js default export is an array").toBe(true);
  return config;
}

async function createESLint(): Promise<ESLintLike> {
  const { ESLint } = (await import("eslint")) as { ESLint: new (opts: { cwd: string }) => ESLintLike };
  return new ESLint({ cwd: repoRoot });
}

/** Rule severity of `rule` in a config object, as the flat-config value may be a string, number or [severity, options]. */
function severityOf(value: unknown): string {
  const sev = Array.isArray(value) ? value[0] : value;
  if (sev === 0 || sev === "off") return "off";
  if (sev === 1 || sev === "warn") return "warn";
  if (sev === 2 || sev === "error") return "error";
  return String(sev);
}

function isRestrictionBlock(obj: ConfigObject): boolean {
  if (!obj.rules) return false;
  return RESTRICTION_RULES.some((rule) => rule in obj.rules! && severityOf(obj.rules![rule]) !== "off");
}

/** Every file under `dir` (recursive), as forward-slash paths relative to `repoRoot`. */
function walk(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs.slice(repoRoot.length).replace(/\\/g, "/"));
  }
  return out;
}

describe("S01.T10: eslint config restriction rules (eslint.config.js)", () => {
  describe("BR tagging (BR-S01.T10-06)", () => {
    it("every restriction rule cites a BR id", async () => {
      const config = await loadConfig();
      const blocks = config.filter(isRestrictionBlock);
      expect(blocks.length, "at least the four restriction blocks exist").toBeGreaterThanOrEqual(4);
      for (const block of blocks) {
        expect(block.name, `restriction block without a name: ${JSON.stringify(block.rules)}`).toMatch(/BR-S\d{2}\.T\d{2}-\d{2}/);
        expect(block.name).toMatch(/^restrict\//);
        expect(block.files, `restriction block ${block.name} must be scoped with "files"`).toBeDefined();
      }
    });

    it("the four BR ids are cited exactly once each", async () => {
      const config = await loadConfig();
      const cited = config
        .filter(isRestrictionBlock)
        .map((block) => /BR-S\d{2}\.T\d{2}-\d{2}/.exec(block.name ?? "")?.[0])
        .filter((id): id is string => typeof id === "string");
      expect([...cited].sort()).toEqual([...BR_IDS].sort());
    });

    it("every restriction message starts with its BR id", async () => {
      const config = await loadConfig();
      for (const block of config.filter(isRestrictionBlock)) {
        const id = /BR-S\d{2}\.T\d{2}-\d{2}/.exec(block.name ?? "")?.[0] ?? "";
        const restricted = block.rules?.["no-restricted-imports"];
        if (!Array.isArray(restricted)) continue;
        const text = JSON.stringify(restricted.slice(1));
        expect(text, `${block.name} carries a message with its BR id`).toContain(`"message":"${id}:`);
      }
    });

    it("the config source names each BR id in a comment", () => {
      const source = readFileSync(configPath, "utf-8");
      const commentLines = source.split(/\r?\n/).filter((l) => /^\s*(\/\/|\/\*|\*)/.test(l));
      for (const id of BR_IDS) {
        expect(commentLines.some((l) => l.includes(id)), `no comment line mentions ${id}`).toBe(true);
      }
    });

    it("the exemptions block turns the restrictions off for client.ts and scripts/", async () => {
      const config = await loadConfig();
      const exemptions = config.filter(
        (block) => block.rules && "no-restricted-imports" in block.rules && severityOf(block.rules["no-restricted-imports"]) === "off",
      );
      expect(exemptions.length).toBeGreaterThanOrEqual(1);
      for (const block of exemptions) expect(block.name, "exemption blocks are named too").toBeTruthy();
      const files = JSON.stringify(exemptions.map((b) => b.files));
      expect(files).toContain("packages/db/src/client.ts");
      expect(files).toContain("scripts/**");
    });
  });

  describe("fixtures are rejected in the guarded directories", () => {
    for (const { name, fixture, target, rule, br } of FIXTURES) {
      it(name, async () => {
        const src = join(fixturesDir, fixture);
        expect(existsSync(src), `fixture ${fixture} exists`).toBe(true);
        const dst = join(repoRoot, target);
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
        try {
          const eslint = await createESLint();
          const [result] = await eslint.lintFiles([dst]);
          expect(result).toBeDefined();
          const hits = result!.messages.filter((m) => m.ruleId === rule);
          expect(hits.length, `expected a ${rule} message, got ${JSON.stringify(result!.messages)}`).toBeGreaterThan(0);
          expect(hits.some((m) => m.message.includes(br)), `no ${rule} message mentions ${br}`).toBe(true);
          expect(hits.every((m) => m.severity === 2), `${rule} must be an error`).toBe(true);
        } finally {
          rmSync(dst, { force: true });
        }
      });
    }
  });

  describe("legitimate places pass", () => {
    it("client.ts, env.ts and RootLayout.tsx pass the restriction rules", async () => {
      const eslint = await createESLint();
      const results = await eslint.lintFiles(LEGITIMATE.map((rel) => join(repoRoot, rel)));
      expect(results).toHaveLength(LEGITIMATE.length);
      for (const result of results) {
        const offending = result.messages.filter((m) => m.ruleId !== null && RESTRICTION_RULES.includes(m.ruleId));
        expect(offending, `${result.filePath}: ${JSON.stringify(offending)}`).toEqual([]);
      }
    });

    it("only client.ts mentions node:sqlite", () => {
      const mentions = [...walk(join(repoRoot, "apps")), ...walk(join(repoRoot, "packages"))]
        .filter((rel) => /\.(ts|tsx|js|mjs)$/.test(rel))
        .filter((rel) => !rel.endsWith(".d.ts"))
        .filter((rel) => !/\.(spec|test)\.[jt]sx?$/.test(rel))
        .filter((rel) => !/vitest\.config\.ts$/.test(rel))
        .filter((rel) => readFileSync(join(repoRoot, rel), "utf-8").includes("node:sqlite"));
      expect(mentions).toEqual(["packages/db/src/client.ts"]);
    });
  });
});
