# S05.T01 — Rules schema migration

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 1 / 16 |
| Depends on | [S01.T04](../01-foundation/T04-database-migration-framework.md), [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) |
| Unblocks | [S05.T02](T02-effect-texts-and-card-parts.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md) |
| Parallel with | [S05.T03](T03-effect-ir-vocabulary.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` migration runner and conventions — from [S01.T04](../01-foundation/T04-database-migration-framework.md)
- `table` `cards`, `attacks`, `abilities` (foreign keys, part indexes) — from [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md)
- `decision` D-004 — codes per sentence, params per card — from `project/02-decision-log.md`
- `file` `pokemon/src/pokesearch/db/schema.sql` L228–265 (`card_impl`, `card_audit`) — the three-notions-of-correct model this migration replaces; read-only reference

## Outputs (proposed)
- `file` `packages/db/migrations/0006_rules.sql` — `effect_texts(text_hash PK, kind ability|attack|trainer|energy|rule_box, name, text)`; `card_parts(card_id, part_kind, part_idx, text_hash)` PK `(card_id, part_kind, part_idx)`; `rule_codes(code PK, pattern, params_schema_json, category, ir_body_json, status draft|exact|approx|builtin|unimplemented, approx_note, notes, updated_at)`; `text_codes(text_hash, ordinal, code, params_json, sentence_from, sentence_to)` PK `(text_hash, ordinal)`; `text_sentences(text_hash, ordinal, sentence, classification_json)` PK `(text_hash, ordinal)`; `card_overrides(card_id, field, value_json, reason)` PK `(card_id, field)`; `rule_scenarios(id PK, title, scenario_json, verifies_json, source, updated_at)`; `rule_evidence(id, text_hash, code, kind scenario|twinleaf_diff|attr_only|builtin, ref, passed, engine_build, rules_snapshot, run_at)` insert-only; view `card_status(card_id, exact, proven, missing_codes, unproven_codes)` — consumed by [S05.T02](T02-effect-texts-and-card-parts.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T12](T12-evidence-and-coverage-metrics.md), [S05.T15](T15-rules-export-import-seed.md)
- `table` indexes: `card_parts(text_hash)`, `text_codes(code)`, `rule_evidence(text_hash, passed)`, `rule_evidence(code, engine_build)`
- `table` `rules_current(id CHECK (id = 1), engine_build, rules_snapshot, updated_at)` — the single row naming the build and snapshot that `card_status` judges "proven" against; written by the worker. Added during this elaboration because the view needs a stable notion of "the current build"; it introduces no new dependency.

## Initial objective
The rules base has one home with a clear separation between what a text *is* (sentences), what it *means* (codes + params), how a code *executes* (IR body or builtin) and what has been *proven* (evidence) — replacing the legacy's three divergent notions of 'correct'.

## Context

The legacy project answered "is this card right?" in three unrelated places, and the three disagreed. `card_impl` (`schema.sql` L228–241) held a per-name `status` string — `engine | generated | approved | rejected | failed | vanilla` — written by whichever loader ran last. `card_audit` (L245–262) held one row per *engine id* with an attribute verdict and a separate LLM verdict (`confere | incompleto | divergente | nao_avaliavel`) that nobody was allowed to act on. `verified_cards.json` held a third structure, `name_key → part → [test node ids]`, rewritten only by `pytest --write-verified`. The coverage number on `/sim/cards` was assembled from all three at request time by `sim/coverage.py::exact_coverage`, and its denominator came from a fourth place, a 3.5 s aggregate over `deck_cards`. Nothing keyed on the printed text, so two printings of Dunsparce — `sv9-120` "Trading Places" and the TEF printing with "Dig" — shared one row and one verdict.

D-004 replaces all of it with one chain: a **text** (hash of the printed wording) carries an ordered list of **codes with params**; a code carries an **IR body** and a **status**; a **scenario** produces **evidence** for a `(text, code)` pair on a named engine build; a **view** turns those facts into `exact` and `proven` per printing. This migration is that chain's schema, and it is the first thing built in the stage because eight other subtasks write into it.

Three properties are structural rather than procedural here, because "we will be careful" is what failed last time.

1. **`rule_evidence` is insert-only** (RN-64). Two `BEFORE` triggers abort every `UPDATE` and every `DELETE`. An audit, a lint or an LLM review can add rows and can add a `passed = 0` row that supersedes an earlier pass, but nothing can rewrite history. Proof is a ledger.
2. **`card_overrides` cannot rename anything** (RN-76). The legacy allowed only six attribute kinds to be corrected (`audit.py` L343: `FIXABLE = ("hp", "prêmios", "recuo", "fraqueza", "resistência", "regra")`) with the comment *"Nomes de ataque e de habilidade nunca entram, porque a lógica do motor se apoia neles"*. Here that allow-list is a `CHECK` constraint, not a Python tuple.
3. **`exact` and `proven` are derived, never stored.** There is no status column on a card. `card_status` computes both from codes and evidence, so a code edited to `draft` immediately lowers `exact` for every printing that shares the text, and a new engine build immediately lowers `proven` for everything until scenarios rerun (RN-73 as revised).

The migration touches nothing outside its own tables: `card_parts` and `card_overrides` reference `cards(id)` with `ON DELETE CASCADE`, which is real because [S01.T02](../01-foundation/T02-sqlite-database-client.md) turns foreign keys on for every connection. A re-load of a set therefore drops that printing's parts and overrides with it, and [S05.T02](T02-effect-texts-and-card-parts.md) rebuilds the parts; `effect_texts` survives, because a text outlives the printings that carry it.

## Scope

- **In scope.** `packages/db/migrations/0006_rules.sql` with the full DDL below (nine tables, the `card_status` view, the two insert-only triggers, eleven indexes); the `@pokesearch/db/schema` row types for all of them and their entry in the drift descriptor; `packages/db/migrations/0006_rules.md` recording why evidence is a ledger, why `rules_current` exists and how the legacy's three tables map onto the new ones.
- **Out of scope.** Filling any table: texts and parts are [S05.T02](T02-effect-texts-and-card-parts.md), codes and their composition [S05.T07](T07-rule-codes-composition-semantics.md), sentences [S05.T08](T08-spreadsheet-import.md), scenarios [S05.T11](T11-legacy-tests-to-scenarios.md), evidence and the coverage query [S05.T12](T12-evidence-and-coverage-metrics.md). The IR grammar that `ir_body_json` must satisfy is [S05.T03](T03-effect-ir-vocabulary.md) and is *not* enforced by SQL. Measurement tables are `0007` ([S05.T16](T16-measurement-model-and-suite-v6-freeze.md)). Applying overrides to a `CardDef` is [S04.T02](../04-game-engine-core/T02-card-definition-model.md).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-64 | **Kept, as insert-only evidence.** An audit, a lint or a review never alters a card: it can only append to `rule_evidence`. No `UPDATE` and no `DELETE` succeeds on that table, from any process. | triggers `rule_evidence_no_update` / `rule_evidence_no_delete` in `0006_rules.sql`; no update or delete statement for the table anywhere in `packages/db`, `apps/api`, `apps/worker` | `rules-schema.spec.ts > rule_evidence rejects UPDATE and DELETE` (both raise `SQLITE_CONSTRAINT_TRIGGER`); `pnpm check` greps the three packages for `UPDATE rule_evidence` / `DELETE FROM rule_evidence` and fails on a hit |
| RN-76 | **Kept.** An attribute fix touches values only, never names, and always carries a reason: `card_overrides.field` is limited to an allow-list that contains no name field, and `reason` is `NOT NULL` with a non-empty `CHECK`. | the `CHECK (field IN (…))` and `CHECK (length(trim(reason)) > 0)` on `card_overrides` | `rules-schema.spec.ts > card_overrides rejects field 'name'` and `> rejects an ability rename`; `> rejects an empty reason` |
| BR-S05.T01-01 | A card's `exact` is 1 exactly when every part of that printing that has a text (excluding `rule_box` parts) has at least one `text_codes` row and every code those rows reference has status `exact` or `builtin`; a printing with no texted part is `exact = 1`. | the `part_state` CTE of the `card_status` view | `card-status.spec.ts > a card with no effect text is exact`; `> one draft code makes the whole card inexact` |
| BR-S05.T01-02 | A card's `proven` is 1 only when it is `exact`, every `(text, code)` pair of its texted parts has a latest passing evidence row for `rules_current.engine_build`, and the printing has a passing `attr_only` row for the same build. | the `proven_pair`, `attr_ok` CTEs and the `proven` expression of the view | `card-status.spec.ts > proven requires evidence on the current build`; `> bumping rules_current.engine_build sets proven to 0 and leaves exact at 1` |
| BR-S05.T01-03 | Within one engine build, the **latest** evidence row for a `(text_hash, code, kind, ref)` group decides; an appended `passed = 0` row therefore removes proof without deleting anything. | `e.id = (SELECT MAX(id) …)` inside `proven_pair` | `card-status.spec.ts > a later failing row supersedes an earlier passing one` |
| BR-S05.T01-04 | `rule_evidence.kind = 'attr_only'` rows name a printing and no text (`card_id NOT NULL`, `text_hash NULL`, `code NULL`); every other kind names a text and a code. | the `CHECK` on `rule_evidence` combining `kind`, `card_id`, `text_hash` and `code` | `rules-schema.spec.ts > attr_only evidence without card_id is rejected`; `> scenario evidence without code is rejected` |
| BR-S05.T01-05 | `rule_codes.status = 'approx'` requires a non-empty `approx_note`, and `status = 'builtin'` requires `ir_body_json` of the exact shape `{"builtin":"<name>"}`. | two `CHECK` constraints on `rule_codes` (the second uses `json_extract`, inside a tagged dialect block) | `rules-schema.spec.ts > approx without a note is rejected`; `> builtin with a non-builtin body is rejected` |
| BR-S05.T01-06 | `text_codes.ordinal` is dense and 0-based per text, and `sentence_from ≤ sentence_to`; a code may span several sentences but never a negative range. | `CHECK (ordinal >= 0)`, `CHECK (sentence_from >= 0 AND sentence_to >= sentence_from)`, and the density assertion in `composeProgram` ([S05.T07](T07-rule-codes-composition-semantics.md)) | `rules-schema.spec.ts > sentence_to before sentence_from is rejected`; `compose.spec.ts > a gap in ordinals fails composition` |
| BR-S05.T01-07 | Deleting a printing removes its parts and its overrides and leaves `effect_texts`, `rule_codes` and `rule_evidence` untouched: rules are about texts, not about printings. | `ON DELETE CASCADE` on `card_parts.card_id` and `card_overrides.card_id`; no cascade from `cards` to `effect_texts` | `rules-schema.spec.ts > deleting a card removes its parts and overrides only` |
| BR-S05.T01-08 | `0006_rules.sql` inserts exactly one row — the `rules_current` singleton with a placeholder build — and applies inside one transaction; every other table is empty after the migration. | the single `INSERT INTO rules_current` at the end of the file; no other `INSERT` | `migrate.spec.ts > 0006 applies on a fresh temp DB, version 6, one row in rules_current, zero elsewhere, PRAGMA foreign_key_check clean` |
| BR-S05.T01-09 | Row types in `@pokesearch/db/schema` match the migrated database column-for-column, including nullability, for all nine tables and the view. | the drift test from [S01.T04](../01-foundation/T04-database-migration-framework.md) reading `PRAGMA table_info` | `schema-drift.spec.ts > 0006 tables match their TypeScript row types` |

## Data operations

The migration itself is one DDL step run by the migration runner under `pnpm db:migrate`, idempotent by version. The table below fixes who may write each object afterwards — the ownership the rest of the stage is held to. The engine appears once, to say that it never appears.

| Entity | Operation (C/R/U/D) | Actor (api/worker/script) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `effect_texts` | C | script (`rules:rebuild-parts`) | after every ETL card load | insert-if-absent on `text_hash`; identical wording never creates a second row | [S05.T02](T02-effect-texts-and-card-parts.md), RN-05 |
| `effect_texts` | R | api, worker, script | editor, composition, coverage, export | read-only | — |
| `card_parts` | C/D | script (`rules:rebuild-parts`) | after every ETL card load | delete-then-insert per `card_id`; re-running yields identical rows | [S05.T02](T02-effect-texts-and-card-parts.md) |
| `rule_codes` | C/U | api (`PUT /api/rules/codes/:code`) | authoring in the editor | upsert on `code`; `updated_at` rewritten; `code` never renamed (a rename is a new code plus a repoint) | [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T13](T13-rules-editor-ui.md) |
| `rule_codes` | C/U | script (`rules:import-*`, `rules:import`) | legacy imports, seed import | upsert on `code`; an import never downgrades a hand-authored `exact` code to `draft` | [S05.T09](T09-import-attack-effects-json.md), [S05.T10](T10-import-catalog-recipes.md), [S05.T15](T15-rules-export-import-seed.md) |
| `rule_codes` | D | script (`rules:import --replace`) | mirroring a seed exactly | refused while any `text_codes` row references the code | [S05.T15](T15-rules-export-import-seed.md) |
| `text_codes` | C/U/D | api (`PUT /api/rules/texts/:hash/codes`) | authoring | delete-then-insert of the whole ordered list per `text_hash`, in one transaction | [S05.T13](T13-rules-editor-ui.md) |
| `text_codes` | C | script (`rules:import-xlsx`, `rules:import-attack-effects`, `rules:import-catalog`) | imports | insert only where the `(text_hash, ordinal)` slot is free; conflicts are reported, never overwritten | [S05.T08](T08-spreadsheet-import.md)–[S05.T10](T10-import-catalog-recipes.md) |
| `text_sentences` | C/U/D | script (`rules:import-xlsx`) | spreadsheet import | delete-then-insert per `text_hash`; `classification_json` carries the seven spreadsheet columns | [S05.T08](T08-spreadsheet-import.md) |
| `card_overrides` | C/U/D | api, script | when an attribute of a source card is wrong | upsert on `(card_id, field)`; `reason` mandatory; names are not a valid `field` | RN-76 |
| `rule_scenarios` | C/U/D | script (`rules:sync-scenarios`) | after editing `engine/scenarios/**` | delete-then-insert of the whole mirror; git is the source of truth | [S05.T11](T11-legacy-tests-to-scenarios.md) |
| `rule_evidence` | C | worker (job kind `scenarios`) | after a scenario run, after an engine build change | append only; one row per `(text, code, kind, ref, build)` run, never an upsert | [S05.T12](T12-evidence-and-coverage-metrics.md), RN-64 |
| `rule_evidence` | C | worker (`attr_only`, `twinleaf_diff`) | CardDef derivation check; oracle diff | append only | [S05.T12](T12-evidence-and-coverage-metrics.md), [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md) |
| `rule_evidence` | U / D | — | never | the two triggers abort; there is no application code path | RN-64 |
| `rules_current` | U | worker | at startup and whenever `ptcg-cli --version` or `rulesSnapshot(db)` changes | single row `id = 1`; `UPDATE` only, never `INSERT`/`DELETE` | [S05.T12](T12-evidence-and-coverage-metrics.md) |
| `card_status` (view) | R | api, worker, script | coverage endpoint, authoring queue, optimizer pool | read-only by definition | [S05.T12](T12-evidence-and-coverage-metrics.md), [S07.T01](../07-deck-optimizer/T01-candidate-pool-and-move-generation.md) |
| any of the above | — | engine | never | the engine receives compiled programs in the job JSON and does not open the database | Architecture principle 1 |

## Interfaces

**`packages/db/migrations/0006_rules.sql`**

```sql
-- 0006_rules.sql — the card rules base (D-004): what a text IS, what it MEANS, how it EXECUTES, what is PROVEN.
-- Owner: S05.T01 (schema). Rows: S05.T02 (texts/parts), S05.T07-T10 (codes), S05.T11 (scenarios), S05.T12 (evidence).
-- Replaces the legacy card_impl / card_audit / verified_cards.json triple (schema.sql L228-265).
-- Postgres: *_json TEXT -> jsonb (+ GIN on text_codes.params_json and rule_codes.ir_body_json); the view is unchanged;
--   the two insert-only triggers become BEFORE triggers calling a RAISE EXCEPTION function.

CREATE TABLE effect_texts (
    text_hash  TEXT PRIMARY KEY,          -- sha256(kind || 0x1F || norm(name) || 0x1F || normText(text)), lowercase hex
    kind       TEXT    NOT NULL,
    name       TEXT    NOT NULL,          -- printed ability/attack name; '' for trainer, energy and rule_box
    text       TEXT    NOT NULL,          -- printed text, verbatim; normalization lives in the hash, not here
    text_norm  TEXT    NOT NULL,          -- normText(text); what the editor and the importers match on
    first_seen TEXT    NOT NULL,          -- 'YYYY-MM-DDTHH:MM:SSZ'
    CHECK (kind IN ('ability', 'attack', 'trainer', 'energy', 'rule_box')),
    CHECK (length(text_hash) = 64),
    CHECK (length(trim(text)) > 0)
);
CREATE INDEX effect_texts_kind_idx ON effect_texts (kind);
CREATE INDEX effect_texts_name_idx ON effect_texts (name);

CREATE TABLE card_parts (
    card_id   TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    part_kind TEXT    NOT NULL,
    part_idx  INTEGER NOT NULL,           -- abilities.idx / attacks.idx; 0 for trainer, energy, rule_box
    text_hash TEXT             REFERENCES effect_texts(text_hash),   -- NULL = part with no text (exact by construction)
    PRIMARY KEY (card_id, part_kind, part_idx),
    CHECK (part_kind IN ('ability', 'attack', 'trainer', 'energy', 'rule_box')),
    CHECK (part_idx >= 0)
);
CREATE INDEX card_parts_text_hash_idx ON card_parts (text_hash);

CREATE TABLE rule_codes (
    code               TEXT    PRIMARY KEY,          -- UPPER_SNAKE, permanent, never renamed
    pattern            TEXT    NOT NULL,             -- sentence pattern with {placeholders}
    params_schema_json TEXT    NOT NULL DEFAULT '{"type":"object","additionalProperties":false,"properties":{}}',
    category           TEXT    NOT NULL,
    wraps              TEXT    NOT NULL DEFAULT 'none',       -- wrapper arity: none | next | rest
    once_scope         TEXT    NOT NULL DEFAULT 'none',       -- RN-16, declared per code
    ir_body_json       TEXT    NOT NULL,             -- an IR fragment (S05.T03) or {"builtin":"<name>"}
    status             TEXT    NOT NULL DEFAULT 'draft',
    approx_note        TEXT,
    notes              TEXT,                         -- provenance, ruling, legacy source
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL,
    CHECK (category IN ('effect', 'attack_modifier', 'modifier', 'trigger', 'wrapper')),
    CHECK (wraps IN ('none', 'next', 'rest')),
    CHECK (wraps = 'none' OR category = 'wrapper'),
    CHECK (once_scope IN ('none', 'per_instance', 'per_name', 'per_game')),
    CHECK (status IN ('draft', 'exact', 'approx', 'builtin', 'unimplemented')),
    CHECK (status <> 'approx' OR (approx_note IS NOT NULL AND length(trim(approx_note)) > 0)),
    CHECK (code = upper(code) AND code NOT LIKE '% %')
);
CREATE INDEX rule_codes_status_idx   ON rule_codes (status);
CREATE INDEX rule_codes_category_idx ON rule_codes (category);

-- @postgres: (ir_body_json->>'builtin') IS NOT NULL
-- @sqlite-only
CREATE TRIGGER rule_codes_builtin_shape_ins BEFORE INSERT ON rule_codes
WHEN NEW.status = 'builtin' AND json_extract(NEW.ir_body_json, '$.builtin') IS NULL
BEGIN SELECT RAISE(ABORT, 'a builtin code must have ir_body_json = {"builtin":"<name>"}'); END;
CREATE TRIGGER rule_codes_builtin_shape_upd BEFORE UPDATE ON rule_codes
WHEN NEW.status = 'builtin' AND json_extract(NEW.ir_body_json, '$.builtin') IS NULL
BEGIN SELECT RAISE(ABORT, 'a builtin code must have ir_body_json = {"builtin":"<name>"}'); END;
-- @end

CREATE TABLE text_codes (
    text_hash     TEXT    NOT NULL REFERENCES effect_texts(text_hash) ON DELETE CASCADE,
    ordinal       INTEGER NOT NULL,                  -- 0-based, dense: the composition order
    code          TEXT    NOT NULL REFERENCES rule_codes(code),
    params_json   TEXT    NOT NULL DEFAULT '{}',     -- the per-card parameters (D-004)
    sentence_from INTEGER NOT NULL,                  -- text_sentences.ordinal range this item covers
    sentence_to   INTEGER NOT NULL,
    source        TEXT    NOT NULL DEFAULT 'manual', -- manual | xlsx | attack_effects | catalog | twinleaf | seed
    updated_at    TEXT    NOT NULL,
    PRIMARY KEY (text_hash, ordinal),
    CHECK (ordinal >= 0),
    CHECK (sentence_from >= 0 AND sentence_to >= sentence_from)
);
CREATE INDEX text_codes_code_idx ON text_codes (code);

CREATE TABLE text_sentences (
    text_hash           TEXT    NOT NULL REFERENCES effect_texts(text_hash) ON DELETE CASCADE,
    ordinal             INTEGER NOT NULL,
    sentence            TEXT    NOT NULL,
    classification_json TEXT,                        -- the spreadsheet's seven columns (S05.T08)
    PRIMARY KEY (text_hash, ordinal),
    CHECK (ordinal >= 0)
);

CREATE TABLE card_overrides (
    card_id    TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    field      TEXT NOT NULL,
    value_json TEXT NOT NULL,
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (card_id, field),
    -- RN-76: values only, never names. The legacy allow-list (audit.py L343) as a constraint.
    CHECK (field IN ('hp', 'prize_value', 'retreat_cost', 'weakness', 'resistance', 'rule_marker',
                     'types', 'stage', 'evolves_from', 'attack_cost', 'attack_damage')),
    CHECK (length(trim(reason)) > 0)
);

CREATE TABLE rule_scenarios (
    id            TEXT PRIMARY KEY,                  -- scenario id, equal to its file stem path
    title         TEXT NOT NULL,
    scenario_json TEXT NOT NULL,
    verifies_json TEXT NOT NULL DEFAULT '[]',        -- ['text:<hash>', 'rule:<name>']
    source        TEXT,                              -- 'tests/test_abilities.py::test_x' or a rulebook page
    path          TEXT NOT NULL,                     -- engine/scenarios/**/*.json, relative to the repo root
    updated_at    TEXT NOT NULL
);

