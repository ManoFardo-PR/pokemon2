# S04.T16 — API: jobs and progress events

| Field | Value |
|---|---|
| Stage | S04 — Game engine core |
| Status | TODO |
| Order in stage | 16 / 18 |
| Depends on | [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S04.T15](T15-worker-job-runner.md) |
| Unblocks | [S04.T17](T17-web-evaluate-page.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Fastify app — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `table` jobs written by the worker — from [S04.T15](T15-worker-job-runner.md)

## Outputs (proposed)
- `contract` `POST /api/jobs` (kind + params, returns 202 `{ id }`), `GET /api/jobs?kind&status`, `GET /api/jobs/:id` (with pairings), `POST /api/jobs/:id/cancel`, `GET /api/jobs/:id/events` (Server-Sent Events: `progress`, `pairing`, `done`, `error`, polling the DB every second) — consumed by [S04.T17](T17-web-evaluate-page.md)

## Initial objective
The web app can start, watch and cancel simulations through plain HTTP with live progress, without WebSockets or in-process threads.

## Summary
- SSE endpoint ends when the job reaches a terminal state.
- Evaluate params: `{ deckVersionId, opponents: [{ deckId, weight }], gamesPerOpponent, bot, storeGames }`.

## Acceptance / verification
- [ ] Route tests: create → list → events stream emits `done` when the worker finishes (worker stubbed in tests).

## Notes for the elaboration pass
- Legacy: HTMX polling every 3 s of a partial; SSE is the equivalent here.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
