Act as a Build and Release Engineer. You are executing phase P4A-VERIFY of the v2 subtask pipeline (see `docs/PROMPTS_v2_README.md`), in a FRESH session with no memory of the implementation. Your job is to collect evidence, not to judge or repair the implementation.

TASK_ID:   {{TASK_ID}}
SPEC_PATH: {{SPEC_PATH}}

HEADER BLOCK FROM P3 (paste below):
================================================================================
{{PASTE_HEADER_BLOCK_FROM_P3}}
================================================================================

================================================================================
STEP 0 — VALIDATE THE CHAIN
================================================================================
1. The pasted header, the placeholders and the HANDOFF header table agree on TASK_ID, SPEC, HANDOFF, RED_COMMIT and GREEN_COMMIT. If not: STOP.
2. The latest §3 GREEN section has status PASSED. If not: STOP — there is nothing to verify.
3. Read §1.8, §1.10, §2.4 and the latest §3. Do not read the implementation to form opinions about it.

================================================================================
STEP 0b — PRE-FLIGHT COMMIT
================================================================================
Run `git status --porcelain`. Commit pending pipeline output (any `docs/**` file, handoffs, logs, prompt files, files named in a handoff's "Post-audit fixes" table) on its own as `chore(pipeline): commit pending pipeline output before {{TASK_ID}} P4A`. Ignore line-ending-only changes. Anything else: do not touch, list it in §4A.1. The user must not commit while this phase runs.

================================================================================
STEP 1 — COLLECT EVIDENCE
================================================================================
Run each command below and keep its raw output.

Repository state:
- `git rev-parse HEAD`
- `git status --porcelain`
- `git log --oneline <RED_COMMIT>~1..HEAD`
- `git diff --stat <RED_COMMIT>..HEAD`
- `git diff --name-only <RED_COMMIT>..HEAD`

Checks (full workspace):
- `pnpm check` (typecheck, lint, sql-lint, notice-lint, schema:check, test — per `package.json`). Keep only its summary lines and any failure in full.
- `pnpm build`
- `node scripts/docs-lint.mjs --strict`
- `pnpm vitest run <every test file in §2.1> --reporter=verbose` — so each test name from §2.4 appears in the output with its result.

================================================================================
STEP 2 — WHAT YOU MAY FIX
================================================================================
Only mechanical problems, and only in production files listed in §1.8 CREATE/MODIFY:
- formatting;
- lint rules that `eslint --fix` resolves automatically without changing behavior.

You must NOT touch any test file, fixture, test helper or test config, and must not change logic, types, signatures or error handling in any file.

If you applied a mechanical fix: commit it alone as `style({{TASK_ID}}): <what>`, then re-run STEP 1 completely and keep only the re-run output.

Anything else that fails — a test, a type error, a lint rule that needs a code change, a docs-lint error — is NOT yours to fix. Record it and set the verdict NOT CLEAN; it goes back to P3.

================================================================================
STEP 3 — APPEND §4A VERIFY TO THE HANDOFF FILE
================================================================================
Append `## §4A VERIFY` (or `— run N`) with:
§4A.1 Repository state — the git command outputs VERBATIM. Flag any uncommitted change.
§4A.2 Check results — for each command: exit code, summary lines VERBATIM, and every failure in full VERBATIM. No passing-test listings except §4A.3.
§4A.3 Expected tests — every test in §2.4 with its result from the verbose run: PASS / FAIL / NOT FOUND, one line each (do not paste the raw verbose output).
§4A.4 Fixes applied — each with its commit hash, or "none".
§4A.5 Verdict — CLEAN only if every command exited 0, every §2.4 test is PASS, and `git status` is clean; otherwise NOT CLEAN with the list of reasons. State facts only; no assessment of code quality or rule coverage.

Mark the status (see `docs/PROMPTS_v2_README.md` › Status marking): Status stays `IN_PROGRESS`; `P4A-VERIFY / <date>` in the spec's `Owner / Updated`.

Update the header: LAST_PHASE P4A-VERIFY, LAST_STATUS CLEAN or NOT CLEAN, NEXT P4-AUDIT (if CLEAN) or P3-GREEN (if NOT CLEAN), UPDATED.
Commit the HANDOFF file and the spec alone as `docs({{TASK_ID}}): verification evidence`.

================================================================================
CHAT OUTPUT
================================================================================
1. The header block (PHASE: P4A-VERIFY, STATUS, NEXT, BASE_COMMIT, RED_COMMIT, GREEN_COMMIT).
2. Exit code of each command.
3. If NOT CLEAN: every failure, in full.
