# Decision log

| Field | Value |
|---|---|
| Doc | project/02 |
| Status | LIVE — append-only; revise a decision by adding a dated revision, never by rewriting history |
| Inputs | User decisions of 2026-09-21 and 2026-09-22; machine facts verified in the planning session |
| Outputs | Decision IDs `D-nnn` referenced by subtask files as `decision` inputs |

Format per entry: **Context** (what forced the choice) · **Decision** · **Alternatives considered** · **Consequences** (what subtasks must do because of it).

---

## D-001 — Game engine and bots in Rust, GNU target (2026-09-21; gate pending)

- **Context.** The legacy simulator ran 22–40 games/s on top of a third-party Python engine kept alive by monkeypatching; the deck optimizer needs 10–100× more games per candidate, and lookahead bots need cheap state cloning. The machine has no MSVC `cl.exe`/`link.exe` and no Windows SDK.
- **Decision.** Write the engine and bots in Rust as a pure library crate plus a CLI, installed with `rustup` on the `stable-x86_64-pc-windows-gnu` host toolchain (self-contained linker, no admin), targets `x86_64-pc-windows-gnu` and `wasm32-unknown-unknown`, pure-Rust dependencies only.
- **Alternatives.** TypeScript engine on `worker_threads` (no toolchain risk, ~10–50× slower, lookahead impractical); adopting the twinleafgg TypeScript engine (huge card coverage in code, but deep-clones per action, prompts are closures, rules are not data).
- **Consequences.** S01.T06 is a hard gate with a one-day budget; if it fails, **D-001b** applies: a TypeScript engine implementing the same JSON contracts (job protocol, IR, scenarios) under `packages/engine-ts`, keeping every other subtask unchanged. All boundaries are therefore defined in `packages/shared` first (S01.T05).
- **Dependency list** (all pure Rust, no C toolchain): `serde`, `serde_json`, `rand_xoshiro`, `rayon` (CLI only), `smallvec`, `indexmap`, `sha2`. Condition flags on a slot are hand-rolled bit operations rather than the `bitflags` crate — one fewer dependency for a `u8` of flags. Adding any crate to this list is a decision-log amendment, not a code change.

## D-002 — Database: local SQLite file outside OneDrive, Postgres-portable (2026-09-21; **revised 2026-09-22**)

- **Context.** Original leaning was SQLite; the user then asked for Google Cloud SQL (2026-09-21) and on 2026-09-22 withdrew it: "treat the database as a local file outside OneDrive; a Supabase-like solution will be sought for deployment in the future".
- **Decision.** SQLite file at `%LOCALAPPDATA%\pokemon2\pokesearch.db` (env `DATABASE_PATH`), opened through Node 24's built-in `node:sqlite` behind a small adapter; WAL mode, `busy_timeout = 5000`, foreign keys on; several processes (api, worker, etl) may share the file. Every SQL statement follows Postgres-portability rules (`packages/db/PORTABILITY.md`) and the SQLite-only constructs (FTS5, `json_each`, maintained tables instead of materialized views) are isolated in a dialect module and tagged migration blocks.
- **Verified facts.** `node:sqlite` on this machine ships SQLite 3.50.4 with `ENABLE_FTS5` and JSON1; a bm25 query over a 487 MB legacy database returned in 16 ms; `json_each` works. It prints an "experimental" warning.
- **Alternatives.** Google Cloud SQL PostgreSQL (dropped by the user: cost and remote latency for a single local user); PGlite/Postgres-in-WASM (rejected: single-process, uncertain performance on a ~0.5 GB dataset); `better-sqlite3` (native module needing a prebuilt binary — no C compiler here; kept as an optional driver behind the adapter).
- **Consequences.** S01.T02 (client + portability rules), S02.T05/S02.T08 (FTS5 in a dialect module with a documented `tsvector` counterpart), S08.T03 (rehearsed migration path to a hosted Postgres). Nothing before S08.T03 depends on which host is chosen.

