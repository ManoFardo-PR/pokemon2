You are the research assistant of a Principal Software Architect. Before the architect plans subtask S02T03, decide which existing files of the repository they must read. You have no tools: choose from the file listing below.

SUBTASK: S02T03
FILES THE TASK ALREADY ASKS TO READ (always included; do not repeat them): docs/stages/02-card-data-and-search/T03-fetch-tcgdex.md
MAXIMUM NUMBER OF ADDITIONAL FILES: 8

RULES:
1. Pick only files the plan really depends on: modules the new code will import, extend or must stay compatible with; the test file closest to the new tests (to copy its conventions); the package manifest and config of the package being changed. Prefer small, specific files over large ones.
2. Do not pick documentation, lockfiles, generated files, fixtures or files unrelated to the specification.
3. Every path must be copied exactly from the listing, relative to the repository root.

OUTPUT FORMAT (mandatory): a single JSON array of strings, nothing else. Example:
["packages/etl/src/paths.ts", "packages/etl/src/paths.spec.ts", "packages/etl/package.json"]

================================================================================
REPOSITORY FILES (tracked files under the paths this task may touch):
================================================================================
.continueignore
.editorconfig
.env
.env.example
.gitattributes
.gitignore
.npmrc
ESPECIFICACAO.md
README.md
apps/api/ROUTES.md
apps/api/package.json
apps/api/src/app.ts
apps/api/src/config.spec.ts
apps/api/src/config.ts
apps/api/src/cors.spec.ts
apps/api/src/errors.spec.ts
apps/api/src/errors.ts
apps/api/src/health.spec.ts
apps/api/src/index.ts
apps/api/src/routes.spec.ts
apps/api/src/routes/system.ts
apps/api/src/server.spec.ts
apps/api/src/server.ts
apps/api/tsconfig.json
apps/api/vitest.config.ts
apps/web/index.html
apps/web/package.json
apps/web/src/api/client.ts
apps/web/src/api/hooks.ts
apps/web/src/components/CardImage.tsx
apps/web/src/components/HealthBadge.tsx
apps/web/src/components/NotFound.tsx
apps/web/src/components/QueryState.tsx
apps/web/src/components/RootLayout.tsx
apps/web/src/main.tsx
apps/web/src/routeTree.gen.tsx
apps/web/src/strings.ts
apps/web/src/styles/base.css
apps/web/src/styles/tokens.css
apps/web/test/bundle.spec.ts
apps/web/test/card-image.spec.tsx
apps/web/test/client.spec.ts
apps/web/test/query-state.spec.tsx
apps/web/test/router.spec.tsx
apps/web/test/setup.ts
apps/web/test/theme.spec.tsx
apps/web/tsconfig.json
apps/web/vite.config.ts
apps/web/vitest.config.ts
apps/worker/package.json
apps/worker/src/index.ts
apps/worker/tsconfig.json
apps/worker/vitest.config.ts
docs/NOTICE.md
docs/PROMPT_01.MD
docs/PROMPT_02.MD
docs/PROMPT_03.MD
docs/PROMPT_04.MD
docs/README.md
docs/project/01-vision-and-scope.md
docs/project/02-decision-log.md
docs/project/03-architecture-overview.md
docs/project/04-data-model-overview.md
docs/project/05-business-rules-traceability.md
docs/project/06-legacy-reference-map.md
docs/project/07-glossary.md
docs/project/08-conventions.md
docs/stages/01-foundation/README.md
docs/stages/01-foundation/T01-monorepo-skeleton.log.md
docs/stages/01-foundation/T01-monorepo-skeleton.md
docs/stages/01-foundation/T02-sqlite-database-client.log.md
docs/stages/01-foundation/T02-sqlite-database-client.md
docs/stages/01-foundation/T03-test-database-and-fixtures.log.md
docs/stages/01-foundation/T03-test-database-and-fixtures.md
docs/stages/01-foundation/T04-database-migration-framework.log.md
docs/stages/01-foundation/T04-database-migration-framework.md
docs/stages/01-foundation/T05-shared-contracts-package.log.md
docs/stages/01-foundation/T05-shared-contracts-package.md
docs/stages/01-foundation/T06-rust-toolchain-gate.md
docs/stages/01-foundation/T07-api-skeleton-and-health.log.md
docs/stages/01-foundation/T07-api-skeleton-and-health.md
docs/stages/01-foundation/T08-web-skeleton.log.md
docs/stages/01-foundation/T08-web-skeleton.md
docs/stages/01-foundation/T09-licensing-and-notice.log.md
docs/stages/01-foundation/T09-licensing-and-notice.md
docs/stages/01-foundation/T10-quality-gates-and-docs-lint.log.md
docs/stages/01-foundation/T10-quality-gates-and-docs-lint.md
docs/stages/02-card-data-and-search/README.md
docs/stages/02-card-data-and-search/T01-etl-cli-and-raw-cache.log.md
docs/stages/02-card-data-and-search/T01-etl-cli-and-raw-cache.md
docs/stages/02-card-data-and-search/T02-fetch-pokemon-tcg-data.log.md
docs/stages/02-card-data-and-search/T02-fetch-pokemon-tcg-data.md
docs/stages/02-card-data-and-search/T03-fetch-tcgdex.md
docs/stages/02-card-data-and-search/T04-set-and-card-id-mapping.md
docs/stages/02-card-data-and-search/T05-cards-schema-migration.md
docs/stages/02-card-data-and-search/T06-load-cards.md
docs/stages/02-card-data-and-search/T07-prices-snapshot.md
docs/stages/02-card-data-and-search/T08-full-text-search.md
docs/stages/02-card-data-and-search/T09-search-query-model-and-sql.md
docs/stages/02-card-data-and-search/T10-natural-language-parser.md
docs/stages/02-card-data-and-search/T11-api-cards-search-sets.md
docs/stages/02-card-data-and-search/T12-web-search-page.md
docs/stages/02-card-data-and-search/T13-web-card-detail-page.md
docs/stages/02-card-data-and-search/T14-web-sets-page.md
docs/stages/03-tournament-meta-and-deck-builder/README.md
docs/stages/03-tournament-meta-and-deck-builder/T01-tournaments-schema-migration.md
docs/stages/03-tournament-meta-and-deck-builder/T02-limitless-api-client.md
docs/stages/03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md
docs/stages/03-tournament-meta-and-deck-builder/T04-deck-resolver.md
docs/stages/03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md
docs/stages/03-tournament-meta-and-deck-builder/T06-meta-queries.md
docs/stages/03-tournament-meta-and-deck-builder/T07-api-meta-endpoints.md
docs/stages/03-tournament-meta-and-deck-builder/T08-web-meta-pages.md
docs/stages/03-tournament-meta-and-deck-builder/T09-decklist-parser-and-exporter.md
docs/stages/03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md
docs/stages/03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md
docs/stages/03-tournament-meta-and-deck-builder/T12-web-deck-builder.md
docs/stages/03-tournament-meta-and-deck-builder/T13-deck-comparison-with-tournament-lists.md
docs/stages/04-game-engine-core/README.md
docs/stages/04-game-engine-core/T01-engine-workspace-and-crates.md
docs/stages/04-game-engine-core/T02-card-definition-model.md
docs/stages/04-game-engine-core/T03-game-state-model.md
docs/stages/04-game-engine-core/T04-setup-and-turn-structure.md
docs/stages/04-game-engine-core/T05-actions-and-legality.md
docs/stages/04-game-engine-core/T06-energy-provision-and-cost-payment.md
docs/stages/04-game-engine-core/T07-damage-pipeline.md
docs/stages/04-game-engine-core/T08-special-conditions-and-checkup.md
docs/stages/04-game-engine-core/T09-prompt-protocol.md
docs/stages/04-game-engine-core/T10-termination-stall-and-determinism.md
docs/stages/04-game-engine-core/T11-baseline-bots-random-heuristic.md
docs/stages/04-game-engine-core/T12-cli-job-protocol.md
docs/stages/04-game-engine-core/T13-scenario-format-and-runner.md
docs/stages/04-game-engine-core/T14-jobs-schema-migration.md
docs/stages/04-game-engine-core/T15-worker-job-runner.md
docs/stages/04-game-engine-core/T16-api-jobs-and-sse.md
docs/stages/04-game-engine-core/T17-web-evaluate-page.md
docs/stages/04-game-engine-core/T18-performance-baseline.md
docs/stages/05-card-rules-base/README.md
docs/stages/05-card-rules-base/T01-rules-schema-migration.md
docs/stages/05-card-rules-base/T02-effect-texts-and-card-parts.md
docs/stages/05-card-rules-base/T03-effect-ir-vocabulary.md
docs/stages/05-card-rules-base/T04-ir-compiler-and-vm.md
docs/stages/05-card-rules-base/T05-continuous-modifiers-and-triggers.md
docs/stages/05-card-rules-base/T06-builtins-escape-hatch.md
docs/stages/05-card-rules-base/T07-rule-codes-composition-semantics.md
docs/stages/05-card-rules-base/T08-spreadsheet-import.md
docs/stages/05-card-rules-base/T09-import-attack-effects-json.md
docs/stages/05-card-rules-base/T10-import-catalog-recipes.md
docs/stages/05-card-rules-base/T11-legacy-tests-to-scenarios.md
docs/stages/05-card-rules-base/T12-evidence-and-coverage-metrics.md
docs/stages/05-card-rules-base/T13-rules-editor-ui.md
docs/stages/05-card-rules-base/T14-coverage-page-and-authoring-queue.md
docs/stages/05-card-rules-base/T15-rules-export-import-seed.md
docs/stages/05-card-rules-base/T16-measurement-model-and-suite-v6-freeze.md
docs/stages/06-bots/README.md
docs/stages/06-bots/T01-honest-information-view.md
docs/stages/06-bots/T02-deck-profile-analysis.md
docs/stages/06-bots/T03-planner-turn-policy.md
docs/stages/06-bots/T04-need-scoring-and-prompt-resolvers.md
docs/stages/06-bots/T05-rollout-bot.md
docs/stages/06-bots/T06-ismcts-bot.md
docs/stages/06-bots/T07-bot-registry-and-freezing.md
docs/stages/06-bots/T08-measurement-score-and-mirror.md
docs/stages/07-deck-optimizer/README.md
docs/stages/07-deck-optimizer/T01-candidate-pool-and-move-generation.md
docs/stages/07-deck-optimizer/T02-paired-seed-screening.md
docs/stages/07-deck-optimizer/T03-sequential-confirmation.md
docs/stages/07-deck-optimizer/T04-holdout-acceptance-and-versioning.md
docs/stages/07-deck-optimizer/T05-optimize-job-orchestration.md
docs/stages/07-deck-optimizer/T06-web-optimizer-page.md
docs/stages/07-deck-optimizer/T07-coach-lost-game-review.md
docs/stages/08-operations-and-extensions/README.md
docs/stages/08-operations-and-extensions/T01-scheduler.md
docs/stages/08-operations-and-extensions/T02-etl-monitoring-and-alerts.md
docs/stages/08-operations-and-extensions/T03-hosted-postgres-migration-path.md
docs/stages/08-operations-and-extensions/T04-wasm-replay-and-play.md
docs/stages/08-operations-and-extensions/T05-twinleaf-differential-oracle.md
docs/stages/08-operations-and-extensions/T06-llm-assisted-authoring.md
docs/stages/seeds/S02-issues.json
docs/stages/seeds/S03-issues.json
docs/stages/seeds/S04-issues.json
docs/stages/seeds/S05-issues.json
docs/stages/seeds/S06-issues.json
docs/stages/seeds/S07-issues.json
docs/stages/seeds/S08-issues.json
eslint.config.js
package.json
packages/db/MIGRATIONS.md
packages/db/PORTABILITY.md
packages/db/fixtures/README.md
packages/db/fixtures/cards-basic.json
packages/db/fixtures/cards-ptcg-sample.json
packages/db/fixtures/decks-basic.json
packages/db/fixtures/empty.json
packages/db/migrations/0001_foundation.sql
packages/db/package.json
packages/db/src/client.spec.ts
packages/db/src/client.ts
packages/db/src/concurrency.spec.ts
packages/db/src/dialect/index.ts
packages/db/src/dialect/postgres.ts
packages/db/src/dialect/sqlite.ts
packages/db/src/dialect/types.ts
packages/db/src/index.test.js
packages/db/src/index.ts
packages/db/src/migrate.spec.ts
packages/db/src/migrate.ts
packages/db/src/node-sqlite.d.ts
packages/db/src/schema.spec.ts
packages/db/src/schema.ts
packages/db/src/testing/fixtures.spec.ts
packages/db/src/testing/index.ts
packages/db/src/testing/testing.spec.ts
packages/db/src/testing/vitest.setup.ts
packages/db/tsconfig.json
packages/db/vitest.config.ts
packages/etl/README.md
packages/etl/package.json
packages/etl/src/cli.spec.ts
packages/etl/src/cli.ts
packages/etl/src/fetch-ptcg.spec.ts
packages/etl/src/fetch-ptcg.ts
packages/etl/src/index.ts
packages/etl/src/logger.spec.ts
packages/etl/src/logger.ts
packages/etl/src/orchestrator.spec.ts
packages/etl/src/orchestrator.ts
packages/etl/src/paths.spec.ts
packages/etl/src/paths.ts
packages/etl/src/run-log.spec.ts
packages/etl/src/run-log.ts
packages/etl/tsconfig.json
packages/etl/vitest.config.ts
packages/shared/CONTRACTS.md
packages/shared/package.json
packages/shared/schema/card-def.json
packages/shared/schema/decklist.json
packages/shared/schema/effect-ir.json
packages/shared/schema/job-event.json
packages/shared/schema/job-request.json
packages/shared/schema/scenario.json
packages/shared/schema/search-query.json
packages/shared/schema/validation-report.json
packages/shared/scripts/schema-build.mjs
packages/shared/scripts/schema-check.mjs
packages/shared/src/card-def/index.ts
packages/shared/src/contracts.spec.ts
packages/shared/src/decklist/index.ts
packages/shared/src/env.check.ts
packages/shared/src/env.spec.ts
packages/shared/src/env.ts
packages/shared/src/index.ts
packages/shared/src/ir/index.ts
packages/shared/src/jobs/index.ts
packages/shared/src/registry.ts
packages/shared/src/scenario/index.ts
packages/shared/src/search/index.ts
packages/shared/src/version.spec.ts
packages/shared/src/version.ts
packages/shared/tsconfig.json
packages/shared/vitest.config.ts
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/__fixtures__/docs-lint/_base/README.md
scripts/__fixtures__/docs-lint/_base/project/05-business-rules-traceability.md
scripts/__fixtures__/docs-lint/_base/project/08-conventions.md
scripts/__fixtures__/docs-lint/_base/stages/01-alpha/README.md
scripts/__fixtures__/docs-lint/_base/stages/01-alpha/T01-one.md
scripts/__fixtures__/docs-lint/_base/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/_base/stages/02-beta/README.md
scripts/__fixtures__/docs-lint/_base/stages/02-beta/T01-three.md
scripts/__fixtures__/docs-lint/check-1/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-1/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-10/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-10/bad/stages/02-beta/T01-three.md
scripts/__fixtures__/docs-lint/check-10/good/stages/02-beta/README.md
scripts/__fixtures__/docs-lint/check-10/good/stages/02-beta/T01-three.md
scripts/__fixtures__/docs-lint/check-11/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-11/bad/stages/02-beta/T01-three.md
scripts/__fixtures__/docs-lint/check-11/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-12/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-12/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-13/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-13/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-2/bad/stages/01-alpha/T01-one.md
scripts/__fixtures__/docs-lint/check-2/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-2/good/stages/01-alpha/T01-one.md
scripts/__fixtures__/docs-lint/check-3/bad/stages/01-alpha/T01-one.md
scripts/__fixtures__/docs-lint/check-3/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-3/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-3/good/stages/02-beta/README.md
scripts/__fixtures__/docs-lint/check-3/good/stages/02-beta/T01-three.md
scripts/__fixtures__/docs-lint/check-4/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-4/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-5/bad/stages/02-beta/T01-three.md
scripts/__fixtures__/docs-lint/check-5/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-6/bad/stages/01-alpha/README.md
scripts/__fixtures__/docs-lint/check-6/good/README.md
scripts/__fixtures__/docs-lint/check-6/good/stages/01-alpha/README.md
scripts/__fixtures__/docs-lint/check-7/bad/project/05-business-rules-traceability.md
scripts/__fixtures__/docs-lint/check-7/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-7/bad/stages/02-beta/T01-three.md
scripts/__fixtures__/docs-lint/check-7/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-8/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-8/bad/stages/02-beta/T01-three.md
scripts/__fixtures__/docs-lint/check-8/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-9/bad/stages/01-alpha/T02-two.md
scripts/__fixtures__/docs-lint/check-9/bad/stages/02-beta/T01-three.md
scripts/__fixtures__/docs-lint/check-9/good/stages/01-alpha/README.md
scripts/__fixtures__/docs-lint/check-9/good/stages/01-alpha/T02-two.md
scripts/__fixtures__/eslint/api-node-sqlite.ts.txt
scripts/__fixtures__/eslint/shared-node-fs.ts.txt
scripts/__fixtures__/eslint/web-db-import.ts.txt
scripts/__fixtures__/eslint/web-jsx-literal.tsx.txt
scripts/db-backup.mjs
scripts/db-backup.spec.ts
scripts/db-migrate.mjs
scripts/db-migrate.spec.ts
scripts/db-status.mjs
scripts/docs-lint.mjs
scripts/docs-lint.spec.mjs
scripts/lint-config.spec.ts
scripts/members.spec.ts
scripts/notice-lint.mjs
scripts/notice-lint.spec.ts
scripts/sql-lint.mjs
scripts/tsconfig.json
tsconfig.base.json
vitest.config.ts
================================================================================
SPECIFICATION (for context only):
================================================================================
# [S02T03] S02T03 — Fetch TCGdex (prices, legality, variants, images)

