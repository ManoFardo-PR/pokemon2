You are a strict reviewer. Your only job is to decide whether the OUTPUT below delivers exactly what the PROMPT asked, in the required format. Do not request improvements beyond the request. Do not redo the work.

STAGE: Stage 3 - TDD GREEN (implementation) (round 1)

================================================================================
PROMPT THAT WAS SENT TO THE WORKER:
================================================================================
You are a Senior Software Engineer. You are executing the GREEN phase of subtask X03: write the minimum production code that makes the RED tests pass while honoring the plan.

TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`
TYPE CHECK / COMPILE: `python -m compileall -q tests`

================================================================================
MASTER PLAN (output of Stage 1). It is self-contained: do not read the workspace.
Sections 2, 3, 5 and 6 define files, contracts, constraints and existing code.
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
RED TESTS (output of Stage 2). The production code MUST make all of them pass:
================================================================================
### FILE: tests/hello_demo/test_shout.py
```python
import unittest
from src.hello import shout, hello, bye

class TestShout(unittest.TestCase):
    def test_shout_valid_name(self):
        self.assertEqual(shout('Ana'), 'HELLO, ANA!')

    def test_shout_empty_or_whitespace_only(self):
        self.assertEqual(shout(''), 'HELLO, STRANGER!')
        self.assertEqual(shout('   '), 'HELLO, STRANGER!')
        self.assertEqual(shout('\t \n'), 'HELLO, STRANGER!')

    def test_shout_trims_surrounding_whitespace(self):
        self.assertEqual(shout('  bo '), 'HELLO, BO!')
        self.assertEqual(shout('  Ana'), 'HELLO, ANA!')
        self.assertEqual(shout('Ana  '), 'HELLO, ANA!')

    def test_hello_and_bye_regression(self):
        self.assertEqual(hello('Ana'), 'Hello, Ana')
        self.assertEqual(bye('Ana'), 'Bye, Ana')

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

def bye(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Bye, stranger"
    return f"Bye, {cleaned}"
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
def bye(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Bye, stranger"
    return f"Bye, {cleaned}"
=======
def bye(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Bye, stranger"
    return f"Bye, {cleaned}"

def shout(name: str) -> str:
    return f"{hello(name)}!".upper()
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
