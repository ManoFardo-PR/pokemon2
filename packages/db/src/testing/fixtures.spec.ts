import { describe, it, expect } from "vitest";
import {
  validateFixture,
  readFixture,
  listFixtures,
  loadFixture,
  withTempDb,
  registerSchemaInitializer,
  resetSchemaInitializer,
  FixtureTableMissing,
} from "./index.js";

describe("Fixture Schema, Validation & Integrity", () => {
  describe("BR-S01.T03-04: Fixture Schema and Referential Integrity", () => {
    it("lists delivered fixtures containing empty, cards-basic, and decks-basic", () => {
      const fixtures = listFixtures();
      expect(fixtures).toContain("empty");
      expect(fixtures).toContain("cards-basic");
      expect(fixtures).toContain("decks-basic");
    });

    it("validates empty.json fixture successfully", () => {
      const empty = readFixture("empty");
      const validated = validateFixture(empty);
      expect(validated.fixture).toBe("empty");
      expect(validated.rows.cards.length).toBe(0);
      expect(validated.rows.decks.length).toBe(0);
    });

    it("validates cards-basic.json fixture with 5 card printings", () => {
      const cardsBasic = readFixture("cards-basic");
      const validated = validateFixture(cardsBasic);
      expect(validated.fixture).toBe("cards-basic");
      expect(validated.rows.sets.length).toBeGreaterThanOrEqual(1);
      expect(validated.rows.cards.length).toBe(5);
    });

    it("validates decks-basic.json fixture and tolerates marked unresolved cards", () => {
      const decksBasic = readFixture("decks-basic");
      const validated = validateFixture(decksBasic);
      expect(validated.fixture).toBe("decks-basic");
      expect(validated.rows.decks.length).toBe(2);
      expect(validated.rows.deck_cards.length).toBeGreaterThan(0);
    });

    it("rejects a fixture document with dangling card_id references in deck_cards", () => {
      const brokenDoc = {
        fixture: "broken-deck",
        version: 1,
        description: "Broken deck with dangling card_id",
        source: {},
        rows: {
          sets: [{ id: "set1", name: "Set 1" }],
          cards: [{ id: "card-1", set_id: "set1" }],
          attacks: [],
          abilities: [],
          weaknesses: [],
          resistances: [],
          tournaments: [],
          decks: [{ id: "deck-1", name: "Deck 1" }],
          deck_cards: [
            { deck_id: "deck-1", card_id: "card-1", count: 4 },
            { deck_id: "deck-1", card_id: "card-missing-999", count: 2 }, // dangling!
          ],
          user_decks: [],
          user_deck_versions: [],
        },
      };

      expect(() => validateFixture(brokenDoc)).toThrow(/Referential integrity violation|dangling/i);
    });

    it("allows card_id: null or unresolved: true in deck_cards", () => {
      const unresolvedDoc = {
        fixture: "unresolved-deck",
        version: 1,
        description: "Deck with deliberate unresolved gap",
        source: {},
        rows: {
          sets: [{ id: "set1", name: "Set 1" }],
          cards: [{ id: "card-1", set_id: "set1" }],
          attacks: [],
          abilities: [],
          weaknesses: [],
          resistances: [],
          tournaments: [],
          decks: [{ id: "deck-1", name: "Deck 1" }],
          deck_cards: [
            { deck_id: "deck-1", card_id: "card-1", count: 4 },
            { deck_id: "deck-1", card_id: null, count: 1, raw_name: "Unreleased Promo", unresolved: true },
          ],
          user_decks: [],
          user_deck_versions: [],
        },
      };

      expect(() => validateFixture(unresolvedDoc)).not.toThrow();
    });
  });

  describe("BR-S01.T03-06: No Secrets or Binary Blobs in Fixtures", () => {
    it("ensures fixtures contain no API keys, auth tokens or base64 binary blobs", () => {
      const fixtures = listFixtures();
      const secretPatterns = [
        /tcgplayer[_-]?key/i,
        /limitless[_-]?key/i,
        /anthropic[_-]?key/i,
        /bearer\s+[a-zA-Z0-9_\-\.]+/i,
        /sk-[a-zA-Z0-9_\-]{20,}/,
        /data:image\/[a-z]+;base64,/i,
      ];

      for (const name of fixtures) {
        const fixtureDoc = readFixture(name);
        const jsonString = JSON.stringify(fixtureDoc);

        for (const pattern of secretPatterns) {
          expect(jsonString).not.toMatch(pattern);
        }
      }
    });
  });

  describe("BR-S01.T03-03: Idempotent Fixture Loading & Missing Table Handling", () => {
    it("throws FixtureTableMissing when loading fixture against a database missing required tables", () => {
      resetSchemaInitializer();
      withTempDb((info) => {
        expect(() => loadFixture(info.db, "cards-basic")).toThrow(FixtureTableMissing);
        expect(() => loadFixture(info.db, "cards-basic")).toThrow(/FixtureTableMissing: sets \(fixture cards-basic\)/);
      });
    });

    it("loads fixture idempotently into a database with matching schema", () => {
      registerSchemaInitializer({
        key: "cards-and-decks-schema",
        apply: (db) => {
          db.exec(`
            CREATE TABLE sets (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              release_date TEXT
            );
            CREATE TABLE cards (
              id TEXT PRIMARY KEY,
              set_id TEXT NOT NULL REFERENCES sets(id),
              name TEXT NOT NULL,
              supertype TEXT,
              subtypes TEXT,
              hp INT,
              types TEXT,
              rarity TEXT
            );
            CREATE TABLE attacks (
              id TEXT PRIMARY KEY,
              card_id TEXT NOT NULL REFERENCES cards(id),
              name TEXT NOT NULL,
              cost TEXT,
              damage TEXT,
              text TEXT
            );
            CREATE TABLE abilities (
              id TEXT PRIMARY KEY,
              card_id TEXT NOT NULL REFERENCES cards(id),
              name TEXT NOT NULL,
              type TEXT,
              text TEXT
            );
            CREATE TABLE weaknesses (
              card_id TEXT NOT NULL REFERENCES cards(id),
              type TEXT NOT NULL,
              value TEXT NOT NULL,
              PRIMARY KEY (card_id, type)
            );
            CREATE TABLE resistances (
              card_id TEXT NOT NULL REFERENCES cards(id),
              type TEXT NOT NULL,
              value TEXT NOT NULL,
              PRIMARY KEY (card_id, type)
            );
            CREATE TABLE tournaments (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              date TEXT
            );
            CREATE TABLE decks (
              id TEXT PRIMARY KEY,
              tournament_id TEXT REFERENCES tournaments(id),
              name TEXT NOT NULL,
              player TEXT
            );
            CREATE TABLE deck_cards (
              deck_id TEXT NOT NULL REFERENCES decks(id),
              card_id TEXT,
              count INT NOT NULL,
              raw_name TEXT,
              unresolved INT DEFAULT 0
            );
            CREATE TABLE user_decks (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL
            );
            CREATE TABLE user_deck_versions (
              id TEXT PRIMARY KEY,
              deck_id TEXT NOT NULL REFERENCES user_decks(id),
              version INT NOT NULL
            );
          `);
        },
      });

      withTempDb((info) => {
        const firstResult = loadFixture(info.db, "cards-basic");
        expect(firstResult.tables.sets).toBeGreaterThanOrEqual(1);
        expect(firstResult.tables.cards).toBe(5);

        const firstCount = info.db.get<{ c: number }>("SELECT count(*) as c FROM cards")?.c;

        // Second load - must be idempotent
        const secondResult = loadFixture(info.db, "cards-basic");
        const secondCount = info.db.get<{ c: number }>("SELECT count(*) as c FROM cards")?.c;

        expect(firstResult.tables).toEqual(secondResult.tables);
        expect(firstCount).toBe(secondCount);
      });
    });
  });
});