CREATE TABLE rule_evidence (
    id             INTEGER PRIMARY KEY,
    text_hash      TEXT             REFERENCES effect_texts(text_hash),
    code           TEXT             REFERENCES rule_codes(code),
    card_id        TEXT             REFERENCES cards(id),      -- attr_only only
    kind           TEXT    NOT NULL,
    ref            TEXT    NOT NULL,                 -- scenario id, oracle diff id, or 'carddef'
    passed         INTEGER NOT NULL,
    engine_build   TEXT    NOT NULL,                 -- ptcg-cli --version hash
    rules_snapshot TEXT    NOT NULL,                 -- sha256 over active code bodies + text_codes
    run_at         TEXT    NOT NULL,
    CHECK (kind IN ('scenario', 'twinleaf_diff', 'attr_only', 'builtin')),
    CHECK (passed IN (0, 1)),
    CHECK ((kind =  'attr_only' AND card_id IS NOT NULL AND text_hash IS NULL     AND code IS NULL)
        OR (kind <> 'attr_only' AND card_id IS NULL     AND text_hash IS NOT NULL AND code IS NOT NULL))
);
CREATE INDEX rule_evidence_text_passed_idx ON rule_evidence (text_hash, passed);
CREATE INDEX rule_evidence_code_build_idx  ON rule_evidence (code, engine_build);
CREATE INDEX rule_evidence_latest_idx      ON rule_evidence (text_hash, code, kind, ref, engine_build, id);
CREATE INDEX rule_evidence_card_build_idx  ON rule_evidence (card_id, engine_build, id);

