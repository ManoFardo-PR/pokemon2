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