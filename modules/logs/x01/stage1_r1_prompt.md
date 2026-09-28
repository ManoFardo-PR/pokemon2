You are a Principal Software Architect and Tech Lead. Your job is to gather every piece of context needed for subtask X01 and produce a SELF-CONTAINED MASTER PLAN. The later stages (test writer, implementer, auditor) will NOT read the workspace: everything they need must be inside your plan.

SUBTASK: X01
PROJECT: Meu_Board_2
TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`
TYPE CHECK / COMPILE: `python -m compileall -q tests`
PROJECT CONVENTIONS (hint from config, may be empty): Each demo lives in its own folder under tests/<demo>/; production code in <demo>/src/<module>.py (package with __init__.py), tests as <demo>/test_<module>.py importing `from src.<module> import ...`.
FILES TO READ FIRST (from the task, may be empty): (none specified; explore as needed)

RULES:
1. The full specification of the subtask is at the end of this prompt (SPECIFICATION section). Do NOT look for a specification file on disk.
2. You MAY read files in the workspace (read-only tools) to learn what already exists: modules produced by earlier tasks, project layout, conventions. Start with FILES TO READ FIRST when given. Do not write or edit anything.
3. Decide where every file goes based on what you read in the project and on the specification. Use paths relative to the repository root. Do not invent a layout that contradicts the existing project.
4. If the specification provides interfaces or test scenarios, copy them exactly; do not reinterpret them. Do not add requirements that are not in the specification. If something is ambiguous, choose the simplest interpretation and record it in section 5.
5. Section 6 must contain the exact signatures (and short relevant excerpts) of every existing function, class or module that this task will call, extend or must stay compatible with. Later stages depend on this section instead of reading files.

OUTPUT FORMAT (mandatory: exactly these six sections, in this order, with these exact headings):

### 1. Objective and Context
[goal, dependencies on earlier tasks, what already exists in the workspace]

### 2. Target Files
A markdown table with one row per file to create or modify. Columns: Path | Role | Action | Purpose.
- Role is one of: test, src, config, doc
- Action is one of: create (new file), patch (edit an existing file with exact search/replace edits), rewrite (replace an existing file entirely; use only when a patch would be impractical)
Example:
| Path | Role | Action | Purpose |
|---|---|---|---|
| path/to/module.py | src | create | implements X |
| path/to/test_module.py | test | create | tests for X |

### 3. Technical Requirements and Contracts
[exact function/class signatures (name, parameters, types, return), numbered business rules (BR-...), error handling, edge cases]

### 4. Test Scenarios (RED phase)
[complete list of assertions the tests must cover, including edge cases; one line per assertion; include the exact import statement the tests must use]

### 5. Architecture and Coding Constraints
[language and runtime constraints, allowed dependencies, naming conventions, assumptions made]

### 6. Existing Code This Task Depends On
[for each existing file the implementation relies on: path, exact signatures, and short excerpts needed to use it correctly; write "None" if the task depends on nothing]

================================================================================
SPECIFICATION (source of truth for this subtask):
================================================================================
# [X01] X01 — Saudação (hello)

# X01 — Saudação (hello)

| Campo | Valor |
|---|---|
| Estágio | Demo hello (tests/hello_demo/) |
| ID Tarefa | X01 |
| Depende de | Nenhuma |
| Desbloqueia | X02 |

## 🎯 Objetivo
Criar o pacote tests/hello_demo/src e a função hello(name) que devolve 'Hello, <name>'.

## 🔍 Contexto
Primeira tarefa da demo; nada existe ainda. O pacote src precisa de __init__.py para os testes importarem `from src.hello import hello`.

## 📥 Entradas (Inputs)
- nome (str)

## 📤 Saídas Esperadas (Outputs)
- `tests/hello_demo/src/hello.py` com `hello(name: str) -> str`

## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)
```
def hello(name: str) -> str
```

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-X01-01 | hello('Ana') devolve exatamente 'Hello, Ana'. |
| BR-X01-02 | Nome vazio ou só espaços devolve 'Hello, stranger'. |
| BR-X01-03 | Espaços nas pontas do nome são removidos antes de montar a saudação. |

## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)
- (nenhum)

## ✅ Critérios de aceite (done_when)
- Todos os testes em tests/hello_demo passam com python -m unittest discover -s tests/hello_demo

## 📖 Arquivos para ler primeiro (o planejador começa por estes)
- (nenhum)

## 📁 Arquivos Alvo a Criar/Editar
- `tests/hello_demo/src/__init__.py`
- `tests/hello_demo/src/hello.py`
- `tests/hello_demo/test_hello.py`

