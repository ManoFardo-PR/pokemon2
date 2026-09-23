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
- `file` `pokemon/src/pokesearch/api/routes_sim.py` and `templates/_sim_run_status.html` — the legacy routes and the 3-second HTMX polling this replaces; read-only reference

## Outputs (proposed)
- `contract` `POST /api/jobs` (kind + params, returns 202 `{ id }`), `GET /api/jobs?kind&status`, `GET /api/jobs/:id` (with pairings), `POST /api/jobs/:id/cancel`, `GET /api/jobs/:id/events` (Server-Sent Events: `progress`, `pairing`, `done`, `error`, polling the DB every second) — consumed by [S04.T17](T17-web-evaluate-page.md)
- `module` `apps/api/src/routes/jobs.ts` and `apps/api/src/jobs/sse.ts` — the route handlers, the params validation per kind and the event stream

## Initial objective
The web app can start, watch and cancel simulations through plain HTTP with live progress, without WebSockets or in-process threads.

## Context

The API's role here is deliberately small: it inserts a `queued` row, reads rows, and flips a status to `cancelled`. It never spawns the engine, never computes a score and never writes a pairing. That division is architecture principle 2 made concrete — the worker owns the job tables, the api owns user-facing writes — and it is what lets a simulation survive a page reload, an api restart or a browser crash.

The legacy did the equivalent with server-rendered HTML and polling. `pokemon/src/pokesearch/api/routes_sim.py` exposed `POST /sim/project/{pid}/run`, `POST /sim/run/{rid}/cancel` and an HTMX partial at `GET /ui/sim/run/{rid}`, and `templates/_sim_run_status.html` refreshed it with `hx-trigger="every 3s"`. It worked and it is the shape being replaced: a JSON API plus Server-Sent Events gives the same liveness with a smaller payload, keeps the UI state in the web app, and lets the same endpoints serve the optimizer page ([S07.T06](../07-deck-optimizer/T06-web-optimizer-page.md)) without new routes. There is also a JSON half in the legacy (`GET /api/sim/run/{rid}`, `POST /api/sim/project/{pid}/run`) that already anticipated this.

SSE rather than WebSockets is a deliberate simplification. The stream is one-directional, the api binds to loopback for a single user (D-007), and the browser's `EventSource` reconnects on its own. The server implementation is a polling loop over the `jobs` and `job_pairings` rows, once a second, emitting only what changed — which is exactly what the worker's 500 ms progress throttle makes cheap ([S04.T15](T15-worker-job-runner.md) BR-S04.T15-03). No shared memory, no message bus, no coupling between the api and the worker beyond the database they both open.

Two things need care. **Params validation belongs to the kind**, not to the route: each job kind has a zod schema, the route looks it up and refuses an unknown kind or bad params with 400 before anything is inserted, so a malformed job never reaches the worker. And **the stream must end**: an SSE response that never closes leaks a connection and a polling timer per abandoned tab, so the stream sends a final event and closes as soon as the job reaches a terminal state, and it also closes on a client disconnect and on an absolute timeout.

## Scope

