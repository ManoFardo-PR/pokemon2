You are a Senior Software Engineer. You are executing the GREEN phase of subtask X01: write the minimum production code that makes the RED tests pass while honoring the plan.

TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`
TYPE CHECK / COMPILE: `python -m compileall -q tests`

================================================================================
MASTER PLAN (output of Stage 1). It is self-contained: do not read the workspace.
Sections 2, 3, 5 and 6 define files, contracts, constraints and existing code.
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
RED TESTS (output of Stage 2). The production code MUST make all of them pass:
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
CURRENT CONTENT OF FILES THAT ALREADY EXIST (injected by the orchestrator; empty if none):
================================================================================
(none)
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
