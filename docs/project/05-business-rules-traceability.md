# Business rules traceability (RN-xx → subtasks)

| Field | Value |
|---|---|
| Doc | project/05 |
| Status | DRAFT — statuses update as subtasks complete |
| Inputs | Legacy `ESPECIFICACAO.md` §4 (rules RN-01..RN-84, with their legacy implementation pointers) |
| Outputs | For every rule: the subtask(s) that implement or verify it in the rewrite, and whether the rule is kept, revised or superseded |

Legend — **Kept**: same rule; **Revised**: same intent, new mechanism; **Superseded**: no longer applies (reason given). Verification column names where the rule is asserted (scenario, unit test, invariant, or UI behaviour).

## Data (RN-01..RN-06)

| RN | Rule (short) | Disposition | Implemented in | Verified by |
|---|---|---|---|---|
| RN-01 | Raw JSON of both card sources preserved; neither overwrites the other | Kept | S02.T05, S02.T06 | loader tests (fixture card round-trip) |
| RN-02 | Decklist line resolution order: card override → set alias + number → exact code+number → digits → name (newest legal printing) → unresolved with fallback image | Kept | S03.T04 | resolver unit tests |
| RN-03 | Meta = Standard, last 90 days, ≥ 16 players, ≤ 400 tournaments | Kept | S03.T02, S03.T05; denominator reuse in S05.T12; opponent weights in S04.T17 | client tests; coverage invariant |
| RN-04 | Tournaments older than 180 days are pruned | Kept | S03.T05 | sync test |
| RN-05 | Effects match by exact printing text, not by name | Kept (by construction) | S05.T02 (texts keyed by hash) | hash tests (Dunsparce printings differ) |
| RN-06 | Player counts of scraped events are estimated by event type | Kept | S03.T03 | fixture tests |

## Game rules (RN-10..RN-21)

| RN | Rule (short) | Disposition | Implemented in | Verified by |
|---|---|---|---|---|
| RN-10 | Games run only with exactly 60 cards per side | Kept | S04.T04 (engine refuses), S03.T10 (deck validation) | engine test; validation tests |
| RN-11 | Six rulebook corrections: evolving keeps damage; only the starter skips the first attack; the starter draws on turn 1; tools persist after evolving; benching a Basic fires field triggers; a card returned to hand cannot evolve the turn it is replayed; nobody evolves on their own first turn | Kept | S04.T04, S04.T05, S05.T05 (bench trigger) | `engine/scenarios/rules/*.json` (S04.T13) |
| RN-12 | Special Conditions: Poisoned 10, Burned 20 + coin, Asleep/Paralyzed block attack and retreat, Confused coin/30; exclusivity; cleared on bench/evolve | Kept | S04.T08 | condition scenarios |
| RN-13 | `+N` before Weakness/Resistance, `−N` after; W/R only on the Active | Kept | S04.T07 | damage scenarios |
| RN-14 | Bench damage is not counters (no W/R but prevention/reduction apply); counters are effects and pass the prevention filter | Kept | S04.T07 | damage scenarios |
| RN-15 | Tera rule is a card rule: nothing turns it off; counters still land | Kept | S04.T07 | damage scenarios |
| RN-16 | "Once during your turn" is per Pokémon instance unless the text says per name | Kept | S05.T07 (declared per code), S04.T05 / S05.T05 (enforced) | ability scenarios |
| RN-17 | "Doesn't stack" counts once per card name | Kept | S05.T05 (`no_stack_key`) | modifier scenario |
| RN-18 | Bench size comes from state, not a constant | Kept | S04.T03, S05.T05 | Area Zero scenario |
| RN-19 | Prize value from the printed rule ("takes N Prize cards"); subtype only as fallback | Kept | S04.T02 | CardDef tests |
| RN-20 | End reasons: prizes, deck-out (mandatory draw only), no Pokémon, stall 12 turns, step cap | Kept | S04.T10 | terminal tests |
| RN-21 | An illegal bot action/answer is counted and replaced by a default | Kept | S04.T09 | prompt property tests |

## Bots (RN-30..RN-37)

| RN | Rule (short) | Disposition | Implemented in | Verified by |
|---|---|---|---|---|
| RN-30 | Honest information: own list known; own deck+prizes one pile until the first own-deck search; never read the opponent's hidden zones | Kept (native) | S06.T01 | view property tests |
| RN-31 | The bot infers main attacker, line, support and the deck's goal from attack conditions | Kept | S06.T02 | profile tests on 3 lists |
| RN-32 | Fixed turn order, attack last | Kept | S06.T03 | policy tests |
| RN-33 | Optional draws refused with ≥ 12 in hand or < 7 in deck | Kept | S06.T03 | policy tests |
| RN-34 | Gust effects only when they yield a KO the Active cannot, or more prizes | Kept | S06.T03 | policy tests |
| RN-35 | Retreat only if the incoming Pokémon really hits; never promote a 2-prize Pokémon that cannot attack | Kept | S06.T03 | policy tests |
| RN-36 | Discard with memory: last copy and scarce energy worth more | Kept | S06.T04 | need tests |
| RN-37 | Frozen bots are never edited; new bots only as new versions | Kept | S06.T07 | `code_hash` test |

## Measurement (RN-40..RN-50)

