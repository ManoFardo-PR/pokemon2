You are a strict reviewer. Your only job is to decide whether the OUTPUT below delivers exactly what the PROMPT asked, in the required format. Do not request improvements beyond the request. Do not redo the work.

STAGE: Stage 2 - TDD RED (tests) (round 1)

================================================================================
PROMPT THAT WAS SENT TO THE WORKER:
================================================================================
You are a Senior QA Automation Engineer and TDD specialist. You are executing the RED phase (tests first) of subtask X02.

TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`

================================================================================
MASTER PLAN (output of Stage 1). It is self-contained: do not read the workspace.
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
CURRENT CONTENT OF FILES THAT ALREADY EXIST (injected by the orchestrator; empty if none):
================================================================================
(none)
================================================================================

RULES:
1. Do NOT write production code. Only the files marked with Role = test in section 2 of the plan.
2. Cover EVERY assertion in section 4 of the plan, plus the edge cases of the business rules in section 3.
3. Tests must be syntactically valid and runnable by the test runner above. They MUST fail now (production code does not exist yet) and pass once the code in section 3 is implemented.
4. Import the production code exactly as section 4 of the plan states. Never use relative imports unless the plan says so.
5. If the task has no testable logic (for example, it only creates a package), write at least one test that checks the module can be imported.
6. You have no write tools. Return the files in the format below; the orchestrator writes them to disk.
7. Return only what you create or change. Never return a file that is unchanged.

OUTPUT FORMAT (mandatory).
For a NEW file (Action = create) or a full rewrite (Action = rewrite):

### FILE: relative/path/from/repo/root/test_example.py
```python
import unittest
from package.module import function

class TestExample(unittest.TestCase):
    def test_case(self):
        self.assertEqual(function(1), 1)

if __name__ == "__main__":
    unittest.main()
```

For an EXISTING file (Action = patch), one or more exact edits. SEARCH must be copied verbatim from CURRENT CONTENT above and must match exactly one place:

### PATCH: relative/path/from/repo/root/test_example.py
<<<<<<< SEARCH
    def test_case(self):
        self.assertEqual(function(1), 1)
=======
    def test_case(self):
        self.assertEqual(function(1), 1)

    def test_other(self):
        self.assertEqual(function(2), 2)
>>>>>>> REPLACE

The code fence must come IMMEDIATELY after the `### FILE:` line. Nothing between the heading and the fence. Any short explanation goes before the first heading.

================================================================================
OUTPUT THE WORKER RETURNED:
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
AUTOMATED CHECKS RUN BY THE ORCHESTRATOR ON THAT OUTPUT:
================================================================================
Written: tests/hello_demo/test_bye.py
Compile OK. RED run failed as expected (exit 1):
```text
test_bye (unittest.loader._FailedTest.test_bye) ... ERROR
test_hello_empty_or_whitespace_only (test_hello.TestHello.test_hello_empty_or_whitespace_only) ... ok
test_hello_trims_surrounding_whitespace (test_hello.TestHello.test_hello_trims_surrounding_whitespace) ... ok
test_hello_valid_name (test_hello.TestHello.test_hello_valid_name) ... ok

======================================================================
ERROR: test_bye (unittest.loader._FailedTest.test_bye)
----------------------------------------------------------------------
ImportError: Failed to import test module: test_bye
Traceback (most recent call last):
  File "C:\Program Files\Python314\Lib\unittest\loader.py", line 426, in _find_test_path
    module = self._get_module_from_name(name)
  File "C:\Program Files\Python314\Lib\unittest\loader.py", line 367, in _get_module_from_name
    __import__(name)
    ~~~~~~~~~~^^^^^^
  File "C:\Users\mfard\OneDrive\AmbVir\VS Code\Trabalhos\Meu_Board_2\tests\hello_demo\test_bye.py", line 2, in <module>
    from src.hello import bye, hello
ImportError: cannot import name 'bye' from 'src.hello' (C:\Users\mfard\OneDrive\AmbVir\VS Code\Trabalhos\Meu_Board_2\tests\hello_demo\src\hello.py)


----------------------------------------------------------------------
Ran 4 tests in 0.000s

FAILED (errors=1)
```
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
