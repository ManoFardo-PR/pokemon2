# Task Execution Companion Log: S01.T09 — Licensing and NOTICE

- **Status**: `COMPLETED`
- **Completion Date**: 2026-09-25
- **Subtask ID**: S01.T09
- **Files Created/Modified**:
  - `scripts/notice-lint.mjs` (created)
  - `docs/NOTICE.md` (created)
  - `package.json` (`notice:lint` script; `notice-lint` added to `check`)
  - `README.md` ("Licence pending — all rights reserved" section)
  - `docs/project/02-decision-log.md` (O-1 findings and recommendation; still open)
  - `scripts/notice-lint.spec.ts` (RED suite from ec71330; `loadModule` now imports the plain path)

- **Technical Decisions & Design Enforcements**:
  - **BR-S01.T09-01**: `notice-lint` check `notice-6` compares `id:` entries in `packages/etl/src/sources.ts` with the NOTICE section ids. The registry does not exist yet, so the check is skipped and `--json` reports `"registry": "absent"`.
  - **BR-S01.T09-02**: `git ls-files` tracks no image (spec #38).
  - **BR-S01.T09-03**: `notice-4` rejects an `unverified` section whose `question:` or `owner:` is blank or `n/a`.
  - **BR-S01.T09-04**: `notice-5` requires "Nothing from this repository is ported." in `ptcg-engine` `provides:` or `restrictions:`.
  - **BR-S01.T09-05 / -07**: `notice-7` checks that `strings.footer.disclaimer` equals the first line of the `trademarks` attribution, and that `footer.dataSources` names pokemon-tcg-data, TCGdex and Limitless.
  - **BR-S01.T09-06**: README line added; O-1 left open for the user.
  - **Exit codes**: 0 = valid, 1 = violations (`file:line [notice-N] message`), 2 = unreadable file or malformed structure. The lint only reads files.
  - **Facts, not assumptions**: `gh api` on 2026-09-25 found that `wjsutton` now declares MIT, which corrects the legacy "não declarada". `twinleafgg` has no root LICENSE (MIT only in `ptcg-server/package.json`, empty author), and that is recorded as its open question. `pokemon-tcg-data` still declares no licence. Limitless, image-CDN and rulebook terms were not read and stay `unverified`, each with its exact question.
  - **Spec fix**: `import(pathToFileURL(...).href)` failed under Vite because the repo path contains "VS Code" (`%20`). The suite now imports the filesystem path. No assertion changed.

- **Test Status**: `PASSED` — `pnpm --filter @pokesearch/db exec vitest run --root ../.. scripts/notice-lint.spec.ts`: 42/42. `pnpm notice:lint`, `sql-lint`, `schema:check` and `pnpm test` (all packages) pass.
  - **Known issue (not introduced here)**: `pnpm check` stops at `pnpm lint` because `apps/web` has no `eslint.config.*` (ESLint 9). It also fails on HEAD before this subtask and belongs to S01.T08.
  - The spec suite in `scripts/` is not part of any package's `pnpm test`; `pnpm check` runs the lint itself, not the spec.
