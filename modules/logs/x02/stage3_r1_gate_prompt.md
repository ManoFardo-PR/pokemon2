You are a strict reviewer. Your only job is to decide whether the OUTPUT below delivers exactly what the PROMPT asked, in the required format. Do not request improvements beyond the request. Do not redo the work.

STAGE: Stage 3 - TDD GREEN (implementation) (round 1)

================================================================================
PROMPT THAT WAS SENT TO THE WORKER:
================================================================================
You are a Senior Software Engineer. You are executing the GREEN phase of subtask X02: write the minimum production code that makes the RED tests pass while honoring the plan.

TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`
TYPE CHECK / COMPILE: `python -m compileall -q tests`

================================================================================
MASTER PLAN (output of Stage 1). It is self-contained: do not read the workspace.
Sections 2, 3, 5 and 6 define files, contracts, constraints and existing code.
================================================================================
### 1. Objective and Context
- **Goal:** Add the `bye(name: str) -> str` farewell function to the existing `hello.py` module via patch, without modifying the existing `hello(name: str) -> str` function.
- **Dependencies:** Subtask X01 (already completed; created `tests/hello_demo/src/hello.py` and `tests/hello_demo/test_hello.py`).
- **Current Workspace State:**
  - `tests/hello_demo/src/__init__.py` exists (package marker).
  - `tests/hello_demo/src/hello.py` exists with `def hello(name: str) -> str`.
  - `tests/hello_demo/test_hello.py` exists with tests for `hello()`.

### 2. Target Files
| Path | Role | Action | Purpose |
|---|---|---|---|
| `tests/hello_demo/test_bye.py` | test | create | Unit tests for `bye()` function and regression check for `hello()` |
| `tests/hello_demo/src/hello.py` | src | patch | Append `bye(name: str) -> str` implementation while keeping `hello()` unchanged |

### 3. Technical Requirements and Contracts
- **Interface Signature:**
  ```python
  def bye(name: str) -> str:
  ```
- **Business Rules:**
  - **BR-X02-01:** `bye('Ana')` returns exactly `'Bye, Ana'`.
  - **BR-X02-02:** Empty string or whitespace-only name returns `'Bye, stranger'`.
  - **BR-X02-03:** `hello()` retains its exact behavior from X01 without modification.
- **Error Handling & Edge Cases:**
  - Leading and trailing whitespace must be trimmed before evaluation (e.g., `'  Bo  '` -> `'Bye, Bo'`).
  - Whitespace-only strings (spaces, tabs, newlines) evaluate to empty after trim and return `'Bye, stranger'`.

### 4. Test Scenarios (RED phase)
- **Import Statement:**
  ```python
  from src.hello import bye, hello
  ```
- **Assertions:**
  - `self.assertEqual(bye('Ana'), 'Bye, Ana')` (BR-X02-01: valid name)
  - `self.assertEqual(bye(''), 'Bye, stranger')` (BR-X02-02: empty string)
  - `self.assertEqual(bye('   '), 'Bye, stranger')` (BR-X02-02: whitespace-only string)
  - `self.assertEqual(bye('\t \n'), 'Bye, stranger')` (BR-X02-02: tab/newline whitespace)
  - `self.assertEqual(bye('  Bo  '), 'Bye, Bo')` (BR-X02-01: surrounding whitespace trimmed)
  - `self.assertEqual(bye('  Ana'), 'Bye, Ana')` (BR-X02-01: leading whitespace trimmed)
  - `self.assertEqual(bye('Ana  '), 'Bye, Ana')` (BR-X02-01: trailing whitespace trimmed)
  - `self.assertEqual(hello('Ana'), 'Hello, Ana')` (BR-X02-03: regression test for hello)

### 5. Architecture and Coding Constraints
- **Language & Runtime:** Python 3.10+ (standard library only; no external dependencies).
- **Test Framework:** `unittest` runner invoked via `python -m unittest discover -s tests/hello_demo -v`.
- **Packaging & Imports:** Production code in package `src` under `tests/hello_demo/src/`; tests under `tests/hello_demo/` import with `from src.hello import ...`.
- **Patch Constraint:** `tests/hello_demo/src/hello.py` must be updated by patching (appending `bye` after two blank lines), never rewritten or deleting existing lines of `hello()`.
- **Assumptions:** Input `name` is always a string (`str`). No custom exceptions need to be raised.

### 6. Existing Code This Task Depends On
- **File:** `tests/hello_demo/src/hello.py`
  - **Signatures & Full Implementation:**
    ```python
    def hello(name: str) -> str:
        cleaned = name.strip()
        if not cleaned:
            return "Hello, stranger"
        return f"Hello, {cleaned}"
    ```
- **File:** `tests/hello_demo/test_hello.py`
  - **Existing test structure:**
    ```python
    import unittest
    from src.hello import hello

    class TestHello(unittest.TestCase):
        def test_hello_valid_name(self):
            self.assertEqual(hello("Ana"), "Hello, Ana")
            self.assertEqual(hello("World"), "Hello, World")

        def test_hello_empty_or_whitespace_only(self):
            self.assertEqual(hello(""), "Hello, stranger")
            self.assertEqual(hello(" "), "Hello, stranger")
            self.assertEqual(hello("   "), "Hello, stranger")
            self.assertEqual(hello("\t \n"), "Hello, stranger")

        def test_hello_trims_surrounding_whitespace(self):
            self.assertEqual(hello("  Ana"), "Hello, Ana")
            self.assertEqual(hello("Ana  "), "Hello, Ana")
            self.assertEqual(hello("  Ana  "), "Hello, Ana")
            self.assertEqual(hello("  Ana Maria  "), "Hello, Ana Maria")

    if __name__ == "__main__":
        unittest.main()
    ```
================================================================================
RED TESTS (output of Stage 2). The production code MUST make all of them pass:
================================================================================
### FILE: tests/hello_demo/test_bye.py
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
CURRENT CONTENT OF FILES THAT ALREADY EXIST (injected by the orchestrator; empty if none):
================================================================================
### CURRENT CONTENT: tests/hello_demo/src/hello.py
```python
def hello(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Hello, stranger"
    return f"Hello, {cleaned}"
```

================================================================================

RULES:
1. Implement the MINIMUM production code that satisfies every test and every contract in section 3. Do not modify test files.
2. Use exactly the paths, roles and actions of section 2 and the signatures of section 3. Only files with Role other than test.
3. For a file with Action = patch, return a PATCH with exact edits copied from CURRENT CONTENT. Return a full FILE only for Action = create or rewrite.
4. Rely on section 6 for existing code. Do not read the workspace.
5. You have no write tools. Return the files in the format below; the orchestrator writes them to disk.
6. Return only what you create or change. Never return a file that is unchanged.
7. If a FEEDBACK section is present above, fix exactly the problems it lists and return the complete corrected output (all files you create or change), not just the delta.

OUTPUT FORMAT (mandatory).
For a NEW file (Action = create) or a full rewrite (Action = rewrite):

### FILE: relative/path/from/repo/root/module.py
```python
def function(x: int) -> int:
    return x
```

For an EXISTING file (Action = patch), one or more exact edits. SEARCH must be copied verbatim from CURRENT CONTENT and must match exactly one place:

### PATCH: relative/path/from/repo/root/module.py
<<<<<<< SEARCH
def function(x: int) -> int:
    return x
=======
def function(x: int) -> int:
    return x


def other(y: int) -> int:
    return y * 2
>>>>>>> REPLACE

The code fence must come IMMEDIATELY after the `### FILE:` line. Nothing between the heading and the fence. Any short explanation goes before the first heading.

================================================================================
OUTPUT THE WORKER RETURNED:
================================================================================
### PATCH: tests/hello_demo/src/hello.py
<<<<<<< SEARCH
def hello(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Hello, stranger"
    return f"Hello, {cleaned}"
=======
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
>>>>>>> REPLACE
================================================================================
AUTOMATED CHECKS RUN BY THE ORCHESTRATOR ON THAT OUTPUT:
================================================================================
Written: tests/hello_demo/src/hello.py
Compile OK.
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
