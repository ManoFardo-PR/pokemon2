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