# S02T03 — Fetch TCGdex (prices, legality, variants, images)

| Campo | Valor |
|---|---|
| Estágio | S02 — Card data and search |
| ID Tarefa | S02T03 |
| Depende de | S02T01 |
| Desbloqueia | S02T04, S02T07 |
| Ordem de lançamento | 3 |
| Depende de (outros estágios) | Nenhuma |
| Desbloqueia (outros estágios) | Nenhum |
| Especificação | `docs/stages/02-card-data-and-search/T03-fetch-tcgdex.md` |

<!-- depends_on: S02T01 -->
<!-- seq: 3 -->

## 🎯 Objetivo
All TCGdex card documents needed to complement the canonical data (prices, legality flags, variants, WebP images) are cached locally, fetched with bounded concurrency and polite retries, and refreshable in bulk for price snapshots.

## 🔍 Contexto
### Context

TCGdex is the **complement**, never the canon: it supplies `pricing` (TCGplayer USD and Cardmarket EUR), `legal.standard` / `legal.expanded`, `variants`, the WebP image base and a `localId` used to pair printings. The card wording, attacks and abilities come from pokemon-tcg-data ([S02.T02](T02-fetch-pokemon-tcg-data.md)); RN-01 requires both raw documents to survive into the database side by side.

The scale is different from T02: one HTTP request per card, ≈20,219 cached files and ≈53 MB, a first full fetch of roughly 20k requests taking 30–60 minutes (legacy measurement). That forces three properties. **Bounded concurrency** — the legacy `config.TCGDEX_CONCURRENCY = 8` and this subtask keeps 8 as the default. **Cache by presence** — a card file that exists is never re-requested unless `force`, because per-file conditional requests would still cost 20k round trips. **Bulk refresh** — prices are only current if the whole card set is re-fetched, which is exactly what [S02.T07](T07-prices-snapshot.md) does with `force: true`.

