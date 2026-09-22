# S01.T10 — Quality gates and docs lint

| Field | Value |
|---|---|
| Stage | S01 — Foundation |
| Status | TODO |
| Order in stage | 10 / 10 |
| Depends on | [S01.T01](T01-monorepo-skeleton.md), [S01.T05](T05-shared-contracts-package.md) |
| Unblocks | — |
| Parallel with | [S01.T03](T03-test-database-and-fixtures.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `file` root scripts and workspace — from [S01.T01](T01-monorepo-skeleton.md)
- `module` `@pokesearch/shared` (first package with tests) — from [S01.T05](T05-shared-contracts-package.md)
- `doc` `project/08-conventions.md` — header table format and interlock rules for the docs lint; in particular the eight consistency checks and the status vocabulary
- `doc` `project/05-business-rules-traceability.md` — the RN→subtask assignment the lint cross-checks (check 7)

## Outputs (proposed)
- `script` `pnpm check` = `typecheck` + `lint` (eslint flat config, typescript-eslint) + `test` (vitest) across the workspace
- `script` `pnpm docs:lint` (`scripts/docs-lint.mjs`) — parses every `docs/stages/**/T*.md` header: IDs exist, `Depends on` ⇄ `Unblocks` symmetric, no cycles, `Order in stage` matches file order, inputs' `from S..` IDs are dependencies; exit code 1 on violations; `--json` and `--strict` modes described below
- `file` optional `.github/workflows/check.yml` running `pnpm check` and `pnpm docs:lint`

## Initial objective
One command tells whether the code and the execution docs are consistent, so the docs tree stays trustworthy while it is hand-edited during the elaboration pass.

## Context

Two things need guarding, and they fail differently.

The code is guarded the ordinary way — `tsc`, eslint, vitest — but with a twist: several business rules written in other S01 files are *implemented as lint rules*. `node:sqlite` may be imported only by the database client (BR-S01.T02-03); `@pokesearch/shared` may not import `node:*` (BR-S01.T05-01); `apps/web` may not import server-only modules (BR-S01.T08-03); no literal user-visible string may appear in JSX (BR-S01.T08-01). They live here, each tagged with the BR id it enforces, so deleting one is a visible act.

The docs are guarded by a linter that did not exist before. The tree of 92 subtask files was rendered once by a generator that derived `Unblocks`, `Order in stage`, `Parallel with`, the stage tables and the graphs, and refused to write on any inconsistency. That generator is gone and the `.md` files are now the hand-edited source of truth. The invariants it enforced — an acyclic, symmetric, backwards-pointing dependency graph; every ID resolving to a real file; every subtask listed exactly once — are exactly what an elaboration pass breaks by accident. `pnpm docs:lint` re-establishes them as a check rather than a generator: it reads, it reports, it never writes.

## Scope

- **In scope.** The eslint flat config with typescript-eslint and the cross-package restriction rules; the root `vitest.config.ts`; the `typecheck`/`lint`/`test`/`check` scripts; `scripts/docs-lint.mjs` implementing checks 1–8, its fixture suite, output format and exit codes; the optional GitHub Actions workflow.
- **Out of scope.** Coverage thresholds and performance tests; Rust checks (`cargo fmt --check`, `clippy`, `cargo test`), added once [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md) exists; the specialised linters owned elsewhere — `schema:check` ([S01.T05](T05-shared-contracts-package.md)), `sql-lint` ([S01.T02](T02-sqlite-database-client.md), [S01.T04](T04-database-migration-framework.md)), `notice-lint` ([S01.T09](T09-licensing-and-notice.md)) — which this subtask only wires into the owning package's scripts; changing the conventions themselves (proposed in Risks); the `docs-reviewer` agent, which is a human review, not a lint.

## Business rules

The traceability doc assigns no `RN-nn` here; the purpose of this subtask is to make other files' rules mechanically checkable.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T10-01 | `pnpm check` runs typecheck, lint and test for every workspace member and exits non-zero if any fails; a member missing those scripts is a failure, not a silent skip. | root scripts plus `members.spec.ts` asserting every member declares `typecheck`, `lint`, `test` | `pnpm check` fails after removing one member's `test` script |
| BR-S01.T10-02 | `pnpm docs:lint` exits 1 on any violation, prints `path:line [check-N] message`, and writes no file. | `scripts/docs-lint.mjs` — read-only by construction | `docs-lint.spec.mjs > exits 1 and leaves the tree byte-identical` (hash before/after) |
| BR-S01.T10-03 | Checks 1–8 of `project/08-conventions.md` are all implemented; a documented check without an implementation fails the lint's own test suite. | `CHECKS` registry keyed `1`..`8` | `docs-lint.spec.mjs > implements every documented check`, comparing the registry with the list parsed from the conventions doc |
| BR-S01.T10-04 | Every check has at least one fixture that must fail and one that must pass. | `scripts/__fixtures__/docs-lint/<check-n>/{bad,good}/` | `docs-lint.spec.mjs` iterates the fixtures; a check with no `bad` fixture fails the suite |
| BR-S01.T10-05 | The docs lint parses only header tables, section headings and inline IDs; it never interprets prose and never rewrites or reorders a file. | the parser grammar below; read-only file access | code review plus BR-S01.T10-02's byte-identity assertion |
| BR-S01.T10-06 | An eslint rule enforcing another subtask's business rule carries that BR id in a comment next to it. | comments in `eslint.config.js` | `lint-config.spec.ts > every restriction rule cites a BR id` |
| BR-S01.T10-07 | CI runs exactly the commands a developer runs, on the pinned Node and pnpm versions; no CI-only flag or skip exists. | `.github/workflows/check.yml` | the workflow contains no `--skip` and no `continue-on-error`, and takes versions from `package.json` |
| BR-S01.T10-08 | A `Status` outside the vocabulary (`TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `DROPPED`) is an error, and the value in the file matches the row in its stage README. | strict check 9 | `docs-lint.spec.mjs > rejects an invalid status`, `> rejects a status that disagrees with the stage table` |

## Data operations

No database, no endpoint: this subtask produces scripts, configuration and reports.

| Artifact | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| `eslint.config.js` (root, flat) | create | developer | here | one config with per-directory overrides; every restriction cites a BR id |
| `vitest.config.ts` (root) | create | developer | here | one project per member; `pool: "forks"`; `setupFiles` from [S01.T03](T03-test-database-and-fixtures.md); `execArgv` carries `--no-warnings=ExperimentalWarning` |
| root `package.json` scripts | amend | developer | here | `check` = typecheck + lint + test; `docs:lint` separate, so docs can be checked without a workspace install |
| `scripts/docs-lint.mjs` | create | developer | here | read-only; plain Node, no dependency beyond the standard library |
| `docs/stages/**/*.md`, `docs/README.md`, `project/05-…`, `project/08-…` | read | `docs:lint` | every run | opened read-only; parse errors are reported, never repaired |
| lint report | write to stdout | `docs:lint` | every run | `--json` gives `{ ok, violations: [{ file, line, check, message }] }` |
| `.github/workflows/check.yml` | create | developer | here | optional; same commands as local, pinned versions |

## Interfaces

**Scripts.** `typecheck` → `pnpm -r run typecheck`; `lint` → `pnpm -r run lint` (each member runs `eslint .`); `test` → `vitest run` at the root; `check` → the three in order, stopping at the first failure. `docs:lint` → `node scripts/docs-lint.mjs [--json] [--strict] [--dir docs]`; exit `0` clean, `1` violations, `2` a file could not be parsed.

**eslint flat config.** Base: `@eslint/js` recommended plus `typescript-eslint` recommended-type-checked with `projectService: true`. Global: `no-console` (warn; allowed in `scripts/` and CLI entry points), `@typescript-eslint/consistent-type-imports`, `@typescript-eslint/no-floating-promises`, `eqeqeq`. Overrides, each tagged with the rule it enforces:

| Files | Rule | Enforces |
|---|---|---|
| `packages/db/src/**` except `client.ts`; `apps/**`; `packages/{shared,etl}/**` | `no-restricted-imports: ["node:sqlite", "better-sqlite3"]` | BR-S01.T02-03 |
| `packages/shared/src/**` except `env.ts` | `no-restricted-imports: ["node:*", "fs", "path"]` | BR-S01.T05-01 |
| `apps/web/src/**` | `no-restricted-imports: ["@pokesearch/db", "@pokesearch/db/*", "@pokesearch/shared/env", "node:*"]` | BR-S01.T08-03 |
| `apps/web/src/**/*.tsx` | `react/jsx-no-literals` (punctuation allow-list) + `react-hooks` recommended | BR-S01.T08-01 |
| `packages/db/src/client.ts`, `scripts/**` | the restrictions disabled | the one legitimate place for each |

**vitest.** One project per member with `.spec.ts`/`.spec.tsx`; `environment: "node"` everywhere except `apps/web` (`jsdom`); `pool: "forks"` so each worker owns its temp-database template; `setupFiles` points at `packages/db/src/testing/vitest.setup.ts`; `poolOptions.forks.execArgv = ["--no-warnings=ExperimentalWarning"]`. No coverage thresholds.

**Docs-lint grammar.** For each `docs/stages/<NN-slug>/T<nn>-<slug>.md`: (a) the H1 matches `^# (S\d{2}\.T\d{2}) — (.+)$` and the id equals the one implied by the path; (b) the first pipe table after the H1 is the header table, with the field set in order `Stage`, `Status`, `Order in stage`, `Depends on`, `Unblocks`, `Parallel with`, `Gate`, `Owner / Updated`; (c) IDs are extracted with `/\bS\d{2}\.T\d{2}\b/g`, so a link and a bare id are equivalent; (d) `—`, `-` and an empty cell all mean "none"; (e) `Order in stage` matches `^(\d+)\s*/\s*(\d+)$`; (f) sections are the `##` lines in document order; (g) `from S..` and `consumed by S..` are read from the Inputs and Outputs sections only. Stage READMEs contribute their subtask table, and the index (`docs/README.md`, linked by every stage README) its subtask list.

**The eight checks.** 1 **ids-exist** — every ID in `Depends on`, `Unblocks`, an input's `from` or an output's `consumed by` resolves to an existing subtask file. 2 **unblocks-symmetry** — `Unblocks(X)` equals `{ Y : X ∈ DependsOn(Y) }`, reported in both directions. 3 **graph-shape** — no cycles (the cycle is printed as a path), no dependency on a later stage, intra-stage dependencies pointing to lower `Tnn`. 4 **order-in-stage** — `n` is the file's position when the stage's files are sorted by id and `N` the stage size. 5 **inputs-are-dependencies** — every input's `from Sxx.Tyy` appears in `Depends on`. 6 **listed-once** — each file appears exactly once in its stage README table and once in the index. 7 **sections-and-rules** — every template-v2 section present, in order and non-empty, and every `RN-nn` assigned by the traceability doc appears in the file's Business rules table. 8 **br-ids** — `BR-` ids are globally unique, match their own file, start at `01` and have no gaps.

**Proposed strict checks** (`--strict`, off until the conventions adopt them): 9 status vocabulary and agreement with the stage README row; 10 the header field set is exactly the expected one, in order; 11 `Gate` is `no` or `yes — fallback: …`; 12 the `Context docs:` footer line is present and its links resolve; 13 every relative markdown link resolves.

**Output.** Text: `docs/stages/01-foundation/T04-database-migration-framework.md:9 [check-2] Unblocks lists S02.T05 but that file's "Depends on" does not contain S01.T04`. JSON: `{ ok, counts: { errors, warnings }, violations: [...] }`.

**CI.** `ubuntu-latest`, checkout, `setup-node` with the version from `engines` and `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm docs:lint`. No database or network is needed: tests use temp SQLite files and `node:sqlite` ships with Node 24 on Linux too. Rust jobs are added by [S04.T01](../04-game-engine-core/T01-engine-workspace-and-crates.md).

## Implementation steps

1. Add eslint, typescript-eslint and the web plugins as root dev dependencies; write the base config; add a `lint` script to every member.
2. Add the four restriction overrides with their BR-id comments and `lint-config.spec.ts` (BR-S01.T10-06).
3. Write the root `vitest.config.ts` with the project list and setup file; add a `test` script to every member.
4. Compose `pnpm check` and add `members.spec.ts` (BR-S01.T10-01).
5. Write the docs-lint parser (H1, header table, sections, ID extraction) and `--json`; it must parse all 92 files without error before any check exists.
6. Implement checks 1–5 with their `good`/`bad` fixtures.
7. Implement checks 6–8, including reading the traceability doc for the RN cross-check and the stage README/index tables.
8. Add `docs-lint.spec.mjs`: the fixture sweep, the registry-completeness test, and the byte-identity assertion (BR-S01.T10-02, -03, -04).
9. Add the `--strict` checks behind the flag and propose the conventions update.
10. Add `.github/workflows/check.yml`, run it on a branch, and record that `pnpm docs:lint` passes on the current tree.

## Edge cases and error handling

- **A file cannot be parsed at all** (no H1, no header table) → a parse error with exit code 2, distinct from a rule violation, so a malformed file is never silently treated as "no dependencies".
- **An ID appears inside prose** ("see S04.T12 for the protocol") → only the header table and the Inputs/Outputs sections feed the graph, so prose mentions are ignored by checks 1–5 and validated as links only under `--strict`.
- **A `DROPPED` subtask still appears in another file's `Depends on`** → reported under check 2 as an asymmetry and, in `--strict`, with the status named so the reason is obvious.
- **A new subtask is appended to a stage** → every `Order in stage n / N` there has a stale `N`; check 4 reports one violation per file, verbose but unambiguous, each message carrying the expected value.
- **A file is renamed** (IDs are permanent, names are not) → check 1 fails on every link to the old path; the conventions allow a redirect stub, which the lint treats as a valid target and flags as a warning under `--strict`.
- **Em dash versus hyphen, CRLF, non-breaking spaces** → the parser normalises whitespace and accepts `—`, `–`, `-` as "none"; `.gitattributes` keeps `*.md` at LF so reported line numbers match the editor.
- **The traceability doc assigns an RN to a subtask that does not exist** → check 7 reports it against the traceability doc's line, so the error points at the thing that is wrong.
- **A BR id is reused after a rewrite** → check 8 catches the duplicate tree-wide; since renumbering is forbidden, the message says "choose the next free number in this file".
- **`pnpm lint` is slow** because type-aware rules build the whole program → `projectService: true` plus per-member invocation keeps it incremental; if it still hurts, the type-aware rule set is trimmed rather than the restriction rules, which are the ones carrying business rules.

## Acceptance / verification

- [ ] `pnpm docs:lint` passes on the generated tree and fails when a dependency ID is edited to a non-existent one (check 1), printing `path:line [check-1]` with the bad ID.
- [ ] `pnpm check` passes on the skeleton and fails after removing a `test` script from one member (BR-S01.T10-01).
- [ ] `docs-lint.spec.mjs` green: every check has a failing `bad` and a passing `good` fixture, and the registry covers checks 1–8 exactly (BR-S01.T10-03, -04).
- [ ] Removing `S01.T04` from [S01.T07](T07-api-skeleton-and-health.md)'s `Depends on` makes checks 2 and 5 both fail, naming both files.
- [ ] Introducing a cycle (making [S01.T01](T01-monorepo-skeleton.md) depend on [S01.T10](T10-quality-gates-and-docs-lint.md)) makes check 3 fail and print the cycle path.
- [ ] Duplicating a `BR-S01.T02-01` id into another file makes check 8 fail, naming both locations.
- [ ] `pnpm lint` fails on each of the four restriction fixtures (`node:sqlite` from `apps/api`, `node:fs` from `packages/shared/src/search`, `@pokesearch/db` from `apps/web`, a literal string in JSX) (BR-S01.T10-06).
- [ ] `pnpm docs:lint --json` reports `ok: true` on the current tree, and two consecutive runs leave the tree's hash unchanged (BR-S01.T10-02, -05).
- [ ] The CI workflow runs `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm docs:lint` and is green on a branch (BR-S01.T10-07).

## Risks and open questions

- **Risk — the lint becomes a second source of truth** and drifts from `project/08-conventions.md`. Mitigation: BR-S01.T10-03 derives the expected check list from the conventions doc itself, so adding a check there without implementing it fails the lint's test suite, and vice versa.
- **Risk — a regex parser is fragile** against hand-edited markdown. Mitigation: a narrow, explicit grammar, a distinct exit code for parse failures, and fixtures for the ugly cases. A markdown AST parser is the fallback if false positives appear; it would add a dependency to a script that currently has none.
- **Risk — check 4 produces a wall of violations** after any insertion, hiding real errors. Mitigation: violations are grouped by check and each message carries the expected value; a `--fix-order` mode would make the lint a writer, which BR-S01.T10-05 forbids today.
- **Question — should `pnpm check` also run `pnpm docs:lint`?** The output contract keeps them separate so the docs can be checked without a workspace install. Recommendation: separate locally, both in CI; the user decides if a single command is preferred.
- **Question — coverage thresholds.** Out of scope by decision; revisit once [S04](../04-game-engine-core/README.md) has real logic worth measuring.
- **Question — adopt strict checks 9–13 into the conventions?** They catch real mistakes (a status disagreeing with the stage table, a broken relative link). Recommendation: adopt 9, 11 and 12 as errors and keep 10 and 13 as warnings; that requires editing `project/08-conventions.md` §"Consistency checks", which is outside this subtask's scope and is therefore proposed, not done.

## References

- [Conventions](../../project/08-conventions.md) — the template-v2 section list, the header field set, the status vocabulary, the ID scheme and the eight consistency checks this lint implements; also the note that the tree was produced by a generator that "refused to write on any inconsistency".
- [Business rules traceability](../../project/05-business-rules-traceability.md) — the RN→subtask table read by check 7.
- The business rules this subtask mechanises: BR-S01.T02-03 ([S01.T02](T02-sqlite-database-client.md)), BR-S01.T05-01 ([S01.T05](T05-shared-contracts-package.md)), BR-S01.T08-01 and BR-S01.T08-03 ([S01.T08](T08-web-skeleton.md)).
- `pokemon/pyproject.toml` — verified: `[tool.pytest.ini_options]` with `testpaths`, `pythonpath` and three custom markers (`card`, `card_coverage`, `verifies`). The legacy project had no linter configuration and no docs check.
- External: eslint flat config and `typescript-eslint` (`projectService`), `no-restricted-imports` options, vitest configuration (projects, `pool`, `setupFiles`, `poolOptions.forks.execArgv`), GitHub Actions `setup-node` with corepack.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
