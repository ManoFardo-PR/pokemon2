# S08.T03 — Hosted Postgres migration path

| Field | Value |
|---|---|
| Stage | S08 — Operations and extensions |
| Status | TODO |
| Order in stage | 3 / 6 |
| Depends on | [S01.T02](../01-foundation/T02-sqlite-database-client.md), [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S01.T08](../01-foundation/T08-web-skeleton.md), [S02.T08](../02-card-data-and-search/T08-full-text-search.md) |
| Unblocks | — |
| Parallel with | [S08.T01](T01-scheduler.md), [S08.T02](T02-etl-monitoring-and-alerts.md), [S08.T04](T04-wasm-replay-and-play.md), [S08.T05](T05-twinleaf-differential-oracle.md), [S08.T06](T06-llm-assisted-authoring.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `doc` `PORTABILITY.md` and the adapter interface — from [S01.T02](../01-foundation/T02-sqlite-database-client.md)
- `module` API config (`DATABASE_*`) — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `module` web build — from [S01.T08](../01-foundation/T08-web-skeleton.md)
- `doc` dialect module contract (FTS5 ↔ `tsvector`) — from [S02.T08](../02-card-data-and-search/T08-full-text-search.md)

## Outputs (proposed)
- `doc` `docs/ops/POSTGRES.md` — target: a Supabase-like host (to be chosen by the user); Postgres migration set generated from the SQLite migrations (`*_json` → `jsonb`, FTS5 → generated `tsvector` with weights A–D + GIN, maintained tables → materialized views, `json_each` filters → `jsonb` operators), data export/import (`sqlite → csv/copy → postgres`), a `dialect/postgres` implementation of the FTS/JSON module, hosting notes for api/web with the worker staying on the user's PC (engine binary), go/no-go criteria and cost notes; a proof-of-concept run against a local Docker Postgres 17

## Initial objective
Moving to a hosted database later is a planned, rehearsed step instead of a rewrite, because every dialect-specific piece was isolated from day one.

## Summary
- No production move in this subtask; it delivers the plan, the generated migrations and a local rehearsal.

## Acceptance / verification
- [ ] Rehearsal on Docker Postgres: schema applies, data imports, search and meta endpoints return the same results as SQLite on a fixture set.

## Notes for the elaboration pass
- Decision D-002 (revised 2026-09-22) records why SQLite now and Postgres later.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
