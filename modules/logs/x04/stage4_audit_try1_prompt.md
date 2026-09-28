You are a Lead Quality Assurance Auditor and Systems Architect. Perform the post-implementation audit of subtask X04 and decide whether it can be closed.

================================================================================
MASTER PLAN (Stage 1): acceptance criteria.
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
CHANGES MADE IN THIS TASK (git diff, may be truncated):
================================================================================
diff --git a/tests/hello_demo/src/hello.py b/tests/hello_demo/src/hello.py
index b4e233f..4c1a727 100644
--- a/tests/hello_demo/src/hello.py
+++ b/tests/hello_demo/src/hello.py
@@ -12,3 +12,6 @@ def bye(name: str) -> str:
 
 def shout(name: str) -> str:
     return f"{hello(name)}!".upper()
+
+def whisper(name: str) -> str:
+    return f"{hello(name).lower()}..."
diff --git a/tests/hello_demo/test_whisper.py b/tests/hello_demo/test_whisper.py
new file mode 100644
index 0000000..1503675
--- /dev/null
+++ b/tests/hello_demo/test_whisper.py
@@ -0,0 +1,36 @@
+import unittest
+from src.hello import whisper, hello, bye, shout
+
+class TestWhisper(unittest.TestCase):
+    def test_whisper_valid_name(self):
+        self.assertEqual(whisper('Ana'), 'hello, ana...')
+
+    def test_whisper_empty_string(self):
+        self.assertEqual(whisper(''), 'hello, stranger...')
+
+    def test_whisper_spaces_only(self):
+        self.assertEqual(whisper('   '), 'hello, stranger...')
+
+    def test_whisper_whitespace_characters_only(self):
+        self.assertEqual(whisper('\t \n'), 'hello, stranger...')
+
+    def test_whisper_leading_whitespace(self):
+        self.assertEqual(whisper('  Ana'), 'hello, ana...')
+
+    def test_whisper_trailing_whitespace(self):
+        self.assertEqual(whisper('Ana  '), 'hello, ana...')
+
+    def test_whisper_mixed_case_with_whitespace(self):
+        self.assertEqual(whisper('  bo '), 'hello, bo...')
+
+    def test_regression_shout(self):
+        self.assertEqual(shout('Ana'), 'HELLO, ANA!')
+
+    def test_regression_hello(self):
+        self.assertEqual(hello('Ana'), 'Hello, Ana')
+
+    def test_regression_bye(self):
+        self.assertEqual(bye('Ana'), 'Bye, Ana')
+
+if __name__ == '__main__':
+    unittest.main()
================================================================================
FILES WRITTEN BY THE ORCHESTRATOR IN THIS TASK:
================================================================================
- tests/hello_demo/test_whisper.py
- tests/hello_demo/src/hello.py
================================================================================
LOCAL VALIDATION RESULT (compile and tests):
================================================================================
Compile: OK (exit 0)
Tests: OK (exit 0)

```text
test_bye_empty_or_whitespace_only (test_bye.TestBye.test_bye_empty_or_whitespace_only) ... ok
test_bye_trims_surrounding_whitespace (test_bye.TestBye.test_bye_trims_surrounding_whitespace) ... ok
test_bye_valid_name (test_bye.TestBye.test_bye_valid_name) ... ok
test_hello_regression (test_bye.TestBye.test_hello_regression) ... ok
test_hello_empty_or_whitespace_only (test_hello.TestHello.test_hello_empty_or_whitespace_only) ... ok
test_hello_trims_surrounding_whitespace (test_hello.TestHello.test_hello_trims_surrounding_whitespace) ... ok
test_hello_valid_name (test_hello.TestHello.test_hello_valid_name) ... ok
test_hello_and_bye_regression (test_shout.TestShout.test_hello_and_bye_regression) ... ok
test_shout_empty_or_whitespace_only (test_shout.TestShout.test_shout_empty_or_whitespace_only) ... ok
test_shout_trims_surrounding_whitespace (test_shout.TestShout.test_shout_trims_surrounding_whitespace) ... ok
test_shout_valid_name (test_shout.TestShout.test_shout_valid_name) ... ok
test_regression_bye (test_whisper.TestWhisper.test_regression_bye) ... ok
test_regression_hello (test_whisper.TestWhisper.test_regression_hello) ... ok
test_regression_shout (test_whisper.TestWhisper.test_regression_shout) ... ok
test_whisper_empty_string (test_whisper.TestWhisper.test_whisper_empty_string) ... ok
test_whisper_leading_whitespace (test_whisper.TestWhisper.test_whisper_leading_whitespace) ... ok
test_whisper_mixed_case_with_whitespace (test_whisper.TestWhisper.test_whisper_mixed_case_with_whitespace) ... ok
test_whisper_spaces_only (test_whisper.TestWhisper.test_whisper_spaces_only) ... ok
test_whisper_trailing_whitespace (test_whisper.TestWhisper.test_whisper_trailing_whitespace) ... ok
test_whisper_valid_name (test_whisper.TestWhisper.test_whisper_valid_name) ... ok
test_whisper_whitespace_characters_only (test_whisper.TestWhisper.test_whisper_whitespace_characters_only) ... ok

----------------------------------------------------------------------
Ran 21 tests in 0.001s

OK
```
================================================================================

INSTRUCTIONS:
1. You MAY read the files listed above in the workspace to check their real content. Do not write anything.
2. Verify: (a) every file in section 2 of the plan exists with the stated role; (b) the signatures in section 3 were respected; (c) every business rule (BR-...) is covered by a test and implemented; (d) local validation passed; (e) no dead code, debug prints or dependencies outside the constraints of section 5; (f) files outside section 2 were not modified without reason.
3. Be objective. Do not ask for cosmetic improvements. Reject only for a real contract deviation, an unmet business rule, a missing test for a rule, or a local failure.

OUTPUT FORMAT (mandatory):

### 1. Implementation Checklist
- [x] or [ ] path: status

### 2. Business Rules Compliance
- BR-...: met / not met (reason)

### 3. Deviations and Gaps
- objective list (or "None")

### 4. Verdict
End with ONE line, exactly in this format, with no text after it:
VERDICT: OK
or
VERDICT: NOT OK
