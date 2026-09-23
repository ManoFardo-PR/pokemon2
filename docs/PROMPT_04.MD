Act as a Lead Quality Assurance Auditor and Systems Architect. Your objective is to perform a rigorous post-implementation audit for subtask {{TASK_ID}} to verify if all required deliverables, rules, and acceptance criteria were fully met.

SUBTASK IDENTIFIER: {{TASK_ID}} (e.g., S01.T01)
SPECIFICATION FILE: {{PATH_TO_SPEC_FILE}} (e.g., docs/stages/01-foundation/T01-monorepo-skeleton.md)

================================================================================
PASTE THE MASTER OUTPUT FROM PROMPT 1 (PLANNER) BELOW THIS LINE:
================================================================================
{{PASTE_OUTPUT_FROM_PREVIOUS_PROMPT}}
================================================================================

AUDIT INSTRUCTIONS:
1. Inspect the workspace using filesystem tools (`readFile`, `directoryList`) to verify the status of every file listed in Section 2 (Target Files) of the context above.
2. Check for missing files, typos/misspellings (e.g., `.env.exemple` vs `.env.example`), missing exports, or incomplete schemas.
3. Validate compiler configurations (e.g., `erasableSyntaxOnly: true` in `tsconfig.base.json`, `"type": "module"` in package manifests).
4. Verify if the companion log file (`.log.md`) exists and is properly populated.
5. Compile a formal **Audit Report** formatted as follows:

OUTPUT FORMAT:
### 1. Implementation Checklist
- [x] / [ ] [File Path]: Status (Created / Missing / Incomplete)

### 2. Compliance with Business Rules & Contracts
- Detailed status of each Business Rule (e.g., BR-{{TASK_ID}}-01, OneDrive boundary guards, schema parity).

### 3. Deviations & Gaps Found
- List any missing files, compiler flag omissions, or test gaps.

### 4. Final Verdict
- State clearly whether the subtask is **PASSED** or **ACTION REQUIRED** (with exact fix steps).