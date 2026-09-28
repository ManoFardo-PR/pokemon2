# Orquestrador TDD Autônomo

Pipeline headless que pega uma issue do GitHub, planeja, escreve testes (RED), escreve código (GREEN), valida localmente, audita com LLM, faz commit e fecha a issue. Motor de IA: Continue CLI (`npx @continuedev/cli`). Estado: labels da issue. Tudo que vai à LLM está em `PROMPT/`, em inglês.

Tudo do orquestrador vive nesta pasta. A única coisa fora dela é `.continue/config.yaml` na raiz do projeto (config da CLI, com chaves de API; deve estar no `.gitignore`).

## Princípio: saídas autocontidas

Cada fase recebe um prompt completo (template + saída da fase anterior + conteúdo atual dos arquivos que vai editar, injetado pelo orquestrador) e devolve uma saída que basta para a fase seguinte. Só o Estágio 1 lê o workspace (ferramentas de leitura da CLI); o plano que ele produz registra o que descobriu, inclusive a seção "Existing code this task depends on", para as fases 2, 3 e 4 não precisarem reler nada.

## Pré-requisitos

- Python 3.12+ (só biblioteca padrão)
- Node 20+ com `npx` no PATH (a CLI é baixada no primeiro uso)
- `gh` autenticada (`gh auth status`) com acesso ao repositório
- `.continue/config.yaml` na raiz do projeto com ao menos um modelo (o primeiro é o usado)

## Replicar em outro projeto

1. Copiar a pasta `modules/` inteira para a raiz do novo repositório.
2. Criar `.continue/config.yaml` na raiz (ou apontar `continue_config` no `config.json` para outro caminho) e adicionar `.continue/` ao `.gitignore`.
3. Editar `modules/config.json`:

| Campo | Significado |
|---|---|
| `github_repo` | `usuario/repo`; vazio usa o remote da pasta atual |
| `continue_cli_path` | comando da CLI (`npx @continuedev/cli`) |
| `continue_config` | caminho do `config.yaml` da CLI, relativo a `modules/` |
| `repo_root` | raiz do repositório, relativa a `modules/` |
| `allowed_paths` | prefixos (relativos à raiz) onde a IA pode gravar; `[]` = todo o repo. Os destinos reais vêm do plano |
| `forbidden_paths` | prefixos nunca graváveis (padrão `modules`, `.git`, `.continue`) |
| `project_conventions` | texto livre injetado no planejador como dica de layout (nunca como regra do código) |
| `test_command` / `typecheck_command` | rodados na raiz do repo |
| `trigger_label` / `failed_label` | fila e desistência |
| `max_retries` | tentativas GREEN por issue (validação local ou auditoria reprovada) |
| `verify_stages` | fases com portão LLM (padrão `[1, 2, 3]`); `[]` desliga |
| `verify_max_rounds` | reworks por fase antes de seguir ou desistir (padrão 2) |
| `audit_mode` | `llm` (padrão: auditor LLM no Estágio 4) ou `local` (fecha quando compilação e testes passam, sem chamada) |
| `cli_retries` / `cli_retry_wait_sec` | repetições da chamada à CLI quando a resposta vem vazia ou dá timeout, e espera entre elas |
| `live_log` / `live_log_max_mb` / `console_verbose` | trilha viva para o monitor, rotação, e corpo completo no console |
| `max_inject_chars` | limite do conteúdo de arquivos existentes injetado nos prompts |
| `max_diff_chars` | limite do diff enviado à auditoria |

4. Criar as issues. Título `[T01] Descrição`, label gatilho, corpo conforme `ISSUE_TEMPLATE.md` (campos em `TESTE/backlog.schema.md`). `TESTE/seed_issues.py <arquivo.json> [--only X03,X04]` cria a partir de um backlog JSON já com a label.
5. Rodar:

```
python modules/main.py                 # interativo: lista a fila e pergunta o que rodar
python modules/main.py --once          # a primeira da fila e sai
python modules/main.py --batch 10      # as 10 primeiras e sai
python modules/main.py --all           # toda a fila e sai
python modules/main.py --select 2,4-6  # índices da fila; ou --select "#12,#14" (números de issue)
python modules/main.py --issue 4       # só a issue #4
python modules/main.py --poll          # polling contínuo (automação; padrão quando não há terminal)
python modules/main.py --verbose ...   # prompts e respostas completos também no console
```

### Seletor de batelada (modo interativo)

Sem flags, num terminal, o orquestrador lista a fila (label gatilho, sem `tdd-failed`) em ordem crescente de número, com índice, task, estado atual (retomada) e título, e pergunta:

```
[1] primeira   [10] dez primeiras   [a] todas   [2,4-6] índices   [#12,#14] issues   [r] recarregar   [q] sair
```

Um número sozinho significa "as N primeiras". Listas aceitam índices da tabela, intervalos e números de issue com `#`; a batelada roda sempre na ordem da tabela. Ao terminar, mostra o resumo (concluídas, falhas, chamadas à LLM, tempo) e volta ao menu com a fila recarregada.

