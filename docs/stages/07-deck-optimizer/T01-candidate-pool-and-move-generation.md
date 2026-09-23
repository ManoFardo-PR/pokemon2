# S07.T01 — Candidate pool and move generation

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 1 / 7 |
| Depends on | [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md), [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) |
| Unblocks | [S07.T02](T02-paired-seed-screening.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `cardUsage`, archetype decks in the window — from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)
- `table` `user_deck_versions` (list, fixed concept cards, price cap) — from [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)
- `table` `card_status` (exact coverage per card) — from [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)
- `doc` ESPECIFICACAO.md RN-80..RN-82

## Outputs (proposed)
- `module` `apps/worker/src/optimizer/moves.ts` — `candidatePool(db, version, { archetypeId, days })` = cards in same-archetype tournament lists with inclusion rate and avg count, filtered to `card_status.exact = 1` or Basic Energy (RN-81), within price cap; `proposeMoves(version, pool, { k, tried }) → [{ remove, add, prior }]` with prior = inclusion × (wanted − current) − (own inclusion × excess), ≤ 4 copies, concept fixed, 60 cards kept, diversity ≤ 2 moves per added/removed card — consumed by [S07.T02](T02-paired-seed-screening.md)

## Initial objective
Only sensible, legal, faithfully-modelled swaps are ever simulated, ranked by how much the archetype's real lists disagree with the user's.

## Context

Every game the optimizer plays costs time, and the stage's budget is spent before a single statistic is computed: a screening iteration is twenty-four candidates against twelve opponents, and the ones that are obviously illegal, obviously unplayable or silently mis-modelled consume exactly as much of it as the ones worth measuring. This subtask is the gate in front of that budget. It answers one question — *which one-card swaps deserve simulation at all* — and it answers it from data the project already has: what the same archetype actually plays ([S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)), what the user's list currently holds ([S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)), and which of those cards the engine can be trusted to execute ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)).

The legacy built the same gate and the rewrite keeps its shape. `sim/optimizer.py::propose_moves` (L287–326) scored each possible swap by how far the user's copy count sat from the archetype's average, weighted by how often the archetype includes the card, and subtracted a penalty for tearing out a card the user's own list over-plays relative to the field; the highest-scoring moves were kept subject to a diversity filter capping two proposals per added card and two per removed card, so that a single fashionable card could not occupy the whole candidate list. `apply_move` (L329–335) produced the swapped list from `deck.copy()` without mutating the original. Three legacy rules come with it, and the traceability doc keeps all three: a move is the exchange of one copy for one copy, within the 4-copy limit, never touching the deck's concept cards, and never breaking the price cap (RN-80); only cards the engine models faithfully may enter the pool (RN-81); and candidates come from tournament lists of the same archetype rather than from the user's imagination or from a card-text search (RN-82).

Two details of the legacy's own implementation are changed rather than copied, and both are recorded here so a reader comparing the two does not think the rewrite drifted by accident. **The concept guard becomes absolute.** `propose_moves` L300 skipped a removal only when `rk in fixed_keys and c["count"] <= 1`, so a concept card held at two or more copies could still lose one; here a fixed name key is never removed at any count, because "the concept is fixed" is easier to reason about than "the concept is fixed once it is down to its last copy", and a user who wants the looser behaviour removes the name from `fixed`. **The filter lives in one place.** In the legacy the faithful-only rule was in `scripts/deck_optimize.py`, not in `optimizer.candidate_pool`, so the library optimizer would happily propose a `vanilla` skeleton card while the script would not; RN-81 here is enforced inside `candidatePool` itself, and there is no second entry point that can skip it.

RN-81 is the one that changed mechanism and grew teeth. In the legacy, `scripts/deck_optimize.py` carried a `fiel` — "faithful" — filter that restricted the pool to cards the simulator claimed to implement exactly, and `optimizer.py::prepare_deck` had an escape hatch underneath it: it called `cardgen.ensure_cards_for_deck(..., use_llm=True)`, so a list that reached the engine with an unmodelled card could have that card **generated by a language model in the middle of an optimisation run**. The number that came out then depended on a card definition nobody had reviewed, produced during the very run that used it. Under D-004 rules are data authored ahead of time, and Architecture principle 8 keeps LLMs off the critical path (RN-60). So the filter becomes the whole of the mechanism: a card without `card_status.exact = 1` is excluded from the pool, an opponent list or a user list that contains one makes the job refuse rather than improvise, and nothing in the optimize path may author a rule. That is BR-S07.T01-06 and it is restated as a job-level guard in [S07.T05](T05-optimize-job-orchestration.md).

Two smaller decisions are worth recording because they were left open elsewhere. **Price.** [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) prices a deck version at the exact printing the user typed, which is the right answer for "what does my list cost". The optimizer asks a different question — "can I afford to add this card at all" — so the budget cap here is evaluated against the cheapest legal printing per name key, the legacy `price_table` definition, and the two numbers are deliberately not the same. Every candidate row carries the delta it would apply to the version's stored `price_usd` as well as the cap arithmetic, so the difference is visible rather than surprising. **Basic Energy.** It is exempt from the 4-copy limit and is usually textless, so it is `exact` by construction ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) RN-75); counts of Basic Energy are the single most common real swap in a list and excluding them would make the optimizer unable to fix the most fixable thing about a deck.

