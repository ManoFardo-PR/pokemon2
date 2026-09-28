### 1. Objective and Context
- **Goal**: Add the `whisper(name: str) -> str` function to the existing module `tests/hello_demo/src/hello.py` via patching without modifying existing functions, and create comprehensive unit tests in `tests/hello_demo/test_whisper.py`.
- **Dependencies**: Depends on subtask X03 (which added `shout` to `hello.py` and `test_shout.py`). Unlocks subtask X05.
- **Current Workspace State**:
  - `tests/hello_demo/src/hello.py` contains `hello(name: str) -> str`, `bye(name: str) -> str`, and `shout(name: str) -> str`.
  - Existing test suites: `tests/hello_demo/test_hello.py`, `tests/hello_demo/test_bye.py`, `tests/hello_demo/test_shout.py`.
  - All existing tests currently pass with `python -m unittest discover -s tests/hello_demo -v`.

### 2. Target Files

| Path | Role | Action | Purpose |
|---|---|---|---|
| tests/hello_demo/src/hello.py | src | patch | Append `whisper(name: str) -> str` preserving `hello`, `bye`, and `shout` |
| tests/hello_demo/test_whisper.py | test | create | Unit tests for `whisper` and regression assertions for `hello`, `bye`, `shout` |

### 3. Technical Requirements and Contracts
- **Interface Signature**:
  ```python
  def whisper(name: str) -> str
  ```
- **Business Rules**:
  - **BR-X04-01**: `whisper('Ana')` returns exactly `'hello, ana...'`.
  - **BR-X04-02**: Empty name or whitespace-only name returns `'hello, stranger...'`.
  - **BR-X04-03**: `hello()`, `bye()`, and `shout()` retain their previous behavior with zero regressions.
- **Edge Cases & Error Handling**:
  - Empty string `""` -> `'hello, stranger...'`.
  - Whitespace-only string `'   '` or `'\t \n'` -> `'hello, stranger...'`.
  - Leading/trailing whitespace (e.g. `'  Ana '`) -> trimmed and formatted as `'hello, ana...'`.
  - Uppercase and mixed-case names are lowercased along with the greeting prefix.

### 4. Test Scenarios (RED phase)
- **Import Statement**:
  ```python
  from src.hello import whisper, hello, bye, shout
  ```
- **Assertion Scenarios**:
  - `self.assertEqual(whisper('Ana'), 'hello, ana...')` (BR-X04-01: valid name)
  - `self.assertEqual(whisper(''), 'hello, stranger...')` (BR-X04-02: empty string)
  - `self.assertEqual(whisper('   '), 'hello, stranger...')` (BR-X04-02: spaces only)
  - `self.assertEqual(whisper('\t \n'), 'hello, stranger...')` (BR-X04-02: tabs and newlines only)
  - `self.assertEqual(whisper('  Ana'), 'hello, ana...')` (BR-X04-01 & whitespace trimming: leading whitespace)
  - `self.assertEqual(whisper('Ana  '), 'hello, ana...')` (BR-X04-01 & whitespace trimming: trailing whitespace)
  - `self.assertEqual(whisper('  bo '), 'hello, bo...')` (BR-X04-01: mixed case with whitespace)
  - `self.assertEqual(shout('Ana'), 'HELLO, ANA!')` (BR-X04-03: shout regression)
  - `self.assertEqual(hello('Ana'), 'Hello, Ana')` (BR-X04-03: hello regression)
  - `self.assertEqual(bye('Ana'), 'Bye, Ana')` (BR-X04-03: bye regression)

### 5. Architecture and Coding Constraints
- **Runtime and Standard Library**: Python 3 standard library only (`unittest`), no third-party dependencies.
- **Verification Commands** (run from repository root):
  - Test runner: `python -m unittest discover -s tests/hello_demo -v`
  - Compile / check: `python -m compileall -q tests`
- **Conventions**:
  - Patch `tests/hello_demo/src/hello.py` by appending the `whisper` function; do not rewrite or alter existing lines.
  - Test file `tests/hello_demo/test_whisper.py` follows the pattern of `test_shout.py` (inherits `unittest.TestCase`, includes `if __name__ == '__main__': unittest.main()`).
- **Implementation Mechanism**:
  `whisper(name)` can be implemented as `f"{hello(name).lower()}..."` leveraging the existing normalization in `hello()`.

### 6. Existing Code This Task Depends On
- **File**: `tests/hello_demo/src/hello.py`
  - **Exact Signatures and Implementation**:
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
    ```
- **File**: `tests/hello_demo/test_shout.py`
  - **Pattern Reference**:
    ```python
    import unittest
    from src.hello import shout, hello, bye

    class TestShout(unittest.TestCase):
        def test_shout_valid_name(self):
            self.assertEqual(shout('Ana'), 'HELLO, ANA!')
        ...
    if __name__ == '__main__':
        unittest.main()
    ```