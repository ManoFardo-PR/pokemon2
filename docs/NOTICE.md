# NOTICE — external sources, terms and attribution

This is a register of facts, not legal advice. It records what PokéSearch 2 takes from each external source, how it takes it, what upstream declares, and what is still unknown. The project's own licence is open item O-1 in the [decision log](project/02-decision-log.md): until the user decides it, the repository is **licence pending — all rights reserved**.

Register last verified: 2026-09-25. Tools: gh 2.83.2, pnpm 12.0.0, node v24.13.0, curl.

Nothing from any source is redistributed by this repository: no card image, dataset copy or scraped HTML is committed. Fetched documents live in `$RAW_CACHE_DIR`, outside the repository (BR-S01.T09-02). `scripts/notice-lint.mjs` checks this file in `pnpm check`.

## Sources

Each section uses the fixed field set from [S01.T09](stages/01-foundation/T09-licensing-and-notice.md) (Interfaces). `status:` is `verified <date>, <evidence>`, `unverified — <reason>` or `n/a — <reason>`. A value may continue on lines indented by two spaces. A `status:` change is recorded in the amendment log at the end, never by deleting history.

### pokemon-tcg-data — PokemonTCG/pokemon-tcg-data
- url: https://github.com/PokemonTCG/pokemon-tcg-data
- provides: canonical English card and set data (cards/, sets/, decks/ JSON), including the images.pokemontcg.io image URLs
- enters-as: download + ETag cache (raw.githubusercontent.com into $RAW_CACHE_DIR)
- used-by: packages/etl (S02.T02)
- licence: undeclared
- status: unverified — `gh api repos/PokemonTCG/pokemon-tcg-data/license` returned HTTP 404 on 2026-09-25; repository metadata has license: null; the root (HEAD 39a26a1) has no LICENSE or COPYING file and the README has no licence clause
- question: The repository declares no licence, so no permission is granted by default. Does the user accept fetching it into a local cache that is never redistributed, for a personal, non-public site?
- owner: user
- attribution: none offered upstream; the site footer credits "pokemon-tcg-data" as a data source
- restrictions: no bulk mirror, no redistribution; conditional requests with ETag; no key required
- if-refused: TCGdex alone as the card source (S02.T03), losing the fields only pokemon-tcg-data carries

### tcgdex — TCGdex API
- url: https://api.tcgdex.net/v2/en
- provides: card data, prices (tcgplayer, cardmarket), legality, variants; card images from https://assets.tcgdex.net
- enters-as: API + file cache; images by hotlink
- used-by: packages/etl (S02.T03, S02.T07); apps/web CardImage fallback chain (S01.T08)
- licence: MIT (tcgdex/cards-database)
- status: verified 2026-09-25, `gh api repos/tcgdex/cards-database/license` → MIT, https://github.com/tcgdex/cards-database/blob/master/LICENSE, blob sha c67ded0; https://api.tcgdex.net/robots.txt is "Disallow: /" with the comment "this is for Crawlers only / You can logically use robots to use the API"
- question: The MIT grant covers the cards-database repository. No separate API terms page was found or read; S02.T03 confirms none exists before the first fetch.
- owner: user
- attribution: MIT License — Copyright (c) 2021 TCGdex
- restrictions: no key required; no bulk mirror of assets.tcgdex.net images; request spacing set in S02.T03
- if-refused: pokemon-tcg-data alone for card data; prices are dropped (S02.T07)

### limitless-api — Limitless Tournament Platform API
- url: https://play.limitlesstcg.com/api
- provides: online tournaments, standings, decklists
- enters-as: API + file cache
- used-by: packages/etl (S03.T02)
- licence: terms of use, see url
- status: unverified — https://play.limitlesstcg.com/robots.txt returned HTTP 404 on 2026-09-25; the terms (https://play.limitlesstcg.com/tos) and the API reference (https://docs.limitlesstcg.com/developer.html) were not read
- question: What do https://play.limitlesstcg.com/tos and https://docs.limitlesstcg.com/developer.html say about automated access, local storage and display of tournament data?
- owner: user
- attribution: the site footer credits "Limitless" as a data source; any wording the terms require is added here
- restrictions: optional LIMITLESS_API_KEY only raises the rate limit (no paid key); the legacy client spaced requests ≥ 0.4 s and honoured Retry-After on 429/5xx
- if-refused: the meta pages use limitless-web alone, or the tournament meta (S03) is dropped

