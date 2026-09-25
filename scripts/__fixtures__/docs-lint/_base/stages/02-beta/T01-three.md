# S02.T01 — Three

| Field | Value |
|---|---|
| Stage | S02 — Beta |
| Status | TODO |
| Order in stage | 1 / 1 |
| Depends on | [S01.T01](../01-alpha/T01-one.md) |
| Unblocks | — |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` one — the first module — from S01.T01

## Outputs (proposed)
- `module` three — the third module

## Initial objective
The three module exists and is covered by a test.

## Context
Fixture file for the docs lint test suite. It follows template v2 from the conventions and is otherwise meaningless.

## Scope
- In scope: the three module.
- Out of scope: everything else.

## Business rules
| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-02 | The second legacy rule, revised. | `three.ts` | `three.spec.ts` |
| BR-S02.T01-01 | The third module depends on the first only. | `three.ts` | `three.spec.ts` |
| BR-S02.T01-02 | The third module has no side effects. | `three.ts` | `three.spec.ts` |

## Data operations
No database, no endpoint.

## Interfaces
`three(): number`

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
