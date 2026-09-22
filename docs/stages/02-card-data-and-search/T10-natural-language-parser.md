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
- `file` `pokemon/src/pokesearch/search/nl_parser.py`, `synonyms.py` and `pokemon/tests/test_nl_parser.py` — the extraction order, the vocabulary and the 17 test phrases; read-only reference

## Outputs (proposed)
- `module` `@pokesearch/shared/nl` — `parseNaturalLanguage(phrase) → { query: Partial<SearchQuery>, chips: string[], residual: string }`, `translatePhrase(pt) → en` with the synonyms table, `STOPWORDS` — consumed by [S02.T11](T11-api-cards-search-sets.md)
- `file` `synonyms.ts` (~75 entries pt→en stems: cura→heal, descarta→discard, compra→draw, banco→bench, moeda→coin, cara/coroa→heads/tails, zona perdida→lost zone, …) and `types.ts` (pt+en names of the 11 energy types)
- `file` test cases: the 17 legacy phrases plus new ones, as table-driven tests

## Initial objective
A pt-BR or English phrase becomes structured filters plus a residual full-text query, deterministically and without any LLM, and the user can see exactly how it was interpreted through chips.

## Context

The product's front door is one text box. "água com mais de 200 de HP que cura" has to become `types: ['Water']`, `hp_min: 200`, `text: 'heal'`, `supertype: 'Pokémon'` — and the user has to *see* that, because a search that silently guesses wrong is worse than one that finds nothing.

RN-60 is the rule that shapes the design: **no LLM on the critical path**. This parser is deterministic, pure, dependency-free and runs in the browser bundle, so the interpretation chips can appear as the user types, with no key, no network and no cost. The legacy also shipped an optional LLM interpretation (`nl_llm.py`, surfaced as a "usar IA para interpretar" checkbox); it is deliberately **not** part of this subtask, and if it ever returns it does so as an alternative `source` in the API response ([S02.T11](T11-api-cards-search-sets.md) already carries `interpretation.source`), never as the default.

The algorithm is extract-and-remove over a normalized string: recognize a pattern, write the field, append a chip, and replace the matched span with a space. What survives every pass is the residual, which becomes `query.text` after stopword removal and pt→en translation — because card text is English and the FTS index holds English ([S02.T08](T08-full-text-search.md)).

**Order is the whole design.** The legacy `nl_parser.py` is 383 lines whose correctness lives in the sequence of its ~60 `_sub` calls, and three orderings are load-bearing: years are consumed before any other number, so "de 2023" never becomes an HP filter; weakness/resistance run before types, so "fraqueza a sombrio" does not also set `types: ['Darkness']`; rarity patterns run most-specific-first, so "special illustration rare" is not eaten by "rare". Reordering the file is a behaviour change, which is why the order is a business rule here and a table in Interfaces.

Two legacy quirks are corrected rather than copied. `parse("normal")` sets `types: ['Colorless']` because `normal` is in the type vocabulary — kept, since it is the TCG meaning. But `_sub(r"\bv\b", …)` fires on a bare "v" anywhere, so "pokemon v union" could set both `V-UNION` and `V`; the new implementation consumes the longer alternatives first within the subtype block and asserts it with a test.

## Scope

- **In scope.** `packages/shared/src/nl/`: `parse.ts` (the ordered extractors), `synonyms.ts`, `types.ts`, `stopwords.ts`, `chips.ts` (the pt-BR label strings, which live in one module so [S02.T12](T12-web-search-page.md) can reuse them), the table-driven tests, and the guarantee that the module imports nothing from `node:`.
- **Out of scope.** Executing the query ([S02.T09](T09-search-query-model-and-sql.md)); exposing it over HTTP and merging it with explicit URL filters ([S02.T11](T11-api-cards-search-sets.md)); rendering the chips ([S02.T12](T12-web-search-page.md)); any LLM interpretation (RN-60 keeps this path always available; an optional LLM variant would belong with [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md)-style optional work); pt-BR *card text* — no public source has it ([Vision and scope](../../project/01-vision-and-scope.md)).

## Business rules

