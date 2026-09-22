# S01.T08 — Web application skeleton

| Field | Value |
|---|---|
| Stage | S01 — Foundation |
| Status | TODO |
| Order in stage | 8 / 10 |
| Depends on | [S01.T01](T01-monorepo-skeleton.md), [S01.T07](T07-api-skeleton-and-health.md) |
| Unblocks | [S02.T12](../02-card-data-and-search/T12-web-search-page.md), [S02.T13](../02-card-data-and-search/T13-web-card-detail-page.md), [S02.T14](../02-card-data-and-search/T14-web-sets-page.md), [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md), [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md), [S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md), [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `env` `WEB_PORT`, `API_PORT` — from [S01.T01](T01-monorepo-skeleton.md)
- `contract` `GET /health`, route conventions — from [S01.T07](T07-api-skeleton-and-health.md)
- `module` `@pokesearch/shared` — the response schemas the API client parses with; browser-safe by BR-S01.T05-01
- `file` `pokemon/src/pokesearch/templates/base.html` and `static/style.css` — the legacy shell and its 154-line stylesheet; read-only reference for the navigation set and the colour tokens

## Outputs (proposed)
- `module` `apps/web/` — Vite + React 19 + TypeScript, TanStack Router (file-based routes) and TanStack Query, layout with pt-BR navigation (Buscar · Decks · Meta · Simulador · Regras · Sets), CSS variables with automatic dark mode, dev proxy `/api` → API — consumed by [S02.T12](../02-card-data-and-search/T12-web-search-page.md), [S02.T13](../02-card-data-and-search/T13-web-card-detail-page.md), [S02.T14](../02-card-data-and-search/T14-web-sets-page.md), [S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md), [S05.T13](../05-card-rules-base/T13-rules-editor-ui.md), [S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md)
- `module` `apps/web/src/api/client.ts` — typed fetch wrapper that parses responses with `@pokesearch/shared` schemas, maps the API error envelope to a typed `ApiError`, and fixes the query-key conventions later pages reuse
- `contract` UI language rule: all copy pt-BR via a single `strings.ts` (no i18n framework), card data English — plus the `CardImage` fallback pattern and the CSS token set every later page builds on

## Initial objective
A running web shell with navigation, an API client and a health widget, so every later page is one route file plus one query hook.

## Context

The shell is the frame six later subtasks fill. What it must settle once is the pervasive stuff — how a page fetches, how it fails, where its text comes from, how a card picture is shown, what dark mode looks like — because each of those is expensive to change across twenty pages.

The legacy site is the reference for visual economy, not architecture. `pokemon/src/pokesearch/templates/base.html` is a 31-line Jinja base with `<html lang="pt-BR">`, a brand link, a five-item nav (`Buscar`, `Decks` with a badge, `Simulador`, `Sets`, `API`), a footer attributing pokemon-tcg-data, TCGdex and Limitless, and htmx from a CDN. `static/style.css` is 154 hand-written lines: a `:root` token block (`--bg`, `--surface`, `--ink`, `--ink2`, `--muted`, `--line`, `--accent`, `--accent-ink`, `--warn-bg`, `--warn-ink`, `--spark`), a `@media (prefers-color-scheme: dark)` override of the same tokens, a card grid at `minmax(170px, 1fr)` and images locked to `aspect-ratio: 245 / 337`. That economy is kept; the server-rendered HTMX fragments are not — D-008 puts a JSON API behind React so a long job survives a reload and UI state lives in the URL. Navigation gains `Meta` and `Regras` and loses `API`, since there is no `/docs` page to link yet.

## Scope

- **In scope.** The Vite + React 19 + TypeScript app; TanStack Router with file-based routes, a root layout (header, nav, footer, error boundary) and a not-found route; the TanStack Query provider and query-key convention; `src/api/client.ts` with typed errors; `src/strings.ts` (pt-BR) and the error-code map; `src/styles/tokens.css` + `base.css`; the `CardImage` component and its fallback chain; the health widget; the Vite dev proxy; `dev`/`build`/`preview` scripts.
- **Out of scope.** Every domain page — search ([S02.T12](../02-card-data-and-search/T12-web-search-page.md)), card detail ([S02.T13](../02-card-data-and-search/T13-web-card-detail-page.md)), sets ([S02.T14](../02-card-data-and-search/T14-web-sets-page.md)), meta ([S03.T08](../03-tournament-meta-and-deck-builder/T08-web-meta-pages.md)), rules editor ([S05.T13](../05-card-rules-base/T13-rules-editor-ui.md)), coverage ([S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md)); SSE job progress ([S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md)); any component library; server-side rendering; an i18n framework.

## Business rules

The traceability doc assigns no `RN-nn` here. RN-70 ("exact and proven coverage always shown together") will be enforced by [S05.T14](../05-card-rules-base/T14-coverage-page-and-authoring-queue.md) inside this shell; its two labels live in the strings module.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T08-01 | Every user-visible string comes from `src/strings.ts` in pt-BR; no literal copy appears in a component. Card data (names, attack text) stays English, as printed. | eslint `react/jsx-no-literals` with a punctuation allow-list | `pnpm lint` fails on a fixture containing `<h1>Buscar</h1>` |
| BR-S01.T08-02 | Every API response is validated with its `@pokesearch/shared` schema before a component sees it; an invalid payload throws `ApiSchemaError` and renders the error state, never partial data. | `apiFetch` calls `schema.parse(json)` after the status check | `client.spec.ts > rejects a response missing a field`; `> renders the error state on schema mismatch` |
| BR-S01.T08-03 | `apps/web` imports no server-only module: not `@pokesearch/db`, not `apps/api`, not `node:*`, not `@pokesearch/shared/env`. | eslint `no-restricted-imports`; the production build fails on a Node built-in | `pnpm --filter web build` succeeds and `grep -E "node:\|@pokesearch/db" dist/assets/*.js` finds nothing |
| BR-S01.T08-04 | A card image is hotlinked (never mirrored), tries each URL of its chain once, ends at an inline placeholder, and reserves its box so a failure causes no layout shift. | `CardImage`'s `onError` index, `aspect-ratio: 245 / 337`, `loading="lazy"` | `card-image.spec.tsx > falls back through the chain and stops at the placeholder`; `> keeps the same box size` |
| BR-S01.T08-05 | The app addresses the API by relative path only; no absolute URL, host or port appears in web source. | `apiFetch` refuses a path not starting with `/`; eslint bans `http://` literals | `client.spec.ts > refuses an absolute URL` |
| BR-S01.T08-06 | Dark mode follows the operating system through CSS only: no theme flash, no JavaScript gate on first paint. | `tokens.css` — `:root` defaults plus `@media (prefers-color-scheme: dark)`, with `:root[data-theme]` reserved for a later toggle | `theme.spec.tsx` asserts the computed `--bg` under an emulated dark preference; manual check for no flash |
| BR-S01.T08-07 | Shareable UI state (query text, filters, page, tab) lives in the URL search params, so a reload or a copied link restores the view. | TanStack Router `validateSearch` per route, with a zod schema from `@pokesearch/shared` | `router.spec.tsx > restores state from the URL` on the placeholder search route |
| BR-S01.T08-08 | Failures are shown, never swallowed: every query surface has a loading, an empty and an error state, and the error names what failed in pt-BR plus the API `code`. | the shared `<QueryState>` wrapper every page uses | `query-state.spec.tsx` covers the three states |

## Data operations

**User actions** — the shell's own interactions; later pages add their own tables. The web performs no database operation: every read and write goes through the API (architecture principle 2).

| Action | UI element | API call | Result / feedback |
|---|---|---|---|
| Open the site | root layout mounts | `GET /health` (TanStack Query, `staleTime` 30 s) | header badge "Conectado" with the SQLite version in the tooltip, or "Banco indisponível" with the API `code` |
| Retry the health check | the badge acts as a button | `GET /health` refetch | spinner on the badge; re-render with the new state; navigation never blocked |
| Read build information | footer line | `GET /api/version` (`staleTime` Infinity) | app version, `contractVersion`, `schemaVersion`; `engineBuild` shown only when non-null |
| Navigate between sections | nav links (client-side routing) | none | the target route renders its placeholder naming the owning subtask; back/forward work |
| Deep-link with search params | pasted URL | per-page | `validateSearch` parses them; invalid params fall back to defaults with a pt-BR notice |
| A card image fails to load | `CardImage` | none (CDN hotlink) | the next URL is tried; after the last, the inline placeholder renders in the same box |
| Open an unknown path | any bad link | none | the not-found route renders a pt-BR message and a link back to Buscar |
| A page query fails | `<QueryState>` | the page's own call | error state with the pt-BR message mapped from the API `code` and a "tentar novamente" button |

## Interfaces

**Structure**

```
apps/web/
  index.html                  <html lang="pt-BR">, one #root, no CDN scripts
  vite.config.ts              server.port = $WEB_PORT, proxy { "/api", "/health" } → API
  src/
    main.tsx                  QueryClientProvider + RouterProvider
    routes/__root.tsx         layout: header/nav/footer, error boundary, not-found
    routes/index.tsx          "/"               → Buscar   (placeholder, S02.T12)
    routes/cards.$cardId.tsx  "/cards/:cardId"             (placeholder, S02.T13)
    routes/sets.tsx           "/sets"                      (placeholder, S02.T14)
    routes/decks.tsx          "/decks"                     (placeholder, S03)
    routes/meta.tsx           "/meta"                      (placeholder, S03.T08)
    routes/sim.tsx            "/sim"                       (placeholder, S04)
    routes/rules.tsx          "/rules"                     (placeholder, S05.T13)
    api/client.ts  api/hooks.ts
    components/CardImage.tsx  QueryState.tsx  HealthBadge.tsx
    strings.ts                styles/tokens.css  styles/base.css
```

Route paths are English (D-006); the labels shown come from `strings.ts`.

**API client**

```ts
export class ApiError extends Error { status: number; code: string; details?: { path: string; message: string }[]; requestId?: string; }
export class ApiSchemaError extends Error { issues: z.ZodIssue[]; path: string; }
export interface ApiFetchOptions<T> {
  schema: z.ZodType<T>;
  method?: "GET" | "POST" | "PATCH" | "DELETE";                    // default GET
  body?: unknown;
  search?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;                                            // default AbortSignal.timeout(15_000)
}
export function apiFetch<T>(path: `/${string}`, opts: ApiFetchOptions<T>): Promise<T>;
export const queryKeys = { health: ["health"], version: ["version"], cards: (q: unknown) => ["cards", q] } as const;
```

Behaviour: build the URL from the relative path plus `search` (undefined dropped); send `accept: application/json`; on a non-2xx parse the error envelope and throw `ApiError` (a non-envelope body becomes `code: "invalid_response"`); on 2xx `schema.parse` and throw `ApiSchemaError` on failure, logging the issues in development. No retry inside `apiFetch`; TanStack Query uses `retry: 1` for queries, `0` for mutations, `refetchOnWindowFocus: false`.

**Strings module**

```ts
export const strings = {
  brand: "PokéSearch",
  nav: { search: "Buscar", decks: "Decks", meta: "Meta", sim: "Simulador", rules: "Regras", sets: "Sets" },
  health: { connected: "Conectado", unavailable: "Banco indisponível", retry: "Tentar novamente" },
  errors: { generic: "Algo deu errado.", byCode: {
    not_found: "Não encontrado.",
    validation_error: "Parâmetros inválidos.",
    database_unavailable: "O banco de dados não está acessível.",
    schema_outdated: "O banco está desatualizado. Rode as migrações.",
    invalid_response: "Resposta inesperada da API.",
  } as Record<string, string> },
  footer: { dataSources: "Dados:", disclaimer: "Não afiliado à Nintendo / The Pokémon Company." },
} as const;
export function errorMessage(code: string | undefined): string;
```

The footer keeps the legacy attributions (pokemon-tcg-data, TCGdex, Limitless) and the non-affiliation line, whose fuller form lives in `docs/NOTICE.md` ([S01.T09](T09-licensing-and-notice.md)).

**`CardImage`.** `{ urls: readonly string[]; alt: string; size?: "tile" | "detail" }`. Renders one `<img>` with `src = urls[i]`, `loading="lazy"`, `decoding="async"` and width/height from the 245 × 337 ratio; `onError` advances `i`; an exhausted chain renders an inline SVG placeholder with the card name. The chain order is fixed by [S02.T13](../02-card-data-and-search/T13-web-card-detail-page.md) (pokemontcg.io → TCGdex WebP → Limitless CDN → placeholder); this subtask defines the component and the "each URL once, then placeholder" rule.

**Styling.** `tokens.css` defines the legacy token set on `:root` and redefines it under `@media (prefers-color-scheme: dark)`, with `:root[data-theme="dark"|"light"]` reserved for a later toggle. `base.css` carries the legacy layout primitives: `body` at `14px/1.45 system-ui`, a sticky header, `main { max-width: 1400px; padding: 16px }`, the grid `repeat(auto-fill, minmax(170px, 1fr))`, `.muted`/`.small`, and a `@media (max-width: 800px)` collapse. No CSS framework, no runtime CSS-in-JS.

**Dev proxy.** `vite.config.ts` reads `WEB_PORT` and `API_PORT` from the environment and proxies `/api` and `/health` to `http://127.0.0.1:${API_PORT}`, so BR-S01.T08-05 holds in development and same-origin holds in a build.

## Implementation steps

1. Scaffold `apps/web` (Vite + React 19 + TS); `tsconfig.json` extends the base with `lib: ["es2024","dom"]` and `moduleResolution: "bundler"`; `build` succeeds on the empty app.
2. Add `tokens.css` and `base.css` and render a bare layout; check both OS themes (BR-S01.T08-06).
3. Add TanStack Router with `__root.tsx`, the seven placeholder routes (each naming its owning subtask) and the not-found route.
4. Write `strings.ts`, replace every literal in the layout, add the eslint rule (BR-S01.T08-01).
5. Write `api/client.ts` and unit-test it against a mocked `fetch` (BR-S01.T08-02, -05).
6. Add the Query provider with the documented defaults, `api/hooks.ts` (`useHealth`, `useVersion`) and `<QueryState>` (BR-S01.T08-08).
7. Add `HealthBadge` to the header and the version line to the footer; verify against a running API.
8. Add `CardImage` with its tests (BR-S01.T08-04).
9. Configure the dev proxy from the environment; run web and api together and confirm the badge turns "Conectado".
10. Add the restricted-imports rule and a build assertion that the bundle has no Node built-in (BR-S01.T08-03).

## Edge cases and error handling

- **The API is not running** → a network error becomes `ApiError { status: 0, code: "network_error" }`; the badge shows "Banco indisponível" and the site stays fully navigable. Nothing in the shell may depend on the API being up.
- **The API answers `503 schema_outdated`** → the badge shows the mapped pt-BR message telling the user to run the migrations; the code, not the English message, drives the text.
- **A response does not match its schema** → `ApiSchemaError`; in development the issues are printed and the error state names the endpoint, in a build the user sees "Resposta inesperada da API." This is the intended outcome of BR-S01.T05-04's strictness.
- **A CDN image 404s or is blocked** → the chain advances once per URL and ends at the placeholder; an image that fails slowly still occupies its reserved box, so the grid never reflows.
- **Invalid URL search params** (`?page=abc`) → `validateSearch` falls back to defaults with a dismissible pt-BR notice rather than an error page, so a shared link with a typo still shows results.
- **A pt-BR label overflows the nav on a narrow window** → the header wraps at the legacy 800 px breakpoint, and nav labels are kept to one word.
- **A request hangs** → the default `AbortSignal.timeout(15_000)` aborts it and the query surfaces the error state; no indefinite spinner.
- **Two tabs open** → each has its own query cache; nothing in the shell assumes a single client. Job progress, which does need coordination, is [S04.T16](../04-game-engine-core/T16-api-jobs-and-sse.md)'s problem.

## Acceptance / verification

- [ ] `pnpm --filter web dev` shows the layout and the health widget reading `/health` through the proxy — badge "Conectado", tooltip showing `sqliteVersion` and `databasePath`.
- [ ] `pnpm --filter web build` succeeds; bundle has no server-only imports (`grep` over `dist/assets/*.js` finds none) (BR-S01.T08-03).
- [ ] `pnpm --filter web test` green: `client.spec.ts` (envelope → `ApiError`, schema mismatch → `ApiSchemaError`, absolute URL refused), `card-image.spec.tsx`, `query-state.spec.tsx`, `router.spec.tsx` (BR-S01.T08-02, -04, -05, -07, -08).
- [ ] With the API stopped, every route still renders and the badge shows "Banco indisponível", with no unhandled promise rejection in the console.
- [ ] `pnpm lint` fails on a fixture component with a literal pt-BR string in JSX and passes for the shell (BR-S01.T08-01).
- [ ] Switching the OS to dark mode and reloading changes the palette with no flash of the light theme; `theme.spec.tsx` asserts the computed `--bg` (BR-S01.T08-06).
- [ ] All seven routes render their placeholder with the owning subtask id visible, and `/nao-existe` renders the not-found route.
- [ ] The footer shows the attributions (pokemon-tcg-data, TCGdex, Limitless) and the non-affiliation line, consistent with `docs/NOTICE.md`.

## Risks and open questions

- **Risk — TanStack Router's file-based generation needs a build step that fights the no-build rule.** It does not: only `apps/web` has a bundler by design. Mitigation: keep the generated route tree committed or generated in `predev`/`prebuild`, and never import it from a server package.
- **Risk — the strings module grows into an ad-hoc i18n layer.** Mitigation: it is flat, typed and pt-BR only; if a second language is ever wanted, it is the seam where a real library plugs in. Stated here so nobody adds one casually.
- **Risk — hotlinked images break when a CDN changes URLs.** Mitigation: the fallback chain and the placeholder; the local-mirror option stays out of scope, consistent with the licensing position in [S01.T09](T09-licensing-and-notice.md).
- **Question — who serves the built app outside `vite dev`?** The API deliberately serves no HTML, while the legacy FastAPI app served templates and `/static`. Recommendation: `vite preview` for now; the user decides when the app is used daily. Blocks no later page.
- **Question — a manual theme toggle?** The tokens already support `data-theme`; whether a toggle appears is the user's call, ideally after the first real pages exist.
- **DEPENDENCY-PROPOSAL.** This file's `Unblocks` lists [S08.T03](../08-operations-and-extensions/T03-hosted-postgres-migration-path.md), but nothing in the web shell is consumed by a database-hosting subtask. Unless S08.T03 explicitly covers re-pointing the web app's origin, consider removing `S01.T08 → S08.T03` from both files when S08 is elaborated; the edges from [S01.T02](T02-sqlite-database-client.md) and [S01.T07](T07-api-skeleton-and-health.md) carry the real dependency.

## References

- `pokemon/src/pokesearch/templates/base.html` — verified: `<html lang="pt-BR">`, brand link, nav `Buscar / Decks (badge) / Simulador / Sets / API`, footer attributing pokemon-tcg-data, TCGdex ("preços TCGPlayer/Cardmarket") and Limitless with "Não afiliado à Nintendo / The Pokémon Company", htmx 2.0.4 from cdnjs. Consult for the navigation set and footer copy.
- `pokemon/src/pokesearch/static/style.css` — verified: 154 lines; the `:root` token set, dark mode via `prefers-color-scheme`, `body` at `14px/1.45 system-ui`, `main { max-width: 1400px }`, grid `minmax(170px, 1fr)`, `.tile img { aspect-ratio: 245 / 337 }`, breakpoint at 800 px. Consult for the token values and grid metrics.
- [Architecture overview](../../project/03-architecture-overview.md) — `apps/web` responsibilities, the "HTMX → JSON API + React" row, and "UI state in URLs".
- [Decision log](../../project/02-decision-log.md) D-006, D-007, D-008.
- `apps/api/ROUTES.md` ([S01.T07](T07-api-skeleton-and-health.md)) — the error envelope and pagination shapes the client maps.
- External: TanStack Router (file-based routing, `validateSearch`), TanStack Query (defaults, query keys), Vite `server.proxy`, MDN on `prefers-color-scheme`, `loading="lazy"` and `AbortSignal.timeout`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
