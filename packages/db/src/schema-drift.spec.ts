import { describe, it, expect, expectTypeOf, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, type Db } from "./client.js";
import { migrate, defaultMigrationsDir } from "./migrate.js";
import {
  TABLES,
  type SetRow,
  type CardRow,
  type AttackRow,
  type AbilityRow,
  type WeaknessRow,
  type ResistanceRow,
  type PriceHistoryRow,
  type CardsLatestPriceRow,
  type CardsMarketUsdRow,
} from "./schema.js";

// S02.T05 / BR-S02.T05-10 — the row types of @pokesearch/db/schema match the migrated database column for column,
// including nullability (D-009). Three layers are compared:
//   1. the column lists below, in DDL order, against the TypeScript row types (compile time, expectTypeOf);
//   2. the same lists against PRAGMA table_info of the migrated database (run time);
//   3. the TABLES descriptor against PRAGMA table_info (run time), as the S01.T04 drift test does for 0001.
// Nullability rule: a column is nullable in TypeScript exactly when PRAGMA reports notnull = 0 and pk = 0.

interface PragmaTableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

type NullableKeys<T> = { [K in keyof T]-?: null extends T[K] ? K : never }[keyof T];

const SET_COLUMNS = [
  "id", "tcgdex_id", "name", "name_norm", "series", "printed_total", "total", "release_date", "ptcgo_code",
  "legal_unlimited", "legal_standard", "legal_expanded", "symbol_url", "logo_url", "updated_at",
] as const;
const SET_NULLABLE = [
  "tcgdex_id", "series", "printed_total", "total", "release_date", "ptcgo_code", "legal_unlimited", "legal_standard",
  "legal_expanded", "symbol_url", "logo_url",
] as const;

const CARD_COLUMNS = [
  "id", "set_id", "tcgdex_id", "number", "local_id", "name", "name_norm", "supertype", "subtypes_json", "hp",
  "types_json", "evolves_from", "evolves_to_json", "stage", "rules_json", "flavor_text", "regulation_mark", "rarity",
  "artist", "national_dex_json", "retreat_cost", "retreat_json", "legal_unlimited", "legal_standard", "legal_expanded",
  "tcgdex_legal_standard", "tcgdex_legal_expanded", "variants_json", "img_small", "img_large", "img_webp_high",
  "img_webp_low", "raw_ptcg_json", "raw_tcgdex_json", "release_date", "tcgdex_updated", "updated_at",
] as const;
const CARD_NULLABLE = [
  "tcgdex_id", "local_id", "supertype", "subtypes_json", "hp", "types_json", "evolves_from", "evolves_to_json", "stage",
  "rules_json", "flavor_text", "regulation_mark", "rarity", "artist", "national_dex_json", "retreat_cost", "retreat_json",
  "legal_unlimited", "legal_standard", "legal_expanded", "tcgdex_legal_standard", "tcgdex_legal_expanded",
  "variants_json", "img_small", "img_large", "img_webp_high", "img_webp_low", "raw_tcgdex_json", "release_date",
  "tcgdex_updated",
] as const;

const ATTACK_COLUMNS = [
  "id", "card_id", "idx", "name", "name_norm", "cost_json", "converted_cost", "damage_text", "damage_num", "damage_mod",
  "text", "text_norm",
] as const;
const ATTACK_NULLABLE = [
  "name", "name_norm", "cost_json", "converted_cost", "damage_text", "damage_num", "damage_mod", "text", "text_norm",
] as const;

const ABILITY_COLUMNS = ["id", "card_id", "idx", "name", "name_norm", "type", "text", "text_norm"] as const;
const ABILITY_NULLABLE = ["name", "name_norm", "type", "text", "text_norm"] as const;

const WEAKNESS_COLUMNS = ["card_id", "type", "value"] as const;
const WEAKNESS_NULLABLE = ["value"] as const;

const RESISTANCE_COLUMNS = ["card_id", "type", "value"] as const;
const RESISTANCE_NULLABLE = ["value"] as const;

const PRICE_COLUMNS = [
  "card_id", "snapshot_date", "source", "variant", "currency", "low", "mid", "high", "market", "direct_low", "trend",
  "avg1", "avg7", "avg30",
] as const;
const PRICE_NULLABLE = [
  "currency", "low", "mid", "high", "market", "direct_low", "trend", "avg1", "avg7", "avg30",
] as const;

const MARKET_COLUMNS = ["card_id", "market_usd", "snapshot_date"] as const;
const MARKET_NULLABLE = [] as const;