| ID | Rule | Enforcement point | Verification |
|---|---|---|---|
| RN-60 | **Kept.** No LLM is on the critical path: `@pokesearch/shared/nl` has no network call, no API key and no optional dependency, and the search box works identically with every key unset. | the module's dependency list (none) and the `apps/api` route that calls it unconditionally ([S02.T11](T11-api-cards-search-sets.md)) | `nl.spec.ts > module imports nothing from node: or the network` (import graph assertion); `pnpm test` passes with every `*_API_KEY` unset |
| BR-S02.T10-01 | `parseNaturalLanguage` is pure and deterministic: the same phrase always yields the same query, chips and residual, and it mutates nothing. | no module-level mutable state; the query object is built locally | `nl.spec.ts > same phrase twice deep-equals`; `> parsing does not mutate the input` |
| BR-S02.T10-02 | Extraction runs in the fixed order of `EXTRACTORS` and each match removes its span from the working text, so a token is consumed by at most one extractor. | the `EXTRACTORS` array, iterated once in order | `nl.spec.ts > 'marca G de 2023'` → `regulation_marks: ['G']` **and** `release_from/to` 2023, with no HP or dex filter (BR order: year before numbers) |
| BR-S02.T10-03 | Weakness and resistance are extracted before energy types: `"pokémon psíquico com fraqueza a sombrio"` sets `weakness_type: 'Darkness'` and `types: ['Psychic']`, never `types: ['Psychic','Darkness']`. | position of the weakness/resistance extractors before the type extractor | `nl.spec.ts > weakness before type` |
| BR-S02.T10-04 | Rarity patterns are tried most specific first, so "special illustration rare" never degrades to "Rare". | the ordered `RARITIES` list (11 entries, specific → generic) | `nl.spec.ts > rarity specificity`: `'special illustration rare'` → `['Special Illustration Rare']` only |
| BR-S02.T10-05 | A price filter requires a currency token or an explicit price adjective; a bare number never becomes a price. | the currency alternation in the price regexes; `baratos`→`≤ 1`, `caros`→`≥ 20` as separate extractors | `nl.spec.ts > '5 dólares' sets price_max_usd, '5' does not` |
| BR-S02.T10-06 | Every filter the parser writes produces exactly one chip, and every chip names the filter it came from; `chips.length` equals the number of interpreted facts. | each extractor pushes one chip in the same callback that writes the field | `nl.spec.ts > chips match activeFilters` for all 17 ported phrases (count and field coverage) |
| BR-S02.T10-07 | Residual clauses that become `text`, `attack_text` or `ability_text` are translated pt→en with the synonyms table before they are written, because card text is English. | `translatePhrase()` applied at the three write sites | `nl.spec.ts > 'habilidade que compra cartas'` → `ability_text: 'draw'`; `> 'ataque que descarta energia'` → `attack_text: 'discard energy'` |
| BR-S02.T10-08 | A phrase with no recognized pattern and no residual leaves the query at its defaults: `text` stays `null` and `chips` is empty. | the `if (residual)` guard before writing `text` | `nl.spec.ts > empty phrases`: `''`, `'   '`, `'cartas'` all give `text === null` and `chips.length === 0` |
| BR-S02.T10-09 | The parser writes only fields declared by `SearchQuery`, and its output parses against `SearchQuerySchema` without error for every test phrase. | the return type `Partial<SearchQuery>`; the spec parses each result | `nl.spec.ts > every parsed phrase satisfies SearchQuerySchema` |
| BR-S02.T10-10 | `translatePhrase` replaces multi-word entries before single words, and leaves unknown words untouched. | the two-pass implementation (phrases sorted by length desc, then per word) | `synonyms.spec.ts > 'zona perdida' → 'lost zone'`; `> 'charizard' → 'charizard'` |
| BR-S02.T10-11 | The module is browser-safe: no `node:` import, no `process` access, no dependency outside `@pokesearch/shared`. | package boundaries + the eslint `no-restricted-imports` rule of the shared package | `pnpm build --filter web` includes it; `nl.spec.ts > import graph is clean` |

## Data operations

The parser performs no database read or write. What it produces are `SearchQuery` fields, which [S02.T09](T09-search-query-model-and-sql.md) turns into SQL — the chain below is the contract between the two.

