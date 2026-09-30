# `idmap-overrides.json` — manual id mapping exceptions

Companion to `idmap-overrides.json`, which a JSON file cannot hold comments for.
**Every entry in that file must have a one-line row here saying why it exists and
when it can be removed.** An undocumented override is how heuristics rot.

The file ships as `{ "sets": {}, "cards": {} }`: the block heuristics in
`src/idmap.ts` were enough for the whole catalogue, and this is an escape hatch,
not a crutch. Prefer fixing or adding a heuristic block when the pattern is
general; use an override only for a genuine one-off.

## Shape

- `sets` — canonical (pokemon-tcg-data) set id to a TCGdex set id, or to an
  ordered array of candidates tried in turn. An entry replaces the entire
  candidate list: no heuristic block runs for that id (BR-S02.T04-02).
- `cards` — canonical card id to a TCGdex card id. Applied before any number or
  name matching (`matchCards` step 1).

The file is validated against `OverridesSchema` at load time; a malformed file is
a hard error, because silently ignoring a typo would silently change the mapping
(BR-S02.T04-09). A missing file is treated as the empty default.

## Active set overrides

| Canonical set id | TCGdex candidate(s) | Why | Can be removed when |
|---|---|---|---|
| _(none)_ | | | |

## Active card overrides

| Canonical card id | TCGdex card id | Why | Can be removed when |
|---|---|---|---|
| _(none)_ | | | |

## Known unmatched, deliberately not overridden

The six `cel25c` alt-art printings (`cel25c-93_A`, `cel25c-17_A`, `cel25c-54_A`,
`cel25c-97_A`, `cel25c-76_A`, `cel25c-60_A`) end unmatched: Celebrations Classic
Collection numbers differ between the sources (`93` vs `CC…`), so they fall
through to the name fallback, which refuses to guess when the same name occurs
twice on the canonical side (BR-S02.T04-06). Guessing would attach the wrong
price to the wrong printing. They are reported in `idmap_unmatched_cards.csv`,
which is the honest outcome and matches the legacy baseline.