- **In scope.** The five routes above with their zod request/response schemas; the per-kind params registry shared with the worker; the SSE implementation (polling interval, event shapes, change detection, heartbeat, termination, disconnect handling, connection cap); pagination and filtering on the list route; the error envelope for each failure; the `apps/api/ROUTES.md` entries; route tests with a stubbed worker.
- **Out of scope.** Running jobs ([S04.T15](T15-worker-job-runner.md)); the schema ([S04.T14](T14-jobs-schema-migration.md)); the Evaluate page and its statistics ([S04.T17](T17-web-evaluate-page.md), which owns `wilson` and `weightedScore`); authentication (D-007: loopback, no accounts); the optimizer's own endpoints ([S07.T05](../07-deck-optimizer/T05-optimize-job-orchestration.md), [S07.T06](../07-deck-optimizer/T06-web-optimizer-page.md)) — they reuse these; replay streaming ([S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask. It enforces architecture principle 2 at the HTTP boundary.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S04.T16-01 | The api writes exactly two things in the jobs domain: an `INSERT` of a `queued` job and an `UPDATE … SET status='cancelled'`. It never writes `job_pairings` or `games` and never spawns a process. | `routes/jobs.ts` has two write statements; the eslint table-ownership rule of [S04.T14](T14-jobs-schema-migration.md) BR-S04.T14-08 | `jobs-routes.spec.ts > the api performs no other write` (statement spy); `pnpm lint` fails on a fixture writing `job_pairings` from `apps/api` |
| BR-S04.T16-02 | `POST /api/jobs` validates `params` against the schema registered for `kind` and returns 400 with the field path on failure; an unknown `kind` is 400, never a stored row. | `jobKindRegistry[kind].paramsSchema.safeParse` before the insert | `jobs-routes.spec.ts > unknown kind is 400`; `> invalid evaluate params return the field path`; `> no row is inserted on a 400` |
| BR-S04.T16-03 | A successful create returns 202 with `{ id }` and a `Location` header, never 200: the job has been accepted, not completed. | the route's `reply.code(202)` | `jobs-routes.spec.ts > create returns 202 with id and Location` |
| BR-S04.T16-04 | Cancel is conditional: `UPDATE jobs SET status='cancelled', finished_at=? WHERE id=? AND status IN ('queued','running')`. Zero rows changed returns 409 with the current status; a missing id returns 404. | `routes/jobs.ts::cancel` | `jobs-routes.spec.ts > cancelling a done job returns 409`; `> cancelling a missing job returns 404`; `> cancelling a queued job returns 202` |
| BR-S04.T16-05 | The SSE stream terminates: it sends a final `done` or `error` event and closes within one poll interval of the job reaching a terminal state, closes immediately on client disconnect, and closes with an `error` event after `SSE_MAX_SECONDS` (3,600). | `jobs/sse.ts`'s loop conditions and the `request.raw.on("close")` handler | `sse.spec.ts > the stream closes when the job finishes`; `> the poll timer is cleared on client disconnect`; `> the stream closes after the absolute timeout` |
| BR-S04.T16-06 | The stream emits only changes: a `progress` event is sent when `jobs.progress_json` differs from the last sent value, a `pairing` event when a pairing row's counters or fingerprint changed. An unchanged poll sends nothing but a comment heartbeat every `SSE_HEARTBEAT_MS` (15,000). | change detection on a hash of the serialized row | `sse.spec.ts > an unchanged poll emits no data event`; `> a heartbeat comment is sent every 15 s` |
| BR-S04.T16-07 | Concurrent streams are bounded: at most `SSE_MAX_STREAMS` (8) open at once across all jobs; the ninth receives 503 with `Retry-After`. | a counter in `jobs/sse.ts` incremented on open and decremented in the close handler | `sse.spec.ts > the ninth concurrent stream is rejected with 503`; `> closing a stream frees the slot` |
| BR-S04.T16-08 | `GET /api/jobs` is paginated and filtered, never unbounded: `limit` defaults to 25 and caps at 100, ordered by `created_at DESC`, filtered by `kind` and `status`, and it does not return `params_json`, `result_json` or `progress_json` bodies — only their presence. | the route's query schema and its column list | `jobs-routes.spec.ts > list caps limit at 100`; `> list omits the json bodies` |
| BR-S04.T16-09 | `GET /api/jobs/:id` returns the job with its pairings ordered by `idx`, and never returns `games` rows; a games listing is a separate future route with its own pagination. | the detail route's two queries | `jobs-routes.spec.ts > detail returns pairings ordered by idx`; `> detail contains no games array` |
| BR-S04.T16-10 | Every error response uses the shared envelope `{ error: { code, message, details? } }` from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), with codes `BAD_PARAMS`, `UNKNOWN_KIND`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_STREAMS`. | the app's error handler plus explicit `reply.code(...).send(envelope)` | `jobs-routes.spec.ts > every failure path uses the error envelope` (one case per code) |

## Data operations

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| `POST` | `/api/jobs` | body `{ kind: JobKind, params: object }`; `params` validated by the schema registered for `kind` | `202 { id: number }` + `Location: /api/jobs/:id` | `400 BAD_PARAMS` (field path in `details`), `400 UNKNOWN_KIND` |
| `GET` | `/api/jobs` | query `kind?`, `status?`, `limit` (default 25, max 100), `before?` (cursor on `created_at`) | `200 { jobs: [{ id, kind, status, created_at, started_at, finished_at, engine_build, workers, has_result, error }], next?: string }` | `400 BAD_PARAMS` |
| `GET` | `/api/jobs/:id` | path `id` | `200 { job: JobSummary & { params, progress, result }, pairings: [{ idx, label, weight, bot_a_id, bot_b_id, seed_base, games, wins, losses, ties, outcomes, avg_turns, invalid_actions, errors, fingerprint }] }` | `404 NOT_FOUND` |
| `POST` | `/api/jobs/:id/cancel` | path `id` | `202 { id, status: "cancelled" }` | `404 NOT_FOUND`, `409 CONFLICT` (with the current status in `details`) |
| `GET` | `/api/jobs/:id/events` | path `id`; header `Accept: text/event-stream` | `200 text/event-stream` with events `progress`, `pairing`, `done`, `error` and `:` heartbeats | `404 NOT_FOUND`, `503 TOO_MANY_STREAMS` (with `Retry-After: 5`) |

**Database access behind these endpoints** (all reads except the two writes named in BR-S04.T16-01):

| Entity | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| `jobs` | C | api | `POST /api/jobs` | `status='queued'`, `created_at` set, `started_at` NULL ([S04.T14](T14-jobs-schema-migration.md) BR-S04.T14-02) |
| `jobs` | U (`status`, `finished_at`) | api | `POST /api/jobs/:id/cancel` | conditional on `status IN ('queued','running')` (BR-S04.T16-04) |
| `jobs` | R | api | list, detail, every SSE poll | indexed by `jobs_status_created_idx` / `jobs_kind_created_idx` |
| `job_pairings` | R | api | detail, every SSE poll | ordered by `idx` |
| `games` | R | api | never in these routes | a future paginated route owns it (BR-S04.T16-09) |
| anything else | C/U/D | api | never | the worker owns the job tables (BR-S04.T16-01) |

## Interfaces

**Route module.**

```ts
// apps/api/src/routes/jobs.ts
export default async function jobsRoutes(app: FastifyInstance) { /* the five routes */ }

