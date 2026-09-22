# Conventions for the execution docs

| Field | Value |
|---|---|
| Doc | project/08 |
| Status | LIVE |
| Inputs | User requirements for the docs tree (2026-09-22): stages → nuclear subtasks, self-contained files, inputs/outputs header, placeholders for status, order and interlocks |
| Outputs | The template, ID scheme, status vocabulary and interlock semantics used by every file under `docs/stages/`; the checks the docs lint (S01.T10) enforces |

## Tree

```
docs/
  README.md                 index, roadmap, cross-stage graph, subtask index
  project/                  context docs (this folder) — self-contained, referenced by every subtask
  stages/<NN-slug>/
    README.md               stage: objective, exit criteria, ordered subtask table, graph, interlocks
    T<nn>-<slug>.md         one nuclear subtask
```

## Identifiers

- Stage: `S01`..`S08`. Subtask: `S04.T07`. File: `T07-<kebab-slug>.md` inside the stage folder.
- IDs are permanent. Renaming a file keeps the ID; add a one-line redirect at the old path if links exist outside the repo.
- New subtask: append the next `Tnn` in its stage (never renumber); if it must run before existing ones, express that with `Depends on`, not by renumbering.

## Subtask file template (v2 — detailed)

The header table, **Inputs**, **Outputs** and **Initial objective** are the interface of the subtask and were fixed when the tree was generated;
they change only through the interlock rules below. Everything from **Context** on is the detailed body every file must have.

```markdown
# S02.T06 — <Title>

| Field | Value |
|---|---|
| Stage | S02 — <Stage name> |
| Status | TODO |
| Order in stage | 6 / 14 |
| Depends on | S02.T04, S02.T05 |
| Unblocks | S02.T07, S02.T08, S03.T04 |
| Parallel with | S02.T10 |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `<kind>` <name> — <what it is> — from S02.T05

## Outputs (proposed)
- `<kind>` <name> — <what it is> — consumed by S02.T07, S03.T04

## Initial objective
<one paragraph: what must be true when this is done>

## Context
<why this subtask exists; where it sits in the data/control flow; what the legacy did and what changes; decisions that constrain it (D-nnn)>

## Scope
- In scope: …
- Out of scope: … (name the subtask that owns each excluded item)

## Business rules
| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-13 | <legacy rule kept, revised or superseded — say which> | <module/function/SQL constraint/UI> | <test, scenario or check> |
| BR-S02.T06-01 | <local rule: a testable statement, present tense> | … | … |

## Data operations
<one of the three forms below, or several when the subtask spans layers>
- **CRUD table** (database subtasks): `| Entity | Operation (C/R/U/D) | Actor (api/worker/etl/user) | When | Constraints & idempotency | Notes |`
- **Endpoint table** (API subtasks): `| Method | Path | Params / body | Response | Errors |`
- **State mutations** (engine subtasks): `| Zone / field | Mutation | When | Invariant |`
- **User actions** (web subtasks): `| Action | UI element | API call | Result / feedback |`

## Interfaces
<signatures, schemas, file formats, CLI commands, environment variables — exact names, types and defaults>

## Implementation steps
1. … (ordered; each step leaves the repo in a working state)

## Edge cases and error handling
- <concrete case → expected behaviour>

## Acceptance / verification
- [ ] <runnable check: command or test name → expected result>

## Risks and open questions
- <risk → mitigation> / <question → who decides, by when>

## References
- Legacy: `pokemon/src/...` — <what to consult it for>; rulebook page; external docs
```

**Kinds** for inputs/outputs: `env` (environment variable), `table` (database table/view/index), `module` (code unit), `contract` (schema/protocol/API shape), `file` (path in the repo or data dir), `script` (pnpm/cargo command), `decision` (D-nnn), `external` (URL, tool, machine fact), `doc` (a document).

**Self-containment rule.** Every input names the subtask that provides it (`from Sxx.Tyy`) or the context doc it comes from; every output names its consumers where known. A reader must be able to execute the subtask from its file plus `docs/project/*` alone. If that is not true, the file is incomplete.

### Business rule IDs

- **`RN-nn`** — legacy rules from `ESPECIFICACAO.md`, resolved in [traceability](05-business-rules-traceability.md). Every RN assigned to a subtask there must appear in that file's Business rules table with its disposition (kept / revised / superseded).
- **`BR-Sxx.Tyy-nn`** — local rules introduced by a subtask (validation, invariants, ordering, limits). Numbered from 01 inside the file; never renumbered; referenced by other files with the full ID. A rule is a testable statement in the present tense ("A deck version stores exactly 60 cards or `validation_json.ok` is false"), not an intention.
- Every rule names its **enforcement point** (a function, SQL constraint, schema, UI guard, engine invariant) and its **verification** (test name, scenario id, or an observable check). A rule without both is incomplete.

### Data operations tables