The legacy implementation, `pokemon/src/pokesearch/etl/fetch_tcgdex.py`, is a good description of the endpoints and a flawed description of the retry loop: 5 attempts, delay starting at 1 s and doubling, 404 → `None`, retry on 429/500/502/503/504 and on transport/timeout errors, progress every 250 cards. But the backoff sleep after a **transport** error happens inside `async with sem`, so a flapping network holds concurrency slots idle, while the sleep after an **HTTP** 5xx happens outside it. This subtask fixes that asymmetry: the semaphore is only ever held around the request itself (BR-S02.T03-03). The legacy also never bounds total attempts across the run, so a full outage costs 20k × 5 requests before finishing "successfully" with 20k nulls; here a circuit breaker aborts the step (BR-S02.T03-07).

D-003 allows seeding the cache from the legacy `pokemon/data/raw/tcgdex` folder (164 MB total raw dir, of which TCGdex is ≈53 MB) to skip the first hour. That is a cache copy, not database reuse, and the documents are re-parsed by the new loader; it stays an explicit opt-in flag, never a default.

### Scope

- **In scope.** `packages/etl/src/fetch-tcgdex.ts`: endpoint wrappers, the file cache and its validation, the limiter, the retry/backoff policy and circuit breaker, `_fetched_at` stamping, progress reporting, the offline readers `readCachedCard` / `readCachedSet`, and the `--seed-from <dir>` importer for an existing cache directory.
- **Out of scope.** Matching TCGdex ids to canonical ids ([S02.T04](T04-set-and-card-id-mapping.md)); turning `pricing` into rows ([S02.T07](T07-prices-snapshot.md)); writing any card column ([S02.T06](T06-load-cards.md)); mirroring images (out of scope for the whole project — images are hotlinked, see [Vision and scope](../../project/01-vision-and-scope.md)).

