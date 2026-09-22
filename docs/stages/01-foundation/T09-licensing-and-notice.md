# S01.T09 — Licensing and NOTICE

| Field | Value |
|---|---|
| Stage | S01 — Foundation |
| Status | TODO |
| Order in stage | 9 / 10 |
| Depends on | [S01.T01](T01-monorepo-skeleton.md) |
| Unblocks | — |
| Parallel with | [S01.T02](T02-sqlite-database-client.md), [S01.T05](T05-shared-contracts-package.md), [S01.T06](T06-rust-toolchain-gate.md) |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `file` repository root — from [S01.T01](T01-monorepo-skeleton.md)
- `doc` ESPECIFICACAO.md §2.1 and §6.2 (source licences: pokemon-tcg-data and wjsutton undeclared in the legacy project; twinleafgg MIT; ptcg-engine MIT)
- `external` `gh` 2.83 installed on this machine — the tool used to read a repository's declared licence without a browser
- `doc` `project/02-decision-log.md` open item O-1 (project `LICENSE`) — this subtask supplies its inputs and does not close it

## Outputs (proposed)
- `file` `docs/NOTICE.md` — per source: what is used, how (download/cache/hotlink/scrape), licence status, attribution text — with the fixed field set under Interfaces and one `status:` line per source
- `decision` open item 'project LICENSE' added to the decision log (user's choice) — already registered as O-1; this subtask attaches the recorded findings and a recommendation so the user can decide

## Initial objective
Anyone reading the repository knows exactly which external data and code the project uses, under which terms, and what remains unverified — before any of it is downloaded by the new ETL.

## Context

The new ETL (D-003) rebuilds ingestion from the public sources: GitHub raw files, two HTTP APIs, one rate-limited scrape and hotlinked images. The legacy project consumed the same sources without writing the terms down — `ESPECIFICACAO.md` §2.1 records the licence column as "**Não declarada neste projeto**" for `PokemonTCG/pokemon-tcg-data` and `wjsutton/pokemon_tcg_stockmarket`, and §6.2 states that the licence of both "não está registrada no projeto; o projeto não tem `LICENSE`". Two of the four repositories were pinned down (`gemelom/ptcg-engine` MIT, `the-epsd/twinleafgg` MIT, declared in its `ptcg-server/package.json`); the rest were assumed.

Writing this down before the first fetch is cheap; doing it after 20,000 cached documents exist is a negotiation with sunk cost. It also makes an honest distinction possible: "verified, MIT" for one source and "unverified — the repository declares no licence" for another, so the user decides what to do about the second instead of silence implying permission.

The output is not legal advice. It is a register of facts — what is fetched, from where, how often, what upstream declares, what remains unknown — plus the attribution strings the site and the repository must display. The project's own licence (O-1) stays the user's decision; this file's job is to make it an informed one.

## Scope

- **In scope.** `docs/NOTICE.md` with one section per source and a fixed field set; the verification procedure and its commands; the dependency-licence summary for the npm workspace (and Cargo once [S01.T06](T06-rust-toolchain-gate.md) passes); the explicit statement that nothing from `ptcg-engine` is ported; the attribution strings the web footer shows ([S01.T08](T08-web-skeleton.md)); a "licence pending" line in the root README; the findings appended to O-1.
- **Out of scope.** Choosing the project licence (O-1, the user decides); legal interpretation of database rights or the Pokémon trademarks; fetching anything ([S02.T02](../02-card-data-and-search/T02-fetch-pokemon-tcg-data.md), [S02.T03](../02-card-data-and-search/T03-fetch-tcgdex.md), [S03.T02](../03-tournament-meta-and-deck-builder/T02-limitless-api-client.md), [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md) own that); the twinleafgg oracle import ([S08.T05](../08-operations-and-extensions/T05-twinleaf-oracle-import.md)), which must respect the attribution recorded here.

## Business rules

The traceability doc assigns no `RN-nn` here. RN-60's spirit ("everything works without external keys") appears as the observation that no source in the register requires a paid key.

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| BR-S01.T09-01 | Every external source the project fetches has a section in `docs/NOTICE.md` with a `status:` line, written **before** the first fetch of that source. | `scripts/notice-lint.mjs` in `pnpm check`, comparing NOTICE section ids with the ETL source registry (`packages/etl/src/sources.ts`, created in [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md)); until then it validates the field set | `pnpm check` fails when a registry source has no NOTICE section |
| BR-S01.T09-02 | Nothing from a source is redistributed by this repository: no card image, no bulk copy of a dataset, no scraped HTML is committed; the raw cache lives in `$RAW_CACHE_DIR`. | `.gitignore` plus `RAW_CACHE_DIR` outside the repo ([S01.T01](T01-monorepo-skeleton.md)) | `git ls-files | grep -E '\.(png|jpe?g|webp)$'` returns nothing |
| BR-S01.T09-03 | A source whose `status:` is `unverified` names the exact open question and who decides it; fetching it requires the user's recorded consent. | the NOTICE field set; an `acknowledged` flag in the ETL source registry read by the CLI in [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) | review: every `unverified` section has a `question:` and an `owner:` |
| BR-S01.T09-04 | No code from `gemelom/ptcg-engine` is ported, and NOTICE states it explicitly. | D-003 and the "consult, do not port" rule; the engine is written from scratch in [S04](../04-game-engine-core/README.md) | NOTICE §ptcg-engine contains the statement; review of `engine/` finds no derived file |
| BR-S01.T09-05 | Attribution required by a licence is reproduced verbatim where the derived artifact is used — in particular the MIT notice of `the-epsd/twinleafgg` wherever its translations or oracle comparisons are stored or displayed. | NOTICE §twinleafgg holds the exact text; [S08.T05](../08-operations-and-extensions/T05-twinleaf-oracle-import.md) copies it into the import's provenance | the string matches the upstream `LICENSE` byte for byte; reviewed in S08.T05 |
| BR-S01.T09-06 | Until O-1 is decided, the root README states "licence pending — all rights reserved", so a missing `LICENSE` is not read as permissive. | the README line added here | `grep -i "licen" README.md` shows the line; removed only by the commit adding the chosen `LICENSE` |
| BR-S01.T09-07 | The site footer's attributions name exactly the sources the register lists as in use. | `apps/web/src/strings.ts` footer strings ([S01.T08](T08-web-skeleton.md)) reviewed against NOTICE | manual check in the acceptance list; a mismatch is a docs-review finding |

## Data operations

No table, no endpoint: this subtask produces documents and a register.

| Artifact | Operation | Actor | When | Constraints |
|---|---|---|---|---|
| `docs/NOTICE.md` | create | developer | here | one section per source, fixed field set, every field filled (`n/a` is a value, blank is not) |
| `docs/NOTICE.md` | amend | developer | on a new source, changed terms, or a resolved `unverified` | append the new state with its date; never delete the history of a status change |
| licence facts per GitHub repo | read (`gh api`) | developer | step 3 | read-only; record SPDX id, licence URL and the observed sha |
| terms / `robots.txt` per API and site | read | developer | step 4 | record URL, retrieval date and the clause governing automated access |
| dependency licence summary | generate (`pnpm licenses list --json`; Cargo equivalent after [S01.T06](T06-rust-toolchain-gate.md)) | developer | step 6 | stored in NOTICE §Dependencies with the generation date and tool version |
| root `README.md` | amend | developer | step 7 | the "licence pending" line (BR-S01.T09-06) |
| open item O-1 | amend | developer | step 8 | attach findings and a recommendation; the decision stays the user's |

## Interfaces

**`docs/NOTICE.md` — one section per source, with this exact field set:**

```markdown
### <id> — <Name>
- url: <canonical URL>
- provides: <what the project takes from it>
- enters-as: <download + ETag cache | API + file cache | polite scraping | hotlink | consulted as documentation>
- used-by: <package / subtask ids>
- licence: <SPDX id | "undeclared" | "terms of use, see url">
- status: verified <YYYY-MM-DD, source URL, commit/sha> | unverified | n/a
- question: <only when unverified: the exact thing that is unknown>
- owner: <who decides — user, unless stated>
- attribution: <the exact text to display, or "none required">
- restrictions: <rate limit used, no bulk mirror, no redistribution, key requirements>
- if-refused: <what the project does if the terms forbid this use>
```

**Sections to write** (facts from `ESPECIFICACAO.md` §2.1/§2.2 and `config.py`, both verified; each `status:` starts `unverified` until steps 3–4 run): 1. `pokemon-tcg-data` — canonical English card data via raw GitHub downloads with an ETag cache; legacy licence column "não declarada neste projeto". 2. `tcgdex` — `api.tcgdex.net/v2/en` plus `assets.tcgdex.net`, prices, images, legality, variants, no key. 3. `limitless-api` — `play.limitlesstcg.com/api`, tournaments, standings, decklists; optional `LIMITLESS_API_KEY` that only raises the rate limit. 4. `limitless-web` — `limitlesstcg.com` HTML scraping for in-person events, with the spacing actually used. 5. `limitless-cdn` — `limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci`, fallback image for unresolved deck lines. 6. `images-pokemontcg-io` — hotlinked card images whose URLs come from pokemon-tcg-data; never mirrored. 7. `wjsutton` — optional price seed (4 CSVs, modern/vintage, Feb and Mar 2025), licence not declared in the legacy project. 8. `twinleafgg` — MIT declared in its `ptcg-server/package.json`; translation source and oracle; attribution required. 9. `ptcg-engine` — MIT, **not used**: nothing is ported. 10. `rulebook` — the official rulebook PDF, cited normatively in rule scenarios, not redistributed. 11. `trademarks` — the non-affiliation statement matching the site footer. 12. `dependencies` — the generated npm (and later Cargo) licence summary.

**Verification procedure** (each step records its output in the section's `status:`):

1. GitHub repositories: `gh api repos/<owner>/<repo>/license --jq '{spdx: .license.spdx_id, url: .html_url, sha: .sha}'`. `NOASSERTION` or a 404 means "undeclared"; then check `README`/`COPYING` via `gh api repos/<owner>/<repo>/contents` and record what was actually found, not what was hoped.
2. APIs and sites: retrieve the terms page and `robots.txt`; record the URL, the retrieval date and the clause covering automated access, plus the request spacing the project will use.
3. Images: record that only URLs are stored and images are hotlinked at render time with a fallback chain ([S01.T08](T08-web-skeleton.md)); the legacy `IMAGE_MODE=local` mirror is not carried over.
4. Dependencies: `pnpm licenses list --json`, and the Cargo equivalent after the Rust gate; flag anything non-permissive for the user.
5. Anything not checkable now (no network, a login-walled terms page) stays `unverified` with the exact command or URL in `question:`.

## Implementation steps

1. Create `docs/NOTICE.md` with the twelve section stubs and the field set, every field present, `status: unverified` everywhere.
2. Fill the facts already verified from the legacy specification (what each source provides, how it enters, who uses it, the two MIT declarations, the two undeclared ones).
3. Run the `gh api` licence check for the four repositories; write result, URL and sha into each `status:`.
4. Retrieve and summarise the terms and `robots.txt` for TCGdex and Limitless; record spacing and key policy.
5. Write the attribution strings and check them against the web footer strings ([S01.T08](T08-web-skeleton.md)).
6. Generate the dependency licence summary into §Dependencies with its date; flag non-permissive entries.
7. Add the "licence pending — all rights reserved" line to the root README.
8. Append findings and a recommendation to O-1 in the decision log; leave the decision open.
9. Write `scripts/notice-lint.mjs` (field-set validation now, source-registry cross-check once [S02.T01](../02-card-data-and-search/T01-etl-cli-and-raw-cache.md) exists) and add it to `pnpm check`.

## Edge cases and error handling

- **A repository declares no licence at all** (expected for `pokemon-tcg-data` and `wjsutton`) → `licence: undeclared`, `status: unverified`, and `question:` says plainly that no permission is granted by default. `if-refused:` names the alternative (for card data: TCGdex alone, at the cost of some fields). The user decides whether to fetch; the register does not decide for them.
- **This subtask runs without network access** → steps 3, 4 and 6 cannot complete; those sections stay `unverified` with the exact commands in `question:`, and the subtask is `DONE` only for what it could produce. Never invent a licence to close a row.
- **Terms change after the check** → each `verified` carries its retrieval date; the register is re-checked whenever a fetcher subtask is touched, and amendments are appended, not overwritten.
- **`robots.txt` disallows the scraped paths** → record it and stop: [S03.T03](../03-tournament-meta-and-deck-builder/T03-limitless-web-scraper.md) then depends on the API alone and the meta window may shrink. The register states the consequence before the code is written.
- **A dependency carries a copyleft licence** → flagged in §Dependencies for the user with the alternative or the removal noted; nothing is silently accepted.
- **twinleafgg's licence differs between subfolders** → record the exact file consulted (`ptcg-server/package.json` is what the legacy project cited) and the root `LICENSE` if present; a disagreement becomes the `question:`.
- **Someone adds a source without a NOTICE section** → `pnpm check` fails through `notice-lint`, naming the missing id.

## Acceptance / verification

- [ ] `docs/NOTICE.md` has one section per source with a 'status: verified/unverified' line — twelve sections, every field present and non-empty.
- [ ] Every `unverified` section has a `question:` naming the exact unknown and an `owner:` (BR-S01.T09-03).
- [ ] `gh api repos/PokemonTCG/pokemon-tcg-data/license` (and the same for `wjsutton/pokemon_tcg_stockmarket`, `the-epsd/twinleafgg`, `gemelom/ptcg-engine`) was run and its output quoted in the matching `status:`, or the section names the command still to run (BR-S01.T09-01).
- [ ] `git ls-files | grep -E '\.(png|jpe?g|webp)$'` returns nothing and no cached source documents are tracked (BR-S01.T09-02).
- [ ] NOTICE §ptcg-engine states that nothing is ported, and a review of `engine/` finds no file derived from it (BR-S01.T09-04).
- [ ] The attribution strings in NOTICE match the footer strings in `apps/web/src/strings.ts` (BR-S01.T09-05, -07).
- [ ] `grep -i "licen" README.md` shows the "licence pending — all rights reserved" line (BR-S01.T09-06).
- [ ] `pnpm check` runs `notice-lint` and fails on a section with a missing `status:` field.
- [ ] O-1 carries the findings and a recommendation and is still open (the user has not been pre-empted).

## Risks and open questions

- **Risk — the project depends on a source that declares no licence.** Mitigation: the register states it, `if-refused:` names the fallback per source, and no fetch of an `unverified` source happens without recorded consent. Card *facts* and a compiled *database* of them are not the same question; that distinction is the user's to resolve, possibly with advice this project cannot give.
- **Risk — the register rots** as sources evolve. Mitigation: dated `status:` lines, `notice-lint` in `pnpm check`, and a re-check whenever a fetcher subtask is edited.
- **Risk — image hotlinking is read as redistribution.** Mitigation: NOTICE records that only URLs are stored, that images load from the source CDN in the user's browser, and that the legacy local-mirror mode is not carried over.
- **Question — O-1, the project `LICENSE`.** The user decides after reading the register. Recommendation: keep the repository private and unlicensed until the data-source questions are settled; if published, a permissive licence on the *code* plus an explicit "data belongs to its sources" note is the shape to aim for.
- **Question — does the register also cover the user's own work products** (the rules spreadsheet, the recipes, the 136 verified tests imported as scenarios)? They are the user's, and D-003 lists them as imported data. Recommendation: one short section saying so, to confirm with the user.

## References

- `pokemon/ESPECIFICACAO.md` §2.1 — verified: the repository table with "**Não declarada neste projeto**" for `pokemon-tcg-data` and `wjsutton/pokemon_tcg_stockmarket`, MIT for `gemelom/ptcg-engine` (pinned at `92c3cc4`) and MIT for `the-epsd/twinleafgg` ("declarada em `ptcg-server/package.json`"), plus "o próprio projeto vive em `github.com/ManoFardo-PR/pokemon`".
- `pokemon/ESPECIFICACAO.md` §2.2 — verified: TCGdex (`https://api.tcgdex.net/v2/en`, no key), Limitless API (`https://play.limitlesstcg.com/api`, optional key "só aumenta o limite"), `limitlesstcg.com` scraping, the Limitless CDN fallback image path, `images.pokemontcg.io` hotlinking, and the official rulebook PDF cited by the rule tests.
- `pokemon/ESPECIFICACAO.md` §6.2 — verified: "Licença de `pokemon-tcg-data` e `pokemon_tcg_stockmarket` não está registrada no projeto; o projeto não tem `LICENSE`."
- `pokemon/src/pokesearch/config.py` — verified: the base URLs `PTCG_RAW_BASE`, `TCGDEX_API_BASE`, `TCGDEX_ASSETS_BASE`, `WJSUTTON_RAW_BASE`, `LIMITLESS_API_BASE`, `LIMITLESS_WEB_BASE`, `LIMITLESS_IMG_BASE` that the register must cover.
- [Decision log](../../project/02-decision-log.md) D-003 and open item O-1; [Vision and scope](../../project/01-vision-and-scope.md) "Out of scope" (no paid card APIs, no local image mirror, images hotlinked).

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
