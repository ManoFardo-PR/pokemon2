import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";

// S01.T09 — docs/NOTICE.md structure lint (scripts/notice-lint.mjs).
// Module contract assumed by this suite (besides the CLI):
//   EXPECTED_IDS: string[]  FIELDS: string[]  CHECKS: Record<number, ...> (keys 1..7)
//   lintNotice({ file, registry, strings }) => { ok, violations, parseError? }
//   parseNotice(text) => { sections: Array<{ id, name, line, fields: Record<string, string> }> }
// The module is imported dynamically so a missing script fails each test, not the file load.

// Resolved from this file, not process.cwd(): `pnpm --filter @pokesearch/db exec` runs with cwd packages/db.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = join(repoRoot, "scripts/notice-lint.mjs");

const EXPECTED_IDS = [
  "pokemon-tcg-data",
  "tcgdex",
  "limitless-api",
  "limitless-web",
  "limitless-cdn",
  "images-pokemontcg-io",
  "wjsutton",
  "twinleafgg",
  "ptcg-engine",
  "rulebook",
  "trademarks",
  "dependencies",
];

const FIELDS = [
  "url",
  "provides",
  "enters-as",
  "used-by",
  "licence",
  "status",
  "question",
  "owner",
  "attribution",
  "restrictions",
  "if-refused",
];

const DISCLAIMER = "Não afiliado à Nintendo / The Pokémon Company.";
const DATA_SOURCES = "Dados: pokemon-tcg-data, TCGdex, Limitless.";
const NOT_PORTED = "Nothing from this repository is ported.";

type Field = [string, string];
type Section = { id: string; name: string; fields: Field[]; extraLines?: string[] };

function baseFields(id: string): Field[] {
  return [
    ["url", `https://example.org/${id}`],
    ["provides", `data for ${id}`],
    ["enters-as", "API + file cache"],
    ["used-by", "packages/etl (S02.T03)"],
    ["licence", "MIT"],
    ["status", `verified 2026-09-25, https://example.org/${id}/LICENSE, sha abc123`],
    ["question", "n/a"],
    ["owner", "user"],
    ["attribution", "none required"],
    ["restrictions", "no redistribution; no paid key required"],
    ["if-refused", "drop the source"],
  ];
}

function setField(section: Section, key: string, value: string): void {
  const entry = section.fields.find(([k]) => k === key);
  if (!entry) throw new Error(`fixture: no field ${key} in ${section.id}`);
  entry[1] = value;
}

function sectionById(sections: Section[], id: string): Section {
  const s = sections.find((x) => x.id === id);
  if (!s) throw new Error(`fixture: no section ${id}`);
  return s;
}

function validSections(): Section[] {
  const sections: Section[] = EXPECTED_IDS.map((id) => ({
    id,
    name: id.toUpperCase(),
    fields: baseFields(id),
  }));

  const ptcgData = sectionById(sections, "pokemon-tcg-data");
  setField(ptcgData, "licence", "undeclared");
  setField(ptcgData, "status", "unverified — no LICENSE file, license: null");
  setField(ptcgData, "question", "does the user accept fetching an unlicensed dataset?");
  setField(ptcgData, "owner", "user");

  const engine = sectionById(sections, "ptcg-engine");
  setField(engine, "provides", `legacy Python engine, consulted only. ${NOT_PORTED}`);

  const trademarks = sectionById(sections, "trademarks");
  setField(trademarks, "licence", "n/a");
  setField(trademarks, "status", "n/a — trademark notice, nothing fetched");
  setField(
    trademarks,
    "attribution",
    `${DISCLAIMER}\nNot affiliated with Nintendo, Creatures Inc., GAME FREAK inc. or The Pokémon Company.`,
  );

  return sections;
}

function renderSection(s: Section): string[] {
  const lines = [`### ${s.id} — ${s.name}`];
  for (const [key, value] of s.fields) {
    const [first, ...rest] = value.split("\n");
    lines.push(`- ${key}: ${first ?? ""}`);
    for (const cont of rest) lines.push(`  ${cont}`);
  }
  if (s.extraLines) lines.push(...s.extraLines);
  lines.push("");
  return lines;
}

