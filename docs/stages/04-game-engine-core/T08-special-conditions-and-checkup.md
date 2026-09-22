# S04.T08 — Special Conditions and Pokémon Checkup

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 8 / 18 |
| Depends on | [S04.T07](T07-damage-pipeline.md) |
| Unblocks | [S04.T13](T13-scenario-format-and-runner.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md) |
| Parallel with | [S04.T10](T10-termination-stall-and-determinism.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` damage pipeline (`place_counters`, `knock_out`, promotion prompts) — from [S04.T07](T07-damage-pipeline.md)
- `doc` ESPECIFICACAO.md RN-12

## Outputs (proposed)
- `module` `ptcg-core::conditions` — `apply_condition(slot, cond)` with the exclusive set {Asleep, Paralyzed, Confused} and coexisting {Poisoned, Burned}; `clear_conditions(slot)` on bench/evolve/retreat/switch; action filters (Asleep/Paralyzed: no attack, no retreat; Confused: coin on attack, tails = 30 self-counters and no attack); `ptcg-core::checkup` — between-turns procedure: Poison 10 (+`extra_poison`), Burn 20 + coin, Sleep coin, Paralysis clears after the owner's turn, checkup counters (hook), turn-effect expiry, end-of-turn discards (hook), then KO/promotion prompts — consumed by [S04.T13](T13-scenario-format-and-runner.md), [S05.T05](../05-card-rules-base/T05-continuous-modifiers-and-triggers.md)
- `contract` the checkup is a resumable procedure: it may suspend on prompts (promotion after a poison KO for either player) and resume; `block_conditions` modifiers cure existing conditions immediately

## Initial objective
Special Conditions behave per rulebook with a checkup that can ask the players questions instead of guessing (the legacy engine had no conditions at all and auto-resolved checkup KOs).

## Summary
- Bench Pokémon never carry conditions; moving to the bench clears them.
- Turn effects carry `(source, kind, value, until)` tuples; expiry happens here.

## Acceptance / verification
- [ ] Scenarios: poisoned → 10 counters at each checkup; burned coin heads → cured; asleep blocks attack until heads; paralysis ends after own turn; poison KO with two benched Pokémon opens a promotion prompt for the owner.

## Notes for the elaboration pass
- Legacy reference: `status.py` sections A–C, E, Q; `tests/test_status.py`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