The module is pure with respect to the database: `candidatePool` reads, `proposeMoves` and `applyMove` are functions of their arguments. No row is written here. That matters because [S07.T05](T05-optimize-job-orchestration.md) calls `proposeMoves` once per iteration against a list that only exists in memory until a swap is accepted, and because the unit tests for the prior and the diversity filter must be runnable without a database at all.

## Scope

- **In scope.** `apps/worker/src/optimizer/moves.ts` with `candidatePool`, `proposeMoves`, `applyMove`, `describeMove` and the `Move`/`PoolEntry` types; the pool query over same-archetype tournament lists with inclusion, average count and the most-played printing; the RN-81 coverage filter and its `unmodelled` report; the price cap over the cheapest legal printing; the prior formula and its constants; the diversity filter; the `tried` exclusion set and the move log; the fixed-card set and how it is read from the deck version; the pool and move fixtures for the Dhelmise list.
- **Out of scope.** Simulating anything ([S07.T02](T02-paired-seed-screening.md)); deciding whether a move is good ([S07.T03](T03-sequential-confirmation.md), [S07.T04](T04-holdout-acceptance-and-versioning.md)); writing deck versions or `optimizer_candidates` rows ([S07.T04](T04-holdout-acceptance-and-versioning.md)); the iteration loop and the job ([S07.T05](T05-optimize-job-orchestration.md)); the page that shows the pool ([S07.T06](T06-web-optimizer-page.md)); computing `cardUsage`, archetype shares and representative lists ([S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)); computing coverage ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)); deck validation itself ([S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md)), which this module calls rather than reimplements; multi-card moves, which are explicitly not proposed (see Risks).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-80 | **Kept.** A move removes exactly one copy of one card and adds exactly one copy of another, so the list stays at 60; the resulting count of any name is at most 4 (Basic Energy exempt); a card in the version's fixed set is never removed; and the resulting list's cost, priced at the cheapest legal printing per name, is at most `priceCap` when one is given. | `proposeMoves`'s four guards, each applied before a move enters the returned array; `applyMove` re-asserts them and throws `MoveError` | `moves.spec.ts > a move keeps the list at 60 cards`; `> a move that would create a 5th copy is not proposed`; `> a fixed card is never removed`; `> a move over the price cap is not proposed`; `> applyMove rejects a hand-built illegal move` |
| RN-81 | **Kept, and it is the only mechanism.** A card enters the pool only when `card_status.exact = 1` for the printing that would be added, or when it is Basic Energy. A card that is `approx`, `draft`, `unimplemented` or has no codes at all is excluded and listed in `pool.unmodelled`. Nothing in this module — and nothing in the optimize job — may author, generate or infer a rule for an uncovered card. | the `JOIN card_status s ON s.card_id = p.card_id AND s.exact = 1` in `candidatePool`; `moves.ts` imports nothing from the authoring or LLM packages, asserted by an import-graph test | `pool.spec.ts > an approx card is excluded and reported in unmodelled`; `> Basic Energy is admitted without a card_status row`; `policy.spec.ts > optimizer/moves.ts imports no authoring or llm module` |
| RN-82 | **Kept.** The pool is the set of cards appearing in decks of the same archetype inside the RN-03 meta window; a card played by nobody in that archetype is not a candidate, whatever its text says. The archetype is the version's `archetype_id` when set, otherwise the one the caller passes. | `candidatePool`'s query filters `decks.archetype_id = :archetypeId` over the window predicates of [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) | `pool.spec.ts > only same-archetype cards enter the pool` (a card played only by another archetype is absent); `> the window predicates match RN-03` |
| BR-S07.T01-01 | `prior(remove, add) = inclusion(add) × max(0, wanted(add) − current(add)) − inclusion(remove) × max(0, current(remove) − wanted(remove) + REMOVAL_FLOOR)`, with `wanted = avgCount` (the archetype's mean copies among decks that play the card, **not** rounded), `inclusion ∈ [0, 1]` the share of the archetype's decks containing it, `current` the copy count in the evaluated list, and `REMOVAL_FLOOR = 0.5`. Moves with `prior ≤ 0` are not proposed. | `prior()` in `moves.ts`, a pure function of the pool entry and the current list | `moves.spec.ts > prior matches the documented formula on the fixture pool`; `> removing a card sitting exactly at its archetype average still costs inclusion × 0.5`; `> a move with prior 0 is not proposed` |
| BR-S07.T01-02 | The diversity filter admits at most `MAX_PER_CARD` (2) proposals that add the same card and at most 2 that remove the same card, walking the moves in descending `prior`; the result is truncated to `k` (default 24, maximum 24). | the post-sort filter in `proposeMoves` | `moves.spec.ts > at most two proposals add the same card`; `> at most two proposals remove the same card`; `> the result never exceeds k and never exceeds 24` |
| BR-S07.T01-03 | A move already in `tried` is never proposed again inside the same job, where a move's identity is the ordered pair `(removeCardId, addCardId)` evaluated against the *current* list; every proposal generated in the job is appended to the move log with its iteration, prior and outcome, whether or not it was simulated. | `proposeMoves`'s `tried` set; the log is returned by the function and persisted by [S07.T05](T05-optimize-job-orchestration.md) | `moves.spec.ts > a tried move is not proposed again`; `> the move log records every proposal with its iteration and prior` |
| BR-S07.T01-04 | `applyMove(list, move)` returns a new list and never mutates its input; applying a move and then its inverse returns a list byte-identical to the original after canonical serialization. | `applyMove` copies before editing; the lines are re-sorted into the canonical order of [S03.T09](../03-tournament-meta-and-deck-builder/T09-decklist-parser-and-exporter.md) | `moves.spec.ts > applyMove does not mutate its input` (the input is serialized before and after and compared); `> a move and its inverse round-trip` |
| BR-S07.T01-05 | Every proposed list is valid: `validateDeck` ([S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md)) returns `ok = true` for `applyMove(list, move)` for every move `proposeMoves` returns. A move whose result fails validation is a defect in this module, not a case for the caller to handle. | the assertion pass at the end of `proposeMoves`, enabled in development and in tests | `moves.spec.ts > every proposed move yields a valid 60-card list` (property test over 500 random pools and lists) |
| BR-S07.T01-06 | An optimize job that encounters a card without exact coverage — in the user's list, in an opponent's list or in a candidate — refuses that card: it is excluded from the pool, and when it is in a list that must be played the job fails with `UncoveredCard` naming the card and its status. No code path generates, authors or approximates a card definition during an optimize job (RN-81, RN-60, D-004). | `candidatePool` returns `unmodelled`; `assertListCovered(db, list)` is called by [S07.T05](T05-optimize-job-orchestration.md) before the first game; `moves.ts` has no dependency on `apps/worker/src/authoring` or `packages/llm` | `pool.spec.ts > a user list with an approx card fails assertListCovered with the card id and its status`; `policy.spec.ts > optimizer/moves.ts imports no authoring or llm module` |
| BR-S07.T01-07 | The price cap is evaluated against the **cheapest legal printing per name key**, not against the printing stored in the list; the pool entry carries both that price and the printing the swap would actually add, and `candidatePool` reports `priceBasis: "cheapest_legal"` so a reader cannot confuse it with `user_deck_versions.price_usd`. | `cheapestLegalPrice(db, nameKey, format)` used by the cap check; the `PoolEntry.priceUsd` field is documented as the cheapest legal printing | `pool.spec.ts > the cap uses the cheapest legal printing`; `> a pool entry's price differs from the version's stored price for the same name when the printings differ, and both are reported` |
| BR-S07.T01-08 | `candidatePool` and `proposeMoves` issue no `INSERT`, `UPDATE` or `DELETE`; the module runs against a read-only connection. | the writer-ownership SQL lint ([S01.T10](../01-foundation/T10-quality-gates-and-docs-lint.md)) | `pool.spec.ts > read only` — the whole spec runs against a connection opened with `readonly: true` |

## Data operations

**Algorithm — `candidatePool` then `proposeMoves`.**

| Step | Operation | Inputs | Output | Rule |
|---|---|---|---|---|
| 1 | Read the evaluated list and its constraints | `user_deck_versions.list_json`, `.price_usd`, the job's `fixed` and `priceCap` | `current: Map<nameKey, { count, cardId, category }>`, `fixed: Set<nameKey>`, `priceCap` | RN-80 |
| 2 | Resolve the archetype | `user_decks.archetype_id`, else the caller's `archetypeId` | `archetypeId` | RN-82 |
| 3 | Aggregate same-archetype lists in the window | `decks`, `deck_cards`, `tournaments` with the RN-03 predicates and `decks.archetype_id = :archetypeId` | per `name_key`: `decks`, `copies`, `inclusion = decks ÷ archetypeDecks`, `avgCount`, most-played `card_id` | RN-82, RN-03 |
| 4 | Filter by coverage | step 3 joined to `card_status` on the most-played `card_id` | admitted entries; excluded ones collected into `unmodelled[]` with their `status` | RN-81, BR-S07.T01-06 |
| 5 | Price the entries | `cheapestLegalPrice(db, nameKey, format)` per admitted entry | `PoolEntry.priceUsd`, `priceBasis = "cheapest_legal"` | BR-S07.T01-07 |
| 6 | Build the removable set | every name in `current` that is not in `fixed` | `removable: PoolEntry[]` | RN-80 |
| 7 | Build the addable set | pool entries whose `inclusion ≥ MIN_INCLUSION` and whose `current < COPY_LIMIT` (Basic Energy exempt from the limit) | `addable: PoolEntry[]` | RN-80 |
| 8 | Score the cross product | `prior(remove, add)` per pair; drop `prior ≤ 0`; drop pairs in `tried`; drop pairs whose applied list breaks the cap | scored moves | BR-S07.T01-01, -03, RN-80 |
| 9 | Sort and diversify | descending `prior`, tie-broken by `(add.inclusion desc, add.nameKey, remove.nameKey)` | at most 2 per added card and 2 per removed card | BR-S07.T01-02 |
| 10 | Truncate and validate | `k` (≤ 24); `validateDeck(applyMove(list, move))` per survivor | `Move[]` plus the move log | BR-S07.T01-02, -05 |

**Tables read** (no writes anywhere in this module — BR-S07.T01-08).

| Entity | Operation (C/R/U/D) | Actor (api/worker/etl) | When | Constraints & idempotency | Notes |
|---|---|---|---|---|---|
| `user_decks`, `user_deck_versions` | R | worker | once per `candidatePool` call | read-only; the version is immutable ([S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) BR-S03.T11-01) | `list_json`, `archetype_id`, `price_usd` |
| `decks`, `deck_cards`, `tournaments` | R | worker | the step-3 aggregate, once per iteration | read-only; the RN-03 window predicates come from [S03.T05](../03-tournament-meta-and-deck-builder/T05-decks-sync-and-prune.md) | ETL-owned tables |
| `card_status` (view) | R | worker | step 4, one batched join | read-only by definition | [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) |
| `cards`, `sets`, `cards_market_usd` | R | worker | step 5, batched per name key | read-only | cheapest legal printing (BR-S07.T01-07) |
| any table | C/U/D | worker | never in this module | writes belong to [S07.T04](T04-holdout-acceptance-and-versioning.md) | Architecture principle 2 |
| the database | — | engine | never | the engine receives card defs and programs in the job JSON | Architecture principle 1 |

## Interfaces

**`apps/worker/src/optimizer/moves.ts`**

```ts
import type { Db } from "@pokesearch/db";
import type { DeckLine } from "@pokesearch/shared/decklist";
import type { CodeStatus } from "@pokesearch/shared/rules";

export const MAX_CANDIDATES = 24;       // k ceiling for one screening iteration
export const MAX_PER_CARD   = 2;        // diversity filter (BR-S07.T01-02); the legacy constant
export const COPY_LIMIT     = 4;        // RN-80; Basic Energy exempt
export const MIN_INCLUSION  = 0.05;     // pool floor; the legacy script's value (library default was 0.08)
export const REMOVAL_FLOOR  = 0.5;      // the legacy `+ 0.5` in the removal penalty (BR-S07.T01-01)
export const CORE_INCLUSION = 0.6;      // default `fixed` set: the archetype's core cards (S03.T06)

export interface PoolEntry {
  nameKey: string;
  name: string;
  category: "pokemon" | "trainer" | "energy";
  cardId: string;                       // the most-played printing in the archetype's lists
  setCode: string | null;
  number: string | null;
  decks: number;                        // archetype decks containing it, in the window
  inclusion: number;                    // decks ÷ archetypeDecks, in [0, 1]
  avgCount: number;                     // mean copies among decks that play it
  wanted: number;                       // === avgCount; real-valued, as the legacy `want` (BR-S07.T01-01)
  current: number;                      // copies in the evaluated list
  priceUsd: number | null;              // cheapest legal printing (BR-S07.T01-07)
  priceBasis: "cheapest_legal";
  isBasicEnergy: boolean;
}

export interface UnmodelledEntry {
  nameKey: string; name: string; cardId: string | null;
  status: CodeStatus | "no_codes" | "unresolved";
  copies: number;                       // copies in the archetype's lists, for the report
}

export interface CandidatePool {
  archetypeId: string;
  archetypeDecks: number;               // denominator of `inclusion`
  window: { format: string; days: number; tournaments: number };
  entries: PoolEntry[];                 // RN-81-admitted only
  unmodelled: UnmodelledEntry[];        // excluded by RN-81, reported not hidden
  priceCap: number | null;
  fixed: string[];                      // name keys that may not be removed (RN-80)
}

export interface Move {
  remove: { nameKey: string; name: string; cardId: string };
  add:    { nameKey: string; name: string; cardId: string };
  prior: number;
  priceDeltaUsd: number | null;         // cheapest-legal basis, for the cap arithmetic
  desc: string;                         // `-1 Spiritomb, +1 Shaymin` (S03.T11 describeDiff form)
}

export interface MoveLogRow {
  iteration: number; remove: string; add: string; prior: number;
  proposed: boolean; reason?: "tried" | "price_cap" | "copy_limit" | "fixed" | "diversity" | "prior_le_0";
}

export interface ProposeOpts { k?: number; tried?: ReadonlySet<string>; iteration?: number }

export function candidatePool(
  db: Db,
  version: { id: number; listJson: DeckLine[]; archetypeId: string | null; format: string },
  opts: { archetypeId?: string; days?: number; priceCap?: number | null; fixed?: readonly string[] },
): CandidatePool;

export function proposeMoves(
  list: readonly DeckLine[],
  pool: CandidatePool,
  opts?: ProposeOpts,
): { moves: Move[]; log: MoveLogRow[] };

export function applyMove(list: readonly DeckLine[], move: Move): DeckLine[];   // pure (BR-S07.T01-04)
export function moveKey(move: Move): string;                                   // `${remove.cardId}>${add.cardId}`
export function describeMove(move: Move): string;                              // reuses describeDiff (S03.T11)

/** Throws `UncoveredCard` when any card of `list` lacks `card_status.exact = 1` (BR-S07.T01-06). */
export function assertListCovered(db: Db, list: readonly DeckLine[], label: string): void;

export class MoveError extends Error {
  readonly kind: "copy_limit" | "fixed_card" | "price_cap" | "not_sixty" | "unknown_card";
}
export class UncoveredCard extends Error {
  readonly cardId: string; readonly name: string; readonly status: string; readonly label: string;
}
```

**The prior, stated once.** For a pair `(remove, add)` evaluated against the current list — the legacy expression of `optimizer.py` L304, with its constants:

```text
inclusion(c) = archetype decks containing c ÷ archetype decks in the window        ∈ [0, 1]
wanted(c)    = avgCount(c) = copies ÷ decks that play it                           (real, not rounded)
current(c)   = copies of c in the evaluated list                                   (0 when absent)
gain(add)    = max(0, wanted(add)    − current(add))
cost(remove) = max(0, current(remove) − wanted(remove) + 0.5)                      // REMOVAL_FLOOR

prior = inclusion(add) × gain(add)  −  inclusion(remove) × cost(remove)
```

The first term is "the field plays this and you do not", scaled by how widely the field plays it. The second term is the cost of the removal, and it is deliberately asymmetric: removing a copy the list over-plays relative to the field is cheap, and removing a copy of a card the field plays as often as the user does is expensive. The `+ 0.5` is the legacy's, and it is the reason a card sitting *exactly* at the archetype average still costs `inclusion × 0.5` to remove — no removal is ever free, which is what stops the ranking from filling up with lateral shuffles between two equally-played cards. `prior ≤ 0` is dropped rather than ranked, which the legacy did not do: there, a zero-gain move could still occupy one of the `k` slots when the pool was small, and the run spent 50 games per opponent measuring a swap its own prior argued against. The prior orders candidates; it never decides anything. A candidate with a high prior and a negative screening Δ is dropped in [S07.T02](T02-paired-seed-screening.md) like any other.

**The pool query** (SQLite; portable as written — no dialect construct):

```sql
-- @postgres: identical.
WITH archetype_decks AS (
  SELECT d.id
  FROM decks d
  JOIN tournaments t ON t.id = d.tournament_id
  WHERE d.archetype_id = :archetypeId
    AND t.format = :format
    AND t.date >= :cutoff
    AND t.players >= 16
),
n AS (SELECT COUNT(*) AS decks FROM archetype_decks),
agg AS (
  SELECT dc.name_key,
         MIN(dc.name)                              AS name,
         dc.category,
         COUNT(DISTINCT dc.deck_id)                AS decks,
         AVG(dc.count)                             AS avg_count,
         (SELECT dc2.card_id FROM deck_cards dc2
           WHERE dc2.name_key = dc.name_key AND dc2.deck_id IN (SELECT id FROM archetype_decks)
             AND dc2.card_id IS NOT NULL
           GROUP BY dc2.card_id ORDER BY COUNT(*) DESC, dc2.card_id LIMIT 1) AS card_id
  FROM deck_cards dc
  WHERE dc.deck_id IN (SELECT id FROM archetype_decks)
  GROUP BY dc.name_key, dc.category
)
SELECT agg.*, n.decks AS archetype_decks,
       CAST(agg.decks AS REAL) / n.decks AS inclusion,
       s.exact AS status_exact
FROM agg CROSS JOIN n
LEFT JOIN card_status s ON s.card_id = agg.card_id
ORDER BY inclusion DESC, agg.name_key;
```

Rows with `status_exact <> 1` and `category <> 'energy' OR NOT isBasicEnergy` become `unmodelled` entries rather than pool entries (RN-81). `cardUsage` from [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md) is the window-wide counterpart of this aggregate and is reused unchanged for the `inclusion` denominators the page shows ([S07.T06](T06-web-optimizer-page.md)); the query above is archetype-scoped because RN-82 scopes the pool, not the display.

**Fixed cards.** The version's concept cards are the name keys the user marked as fixed; they arrive in the optimize job's `fixed` parameter ([S07.T05](T05-optimize-job-orchestration.md)) and default to the Pokémon lines whose inclusion in the archetype is at least `CORE_INCLUSION` — the archetype's own core cards, in the [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md) sense. The default is a convenience, not a rule: a user who wants to test removing a core card passes `fixed: []`.

## Implementation steps

1. Add `apps/worker/src/optimizer/moves.ts` with the `PoolEntry`, `Move`, `CandidatePool` and error types, plus `moveKey` and `describeMove` reusing `describeDiff` from [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md). `pnpm --filter worker test` green on a trivial spec.
2. Write `applyMove` over `DeckLine[]` with the canonical re-sort, and spec purity and the inverse round-trip (BR-S07.T01-04).
3. Write the archetype aggregate query and `candidatePool` steps 1–3; spec `> only same-archetype cards enter the pool` and the RN-03 window predicates against a two-tournament fixture (RN-82).
4. Add the `card_status` join and the `unmodelled` report (step 4); spec the `approx` exclusion and the Basic Energy admission (RN-81).
5. Add `cheapestLegalPrice` and the price fields (step 5); spec that the pool price and the version's stored `price_usd` may differ for the same name and that both are reported (BR-S07.T01-07).
6. Write `prior()` and spec it against a hand-computed fixture table, including the `prior ≤ 0` drop (BR-S07.T01-01).
7. Write `proposeMoves` steps 6–8 (removable, addable, scoring, `tried`, cap) with the move log; spec the four `reason` values (RN-80, BR-S07.T01-03).
8. Add the diversity filter and the `k` truncation (step 9); spec both caps and the tie-break order (BR-S07.T01-02).
9. Add the validation assertion (step 10) and the property test over 500 random pools and lists (BR-S07.T01-05).
10. Write `assertListCovered` and the import-graph policy test forbidding any authoring or LLM import from this module (BR-S07.T01-06, RN-81, RN-60).
11. Build the Dhelmise fixture — the user's deck version plus the archetype's tournament lists in the window — and record the top-8 proposals with their priors and inclusions in the completion note, as the baseline [S07.T05](T05-optimize-job-orchestration.md)'s end-to-end run is compared against.

## Edge cases and error handling

- **The archetype has fewer than three decks in the window.** The inclusion denominator is too small for the prior to mean anything. `candidatePool` returns `entries: []` with `archetypeDecks` set, and [S07.T05](T05-optimize-job-orchestration.md) fails the job with a message naming the archetype and the count rather than proposing swaps from a two-deck sample.
- **The version has no `archetype_id` and the caller passes none.** `candidatePool` throws `MoveError { kind: "unknown_card" }`'s sibling `ArchetypeUnknown`; guessing the archetype from the most-copied Pokémon is [S03.T13](../03-tournament-meta-and-deck-builder/T13-deck-comparison-with-tournament-lists.md)'s inference and is offered by the page, not assumed here.
- **Every addable card is already at its wanted count.** No move has a positive first term, so `proposeMoves` returns `[]` with a log of `prior_le_0` reasons. The list already matches the field; the job reports "no candidate outside the pool's agreement" instead of simulating filler.
- **A card in the user's list is not in `cards`** (an unresolved line, `cardId: null`). It cannot be removed (no `cardId` to name) and it makes the list fail `assertListCovered` with `status: "unresolved"`. The user fixes the line in the builder; the optimizer does not guess which printing was meant.
- **A candidate is legal but the *resulting* list is not** — adding a second ACE SPEC, or a card whose regulation mark is outside the format. `validateDeck` catches it at step 10 and the move is dropped with the validation code in the log, so an `ACE_SPEC_LIMIT` never reaches the engine.
- **The price cap excludes every addable card.** The pool is non-empty, `addable` is non-empty, and every scored move fails the cap. `proposeMoves` returns `[]` with every log row carrying `reason: "price_cap"`, and the caller reports the cap and the cheapest excluded candidate so the user can see what raising it by a few dollars would buy.
- **A card has no price at all** (`cards_market_usd` has no row). It is treated as cost 0 for the cap — the same convention [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) BR-S03.T11-07 uses for unpriced lines — and the pool entry carries `priceUsd: null`, so the report can say the cap was evaluated with an unpriced card in it.
- **A concept-fixed card is also the only sensible removal.** The move is not proposed and the log records `reason: "fixed"`. The user sees the blocked move on the page ([S07.T06](T06-web-optimizer-page.md)) and can unfix the card; the optimizer never overrides the constraint silently.
- **Basic Energy at 12 copies.** The copy limit does not apply, but `wanted` still does: the prior is driven by the archetype's average count, so a list with four more Basic Energy than the field gets a positive-prior removal, which is usually the first real improvement a list has.
- **`tried` grows across iterations.** It is keyed on `(removeCardId, addCardId)` and a move's meaning changes when the list changes — removing the third copy of a card is not the same decision as removing its last. The set is kept anyway, because re-testing an already-screened swap on the same iteration's seeds is exactly the multiple-testing leak [S07.T03](T03-sequential-confirmation.md) exists to control; [S07.T05](T05-optimize-job-orchestration.md) clears it only when a swap is accepted.
- **Two proposals are the same swap written the other way round** (`−1 A, +1 B` and `−1 B, +1 A`). Both can have a positive prior only when the pool disagrees with itself, which the aggregate cannot produce; the property test asserts that no returned pair of moves is mutually inverse.

## Acceptance / verification

- [ ] `pnpm --filter worker test moves.spec.ts` green, including `> applyMove does not mutate its input` and `> a move and its inverse round-trip` (BR-S07.T01-04).
- [ ] `moves.spec.ts > prior matches the documented formula on the fixture pool` — a table-driven test over eight hand-computed `(inclusion, wanted, current)` combinations, including the `prior ≤ 0` drop (BR-S07.T01-01).
- [ ] `moves.spec.ts > every proposed move yields a valid 60-card list` — a property test over 500 random pools and lists, asserting `validateDeck(applyMove(...)).ok` for every returned move (BR-S07.T01-05, RN-80).
- [ ] `moves.spec.ts > at most two proposals add the same card`, `> at most two proposals remove the same card`, `> the result never exceeds k and never exceeds 24` (BR-S07.T01-02).
- [ ] `moves.spec.ts > a fixed card is never removed`, `> a move that would create a 5th copy is not proposed`, `> a move over the price cap is not proposed`, and `> applyMove rejects a hand-built illegal move` with the matching `MoveError.kind` (RN-80).
- [ ] `pool.spec.ts > an approx card is excluded and reported in unmodelled` and `> Basic Energy is admitted without a card_status row` (RN-81).
- [ ] `pool.spec.ts > a user list with an approx card fails assertListCovered with the card id and its status`, and `policy.spec.ts > optimizer/moves.ts imports no authoring or llm module` — an import-graph assertion (BR-S07.T01-06, RN-60).
- [ ] `pool.spec.ts > only same-archetype cards enter the pool` and `> the window predicates match RN-03` against a fixture with one out-of-window tournament and one under 16 players (RN-82, RN-03).
- [ ] `pool.spec.ts > the cap uses the cheapest legal printing` — a name whose cheapest legal printing is cheaper than the one in the list passes a cap the list price would fail, and both numbers appear in the entry (BR-S07.T01-07).
- [ ] `pool.spec.ts > read only` — the whole spec passes against a connection opened with `readonly: true` (BR-S07.T01-08).
- [ ] On the Dhelmise fixture, `proposeMoves(list, pool, { k: 8 })` returns eight moves whose added cards all have `inclusion ≥ 0.30` in the archetype, none of which breaks the 4-copy rule, the fixed set or the price cap; the eight moves with their priors are recorded in the completion note.

## Risks and open questions

- **Risk — the pool is only as honest as the coverage number.** RN-81 filters on `card_status.exact`, which is a claim of intention proven by evidence only where a scenario exists ([S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md)). An `exact` card with no scenario can still be wrong, and the optimizer would then measure the wrong card faithfully. Mitigation: `candidatePool` reports the pool's `proven` share alongside its `exact` filter and [S07.T06](T06-web-optimizer-page.md) shows it next to the candidate table, so a run over a pool that is exact-but-unproven is legible rather than silent. Filtering on `proven` instead would empty the pool early in the project and is offered as a job flag, not as the default.
- **Risk — the prior encodes "play what the field plays".** A list that is deliberately different from the field is pushed toward the mean by construction, and a genuinely novel card is never proposed because no tournament deck plays it yet. Mitigation: RN-82 is the legacy's rule and is kept, the prior only orders candidates, and the honest framing is on the page: the optimizer searches the archetype's own space, not the space of all legal cards. A "wildcard" pool drawn from `cardUsage` across archetypes is a separate feature with its own risk of an unbounded search.
- **Risk — one-card moves cannot find a two-card change.** Swapping a Pokémon and its matching tool is two moves, and neither is an improvement alone; the optimizer will never find it. Mitigation: the iteration loop applies accepted moves and re-proposes, so a two-card change is reachable when the first half is individually non-harmful; when it is not, it is out of reach and that is stated. Widening to pairs multiplies the candidate count by the pool size and is not proposed.
- **Risk — the diversity filter hides the best move.** Capping at two proposals per added card can drop a third, better removal for the same addition. Mitigation: the cap applies after the descending-prior sort, so the two kept are the two highest-prior ones, and the move log records every dropped pair with `reason: "diversity"` so the page can show them.
- **Question — should `wanted` be the mean or the mode of the archetype's counts?** `round(avgCount)` follows the legacy; the mode would better reflect a field split between 2-of and 4-of lists, where the mean lands on an unplayed 3. Recommendation: keep the mean for parity with the legacy pool, report both in the pool entry once the page exists, and let the user decide after seeing a real archetype.
- **Question — should the default `fixed` set really be the archetype's core cards?** It makes the first run safe and the optimizer conservative. The alternative is an empty default, which lets the optimizer question the concept. Recommendation: keep the core-card default and make it one checkbox on the page; the user decides per run.
- **DEPENDENCY-PROPOSAL: S07.T01 should depend on S03.T09 and S03.T10 because** `applyMove` re-sorts into the canonical decklist order that [S03.T09](../03-tournament-meta-and-deck-builder/T09-decklist-parser-and-exporter.md) defines and BR-S07.T01-05 calls `validateDeck` from [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md) on every proposal; today both are reached only transitively through [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md).
- **DEPENDENCY-PROPOSAL: S07.T01 should depend on S03.T05 because** the pool query reuses that subtask's RN-03 window predicates over `decks`, `deck_cards` and `tournaments` verbatim; today it is reached only through [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md)'s functions, which do not expose an archetype-scoped aggregate.

## References

- `pokemon/src/pokesearch/sim/optimizer.py` L287–326 (`propose_moves`) — verified: the prior at L304, `(cand["inclusion"] * max(0.0, want - cur)) - (u.get("inclusion", 0.0) * max(0.0, c["count"] - u.get("avg_count", 0) + 0.5))` with `want = cand.get("avg_count", 1)`; the 4-copy guard at L296–297 (`if cur >= 4 and not _is_basic_energy(cand)`); the concept guard at L300 (`rk in fixed_keys and c["count"] <= 1` — looser than BR-S07.T01-01, see Context); the price check at L308–310 recomputing `deck.price()` inside the inner loop; the `tried` exclusion keyed on the display string `desc = f"-1 {c['name']} / +1 {cand['name']}"` at L305–307; `moves.sort(key=lambda m: -m.prior)` with no tie-break at L312; and the diversity loop at L313–325 capping `per_add` and `per_remove` at 2 and stopping at `k` (default 6; the script passed 8).
- `pokemon/src/pokesearch/sim/optimizer.py` L271–284 (`candidate_pool`) — verified: `min_inclusion` defaulting to 0.08 and overridden to 0.05 by `scripts/deck_optimize.py` L77; the same 4-copy guard; `inclusion = min(1.0, decks / n)` and `avg_count = copies / max(decks, 1)` from `card_usage` L106–130. `MIN_INCLUSION = 0.05` here follows the script, which is the path that produced the Dhelmise run.
- `pokemon/src/pokesearch/sim/optimizer.py` L329–335 (`apply_move`) — verified: `d = deck.copy()` then `remove(key, 1)` / `add(card, 1)`, so the input list is untouched and no 60-card or 4-copy validation happens at apply time. BR-S07.T01-04 keeps the purity; BR-S07.T01-05 adds the validation the legacy left to the pre-filters.
- `pokemon/src/pokesearch/sim/optimizer.py` L350–359 (`prepare_deck`) — verified: `gen = cardgen.ensure_cards_for_deck(conn, export_text, use_llm=use_llm)` at L352, reached with `use_llm=True` through `OptimizeConfig.use_llm_cards = True` (L419), and called **inside the optimisation loop** at L481 for every screened candidate and at L497 for the confirmation. Missing card definitions were therefore generated by a language model during the very run that measured them. This is the behaviour BR-S07.T01-06 removes outright; under D-004 rules are authored ahead of time and RN-60 keeps LLMs off the critical path. Note that the `scripts/deck_optimize.py` path avoided it entirely, skipping candidates whose `ea.convert_decklist(...).missing` was non-empty (L88).
- `pokemon/scripts/deck_optimize.py` L59–64 — verified: the `fiel` ("faithful") filter, `lambda k: k in engine or impl.get(k) in ("catalog", "vanilla_exact", "generated", "approved") or k.endswith(" energy")`, applied to the candidate `usage` map only — never to the cards already in the deck — with the comment *"só entra carta com efeito fiel: aproximada mede o esqueleto, não a carta"*. RN-81's source. `assertListCovered` extends it to the lists that must be played, which is the gap the legacy left.
- `pokemon/scripts/deck_optimize.py` L56–58 and L78 — verified: the pool drawn from `decks JOIN tournaments WHERE d.archetype_id LIKE ? AND t.format = 'STANDARD' AND d.card_total = 60` (RN-82), and `fixed_keys` hardcoded to `{"dhelmise"}` with `budget=None` and `prices={}`, so the price cap was inert in the run that produced the benchmark.
- `pokemon/ESPECIFICACAO.md` §4.7 RN-80..RN-82 — verified: RN-80 *"Movimento = trocar 1 cópia. Máximo 4 cópias (exceto Energia Básica), conceito do deck fixo, teto de preço do projeto"*; RN-81 *"Na régua fixa, só entra carta com efeito fiel … carta aproximada mede o esqueleto, não a carta"*; RN-82 *"Pool de candidatas = listas de torneio Standard de 60 cartas do mesmo arquétipo"*.
- `pokemon/src/pokesearch/sim/optimizer.py` L93–130 — verified through [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md): `price_table` returning the cheapest legal printing per `name_key` (the basis BR-S07.T01-07 uses for the cap) and `card_usage(conn, deck_ids)` returning inclusion, average count and the most common printing per `name_key` — the archetype-scoped aggregate this subtask's step 3 reproduces.
- `pokemon/src/pokesearch/sim/optimizer.py` L40–41, L77–85 — verified through [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md): `DeckList.price()` as `Σ (price or 0) × count` and `describe_diff` producing `-1 Spiritomb, +1 Shaymin`, the string `describeMove` reuses.
- [S03.T06](../03-tournament-meta-and-deck-builder/T06-meta-queries.md) (`cardUsage`, archetype panels, core cards at 60 % inclusion), [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md) (`user_deck_versions` columns, `describeDiff`, the exact-printing price definition), [S05.T12](../05-card-rules-base/T12-evidence-and-coverage-metrics.md) (`card_status`, the four evidence kinds, `coverageForList`), [S03.T10](../03-tournament-meta-and-deck-builder/T10-deck-validation-rules.md) (`validateDeck` and its codes), [Decision log](../../project/02-decision-log.md) D-004.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