-- RN-64: evidence is a ledger. Nothing rewrites it; a wrong proof is corrected by appending passed = 0.
-- @postgres: CREATE TRIGGER ... EXECUTE FUNCTION rule_evidence_immutable(); see packages/db/PORTABILITY.md.
-- @sqlite-only
CREATE TRIGGER rule_evidence_no_update BEFORE UPDATE ON rule_evidence
BEGIN SELECT RAISE(ABORT, 'rule_evidence is insert-only (RN-64)'); END;
CREATE TRIGGER rule_evidence_no_delete BEFORE DELETE ON rule_evidence
BEGIN SELECT RAISE(ABORT, 'rule_evidence is insert-only (RN-64)'); END;
-- @end

-- The build and snapshot that "proven" is judged against. One row, updated by the worker.
CREATE TABLE rules_current (
    id             INTEGER PRIMARY KEY,
    engine_build   TEXT NOT NULL,
    rules_snapshot TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    CHECK (id = 1)
);
INSERT INTO rules_current (id, engine_build, rules_snapshot, updated_at)
VALUES (1, 'unset', 'unset', '1970-01-01T00:00:00Z');
```

**The `card_status` view.** Both numbers are derived; neither is stored anywhere.

```sql
CREATE VIEW card_status AS
WITH cur AS (
    SELECT engine_build FROM rules_current WHERE id = 1
),
-- the LATEST evidence row of each proof source, on the current build, that passed
proven_pair AS (
    SELECT e.text_hash, e.code
    FROM rule_evidence e
    JOIN cur ON cur.engine_build = e.engine_build
    WHERE e.kind IN ('scenario', 'twinleaf_diff', 'builtin')
      AND e.passed = 1
      AND e.id = (SELECT MAX(e2.id) FROM rule_evidence e2
                   WHERE e2.text_hash = e.text_hash AND e2.code = e.code
                     AND e2.kind = e.kind AND e2.ref = e.ref
                     AND e2.engine_build = e.engine_build)
),
attr_ok AS (
    SELECT e.card_id
    FROM rule_evidence e
    JOIN cur ON cur.engine_build = e.engine_build
    WHERE e.kind = 'attr_only' AND e.passed = 1
      AND e.id = (SELECT MAX(e2.id) FROM rule_evidence e2
                   WHERE e2.card_id = e.card_id AND e2.kind = 'attr_only'
                     AND e2.engine_build = e.engine_build)
),
-- one row per COUNTED part: it has a text and it is not rule-box boilerplate
part_state AS (
    SELECT p.card_id,
           CASE WHEN NOT EXISTS (SELECT 1 FROM text_codes tc WHERE tc.text_hash = p.text_hash)
                  OR EXISTS (SELECT 1 FROM text_codes tc JOIN rule_codes rc ON rc.code = tc.code
                              WHERE tc.text_hash = p.text_hash AND rc.status NOT IN ('exact', 'builtin'))
                THEN 1 ELSE 0 END AS not_exact,
           CASE WHEN NOT EXISTS (SELECT 1 FROM text_codes tc WHERE tc.text_hash = p.text_hash)
                  OR EXISTS (SELECT 1 FROM text_codes tc
                              WHERE tc.text_hash = p.text_hash
                                AND NOT EXISTS (SELECT 1 FROM proven_pair pp
                                                 WHERE pp.text_hash = tc.text_hash AND pp.code = tc.code))
                THEN 1 ELSE 0 END AS not_proven
    FROM card_parts p
    WHERE p.text_hash IS NOT NULL AND p.part_kind <> 'rule_box'
)
SELECT c.id AS card_id,
       CASE WHEN COALESCE(SUM(ps.not_exact), 0) = 0 THEN 1 ELSE 0 END AS exact,
       CASE WHEN COALESCE(SUM(ps.not_exact), 0) = 0
             AND COALESCE(SUM(ps.not_proven), 0) = 0
             AND EXISTS (SELECT 1 FROM attr_ok a WHERE a.card_id = c.id)
            THEN 1 ELSE 0 END AS proven,
       COALESCE(SUM(ps.not_exact), 0)  AS missing_codes,
       COALESCE(SUM(ps.not_proven), 0) AS unproven_codes
