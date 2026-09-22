# S05.T02 — Effect texts and card parts derivation

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 2 / 16 |
| Depends on | [S02.T06](../02-card-data-and-search/T06-load-cards.md), [S05.T01](T01-rules-schema-migration.md) |
| Unblocks | [S05.T08](T08-spreadsheet-import.md) |
| Parallel with | [S05.T04](T04-ir-compiler-and-vm.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` `cards` (`rules_json`, supertype), `attacks`, `abilities` and `norm()` — from [S02.T06](../02-card-data-and-search/T06-load-cards.md)
- `table` `effect_texts`, `card_parts` — from [S05.T01](T01-rules-schema-migration.md)

## Outputs (proposed)
- `module` `packages/db/src/rules/texts.ts` — `textHash(kind, name, text)` = SHA-256 of `kind | norm(name) | normText(text)` (whitespace collapsed, curly quotes straightened, diacritics kept in card names inside text); `rebuildCardParts(db)` (idempotent, runs after every ETL load) — consumed by [S05.T08](T08-spreadsheet-import.md)
- `table` `effect_texts` (~1,100 distinct texts for Standard, ~5–6k for all sets) and `card_parts` populated
- `contract` part kinds: `ability` (idx = abilities.idx), `attack` (only attacks with non-empty text), `trainer` (rules text of Items/Supporters/Stadiums/Tools), `energy` (Special Energy text), `rule_box` (ex/V/Tera/ACE SPEC boilerplate — recorded but excluded from coverage)

## Initial objective
Reprints that share the same wording share one effect text (and thus one code sequence), while printings with different wording are different texts — RN-05 by construction, with no per-card duplication of rules.

## Summary
- Signature check for reprints: same name and same attack/ability names → same hashes automatically; a differing text yields a new hash and shows up as uncovered.
- Boilerplate rule-box sentences are classified once as `rule_box` so they never count against coverage.

## Acceptance / verification
- [ ] Two printings of the same card with identical text share `text_hash`; the two legacy Dunsparce printings (Trading Places vs Dig) get different hashes.
- [ ] `rebuildCardParts` twice → identical rows.

## Notes for the elaboration pass
- Legacy fact: 1.4 % of meta copies were Pokémon whose printing text differed from the implemented one while coverage counted by name (ESPECIFICACAO.md §6.1) — this subtask closes that gap.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
