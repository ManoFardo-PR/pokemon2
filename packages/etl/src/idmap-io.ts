import * as fs from "node:fs";
import * as path from "node:path";
import { OverridesSchema, type Overrides } from "./idmap.js";

/**
 * The shipped default when `idmap-overrides.json` is absent. A *malformed* file
 * is a hard error instead, because silently ignoring a typo would silently
 * change the mapping (BR-S02.T04-09).
 */
export const EMPTY_OVERRIDES: Overrides = { sets: {}, cards: {} };

export class OverridesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverridesError";
  }
}

/**
 * Reads and validates `idmap-overrides.json`. A missing file yields the empty
 * default; unparseable JSON or a schema violation throws with the offending
 * file path and, for a schema violation, the offending key path.
 * BR-S02.T04-09.
 */
export function loadOverrides(filePath: string): Overrides {
  if (!fs.existsSync(filePath)) {
    return { sets: {}, cards: {} };
  }

  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new OverridesError(
      `Cannot read overrides file '${filePath}': ${(err as Error).message}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new OverridesError(
      `Overrides file '${filePath}' is not valid JSON: ${(err as Error).message}`
    );
  }

  const result = OverridesSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new OverridesError(`Overrides file '${filePath}' is malformed — ${details}`);
  }

  return result.data;
}

export interface UnmatchedSetRow {
  ptcgSetId: string;
  name: string;
  releaseDate: string | null;
}

export interface UnmatchedCardRow {
  ptcgSetId: string;
  tcgdexSetId: string | null;
  ptcgCardId: string;
  number: string;
  name: string;
}

/** RFC 4180: quote when the field contains a quote, comma, CR or LF. */
function csvField(value: string | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/["\r\n,]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvLine(fields: Array<string | null | undefined>): string {
  return fields.map(csvField).join(",");
}

/** Locale-independent ordering, so the same input always yields the same file. */
function compare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Renders both reports. Split out from the writer so the formatting is testable
 * without touching the filesystem.
 */
export function renderUnmatchedSetsCsv(rows: readonly UnmatchedSetRow[]): string {
  const sorted = [...rows].sort((a, b) => compare(a.ptcgSetId, b.ptcgSetId));
  const lines = ["ptcg_set_id,name,release_date"];
  for (const row of sorted) {
    lines.push(csvLine([row.ptcgSetId, row.name, row.releaseDate]));
  }
  return `${lines.join("\n")}\n`;
}

export function renderUnmatchedCardsCsv(rows: readonly UnmatchedCardRow[]): string {
  const sorted = [...rows].sort(
    (a, b) =>
      compare(a.ptcgSetId, b.ptcgSetId) ||
      compare(a.number, b.number) ||
      compare(a.ptcgCardId, b.ptcgCardId)
  );
  const lines = ["ptcg_set_id,tcgdex_set_id,ptcg_card_id,number,name"];
  for (const row of sorted) {
    lines.push(
      csvLine([row.ptcgSetId, row.tcgdexSetId, row.ptcgCardId, row.number, row.name])
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Writes `idmap_unmatched_sets.csv` and `idmap_unmatched_cards.csv` into `dir`.
 * Both files are rewritten whole, the header is always present, and the same
 * input produces byte-identical files. BR-S02.T04-03, BR-S02.T04-08.
 */
export async function writeUnmatchedReports(
  dir: string,
  data: { sets: readonly UnmatchedSetRow[]; cards: readonly UnmatchedCardRow[] }
): Promise<{ setsFile: string; cardsFile: string }> {
  await fs.promises.mkdir(dir, { recursive: true });

  const setsFile = path.join(dir, "idmap_unmatched_sets.csv");
  const cardsFile = path.join(dir, "idmap_unmatched_cards.csv");

  await fs.promises.writeFile(setsFile, renderUnmatchedSetsCsv(data.sets), "utf8");
  await fs.promises.writeFile(cardsFile, renderUnmatchedCardsCsv(data.cards), "utf8");

  return { setsFile, cardsFile };
}
