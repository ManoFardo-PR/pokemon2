You are a strict reviewer. Your only job is to decide whether the OUTPUT below delivers exactly what the PROMPT asked, in the required format. Do not request improvements beyond the request. Do not redo the work.

STAGE: Stage 1 - Planning (round 1)

================================================================================
PROMPT THAT WAS SENT TO THE WORKER:
================================================================================
You are a Principal Software Architect and Tech Lead. Your job is to gather every piece of context needed for subtask X03 and produce a SELF-CONTAINED MASTER PLAN. The later stages (test writer, implementer, auditor) will NOT read the workspace: everything they need must be inside your plan.

SUBTASK: X03
PROJECT: Meu_Board_2
TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`
TYPE CHECK / COMPILE: `python -m compileall -q tests`
PROJECT CONVENTIONS (hint from config, may be empty): Each demo lives in its own folder under tests/<demo>/; production code in <demo>/src/<module>.py (package with __init__.py), tests as <demo>/test_<module>.py importing `from src.<module> import ...`.
FILES TO READ FIRST (from the task, may be empty): tests/hello_demo/src/hello.py, tests/hello_demo/test_bye.py

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
# [X03] X03 — Grito (shout) no mesmo módulo

# X03 — Grito (shout) no mesmo módulo

| Campo | Valor |
|---|---|
| Estágio | Demo hello (tests/hello_demo/) |
| ID Tarefa | X03 |
| Depende de | X02 |
| Desbloqueia | Nenhum |

## 🎯 Objetivo
Acrescentar shout(name) ao módulo hello.py existente, por edição, sem alterar hello() nem bye().

## 🔍 Contexto
O módulo tests/hello_demo/src/hello.py já tem hello() e bye() (X01, X02). shout devolve a saudação de hello() em maiúsculas com '!' no fim.

## 📥 Entradas (Inputs)
- nome (str)

## 📤 Saídas Esperadas (Outputs)
- Função `shout(name: str) -> str` acrescentada em `tests/hello_demo/src/hello.py`

## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)
```
def shout(name: str) -> str
```

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-X03-01 | shout('Ana') devolve exatamente 'HELLO, ANA!'. |
| BR-X03-02 | Nome vazio ou só espaços devolve 'HELLO, STRANGER!'. |
| BR-X03-03 | hello() e bye() continuam com o comportamento anterior. |

## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)
- shout('Ana') == 'HELLO, ANA!'
- shout('') == 'HELLO, STRANGER!'
- shout('  bo ') == 'HELLO, BO!'
- hello('Ana') == 'Hello, Ana' e bye('Ana') == 'Bye, Ana' (regressão)

## ✅ Critérios de aceite (done_when)
- Todos os testes em tests/hello_demo passam
- hello.py foi editado (patch), não reescrito

## 📖 Arquivos para ler primeiro (o planejador começa por estes)
- `tests/hello_demo/src/hello.py`
- `tests/hello_demo/test_bye.py`

## 📁 Arquivos Alvo a Criar/Editar
- `tests/hello_demo/src/hello.py`
- `tests/hello_demo/test_shout.py`


================================================================================
OUTPUT THE WORKER RETURNED:
================================================================================
### 1. Objective and Context
- **Goal**: Add the function `shout(name: str) -> str` to the existing module `tests/hello_demo/src/hello.py` by patching it without altering `hello()` or `bye()`, and add corresponding tests in `tests/hello_demo/test_shout.py`.
- **Dependencies**: Depends on task X02 (which added `bye()` to `hello.py`).
- **Workspace State**:
  - `tests/hello_demo/src/__init__.py` exists.
  - `tests/hello_demo/src/hello.py` exists with `hello(name: str) -> str` and `bye(name: str) -> str`.
  - `tests/hello_demo/test_hello.py` and `tests/hello_demo/test_bye.py` exist and pass.

### 2. Target Files
| Path | Role | Action | Purpose |
|---|---|---|---|
| tests/hello_demo/src/hello.py | src | patch | Add `shout(name: str) -> str` function without altering existing functions |
| tests/hello_demo/test_shout.py | test | create | Unit tests for `shout()` including edge cases and regressions for `hello()` and `bye()` |

### 3. Technical Requirements and Contracts
- **Interface**:
  ```python
  def shout(name: str) -> str
  ```
- **Business Rules**:
  - `BR-X03-01`: `shout('Ana')` returns exactly `'HELLO, ANA!'`.
  - `BR-X03-02`: Empty string or whitespace-only name returns `'HELLO, STRANGER!'`.
  - `BR-X03-03`: `hello()` and `bye()` preserve their existing behavior without modification.
- **Edge Cases & Error Handling**:
  - Leading and trailing whitespace must be trimmed (e.g., `'  bo '` -> `'HELLO, BO!'`).
  - Whitespace characters including tabs and newlines (e.g., `'\t \n'`) must be treated as empty and return `'HELLO, STRANGER!'`.

### 4. Test Scenarios (RED phase)
Exact import required in `tests/hello_demo/test_shout.py`:
```python
from src.hello import shout, hello, bye
```

Assertions to cover:
- `self.assertEqual(shout('Ana'), 'HELLO, ANA!')`
- `self.assertEqual(shout(''), 'HELLO, STRANGER!')`
- `self.assertEqual(shout('   '), 'HELLO, STRANGER!')`
- `self.assertEqual(shout('\t \n'), 'HELLO, STRANGER!')`
- `self.assertEqual(shout('  bo '), 'HELLO, BO!')`
- `self.assertEqual(shout('  Ana'), 'HELLO, ANA!')`
- `self.assertEqual(shout('Ana  '), 'HELLO, ANA!')`
- `self.assertEqual(hello('Ana'), 'Hello, Ana')` (regression check)
- `self.assertEqual(bye('Ana'), 'Bye, Ana')` (regression check)

### 5. Architecture and Coding Constraints
- **Language / Runtime**: Python 3.10+ standard library only; no external dependencies.
- **Test Runner**: Executable via `python -m unittest discover -s tests/hello_demo -v`.
- **Compilation / Syntax Check**: Verifiable via `python -m compileall -q tests`.
- **Packaging & Imports**: Tests live under `tests/hello_demo/` and import `from src.hello import shout, hello, bye`.
- **Modification Constraint**: `tests/hello_demo/src/hello.py` must be patched (append `shout`), never rewritten or deleting existing implementations.
- **Assumptions**: `shout(name)` can directly delegate to `hello(name)` via `f"{hello(name)}!".upper()` to maintain consistency and avoid duplication.

### 6. Existing Code This Task Depends On
**File**: `tests/hello_demo/src/hello.py`
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
```