### limitless-web — Limitless TCG website
- url: https://limitlesstcg.com
- provides: in-person tournament results and decklists not exposed by the API
- enters-as: polite scraping
- used-by: packages/etl (S03.T03)
- licence: terms of use, see url
- status: unverified — https://limitlesstcg.com/robots.txt on 2026-09-25 is "User-agent: * / Disallow:" (nothing disallowed); the site notice (https://limitlesstcg.com/legal) was not read
- question: Does https://limitlesstcg.com/legal (or the linked terms) permit automated retrieval of tournament and decklist pages?
- owner: user
- attribution: the site footer credits "Limitless" as a data source
- restrictions: the legacy scraper spaced requests ≥ 0.6 s with exponential back-off on 429/5xx and an identifying User-Agent; no bulk mirror of HTML
- if-refused: in-person events come from limitless-api only, and the meta window may shrink (S03.T03)

### limitless-cdn — Limitless image CDN
- url: https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci
- provides: fallback card image for deck lines that do not resolve to a known card
- enters-as: hotlink
- used-by: apps/web CardImage fallback chain (S01.T08, S03)
- licence: terms of use, see url
- status: unverified — no terms specific to the CDN were found; the Limitless site terms were not read
- question: May the site hotlink card images from the Limitless CDN as a fallback?
- owner: user
- attribution: none required (images display the card owner's own marks); covered by the trademarks notice
- restrictions: only URLs are stored; images are never downloaded or mirrored
- if-refused: drop this step of the fallback chain and show the inline placeholder

### images-pokemontcg-io — pokemontcg.io card images
- url: https://images.pokemontcg.io
- provides: card images, by URL, as listed in pokemon-tcg-data
- enters-as: hotlink
- used-by: apps/web CardImage (S01.T08, S02.T13)
- licence: undeclared
- status: unverified — no terms page for images.pokemontcg.io was found or read on 2026-09-25
- question: Does hotlinking images.pokemontcg.io from a local, personal site need permission from the pokemontcg.io operators?
- owner: user
- attribution: none required (images display the card owner's own marks); covered by the trademarks notice
- restrictions: only URLs are stored; images load from the source CDN in the user's browser; the legacy IMAGE_MODE=local mirror is not carried over
- if-refused: TCGdex assets first, then the Limitless CDN, then the placeholder

### wjsutton — wjsutton/pokemon_tcg_stockmarket
- url: https://github.com/wjsutton/pokemon_tcg_stockmarket
- provides: optional price-history seed: 4 CSVs (modern/vintage, Feb and Mar 2025). Not taken yet (S02.T07 leaves it to the user).
- enters-as: download + ETag cache
- used-by: none yet; a possible S02 extension after a migration and the user's decision
- licence: MIT
- status: verified 2026-09-25, `gh api repos/wjsutton/pokemon_tcg_stockmarket/license` → MIT, https://github.com/wjsutton/pokemon_tcg_stockmarket/blob/main/LICENSE, blob sha 618dd99, HEAD 7c6dd32. This corrects the legacy "não declarada".
- question: n/a
- owner: user
- attribution: MIT License
  Copyright (c) 2021 Will Sutton
  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
- restrictions: the notice above travels with any stored copy of the seed rows; no key required
- if-refused: no seed; price history starts at the first TCGdex snapshot

### twinleafgg — the-epsd/twinleafgg
- url: https://github.com/the-epsd/twinleafgg
- provides: card-effect translations and a differential oracle for the engine (S08.T05)
- enters-as: download + ETag cache
- used-by: engine oracle import (S08.T05)
- licence: MIT
- status: verified 2026-09-25, https://github.com/the-epsd/twinleafgg/blob/main/ptcg-server/package.json declares "license": "MIT" (blob sha fd077f2, HEAD 49e2614); README "## License / MIT"; `gh api repos/the-epsd/twinleafgg/license` returned HTTP 404 (no root LICENSE file)
- question: No LICENSE file exists and package.json has an empty "author", so there is no upstream copyright line to reproduce verbatim (BR-S01.T09-05). The README says it is "Based on: https://github.com/keeshii/ryuu-play" (MIT, Copyright (c) 2020 keeshii). Is the attribution below sufficient, or should the user ask the maintainers for a LICENSE file before S08.T05?
- owner: user
- attribution: twinleaf.gg — https://github.com/the-epsd/twinleafgg — MIT (declared in ptcg-server/package.json)
  Based on ryuu-play — The MIT License (MIT) — Copyright (c) 2020 keeshii <keeshii@ptcg.eu>
- restrictions: attribution is copied into the provenance of every imported translation or oracle result (S08.T05)
- if-refused: the engine is validated against the rulebook and the user's own tests only

### ptcg-engine — gemelom/ptcg-engine
- url: https://github.com/gemelom/ptcg-engine
- provides: the legacy project's Python engine dependency, consulted as documentation only. Nothing from this repository is ported.
- enters-as: consulted as documentation
- used-by: none; the S04 engine is written from scratch (D-003)
- licence: MIT
- status: verified 2026-09-25, `gh api repos/gemelom/ptcg-engine/license` → MIT, https://github.com/gemelom/ptcg-engine/blob/main/LICENSE, blob sha 707ee9d, HEAD 92c3cc4 (the legacy pin)
- question: n/a
- owner: user
- attribution: none required (no code or text is copied)
- restrictions: consult, do not port; a review of engine/ must find no derived file (BR-S01.T09-04)
- if-refused: n/a — nothing from it is used

### rulebook — Pokémon TCG official rulebook
- url: https://www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/rulebook/par_rulebook_en.pdf
- provides: normative rule text, cited by section in rule scenarios and tests
- enters-as: consulted as documentation
- used-by: rule scenarios (S04, S05); the user's imported tests
- licence: terms of use, see url
- status: unverified — the URL comes from the legacy code comments; the pokemon.com terms of use were not read
- question: May short quotations from the rulebook be stored in rule scenarios, or must scenarios cite section numbers only?
- owner: user
- attribution: rule text © The Pokémon Company International; scenarios cite the rulebook section they rely on
- restrictions: the PDF is never committed or redistributed; quotations are kept short
- if-refused: scenarios cite section numbers without quoting

### trademarks — Pokémon trademarks
- url: n/a
- provides: nothing is fetched; this section holds the non-affiliation notice the site shows
- enters-as: consulted as documentation
- used-by: apps/web footer (S01.T08, strings.footer.disclaimer)
- licence: n/a
- status: n/a — trademark notice, nothing fetched
- question: n/a
- owner: user
- attribution: Não afiliado à Nintendo / The Pokémon Company.
  Not affiliated with, endorsed or sponsored by Nintendo, Creatures Inc., GAME FREAK inc. or The Pokémon Company. Pokémon and card names are trademarks of their respective owners.
- restrictions: no logo or trade dress is reproduced; the first attribution line must equal strings.footer.disclaimer exactly
- if-refused: n/a

### dependencies — npm (and later Cargo) dependency tree
- url: https://pnpm.io/cli/licenses
- provides: third-party libraries installed by pnpm for the workspace
- enters-as: download (pnpm install from the npm registry)
- used-by: every workspace package
- licence: mixed, see status
- status: verified 2026-09-25, `pnpm licenses list --json` (pnpm 12.0.0): MIT 372, Apache-2.0 17, ISC 16, BSD-2-Clause 8, BSD-3-Clause 6, MPL-2.0 2, MIT-0 1, CC-BY-4.0 1, Python-2.0 1, Unlicense 1. Cargo is pending until S01.T06 passes.
- question: MPL-2.0 (lightningcss@1.33.0 and lightningcss-win32-x64-msvc@1.33.0, pulled in by vite@5.4.21) is file-level weak copyleft. It is a build-time devDependency, never modified or shipped. Does the user accept it?
- owner: user
- attribution: none required while nothing is distributed; any published bundle ships its dependencies' licence notices
- restrictions: regenerate on every dependency change and flag anything non-permissive here
- if-refused: pin a Vite configuration without lightningcss, or replace the package

## Verification procedure

1. GitHub repositories: `gh api repos/<owner>/<repo>/license --jq '{spdx: .license.spdx_id, url: .html_url, sha: .sha}'`. `NOASSERTION` or a 404 means "undeclared"; then list `gh api repos/<owner>/<repo>/contents` and read README/COPYING/package.json, recording what was found.
2. APIs and sites: `curl -s <origin>/robots.txt`, then read the terms page; record the URL, the retrieval date, the clause on automated access and the request spacing used.
3. Images: only URLs are stored; images are hotlinked at render time through the CardImage fallback chain (S01.T08).
4. Dependencies: `pnpm licenses list --json` (and `cargo` equivalent after S01.T06); flag anything non-permissive.
5. Anything not checkable now stays `unverified` with the exact command or URL in `question:`.

Checked by `pnpm notice:lint` (part of `pnpm check`).

## Own work products

The user's rules spreadsheet, card recipes and the verified legacy tests imported as scenarios (D-003) belong to the user. They are not external sources and need no attribution; this line records that they were considered.

## Amendment log

| Date | Section | Change |
|---|---|---|
| 2026-09-25 | all | register created; gh, robots.txt and pnpm checks run as recorded in each status |
| 2026-09-25 | wjsutton | legacy "licence not declared" corrected: upstream now declares MIT |
