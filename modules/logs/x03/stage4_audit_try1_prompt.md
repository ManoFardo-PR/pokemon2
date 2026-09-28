You are a Lead Quality Assurance Auditor and Systems Architect. Perform the post-implementation audit of subtask X03 and decide whether it can be closed.

================================================================================
MASTER PLAN (Stage 1): acceptance criteria.
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
CHANGES MADE IN THIS TASK (git diff, may be truncated):
================================================================================
diff --git a/tests/hello_demo/src/hello.py b/tests/hello_demo/src/hello.py
index bd0bcd4..b4e233f 100644
--- a/tests/hello_demo/src/hello.py
+++ b/tests/hello_demo/src/hello.py
@@ -9,3 +9,6 @@ def bye(name: str) -> str:
     if not cleaned:
         return "Bye, stranger"
     return f"Bye, {cleaned}"
+
+def shout(name: str) -> str:
+    return f"{hello(name)}!".upper()
diff --git a/tests/hello_demo/test_shout.py b/tests/hello_demo/test_shout.py
new file mode 100644
index 0000000..b2596aa
--- /dev/null
+++ b/tests/hello_demo/test_shout.py
@@ -0,0 +1,23 @@
+import unittest
+from src.hello import shout, hello, bye
+
+class TestShout(unittest.TestCase):
+    def test_shout_valid_name(self):
+        self.assertEqual(shout('Ana'), 'HELLO, ANA!')
+
+    def test_shout_empty_or_whitespace_only(self):
+        self.assertEqual(shout(''), 'HELLO, STRANGER!')
+        self.assertEqual(shout('   '), 'HELLO, STRANGER!')
+        self.assertEqual(shout('\t \n'), 'HELLO, STRANGER!')
+
+    def test_shout_trims_surrounding_whitespace(self):
+        self.assertEqual(shout('  bo '), 'HELLO, BO!')
+        self.assertEqual(shout('  Ana'), 'HELLO, ANA!')
+        self.assertEqual(shout('Ana  '), 'HELLO, ANA!')
+
+    def test_hello_and_bye_regression(self):
+        self.assertEqual(hello('Ana'), 'Hello, Ana')
+        self.assertEqual(bye('Ana'), 'Bye, Ana')
+
+if __name__ == '__main__':
+    unittest.main()
================================================================================
FILES WRITTEN BY THE ORCHESTRATOR IN THIS TASK:
================================================================================
- tests/hello_demo/test_shout.py
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

----------------------------------------------------------------------
Ran 11 tests in 0.001s

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