### Business rules

The [traceability doc](../../project/05-business-rules-traceability.md) assigns no `RN-nn` here. RN-01 ("neither source overwrites the other") is what makes this fetcher's output a *separate* cached document rather than a patch on the canonical one.

### Data operations

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `$RAW_CACHE_DIR/tcgdex/sets.json` | C/U | etl | start of a load, and on `--force` | overwritten whole; must parse as a non-empty array of `{id}` | the TCGdex set universe used by [S02.T04](T04-set-and-card-id-mapping.md) |
| `$RAW_CACHE_DIR/tcgdex/sets/<tcgdexSetId>.json` | C/U | etl | when a canonical set resolves to a TCGdex set | written only on 200; contains the brief card list (`id`, `localId`, `name`) | ≈174 files |
| `$RAW_CACHE_DIR/tcgdex/cards/<tcgdexCardId>.json` | C/U | etl | per matched card, first time or under `force` | write is atomic and only after JSON validation; `_fetched_at` added | ≈20,219 files, ≈53 MB (legacy measurement) |
| cache files | D | etl | when a cached file fails to parse | deleted, then re-fetched once | keeps a crash from poisoning the cache |
| `$RAW_CACHE_DIR/tcgdex/**` | R | etl | [S02.T04](T04-set-and-card-id-mapping.md), [S02.T06](T06-load-cards.md), [S02.T07](T07-prices-snapshot.md) | read-only, offline | `readCachedCard(id)` / `readCachedSet(id)` |
| `$RAW_CACHE_DIR/tcgdex/**` | C | developer (`etl full --seed-tcgdex-from <dir>`) | once, optionally | copies only `cards/*.json`, `sets/*.json`, `sets.json`; skips files that fail validation; never copies a database | D-003: cache, not database |
| `etl_runs.stats_json` | U | etl | end of the step | flat counters | `tcgdex_requests`, `tcgdex_cache_hits`, `tcgdex_404`, `tcgdex_retries`, `tcgdex_failed`, `bytes_downloaded` |
| card tables | — | — | — | not written here | [S02.T06](T06-load-cards.md) / [S02.T07](T07-prices-snapshot.md) own them |

