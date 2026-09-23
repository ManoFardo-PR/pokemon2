# S05.T15 — Rules export/import (versioned seed)

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 15 / 16 |
| Depends on | [S05.T01](T01-rules-schema-migration.md), [S05.T07](T07-rule-codes-composition-semantics.md) |
| Unblocks | — |
| Parallel with | [S05.T08](T08-spreadsheet-import.md), [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `table` rules tables — from [S05.T01](T01-rules-schema-migration.md)
- `module` `rulesSnapshot` — from [S05.T07](T07-rule-codes-composition-semantics.md)
- `file` `pokemon/src/pokesearch/sim/{attack_effects.json, verified_cards.json, engine_fixes.json}` — the legacy's versioned rule artefacts and their formatting; read-only reference

## Outputs (proposed)
- `script` `pnpm rules:export` → `packages/db/seed/rules/{codes.json, text_codes/<xx>.json, sentences/<xx>.json, overrides.json}` (sharded by hash prefix, sorted, stable formatting) and `pnpm rules:import` (upsert; `--replace` to mirror exactly); `engine/scenarios/` stays the source for scenarios
- `file` `packages/db/seed/rules/manifest.json` — the seed's own record: format version, `rulesSnapshot`, row counts per file and a SHA-256 per shard, so an incomplete or hand-edited seed is detectable before it is imported

## Initial objective
The rules base lives in git as well as in the database: every change is diffable and reviewable, and a fresh database can be rebuilt from the repository plus the ETL.

## Context

The rules base is the only part of this project that is authored rather than fetched. Card data comes from two public sources and can be reloaded at any time; tournaments come from Limitless; jobs and measurements are produced by running things. The codes, the params and the classifications are work that exists nowhere else, and a local SQLite file outside OneDrive (D-002) is a single point of failure for it. Putting the rules base in git is therefore not a convenience — it is the backup, the review mechanism and the audit trail at once.

The legacy did exactly this and it worked: `attack_effects.json`, `verified_cards.json` and `engine_fixes.json` were versioned, each with a `version` field, sorted keys and `indent=1`, and `verified.save_store` shows the discipline — sort the cards, sort the parts, sort and dedupe the test ids, drop empties, and end with a newline. That formatting is not cosmetic. A file written with unstable key order produces a 5,000-line diff for a one-line change and the review stops happening. Every rule in this subtask about sorting, indentation and sharding exists to keep a diff readable.

The design question is granularity. One `rules.json` would be simple and would produce a 3–5 MB file whose every change touches one blob — unreviewable and merge-hostile. One file per text would be roughly 1,100 files in Standard and 5–6k across all sets, which is fine for git but slow to read and write and noisy in a file tree. The answer taken here is **sharding by the first two hex characters of the text hash**: 256 shards, each holding on the order of four to twenty texts in Standard, so a change to one text touches one small file and a bulk import touches many small files rather than one enormous one. `codes.json` stays a single file because codes are the shared vocabulary — there will be hundreds, not thousands, and seeing them all in one diff is a feature.

What is **not** exported matters as much. `effect_texts` and `card_parts` are derived from the card tables by [S05.T02](T02-effect-texts-and-card-parts.md) and are reproducible from the ETL; exporting them would create a second source of truth for card text, which is exactly what RN-01 and D-003 forbid. `rule_evidence` is not exported either: it is a statement about a specific engine build on a specific machine, and a proof imported from a file is not a proof. `rule_scenarios` is not exported because `engine/scenarios/**` already *is* the git representation ([S05.T11](T11-legacy-tests-to-scenarios.md)), and a mirror of a mirror is a drift generator. That leaves four things worth versioning: the codes, the per-text code lists with their params, the sentences with their classifications, and the card overrides.

The last piece is the guard. An export that nobody runs is a backup that does not exist. `pnpm check` therefore runs the exporter in a verify-only mode and fails when the database and the seed differ, which turns "I forgot to export" into a build failure rather than a lost afternoon. The escape hatch is `--allow-dirty`, for the middle of a bulk import, and it is loud.

## Scope

- **In scope.** `packages/db/src/rules/seed.ts` (`exportRules`, `importRules`, `diffSeed`, the canonical serializer); `pnpm rules:export`, `pnpm rules:import`, `pnpm rules:check-seed`; the on-disk layout and the sharding function; `manifest.json` and its checks; the `pnpm check` integration; the conflict and ordering rules for import; the fixtures.
- **Out of scope.** The schema ([S05.T01](T01-rules-schema-migration.md)); composition and `rulesSnapshot` ([S05.T07](T07-rule-codes-composition-semantics.md)); the three legacy importers, which write into the database and are then exported by this one ([S05.T08](T08-spreadsheet-import.md)–[S05.T10](T10-import-catalog-recipes.md)); scenarios, which live in `engine/scenarios/**` ([S05.T11](T11-legacy-tests-to-scenarios.md)); evidence ([S05.T12](T12-evidence-and-coverage-metrics.md)); the spreadsheet round trip, which is a different exchange format for a different audience ([S05.T08](T08-spreadsheet-import.md)); database backups ([S01.T02](../01-foundation/T02-sqlite-database-client.md)'s `pnpm db:backup`).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S05.T15-01 | Export → wipe → import reproduces the rules base exactly: `rulesSnapshot(db)` is identical before and after, and every exported row compares equal field by field. | the canonical serializer and `importRules`'s field-complete writes | `seed.spec.ts > export, wipe, import yields an identical rulesSnapshot`; `> every row compares equal after a round trip` |
| BR-S05.T15-02 | The seed is byte-stable: two exports of an unchanged database produce identical bytes, and a one-row change touches exactly one shard file plus `manifest.json`. | `canonicalJson()` — keys sorted, two-space indent, `\n` line endings, trailing newline, no `undefined`, integers never floated | `seed.spec.ts > two exports of the same database are byte-identical`; `> changing one text's params touches one shard and the manifest` |
| BR-S05.T15-03 | Only the four authored artefacts are exported. `effect_texts`, `card_parts`, `rule_evidence`, `rule_scenarios`, `rules_current`, `card_usage_cache` and every ETL table are excluded by construction. | `exportRules` has four writers and no table list to extend accidentally; a test enumerates the tables it reads | `seed.spec.ts > the exporter reads only rule_codes, text_codes, text_sentences and card_overrides` (statement capture) |
| BR-S05.T15-04 | `pnpm check` fails when the database and the seed differ, unless `--allow-dirty` is passed; the failure names the files and the row counts that differ. | `pnpm rules:check-seed` in `pnpm check`, comparing a freshly serialized export against the files on disk | `pnpm check` fails after a `text_codes` edit with no export, and passes after `pnpm rules:export` |
| BR-S05.T15-05 | `pnpm rules:import` is an upsert and never deletes: rows present in the database and absent from the seed are left alone and reported. `--replace` deletes them, in dependency order, inside one transaction, and is refused when a deletion would orphan a `text_codes` row. | two code paths with different names; the `--replace` path checks references before deleting | `seed.spec.ts > import leaves extra rows and reports them`; `> --replace removes them`; `> --replace refuses to delete a referenced code` |
| BR-S05.T15-06 | `manifest.json` records the format version, the `rulesSnapshot` at export time, per-file row counts and a SHA-256 per shard; an import verifies every hash before writing anything. | `writeManifest` / `verifyManifest`; the import aborts on the first mismatch, before the transaction opens | `seed.spec.ts > a hand-edited shard fails the manifest check and nothing is written`; `> a missing shard is detected` |
| BR-S05.T15-07 | An import is atomic: either every file lands or none does. A failure mid-way leaves the database exactly as it was. | one `BEGIN IMMEDIATE` around the whole import; the manifest verification happens first, outside it | `seed.spec.ts > an invalid row in the last shard leaves the database unchanged` |
| BR-S05.T15-08 | Imported rows are validated before being written: `ir_body_json` against the IR schema, `params_schema_json` against the JSON Schema subset, and every `text_codes.params_json` against its code's schema. A seed that would not compose is rejected. | `importRules` calls the [S05.T03](T03-effect-ir-vocabulary.md) and [S05.T07](T07-rule-codes-composition-semantics.md) validators on every row | `seed.spec.ts > a seed with an unknown IR op is rejected with the file and the row`; `> a seed whose params fail their schema is rejected` |
| BR-S05.T15-09 | The seed is portable: it contains no absolute path, no machine name, no timestamp that changes on re-export, and no engine build. Two developers exporting the same database produce the same bytes. | `canonicalJson` drops volatile fields; `updated_at` is exported (it is data) but `manifest.generatedAt` is not written | `seed.spec.ts > the seed contains no absolute path and no generatedAt`; `> two exports separated in time are byte-identical` |
| BR-S05.T15-10 | Sharding is by the first two lowercase hex characters of `text_hash`, giving 256 shards; the function is fixed and a shard file never holds a row belonging to another shard. | `shardOf(textHash) = textHash.slice(0, 2)`; the importer re-checks each row's shard | `seed.spec.ts > every row is in its own shard`; `> shardOf is stable for the committed fixtures` |

## Data operations

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `rule_codes` | R | script (`rules:export`) | every export | read-only; ordered by `code` | BR-S05.T15-03 |
| `text_codes` | R | script (`rules:export`) | every export | read-only; ordered by `(text_hash, ordinal)` | — |
| `text_sentences` | R | script (`rules:export`) | every export | read-only; ordered by `(text_hash, ordinal)` | — |
| `card_overrides` | R | script (`rules:export`) | every export | read-only; ordered by `(card_id, field)` | RN-76 |
| `packages/db/seed/rules/**` | C/U/D | script (`rules:export`) | on demand and before every commit | delete-then-write of the whole tree; a shard that would be empty is removed | BR-S05.T15-02 |
| `rule_codes` | C/U | script (`rules:import`) | seeding or restoring | upsert on `code`; every field written from the seed | BR-S05.T15-05 |
| `rule_codes` | D | script (`rules:import --replace`) | mirroring exactly | refused while referenced by `text_codes` | BR-S05.T15-05 |
| `text_codes` | C/U/D | script (`rules:import`) | seeding or restoring | delete-then-insert per `text_hash` present in the seed; texts absent from the seed are untouched unless `--replace` | — |
| `text_sentences` | C/U/D | script (`rules:import`) | seeding or restoring | same rule, per `text_hash` | — |
| `card_overrides` | C/U | script (`rules:import`) | seeding or restoring | upsert on `(card_id, field)`; `--replace` deletes the rest | RN-76 |
| `effect_texts`, `card_parts` | R | script (`rules:import`) | validating that a seeded `text_hash` exists | read-only; an unknown hash is reported, and its rows are skipped or the import fails under `--strict` | BR-S05.T15-03 |
| `rule_evidence`, `rule_scenarios`, `rules_current`, `card_usage_cache` | — | this subtask | never read, never written | evidence is per build; scenarios live in `engine/scenarios/**` | BR-S05.T15-03 |
| `cards`, `attacks`, `abilities`, `sets` | — | this subtask | never | the ETL owns them (D-003) | — |

## Interfaces

**On-disk layout.**

```
packages/db/seed/rules/
  manifest.json                 format version, rulesSnapshot, counts, per-shard sha256
  codes.json                    every rule_codes row, sorted by code
  overrides.json                every card_overrides row, sorted by (card_id, field)
  text_codes/
    00.json  01.json  …  ff.json      rows whose text_hash starts with that prefix
  sentences/
    00.json  01.json  …  ff.json      same sharding, for text_sentences
  legacy/                       the importers' inputs, committed so an import needs no legacy tree
    attack_ops_map.json               S05.T09
    catalog_recipes.json              S05.T10
    lambda_map.json                   S05.T10
```

Only shards that have rows exist; an export removes a shard that has become empty. With ~1,100 Standard texts, `text_codes/` holds well under 256 files averaging a handful of texts each, and a single-text edit is a small diff in one of them.

**File shapes.** `codes.json`:

```jsonc
{
  "version": 1,
  "codes": [
    {
      "code": "DMG_PLUS_IF_TARGET_TAG",
      "category": "modifier",
      "wraps": "none",
      "phase": "after_damage",
      "onceScope": "none",
      "status": "exact",
      "pattern": "The attacks of the Pokémon this card is attached to do {n} more damage to your opponent's Active {tag}.",
      "paramsSchema": { "type": "object", "additionalProperties": false,
                        "required": ["n", "tag", "holder"],
                        "properties": { "n": { "type": "integer", "minimum": 0, "maximum": 200 },
                                        "tag": { "type": "string", "enum": ["ex", "v", "vstar", "tera"] },
                                        "holder": { "$ref": "#/$defs/Filter" } } },
      "irBody": { "modifier": { "hook": "damage_out", "scope": "holder", "value": { "param": "n" },
                                "when": { "all_of": [ … ] }, "no_stack_key": null } },
      "approxNote": null,
      "notes": "import:catalog brave bangle; ruling: 'before applying Weakness and Resistance' = damage_out",
      "createdAt": "2026-09-22T10:00:00Z",
      "updatedAt": "2026-09-22T10:00:00Z"
    }
  ]
}
```

`text_codes/<xx>.json`:

```jsonc
{
  "version": 1,
  "shard": "3f",
  "texts": [
    {
      "textHash": "3f2c…",
      "kind": "attack",
      "name": "Concentrated Fire",
      "excerpt": "Flip a coin for each Fire Energy attached to this Pokémon. This attack does 80 damage for each heads.",
      "items": [
        { "ordinal": 0, "code": "COIN_FLIPS_PER_COUNTER", "sentenceFrom": 0, "sentenceTo": 0,
          "source": "manual", "updatedAt": "2026-09-22T10:00:00Z",
          "params": { "counter": { "energy_count": { "slot": "self", "type": "Fire" } } } },
        { "ordinal": 1, "code": "DMG_PER_HEADS", "sentenceFrom": 1, "sentenceTo": 1,
          "source": "manual", "updatedAt": "2026-09-22T10:00:00Z",
          "params": { "n": 80, "offset": 1 } }
      ]
    }
  ]
}
```

`kind`, `name` and `excerpt` are **comments in data form**: they are written on export from `effect_texts` so a diff is readable without a database, and they are ignored on import. The importer reads only `textHash`, `items` and their fields; a mismatch between `excerpt` and the database's text is reported as a warning, because it usually means the wording changed upstream.

`sentences/<xx>.json` mirrors `text_sentences`: `{ version, shard, texts: [{ textHash, sentences: [{ ordinal, sentence, classification }] }] }`. `overrides.json`: `{ version, overrides: [{ cardId, field, value, reason, createdAt }] }`.

`manifest.json`:

```jsonc
{
  "version": 1,
  "rulesSnapshot": "b41f…",
  "counts": { "codes": 312, "textCodes": 1104, "textCodeItems": 2487, "sentences": 1104,
              "sentenceRows": 2612, "overrides": 8 },
  "files": { "codes.json": "sha256:…", "overrides.json": "sha256:…",
             "text_codes/3f.json": "sha256:…", "sentences/3f.json": "sha256:…" }
}
```

There is no `generatedAt` and no machine identity: the manifest must be a pure function of the database (BR-S05.T15-09).

**Canonical serializer.** `canonicalJson(value)`: object keys sorted ascending by code unit; two-space indent; `\n` line endings; one trailing newline; `undefined` and `null`-valued optional fields omitted rather than written as `null`; integers serialized without a decimal point; strings written with the minimal JSON escaping (no `\uXXXX` for printable non-ASCII, so `Pokémon` stays readable in a diff); arrays in the order the query produced, which is always an explicit `ORDER BY`. The legacy's `verified.save_store` is the reference for the discipline — sort, dedupe, drop empties, end with a newline.

**Module.**

```ts
export interface SeedPaths { root: string; }               // default packages/db/seed/rules
export interface ExportResult { files: string[]; removed: string[]; counts: SeedCounts; rulesSnapshot: string; }
export interface ImportResult { inserted: SeedCounts; updated: SeedCounts; skipped: SeedCounts;
                                extraInDb: { codes: string[]; texts: string[] }; warnings: string[]; }
export interface SeedDiff { onlyInDb: SeedRef[]; onlyInSeed: SeedRef[]; different: SeedRef[]; }

export function exportRules(db: Db, paths?: SeedPaths): ExportResult;
export function importRules(db: Db, paths?: SeedPaths,
                            opts?: { replace?: boolean; strict?: boolean; dryRun?: boolean }): ImportResult;
export function diffSeed(db: Db, paths?: SeedPaths): SeedDiff;
export function shardOf(textHash: string): string;          // textHash.slice(0, 2)
export function canonicalJson(value: unknown): string;
```

**CLI.**

```
pnpm rules:export      [--root <dir>] [--json]
pnpm rules:import      [--root <dir>] [--replace] [--strict] [--dry-run] [--json]
pnpm rules:check-seed  [--root <dir>] [--allow-dirty] [--json]
```

`rules:export` exit codes: 0 ok, 2 the database is unavailable. `rules:import`: 0 ok, 1 validation failures (nothing written), 2 a manifest mismatch (nothing written), 3 `--replace` refused because a deletion would orphan a reference. `rules:check-seed`: 0 identical, 1 the seed is out of date (the differing files and counts are listed), 2 the seed is missing entirely.

**Import order**, because the foreign keys are real: `rule_codes` (upsert) → `text_sentences` (per text) → `text_codes` (per text) → `card_overrides`. Under `--replace` the deletions run in the reverse order inside the same transaction. A `text_codes` row whose `text_hash` is not in `effect_texts` is skipped with a warning by default and fails the import under `--strict`; a `card_overrides` row whose `card_id` is not in `cards` is treated the same way. Both cases are normal when the seed is imported before a full ETL load, which is why the default is lenient and the strict mode exists for CI.

**`pnpm check` integration.** `pnpm check` runs `pnpm rules:check-seed`. It compares a freshly serialized export against the files on disk — not the manifest hashes against themselves, which would pass on a database that has moved on — and fails with a list of the differing files and their row-count deltas. `--allow-dirty` is honoured only when it is passed explicitly on the command line, never from an environment variable, so a CI run cannot be quietly excused.

## Implementation steps

1. Write `canonicalJson` with its rules and a spec covering key order, indentation, non-ASCII, integers, omitted nulls and the trailing newline.
2. Write `shardOf` and the directory layout helpers; spec that every fixture row lands in its own shard.
3. Write `exportRules` for `codes.json` and `overrides.json` with explicit `ORDER BY`; spec byte-stability across two runs.
4. Add the `text_codes/` and `sentences/` shard writers, including the `kind`/`name`/`excerpt` decoration read from `effect_texts` and the removal of shards that became empty.
5. Write `manifest.json` and `verifyManifest`; spec the hand-edited-shard and missing-shard cases.
6. Write `importRules` with the four-stage order, the per-text delete-then-insert, the upserts and the single transaction; spec atomicity with a deliberately invalid last shard.
7. Add the row validators (IR schema, params schema, `validateParams`) ahead of the write; spec both rejection cases.
8. Add `--replace` with the reference check and the reverse-order deletions; spec the refusal.
9. Write `diffSeed` and `pnpm rules:check-seed`, and add it to `pnpm check`; spec that an unexported edit fails and an export fixes it.
10. Commit the legacy input files (`attack_ops_map.json`, `catalog_recipes.json`, `lambda_map.json`) under `seed/rules/legacy/` so a fresh clone can run the importers without the legacy tree.
11. Run the full cycle on the real database after the three importers: export, inspect the diff size, wipe the four tables, import, and confirm `rulesSnapshot` is identical; record the file count and the total seed size in the completion note.

## Edge cases and error handling

- **A text hash in the seed that no longer exists in `effect_texts`** — the wording changed upstream after the export. Default: the rows are skipped and reported as a warning with the excerpt, so the codes are visibly stranded rather than silently dropped. `--strict` fails instead, which is what CI uses. The recovery path is the near-duplicate report of [S05.T02](T02-effect-texts-and-card-parts.md) plus "repoint" in the editor.
- **A hand-edited shard file.** The manifest's SHA-256 does not match and the import aborts before opening a transaction, naming the file. Hand editing is not forbidden — it is a JSON file in git — but it has to be followed by an export, which is exactly what `pnpm rules:check-seed` enforces from the other direction.
- **A seed whose `irBody` uses an IR op this build does not have** — the seed is newer than the code. Validation rejects it with the file, the row and the op name, and nothing is written. The version fields on both sides make the mismatch legible.
- **`--replace` on a database with hand-authored codes not in the seed.** They are deleted, which is what `--replace` means. The command prints the list and requires confirmation unless `--json` is passed (CI). A code still referenced by a `text_codes` row is refused outright (exit 3), because deleting it would change what a card means.
- **A merge conflict in a shard file.** Two people editing different texts that hash into the same shard produce a conflict inside a JSON array. The `texts` array is sorted by `textHash`, so the conflicting hunks are adjacent but distinct and resolve by taking both. This is the main cost of sharding over one-file-per-text and it is accepted; with a single local user it is rare, and the ordering makes it mechanical when it happens.
- **An export run mid-import** (the three legacy importers write in batches). The exporter reads inside a single read transaction, so it sees a consistent snapshot; `pnpm rules:check-seed` will then disagree with the database a moment later, which is what `--allow-dirty` is for during a bulk run.
- **The seed directory does not exist.** `rules:import` exits 2 with the expected path; `rules:check-seed` exits 2; `rules:export` creates it. A fresh clone therefore has a working import and a meaningful error if the seed was never committed.
- **A `card_overrides` row for a card that is not loaded yet** — the seed is imported before the ETL. Skipped with a warning by default, because a fresh database is built as migrate → seed → ETL → seed again in practice; `--strict` is for the CI ordering where the ETL has run.
- **Two codes differing only in `notes`.** The seed differs, `rulesSnapshot` does not ([S05.T07](T07-rule-codes-composition-semantics.md) excludes `notes`). `pnpm rules:check-seed` still fails, correctly: the seed is the repository's copy of the rows, not of the snapshot, and an unexported note is still unexported work.
- **A very large params blob** — a deeply nested filter. It is written inline with the canonical serializer; no special handling. If a single text's entry ever exceeds a few hundred lines it is a sign the code is under-parametrized, which is a review comment, not a format problem.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/db test seed.spec.ts` green, including `> export, wipe, import yields an identical rulesSnapshot` — the check the original file asked for (BR-S05.T15-01).
- [ ] `seed.spec.ts > two exports of the same database are byte-identical` and `> two exports separated in time are byte-identical` (BR-S05.T15-02, -09).
- [ ] `seed.spec.ts > changing one text's params touches one shard and the manifest` — the diff is two files (BR-S05.T15-02, -10).
- [ ] `seed.spec.ts > the exporter reads only rule_codes, text_codes, text_sentences and card_overrides` (statement capture) and `> the seed contains no absolute path and no generatedAt` (BR-S05.T15-03, -09).
- [ ] `pnpm check` fails after editing a `text_codes` row without exporting, names the differing shard and its row-count delta, and passes after `pnpm rules:export` (BR-S05.T15-04).
- [ ] `seed.spec.ts > a hand-edited shard fails the manifest check and nothing is written` and `> a missing shard is detected` (BR-S05.T15-06).
- [ ] `seed.spec.ts > an invalid row in the last shard leaves the database unchanged` (BR-S05.T15-07).
- [ ] `seed.spec.ts > a seed with an unknown IR op is rejected with the file and the row` and `> a seed whose params fail their schema is rejected` (BR-S05.T15-08).
- [ ] `seed.spec.ts > import leaves extra rows and reports them`, `> --replace removes them`, and `> --replace refuses to delete a referenced code` with exit 3 (BR-S05.T15-05).
- [ ] `seed.spec.ts > every row is in its own shard` over the whole real base (BR-S05.T15-10).
- [ ] Full cycle on the real database after the three importers: `pnpm rules:export`, wipe the four tables, `pnpm rules:import`, `rulesSnapshot` identical; the file count, the total seed size and the largest shard are recorded in the completion note.

## Risks and open questions

- **Risk — the check is disabled because it is noisy during bulk imports.** Once `--allow-dirty` becomes habitual the guarantee is gone. Mitigation: the flag is command-line only (never an environment variable), the importers' own completion step runs `pnpm rules:export` (step 10 of [S05.T09](T09-import-attack-effects-json.md) and step 12 of [S05.T10](T10-import-catalog-recipes.md)), and `pnpm rules:check-seed` prints the exact command that fixes it.
- **Risk — 256 shards is the wrong granularity** once the base covers every set rather than Standard: ~5–6k texts would put 20–25 texts in each shard and make diffs noisier. Mitigation: `shardOf` is one function and the layout version is in `manifest.json`; moving to three hex characters (4,096 shards) is a re-export and a version bump, not a redesign. Revisit when the all-sets rebuild lands.
- **Risk — the seed and `engine/scenarios/**` drift** into two overlapping notions of "the rules in git". Mitigation: the boundary is stated here and in the layout — scenarios are files, never exported; codes and params are rows, never files except through this exporter. Nothing mirrors anything twice.
- **Risk — the excerpt decoration goes stale** and a reviewer reads a diff against the wrong text. Mitigation: the import warns on an excerpt mismatch, and the excerpt is rewritten on every export, so it is stale only between an ETL wording change and the next export — which `pnpm rules:check-seed` will flag anyway, because the excerpt is part of the file.
- **Question — should the seed be one branchable artefact per set rotation?** A rotation changes which texts are Standard but not the codes themselves, so the seed does not need branching. Recommendation: none; the seed covers whatever texts have codes, regardless of legality.
- **Question — should `rule_evidence` be exported for archival?** It is deliberately excluded: a proof is a statement about a build on a machine, and importing one would resurrect the legacy's problem of a proof with no build attached. If the user wants historical coverage across machines, the right artefact is `coverage_history` ([S05.T14](T14-coverage-page-and-authoring-queue.md)), which is a summary rather than a claim. Worth confirming, since it decides what survives a machine change.
- **DEPENDENCY-PROPOSAL: S05.T15 should depend on S05.T03 because** `importRules` validates every seeded `ir_body_json` against the IR schema and every `params_schema_json` against the JSON Schema subset; today it reaches those validators only transitively through [S05.T07](T07-rule-codes-composition-semantics.md).

## References

- `pokemon/src/pokesearch/sim/verified.py` L56–59 (`save_store`) — verified: `{k: {p: sorted(set(t)) for p, t in sorted(v.items()) if t} for k, v in sorted(cards.items())}`, empties dropped, `json.dumps(..., ensure_ascii=False, indent=1)` and a trailing newline. The formatting discipline `canonicalJson` generalises.
- `pokemon/src/pokesearch/sim/attack_effects.json` — verified: `version: 1` with a `cards` object keyed by `name_key`, sorted keys, one entry per attack carrying its source and timestamp. The single-file shape this subtask shards instead, and the reason: at 318 KB it is already an unreviewable diff for a one-attack change.
- `pokemon/src/pokesearch/sim/engine_fixes.json` — verified: `version: 1`, a `cards` object with a `motivo` on every entry, plus `substituir` and `substituir_manual` blocks. The `card_overrides` ancestry and the rule that every correction carries a reason (RN-76).
- `pokemon/src/pokesearch/sim/verified_cards.json` — verified: `version: 1`, 109 cards, sorted card keys and sorted part keys. The format this subtask deliberately does **not** export, because evidence belongs to an engine build ([S05.T12](T12-evidence-and-coverage-metrics.md)).
- [S05.T01](T01-rules-schema-migration.md) (the four exported tables, their keys and their foreign keys, which fix the import order), [S05.T07](T07-rule-codes-composition-semantics.md) (`rulesSnapshot`'s field list, which is why a `notes` edit changes the seed and not the snapshot), [S05.T03](T03-effect-ir-vocabulary.md) (the IR schema every seeded body is validated against), [S01.T02](../01-foundation/T02-sqlite-database-client.md) (`pnpm db:backup`, which backs up the file; this subtask backs up the work).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
