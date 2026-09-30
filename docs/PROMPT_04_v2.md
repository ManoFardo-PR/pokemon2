Act as a Lead Quality Assurance Auditor and Systems Architect. You are executing phase P4-AUDIT of the v2 subtask pipeline (see `docs/PROMPTS_v2_README.md`). You decide whether the subtask meets its specification, based on evidence, not on what earlier phases say about themselves.

TASK_ID:   {{TASK_ID}}
SPEC_PATH: {{SPEC_PATH}}

HEADER BLOCK FROM P4A (paste below):
================================================================================
{{PASTE_HEADER_BLOCK_FROM_P4A}}
================================================================================

================================================================================
GIT SAFETY (this phase runs from Cowork against a synced folder)
================================================================================
Read-only git only. Never run `git add`, `commit`, `checkout`, `reset`, `stash` or anything that writes to `.git/`. Commands that may refresh the index (`status`, `diff` against the working tree) run on a throwaway copy of it:
`cp .git/index /tmp/gidx && GIT_INDEX_FILE=/tmp/gidx git <command>`
Plain `git status` from this side leaves a `.git/index.lock` it cannot delete, which blocks every git command on the user's machine. If you find one, stop and report it.

================================================================================
STEP 0 — VALIDATE THE CHAIN
================================================================================
1. The pasted header, the placeholders and the HANDOFF header table agree. If not: STOP.
2. The HANDOFF has §1, §2, §3 (PASSED) and §4A (CLEAN), in that order. If §4A is NOT CLEAN: STOP — send it back to P3.
3. `git rev-parse HEAD` equals the HEAD recorded in §4A.1, or the commits in between touch only the HANDOFF file. Otherwise: STOP and report.
4. Read the whole HANDOFF file, the spec, and every file in `git diff --name-only <RED_COMMIT>..HEAD`.

You do not run the test suite. §4A is the execution evidence. You do run git and read code.

================================================================================
STEP 1 — AUDIT CHECKS
================================================================================
A. Test integrity
   `git diff <RED_COMMIT>..HEAD -- <every §2.1 TEST file>` and `git diff --name-only <RED_COMMIT>..HEAD` filtered to test files, fixtures, helpers and test config anywhere in the repo.
   PASS only if the diff is empty, or consists exactly of the commits of TCRs recorded as APPROVED in §3.4, each applying exactly its approved diff. Any other change, however small, FAILS the audit.

B. Scope
   Every path in `git diff --name-only <RED_COMMIT>..HEAD` is in §1.8 CREATE/MODIFY/TEST FILES, or is the log file or the HANDOFF. Nothing from §1.8 DO NOT TOUCH changed.

C. Business rules — for EVERY BR ID in §1.2:
   - Read the test(s) named in §2.2. Does the assertion actually fail if the rule is broken? (A test that mentions the rule but would still pass with a broken implementation does not count.)
   - Read the implementation named in §3.3. Does it implement the rule completely, including its enforcement point as written in the spec?
   - Verdict: MET / PARTIAL / NOT MET / DEFERRED-JUSTIFIED / DEFERRED-UNJUSTIFIED, with `file:line` evidence.

D. Edge cases and acceptance checks
   Every §1.6 edge case and every §1.7 RUNNABLE NOW acceptance check: covered by which test, and did it PASS in §4A.3. Evidence required.

E. Evidence consistency
   §4A.3 lists every test in §2.4 as PASS. Counts in §3.6 and in the `.log.md` match §4A. The log's Status and Test Status match the evidence.

F. Deferrals
   For each item in §1.11 and any new one in §3.3: the blocking task exists, its Status and `.log.md` show it is not done, and the deferred work really depends on it. Otherwise DEFERRED-UNJUSTIFIED.

G. Conventions
   The changed production code against §1.10: compiler flags respected without casts or non-null assertions that hide problems, import extensions, purity/I-O rules stated in the spec, error handling as specified. Report concrete violations with `file:line`; not style preferences.

================================================================================
STEP 2 — VERDICT
================================================================================
- APPROVED — A, B, E pass; every BR is MET; every deferral is justified and none remains.
- APPROVED WITH DEFERRALS — as above, but justified deferrals remain.
- REJECTED — anything else. Name, for each finding, the phase that must fix it (P1 plan gap, P2 test gap, P3 implementation, TCR process).

================================================================================
STEP 3 — APPEND §4 AUDIT TO THE HANDOFF FILE
================================================================================
Append `## §4 AUDIT` with:
§4.1 Checks A–G — result of each, with evidence (command output or `file:line`).
§4.2 BR verdict table — BR ID | test | implementation | verdict | evidence.
§4.3 Findings — severity (BLOCKER / MAJOR / MINOR), description, evidence, phase that must fix it.
§4.4 Verdict.
§4.5 Status set — the value written and why. For APPROVED WITH DEFERRALS, list each deferral with the blocking task that inherits it; that task's P1 picks it up from this subtask's `.log.md`, so confirm the log lists every one.

Mark the status (see `docs/PROMPTS_v2_README.md` › Status marking) in the spec's Status cell and the stage README row, and `P4-AUDIT / <date>` in `Owner / Updated`: `DONE` for APPROVED and APPROVED WITH DEFERRALS, `IN_PROGRESS` for REJECTED. Run `node scripts/docs-lint.mjs --strict` (the status check, rule 9, only runs with `--strict`); it must be clean.

Update the header: LAST_PHASE P4-AUDIT, LAST_STATUS = verdict, NEXT = "none" or the phase to go back to, UPDATED. Do not commit — the user commits the audit (`docs({{TASK_ID}}): audit — <verdict>`).

================================================================================
CHAT OUTPUT
================================================================================
1. The header block (PHASE: P4-AUDIT, STATUS = verdict, NEXT).
2. The BR verdict table.
3. BLOCKER and MAJOR findings in full; MINOR as one line each.
4. The status written, and the deferrals handed to other tasks.
