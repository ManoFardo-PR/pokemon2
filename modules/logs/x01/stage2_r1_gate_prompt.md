You are a strict reviewer. Your only job is to decide whether the OUTPUT below delivers exactly what the PROMPT asked, in the required format. Do not request improvements beyond the request. Do not redo the work.

STAGE: Stage 2 - TDD RED (tests) (round 1)

================================================================================
PROMPT THAT WAS SENT TO THE WORKER:
================================================================================
You are a Senior QA Automation Engineer and TDD specialist. You are executing the RED phase (tests first) of subtask X01.

TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`

================================================================================
MASTER PLAN (output of Stage 1). It is self-contained: do not read the workspace.
================================================================================
### 1. Objective and Context
- **Goal:** Create the `tests/hello_demo/src` package and implement the `hello(name: str) -> str` function that returns `'Hello, <name>'`, along with unit tests in `tests/hello_demo/test_hello.py`.
- **Dependencies:** None (first task in `hello_demo`). Unlocks subtask X02.
- **Workspace Status:** No files or directories currently exist under `tests/hello_demo/`.

### 2. Target Files
| Path | Role | Action | Purpose |
|---|---|---|---|
| tests/hello_demo/src/__init__.py | src | create | Marks `src` as a Python package so tests can import from it |
| tests/hello_demo/src/hello.py | src | create | Implements the `hello(name: str) -> str` function |
| tests/hello_demo/test_hello.py | test | create | Unit tests verifying all business rules and edge cases for `hello()` |

### 3. Technical Requirements and Contracts
- **Interface:**
  ```python
  def hello(name: str) -> str:
  ```
- **Business Rules:**
  - `BR-X01-01`: `hello('Ana')` devolve exatamente `'Hello, Ana'`.
  - `BR-X01-02`: Nome vazio ou só espaços devolve `'Hello, stranger'`.
  - `BR-X01-03`: Espaços nas pontas do nome são removidos antes de montar a saudação.
- **Edge Cases & Error Handling:**
  - Empty string `""` -> `'Hello, stranger'`.
  - String with only spaces, tabs, or newlines (e.g. `"   "`, `"\t\n"`) -> `'Hello, stranger'`.
  - Leading/trailing whitespace around valid names (e.g. `"  Ana  "`) -> `'Hello, Ana'`.
  - Internal whitespace preserved (e.g. `"  Ana Maria  "`) -> `'Hello, Ana Maria'`.

### 4. Test Scenarios (RED phase)
Exact import statement:
```python
from src.hello import hello
```
Assertions:
- `self.assertEqual(hello("Ana"), "Hello, Ana")` (BR-X01-01: valid name)
- `self.assertEqual(hello("World"), "Hello, World")` (BR-X01-01: alternate valid name)
- `self.assertEqual(hello(""), "Hello, stranger")` (BR-X01-02: empty string)
- `self.assertEqual(hello(" "), "Hello, stranger")` (BR-X01-02: single space)
- `self.assertEqual(hello("   "), "Hello, stranger")` (BR-X01-02: multiple spaces)
- `self.assertEqual(hello("\t \n"), "Hello, stranger")` (BR-X01-02: whitespace characters)
- `self.assertEqual(hello("  Ana"), "Hello, Ana")` (BR-X01-03: leading spaces)
- `self.assertEqual(hello("Ana  "), "Hello, Ana")` (BR-X01-03: trailing spaces)
- `self.assertEqual(hello("  Ana  "), "Hello, Ana")` (BR-X01-03: leading and trailing spaces)
- `self.assertEqual(hello("  Ana Maria  "), "Hello, Ana Maria")` (BR-X01-03: internal spaces preserved with trimmed edges)

### 5. Architecture and Coding Constraints
- **Runtime:** Python 3. Standard library only (no external dependencies).
- **Test Framework:** `unittest` via `unittest.TestCase`.
- **Project Structure:**
  - Root of demo: `tests/hello_demo/`
  - Production code: `tests/hello_demo/src/hello.py` (with empty `tests/hello_demo/src/__init__.py`)
  - Test suite: `tests/hello_demo/test_hello.py`
- **Execution Convention:** Tests executed with `python -m unittest discover -s tests/hello_demo -v`. Discovery sets `tests/hello_demo` on `sys.path`, allowing `from src.hello import hello`.
- **Assumptions:** Input `name` is of type `str`. If `name.strip()` produces an empty string, the result is `'Hello, stranger'`; otherwise `'Hello, ' + name.strip()`.

### 6. Existing Code This Task Depends On
None
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
### FILE: tests/hello_demo/test_hello.py
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
AUTOMATED CHECKS RUN BY THE ORCHESTRATOR ON THAT OUTPUT:
================================================================================
Written: tests/hello_demo/test_hello.py
Compile OK. RED run failed as expected (exit 1):
```text
test_hello (unittest.loader._FailedTest.test_hello) ... ERROR

======================================================================
ERROR: test_hello (unittest.loader._FailedTest.test_hello)
----------------------------------------------------------------------
ImportError: Failed to import test module: test_hello
Traceback (most recent call last):
  File "C:\Program Files\Python314\Lib\unittest\loader.py", line 426, in _find_test_path
    module = self._get_module_from_name(name)
  File "C:\Program Files\Python314\Lib\unittest\loader.py", line 367, in _get_module_from_name
    __import__(name)
    ~~~~~~~~~~^^^^^^
  File "C:\Users\mfard\OneDrive\AmbVir\VS Code\Trabalhos\Meu_Board_2\tests\hello_demo\test_hello.py", line 2, in <module>
    from src.hello import hello
ModuleNotFoundError: No module named 'src'


----------------------------------------------------------------------
Ran 1 test in 0.000s

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
