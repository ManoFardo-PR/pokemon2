import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  loadOverrides,
  OverridesError,
  renderUnmatchedCardsCsv,
  renderUnmatchedSetsCsv,
  writeUnmatchedReports,
} from "./idmap-io.js";

describe("S02.T04 — idmap I/O", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "idmap-io-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("loadOverrides (BR-S02.T04-09)", () => {
    it("treats a missing file as the empty default", () => {
      expect(loadOverrides(path.join(dir, "absent.json"))).toEqual({
        sets: {},
        cards: {},
      });
    });

    it("loads a valid overrides file", () => {
      const file = path.join(dir, "idmap-overrides.json");
      fs.writeFileSync(
        file,
        JSON.stringify({ sets: { a: "b", c: ["d", "e"] }, cards: { f: "g" } })
      );
      expect(loadOverrides(file)).toEqual({
        sets: { a: "b", c: ["d", "e"] },
        cards: { f: "g" },
      });
    });

    it("throws with the offending path when the file is malformed", () => {
      const file = path.join(dir, "idmap-overrides.json");
      fs.writeFileSync(file, JSON.stringify({ sets: { setA: 123 }, cards: {} }));
      expect(() => loadOverrides(file)).toThrow(OverridesError);
      expect(() => loadOverrides(file)).toThrow(/setA/);
    });

    it("throws when the file is not valid JSON", () => {
      const file = path.join(dir, "idmap-overrides.json");
      fs.writeFileSync(file, "{ not json");
      expect(() => loadOverrides(file)).toThrow(OverridesError);
    });

    it("accepts the shipped default file", () => {
      const shipped = path.resolve(import.meta.dirname, "..", "idmap-overrides.json");
      expect(loadOverrides(shipped)).toEqual({ sets: {}, cards: {} });
    });
  });

  describe("report rendering (BR-S02.T04-08)", () => {
    it("always writes the header, even with no rows", () => {
      expect(renderUnmatchedSetsCsv([])).toBe("ptcg_set_id,name,release_date\n");
      expect(renderUnmatchedCardsCsv([])).toBe(
        "ptcg_set_id,tcgdex_set_id,ptcg_card_id,number,name\n"
      );
    });

    it("quotes fields containing a comma per RFC 4180", () => {
      const csv = renderUnmatchedCardsCsv([
        {
          ptcgSetId: "cel25c",
          tcgdexSetId: "cel25cc",
          ptcgCardId: "cel25c-93_A",
          number: "93_A",
          name: 'Gardevoir ex, δ "shiny" ★',
        },
      ]);
      const dataLine = csv.split("\n")[1];
      expect(dataLine).toBe(
        'cel25c,cel25cc,cel25c-93_A,93_A,"Gardevoir ex, δ ""shiny"" ★"'
      );
    });

    it("renders a null tcgdex set id as an empty field", () => {
      const csv = renderUnmatchedCardsCsv([
        {
          ptcgSetId: "zz1",
          tcgdexSetId: null,
          ptcgCardId: "zz1-1",
          number: "1",
          name: "A",
        },
      ]);
      expect(csv.split("\n")[1]).toBe("zz1,,zz1-1,1,A");
    });

    it("orders card rows by set then number then id", () => {
      const rows = [
        { ptcgSetId: "b", tcgdexSetId: null, ptcgCardId: "b-2", number: "2", name: "x" },
        { ptcgSetId: "a", tcgdexSetId: null, ptcgCardId: "a-9", number: "9", name: "x" },
        { ptcgSetId: "a", tcgdexSetId: null, ptcgCardId: "a-1", number: "1", name: "x" },
      ];
      const ids = renderUnmatchedCardsCsv(rows)
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.split(",")[2]);
      expect(ids).toEqual(["a-1", "a-9", "b-2"]);
    });

    it("uses \n line endings and no CR", () => {
      const csv = renderUnmatchedSetsCsv([
        { ptcgSetId: "zz1", name: "Brand New", releaseDate: "2026-01-01" },
      ]);
      expect(csv).toBe("ptcg_set_id,name,release_date\nzz1,Brand New,2026-01-01\n");
      expect(csv).not.toContain("\r");
    });
  });

  describe("writeUnmatchedReports (determinism, BR-S02.T04-01)", () => {
    it("rewrites both files byte-identically for the same input", async () => {
      const data = {
        sets: [{ ptcgSetId: "zz1", name: "Brand New", releaseDate: null }],
        cards: [
          {
            ptcgSetId: "cel25c",
            tcgdexSetId: "cel25cc",
            ptcgCardId: "cel25c-93_A",
            number: "93_A",
            name: "Gardevoir ex",
          },
        ],
      };
      const target = path.join(dir, "reports");

      const { setsFile, cardsFile } = await writeUnmatchedReports(target, data);
      const firstSets = fs.readFileSync(setsFile);
      const firstCards = fs.readFileSync(cardsFile);

      await writeUnmatchedReports(target, data);

      expect(fs.readFileSync(setsFile).equals(firstSets)).toBe(true);
      expect(fs.readFileSync(cardsFile).equals(firstCards)).toBe(true);
    });
  });
});
