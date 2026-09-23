Act as a Senior QA Automation Engineer and TDD Specialist. You are executing the RED phase of Test-Driven Development for subtask {{TASK_ID}}.

SUBTASK IDENTIFIER: {{TASK_ID}} (e.g., S01.T01)
SPECIFICATION FILE: {{PATH_TO_SPEC_FILE}} (e.g., docs/stages/01-foundation/T01-monorepo-skeleton.md)

================================================================================
PASTE THE MASTER OUTPUT FROM PROMPT 1 (PLANNER) BELOW THIS LINE:
================================================================================
{{PASTE_OUTPUT_FROM_PREVIOUS_PROMPT}}
================================================================================

CONSTRAINTS & RULES:
1. Do NOT write or modify any production implementation code in this turn.
2. Create or update ONLY the test files required for this subtask using `createNewFile` or `editFile`.
3. Ensure the test suite strictly covers all assertions, boundary checks, and schema parity tests described in Section 4 of the injected context above.
4. The tests must be fully syntactically valid and executable via the workspace test runner (e.g., `pnpm test`), but they should FAIL gracefully because the production logic is not yet implemented.
5. Keep imports clean, use explicit `.ts` extensions where required by Node 24 runtime rules, and mock external dependencies cleanly.

Proceed to generate and save the test file(s) now.