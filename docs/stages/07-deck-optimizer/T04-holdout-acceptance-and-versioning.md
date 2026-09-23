# S07.T04 — Holdout acceptance and versioning

| Field | Value |
|---|---|
| Stage | S07 — Deck optimizer |
| Status | TODO |
| Order in stage | 4 / 7 |
| Depends on | [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md), [S07.T02](T02-paired-seed-screening.md), [S07.T03](T03-sequential-confirmation.md) |
| Unblocks | [S07.T05](T05-optimize-job-orchestration.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `contract` new-version endpoint and diff — from [S03.T11](../03-tournament-meta-and-deck-builder/T11-user-decks-schema-and-api.md)
- `module` confirmation results — from [S07.T03](T03-sequential-confirmation.md)
- `doc` ESPECIFICACAO.md RN-84

## Outputs (proposed)
- `module` `optimizer/accept.ts` — accept iff CI lower bound > 0 **and** Δ ≥ 0.5 point; the accepted list is re-measured on a holdout seed set (`'holdout'` salt, never used for selection) and that score is the reported one; creates a `user_deck_versions` row with `change_desc` = the swap and the holdout score; `optimizer_candidates(job_id, iteration, idx, move_desc, candidate_list_json, screen_*, confirm_*, holdout_*, decision screened_out|rejected|confirmed|accepted)` rows — consumed by [S07.T05](T05-optimize-job-orchestration.md)

## Initial objective
What the user is told is an unbiased estimate: selection happens on one set of seeds, the reported gain on another, and tiny statistically-significant gains are not accumulated into noise.

## Summary
- Migration `0008_optimizer.sql` for `optimizer_candidates`.

## Acceptance / verification
- [ ] Accepted swap's holdout Δ is within its confirmation CI in synthetic tests; rejected swaps never create versions.

## Notes for the elaboration pass
- Legacy rule replaced: 'gain > half CI width' (`optimizer.py:502`).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
