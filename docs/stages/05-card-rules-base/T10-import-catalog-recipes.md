# S05.T10 — Import legacy catalog recipes (262 recipes)

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 10 / 16 |
| Depends on | [S05.T07](T07-rule-codes-composition-semantics.md) |
| Unblocks | — |
| Parallel with | [S05.T08](T08-spreadsheet-import.md), [S05.T09](T09-import-attack-effects-json.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `doc` composition contract — from [S05.T07](T07-rule-codes-composition-semantics.md)
- `file` `pokemon/src/pokesearch/sim/catalog.py` (262 hand-written recipes over `effects.py` primitives, ~25 lambda shapes) and `cardfilters.py`

## Outputs (proposed)
- `script` `scripts/rules/export-catalog.py` (Python, runs in the legacy venv, `ast`-based) → `catalog_recipes.json`; `pnpm rules:import-catalog` → codes + params per `text_hash` with provenance `import:catalog`; hand-written table `lambda_map.json` translating the ~25 lambda shapes (`_active_ex`, `_attacker_type`, `F.named(lambda s,t,st: …)`, `Require(lambda ctx: …)`) into IR conditions
- `file` report of recipes that could not be mapped (kept as `draft` with the Python source in `notes`)

## Initial objective
The 262 recipes the user wrote by hand for the legacy simulator — Items, Supporters, Tools, Stadiums, Special Energies and abilities — seed the codes for the most-played trainers without re-reading every card.

## Summary
- Recipes are matched to the current printing texts; `approx=True` notes become `approx_note`.
- Where a recipe covers a whole text with one primitive, one code is created; `Seq(...)` becomes a code sequence.

## Acceptance / verification
- [ ] ≥ 220 of 262 recipes imported as non-draft codes; the remainder reported.

## Notes for the elaboration pass
- Legacy reference: `catalog.py` lines 40–520; the comments there explain rulings worth carrying into `notes`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