## D-003 — ETL rebuilt from scratch in TypeScript from the public sources (2026-09-21)

- **Context.** The legacy Python ETL works and has a 164 MB offline cache, but the user wants the new project to start from zero with the source repositories/APIs as the origin.
- **Decision.** New ETL in `packages/etl` fetching pokemon-tcg-data (GitHub raw, ETag cache), TCGdex (API, file cache, concurrency 8) and Limitless (API + polite scraping). The legacy database file is **not** copied; legacy code is consulted only as documentation of algorithms (id mapping heuristics, deck-line resolution order, natural-language parser order).
- **Alternatives.** Keep the Python ETL writing into the new database (faster first screen, two writers, two languages).
- **Consequences.** S02.T01–T07 and S03.T02–T05 rewrite the pipeline; first full TCGdex fetch takes 30–60 minutes (optionally seeded from the legacy raw cache, which is cache, not database).

## D-004 — Card rules as sentence codes with per-card parameters, stored in the database (2026-09-21)

- **Context.** The user is building a rules base in a spreadsheet: every distinct effect sentence gets a code; a card is then a parametrized composition of codes. The legacy project had rules in Python recipes, JSON files and tables, with three notions of "correct".
- **Decision.** Tables `rule_codes` (code, sentence pattern with placeholders, params schema, executable body as effect IR or a named builtin, status), `text_codes` (ordered `(code, params)` per distinct effect text, shared by all reprints with identical wording), `text_sentences` (the spreadsheet rows with their classification columns), `rule_evidence` (insert-only proofs). The engine executes the composed IR program of a text; it never sees sentences or cards' names.
- **Alternatives.** Templates only (cannot express the long tail: ~1,046 of 1,157 raw templates occur once); code per card in the engine (fast to write, impossible to audit or edit as data).
- **Consequences.** S05 is organised around this model; S05.T07 fixes the composition semantics before the spreadsheet import (S05.T08); a `builtin` escape hatch exists for < 2 % of copies (S05.T06); the IR vocabulary is closed and schema-validated (RN-61).

### D-004a — Composition semantics, settled with the user on 2026-09-22

The S05 elaboration surfaced seventeen questions the model did not answer. Four were the user's to settle and are now closed; they are binding on `docs/rules/CODES.md`, on the spreadsheet import and on the editor.

1. **Filters, counts and conditions are parameters, not new codes.** One `SEARCH_DECK_FILTER_TO_BENCH{n, filter}` covers Nest Ball, Buddy-Buddy Poffin (`hp_at_most 70`, n = 2), Precious Trolley (n = 5) and Hop's Bag (`owner_tag hops`). This keeps the base at roughly 150–300 codes instead of several hundred near-duplicates, and it makes the spreadsheet's `code` column a choice of code **plus** a filter expression. Rejected: a code per variation (literal, easy to classify, but every new card tends to need a new code).
2. **The ordered `(code, params)` list is authoritative; the sentence link is provenance.** A sentence may need two codes (Gwynn discards *and* draws in one sentence) and a code may span two sentences. `sentence_from` / `sentence_to` record which sentences a code came from and are never used to execute. Rejected: one code per sentence exactly, which would force composite codes like `DISCARD_THEN_DRAW_PER` and prevent reuse of the parts.
3. **`once_scope` (instance / name / game, RN-16) is a property of the code, not of the card's params.** Two cards whose once-per-turn wording differs use two different codes. This keeps each code's semantics fixed and testable, and keeps evidence meaningful: proving one code says nothing about the other. Rejected: scope as a parameter, which would let one code mean different things per card.
4. **The spreadsheet's classification has not started.** Verified on 2026-09-22: in `cartas_standard (4)` and `(5)`, column A holds the 1,634 deduplicated sentences and columns B–H exist but are styled-empty. So `S05.T08` must accept an empty classification without failing, and the authoring order comes from `S05.T14`'s queue — uncovered texts sorted by meta copies, the 200 most-played names first (≈ 93.8 % of copies) — not from the sheet's row order.

