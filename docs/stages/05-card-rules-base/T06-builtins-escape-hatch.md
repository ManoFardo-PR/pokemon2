# S05.T06 — Builtins escape hatch

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 6 / 16 |
| Depends on | [S05.T04](T04-ir-compiler-and-vm.md) |
| Unblocks | [S05.T07](T07-rule-codes-composition-semantics.md) |
| Parallel with | [S05.T05](T05-continuous-modifiers-and-triggers.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` VM op `builtin{name}` — from [S05.T04](T04-ir-compiler-and-vm.md)

## Outputs (proposed)
- `module` `ptcg-core::ir::builtins` — registry `name → fn(&mut Game, &Frame) → StepResult` for effects the vocabulary cannot express yet (target < 2 % of meta copies), each with a doc comment citing the card text; the list is exported by `ptcg-cli --builtins` so the UI can show it
- `contract` policy: a builtin is a `rule_codes` row with `status = 'builtin'` and `ir_body_json = { builtin: name }`; adding one requires a scenario; when the vocabulary grows to cover it, the code is rewritten in IR and the builtin removed

## Initial objective
The 'rules as data' promise does not force 100 % expressiveness on day one: the long tail can be native code that is still registered, counted and tested like any other code.

## Summary
- Candidates from the legacy approximations: Transformation Tome, Fossil Quarry, Grand Tree, Backtrack Badge (repeat coin flips).

## Acceptance / verification
- [ ] A builtin registered in Rust but missing from `rule_codes` fails a consistency test, and vice versa.

## Notes for the elaboration pass
- Legacy reference: `catalog.py` `approx=True` notes list the effects with no hook.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
