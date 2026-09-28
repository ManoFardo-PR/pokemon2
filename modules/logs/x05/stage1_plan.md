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