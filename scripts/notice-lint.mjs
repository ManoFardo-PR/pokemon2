#!/usr/bin/env node
// S01.T09 — validates docs/NOTICE.md (field set, status grammar) and cross-checks it against
// the ETL source registry and the web footer strings. Read-only: it never writes a file.
//
// Usage: node scripts/notice-lint.mjs [--file <NOTICE.md>] [--registry <sources.ts>] [--strings <strings.ts>] [--json]
// Exit codes: 0 = valid, 1 = violations, 2 = unreadable file or malformed structure.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_IDS = [
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

export const FIELDS = [
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

export const CHECKS = {
  1: "notice-1: the '## Sources' block has exactly the expected section ids, once each",
  2: "notice-2: every section has the full field set, in order, once each, non-empty",
  3: "notice-3: status is 'verified <YYYY-MM-DD>, <evidence>', 'unverified[ — reason]' or 'n/a[ — reason]'",
  4: "notice-4: an unverified section names its question and owner (BR-S01.T09-03)",
  5: "notice-5: ptcg-engine states that nothing is ported (BR-S01.T09-04)",
  6: "notice-6: every ETL registry source has a NOTICE section (BR-S01.T09-01)",
  7: "notice-7: footer strings match the NOTICE attributions (BR-S01.T09-05, -07)",
};

const NOT_PORTED = "Nothing from this repository is ported.";
/** Source names the web footer's dataSources string must mention (BR-S01.T09-07). */
const FOOTER_SOURCES = ["pokemon-tcg-data", "TCGdex", "Limitless"];

const HEADING_RE = /^### ([a-z0-9-]+) — (.+)$/;
const FIELD_RE = /^- ([a-z][a-z-]*):(?: (.*))?$/;
const STATUS_VERIFIED_RE = /^verified (\d{4}-\d{2}-\d{2}), \S/s;
const STATUS_OTHER_RE = /^(unverified|n\/a)(?: — \S.*)?$/s;

class NoticeParseError extends Error {
  /** @param {number} line @param {string} message */
  constructor(line, message) {
    super(message);
    this.line = line;
  }
}

/**
 * Parses the '## Sources' block. Throws NoticeParseError on malformed structure.
 * Each section carries `fields` (first occurrence per key) and `entries` (every field line, in order).
 */
export function parseNotice(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trimEnd() === "## Sources");
  if (start < 0) throw new NoticeParseError(0, "no '## Sources' heading");

  const sections = [];
  let current = null;
  let lastEntry = null;
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const lineNo = i + 1;
    if (raw.startsWith("## ")) break;
    if (raw.trim() === "") {
      lastEntry = null;
      continue;
    }
    if (raw.startsWith("### ")) {
      const m = HEADING_RE.exec(raw.trimEnd());
      if (!m) throw new NoticeParseError(lineNo, `section heading must be '### <id> — <Name>': "${raw}"`);
      current = { id: m[1], name: m[2], line: lineNo, fields: {}, entries: [] };
      sections.push(current);
      lastEntry = null;
      continue;
    }
    if (!current) continue; // free text between '## Sources' and the first section
    const f = FIELD_RE.exec(raw.trimEnd());
    if (f) {
      lastEntry = { key: f[1], value: (f[2] ?? "").trim(), line: lineNo };
      current.entries.push(lastEntry);
      continue;
    }
    if (raw.startsWith("  ") && lastEntry) {
      lastEntry.value += `\n${raw.trim()}`;
      continue;
    }
    throw new NoticeParseError(lineNo, `line is neither a '- field:' nor a two-space continuation: "${raw}"`);
  }

  for (const s of sections) {
    for (const e of s.entries) {
      if (!(e.key in s.fields)) s.fields[e.key] = e.value;
    }
  }
  return { sections, sourcesLine: start + 1 };
}

/** 1-based line number of character offset `index` in `text`. */
function lineOfMatch(text, index) {
  return text.slice(0, index).split("\n").length;
}

function isBlankOrNa(value) {
  return value === undefined || value === "" || value.toLowerCase() === "n/a";
}

/**
 * Lints a NOTICE file. Paths that do not exist are skipped for `registry` and `strings`.
 * @returns {{ ok: boolean, violations: Array<{file: string, line: number, check: string, message: string}>, registry: "absent" | "checked", parseError?: {line: number, message: string} }}
 */
