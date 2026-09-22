# PokéSearch — Especificação do sistema

Estado descrito: commit `251b93d`, 21/09/2026. Números de banco e de artefatos foram lidos diretamente de
`data/pokesearch.db`, `sim/verified_cards.json`, `sim/attack_effects.json` e `benchmarks/HISTORICO.md` nessa data.
Percentuais de cobertura vêm do [README.md](README.md) (L169-190) e não foram recalculados aqui.

Este documento diz **o que o sistema é, de onde vêm os dados, quais regras ele obedece e para que serve**. Instalação,
comandos e detalhe de cada tela continuam no [README.md](README.md); medições, em [benchmarks/](benchmarks/).

---

## 1. Objetivo

### 1.1 Objetivo-fim

**Melhorar o deck do usuário**: dada uma lista real de 60 cartas de Pokémon TCG (formato Standard), dizer com medição
reproduzível quanto ela ganha contra o meta atual e que trocas de carta a fazem ganhar mais.

O projeto nasceu como plataforma de busca de cards (é o que o título do README e o `pyproject.toml:4` ainda dizem). A
busca, o ETL, os preços e os decks de torneio continuam existindo e funcionando, mas hoje são a **base de dados que
sustenta o simulador**, não o produto final.

### 1.2 Objetivos de suporte

| # | Objetivo | Por que o objetivo-fim precisa dele |
|---|---|---|
| O1 | Base completa de cards (1999–2026) com todos os atributos e texto oficial, e busca por atributo ou linguagem natural (pt-br/en) | Texto oficial é a referência contra a qual toda carta simulada é auditada; preço limita o otimizador |
| O2 | Meta real: decklists de torneio Standard dos últimos 90 dias, por arquétipo | Define os oponentes, seus pesos, o pool de cartas candidatas e o denominador da cobertura |
| O3 | Simulador fiel ao texto das cartas | Nota medida com carta errada mede outra carta |
| O4 | Piloto (bot) competente e medido | Deck mal pilotado recebe nota do piloto, não da lista |
| O5 | Otimizador de lista que só aceita ganho fora do ruído | É a entrega ao usuário |

### 1.3 Métricas de sucesso

| Métrica | Definição | Valor atual | Denominador |
|---|---|---|---|
| Cobertura **exata** | cópias do meta cuja implementação *se declara* fiel ao texto | 94,7 % | 2,3 milhões de cópias das listas Standard de torneio, 90 dias (12,6 pontos são Energia Básica) |
| Cobertura **comprovada** | parte da exata com prova independente da receita (§4.6) | 72,6 % (nasceu em 45,1 %) | o mesmo |
| **Nota** na régua fixa | vitória ponderada pelo meta do baralho avaliado, IC 95 % | régua v5, lista do usuário (Dhelmise): 36,5 % → **57,3 %** (IC 55,5–59,0) | 12 oponentes; 100–250 partidas por oponente |
| **Habilidade em espelho** | bot em teste × bot congelado com a mesma lista dos dois lados, nas 13 listas | régua v4: 50,6 % (IC 48,6–52,6). **Régua v5: sem dado válido** (§6.3) | 60–200 partidas por lista |

Implementado ≠ verificado: 632 cartas têm linha em `card_impl`, 721 têm atributos auditados, **109 cartas (117 partes
de efeito) têm prova** gravada em `verified_cards.json`.

### 1.4 Fora de escopo

- **IA decidindo jogada ao vivo** — uma medição na régua são ~465 mil decisões, e a resposta mudaria a cada rodada. A IA só classifica, audita e revisa depois da partida (§4.5).
- **API do pokemontcg.io / Scrydex** — virou paga; não é usada.
- **Espelho local de imagens** (dataset do Kaggle, 3,6 GB) — imagens vêm por hotlink de CDN.
- **Texto de carta em pt-br** — nenhuma fonte pública tem; os dados das cartas são em inglês.
- Formatos além do Standard, no simulador.

---

## 2. Origem das informações

### 2.1 Repositórios GitHub

