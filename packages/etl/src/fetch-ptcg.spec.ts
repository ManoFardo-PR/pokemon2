import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import * as crypto from "node:crypto";
import { ptcg } from "./paths.js";
import {
  fetchAll,
  fetchSets,
  fetchSetCards,
  loadSets,
  loadCards,
  loadEtags,
  saveEtags,
  CacheMissError,
  PTCG_RAW_BASE,
  type PtcgSet,
  type PtcgCard,
} from "./fetch-ptcg.js";

describe("fetch-ptcg (RED phase test suite)", () => {
  let tempCacheDir: string;
  const originalRawCacheDir = process.env.RAW_CACHE_DIR;
  let server: http.Server;
  let serverUrl: string;

  // Mock server state
  interface MockRoute {
    status: number;
    etag?: string;
    body: string;
    headers?: Record<string, string>;
  }
  let routes: Map<string, MockRoute>;
  let requestLog: Array<{ path: string; headers: http.IncomingHttpHeaders }>;

  beforeEach(async () => {
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-ptcg-test-"));
    process.env.RAW_CACHE_DIR = tempCacheDir;

    routes = new Map();
    requestLog = [];

    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url ?? "/", `http://localhost`);
      const reqPath = parsedUrl.pathname;
      requestLog.push({ path: reqPath, headers: req.headers });

      const route = routes.get(reqPath);
      if (!route) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const clientEtag = req.headers["if-none-match"];
      if (clientEtag && route.etag && clientEtag === route.etag) {
        res.writeHead(304, { etag: route.etag });
        res.end();
        return;
      }

      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(route.headers ?? {}),
      };
      if (route.etag) {
        headers["etag"] = route.etag;
      }

      res.writeHead(route.status, headers);
      res.end(route.body);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address();
    if (addr && typeof addr === "object") {
      serverUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    if (originalRawCacheDir === undefined) {
      delete process.env.RAW_CACHE_DIR;
    } else {
      process.env.RAW_CACHE_DIR = originalRawCacheDir;
    }

    if (fs.existsSync(tempCacheDir)) {
      fs.rmSync(tempCacheDir, { recursive: true, force: true });
    }
  });

  const sampleSets: PtcgSet[] = [
    { id: "sv1", name: "Scarlet & Violet", total: 198 },
    { id: "sv2", name: "Paldea Evolved", total: 193 },
  ];

  const sampleCardsSv1: PtcgCard[] = [
    { id: "sv1-1", name: "Sprigatito", number: "1", supertype: "Pokémon", hp: "60" },
    { id: "sv1-2", name: "Floragato", number: "2", supertype: "Pokémon", hp: "90" },
  ];

  const sampleCardsSv2: PtcgCard[] = [
    { id: "sv2-1", name: "Fuecoco", number: "1", supertype: "Pokémon", hp: "70" },
  ];

  function setupStandardRoutes(baseUrlOverride?: string) {
    routes.set("/sets/en.json", {
      status: 200,
      etag: '"etag-sets-1"',
      body: JSON.stringify(sampleSets),
    });
    routes.set("/cards/en/sv1.json", {
      status: 200,
      etag: '"etag-cards-sv1-1"',
      body: JSON.stringify(sampleCardsSv1),
    });
    routes.set("/cards/en/sv2.json", {
      status: 200,
      etag: '"etag-cards-sv2-1"',
      body: JSON.stringify(sampleCardsSv2),
    });
  }

  describe("First-run download", () => {
    it("fetches sets index and cards for each set, writing cache and etags.json", async () => {
      setupStandardRoutes();

      const result = await fetchAll({ baseUrl: serverUrl });

      expect(result.sets).toHaveLength(2);
      expect(result.changedSetIds).toEqual(expect.arrayContaining(["sv1", "sv2"]));
      expect(result.requests).toBe(3);
      expect(result.notModified).toBe(0);
      expect(result.missingCardFiles).toEqual([]);

      // Verify cached files exist
      expect(fs.existsSync(ptcg.setsFile())).toBe(true);
      expect(fs.existsSync(ptcg.cardsFile("sv1"))).toBe(true);
      expect(fs.existsSync(ptcg.cardsFile("sv2"))).toBe(true);
      expect(fs.existsSync(ptcg.etagsFile())).toBe(true);

      // Verify etags content
      const etags = JSON.parse(fs.readFileSync(ptcg.etagsFile(), "utf8"));
      expect(etags["sets/en.json"]).toBe('"etag-sets-1"');
      expect(etags["cards/en/sv1.json"]).toBe('"etag-cards-sv1-1"');
      expect(etags["cards/en/sv2.json"]).toBe('"etag-cards-sv2-1"');
    });
  });

  describe("Second run unchanged (BR-S02.T02-02)", () => {
    it("handles 304 Not Modified without rewriting files or marking sets as changed", async () => {
      setupStandardRoutes();

      // First run to seed cache
      await fetchAll({ baseUrl: serverUrl });

      const sv1Path = ptcg.cardsFile("sv1");
      const sv2Path = ptcg.cardsFile("sv2");
      const setsPath = ptcg.setsFile();

      const mtimeSv1 = fs.statSync(sv1Path).mtimeMs;
      const mtimeSv2 = fs.statSync(sv2Path).mtimeMs;
      const mtimeSets = fs.statSync(setsPath).mtimeMs;

      // Clear request log
      requestLog = [];

      // Second run - server should return 304 because ETags are sent
      const result = await fetchAll({ baseUrl: serverUrl });

      expect(result.changedSetIds).toEqual([]);
      expect(result.requests).toBe(3);
      expect(result.notModified).toBe(3);

      // Verify mtimes did not change
      expect(fs.statSync(sv1Path).mtimeMs).toBe(mtimeSv1);
      expect(fs.statSync(sv2Path).mtimeMs).toBe(mtimeSv2);
      expect(fs.statSync(setsPath).mtimeMs).toBe(mtimeSets);

      // Verify conditional headers were sent
      const sv1Req = requestLog.find((r) => r.path === "/cards/en/sv1.json");
      expect(sv1Req?.headers["if-none-match"]).toBe('"etag-cards-sv1-1"');
    });
  });

  describe("Deleted cache file re-downloaded unconditionally (BR-S02.T02-01)", () => {
    it("omits If-None-Match when cached card file is missing even if ETag is known", async () => {
      setupStandardRoutes();
      await fetchAll({ baseUrl: serverUrl });

      // Delete sv1 card file but keep etags.json
      fs.unlinkSync(ptcg.cardsFile("sv1"));
      expect(fs.existsSync(ptcg.cardsFile("sv1"))).toBe(false);

      requestLog = [];
      const result = await fetchAll({ baseUrl: serverUrl });

      const sv1Req = requestLog.find((r) => r.path === "/cards/en/sv1.json");
      expect(sv1Req?.headers["if-none-match"]).toBeUndefined();
      expect(fs.existsSync(ptcg.cardsFile("sv1"))).toBe(true);
      expect(result.changedSetIds).toContain("sv1");
    });
  });

  describe("Corrupt / Truncated file recovery (BR-S02.T02-04)", () => {
    it("deletes corrupt JSON cache and re-downloads unconditionally", async () => {
      setupStandardRoutes();
      await fetchAll({ baseUrl: serverUrl });

      // Overwrite sv2 card file with corrupted JSON
      fs.writeFileSync(ptcg.cardsFile("sv2"), '[{"id": "sv2-1", ', "utf8");

      requestLog = [];
      const result = await fetchAll({ baseUrl: serverUrl });

      const sv2Req = requestLog.find((r) => r.path === "/cards/en/sv2.json");
      expect(sv2Req?.headers["if-none-match"]).toBeUndefined();
      expect(result.changedSetIds).toContain("sv2");

      const loaded = JSON.parse(fs.readFileSync(ptcg.cardsFile("sv2"), "utf8"));
      expect(loaded).toEqual(sampleCardsSv2);
    });
  });

  describe("Rotating ETag with identical SHA-256 (BR-S02.T02-03)", () => {
    it("updates in-memory ETag but marks changed: false and does not touch file mtime", async () => {
      setupStandardRoutes();
      await fetchAll({ baseUrl: serverUrl });

      const sv1Path = ptcg.cardsFile("sv1");
      const mtimeBefore = fs.statSync(sv1Path).mtimeMs;

      // Update mock route with new ETag but identical body
      routes.set("/cards/en/sv1.json", {
        status: 200,
        etag: '"etag-cards-sv1-rotated"',
        body: JSON.stringify(sampleCardsSv1),
      });

      const result = await fetchAll({ baseUrl: serverUrl });

      expect(result.changedSetIds).not.toContain("sv1");
      expect(fs.statSync(sv1Path).mtimeMs).toBe(mtimeBefore);

      const etags = JSON.parse(fs.readFileSync(ptcg.etagsFile(), "utf8"));
      expect(etags["cards/en/sv1.json"]).toBe('"etag-cards-sv1-rotated"');
    });
  });

  describe("404 handling (BR-S02.T02-05)", () => {
    it("404 on cards/en/<id>.json logs warning and records in missingCardFiles without failing run", async () => {
      setupStandardRoutes();
      routes.set("/cards/en/sv2.json", {
        status: 404,
        body: "Card set not found",
      });

      const result = await fetchAll({ baseUrl: serverUrl });
      expect(result.missingCardFiles).toContain("sv2");
      expect(result.changedSetIds).toContain("sv1");
      expect(result.changedSetIds).not.toContain("sv2");
    });

    it("404 on sets/en.json throws error and aborts run", async () => {
      routes.set("/sets/en.json", {
        status: 404,
        body: "Sets index not found",
      });

      await expect(fetchAll({ baseUrl: serverUrl })).rejects.toThrow();
    });
  });

  describe("etags.json persistence failure safety (BR-S02.T02-08)", () => {
    it("leaves etags.json unchanged if batch run fails", async () => {
      setupStandardRoutes();
      await fetchAll({ baseUrl: serverUrl });

      const initialEtags = fs.readFileSync(ptcg.etagsFile(), "utf8");

      // Now make sets fail with 500 error
      routes.set("/sets/en.json", {
        status: 500,
        body: "Server Error",
      });

      await expect(fetchAll({ baseUrl: serverUrl, force: true })).rejects.toThrow();

      const finalEtags = fs.readFileSync(ptcg.etagsFile(), "utf8");
      expect(finalEtags).toBe(initialEtags);
    });
  });

  describe("Filtered fetch (--sets / onlySets)", () => {
    it("only fetches specified sets when onlySets filter is passed", async () => {
      setupStandardRoutes();

      const result = await fetchAll({ baseUrl: serverUrl, onlySets: ["sv1"] });

      expect(result.sets).toHaveLength(2);
      expect(result.changedSetIds).toEqual(["sv1"]);
      expect(fs.existsSync(ptcg.cardsFile("sv1"))).toBe(true);
      expect(fs.existsSync(ptcg.cardsFile("sv2"))).toBe(false);
    });
  });

  describe("Offline reader helpers: loadSets and loadCards", () => {
    it("loadSets returns parsed sets from cache without network", () => {
      const setsDir = path.dirname(ptcg.setsFile());
      fs.mkdirSync(setsDir, { recursive: true });
      fs.writeFileSync(ptcg.setsFile(), JSON.stringify(sampleSets), "utf8");

      const loaded = loadSets();
      expect(loaded).toEqual(sampleSets);
    });

    it("loadSets throws CacheMissError if sets file does not exist", () => {
      expect(() => loadSets()).toThrow(CacheMissError);
    });

    it("loadSets deletes corrupted file and throws CacheMissError", () => {
      const setsDir = path.dirname(ptcg.setsFile());
      fs.mkdirSync(setsDir, { recursive: true });
      fs.writeFileSync(ptcg.setsFile(), "invalid json content", "utf8");

      expect(() => loadSets()).toThrow(CacheMissError);
      expect(fs.existsSync(ptcg.setsFile())).toBe(false);
    });

    it("loadCards returns parsed cards for existing setId", () => {
      const cardsDir = path.dirname(ptcg.cardsFile("sv1"));
      fs.mkdirSync(cardsDir, { recursive: true });
      fs.writeFileSync(ptcg.cardsFile("sv1"), JSON.stringify(sampleCardsSv1), "utf8");

      const loaded = loadCards("sv1");
      expect(loaded).toEqual(sampleCardsSv1);
    });

    it("loadCards returns empty array if file does not exist", () => {
      const loaded = loadCards("nonexistent-set");
      expect(loaded).toEqual([]);
    });

    it("loadCards deletes corrupted file and throws CacheMissError", () => {
      const cardsDir = path.dirname(ptcg.cardsFile("sv2"));
      fs.mkdirSync(cardsDir, { recursive: true });
      fs.writeFileSync(ptcg.cardsFile("sv2"), "{corrupt json", "utf8");

      expect(() => loadCards("sv2")).toThrow(CacheMissError);
      expect(fs.existsSync(ptcg.cardsFile("sv2"))).toBe(false);
    });
  });
});