| Recognized phrase (pt / en) | Field written | SQL predicate it eventually produces |
|---|---|---|
| `desde 2023`, `todos os anos` | `release_from` / `null` | `c.release_date >= ?` / predicate omitted |
| `até 2020`, `em 2019` | `release_to`, `release_from` | `c.release_date <= ?`, `>= ?` |
| `mais caras`, `maior hp`, `por nome` | `sort` | the `ORDER BY` map entry |
| `até US$ 20`, `baratos` | `price_max_usd` / `price_min_usd` | `m.market_usd <= ?` / `>= ?` |
| `mais de 200 hp`, `hp entre 250 e 330` | `hp_min`, `hp_max` | `c.hp >= ?`, `c.hp <= ?` |
| `dano de mais de 100`, `120+` | `attack_damage_min` | `EXISTS (… a.damage_num >= ?)` |
| `custo até 2`, `uma energia` | `attack_cost_max` / `_min` | `EXISTS (… a.converted_cost <= ?)` |
| `sem custo de recuo`, `recuo ≤ 1` | `retreat_max` | `COALESCE(c.retreat_cost,0) <= ? AND c.supertype = 'Pokémon'` |
| `fraqueza a sombrio` | `weakness_type` | `EXISTS (… lower(w.type) = ?)` |
| `evolui de eevee` | `evolves_from` | `lower(c.evolves_from) LIKE ?` |
| `chamado pikachu` | `name` | `c.name_norm LIKE ?` |
| `artista Mitsuhiro Arita` | `artist` | `lower(c.artist) LIKE ?` |
| `pokédex #25` | `national_dex` | `EXISTS (… json_each(c.national_dex_json) …)` |
| `marca G` | `regulation_marks` | `upper(c.regulation_mark) IN (?)` |
| `standard`, `expanded` | `legal_standard`, `legal_expanded` | `COALESCE(c.tcgdex_legal_<f>, c.legal_<f> = 'Legal') = ?` |
| `ilustração rara` | `rarity` | `(lower(c.rarity) LIKE ? OR …)` |
| `itens`, `estádios`, `suportes`, `energia especial` | `supertype`, `subtypes` | `c.supertype = ?` + `EXISTS (… json_each(c.subtypes_json) …)` |
| `estágio 2`, `básico` | `stage` | `c.stage = ?` |
| `vmax`, `ex`, `tera` | `subtypes` (+ `supertype`) | `EXISTS (… json_each(c.subtypes_json) …)` |
| `de fogo` | `types` (+ `supertype`) | `EXISTS (… json_each(c.types_json) …)` |
| `sem habilidade`, `com habilidade` | `has_ability` | `NOT EXISTS (…)` / `EXISTS (…)` |
| `habilidade que <cláusula>` | `ability_text` (translated), `has_ability` | `EXISTS (… b.text_norm LIKE ? AND …)` |
| `ataque chamado X`, `ataque que <cláusula>` | `attack_name`, `attack_text` (translated) | `EXISTS (… a.name_norm LIKE ? …)` |
| anything left over | `text` (translated) | `cards_fts MATCH '"tok"* …'` + `bm25` rank |

## Interfaces

**`packages/shared/src/nl/index.ts`**

```ts
export interface ParsedQuery { query: Partial<SearchQuery>; chips: string[]; residual: string; raw: string; }
export function parseNaturalLanguage(phrase: string): ParsedQuery;
export function translatePhrase(normalizedPt: string): string;
export function translateWord(word: string): string | undefined;
export const STOPWORDS: ReadonlySet<string>;
export const TYPE_WORDS: Readonly<Record<string, EnergyType>>;   // 39 pt+en forms -> 11 canonical types
export const RARITIES: readonly { re: RegExp; value: string }[]; // 11, specific first
export const EXTRACTORS: readonly Extractor[];                   // the ordered list below
```

`parseNaturalLanguage` normalizes first: `norm()` from [S02.T06](T06-load-cards.md) (NFD → strip `\p{Mn}` → lower → trim), commas padded with spaces, whitespace collapsed, and the string wrapped in single spaces so `\b`-style boundaries are uniform.

**Shared regex fragments** (JavaScript flavour, `i` flag, anchored per-extractor with `\b`):

```
CMP_MIN = (?:mais de|mais que|acima de|maior que|maior ou igual a|pelo menos|no minimo|a partir de|minimo
           |more than|over|above|at least|greater than|min(?:imum)?|>=|>)
CMP_MAX = (?:menos de|menos que|abaixo de|menor que|menor ou igual a|no maximo|maximo|ate
           |less than|under|below|at most|max(?:imum)?|up to|<=|<)
HPW     = (?:de\s+)?(?:hp|ps|pv|pontos de vida|vida)
TYPE    = (agua|water|aquatico|fogo|fire|planta|grama|grass|eletrico|eletrica|raio|lightning|electric|…)   // longest first
```

**Ordered extraction list.** Each row: what it matches (regex sketch), what it writes, the chip it appends. Chip text is pt-BR — it is UI copy, per D-006.