### Interfaces

**`packages/etl/src/fetch-tcgdex.ts`**

```ts
export const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";
export const TCGDEX_CONCURRENCY = 8;      // legacy config.TCGDEX_CONCURRENCY

export interface TcgdexSetSummary { id: string; name: string; cardCount?: { total?: number; official?: number }; }
export interface TcgdexBriefCard { id: string; localId: string; name: string; image?: string; }
export interface TcgdexSet extends TcgdexSetSummary { serie?: { id: string; name: string }; releaseDate?: string;
  legal?: { standard?: boolean; expanded?: boolean }; cards?: TcgdexBriefCard[]; }
export interface TcgdexCard { id: string; localId: string; name: string; image?: string; stage?: string;
  regulationMark?: string; updated?: string; variants?: Record<string, boolean>;
  legal?: { standard?: boolean; expanded?: boolean };
  pricing?: { tcgplayer?: Record<string, unknown>; cardmarket?: Record<string, unknown> };
  _fetched_at?: string; }

export interface FetchCardsOptions { force?: boolean; concurrency?: number; signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void; }
export interface FetchCardsResult { results: Map<string, TcgdexCard | null>; failedIds: string[];
  requests: number; cacheHits: number; notFound: number; retries: number; bytes: number; }

export async function fetchSetList(opts?: { force?: boolean }): Promise<TcgdexSetSummary[]>;
export async function fetchSetBrief(setId: string, opts?: { force?: boolean }): Promise<TcgdexSet | null>;
export async function fetchCards(ids: string[], opts?: FetchCardsOptions): Promise<FetchCardsResult>;
export function readCachedCard(id: string): TcgdexCard | null;   // no network, null when absent or unreadable
export function readCachedSet(id: string): TcgdexSet | null;
export async function seedCacheFrom(dir: string): Promise<{ copied: number; skipped: number }>;
export class TcgdexUnavailableError extends Error { consecutiveFailures: number; }
```

**HTTP.** `undici` with a shared `Agent({ connections: 8, keepAliveTimeout: 30_000 })`; headers `{ "user-agent": "pokesearch2-etl/0.1 (+https://github.com/<repo>)", "accept": "application/json" }`; `headersTimeout: 15_000`, `bodyTimeout: 30_000`. Limiter: a 40-line internal semaphore (no `p-limit` dependency needed) exported as `limiter(n)`.