Still open from that list and owned by whoever writes `CODES.md`: the wrapper nesting depth, the six named locals, `phase` on attack codes, whether a Trainer's several sentences are one part, and the remaining items recorded in S05.T07's Risks section.

## D-005 — Repository in `pokemon2` (OneDrive), heavy artifacts outside (2026-09-22, assumed)

- **Decision.** Source and docs stay in the OneDrive folder the user opened, with a GitHub remote; `DATA_DIR = %LOCALAPPDATA%\pokemon2` holds the database, raw cache, Cargo target and backups. If OneDrive sync interferes with `node_modules`, the repo moves out with GitHub as the source of truth.

## D-006 — Documentation and code in English; product UI in pt-BR (2026-09-22)

- **Decision.** Everything in the repository (docs, code, commit messages, schemas) is English. UI copy is pt-BR through a single strings module; card data is English by source.

## D-007 — Single local user, no authentication (2026-09-21)

- **Decision.** API bound to loopback; no accounts or ownership columns. Re-evaluated when hosting is planned (S08.T03).

## D-008 — Site stack: Node 24 + TypeScript, Fastify, React + Vite, pnpm monorepo (2026-09-21)

- **Decision.** `apps/api` (Fastify 5, zod type provider), `apps/web` (React 19, Vite, TanStack Router/Query), `apps/worker` (job runner, scheduler), `packages/shared|db|etl`, `engine/`. Node runs TypeScript directly (type stripping); no build step for server code.

---

## Open decisions (owned by the user)

| ID | Question | Needed by | Recommendation |
|---|---|---|---|
| O-1 | Project `LICENSE` | S01.T09 | Record source licences first (NOTICE), then choose |
| O-2 | GitHub repository name for `pokemon2` | S01.T01 | e.g. `ManoFardo-PR/pokemon2` next to the legacy `pokemon` |
| O-3 | Which Supabase-like host to target later | S08.T03 only | Any managed PostgreSQL ≥ 15 |
| O-4 | Typed schema layer: Drizzle (if its `node:sqlite` driver exists at implementation time) vs Kysely vs hand-written types | S01.T04 | **Resolved 2026-03-30** (see below) |

---

## D-009 — Resolution of O-4: Hand-written row types with schema drift verification (2026-03-30)

- **Context.** S01.T04 mandated resolving O-4 by scoring candidate typing approaches (Drizzle, Kysely, hand-written row types) against five architectural criteria: (a) zero native dependency; (b) migrations remain single source of truth without an ORM DSL; (c) deterministic codegen inside `pnpm check`; (d) clean raw SQL escape hatch for FTS5, `json_each` and dialect modules; (e) zero abstraction overhead on hot paths.
- **Decision.** Adopt hand-written row types in `@pokesearch/db/schema` paired with SQLite runtime `PRAGMA table_info` drift verification (`packages/db/src/schema.spec.ts`).
- **Verified facts.**
  1. `node:sqlite` is Node 24's built-in synchronous module. Neither Drizzle nor Kysely provides seamless first-class synchronous zero-dependency driver parity without external wrappers or asynchronous promises mismatching `DatabaseSync`.
  2. Migrations in `packages/db/migrations/NNNN_*.sql` are strictly the single source of truth. Maintaining duplicate schema declarations in Drizzle/Kysely DSLs violates criterion (b).
  3. The runtime `TABLES` descriptor in `@pokesearch/db/schema` enables automated drift tests (BR-S01.T04-09) with zero external dependencies and zero build step. Hot query paths use native prepared statements with exact typing at boundary interfaces.
- **Consequences.** `@pokesearch/db/schema` exports `SchemaMigrationRow`, `EtlRunRow`, domain unions, and the `TABLES` descriptor. Every subsequent stage adds its table types directly to `@pokesearch/db/schema` and verifies parity with SQLite pragmas.


[Docs index](../README.md) · [Vision and scope](01-vision-and-scope.md) · [Architecture](03-architecture-overview.md)
