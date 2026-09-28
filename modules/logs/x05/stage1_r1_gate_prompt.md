You are a strict reviewer. Your only job is to decide whether the OUTPUT below delivers exactly what the PROMPT asked, in the required format. Do not request improvements beyond the request. Do not redo the work.

STAGE: Stage 1 - Planning (round 1)

================================================================================
PROMPT THAT WAS SENT TO THE WORKER:
================================================================================
You are a Principal Software Architect and Tech Lead. Your job is to gather every piece of context needed for subtask X05 and produce a SELF-CONTAINED MASTER PLAN. The later stages (test writer, implementer, auditor) will NOT read the workspace: everything they need must be inside your plan.

SUBTASK: X05
PROJECT: Meu_Board_2
TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`
TYPE CHECK / COMPILE: `python -m compileall -q tests`
PROJECT CONVENTIONS (hint from config, may be empty): Each demo lives in its own folder under tests/<demo>/; production code in <demo>/src/<module>.py (package with __init__.py), tests as <demo>/test_<module>.py importing `from src.<module> import ...`.
FILES TO READ FIRST (from the task, may be empty): tests/hello_demo/src/hello.py, tests/hello_demo/test_whisper.py

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
# [X05] X05 — Saudação em lote (greet_all)

# X05 — Saudação em lote (greet_all)

| Campo | Valor |
|---|---|
| Estágio | Demo hello (tests/hello_demo/) |
| ID Tarefa | X05 |
| Depende de | X04 |
| Desbloqueia | Nenhum |
| Ordem de lançamento | 5 |

<!-- depends_on: X04 -->
<!-- seq: 5 -->

## 🎯 Objetivo
Acrescentar greet_all(names) que aplica hello() a cada nome, por edição do módulo existente.

## 🔍 Contexto
Reaproveita hello() do mesmo módulo. Lista vazia devolve lista vazia. Não alterar as funções anteriores.

## 📥 Entradas (Inputs)
- lista de nomes (list[str])

## 📤 Saídas Esperadas (Outputs)
- Função `greet_all(names: list[str]) -> list[str]` acrescentada em `tests/hello_demo/src/hello.py`

## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)
```
def greet_all(names: list[str]) -> list[str]
```

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-X05-01 | greet_all(['Ana', 'Bo']) devolve ['Hello, Ana', 'Hello, Bo']. |
| BR-X05-02 | greet_all([]) devolve []. |
| BR-X05-03 | Cada item segue as regras de hello() (espaços removidos; vazio vira 'Hello, stranger'). |

## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)
- greet_all(['Ana', 'Bo']) == ['Hello, Ana', 'Hello, Bo']
- greet_all([]) == []
- greet_all([' ']) == ['Hello, stranger']

## ✅ Critérios de aceite (done_when)
- Todos os testes em tests/hello_demo passam
- hello.py foi editado (patch), não reescrito

## 📖 Arquivos para ler primeiro (o planejador começa por estes)
- `tests/hello_demo/src/hello.py`
- `tests/hello_demo/test_whisper.py`

## 📁 Arquivos Alvo a Criar/Editar
- `tests/hello_demo/src/hello.py`
- `tests/hello_demo/test_greet_all.py`


================================================================================
OUTPUT THE WORKER RETURNED:
================================================================================
### 1. Objective and Context
- **Goal:** Implement the function `greet_all(names: list[str]) -> list[str]` in `tests/hello_demo/src/hello.py` by applying `hello()` to each name in the provided list, without altering existing functions.
- **Dependencies:** Subtask X04 (`whisper`).
- **Workspace State:** The workspace contains `tests/hello_demo/src/hello.py` defining `hello`, `bye`, `shout`, and `whisper`, along with unit tests `test_hello.py`, `test_bye.py`, `test_shout.py`, and `test_whisper.py`. All 21 existing unit tests are passing.

### 2. Target Files
| Path | Role | Action | Purpose |
|---|---|---|---|
| `tests/hello_demo/src/hello.py` | src | patch | Append `def greet_all(names: list[str]) -> list[str]` that maps `hello()` over `names`. |
| `tests/hello_demo/test_greet_all.py` | test | create | Unit tests for `greet_all` covering specified business rules, edge cases, and regression assertions. |

### 3. Technical Requirements and Contracts
- **Function Signature:**
  ```python
  def greet_all(names: list[str]) -> list[str]
  ```
- **Business Rules:**
  - **BR-X05-01:** `greet_all(['Ana', 'Bo'])` returns `['Hello, Ana', 'Hello, Bo']`.
  - **BR-X05-02:** `greet_all([])` returns `[]`.
  - **BR-X05-03:** Each item follows `hello()` formatting rules (surrounding whitespace trimmed; empty or whitespace-only strings yield `'Hello, stranger'`).
- **Implementation Contract:**
  - Must reuse `hello(name)` from `tests/hello_demo/src/hello.py` for each element in `names`.
  - Must return a new list of strings.
  - Must not modify or break `hello`, `bye`, `shout`, or `whisper`.
- **Edge Cases & Error Handling:**
  - Empty list: `greet_all([])` -> `[]`
  - Single whitespace item: `greet_all([' '])` -> `['Hello, stranger']`
  - Empty string item: `greet_all([''])` -> `['Hello, stranger']`
  - Whitespace-only items (tabs/newlines): `greet_all(['\t \n'])` -> `['Hello, stranger']`
  - Surrounding whitespace: `greet_all(['  Ana  '])` -> `['Hello, Ana']`
  - Mixed list: `greet_all(['Ana', ' ', 'Bo'])` -> `['Hello, Ana', 'Hello, stranger', 'Hello, Bo']`

### 4. Test Scenarios (RED phase)
- **Import Statement:**
  ```python
  import unittest
  from src.hello import greet_all, hello, bye, shout, whisper
  ```
- **Assertions:**
  - `self.assertEqual(greet_all(['Ana', 'Bo']), ['Hello, Ana', 'Hello, Bo'])` (BR-X05-01: multiple valid names)
  - `self.assertEqual(greet_all([]), [])` (BR-X05-02: empty input list returns empty list)
  - `self.assertEqual(greet_all([' ']), ['Hello, stranger'])` (BR-X05-03: single space string)
  - `self.assertEqual(greet_all(['']), ['Hello, stranger'])` (BR-X05-03: empty string item)
  - `self.assertEqual(greet_all(['\t \n']), ['Hello, stranger'])` (BR-X05-03: whitespace escape characters)
  - `self.assertEqual(greet_all(['  Ana  ']), ['Hello, Ana'])` (BR-X05-03: trims surrounding whitespace)
  - `self.assertEqual(greet_all(['Ana', ' ', 'Bo']), ['Hello, Ana', 'Hello, stranger', 'Hello, Bo'])` (mixed valid, empty/whitespace items)
  - `self.assertEqual(hello('Ana'), 'Hello, Ana')` (regression check for `hello`)
  - `self.assertEqual(bye('Ana'), 'Bye, Ana')` (regression check for `bye`)
  - `self.assertEqual(shout('Ana'), 'HELLO, ANA!')` (regression check for `shout`)
  - `self.assertEqual(whisper('Ana'), 'hello, ana...')` (regression check for `whisper`)

### 5. Architecture and Coding Constraints
- **Runtime:** Python 3.10+, standard library only (no third-party dependencies).
- **Test Runner:** Executed via `python -m unittest discover -s tests/hello_demo -v`.
- **Compile Verification:** Executed via `python -m compileall -q tests`.
- **Conventions:**
  - Production code strictly in `tests/hello_demo/src/hello.py`.
  - Tests strictly in `tests/hello_demo/test_greet_all.py` inheriting from `unittest.TestCase`.
  - Tests import using `from src.hello import greet_all, hello, bye, shout, whisper`.
  - `tests/hello_demo/src/hello.py` must be patched by appending the new function at the end, retaining all previous functions unmodified.
- **Assumptions:**
  - Parameter `names` is a `list[str]` (or iterable of strings).
  - Implementation is a list comprehension: `[hello(name) for name in names]`.

### 6. Existing Code This Task Depends On
**Path:** `tests/hello_demo/src/hello.py`
```python
def hello(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Hello, stranger"
    return f"Hello, {cleaned}"

def bye(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Bye, stranger"
    return f"Bye, {cleaned}"

def shout(name: str) -> str:
    return f"{hello(name)}!".upper()

def whisper(name: str) -> str:
    return f"{hello(name).lower()}..."
```

**Path:** `tests/hello_demo/test_whisper.py` (conventions reference)
```python
import unittest
from src.hello import whisper, hello, bye, shout

class TestWhisper(unittest.TestCase):
    def test_whisper_valid_name(self):
        self.assertEqual(whisper('Ana'), 'hello, ana...')
    ...
```
================================================================================
AUTOMATED CHECKS RUN BY THE ORCHESTRATOR ON THAT OUTPUT:
================================================================================
Sections found: [1, 2, 3, 4, 5, 6]
Files in section 2: tests/hello_demo/src/hello.py (src/patch), tests/hello_demo/test_greet_all.py (test/create)
Task target files: tests/hello_demo/src/hello.py, tests/hello_demo/test_greet_all.py
No problems.
================================================================================

Decide:
- CORRECT: the output contains everything the prompt required, in the required format, consistent with the inputs given to the worker, and the automated checks show no problem.
- REWORK: something required is missing, wrong, contradicts the inputs, violates the format, or the automated checks report a problem.

OUTPUT FORMAT (mandatory): first line is the verdict, then at most 5 bullet lines with objective reasons (what is missing or wrong, referencing the prompt requirement). Nothing else.
VERDICT: CORRECT
or
VERDICT: REWORK
- reason 1
- reason 2