function renderNotice(sections: Section[], opts: { sourcesHeading?: boolean } = {}): string {
  const lines = [
    "# NOTICE — external sources, terms and attribution",
    "",
    "Register of facts, not legal advice. Project licence pending (O-1).",
    "",
    "Register last verified: 2026-09-25. Tools: gh 2.83.2, pnpm 12.0.0, node v24.13.0.",
    "",
  ];
  if (opts.sourcesHeading !== false) lines.push("## Sources", "");
  for (const s of sections) lines.push(...renderSection(s));
  lines.push(
    "## Verification procedure",
    "",
    "gh api repos/<owner>/<repo>/license",
    "",
    "## Own work products",
    "",
    "The user's own rules spreadsheet, recipes and legacy tests.",
    "",
    "## Amendment log",
    "",
    "| Date | Section | Change |",
    "|---|---|---|",
    "| 2026-09-25 | all | register created |",
    "",
  );
  return lines.join("\n");
}

function validNotice(): string {
  return renderNotice(validSections());
}

/** 1-based line number of the first line starting with `prefix` after the `### <id> ` heading. */
function lineOf(text: string, sectionId: string, prefix: string): number {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`### ${sectionId} `));
  if (start < 0) throw new Error(`fixture: heading ${sectionId} not found`);
  for (let i = start + 1; i < lines.length; i++) {
    if ((lines[i] ?? "").startsWith(prefix)) return i + 1;
  }
  throw new Error(`fixture: ${prefix} not found in ${sectionId}`);
}

function stringsFixture(disclaimer = DISCLAIMER, dataSources = DATA_SOURCES): string {
  return [
    "export const strings = {",
    '  brand: "PokéSearch",',
    "  footer: {",
    `    dataSources: "${dataSources}",`,
    `    disclaimer: "${disclaimer}",`,
    "  },",
    "} as const;",
    "",
  ].join("\n");
}

type Violation = { file: string; line: number; check: string; message: string };
type JsonReport = {
  ok: boolean;
  counts: { errors: number };
  violations: Violation[];
  registry?: string;
};

async function loadModule(): Promise<any> {
  return import(pathToFileURL(scriptPath).href);
}

