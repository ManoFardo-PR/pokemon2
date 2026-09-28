You are a Lead Quality Assurance Auditor and Systems Architect. Perform the post-implementation audit of subtask X01 and decide whether it can be closed.

================================================================================
MASTER PLAN (Stage 1): acceptance criteria.
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
CHANGES MADE IN THIS TASK (git diff, may be truncated):
================================================================================
diff --git a/tests/hello_demo/src/__init__.py b/tests/hello_demo/src/__init__.py
new file mode 100644
index 0000000..8b13789
--- /dev/null
+++ b/tests/hello_demo/src/__init__.py
@@ -0,0 +1 @@
+
diff --git a/tests/hello_demo/src/hello.py b/tests/hello_demo/src/hello.py
new file mode 100644
index 0000000..6b2158a
--- /dev/null
+++ b/tests/hello_demo/src/hello.py
@@ -0,0 +1,5 @@
+def hello(name: str) -> str:
+    cleaned = name.strip()
+    if not cleaned:
+        return "Hello, stranger"
+    return f"Hello, {cleaned}"
diff --git a/tests/hello_demo/test_hello.py b/tests/hello_demo/test_hello.py
new file mode 100644
index 0000000..ea89279
--- /dev/null
+++ b/tests/hello_demo/test_hello.py
@@ -0,0 +1,22 @@
+import unittest
+from src.hello import hello
+
+class TestHello(unittest.TestCase):
+    def test_hello_valid_name(self):
+        self.assertEqual(hello("Ana"), "Hello, Ana")
+        self.assertEqual(hello("World"), "Hello, World")
+
+    def test_hello_empty_or_whitespace_only(self):
+        self.assertEqual(hello(""), "Hello, stranger")
+        self.assertEqual(hello(" "), "Hello, stranger")
+        self.assertEqual(hello("   "), "Hello, stranger")
+        self.assertEqual(hello("\t \n"), "Hello, stranger")
+
+    def test_hello_trims_surrounding_whitespace(self):
+        self.assertEqual(hello("  Ana"), "Hello, Ana")
+        self.assertEqual(hello("Ana  "), "Hello, Ana")
+        self.assertEqual(hello("  Ana  "), "Hello, Ana")
+        self.assertEqual(hello("  Ana Maria  "), "Hello, Ana Maria")
+
+if __name__ == "__main__":
+    unittest.main()
================================================================================
FILES WRITTEN BY THE ORCHESTRATOR IN THIS TASK:
================================================================================
- tests/hello_demo/test_hello.py
- tests/hello_demo/src/__init__.py
- tests/hello_demo/src/hello.py
================================================================================
LOCAL VALIDATION RESULT (compile and tests):
================================================================================
Compile: OK (exit 0)
Tests: OK (exit 0)

```text
test_hello_empty_or_whitespace_only (test_hello.TestHello.test_hello_empty_or_whitespace_only) ... ok
test_hello_trims_surrounding_whitespace (test_hello.TestHello.test_hello_trims_surrounding_whitespace) ... ok
test_hello_valid_name (test_hello.TestHello.test_hello_valid_name) ... ok

----------------------------------------------------------------------
Ran 3 tests in 0.000s

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
