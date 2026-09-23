import type { Db } from "../client.js";
import { openDatabase, TestDbError } from "../client.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export { TestDbError };

export class FixtureTableMissing extends Error {
  readonly table: string;
  readonly fixture: string;

  constructor(table: string, fixture: string) {
    super(`FixtureTableMissing: ${table} (fixture ${fixture})`);
    this.name = "FixtureTableMissing";
    this.table = table;
    this.fixture = fixture;
  }
}

export interface TempDbInfo {
  db: Db;
  path: string;
  dir: string;
  schemaApplied: boolean;
}

export interface TempDbOptions {
  fixtures?: readonly string[];
  readonly?: boolean;
  keepOnFailure?: boolean;
}

export interface SchemaInitializer {
  key: string;
  apply: (db: Db) => void;
}

export const fixtureSourceSchema = z
  .object({
    ptcg: z
      .object({
        sets: z.array(z.record(z.unknown())).default([]),
        cards: z.array(z.record(z.unknown())).default([]),
      })
      .default({ sets: [], cards: [] }),
    tcgdex: z
      .object({
        cards: z.array(z.record(z.unknown())).default([]),
      })
      .default({ cards: [] }),
    limitless: z
      .object({
        tournaments: z.array(z.record(z.unknown())).default([]),
        decklists: z.array(z.record(z.unknown())).default([]),
      })
      .default({ tournaments: [], decklists: [] }),
  })
  .default({});

export const fixtureRowsSchema = z
  .object({
    sets: z.array(z.record(z.unknown())).default([]),
    cards: z.array(z.record(z.unknown())).default([]),
    attacks: z.array(z.record(z.unknown())).default([]),
    abilities: z.array(z.record(z.unknown())).default([]),
    weaknesses: z.array(z.record(z.unknown())).default([]),
    resistances: z.array(z.record(z.unknown())).default([]),
    tournaments: z.array(z.record(z.unknown())).default([]),
    decks: z.array(z.record(z.unknown())).default([]),
    deck_cards: z.array(z.record(z.unknown())).default([]),
    user_decks: z.array(z.record(z.unknown())).default([]),
    user_deck_versions: z.array(z.record(z.unknown())).default([]),
  })
  .default({});

export const fixtureSchema = z.object({
  fixture: z.string(),
  version: z.number().int().positive(),
  description: z.string(),
  source: fixtureSourceSchema,
  rows: fixtureRowsSchema,
});

export type Fixture = z.infer<typeof fixtureSchema>;

let currentInitializer: SchemaInitializer | undefined;
const templateCache = new Map<string, string>();

export function registerSchemaInitializer(init: SchemaInitializer): void {
  currentInitializer = init;
}

export function resetSchemaInitializer(): void {
  currentInitializer = undefined;
}

export function clearTemplateCache(): void {
  for (const templatePath of templateCache.values()) {
    try {
      if (fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
      }
    } catch {
      // ignore
    }
  }
  templateCache.clear();
}

export function getRegisteredSchemaInitializer(): SchemaInitializer | undefined {
  return currentInitializer;
}

function getTestTmpDir(): string {
  const envTmp = process.env.POKESEARCH_TEST_TMPDIR;
  const baseDir = envTmp ? path.resolve(envTmp) : os.tmpdir();
  const normalized = baseDir.toLowerCase();

  if (/[\\/]onedrive([\\/]|$)/i.test(baseDir) || normalized.includes("onedrive")) {
    throw new TestDbError(`[D-005] Test temp directory cannot reside inside OneDrive: ${baseDir}`);
  }

  const cwd = path.resolve(process.cwd()).toLowerCase();
  const rel = path.relative(cwd, normalized);
  if ((!rel.startsWith("..") && !path.isAbsolute(rel)) || normalized === cwd) {
    throw new TestDbError(`[BR-S01.T01-01] Test temp directory cannot reside inside repo: ${baseDir}`);
  }

  return baseDir;
}

function cleanDirWithRetry(dirPath: string): void {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3 });
      }
      return;
    } catch {
      // Small backoff before retrying
      const start = Date.now();
      while (Date.now() - start < 50) {
        // busy wait 50ms
      }
    }
  }
  if (fs.existsSync(dirPath)) {
    console.warn(`[withTempDb] Warning: Failed to remove temporary test directory: ${dirPath}`);
  }
}

