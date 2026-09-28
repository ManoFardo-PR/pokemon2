You are a strict reviewer. Your only job is to decide whether the OUTPUT below delivers exactly what the PROMPT asked, in the required format. Do not request improvements beyond the request. Do not redo the work.

STAGE: Stage 2 - TDD RED (tests) (round 1)

================================================================================
PROMPT THAT WAS SENT TO THE WORKER:
================================================================================
You are a Senior QA Automation Engineer and TDD specialist. You are executing the RED phase (tests first) of subtask X05.

TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`

================================================================================
MASTER PLAN (output of Stage 1). It is self-contained: do not read the workspace.
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
### FILE: tests/hello_demo/test_greet_all.py
```python
import unittest
from src.hello import greet_all, hello, bye, shout, whisper

class TestGreetAll(unittest.TestCase):
    def test_greet_all_multiple_valid_names(self):
        self.assertEqual(greet_all(['Ana', 'Bo']), ['Hello, Ana', 'Hello, Bo'])

    def test_greet_all_empty_list(self):
        self.assertEqual(greet_all([]), [])

    def test_greet_all_single_space(self):
        self.assertEqual(greet_all([' ']), ['Hello, stranger'])

    def test_greet_all_empty_string(self):
        self.assertEqual(greet_all(['']), ['Hello, stranger'])

    def test_greet_all_whitespace_escape_characters(self):
        self.assertEqual(greet_all(['\t \n']), ['Hello, stranger'])

    def test_greet_all_surrounding_whitespace(self):
        self.assertEqual(greet_all(['  Ana  ']), ['Hello, Ana'])

    def test_greet_all_mixed_items(self):
        self.assertEqual(greet_all(['Ana', ' ', 'Bo']), ['Hello, Ana', 'Hello, stranger', 'Hello, Bo'])

    def test_regression_hello(self):
        self.assertEqual(hello('Ana'), 'Hello, Ana')

    def test_regression_bye(self):
        self.assertEqual(bye('Ana'), 'Bye, Ana')

    def test_regression_shout(self):
        self.assertEqual(shout('Ana'), 'HELLO, ANA!')

    def test_regression_whisper(self):
        self.assertEqual(whisper('Ana'), 'hello, ana...')

if __name__ == '__main__':
    unittest.main()
```
================================================================================
AUTOMATED CHECKS RUN BY THE ORCHESTRATOR ON THAT OUTPUT:
================================================================================
Written: tests/hello_demo/test_greet_all.py
Compile OK. RED run failed as expected (exit 1):
```text
h_whitespace (test_whisper.TestWhisper.test_whisper_mixed_case_with_whitespace) ... ok
test_whisper_spaces_only (test_whisper.TestWhisper.test_whisper_spaces_only) ... ok
test_whisper_trailing_whitespace (test_whisper.TestWhisper.test_whisper_trailing_whitespace) ... ok
test_whisper_valid_name (test_whisper.TestWhisper.test_whisper_valid_name) ... ok
test_whisper_whitespace_characters_only (test_whisper.TestWhisper.test_whisper_whitespace_characters_only) ... ok

======================================================================
ERROR: test_greet_all (unittest.loader._FailedTest.test_greet_all)
----------------------------------------------------------------------
ImportError: Failed to import test module: test_greet_all
Traceback (most recent call last):
  File "C:\Program Files\Python314\Lib\unittest\loader.py", line 426, in _find_test_path
    module = self._get_module_from_name(name)
  File "C:\Program Files\Python314\Lib\unittest\loader.py", line 367, in _get_module_from_name
    __import__(name)
    ~~~~~~~~~~^^^^^^
  File "C:\Users\mfard\OneDrive\AmbVir\VS Code\Trabalhos\Meu_Board_2\tests\hello_demo\test_greet_all.py", line 2, in <module>
    from src.hello import greet_all, hello, bye, shout, whisper
ImportError: cannot import name 'greet_all' from 'src.hello' (C:\Users\mfard\OneDrive\AmbVir\VS Code\Trabalhos\Meu_Board_2\tests\hello_demo\src\hello.py)


----------------------------------------------------------------------
Ran 22 tests in 0.001s

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