**Retry policy.** Attempts 5. Retryable: transport errors (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `UND_ERR_*`), 429, 500, 502, 503, 504. Delay `min(16_000, 1000 * 2 ** attempt) * (0.8 + 0.4 * random())`, overridden by `Retry-After` (seconds or HTTP-date) when the header is present. 404 → `null` immediately. Any other 4xx → throw after the first response.

**Progress.** `onProgress` fires every 250 documents (the legacy cadence) and the CLI prints `tcgdex cards: 5000/20219 (cache 4811, net 189, 3.1 req/s, eta 21m)`.

**CLI surface.** `etl full [--skip-tcgdex] [--force] [--concurrency <n>] [--seed-tcgdex-from <dir>]`; `etl prices` calls `fetchCards(ids, { force: true })` through [S02.T07](T07-prices-snapshot.md).

**Cache layout.** `tcgdex/sets.json`, `tcgdex/sets/<id>.json`, `tcgdex/cards/<id>.json` — one flat directory of ≈20k card files, which NTFS handles but Explorer does not; the README says so, and nothing globs that directory (files are addressed by id).

### Implementation steps

1. Add the `limiter(n)` helper and its spec (slots released on throw, in-flight count observable).
2. Write `request()` on top of the shared `undici` Agent with the retry policy, jitter and `Retry-After`; spec the documented backoff sequence and the 404 branch (BR-S02.T03-04, -05).
3. Implement the cache layer: `readCache` (parse-or-delete), `writeCache` (validate then `writeJsonAtomic`), and the `_fetched_at` stamp for cards only (BR-S02.T03-01, -02, -08).
4. Implement `fetchSetList()` and `fetchSetBrief()`; spec that a brief with no `cards` array still resolves (an empty set) and that a 404 on a set id returns `null`.
5. Implement `fetchCards()` with the limiter, per-id error collection, the consecutive-failure circuit breaker and progress callbacks (BR-S02.T03-03, -06, -07).
6. Add `readCachedCard` / `readCachedSet` offline readers used by [S02.T06](T06-load-cards.md) and [S02.T07](T07-prices-snapshot.md).
7. Add `seedCacheFrom(dir)` behind `--seed-tcgdex-from`, validating every copied file and refusing a directory that contains a `.db` file.
8. Wire the step into the CLI, feed the counters into `run.add`, and print the request-rate/ETA line.
9. Add three fixture TCGdex card documents (one with both price blocks, one with only Cardmarket, one with none) to `packages/db/fixtures/` for [S02.T07](T07-prices-snapshot.md).

### Edge cases and error handling

- **TCGdex returns 404 for a card id** that the set brief listed (a withdrawn printing). `fetchCards` stores `null` for that id, counts it in `notFound`, writes no file; [S02.T06](T06-load-cards.md) then loads the card from the canonical source with `raw_tcgdex_json = NULL` and both `tcgdex_legal_*` columns `NULL`.
- **A canonical set has no TCGdex counterpart at all.** That decision belongs to [S02.T04](T04-set-and-card-id-mapping.md); this module simply never gets asked for its cards. If asked with an unknown set id, `fetchSetBrief` returns `null` after one request.
- **Cached card file contains `{"id":` (truncated).** `readCache` fails to parse, deletes the file and re-fetches once; if the refetch also fails, the id lands in `failedIds` and the previous content is gone — which is why the delete happens only after a parse failure, never on a network failure.
- **The endpoint is down for the whole run.** After 50 consecutive failures the step throws `TcgdexUnavailableError`; the run closes as `error` with the counters collected so far, instead of spending 100k requests to produce 20k nulls.
- **TCGdex answers 429 with `Retry-After: 120`.** The 120 s is honoured instead of the computed backoff; the limiter slot is free during the wait, so the other 7 workers keep going (BR-S02.T03-03).
- **`--force` is used on a flaky connection.** Each card is refreshed independently; a card whose refresh fails keeps its previous cached document, so the price snapshot that follows is partially stale rather than partially empty — and the staleness is visible through `_fetched_at`.
- **The cache directory is on a synced folder.** `RAW_CACHE_DIR` defaults to `$DATA_DIR/raw` outside OneDrive (D-005); [S02.T01](T01-etl-cli-and-raw-cache.md)'s path guard refuses a repo-relative cache, and the README warns that 20k small files inside OneDrive is a sync pathology, not a disk-space problem.
- **`--seed-tcgdex-from` points at the legacy `pokemon/data/raw/tcgdex`.** Files are copied and validated; anything that fails validation is skipped and counted. The legacy `pokesearch.db` is never touched (D-003), and the importer refuses a source directory containing one.
- **The run is aborted mid-fetch.** The `AbortSignal` cancels in-flight requests and the limiter drains; every completed file is already on disk, so resuming costs only the remainder.

### Risks and open questions

