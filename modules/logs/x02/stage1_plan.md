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