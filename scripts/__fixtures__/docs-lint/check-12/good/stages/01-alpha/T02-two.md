# S01.T02 — Two

| Field | Value |
|---|---|
| Stage | S01 — Alpha |
| Status | TODO |
| Order in stage | 2 / 2 |
| Depends on | [S01.T01](T01-one.md) |
| Unblocks | — |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` one — the first module — from [S01.T01](T01-one.md)

## Outputs (proposed)
- `module` two — the second module — consumed by —

## Initial objective
The two module exists and is covered by a test.

## Context
Fixture file for the docs lint test suite. It follows template v2 from the conventions and is otherwise meaningless. See [the checks](../../project/08-conventions.md#consistency-checks-docs-lint-s01t10), [S01.T01](T01-one.md#inputs-required), [the web](https://example.org/x) and [mail](mailto:someone@example.org).

## Scope
- In scope: the two module.
- Out of scope: everything else.

## Business rules
| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-01 | The first legacy rule, kept. | `two.ts` | `two.spec.ts` |
| BR-S01.T02-01 | The second module re-exports the first. | `two.ts` | `two.spec.ts` |

## Data operations
No database, no endpoint.

## Interfaces
`two(): number`

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