async function cleanDirWithRetryAsync(dirPath: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (fs.existsSync(dirPath)) {
        await fs.promises.rm(dirPath, { recursive: true, force: true, maxRetries: 3 });
      }
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (fs.existsSync(dirPath)) {
    console.warn(`[withTempDb] Warning: Failed to remove temporary test directory: ${dirPath}`);
  }
}

function getOrCreateTemplate(initializer: SchemaInitializer): string {
  const baseDir = getTestTmpDir();
  const templatePath = path.join(baseDir, `pokesearch-template-${process.pid}-${initializer.key}.sqlite`);

  const existing = templateCache.get(initializer.key);
  if (existing && fs.existsSync(existing)) {
    return existing;
  }

  // Always recreate template if not in current process cache to ensure fresh apply
  if (fs.existsSync(templatePath)) {
    try {
      fs.unlinkSync(templatePath);
    } catch {
      // ignore
    }
  }

  const tempTemplateDir = fs.mkdtempSync(path.join(baseDir, "pokesearch-tmp-tmpl-"));
  const tempTemplateDbPath = path.join(tempTemplateDir, "template.sqlite");
  try {
    const db = openDatabase(tempTemplateDbPath);
    try {
      initializer.apply(db);
      db.pragma("wal_checkpoint(TRUNCATE)");
    } finally {
      db.close();
    }
    fs.copyFileSync(tempTemplateDbPath, templatePath);
  } finally {
    cleanDirWithRetry(tempTemplateDir);
  }

  templateCache.set(initializer.key, templatePath);
  return templatePath;
}

export function withTempDb<T>(fn: (info: TempDbInfo) => T, opts?: TempDbOptions): T {
  const baseDir = getTestTmpDir();
  const dir = fs.mkdtempSync(path.join(baseDir, `pokesearch-test-${process.pid}-`));
  const dbPath = path.join(dir, "db.sqlite");
  let db: Db | undefined;
  let schemaApplied = false;
  let succeeded = false;

  try {
    const openOpts = opts?.readonly !== undefined ? { readonly: opts.readonly } : undefined;

    if (currentInitializer) {
      try {
        const templatePath = getOrCreateTemplate(currentInitializer);
        fs.copyFileSync(templatePath, dbPath);
        schemaApplied = true;
      } catch (err) {
        // Fallback: apply directly
        db = openDatabase(dbPath, openOpts);
        currentInitializer.apply(db);
        schemaApplied = true;
      }
    }

    if (!db) {
      db = openDatabase(dbPath, openOpts);
    }

    if (opts?.fixtures) {
      for (const fixName of opts.fixtures) {
        loadFixture(db, fixName);
      }
    }

    const result = fn({ db, path: dbPath, dir, schemaApplied });
    succeeded = true;
    return result;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore close error during cleanup
      }
    }

    if (!succeeded && opts?.keepOnFailure) {
      console.warn(`[withTempDb] Retaining failed test database at: ${dir}`);
    } else {
      cleanDirWithRetry(dir);
    }
  }
}

export async function withTempDbAsync<T>(fn: (info: TempDbInfo) => Promise<T>, opts?: TempDbOptions): Promise<T> {
  const baseDir = getTestTmpDir();
  const dir = await fs.promises.mkdtemp(path.join(baseDir, `pokesearch-test-${process.pid}-`));
  const dbPath = path.join(dir, "db.sqlite");
  let db: Db | undefined;
  let schemaApplied = false;
  let succeeded = false;

  try {
    const openOpts = opts?.readonly !== undefined ? { readonly: opts.readonly } : undefined;

    if (currentInitializer) {
      try {
        const templatePath = getOrCreateTemplate(currentInitializer);
        await fs.promises.copyFile(templatePath, dbPath);
        schemaApplied = true;
      } catch {
        db = openDatabase(dbPath, openOpts);
        currentInitializer.apply(db);
        schemaApplied = true;
      }
    }

    if (!db) {
      db = openDatabase(dbPath, openOpts);
    }

    if (opts?.fixtures) {
      for (const fixName of opts.fixtures) {
        loadFixture(db, fixName);
      }
    }

    const result = await fn({ db, path: dbPath, dir, schemaApplied });
    succeeded = true;
    return result;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }

    if (!succeeded && opts?.keepOnFailure) {
      console.warn(`[withTempDb] Retaining failed test database at: ${dir}`);
    } else {
      await cleanDirWithRetryAsync(dir);
    }
  }
}

