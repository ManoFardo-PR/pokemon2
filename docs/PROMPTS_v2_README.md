# Subtask pipeline v2 — how it works

Five prompts, one handoff file per subtask. Every phase reads the handoff file, appends its own section, and never edits a section written by another phase.

| Step | Prompt | Runs in | Writes code? | Commits? |
|---|---|---|---|---|
| 1. PLAN | `PROMPT_01_v2.md` | Claude (Cowork) | no | no |
| 2. RED | `PROMPT_02_v2.md` | Claude (Cowork) | tests + NOT_IMPLEMENTED stubs only | no |
| 3. GREEN | `PROMPT_03_v2.md` | Claude Code | production code | RED commit, GREEN commit |
| 4.A VERIFY | `PROMPT_04A_v2.md` | Claude Code, **fresh session** | mechanical style fixes only | evidence commit |
| 4. AUDIT | `PROMPT_04_v2.md` | Claude (Cowork) | no | no |

## Inputs

Every prompt takes the same two placeholders:

- `{{TASK_ID}}` — e.g. `S02.T04`
- `{{SPEC_PATH}}` — e.g. `docs/stages/02-card-data-and-search/T04-set-and-card-id-mapping.md`

From P2 on, also paste the **header block** printed by the previous phase. Each prompt checks that the block, its placeholders and the handoff file agree, and stops if they don't.

## Handoff file

Path: `docs/stages/<stage-folder>/handoff/<spec-file-name-without-.md>.handoff.md`
Example: `docs/stages/02-card-data-and-search/handoff/T04-set-and-card-id-mapping.handoff.md`

It sits in a `handoff/` subfolder, not beside the spec: `scripts/docs-lint.mjs` treats every `T<nn>-*.md` directly in a stage folder (except `.log.md`) as a subtask spec.

Structure:

```
# Handoff — <TASK_ID>
<header table>          <- the only part every phase updates
## §1 PLAN              <- P1
## §2 RED               <- P2
## §3 GREEN             <- P3   (re-runs: "## §3 GREEN — run 2", appended)
## §4A VERIFY           <- P4A  (re-runs appended the same way)
## §4 AUDIT             <- P4
```

Header table fields: `TASK_ID`, `SPEC`, `HANDOFF`, `LAST_PHASE`, `LAST_STATUS`, `NEXT`, `BASE_COMMIT`, `RED_COMMIT`, `GREEN_COMMIT`, `UPDATED`.

## Header block (printed in chat at the end of every phase)

```
TASK_ID:      S02.T04
SPEC:         docs/stages/02-card-data-and-search/T04-set-and-card-id-mapping.md
HANDOFF:      docs/stages/02-card-data-and-search/handoff/T04-set-and-card-id-mapping.handoff.md
PHASE:        P2-RED
STATUS:       DONE | FAILED | BLOCKED | STOPPED
NEXT:         P3-GREEN
BASE_COMMIT:  <hash>
RED_COMMIT:   <hash or none yet>
GREEN_COMMIT: <hash or none yet>
```

## Status marking in the spec and the stage README

Every phase updates, at its end, the subtask's `Status` cell in the spec header table AND the subtask's row in the stage README (they must match — `docs:lint` rule 9), and writes `<phase> / <YYYY-MM-DD>` in the spec's `Owner / Updated` cell. `Status` only takes the project vocabulary (`TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `DROPPED`); the phase goes in `Owner / Updated`.

| Phase result | Status | Owner / Updated |
|---|---|---|
| P1 DONE | IN_PROGRESS | P1-PLAN / date |
| P1 BLOCKED (blocking open question) | BLOCKED | P1-PLAN / date |
| P1 STOPPED (phase check) | unchanged | unchanged |
| P2 DONE | IN_PROGRESS | P2-RED / date |
| P3 PASSED or FAILED | IN_PROGRESS | P3-GREEN / date |
| P3 BLOCKED (pending TCR) or STOPPED (baseline) | BLOCKED | P3-GREEN / date |
| P4A CLEAN or NOT CLEAN | IN_PROGRESS | P4A-VERIFY / date |
| P4 APPROVED | DONE | P4-AUDIT / date |
| P4 APPROVED WITH DEFERRALS | DONE | P4-AUDIT / date — deferrals are inherited by the blocking task (its P1 reads them from this task's `.log.md`) |
| P4 REJECTED | IN_PROGRESS | P4-AUDIT / date |

After changing statuses, run `node scripts/docs-lint.mjs --strict` (the status check, rule 9, only runs with `--strict`); it must exit clean.

## Non-negotiable rules across all phases

1. **Append-only.** No phase rewrites or summarizes an earlier section. Disagreement with an earlier section is written in your own section, quoting it.
2. **Verbatim vs. notes.** Text copied from the spec, the project docs or code is marked as verbatim and copied exactly. Anything a phase inferred is marked `NOTE (<phase>):`.
3. **Business-rule traceability.** Every `BR-`/`RN-` ID from §1 appears in §2 (tests), §3 (implementation), §4 (verdict). No blanks.
4. **Tests are the contract.** After P2, nobody edits a test file, fixture, test helper or test config without an approved Test Change Request (TCR).
5. **Evidence over claims.** Statuses come from command output pasted verbatim, never from a phase's own assertion.
6. **Line endings.** The repo pins `*.md`, `*.ts`, `*.json`, `*.sql` etc. to LF (`.gitattributes`). Write LF.
7. **Git from Cowork (P1, P2, P4) is read-only**, and index-touching reads use a temp index copy (`cp .git/index /tmp/gidx && GIT_INDEX_FILE=/tmp/gidx git …`). A plain `git status` from the Cowork side leaves a `.git/index.lock` it cannot remove. Only Claude Code (P3, P4A) and the user commit.
8. **Commits.** Only Claude Code commits. P3 and P4A start with a pre-flight commit of pending pipeline output (what P1, P2 and P4 left in the tree) and end with their own commit. The user does not commit while a phase runs.
9. **Context budget.** P3 and P4A never open the spec (the handoff quotes it), use quiet test reporters, and paste only summaries and failures into the handoff.

## Loop-backs

- P3 step 0 fails (unexpected failures, RED test passing, wrong-reason failure) → report → fix upstream (P2 re-run, or fix the unrelated breakage first).
- P3 raises a TCR → you approve or reject in the same Claude Code session → P3 applies only approved diffs, as their own commit, and resumes.
- P4A is NOT CLEAN → back to P3 (new run section).
- P4 REJECTED → back to the phase the audit names.
