# S04.T03 — Game state model

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 3 / 18 |
| Depends on | [S04.T01](T01-engine-workspace-and-crates.md) |
| Unblocks | [S04.T04](T04-setup-and-turn-structure.md), [S04.T09](T09-prompt-protocol.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md), [S06.T01](../06-bots/T01-honest-information-view.md), [S06.T05](../06-bots/T05-rollout-bot.md) |
| Parallel with | [S04.T02](T02-card-definition-model.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `ptcg-core` crate skeleton — from [S04.T01](T01-engine-workspace-and-crates.md)
- `doc` `project/03-architecture-overview.md` (determinism and cloning requirements)

## Outputs (proposed)
- `module` `ptcg-core::state` — `Game { players: [Player; 2], cards: Vec<CardInst>, turn_no, current: PlayerIdx, first_player, phase, stadium: Option<CardIdx>, rng: Xoshiro256**, frames: Vec<Frame>, pending_prompt: Option<Prompt>, board_version: u32, events: Vec<Event> }`; `Player { deck: Vec<CardIdx> (top = end), hand, discard, prizes (hidden), active: Option<Slot>, bench: [Option<Slot>; 8], bench_limit: u8, per-turn flags, turn_effects, markers, knocked_out_last_turn }`; `Slot { top: CardIdx, under: SmallVec, energies: SmallVec, tools: SmallVec, damage: u16, conditions: bitflags, turn_played, turn_effects, markers, once_used }`; `CardInst { def: u16, owner: u8, zone: Zone, attached_to: Option<CardIdx> }` — consumed by [S04.T04](T04-setup-and-turn-structure.md), [S04.T09](T09-prompt-protocol.md), [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md), [S06.T01](../06-bots/T01-honest-information-view.md), [S06.T05](../06-bots/T05-rollout-bot.md)
- `contract` `Game: Clone` is cheap (index-based, no heap graph); `Zone` enum `Deck|Hand|Discard|Prize|Active|Bench(i)|Attached|LostZone|Stadium`

## Initial objective
A compact, index-based state in which every card has a stable identity for the whole game, damage is counters (never HP subtraction), the bench size is data (RN-18), and cloning a mid-effect state costs microseconds — the property that makes lookahead bots possible.

## Summary
- Max HP is a query (`hp_max(slot)` through modifiers), never stored on the instance.
- Interpreter frames and the pending prompt live inside `Game` so a suspended effect clones with the state (needed by [S05.T04](../05-card-rules-base/T04-ir-compiler-and-vm.md)).
- `events` is only filled when logging is requested (replay/coach).
- Not in scope: rules (later subtasks); the struct compiles with inert methods.

## Acceptance / verification
- [ ] `size_of::<Game>()` documented; cloning a mid-game state 1e6 times runs in < 1 s in release; property test: card indices are a permutation of 0..120 across zones.

## Notes for the elaboration pass
- Legacy pain points motivating this: `status.py:162` (23k class instantiations to read max HP), no `clone()` in the legacy engine, 1-based reindexing bugs.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
