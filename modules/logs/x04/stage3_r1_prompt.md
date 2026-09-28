You are a Senior Software Engineer. You are executing the GREEN phase of subtask X04: write the minimum production code that makes the RED tests pass while honoring the plan.

TEST RUNNER: `python -m unittest discover -s tests/hello_demo -v`
TYPE CHECK / COMPILE: `python -m compileall -q tests`

================================================================================
MASTER PLAN (output of Stage 1). It is self-contained: do not read the workspace.
Sections 2, 3, 5 and 6 define files, contracts, constraints and existing code.
================================================================================
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
================================================================================
RED TESTS (output of Stage 2). The production code MUST make all of them pass:
================================================================================
### FILE: tests/hello_demo/test_whisper.py
```python
import unittest
from src.hello import whisper, hello, bye, shout

class TestWhisper(unittest.TestCase):
    def test_whisper_valid_name(self):
        self.assertEqual(whisper('Ana'), 'hello, ana...')

    def test_whisper_empty_string(self):
        self.assertEqual(whisper(''), 'hello, stranger...')

    def test_whisper_spaces_only(self):
        self.assertEqual(whisper('   '), 'hello, stranger...')

    def test_whisper_whitespace_characters_only(self):
        self.assertEqual(whisper('\t \n'), 'hello, stranger...')

    def test_whisper_leading_whitespace(self):
        self.assertEqual(whisper('  Ana'), 'hello, ana...')

    def test_whisper_trailing_whitespace(self):
        self.assertEqual(whisper('Ana  '), 'hello, ana...')

    def test_whisper_mixed_case_with_whitespace(self):
        self.assertEqual(whisper('  bo '), 'hello, bo...')

    def test_regression_shout(self):
        self.assertEqual(shout('Ana'), 'HELLO, ANA!')

    def test_regression_hello(self):
        self.assertEqual(hello('Ana'), 'Hello, Ana')

    def test_regression_bye(self):
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

def shout(name: str) -> str:
    return f"{hello(name)}!".upper()
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
