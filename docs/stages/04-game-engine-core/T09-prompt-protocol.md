# S04.T09 — Prompt protocol

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 9 / 18 |
| Depends on | [S04.T03](T03-game-state-model.md), [S04.T05](T05-actions-and-legality.md) |
| Unblocks | [S04.T11](T11-baseline-bots-random-heuristic.md), [S04.T13](T13-scenario-format-and-runner.md), [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md), [S06.T01](../06-bots/T01-honest-information-view.md), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md) |
| Parallel with | [S04.T06](T06-energy-provision-and-cost-payment.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` state (`pending_prompt`, frames) — from [S04.T03](T03-game-state-model.md)
- `module` actions needing choices (retreat payment, bench placement, KO promotion) — from [S04.T05](T05-actions-and-legality.md)

## Outputs (proposed)
- `contract` `Prompt { id, actor: PlayerIdx, owner: PlayerIdx, purpose: Purpose, source: Option<CardIdx>, kind }` with `kind ∈ ChooseCards { zone, candidates: [{ def, idxs, max_pick }], min, max, may_cancel }, ChoosePokemon { side, slots, min, max }, ChooseAttack { options }, ChooseOption { labels }, DistributeCounters { targets, total, max_per }, MoveEnergy { from, to_candidates, count }, OrderCards { cards }, Confirm`; `Purpose ∈ search_to_hand | search_to_bench | discard_cost | discard_effect | attach_target | switch_in_own | switch_in_opponent | promote_after_ko | choose_prize | order_deck_top | distribute_counters | distribute_energy | choose_attack_to_copy | may_use | choose_one | reveal_ack | opening_active | bench_setup | retreat_payment`; `Answer` enum mirroring the kinds; `validate_answer(prompt, answer) → Result` in O(n) — consumed by [S04.T11](T11-baseline-bots-random-heuristic.md), [S04.T13](T13-scenario-format-and-runner.md), [S05.T03](../05-card-rules-base/T03-effect-ir-vocabulary.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md), [S06.T01](../06-bots/T01-honest-information-view.md), [S06.T04](../06-bots/T04-need-scoring-and-prompt-resolvers.md)
- `module` `ptcg-core::prompt::defaults` — deterministic default resolver per purpose (used for invalid answers and for the random bot)
- `contract` RN-21: an invalid answer increments `invalid_actions` and the default resolver's answer is used; the game never aborts on a bot mistake

## Initial objective
Every decision the rules delegate to a player is a structured, machine-readable question with an explicit actor (which may be the opponent), answered in O(n) without ever enumerating card combinations.

## Summary
- Candidates grouped by definition (identical copies are interchangeable) with `idxs` preserved so 'two identical benched Pokémon are different' still holds for `ChoosePokemon`.
- Hidden choices (prizes) expose only counts.
- `actor ≠ owner` covers Escape Rope / Xerosic-type effects where the opponent chooses.

## Acceptance / verification
- [ ] Property tests: every random legal answer validates; every invalid one is rejected with a reason; default resolver yields a valid answer for all purposes.

## Notes for the elaboration pass
- Legacy pain: `ChooseCardActionSpace` of size C(n,k), `MAX_CHOICE_SCAN = 400`, prompts carrying English prose (`tips`) that bots string-matched.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