| Repositório | O que fornece | Como entra | Onde é consumido | Licença |
|---|---|---|---|---|
| [PokemonTCG/pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data) | Fonte canônica dos cards em inglês: nome, ataques, habilidades, HP, tipos, raridade, artista, legalidade, `ptcgoCode`, URLs de imagem | Download de `sets/en.json` e `cards/en/<set>.json` via `raw.githubusercontent.com`, com cache por ETag em `data/raw/pokemon-tcg-data/` (176 arquivos, 26 MB) | [config.py:29](src/pokesearch/config.py#L29), [etl/fetch_ptcg.py](src/pokesearch/etl/fetch_ptcg.py); JSON bruto preservado em `cards.raw_ptcg_json` | **Não declarada neste projeto** |
| [wjsutton/pokemon_tcg_stockmarket](https://github.com/wjsutton/pokemon_tcg_stockmarket) | Semente de histórico de preços: 4 CSVs (modern/vintage, fev e mar/2025) | Download raw; o `ID` do CSV é o mesmo id do pokemon-tcg-data | [config.py:32](src/pokesearch/config.py#L32), [etl/seed_wjsutton.py](src/pokesearch/etl/seed_wjsutton.py) → `price_history` com `source='wjsutton'` (20.890 linhas). Opcional | **Não declarada neste projeto** |
| [gemelom/ptcg-engine](https://github.com/gemelom/ptcg-engine) | Motor de regras do jogo (estado, turno, prêmios, ~100 cartas escritas à mão) | Dependência Python do extra `sim`, **fixada no commit `92c3cc4`** | [pyproject.toml:21](pyproject.toml#L21); imports `ptcg.*` em [sim/engine_adapter.py](src/pokesearch/sim/engine_adapter.py), `effects.py`, `catalog_cards.py`, `cardtemplate.py`, `benchmark.py`, `coach.py`, `audit.py` | MIT |
| [the-epsd/twinleafgg](https://github.com/the-epsd/twinleafgg) | Segunda implementação independente da lógica das cartas (TypeScript). Serve de **fonte de tradução** de efeitos de ataque e de **árbitro** na auditoria | **Clone externo, não versionado aqui**: passado por caminho (`pokesearch-sim twinleaf --root <clone>`, `audit --twinleaf-root <clone>`). Os `.ts` são lidos por casamento de padrões, sem parser | [sim/twinleaf_import.py](src/pokesearch/sim/twinleaf_import.py) → grava em [sim/attack_effects.json](src/pokesearch/sim/attack_effects.json) com o caminho do `.ts` de origem; hoje **69 ataques** | MIT (declarada em `ptcg-server/package.json` do repositório) |

Não há submódulos git, pastas `vendor/` nem outros repositórios. O próprio projeto vive em
`github.com/ManoFardo-PR/pokemon`.

### 2.2 APIs, sites e serviços

| Fonte | Base | Fornece | Módulo | Chave |
|---|---|---|---|---|
| TCGdex API | `https://api.tcgdex.net/v2/en` | Preços (TCGplayer, Cardmarket), imagens WebP, legalidade, variantes; JSON bruto em `cards.raw_tcgdex_json` | [etl/fetch_tcgdex.py](src/pokesearch/etl/fetch_tcgdex.py), [etl/prices.py](src/pokesearch/etl/prices.py) | nenhuma |
| Limitless API | `https://play.limitlesstcg.com/api` | Torneios, standings e decklists | [etl/limitless.py](src/pokesearch/etl/limitless.py), [etl/decks.py](src/pokesearch/etl/decks.py) | `LIMITLESS_API_KEY` (opcional; só aumenta o limite) |
| limitlesstcg.com (raspagem HTML) | `https://limitlesstcg.com` | Decklists de eventos presenciais | [etl/limitless_web.py](src/pokesearch/etl/limitless_web.py) (BeautifulSoup) | nenhuma |
| CDN do Limitless | `limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci` | Imagem de reserva para carta de deck não resolvida | [etl/deck_resolver.py](src/pokesearch/etl/deck_resolver.py) | — |
| images.pokemontcg.io | hotlink | Imagens das cartas (URLs vêm do pokemon-tcg-data) | templates | — |
| Groq | `https://api.groq.com/openai/v1` | LLM (`openai/gpt-oss-120b` para classificar/auditar, `gpt-oss-20b` para conversar) | [llm/backends.py](src/pokesearch/llm/backends.py) | `GROQ_API_KEY` |
| Anthropic | SDK `anthropic` | LLM (`claude-opus-5` papel `code`, `claude-haiku-4-5` papel `chat`) | [llm/backends.py](src/pokesearch/llm/backends.py) | `ANTHROPIC_API_KEY` |
| LLM local | `http://localhost:11434/v1` | Ollama / LM Studio / vLLM | [llm/roles.py](src/pokesearch/llm/roles.py) | `LOCAL_LLM_API_KEY` (opcional) |
| Livro de regras oficial | `par_rulebook_en.pdf` | Texto normativo citado nas correções de regra e nos testes | [sim/status.py:813](src/pokesearch/sim/status.py#L813), [tests/test_rules.py](tests/test_rules.py) | — |

Todas as URLs de fonte estão em um arquivo só: [config.py](src/pokesearch/config.py). Nomes de variáveis de ambiente,
em [.env.example](.env.example).

**Declarado mas não usado** (para ninguém procurar): dataset do Kaggle (só citado no README); constante
`TCGDEX_ASSETS_BASE` ([config.py:31](src/pokesearch/config.py#L31)); `IMAGE_MODE=local` e `IMAGES_DIR`; papel de LLM
`play` (nenhum módulo o chama); tabela `card_attributes` (0 linhas, nada a popula).

### 2.3 Pipeline de ingestão

`pokesearch-etl full` ([etl/run.py](src/pokesearch/etl/run.py)), em ordem:

1. baixa pokemon-tcg-data (só o que mudou, por ETag);
2. baixa a lista de sets do TCGdex e casa os ids das duas fontes ([etl/idmap.py](src/pokesearch/etl/idmap.py); exceções em `idmap_overrides.json`, hoje vazio);
3. baixa os cards completos do TCGdex (concorrência 8, cache por arquivo);
4. grava `sets`, `cards`, `attacks`, `abilities`, `weaknesses`, `resistances`;
5. reconstrói o índice FTS5 `cards_fts`;
6. escreve relatórios do que não casou em `data/reports/`;
7. tira o snapshot de preços do cache.

Outros subcomandos: `delta` (só sets novos/alterados), `prices`, `fts`, `seed-wjsutton`, `decks [--web]`. Com
`ENABLE_SCHEDULER=1`: preços 06:00 diário, `delta` segunda 05:00, decks 07:00 diário (America/Sao_Paulo).

### 2.4 Modelo de dados

SQLite único em `data/pokesearch.db` (fora do git). Schema em [db/schema.sql](src/pokesearch/db/schema.sql),
idempotente (`CREATE TABLE IF NOT EXISTS`); **não há migrations**.

| Tabela | Linhas | Origem |
|---|---|---|
| `sets` | 174 | pokemon-tcg-data + TCGdex |
| `cards` | 20.444 | as duas fontes; JSON bruto de ambas preservado |
| `attacks` / `abilities` | 27.976 / 4.092 | pokemon-tcg-data |
| `price_history` | 90.709 | cardmarket 38.206 · tcgplayer 31.613 · wjsutton 20.890 |
| `tournaments` / `archetypes` | 403 / 141 | Limitless |
| `decks` / `deck_cards` | 38.471 / 982.557 | Limitless; resolução: `exact` 915.913 · `override` 66.547 · `name` 93 · `none` 4 |
| `card_impl` | 632 | simulador: `catalog` 292 · `catalog_approx` 169 · `vanilla` 124 · `vanilla_exact` 47 |
| `card_audit` | 721 | auditoria determinística; 36 linhas têm também parecer de IA |
| `deck_projects` / `deck_versions` | 2 / 3 | projetos de otimização da UI |
| `sim_runs` / `sim_results` | 4 / 15 | corridas de simulação da UI |
| `cards_fts` (FTS5), `etl_meta`, views de preço | — | derivadas |

Artefatos versionados fora do banco: `sim/attack_effects.json` (346 cartas; 344 ataques classificados por Groq, 69
traduzidos do Twinleaf), `sim/verified_cards.json` (109 cartas, 117 partes), `sim/engine_fixes.json`,
`benchmarks/regua_v1..v5.json`, `benchmarks/historico.jsonl`.

---

## 3. Arquitetura

```
src/pokesearch/
  config.py      URLs de fonte e variáveis de ambiente
  etl/           ingestão (cards, preços, torneios, decks)
  db/            conexão + schema.sql
  search/        parser de regras pt/en, FTS, interpretação por IA, decks
  api/           FastAPI + Jinja2 + HTMX (busca, card, decks, /sim, /sim/cards, /sim/audit)
  llm/           provedores (Anthropic, compatível-OpenAI) e papéis code/play/chat
  sim/           simulador: adaptador do motor, DSL de efeitos, catálogo, auditoria, lint,
                 piloto, bots congelados (frozen/), técnico, otimizador, régua
scripts/         medição: bot_progress, bot_bench, deck_optimize, sim_fingerprint, engine_spike
benchmarks/      réguas congeladas e relatórios de medição
tests/           pytest
```

Entradas: `pokesearch-etl`, `pokesearch-web`, `pokesearch-sim` ([pyproject.toml:24-27](pyproject.toml#L24-L27)).
Stack: Python 3.12+, uv, FastAPI, SQLite + FTS5, Jinja2 + HTMX.

### 3.1 Como uma carta ganha comportamento

O motor de regras é de terceiros; tudo em `sim/` é adaptação, correção e extensão por cima dele. Uma carta pode vir de:

1. **Motor** — carta escrita à mão no `ptcg-engine`.
2. **Esqueleto** (`generated_cards/vanilla/`, fora do git, regenerável) — atributos e dano exatos, texto de efeito ignorado. É *exato* quando a carta não tem texto de efeito.
3. **Catálogo** ([sim/catalog.py](src/pokesearch/sim/catalog.py)) — receita declarativa escrita à mão na DSL de [sim/effects.py](src/pokesearch/sim/effects.py); a classe é gerada em runtime.
4. **Ataque classificado** ([sim/attackops.py](src/pokesearch/sim/attackops.py)) — a IA, ou o tradutor do Twinleaf, escolhe operações de um **vocabulário fechado**; nunca escreve código.
5. **Carta inteira gerada por IA** ([sim/cardgen.py](src/pokesearch/sim/cardgen.py)) — módulo + teste, validação estática, pytest em subprocesso, até 3 tentativas. Hoje não há nenhuma versionada.

Ordem de carga em [engine_adapter.py:215](src/pokesearch/sim/engine_adapter.py#L215): motor → esqueleto → geradas →
catálogo. Carta do motor só é substituída quando a auditoria mandou (`engine_fixes.json`).

---

## 4. Regras de negócio

Cada regra aponta para onde está implementada ou escrita. "Motor" = comportamento herdado do `ptcg-engine`, não
reimplementado aqui.

### 4.1 Dados

| # | Regra | Fonte |
|---|---|---|
| RN-01 | O JSON bruto das duas fontes de card é preservado; nenhuma fonte sobrescreve a outra | `schema.sql`, `etl/load.py` |
| RN-02 | Carta de decklist é resolvida nesta ordem: override de card → set + número → só dígitos → nome (impressão mais recente legal no formato) → não resolvida (guarda nome e imagem de reserva) | [etl/deck_resolver.py:1-5](src/pokesearch/etl/deck_resolver.py#L1-L5) |
| RN-03 | O meta é: formato STANDARD, últimos 90 dias, torneios com ≥ 16 jogadores, no máximo 400 torneios | [config.py:59-62](src/pokesearch/config.py#L59-L62) |
| RN-04 | Torneio com mais de 180 dias é removido do banco | [etl/decks.py:146](src/pokesearch/etl/decks.py#L146) |
| RN-05 | Efeito de carta casa por **impressão exata**, não por nome: cartas homônimas de coleções diferentes têm ataques diferentes. Ao reaproveitar receita entre impressões, conferem-se os nomes de ataque e habilidade | `twinleaf_import.py` (cabeçalho), [engine_adapter.py:245](src/pokesearch/sim/engine_adapter.py#L245) |
| RN-06 | Número de jogadores de evento raspado do site é **estimado por tipo de evento** | README, limitações |

### 4.2 Jogo

| # | Regra | Fonte |
|---|---|---|
| RN-10 | Partida só roda com **exatamente 60 cartas de cada lado**. Lista vazia nunca chega ao motor: ele carregaria em silêncio o deck padrão dele (foi assim que uma lista de 0 cartas já recebeu nota de 36,7 %) | [engine_adapter.py:438-447](src/pokesearch/sim/engine_adapter.py#L438-L447) |
| RN-11 | Seis correções sobre o motor, cada uma com a frase do livro de regras: evoluir **mantém o dano**; só quem começa pula o ataque do 1º turno; quem começa **compra** no 1º turno; Ferramenta continua valendo após evoluir; gatilho ao pôr Básico no Banco dispara; carta que voltou à mão/deck não evolui no turno em que é rejogada. Ninguém evolui no próprio primeiro turno | [status.py:813](src/pokesearch/sim/status.py#L813), [tests/test_rules.py](tests/test_rules.py) |
| RN-12 | Condições Especiais (ausentes no motor): Poisoned 10 no checkup; Burned 20 e moeda; Asleep e Paralyzed não atacam nem recuam; Confused joga moeda ao atacar e leva 30 na coroa. Asleep/Paralyzed/Confused são mutuamente exclusivas; Poisoned e Burned coexistem. Ir para o Banco ou evoluir limpa tudo | [status.py:31](src/pokesearch/sim/status.py#L31), [status.py:54](src/pokesearch/sim/status.py#L54) |
| RN-13 | Dano: `+N` antes de Fraqueza (×2) e Resistência (−30); `−N` depois. Fraqueza e Resistência só no Ativo | `status.py`, `pilot.py` |
| RN-14 | **Dano no Banco não é marcador**: não aplica Fraqueza/Resistência, mas passa por prevenção e redução. Marcador de dano é *efeito* e passa pelo filtro de prevenção | [status.py:498](src/pokesearch/sim/status.py#L498) |
| RN-15 | Regra Tera é regra da carta, não habilidade: nada a desliga; marcador continua entrando | [status.py:398](src/pokesearch/sim/status.py#L398) |
| RN-16 | "Uma vez durante o seu turno" vale **por Pokémon**; só é por nome quando a carta diz | `catalog_cards.py` |
| RN-17 | "O efeito de X não se acumula" conta uma vez por nome de carta | [status.py:454](src/pokesearch/sim/status.py#L454) |
| RN-18 | Tamanho do Banco é o que o estado diz (`benchSize`), não 5 fixo | [status.py:796](src/pokesearch/sim/status.py#L796) |
| RN-19 | Prêmios que uma carta vale vêm da **regra impressa** ("takes N Prize cards"); subtipo é só plano B (VSTAR vale 2, Mega ex vale 3) | `sim/cardspec.py` |
| RN-20 | Fim de partida: `prizes`, `deck_out`, `no_pokemon`, ou empate por **estagnação** (12 turnos sem mudança de material) ou limite de 3000 passos. Medido: 54 % prêmios, 32 % fim de deck, 12 % sem Pokémon, 2 % estagnação | [engine_adapter.py:492](src/pokesearch/sim/engine_adapter.py#L492), [:516](src/pokesearch/sim/engine_adapter.py#L516) |
| RN-21 | Ação ilegal devolvida por um bot é contada como erro e trocada pela primeira ação legal | `engine_adapter.run_game` |
| — | Uma energia e um Apoiador por turno, recuo uma vez, mulligan, 6 prêmios | Motor |

**O que o sistema não valida** (lacuna declarada): limite de 4 cópias fora do otimizador; legalidade do deck por
formato ou regulation mark; presença de Pokémon Básico na lista.

### 4.3 Piloto

| # | Regra | Fonte |
|---|---|---|
| RN-30 | **Informação honesta**: o piloto conhece a própria lista; mão, campo e descartes são visíveis; deck + prêmios próprios são um monte só até a primeira busca no próprio deck. **Nunca lê mão, deck ou prêmios do oponente**, embora o motor os entregue | [pilot.py:188](src/pokesearch/sim/pilot.py#L188), [:205](src/pokesearch/sim/pilot.py#L205) |
| RN-31 | O piloto deduz do deck o atacante principal, a linha evolutiva, o suporte e o **objetivo do deck** — lido da condição do ataque principal (ex.: "4 Hide 'n' Sneak no descarte") — e passa a alimentar esse objetivo de propósito | [pilot.py:123](src/pokesearch/sim/pilot.py#L123), [:155](src/pokesearch/sim/pilot.py#L155) |
| RN-32 | Turno em ordem fixa, **atacar por último**: ataque que encerra a partida → Básicos → evoluir → energia → Ferramenta/Estádio → itens de busca → habilidades → itens → Apoiador → recuar → atacar | `pilot.py` (`_p`) |
| RN-33 | Compra opcional é recusada com 12+ cartas na mão ou menos de 7 no deck | [pilot.py:34-35](src/pokesearch/sim/pilot.py#L34-L35), [:441](src/pokesearch/sim/pilot.py#L441) |
| RN-34 | Boss's Orders e afins só quando rendem nocaute que o Ativo atual não dá, ou mais prêmios | [pilot.py:429](src/pokesearch/sim/pilot.py#L429) |
| RN-35 | Só paga recuo se quem entra bate de verdade; não promove nem põe no Banco quem entrega 2 prêmios sem bater | `pilot.py` |
| RN-36 | Descarte com memória: a carta não conta a si mesma; última cópia e energia escassa valem mais | [pilot.py:245](src/pokesearch/sim/pilot.py#L245) |
| RN-37 | Bots `heuristic`, `smart`, `planner_v4/v7/v9` estão **congelados**; bot novo só em `pilot.py` | `sim/policies.py`, `sim/frozen/` |

### 4.4 Medição — a régua fixa

| # | Regra | Fonte |
|---|---|---|
| RN-40 | A régua congela num arquivo versionado: baralho avaliado, decks dos oponentes, pesos do meta do dia, sementes e piloto dos oponentes. **Entre duas medições só muda o piloto** do baralho avaliado | [progress.py:1-17](src/pokesearch/sim/progress.py#L1-L17) |
| RN-41 | **Régua não se atualiza.** Precisa mudar algo? Cria-se uma versão nova | [progress.py:48](src/pokesearch/sim/progress.py#L48), `scripts/bot_progress.py` |
| RN-42 | Notas de réguas diferentes **não se comparam** | [HISTORICO.md](benchmarks/HISTORICO.md) L5-6 |
| RN-43 | A cada 3 rodadas de evolução, o piloto é congelado e vira o oponente da régua seguinte | [progress.py:34](src/pokesearch/sim/progress.py#L34) |
| RN-44 | Duas leituras: **nota** (Σ peso × vitória, IC 95 %) e **espelho** (mesma lista dos dois lados, todas as listas), para separar "o bot melhorou" de "melhorou para um deck só" | [progress.py:8-13](src/pokesearch/sim/progress.py#L8-L13) |
| RN-45 | Empate conta 0,5 na taxa de vitória; intervalo de Wilson, z = 1,96. (O banco de provas `bot_bench` **exclui** empates, para deck travado não marcar 50 %) | [runner.py:33](src/pokesearch/sim/runner.py#L33), [:81](src/pokesearch/sim/runner.py#L81), `sim/benchmark.py` |
| RN-46 | Semente estável por confronto: `seed0 + crc32(...)`. `hash()` de string muda a cada processo | [progress.py:88-90](src/pokesearch/sim/progress.py#L88-L90) |
| RN-47 | Toda medição roda com `PYTHONHASHSEED=0` (os scripts se reexecutam para garantir) | [deck_optimize.py:20-21](scripts/deck_optimize.py#L20-L21), `bot_progress.py` |
| RN-48 | Diferença abaixo de ~3 pontos com 1200 partidas é **ruído**; mudança pequena se decide com `--games 250 --mirror 200` | README L245 |
| RN-49 | Cada medição grava o commit, com `+` se havia alteração não commitada | `progress.py`, `HISTORICO.md` |
| RN-50 | Otimização de desempenho só é aceita com **hash de resultados idêntico** | `scripts/sim_fingerprint.py` |

### 4.5 Uso de IA

| # | Regra | Fonte |
|---|---|---|
| RN-60 | **IA nunca está no caminho crítico**: sem chave, tudo funciona (busca cai no parser de regras; simulador não depende dela) | `llm/roles.py`, `search/nl_llm.py` |
| RN-61 | Saída de IA que vira comportamento passa por **vocabulário fechado** com faixas de sanidade; operação desconhecida é recusada. O validador barra resposta malformada, **não resposta errada e bem formada** (amostra: 25 de 27 ataques corretos) | `sim/attackops.py`, README L155 |
| RN-62 | Tradução por regra do Twinleaf **prevalece** sobre classificação por IA: vem de lógica implementada, não de prosa | README L161 |
| RN-63 | **Parecer de IA não é evidência** de que uma carta está certa; é fila de revisão | [verified.py:12](src/pokesearch/sim/verified.py#L12) |
| RN-64 | Auditoria e lint **nunca alteram carta** | `sim/audit.py`, `sim/lint.py` |
| RN-65 | Técnico: a IA revisa até 6 momentos críticos por partida, vê só o que o jogador vê, responde em vocabulário fechado; parecer que aponta jogada inexistente ou "discordo" com a mesma jogada é recusado. Gravar não muda a partida | [coach.py:26-29](src/pokesearch/sim/coach.py#L26-L29), [:229](src/pokesearch/sim/coach.py#L229) |
| RN-66 | Sugestão do técnico vira **hipótese medida na régua**; o que a régua nega é revertido e fica registrado para não ser tentado de novo | [COACH.md](benchmarks/COACH.md) |
| RN-67 | Código gerado por IA não pode importar `os`, `subprocess`, rede etc., nem chamar `open/exec/eval`; só entra se o próprio teste passar | `sim/cardgen.py` |
| RN-68 | Conta gratuita da Groq: trabalhar em lotes pequenos (uma rodada de 400 cartas rendeu 30 pareceres em uma hora) | README L299 |

### 4.6 Qualidade: exato × comprovado

| # | Regra | Fonte |
|---|---|---|
| RN-70 | **Exata** é o que a receita pretende ser; **comprovada** é a parte com prova independente da receita. Os dois números são sempre mostrados juntos | `sim/verified.py`, `/sim/cards` |
| RN-71 | A carta é dividida em partes com texto de efeito (cada habilidade, cada ataque com texto, o efeito do Treinador/Energia); só conta quando **todas** têm evidência | [verified.py:110](src/pokesearch/sim/verified.py#L110), [:123](src/pokesearch/sim/verified.py#L123) |
| RN-72 | Evidências aceitas: teste pytest verde marcado `@pytest.mark.verifies`, ou ataque traduzido do Twinleaf **se for a receita em uso**. Carta sem texto de efeito é exata por construção (atributos são auditados) | [verified.py:139](src/pokesearch/sim/verified.py#L139), [pyproject.toml:45](pyproject.toml#L45) |
| RN-73 | Quem grava a prova é o pytest (`--write-verified`); teste que rodou e falhou **ou foi pulado** sai do arquivo | [verified.py:62](src/pokesearch/sim/verified.py#L62), `tests/conftest.py` |
| RN-74 | Invariante testado: `0 < comprovada ≤ exata`, e o arquivo de provas tem de bater com as marcas nos testes | `tests/test_verified.py` |
| RN-75 | Toda carta registrada confere com a carta oficial em nome, HP, tipo, estágio, prêmios, recuo, fraqueza, resistência, linha evolutiva e ataques (721 cartas travadas por teste) | `tests/test_audit.py` |
| RN-76 | Correção de atributo sobre carta do motor fica em `engine_fixes.json`, com justificativa, e **só toca valores, nunca nomes** | `sim/engine_fixes.json`, `tests/test_audit.py` |
| RN-77 | Toda receita do catálogo cumpre o contrato genérico: registra, lista ações sem erro, executa até o fim e **nenhuma carta fica em duas zonas** | `tests/test_catalog.py` |

### 4.7 Otimizador de lista

| # | Regra | Fonte |
|---|---|---|
| RN-80 | Movimento = trocar 1 cópia. Máximo 4 cópias (exceto Energia Básica), conceito do deck fixo, teto de preço do projeto | [optimizer.py:287](src/pokesearch/sim/optimizer.py#L287) |
| RN-81 | Na régua fixa, **só entra carta com efeito fiel** (motor, `catalog`, `vanilla_exact`, gerada aprovada ou Energia Básica): carta aproximada mede o esqueleto, não a carta | `scripts/deck_optimize.py` |
| RN-82 | Pool de candidatas = listas de torneio Standard de 60 cartas do mesmo arquétipo | [deck_optimize.py:57](scripts/deck_optimize.py#L57) |
| RN-83 | Duas peneiras: triagem barata e **pareada** (mesma semente para candidata e referência), depois confirmação da melhor com amostra grande e **sementes novas**, reavaliando também a lista atual | `scripts/deck_optimize.py` |
| RN-84 | Troca só é aceita se o ganho na confirmação exceder **meia largura do IC** | [deck_optimize.py:103](scripts/deck_optimize.py#L103), [optimizer.py:502](src/pokesearch/sim/optimizer.py#L502) |

---

## 5. Estado atual

### 5.1 Linha do tempo (2026)

| Fase | Período | O que entregou |
|---|---|---|
| 0 — Plataforma de busca | 15–16/09 | ETL, busca FTS e em linguagem natural, API, UI, decks de torneio |
| 1 — Primeiro simulador | 16/09 | Adoção do `ptcg-engine`, camada de IA, políticas, runner, otimizador na UI |
| 2 — Lotes 0 a 8 de efeitos | 16–18/09 | Condições Especiais, DSL, catálogo; cobertura exata 84,8 % → 95,1 % |
| 3 — Verificação independente | 17–18/09 | Tradutor do Twinleaf, auditoria 716/716, lint, cobertura comprovada 45,1 % → 72,6 %; a exata **caiu** de 95,5 % para 94,9 % ao deixar de contar carta com habilidade ausente (hoje 94,7 %) |
| 4 — Piloto medido | 20–21/09 | Régua fixa v1–v4, planner v1–v9, IA como técnico (v10 rejeitada) |
| 5 — Deck do usuário | 21/09 | Régua v5 com a lista Dhelmise, planner v11, otimização da lista |

### 5.2 Evolução do piloto

| Régua (oponente) | De | Para | Observação |
|---|---|---|---|
| v1 (`heuristic`) | 52,7 % | 87,3 % | planner v1–v4; derrota por fim de deck 32,8 % → 5,5 % |
| v2 (`planner_v4`) | 74,9 % | 76,6 % | v5–v7; espelho 49,4 % → 54,6 % |
| v3 (`planner_v7`) | 74,8 % | 74,3 % | v8–v9 sem ganho mensurável; **v10 73,4 %, rejeitada e revertida** |
| v4 (`planner_v9`) | 73,7 % | — | ponto zero |
| v5 (`planner_v9`, lista do usuário) | 36,5 % | **57,3 %** | v11 lê o objetivo do deck |

Série completa, com IC e commit: [benchmarks/HISTORICO.md](benchmarks/HISTORICO.md).

### 5.3 Otimização da lista do usuário

[benchmarks/otimizacao_dhelmise.md](benchmarks/otimizacao_dhelmise.md): 3 iterações, 24 trocas na triagem, 3
finalistas, **nenhuma confirmada** (ganhos de +2,7 a +4,6 pontos na triagem viraram −2,2 a +0,9 na confirmação).
Lista final = lista inicial, 56,9 % (IC 55,2–58,7).

Lição registrada do ciclo ([COACH.md](benchmarks/COACH.md)): o que moveu a régua foram erros grosseiros achados
olhando partidas perdidas por dentro (Ativo preso, ataque sem efeito, comprar até morrer), não ajuste fino.

---

## 6. Limitações e pendências

### 6.1 Lacunas de regra no simulador (declaradas)

- "Fornece todos os tipos de Energia, um por vez": Prism, Legacy e Neo Upper ficam aproximadas.
- Anulação de habilidades do oponente (Psyduck, Genesect, Patrat).
- Transformation Tome; Meganium (energia valendo por duas); 8 ataques de descarte variável com dano proporcional.
- 36 habilidades que o lint lista como não implementadas.
- 1,4 % das cópias do meta são Pokémon em impressão cujo texto difere da implementada; a cobertura ainda conta por nome.
- Efeito do Twinleaf que abre janela de escolha não é traduzido.

### 6.2 Limitações de dados

- Histórico de preços só existe a partir do primeiro snapshot local (mais a semente de fev/mar 2025).
- A raspagem do limitlesstcg.com quebra em silêncio se o HTML mudar.
- Galerias (Trainer Gallery, Shiny Vault etc.) são sets separados numa fonte e parte do set principal na outra.
- Licença de `pokemon-tcg-data` e `pokemon_tcg_stockmarket` não está registrada no projeto; o projeto não tem `LICENSE`.

### 6.3 Pendências abertas

| # | Pendência |
|---|---|
| P1 | **Espelho da régua v5 não produz dado**: as duas linhas mostram `0.0 % (IC 0.0 %–100.0 %)`. Ninguém investigou |
| P2 | Experimento do técnico não executado: mandar só partidas **perdidas** de um confronto ruim e perguntar em que turno a partida virou |
| P3 | Subir a cobertura comprovada: faltam provas para receitas escritas à mão e ataques classificados por IA |
| P4 | Validação de deck: 4 cópias, legalidade Standard, Pokémon Básico |
| P5 | README diz cobertura exata 94,7 % (L171) e 94,9 % (L284) sem reconciliar |
| P6 | `pyproject.toml:4` e o título do README descrevem só a busca |
| P7 | Resíduos: `teste.txt` na raiz; `TCGDEX_ASSETS_BASE`, `IMAGE_MODE`, papel `play` e tabela `card_attributes` sem uso |
