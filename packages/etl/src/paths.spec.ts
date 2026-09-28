// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findRepoRoot } from "@pokesearch/shared/env";
import {
  cacheRoot,
  resolveCachePath,
  ptcg,
  tcgdex,
  limitless,
  reports,
  writeJsonAtomic,
  CachePathError,
} from "./paths.js";

describe("paths", () => {
  let tempCacheDir: string;
  const originalRawCacheDir = process.env.RAW_CACHE_DIR;

  beforeEach(() => {
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-cache-test-"));
    process.env.RAW_CACHE_DIR = tempCacheDir;
  });

  afterEach(() => {
    if (originalRawCacheDir === undefined) {
      delete process.env.RAW_CACHE_DIR;
    } else {
      process.env.RAW_CACHE_DIR = originalRawCacheDir;
    }
    if (fs.existsSync(tempCacheDir)) {
      fs.rmSync(tempCacheDir, { recursive: true, force: true });
    }
  });

  describe("cacheRoot", () => {
    it("returns normalized directory and ensures it exists", () => {
      const nonExistentSub = path.join(tempCacheDir, "nested", "cache");
      process.env.RAW_CACHE_DIR = nonExistentSub;

      const root = cacheRoot();
      expect(root).toBe(path.resolve(nonExistentSub));
      expect(fs.existsSync(root)).toBe(true);
      expect(fs.statSync(root).isDirectory()).toBe(true);
    });
  });

  describe("resolveCachePath", () => {
    it("resolves valid subpath inside cacheRoot", () => {
      const resolved = resolveCachePath("test", "subfile.json");
      expect(resolved).toBe(path.join(path.resolve(tempCacheDir), "test", "subfile.json"));
    });

    it("throws CachePathError when given path traversal outside cacheRoot", () => {
      expect(() => resolveCachePath("..", "outside.json")).toThrow(CachePathError);
      expect(() => resolveCachePath("nested", "..", "..", "outside.json")).toThrow(CachePathError);
    });

    it("throws CachePathError when given an absolute path outside RAW_CACHE_DIR", () => {
      const outsideDir = os.tmpdir();
      const outsidePath = path.join(outsideDir, "escape.json");
      expect(() => resolveCachePath(outsidePath)).toThrow(CachePathError);
    });

    it("throws CachePathError when target resolves inside repository root", () => {
      const repoRoot = findRepoRoot();
      const insideRepo = path.join(repoRoot, "packages", "etl", "escaped.json");
      expect(() => resolveCachePath(insideRepo)).toThrow(CachePathError);
    });
  });

  describe("source path generators", () => {
    it("ptcg.setsFile returns expected path under cacheRoot", () => {
      const p = ptcg.setsFile();
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "pokemon-tcg-data", "sets", "en.json"));
    });

    it("ptcg.cardsFile returns expected path under cacheRoot", () => {
      const p = ptcg.cardsFile("sv3pt5");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "pokemon-tcg-data", "cards", "en", "sv3pt5.json"));
    });

    it("ptcg.etagsFile returns expected path under cacheRoot", () => {
      const p = ptcg.etagsFile();
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "pokemon-tcg-data", "etags.json"));
    });

    it("tcgdex.setsFile returns expected path under cacheRoot", () => {
      const p = tcgdex.setsFile();
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "tcgdex", "sets.json"));
    });

    it("tcgdex.setFile returns expected path under cacheRoot", () => {
      const p = tcgdex.setFile("sv03.5");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "tcgdex", "sets", "sv03.5.json"));
    });

    it("tcgdex.cardFile returns expected path under cacheRoot", () => {
      const p = tcgdex.cardFile("sv03.5-001");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "tcgdex", "cards", "sv03.5-001.json"));
    });

    it("limitless.tournamentDir returns expected path under cacheRoot", () => {
      const p = limitless.tournamentDir("T123");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "limitless", "tournaments", "T123"));
    });

    it("limitless.webList returns expected path under cacheRoot", () => {
      const p = limitless.webList("L456");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "limitless", "web", "list_L456.html"));
    });

    it("reports.file returns expected path under cacheRoot", () => {
      const p = reports.file("idmap_unmatched_cards.csv");
      expect(p).toBe(path.join(path.resolve(tempCacheDir), "reports", "idmap_unmatched_cards.csv"));
    });
  });

  describe("writeJsonAtomic", () => {
    it("writes JSON cleanly and replaces file atomically", async () => {
      const dest = resolveCachePath("test-atomic", "data.json");
      const payload = { hello: "world", count: 42, active: true };

      await writeJsonAtomic(dest, payload);

      expect(fs.existsSync(dest)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(dest, "utf8"));
      expect(parsed).toEqual(payload);

      // Overwrite atomically
      const updated = { hello: "world-updated", count: 99 };
      await writeJsonAtomic(dest, updated);
      expect(JSON.parse(fs.readFileSync(dest, "utf8"))).toEqual(updated);
    });

    it("cleans up temporary files on write error", async () => {
      const targetDir = path.join(tempCacheDir, "test-atomic-err");
      fs.mkdirSync(targetDir, { recursive: true });
      const dest = path.join(targetDir, "failing.json");

      // Circular object causes JSON.stringify to throw
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      await expect(writeJsonAtomic(dest, circular)).rejects.toThrow();

      // Ensure no dangling .tmp files exist in targetDir
      const files = fs.readdirSync(targetDir);
      const tmpFiles = files.filter((f) => f.includes(".tmp."));
      expect(tmpFiles).toHaveLength(0);
      expect(fs.existsSync(dest)).toBe(false);
    });
  });
});
