### 1. Implementation Checklist
- [x] tests/hello_demo/src/hello.py: patched with `whisper(name: str) -> str` while preserving existing functions
- [x] tests/hello_demo/test_whisper.py: created with full unit test suite and regression assertions

### 2. Business Rules Compliance
- BR-X04-01: met (`whisper('Ana')` returns `'hello, ana...'`, with whitespace trimming and casing normalization)
- BR-X04-02: met (empty or whitespace-only string returns `'hello, stranger...'`)
- BR-X04-03: met (`hello()`, `bye()`, and `shout()` retained their behavior with zero regressions)

### 3. Deviations and Gaps
- None

### 4. Verdict
VERDICT: OK