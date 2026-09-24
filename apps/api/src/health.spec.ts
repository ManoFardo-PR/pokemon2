import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "@pokesearch/db/testing";
import { buildApp } from "./app.js";

describe("Health & Version Endpoints (BR-S01.T07-06, BR-S01.T07-07)", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  describe("GET /health", () => {
    it("returns 200 with SQLite version, db path, schema version, and zero counts on clean foundation schema", async () => {
      const app = await buildApp({ db: testDb.db });
      const start = performance.now();
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });
      const elapsed = performance.now() - start;

      expect(response.statusCode).toBe(200);
      expect(elapsed).toBeLessThan(100); // BR-S01.T07-06: under 100 ms

      const body = response.json();
      expect(body).toMatchObject({
        ok: true,
        sqliteVersion: expect.any(String),
        databasePath: expect.any(String),
        schemaVersion: expect.any(Number),
        counts: {
          sets: 0,
          cards: 0,
          decks: 0,
        },
      });
      expect(body.sqliteVersion.length).toBeGreaterThan(0);
      expect(body.databasePath.length).toBeGreaterThan(0);
    });

    it("returns defensive 0 counts when domain tables are absent (BR-S01.T07-07)", async () => {
      const app = await buildApp({ db: testDb.db });
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.counts).toEqual({
        sets: 0,
        cards: 0,
        decks: 0,
      });
    });

    it("returns 503 database_unavailable envelope when database is closed (BR-S01.T07-06)", async () => {
      const app = await buildApp({ db: testDb.db });
      testDb.db.close();

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body).toHaveProperty("error");
      expect(body.error.code).toBe("database_unavailable");
    });
  });

  describe("GET /api/version", () => {
    it("returns contractVersion, schemaVersion, name, and node info", async () => {
      const app = await buildApp({ db: testDb.db });
      const response = await app.inject({
        method: "GET",
        url: "/api/version",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        name: "pokesearch-api",
        version: expect.any(String),
        contractVersion: expect.any(String),
        schemaVersion: expect.any(Number),
        node: process.version,
        commit: null,
        engineBuild: null,
      });
    });
  });
});