**File**: `tests/hello_demo/test_bye.py` (structural reference)
```python
import unittest
from src.hello import bye, hello

class TestBye(unittest.TestCase):
    def test_bye_valid_name(self):
        self.assertEqual(bye('Ana'), 'Bye, Ana')

    def test_bye_empty_or_whitespace_only(self):
        self.assertEqual(bye(''), 'Bye, stranger')
        self.assertEqual(bye('   '), 'Bye, stranger')
        self.assertEqual(bye('\t \n'), 'Bye, stranger')

    def test_bye_trims_surrounding_whitespace(self):
        self.assertEqual(bye('  Bo  '), 'Bye, Bo')
        self.assertEqual(bye('  Ana'), 'Bye, Ana')
        self.assertEqual(bye('Ana  '), 'Bye, Ana')

    def test_hello_regression(self):
        self.assertEqual(hello('Ana'), 'Hello, Ana')

if __name__ == '__main__':
    unittest.main()
```
================================================================================
AUTOMATED CHECKS RUN BY THE ORCHESTRATOR ON THAT OUTPUT:
================================================================================
Sections found: [1, 2, 3, 4, 5, 6]
Files in section 2: tests/hello_demo/src/hello.py (src/patch), tests/hello_demo/test_shout.py (test/create)
Task target files: tests/hello_demo/src/hello.py, tests/hello_demo/test_shout.py
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