FROM cards c
LEFT JOIN part_state ps ON ps.card_id = c.id
GROUP BY c.id;
```

**`@pokesearch/db/schema`** gains `EffectTextRow`, `CardPartRow`, `RuleCodeRow`, `TextCodeRow`, `TextSentenceRow`, `CardOverrideRow`, `RuleScenarioRow`, `RuleEvidenceRow`, `RulesCurrentRow`, `CardStatusRow`, the unions `EffectTextKind = "ability" | "attack" | "trainer" | "energy" | "rule_box"`, `CodeStatus = "draft" | "exact" | "approx" | "builtin" | "unimplemented"`, `CodeCategory = "effect" | "attack_modifier" | "modifier" | "trigger" | "wrapper"`, `OnceScope = "none" | "per_instance" | "per_name" | "per_game"`, `EvidenceKind = "scenario" | "twinleaf_diff" | "attr_only" | "builtin"`, and the ten new entries in the `TABLES` descriptor the drift test walks. `*_json` columns are typed `string` at the row level; parsed shapes belong to `@pokesearch/shared`.

**Legacy mapping**, recorded in `packages/db/migrations/0006_rules.md`: `card_impl.status` → `rule_codes.status` (per code, not per card name) plus the derived `card_status.exact`; `card_impl.engine_id` → nothing, printings are `cards.id`; `card_audit.attr_ok` / `attr_json` → `rule_evidence(kind = 'attr_only')`; `card_audit.verdict` / `missing_json` / `extra_json` / `confidence` / `model` → an LLM review queue in [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md), never evidence (RN-63); `verified_cards.json` → `rule_evidence(kind = 'scenario')`; `engine_fixes.json` `cards` block → `card_overrides`; its `substituir` / `substituir_manual` blocks → codes on the affected texts, since those were effect problems, not attribute problems.

## Implementation steps

1. Write `0006_rules.sql` down to `text_sentences`, with the header comment, the foreign keys, the checks and the index names; apply on a temp database and run `PRAGMA foreign_key_check`.
2. Add `card_overrides`, `rule_scenarios` and `rules_current` with their checks and the single seed row.
3. Add `rule_evidence` with its four indexes and the two insert-only triggers, inside a `-- @sqlite-only` block with its `-- @postgres:` note; verify `pnpm check` passes and fails when the tag is removed.
4. Add the `rule_codes` builtin-shape triggers in their own tagged block.
5. Add the `card_status` view; check it returns one row per card on an empty database, with `exact = 1` everywhere (no parts yet) and `proven = 0`.
6. Add the ten row types and `TABLES` entries in `@pokesearch/db/schema`; run the drift test until green.
7. Write `rules-schema.spec.ts`: the two immutability triggers, the `card_overrides` allow-list and reason, the `attr_only` shape check, the approx-note and builtin-shape checks, the ordinal and sentence-range checks, and the cascade behaviour.
8. Write `card-status.spec.ts` on a hand-built fixture: one printing, two texted parts, four codes, evidence rows appended one at a time; assert `exact`, `proven`, `missing_codes` and `unproven_codes` after each append and after a build bump.
9. Measure the view on a realistic fixture (2,950 printings × ~1.3 texted parts) and record the timing in `0006_rules.md`; if it exceeds ~100 ms, add the covering index the plan asks for rather than materializing the view.
10. Write `packages/db/migrations/0006_rules.md` with the legacy mapping table, the ledger rationale and the measured timing.

## Edge cases and error handling

- **A code is edited while evidence exists for it.** Nothing is deleted. The edit changes `rule_codes.ir_body_json`, which changes `rulesSnapshot(db)`; the worker writes the new snapshot into `rules_current` and the existing evidence rows — which carry the old `rules_snapshot` but the same `engine_build` — still satisfy the view. This is deliberate and it is the sharpest edge in the design: a code can be silently rewritten under a passing scenario. [S05.T12](T12-evidence-and-coverage-metrics.md) closes it by re-running the scenarios of every text that references an edited code; until that job finishes, the editor shows the evidence as stale (`rule_evidence.rules_snapshot <> rules_current.rules_snapshot`).
- **A builtin is registered in Rust but absent from `rule_codes`, or vice versa.** The schema cannot see Rust. `ptcg-cli --builtins` and the `rule_codes` rows with `status = 'builtin'` are compared by the consistency test in [S05.T06](T06-builtins-escape-hatch.md); this migration only guarantees that such a row has `ir_body_json = {"builtin": "<name>"}` so the comparison has something unambiguous to read.
- **A text hash disappears after an ETL reload** because the source corrected the wording. `card_parts` rows for that printing are deleted and re-inserted pointing at the new hash; the old `effect_texts` row and its `text_codes` survive, orphaned, and appear in the editor's "orphan texts" list. Nothing is deleted automatically: the old codes are usually the right starting point for the new text.
- **Two printings share a name but not a text** (the legacy Dunsparce: `sv9-120` "Trading Places" versus the TEF printing's "Dig"). They get different `text_hash` values and therefore different code lists; `card_status` judges them separately. This is the 1.4 % of meta copies that the legacy counted by name and got wrong (`ESPECIFICACAO.md` §6.1).
- **An override tries to rename an attack.** `field = 'attack_name'` is not in the allow-list, so the insert fails with `SQLITE_CONSTRAINT_CHECK`. The correct response is a `card_overrides` row on `attack_cost` or `attack_damage` plus an issue against the source data, exactly as the legacy comment demanded.
- **`rules_current.engine_build = 'unset'`** on a fresh database. No evidence row can match, so `proven = 0` for every card and `exact` still works. The coverage endpoint reports `proven = 0` with the reason "engine build unknown" rather than pretending.
- **Someone runs the migration SQL by hand twice.** `CREATE TABLE` fails (no `IF NOT EXISTS`, per the [S01.T04](../01-foundation/T04-database-migration-framework.md) conventions) and the transaction rolls back. The runner itself skips by version.
- **A `text_codes` row points at a code that a later import wants to delete.** The foreign key refuses the delete; `rules:import --replace` reports the blocked codes instead of cascading, because deleting a code silently would change what a card means.
- **Evidence for a `(text, code)` pair whose `text_codes` row was since removed.** The row stays in the ledger and is simply not read by the view. The editor shows it under "historic evidence" so that re-adding the code does not look like unproven work when it is not.

## Acceptance / verification

- [ ] `pnpm db:migrate` on a fresh temp database applies 0006, leaves `schema_migrations.version = 6`, exactly one row (in `rules_current`), and `PRAGMA foreign_key_check` returns nothing (BR-S05.T01-08).
- [ ] `rules-schema.spec.ts > rule_evidence rejects UPDATE and DELETE` — both statements raise `SQLITE_CONSTRAINT_TRIGGER` and the row count is unchanged (RN-64).
- [ ] `pnpm check` fails when a fixture file under `packages/db`, `apps/api` or `apps/worker` contains `UPDATE rule_evidence` or `DELETE FROM rule_evidence`, and passes for the real tree (RN-64).
- [ ] `rules-schema.spec.ts > card_overrides rejects field 'name'`, `> rejects an ability rename`, `> rejects an empty reason` — all three raise `SQLITE_CONSTRAINT_CHECK` (RN-76).
- [ ] `card-status.spec.ts` fixture — a printing with one ability text (2 codes) and one attack text (1 code): with all three codes `exact` and no evidence, `exact = 1, proven = 0, unproven_codes = 2`; after appending passing scenario evidence for all three pairs and an `attr_only` row on the current build, `exact = 1, proven = 1, unproven_codes = 0`; after `UPDATE rules_current SET engine_build = 'other'`, `exact = 1, proven = 0` (BR-S05.T01-01, -02).
- [ ] `card-status.spec.ts > a later failing row supersedes an earlier passing one` — appending `passed = 0` for the same `(text, code, kind, ref, build)` drops `proven` to 0 without any delete (BR-S05.T01-03).
- [ ] `card-status.spec.ts > a card with no effect text is exact and, with attr_only evidence, proven` — a printing whose only parts are textless attacks and a `rule_box` part (RN-71 boundary, verified in full by [S05.T12](T12-evidence-and-coverage-metrics.md)).
- [ ] `rules-schema.spec.ts > attr_only evidence without card_id is rejected` and `> scenario evidence without code is rejected` (BR-S05.T01-04).
- [ ] `rules-schema.spec.ts > approx without a note is rejected` and `> a builtin whose body is not {"builtin": …} is rejected` (BR-S05.T01-05).
- [ ] `schema-drift.spec.ts > 0006 tables match their TypeScript row types` passes and fails when a column is added to the SQL without its type (BR-S05.T01-09).
- [ ] `SELECT name FROM sqlite_master WHERE type IN ('index','trigger','view') AND tbl_name IN (…)` lists all eleven indexes, the four triggers and `card_status`.

## Risks and open questions

- **Risk — `card_status` is a correlated-subquery view over four tables and is read on every coverage request.** Mitigation: `rule_evidence_latest_idx` is built for the `MAX(id)` subquery, and step 9 measures the view on a full-size fixture. If it is slow, the fix is the same one [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) applied to `cards_market_usd` — a maintained table refreshed by the worker after every evidence batch — and the view definition stays in the migration note as the invariant the table must satisfy. Do not solve it by storing `exact` on the card.
- **Risk — the `MAX(id)` "last write wins" grouping key `(text_hash, code, kind, ref, engine_build)` is subtle.** A renamed scenario id creates a *new* group, so the old group's last row keeps counting until it is superseded. Mitigation: [S05.T11](T11-legacy-tests-to-scenarios.md) treats a scenario id as permanent, and [S05.T12](T12-evidence-and-coverage-metrics.md) reports evidence whose `ref` is no longer in `rule_scenarios`.
- **Risk — the ledger only grows.** With ~1,100 Standard texts, ~2,500 `(text, code)` pairs and a full rerun per engine build, a build costs ~2,500 rows; a hundred builds is 250k rows, which is nothing for SQLite but is unbounded. Mitigation: leave it unbounded in S05 and revisit with a measured row count. See the open question below.
- **Question — retention for `rule_evidence`.** Insert-only and *never* pruned are different promises. Recommendation: keep the triggers unconditional and add, when the table exceeds ~1 M rows, a `0009` migration that archives rows for builds older than the last N into `rule_evidence_archive` inside a migration (where DDL may legitimately drop and recreate the trigger). The user decides whether pruning by build is acceptable at all; until then, nothing prunes.
- **Question (D-004 semantics) — should `once_scope` live on `rule_codes` or on `text_codes`?** It is on the code here, because the sentence "Once during your turn, you may …" *is* the code and RN-16's per-name exception is a property of the wording ("You can't use more than 1 … Ability each turn"), exactly as the legacy derived it from the ability text (`catalog_cards.py::_limit_per_name`). The consequence is that two cards whose wording differs in that clause must use two different codes. The user owns this; [S05.T07](T07-rule-codes-composition-semantics.md) depends on the answer.
- **Question (D-004 semantics) — is `card_overrides` keyed by printing or by text?** It is by printing, because it corrects *source data* about one `cards.id`, not meaning. That means a wrong HP on three reprints needs three rows. Recommendation: keep it, and let the editor offer "apply to all printings of this name"; the user confirms.
- **Deliberate addition — `rules_current`.** The view needs a single, agreed answer to "which build are we judging against"; deriving it from `MAX(run_at)` would make `proven` depend on the order in which two workers finished. Flagged here because it is a table the Outputs list did not name.

## References

- `pokemon/src/pokesearch/db/schema.sql` L228–265 — verified: `card_impl(name_key PK, engine_id, status, file_path, test_path, tests_passed, attempts, generated_by, notes, error, created_at, reviewed_at)` and `card_audit(engine_id PK, name_key, card_id, name, origin, attr_ok, attr_json, verdict, missing_json, extra_json, confidence, official, implemented, model, judged_at, checked_at)` with the comment *"Camada 1 (atributos) é determinística; camada 2 (parecer) vem da IA e nunca altera a carta"*. Consult for the legacy mapping table; this migration replaces both.
- `pokemon/src/pokesearch/sim/audit.py` L339–380 and L444–479 — verified: `FIXABLE = ("hp", "prêmios", "recuo", "fraqueza", "resistência", "regra")` with *"Nomes de ataque e de habilidade nunca entram, porque a lógica do motor se apoia neles"*, `build_fixes` writing a `motivo` on every entry, and `apply_fixes` mutating only those fields plus `ataques.<name>.{custo,dano}`. Consult for the exact `card_overrides` allow-list (RN-76).
- `pokemon/src/pokesearch/sim/engine_fixes.json` — verified: eight `cards` entries, each with `carta` and `motivo`, plus `substituir` (5) and `substituir_manual` (entries such as Team Rocket's Watchtower and Rare Candy). Consult for what belongs in `card_overrides` and what is an effect problem instead.
- `pokemon/src/pokesearch/sim/verified.py` L103–116 and L157–207 — verified: `Proof.complete = all(self.parts.values())` and the per-part requirement built from `abilities`, `attacks` with non-empty text, and `WHOLE = "*"` for Trainers and Special Energies. Consult for the `card_status` semantics this view reproduces in SQL.
- [S01.T04](../01-foundation/T04-database-migration-framework.md) — migration naming, the `-- @sqlite-only` / `-- @postgres:` tagging, the no-`IF NOT EXISTS` rule and the drift test. [S01.T02](../01-foundation/T02-sqlite-database-client.md) — `foreign_keys=ON` on every connection, which is what makes the cascades and the triggers real.
- [Data model overview](../../project/04-data-model-overview.md) §"Card rules base (D-004)" — the table inventory this migration implements; [Decision log](../../project/02-decision-log.md) D-004.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