| # | Extractor | Regex sketch | Writes | Chip |
|---|---|---|---|---|
| 1 | all years | `\b(?:todos os anos\|qualquer ano\|sem filtro de ano\|all years\|any year\|all time)\b` | `release_from = null` | `todos os anos` |
| 2 | year from | `\b(?:desde\|a partir de\|from\|since)\s+((?:19\|20)\d\d)\b` | `release_from = '<y>-01-01'` | `lançado desde <y>` |
| 3 | year to | `\b(?:ate\|until\|to\|before)\s+((?:19\|20)\d\d)\b` | `release_to = '<y>-12-31'` | `lançado até <y>` |
| 4 | bare year | `\b(?:em\|in\|de\|of)?\s*((?:19\|20)\d\d)\b(?!\s*(?:hp\|ps\|dano\|damage\|\+))` | both bounds of `<y>` | `lançado em <y>` |
| 5 | sort (5 patterns) | `mais caros?\|most expensive`, `mais baratos?\|cheapest`, `maior hp\|highest hp`, `mais recentes?\|newest`, `por nome\|by name` | `sort` | `ordenado: mais caro` · `ordenado: mais barato` · `ordenado: maior HP` · `ordenado: mais recente` · `ordenado: nome` |
| 6 | price max | `\b<CMP_MAX>\s*(?:us\$\|\$\|usd)?\s*(\d+(?:[.,]\d+)?)\s*(?:dolares\|dollars\|usd\|\$\|reais\|r\$)` and a second form requiring a leading currency symbol | `price_max_usd` | `preço ≤ US$ <n>` |
| 7 | price min | `\b<CMP_MIN>\s*(?:us\$\|\$\|usd)?\s*(\d+(?:[.,]\d+)?)\s*(?:dolares\|dollars\|usd\|\$\|reais\|r\$)` | `price_min_usd` | `preço ≥ US$ <n>` |
| 8 | cheap / expensive | `\b(?:baratos?\|cheap)\b` · `\b(?:caros?\|expensive\|valiosos?\|valuable)\b` | `price_max_usd = 1` · `price_min_usd = 20` | `preço ≤ US$ 1` · `preço ≥ US$ 20` |
| 9 | HP range | `\b(?:hp\|ps\|vida)\s*(?:entre\|between)\s*(\d+)\s*(?:e\|and\|a\|-)\s*(\d+)` and the mirrored form ending in `<HPW>` | `hp_min`, `hp_max` | `HP entre <a> e <b>` |
| 10 | HP min / max | `\b<CMP_MIN>\s*(\d+)\s*<HPW>\b` and `\b(?:hp\|ps\|vida)\s*<CMP_MIN>\s*(\d+)` (and the `CMP_MAX` mirrors) | `hp_min` / `hp_max` | `HP ≥ <n>` · `HP ≤ <n>` |
| 11 | HP equals | `\b(\d+)\s*<HPW>\b`, `\b(?:hp\|ps)\s*(?:de\|=\|igual a)?\s*(\d+)\b` | `hp_min = hp_max` | `HP = <n>` |
| 12 | damage max | `\b(?:dano\|damage)\s*(?:de\|of)?\s*<CMP_MAX>\s*(\d+)` and its mirror | `attack_damage_max` | `ataque com dano ≤ <n>` |
| 13 | damage min | `\b(?:dano\|damage)\s*(?:de\|of)?\s*<CMP_MIN>?\s*(\d+)\s*\+?`, the `causa\|deals\|hits` form, `\b(\d+)\s*\+?\s*(?:de\s+)?(?:dano\|damage)\b`, and finally `\b(\d{2,3})\+` | `attack_damage_min` | `ataque com dano ≥ <n>` |
| 14 | attack cost | `\b(?:custo\|cost)\s*(?:de\s+)?(?:energia\s+\|energy\s+)?<CMP_MAX\|CMP_MIN>\s*(\d+)`, `<CMP>\s*(\d+)\s*(?:energias?\|energy)`, `(?:custo\|cost)\s*(?:de\|of)?\s*(\d+)` | `attack_cost_max` / `_min` | `ataque com custo ≤ <n>` · `ataque com custo ≥ <n>` |
| 15 | cost in words | `\b(?:de\|com\|por\|for\|with)?\s*(uma\|um\|one\|duas\|dois\|two\|tres\|three\|\d)\s*(?:energias?\|energy\|energies)\b` | `attack_cost_max` | `ataque com custo ≤ <n>` |
| 16 | free retreat | `\b(?:sem (?:custo de )?recuo\|recuo (?:zero\|gratis\|livre\|0)\|free retreat\|no retreat(?: cost)?)\b` | `retreat_max = 0` | `recuo grátis` |
| 17 | retreat ≤ n | `\b(?:recuo\|retreat)\s*(?:cost\s*\|custo\s*)?(?:de\s+)?<CMP_MAX>?\s*(\d)\b` | `retreat_max` | `recuo ≤ <n>` |
| 18 | weakness | `\b(?:fraqueza\|fraco\|fraca\|weak\|weakness)\s*(?:a\|ao\|contra\|to\|against\|de)?\s*(?:tipo\s+\|type\s+)?<TYPE>\b` | `weakness_type` | `fraqueza a <T>` |
| 19 | resistance | same with `(?:resistencia\|resistente\|resistant\|resistance)` | `resistance_type` | `resistência a <T>` |
| 20 | evolves from | `\b(?:evolui de\|evolucao de\|evolves from\|evolution of)\s+([a-z\-']+)` | `evolves_from` | `evolui de <Name>` |
| 21 | name | `\b(?:chamad[oa]s?\|de nome\|com nome\|nome\|named\|called\|name)\s+([a-z0-9\-']+)` | `name` | `nome contém '<x>'` |
| 22 | artist | `\b(?:artista\|ilustrad[oa]r?\|artist\|illustrator\|illustrated by\|drawn by)\s*:?\s+([a-z][a-z .'\-]+?)(?=\s*(?:,\|\be\b\|\band\b\|\bcom\b\|\bque\b\|$))` | `artist` | `artista '<x>'` |
| 23 | pokédex | `\b(?:pokedex\|dex\|national dex)\s*#?\s*(\d+)` and `#\s*(\d{1,4})\b` | `national_dex[]` | `Pokédex #<n>` |
| 24 | regulation mark | `\b(?:marca(?: de regulamento)?\|regulation(?: mark)?\|reg\.?\|selo)\s+([a-j])\b` | `regulation_marks[]` | `marca de regulamento <X>` |
| 25 | standard / expanded | `\b(?:legal (?:no \|em \|in \|for )?)?(?:standard\|padrao\|rotacao atual)\b` · `(?:expanded\|expandido)` | `legal_standard` / `legal_expanded` | `legal no Standard` · `legal no Expanded` |
| 26 | rarity ×11 | specific → generic: `special illustration rare\|sir`, `illustration rare\|ir`, `ultra rare`, `hyper rare`, `double rare`, `secret`, `rare holo\|holo`, `promo`, `uncommon\|incomum`, `common\|comum`, `rare\|raro` | `rarity[]` | `raridade contém '<V>'` |
| 27 | energy / trainer subtypes | `energias? especia(?:l\|is)`, `energias? basicas?`, `^energias?`, `suportes?\|supporters?`, `estadios?\|stadiums?`, `ferramentas?\|tools?`, `itens\|items?`, `treinador(?:es)?\|trainers?` | `supertype` (+ `subtypes`) | `Energia Especial` · `Energia Básica` · `Energia` · `Treinador: Supporter` · `Treinador: Stadium` · `Treinador: Pokémon Tool` · `Treinador: Item` · `Treinador` |
| 28 | stage | `(?:estagio\|stage\|fase)\s*2`, `…\s*1`, then `basicos?\|basic` (skipped when `supertype === 'Energy'`) | `stage` | `Estágio 2` · `Estágio 1` · `Básico` |
| 29 | Pokémon subtypes | in this order: `vmax`, `vstar`, `v-?union`, `gx`, `ex`, `v`, `mega`, `tera`, `radiante\|radiant`, `ancestral\|ancient`, `futuro\|future`, `lendario\|ultra beast` | `subtypes[]`, and `supertype = 'Pokémon'` when still unset | `VMAX` · `VSTAR` · `V-UNION` · `GX` · `ex` · `V` · `Mega` · `Tera` · `Radiante` · `Ancestral` · `Futuro` · `Ultra Beast` |
| 30 | energy types | `\b(?:do tipo\|de tipo\|tipo\|type\|of type)?\s*<TYPE>\b` | `types[]`, `supertype = 'Pokémon'` when unset | `tipo <T>` |
| 31 | no ability | `\b(?:sem habilidades?\|no ability\|without (?:an )?abilit(?:y\|ies))\b` | `has_ability = false` | `sem habilidade` |
| 32 | ability clause | `\b(?:habilidades?\|abilit(?:y\|ies))\s+(?:que\|de\|para\|com\|that\|which\|to\|with)\s+(.+?)(?=\s+(?:e\|and)\s+(?:ataque\|attack\|com\|with\|que\|hp\|dano)\b\|$)` | `ability_text = translatePhrase(clause)`, `has_ability = true` | `habilidade que menciona '<clause>'` |
| 33 | has ability | `\b(?:com\|que tem\|possui\|with\|has)\s+(?:uma?\s+\|an?\s+)?(?:habilidades?\|abilit(?:y\|ies))\b`, then the bare word | `has_ability = true` | `com habilidade` |
| 34 | attack name | `\b(?:ataques?\|attacks?)\s+(?:chamad[oa]s?\|named\|called)\s+([a-z0-9\-']+(?:\s+[a-z0-9\-']+)?)` | `attack_name` | `ataque chamado '<x>'` |
| 35 | attack clause | `\b(?:ataques?\|attacks?)\s+(?:que\|de\|para\|com\|that\|which\|to\|with)\s+(.+?)(?=\s+(?:e\|and)\s+(?:habilidade\|ability\|com\|with\|que\|hp)\b\|$)`, then the bare word is dropped | `attack_text = translatePhrase(clause)` | `ataque que menciona '<clause>'` |
| 36 | residual | what remains, cleaned: non-`[a-z0-9' -]` → space, collapse, drop leading/trailing connectors (`e\|and\|com\|with\|que\|that\|de\|of`), drop `STOPWORDS` | `text = translatePhrase(residual)` | `texto contém '<residual>'` |

