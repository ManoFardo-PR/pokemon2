# Glossary

| Field | Value |
|---|---|
| Doc | project/07 |
| Status | DRAFT — add a term whenever a subtask file introduces one |
| Inputs | Terms used across the stage and subtask files; legacy pt-BR terms with their English equivalents |
| Outputs | One meaning per term; subtask files use these words without redefining them |

## Game and data

- **Standard** — the current rotation format; legality comes from the TCGdex flag plus the set of legal regulation marks (a config value updated at rotation).
- **Regulation mark** — the letter printed on modern cards (`G`, `H`, `I`, …) that defines rotation legality.
- **Printing** — one physical card (`cards.id`, e.g. `sv4pt5-54`). Several printings of the same name may have identical or different text.
- **Archetype** — Limitless' deck classification (slug like `dragapult-dusknoir`); derived for scraped events by name.
- **Meta window** — Standard tournaments of the last 90 days with ≥ 16 players, at most 400 (RN-03); the sample behind shares, partners, coverage denominators and opponent weights.
- **Decklist (TCG Live format)** — text with `Pokémon: N` sections and lines `4 Dragapult ex TWM 130`; the interchange format everywhere.
- **Card definition (`CardDef`)** — the compact, validated description of a printing sent to the engine, derived from the card tables plus `card_overrides`.
- **Raw cache** — the on-disk copy of every source document (`RAW_CACHE_DIR`), making full reloads possible offline.
- **ETL run** — one execution of an ingestion job, logged in `etl_runs`.

## Card rules base

- **Effect text** — one distinct wording of an ability, attack text, trainer text or special-energy text; keyed by a hash of (kind, name, normalized text). Reprints share it.
- **Part** — a place on a printing that carries an effect text (ability *i*, attack *j*, trainer, energy, rule box). Parts without text are "exact by construction".
- **Sentence** — a row of the split of an effect text; the unit the user classifies in the spreadsheet.
- **Code (rule code)** — the user's "código por frase": a named, parametrized unit of behaviour (`DRAW_N`, `DMG_PLUS_IF_TARGET_TAG`), with a sentence pattern, a params schema, an executable body and a status.
- **Params** — the per-card values bound to a code's placeholders (`{N: 3}`), stored in `text_codes.params_json` — the user's "parâmetros por carta".
- **Text codes** — the ordered list of `(code, params)` that gives an effect text its meaning; composed into one program.
- **Effect IR** — the closed JSON vocabulary (values, selectors, filters, ops, attack fields, modifiers, triggers) in which code bodies are written and which the engine interprets.
- **Program** — the compiled IR of one effect text (or one code, in tests).
- **Builtin** — a named native procedure in the engine used as a code body when the IR cannot express an effect yet; still a code with status `builtin`.
- **Modifier (hook)** — a continuous effect contributed by an in-play card (tool, stadium, passive ability, special energy) to a named hook such as `damage_out`, `hp_max`, `bench_size`, `energy_provision`.
- **Trigger** — a program run when an event happens (`enter_bench`, `damaged_by_attack`, `knocked_out`, `between_turns`, …).
- **Code status** — `draft` (being written), `exact` (claims fidelity), `approx` (documented approximation), `builtin`, `unimplemented`.
- **Evidence** — an insert-only record that a code behaved as expected on a given engine build: kinds `scenario`, `twinleaf_diff`, `attr_only`, `builtin`.
- **Scenario** — a JSON test: setup, steps (actions, prompt answers, checkup), expectations; cites its source (legacy test or rulebook page).
- **Exact coverage / proven coverage** — share of meta copies whose texts are fully coded with `exact`/`builtin` codes / whose codes also have passing evidence on the current build. Always shown together.
- **Rules snapshot** — SHA-256 over all active code bodies and text codes; recorded with every measurement.
- **Engine build** — the hash printed by `ptcg-cli --version`; evidence and measurements are tied to it.
- **Card overrides** — corrections of source attribute values (never names) with a reason.

## Engine

- **Zone** — deck, hand, discard, prizes, active, bench slot, attached, lost zone, stadium.
- **Slot** — a Pokémon in play with its evolution stack, energies, tools, damage counters, conditions, turn effects and markers.
- **Damage counter vs damage** — attack damage goes through the pipeline (Weakness/Resistance, ±N); counters placed by effects do not, but respect `prevent_effects` / `counters_blocked` ("damage is not an effect").
- **Damage pipeline** — the ordered stages from printed damage to applied counters (S04.T07).
- **Special Conditions** — Asleep, Paralyzed, Confused (mutually exclusive), Poisoned, Burned.
- **Pokémon Checkup** — the between-turns phase where conditions tick, effects expire and knockouts are resolved.
- **Prompt** — a structured question to a player: `actor` (who answers), `owner` (whose cards), `purpose`, `kind`, candidates; answered in O(n).
- **Turn effect** — a `(source, kind, value, until)` entry on a slot or player (e.g. `no_attack`, `damage_minus`).
- **Marker** — a named flag on a slot/player/game for once-per-turn/game tracking.
- **Prize value** — how many prizes a knockout awards (1/2/3), modifiable by hooks.
- **Stall** — no change in the material signature for 12 turns → tie (RN-20).
- **Fingerprint** — SHA-256 over per-game outcomes in game order; identical across worker counts and runs.

## Bots and measurement

- **Bot** — a policy answering actions and prompts from a **player view**; kinds: random, heuristic, planner, rollout, ISMCTS.
- **Player view** — what the acting player legitimately knows (RN-30); hidden zones as counts; own deck+prizes as one multiset until the first own-deck search.
- **Determinization** — sampling a concrete hidden state consistent with the view; used by rollout and ISMCTS bots.
- **Frozen bot** — a registered bot whose source hash may not change; suite opponents are frozen.
- **Suite ("régua" in the legacy docs)** — a frozen ruler: evaluated deck version, opponents with weights and lists, `seed0`, opponent bot, rules snapshot, engine build.
- **Measurement** — a run of a bot on a suite: weighted score + CI and mirror + CI, with commit and hashes.
- **Score** — Σ opponent weight × win rate (ties = 0.5), 95 % CI by the delta method.
- **Mirror** — same list on both sides; separates bot skill from deck quality.
- **Job / pairing** — one engine invocation / one (deck A, deck B, bots, seed block) inside it.
- **Paired seeds** — candidate and reference play the same (opponent, seed) pairs so seed noise cancels.
- **Screening / confirmation / holdout** — cheap paired triage; sequential re-test on fresh seeds with multiplicity control; final measurement on seeds never used for selection (the reported number).
- **Worker** — the Node process that runs jobs, the scheduler and optimizer loops.

[Docs index](../README.md) · [Data model](04-data-model-overview.md) · [Conventions](08-conventions.md)
