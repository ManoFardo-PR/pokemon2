#!/usr/bin/env node
/**
 * S01.T10 — docs lint.
 *
 * Reads docs/README.md, docs/project/05-business-rules-traceability.md, every docs/stages/<NN-slug>/README.md and every
 * docs/stages/<NN-slug>/T<nn>-<slug>.md, and reports the consistency checks of docs/project/08-conventions.md
 * §"Consistency checks". Checks 1–8 always run; 9–13 run under --strict.
 *
 * BR-S01.T10-02 / -05: the lint is read-only by construction — it imports nothing that can write a file. It parses only
 * header tables, section headings, bullet lines of Inputs/Outputs, rule rows and inline links; prose is never interpreted.
 *
 *   node scripts/docs-lint.mjs [--json] [--strict] [--dir <docs>]
 *   exit 0 clean · 1 violations · 2 a file could not be parsed / bad usage
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HEADER_FIELDS = ["Stage", "Status", "Order in stage", "Depends on", "Unblocks", "Parallel with", "Gate", "Owner / Updated"];

export const TEMPLATE_SECTIONS = [
  "Inputs (required)",
  "Outputs (proposed)",
  "Initial objective",
  "Context",
  "Scope",
  "Business rules",
  "Data operations",
  "Interfaces",
  "Implementation steps",
  "Edge cases and error handling",
  "Acceptance / verification",
  "Risks and open questions",
  "References",
];

export const STATUS_VOCABULARY = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "DROPPED"];

/** Checks 1–8 of the conventions doc (BR-S01.T10-03): keyed by the number used there. */
export const CHECKS = {
  1: { id: "ids-exist", description: "every ID in Depends on, Unblocks, an input's from or an output's consumed by resolves to an existing subtask file" },
  2: { id: "unblocks-symmetry", description: "Unblocks of X equals the set of files whose Depends on contains X, reported in both directions" },
  3: { id: "graph-shape", description: "no dependency cycles (the cycle is printed as a path), no dependency on a later stage, intra-stage dependencies point to lower ids" },
  4: { id: "order-in-stage", description: "Order in stage n / N matches the file's position among the stage's ids and the stage size" },
  5: { id: "inputs-are-dependencies", description: "every input's from Sxx.Tyy names a subtask listed in Depends on" },
  6: { id: "listed-once", description: "every subtask file appears exactly once in its stage README table and exactly once in the index" },
  7: { id: "sections-and-rules", description: "every template-v2 section is present, in order and non-empty; every RN assigned in the traceability doc appears in the file's Business rules table" },
  8: { id: "br-ids", description: "BR- ids are unique across the tree, defined only by rule rows of their own file, start at 01 and have no gaps" },
};

/** Checks 9–13: proposed, run only under --strict until the conventions adopt them. */
export const STRICT_CHECKS = {
  9: { id: "status", description: "Status is from the vocabulary and agrees with the stage README row for the same subtask" },
  10: { id: "header-fields", description: "the header table has exactly the template's fields, in order; Gate is no or yes — fallback: …" },
  11: { id: "context-footer", description: "the Context docs: footer is present and its links resolve" },
  12: { id: "links-resolve", description: "every relative link resolves to an existing file; a link whose text is a subtask id points at that subtask's file" },
  13: { id: "acceptance-checkboxes", description: "acceptance checks are checkboxes (- [ ]) and there are at least five" },
};

const DEFAULT_DIR = fileURLToPath(new URL("../docs", import.meta.url));
const ID_RE = /\bS\d{2}\.T\d{2}\b/g;
const ID_ONLY_RE = /^S\d{2}\.T\d{2}$/;
const H1_RE = /^# (S\d{2}\.T\d{2}) [—–-] (.+)$/;
const BR_ROW_RE = /^(BR-(S\d{2}\.T\d{2})-(\d{2}))\b/;
const RN_ROW_RE = /^(RN-\d+)\b/;
const ORDER_RE = /^(\d+)\s*\/\s*(\d+)$/;
const GATE_RE = /^(no|yes [—–-] fallback: .+)$/;
const CHECKBOX_RE = /^- \[( |x|X)\] /;
const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const NONE_VALUES = new Set(["", "—", "–", "-"]);

