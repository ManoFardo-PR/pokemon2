# S02.T10 — Natural-language query parser (pt/en)

| Field | Value |
|---|---|
| Stage | S02 — Card data and search |
| Status | TODO |
| Order in stage | 10 / 14 |
| Depends on | [S01.T05](../01-foundation/T05-shared-contracts-package.md), [S02.T09](T09-search-query-model-and-sql.md) |
| Unblocks | [S02.T11](T11-api-cards-search-sets.md) |
| Parallel with | — |
| Gate | no |
| Owner / Updated | — / — |

## Inputs (required)
- `module` `@pokesearch/shared` package (pure, browser-safe) — from [S01.T05](../01-foundation/T05-shared-contracts-package.md)
- `contract` `SearchQuery` — from [S02.T09](T09-search-query-model-and-sql.md)

## Outputs (proposed)
- `module` `@pokesearch/shared/nl` — `parseNaturalLanguage(phrase) → { query: Partial<SearchQuery>, chips: string[], residual: string }`, `translatePhrase(pt) → en` with the synonyms table, `STOPWORDS` — consumed by [S02.T11](T11-api-cards-search-sets.md)
- `file` `synonyms.ts` (~75 entries pt→en stems: cura→heal, descarta→discard, compra→draw, banco→bench, moeda→coin, cara/coroa→heads/tails, zona perdida→lost zone, …) and `types.ts` (pt+en names of the 11 energy types)
- `file` test cases: the 17 legacy phrases plus new ones, as table-driven tests

## Initial objective
A pt-BR or English phrase becomes structured filters plus a residual full-text query, deterministically and without any LLM, and the user can see exactly how it was interpreted through chips.

## Summary
- Normalize (strip diacritics, lower) then extract-and-remove patterns in this fixed order: year (`todos os anos`, `desde/from <year>`, `até/until <year>`, bare year) → sort (`mais caros`→price_desc, `mais baratos`→price_asc, `maior hp`, `mais recentes`, `por nome`) → price (needs a currency token; bare `baratos` ≤ 1 USD, `caros` ≥ 20) → HP (`entre A e B`, `mais de N hp`, `N hp`) → attack damage (`dano de mais de N`, `N+`) → energy cost (`custo … N`, number words) → retreat (`sem custo de recuo`, `recuo ≤ N`) → weakness/resistance (before types) → evolves-from → name (`chamado X`) → artist → pokédex → regulation mark → legality (standard/expanded) → rarity (11 patterns, most specific first) → supertype & trainer/energy subtypes → stage → Pokémon subtypes (vmax, vstar, ex, v, mega, tera, …) → types → ability (`sem habilidade`, `habilidade que <clause>`) → attack (`ataque chamado`, `ataque que <clause>`) → residual → stopwords → synonyms → `query.text`.
- Chips are pt-BR labels ("interpretei como"); residual clauses (ability/attack text) are translated pt→en before becoming filters because card text is English.
- Regex portability notes: anchored `^…$` instead of fullmatch, `/i` flags, named groups `(?<name>)`, replace-with-callback for extract-and-remove.

## Acceptance / verification
- [ ] All table-driven cases pass, including 'pokémon de fogo com mais de 200 hp desde 2023', 'itens que curam', 'estádios standard', 'water 120+', 'cartas mais caras que US$ 20'.
- [ ] Parser is pure and runs in the browser bundle (used later for instant chips).

## Notes for the elaboration pass
- Legacy reference: `pokemon/src/pokesearch/search/nl_parser.py` (383 lines, order matters) and `synonyms.py` (102 lines); tests `tests/test_nl_parser.py`.
- Optional LLM interpretation (legacy `nl_llm.py`) is deferred to [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md)-style optional work; RN-60 keeps the rules parser as the always-available path.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
