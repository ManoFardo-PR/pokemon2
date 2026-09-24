import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Bundle purity and no-server imports (BR-S01.T08-03)", () => {
  it("ensures web source code does not import server modules or node built-ins", () => {
    const srcDir = path.resolve(__dirname, "../src");
    
    function scanDir(dir: string): string[] {
      const files: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...scanDir(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(full);
        }
      }
      return files;
    }

    const files = scanDir(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /from\s+['"]node:/,
      /from\s+['"]@pokesearch\/db['"]/,
      /from\s+['"]@pokesearch\/shared\/env['"]/,
      /from\s+['"]apps\/api['"]/,
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      for (const pattern of forbiddenPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
