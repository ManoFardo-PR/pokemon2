import { describe, it, expect } from "vitest";
import { apiConfigSchema } from "./config.js";

describe("apiConfigSchema (BR-S01.T07-02)", () => {
  it("accepts default configuration with loopback 127.0.0.1", () => {
    const parsed = apiConfigSchema.parse({});
    expect(parsed.API_HOST).toBe("127.0.0.1");
    expect(parsed.API_PORT).toBe(8000);
    expect(parsed.MIGRATE_ON_START).toBe(false);
    expect(parsed.CORS_ORIGINS).toEqual([
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ]);
  });

  it("accepts IPv6 loopback ::1", () => {
    const parsed = apiConfigSchema.parse({ API_HOST: "::1" });
    expect(parsed.API_HOST).toBe("::1");
  });

  it("rejects non-loopback host 0.0.0.0 (BR-S01.T07-02)", () => {
    expect(() => {
      apiConfigSchema.parse({ API_HOST: "0.0.0.0" });
    }).toThrow(/loopback/i);
  });

  it("rejects public IP or hostname (D-007)", () => {
    expect(() => {
      apiConfigSchema.parse({ API_HOST: "192.168.1.100" });
    }).toThrow(/loopback/i);
  });

  it("transforms MIGRATE_ON_START='1' to boolean true", () => {
    const parsed = apiConfigSchema.parse({ MIGRATE_ON_START: "1" });
    expect(parsed.MIGRATE_ON_START).toBe(true);
  });

  it("parses comma-separated CORS_ORIGINS into an array", () => {
    const parsed = apiConfigSchema.parse({
      CORS_ORIGINS: "http://localhost:3000, http://127.0.0.1:3000",
    });
    expect(parsed.CORS_ORIGINS).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });
});