- Every table, view, endpoint, CLI command or contract that appears in **Outputs** has at least one row in the file's data-operations tables.
- Writers respect the architecture: `etl` writes baseline tables, `api` writes user-facing tables, `worker` writes job/measurement/evidence tables, the **engine never touches the database**. A row that violates this is a defect, not a design choice.
- State idempotency is stated explicitly (upsert key, "delete-then-insert per parent", "insert-only", "no-op when unchanged").

### Sizing

A detailed subtask file runs roughly 700–2,600 words of body. Files that carry full DDL, interface signatures or a protocol definition sit at the
upper end and that is expected; shorter is fine for genuinely small tasks provided every section is substantive. Past ~2,600 words, check whether the
subtask is really two (propose the split in Risks and open questions — never renumber IDs yourself).

## Status vocabulary

| Status | Meaning |
|---|---|
| `TODO` | not started |
| `IN_PROGRESS` | someone is working on it (fill `Owner / Updated`) |
| `BLOCKED` | waiting on a dependency or an open decision (say which, in Notes) |
| `DONE` | every acceptance check passes; outputs exist as described |
| `DROPPED` | will not be done; keep the file, explain why in Notes, remove it from dependents' `Depends on` |

Update the status in **two places**: the file's header table and the row of the stage `README.md`. The stage's own status becomes `DONE` when its exit criteria are checked.

## Order and interlocks

- **Order in stage** = position in the ID sequence; IDs were assigned so that intra-stage dependencies always point backwards.
- **Depends on** — hard prerequisites. A subtask may start only when every dependency is `DONE`, or when its owner explicitly accepts a partial output (write that in Inputs).
- **Unblocks** — the exact reverse of `Depends on` across the whole tree. When you add or remove a dependency, update the other file too.
- **Parallel with** — subtasks of the same stage at the same topological level with no mutual (transitive) dependency; informational.
- **Gate** — `yes — fallback: …` marks a go/no-go decision (today only S01.T06). A failed gate triggers the fallback and a decision-log entry; it never silently stops the stage.
- **Cross-stage** — a stage may depend on subtasks of earlier stages only. Stage READMEs list what they require and what they feed.

## Writing rules

- English throughout (D-006). Quote legacy pt-BR identifiers verbatim when needed (`régua`, file names).
- Business rules are cited by ID (`RN-13`) and resolved in [traceability](05-business-rules-traceability.md); decisions by ID (`D-002`) in the [decision log](02-decision-log.md).
- Legacy files are referenced as `pokemon/src/...` paths with "consult, do not copy".
- Numbers carry their source (legacy measurement, this machine, or a target).
- Keep the header table machine-parseable: exact field names, IDs as `Sxx.Tyy` (links allowed around them).

## Consistency checks (docs lint, S01.T10)

1. Every `Depends on` / `Unblocks` / input `from` / output `consumed by` ID exists.
2. `Unblocks` of X equals the set of files whose `Depends on` contains X.
3. No dependency cycles; no dependency on a later stage; intra-stage dependencies point to lower IDs.
4. `Order in stage n / N` matches the file's position and the stage size.
5. Every input `from Sxx.Tyy` names a subtask listed in `Depends on`.
6. Every subtask file appears exactly once in its stage README table and in the index.
7. Every file has all template-v2 sections, non-empty; every RN assigned in the traceability doc appears in the file's Business rules table.
8. `BR-` IDs are unique across the tree; a rule **row** defines only IDs of its own file (citing another file's rule in prose is allowed and expected).
9. Status is from the vocabulary and agrees with the stage README row for the same subtask.
10. The header table has exactly the template's fields, in order; `Gate` is `no` or `yes — fallback: …`.
11. The `Context docs:` footer is present and its links resolve.
12. Every relative link in the file resolves to an existing file; a link whose anchor text is a subtask ID points at that subtask's file.
13. Acceptance checks are checkboxes (`- [ ]`) and there are at least five.

Checks 1–8 are errors; 9–13 are errors too once the tree is elaborated (they were warnings during generation). The lint is the executable form of
this document: when a rule here changes, the lint changes with it in the same commit.

## Review

Every batch of created or rewritten files is reviewed by the `docs-reviewer` agent (`.claude/agents/docs-reviewer.md`) before the user reads it.
The reviewer checks header integrity, self-containment, business-rule coverage, CRUD/interface completeness, runnable acceptance, facts and
references, and language, and reports findings by severity (Blocker / Major / Minor) with a concrete fix. Dependency changes it proposes are
applied by hand (both files), never by the reviewer.

Until the lint exists, run these checks by hand after editing.

## How this tree was produced

Rendered once on 2026-09-22 by a one-off generator (not kept in the repo) from a data description of the 92 subtasks; the generator derived `Unblocks`, `Order in stage`, `Parallel with`, the stage tables and the graphs, and refused to write on any inconsistency. From now on the `.md` files are the source of truth and are edited by hand.

[Docs index](../README.md) · [Glossary](07-glossary.md)
