import { z } from "zod";

export const OverridesSchema = z.object({
  sets: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  cards: z.record(z.string(), z.string()),
});

export type Overrides = z.infer<typeof OverridesSchema>;

export interface BriefCard {
  id: string;
  localId: string;
  name: string;
}

export interface CanonicalCard {
  id: string;
  number: string;
  name: string;
}

export interface MatchResult {
  matches: Map<string, string>; // ptcgCardId -> tcgdexCardId
  unmatched: CanonicalCard[];
  byNumber: number;
  byName: number;
  byOverride: number;
  ambiguous: string[];
}

/**
 * Normalizes card numbers by lowercasing, trimming, and stripping leading zeros
 * from the numeric part while preserving alphabetical prefix and suffix.
 * BR-S02.T04-04.
 */
export function normNumber(num: string | null | undefined): string {
  if (num === null || num === undefined) {
    return "";
  }
  const s = String(num).trim().toLowerCase();
  if (s === "") {
    return "";
  }
  const match = s.match(/^([a-z-]*)0*(\d+)([a-z]*)$/);
  if (!match) {
    return s;
  }
  const [, prefix, digits, suffix] = match;
  return `${prefix}${digits}${suffix}`;
}

/**
 * Returns candidate TCGdex set IDs ordered by preference.
 * BR-S02.T04-01, BR-S02.T04-02.
 */
export function setIdCandidates(
  ptcgSetId: string,
  overrides?: Overrides
): string[] {
  // Block 0: Overrides
  const setOverride = overrides?.sets[ptcgSetId];
  if (setOverride !== undefined) {
    return Array.isArray(setOverride) ? [...setOverride] : [setOverride];
  }

  const raw = ptcgSetId.trim().toLowerCase();
  const candidates: string[] = [];

  // Block 1: Scarlet & Violet (sv) era: ^sv(\d+)(pt5)?$
  const svMatch = raw.match(/^sv(\d+)(pt5)?$/);
  if (svMatch?.[1]) {
    const n = Number.parseInt(svMatch[1], 10);
    const half = svMatch[2] ? ".5" : "";
    const padded = String(n).padStart(2, "0");
    candidates.push(`sv${padded}${half}`);
    candidates.push(`sv${n}${half}`);
  }

  // Block 2: Mega Evolution (me) era: ^me(\d+)(pt5)?$
  const meMatch = raw.match(/^me(\d+)(pt5)?$/);
  if (meMatch?.[1]) {
    const n = Number.parseInt(meMatch[1], 10);
    const half = meMatch[2] ? ".5" : "";
    const padded = String(n).padStart(2, "0");
    candidates.push(`me${padded}${half}`);
    candidates.push(`me${n}${half}`);
  }

  // Block 3: Sword & Shield (swsh) era: ^swsh(\d+)(pt5)?(tg|sv|gg)?$
  const swshMatch = raw.match(/^swsh(\d+)(pt5)?(tg|sv|gg)?$/);
  if (swshMatch?.[1]) {
    const numStr = swshMatch[1];
    const isPt5 = Boolean(swshMatch[2]);
    const gallery = swshMatch[3] ?? "";

    let base: string;
    if (isPt5) {
      base = `swsh${numStr}.5`;
    } else if (
      numStr.length === 2 &&
      numStr.endsWith("5") &&
      numStr !== "15"
    ) {
      base = `swsh${numStr.slice(0, 1)}.5`;
    } else {
      base = `swsh${numStr}`;
    }

    if (gallery) {
      candidates.push(`${base}${gallery}`);
      candidates.push(base);
    } else {
      candidates.push(base);
      candidates.push(`swsh${numStr}`);
    }
  }

  // Block 4: Special sets (pgo, sm115sv)
  if (raw === "pgo") {
    candidates.push("swsh10.5");
  }
  if (raw === "sm115sv") {
    candidates.push("sma");
  }

  // Block 5: Sub-special SV sets (zsv10pt5, rsv10pt5)
  if (raw === "zsv10pt5") {
    candidates.push("sv10.5b");
  }
  if (raw === "rsv10pt5") {
    candidates.push("sv10.5w");
  }

  // Block 6: Sun & Moon (sm) era: ^sm(\d+)$
  const smMatch = raw.match(/^sm(\d+)$/);
  if (smMatch?.[1]) {
    const numStr = smMatch[1];
    if (
      numStr.endsWith("5") &&
      numStr !== "5" &&
      numStr !== "15"
    ) {
      const leading = numStr.slice(0, -1);
      candidates.push(`sm${leading}.5`);
    }
    candidates.push(`sm${numStr}`);
  }

  // Block 7: McDonald's sets: ^mcd(\d{2})$
  const mcdMatch = raw.match(/^mcd(\d{2})$/);
  if (mcdMatch?.[1]) {
    const yy = mcdMatch[1];
    const year = 2000 + Number.parseInt(yy, 10);
    const era = year <= 2022 ? "swsh" : "sv";
    candidates.push(`${year}${era}`);
    candidates.push(`mcd${yy}`);
    candidates.push(String(year));
  }

  // Block 8: cel25c -> cel25cc
  if (raw === "cel25c") {
    candidates.push("cel25cc");
  }

  // Block 9: ^(sm\d+|swsh\d+)sv$ -> first candidate of base id
  const gallerySvMatch = raw.match(/^(sm\d+|swsh\d+)sv$/);
  if (gallerySvMatch?.[1]) {
    const [firstBaseCandidate] = setIdCandidates(gallerySvMatch[1], overrides);
    if (firstBaseCandidate !== undefined) {
      candidates.push(firstBaseCandidate);
    }
  }

  // Block 10: svp, sve preserved
  if (raw === "svp" || raw === "sve") {
    candidates.push(raw);
  }

  // Block 11: Fallbacks — only when no earlier block produced a candidate.
  if (candidates.length === 0) {
    candidates.push(raw);
    if (raw.includes("pt5")) {
      candidates.push(raw.replace(/pt5/g, ".5"));
    }
  }

  // Deduplication preserving order (BR-S02.T04-01)
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      deduped.push(c);
    }
  }

  return deduped;
}