class ParseError extends Error {
  constructor(line, message) {
    super(message);
    this.line = line;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------------------------------

const splitLines = (text) => text.replace(/^\uFEFF/, "").split(/\r?\n/);
const normalise = (s) => s.replace(/\u00A0/g, " ").trim();
const isNone = (value) => NONE_VALUES.has(normalise(value));
const isPipeRow = (line) => /^\s*\|/.test(line);
const isFence = (line) => /^\s*(```|~~~)/.test(line);
const isSeparatorRow = (cells) => cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
const pad2 = (n) => String(n).padStart(2, "0");

function uniqueIds(text) {
  return [...new Set(text.match(ID_RE) ?? [])];
}

function splitCells(line) {
  let s = normalise(line);
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map(normalise);
}

function stageNumber(id) {
  return Number(id.slice(1, 3));
}

function taskNumber(id) {
  return Number(id.slice(5, 7));
}

function idFromPath(relPath) {
  const m = /(?:^|[\\/])stages[\\/](\d{2})-[^\\/]*[\\/]T(\d{2})-[^\\/]*\.md$/.exec(relPath);
  return m ? `S${m[1]}.T${m[2]}` : null;
}

function toReportPath(abs) {
  return relative(process.cwd(), abs).split("\\").join("/");
}

/** Inline links of a line with inline code spans removed; fenced blocks are skipped by the caller. */
function linksOf(line) {
  const out = [];
  const stripped = line.replace(/`[^`]*`/g, "");
  for (const m of stripped.matchAll(LINK_RE)) {
    const text = normalise(m[1]);
    const target = m[2];
    if (SCHEME_RE.test(target) || target.startsWith("#")) continue;
    out.push({ text, target });
  }
  return out;
}

function linkTargetExists(fileAbs, target) {
  const bare = target.split("#")[0].split("?")[0];
  if (bare === "") return true;
  let decoded = bare;
  try {
    decoded = decodeURI(bare);
  } catch {
    return false;
  }
  return existsSync(resolve(dirname(fileAbs), decoded));
}

function samePath(a, b) {
  return relative(resolve(a), resolve(b)) === "";
}

/** Header row of the first pipe table that has a column named `column`, with the data rows that follow it. */
function tableRows(lines, column, firstCellRe) {
  const rows = [];
  let columns = null;
  let inFence = false;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFence(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!isPipeRow(line)) {
      inTable = false;
      continue;
    }
    const cells = splitCells(line);
    if (isSeparatorRow(cells)) continue;
    if (!inTable) {
      inTable = true;
      const idx = cells.findIndex((c) => c.toLowerCase() === column.toLowerCase());
      columns = idx >= 0 ? cells : null;
      if (idx >= 0) continue;
    }
    if (!columns) continue;
    if (firstCellRe && !firstCellRe.test(cells[0] ?? "")) continue;
    const byName = {};
    columns.forEach((name, idx) => {
      byName[name] = cells[idx] ?? "";
    });
    rows.push({ line: i + 1, cells, byName });
  }
  return { columns, rows };
}

// ---------------------------------------------------------------------------------------------------------------------
// Subtask file grammar (BR-S01.T10-05)
// ---------------------------------------------------------------------------------------------------------------------

/** A one-line redirect left at the old path after a rename: an H1 with the id, no table, no section, a link. */
export function isRedirectStub(text) {
  const lines = splitLines(text);
  const nonBlank = lines.map((l, i) => ({ l: normalise(l), i })).filter((x) => x.l !== "");
  if (nonBlank.length < 2 || nonBlank.length > 3) return null;
  const h1 = H1_RE.exec(nonBlank[0].l);
  if (!h1) return null;
  const body = nonBlank.slice(1);
  if (body.some((x) => isPipeRow(x.l) || x.l.startsWith("#"))) return null;
  const links = body.flatMap((x) => linksOf(x.l));
  if (links.length !== 1) return null;
  return { id: h1[1], title: h1[2].trim(), line: body[0].i + 1, target: links[0].target };
}

/**
 * Parses one subtask file. Throws ParseError (with `line`) when the file has no H1, an H1 whose id disagrees with the
 * path, no header table, or a header table lacking a row the graph needs.
 */
export function parseSubtaskFile(text, relPath) {
  const lines = splitLines(text);

  // (a) the H1 is the first non-blank line
  let h1Index = lines.findIndex((l) => normalise(l) !== "");
  if (h1Index < 0) h1Index = 0;
  const h1 = H1_RE.exec(normalise(lines[h1Index] ?? ""));
  if (!h1) throw new ParseError(h1Index + 1, 'expected the H1 "# Sxx.Tyy — Title" as the first line');
  const id = h1[1];
  const title = h1[2].trim();
  const pathId = idFromPath(relPath);
  if (pathId && pathId !== id) {
    throw new ParseError(h1Index + 1, `H1 id ${id} disagrees with the id implied by the path, ${pathId}`);
  }

  // (b) the header table: the first pipe table before the first section heading
  const header = {};
  const headerOrder = [];
  let headerLine = 0;
  let i = h1Index + 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,2} /.test(normalise(line))) break;
    if (!isPipeRow(line)) continue;
    headerLine = i + 1;
    for (; i < lines.length && isPipeRow(lines[i]); i++) {
      const cells = splitCells(lines[i]);
      if (isSeparatorRow(cells)) continue;
      if (cells.length < 2) continue;
      const field = cells[0];
      if (headerOrder.length === 0 && field.toLowerCase() === "field" && cells[1].toLowerCase() === "value") continue;
      headerOrder.push(field);
      header[field] = { value: cells[1], line: i + 1 };
    }
    break;
  }
  if (headerLine === 0) throw new ParseError(Math.min(i, lines.length - 1) + 1, "no header table between the H1 and the first section");
  for (const field of ["Depends on", "Unblocks", "Order in stage"]) {
    if (!header[field]) throw new ParseError(headerLine, `header table lacks the "${field}" row`);
  }

  // (f) sections: the "## " lines in document order, outside fenced code blocks
  const sections = [];
  const links = [];
  let inFence = false;
  for (let j = 0; j < lines.length; j++) {
    const line = lines[j];
    if (isFence(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^## (.+?)\s*$/.exec(normalise(line));
    if (m) sections.push({ name: m[1], line: j + 1, start: j + 1, end: lines.length, empty: true });
    for (const link of linksOf(line)) links.push({ line: j + 1, ...link });
  }
  for (let s = 0; s < sections.length; s++) {
    const section = sections[s];
    section.end = s + 1 < sections.length ? sections[s + 1].line - 1 : lines.length;
    section.empty = !lines.slice(section.start, section.end).some((l) => normalise(l) !== "");
  }
  const bodyOf = (name) => {
    const section = sections.find((s) => s.name === name);
    if (!section) return [];
    return lines.slice(section.start, section.end).map((l, k) => ({ line: section.start + k + 1, text: normalise(l) }));
  };

  // (c)(g) graph ids: header cells, and the "from" / "consumed by" tails of Inputs / Outputs bullets
  const idsOfCell = (field) => (isNone(header[field].value) ? [] : uniqueIds(header[field].value));
  const tailIds = (text, marker) => {
    const m = [...text.matchAll(marker)];
    if (m.length === 0) return [];
    const last = m[m.length - 1];
    return uniqueIds(text.slice(last.index + last[0].length));
  };
  const inputs = bodyOf("Inputs (required)")
    .filter((x) => x.text.startsWith("- "))
    .map((x) => ({ line: x.line, ids: tailIds(x.text, /\bfrom\b/g) }));
  const outputs = bodyOf("Outputs (proposed)")
    .filter((x) => x.text.startsWith("- "))
    .map((x) => ({ line: x.line, ids: tailIds(x.text, /\bconsumed by\b/g) }));

  // rule rows: pipe rows of the Business rules section whose first cell is a BR- or RN- id
  const rules = [];
  const rns = [];
  let inRulesFence = false;
  for (const { line, text } of bodyOf("Business rules")) {
    if (isFence(text)) {
      inRulesFence = !inRulesFence;
      continue;
    }
    if (inRulesFence || !isPipeRow(text)) continue;
    const first = splitCells(text)[0] ?? "";
    const br = BR_ROW_RE.exec(first);
    if (br) rules.push({ id: br[1], owner: br[2], number: Number(br[3]), line });
    const rn = RN_ROW_RE.exec(first);
    if (rn) rns.push({ id: rn[1], line });
  }

  // acceptance items: top-level bullets of the Acceptance section
  const acceptance = bodyOf("Acceptance / verification")
    .filter((x) => x.text.startsWith("- "))
    .map((x) => ({ line: x.line, checkbox: CHECKBOX_RE.test(x.text) }));

  // footer: the last "Context docs:" line after the References heading (or after the last heading)
  let footer = null;
  const references = sections.find((s) => s.name === "References");
  const footerFrom = references ? references.line : sections.length ? sections[sections.length - 1].line : 0;
  for (let j = lines.length - 1; j >= footerFrom; j--) {
    if (normalise(lines[j]).startsWith("Context docs:")) {
      footer = { line: j + 1, links: linksOf(lines[j]) };
      break;
    }
  }

  return {
    id,
    title,
    header,
    headerOrder,
    headerLine,
    dependsOn: idsOfCell("Depends on"),
    unblocks: idsOfCell("Unblocks"),
    inputs,
    outputs,
    sections: sections.map(({ name, line, empty }) => ({ name, line, empty })),
    rules,
    rns,
    acceptance,
    links,
    footer,
    lineCount: lines.length,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------------------------------------------------

function parseStageReadme(text) {
  const lines = splitLines(text);
  const { columns, rows } = tableRows(lines, "ID", /^\d+$/);
  if (!columns) throw new ParseError(1, 'no subtask table (a header row with an "ID" column)');
  return rows.map((row) => {
    const ids = uniqueIds(row.byName["ID"] ?? "");
    return { line: row.line, id: ids.length === 1 ? ids[0] : null, status: row.byName["Status"] ?? "", gate: row.byName["Gate"] ?? "" };
  });
}

function parseIndex(text) {
  const lines = splitLines(text);
  const start = lines.findIndex((l) => /^## Subtask index\b/.test(normalise(l)));
  if (start < 0) throw new ParseError(1, 'no "## Subtask index" section');
  const entries = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = normalise(lines[i]);
    if (line.startsWith("## ")) break;
    const m = /^- \[(S\d{2}\.T\d{2})\]\(([^)]*)\)/.exec(line);
    if (m) entries.push({ line: i + 1, id: m[1], target: m[2] });
  }
  return entries;
}

function parseTraceability(text) {
  const lines = splitLines(text);
  const { columns, rows } = tableRows(lines, "Implemented in", RN_ROW_RE);
  if (!columns) throw new ParseError(1, 'no rule table (a header row with an "Implemented in" column)');
  return rows.map((row) => ({ line: row.line, rn: RN_ROW_RE.exec(row.cells[0])[1], assigned: uniqueIds(row.byName["Implemented in"] ?? "") }));
}

/** Reads every file the lint needs under `dir`. Parse failures are collected, never thrown. */
export function parseTree(dir) {
  const root = resolve(dir);
  const parseErrors = [];
  const fail = (file, line, message) => parseErrors.push({ file, line, message });
  const readOr = (file, parser) => {
    if (!existsSync(file)) {
      fail(file, 0, "file is missing");
      return null;
    }
    try {
      return parser(readFileSync(file, "utf-8"));
    } catch (err) {
      fail(file, err instanceof ParseError ? err.line : 0, err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const indexFile = resolve(root, "README.md");
  const traceFile = resolve(root, "project/05-business-rules-traceability.md");
  const index = readOr(indexFile, parseIndex) ?? [];
  const traceability = readOr(traceFile, parseTraceability) ?? [];

  const subtasks = {};
  const stages = {};
  const redirects = [];
  const stagesDir = resolve(root, "stages");
  if (!existsSync(stagesDir)) fail(stagesDir, 0, "directory is missing");
  const stageDirs = existsSync(stagesDir)
    ? readdirSync(stagesDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^\d{2}-/.test(e.name))
        .map((e) => e.name)
        .sort()
    : [];
  for (const name of stageDirs) {
    const stageId = `S${name.slice(0, 2)}`;
    const stageDir = resolve(stagesDir, name);
    const readmeFile = resolve(stageDir, "README.md");
    const rows = readOr(readmeFile, parseStageReadme) ?? [];
    stages[stageId] = { id: stageId, dir: stageDir, readmeFile, rows, subtaskIds: [] };
    const files = readdirSync(stageDir)
      .filter((f) => /^T\d{2}-.*\.md$/.test(f) && !/\.log\.md$/.test(f))
      .sort();
    for (const f of files) {
      const file = resolve(stageDir, f);
      const rel = `stages/${name}/${f}`;
      let text;
      try {
        text = readFileSync(file, "utf-8");
      } catch (err) {
        fail(file, 0, err instanceof Error ? err.message : String(err));
        continue;
      }
      const stub = isRedirectStub(text);
      if (stub) {
        if (idFromPath(rel) !== stub.id) fail(file, 1, `redirect stub id ${stub.id} disagrees with the id implied by the path, ${idFromPath(rel)}`);
        else redirects.push({ file, ...stub });
        continue;
      }
      let parsed;
      try {
        parsed = parseSubtaskFile(text, rel);
      } catch (err) {
        fail(file, err instanceof ParseError ? err.line : 0, err instanceof Error ? err.message : String(err));
        continue;
      }
      if (subtasks[parsed.id]) {
        fail(file, 1, `duplicate subtask id ${parsed.id}: also defined by ${toReportPath(subtasks[parsed.id].file)}`);
        continue;
      }
      subtasks[parsed.id] = { ...parsed, file, stage: stageId };
      stages[stageId].subtaskIds.push(parsed.id);
    }
    stages[stageId].subtaskIds.sort();
  }

  return { root, indexFile, traceFile, index, traceability, subtasks, stages, redirects, parseErrors };
}

// ---------------------------------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------------------------------

function runChecks(tree, strict) {
  const violations = [];
  const error = (n, file, line, message) => violations.push({ file, line, check: `check-${n}`, message, severity: "error" });
  const warning = (n, file, line, message) => violations.push({ file, line, check: `check-${n}`, message, severity: "warning" });
  const { subtasks, stages, index, traceability, traceFile, indexFile, redirects } = tree;
  const ids = Object.keys(subtasks).sort();
  const exists = (id) => Object.hasOwn(subtasks, id);
  const rel = (id) => toReportPath(subtasks[id].file);

  // 1 ids-exist
  for (const id of ids) {
    const x = subtasks[id];
    for (const [field, list] of [
      ["Depends on", x.dependsOn],
      ["Unblocks", x.unblocks],
    ]) {
      for (const dep of list) if (!exists(dep)) error(1, x.file, x.header[field].line, `"${field}" names ${dep}, but no subtask file has that id`);
    }
    for (const input of x.inputs) for (const dep of input.ids) if (!exists(dep)) error(1, x.file, input.line, `input is "from ${dep}", but no subtask file has that id`);
    for (const output of x.outputs) for (const dep of output.ids) if (!exists(dep)) error(1, x.file, output.line, `output is "consumed by ${dep}", but no subtask file has that id`);
  }

  // 2 unblocks-symmetry (unknown ids are check 1's business)
  for (const id of ids) {
    const x = subtasks[id];
    const line = x.header["Unblocks"].line;
    for (const y of x.unblocks) {
      if (exists(y) && !subtasks[y].dependsOn.includes(id)) error(2, x.file, line, `Unblocks lists ${y} but that file's "Depends on" does not contain ${id}`);
    }
    for (const y of ids) {
      if (subtasks[y].dependsOn.includes(id) && !x.unblocks.includes(y)) error(2, x.file, line, `${y} depends on ${id} but "Unblocks" does not list it`);
    }
  }

  // 3 graph-shape
  for (const id of ids) {
    const x = subtasks[id];
    const line = x.header["Depends on"].line;
    for (const dep of x.dependsOn) {
      if (!exists(dep)) continue;
      if (stageNumber(dep) > stageNumber(id)) error(3, x.file, line, `${id} depends on ${dep}, which belongs to a later stage`);
      else if (stageNumber(dep) === stageNumber(id) && taskNumber(dep) >= taskNumber(id)) error(3, x.file, line, `${id} depends on ${dep}, which is not a lower id in the same stage`);
    }
  }
  {
    const colour = {};
    const stack = [];
    const visit = (id) => {
      colour[id] = 1;
      stack.push(id);
      for (const dep of subtasks[id].dependsOn) {
        if (!exists(dep)) continue;
        if (colour[dep] === 1) {
          const path = [...stack.slice(stack.indexOf(dep)), dep];
          const first = subtasks[path[0]];
          error(3, first.file, first.header["Depends on"].line, `dependency cycle: ${path.join(" -> ")}`);
        } else if (!colour[dep]) visit(dep);
      }
      stack.pop();
      colour[id] = 2;
    };
    for (const id of ids) if (!colour[id]) visit(id);
  }

  // 4 order-in-stage
  for (const stage of Object.values(stages)) {
    const n = stage.subtaskIds.length;
    stage.subtaskIds.forEach((id, idx) => {
      const x = subtasks[id];
      const cell = x.header["Order in stage"];
      const m = ORDER_RE.exec(cell.value);
      const expected = `${idx + 1} / ${n}`;
      if (!m || Number(m[1]) !== idx + 1 || Number(m[2]) !== n) error(4, x.file, cell.line, `Order in stage: expected "${expected}", got "${cell.value}"`);
    });
  }

  // 5 inputs-are-dependencies
  for (const id of ids) {
    const x = subtasks[id];
    for (const input of x.inputs) {
      for (const dep of input.ids) if (exists(dep) && !x.dependsOn.includes(dep)) error(5, x.file, input.line, `input is "from ${dep}" but "Depends on" does not list ${dep}`);
    }
  }

  // 6 listed-once
  for (const id of ids) {
    const x = subtasks[id];
    const stage = stages[x.stage];
    const rows = stage.rows.filter((r) => r.id === id);
    if (rows.length !== 1) error(6, stage.readmeFile, rows.length ? rows[rows.length - 1].line : 0, `${id} must appear exactly once in the stage README table (stage README rows: ${rows.length})`);
    const entries = index.filter((e) => e.id === id);
    if (entries.length !== 1) error(6, indexFile, entries.length ? entries[entries.length - 1].line : 0, `${id} must appear exactly once in the index (index entries: ${entries.length})`);
  }
  for (const stage of Object.values(stages)) {
    for (const row of stage.rows) if (row.id && !exists(row.id)) error(6, stage.readmeFile, row.line, `stage README row names ${row.id}, but no subtask file has that id`);
  }
  for (const entry of index) if (!exists(entry.id)) error(6, indexFile, entry.line, `index entry names ${entry.id}, but no subtask file has that id`);

  // 7 sections-and-rules
  for (const id of ids) {
    const x = subtasks[id];
    const present = [];
    for (const section of x.sections) {
      if (!TEMPLATE_SECTIONS.includes(section.name)) continue;
      if (present.some((p) => p.name === section.name)) error(7, x.file, section.line, `section "${section.name}" appears more than once`);
      else present.push(section);
    }
    for (const name of TEMPLATE_SECTIONS) {
      if (present.some((p) => p.name === name)) continue;
      const after = TEMPLATE_SECTIONS.slice(TEMPLATE_SECTIONS.indexOf(name) + 1).map((n) => present.find((p) => p.name === n)).find(Boolean);
      error(7, x.file, after ? after.line : x.lineCount, `section "${name}" is missing`);
    }
    const expectedOrder = TEMPLATE_SECTIONS.filter((name) => present.some((p) => p.name === name));
    for (let k = 0; k < present.length; k++) {
      if (present[k].name !== expectedOrder[k]) {
        error(7, x.file, present[k].line, `section "${present[k].name}" is out of order: expected "${expectedOrder[k]}" here (template order: ${TEMPLATE_SECTIONS.join(", ")})`);
        break;
      }
    }
    for (const section of present) if (section.empty) error(7, x.file, section.line, `section "${section.name}" is empty`);
  }
  for (const row of traceability) {
    for (const id of row.assigned) {
      if (!exists(id)) {
        error(7, traceFile, row.line, `${row.rn} is assigned to ${id}, but no subtask file has that id`);
        continue;
      }
      const x = subtasks[id];
      if (!x.rns.some((r) => r.id === row.rn)) {
        const rulesSection = x.sections.find((s) => s.name === "Business rules");
        error(7, x.file, rulesSection ? rulesSection.line : 1, `${row.rn} is assigned to ${id} by the traceability doc (line ${row.line}) but is missing from its Business rules table`);
      }
    }
  }

  // 8 br-ids
  {
    const definitions = new Map();
    for (const id of ids) {
      for (const rule of subtasks[id].rules) {
        if (!definitions.has(rule.id)) definitions.set(rule.id, []);
        definitions.get(rule.id).push({ id, file: subtasks[id].file, line: rule.line, owner: rule.owner });
      }
    }
    for (const [brId, defs] of definitions) {
      if (defs.length < 2) continue;
      const canonical = defs.find((d) => d.owner === d.id) ?? defs[0];
      for (const d of defs) {
        if (d === canonical) continue;
        error(8, d.file, d.line, `duplicate ${brId}: already defined at ${toReportPath(canonical.file)}:${canonical.line}; choose the next free number in this file`);
      }
    }
    for (const id of ids) {
      const x = subtasks[id];
      const own = [];
      for (const rule of x.rules) {
        if (rule.owner !== id) error(8, x.file, rule.line, `${rule.id} is defined in the wrong file: rule rows in ${id} may only define BR-${id}-nn ids`);
        else own.push(rule);
      }
      if (own.length === 0) continue;
      const numbers = [...new Set(own.map((r) => r.number))].sort((a, b) => a - b);
      const contiguous = numbers.every((n, k) => n === k + 1);
      if (!contiguous) error(8, x.file, own[0].line, `BR ids in ${id} must start at 01 with no gaps: got ${numbers.map(pad2).join(",")}`);
    }
  }

  if (!strict) return violations;

  // 9 status
  for (const id of ids) {
    const x = subtasks[id];
    const cell = x.header["Status"];
    if (!cell) {
      error(9, x.file, x.headerLine, 'header table lacks the "Status" row');
      continue;
    }
    if (!STATUS_VOCABULARY.includes(cell.value)) {
      error(9, x.file, cell.line, `Status "${cell.value}" is not in the vocabulary (${STATUS_VOCABULARY.join(", ")})`);
      continue;
    }
    const rows = stages[x.stage].rows.filter((r) => r.id === id);
    if (rows.length === 1 && rows[0].status !== cell.value) error(9, x.file, cell.line, `Status "${cell.value}" disagrees with the stage README row, which says "${rows[0].status}"`);
  }

  // 10 header-fields
  for (const id of ids) {
    const x = subtasks[id];
    if (x.headerOrder.join("|") !== HEADER_FIELDS.join("|")) error(10, x.file, x.headerLine, `header fields must be exactly ${HEADER_FIELDS.join(", ")} in that order; got ${x.headerOrder.join(", ")}`);
    const gate = x.header["Gate"];
    if (gate && !GATE_RE.test(gate.value)) error(10, x.file, gate.line, `Gate must be "no" or "yes — fallback: …", got "${gate.value}"`);
  }

  // 11 context-footer
  for (const id of ids) {
    const x = subtasks[id];
    if (!x.footer) {
      error(11, x.file, x.lineCount, '"Context docs:" footer line is missing after the References section');
      continue;
    }
    for (const link of x.footer.links) if (!linkTargetExists(x.file, link.target)) error(11, x.file, x.footer.line, `footer link ${link.target} does not resolve`);
  }

  // 12 links-resolve
  for (const id of ids) {
    const x = subtasks[id];
    for (const link of x.links) {
      if (!linkTargetExists(x.file, link.target)) {
        error(12, x.file, link.line, `link ${link.target} does not resolve to an existing file`);
        continue;
      }
      if (!ID_ONLY_RE.test(link.text) || !exists(link.text)) continue;
      const target = resolve(dirname(x.file), link.target.split("#")[0]);
      const y = subtasks[link.text];
      if (samePath(target, y.file)) continue;
      if (redirects.some((r) => r.id === link.text && samePath(r.file, target))) continue;
      error(12, x.file, link.line, `link [${link.text}](${link.target}) does not point at that subtask's file, ${rel(link.text)}`);
    }
  }

  // 13 acceptance-checkboxes
  for (const id of ids) {
    const x = subtasks[id];
    const section = x.sections.find((s) => s.name === "Acceptance / verification");
    if (!section) continue;
    for (const item of x.acceptance) if (!item.checkbox) error(13, x.file, item.line, 'acceptance item is not a checkbox ("- [ ] …")');
    const count = x.acceptance.filter((item) => item.checkbox).length;
    if (count < 5) error(13, x.file, section.line, `acceptance section has ${count} checkbox item(s); at least five are required`);
  }

  // redirect stubs are valid link targets, but worth a warning
  for (const stub of redirects) warning(1, stub.file, stub.line, `${stub.id} is a redirect stub here (points to ${stub.target}); update links to the new path`);

  return violations;
}

const checkNumber = (v) => Number(v.check.slice(6));

/** Lints the docs tree under `dir`. Never writes. */
export function lintDocs({ dir = DEFAULT_DIR, strict = false } = {}) {
  const tree = parseTree(dir);
  const violations = tree.parseErrors.length ? [] : runChecks(tree, strict);
  violations.sort((a, b) => checkNumber(a) - checkNumber(b) || a.file.localeCompare(b.file) || a.line - b.line);
  const errors = violations.filter((v) => v.severity === "error").length;
  const warnings = violations.length - errors;
  return {
    ok: errors === 0 && tree.parseErrors.length === 0,
    counts: { errors, warnings },
    violations: violations.map((v) => ({ ...v, file: toReportPath(v.file) })),
    parseErrors: tree.parseErrors.map((e) => ({ ...e, file: toReportPath(e.file) })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------------

const USAGE = "usage: node scripts/docs-lint.mjs [--json] [--strict] [--dir <docs>]";

function main(argv) {
  let json = false;
  let strict = false;
  let dir = DEFAULT_DIR;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") json = true;
    else if (arg === "--strict") strict = true;
    else if (arg === "--dir") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        process.stderr.write(`docs-lint: --dir needs a directory\n${USAGE}\n`);
        return 2;
      }
      dir = resolve(value);
      i++;
    } else {
      process.stderr.write(`docs-lint: unknown argument ${arg}\n${USAGE}\n`);
      return 2;
    }
  }

  const report = lintDocs({ dir, strict });
  for (const e of report.parseErrors) process.stderr.write(`docs-lint: ${e.file}:${e.line} ${e.message}\n`);
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    for (const v of report.violations) {
      const prefix = v.severity === "warning" ? "warning: " : "";
      process.stdout.write(`${v.file}:${v.line} [${v.check}] ${prefix}${v.message}\n`);
    }
  }
  if (report.parseErrors.length) return 2;
  return report.counts.errors ? 1 : 0;
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
