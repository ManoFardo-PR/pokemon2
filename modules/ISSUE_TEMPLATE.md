# Título da issue: `[T01] T01 — Nome curto da tarefa`

Aplique a label gatilho (`trigger_label` do `config.json`, padrão `tdd-queue`). Copie o corpo abaixo e preencha. Mantenha os títulos "Arquivos Alvo" e "Arquivos para ler", a linha "Depende de" e o marcador `<!-- depends_on -->`: o orquestrador os lê.

A dependência é obrigatória: `Nenhuma` para raiz, ou ids separados por vírgula (`T02, T03`). Issue sem declaração fica bloqueada na fila até o corpo ser editado. A issue só executa quando todas as dependências estiverem fechadas (ou vierem antes na mesma batelada).

The rows `Depende de (outros estágios)`, `Desbloqueia (outros estágios)` and `Especificação` are optional and informational: the orchestrator does not use them for queue ordering (only `Depende de` and the `<!-- depends_on -->` marker count). When a body would exceed GitHub's 65,536-character limit, the seeder moves the trailing sections into comments that start with `<!-- continuação i/N -->`; the orchestrator merges those comments back into the specification in Stage 1. The file lists, the markers and the `Depende de` row always stay in the body.

---

| Campo | Valor |
|---|---|
| Estágio | (grupo da tarefa) |
| ID Tarefa | T01 |
| Depende de | Nenhuma |
| Desbloqueia | T02 |
| Ordem de lançamento | 1 |
| Depende de (outros estágios) | Nenhuma |
| Desbloqueia (outros estágios) | Nenhum |
| Especificação | `docs/stages/NN-slug/T01-nome-da-tarefa.md` |

<!-- depends_on: Nenhuma -->
<!-- seq: 1 -->

## 🎯 Objetivo
(o que deve existir ao final)

## 🔍 Contexto
(por que, e o que já existe)

## 📥 Entradas (Inputs)
- ...

## 📤 Saídas Esperadas (Outputs)
- ...

## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)
```
def funcao(param: tipo) -> retorno
```

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-T01-01 | ... |

## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)
- funcao(1) == 1
- funcao(None) levanta ValueError

## ✅ Critérios de aceite (done_when)
- ...

## 📖 Arquivos para ler primeiro (o planejador começa por estes)
- `caminho/relativo/arquivo.py`

## 📁 Arquivos Alvo a Criar/Editar
- `caminho/relativo/src/modulo.py`
- `caminho/relativo/test_modulo.py`
