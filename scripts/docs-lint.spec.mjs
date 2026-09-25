import { describe, it, expect, afterEach } from "vitest";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// S01.T10 — docs lint (scripts/docs-lint.mjs). Module contract assumed by this suite (besides the CLI):
//   CHECKS: Record<1..8, { id, description }>   STRICT_CHECKS: Record<9..13, { id, description }>
//   TEMPLATE_SECTIONS: string[13]   HEADER_FIELDS: string[8]   STATUS_VOCABULARY: string[]
//   parseSubtaskFile(text, relPath) => { id, title, header: { [field]: { value, line } }, dependsOn: string[], unblocks: string[],
//                                        inputs: [{ line, ids }], outputs: [{ line, ids }], sections: [{ name, line, empty }], rules: [{ id, line }] }
//   parseTree(dir) => { subtasks: { [id]: parsed }, ... }
//   lintDocs({ dir, strict }) => { ok, counts: { errors, warnings }, violations: [{ file, line, check, message, severity }], parseErrors }
// CLI: node scripts/docs-lint.mjs [--json] [--strict] [--dir <docs>]; exit 0 clean, 1 violations, 2 parse error / bad usage.
// The module is imported dynamically so a missing script fails each test, not the file load.

// Resolved from this file, not process.cwd(): the db-member vitest runs with cwd packages/db.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = join(repoRoot, "scripts/docs-lint.mjs");
const fixturesRoot = join(repoRoot, "scripts/__fixtures__/docs-lint");
const baseDir = join(fixturesRoot, "_base");
const realDocs = join(repoRoot, "docs");

const HEADER_FIELDS = ["Stage", "Status", "Order in stage", "Depends on", "Unblocks", "Parallel with", "Gate", "Owner / Updated"];
const STRICT = new Set([9, 10, 11, 12, 13]);

/** Distinctive keywords each documented check shares with its registry description (BR-S01.T10-03). */
const CHECK_KEYWORDS = {
  1: ["exist"],
  2: ["Unblocks"],
  3: ["cycle"],
  4: ["Order in stage"],
  5: ["from"],
  6: ["exactly once"],
  7: ["section"],
  8: ["unique"],
  9: ["vocabulary"],
  10: ["fields"],
  11: ["footer"],
  12: ["link"],
  13: ["checkbox"],
};

// A plain path, not pathToFileURL(): Vite cannot resolve the %20-encoded file URL of "VS Code".
async function loadModule() {
  return import(/* @vite-ignore */ scriptPath);
}