// the registry shared with apps/worker so one schema validates on both sides
export const jobKindRegistry: Record<JobKind, { paramsSchema: z.ZodTypeAny }> = {
  evaluate:  { paramsSchema: EvaluateParams },     // S04.T15
  scenarios: { paramsSchema: ScenariosParams },
  replay:    { paramsSchema: ReplayParams },
  // measure (S06.T08) and optimize (S07.T05) register here without touching the routes
};
```

**Request and response schemas** (`@pokesearch/shared/jobs` extends with the HTTP layer):

```ts
export const CreateJobBody = z.object({
  kind: z.enum(["evaluate", "scenarios", "replay", "measure", "optimize"]),
  params: z.record(z.unknown()),
});
export const ListJobsQuery = z.object({
  kind: JobKindEnum.optional(),
  status: z.enum(["queued","running","done","error","cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  before: z.string().datetime().optional(),
});
export const JobSummary = z.object({
  id: z.number().int(), kind: JobKindEnum, status: JobStatusEnum,
  created_at: z.string(), started_at: z.string().nullable(), finished_at: z.string().nullable(),
  engine_build: z.string().nullable(), rules_snapshot: z.string().nullable(),
  workers: z.number().int().nullable(), has_result: z.boolean(), error: z.string().nullable(),
});
export const PairingView = z.object({
  idx: z.number().int(), label: z.string().nullable(), weight: z.number().nullable(),
  bot_a_id: z.string(), bot_b_id: z.string(), seed_base: z.number().int(),
  games: z.number().int(), wins: z.number().int(), losses: z.number().int(), ties: z.number().int(),
  outcomes: z.record(z.number().int()).nullable(), avg_turns: z.number().nullable(),
  invalid_actions: z.number().int(), errors: z.number().int(), fingerprint: z.string().nullable(),
});
```

**SSE events.** Each is one `event:`/`data:` pair; `data` is one JSON object on one line.

| Event | Data | When |
|---|---|---|
| `progress` | `{ status, progress: { pairings: [{ idx, done, total, w, l, t }], updated_at } }` | `jobs.progress_json` changed since the last emission |
| `pairing` | `PairingView` | that pairing's counters, `outcomes`, `avg_turns` or `fingerprint` changed |
| `done` | `{ status, result, engine_build, finished_at }` | the job reached `done` or `cancelled`; the stream closes right after |
| `error` | `{ status, error }` | the job reached `error`, or the stream hit `SSE_MAX_SECONDS`; the stream closes right after |
| *(comment)* | `: heartbeat` | every `SSE_HEARTBEAT_MS` with no other output, to keep proxies and `EventSource` alive |

**SSE implementation sketch.**

```ts
// apps/api/src/jobs/sse.ts
export async function streamJob(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply, id: number) {
  if (openStreams >= SSE_MAX_STREAMS) return reply.code(503).header("Retry-After", "5").send(envelope("TOO_MANY_STREAMS"));
  const job = getJob(db, id); if (!job) return reply.code(404).send(envelope("NOT_FOUND"));
  reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
                             Connection: "keep-alive", "X-Accel-Buffering": "no" });
  openStreams++;
  const timer = setInterval(poll, SSE_POLL_MS);           // 1000
  req.raw.on("close", cleanup);                           // BR-S04.T16-05
  // poll(): read the job row and its pairings, diff against the last sent hashes,
  //         emit only what changed, close on a terminal status or after SSE_MAX_SECONDS
}
```

| Constant | Value | Meaning |
|---|---|---|
| `SSE_POLL_MS` | 1000 | database poll interval; the worker writes progress at most every 500 ms |
| `SSE_HEARTBEAT_MS` | 15000 | comment heartbeat when nothing changed |
| `SSE_MAX_SECONDS` | 3600 | absolute stream lifetime |
| `SSE_MAX_STREAMS` | 8 | concurrent streams across all jobs |

**`apps/api/ROUTES.md`** gains a `jobs` section with the five rows of the endpoint table, the event table, the four constants and the note that the api is not the job's owner — the worker is.

## Implementation steps

1. Add `apps/api/src/routes/jobs.ts` registered on the app, with `GET /api/jobs` and `GET /api/jobs/:id` only; spec pagination, the limit cap, the omitted JSON bodies and the pairing order (BR-S04.T16-08, -09). `pnpm --filter api test` green.
2. Add the kind registry and `POST /api/jobs` with per-kind params validation and the 202 response; spec the unknown kind, the invalid params and the no-row-on-400 cases (BR-S04.T16-02, -03).
3. Add `POST /api/jobs/:id/cancel` with the conditional update and the three outcomes; spec 202, 409 and 404 (BR-S04.T16-04).
4. Wire the shared error envelope and spec one case per code (BR-S04.T16-10).
5. Add `apps/api/src/jobs/sse.ts` with the poll loop, the four event types and change detection; spec `> an unchanged poll emits no data event` (BR-S04.T16-06).
6. Add termination: terminal status, client disconnect, absolute timeout; spec all three, asserting the interval timer is cleared in each (BR-S04.T16-05).
7. Add the heartbeat and the concurrency cap with its 503; spec both (BR-S04.T16-06, -07).
8. Write the integration spec with a stubbed worker: create → list → detail → stream → the stub advances the rows → the stream emits `progress`, then `pairing`, then `done` and closes.
9. Add the statement spy asserting the api issues exactly one insert and one conditional update against the jobs domain, and the eslint fixture for the ownership rule (BR-S04.T16-01).
10. Write the `apps/api/ROUTES.md` section and add the endpoints to the web app's generated client types so [S04.T17](T17-web-evaluate-page.md) consumes them typed.

## Edge cases and error handling

- **An SSE client disconnects** (tab closed, navigation, network drop) → `request.raw.on("close")` clears the interval, decrements the stream counter and returns; nothing is written to a dead socket. Without this the api accumulates a timer per abandoned tab, which is the classic SSE leak.
- **The browser reconnects automatically** → `EventSource` retries after about three seconds; the new stream re-reads the current state and emits a full `progress` plus one `pairing` per pairing, so a reconnect always resynchronises rather than resuming a partial view. `Last-Event-ID` is not used, because the state is in the database.
- **The job is already finished when the stream opens** → one `done` (or `error`) event is emitted immediately and the stream closes; the client does not need a special case for "too late to watch".
- **The job does not exist** → 404 before the SSE headers are written, so the client sees a normal HTTP error rather than an empty stream that closes.
- **The worker is not running** → the job stays `queued` forever; the stream emits nothing but heartbeats and closes after an hour with an `error` event. The Evaluate page shows "queued" with the elapsed time ([S04.T17](T17-web-evaluate-page.md)), which is the honest state.
- **A cancel while the job is `queued`** → the worker's claim (`WHERE status='queued'`) never matches, so the job is simply never started; `finished_at` is set by the api so the timestamp `CHECK` of [S04.T14](T14-jobs-schema-migration.md) holds.
- **Nine tabs open on the same job** → the ninth stream is refused with 503 and `Retry-After: 5`; the page falls back to polling `GET /api/jobs/:id` once a second, which is the same data at a slightly higher cost.
- **`params` containing a huge opponent list** → the per-kind schema bounds it (`gamesPerOpponent` at most 20,000, opponents at least 1); a body above Fastify's `bodyLimit` is rejected by the framework with 413 before any handler runs.
- **The database is locked by a long ETL write** → a read retries inside the client's `busy_timeout`; if it still fails, the poll skips that tick and logs at `warn` rather than closing the stream, because a transient lock is not a job failure.
- **A pairing row changes while the job is already `done`** → cannot happen (the worker writes the result before the terminal status), but the stream's change detection would emit the `pairing` event before the `done` event anyway, because pairings are diffed first in each poll.

## Acceptance / verification

- [ ] `pnpm --filter api test jobs` green: `> create returns 202 with id and Location`, `> unknown kind is 400`, `> invalid evaluate params return the field path`, `> no row is inserted on a 400` (BR-S04.T16-02, -03).
- [ ] `> cancelling a queued job returns 202`, `> cancelling a done job returns 409` with the current status in `details`, `> cancelling a missing job returns 404` (BR-S04.T16-04).
- [ ] Integration with a stubbed worker: create → list → detail → `GET /api/jobs/:id/events` emits `progress`, then one `pairing` per pairing, then `done`, and the stream closes (BR-S04.T16-05).
- [ ] `> the poll timer is cleared on client disconnect`: aborting the request leaves zero active intervals and decrements the stream counter (BR-S04.T16-05).
- [ ] `> an unchanged poll emits no data event` and `> a heartbeat comment is sent every 15 s` with fake timers (BR-S04.T16-06).
- [ ] `> the ninth concurrent stream is rejected with 503` and `Retry-After: 5`, and `> closing a stream frees the slot` (BR-S04.T16-07).
- [ ] `> list caps limit at 100`, `> list omits the json bodies`, `> detail returns pairings ordered by idx`, `> detail contains no games array` (BR-S04.T16-08, -09).
- [ ] `> the api performs no other write`: a statement spy over the whole suite records exactly one `INSERT INTO jobs` and one `UPDATE jobs SET status='cancelled'` pattern (BR-S04.T16-01).
- [ ] `> every failure path uses the error envelope`: one assertion per code (`BAD_PARAMS`, `UNKNOWN_KIND`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_STREAMS`) (BR-S04.T16-10).
- [ ] `apps/api/ROUTES.md` contains the five endpoints, the five event types and the four constants, and the generated client types compile in `apps/web`.

