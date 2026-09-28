# Modelo de subtask (backlog.json, v2)

Cada item do backlog vira uma issue (`seed_issues.py`). O Estágio 1 (planejador) lê a issue e o workspace e produz um plano autocontido; quanto mais preciso o item, menos o planejador precisa explorar e inventar. O Estágio 1 nunca é pulado: mesmo com item completo, ele confere amplitude, dependências e correções.

| Campo | Obrigatório | Uso |
|---|---|---|
| `id` | sim | Vai no título como `[T01]`; vira o `task_id` do orquestrador (logs, commit). |
| `title` | sim | Título da issue. |
| `depends_on` | **obrigatório** (inferido se ausente) | Ids separados por vírgula, ou `Nenhuma` para raiz. Item sem a chave (ou vazia) recebe o id do item anterior na ordem do arquivo; o primeiro vira `Nenhuma`. O seeder grava a inferência de volta no JSON. O orquestrador só executa a issue quando todas as dependências estão fechadas ou vêm antes na mesma batelada; a fila é ordenada topologicamente. |
| `unblocks`, `seq` | não (calculados) | Inverso de `depends_on` e posição na ordem topológica; o seeder recalcula e grava. |
| `stage` | não | Agrupamento informativo. |
| `objective`, `context` | sim | O que e por quê. |
| `inputs`, `outputs` | não | Entradas e saídas em linguagem natural. |
| `interfaces` | recomendado | Assinaturas exatas (uma string por função/classe, em código). O planejador copia; não reinterpreta. |
| `business_rules` | sim | Lista de `{id, rule}`; cada regra vira teste e checagem da auditoria. |
| `test_scenarios` | não | Asserções já decididas. Se presentes, a seção 4 do plano as copia. |
| `done_when` | recomendado | Critérios de aceite objetivos. |
| `read_files` | não | Arquivos que o planejador deve ler primeiro (caminhos relativos à raiz). Vazio = exploração livre. |
| `target_files` | sim | Arquivos a criar ou editar. O orquestrador confere que a seção 2 do plano os cobre. |

Exemplo mínimo:

```json
{
  "id": "X01",
  "title": "X01 — Saudação",
  "objective": "Criar hello(name) que devolve 'Hello, <name>'.",
  "context": "Primeiro módulo da demo.",
  "interfaces": ["def hello(name: str) -> str"],
  "business_rules": [{"id": "BR-X01-01", "rule": "hello('Ana') devolve 'Hello, Ana'."}],
  "done_when": ["Testes passam com python -m unittest discover -s tests/hello_demo"],
  "read_files": [],
  "target_files": ["tests/hello_demo/src/__init__.py", "tests/hello_demo/src/hello.py", "tests/hello_demo/test_hello.py"]
}
```

O seeder valida antes de criar qualquer issue: ids duplicados, dependência que não existe nem no backlog nem no GitHub, e ciclos abortam. As issues são criadas em ordem topológica. `--dry-run` valida, grava a inferência no JSON e mostra os corpos sem criar nada.

O que o orquestrador lê no corpo renderizado: "Arquivos Alvo" (ou "Target Files"), "Arquivos para ler" (ou "Files to read"), a linha `| Depende de | ... |` (ou o marcador `<!-- depends_on: ... -->`, que tem prioridade) e `<!-- seq: N -->`. Ao criar uma issue à mão, use `modules/ISSUE_TEMPLATE.md`.
