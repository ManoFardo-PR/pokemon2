You are a strict reviewer. Your only job is to decide whether the OUTPUT below delivers exactly what the PROMPT asked, in the required format. Do not request improvements beyond the request. Do not redo the work.

STAGE: Stage 1 - Planning (round 1)

================================================================================
PROMPT THAT WAS SENT TO THE WORKER:
================================================================================
You are a Principal Software Architect and Tech Lead. Your job is to gather every piece of context needed for subtask X04 and produce a SELF-CONTAINED MASTER PLAN. The later stages (test writer, implementer, auditor) will NOT read the workspace: everything they need must be inside your plan.

SUBTASK: X04
PROJECT: Meu_Board_2
TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`
TYPE CHECK / COMPILE: `python -m compileall -q tests`
PROJECT CONVENTIONS (hint from config, may be empty): Each demo lives in its own folder under tests/<demo>/; production code in <demo>/src/<module>.py (package with __init__.py), tests as <demo>/test_<module>.py importing `from src.<module> import ...`.
FILES TO READ FIRST (from the task, may be empty): tests/hello_demo/src/hello.py, tests/hello_demo/test_shout.py

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
# [X04] X04 — Sussurro (whisper) no mesmo módulo

# X04 — Sussurro (whisper) no mesmo módulo

| Campo | Valor |
|---|---|
| Estágio | Demo hello (tests/hello_demo/) |
| ID Tarefa | X04 |
| Depende de | X03 |
| Desbloqueia | X05 |
| Ordem de lançamento | 4 |

<!-- depends_on: X03 -->
<!-- seq: 4 -->

## 🎯 Objetivo
Acrescentar whisper(name) ao módulo hello.py existente, por edição, sem alterar as funções anteriores.

## 🔍 Contexto
O módulo tests/hello_demo/src/hello.py já tem hello(), bye() e shout(). whisper devolve a saudação de hello() em minúsculas com '...' no fim.

## 📥 Entradas (Inputs)
- nome (str)

## 📤 Saídas Esperadas (Outputs)
- Função `whisper(name: str) -> str` acrescentada em `tests/hello_demo/src/hello.py`

## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)
```
def whisper(name: str) -> str
```

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-X04-01 | whisper('Ana') devolve exatamente 'hello, ana...'. |
| BR-X04-02 | Nome vazio ou só espaços devolve 'hello, stranger...'. |
| BR-X04-03 | hello(), bye() e shout() continuam com o comportamento anterior. |

## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)
- whisper('Ana') == 'hello, ana...'
- whisper('') == 'hello, stranger...'
- shout('Ana') == 'HELLO, ANA!' (regressão)

## ✅ Critérios de aceite (done_when)
- Todos os testes em tests/hello_demo passam
- hello.py foi editado (patch), não reescrito

## 📖 Arquivos para ler primeiro (o planejador começa por estes)
- `tests/hello_demo/src/hello.py`
- `tests/hello_demo/test_shout.py`

## 📁 Arquivos Alvo a Criar/Editar
- `tests/hello_demo/src/hello.py`
- `tests/hello_demo/test_whisper.py`


================================================================================
OUTPUT THE WORKER RETURNED:
================================================================================
### 1. Objective and Context
- **Goal**: Add the `whisper(name: str) -> str` function to the existing module `tests/hello_demo/src/hello.py` via patching without modifying existing functions, and create comprehensive unit tests in `tests/hello_demo/test_whisper.py`.
- **Dependencies**: Depends on subtask X03 (which added `shout` to `hello.py` and `test_shout.py`). Unlocks subtask X05.
- **Current Workspace State**:
  - `tests/hello_demo/src/hello.py` contains `hello(name: str) -> str`, `bye(name: str) -> str`, and `shout(name: str) -> str`.
  - Existing test suites: `tests/hello_demo/test_hello.py`, `tests/hello_demo/test_bye.py`, `tests/hello_demo/test_shout.py`.
  - All existing tests currently pass with `python -m unittest discover -s tests/hello_demo -v`.

### 2. Target Files

| Path | Role | Action | Purpose |
|---|---|---|---|
| tests/hello_demo/src/hello.py | src | patch | Append `whisper(name: str) -> str` preserving `hello`, `bye`, and `shout` |
| tests/hello_demo/test_whisper.py | test | create | Unit tests for `whisper` and regression assertions for `hello`, `bye`, `shout` |

### 3. Technical Requirements and Contracts
- **Interface Signature**:
  ```python
  def whisper(name: str) -> str
  ```
- **Business Rules**:
  - **BR-X04-01**: `whisper('Ana')` returns exactly `'hello, ana...'`.
  - **BR-X04-02**: Empty name or whitespace-only name returns `'hello, stranger...'`.
  - **BR-X04-03**: `hello()`, `bye()`, and `shout()` retain their previous behavior with zero regressions.
- **Edge Cases & Error Handling**:
  - Empty string `""` -> `'hello, stranger...'`.
  - Whitespace-only string `'   '` or `'\t \n'` -> `'hello, stranger...'`.
  - Leading/trailing whitespace (e.g. `'  Ana '`) -> trimmed and formatted as `'hello, ana...'`.
  - Uppercase and mixed-case names are lowercased along with the greeting prefix.

### 4. Test Scenarios (RED phase)
- **Import Statement**:
  ```python
  from src.hello import whisper, hello, bye, shout
  ```
- **Assertion Scenarios**:
  - `self.assertEqual(whisper('Ana'), 'hello, ana...')` (BR-X04-01: valid name)
  - `self.assertEqual(whisper(''), 'hello, stranger...')` (BR-X04-02: empty string)
  - `self.assertEqual(whisper('   '), 'hello, stranger...')` (BR-X04-02: spaces only)
  - `self.assertEqual(whisper('\t \n'), 'hello, stranger...')` (BR-X04-02: tabs and newlines only)
  - `self.assertEqual(whisper('  Ana'), 'hello, ana...')` (BR-X04-01 & whitespace trimming: leading whitespace)
  - `self.assertEqual(whisper('Ana  '), 'hello, ana...')` (BR-X04-01 & whitespace trimming: trailing whitespace)
  - `self.assertEqual(whisper('  bo '), 'hello, bo...')` (BR-X04-01: mixed case with whitespace)
  - `self.assertEqual(shout('Ana'), 'HELLO, ANA!')` (BR-X04-03: shout regression)
  - `self.assertEqual(hello('Ana'), 'Hello, Ana')` (BR-X04-03: hello regression)
  - `self.assertEqual(bye('Ana'), 'Bye, Ana')` (BR-X04-03: bye regression)

### 5. Architecture and Coding Constraints
- **Runtime and Standard Library**: Python 3 standard library only (`unittest`), no third-party dependencies.
- **Verification Commands** (run from repository root):
  - Test runner: `python -m unittest discover -s tests/hello_demo -v`
  - Compile / check: `python -m compileall -q tests`
- **Conventions**:
  - Patch `tests/hello_demo/src/hello.py` by appending the `whisper` function; do not rewrite or alter existing lines.
  - Test file `tests/hello_demo/test_whisper.py` follows the pattern of `test_shout.py` (inherits `unittest.TestCase`, includes `if __name__ == '__main__': unittest.main()`).
- **Implementation Mechanism**:
  `whisper(name)` can be implemented as `f"{hello(name).lower()}..."` leveraging the existing normalization in `hello()`.

### 6. Existing Code This Task Depends On
- **File**: `tests/hello_demo/src/hello.py`
  - **Exact Signatures and Implementation**:
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
    ```
- **File**: `tests/hello_demo/test_shout.py`
  - **Pattern Reference**:
    ```python
    import unittest
    from src.hello import shout, hello, bye

    class TestShout(unittest.TestCase):
        def test_shout_valid_name(self):
            self.assertEqual(shout('Ana'), 'HELLO, ANA!')
        ...
    if __name__ == '__main__':
        unittest.main()
    ```
================================================================================
AUTOMATED CHECKS RUN BY THE ORCHESTRATOR ON THAT OUTPUT:
================================================================================
Sections found: [1, 2, 3, 4, 5, 6]
Files in section 2: tests/hello_demo/src/hello.py (src/patch), tests/hello_demo/test_whisper.py (test/create)
Task target files: tests/hello_demo/src/hello.py, tests/hello_demo/test_whisper.py
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
