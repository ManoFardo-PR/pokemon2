import { describe, it, expect } from "vitest";
import { CONTRACT_VERSION, CONTRACT_MAJOR, isCompatible } from "./version.js";

describe("versioning system", () => {
  it("defines CONTRACT_VERSION as a semantic version string", () => {
    expect(CONTRACT_VERSION).toBe("1.0.0");
    expect(typeof CONTRACT_VERSION).toBe("string");
  });

  it("defines CONTRACT_MAJOR matching the major component of CONTRACT_VERSION", () => {
    expect(CONTRACT_MAJOR).toBe(1);
    expect(typeof CONTRACT_MAJOR).toBe("number");
    const majorStr = CONTRACT_VERSION.split(".")[0];
    expect(Number.parseInt(majorStr ?? "", 10)).toBe(CONTRACT_MAJOR);
  });

  describe("isCompatible", () => {
    it("returns true for matching major version strings", () => {
      expect(isCompatible("1.0.0")).toBe(true);
      expect(isCompatible("1.2.3")).toBe(true);
      expect(isCompatible("1.99.0")).toBe(true);
      expect(isCompatible("  1.0.0  ")).toBe(true);
    });

    it("returns false for different major versions", () => {
      expect(isCompatible("0.9.0")).toBe(false);
      expect(isCompatible("2.0.0")).toBe(false);
      expect(isCompatible("10.0.0")).toBe(false);
    });

    it("returns false for invalid or malformed version strings", () => {
      expect(isCompatible("")).toBe(false);
      expect(isCompatible("invalid")).toBe(false);
      expect(isCompatible("v1.0.0")).toBe(false);
      expect(isCompatible("null")).toBe(false);
    });
  });
});