### Dependências (obrigatórias)

Toda issue declara de quem depende no corpo: `| Depende de | T02, T03 |` (ou `Nenhuma` para raiz) e o marcador `<!-- depends_on: T02,T03 -->`, que o seeder gera e tem prioridade na leitura. A fila é ordenada topologicamente (desempate por `<!-- seq: N -->` e depois por número) e cada issue só executa quando todas as dependências estão fechadas. Na tabela do seletor, a coluna "situação" mostra:

| Situação | Significado | Selecionável |
|---|---|---|
| `pronta` | todas as dependências fechadas | sim |
| `após #12` | depende de issue que está na própria fila; roda depois dela na mesma batelada | sim |
| `BLOQUEADA: ...` | dependência aberta fora da fila, com `tdd-failed`, inexistente, em ciclo, ou bloqueada por sua vez | não |
| `SEM DEPENDÊNCIA` | corpo sem declaração; edite a issue (`Nenhuma` para raiz) | não |

Antes de cada issue da batelada o orquestrador reavalia: se uma dependência que rodou antes falhou, a dependente é pulada com aviso (sem comentário no GitHub) e aparece no resumo como "pulada". `--issue N` força a execução mesmo bloqueada, com aviso.

O seeder garante a regra no backlog JSON: item sem `depends_on` recebe o item anterior na ordem do arquivo (o primeiro vira `Nenhuma`), `unblocks` e `seq` são recalculados e gravados de volta no arquivo; duplicatas, dependências inexistentes e ciclos abortam antes de criar qualquer issue; `--dry-run` só valida e mostra.

### Monitor ao vivo (segundo terminal)

Tudo que acontece vai para `modules/logs/live.log` em ordem cronológica: prompt completo enviado, resposta completa, relatório das checagens, veredito do portão, cada arquivo gravado (com o conteúdo ou os blocos SEARCH/REPLACE), validação local, auditoria, git e GitHub. Em outro terminal:

```
python modules/monitor.py                          # segue a partir de agora, com cores
python modules/monitor.py --from-start             # desde o início do arquivo
python modules/monitor.py --only GATE,FILE_WRITE   # filtra por tipo de evento
python modules/monitor.py --task X01 --no-body     # só cabeçalhos de uma task
python modules/monitor.py --max-lines 20           # corpos truncados
python modules/monitor.py --once --no-body         # imprime o que existe e sai
```

A CLI em modo `-p` só imprime ao terminar; enquanto ela roda, o monitor mostra `LLM_WAIT` a cada 15 s com o tempo decorrido. O arquivo rotaciona em `live_log_max_mb` (`live.1.log`) e está no `.gitignore`.

## Como funciona

| Estágio | Prompt | Label | O que acontece |
|---|---|---|---|
| 1 Plano | `PROMPT_01.MD` | `tdd-context` | Corpo da issue vira plano com 6 seções. Seção 2 é uma tabela Path / Role / Action / Purpose que decide onde cada arquivo vai. |
| 2 RED | `PROMPT_02.MD` | `tdd-red` | Plano + conteúdo atual dos testes existentes viram arquivos de teste. Gravados, compilados e executados: devem falhar. |
| 3 GREEN | `PROMPT_03.MD` | `tdd-green` | Plano + testes + conteúdo atual dos arquivos de produção viram código. Arquivos existentes são editados por `PATCH`, não reescritos. |
| 4 Auditoria | `PROMPT_04.MD` | `tdd-audit` | `typecheck_command` + `test_command`; se passam, o auditor LLM recebe plano, diff e relatório e decide `VERDICT: OK` ou `NOT OK`. Falha volta ao Estágio 3 com o relatório injetado, até `max_retries`. |
| Fim | | (nenhuma) | `logs/<task>.log.md` com eventos e contagem de chamadas à LLM, `git commit` dos arquivos tocados + log, comentário final, issue fechada. |

### Portão por fase (CORRECT / REWORK)

Depois de cada fase 1, 2 e 3 rodam duas verificações:

1. Determinística, custo zero: seções do plano e cobertura dos arquivos alvo da issue (fase 1); blocos aplicáveis só em arquivos de papel `test`, compilação e RED falhando (fase 2); blocos só em arquivos de papel não-`test`, compilação (fase 3).
2. LLM (`VERIFY.MD`), só se a determinística passou: recebe o prompt enviado, a saída e o relatório das checagens, e responde `VERDICT: CORRECT` ou `REWORK` com motivos.

Em REWORK a fase repete com `FEEDBACK_REWORK.MD` (saída anterior + motivos) dentro do mesmo prompt. Proteções: `verify_max_rounds`, detector de saída idêntica (encerra na hora), e ao esgotar: segue com aviso se a determinística passa, `tdd-failed` se não. Cada rodada vira um comentário `🔎 [Gate fase X, rodada n]` na issue e um evento no `.log.md`.