export function lintNotice({ file, registry, strings }) {
  const registryState = registry && existsSync(registry) ? "checked" : "absent";
  let text;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return { ok: false, violations: [], registry: registryState, parseError: { line: 0, message: `cannot read ${file}` } };
  }

  let parsed;
  try {
    parsed = parseNotice(text);
  } catch (err) {
    if (!(err instanceof NoticeParseError)) throw err;
    return { ok: false, violations: [], registry: registryState, parseError: { line: err.line, message: err.message } };
  }

  const violations = [];
  const report = (n, line, message, at = file) => violations.push({ file: at, line, check: `notice-${n}`, message });
  const { sections, sourcesLine } = parsed;

  // 1. section ids
  const seen = new Set();
  for (const s of sections) {
    if (seen.has(s.id)) report(1, s.line, `duplicate section "${s.id}"`);
    else if (!EXPECTED_IDS.includes(s.id)) report(1, s.line, `unexpected section "${s.id}"`);
    seen.add(s.id);
  }
  for (const id of EXPECTED_IDS) {
    if (!seen.has(id)) report(1, sourcesLine, `missing section "${id}"`);
  }

  for (const s of sections) {
    // 2. field set
    const keys = [];
    for (const e of s.entries) {
      if (!FIELDS.includes(e.key)) report(2, e.line, `section "${s.id}": unknown field "${e.key}"`);
      else if (keys.includes(e.key)) report(2, e.line, `section "${s.id}": field "${e.key}" repeated`);
      else keys.push(e.key);
      if (e.value === "") report(2, e.line, `section "${s.id}": field "${e.key}" is empty`);
    }
    const missing = FIELDS.filter((k) => !keys.includes(k));
    for (const k of missing) report(2, s.line, `section "${s.id}": missing field "${k}"`);
    const expectedOrder = FIELDS.filter((k) => keys.includes(k));
    if (keys.join() !== expectedOrder.join()) {
      report(2, s.line, `section "${s.id}": fields out of order, expected ${FIELDS.join(", ")}`);
    }

    // 3. status grammar
    const status = s.fields["status"];
    const statusLine = s.entries.find((e) => e.key === "status")?.line ?? s.line;
    if (status) {
      const verified = STATUS_VERIFIED_RE.exec(status);
      const validDate = verified && !Number.isNaN(Date.parse(verified[1]));
      if (!validDate && !STATUS_OTHER_RE.test(status)) {
        report(3, statusLine, `section "${s.id}": status "${status.split("\n")[0]}" does not match ${CHECKS[3].slice(10)}`);
      }
    }

    // 4. unverified needs question and owner
    if (status?.startsWith("unverified")) {
      for (const k of ["question", "owner"]) {
        const entry = s.entries.find((e) => e.key === k);
        if (entry && isBlankOrNa(entry.value)) {
          report(4, entry.line, `section "${s.id}" is unverified: field "${k}" must name ${k === "question" ? "the open question" : "who decides"}`);
        }
      }
    }
  }

  // 5. ptcg-engine not ported
  const engine = sections.find((s) => s.id === "ptcg-engine");
  if (engine && ![engine.fields["provides"], engine.fields["restrictions"]].some((v) => v?.includes(NOT_PORTED))) {
    report(5, engine.line, `section "ptcg-engine" must state "${NOT_PORTED}" in provides or restrictions`);
  }

  // 6. registry cross-check
  if (registryState === "checked") {
    const regText = readFileSync(registry, "utf-8");
    const ids = new Set(sections.map((s) => s.id));
    for (const m of regText.matchAll(/\bid\s*:\s*(["'])([^"']+)\1/g)) {
      if (!ids.has(m[2])) {
        report(6, lineOfMatch(regText, m.index), `registry source "${m[2]}" (${basename(registry)}) has no NOTICE section`, registry);
      }
    }
  }

  // 7. footer strings
  if (strings && existsSync(strings)) {
    const strText = readFileSync(strings, "utf-8");
    const disclaimer = /disclaimer:\s*"([^"]*)"/.exec(strText);
    const attribution = sections.find((s) => s.id === "trademarks")?.fields["attribution"]?.split("\n")[0];
    if (!disclaimer) report(7, 1, "footer disclaimer string not found", strings);
    else if (attribution !== undefined && disclaimer[1] !== attribution) {
      report(7, lineOfMatch(strText, disclaimer.index), `footer disclaimer "${disclaimer[1]}" differs from trademarks attribution "${attribution}"`, strings);
    }
    const dataSources = /dataSources:\s*"([^"]*)"/.exec(strText);
    if (!dataSources) report(7, 1, "footer dataSources string not found", strings);
    else {
      for (const name of FOOTER_SOURCES.filter((n) => !dataSources[1].includes(n))) {
        report(7, lineOfMatch(strText, dataSources.index), `footer dataSources does not name "${name}"`, strings);
      }
    }
  }

  return { ok: violations.length === 0, violations, registry: registryState };
}

function parseArgs(argv, repoRoot) {
  const opts = {
    file: join(repoRoot, "docs/NOTICE.md"),
    registry: join(repoRoot, "packages/etl/src/sources.ts"),
    strings: join(repoRoot, "apps/web/src/strings.ts"),
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if ((arg === "--file" || arg === "--registry" || arg === "--strings") && argv[i + 1]) {
      opts[arg.slice(2)] = resolve(argv[++i]);
    } else {
      throw new Error(`unknown or incomplete argument "${arg}"`);
    }
  }
  return opts;
}

function main() {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2), repoRoot);
  } catch (err) {
    console.error(`notice-lint: ${err.message}`);
    return 2;
  }

  const result = lintNotice(opts);
  if (result.parseError) {
    const { line, message } = result.parseError;
    console.error(`notice-lint: ${opts.file}${line ? `:${line}` : ""} ${message}`);
    return 2;
  }

  if (opts.json) {
    const out = { ok: result.ok, counts: { errors: result.violations.length }, violations: result.violations, registry: result.registry };
    console.log(JSON.stringify(out, null, 2));
  } else {
    for (const v of result.violations) console.log(`${v.file}:${v.line} [${v.check}] ${v.message}`);
  }
  return result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const selfPath = fileURLToPath(import.meta.url);
const isMain = process.platform === "win32" ? invokedPath.toLowerCase() === selfPath.toLowerCase() : invokedPath === selfPath;
if (isMain) process.exitCode = main();