/** Every file under `dir`, as forward-slash paths relative to `dir`, sorted. */
function listFiles(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

/** SHA-256 over sorted relative paths and file contents of a tree. */
function hashTree(dir) {
  const hash = createHash("sha256");
  for (const rel of listFiles(dir)) {
    hash.update(rel).update("\0").update(readFileSync(join(dir, rel))).update("\0");
  }
  return hash.digest("hex");
}

/** 1-based line number of the first line starting with `prefix` in `text` (split like the lint does). */
function lineOf(text, prefix) {
  const idx = text.split(/\r?\n/).findIndex((l) => l.startsWith(prefix));
  if (idx < 0) throw new Error(`fixture: no line starting with ${prefix}`);
  return idx + 1;
}

/** Rewrite every file under `dir` through `fn(text)`. */
function rewriteTree(dir, fn) {
  for (const rel of listFiles(dir)) {
    const abs = join(dir, rel);
    writeFileSync(abs, fn(readFileSync(abs, "utf-8")));
  }
}

describe("S01.T10: docs-lint (scripts/docs-lint.mjs)", () => {
  const tempDirs = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Copies `_base` into a fresh temp dir, then the overlay (a `check-N/{bad,good}` name or null) over it,
   * then any inline `files` ({ "stages/01-alpha/T02-two.md": text | null (delete) }).
   */
  const materialise = (overlay = null, files = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "docs-lint-"));
    tempDirs.push(dir);
    cpSync(baseDir, dir, { recursive: true });
    if (overlay) cpSync(join(fixturesRoot, overlay), dir, { recursive: true });
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(dir, rel);
      if (text === null) rmSync(abs, { force: true });
      else {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, text);
      }
    }
    return dir;
  };

  const readFixture = (overlay, rel) => readFileSync(join(fixturesRoot, overlay, rel), "utf-8");

  const run = (args = [], dir = baseDir, opts = {}) =>
    spawnSync(process.execPath, [scriptPath, "--dir", dir, ...args], { encoding: "utf-8", ...opts });

  const runJson = (args = [], dir = baseDir) => {
    const res = run(["--json", ...args], dir);
    let report = null;
    try {
      report = JSON.parse(res.stdout);
    } catch {
      throw new Error(`--json did not print JSON (status ${res.status}):\nstdout: ${res.stdout}\nstderr: ${res.stderr}`);
    }
    return { res, report };
  };

  const expectOnly = (report, check) => {
    expect(report.violations.length, `expected ${check} violations, got none`).toBeGreaterThan(0);
    for (const v of report.violations) {
      expect(v.check, `unexpected ${v.check} violation: ${v.file}:${v.line} ${v.message}`).toBe(check);
    }
  };

  const messagesOf = (report, check) => report.violations.filter((v) => v.check === check).map((v) => v.message);

  describe("registry", () => {
    it("module exports", async () => {
      const mod = await loadModule();
      expect(Object.keys(mod.CHECKS).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(Object.keys(mod.STRICT_CHECKS).map(Number).sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13]);
      for (const entry of [...Object.values(mod.CHECKS), ...Object.values(mod.STRICT_CHECKS)]) {
        expect(typeof entry.id).toBe("string");
        expect(typeof entry.description).toBe("string");
      }
      expect(mod.TEMPLATE_SECTIONS).toHaveLength(13);
      expect(mod.TEMPLATE_SECTIONS[0]).toBe("Inputs (required)");
      expect(mod.TEMPLATE_SECTIONS[12]).toBe("References");
      expect(mod.HEADER_FIELDS).toEqual(HEADER_FIELDS);
      expect([...mod.STATUS_VOCABULARY].sort()).toEqual(["BLOCKED", "DONE", "DROPPED", "IN_PROGRESS", "TODO"]);
      expect(typeof mod.lintDocs).toBe("function");
      expect(typeof mod.parseTree).toBe("function");
      expect(typeof mod.parseSubtaskFile).toBe("function");
    });

    it("implements every documented check (BR-S01.T10-03)", async () => {
      const mod = await loadModule();
      const conventions = readFileSync(join(realDocs, "project/08-conventions.md"), "utf-8").split(/\r?\n/);
      const start = conventions.findIndex((l) => l.startsWith("## Consistency checks"));
      expect(start, "conventions doc has a '## Consistency checks' heading").toBeGreaterThanOrEqual(0);
      const items = [];
      for (let i = start + 1; i < conventions.length; i++) {
        const line = conventions[i];
        if (line.startsWith("## ")) break;
        const m = /^(\d+)\. (.*)$/.exec(line);
        if (m) items.push({ n: Number(m[1]), text: m[2] });
      }
      expect(items.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      expect(items.filter((x) => x.n <= 8)).toHaveLength(Object.keys(mod.CHECKS).length);
      expect(items.filter((x) => x.n >= 9)).toHaveLength(Object.keys(mod.STRICT_CHECKS).length);
      for (const { n, text } of items) {
        const entry = n <= 8 ? mod.CHECKS[n] : mod.STRICT_CHECKS[n];
        expect(entry, `check ${n} ("${text}") has no registry entry`).toBeDefined();
        const shared = CHECK_KEYWORDS[n].filter(
          (kw) => text.toLowerCase().includes(kw.toLowerCase()) && entry.description.toLowerCase().includes(kw.toLowerCase()),
        );
        expect(shared.length, `check ${n}: description "${entry.description}" shares no keyword with "${text}"`).toBeGreaterThan(0);
      }
    });
  });

  describe("fixtures (BR-S01.T10-04)", () => {
    it("_base fixture lints clean in both modes", () => {
      const res = run();
      expect(res.status, res.stdout + res.stderr).toBe(0);
      expect(res.stdout).toBe("");
      const { res: strictRes, report } = runJson(["--strict"]);
      expect(strictRes.status, strictRes.stdout + strictRes.stderr).toBe(0);
      expect(report).toMatchObject({ ok: true, counts: { errors: 0, warnings: 0 }, violations: [], parseErrors: [] });
    });

    for (let n = 1; n <= 13; n++) {
      const check = `check-${n}`;
      const strictArgs = STRICT.has(n) ? ["--strict"] : [];

      it(`${check} has a failing bad fixture and a passing good fixture`, () => {
        for (const kind of ["bad", "good"]) {
          const dir = join(fixturesRoot, check, kind);
          expect(existsSync(dir), `${check}/${kind} is missing`).toBe(true);
          expect(listFiles(dir).length, `${check}/${kind} is empty`).toBeGreaterThan(0);
        }
        const bad = materialise(`${check}/bad`);
        const { res, report } = runJson(strictArgs, bad);
        expect(res.status, `bad: ${res.stdout}${res.stderr}`).toBe(1);
        expect(report.ok).toBe(false);
        expect(report.parseErrors).toEqual([]);
        expectOnly(report, check);

        const good = materialise(`${check}/good`);
        const goodRes = run(strictArgs, good);
        expect(goodRes.status, `good: ${goodRes.stdout}${goodRes.stderr}`).toBe(0);
        expect(goodRes.stdout).toBe("");
      });
    }

    it("strict checks do not run without --strict", () => {
      for (const n of STRICT) {
        const dir = materialise(`check-${n}/bad`);
        const res = run([], dir);
        expect(res.status, `check-${n}/bad without --strict: ${res.stdout}${res.stderr}`).toBe(0);
      }
    });
  });

  describe("messages", () => {
    it("check-1 names the bad ID and the line of the header row", () => {
      const dir = materialise("check-1/bad");
      const text = readFixture("check-1/bad", "stages/01-alpha/T02-two.md");
      const { report } = runJson([], dir);
      const hit = report.violations.find((v) => v.check === "check-1");
      expect(hit).toBeDefined();
      expect(hit.message).toContain("S01.T09");
      expect(hit.line).toBe(lineOf(text, "| Depends on |"));
      expect(hit.file).toMatch(/stages\/01-alpha\/T02-two\.md$/);
      expect(hit.file).not.toContain("\\");
      const textRes = run([], dir);
      expect(textRes.status).toBe(1);
      expect(textRes.stdout).toMatch(/T02-two\.md:\d+ \[check-1\] .*S01\.T09/);
    });

    it("check-2 reports both directions", () => {
      // T01 still lists S01.T02 although T02 no longer depends on it, and no longer lists S02.T01 although it does.
      const dir = materialise("check-2/bad");
      const { report } = runJson([], dir);
      const messages = messagesOf(report, "check-2");
      expect(messages.some((m) => m.includes("Unblocks lists S01.T02") && m.includes("S01.T01"))).toBe(true);
      expect(messages.some((m) => /S02\.T01 depends on S01\.T01 but "Unblocks" does not list it/.test(m))).toBe(true);
      const t01Line = lineOf(readFixture("check-2/bad", "stages/01-alpha/T01-one.md"), "| Unblocks |");
      for (const v of report.violations) {
        expect(v.file).toMatch(/T01-one\.md$/);
        expect(v.line).toBe(t01Line);
      }
    });

    it("check-2 and check-5 both fire when a dependency is removed but its input stays", () => {
      const t02 = readFileSync(join(baseDir, "stages/01-alpha/T02-two.md"), "utf-8").replace(
        "| Depends on | [S01.T01](T01-one.md) |",
        "| Depends on | — |",
      );
      const dir = materialise(null, { "stages/01-alpha/T02-two.md": t02 });
      const { res, report } = runJson([], dir);
      expect(res.status).toBe(1);
      const checks = new Set(report.violations.map((v) => v.check));
      expect(checks).toEqual(new Set(["check-2", "check-5"]));
      expect(messagesOf(report, "check-2").some((m) => m.includes("Unblocks lists S01.T02"))).toBe(true);
      expect(messagesOf(report, "check-5").some((m) => m.includes("S01.T01"))).toBe(true);
    });

    it("check-3 prints the cycle path", () => {
      const dir = materialise("check-3/bad");
      const { report } = runJson([], dir);
      const messages = messagesOf(report, "check-3");
      expect(messages.some((m) => /S01\.T01 -> S01\.T02 -> S01\.T01/.test(m))).toBe(true);
    });

    it("check-3 rejects a later-stage dependency and a non-lower intra-stage id", () => {
      // S01.T02 depends on S02.T01 (later stage); S02.T01 lists it back so check 2 stays quiet.
      const later = materialise(null, {
        "stages/01-alpha/T02-two.md": readFileSync(join(baseDir, "stages/01-alpha/T02-two.md"), "utf-8").replace(
          "| Depends on | [S01.T01](T01-one.md) |",
          "| Depends on | [S01.T01](T01-one.md), S02.T01 |",
        ),
        "stages/02-beta/T01-three.md": readFileSync(join(baseDir, "stages/02-beta/T01-three.md"), "utf-8").replace(
          "| Unblocks | — |",
          "| Unblocks | S01.T02 |",
        ),
      });
      const laterReport = runJson([], later);
      expect(laterReport.res.status).toBe(1);
      expectOnly(laterReport.report, "check-3");
      expect(messagesOf(laterReport.report, "check-3").some((m) => m.includes("S02.T01") && m.includes("S01.T02"))).toBe(true);

      // S01.T01 depends on S01.T02 without a cycle: T02 drops its dependency and its input, T01 lists nothing.
      const t01 = readFileSync(join(baseDir, "stages/01-alpha/T01-one.md"), "utf-8")
        .replace("| Depends on | — |", "| Depends on | S01.T02 |")
        .replace("| Unblocks | [S01.T02](T02-two.md), [S02.T01](../02-beta/T01-three.md) |", "| Unblocks | [S02.T01](../02-beta/T01-three.md) |");
      const t02 = readFileSync(join(baseDir, "stages/01-alpha/T02-two.md"), "utf-8")
        .replace("| Depends on | [S01.T01](T01-one.md) |", "| Depends on | — |")
        .replace("| Unblocks | — |", "| Unblocks | S01.T01 |")
        .replace("- `module` one — the first module — from [S01.T01](T01-one.md)", "- `doc` conventions — the template — from `project/08-conventions.md`");
      const intra = materialise(null, { "stages/01-alpha/T01-one.md": t01, "stages/01-alpha/T02-two.md": t02 });
      const intraReport = runJson([], intra);
      expect(intraReport.res.status).toBe(1);
      expectOnly(intraReport.report, "check-3");
      expect(intraReport.report.violations.some((v) => /T01-one\.md$/.test(v.file) && v.message.includes("S01.T02"))).toBe(true);
      expect(intraReport.report.violations.some((v) => v.message.includes("->"))).toBe(false);
    });

    it("check-4 message carries the expected value", () => {
      const dir = materialise("check-4/bad");
      const { report } = runJson([], dir);
      const [hit, ...rest] = report.violations;
      expect(rest).toEqual([]);
      expect(hit.check).toBe("check-4");
      expect(hit.message).toContain('expected "2 / 2"');
      expect(hit.message).toContain('got "2 / 3"');
      expect(hit.line).toBe(lineOf(readFixture("check-4/bad", "stages/01-alpha/T02-two.md"), "| Order in stage |"));
    });

    it("check-6 counts by the id cell only", () => {
      // good: T01 appears in T02's Depends-on cell of the stage README (and the title has an em dash).
      const good = materialise("check-6/good");
      expect(run([], good).status).toBe(0);
      // bad: the T01 row is duplicated.
      const bad = materialise("check-6/bad");
      const { report } = runJson([], bad);
      const hits = report.violations.filter((v) => v.check === "check-6");
      expect(hits.some((v) => v.message.includes("S01.T01") && /stage README rows: 2/.test(v.message))).toBe(true);
      expect(hits.some((v) => v.message.includes("S01.T02"))).toBe(false);
    });

    it("check-6 reports a missing stage README row and a missing index entry with line 0", () => {
      const alpha = readFileSync(join(baseDir, "stages/01-alpha/README.md"), "utf-8").replace(
        "| 2 | [S01.T02](T02-two.md) | Two | [S01.T01](T01-one.md) | no | TODO |\n",
        "",
      );
      const index = readFileSync(join(baseDir, "README.md"), "utf-8").replace("- [S01.T02](stages/01-alpha/T02-two.md) Two\n", "");
      const dir = materialise(null, { "stages/01-alpha/README.md": alpha, "README.md": index });
      const { res, report } = runJson([], dir);
      expect(res.status).toBe(1);
      expectOnly(report, "check-6");
      expect(report.violations.some((v) => /stage README rows: 0/.test(v.message) && v.message.includes("S01.T02"))).toBe(true);
      expect(report.violations.some((v) => /index entries: 0/.test(v.message) && v.message.includes("S01.T02"))).toBe(true);
      for (const v of report.violations) expect(v.line).toBe(0);
    });

    it("check-7 reports a missing RN against the traceability line", () => {
      const dir = materialise("check-7/bad");
      const trace = readFixture("check-7/bad", "project/05-business-rules-traceability.md");
      const { report } = runJson([], dir);
      const hit = report.violations.find((v) => v.check === "check-7" && v.message.includes("RN-03"));
      expect(hit).toBeDefined();
      expect(hit.file).toMatch(/05-business-rules-traceability\.md$/);
      expect(hit.line).toBe(lineOf(trace, "| RN-03 |"));
      expect(hit.message).toContain("S09.T01");
      // The other two defects of the same overlay: T02 lacks its RN-01 row, S02.T01 has an empty section.
      expect(report.violations.some((v) => /T02-two\.md$/.test(v.file) && v.message.includes("RN-01"))).toBe(true);
      expect(report.violations.some((v) => /T01-three\.md$/.test(v.file) && v.message.includes("Edge cases and error handling"))).toBe(true);
    });

    it("check-7 reports a missing section and a section out of order", () => {
      const base = readFileSync(join(baseDir, "stages/01-alpha/T02-two.md"), "utf-8");
      const missing = base.replace("## Data operations\nNo database, no endpoint.\n\n", "");
      const dir = materialise(null, { "stages/01-alpha/T02-two.md": missing });
      const { report } = runJson([], dir);
      expectOnly(report, "check-7");
      expect(report.violations.some((v) => v.message.includes("Data operations"))).toBe(true);

      const swapped = base
        .replace("## Data operations\nNo database, no endpoint.\n\n", "")
        .replace("## Implementation steps\n", "## Data operations\nNo database, no endpoint.\n\n## Implementation steps\n");
      const dir2 = materialise(null, { "stages/01-alpha/T02-two.md": swapped });
      const out = runJson([], dir2);
      expectOnly(out.report, "check-7");
    });

    it("check-8 duplicate names both locations and says to choose the next free number", () => {
      const dir = materialise("check-8/bad");
      const { report } = runJson([], dir);
      const messages = messagesOf(report, "check-8");
      const dup = messages.find((m) => m.includes("duplicate BR-S01.T01-01"));
      expect(dup, JSON.stringify(messages)).toBeDefined();
      expect(dup).toMatch(/T01-one\.md:\d+/);
      expect(dup).toContain("choose the next free number in this file");
      expect(messages.some((m) => m.includes("BR-S01.T01-01") && m.includes("wrong file"))).toBe(true);
      expect(messages.some((m) => /no gaps: got 01,03/.test(m))).toBe(true);
    });

    it("strict check-9 rejects an invalid status (BR-S01.T10-08)", () => {
      const dir = materialise("check-9/bad");
      const { res, report } = runJson(["--strict"], dir);
      expect(res.status).toBe(1);
      const hit = report.violations.find((v) => v.check === "check-9" && /T02-two\.md$/.test(v.file));
      expect(hit).toBeDefined();
      expect(hit.message).toContain("COMPLETED");
      expect(hit.line).toBe(lineOf(readFixture("check-9/bad", "stages/01-alpha/T02-two.md"), "| Status |"));
    });

    it("strict check-9 rejects a status that disagrees with the stage table (BR-S01.T10-08)", () => {
      const dir = materialise("check-9/bad");
      const { report } = runJson(["--strict"], dir);
      const hit = report.violations.find((v) => v.check === "check-9" && /T01-three\.md$/.test(v.file));
      expect(hit).toBeDefined();
      expect(hit.message).toContain("DONE");
      expect(hit.message).toContain("TODO");
    });
  });

  describe("parse errors", () => {
    it("a file with no H1 exits 2, not 1", () => {
      const text = readFileSync(join(baseDir, "stages/01-alpha/T02-two.md"), "utf-8").replace("# S01.T02 — Two", "Two");
      const dir = materialise(null, { "stages/01-alpha/T02-two.md": text });
      const res = run([], dir);
      expect(res.status).toBe(2);
      expect(res.stderr.replace(/\\/g, "/")).toMatch(/docs-lint: .*stages\/01-alpha\/T02-two\.md:1 /);
      const { res: jsonRes, report } = runJson([], dir);
      expect(jsonRes.status).toBe(2);
      expect(report.ok).toBe(false);
      expect(report.parseErrors.length).toBeGreaterThan(0);
      expect(report.parseErrors[0].file).toMatch(/T02-two\.md$/);
      expect(report.parseErrors[0].line).toBe(1);
    });

    it("an H1 whose id disagrees with the path exits 2 naming both", () => {
      const text = readFileSync(join(baseDir, "stages/01-alpha/T02-two.md"), "utf-8").replace("# S01.T02 — Two", "# S01.T03 — Two");
      const dir = materialise(null, { "stages/01-alpha/T02-two.md": text });
      const res = run([], dir);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("S01.T03");
      expect(res.stderr).toContain("S01.T02");
    });

    it("a file with no header table exits 2", () => {
      const base = readFileSync(join(baseDir, "stages/01-alpha/T02-two.md"), "utf-8");
      const start = base.indexOf("| Field | Value |");
      const end = base.indexOf("## Inputs (required)");
      const text = base.slice(0, start) + base.slice(end);
      const dir = materialise(null, { "stages/01-alpha/T02-two.md": text });
      const res = run([], dir);
      expect(res.status).toBe(2);
      expect(res.stderr.replace(/\\/g, "/")).toMatch(/T02-two\.md:\d+ /);
    });

    it("a missing index, traceability doc or stage README exits 2", () => {
      for (const rel of ["README.md", "project/05-business-rules-traceability.md", "stages/02-beta/README.md"]) {
        const dir = materialise(null, { [rel]: null });
        const res = run([], dir);
        expect(res.status, `${rel}: ${res.stdout}${res.stderr}`).toBe(2);
        expect(res.stderr.replace(/\\/g, "/")).toContain(rel);
      }
    });

    it("parse errors win over violations", () => {
      const text = readFixture("check-1/bad", "stages/01-alpha/T02-two.md").replace("# S01.T02 — Two", "Two");
      const dir = materialise(null, { "stages/01-alpha/T02-two.md": text });
      expect(run([], dir).status).toBe(2);
    });

    it("unknown argument exits 2", () => {
      const res = run(["--fix-order"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("--fix-order");
      expect(run(["--dir"]).status).toBe(2);
    });
  });

  describe("grammar edge cases (BR-S01.T10-05)", () => {
    it("IDs in prose are ignored", () => {
      const text = readFileSync(join(baseDir, "stages/01-alpha/T02-two.md"), "utf-8").replace(
        "## Context\n",
        "## Context\nThis paragraph mentions S09.T99 and BR-S09.T99-01 in prose; see also [S09.T99](T99-nope.md).\n",
      );
      const dir = materialise(null, { "stages/01-alpha/T02-two.md": text });
      expect(run([], dir).status).toBe(0);
      const { res, report } = runJson(["--strict"], dir);
      expect(res.status).toBe(1);
      expectOnly(report, "check-12");
      expect(report.violations.some((v) => v.message.includes("T99-nope.md"))).toBe(true);
    });

    it("CRLF, NBSP and en dash \"none\" are accepted", () => {
      const dir = materialise(null);
      rewriteTree(dir, (text) => text.replace(/\r?\n/g, "\r\n"));
      const t01 = join(dir, "stages/01-alpha/T01-one.md");
      writeFileSync(
        t01,
        readFileSync(t01, "utf-8")
          .replace("| Depends on | — |", "| Depends on | – |")
          .replace("| Parallel with | — |", "| Parallel with |  |"),
      );
      const res = run(["--strict"], dir);
      expect(res.status, res.stdout + res.stderr).toBe(0);
    });

    it("a violation's line on a CRLF file equals the editor line", () => {
      const dir = materialise("check-1/bad");
      rewriteTree(dir, (text) => text.replace(/\r?\n/g, "\r\n"));
      const text = readFileSync(join(dir, "stages/01-alpha/T02-two.md"), "utf-8");
      const { report } = runJson([], dir);
      expectOnly(report, "check-1");
      expect(report.violations[0].line).toBe(lineOf(text, "| Depends on |"));
    });

    it("*.log.md companions are ignored", () => {
      const dir = materialise(null, {
        "stages/01-alpha/T01-one.log.md": "not a subtask\n| garbage |\n## nothing\n",
        "stages/01-alpha/notes.md": "# also ignored\n",
      });
      expect(run(["--strict"], dir).status).toBe(0);
    });

    it("a redirect stub counts as existing and is a warning under --strict", () => {
      // T02 was renamed to T02-deux.md; the old path holds a one-line stub.
      const t02 = readFileSync(join(baseDir, "stages/01-alpha/T02-two.md"), "utf-8");
      const dir = materialise(null, {
        "stages/01-alpha/T02-two.md": "# S01.T02 — Two\n\nThis subtask moved to [T02-deux.md](T02-deux.md).\n",
        "stages/01-alpha/T02-deux.md": t02,
      });
      const plain = runJson([], dir);
      expect(plain.res.status, plain.res.stdout + plain.res.stderr).toBe(0);
      const strict = runJson(["--strict"], dir);
      expect(strict.report.counts.warnings).toBeGreaterThan(0);
      expect(strict.report.violations.some((v) => v.severity === "warning" && v.message.includes("S01.T02"))).toBe(true);
    });

    it("parseSubtaskFile exposes the header fields, sections and graph ids", async () => {
      const mod = await loadModule();
      const text = readFileSync(join(baseDir, "stages/02-beta/T01-three.md"), "utf-8");
      const parsed = mod.parseSubtaskFile(text, "stages/02-beta/T01-three.md");
      expect(parsed.id).toBe("S02.T01");
      expect(parsed.title).toBe("Three");
      expect(Object.keys(parsed.header)).toEqual(HEADER_FIELDS);
      expect(parsed.header["Status"].value).toBe("TODO");
      expect(parsed.header["Depends on"].line).toBe(lineOf(text, "| Depends on |"));
      expect(parsed.dependsOn).toEqual(["S01.T01"]);
      expect(parsed.unblocks).toEqual([]);
      expect(parsed.inputs.map((x) => x.ids)).toEqual([["S01.T01"]]);
      expect(parsed.outputs.map((x) => x.ids)).toEqual([[]]);
      expect(parsed.sections.map((s) => s.name)).toEqual(mod.TEMPLATE_SECTIONS);
      expect(parsed.rules.map((r) => r.id)).toEqual(["BR-S02.T01-01", "BR-S02.T01-02"]);
    });

    it("lintDocs and parseTree work on the fixture without the CLI", async () => {
      const mod = await loadModule();
      const tree = mod.parseTree(baseDir);
      expect(Object.keys(tree.subtasks).sort()).toEqual(["S01.T01", "S01.T02", "S02.T01"]);
      const report = mod.lintDocs({ dir: baseDir, strict: true });
      expect(report).toMatchObject({ ok: true, counts: { errors: 0, warnings: 0 }, violations: [], parseErrors: [] });
      const bad = mod.lintDocs({ dir: join(fixturesRoot, "check-4/bad"), strict: false });
      expect(bad.parseErrors.length).toBeGreaterThan(0);
    });
  });

  describe("real tree (integration)", () => {
    it("--json on the real tree reports ok: true", () => {
      const res = spawnSync(process.execPath, [scriptPath, "--json"], { encoding: "utf-8", cwd: repoRoot });
      expect(res.status, res.stdout + res.stderr).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.ok).toBe(true);
      expect(report.violations).toEqual([]);
      expect(report.parseErrors).toEqual([]);
    });

    it("--dir defaults to <repoRoot>/docs regardless of cwd", () => {
      const elsewhere = materialise(null);
      const res = spawnSync(process.execPath, [scriptPath, "--json"], { encoding: "utf-8", cwd: elsewhere });
      expect(res.status, res.stdout + res.stderr).toBe(0);
      expect(JSON.parse(res.stdout).ok).toBe(true);
    });

    it("reported paths are forward-slash and relative to the cwd", () => {
      const dir = materialise("check-1/bad");
      const res = spawnSync(process.execPath, [scriptPath, "--dir", dir, "--json"], { encoding: "utf-8", cwd: dir });
      const report = JSON.parse(res.stdout);
      expect(report.violations[0].file).toBe("stages/01-alpha/T02-two.md");
      const text = spawnSync(process.execPath, [scriptPath, "--dir", dir], { encoding: "utf-8", cwd: dir });
      expect(text.stdout).toMatch(/^stages\/01-alpha\/T02-two\.md:\d+ \[check-1\] /m);
      // Text output is grouped by check number then path.
      const multi = materialise("check-3/bad", {
        "stages/01-alpha/T02-two.md": readFixture("check-3/bad", "stages/01-alpha/T02-two.md").replace("| Order in stage | 2 / 2 |", "| Order in stage | 2 / 5 |"),
      });
      const lines = spawnSync(process.execPath, [scriptPath, "--dir", multi], { encoding: "utf-8", cwd: multi }).stdout.trim().split(/\r?\n/);
      const checks = lines.map((l) => Number(/\[check-(\d+)\]/.exec(l)?.[1]));
      expect(checks).toEqual([...checks].sort((a, b) => a - b));
    });

    it("exits 1 and leaves the tree byte-identical (BR-S01.T10-02, -05)", () => {
      const before = hashTree(realDocs);
      expect(spawnSync(process.execPath, [scriptPath], { encoding: "utf-8", cwd: repoRoot }).status).toBe(0);
      expect(spawnSync(process.execPath, [scriptPath, "--strict", "--json"], { encoding: "utf-8", cwd: repoRoot }).status).toBeLessThanOrEqual(1);
      expect(hashTree(realDocs)).toBe(before);

      const bad = materialise("check-8/bad");
      const badBefore = hashTree(bad);
      const res = run([], bad);
      expect(res.status).toBe(1);
      expect(hashTree(bad)).toBe(badBefore);

      const source = readFileSync(scriptPath, "utf-8");
      for (const api of ["writeFileSync", "appendFileSync", "rmSync", "renameSync", "mkdirSync", "unlinkSync", "createWriteStream", "fs/promises"]) {
        expect(source, `docs-lint.mjs must not use ${api}`).not.toContain(api);
      }
      expect(statSync(scriptPath).isFile()).toBe(true);
    });
  });
});
