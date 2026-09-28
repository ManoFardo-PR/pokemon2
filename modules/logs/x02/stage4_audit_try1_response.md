### 1. Implementation Checklist
- [x] `tests/hello_demo/test_bye.py`: created unit test suite covering `bye()` and regression test for `hello()`
- [x] `tests/hello_demo/src/hello.py`: patched by appending `bye(name: str) -> str` while preserving `hello()` intact

### 2. Business Rules Compliance
- BR-X02-01: met (`bye('Ana')` returns `'Bye, Ana'`; leading/trailing whitespace trimmed)
- BR-X02-02: met (empty or whitespace-only inputs return `'Bye, stranger'`)
- BR-X02-03: met (`hello()` retained exact behavior from X01 without modification; regression test passes)

### 3. Deviations and Gaps
- None

### 4. Verdict
VERDICT: OK