## Risks and open questions

- **Risk — polling the database once a second per stream is wasteful** when several tabs watch the same job. Mitigation: `SSE_MAX_STREAMS` bounds it at eight, the queries are two indexed reads, and a shared per-job poller with fan-out is a local refactor inside `sse.ts` if it ever matters.
- **Risk — SSE behaves badly behind a future reverse proxy** that buffers responses. Mitigation: `X-Accel-Buffering: no` and the heartbeat; the api binds to loopback today (D-007) and [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) is where hosting is reconsidered.
- **Risk — the api and the worker validate `params` differently.** Mitigation: one registry, one zod schema per kind, imported by both; a schema change breaks both test suites at once.
- **Question — should `POST /api/jobs` refuse a duplicate job** (same kind and params already queued or running)? It would prevent an accidental double-click from doubling a measurement's cost. Recommendation: add an idempotency key later if it proves a nuisance; a hash of `params` plus a partial unique index is the mechanism, and it is a migration, so it is not free. The user decides after using the Evaluate page.
- **Question — should the stream include per-game events** for a live board view? That is [S08.T04](../08-operations-and-extensions/T04-wasm-replay-and-play.md)'s territory and would require the worker to forward `game` lines, which it stores rather than streams. Recommendation: keep this stream at pairing granularity and let replay read `games` rows after the fact.