function resolveFixturesDir(): string {
  // Find packages/db/fixtures
  let curr = path.resolve(__dirname ? __dirname : process.cwd());
  while (curr !== path.dirname(curr)) {
    const candidate = path.join(curr, "packages", "db", "fixtures");
    if (fs.existsSync(candidate)) return candidate;
    const directCandidate = path.join(curr, "fixtures");
    if (fs.existsSync(directCandidate) && fs.existsSync(path.join(curr, "package.json"))) {
      return directCandidate;
    }
    curr = path.dirname(curr);
  }
  return path.resolve(process.cwd(), "fixtures");
}

export function listFixtures(): string[] {
  const dir = resolveFixturesDir();
  if (!fs.existsSync(dir)) {
    return [];
  }
  const files = fs.readdirSync(dir);
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5));
}

export function readFixture(name: string): Fixture {
  const dir = resolveFixturesDir();
  const filePath = path.join(dir, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new TestDbError(`Fixture file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const doc = JSON.parse(content);
  return validateFixture(doc);
}

export function validateFixture(doc: unknown): Fixture {
  const parsed = fixtureSchema.parse(doc);

  // Referential check: deck card IDs exist in cards or are unresolved / null
  const cardIds = new Set(parsed.rows.cards.map((c) => c.id as string));
  for (const dc of parsed.rows.deck_cards) {
    const cardId = dc.card_id as string | null | undefined;
    const isUnresolved = Boolean(dc.unresolved) || cardId === null;
    if (!isUnresolved && cardId) {
      if (!cardIds.has(cardId)) {
        throw new TestDbError(
          `Referential integrity violation: deck_card references missing card_id '${cardId}' in fixture '${parsed.fixture}'`
        );
      }
    }
  }

  return parsed;
}

const TABLE_ORDER = [
  "sets",
  "cards",
  "attacks",
  "abilities",
  "weaknesses",
  "resistances",
  "tournaments",
  "decks",
  "deck_cards",
  "user_decks",
  "user_deck_versions",
] as const;

export function loadFixture(db: Db, name: string): { tables: Record<string, number> } {
  const fixture = readFixture(name);
  const result: Record<string, number> = {};

  const existingTables = new Set(
    db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
      .map((t) => t.name)
  );

  db.transaction((tx) => {
    for (const table of TABLE_ORDER) {
      const rows = fixture.rows[table];
      if (!rows || rows.length === 0) {
        continue;
      }

      if (!existingTables.has(table)) {
        throw new FixtureTableMissing(table, fixture.fixture);
      }

      let count = 0;
      for (const row of rows) {
        const keys = Object.keys(row);
        if (keys.length === 0) continue;

        if (table === "deck_cards") {
          // Deck cards may not have unique primary keys, insert or delete-then-insert
          const placeholders = keys.map(() => "?").join(", ");
          const colNames = keys.join(", ");
          const values = keys.map((k) => (row as Record<string, unknown>)[k]);
          tx.run(`INSERT INTO ${table} (${colNames}) VALUES (${placeholders})`, values as any);
        } else {
          const colNames = keys.join(", ");
          const placeholders = keys.map(() => "?").join(", ");
          const updates = keys
            .filter((k) => k !== "id")
            .map((k) => `${k}=excluded.${k}`)
            .join(", ");

          const sql =
            updates.length > 0
              ? `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO UPDATE SET ${updates}`
              : `INSERT OR IGNORE INTO ${table} (${colNames}) VALUES (${placeholders})`;

          const values = keys.map((k) => (row as Record<string, unknown>)[k]);
          tx.run(sql, values as any);
        }
        count++;
      }
      result[table] = count;
    }
  });

  return { tables: result };
}
