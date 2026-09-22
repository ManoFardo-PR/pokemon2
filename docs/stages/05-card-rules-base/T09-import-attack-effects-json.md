# S05.T09 — Import legacy attack effects (412 attacks)

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 9 / 16 |
| Depends on | [S05.T07](T07-rule-codes-composition-semantics.md) |
| Unblocks | — |
| Parallel with | [S05.T08](T08-spreadsheet-import.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `doc` composition contract and code naming — from [S05.T07](T07-rule-codes-composition-semantics.md)
- `file` `pokemon/src/pokesearch/sim/attack_effects.json` (346 cards, 412 attacks: `data.effects[] {op, amount, amount2, condition, coin_then}`, `plus`, `plus_condition`, `plus_per`, `coin_flips`, `nothing_unless`, flags, `unsupported`, `source`)

## Outputs (proposed)
- `script` `pnpm rules:import-attack-effects` — mechanical mapping of the 28 legacy ops and 7 plus-conditions to codes (`SELF_DAMAGE_N`, `COUNTERS_OPP_ACTIVE_N`, `DMG_TO_BENCH_N`, `COND_APPLY_OPPONENT_ACTIVE`, …) with params, keyed by the attack's `text_hash`; provenance kept in `notes` (`import:attack_effects <source>`); `unsupported` entries become `draft` codes
- `file` mapping table `packages/db/seed/legacy/attack_ops_map.json`

## Initial objective
Four hundred attacks already expressed in a closed vocabulary become codes and params in minutes, with their origin (Groq classification vs Twinleaf translation) preserved for the audit trail.

## Summary
- Twinleaf-translated entries rank higher in confidence than LLM-classified ones (RN-62) — recorded in `classification_json`.
- Entries whose text hash no longer exists in the new data (text changed) are reported, not forced.

## Acceptance / verification
- [ ] ≥ 380 of 412 attacks land as `text_codes`; the rest listed with reasons.

## Notes for the elaboration pass
- Legacy reference: `sim/attackops.py` (op list, `MAX_AMOUNT`), `sim/attackgen.py` (how entries were produced).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
