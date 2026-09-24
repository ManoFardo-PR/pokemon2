import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "@pokesearch/db/testing";
import { buildApp } from "./app.js";

describe("CORS Security Configuration (BR-S01.T07-08)", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it("allows configured Vite dev origin", async () => {
    const app = await buildApp({
      db: testDb.db,
      config: {
        CORS_ORIGINS: ["http://127.0.0.1:5173"],
      },
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "GET",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
  });

  it("rejects unknown origin and never emits wildcard origin", async () => {
    const app = await buildApp({
      db: testDb.db,
      config: {
        CORS_ORIGINS: ["http://127.0.0.1:5173"],
      },
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "http://evil.example.com",
        "access-control-request-method": "GET",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-origin"]).not.toBe("*");
  });
});
