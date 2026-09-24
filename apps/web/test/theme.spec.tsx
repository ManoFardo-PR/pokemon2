import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("CSS Tokens and Dark Mode (BR-S01.T08-06)", () => {
  it("defines all required legacy design tokens in tokens.css", () => {
    const tokensPath = path.resolve(__dirname, "../src/styles/tokens.css");
    expect(fs.existsSync(tokensPath)).toBe(true);

    const content = fs.readFileSync(tokensPath, "utf-8");

    // :root tokens
    expect(content).toContain("--bg: #f6f6f4;");
    expect(content).toContain("--surface: #fff;");
    expect(content).toContain("--ink: #1c1c1a;");
    expect(content).toContain("--ink2: #5a5a56;");
    expect(content).toContain("--muted: #8a8a85;");
    expect(content).toContain("--line: #e3e3df;");
    expect(content).toContain("--accent: #2f5fd6;");
    expect(content).toContain("--accent-ink: #fff;");
    expect(content).toContain("--warn-bg: #fff4d6;");
    expect(content).toContain("--warn-ink: #7a5300;");
    expect(content).toContain("--spark: #2f5fd6;");

    // dark mode media query and tokens
    expect(content).toContain("@media (prefers-color-scheme: dark)");
    expect(content).toContain("--bg: #151516;");
    expect(content).toContain("--surface: #1f1f21;");
    expect(content).toContain("--ink: #ececea;");
    expect(content).toContain("--accent: #7fa0ff;");

    // support for data-theme
    expect(content).toContain(":root[data-theme=\"light\"]");
    expect(content).toContain(":root[data-theme=\"dark\"]");
  });
});
