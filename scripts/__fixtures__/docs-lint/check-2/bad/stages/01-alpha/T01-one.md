# S01.T01 — One

| Field | Value |
|---|---|
| Stage | S01 — Alpha |
| Status | TODO |
| Order in stage | 1 / 2 |
| Depends on | — |
| Unblocks | [S01.T02](T02-two.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `doc` conventions — the template every file follows — from `project/08-conventions.md`

## Outputs (proposed)
- `module` one — the first module — consumed by [S01.T02](T02-two.md), [S02.T01](../02-beta/T01-three.md)

## Initial objective
The one module exists and is covered by a test.

## Context
Fixture file for the docs lint test suite. It follows template v2 from the conventions and is otherwise meaningless.

## Scope
- In scope: the one module.
- Out of scope: everything else.

## Business rules
| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T01-01 | The first module exports exactly one function. | `one.ts` | `one.spec.ts` |

## Data operations
No database, no endpoint.

## Interfaces
`one(): number`

## Implementation steps
1. Write the module.
2. Write the test.

## Edge cases and error handling
- The module is imported twice → the second import is a no-op.

## Acceptance / verification
- [ ] `pnpm test` → the module test passes.
- [ ] `pnpm typecheck` → no errors.
- [ ] `pnpm lint` → no errors.
- [ ] The module exports exactly one function.
- [ ] The function returns a number.

## Risks and open questions
- Risk — none. Mitigation: none needed.

## References
- [Conventions](../../project/08-conventions.md) — the template.

---
Context docs: [Business rules traceability](../../project/05-business-rules-traceability.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
