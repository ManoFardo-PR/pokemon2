# S05.T11 — Convert legacy verified tests into scenarios

| Field | Value |
|---|---|
| Stage | S05 — Card rules base |
| Status | TODO |
| Order in stage | 11 / 16 |
| Depends on | [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md), [S05.T04](T04-ir-compiler-and-vm.md), [S05.T05](T05-continuous-modifiers-and-triggers.md) |
| Unblocks | [S05.T12](T12-evidence-and-coverage-metrics.md) |
| Parallel with | [S05.T07](T07-rule-codes-composition-semantics.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` scenario format and runner — from [S04.T13](../04-game-engine-core/T13-scenario-format-and-runner.md)
- `module` VM — from [S05.T04](T04-ir-compiler-and-vm.md)
- `module` modifiers/triggers (tools, stadiums, passives) — from [S05.T05](T05-continuous-modifiers-and-triggers.md)
- `file` legacy tests `pokemon/tests/test_{abilities,tools_stadiums,effects,engine_cards,special_energy,attack_effects,rules}.py` (136 `@pytest.mark.verifies` marks) and `sim/testkit/__init__.py`

## Outputs (proposed)
- `file` `engine/scenarios/cards/**/*.json` — one scenario per converted test, `verifies: ['text:<hash>']`, `source: 'tests/test_x.py::test_name'`
- `doc` `engine/scenarios/CONVERSION.md` — helper mapping (`make_state` → `setup`, `attach_energy` → `energies`, `play_tool/put_stadium/use_stadium` → actions, `drive_choices` → `answer` steps, damage assertions → `expect.damage_calc`)

## Initial objective
The evidence base of the legacy project (what was actually proven about 109 cards) is carried over as executable scenarios that the new engine must pass, so coverage starts with proof, not intentions.

## Summary
- Convert the 136 verified parts first, then the remaining ~200 card tests as regression.
- A scenario that fails because the new engine is right and the legacy assumption was wrong is documented in `source` with the ruling.

## Acceptance / verification
- [ ] All converted scenarios listed in `rule_scenarios`; pass rate reported; failures triaged into 'engine bug' or 'code missing' with an issue each.

## Notes for the elaboration pass
- Legacy reference: `sim/verified.py` (parts and evidence semantics, RN-70..RN-74).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
