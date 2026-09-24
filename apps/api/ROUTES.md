# PokeSearch API Route Conventions

This document establishes the architecture and design invariants for all routes implemented under `apps/api/src/routes/`.

## 1. Domain Separation
Every domain has exactly one dedicated route file under `src/routes/` (e.g., `system.ts`, `cards.ts`, `decks.ts`). Each exports a Fastify plugin (`FastifyPluginAsync`) registered with its resource prefix.

## 2. JSON Invariant
The API is strictly a JSON API (`application/json; charset=utf-8`). HTML rendering is exclusively owned by the frontend application (`apps/web`). The API includes no template engines and mounts no static asset directories.

## 3. Resource Naming
Paths follow `/api/<plural-noun>` in kebab-case, with `:id` for resource parameters. System utility endpoints like `/health` reside outside `/api` for straightforward container and proxy probing.

## 4. Mandatory Schemas & Type Providers
Every route must declare a Fastify schema (`schema: { params?, querystring?, body?, response }`) using Zod and `fastify-type-provider-zod`. Response schemas are mandatory on all registered endpoints. Payloads are strictly filtered by the schema compiler; fields outside declared schemas never reach the client.

## 5. Standard Pagination Envelope
Collection endpoints accept standard query parameters `?page=1&pageSize=60` and return uniform paginated responses:
```json
{
  "items": [],
  "page": 1,
  "pageSize": 60,
  "total": 0,
  "hasMore": false
}
```

## 6. HTTP Verb Discipline
- `GET`: Read-only, safe, idempotent. Must perform zero database writes.
- `POST`: Create resource or execute non-idempotent action.
- `PATCH`: Partial resource update.
- `DELETE`: Resource removal.
Verbs must never appear in URL path segments.

## 7. Data Representation
Timestamps are ISO-8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`). Resource identifiers match the domain model primary keys.

## 8. Uniform Error Envelope
Non-2xx responses strictly conform to:
```json
{
  "error": {
    "code": "error_code",
    "message": "Human readable description",
    "details": [
      { "path": "field.name", "message": "Constraint violated" }
    ],
    "requestId": "uuid-or-incoming-trace"
  }
}
```
Internal errors (500) always mask raw errors and stack traces with the invariant message `"Internal error"`.

## 9. Long-Running Operations (Jobs & SSE)
Lengthy operations (ETL, simulation runs, optimizations) must not block request handlers. They are initiated via `POST /api/jobs` and monitored via Server-Sent Events (`/api/jobs/:id/events`). The SSE stream is the only documented exemption from the JSON serializer.

## 10. Database Writer Ownership
The API process only writes to user-facing application tables (`user_decks`, `user_deck_versions`, `jobs`). Core card and tournament baseline tables are managed by the ETL process, and engine progress tables by worker services.

## 11. Loopback-Only & Security Discipline (D-007)
The API runs as a local single-user daemon bound exclusively to loopback (`127.0.0.1` or `::1`). Public or wildcard network bindings (`0.0.0.0`) are prohibited. No faux authentication headers or API keys are implemented.