**`synonyms.ts`.** The legacy table has 72 `_add(en, ...pt)` groups mapping **212** normalized pt forms onto **71** English stems (verified). Stems are prefixes on purpose, because the FTS query is `"stem"*`: `cura|curar|curam|curando|recupera → heal`, `descarta|descartar|descarte → discard`, `compra|comprar|puxa → draw`, `banco|banca|reserva → bench`, `moeda → coin`, `cara → heads`, `coroa → tails`, `zona perdida → lost zone`, `embaralha → shuffle`, `nocaute|derrota → knock`, `premio → prize`, `evolui|evolucao → evolv`, `paralisa → paralyz`, `confunde → confus`. `translatePhrase` replaces multi-word entries first (longest key first), then word by word, leaving unknown words untouched.

**`types.ts`.** 39 pt+en forms → the 11 canonical types: `agua|water|aquatico → Water`, `fogo|fire → Fire`, `planta|grama|grass → Grass`, `eletrico|eletrica|raio|lightning|electric → Lightning`, `psiquico|psiquica|psychic → Psychic`, `lutador|luta|fighting → Fighting`, `sombrio|escuridao|noturno|darkness|dark → Darkness`, `metal|metalico|aco|steel → Metal`, `dragao|dragon → Dragon`, `fada|fairy → Fairy`, `incolor|colorless|normal → Colorless`. The alternation is built longest-first so `escuridao` is not shadowed by a shorter form.

