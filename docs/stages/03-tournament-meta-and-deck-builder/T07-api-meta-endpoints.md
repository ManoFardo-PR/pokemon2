# S03.T07 — API: meta endpoints

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 7 / 13 |
| Depends on | [S01.T07](../01-foundation/T07-api-skeleton-and-health.md), [S03.T05](T05-decks-sync-and-prune.md), [S03.T06](T06-meta-queries.md) |
| Unblocks | [S03.T08](T08-web-meta-pages.md) |
| Parallel with | [S03.T11](T11-user-decks-schema-and-api.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` Fastify app and conventions — from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md)
- `module` meta queries — from [S03.T06](T06-meta-queries.md)
- `module` `status(db)` and `tryStartBackgroundSync()` — the sync state `GET /api/meta/status` reports and the debounced job `POST /api/meta/refresh` starts — from [S03.T05](T05-decks-sync-and-prune.md)

## Outputs (proposed)
- `contract` `GET /api/meta/decks?p=…&p=…&format=STANDARD&days=90&sort=quality` → `{ selection, archetypes, decklists, partners: { pokemon, trainer }, alternatives, window }`; `GET /api/meta/suggest?q=`; `GET /api/meta/status`; `POST /api/meta/refresh` (202/409); `GET /api/decks/:id`; `GET /api/decks/:id/export.txt` — consumed by [S03.T08](T08-web-meta-pages.md)
- `contract` zod request/response schemas in `packages/shared/src/api/meta.ts`, exported as JSON Schema so the web client's types are generated, not hand-written
- `module` `apps/api/src/routes/meta.ts` — the Fastify plugin registering the six routes

## Initial objective
The meta pages get all their data from a handful of documented JSON endpoints with clamped parameters (days 7–365, ≤ 6 Pokémon).

## Context

The legacy application served this section as HTMX fragments: routes returned HTML partials and the JSON API was a thin afterthought (`pokemon/src/pokesearch/api/routes_decks.py`). Here the split is total — the API returns JSON only, the React pages of [S03.T08](T08-web-meta-pages.md) own every pixel — so this subtask's job is to define a request contract that a URL can carry and a response contract the page can render without a second round trip.

One design decision carries over unchanged: **one request answers the whole meta page**. `GET /api/meta/decks` returns the selection echo, the archetype panels, the ranked decklists, both partner lists and the alternatives for each selected Pokémon, plus the window statistics. The legacy `_results()` assembled exactly that bundle, and it is what makes the page a single shareable URL rather than six coordinated fetches.

The second decision is that **parameters are clamped, never rejected**. A `days=9999` becomes 365, a seventh Pokémon is dropped, an unknown `sort` becomes `quality`. The legacy `_params()` did this because the parameters come from a URL the user edits and from bookmarked links; a 400 on a stale bookmark is worse than a sensible answer. Explicit errors are reserved for things that genuinely do not exist (an unknown deck id → 404) and for state conflicts (a refresh while a sync runs → 409).

D-007 applies: no authentication, the API binds to `127.0.0.1`. These endpoints are read-only except `POST /api/meta/refresh`, which starts an ETL run in the background and returns immediately.

## Scope

- **In scope.** `apps/api/src/routes/meta.ts`: the six routes, the shared parameter parser with its clamping, the zod schemas for requests and responses, `text/plain` export, the 202/409 refresh semantics, `Cache-Control` headers, and route-level tests with a fixture database.
- **Out of scope.** The query logic and every formula ([S03.T06](T06-meta-queries.md)); running the sync ([S03.T05](T05-decks-sync-and-prune.md)); rendering ([S03.T08](T08-web-meta-pages.md)); user decks and their endpoints ([S03.T11](T11-user-decks-schema-and-api.md)); the comparison endpoint, which hangs off a user deck version ([S03.T13](T13-deck-comparison-with-tournament-lists.md)); the app skeleton, error envelope and logging ([S01.T07](../01-foundation/T07-api-skeleton-and-health.md)).

## Business rules

The traceability doc assigns no `RN-nn` to this subtask; it exposes RN-03's window as a clamped parameter and RN-04's effect as the `window` block of every response.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S03.T07-01 | `days` is clamped to `[7, 365]`, `format` is upper-cased with default `STANDARD`, `sort` falls back to `quality` when not one of `quality\|recent\|placing`, and a non-numeric `days` falls back to 90 instead of erroring. | `parseMetaParams()` in `routes/meta.ts` | `meta-routes.spec.ts > clamping` — `days=9999 → 365`, `days=1 → 7`, `days=abc → 90`, `sort=zzz → quality` |
| BR-S03.T07-02 | At most 6 `p` values are honoured, deduplicated in input order after `nameKey` normalisation; extra values are dropped silently and the response echoes the effective `selection`. | `parseMetaParams()` delegating to `parseSelection()` ([S03.T06](T06-meta-queries.md)) | `meta-routes.spec.ts > selection cap` — 8 `p` values yield a 6-item `selection` |
| BR-S03.T07-03 | `GET /api/meta/decks` with no `p` returns 200 with an empty `selection`, empty `archetypes`, `decklists`, `partners` and `alternatives`, and a populated `window` — never 400. | the empty-selection branch, which skips the deck query entirely | `meta-routes.spec.ts > empty selection` — status 200, `window.decks > 0` |
| BR-S03.T07-04 | `GET /api/decks/:id` and `GET /api/decks/:id/export.txt` answer 404 with the standard error envelope when the deck does not exist; deck ids containing `:` and `/` are accepted, since ids look like `api:1234:player`. | a wildcard path parameter plus the `null` check on `getDeck` | `meta-routes.spec.ts > unknown deck 404`; `> deck id with colons resolves` |
| BR-S03.T07-05 | The export endpoint responds `text/plain; charset=utf-8` with `Content-Disposition: inline; filename="deck.txt"` and a body byte-identical to `exportText(getDeck(id))`. | the export route handler | `meta-routes.spec.ts > export bytes` — body equals the direct call; headers asserted |
| BR-S03.T07-06 | `POST /api/meta/refresh` returns 202 `{ started: true }` when a background sync starts and 409 `{ started: false, reason }` when one is running or the 10-minute cooldown has not elapsed; it never blocks the request thread and never runs the sync inline. | `tryStartBackgroundSync()` from [S03.T05](T05-decks-sync-and-prune.md), called without `await` on the sync itself | `meta-routes.spec.ts > refresh 202 then 409` — two immediate calls give 202 then 409 with `reason: "cooldown"` |
| BR-S03.T07-07 | Every response body validates against its zod schema before it leaves the process; a schema mismatch is a 500 with a logged diff, never a partially-shaped 200. | the Fastify zod type provider's response serialisation ([S01.T07](../01-foundation/T07-api-skeleton-and-health.md)) | `meta-routes.spec.ts > response schema` — each route's body parses with its exported schema |
| BR-S03.T07-08 | Every read endpoint sends `Cache-Control: no-store` except `GET /api/decks/:id` and its export, which send `Cache-Control: private, max-age=60`; a tournament deck never changes between syncs. | the per-route header hook | `meta-routes.spec.ts > cache headers` |
| BR-S03.T07-09 | These routes issue no write to any table; the only mutation they can cause is starting the ETL through `POST /api/meta/refresh`. | the handlers call only `queries.ts` functions plus `tryStartBackgroundSync` | `meta-routes.spec.ts > read only` — the whole suite runs against a read-only connection, with the refresh test stubbing the starter |
| BR-S03.T07-10 | `GET /api/meta/suggest` returns `[]` for a query shorter than 2 characters after normalisation, without querying the database. | the guard in `suggest()` ([S03.T06](T06-meta-queries.md)), reasserted at the route | `meta-routes.spec.ts > suggest minimum length` — `q=d` returns `[]` and the query counter stays at 0 |

## Data operations

| Method | Path | Params / body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/meta/decks` | query: `p` (repeatable, ≤ 6 honoured), `format` (default `STANDARD`), `days` (7–365, default 90), `sort` (`quality\|recent\|placing`, default `quality`), `limit` (1–100, default 30) | 200 `{ selection: string[], archetypes: ArchetypePanel[], decklists: DeckRow[], partners: { pokemon: PartnerRow[], trainer: PartnerRow[] }, alternatives: AlternativesResult[], window: WindowStats, sort, format, days }` | 500 on an internal failure; never 400 (BR-S03.T07-01, -03) |
| GET | `/api/meta/suggest` | query: `q` (string), `format`, `days` | 200 `SuggestItem[]` — `{ name, usage, img }`, ≤ 12, most used first | 500 only; `q` shorter than 2 characters yields `[]` (BR-S03.T07-10) |
| GET | `/api/meta/status` | — | 200 `SyncStatus` — `{ status, lastSync, startedAt, error, stats, tournaments, decks, archetypes, newest }` | 500 only |
| POST | `/api/meta/refresh` | body: `{ days?: number }` (clamped like `days` above) | 202 `{ started: true }` | 409 `{ started: false, reason: "running" \| "cooldown" }` (BR-S03.T07-06) |
| GET | `/api/decks/:id` | path: deck id, URL-encoded (`api%3A1234%3Aplayer`) | 200 `DeckDetail & { export: string }` | 404 `{ error: { code: "NOT_FOUND" } }` (BR-S03.T07-04) |
| GET | `/api/decks/:id/export.txt` | path: deck id | 200 `text/plain; charset=utf-8`, body = TCG Live text | 404 as above (BR-S03.T07-04, -05) |

No row is created, updated or deleted by any of these routes; the only actor that writes the meta tables remains the ETL ([S03.T05](T05-decks-sync-and-prune.md)).

## Interfaces

**`packages/shared/src/api/meta.ts`**

```ts
export const SortSchema = z.enum(["quality", "recent", "placing"]);
export const MetaDecksQuerySchema = z.object({
  p: z.union([z.string(), z.array(z.string())]).optional(),
  format: z.string().default("STANDARD").transform(s => s.toUpperCase()),
  days: z.coerce.number().int().catch(90).transform(n => Math.min(365, Math.max(7, n))),
  sort: SortSchema.catch("quality"),
  limit: z.coerce.number().int().catch(30).transform(n => Math.min(100, Math.max(1, n))),
});
export const MetaDecksResponseSchema = z.object({
  selection: z.array(z.string()).max(6),
  archetypes: z.array(ArchetypePanelSchema),
  decklists: z.array(DeckRowSchema),
  partners: z.object({ pokemon: z.array(PartnerRowSchema), trainer: z.array(PartnerRowSchema) }),
  alternatives: z.array(AlternativesResultSchema),
  window: WindowStatsSchema,
  sort: SortSchema, format: z.string(), days: z.number().int(),
});
export const MetaSuggestQuerySchema  = z.object({ q: z.string().default(""), format: …, days: … });
export const MetaRefreshBodySchema   = z.object({ days: z.coerce.number().int().optional() });
export const MetaRefreshResponseSchema = z.discriminatedUnion("started", [
  z.object({ started: z.literal(true) }),
  z.object({ started: z.literal(false), reason: z.enum(["running", "cooldown"]) }),
]);
export const DeckDetailResponseSchema = DeckDetailSchema.extend({ export: z.string() });
```

**`apps/api/src/routes/meta.ts`**

```ts
export default async function metaRoutes(app: FastifyInstance): Promise<void>;
// registers, with the zod type provider:
//   GET  /api/meta/decks
//   GET  /api/meta/suggest
//   GET  /api/meta/status
//   POST /api/meta/refresh
//   GET  /api/decks/:id
//   GET  /api/decks/:id/export.txt
export interface MetaParams { keys: string[]; names: string[]; format: string; days: number; sort: Sort; limit: number }
export function parseMetaParams(query: unknown): MetaParams;   // clamping lives here (BR-S03.T07-01, -02)
```

**Handler composition for `GET /api/meta/decks`** (one database connection, six calls, no `await` fan-out beyond them):

```ts
const p = parseMetaParams(req.query);
const decks = p.keys.length ? findDecks(db, p.keys, p.format, p.days) : [];
return {
  selection: p.keys, sort: p.sort, format: p.format, days: p.days,
  decklists:  rankDecklists(decks, p.sort, p.limit),
  archetypes: decks.length ? archetypesFor(db, decks, p.format, p.days) : [],
  partners: {
    pokemon: decks.length ? partners(db, decks, p.keys, "pokemon", p.format, p.days) : [],
    trainer: decks.length ? partners(db, decks, p.keys, "trainer", p.format, p.days, { top: 12 }) : [],
  },
  alternatives: p.names.map(n => alternatives(db, n, p.format, p.days)),
  window: windowStats(db, p.format, p.days),
};
```

**Path parameter for deck ids.** Deck ids contain colons and may contain any character a player's name contains (`api:1234:Ana Souza`). The route uses a wildcard parameter (`/api/decks/*`) and decodes it once; the web client encodes with `encodeURIComponent`. Ids are never re-normalised, so `getDeck` sees the exact stored id.

**Error envelope.** Inherited from [S01.T07](../01-foundation/T07-api-skeleton-and-health.md): `{ error: { code, message, details? } }` with codes `NOT_FOUND` (404), `CONFLICT` (409) and `INTERNAL` (500). The refresh endpoint is the one place where a non-2xx body is domain data rather than an error, so it returns its own `{ started, reason }` shape at 409 — documented here because it deviates from the envelope on purpose.

## Implementation steps

1. Write the zod schemas in `packages/shared/src/api/meta.ts`, deriving the response types from the interfaces of [S03.T06](T06-meta-queries.md) rather than restating them.
2. Implement `parseMetaParams` with its clamping and the selection cap; unit-test it before any route exists.
3. Register `GET /api/meta/decks` with the composition above; test the empty selection, one Pokémon and two Pokémon against a fixture database.
4. Register `GET /api/meta/suggest` and `GET /api/meta/status`.
5. Register `POST /api/meta/refresh` with the 202/409 split and a stubbed starter in tests.
6. Register `GET /api/decks/:id` and the `.txt` export, including the wildcard id handling and the 404 path.
7. Add the `Cache-Control` hook and the response-schema validation check.
8. Export the generated JSON Schema so [S03.T08](T08-web-meta-pages.md) can generate its client types; add one example request per route to the API README.

## Edge cases and error handling

- **`?days=9999&sort=zzz&p=a&p=b&p=c&p=d&p=e&p=f&p=g`** → 200 with `days: 365`, `sort: "quality"` and a 6-item `selection`; the seventh Pokémon is dropped and the echoed `selection` tells the page what was actually used.
- **A deck id that exists but whose tournament was pruned between two requests** → `getDeck` returns `null` because the cascade removed the deck; the route answers 404 rather than a half-empty object.
- **A deck id with a URL-encoded colon (`api%3A1234%3Aplayer`)** → decoded once by the wildcard handler and passed through unchanged; double-decoding a player name containing `%` would corrupt the id, so the handler decodes exactly once.
- **`POST /api/meta/refresh` twice in a row** → 202 then 409 with `reason: "cooldown"`; if a sync is already running from the scheduler, the first call already answers 409 with `reason: "running"`.
- **`GET /api/meta/status` while the ETL process is not running at all** → `status: "never"` with null timestamps and zeroed counters; the page shows "nunca sincronizado" instead of an error.
- **A selection whose decks number fewer than 3** → `partners` returns `[]` by [S03.T06](T06-meta-queries.md) BR-S03.T06-05; the response is still 200 with populated `decklists` and `archetypes`, and the page explains the small sample.
- **`q` containing only punctuation** → `nameKey` normalises it to a string shorter than 2 characters, so `suggest` returns `[]` without a query (BR-S03.T07-10).
- **An export requested for a deck with unresolved lines** → the text still contains those lines with their printed names and codes; the JSON endpoint's `unresolved` field is what warns the UI.
- **A very wide window (`days=365`) on a machine mid-sync** → the read runs on a WAL snapshot and returns consistent data; the `window` block reports the counts at that instant, which may differ from a repeat call seconds later.

## Acceptance / verification

- [ ] `pnpm --filter api test -t "meta-routes"` green against a fixture database built by ingesting a recorded tournament ([S03.T05](T05-decks-sync-and-prune.md)).
- [ ] `meta-routes.spec.ts > clamping`: `days=9999 → 365`, `days=1 → 7`, `days=abc → 90`, `sort=zzz → quality`, and 8 `p` values yield 6 in `selection` (BR-S03.T07-01, -02).
- [ ] `meta-routes.spec.ts > empty selection`: `GET /api/meta/decks` with no `p` returns 200 with empty panels and a populated `window` (BR-S03.T07-03).
- [ ] `meta-routes.spec.ts > two Pokémon`: selecting the fixture's two Pokémon returns exactly the deck holding both, one archetype panel and a non-empty `partners.pokemon`.
- [ ] `meta-routes.spec.ts > unknown deck 404` and `> deck id with colons resolves`: 404 carries the standard envelope; `api:t1:p1` round-trips through URL encoding (BR-S03.T07-04).
- [ ] `meta-routes.spec.ts > export bytes`: the `.txt` body equals `exportText(getDeck(id))` byte for byte and carries the documented headers (BR-S03.T07-05).
- [ ] `meta-routes.spec.ts > refresh 202 then 409`: consecutive calls give 202 then 409 with a `reason`, and the sync function is never awaited inside the handler (BR-S03.T07-06).
- [ ] `meta-routes.spec.ts > response schema`: every route's body parses with its exported zod schema (BR-S03.T07-07).
- [ ] `meta-routes.spec.ts > cache headers` and `> read only` pass (BR-S03.T07-08, -09).
- [ ] Manual: `curl "http://127.0.0.1:8000/api/meta/decks?p=Dragapult%20ex&p=Dusknoir&days=90"` on the real database returns archetypes, decklists and partners in under 1 s.

## Risks and open questions

- **Risk — the single bundled response gets heavy.** With 6 Pokémon selected, `alternatives` alone can carry six reference cards plus their printings, lines and 12 similar cards each. Mitigation: `limit` caps the decklists, `alternatives` is already capped per card, and if payloads exceed ~500 kB the alternatives block moves behind its own endpoint — a change the page can absorb because the bundle is already one contract.
- **Risk — clamping hides user error.** A typo in `sort` silently ranks by quality. Mitigation: the response echoes `sort`, `format` and `days`, so the page can show what was actually applied.
- **Risk — `POST /api/meta/refresh` starting an ETL inside the API process** contradicts the architecture's split of responsibilities (the worker owns long jobs). Mitigation: it is an explicit, user-triggered exception carried over from the legacy button, bounded by the 10-minute cooldown; [S08.T01](../08-operations-and-extensions/T01-scheduler.md) may move it into the worker, and the endpoint contract would not change.
- **Question — should `GET /api/meta/decks` accept card ids instead of names?** Names are what the URL carries and what the user types, but they are ambiguous across printings. Recommendation: keep names (they normalise to `nameKey`, which is what the meta groups by); revisit only if a printing-specific view is requested.
- **Question — is a 60-second cache on `GET /api/decks/:id` worth the staleness** right after a sync re-ingests a tournament? Recommendation: yes for a local single user; the user decides if they see a stale list after a forced re-sync.

## References

- `pokemon/src/pokesearch/api/routes_decks.py` — verified: `_params()` (dedupe of `p`, `MAX_SELECTION` cap, `days = max(7, min(365, …))` with a fallback on `ValueError`, `sort` restricted to the three keys), `_results()` bundling `decklists`, `archetypes`, `partners` (pokemon and trainer with `top=12`), `alternatives` per name and `window` in one payload, `deck_export` returning `PlainTextResponse` with `Content-Disposition: inline; filename=deck.txt`, `api_decks_refresh` returning 202 when started and 409 otherwise, and the 404 message on an unknown deck id.
- `pokemon/README.md` L108–110 — verified: the legacy JSON surface (`/api/decks/search`, `/api/decks/alternatives`, `/api/decks/{id}`, `/decks/export/{id}`, `/api/decks/status`, `/api/decks/refresh`) that these six endpoints replace.
- [S03.T06](T06-meta-queries.md) — the functions and result types every handler composes.
- [Decision log](../../project/02-decision-log.md) D-007 (single user, loopback, no auth), D-008 (Fastify 5 with the zod type provider).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
