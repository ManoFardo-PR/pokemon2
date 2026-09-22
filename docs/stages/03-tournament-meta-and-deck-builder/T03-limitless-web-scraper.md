# S03.T03 — Limitless web scraper (official events)

| Field | Value |
|---|---|
| Stage | S03 — Tournament meta and deck builder |
| Status | TODO |
| Order in stage | 3 / 13 |
| Depends on | [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) |
| Unblocks | [S03.T05](T05-decks-sync-and-prune.md) |
| Parallel with | [S03.T01](T01-tournaments-schema-migration.md), [S03.T02](T02-limitless-api-client.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` CLI, cache layout (`limitless/web/list_<id>.html`), run log — from [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)
- `external` `https://limitlesstcg.com/decks/lists?format=standard&time=<1|3|6|12>months&type=<worlds|international|regional|special|national>&show=100&page=N` and `/decks/list/<id>`

## Outputs (proposed)
- `module` `etl/limitless-web.ts` — `parseLists(html) → { tournaments, rows }`, `parseDecklist(html)`, `WebClient` (≥ 0.6 s spacing, 4 retries, browser-like UA), permanent cache of decklist HTML — consumed by [S03.T05](T05-decks-sync-and-prune.md)
- `file` HTML fixtures for both page types under `packages/etl/test/fixtures/limitless-web/`
- `contract` estimated players by event type `{ worlds: 1500, international: 1500, regional: 800, special: 300, national: 400 }` × division factor `{ sr: 0.15, jr: 0.10 }` (RN-06)
- `contract` the web tournament record the sync writes: `source='limitless_web'`, `has_decklists=1`, `complete=1`, `is_online=0`, `platform='TCG'`, `organizer='Play! Pokémon (<type>)'`, `url=https://limitlesstcg.com/tournaments/<base id>`

## Initial objective
Decklists from in-person Play! Pokémon events, which the API does not expose, are scraped politely and parsed defensively so that an HTML change degrades to 'no web decks today' instead of corrupting data.

## Context

The public site lists the decklists of in-person Play! Pokémon events — World Championships, Internationals, Regionals, Special Events, Nationals — which never appear in the play API of [S03.T02](T02-limitless-api-client.md). In the legacy database these were only **3 tournaments out of 403**, but they are the highest-signal ones: [S03.T06](T06-meta-queries.md) multiplies their deck quality by 1.5 precisely because a Regional list is worth more than an online list.

Two page shapes matter. The listing (`/decks/lists`) is a table whose `th.sub-heading` rows carry the tournament (link `/tournaments/<n>`, a date like `28th August 2026`, and the event name after ` - `) and whose following `td` rows carry one decklist each (placing, archetype icons, list link, player in a `span.annotation`). The detail page (`/decks/list/<id>`) has one `.decklist-column` per category, each with a heading `Pokémon (19)` and `.decklist-card` entries carrying `data-set`, `data-number`, `.card-count` and `.card-name`.

Two traps are already known from the legacy implementation. First, **age divisions share the event id**: Masters, Seniors and Juniors of the same event all link to `/tournaments/515`, distinguished only by a `(MA)`, `(SR)` or `(JR)` suffix on the name. Merging them would triple the deck count of one tournament and corrupt every share computed from it, so a non-Masters division becomes its own tournament id `web:515-sr`. Second, **the site does not publish player counts**, so RN-06 estimates them per event type and scales them by division; the estimate only feeds the quality weight of [S03.T06](T06-meta-queries.md), never a legality or eligibility decision.

The whole module is best-effort by construction: the legacy docstring says so, and `ESPECIFICACAO.md` §6.2 declares the fragility. A changed class name must produce an empty result and a warning, so the sync continues with API data alone. D-003 applies — this is a rewrite in TypeScript with an HTML parser (`cheerio` or `linkedom`, chosen in step 1); the legacy BeautifulSoup selectors are the specification of *what* to select, not code to port.

## Scope

- **In scope.** `packages/etl/src/limitless-web.ts`: `WebClient` (0.6 s spacing, 4 retries, browser-like User-Agent, redirect following, permanent HTML cache of list pages), `parseLists`, `parseDecklist`, `parsePlacing`, `parseEventDate`, `timeParam`, the RN-06 estimation tables, and the `web:` id construction rules; the HTML fixtures and their tests.
- **Out of scope.** Database writes, archetype reuse against existing rows, and the page/type iteration of a sync run ([S03.T05](T05-decks-sync-and-prune.md)); resolving lines to card ids ([S03.T04](T04-deck-resolver.md)); the API source ([S03.T02](T02-limitless-api-client.md)); rendering ([S03.T08](T08-web-meta-pages.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-06 | **Kept.** Scraped events have no published player count, so it is estimated by event type — worlds 1500, international 1500, regional 800, special 300, national 400 — multiplied by the division factor sr 0.15, jr 0.10 (Masters 1.0), and rounded down. An unknown type estimates 200. | `estimatePlayers(type, division)` in `limitless-web.ts`, consumed by the tournament record | `limitless-web.spec.ts > estimated players` — `("worlds", "jr") → 150`, `("regional", null) → 800`, `("unknown", null) → 200` |
| BR-S03.T03-01 | A non-Masters division becomes its own tournament: id `web:<n>-<sr\|jr>` and name `<event> (SR\|JR)`. A `(MA)` suffix is stripped and keeps the bare id `web:<n>`. | the division regex `/\s*\((MA\|SR\|JR)\)\s*$/i` branch in `parseLists` | `limitless-web.spec.ts > division split` on the fixture: the `(JR)` row yields `tournamentId = "515-jr"`, `name = "World Championships 2026 (JR)"`, `division = "jr"`, while the Masters rows keep `"515"` |
| BR-S03.T03-02 | `parseLists` and `parseDecklist` never throw: unreadable or restructured HTML yields `{ tournaments: [], rows: [] }` and `{ pokemon: [], trainer: [], energy: [] }` plus one warning. | every selector result is null-checked; the functions have no `throw` and are wrapped in no try/catch by their callers | `limitless-web.spec.ts > mangled fixture` — `parseLists("<html>nothing</html>")` and `parseDecklist("<html></html>")` return the empty shapes and log one warning each |
| BR-S03.T03-03 | A data row is emitted only when a tournament heading precedes it, the row has ≥ 3 cells and the third cell holds a `/decks/list/<digits>` link; otherwise it is skipped silently. | the guard sequence at the top of the row loop in `parseLists` | `limitless-web.spec.ts > orphan rows skipped` — a table whose first row is a data row yields zero rows |
| BR-S03.T03-04 | No two page requests leave `WebClient` less than 600 ms apart; a decklist page is fetched at most once ever, because published lists do not change: `RAW_CACHE_DIR/limitless/web/list_<id>.html` is read before any request unless `force` is set. | the spacing guard and `decklistHtml(listId, { force })` in `WebClient` | `limitless-web.spec.ts > spacing` (fake clock, 4 requests ≥ 1,800 ms); `> decklist cache` — second call leaves `requests` unchanged |
| BR-S03.T03-05 | `WebClient.get` retries 4 times on 429/500/502/503/504 and on network errors with a delay starting at 2 s and doubling, returns `null` on 404, and returns `null` — never throws — after the last attempt. | the retry loop in `WebClient.get` | `limitless-web.spec.ts > retries and 404` — three 503s then a 200 returns the body; five 503s return `null`; a 404 returns `null` with one request |
| BR-S03.T03-06 | The time window parameter is derived from `days`: ≤ 31 → `1months`, ≤ 92 → `3months`, ≤ 183 → `6months`, otherwise `12months`. | `timeParam(days)` | `limitless-web.spec.ts > timeParam` — 30 → `1months`, 90 → `3months`, 180 → `6months`, 365 → `12months` |
| BR-S03.T03-07 | A parsed decklist card keeps the set code upper-cased and the number as printed; a card with no `.card-count`, a non-numeric count or no `.card-name` is dropped, not defaulted to 1. | the per-card guards in `parseDecklist` | `limitless-web.spec.ts > decklist card guards` — a `.decklist-card` without `.card-count` is absent from the result |
| BR-S03.T03-08 | `parsePlacing` reads a leading integer only: `"1st" → 1`, `"T16" → null`, `"" → null`. A null placing is stored, never replaced by a sentinel. | `parsePlacing()` | `limitless-web.spec.ts > parsePlacing` |

## Data operations

No database operation happens here. The table below lists the external requests and the parse steps that turn HTML into the structures [S03.T05](T05-decks-sync-and-prune.md) writes.

| Operation | Request / input | Params | Cache | Politeness & idempotency | Result |
|---|---|---|---|---|---|
| list page fetch | `GET /decks/lists` | `format=standard`, `time=timeParam(days)`, `type`, `show=100`, `page=N` | not cached — the listing changes as events are added | ≥ 0.6 s spacing; 4 retries; browser-like UA | HTML or `null` |
| decklist fetch | `GET /decks/list/<id>` | — | `limitless/web/list_<id>.html`, permanent | published lists are immutable; re-read from disk forever unless `force` | HTML or `null` |
| `parseLists` | list-page HTML | — | — | pure; same HTML → same output | `{ tournaments: WebTournament[], rows: WebListRow[] }` |
| ↳ heading step | `th.sub-heading > a[href^="/tournaments/"]` | — | — | id, date (`28th August 2026`), name after ` - `, division suffix split (BR-S03.T03-01) | one `WebTournament` per heading, deduped by id |
| ↳ row step | `td` cells of the following rows | — | — | placing (cell 0), icons `img.pokemon[alt]` (cell 1), list link + player + archetype (cell 2) | one `WebListRow` per list link |
| `parseDecklist` | decklist-page HTML | — | — | pure; `.decklist-column` → heading category → `.decklist-card` | `{ pokemon, trainer, energy }` of `{ count, set, number, name }` |
| `estimatePlayers` | event type + division | — | — | pure lookup, RN-06 | integer player estimate |

## Interfaces

**`packages/etl/src/limitless-web.ts`**

```ts
export const EVENT_TYPES = ["worlds", "international", "regional", "special", "national"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type Division = "sr" | "jr" | null;          // Masters is null (a "(MA)" suffix is stripped)

export const PLAYERS_BY_TYPE: Record<EventType, number> =
  { worlds: 1500, international: 1500, regional: 800, special: 300, national: 400 };
export const PLAYERS_BY_DIVISION: Record<"sr" | "jr", number> = { sr: 0.15, jr: 0.10 };
export const PLAYERS_UNKNOWN_TYPE = 200;
export function estimatePlayers(type: string, division: Division): number;   // RN-06, Math.floor

export interface WebTournament {
  tournamentId: string;        // "515" | "515-sr" | "515-jr" — the sync prefixes it with "web:"
  baseId: string;              // "515" — used for the public URL
  name: string;                // "World Championships 2026 (JR)"
  date: string | null;         // ISO-8601 UTC date, midnight
  division: Division;
  eventType: EventType | null; // filled by the caller from the request parameters
}
export interface WebListRow {
  listId: string;              // "28752"
  tournamentId: string;        // foreign key into `tournaments` above
  placing: number | null;
  player: string;              // "Andrew Hedrick" ("by " stripped)
  archetype: string;           // "Dragapult Dusknoir"
  icons: string[];             // ["dragapult", "dusknoir"]
}
export function parseLists(html: string): { tournaments: WebTournament[]; rows: WebListRow[] };

export interface DeckLine { count: number; set: string; number: string; name: string }
export function parseDecklist(html: string): { pokemon: DeckLine[]; trainer: DeckLine[]; energy: DeckLine[] };

export function parseEventDate(text: string): string | null;  // "28th August 2026" → "2026-08-28T00:00:00Z"
export function parsePlacing(text: string): number | null;    // "1st" → 1, "T16" → null
export function timeParam(days: number): "1months" | "3months" | "6months" | "12months";

export interface WebClientOptions {
  baseUrl?: string;        // default "https://limitlesstcg.com"
  minIntervalMs?: number;  // default 600
  retries?: number;        // default 4  (delay 2000 ms, doubling)
  timeoutMs?: number;      // default 30_000
  cacheDir?: string;       // default `${RAW_CACHE_DIR}/limitless/web`
  userAgent?: string;      // default "Mozilla/5.0 (compatible) pokesearch2/<version> (+local deck browser)"
}
export interface WebClient {
  readonly requests: number;
  get(path: string, params?: Record<string, string | number>): Promise<string | null>;
  listsPage(p: { format: string; days: number; type: EventType; page: number }): Promise<string | null>;
  decklistHtml(listId: string, opts?: { force?: boolean }): Promise<string | null>;
  close(): void;
}
export function createWebClient(opts?: WebClientOptions): WebClient;
```

**Selectors (the parse contract).** Listing: `table tr`; heading `th.sub-heading a[href^="/tournaments/"]`, id from `/tournaments/(\d+)`, date from `/(\d+)(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/` parsed as UTC midnight, name = text after the first ` - `, division from `/\s*\((MA|SR|JR)\)\s*$/i`. Data row: `td` cells, cell 0 → placing, cell 1 → `img.pokemon[alt]` icons, cell 2 → `a[href^="/decks/list/"]` for the list id, `span.annotation` for the player (leading `by ` stripped) and the remaining link text for the archetype. Detail page: `.decklist-column` → `.decklist-column-heading` matching `/^(Pokémon|Pokemon|Trainer|Energy)\b/i` → `.decklist-card` with `.card-count`, `.card-name`, `data-set` (upper-cased), `data-number`.

**Fixtures.** `packages/etl/test/fixtures/limitless-web/lists.html` (two events, one of them with a `(JR)` division block, four list rows) and `decklist.html` (three columns, including a `MEE` basic-energy line so [S03.T04](T04-deck-resolver.md) has a real override case); plus `lists-mangled.html` with the classes renamed.

## Implementation steps

1. Choose the HTML parser (`cheerio` or `linkedom`) and record the choice in the package README; both are pure JS and need no native build.
2. Write `parseEventDate`, `parsePlacing`, `timeParam` and `estimatePlayers` with their unit tests — they are the cheap half of the module.
3. Save the three HTML fixtures from real pages (one listing page per relevant shape, one decklist page), trimmed to the needed rows.
4. Implement `parseLists` heading handling, including the division split and the dedupe of tournaments by id.
5. Implement `parseLists` row handling with the three guards of BR-S03.T03-03; assert the four-row fixture expectations.
6. Implement `parseDecklist` with per-card guards; assert three sections and the `MEE` line.
7. Implement `WebClient`: spacing, retries, 404 → `null`, permanent decklist cache, request counter.
8. Add the mangled fixture test proving empty results plus warnings, and a `pnpm etl limitless-web:probe --type regional --days 30` diagnostic that prints row counts without writing anything.

## Edge cases and error handling

- **A heading whose name carries the division suffix `(SR)`** → the tournament id becomes `515-sr`, the name `World Championships 2026 (SR)`, and the estimated player count is `1500 × 0.15 = 225`. Masters rows under `(MA)` keep id `515` and the full estimate.
- **A `th.sub-heading` without a `/tournaments/<n>` link** (a promotional banner row) → the current tournament is cleared, so the data rows that follow are dropped instead of being attributed to the previous event.
- **A placing rendered as `T16`** (tied bracket) → `parsePlacing` returns `null`; the deck is stored with `placing = NULL` and simply receives no placing bonus in the quality weight of [S03.T06](T06-meta-queries.md).
- **A decklist page whose `.decklist-column` classes were renamed** → `parseDecklist` returns three empty arrays; the caller logs "decklist `<id>` empty/unreadable" and skips that list, leaving the rest of the page usable.
- **A `.decklist-card` with `data-set` absent** → the line keeps an empty set code and a name; it still parses, and [S03.T04](T04-deck-resolver.md) resolves it by name (`match_kind = 'name'`) instead of being dropped.
- **A listing page returning fewer than 100 rows** with `show=100` → it is the last page for that event type; the caller stops paginating rather than requesting page N+1.
- **A row whose date fails to parse** → `date = null`; the sync drops it from the window because it cannot be compared with the cutoff, and logs the raw heading text once so the date format change is visible.
- **An HTTP 404 on a decklist id that appeared in the listing** (a list withdrawn between the two requests) → `decklistHtml` returns `null` after a single request; the row is skipped and nothing is cached.
- **The same list id appearing under two event types** (a Special Event also indexed as Regional) → the permanent HTML cache serves the second occurrence from disk, and the deck id `web:<list id>:<player>` makes the duplicate an upsert rather than a second deck.

## Acceptance / verification

- [ ] `pnpm --filter @pokesearch/etl test -t "limitless-web"` green.
- [ ] `limitless-web.spec.ts > parseLists`: the listing fixture yields 4 rows across 3 tournaments; row 0 is `listId 28752`, `placing 1`, `player "Andrew Hedrick"`, `archetype "Dragapult"`, `icons ["dragapult"]`, tournament `515` dated `2026-08-28`; the `(JR)` row is tournament `515-jr` (BR-S03.T03-01, -03).
- [ ] `limitless-web.spec.ts > parseDecklist`: the detail fixture yields three sections whose first Pokémon line is `{ count: 4, set: "TWM", number: "128", name: "Dreepy" }` and whose energy line carries set `MEE` (BR-S03.T03-07).
- [ ] `limitless-web.spec.ts > mangled fixture`: both parsers return empty structures and do not throw; exactly one warning per call (BR-S03.T03-02).
- [ ] `limitless-web.spec.ts > estimated players`: worlds/jr → 150, regional/null → 800, unknown/null → 200 (RN-06).
- [ ] `limitless-web.spec.ts > decklist cache`: calling `decklistHtml("28752")` twice issues one request and the second read comes from `RAW_CACHE_DIR/limitless/web/list_28752.html` (BR-S03.T03-04).
- [ ] `limitless-web.spec.ts > retries and 404`: three 503s then a 200 returns the body; a 404 returns `null` after one request (BR-S03.T03-05).
- [ ] `limitless-web.spec.ts > timeParam` and `> parsePlacing` cover 30/90/180/365 and `1st`/`T16`/empty (BR-S03.T03-06, -08).
- [ ] `pnpm etl limitless-web:probe --type regional --days 30` prints a non-zero row count against the live site and writes only into `RAW_CACHE_DIR`.

## Risks and open questions

- **Risk — the site's HTML changes and the scraper silently returns nothing.** Mitigation: BR-S03.T03-02 makes it degrade instead of corrupt, and [S03.T05](T05-decks-sync-and-prune.md) records the web row count in `etl_runs`, so [S08.T02](../08-operations-and-extensions/T02-etl-monitoring-and-alerts.md) can alert on "0 web decks while the window has official events". The probe command shortens the diagnosis to one run.
- **Risk — scraping etiquette.** 0.6 s spacing, a permanent cache for immutable pages and a self-identifying User-Agent keep the load close to a human browsing. If the site publishes a `robots.txt` rule or an API for these pages, this module is the single place to change; record the finding in the decision log.
- **Risk — the RN-06 estimates drift from reality** (a Regional with 1,500 players). They only scale the quality weight; a wrong estimate reorders decklists slightly and never changes legality or eligibility. Mitigation: the constants are exported and testable, and [S03.T06](T06-meta-queries.md) uses `log10(players)`, which compresses the error.
- **Question — should `national` events be scraped by default?** The legacy `EVENT_TYPES` includes them but the legacy database ended with only 3 web tournaments overall, so the answer is unobservable from the data. Decided by the user when the first full `--web` sync runs; the type list is a parameter.
- **DEPENDENCY-PROPOSAL:** `archetypeIdFor(name, icons)` — reusing an existing API archetype by lower-cased name and otherwise minting `web:<slug>` — is listed in this subtask's original summary but needs the `archetypes` table, which comes from [S03.T01](T01-tournaments-schema-migration.md). It is therefore specified and tested in [S03.T05](T05-decks-sync-and-prune.md) (which already depends on both), and this subtask stays database-free. If the reviewer prefers it here instead, S03.T03 must gain `Depends on: S03.T01`.

## References

- `pokemon/src/pokesearch/etl/limitless_web.py` — verified: `EVENT_TYPES`, `PLAYERS_BY_TYPE = {worlds: 1500, international: 1500, regional: 800, special: 300, national: 400}`, `PLAYERS_BY_DIVISION = {sr: 0.15, jr: 0.1}` with fallback 200, `_time_param` thresholds 31/92/183, `parse_date`/`parse_placing`, `parse_lists` selectors and the `_DIVISION_RE` split (L84–93), `parse_decklist` selectors, `WebClient(min_interval=0.6)` with 4 retries and delay 2.0 doubling, `decklist_html` permanent cache at `web/list_<id>.html`, and the tournament record written by `sync` (`source='limitless_web'`, `is_online=0`, `has_decklists=1`, `complete=1`, `organizer="Play! Pokémon (<type>)"`, `platform='TCG'`).
- `pokemon/tests/test_limitless_web.py` — verified: the exact fixture expectations reproduced in the acceptance checks, including `rows[3]["tournament_id"] == "515-jr"`, `parse_placing("T16") is None`, and both mangled-input assertions.
- `pokemon/src/pokesearch/config.py` L55 — verified: `LIMITLESS_WEB_BASE = "https://limitlesstcg.com"`.
- External: `https://limitlesstcg.com/decks/lists` (listing) and `https://limitlesstcg.com/decks/list/<id>` (detail).
- [Business rules traceability](../../project/05-business-rules-traceability.md) RN-06; [Legacy reference map](../../project/06-legacy-reference-map.md) row for `etl/limitless_web.py`.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