| RN | Rule (short) | Disposition | Implemented in | Verified by |
|---|---|---|---|---|
| RN-40 | A suite freezes deck, opponents, weights, seeds and opponent bot; between measurements only the bot under test changes | Revised (adds `rules_snapshot` and `engine_build`) | S05.T16 | freeze script test |
| RN-41 | Suites never update; changes create a new version | Kept | S05.T16 | immutability test |
| RN-42 | Scores of different suites are not compared | Kept | S06.T08 (UI never offers it) | UI review |
| RN-43 | Every 3 improvement rounds the bot is frozen and becomes the next suite's opponent | Kept | S06.T07 | process rule (checklist in file) |
| RN-44 | Two readings: weighted score and mirror | Kept | S06.T08 | measure job tests |
| RN-45 | Ties = 0.5; Wilson CI z = 1.96 | Kept | S04.T17, S06.T08 | unit tests |
| RN-46 | Stable seeds per matchup (CRC-based) | Kept | S04.T10, S06.T08 | fingerprint tests |
| RN-47 | `PYTHONHASHSEED=0` on every measurement | Superseded — the engine's game logic carries no iteration-order dependence (no hash-map iteration), whichever language the S01.T06 gate settles on | S04.T10 | 1 vs N workers fingerprint test |
| RN-48 | Differences under ~3 points at 1,200 games are noise | Revised into the statistics plan (CIs shown; sequential confirmation) | S06.T08, S07.T03 | synthetic power tests |
| RN-49 | Every measurement records the commit, `+` if dirty | Kept | S06.T08 | measure job test |
| RN-50 | Performance changes accepted only with identical result hash | Kept | S04.T10 (fingerprint), S04.T18 | bench + fingerprint |

## Use of AI (RN-60..RN-68)

| RN | Rule (short) | Disposition | Implemented in | Verified by |
|---|---|---|---|---|
| RN-60 | LLMs never on the critical path; everything works without keys | Kept | S02.T10 (rules parser only), S07.T07, S08.T06 | feature hidden without key |
| RN-61 | LLM output becomes behaviour only through a closed vocabulary with sanity ranges; malformed output rejected | Kept | S05.T03 (schema), S08.T06 | schema tests |
| RN-62 | Translation from an implemented second source prevails over prose classification | Kept | S05.T09 (provenance ranks), S08.T05 | import report |
| RN-63 | An AI opinion is not evidence; it is a review queue | Kept | S05.T12 (evidence kinds exclude LLM), S08.T06 | evidence kind enum |
| RN-64 | Audit and lint never alter a card | Kept (insert-only evidence) | S05.T01 | no UPDATE/DELETE path test |
| RN-65 | Coach reviews ≤ 6 critical moments per game, sees only what the player saw, closed vocabulary, invalid verdicts rejected | Kept | S07.T07 | stub-LLM tests |
| RN-66 | Coach suggestions are hypotheses measured on the suite | Kept | S07.T07 | process + measurement |
| RN-67 | AI-generated code sandboxed (no `os`, `subprocess`, `eval`…) | Superseded — no code generation; rules are data, builtins are human-written Rust | S05.T06 | — |
| RN-68 | Free-tier rate limits: small batches | Kept as implementation note | S08.T06 | retry tests |

## Quality: exact × proven (RN-70..RN-77)

| RN | Rule (short) | Disposition | Implemented in | Verified by |
|---|---|---|---|---|
| RN-70 | Exact (intention) and proven (evidence) always shown together | Kept | S05.T12, S05.T14 | UI + endpoint |
| RN-71 | A card is split into parts with text; it counts only when all parts have evidence | Kept | S05.T02, S05.T12 | `card_status` view test |
| RN-72 | Accepted evidence: passing scenario; second-source agreement when it is the code in use; textless parts exact by construction | Kept (kinds `scenario`, `twinleaf_diff`, `attr_only`, `builtin`) | S05.T12, S08.T05 | evidence tests |
| RN-73 | Proof is written by the test runner; a skipped or failing test removes it | Revised — evidence is per engine build; a new build makes proof stale until scenarios rerun | S05.T12 | staleness test |
| RN-74 | Invariant `0 < proven ≤ exact`; proof file matches test marks | Kept | S05.T12 | invariant test |
| RN-75 | Every registered card matches the official card in all attributes | Kept by construction — definitions are derived from the card tables, not hand-written | S04.T02, S05.T12 (`attr_only`) | derivation tests |
| RN-76 | Attribute fixes only touch values, never names, with a reason | Kept | S05.T01 (`card_overrides`) | schema constraint |
| RN-77 | Every recipe registers, lists actions, executes to the end, and no card ends in two zones | Kept | S05.T04 (total ops), S04.T03 (zone invariant) | property tests |

## Optimizer (RN-80..RN-84)

| RN | Rule (short) | Disposition | Implemented in | Verified by |
|---|---|---|---|---|
| RN-80 | Move = swap one copy; ≤ 4 copies; concept fixed; price cap | Kept | S07.T01 | move tests |
| RN-81 | Only cards with exact coverage enter the suite | Kept | S07.T01 (`card_status.exact`) | pool test |
| RN-82 | Candidates come from same-archetype tournament lists | Kept | S07.T01 | pool test |
| RN-83 | Two sieves: cheap paired screening, then confirmation with fresh seeds re-evaluating the current list | Kept, extended (sequential blocks, Bonferroni, futility) | S07.T02, S07.T03 | synthetic power tests |
| RN-84 | Accept only if the gain exceeds half the CI width | Revised — CI lower bound > 0 and Δ ≥ 0.5 pt, reported on holdout seeds | S07.T04 | synthetic tests |

[Docs index](../README.md) · [Vision and scope](01-vision-and-scope.md) · [Legacy reference map](06-legacy-reference-map.md)