describe("S01.T09: notice-lint (scripts/notice-lint.mjs)", () => {
  let tempDir: string;
  let noticePath: string;
  let registryPath: string;
  let stringsPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "notice-lint-"));
    noticePath = join(tempDir, "NOTICE.md");
    registryPath = join(tempDir, "sources.ts");
    stringsPath = join(tempDir, "strings.ts");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  type RunOpts = { notice?: string | null; registry?: string | null; strings?: string | null; json?: boolean };

  /** Writes fixtures (null = leave absent) and runs the CLI with explicit --file/--registry/--strings. */
  const run = (opts: RunOpts = {}) => {
    const notice = opts.notice === undefined ? validNotice() : opts.notice;
    const strings = opts.strings === undefined ? stringsFixture() : opts.strings;
    if (notice !== null) writeFileSync(noticePath, notice);
    if (opts.registry != null) writeFileSync(registryPath, opts.registry);
    if (strings !== null) writeFileSync(stringsPath, strings);
    const args = [scriptPath, "--file", noticePath, "--registry", registryPath, "--strings", stringsPath];
    if (opts.json) args.push("--json");
    return spawnSync(process.execPath, args, { encoding: "utf-8" });
  };

  const runJson = (opts: RunOpts = {}) => {
    const res = run({ ...opts, json: true });
    return { res, report: JSON.parse(res.stdout) as JsonReport };
  };

  const expectViolation = (report: JsonReport, check: string, ...fragments: string[]) => {
    const hits = report.violations.filter((v) => v.check.includes(check));
    expect(hits.length, `expected a ${check} violation, got ${JSON.stringify(report.violations)}`).toBeGreaterThan(0);
    for (const f of fragments) {
      expect(hits.some((v) => v.message.includes(f)), `no ${check} message contains "${f}"`).toBe(true);
    }
  };

  describe("module exports", () => {
    it("exports EXPECTED_IDS, FIELDS and a CHECKS registry keyed 1..7", async () => {
      const mod = await loadModule();
      expect(mod.EXPECTED_IDS).toEqual(EXPECTED_IDS);
      expect(mod.FIELDS).toEqual(FIELDS);
      expect(Object.keys(mod.CHECKS).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(typeof mod.lintNotice).toBe("function");
      expect(typeof mod.parseNotice).toBe("function");
    });
  });

  describe("structural checks", () => {
    it("1. valid NOTICE exits 0 and prints nothing in text mode", () => {
      const res = run();
      expect(res.status).toBe(0);
      expect(res.stdout.trim()).toBe("");
    });

    it("2. --json on valid NOTICE prints a parseable ok report", () => {
      const { res, report } = runJson();
      expect(res.status).toBe(0);
      expect(report).toMatchObject({ ok: true, counts: { errors: 0 }, violations: [] });
    });

    it("3. missing NOTICE file exits 2 and names the path on stderr", () => {
      const res = run({ notice: null });
      expect(res.status).toBe(2);
      expect(res.stderr.replace(/\\/g, "/")).toContain("NOTICE.md");
    });

    it("4. NOTICE without a '## Sources' heading exits 2", () => {
      const res = run({ notice: renderNotice(validSections(), { sourcesHeading: false }) });
      expect(res.status).toBe(2);
    });

    it("5. a '###' line without the ' — ' separator exits 2 naming the line", () => {
      const text = validNotice().replace("### tcgdex — TCGDEX", "### tcgdex - TCGDEX");
      const badLine = text.split("\n").findIndex((l) => l === "### tcgdex - TCGDEX") + 1;
      const res = run({ notice: text });
      expect(res.status).toBe(2);
      expect(`${res.stdout}\n${res.stderr}`).toMatch(new RegExp(`\\b${badLine}\\b`));
    });

    it("6. a stray non-field line inside a section exits 2", () => {
      const sections = validSections();
      sectionById(sections, "wjsutton").extraLines = ["this line is neither a field nor a continuation"];
      const res = run({ notice: renderNotice(sections) });
      expect(res.status).toBe(2);
    });

    it("7. a missing section id is reported by name [notice-1]", () => {
      const sections = validSections().filter((s) => s.id !== "limitless-cdn");
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-1", "limitless-cdn");
    });

    it("8. an extra section is reported as unexpected [notice-1]", () => {
      const sections = validSections();
      sections.push({ id: "foo", name: "Foo", fields: baseFields("foo") });
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-1", "foo");
    });

    it("9. a duplicate section id is reported [notice-1]", () => {
      const sections = validSections();
      sections.push({ id: "tcgdex", name: "TCGdex again", fields: baseFields("tcgdex") });
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-1", "tcgdex");
    });

    it("10. a missing field names the section and the field [notice-2]", () => {
      const sections = validSections();
      const tcgdex = sectionById(sections, "tcgdex");
      tcgdex.fields = tcgdex.fields.filter(([k]) => k !== "if-refused");
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-2", "tcgdex", "if-refused");
    });

    it("11. fields out of order are reported [notice-2]", () => {
      const sections = validSections();
      const tcgdex = sectionById(sections, "tcgdex");
      const [url, provides, ...rest] = tcgdex.fields;
      if (!url || !provides) throw new Error("fixture");
      tcgdex.fields = [provides, url, ...rest];
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-2", "tcgdex");
    });

    it("12. an empty value is reported [notice-2]", () => {
      const sections = validSections();
      setField(sectionById(sections, "rulebook"), "owner", "");
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-2", "rulebook", "owner");
    });

    it("13. a repeated field inside one section is reported [notice-2]", () => {
      const sections = validSections();
      const rulebook = sectionById(sections, "rulebook");
      rulebook.fields.splice(2, 0, ["provides", "again"]);
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-2", "rulebook", "provides");
    });

    it("14. multi-line attribution (two-space continuation) is valid and parsed with a newline", async () => {
      const sections = validSections();
      setField(
        sectionById(sections, "wjsutton"),
        "attribution",
        "Copyright (c) 2025 Will Sutton\nPermission is hereby granted, free of charge, to any person",
      );
      const text = renderNotice(sections);
      expect(run({ notice: text }).status).toBe(0);

      const mod = await loadModule();
      const parsed = mod.parseNotice(text) as { sections: Array<{ id: string; fields: Record<string, string> }> };
      const wj = parsed.sections.find((s) => s.id === "wjsutton");
      const value = wj?.fields["attribution"] ?? "";
      expect(value).toContain("\n");
      expect(value).toContain("Copyright (c) 2025 Will Sutton");
      expect(value).toContain("Permission is hereby granted");

      writeFileSync(noticePath, text);
      writeFileSync(stringsPath, stringsFixture());
      const result = mod.lintNotice({ file: noticePath, registry: registryPath, strings: stringsPath });
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it("15. CRLF line endings are accepted", () => {
      const res = run({ notice: validNotice().split("\n").join("\r\n") });
      expect(res.status).toBe(0);
    });

    it("16. the violation line equals the 1-based line of the offending field", () => {
      const sections = validSections();
      setField(sectionById(sections, "limitless-web"), "owner", "");
      const text = renderNotice(sections);
      const expected = lineOf(text, "limitless-web", "- owner:");
      const { report } = runJson({ notice: text });
      const hit = report.violations.find((v) => v.check.includes("notice-2"));
      expect(hit?.line).toBe(expected);

      const textRes = run({ notice: text });
      expect(textRes.stdout).toMatch(new RegExp(`:${expected} \\[notice-2\\] `));
    });
  });

  describe("status grammar [notice-3]", () => {
    const withStatus = (status: string) => {
      const sections = validSections();
      setField(sectionById(sections, "tcgdex"), "status", status);
      return renderNotice(sections);
    };

    it("17. 'verified <date>, <evidence>' is accepted", () => {
      const res = run({ notice: withStatus("verified 2026-09-25, https://github.com/x/y/blob/main/LICENSE sha abc") });
      expect(res.status).toBe(0);
    });

    it("18. 'verified' without a date is rejected", () => {
      const { res, report } = runJson({ notice: withStatus("verified") });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-3", "tcgdex");
    });

    it("19. 'verified <date>' without evidence after the comma is rejected", () => {
      const { res, report } = runJson({ notice: withStatus("verified 2026-09-25") });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-3");
    });

    it("20. an unknown status word is rejected", () => {
      const { res, report } = runJson({ notice: withStatus("pending") });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-3");
    });

    it("21a. 'n/a — reason' is accepted", () => {
      expect(run({ notice: withStatus("n/a — not fetched") }).status).toBe(0);
    });

    it("21b. 'unverified — reason' is accepted when question and owner are present", () => {
      const sections = validSections();
      const tcgdex = sectionById(sections, "tcgdex");
      setField(tcgdex, "status", "unverified — no network");
      setField(tcgdex, "question", "what do the API terms say about automated access?");
      setField(tcgdex, "owner", "user");
      expect(run({ notice: renderNotice(sections) }).status).toBe(0);
    });
  });

  describe("unverified requires question and owner [notice-4] (BR-S01.T09-03)", () => {
    it("22. unverified with question n/a is reported naming section and field", () => {
      const sections = validSections();
      setField(sectionById(sections, "pokemon-tcg-data"), "question", "n/a");
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-4", "pokemon-tcg-data", "question");
    });

    it("23. unverified with owner n/a is reported", () => {
      const sections = validSections();
      setField(sectionById(sections, "pokemon-tcg-data"), "owner", "n/a");
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-4", "pokemon-tcg-data", "owner");
    });

    it("24. verified with question n/a is fine", () => {
      const sections = validSections();
      expect(sectionById(sections, "tcgdex").fields.find(([k]) => k === "question")?.[1]).toBe("n/a");
      expect(run({ notice: renderNotice(sections) }).status).toBe(0);
    });
  });

  describe("ptcg-engine not ported [notice-5] (BR-S01.T09-04)", () => {
    it("25. ptcg-engine without the not-ported sentence is reported", () => {
      const sections = validSections();
      setField(sectionById(sections, "ptcg-engine"), "provides", "legacy Python engine, consulted only.");
      const { res, report } = runJson({ notice: renderNotice(sections) });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-5", "ptcg-engine");
    });

    it("25b. the sentence is also accepted in restrictions", () => {
      const sections = validSections();
      const engine = sectionById(sections, "ptcg-engine");
      setField(engine, "provides", "legacy Python engine, consulted only.");
      setField(engine, "restrictions", `consult only. ${NOT_PORTED}`);
      expect(run({ notice: renderNotice(sections) }).status).toBe(0);
    });
  });

  describe("registry cross-check [notice-6] (BR-S01.T09-01)", () => {
    it("26. an absent registry is skipped and reported as 'absent' in --json", () => {
      const { res, report } = runJson({ registry: null });
      expect(res.status).toBe(0);
      expect(report.registry).toBe("absent");
    });

    it("27. a registry id without a NOTICE section is reported", () => {
      const registry = [
        "export const sources = [",
        '  { id: "pokemon-tcg-data", kind: "download" },',
        '  { id: "brand-new-source", kind: "api" },',
        "];",
        "",
      ].join("\n");
      const { res, report } = runJson({ registry });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-6", "brand-new-source", "sources.ts");
      expect(report.violations.some((v) => v.message.includes("pokemon-tcg-data"))).toBe(false);
    });

    it("28. single-quoted registry ids are recognised", () => {
      const registry = "export const sources = [{ id: 'tcgdex', kind: 'api' }];\n";
      expect(run({ registry }).status).toBe(0);
    });
  });

  describe("footer cross-check [notice-7] (BR-S01.T09-05, -07)", () => {
    it("29. a disclaimer that differs from trademarks attribution is reported", () => {
      const { res, report } = runJson({ strings: stringsFixture("Não afiliado à Nintendo.") });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-7", "disclaimer");
    });

    it("30. dataSources missing a source name is reported", () => {
      const { res, report } = runJson({ strings: stringsFixture(DISCLAIMER, "Dados: pokemon-tcg-data, Limitless.") });
      expect(res.status).toBe(1);
      expectViolation(report, "notice-7", "TCGdex");
    });

    it("31. an absent strings file is skipped", () => {
      expect(run({ strings: null }).status).toBe(0);
    });
  });
});

describe("S01.T09: real repository files (integration)", () => {
  const realNotice = join(repoRoot, "docs/NOTICE.md");
  const readNotice = () => readFileSync(realNotice, "utf-8").replace(/\r\n/g, "\n");

  /** Splits the '## Sources' block of the real NOTICE into sections with their field values (first line only). */
  const realSections = () => {
    const text = readNotice();
    const start = text.indexOf("\n## Sources");
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = text.slice(start + 1);
    const nextH2 = rest.slice(1).search(/^## /m);
    const block = nextH2 < 0 ? rest : rest.slice(0, nextH2 + 1);
    const sections: Array<{ id: string; fields: Record<string, string> }> = [];
    for (const line of block.split("\n")) {
      const heading = /^### ([a-z0-9-]+) — /.exec(line);
      if (heading?.[1]) {
        sections.push({ id: heading[1], fields: {} });
        continue;
      }
      const field = /^- ([a-z-]+): (.*)$/.exec(line);
      const current = sections[sections.length - 1];
      if (field?.[1] && current && !(field[1] in current.fields)) {
        current.fields[field[1]] = (field[2] ?? "").trim();
      }
    }
    return sections;
  };

  it("32. lint passes with defaults against the real NOTICE, strings and (absent) registry", () => {
    const res = spawnSync(process.execPath, [scriptPath, "--json"], { encoding: "utf-8", cwd: repoRoot });
    expect(res.status, res.stdout + res.stderr).toBe(0);
    const report = JSON.parse(res.stdout) as JsonReport;
    expect(report.ok).toBe(true);
  });

  it("33. the real NOTICE has exactly the twelve sections in the expected order", () => {
    expect(realSections().map((s) => s.id)).toEqual(EXPECTED_IDS);
  });

  it("34. every unverified section has a real question and owner", () => {
    for (const s of realSections()) {
      if ((s.fields["status"] ?? "").startsWith("unverified")) {
        expect(s.fields["question"], `${s.id}.question`).toBeTruthy();
        expect(s.fields["question"], `${s.id}.question`).not.toBe("n/a");
        expect(s.fields["owner"], `${s.id}.owner`).toBeTruthy();
        expect(s.fields["owner"], `${s.id}.owner`).not.toBe("n/a");
      }
    }
  });

  it("35. trademarks attribution first line equals strings.footer.disclaimer byte for byte", () => {
    const stringsText = readFileSync(join(repoRoot, "apps/web/src/strings.ts"), "utf-8");
    const disclaimer = /disclaimer:\s*"([^"]*)"/.exec(stringsText)?.[1];
    expect(disclaimer).toBeDefined();
    const trademarks = realSections().find((s) => s.id === "trademarks");
    expect(trademarks?.fields["attribution"]).toBe(disclaimer);
  });

  it("36. root README carries the licence-pending line", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf-8");
    expect(readme).toMatch(/licen[cs]e pending — all rights reserved/i);
  });

  it("37. root package.json wires notice-lint into check and exposes notice:lint", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["check"]).toContain("node scripts/notice-lint.mjs");
    expect(pkg.scripts["notice:lint"]).toBe("node scripts/notice-lint.mjs");
  });

  it("38. no image file is tracked by git", () => {
    const res = spawnSync("git", ["ls-files"], { encoding: "utf-8", cwd: repoRoot });
    expect(res.status).toBe(0);
    const images = res.stdout.split(/\r?\n/).filter((p) => /\.(png|jpe?g|webp)$/i.test(p));
    expect(images).toEqual([]);
  });

  it("39. the lint never writes: NOTICE hash is identical before and after a run", () => {
    const hash = () => createHash("sha256").update(readFileSync(realNotice)).digest("hex");
    const before = hash();
    spawnSync(process.execPath, [scriptPath], { encoding: "utf-8", cwd: repoRoot });
    expect(hash()).toBe(before);
  });
});
