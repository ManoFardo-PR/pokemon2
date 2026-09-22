# Vision and scope

| Field | Value |
|---|---|
| Doc | project/01 |
| Status | DRAFT — to be enriched in the elaboration pass |
| Inputs | Legacy `ESPECIFICACAO.md` (§1 objectives, §1.3 metrics, §1.4 out of scope); user statements of 2026-09-21/22 |
| Outputs | The goal, success metrics and boundaries every stage README and subtask file assumes |

## What the product does for its user

PokéSearch 2 is a local web application for one Pokémon TCG player. It lets the user:

1. **Search** cards by attributes or by a plain pt-BR/English phrase and **learn** everything about a printing (official English text, legality, prices, other printings).
2. **Build** a 60-card Standard deck — from scratch, from a pasted TCG Live list, or from a tournament list — and know immediately whether it is legal and what it costs.
3. **Compare** the list with what the same archetype actually plays in recent tournaments (inclusion rates, missing/unusual cards).
4. **Test** the list by letting bots play it against a weighted field of current meta decks, with a reproducible score and a confidence interval.
5. **Improve** the list: the system proposes one-card swaps and only recommends those whose gain survives confirmation on fresh seeds and a holdout measurement.

Everything the system knows is stored in a database (cards, prices, tournaments, decks, the card-rules base, bots, benchmark suites, measurements, jobs, games). Nothing lives only in code files or spreadsheets once imported.

## End goal (inherited from the legacy project, unchanged)

> Given a real 60-card Standard list, say with a reproducible measurement how much it wins against the current meta and which card swaps make it win more.

Search, ETL, prices and tournament decks are the **database that supports the simulator**, not the end product — but they are the first things the user sees, so they ship first (stages S02–S03).

## Supporting objectives

| # | Objective | Why the end goal needs it | Stages |
|---|---|---|---|
| O1 | Complete card base (1999–2026) with official English text, attribute and natural-language search | Official text is the reference every rule is audited against; prices bound the optimizer | S02 |
| O2 | Real meta: Standard tournament decklists of the last 90 days, by archetype | Defines opponents, weights, the candidate pool and the coverage denominator | S03 |
| O3 | Engine faithful to card text, with rules as data | A score measured with a wrong card measures another card | S04, S05 |
| O4 | Competent, honest, measured bots | A badly piloted deck gets the pilot's score, not the list's | S06 |
| O5 | Optimizer that accepts only gains outside the noise | The deliverable to the user | S07 |

## Success metrics

| Metric | Definition | Legacy value (2026-09-21) | Target for this rewrite |
|---|---|---|---|
| **Exact coverage** | share of meta copies whose every effect text is fully coded with codes of status `exact`/`builtin` (parts without text count as exact) | 94.7 % | ≥ 90 % by the end of S05, then ≥ 95 % |
| **Proven coverage** | part of the exact share whose codes have passing evidence (scenarios, oracle) on the current engine build | 72.6 % | ≥ 60 % by the end of S05, then rising |
| **Score on a frozen suite** | Σ opponent weight × win rate, 95 % CI, ties = 0.5 | 57.3 % (CI 55.5–59.0) for the user's list on suite v5 | suite v6 baseline established in S05; bots improve it in S06 |
| **Mirror skill** | bot under test vs frozen bot, same list both sides | 50.6 % (v4); no valid data on v5 | CI excluding 50 % for each new bot |
| **Throughput** | complete games per second on this machine | 22–40 | ≥ 5,000 with heuristic bots (measured in S04.T18) |
| **Optimizer honesty** | reported gain measured on holdout seeds never used for selection | not done (screening gains vanished at confirmation) | every accepted swap has a holdout number |

The two coverage numbers are always shown together (business rule RN-70).

## Out of scope (for now)

- An LLM deciding plays live (a suite measurement is ~465k decisions); LLMs only classify, propose or review, never on the critical path (RN-60).
- Paid card APIs (pokemontcg.io/Scrydex); a local image mirror (images are hotlinked); pt-BR card text (no public source).
- Formats other than Standard inside the engine.
- Authentication and multiple users; hosting. The API binds to `127.0.0.1`. A hosted Postgres (Supabase-like) is a planned later step (S08.T03), not a current requirement.
- Reusing the legacy SQLite file or the third-party `ptcg-engine` code (decisions D-002, D-003).

## Constraints that shaped the plan

- Windows 11 machine, 22 threads, 39 GB RAM, Node 24, pnpm, Docker and `gcloud` present; **no Rust, no MSVC compiler, no Windows SDK** → Rust via the GNU target with a go/no-go gate (S01.T06).
- Both project folders live in OneDrive → database, raw cache and Cargo target default to `%LOCALAPPDATA%\pokemon2`.
- Single user, offline-capable after the first ETL run (raw cache), everything reproducible (seeds, fingerprints, snapshot hashes).

## Related docs

[Decision log](02-decision-log.md) · [Architecture](03-architecture-overview.md) · [Business rules traceability](05-business-rules-traceability.md) · [Docs index](../README.md)
