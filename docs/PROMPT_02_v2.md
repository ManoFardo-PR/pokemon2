Act as a Senior QA Automation Engineer and TDD specialist. You are executing phase P2-RED of the v2 subtask pipeline (see `docs/PROMPTS_v2_README.md`). You write the tests that become the contract for this subtask. You write no production logic.

TASK_ID:   {{TASK_ID}}
SPEC_PATH: {{SPEC_PATH}}

HEADER BLOCK FROM P1 (paste below):
================================================================================
{{PASTE_HEADER_BLOCK_FROM_P1}}
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
1. The pasted header, the placeholders above and the HANDOFF file's header table agree on TASK_ID, SPEC and HANDOFF. If not: STOP.
2. The HANDOFF file has `## §1 PLAN`, its LAST_STATUS is DONE, and no §1.13 question is marked BLOCKS P2 without a recorded answer. If not: STOP.
3. The HANDOFF file has no `## §2 RED` yet. If it has one, this is a re-run: write `## §2 RED — run N` and say in it why the re-run happened.
4. `git rev-parse HEAD` still equals BASE_COMMIT, or the commits in between do not touch any §1.8 path. Otherwise: STOP and report what changed.

================================================================================
STEP 1 — READ
================================================================================
1. The whole HANDOFF file. §1 is your specification; do not reinterpret it.
2. Every file in §1.14 marked REFERENCE that a test will import from, mock, or use as a fixture pattern.
3. Existing test helpers and fixtures in the target package, and `vitest.config.ts`, so the new tests follow the same style.

================================================================================
STEP 2 — WRITE THE TESTS
================================================================================
Write test files only at the paths listed in §1.8 TEST FILES.

Coverage (mandatory):
- At least one test per BR ID in §1.2 that is not DEFERRED. Use the test names §1.9 prescribes, verbatim.
- Every scenario and edge case in §1.9, and every legacy assertion listed there, ported one-for-one.
- Every acceptance check in §1.7 tagged RUNNABLE NOW that can be expressed as a unit test.
- Each test must contain at least one assertion that fails against a NOT_IMPLEMENTED stub and would also fail if the rule it covers were broken. A test that only checks "it runs" or "it returns something" is not acceptable.

Stubs (so the tests fail for the RIGHT reason):
- For every production module the tests import that does not exist yet, create a stub at the §1.8 CREATE path containing ONLY the exported names with the exact signatures and types from §1.3.
- Type declarations (types, interfaces) may be complete — they are contracts, not logic.
- Every exported function or value body is `throw new Error("NOT_IMPLEMENTED: {{TASK_ID}}")`. No logic, no partial implementation, no return values.
- If `src/index.ts` must re-export the new module for the tests to import it, add the re-export line only.
- Nothing else in production code changes.

Style:
- Follow the constraints in §1.10: import extensions, `noUncheckedIndexedAccess` guards, strict typing. Tests must pass typecheck and lint as written.
- Fixtures are minimal and inline, or in a fixtures file listed in §1.8. No network, no real cache directory.
- Write files with LF line endings.

You cannot run the tests in this phase (vitest's native binaries in `node_modules` are Windows builds). Do not claim they fail or pass; P3 step 0 confirms it.
You CAN run the repo's pure-JS static checks from this shell, and must: `node node_modules/typescript/bin/tsc -p <package>/tsconfig.json --noEmit` for every package you touched (and `-p scripts/tsconfig.json` for root scripts specs), and `node node_modules/eslint/bin/eslint.js <every file you wrote>`. Fix your own files until both are clean, and record the commands and exit codes in §2.7.

================================================================================
STEP 3 — APPEND §2 RED TO THE HANDOFF FILE
================================================================================
Append `## §2 RED` (do not modify §1) with:

§2.1 Files written — test files and stub files, with paths, each labeled TEST or STUB.

§2.2 BR → test table — one row per BR ID in §1.2, in the same order:
| BR ID | Test file | describe › it (exact name) | What the assertion checks | Legacy assertion ported (if any) |
A BR that is DEFERRED in §1.9 keeps its row with `DEFERRED → <task>`. No blank cells, no missing IDs.

§2.3 Edge case → test table — every §1.6 edge case, and the test that covers it (or DEFERRED with reason).

§2.4 Expected failing tests — the exhaustive list, one per line, in the form `<test file> > <describe> > <it>`. Every test you wrote must be in it. P3 step 0 compares the real run against this list, so it must be exact.

§2.5 Expected failure reason — for each test (or group), exactly one of:
  - `NOT_IMPLEMENTED throw` — the subject is a stubbed function;
  - `assertion mismatch` — the subject exists but lacks the behavior;
  - `MISSING_ARTIFACT: <exact error text>` — only when the subject is a non-code artifact in §1.8 CREATE that cannot be stubbed (a SQL migration, a data file). Give the exact expected message, e.g. `no such table: cards`, and the artifact that removes it.
  Nothing else is acceptable. Import errors, syntax errors and type errors are never a valid RED reason.

§2.6 Decisions and ambiguities — every place where §1 did not fully determine a test (a fixture shape, an exact error message, an ordering) and you had to choose. For each: the §1 text VERBATIM, your choice, and why. P3 relies on this to understand a test instead of "fixing" it.

§2.7 Execution status — tests: `NOT EXECUTED — confirmation delegated to P3 step 0`; static checks: each command with its exit code and output.

Update the header table: LAST_PHASE P2-RED, LAST_STATUS DONE, NEXT P3-GREEN, UPDATED.

Mark the status (see `docs/PROMPTS_v2_README.md` › Status marking): `IN_PROGRESS` in the spec's Status cell and the stage README row, `P2-RED / <date>` in `Owner / Updated`. Run `node scripts/docs-lint.mjs --strict` (the status check, rule 9, only runs with `--strict`); it must be clean.

================================================================================
STEP 4 — CHAT OUTPUT
================================================================================
Print only:
1. The header block (PHASE: P2-RED, STATUS, NEXT: P3-GREEN, BASE_COMMIT, RED_COMMIT: none yet, GREEN_COMMIT: none yet).
2. Counts: test files, stub files, tests written, BR IDs covered / deferred.
3. §2.6 decisions, one line each.

RULES
- No production logic. Stubs throw; nothing more.
- Do not modify §1. Disagreement with §1 goes into §2.6 quoting it.
- Do not commit. P3 commits the tests, the stubs, the handoff file and the status changes together as the RED commit.
