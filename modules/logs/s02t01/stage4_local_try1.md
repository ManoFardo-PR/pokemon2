Compile: OK (exit 0)
Tests: FAILED (exit 1)

```text
]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[46m scripts [49m[39m scripts/docs-lint.spec.mjs[2m > [22mS01.T10: docs-lint (scripts/docs-lint.mjs)[2m > [22mregistry[2m > [22mmodule exports
[41m[1m FAIL [22m[49m [30m[46m scripts [49m[39m scripts/docs-lint.spec.mjs[2m > [22mS01.T10: docs-lint (scripts/docs-lint.mjs)[2m > [22mregistry[2m > [22mimplements every documented check (BR-S01.T10-03)
[41m[1m FAIL [22m[49m [30m[46m scripts [49m[39m scripts/docs-lint.spec.mjs[2m > [22mS01.T10: docs-lint (scripts/docs-lint.mjs)[2m > [22mgrammar edge cases (BR-S01.T10-05)[2m > [22mparseSubtaskFile exposes the header fields, sections and graph ids
[41m[1m FAIL [22m[49m [30m[46m scripts [49m[39m scripts/docs-lint.spec.mjs[2m > [22mS01.T10: docs-lint (scripts/docs-lint.mjs)[2m > [22mgrammar edge cases (BR-S01.T10-05)[2m > [22mlintDocs and parseTree work on the fixture without the CLI
[31m[1mSyntaxError[22m: Invalid or unexpected token[39m
[36m [2m❯[22m scripts/docs-lint.spec.mjs:[2m152:19[22m[39m
    [90m150| [39m  [34mdescribe[39m([32m"registry"[39m[33m,[39m () [33m=>[39m {
    [90m151| [39m    [34mit[39m([32m"module exports"[39m[33m,[39m [35masync[39m () [33m=>[39m {
    [90m152| [39m      [35mconst[39m mod [33m=[39m [35mawait[39m [34mloadModule[39m()[33m;[39m
    [90m   | [39m                  [31m^[39m
    [90m153| [39m      expect(Object.keys(mod.CHECKS).map(Number).sort((a, b) => a - b)…
    [90m154| [39m      expect(Object.keys(mod.STRICT_CHECKS).map(Number).sort((a, b) =>…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/13]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[46m scripts [49m[39m scripts/notice-lint.spec.ts[2m > [22mS01.T09: notice-lint (scripts/notice-lint.mjs)[2m > [22mmodule exports[2m > [22mexports EXPECTED_IDS, FIELDS and a CHECKS registry keyed 1..7
[41m[1m FAIL [22m[49m [30m[46m scripts [49m[39m scripts/notice-lint.spec.ts[2m > [22mS01.T09: notice-lint (scripts/notice-lint.mjs)[2m > [22mstructural checks[2m > [22m14. multi-line attribution (two-space continuation) is valid and parsed with a newline
[31m[1mSyntaxError[22m: Invalid or unexpected token[39m
[36m [2m❯[22m scripts/notice-lint.spec.ts:[2m243:19[22m[39m
    [90m241| [39m  [34mdescribe[39m([32m"module exports"[39m[33m,[39m () [33m=>[39m {
    [90m242| [39m    it("exports EXPECTED_IDS, FIELDS and a CHECKS registry keyed 1..7"…
    [90m243| [39m      [35mconst[39m mod [33m=[39m [35mawait[39m [34mloadModule[39m()[33m;[39m
    [90m   | [39m                  [31m^[39m
    [90m244| [39m      [34mexpect[39m(mod[33m.[39m[33mEXPECTED_IDS[39m)[33m.[39m[34mtoEqual[39m([33mEXPECTED_IDS[39m)[33m;[39m
    [90m245| [39m      [34mexpect[39m(mod[33m.[39m[33mFIELDS[39m)[33m.[39m[34mtoEqual[39m([33mFIELDS[39m)[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/13]⎯[22m[39m

[ELIFECYCLE] Test failed. See above for more details.
```