### Contrato de resposta da IA

A CLI roda com `--readonly` (lê o workspace, não escreve). Arquivos vêm como:

```
### FILE: caminho/novo.py          (Action = create ou rewrite)
```python
...conteúdo completo...
```

### PATCH: caminho/existente.py    (Action = patch)
<<<<<<< SEARCH
trecho exato copiado do CURRENT CONTENT
=======
trecho novo
>>>>>>> REPLACE
```

O orquestrador aplica: SEARCH deve ocorrer uma única vez (tolerância a espaços à direita); `FILE` sobre arquivo existente marcado `patch` no plano é recusado; blocos idênticos ao disco são ignorados e informados; caminhos fora de `allowed_paths` ou dentro de `forbidden_paths` são recusados. Recusas viram feedback para a LLM, não falha.

### Retomada e desistência

`logs/<task>/` guarda prompts, respostas, plano e testes. Se o processo cair, na próxima execução o plano é reaproveitado e, se a issue já tem `tdd-red`, os testes também. Após `max_retries` ou verificação determinística irrecuperável, a issue recebe `tdd-failed` com o motivo e sai da fila; remover a label recoloca na fila.

## Arquivos

- `main.py`: `load_config`, `Orchestrator` (estágios, portão, aplicação de blocos, encerramento), modos de execução
- `reporter.py`: trilha viva `logs/live.log` e resumo no console; `monitor.py`: acompanha a trilha em outro terminal; `selector.py`: tabela e menu da batelada
- `dependency.py`: leitura da declaração de dependência, índice de issues, prontidão e ordem topológica
- `continue_cli.py`: chamada à CLI (prompt por stdin, sem shell, retry), parser de `FILE`/`PATCH`, extração de veredito
- `file_ops.py`: cerca de segurança, `apply_patch`, snapshot/restore, linguagem da cerca de código
- `github_handler.py`: `gh` CLI (labels, issues, comentários via `--body-file`)
- `validation_handler.py`: `run_terminal_command`, testes, typecheck, relatório de erros
- `decision_engine.py` + `auto_rules.json`: aprovação por tipo de ação (`AUTO_APPROVE` para headless)
- `PROMPT/`: `PROMPT_01..04.MD` (estágios), `VERIFY.MD` (portão), `FEEDBACK_*.MD` (retroalimentações). Tudo em inglês; nada que vá à LLM fica no código
- `TESTE/`: `backlog.json` (validador de CPF), `backlog_hello_demo.json` (demo de patch), `backlog.schema.md`, `seed_issues.py`
- `PROMPT/BACKLOG_FROM_SPECS.MD`: prompt para uma IA gerar o backlog JSON a partir dos arquivos de especificação de outro projeto (preencha os `{{...}}`, cole num assistente com acesso ao repositório, salve o JSON em `TESTE/` e rode `seed_issues.py <arquivo> --dry-run` antes de criar as issues)
- `ISSUE_TEMPLATE.md`: modelo para criar issues à mão
- `poc_phase1..4.py`: provas de conceito por fase
- `logs/`: artefatos por task e `.log.md` finais; `logs/tmp/` é descartável

## Custo medido (25/09/2026, Gemini Flash via Continue CLI)

| Task | Portão LLM | Chamadas à LLM | Chars enviados | Dos quais portões | Tempo |
|---|---|---|---|---|---|
| T01 (CPF, 1 regra) | desligado | 4 | 20 K | 0 | ~2 min |
| X01 (hello, 3 regras) | fases 1, 2, 3 | 7 | 55 K | 29 K (53%) | ~2 min |
| X02 (bye por PATCH) | fases 1, 2, 3 | 7 | 62 K | 33 K (53%) | ~2 min |

O portão dobra o volume enviado porque cada verificação recebe o prompt inteiro da fase. Para tasks pequenas e confiáveis, `verify_stages: [1, 2]` ou `[]` corta esse custo.

## Limitações conhecidas e backlog

- Um único modelo para todos os estágios (a CLI não seleciona modelo do `config.yaml` por flag; `model_type` é ignorado).
- O portão LLM custa uma chamada extra por rodada com o prompt da fase dentro; se pesar, reduza `verify_stages`.
- A auditoria LLM só roda quando compilação e testes passam; falhas locais voltam direto ao Estágio 3.
- No Windows a CLI 1.5.47 às vezes aborta na saída (assert do libuv, exit 3221226505) depois de imprimir a resposta completa; o orquestrador julga sucesso pelo stdout.
- A CLI não aceitou `--prompt <arquivo>` como prompt em modo `-p`; por isso o prompt vai por stdin.
- `mcpServers` do `config.yaml` são iniciados a cada chamada da CLI; remova os que não usa para acelerar (esse arquivo é seu; o orquestrador não o altera).
- Backlog: modo só-planejar (Estágio 1 e parar para aprovação), portão mais barato (só regras do template + saída), modo PR por batelada, anotações de tipo para o pyright.
