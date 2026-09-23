Act as a Principal Software Architect and Technical Lead. Your goal is to gather complete context across all relevant project specifications and codebase files to build an exhaustive, self-contained implementation prompt for a specific subtask.

SUBTASK IDENTIFIER: {{TASK_ID}} (e.g., S01.T01)
PRIMARY SPECIFICATION FILE: {{PATH_TO_SPEC_FILE}} (e.g., docs/stages/01-foundation/T01-monorepo-skeleton.md)

Instructions:
1. Read the primary specification file using the filesystem tools.
2. Cross-reference and READ ALL related documentation files needed to understand the full context (architecture overviews, conventions, parent stage READMEs, data models, and existing workspace files).
3. Check what has already been partially implemented in the workspace to identify gaps, misconfigurations, or missing files.
4. Synthesize all gathered knowledge into a single, fully self-contained, isolated prompt.

OUTPUT FORMAT:
Generate ONLY a single markdown codeblock containing a master prompt ready to be pasted into a new, blank chat session for the coding agent. The prompt must be structured as follows:

```markdown
Act as a Senior Developer executing subtask {{TASK_ID}}. Below is the complete, self-contained specification and context required for implementation. You do NOT need to read additional documentation files.

### 1. Subtask Objective & Context
[Inject detailed context, subtask number, dependencies, and business goals here]

### 2. Target Files & Directory Tree
[Inject exact relative paths of files to create, modify, clean up, or delete]

### 3. Detailed Technical Requirements & Contracts
[Inject exact parameters, types, interfaces, environment variables, boundary guards, and validation rules]

### 4. TDD Test Scenarios (RED Phase)
[Inject complete list of required test assertions, edge cases, and schema parity checks]

### 5. Architectural & Coding Constraints
[Inject conventions, error handling rules, compiler flags, and workspace standards]