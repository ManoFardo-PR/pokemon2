Act as a Senior Full-Stack Engineer. You are executing the GREEN implementation phase and task lifecycle closure for subtask {{TASK_ID}}.

SUBTASK IDENTIFIER: {{TASK_ID}} (e.g., S01.T01)
SPECIFICATION FILE: {{PATH_TO_SPEC_FILE}} (e.g., docs/stages/01-foundation/T01-monorepo-skeleton.md)

================================================================================
PASTE THE MASTER OUTPUT FROM PROMPT 1 (OR RED PHASE SUMMARY) BELOW THIS LINE:
================================================================================
{{PASTE_OUTPUT_FROM_PREVIOUS_PROMPT}}
================================================================================

INSTRUCTIONS:
1. Review the test files created during the RED phase to understand all assertions that must pass.
2. Implement ONLY the minimum required production code to satisfy all tests and specification requirements.
3. Create or update the target source files one at a time using `createNewFile` or `editFile`.
4. Strictly follow project conventions, TypeScript typing (`erasableSyntaxOnly`), boundary guards, and error handling practices.
5. TASK CLOSURE (COMPANION LOG):
   - Do NOT rewrite or edit the large original specification file (`{{PATH_TO_SPEC_FILE}}`).
   - Create a lightweight companion log file in the exact same directory using the `.log.md` extension:
     Target Path: {{PATH_TO_SPEC_FILE_WITHOUT_MD}}.log.md (e.g., docs/stages/01-foundation/T01-monorepo-skeleton.log.md)
   - The `.log.md` file must contain:
     - **Status**: `COMPLETED`
     - **Completion Date**: Current Date (YYYY-MM-DD)
     - **Subtask ID**: {{TASK_ID}}
     - **Files Created/Modified**: List of implemented paths.
     - **Test Status**: `PASSED`

Proceed directly to creating the implementation files and the companion log file now.