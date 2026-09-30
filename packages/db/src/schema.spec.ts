import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { openDatabase, DbError, type Db, type SqlValue } from "./client.js";
import { migrate, defaultMigrationsDir } from "./migrate.js";
import {
  TABLES,
  type EtlRunRow,
  type SetRow,
  type CardRow,
  type AttackRow,
  type AbilityRow,
  type WeaknessRow,
  type ResistanceRow,
} from "./schema.js";
import { loadFixture, readFixture } from "./testing/index.js";

interface PragmaTableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

describe("Schema Drift & Constraints Specification (packages/db/src/schema.ts)", () => {
  let tempDir: string;
  let dbPath: string;
  let db: Db;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pokesearch-schema-test-"));
    dbPath = join(tempDir, "schema-test.db");
    db = openDatabase(dbPath);
    // Apply foundation migration
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

  describe("BR-S01.T04-09: Schema Drift against PRAGMA table_info", () => {
    it("matches TABLES descriptor exactly against SQLite PRAGMA table_info for schema_migrations", () => {
      const descriptor = TABLES.schema_migrations!;
      expect(descriptor).toBeDefined();

      const pragmaCols = db.all<PragmaTableInfo>("PRAGMA table_info(schema_migrations);");
      expect(pragmaCols.length).toBe(descriptor.columns.length);

      for (let i = 0; i < descriptor.columns.length; i++) {
        const expected = descriptor.columns[i]!;
        const actual = pragmaCols[i]!;

        expect(actual.name).toBe(expected.name);
        expect(actual.type.toUpperCase()).toBe(expected.type);
        expect(Boolean(actual.notnull)).toBe(expected.notnull);
        expect(Boolean(actual.pk)).toBe(expected.pk);
        expect(actual.dflt_value).toBe(expected.dflt_value);
      }
    });

    it("matches TABLES descriptor exactly against SQLite PRAGMA table_info for etl_runs", () => {
      const descriptor = TABLES.etl_runs!;
      expect(descriptor).toBeDefined();

      const pragmaCols = db.all<PragmaTableInfo>("PRAGMA table_info(etl_runs);");
      expect(pragmaCols.length).toBe(descriptor.columns.length);

      for (let i = 0; i < descriptor.columns.length; i++) {
        const expected = descriptor.columns[i]!;
        const actual = pragmaCols[i]!;

        expect(actual.name).toBe(expected.name);
        expect(actual.type.toUpperCase()).toBe(expected.type);
        expect(Boolean(actual.notnull)).toBe(expected.notnull);
        expect(Boolean(actual.pk)).toBe(expected.pk);
        expect(actual.dflt_value).toBe(expected.dflt_value);
      }
    });

    it("fails when an undocumented column is added to database schema", () => {
      db.exec("ALTER TABLE etl_runs ADD COLUMN rogue_col TEXT;");

      const descriptor = TABLES.etl_runs!;
      const pragmaCols = db.all<PragmaTableInfo>("PRAGMA table_info(etl_runs);");
      expect(pragmaCols.length).not.toBe(descriptor.columns.length);
    });
  });

  describe("BR-S01.T04-06: etl_runs Table Constraints & Invariants", () => {
    it("allows valid running etl_run insertion", () => {
      const now = new Date().toISOString();
      const res = db.run(
        `INSERT INTO etl_runs (id, kind, started_at, finished_at, status, stats_json, error)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [1, "full", now, null, "running", "{}", null]
      );
      expect(res.changes).toBe(1);

      const row = db.get<EtlRunRow>("SELECT * FROM etl_runs WHERE id = 1;");
      expect(row?.status).toBe("running");
      expect(row?.finished_at).toBeNull();
    });

    it("allows valid completed ok etl_run update", () => {
      const started = new Date(Date.now() - 1000).toISOString();
      const finished = new Date().toISOString();

      db.run(
        `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
         VALUES (?, ?, ?, ?, ?);`,
        [1, "delta", started, null, "running"]
      );

      db.run(
        `UPDATE etl_runs
         SET finished_at = ?, status = 'ok', stats_json = '{"processed": 100}'
         WHERE id = 1;`,
        [finished]
      );

      const row = db.get<EtlRunRow>("SELECT * FROM etl_runs WHERE id = 1;");
      expect(row?.status).toBe("ok");
      expect(row?.finished_at).toBe(finished);
    });

    it("rejects finished run with status 'running' (CHECK ((status = 'running') = (finished_at IS NULL)))", () => {
      const started = new Date().toISOString();
      const finished = started;

      expect(() => {
        db.run(
          `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
           VALUES (?, ?, ?, ?, ?);`,
          [1, "full", started, finished, "running"]
        );
      }).toThrow(DbError);
    });

    it("rejects completed status ('ok', 'error', 'cancelled') with finished_at IS NULL", () => {
      const started = new Date().toISOString();

      for (const invalidStatus of ["ok", "error", "cancelled"]) {
        expect(() => {
          db.run(
            `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
             VALUES (?, ?, ?, ?, ?);`,
            [Math.floor(Math.random() * 10000), "prices", started, null, invalidStatus]
          );
        }).toThrow(DbError);
      }
    });

    it("rejects finished_at earlier than started_at (CHECK (finished_at IS NULL OR finished_at >= started_at))", () => {
      const started = "2026-03-30T12:00:00Z";
      const finished = "2026-03-30T11:59:59Z";

      expect(() => {
        db.run(
          `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
           VALUES (?, ?, ?, ?, ?);`,
          [1, "fts", started, finished, "ok"]
        );
      }).toThrow(DbError);
    });

    it("rejects invalid status value not in enum", () => {
      const started = new Date().toISOString();

      expect(() => {
        db.run(
          `INSERT INTO etl_runs (id, kind, started_at, finished_at, status)
           VALUES (?, ?, ?, ?, ?);`,
          [1, "seed", started, null, "in_progress"]
        );
      }).toThrow(DbError);
    });
  });

  describe("Indexes on etl_runs", () => {
    it("has etl_runs_kind_started_idx and etl_runs_running_idx", () => {
      const indexes = db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name = 'etl_runs';"
      );
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("etl_runs_kind_started_idx");
      expect(indexNames).toContain("etl_runs_running_idx");
    });
  });
});

// S02.T05 — migration 0002_cards.sql. RED phase: every test below fails with `no such table: sets` until the
// migration exists (the shared beforeEach inserts a set), which is the declared RED reason in the handoff §2.5.
describe("S02.T05 — 0002_cards schema (packages/db/migrations/0002_cards.sql)", () => {
  const NOW = "2026-09-30T00:00:00Z";
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  let tempDir: string;
  let db: Db;

  function insert(table: string, row: Readonly<Record<string, SqlValue>>): void {
    const cols = Object.keys(row);
    db.run(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")});`,
      cols.map((c) => row[c] ?? null)
    );
  }

  function count(table: string): number {
    return db.get<{ c: number }>(`SELECT count(*) AS c FROM ${table};`)?.c ?? -1;
  }

  function dbErrorOf(fn: () => unknown): DbError {
    try {
      fn();
    } catch (err: unknown) {
      if (err instanceof DbError) return err;
      throw err;
    }
    throw new Error("expected a DbError, but the statement succeeded");
  }

  function insertCard(id = "sv1-86", extra: Readonly<Record<string, SqlValue>> = {}): void {
    insert("cards", {
      id,
      set_id: "sv1",
      number: "86",
      name: "Gardevoir ex",
      name_norm: "gardevoir ex",
      raw_ptcg_json: '{"id":"sv1-86"}',
      updated_at: NOW,
      ...extra,
    });
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pokesearch-0002-schema-"));
    db = openDatabase(join(tempDir, "schema-0002.db"));
    migrate(db, { dir: defaultMigrationsDir() });
    insert("sets", { id: "sv1", name: "Scarlet & Violet", name_norm: "scarlet & violet", updated_at: NOW });
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

  describe("RN-01: both raw documents are preserved", () => {
    it("raw_ptcg_json is NOT NULL", () => {
      const err = dbErrorOf(() =>
        insert("cards", { id: "sv1-1", set_id: "sv1", number: "1", name: "Sprigatito", name_norm: "sprigatito", updated_at: NOW })
      );
      expect(err.code).toBe("SQLITE_CONSTRAINT");
      expect(err.message).toMatch(/NOT NULL constraint failed: cards\.raw_ptcg_json/);
    });

    it("raw_tcgdex_json is nullable: a card with no TCGdex counterpart is accepted", () => {
      insertCard("sv1-86", { raw_tcgdex_json: null });
      const row = db.get<Pick<CardRow, "raw_ptcg_json" | "raw_tcgdex_json">>(
        "SELECT raw_ptcg_json, raw_tcgdex_json FROM cards WHERE id = ?;",
        ["sv1-86"]
      );
      expect(row).toEqual({ raw_ptcg_json: '{"id":"sv1-86"}', raw_tcgdex_json: null });
    });
  });

  describe("BR-S02.T05-01: children cascade with their card", () => {
    it("deleting a card removes its five child row sets", () => {
      insertCard();
      insert("attacks", { card_id: "sv1-86", idx: 0, name: "first" });
      insert("attacks", { card_id: "sv1-86", idx: 1, name: "second" });
      insert("abilities", { card_id: "sv1-86", idx: 0, name: "only" });
      insert("weaknesses", { card_id: "sv1-86", type: "Darkness", value: "×2" });
      insert("resistances", { card_id: "sv1-86", type: "Fighting", value: "-30" });
      insert("price_history", { card_id: "sv1-86", snapshot_date: "2026-09-28", source: "tcgplayer", variant: "holofoil" });
      insert("price_history", { card_id: "sv1-86", snapshot_date: "2026-09-29", source: "tcgplayer", variant: "holofoil" });
      insert("price_history", { card_id: "sv1-86", snapshot_date: "2026-09-29", source: "cardmarket", variant: "normal" });
      insert("cards_market_usd", { card_id: "sv1-86", market_usd: 3.5, snapshot_date: "2026-09-29" });

      const children = ["attacks", "abilities", "weaknesses", "resistances", "price_history", "cards_market_usd"];
      expect(children.map(count)).toEqual([2, 1, 1, 1, 3, 1]);

      db.run("DELETE FROM cards WHERE id = ?;", ["sv1-86"]);

      expect(children.map(count)).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });

  describe("BR-S02.T05-02: a card cannot exist without its set", () => {
    it("inserting a card with an unknown set_id raises SQLITE_CONSTRAINT_FOREIGNKEY", () => {
      const err = dbErrorOf(() => insertCard("xx-1", { set_id: "no-such-set" }));
      expect(err.code).toBe("SQLITE_CONSTRAINT");
      expect(err.message).toMatch(/FOREIGN KEY constraint failed/);
    });

    it("deleting a set that still has cards is refused", () => {
      insertCard();
      const err = dbErrorOf(() => db.run("DELETE FROM sets WHERE id = ?;", ["sv1"]));
      expect(err.code).toBe("SQLITE_CONSTRAINT");
      expect(err.message).toMatch(/FOREIGN KEY constraint failed/);
      expect(count("sets")).toBe(1);
    });
  });

  describe("BR-S02.T05-03: one attack / ability per index", () => {
    it("duplicate (card_id, idx) is rejected", () => {
      insertCard();
      insertCard("sv1-25", { number: "25", name: "Pikachu", name_norm: "pikachu" });
      for (const table of ["attacks", "abilities"]) {
        insert(table, { card_id: "sv1-86", idx: 0, name: "first" });
        const err = dbErrorOf(() => insert(table, { card_id: "sv1-86", idx: 0, name: "second" }));
        expect(err.code).toBe("SQLITE_CONSTRAINT");
        expect(err.message).toMatch(new RegExp(`UNIQUE constraint failed: ${table}\\.card_id, ${table}\\.idx`));
        insert(table, { card_id: "sv1-25", idx: 0, name: "same idx, other card" });
        expect(count(table)).toBe(2);
      }
    });
  });

  describe("BR-S02.T05-04: one weakness / resistance per energy type", () => {
    it("duplicate (card_id, type) is rejected", () => {
      insertCard();
      for (const table of ["weaknesses", "resistances"]) {
        insert(table, { card_id: "sv1-86", type: "Darkness", value: "×2" });
        const err = dbErrorOf(() => insert(table, { card_id: "sv1-86", type: "Darkness", value: "+30" }));
        expect(err.code).toBe("SQLITE_CONSTRAINT");
        expect(err.message).toMatch(new RegExp(`UNIQUE constraint failed: ${table}\\.card_id, ${table}\\.type`));
        insert(table, { card_id: "sv1-86", type: "Fighting", value: "-30" });
        expect(count(table)).toBe(2);
      }
    });
  });

  describe("BR-S02.T05-05: one price observation per key", () => {
    it("second insert of the same key updates, count stays 1", () => {
      insertCard();
      const upsert = `INSERT INTO price_history (card_id, snapshot_date, source, variant, currency, market)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (card_id, snapshot_date, source, variant) DO UPDATE SET market = excluded.market;`;
      db.run(upsert, ["sv1-86", "2026-09-30", "tcgplayer", "holofoil", "USD", 1.25]);
      db.run(upsert, ["sv1-86", "2026-09-30", "tcgplayer", "holofoil", "USD", 2.5]);
      expect(count("price_history")).toBe(1);
      expect(db.get<{ market: number }>("SELECT market FROM price_history;")?.market).toBe(2.5);

      const err = dbErrorOf(() =>
        insert("price_history", { card_id: "sv1-86", snapshot_date: "2026-09-30", source: "tcgplayer", variant: "holofoil" })
      );
      expect(err.message).toMatch(
        /UNIQUE constraint failed: price_history\.card_id, price_history\.snapshot_date, price_history\.source, price_history\.variant/
      );
    });

    it("price_history rejects an unknown source and a malformed snapshot_date", () => {
      insertCard();
      const badSource = dbErrorOf(() =>
        insert("price_history", { card_id: "sv1-86", snapshot_date: "2026-09-30", source: "ebay", variant: "normal" })
      );
      expect(badSource.message).toMatch(/CHECK constraint failed/);
      const badDate = dbErrorOf(() =>
        insert("price_history", { card_id: "sv1-86", snapshot_date: "2026-9-30", source: "tcgplayer", variant: "normal" })
      );
      expect(badDate.message).toMatch(/CHECK constraint failed/);
      expect(count("price_history")).toBe(0);
    });
  });

  describe("BR-S02.T05-06: cards_market_usd is a maintained table with one row per card", () => {
    it("cards_market_usd rejects a second row for the same card", () => {
      insertCard();
      insert("cards_market_usd", { card_id: "sv1-86", market_usd: 3.5, snapshot_date: "2026-09-29" });
      const err = dbErrorOf(() =>
        insert("cards_market_usd", { card_id: "sv1-86", market_usd: 4, snapshot_date: "2026-09-30" })
      );
      expect(err.code).toBe("SQLITE_CONSTRAINT");
      expect(err.message).toMatch(/UNIQUE constraint failed: cards_market_usd\.card_id/);
    });

    it("cards_market_usd is a table, not a view, and apps/api never writes it", () => {
      expect(db.get<{ type: string }>("SELECT type FROM sqlite_master WHERE name = 'cards_market_usd';")?.type).toBe(
        "table"
      );
      const apiSrc = join(repoRoot, "apps/api/src");
      const writers: string[] = [];
      for (const rel of readdirSync(apiSrc, { recursive: true, encoding: "utf8" })) {
        if (!/\.(ts|tsx|js|mjs)$/.test(rel)) continue;
        const text = readFileSync(join(apiSrc, rel), "utf8");
        if (/\b(INSERT\s+(OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+cards_market_usd\b/i.test(text)) {
          writers.push(rel);
        }
      }
      expect(writers).toEqual([]);
    });

    it("a card with no prices stays visible through a LEFT JOIN with a NULL market_usd", () => {
      insertCard();
      const rows = db.all<{ id: string; market_usd: number | null }>(
        "SELECT c.id, m.market_usd FROM cards c LEFT JOIN cards_market_usd m ON m.card_id = c.id;"
      );
      expect(rows).toEqual([{ id: "sv1-86", market_usd: null }]);
    });
  });

  describe("BR-S02.T05-07: the FTS5 index and its bm25 column-order contract", () => {
    it("cards_fts accepts an insert and a MATCH", () => {
      insert("cards_fts", {
        card_id: "sv1-86",
        name: "Gardevoir ex",
        attack_names: "Miracle Force",
        attack_text: "This Pokémon recovers from all Special Conditions.",
        ability_names: "Psychic Embrace",
        ability_text: "Attach a Basic Psychic Energy card from your discard pile.",
        rules: "",
        flavor: "",
      });
      // remove_diacritics 2: the query "pokemon" must match the stored "Pokémon".
      const hits = db.all<{ card_id: string; score: number }>(
        "SELECT card_id, bm25(cards_fts, 0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5) AS score FROM cards_fts WHERE cards_fts MATCH ?;",
        ["pokemon"]
      );
      expect(hits).toHaveLength(1);
      expect(hits[0]?.card_id).toBe("sv1-86");
      expect(typeof hits[0]?.score).toBe("number");
    });

    it("cards_fts columns follow the bm25 column-order contract", () => {
      const columns = db.all<{ name: string }>("PRAGMA table_info(cards_fts);").map((c) => c.name);
      expect(columns).toEqual([
        "card_id",
        "name",
        "attack_names",
        "attack_text",
        "ability_names",
        "ability_text",
        "rules",
        "flavor",
      ]);
      const sql = db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'cards_fts';")?.sql ?? "";
      expect(sql).toMatch(/USING fts5/i);
      expect(sql).toContain("unicode61 remove_diacritics 2");
    });
  });

  describe("BR-S02.T05-09: normalized columns document the norm() contract", () => {
    it("every *_norm column definition in 0002_cards.sql carries a BR-S02.T05-09 comment", () => {
      const sql = readFileSync(join(defaultMigrationsDir(), "0002_cards.sql"), "utf8");
      const normLines = sql.split("\n").filter((l) => /^\s*(name_norm|text_norm)\s+TEXT\b/.test(l));
      expect(normLines).toHaveLength(6);
      for (const line of normLines) {
        expect(line).toContain("BR-S02.T05-09");
      }
    });
  });

  describe("Acceptance: named indexes", () => {
    it("lists every named index of the 0002 tables", () => {
      const names = db
        .all<{ name: string }>(
          `SELECT name FROM sqlite_master
           WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'
             AND tbl_name IN ('sets', 'cards', 'attacks', 'abilities', 'weaknesses', 'resistances',
                              'price_history', 'cards_market_usd');`
        )
        .map((r) => r.name)
        .sort();
      expect(names).toEqual(
        [
          "sets_release_date_idx",
          "sets_name_norm_idx",
          "sets_ptcgo_code_idx",
          "cards_set_id_idx",
          "cards_hp_idx",
          "cards_supertype_idx",
          "cards_regulation_mark_idx",
          "cards_release_date_idx",
          "cards_name_norm_idx",
          "cards_name_release_idx",
          "cards_tcgdex_id_idx",
          "attacks_card_idx_uq",
          "attacks_card_id_idx",
          "attacks_damage_num_idx",
          "abilities_card_idx_uq",
          "abilities_card_id_idx",
          "weaknesses_card_id_idx",
          "resistances_card_id_idx",
          "price_history_card_date_idx",
          "price_history_date_idx",
          "cards_market_usd_price_idx",
        ].sort()
      );
    });
  });

  describe("Edge cases", () => {
    it("a card numbered TG01 is stored verbatim", () => {
      insertCard("swsh9-TG01", { number: "TG01" });
      expect(db.get<{ number: string }>("SELECT number FROM cards WHERE id = ?;", ["swsh9-TG01"])?.number).toBe("TG01");
    });

    it("damage_mod accepts '×' and rejects 'x' and '*'", () => {
      insertCard();
      insert("attacks", { card_id: "sv1-86", idx: 0, damage_text: "30×", damage_num: 30, damage_mod: "×" });
      for (const [idx, mod] of [
        [1, "x"],
        [2, "*"],
      ] as const) {
        const err = dbErrorOf(() => insert("attacks", { card_id: "sv1-86", idx, damage_text: `30${mod}`, damage_num: 30, damage_mod: mod }));
        expect(err.message).toMatch(/CHECK constraint failed/);
      }
      expect(count("attacks")).toBe(1);
    });

    it("an attack with non-numeric damage keeps the text and NULL number and modifier", () => {
      insertCard();
      insert("attacks", { card_id: "sv1-86", idx: 0, damage_text: "varies", damage_num: null, damage_mod: null });
      expect(
        db.get<Pick<AttackRow, "damage_text" | "damage_num" | "damage_mod">>(
          "SELECT damage_text, damage_num, damage_mod FROM attacks;"
        )
      ).toEqual({ damage_text: "varies", damage_num: null, damage_mod: null });
    });

    it("tcgdex_legal_* accept 0, 1 and NULL, and reject '' and 2", () => {
      insertCard("sv1-1", { tcgdex_legal_standard: null, tcgdex_legal_expanded: null });
      insertCard("sv1-2", { tcgdex_legal_standard: 0, tcgdex_legal_expanded: 1 });
      for (const bad of ["", 2] as const) {
        const err = dbErrorOf(() => insertCard("sv1-3", { tcgdex_legal_standard: bad }));
        expect(err.message).toMatch(/CHECK constraint failed/);
      }
      expect(count("cards")).toBe(2);
    });
  });

  describe("Acceptance: typed fixture round-trip", () => {
    it("a fixture card inserted through @pokesearch/db/schema reads back with identical values for every column", () => {
      loadFixture(db, "cards-schema-0002");
      const fx = readFixture("cards-schema-0002");

      const set = db.get<SetRow>("SELECT * FROM sets WHERE id = ?;", ["sv1"]);
      expect(set).toEqual(fx.rows.sets[0]);

      const card = db.get<CardRow>("SELECT * FROM cards WHERE id = ?;", ["sv1-86"]);
      expect(card).toEqual(fx.rows.cards[0]);
      expect(Object.keys(card ?? {}).sort()).toEqual(Object.keys(fx.rows.cards[0] ?? {}).sort());

      expect(db.all<AttackRow>("SELECT * FROM attacks WHERE card_id = ? ORDER BY idx;", ["sv1-86"])).toEqual(fx.rows.attacks);
      expect(db.all<AbilityRow>("SELECT * FROM abilities WHERE card_id = ? ORDER BY idx;", ["sv1-86"])).toEqual(
        fx.rows.abilities
      );
      expect(db.all<WeaknessRow>("SELECT * FROM weaknesses WHERE card_id = ? ORDER BY type;", ["sv1-86"])).toEqual(
        fx.rows.weaknesses
      );
      expect(db.all<ResistanceRow>("SELECT * FROM resistances WHERE card_id = ? ORDER BY type;", ["sv1-86"])).toEqual(
        fx.rows.resistances
      );
    });
  });
});
