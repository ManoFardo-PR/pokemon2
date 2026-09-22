# S04.T10 — Termination, stall detection and determinism

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 10 / 18 |
| Depends on | [S04.T04](T04-setup-and-turn-structure.md), [S04.T07](T07-damage-pipeline.md) |
| Unblocks | [S04.T12](T12-cli-job-protocol.md), [S06.T05](../06-bots/T05-rollout-bot.md), [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md) |
| Parallel with | [S04.T08](T08-special-conditions-and-checkup.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` turn structure (deck-out on draw) — from [S04.T04](T04-setup-and-turn-structure.md)
- `module` KO/prize handling — from [S04.T07](T07-damage-pipeline.md)
- `doc` ESPECIFICACAO.md RN-20, RN-46, RN-47, RN-50

## Outputs (proposed)
- `module` `ptcg-core::terminal` — `Outcome { winner: Option<PlayerIdx>, reason: prizes | no_pokemon | deck_out | stall | step_limit | concede, turns }`; stall = material signature `(prizes, deck, discard, hand, board, total damage)` per player unchanged for 12 consecutive turns (compared two turns back); step cap 3,000 — consumed by [S04.T12](T12-cli-job-protocol.md), [S06.T05](../06-bots/T05-rollout-bot.md), [S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md)
- `module` `ptcg-core::rng` — game stream `Xoshiro256**` seeded from `(seed_base, game_idx)`; each bot receives its own stream seeded from `(seed, bot_slot)`; `fingerprint(games) → sha256` over `(winner, reason, turns, final_state_hash)` in game order
- `doc` determinism rules in `engine/README.md`: no `HashMap` iteration in game logic (Vec/IndexMap/BTreeMap only), integers only, modifiers ordered by (slot, card idx), results aggregated in game-index order regardless of thread

## Initial objective
A game always ends with a named reason, and the same job produces the same bytes on 1 or 16 threads and on different days — the property every measurement and every optimizer comparison rests on.

## Summary
- Bot changes must not perturb shuffles (separate RNG streams), so paired-seed comparisons stay paired ([S07.T02](../07-deck-optimizer/T02-paired-seed-screening.md)).
- Concede exists for bots that detect hopeless positions (optional).

## Acceptance / verification
- [ ] Test: run 200 games with workers 1 and 16 → identical fingerprint; run twice → identical; changing the bot's tie-break RNG does not change the shuffle order of game 0.

## Notes for the elaboration pass
- Legacy reference: `engine_adapter.py` `_material`, `STALL_TURNS = 12`, `max_steps = 3000`; `progress.py::_seed` (CRC32) and the `PYTHONHASHSEED=0` requirement it had to enforce.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
