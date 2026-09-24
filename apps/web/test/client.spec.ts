import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { apiFetch, ApiError, ApiSchemaError, queryKeys } from "../src/api/client.js";

describe("apiFetch client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("refuses an absolute URL (BR-S01.T08-05)", async () => {
    const dummySchema = z.object({ ok: z.boolean() });

    // @ts-expect-error testing runtime check for absolute URLs
    await expect(apiFetch("http://localhost:3001/api/health", { schema: dummySchema }))
      .rejects
      .toThrow(/relative path/i);

    // @ts-expect-error testing runtime check for absolute URLs
    await expect(apiFetch("https://api.pokesearch.test/health", { schema: dummySchema }))
      .rejects
      .toThrow(/relative path/i);
  });

  it("builds URL with query search params and drops undefined entries", async () => {
    const dummySchema = z.object({ count: z.number() });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ count: 42 }),
    });
    globalThis.fetch = mockFetch;

    const res = await apiFetch("/api/cards", {
      schema: dummySchema,
      search: {
        q: "charizard",
        page: 1,
        active: true,
        extra: undefined,
      },
    });

    expect(res).toEqual({ count: 42 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/api/cards?");
    expect(calledUrl).toContain("q=charizard");
    expect(calledUrl).toContain("page=1");
    expect(calledUrl).toContain("active=true");
    expect(calledUrl).not.toContain("extra");
  });

  it("maps error envelope on non-2xx responses to ApiError", async () => {
    const dummySchema = z.object({ ok: z.boolean() });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        error: {
          code: "not_found",
          message: "Card not found",
          details: [{ path: "cardId", message: "Unknown ID" }],
          requestId: "req-123",
        },
      }),
    });
    globalThis.fetch = mockFetch;

    await expect(apiFetch("/api/cards/xyz", { schema: dummySchema })).rejects.toThrow(ApiError);

    try {
      await apiFetch("/api/cards/xyz", { schema: dummySchema });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe("not_found");
      expect(apiErr.requestId).toBe("req-123");
      expect(apiErr.details).toEqual([{ path: "cardId", message: "Unknown ID" }]);
    }
  });

  it("maps non-envelope non-2xx body to ApiError with code invalid_response", async () => {
    const dummySchema = z.object({ ok: z.boolean() });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers({ "content-type": "text/html" }),
      json: async () => {
        throw new Error("not json");
      },
    });
    globalThis.fetch = mockFetch;

    try {
      await apiFetch("/api/external", { schema: dummySchema });
      expect.unreachable("should have thrown ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.code).toBe("invalid_response");
    }
  });

  it("rejects a response missing a field and throws ApiSchemaError (BR-S01.T08-02)", async () => {
    const strictSchema = z.object({
      id: z.string(),
      name: z.string(),
      hp: z.number(),
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "c1",
        name: "Pikachu",
        // missing hp
      }),
    });
    globalThis.fetch = mockFetch;

    await expect(apiFetch("/api/cards/c1", { schema: strictSchema }))
      .rejects
      .toThrow(ApiSchemaError);

    try {
      await apiFetch("/api/cards/c1", { schema: strictSchema });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiSchemaError);
      const schemaErr = err as ApiSchemaError;
      expect(schemaErr.path).toBe("/api/cards/c1");
      expect(schemaErr.issues.length).toBeGreaterThan(0);
      expect(schemaErr.issues[0]?.path).toContain("hp");
    }
  });

  it("handles network failure and returns ApiError with status 0 and code network_error", async () => {
    const dummySchema = z.object({ ok: z.boolean() });
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    globalThis.fetch = mockFetch;

    try {
      await apiFetch("/health", { schema: dummySchema });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(0);
      expect(apiErr.code).toBe("network_error");
    }
  });

  it("exposes standard queryKeys helper convention", () => {
    expect(queryKeys.health).toEqual(["health"]);
    expect(queryKeys.version).toEqual(["version"]);
    expect(queryKeys.cards({ q: "pikachu" })).toEqual(["cards", { q: "pikachu" }]);
  });
});