**`STOPWORDS`.** The legacy set (~60 forms): pt articles/prepositions (`de da do dos das com que e o a os as um uma para por em no na`), the words `carta(s)`, `card(s)`, `pokemon`, `tipo(s)`, the query verbs (`mostre mostrar quero busque procurar encontre liste ver`), the quantifiers (`todos todas qual quais tem tenha possui`), and their English counterparts (`the an with that and of or show find me all which has have i want list search get give who whose where when this these those is are be`).

## Implementation steps

1. Create `packages/shared/src/nl/` with `types.ts`, `stopwords.ts` and `synonyms.ts` (all 72 groups) plus `synonyms.spec.ts` (BR-S02.T10-10).
2. Write the normalization front end and the `_sub(pattern, fn)` extract-and-remove helper, with `EXTRACTORS` as an explicit ordered array of `{ id, re, apply }`.
3. Implement extractors 1–8 (years, sorts, prices) and their chips; add the phrases `'charizard todos os anos'`, `'marca G de 2023'`, `'cartas raras até 5 dólares mais caras'` (BR-S02.T10-02, -05).
4. Implement 9–17 (HP, damage, cost, retreat); add `'água com mais de 200 de HP que cura'`, `'ex estágio 2 hp entre 250 e 330'`, `'water under 100 hp'`, `'ataque de uma energia com 60 de dano'`, `'basic lightning pokemon with free retreat'`.
5. Implement 18–25 (weakness/resistance, evolves, name, artist, dex, mark, legality); add `'pokémon psíquico com fraqueza a sombrio'`, `'evolui de eevee'`, `'chamado pikachu'` (BR-S02.T10-03).
6. Implement 26–30 (rarity, supertypes, stage, subtypes, types) with the longest-first ordering inside the subtype block; add `'trainer stadium standard'` and the specificity test (BR-S02.T10-04).
7. Implement 31–35 (ability and attack clauses) with `translatePhrase` at the write sites; add `'fogo com habilidade que compra cartas'`, `'ataque que descarta energia e causa 120+'`, `'supporter that draws cards'` (BR-S02.T10-07).
8. Implement the residual pass (clean → stopwords → translate) and the empty-phrase guard; add `''`, `'   '`, `'cartas'` (BR-S02.T10-08).
9. Add the cross-cutting specs: determinism, schema validity, chips ↔ `activeFilters`, and the import-graph assertion (BR-S02.T10-01, -06, -09, -11, RN-60).
10. Export from `@pokesearch/shared`, confirm the web bundle includes it, and publish `chips.ts` so [S02.T12](T12-web-search-page.md) renders the same strings the API returns.

## Edge cases and error handling

