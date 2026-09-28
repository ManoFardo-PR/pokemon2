import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { createEtlLogger, REDACTED_KEYS } from "./logger.js";

describe("logger", () => {
  it("matches expected sensitive keys with REDACTED_KEYS regexp", () => {
    expect(REDACTED_KEYS.test("LIMITLESS_API_KEY")).toBe(true);
    expect(REDACTED_KEYS.test("apiKey")).toBe(true);
    expect(REDACTED_KEYS.test("secret_token")).toBe(true);
    expect(REDACTED_KEYS.test("api_secret")).toBe(true);
    expect(REDACTED_KEYS.test("user_token")).toBe(true);
    expect(REDACTED_KEYS.test("sets_count")).toBe(false);
    expect(REDACTED_KEYS.test("cards")).toBe(false);
  });

  it("redacts sensitive keys in JSON NDJSON mode", async () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = createEtlLogger({ json: true }, dest);
    logger.info({
      LIMITLESS_API_KEY: "secret-12345",
      user_token: "tok_abcdef",
      apiKey: "key_xyz",
      safeField: "visible",
    }, "API call executed");

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.msg).toBe("API call executed");
    expect(parsed.LIMITLESS_API_KEY).toBe("[REDACTED]");
    expect(parsed.user_token).toBe("[REDACTED]");
    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.safeField).toBe("visible");
  });

  it("formats log output in JSON mode containing run_id, kind, step, and counters", () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = createEtlLogger({ json: true }, dest);
    logger.info({
      run_id: 12,
      kind: "full",
      step: "fetch-ptcg",
      sets: 150,
      cards: 15000,
    }, "Step completed");

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.run_id).toBe(12);
    expect(parsed.kind).toBe("full");
    expect(parsed.step).toBe("fetch-ptcg");
    expect(parsed.sets).toBe(150);
    expect(parsed.cards).toBe(15000);
  });

  it("formats log output in human format without raw JSON dump", () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = createEtlLogger({ json: false }, dest);
    logger.info({ step: "map-ids" }, "Mapped 420 cards");

    expect(lines.length).toBeGreaterThan(0);
    const output = lines.join("");
    expect(output).toContain("Mapped 420 cards");
    // Human format should not be a raw NDJSON object string
    expect(output.trim().startsWith("{")).toBe(false);
  });
});
