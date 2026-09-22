# S05.T04 — IR compiler and resumable VM

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 4 / 16 |
| Depends on | [S04.T03](../04-game-engine-core/T03-game-state-model.md), [S04.T09](../04-game-engine-core/T09-prompt-protocol.md), [S05.T03](T03-effect-ir-vocabulary.md) |
| Unblocks | [S05.T05](T05-continuous-modifiers-and-triggers.md), [S05.T06](T06-builtins-escape-hatch.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T11](T11-legacy-tests-to-scenarios.md) |
| Parallel with | [S05.T02](T02-effect-texts-and-card-parts.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` state with `frames` and `pending_prompt` — from [S04.T03](../04-game-engine-core/T03-game-state-model.md)
- `contract` prompts/answers — from [S04.T09](../04-game-engine-core/T09-prompt-protocol.md)
- `contract` IR model — from [S05.T03](T03-effect-ir-vocabulary.md)

## Outputs (proposed)
- `module` `ptcg-core::ir::{compile, vm}` — `compile(program_json, params) → Program` (flat op list, constants folded, filters pre-resolved to def-index bitsets where possible); `Vm::step(game, frame) → Continue | NeedPrompt(prompt) | Done`; frames `{ program_id, pc, locals: SmallVec<(Local, Value)>, ctx: { this_card, holder_slot, actor, owner, attack? } }` stored in `game.frames` — consumed by [S05.T05](T05-continuous-modifiers-and-triggers.md), [S05.T06](T06-builtins-escape-hatch.md), [S05.T07](T07-rule-codes-composition-semantics.md), [S05.T11](T11-legacy-tests-to-scenarios.md)
- `contract` locals shared across the codes of one text (e.g. `$discarded` from a `discard` op feeds a following `draw{n: per_discarded}`); recursion guard for `use_attack_as_this` (depth 1, no copycat-of-copycat)

## Initial objective
Programs run as data inside the game state and can pause on any prompt and resume later — on the same state or on a clone — which is what lets bots look ahead through effects the legacy engine could only run as live coroutines.

## Summary
- Every op is total: preconditions (`can`) are evaluated to decide whether an action/ability is offered, mirroring the legacy `can/run` split.
- Zone choices are presented grouped by definition; the VM never materialises combinations.
- Not in scope: continuous modifiers/triggers ([S05.T05](T05-continuous-modifiers-and-triggers.md)), builtins ([S05.T06](T06-builtins-escape-hatch.md)).

## Acceptance / verification
- [ ] Unit programs: `search{deck, is_basic, n: 1, to: bench}` opens the right prompt and moves the card; `coin_then` consumes exactly one game RNG draw; a state cloned while a prompt is pending can be resumed on both copies independently.

## Notes for the elaboration pass
- Legacy reference: `sim/effects.py` (generator-based `run(ctx)`), `catalog_cards.py::_reduce_attack` ordering; twinleafgg `store.ts` for how prompts suspend a reducer (closures — not cloneable, hence our frame design).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