- **A phrase with no recognized pattern** (`"cartas"`). Every extractor misses; the residual is `cartas`, which is a stopword, so it is dropped; `text` stays `null`, `chips` is empty, and the search returns the default listing rather than an error (BR-S02.T10-08).
- **A bare number** (`"250"`). Extractor 4 rejects it (not 19xx/20xx), 11 needs an HP word, 13 needs a damage word or the `\d{2,3}\+` form, 14/15 need an energy word. It survives to the residual and becomes a full-text token — which finds cards whose text contains "250".
- **`"120+"`.** Extractor 13's last pattern `\b(\d{2,3})\+` catches it → `attack_damage_min: 120`, chip `ataque com dano ≥ 120`. Note the interaction with extractor 4's negative lookahead `(?!\s*(?:hp|ps|dano|damage|\+))`, which is what stops `2023+` being read as a year.
- **`"mega com mais de 300 de hp"`.** `mega` is both a subtype and a word; extractor 29 consumes it as `subtypes: ['MEGA']` before the residual pass, so it never becomes free text.
- **`"água"` with and without the accent.** Normalization strips the diacritic first, so `agua` and `água` take the same path; the same is true for `psíquico`/`psiquico`.
- **A type word inside a weakness clause** (`"fraqueza a sombrio"`). Extractor 18 removes the whole span including the type, so extractor 30 finds nothing left — the reason for the ordering (BR-S02.T10-03).
- **`"normal"`.** Mapped to `Colorless`, because in this domain "normal" is the colourless type. A user searching for the *variant* "normal" is served by the card page's variant list, not by search.
- **Two years** (`"de 2021 a 2023"`). Extractor 2 takes `desde`→2021; extractor 3 takes `a`… — `a` is in the `ate|until|to|before` alternation only as `to`, so the pt form `a` is not matched and 2023 falls to extractor 4, which sets *both* bounds to 2023 and overwrites `release_from`. Documented as a known limitation with a test asserting the current behaviour; fixing it means an explicit range extractor before 2 and 3.
- **A clause that swallows the rest of the phrase** (`"ataque que descarta energia e causa 120+"`). The lookahead `(?=\s+(?:e|and)\s+(?:habilidade|ability|com|with|que|hp)\b|$)` stops the clause at the connector; `causa 120+` was already consumed by extractor 13, which runs earlier — so order again is what makes the clause end where it should.
- **A very long phrase** (a pasted paragraph). No length limit in the parser; [S02.T11](T11-api-cards-search-sets.md) caps `q` at 300 characters so a pathological input cannot build a huge FTS match.
- **A phrase in neither language** (`"カード"`). Every extractor misses; normalization keeps the characters, the residual cleaner strips non-`[a-z0-9' -]`, so the residual is empty and the query stays at defaults.

## Acceptance / verification

- [ ] `nl.spec.ts` ports all 17 legacy cases and passes: `'água com mais de 200 de HP que cura'` → `types:['Water']`, `hp_min:200`, `text:'heal'`, `supertype:'Pokémon'`; `'ataque que descarta energia e causa 120+'` → `attack_damage_min:120`, `attack_text:'discard energy'`, `text:null`; `'trainer stadium standard'`; `'basic lightning pokemon with free retreat'`; `'fogo com habilidade que compra cartas'` → `ability_text:'draw'`; `'ex estágio 2 hp entre 250 e 330'`; `'cartas raras até 5 dólares mais caras'` → `price_max_usd:5`, `sort:'price_desc'`, `rarity` contains `Rare`; `'marca G de 2023'`; `'charizard todos os anos'` → `release_from:null`, `text:'charizard'`; `'supporter that draws cards'`; `'pokémon psíquico com fraqueza a sombrio'`; `'ataque de uma energia com 60 de dano'`; `'water under 100 hp'`; `'evolui de eevee'`; `'chamado pikachu'`; `'basico sem habilidade'`; and the three empty phrases.
- [ ] The stage exit phrase `'pokémon de fogo com mais de 200 hp desde 2023'` yields `types:['Fire']`, `hp_min:200`, `release_from:'2023-01-01'`, `supertype:'Pokémon'` and exactly three chips.
- [ ] New cases pass: `'itens que curam'` → `supertype:'Trainer'`, `subtypes:['Item']`, `text:'heal'`; `'estádios standard'` → `subtypes:['Stadium']`, `legal_standard:true`; `'water 120+'` → `types:['Water']`, `attack_damage_min:120`; `'cartas mais caras que US$ 20'` → `price_min_usd:20`.
- [ ] `> rarity specificity`: `'special illustration rare'` produces exactly `['Special Illustration Rare']` (BR-S02.T10-04).
- [ ] `> weakness before type` (BR-S02.T10-03); `> '5 dólares' sets price_max_usd, '5' does not` (BR-S02.T10-05).
- [ ] `> chips match activeFilters` for every test phrase — same count, and every chip's field appears in `activeFilters` (BR-S02.T10-06).
- [ ] `> every parsed phrase satisfies SearchQuerySchema` (BR-S02.T10-09); `> same phrase twice deep-equals` (BR-S02.T10-01).
- [ ] `synonyms.spec.ts` green: 212 pt forms resolve, `'zona perdida' → 'lost zone'`, unknown words pass through (BR-S02.T10-10).
- [ ] `> import graph is clean` — no `node:` import and no network API in the module's transitive imports; `pnpm --filter web build` succeeds with the parser imported from a route (BR-S02.T10-11, RN-60).
- [ ] `pnpm test` passes with `ANTHROPIC_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL` unset, proving the path needs no key (RN-60).

