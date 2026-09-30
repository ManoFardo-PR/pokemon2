import { describe, it, expect } from "vitest";
import {
  normNumber,
  setIdCandidates,
  resolveTcgdexSet,
  cardOverride,
  matchCards,
  OverridesSchema,
  type Overrides,
  type BriefCard,
  type CanonicalCard,
} from "./idmap.js";

describe("S02.T04 — ID Mapping (RED phase)", () => {
  describe("normNumber (BR-S02.T04-04)", () => {
    const table: Array<[string | null | undefined, string]> = [
      ["001", "1"],
      ["TG01", "tg1"],
      ["SV045", "sv45"],
      ["12a", "12a"],
      ["CC001", "cc1"],
      ["H31", "h31"],
      ["", ""],
      [null, ""],
      [undefined, ""],
    ];

    it.each(table)("normalizes %j -> %j", (input, expected) => {
      expect(normNumber(input)).toBe(expected);
    });

    it("handles whitespace and case trimming", () => {
      expect(normNumber("  007  ")).toBe("7");
      expect(normNumber("  TG002  ")).toBe("tg2");
      expect(normNumber("sv001a")).toBe("sv1a");
    });
  });

  describe("setIdCandidates (BR-S02.T04-01, BR-S02.T04-02)", () => {
    describe("Block 1: Scarlet & Violet (sv) era", () => {
      it("generates candidates for standard and .5 sets", () => {
        expect(setIdCandidates("sv1")).toEqual(["sv01", "sv1"]);
        expect(setIdCandidates("sv10")).toEqual(["sv10"]);
        expect(setIdCandidates("sv3pt5")).toEqual(["sv03.5", "sv3.5"]);
        expect(setIdCandidates("sv8pt5")).toEqual(["sv08.5", "sv8.5"]);
      });
    });

    describe("Block 2: Mega Evolution (me) era", () => {
      it("generates candidates for me sets", () => {
        expect(setIdCandidates("me1")).toEqual(["me01", "me1"]);
        expect(setIdCandidates("me2pt5")).toEqual(["me02.5", "me2.5"]);
      });
    });

    describe("Block 3: Sword & Shield (swsh) era", () => {
      it("generates candidates for swsh standard and half sets", () => {
        expect(setIdCandidates("swsh45")).toEqual(["swsh4.5", "swsh45"]);
        expect(setIdCandidates("swsh35")).toEqual(["swsh3.5", "swsh35"]);
        expect(setIdCandidates("swsh12pt5")).toEqual(["swsh12.5", "swsh12"]);
        expect(setIdCandidates("swsh10")).toEqual(["swsh10"]);
        expect(setIdCandidates("swsh11")).toEqual(["swsh11"]);
      });

      it("generates gallery candidates with base fallback", () => {
        expect(setIdCandidates("swsh9tg")).toEqual(["swsh9tg", "swsh9"]);
        expect(setIdCandidates("swsh45sv")).toEqual(["swsh4.5sv", "swsh4.5"]);
        expect(setIdCandidates("swsh12pt5gg")).toEqual(["swsh12.5gg", "swsh12.5"]);
      });
    });

    describe("Block 4: Special sets (pgo, sm115sv)", () => {
      it("maps pgo to swsh10.5", () => {
        const candidates = setIdCandidates("pgo");
        expect(candidates).toContain("swsh10.5");
        expect(candidates[0]).toBe("swsh10.5");
      });

      it("maps sm115sv to sma and base fallback sm11.5", () => {
        const candidates = setIdCandidates("sm115sv");
        expect(candidates[0]).toBe("sma");
        expect(candidates).toContain("sm11.5");
      });
    });

    describe("Block 5: Sub-special SV sets (zsv10pt5, rsv10pt5)", () => {
      it("maps zsv10pt5 to sv10.5b and rsv10pt5 to sv10.5w", () => {
        expect(setIdCandidates("zsv10pt5")[0]).toBe("sv10.5b");
        expect(setIdCandidates("rsv10pt5")[0]).toBe("sv10.5w");
      });
    });

    describe("Block 6: Sun & Moon (sm) era", () => {
      it("handles half sets and standard sets", () => {
        expect(setIdCandidates("sm35")).toEqual(["sm3.5", "sm35"]);
        expect(setIdCandidates("sm115")).toEqual(["sm11.5", "sm115"]);
        expect(setIdCandidates("sm5")).toEqual(["sm5"]);
      });
    });

    describe("Block 7: McDonald's sets (mcd)", () => {
      it("maps mcd sets according to era year split (<=2022 swsh, >2022 sv)", () => {
        const mcd21 = setIdCandidates("mcd21");
        expect(mcd21).toEqual(["2021swsh", "mcd21", "2021"]);

        const mcd23 = setIdCandidates("mcd23");
        expect(mcd23).toEqual(["2023sv", "mcd23", "2023"]);
      });
    });

    describe("Block 8: Celebrations Classic Collection", () => {
      it("maps cel25c to cel25cc", () => {
        expect(setIdCandidates("cel25c")[0]).toBe("cel25cc");
      });
    });

    describe("Block 9 & 10: svp, sve & general gallery prefix", () => {
      it("preserves promos and energy sets", () => {
        expect(setIdCandidates("svp")).toContain("svp");
        expect(setIdCandidates("sve")).toContain("sve");
      });
    });

    describe("Block 11: Fallbacks and generic behavior", () => {
      it("falls back to raw id and replaces pt5 with .5", () => {
        expect(setIdCandidates("xy1")).toEqual(["xy1"]);
        expect(setIdCandidates("xy10pt5")).toEqual(["xy10pt5", "xy10.5"]);
      });
    });

    describe("Stability & Deduplication (BR-S02.T04-01)", () => {
      it("candidates are deduped and stable", () => {
        const first = setIdCandidates("swsh45");
        const second = setIdCandidates("swsh45");
        expect(first).toEqual(second);
        expect(new Set(first).size).toBe(first.length);
      });
    });

    describe("Manual Set Overrides (BR-S02.T04-02)", () => {
      it("set override short-circuits the heuristics", () => {
        const overrides: Overrides = {
          sets: {
            custom_set: "target_set",
            multi_cand: ["cand1", "cand2"],
          },
          cards: {},
        };

        expect(setIdCandidates("custom_set", overrides)).toEqual(["target_set"]);
        expect(setIdCandidates("multi_cand", overrides)).toEqual(["cand1", "cand2"]);
        // Should not contain fallback
        expect(setIdCandidates("custom_set", overrides)).not.toContain("custom_set");
      });
    });
  });

  describe("resolveTcgdexSet (BR-S02.T04-03)", () => {
    it("returns first matching candidate present in known set", () => {
      const known = new Set(["sv1", "other"]);
      // setIdCandidates("sv1") returns ["sv01", "sv1"]
      expect(resolveTcgdexSet("sv1", known)).toBe("sv1");
    });

    it("unknown set resolves to null and is reported", () => {
      const known = new Set(["xy1", "xy2"]);
      expect(resolveTcgdexSet("nonexistent", known)).toBeNull();
    });
  });

  describe("cardOverride", () => {
    it("returns override card id if present", () => {
      const overrides: Overrides = {
        sets: {},
        cards: { "c-1": "tcg-1" },
      };
      expect(cardOverride("c-1", overrides)).toBe("tcg-1");
      expect(cardOverride("c-unknown", overrides)).toBeUndefined();
    });
  });

  describe("matchCards (BR-S02.T04-05, BR-S02.T04-06, BR-S02.T04-07)", () => {
    it("matches by override first (Step 1)", () => {
      const canonical: CanonicalCard[] = [
        { id: "c1", number: "1", name: "Pikachu" },
      ];
      const brief: BriefCard[] = [
        { id: "b1", localId: "1", name: "Pikachu" },
        { id: "b99", localId: "99", name: "Raichu" },
      ];
      const overrides: Overrides = {
        sets: {},
        cards: { c1: "b99" },
      };

      const res = matchCards(canonical, brief, overrides);
      expect(res.matches.get("c1")).toBe("b99");
      expect(res.byOverride).toBe(1);
      expect(res.byNumber).toBe(0);
      expect(res.unmatched).toHaveLength(0);
    });

    it("reproduces legacy case: unique number match (Step 2)", () => {
      const canonical: CanonicalCard[] = [
        { id: "x-1", number: "1", name: "A" },
        { id: "x-TG01", number: "TG01", name: "B" },
        { id: "x-99", number: "99", name: "C" },
      ];
      const brief: BriefCard[] = [
        { id: "y-001", localId: "001", name: "A" },
        { id: "y-TG01", localId: "TG01", name: "B" },
      ];

      const res = matchCards(canonical, brief);
      expect(res.matches.get("x-1")).toBe("y-001");
      expect(res.matches.get("x-TG01")).toBe("y-TG01");
      expect(res.matches.has("x-99")).toBe(false);
      expect(res.unmatched).toEqual([{ id: "x-99", number: "99", name: "C" }]);
      expect(res.byNumber).toBe(2);
      expect(res.byName).toBe(0);
    });

    it("resolves number collisions by exact lowercase name (BR-S02.T04-07 Step 3)", () => {
      const canonical: CanonicalCard[] = [
        { id: "c-1", number: "1", name: "Charizard" },
      ];
      const brief: BriefCard[] = [
        { id: "b-1a", localId: "1", name: "Blastoise" },
        { id: "b-1b", localId: "01", name: "Charizard" },
      ];

      const res = matchCards(canonical, brief);
      expect(res.matches.get("c-1")).toBe("b-1b");
      expect(res.byNumber).toBe(1);
      expect(res.ambiguous).toHaveLength(0);
    });

    it("unresolvable collision takes the first and is counted in ambiguous (BR-S02.T04-07)", () => {
      const canonical: CanonicalCard[] = [
        { id: "c-1", number: "1", name: "Unknown Name" },
      ];
      const brief: BriefCard[] = [
        { id: "b-1a", localId: "1", name: "Alpha" },
        { id: "b-1b", localId: "01", name: "Beta" },
      ];

      const res = matchCards(canonical, brief);
      expect(res.matches.get("c-1")).toBe("b-1a");
      expect(res.byNumber).toBe(1);
      expect(res.ambiguous).toEqual(["c-1"]);
    });

    it("name fallback never reuses a claimed tcgdex id (BR-S02.T04-05)", () => {
      const canonical: CanonicalCard[] = [
        { id: "c-1", number: "1", name: "Mew" },
        { id: "c-2", number: "999", name: "Mew" },
      ];
      const brief: BriefCard[] = [
        { id: "b-1", localId: "1", name: "Mew" },
      ];

      const res = matchCards(canonical, brief);
      expect(res.matches.get("c-1")).toBe("b-1");
      expect(res.matches.has("c-2")).toBe(false);
      expect(res.unmatched).toHaveLength(1);
      expect(res.unmatched[0]?.id).toBe("c-2");
    });

    it("duplicate name on the canonical side stays unmatched (BR-S02.T04-06)", () => {
      // Reduced cel25c / cel25cc fixture reproducing alt-art ambiguity
      const canonical: CanonicalCard[] = [
        { id: "cel25c-93", number: "93", name: "Gardevoir ex" },
        { id: "cel25c-93_A", number: "93_A", name: "Gardevoir ex" },
      ];
      const brief: BriefCard[] = [
        { id: "cel25cc-CC01", localId: "CC01", name: "Gardevoir ex" },
      ];

      const res = matchCards(canonical, brief);
      // Because numbers 93 and 93_A don't match CC01, it falls through to name matching.
      // But "Gardevoir ex" appears twice on canonical side, so guard ptcgNameCounts === 1 prevents matching!
      expect(res.matches.has("cel25c-93")).toBe(false);
      expect(res.matches.has("cel25c-93_A")).toBe(false);
      expect(res.unmatched).toHaveLength(2);
      expect(res.byName).toBe(0);
    });

    it("name fallback matches when name is unique on both sides (Step 4)", () => {
      const canonical: CanonicalCard[] = [
        { id: "c-diff-num", number: "50", name: "Unique Mon" },
      ];
      const brief: BriefCard[] = [
        { id: "b-diff-num", localId: "CC99", name: "Unique Mon" },
      ];

      const res = matchCards(canonical, brief);
      expect(res.matches.get("c-diff-num")).toBe("b-diff-num");
      expect(res.byName).toBe(1);
      expect(res.unmatched).toHaveLength(0);
    });
  });

  describe("OverridesSchema (BR-S02.T04-09)", () => {
    it("validates compliant override object", () => {
      const valid = {
        sets: {
          setA: "targetA",
          setB: ["cand1", "cand2"],
        },
        cards: {
          cardA: "tcgCardA",
        },
      };

      const parsed = OverridesSchema.parse(valid);
      expect(parsed).toEqual(valid);
    });

    it("malformed overrides file throws with the offending path", () => {
      const invalid = {
        sets: {
          setA: 123, // invalid: not string or string[]
        },
        cards: {
          cardB: true,
        },
      };

      expect(() => OverridesSchema.parse(invalid)).toThrow();
    });
  });
});
