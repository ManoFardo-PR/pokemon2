### 1. Implementation Checklist
- [x] tests/hello_demo/src/__init__.py: created package marker
- [x] tests/hello_demo/src/hello.py: created with `hello(name: str) -> str` implementation
- [x] tests/hello_demo/test_hello.py: created with unit test suite

### 2. Business Rules Compliance
- BR-X01-01: met (valid names return `'Hello, <name>'`, verified by `test_hello_valid_name`)
- BR-X01-02: met (empty string or whitespace-only returns `'Hello, stranger'`, verified by `test_hello_empty_or_whitespace_only`)
- BR-X01-03: met (surrounding whitespace trimmed while preserving internal spaces, verified by `test_hello_trims_surrounding_whitespace`)

### 3. Deviations and Gaps
- None

### 4. Verdict
VERDICT: OK