## Risks and open questions

- **Risk — a reordering during the port silently changes behaviour.** Mitigation: `EXTRACTORS` is one explicit ordered array, the three load-bearing orderings are business rules with tests, and the 17 legacy cases are the regression net.
- **Risk — regex dialect differences** (Python `re.fullmatch` vs JavaScript, named groups, `re.sub` with a callback). Mitigation: anchor with `^…$` instead of `fullmatch`, use `String.replace(re, fn)` for extract-and-remove, `u` flag everywhere, and no lookbehind (still uneven across engines) except where a lookahead can replace it.
- **Risk — the parser over-interprets** and hides results the user wanted. Mitigation: every filter produces a chip, the chips are rendered as removable ([S02.T12](T12-web-search-page.md)), and explicit URL filters override parsed ones ([S02.T11](T11-api-cards-search-sets.md)).
- **Risk — the synonyms table ages** as new mechanics appear. Mitigation: it is a data file, additive, with one test per group; adding a stem is a one-line change.
- **Question — should the parser handle a year range** (`"de 2021 a 2023"`) as a proper range? Today it does not (see Edge cases). Recommendation: add an explicit range extractor before #2, with the chip `lançado entre 2021 e 2023`. The user decides whether it is worth it; the current behaviour is tested so the change is visible.
- **Question — should an optional LLM interpretation return** as a second `source`? RN-60 permits it only as an opt-in that is hidden without a key, exactly as the legacy checkbox worked. Recommendation: keep it out of S02 entirely and revisit with [S08.T06](../08-operations-and-extensions/T06-llm-assisted-authoring.md); the API response shape already has `interpretation.source`, so nothing blocks it later.

## References

- `pokemon/src/pokesearch/search/nl_parser.py` — verified (383 lines): the extract-and-remove `_sub` helper; the exact extractor order reproduced in the table above; `_TYPE_WORDS` (39 forms) with the longest-first alternation; `_CMP_MIN`/`_CMP_MAX`/`_HPW` fragments; the 11 ordered rarity patterns; the `_STOP` set; `_clean_clause` stripping non-`[a-z0-9' -]`, the leading/trailing connectors and the stopwords; the chip strings quoted above. Consult for order and vocabulary; rewrite in TypeScript.
- `pokemon/src/pokesearch/search/synonyms.py` — verified (102 lines): 72 `_add(en, *pt)` groups mapping 212 normalized pt forms onto 71 English stems; `translate_phrase` replacing multi-word keys first (sorted by descending key length) and then word by word.
- `pokemon/tests/test_nl_parser.py` — verified (116 lines): the 17 cases ported in Acceptance, including `test_chips_present`, `test_weakness_before_type` and the three empty phrases in `test_empty`.
- `pokemon/src/pokesearch/api/deps.py` — verified: `query_from_request` runs the rules parser on `q`, then lets explicit URL parameters overwrite the parsed values, and exposes the LLM path only behind `ai=1` **and** `nl_llm.available()` — the RN-60 shape [S02.T11](T11-api-cards-search-sets.md) inherits.
- `pokemon/README.md` L42–60 — verified: the example phrases and the statement that the sidebar filters prevail over the phrase interpretation.
- [S02.T09](T09-search-query-model-and-sql.md) — the `SearchQuery` fields and defaults this parser writes into; [S02.T08](T08-full-text-search.md) — why the residual must be English stems.

---
Context docs: [Vision and scope](../../project/01-vision-and-scope.md) · [Decision log](../../project/02-decision-log.md) · [Architecture](../../project/03-architecture-overview.md) · [Data model](../../project/04-data-model-overview.md) · [Business rules traceability](../../project/05-business-rules-traceability.md) · [Legacy reference map](../../project/06-legacy-reference-map.md) · [Glossary](../../project/07-glossary.md) · [Conventions](../../project/08-conventions.md) · [Stage README](README.md)
