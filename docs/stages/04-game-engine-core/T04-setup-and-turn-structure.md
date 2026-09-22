# S04.T04 — Setup and turn structure

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 4 / 18 |
| Depends on | [S04.T03](T03-game-state-model.md) |
| Unblocks | [S04.T05](T05-actions-and-legality.md), [S04.T10](T10-termination-stall-and-determinism.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` state model — from [S04.T03](T03-game-state-model.md)
- `doc` ESPECIFICACAO.md RN-10, RN-11, RN-20 (deck-out rule)

## Outputs (proposed)
- `module` `ptcg-core::setup` — shuffle with the game RNG, opening hands of 7 with mulligan loop (opponent may draw 1 per mulligan — prompt later), choose Active + optional bench Basics via prompts, 6 prizes, first-player coin; `ptcg-core::turn` — start-of-turn draw (starter draws on turn 1), per-turn budgets `{ energy_attached, supporter_played, stadium_played, stadium_used, retreated }`, `end_turn()` → between-turns phase hook → switch — consumed by [S04.T05](T05-actions-and-legality.md), [S04.T10](T10-termination-stall-and-determinism.md)
- `contract` first-turn rules: the starting player cannot attack on turn 1; nobody evolves a Pokémon on the turn it was played nor on their own first turn (RN-11)

## Initial objective
Games start and alternate exactly as the rulebook says, including the details the legacy engine got wrong and had to be patched (starter draws on turn 1; only the starter skips the first attack).

## Summary
- Deck-out is checked only at the mandatory start-of-turn draw (RN-20), never on optional draws.
- Exactly 60 cards per side is validated before setup (RN-10); the engine refuses otherwise.
- Between-turns hook is a no-op until [S04.T08](T08-special-conditions-and-checkup.md) fills it.

## Acceptance / verification
- [ ] Scenario: both players' opening state has 7 cards, 6 prizes, 47 in deck; starter draws to 8 on turn 1 and has no Attack action; second player can attack on their first turn.

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/sim/status.py` fixes K (first-turn) and `tests/test_rules.py`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
