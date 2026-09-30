# S02.T04 — Execution log

| Field | Value |
|---|---|
| **Status** | `COMPLETED` |
| **Completion Date** | 2026-09-30 |
| **Subtask ID** | S02.T04 |
| **Test Status** | `PASSED` — 168/168 in `@pokesearch/etl` (53 for this subtask: 42 in `idmap.spec.ts`, 11 in `idmap-io.spec.ts`) |
| **Spec** | [T04-set-and-card-id-mapping.md](T04-set-and-card-id-mapping.md) |

## Files created / modified

| Path | Change |
|---|---|
| `packages/etl/src/idmap.ts` | GREEN implementation — pure module: `normNumber`, `setIdCandidates` (blocks 0–11), `resolveTcgdexSet`, `cardOverride`, `matchCards`, `OverridesSchema` |
| `packages/etl/src/idmap.spec.ts` | RED suite (ported from `pokemon/tests/test_idmap.py`); one indexed-access guard added for `noUncheckedIndexedAccess`; six over-tight assertions relaxed and six specs added during the audit response below |
| `packages/etl/src/idmap-io.ts` | New — the impure half: `loadOverrides`, `writeUnmatchedReports`, `renderUnmatchedSetsCsv`, `renderUnmatchedCardsCsv`, `OverridesError` |
| `packages/etl/src/idmap-io.spec.ts` | New — 11 specs for override loading, RFC 4180 quoting, row order, determinism |
| `packages/etl/idmap-overrides.json` | New — ships as `{ "sets": {}, "cards": {} }` |
| `packages/etl/idmap-overrides.md` | New — the companion that documents every override and the six deliberately-unmatched `cel25c` alt-arts |
| `packages/etl/src/index.ts` | Re-exports `./idmap.js` and `./idmap-io.js` |

## Verification

- `pnpm --filter @pokesearch/etl test` — 9 files, 168 tests, all passing.
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

1. **`z.record` with one argument.** Zod v4 needs an explicit key type; the one-arg form inferred `any` and tripped `no-unsafe-return`. Now `z.record(z.string(), …)`.
2. **`noUncheckedIndexedAccess`.** Regex groups and array heads are guarded at their use site rather than asserted.

## Audit response (post-implementation review)

An audit against `pokemon/src/pokesearch/etl/idmap.py` found four divergences from
the legacy this subtask ports. All four are fixed; each is pinned by a new spec.

1. **The name fallback counted names over the wrong population.** It counted
   normalized names across *every* canonical card in the set; the legacy counts
   them across `pending` — only the cards that survived number matching. A name
   whose first printing matched by number blocked its remaining printing from
   ever matching, which is strictly more conservative than the legacy and would
   have made the first full run report more than the baseline six unmatched
   cards, against a gate that allows ten. Now counted over
   `postNumberCanonical`. Pinned by `counts names over the pending cards, not the
   whole set`. The `cel25c` alt-art case stays unmatched, because both of its
   printings are pending — which is the behaviour BR-S02.T04-06 describes.

2. **Block 11 had been narrowed, and that was the wrong call.** During GREEN the
   fallback was gated on an empty candidate list to satisfy four `toEqual`
   assertions on whole candidate lists. Those assertions were a tightening
   introduced in the RED phase, not a port: `test_idmap.py` pins `[0]` (and
   `[:2]` for `swsh9tg`), the legacy appends `[s, _pt5(s)]` unconditionally, and
   this spec says in as many words that *"each block appends; the list is deduped
   at the end, so an earlier block wins"*. The gating silently dropped the raw-id
   tail — `pgo` became `["swsh10.5"]` instead of `["swsh10.5", "pgo"]` — which
   narrows resolution against a "zero unmatched sets" gate. **Decision: the
   unconditional tail is restored and the six over-tight assertions now pin the
   documented leading pair via `.slice(0, 2)`**, because the spec and the legacy
   agree with each other and the RED assertions agreed with neither. A new spec,
   `keeps the raw id as the fallback tail`, pins the tail so it cannot be dropped
   again.

3. **A canonical id repeated in one set file overwrote its first match.** The
   spec's edge case says the first wins and the duplicate is counted in
   `idmap_ambiguous`; `matches.set` overwrote it and `byNumber` double-counted.
   Now deduped before step 1, with the duplicate pushed to `ambiguous`. Pinned by
   `a canonical id repeated in the source keeps the first and flags it`.

4. **Block 6 excluded `5` and `15` as strings.** The legacy gates on
   `int(n) not in (5, 15)`, so `sm05` yields only `sm05`; the string comparison
   yielded `sm0.5` as well. No such canonical id exists, so this was cosmetic, but
   it is now numeric and faithful. Pinned by `excludes 5 and 15 numerically`.

Two further gaps from the audit are closed: an empty brief array
(`an empty brief leaves every canonical card unmatched`) and a stale override
pointing at a set TCGdex does not have
(`an override pointing at a set TCGdex does not have resolves to null`).

**Deliberately not changed.** Step 2 has no `taken` guard, so two canonical cards
whose numbers normalize equally both claim the same brief id. This is the legacy
behaviour, and BR-S02.T04-05 scopes the at-most-one-claim rule to the name
fallback, where the guard does exist. Adding a guard here would diverge from the
baseline this subtask is measured against.

## Deferred (out of this subtask's reach)

Implementation steps 8 and 9 of the spec — wiring the mapping into the load orchestrator and running it against the full cache to compare with the legacy baseline (0 unmatched sets, 6 unmatched cards) — need the loader from [S02.T06](T06-load-cards.md), which does not exist yet. The pure module, the reports writer and the override file are all in place for it. **No baseline numbers have been recorded in `packages/etl/README.md`, because no full run has happened.**
