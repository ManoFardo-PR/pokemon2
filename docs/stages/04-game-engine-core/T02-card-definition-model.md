# S04.T02 — Card definition model (DB → CardDef)

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 2 / 18 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S02.T06](../02-card-data-and-search/T06-load-cards.md), [S04.T01](T01-engine-workspace-and-crates.md) |
| Unblocks | [S04.T05](T05-actions-and-legality.md), [S04.T06](T06-energy-provision-and-cost-payment.md), [S04.T15](T15-worker-job-runner.md), [S06.T02](../06-bots/T02-deck-profile-analysis.md) |
| Parallel with | [S04.T03](T03-game-state-model.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared` (schema export) — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `table` `cards`, `attacks`, `abilities`, `weaknesses`, `resistances` — from [S02.T06](../02-card-data-and-search/T06-load-cards.md)
- `module` `ptcg-core` crate — from [S04.T01](T01-engine-workspace-and-crates.md)
- `file` `pokemon/src/pokesearch/sim/cardspec.py` — the legacy `CardSpec` derivation, prize parsing and evolution-line walk; read-only reference

## Outputs (proposed)
- `contract` `CardDef` (zod in `@pokesearch/shared/carddef`, `serde` in `ptcg-core::defs`): `{ def_idx, card_id, name, kind: pokemon|trainer|energy, tags: [ex, v, vstar, mega, tera, ancient, future, radiant, ace_spec, owner:<tag>], stage, evolves_from, hp, types[], weakness[], resistance[], retreat, prize_value, attacks: [{ name, cost: [TypeSlot], damage_printed, damage_mod, program?: ProgramId }], abilities: [{ name, program?: ProgramId, once_per: instance|name|game }], trainer: { subtype: item|supporter|stadium|tool, program? }, energy: { basic: Type } | { provides: [Unit], program? } }` — consumed by [S04.T05](T05-actions-and-legality.md), [S04.T15](T15-worker-job-runner.md), [S06.T02](../06-bots/T02-deck-profile-analysis.md)
- `module` `packages/shared/src/carddef/derive.ts` — `deriveCardDefs(db, cardIds) → CardDef[]` applying `card_overrides` (table arrives in S05; the hook exists now) and parsing the prize value from rule text ('takes N Prize cards', RN-19; fallback by tag) — consumed by [S04.T15](T15-worker-job-runner.md)

## Initial objective
The engine never reads the database: Node derives a compact, validated definition for every card in a job from the card tables, so the engine sees exactly the same facts the card page shows, plus explicit corrections.

## Context

Architecture principle 1 says the engine is self-contained: a job arrives as one JSON line and results leave as lines ([S04.T12](T12-cli-job-protocol.md)). That principle has a price, and this subtask pays it. Every fact the rules need about a printing — HP, stage, evolves-from, retreat, weakness, resistance, attack costs, printed damage, prize value, tags — must be derived on the Node side and shipped with the job. `CardDef` is that derivation, and it is the only place where "what the card says" becomes "what the engine believes".

The legacy project did the same thing in `pokemon/src/pokesearch/sim/cardspec.py`, and its 244 lines are worth reading before writing a line here, because several of its properties encode a bug that was found the expensive way. `trainer_type` documents that 28 Pokémon Tools carry `subtypes = ["Item", "Pokémon Tool"]`, so reading the first subtype makes a tool get discarded instead of attached; the fix is a fixed precedence — Tool, Supporter, Stadium, Item. `engine_stage` documents that `stage` carries mechanic labels (VMAX, VSTAR, MEGA, BREAK, LEVEL-UP) that are not stages at all, so what decides is whether the card has a pre-evolution; without that, a VSTAR would be playable straight onto the bench. `prize` documents RN-19: the printed rule text ("takes 2 Prize cards") is the source of truth, and the subtype is only plan B, because VSTAR gives 2 and Mega Evolution ex gives 3 — values a naive subtype reading gets wrong. `evolution_line` documents that the line must be the whole chain `[direct pre-evolution, …, Basic]`, not just the direct one, because Rare Candy reads the last element; `pokemon/tests/test_rules.py::test_our_stage_2_cards_carry_the_whole_evolution_line` records that 59 of 65 registered Stage 2 cards were broken by the short version.

Three things change here. First, the derivation is TypeScript inside `packages/shared`, shared by the worker and by tests, and its output is validated against the same zod schema the Rust `serde` structs mirror ([S01.T05](../01-foundation/T05-shared-contracts-package.md)) — a round trip, not two independent readings. Second, corrections are data: `card_overrides` ([S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)) replaces the legacy `engine_fixes.json`, touching values and never names (RN-76), and the application point exists from today even though the table arrives in S05. Third, `program` fields are `None` in this stage. The effect-less engine plays attributes, printed damage, energy, evolution and prizes; [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md) fills the program ids later, and nothing in the shape has to change when it does.

RN-75 — every registered card matches the official card in all attributes — becomes true by construction rather than by a 721-card audit test, because the definition is derived from the card tables that the ETL filled from the sources, not hand-written in code. What remains testable is that the derivation itself is faithful, and that is what this subtask's tests assert.

## Scope

- **In scope.** The `CardDef` zod schema and its exported JSON Schema; the `serde` mirror in `ptcg-core::defs` with a schema-equality test; `deriveCardDefs(db, cardIds)` including the SQL, tag derivation, prize parsing, trainer-subtype precedence, stage derivation, retreat and W/R mapping, energy provision, evolution-line walk and the `card_overrides` application hook; `DefIdx` allocation and its stability rule; the fixture set used by every later engine test.
- **Out of scope.** The `card_overrides` table itself ([S05.T01](../05-card-rules-base/T01-rules-schema-migration.md)); effect programs and the `text_codes` composition ([S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md)); how the worker chooses which cards a job needs ([S04.T15](T15-worker-job-runner.md)); decklist parsing and resolution ([S03.T09](../03-tournament-meta-and-deck-builder/T09-decklist-parser-and-exporter.md), [S03.T04](../03-tournament-meta-and-deck-builder/T04-deck-resolver.md)); deck legality ([S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md)); anything the engine does with a definition once it has it ([S04.T05](T05-actions-and-legality.md) onwards).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-19 | **Kept.** `prize_value` is read from the printed rule text — the first `rules_json` entry matching `/takes?\s+(\d+)\s+Prize/i` with `1 ≤ N ≤ 3` wins. Only when no such rule exists does the tag fallback apply: `vmax` or (`mega` and `ex`) → 3; `ex`, `v`, `vstar`, `mega` → 2; otherwise 1. | `derive.ts::prizeValue(card)` | `carddef.spec.ts > prize value comes from the printed rule` and `> tag fallback` — Charizard ex → 2, Mega ex → 3, VSTAR → 2, Dreepy → 1 |
| RN-75 | **Kept by construction.** A `CardDef` is derived only from `cards`/`attacks`/`abilities`/`weaknesses`/`resistances` plus `card_overrides`; no attribute is ever written by hand in engine code, and a definition whose `card_id` is absent from `cards` cannot be produced. | `deriveCardDefs` reads the five tables and nothing else; no literal card data in `ptcg-core` | `carddef.spec.ts > every derived field is reproducible from the source rows` (re-derives name, hp, stage, retreat, W/R from the row and compares); `policy.rs > core_contains_no_card_literals` |
| BR-S04.T02-01 | `def_idx` is an index into the job's `card_defs` array, assigned in ascending `card_id` order and stable for one job; the engine never stores a `card_id` and never compares definitions by name. | `deriveCardDefs` sorts by `card_id` before assigning; `ptcg-core` stores `DefIdx = u16` | `carddef.spec.ts > def_idx follows sorted card_id`; `defs.rs > CardDef has no name comparison` (name is `String` used only for logs and prompts) |
| BR-S04.T02-02 | The trainer subtype is decided by fixed precedence Tool → Supporter → Stadium → Item, never by the first element of `subtypes_json`. | `derive.ts::trainerSubtype` | `carddef.spec.ts > a card with subtypes ["Item","Pokémon Tool"] derives subtype "tool"` |
| BR-S04.T02-03 | `stage` is `basic` / `stage1` / `stage2` / `restored`; when `cards.stage` holds a mechanic label (VMAX, VSTAR, MEGA, BREAK, LEVEL-UP) the stage is `stage1` if `evolves_from` is set and `basic` otherwise — a mechanic label never yields `basic` for a card that evolves. | `derive.ts::stageOf` | `carddef.spec.ts > VSTAR with evolves_from derives stage1`; `> Radiant with no evolves_from derives basic` |
| BR-S04.T02-04 | `evolves_from` carries the full chain `[direct pre-evolution, …, Basic]`, at most three names, walked by exact `name` with `ORDER BY release_date DESC LIMIT 1` at each step; a Stage 2 whose chain has fewer than two entries is a derivation error, not a silent value. | `derive.ts::evolutionLine` using the `cards(name, release_date)` index of [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) | `carddef.spec.ts > stage2 carries basic and stage1`; `> a stage2 with a broken line throws DeriveError` |
| BR-S04.T02-05 | Attack cost is a list of `TypeSlot` in printed order; `damage_printed` is the numeric part and `damage_mod ∈ '+' \| '-' \| '×' \| null`; a non-numeric damage text (`varies`, empty) yields `damage_printed: 0` and `damage_mod: null`, never a guess. | `derive.ts::attackOf` reading `attacks.cost_json`, `damage_num`, `damage_mod` | `carddef.spec.ts > "30×" derives 30/'×'`; `> "varies" derives 0/null` |
| BR-S04.T02-06 | A basic energy derives `energy: { basic: Type }` from `types_json[0]` or, when absent, from the name (`Basic Grass Energy` → `grass`). A special energy with no program derives `energy: { provides: [{ any: true }] }` and is tagged `approx_energy`, so the approximation is visible rather than silent. | `derive.ts::energyOf` | `carddef.spec.ts > basic energy type from name when types_json is empty`; `> special energy without a program carries approx_energy` |
| BR-S04.T02-07 | `card_overrides` may change values only, never `card_id` or `name`; an override naming a column outside the allowed set is a derivation error. | `derive.ts::applyOverrides` with an explicit column allowlist (RN-76) | `carddef.spec.ts > an override on hp applies`; `> an override on name throws` |
| BR-S04.T02-08 | Every `CardDef` produced validates against `@pokesearch/shared/carddef` before it is written into a job request, and the Rust `serde` structs accept the same JSON. | `deriveCardDefs` ends with `CardDefSchema.array().parse(...)`; `ptcg-core::defs` has `#[serde(deny_unknown_fields)]` | `carddef.spec.ts > 200 fixture cards validate`; `defs.rs > round_trip_from_shared_fixture` reads `packages/shared/fixtures/carddefs.json` |
| BR-S04.T02-09 | Owner tags are derived from the printed name only: a name matching `/^([A-Z][a-z]+)'s\s/` yields `owner:<norm(prefix)>`; no owner tag is inferred from art, set or rarity. | `derive.ts::tagsOf` | `carddef.spec.ts > "Ethan's Ho-Oh ex" derives owner:ethans and ex` |

## Data operations

The derivation only reads. It writes no table; its output travels inside the job request that [S04.T15](T15-worker-job-runner.md) hands to the engine.

| Entity | Operation (C/R/U/D) | Actor | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `cards` | R | worker | once per job, for the union of both decks plus opponents | `WHERE id IN (…)`, chunked at 900 parameters | [S02.T06](../02-card-data-and-search/T06-load-cards.md) |
| `attacks` | R | worker | same query batch | `ORDER BY card_id, idx`; never joined on the surrogate `attacks.id` | order is the contract for `attack_idx` |
| `abilities` | R | worker | same query batch | `ORDER BY card_id, idx` | |
| `weaknesses`, `resistances` | R | worker | same query batch | at most one row per `(card_id, type)` | [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) |
| `cards` (evolution walk) | R | worker | per Stage 1/2 definition | `WHERE name = ? AND evolves_from IS NOT NULL ORDER BY release_date DESC LIMIT 1`; uses `cards_name_release_idx` | ≤ 2 extra queries per card |
| `card_overrides` | R | worker | once per job, whole table (small) | applied after derivation, value columns only (RN-76) | table created by [S05.T01](../05-card-rules-base/T01-rules-schema-migration.md); until then the read returns zero rows |
| `CardDef[]` (contract) | produce | worker | once per job, cached by `(card_id set, rules_snapshot)` | pure function of the rows read; identical inputs give byte-identical JSON | consumed by [S04.T15](T15-worker-job-runner.md) |
| `packages/shared/fixtures/carddefs.json` | create / refresh | developer | here; when the schema changes | 200 cards covering every kind, tag and edge case; regenerated by `pnpm --filter @pokesearch/shared fixtures:carddefs` | the input of `defs.rs > round_trip_from_shared_fixture` |
| any table | C/U/D | engine | never | the engine receives definitions, it does not fetch them | Architecture principle 1 |

## Interfaces

**`packages/shared/src/carddef/schema.ts`** (zod; the JSON Schema export is the Rust side's contract).

```ts
export const Type = z.enum(["grass","fire","water","lightning","psychic","fighting",
                            "darkness","metal","fairy","dragon","colorless"]);
export const TypeSlot = z.union([Type, z.literal("colorless")]);   // a cost slot; "colorless" = any
export const Tag = z.enum(["ex","v","vmax","vstar","mega","tera","ancient","future","radiant",
                           "ace_spec","prism_star","single_strike","rapid_strike","fusion_strike",
                           "approx_energy"]).or(z.string().regex(/^owner:[a-z0-9_]+$/));

export const CardDef = z.object({
  def_idx:      z.number().int().min(0).max(65535),
  card_id:      z.string(),                       // 'sv4pt5-54'
  name:         z.string(),
  kind:         z.enum(["pokemon","trainer","energy"]),
  tags:         z.array(Tag).default([]),
  stage:        z.enum(["basic","stage1","stage2","restored"]).nullable(),
  evolves_from: z.array(z.string()).default([]),  // [direct, …, Basic]; BR-S04.T02-04
  hp:           z.number().int().min(0).nullable(),
  types:        z.array(Type).default([]),
  weakness:     z.array(z.object({ type: Type, mult: z.literal(2) })).default([]),
  resistance:   z.array(z.object({ type: Type, minus: z.literal(30) })).default([]),
  retreat:      z.number().int().min(0).max(5).nullable(),
  prize_value:  z.number().int().min(1).max(3),
  attacks: z.array(z.object({
    name: z.string(), cost: z.array(TypeSlot),
    damage_printed: z.number().int().min(0),
    damage_mod: z.enum(["+","-","×"]).nullable(),
    program: z.number().int().nullable().default(null),      // ProgramId, filled by S05.T07
  })).default([]),
  abilities: z.array(z.object({
    name: z.string(), program: z.number().int().nullable().default(null),
    once_per: z.enum(["instance","name","game"]).default("instance"),  // RN-16, declared by S05.T07
  })).default([]),
  trainer: z.object({
    subtype: z.enum(["item","supporter","stadium","tool"]),
    program: z.number().int().nullable().default(null),
  }).nullable().default(null),
  energy: z.union([
    z.object({ basic: Type }),
    z.object({ provides: z.array(z.object({ types: z.array(Type).optional(), any: z.boolean().optional() })),
               program: z.number().int().nullable().default(null) }),
  ]).nullable().default(null),
});
export type CardDef = z.infer<typeof CardDef>;
export const CARDDEF_VERSION = 1;
```

**`packages/shared/src/carddef/derive.ts`.**

```ts
export interface DeriveOptions { overrides?: CardOverride[]; strict?: boolean }  // strict default true
export class DeriveError extends Error { constructor(readonly cardId: string, readonly reason: string) }

export function deriveCardDefs(db: Db, cardIds: readonly string[], opts?: DeriveOptions): CardDef[];
export function prizeValue(rules: string[], tags: string[]): 1 | 2 | 3;          // RN-19
export function trainerSubtype(subtypes: string[]): "item"|"supporter"|"stadium"|"tool";
export function stageOf(stage: string | null, evolvesFrom: string | null): CardDef["stage"];
export function evolutionLine(db: Db, evolvesFrom: string | null): string[];     // ≤ 3, exact name
export function tagsOf(card: CardRow): string[];
export const PRIZE_RULE = /takes?\s+(\d+)\s+Prize/i;
```

**`ptcg-core::defs`** — the `serde` mirror. Strings become interned indices where the engine needs speed; the JSON shape is unchanged.

```rust
pub type DefIdx = u16;
pub type ProgramId = u32;

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct CardDef {
    pub def_idx: DefIdx,
    pub card_id: String,
    pub name: String,
    pub kind: Kind,                       // Pokemon | Trainer | Energy
    #[serde(default)] pub tags: TagSet,   // bitflags + SmallVec<[OwnerTag; 1]>
    pub stage: Option<Stage>,
    #[serde(default)] pub evolves_from: SmallVec<[String; 2]>,
    pub hp: Option<u16>,
    #[serde(default)] pub types: TypeSet,
    #[serde(default)] pub weakness: SmallVec<[Weakness; 1]>,
    #[serde(default)] pub resistance: SmallVec<[Resistance; 1]>,
    pub retreat: Option<u8>,
    pub prize_value: u8,
    #[serde(default)] pub attacks: SmallVec<[AttackDef; 2]>,
    #[serde(default)] pub abilities: SmallVec<[AbilityDef; 1]>,
    #[serde(default)] pub trainer: Option<TrainerDef>,
    #[serde(default)] pub energy: Option<EnergyDef>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct AttackDef {
    pub name: String,
    pub cost: SmallVec<[TypeSlot; 4]>,
    pub damage_printed: u16,
    pub damage_mod: Option<DamageMod>,
    #[serde(default)] pub program: Option<ProgramId>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(untagged)]
pub enum EnergyDef {
    Basic { basic: Type },
    Special { provides: SmallVec<[Unit; 2]>, #[serde(default)] program: Option<ProgramId> },
}
```

**Derivation SQL** (one batch per job, not one query per card):

```sql
SELECT c.id, c.name, c.supertype, c.subtypes_json, c.hp, c.types_json, c.stage,
       c.evolves_from, c.rules_json, c.retreat_cost, c.retreat_json, c.regulation_mark
  FROM cards c WHERE c.id IN (/* ≤ 900 ids per chunk */);
SELECT card_id, idx, name, cost_json, damage_num, damage_mod, damage_text, text
  FROM attacks WHERE card_id IN (…) ORDER BY card_id, idx;
SELECT card_id, idx, name, type, text FROM abilities WHERE card_id IN (…) ORDER BY card_id, idx;
SELECT card_id, type, value FROM weaknesses   WHERE card_id IN (…);
SELECT card_id, type, value FROM resistances  WHERE card_id IN (…);
```

**Tag derivation table** (from `subtypes_json` and the name; a card may carry several):

| Source | Tag |
|---|---|
| subtype `ex` / `EX` | `ex` |
| subtype `V`, `VMAX`, `VSTAR`, `V-UNION` | `v`, plus `vmax` / `vstar` when present |
| subtype `MEGA` (with `ex`) | `mega` (and `ex`) |
| subtype `Tera`, `Ancient`, `Future`, `Radiant`, `Prism Star` | `tera`, `ancient`, `future`, `radiant`, `prism_star` |
| subtype `ACE SPEC` | `ace_spec` |
| name matching `/^([A-Z][a-z]+)'s\s/` | `owner:<norm(prefix)>` — e.g. `owner:ethans`, `owner:cynthias`, `owner:marnies`, `owner:hops`, `owner:lillies`, `owner:ns`, `owner:team_rocket` from `Team Rocket's …` |
| special energy with no program | `approx_energy` (BR-S04.T02-06) |

## Implementation steps

1. Write the zod schema and export its JSON Schema; add `CARDDEF_VERSION` to `packages/shared/CONTRACTS.md`. `pnpm --filter @pokesearch/shared test` green on the schema's own unit tests.
2. Write `derive.ts` skeleton: batched SQL, row grouping, `def_idx` assignment by sorted `card_id`, and a straight field copy for Pokémon with no edge cases. Spec it on three fixture cards.
3. Add `prizeValue` with the printed-rule regex and the tag fallback; spec Charizard ex (2), a Mega Evolution ex (3), a VSTAR (2), a plain Basic (1) (RN-19).
4. Add `trainerSubtype`, `stageOf` and `tagsOf` with their specs, including the `["Item","Pokémon Tool"]` case and a mechanic-labelled stage (BR-S04.T02-02, -03, -09).
5. Add `evolutionLine` with the two-step name walk and the Stage 2 completeness check; spec a Stage 2 whose chain is complete and one whose middle printing is missing (BR-S04.T02-04).
6. Add `attackOf` (cost, `damage_printed`, `damage_mod`) and `energyOf` (basic from types or name; special → `any` unit plus `approx_energy`); spec `30×`, `120+`, `varies` and both energy paths (BR-S04.T02-05, -06).
7. Add `applyOverrides` with the column allowlist and a no-op path while `card_overrides` does not exist yet; spec both the applied and the rejected case (BR-S04.T02-07).
8. Generate `packages/shared/fixtures/carddefs.json` (200 cards) with a script; add `defs.rs` on the Rust side with `#[serde(deny_unknown_fields)]` and the round-trip test reading that file (BR-S04.T02-08). `cargo test` green.
9. Add the schema-diff test: the JSON Schema exported from zod and the one derived from the `serde` structs must have the same required fields and the same enum members; fail loudly on a drift.
10. Measure `deriveCardDefs` on a realistic job (two 60-card decks plus twelve opponent lists — roughly 150 distinct printings) and record the milliseconds in the file header comment, so [S04.T15](T15-worker-job-runner.md) knows whether to cache.

## Edge cases and error handling

- **A card id in the job that is absent from `cards`** → `DeriveError(cardId, "unknown printing")`; the worker fails the job with that message rather than shipping a short `card_defs` array the engine would reject with `UnknownDef`.
- **A Stage 2 whose Stage 1 printing is not in the database** → `evolutionLine` returns one name; `strict: true` raises `DeriveError`, because Rare Candy reads the last element and a one-element chain silently breaks it (the legacy found this on 59 of 65 Stage 2 cards).
- **Two printings of the same name with different text** (RN-05, e.g. the two Dunsparce) → they are different `card_id`s and therefore different `CardDef`s with different `def_idx`; nothing here resolves by name, so both coexist in one job.
- **An attack with damage `varies` or an empty damage text** → `damage_printed: 0`, `damage_mod: null`. The engine deals zero from the printed value; the real number comes from the attack program in S05. Better a visible zero than an invented number.
- **A Pokémon with no weakness row** → `weakness: []`; the damage pipeline's weakness stage is a no-op ([S04.T07](T07-damage-pipeline.md)). Resistance values other than `-30` do not occur in the Standard window; a different value is a `DeriveError` so the assumption fails loudly rather than being rounded.
- **A special energy whose text says "provides every type of Energy, one at a time"** → `provides: [{ any: true }]` and the `approx_energy` tag. This is the exact legacy gap (ESPECIFICACAO §6.1: Prism, Legacy, Neo Upper approximated); [S04.T06](T06-energy-provision-and-cost-payment.md) can now represent it honestly because provision is a query at payment time, and S05 replaces the approximation with a program.
- **A trainer with no subtype at all** → `item`, matching the legacy fallback, plus a `DeriveError` under `strict` in a test-only mode so the data problem surfaces in the ETL rather than in a game.
- **`retreat_cost` NULL on a Pokémon** → `retreat: null`, which [S04.T05](T05-actions-and-legality.md) reads as "cannot retreat" rather than as zero; a free retreat must be printed as 0.
- **An override row referencing a card not in the job** → ignored, not an error: overrides are a global table and a job only needs its slice.
- **More than 65,535 distinct definitions in one job** → impossible in practice (a job carries ~150), but `DefIdx` is `u16`, so `deriveCardDefs` raises when the set exceeds 65,535 instead of truncating.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/shared test carddef` green, including `> prize value comes from the printed rule` with Charizard ex → 2, a Mega Evolution ex → 3, a VSTAR → 2 and a plain Basic → 1 (RN-19).
- [ ] `> a card with subtypes ["Item","Pokémon Tool"] derives subtype "tool"` and `> VSTAR with evolves_from derives stage1` (BR-S04.T02-02, -03).
- [ ] `> stage2 carries basic and stage1`, and `> a stage2 with a broken line throws DeriveError` (BR-S04.T02-04).
- [ ] Round trip: `pnpm --filter @pokesearch/shared fixtures:carddefs` writes 200 definitions, `cargo test -p ptcg-core round_trip_from_shared_fixture` parses all 200 with `deny_unknown_fields` and re-serializes to byte-identical JSON (BR-S04.T02-08).
- [ ] The schema-diff check (`pnpm check`) reports no difference between the zod-exported JSON Schema and the `serde`-derived one; it fails when a field is added on one side only.
- [ ] `> every derived field is reproducible from the source rows` passes for the whole fixture set — name, hp, stage, retreat, weakness, resistance re-derived from the raw rows and compared (RN-75).
- [ ] `> an override on hp applies` and `> an override on name throws` (BR-S04.T02-07, RN-76).
- [ ] `deriveCardDefs` over ~150 distinct printings completes in under 50 ms on this machine, measured and recorded in the module header.

## Risks and open questions

- **Risk — the derivation and the card page disagree.** Two readings of the same rows is exactly the drift RN-75 is about. Mitigation: both read the same columns through `@pokesearch/db/schema`, and `> every derived field is reproducible from the source rows` is run against the same fixtures the card-page tests use ([S02.T13](../02-card-data-and-search/T13-web-card-detail-page.md)).
- **Risk — `def_idx` leaks into persisted data.** It is per-job and must never be stored; `job_pairings.deck_a_json` stores `card_id` plus count ([S04.T14](T14-jobs-schema-migration.md)). Mitigation: the schema of the stored deck uses `card_id` only, and a test asserts no `def_idx` key appears in any persisted JSON.
- **Risk — owner tags by name regex misfire** on a legitimately possessive card name that is not an owner mechanic. Mitigation: tags are additive and only consumed by rule programs that ask for them (S05); a wrong tag changes nothing until a program uses it, and [S05.T07](../05-card-rules-base/T07-rule-codes-composition-semantics.md) can override the tag list per text.
- **Question — should `CardDef` carry the raw effect texts?** Not today: the engine executes programs, never prose (D-004), and shipping texts would make jobs several times larger. If [S08.T05](../08-operations-and-extensions/T05-twinleaf-differential-oracle.md) needs text for diffing, it reads the database on the Node side. Decided by the user if the oracle asks for it.
- **Question — cache derived definitions in a table?** A `card_defs_cache(card_id, rules_snapshot, json)` table would save tens of milliseconds per job. Recommendation: do not, until step 10's measurement shows it matters; a cache is one more thing that can be stale, and staleness in card definitions is the failure RN-75 exists to prevent.

## References

- `pokemon/src/pokesearch/sim/cardspec.py` — verified: `_PRIZE_RULE = re.compile(r"takes?\s+(\d+)\s+Prize", re.I)` with the 1–3 bound and the subtype fallback (VMAX or MEGA+ex → 3); `trainer_type` precedence with its note that 28 Tools carry `["Item","Pokémon Tool"]`; `engine_stage` and the mechanic-label problem; `evolution_line` walking `evolves_from` by exact name, `ORDER BY release_date DESC LIMIT 1`, capped at 3, with the note that normal evolution reads the first element and Rare Candy the last; `energy_provides` / `energy_provides_exact` including the "every type of energy" approximation. Consult for the derivation rules; the code itself is not ported.
- `pokemon/tests/test_rules.py` — verified: `test_our_stage_2_cards_carry_the_whole_evolution_line` (59 of 65 Stage 2 cards had a short line) and the two Rare Candy restriction tests. Consult for why BR-S04.T02-04 is strict.
- [S02.T05](../02-card-data-and-search/T05-cards-schema-migration.md) — the column list this derivation reads, the `cards_name_release_idx` that makes the evolution walk cheap, and the note that `attacks.id` is a surrogate that changes on reload.
- [S01.T05](../01-foundation/T05-shared-contracts-package.md) — `CONTRACT_VERSION`, the zod→JSON Schema export and the rule that both sides of a boundary validate.
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-19, RN-75, RN-76; [Glossary](../../project/07-glossary.md) "Card definition (`CardDef`)".

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
