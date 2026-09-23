import type { Db } from "../client.js";
import { z } from "zod";

export class TestDbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestDbError";
  }
}

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

export function registerSchemaInitializer(_init: SchemaInitializer): void {
  throw new Error("Not implemented");
}

export function resetSchemaInitializer(): void {
  throw new Error("Not implemented");
}

export function getRegisteredSchemaInitializer(): SchemaInitializer | undefined {
  throw new Error("Not implemented");
}

export function withTempDb<T>(_fn: (info: TempDbInfo) => T, _opts?: TempDbOptions): T {
  throw new Error("Not implemented");
}

export function withTempDbAsync<T>(_fn: (info: TempDbInfo) => Promise<T>, _opts?: TempDbOptions): Promise<T> {
  throw new Error("Not implemented");
}

export function loadFixture(_db: Db, _name: string): { tables: Record<string, number> } {
  throw new Error("Not implemented");
}

export function readFixture(_name: string): Fixture {
  throw new Error("Not implemented");
}

export function validateFixture(_doc: unknown): Fixture {
  throw new Error("Not implemented");
}

export function listFixtures(): string[] {
  throw new Error("Not implemented");
}