describe("BR-S02.T05-10: 0002 row types vs the migrated database", () => {
  let tempDir: string;
  let db: Db;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pokesearch-0002-drift-"));
    db = openDatabase(join(tempDir, "drift-0002.db"));
    migrate(db, { dir: defaultMigrationsDir() });
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function checkTable(table: string, columns: readonly string[], nullable: readonly string[]): void {
    const descriptor = TABLES[table];
    expect(descriptor, `TABLES.${table} is missing`).toBeDefined();

    const pragma = db.all<PragmaTableInfo>(`PRAGMA table_info(${table});`);
    expect(pragma.map((c) => c.name), `${table}: column names and order`).toEqual([...columns]);
    expect(
      pragma.filter((c) => c.notnull === 0 && c.pk === 0).map((c) => c.name),
      `${table}: nullable columns`
    ).toEqual([...nullable]);

    expect(
      descriptor?.columns.map((c) => ({ name: c.name, type: c.type, notnull: c.notnull, pk: c.pk, dflt_value: c.dflt_value })),
      `${table}: TABLES descriptor`
    ).toEqual(
      pragma.map((c) => ({
        name: c.name,
        type: c.type.toUpperCase(),
        notnull: Boolean(c.notnull),
        pk: Boolean(c.pk),
        dflt_value: c.dflt_value,
      }))
    );
  }

  it("0002 tables match their TypeScript row types", () => {
    expectTypeOf<keyof SetRow>().toEqualTypeOf<(typeof SET_COLUMNS)[number]>();
    expectTypeOf<NullableKeys<SetRow>>().toEqualTypeOf<(typeof SET_NULLABLE)[number]>();
    checkTable("sets", SET_COLUMNS, SET_NULLABLE);

    expectTypeOf<keyof CardRow>().toEqualTypeOf<(typeof CARD_COLUMNS)[number]>();
    expectTypeOf<NullableKeys<CardRow>>().toEqualTypeOf<(typeof CARD_NULLABLE)[number]>();
    checkTable("cards", CARD_COLUMNS, CARD_NULLABLE);

    expectTypeOf<keyof AttackRow>().toEqualTypeOf<(typeof ATTACK_COLUMNS)[number]>();
    expectTypeOf<NullableKeys<AttackRow>>().toEqualTypeOf<(typeof ATTACK_NULLABLE)[number]>();
    checkTable("attacks", ATTACK_COLUMNS, ATTACK_NULLABLE);

    expectTypeOf<keyof AbilityRow>().toEqualTypeOf<(typeof ABILITY_COLUMNS)[number]>();
    expectTypeOf<NullableKeys<AbilityRow>>().toEqualTypeOf<(typeof ABILITY_NULLABLE)[number]>();
    checkTable("abilities", ABILITY_COLUMNS, ABILITY_NULLABLE);

    expectTypeOf<keyof WeaknessRow>().toEqualTypeOf<(typeof WEAKNESS_COLUMNS)[number]>();
    expectTypeOf<NullableKeys<WeaknessRow>>().toEqualTypeOf<(typeof WEAKNESS_NULLABLE)[number]>();
    checkTable("weaknesses", WEAKNESS_COLUMNS, WEAKNESS_NULLABLE);

    expectTypeOf<keyof ResistanceRow>().toEqualTypeOf<(typeof RESISTANCE_COLUMNS)[number]>();
    expectTypeOf<NullableKeys<ResistanceRow>>().toEqualTypeOf<(typeof RESISTANCE_NULLABLE)[number]>();
    checkTable("resistances", RESISTANCE_COLUMNS, RESISTANCE_NULLABLE);

    expectTypeOf<keyof PriceHistoryRow>().toEqualTypeOf<(typeof PRICE_COLUMNS)[number]>();
    expectTypeOf<NullableKeys<PriceHistoryRow>>().toEqualTypeOf<(typeof PRICE_NULLABLE)[number]>();
    checkTable("price_history", PRICE_COLUMNS, PRICE_NULLABLE);

    expectTypeOf<keyof CardsMarketUsdRow>().toEqualTypeOf<(typeof MARKET_COLUMNS)[number]>();
    expectTypeOf<NullableKeys<CardsMarketUsdRow>>().toEqualTypeOf<never>();
    checkTable("cards_market_usd", MARKET_COLUMNS, MARKET_NULLABLE);
  });

  it("the cards_latest_price view exposes exactly the CardsLatestPriceRow columns", () => {
    // A view reports notnull = 0 for every column, so only names, order, types and the descriptor are compared here;
    // CardsLatestPriceRow keeps the nullability of the underlying price_history columns.
    expectTypeOf<keyof CardsLatestPriceRow>().toEqualTypeOf<(typeof PRICE_COLUMNS)[number]>();
    const descriptor = TABLES.cards_latest_price;
    expect(descriptor, "TABLES.cards_latest_price is missing").toBeDefined();
    const pragma = db.all<PragmaTableInfo>("PRAGMA table_info(cards_latest_price);");
    expect(pragma.map((c) => c.name)).toEqual([...PRICE_COLUMNS]);
    expect(descriptor?.columns.map((c) => ({ name: c.name, type: c.type }))).toEqual(
      pragma.map((c) => ({ name: c.name, type: c.type.toUpperCase() }))
    );
  });

  it("fails when a column is added to the SQL without the type", () => {
    const descriptor = TABLES.cards;
    expect(descriptor, "TABLES.cards is missing").toBeDefined();
    db.exec("ALTER TABLE cards ADD COLUMN rogue_col TEXT;");
    const names = db.all<PragmaTableInfo>("PRAGMA table_info(cards);").map((c) => c.name);
    expect(names).toContain("rogue_col");
    expect(names).not.toEqual(descriptor?.columns.map((c) => c.name));
  });
});
