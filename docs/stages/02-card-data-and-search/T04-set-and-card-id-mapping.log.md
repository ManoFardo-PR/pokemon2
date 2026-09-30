# S02.T04 — Execution log

| Field | Value |
|---|---|
| **Status** | `COMPLETED` |
| **Completion Date** | 2026-09-30 |
| **Subtask ID** | S02.T04 |
| **Test Status** | `PASSED` — 162/162 in `@pokesearch/etl` (24 for this subtask) |
| **Spec** | [T04-set-and-card-id-mapping.md](T04-set-and-card-id-mapping.md) |

## Files created / modified

| Path | Change |
|---|---|
| `packages/etl/src/idmap.ts` | GREEN implementation — pure module: `normNumber`, `setIdCandidates` (blocks 0–11), `resolveTcgdexSet`, `cardOverride`, `matchCards`, `OverridesSchema` |
| `packages/etl/src/idmap.spec.ts` | RED suite (ported from `pokemon/tests/test_idmap.py`); one indexed-access guard added for `noUncheckedIndexedAccess` |
| `packages/etl/src/idmap-io.ts` | New — the impure half: `loadOverrides`, `writeUnmatchedReports`, `renderUnmatchedSetsCsv`, `renderUnmatchedCardsCsv`, `OverridesError` |
| `packages/etl/src/idmap-io.spec.ts` | New — 11 specs for override loading, RFC 4180 quoting, row order, determinism |
| `packages/etl/idmap-overrides.json` | New — ships as `{ "sets": {}, "cards": {} }` |
| `packages/etl/idmap-overrides.md` | New — the companion that documents every override and the six deliberately-unmatched `cel25c` alt-arts |
| `packages/etl/src/index.ts` | Re-exports `./idmap.js` and `./idmap-io.js` |

## Verification

- `pnpm --filter @pokesearch/etl test` — 9 files, 162 tests, all passing.
- `pnpm --filter @pokesearch/etl typecheck` — clean under `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`.
- `pnpm --filter @pokesearch/etl lint` — clean.
- `grep -R "node:fs\|undici" packages/etl/src/idmap.ts` — no match; the module is pure and browser-testable, as the spec requires. All I/O lives in `idmap-io.ts`.

## Business rules

| Rule | Covered by |
|---|---|
| BR-S02.T04-01 | dedupe-preserving-order pass; `candidates are deduped and stable`; byte-identical report rewrite |
| BR-S02.T04-02 | early return in `setIdCandidates`; `set override short-circuits the heuristics` |
| BR-S02.T04-03 | `resolveTcgdexSet`; `unknown set resolves to null and is reported` |
| BR-S02.T04-04 | single regex `^([a-z-]*)0*(\d+)([a-z]*)$`; the `normNumber` table |
| BR-S02.T04-05 | `takenTcgdexIds` set; `name fallback never reuses a claimed tcgdex id` |
| BR-S02.T04-06 | both-sides-unique guard; `duplicate name on the canonical side stays unmatched` (`cel25c` fixture) |
| BR-S02.T04-07 | multi-candidate branch; the name tie-break and the ambiguous-collision specs |
| BR-S02.T04-08 | `writeUnmatchedReports` + the render specs (header always present, null set id, ordering) |
| BR-S02.T04-09 | `OverridesSchema` in `loadOverrides`; malformed file throws with the offending path |

## Fixes applied during GREEN

1. **Block 11 fired unconditionally.** The fallback appended the raw id after every other block, so `me2pt5` produced `["me02.5", "me2.5", "me2pt5"]`. It is now gated on an empty candidate list, which is what the ported assertions and the legacy behaviour require (4 failing specs → passing).
2. **`z.record` with one argument.** Zod v4 needs an explicit key type; the one-arg form inferred `any` and tripped `no-unsafe-return`. Now `z.record(z.string(), …)`.
3. **`noUncheckedIndexedAccess`.** Regex groups and array heads are guarded at their use site rather than asserted.

## Deferred (out of this subtask's reach)

Implementation steps 8 and 9 of the spec — wiring the mapping into the load orchestrator and running it against the full cache to compare with the legacy baseline (0 unmatched sets, 6 unmatched cards) — need the loader from [S02.T06](T06-load-cards.md), which does not exist yet. The pure module, the reports writer and the override file are all in place for it. **No baseline numbers have been recorded in `packages/etl/README.md`, because no full run has happened.**