/**
 * Resolves canonical set ID against known TCGdex set IDs.
 * BR-S02.T04-03.
 */
export function resolveTcgdexSet(
  ptcgSetId: string,
  known: ReadonlySet<string>,
  overrides?: Overrides
): string | null {
  const candidates = setIdCandidates(ptcgSetId, overrides);
  for (const candidate of candidates) {
    if (known.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Checks for a manual card override.
 */
export function cardOverride(
  ptcgCardId: string,
  overrides?: Overrides
): string | undefined {
  return overrides?.cards[ptcgCardId];
}

/**
 * Matches canonical cards to TCGdex brief cards.
 * BR-S02.T04-05, BR-S02.T04-06, BR-S02.T04-07.
 */
export function matchCards(
  ptcg: CanonicalCard[],
  brief: BriefCard[],
  overrides?: Overrides
): MatchResult {
  const matches = new Map<string, string>();
  const unmatched: CanonicalCard[] = [];
  let byOverride = 0;
  let byNumber = 0;
  let byName = 0;
  const ambiguous: string[] = [];

  const takenTcgdexIds = new Set<string>();
  const remainingCanonical: CanonicalCard[] = [];

  // Step 1: Overrides
  for (const card of ptcg) {
    const ov = cardOverride(card.id, overrides);
    if (ov !== undefined) {
      matches.set(card.id, ov);
      takenTcgdexIds.add(ov);
      byOverride++;
    } else {
      remainingCanonical.push(card);
    }
  }

  // Step 2 & 3: Match by normNumber
  // Build index: normNumber(localId) -> BriefCard[]
  const briefByNum = new Map<string, BriefCard[]>();
  for (const b of brief) {
    const key = normNumber(b.localId);
    let arr = briefByNum.get(key);
    if (!arr) {
      arr = [];
      briefByNum.set(key, arr);
    }
    arr.push(b);
  }

  const postNumberCanonical: CanonicalCard[] = [];

  for (const card of remainingCanonical) {
    const numKey = normNumber(card.number);
    const candidates = briefByNum.get(numKey);

    const [firstCandidate] = candidates ?? [];
    if (candidates && firstCandidate) {
      if (candidates.length === 1) {
        // Unique candidate by number
        matches.set(card.id, firstCandidate.id);
        takenTcgdexIds.add(firstCandidate.id);
        byNumber++;
      } else {
        // Multiple candidates: tie-break by exact lowercase trimmed name
        const cardName = card.name.trim().toLowerCase();
        const exactMatch = candidates.find(
          (c) => c.name.trim().toLowerCase() === cardName
        );

        if (exactMatch) {
          matches.set(card.id, exactMatch.id);
          takenTcgdexIds.add(exactMatch.id);
          byNumber++;
        } else {
          // Unresolvable collision: take the first, record as ambiguous
          matches.set(card.id, firstCandidate.id);
          takenTcgdexIds.add(firstCandidate.id);
          byNumber++;
          ambiguous.push(card.id);
        }
      }
    } else {
      postNumberCanonical.push(card);
    }
  }

  // Step 4: Leftovers -> Name fallback over unclaimed briefs
  // Only fires when normalized name is unique on BOTH sides (BR-S02.T04-06)
  const unclaimedBriefs = brief.filter((b) => !takenTcgdexIds.has(b.id));

  // Count names on canonical side across ALL canonical cards in the set (ptcg)
  const ptcgNameCounts = new Map<string, number>();
  for (const c of ptcg) {
    const norm = c.name.trim().toLowerCase();
    ptcgNameCounts.set(norm, (ptcgNameCounts.get(norm) ?? 0) + 1);
  }

  // Group unclaimed briefs by lowercase trimmed name
  const briefByName = new Map<string, BriefCard[]>();
  for (const b of unclaimedBriefs) {
    const norm = b.name.trim().toLowerCase();
    let arr = briefByName.get(norm);
    if (!arr) {
      arr = [];
      briefByName.set(norm, arr);
    }
    arr.push(b);
  }

  for (const card of postNumberCanonical) {
    const norm = card.name.trim().toLowerCase();
    const countInPtcg = ptcgNameCounts.get(norm) ?? 0;
    const nameCandidates = briefByName.get(norm);

    const [firstNameCandidate] = nameCandidates ?? [];
    if (countInPtcg === 1 && nameCandidates?.length === 1 && firstNameCandidate) {
      const tcgdexCard = firstNameCandidate;
      if (!takenTcgdexIds.has(tcgdexCard.id)) {
        matches.set(card.id, tcgdexCard.id);
        takenTcgdexIds.add(tcgdexCard.id);
        byName++;
        continue;
      }
    }

    // Step 5: Unmatched
    unmatched.push(card);
  }

  return {
    matches,
    unmatched,
    byNumber,
    byName,
    byOverride,
    ambiguous,
  };
}
