# S04.T02 — Card definition model (DB → CardDef)

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 2 / 18 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S02.T06](../02-card-data-and-search/T06-load-cards.md), [S04.T01](T01-engine-workspace-and-crates.md) |
| Unblocks | [S04.T05](T05-actions-and-legality.md), [S04.T15](T15-worker-job-runner.md), [S06.T02](../06-bots/T02-deck-profile-analysis.md) |
| Parallel with | [S04.T03](T03-game-state-model.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared` (schema export) — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `table` `cards`, `attacks`, `abilities`, `weaknesses`, `resistances` — from [S02.T06](../02-card-data-and-search/T06-load-cards.md)
- `module` `ptcg-core` crate — from [S04.T01](T01-engine-workspace-and-crates.md)

## Outputs (proposed)
- `contract` `CardDef` (zod in `@pokesearch/shared/carddef`, `serde` in `ptcg-core::defs`): `{ def_idx, card_id, name, kind: pokemon|trainer|energy, tags: [ex, v, vstar, mega, tera, ancient, future, radiant, ace_spec, owner:<tag>], stage, evolves_from, hp, types[], weakness[], resistance[], retreat, prize_value, attacks: [{ name, cost: [TypeSlot], damage_printed, damage_mod, program?: ProgramId }], abilities: [{ name, program?: ProgramId, once_per: instance|name|game }], trainer: { subtype: item|supporter|stadium|tool, program? }, energy: { basic: Type } | { provides: [Unit], program? } }` — consumed by [S04.T05](T05-actions-and-legality.md), [S04.T15](T15-worker-job-runner.md), [S06.T02](../06-bots/T02-deck-profile-analysis.md)
- `module` `packages/shared/src/carddef/derive.ts` — `deriveCardDefs(db, cardIds) → CardDef[]` applying `card_overrides` (table arrives in S05; the hook exists now) and parsing the prize value from rule text ('takes N Prize cards', RN-19; fallback by tag) — consumed by [S04.T15](T15-worker-job-runner.md)

## Initial objective
The engine never reads the database: Node derives a compact, validated definition for every card in a job from the card tables, so the engine sees exactly the same facts the card page shows, plus explicit corrections.

## Summary
- `program` fields are `None` in this stage (effect-less engine); S05 fills them with IR program ids.
- Tags are derived from `subtypes_json` and name patterns (owner tags like `team_rocket`, `ns`, `hops`, `lillies`, `ethans`, `cynthias`, `marnies` from `Name's …`).
- Energy units for special energies without a program default to `[{ types: [Colorless] }]` (approximation flagged).
- Evolution line is resolved by exact `evolves_from` name within the deck plus the full chain for Rare Candy.

## Acceptance / verification
- [ ] Round trip TS → JSON → Rust `serde` for 100 random cards without loss; JSON Schema diff between the two sides is empty.
- [ ] Prize value: Charizard ex → 2, Mega ex → 3, VSTAR → 2, regular → 1.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/sim/cardspec.py` (244 lines: `CardSpec`, prize parsing, evolution line) and `engine_fixes.json` (attribute corrections now modelled as `card_overrides`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