## References

- `pokemon/src/pokesearch/api/routes_sim.py` — verified: `POST /sim/project/{pid}/run` (form fields `kind`, `version_id`, `mode`), `POST /sim/run/{rid}/cancel`, the HTMX partial `GET /ui/sim/run/{rid}`, the full page `GET /sim/run/{rid}`, and the JSON half `GET /api/sim/projects`, `GET /api/sim/project/{pid}`, `GET /api/sim/run/{rid}`, `POST /api/sim/project/{pid}/run`. Consult for the route set; the HTML half is replaced by [S04.T17](T17-web-evaluate-page.md).
- `pokemon/src/pokesearch/templates/_sim_run_status.html` — verified: `hx-get="/ui/sim/run/{{ run.id }}" hx-trigger="every 3s" hx-swap="outerHTML"`, showing `partidas {{ progress.games_done }}/{{ progress.games_total }}`, the opponent name and a partial score. This is the liveness SSE reproduces with a smaller payload.
- `pokemon/src/pokesearch/sim/store.py` — verified: `get_run` returning the run with its `sim_results` joined to `archetypes`, the shape `GET /api/jobs/:id` mirrors with `job_pairings`.
- [S04.T14](T14-jobs-schema-migration.md) — the columns these routes read and the two writes the api is allowed to make.
- [S01.T07](../01-foundation/T07-api-skeleton-and-health.md) — the app factory, the zod type provider, the error envelope and the route conventions in `apps/api/ROUTES.md`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
