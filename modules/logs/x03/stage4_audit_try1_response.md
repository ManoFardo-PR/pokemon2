### 1. Implementation Checklist
- [x] tests/hello_demo/src/hello.py: patched with `shout(name: str) -> str` preserving existing functions
- [x] tests/hello_demo/test_shout.py: created unit tests covering edge cases and regressions

### 2. Business Rules Compliance
- BR-X03-01: met (shout('Ana') returns 'HELLO, ANA!')
- BR-X03-02: met (empty or whitespace-only strings return 'HELLO, STRANGER!')
- BR-X03-03: met (hello() and bye() preserved without modifications and regression verified)

### 3. Deviations and Gaps
- None

### 4. Verdict
VERDICT: OK