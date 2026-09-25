# Conventions (fixture copy)

Only the check list is reproduced; the lint never reads this file.

## Consistency checks (docs lint, S01.T10)

1. Every `Depends on` / `Unblocks` / input `from` / output `consumed by` ID exists.
2. `Unblocks` of X equals the set of files whose `Depends on` contains X.
3. No dependency cycles; no dependency on a later stage; intra-stage dependencies point to lower IDs.
4. `Order in stage n / N` matches the file's position and the stage size.
5. Every input `from Sxx.Tyy` names a subtask listed in `Depends on`.
6. Every subtask file appears exactly once in its stage README table and in the index.
7. Every file has all template-v2 sections, non-empty; every RN assigned in the traceability doc appears in the file's Business rules table.
8. `BR-` IDs are unique across the tree; a rule **row** defines only IDs of its own file (citing another file's rule in prose is allowed and expected).
9. Status is from the vocabulary and agrees with the stage README row for the same subtask.
10. The header table has exactly the template's fields, in order; `Gate` is `no` or `yes — fallback: …`.
11. The `Context docs:` footer is present and its links resolve.
12. Every relative link in the file resolves to an existing file; a link whose anchor text is a subtask ID points at that subtask's file.
13. Acceptance checks are checkboxes (`- [ ]`) and there are at least five.