- **Risk — the first full fetch takes 30–60 minutes** (legacy measurement, ≈20k requests). Mitigation: the CLI prints an ETA, the cache makes it a one-time cost, `--seed-tcgdex-from` skips it, and `--sets` lets a developer work on one set.
- **Risk — cache-by-presence makes prices permanently stale.** By design: `pricing` only refreshes under `force`. Mitigation: [S02.T07](T07-prices-snapshot.md) owns the bulk refresh and `_fetched_at` makes the age of every document auditable; the card page shows the snapshot date, not "now".
- **Risk — 20k requests look like abuse to a free, keyless API.** Mitigation: concurrency 8 (the legacy value, which completed a full crawl), an identifying `User-Agent`, `Retry-After` honoured, exponential backoff, circuit breaker. If TCGdex ever publishes a rate limit, it becomes a constant here and a note in `docs/NOTICE.md` ([S01.T09](../01-foundation/T09-licensing-and-notice.md)).
- **Risk — 20,219 files in one directory.** Acceptable on NTFS when addressed by name; no code enumerates the directory. If it ever becomes a problem, a two-level shard (`cards/<first2>/<id>.json`) is a change to `paths.ts` plus a one-off move.
- **Question — should the set brief be refreshed on every run** (new cards appear in a set after release)? Recommendation: refresh `sets.json` and every `sets/<id>.json` on every `full` run (they are ≈175 cheap requests) and keep card documents cache-by-presence. Decide with [S02.T04](T04-set-and-card-id-mapping.md)'s owner; the interface already takes `force` per call.
- **Question — is `pricing.tcgplayer.unit` always `USD` and `cardmarket.unit` always `EUR`?** [S02.T07](T07-prices-snapshot.md) defaults to those when the field is absent; this fetcher stores the document untouched so the question can be answered from the cache later.

### References

- `pokemon/src/pokesearch/etl/fetch_tcgdex.py` — verified (138 lines): endpoints `/sets`, `/sets/{id}`, `/cards/{id}` cached at `sets.json`, `sets/{id}.json`, `cards/{id}.json`; `_get_json(..., retries=5)` with `delay = 1.0` doubling, `404 → None`, retry on 429/500/502/503/504 and `httpx.TransportError`/`TimeoutException`; `_fetched_at` stamped on card documents only; `fetch_cards_bulk` uses `asyncio.Semaphore(config.TCGDEX_CONCURRENCY)` and logs every 250; `User-Agent: pokesearch-etl/0.1`, timeout 30. Consult for endpoints and policy; note that its transport-error backoff sleeps while holding the semaphore — the asymmetry BR-S02.T03-03 removes.
- `pokemon/src/pokesearch/config.py` — verified: `TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en"`, `TCGDEX_ASSETS_BASE = "https://assets.tcgdex.net"`, `TCGDEX_CONCURRENCY = int(os.getenv("TCGDEX_CONCURRENCY", "8"))`.
- `pokemon/README.md` L16 — verified: TCGdex described as "Enriquecimento: preços TCGPlayer (USD) e Cardmarket (EUR), legalidade Standard/Expanded, variantes, imagens WebP. Gratuito, sem chave."
- External: `https://api.tcgdex.net/v2/en` — `/sets`, `/sets/{id}`, `/cards/{id}`; TCGdex documentation at `https://tcgdex.dev/` for the `pricing`, `legal`, `variants` and `image` shapes.
- [S02.T01](T01-etl-cli-and-raw-cache.md) — cache paths, `writeJsonAtomic`, counters; [Decision log](../../project/02-decision-log.md) D-003 for the "cache, not database" rule behind `--seed-tcgdex-from`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)

## 📥 Entradas (Inputs)
- `module` CLI + cache layout + run log — from [S02.T01](T01-etl-cli-and-raw-cache.md)
- `external` `https://api.tcgdex.net/v2/en/sets`, `/sets/{id}` (brief card list `id, localId, name`), `/cards/{id}` (full card incl. `pricing`, `legal`, `variants`, `image`)
- `file` `pokemon/src/pokesearch/etl/fetch_tcgdex.py` — endpoints, retry/backoff, concurrency and the cache-by-presence policy; read-only reference

## 📤 Saídas Esperadas (Outputs)
- `module` `etl/fetch-tcgdex.ts` — `fetchSetList()`, `fetchSetBrief(id)`, `fetchCards(ids, { force, concurrency = 8 })` with file-per-entity cache (presence = cached), `_fetched_at` stamp, retry policy — consumed by [S02.T04](T04-set-and-card-id-mapping.md), [S02.T07](T07-prices-snapshot.md)
- `file` cached JSON under `RAW_CACHE_DIR/tcgdex/` (≈20k card files, ≈53 MB)

## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)
```
export const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";
export const TCGDEX_CONCURRENCY = 8;      // legacy config.TCGDEX_CONCURRENCY

export interface TcgdexSetSummary { id: string; name: string; cardCount?: { total?: number; official?: number }; }
export interface TcgdexBriefCard { id: string; localId: string; name: string; image?: string; }
export interface TcgdexSet extends TcgdexSetSummary { serie?: { id: string; name: string }; releaseDate?: string;
  legal?: { standard?: boolean; expanded?: boolean }; cards?: TcgdexBriefCard[]; }
export interface TcgdexCard { id: string; localId: string; name: string; image?: string; stage?: string;
  regulationMark?: string; updated?: string; variants?: Record<string, boolean>;
  legal?: { standard?: boolean; expanded?: boolean };
  pricing?: { tcgplayer?: Record<string, unknown>; cardmarket?: Record<string, unknown> };
  _fetched_at?: string; }

export interface FetchCardsOptions { force?: boolean; concurrency?: number; signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void; }
export interface FetchCardsResult { results: Map<string, TcgdexCard | null>; failedIds: string[];
  requests: number; cacheHits: number; notFound: number; retries: number; bytes: number; }

export async function fetchSetList(opts?: { force?: boolean }): Promise<TcgdexSetSummary[]>;
export async function fetchSetBrief(setId: string, opts?: { force?: boolean }): Promise<TcgdexSet | null>;
export async function fetchCards(ids: string[], opts?: FetchCardsOptions): Promise<FetchCardsResult>;
export function readCachedCard(id: string): TcgdexCard | null;   // no network, null when absent or unreadable
export function readCachedSet(id: string): TcgdexSet | null;
export async function seedCacheFrom(dir: string): Promise<{ copied: number; skipped: number }>;
export class TcgdexUnavailableError extends Error { consecutiveFailures: number; }
```

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-S02.T03-01 | A cached card or set file is used without any HTTP request unless `force` is set; presence plus successful JSON parse is the only cache check. — Enforcement: `readCache()` guard at the top of `fetchCard` / `fetchSetBrief` — Verification: `fetch-tcgdex.spec.ts > re-run makes zero HTTP requests` |
| BR-S02.T03-02 | Every card document written to the cache carries `_fetched_at` as an ISO-8601 UTC timestamp; set briefs and the set list do not. — Enforcement: the write path of `fetchCard` only — Verification: `fetch-tcgdex.spec.ts > card file has _fetched_at, set file does not` |
| BR-S02.T03-03 | The concurrency limiter is held only around the HTTP request; backoff sleeps happen outside it, for both transport and HTTP failures. — Enforcement: `limit(() => request(...))` with the retry loop wrapping the limited call — Verification: `fetch-tcgdex.spec.ts > 8 concurrent slots stay busy while one request backs off` (observed in-flight count) |
| BR-S02.T03-04 | A `404` yields `null` and is counted, never retried and never cached as an empty document. — Enforcement: the 404 branch returns before the write — Verification: `fetch-tcgdex.spec.ts > 404 returns null and writes no file` |
| BR-S02.T03-05 | 429 and 5xx are retried up to 5 times with exponential backoff from 1 s (1, 2, 4, 8, 16 s) plus ±20 % jitter; `Retry-After` overrides the computed delay when present. — Enforcement: `backoffDelay(attempt, response)` — Verification: `fetch-tcgdex.spec.ts > injected 429s follow the documented sequence`; `> Retry-After: 30 is honoured` |
| BR-S02.T03-06 | Individual card failures never fail the step: they are collected into `failedIds` and reported; the step fails only if the set list itself cannot be read. — Enforcement: `fetchCards` returns `{ results, failedIds }`; `fetchSetList` throws — Verification: `fetch-tcgdex.spec.ts > 3 failing cards out of 10 still resolve 7 and report 3` |
| BR-S02.T03-07 | The step aborts with an error when 50 consecutive requests fail, instead of walking the whole id list against a dead endpoint. — Enforcement: consecutive-failure counter in `fetchCards`, reset on any success — Verification: `fetch-tcgdex.spec.ts > all-503 endpoint aborts after 50 consecutive failures` |
| BR-S02.T03-08 | `--force` re-requests documents but only replaces a cache file after the new body parses; a failed refresh leaves the previous document readable. — Enforcement: `writeJsonAtomic` after validation — Verification: `fetch-tcgdex.spec.ts > force refresh with a bad body keeps the old file` |
| BR-S02.T03-09 | Requests carry a descriptive `User-Agent` and no credentials; TCGdex needs no key and none is ever read from the environment. — Enforcement: the single `undici` Agent configuration — Verification: `pnpm lint` grep: no `process.env` read inside `fetch-tcgdex.ts`; `> request headers` assertion in the spec |


## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)
- (nenhum)

## ✅ Critérios de aceite (done_when)
- `fetch-tcgdex.spec.ts > set brief and 10 cards write 11 files` and a second run makes zero HTTP requests with `tcgdex_cache_hits = 10` (BR-S02.T03-01).
- `> card file has _fetched_at, set file does not` (BR-S02.T03-02).
- `> injected 429s follow the documented sequence` — delays 1, 2, 4, 8, 16 s within the jitter band; `> Retry-After: 30 is honoured` (BR-S02.T03-05).
- `> 404 returns null and writes no file`, with `notFound = 1` (BR-S02.T03-04).
- `> 3 failing cards out of 10 still resolve 7 and report 3` and the step returns normally (BR-S02.T03-06).
- `> all-503 endpoint aborts after 50 consecutive failures` with `TcgdexUnavailableError` (BR-S02.T03-07).
- `> 8 concurrent slots stay busy while one request backs off` — the observed maximum in-flight count is 8 and never drops to 7 during a backoff (BR-S02.T03-03).
- `> force refresh with a bad body keeps the old file` (BR-S02.T03-08).
- Against the real API, `pnpm etl full` populates `RAW_CACHE_DIR/tcgdex/` with ≈20,219 card files / ≈53 MB (legacy measurement) and the repeated run finishes in seconds.
- `readCachedCard()` returns a document with the network disabled; `pnpm etl full --skip-tcgdex` makes no request to `api.tcgdex.net` (asserted by a blocking dispatcher in the spec).

## 📖 Arquivos para ler primeiro (o planejador começa por estes)
- `docs/stages/02-card-data-and-search/T03-fetch-tcgdex.md`

## 📁 Arquivos Alvo a Criar/Editar
- `packages/etl/src/fetch-tcgdex.ts`

