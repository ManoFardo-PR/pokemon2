"""
Deterministic checks shared by the orchestrator stages. No LLM, no network.

Everything here is a pure function over text (or a thin wrapper over `git`),
so it can be unit-tested offline (modules/TESTE/test_pipeline_checks.py) and
reused by the stages in main.py:

- strip_ansi / diag_tail: what a failed command really said, without colour
  codes and without the pnpm epilogue that used to hide the diagnostics.
- forbidden_hits: content the model may not write (type-checker, linter or
  test-runner suppressions).
- rule_ids_from_issue / rule_coverage: every business-rule id of the issue
  must appear in the task's test files.
- failed_test_files: which of the task's test files the runner reported as
  failing (honest RED check).
- scoped_command: run only the task's test files.
- crlf_offenders: tracked files whose working copy is CRLF although
  .gitattributes pins LF (breaks vitest and schema:check on Windows).
- repo_tree / parse_file_list: the two halves of the CLI-free Stage 1.
"""
import json
import os
import re
import subprocess
from typing import Iterable, List, Optional, Sequence, Tuple

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")

DEFAULT_FORBIDDEN_PATTERNS: List[str] = [
    r"@ts-nocheck",
    r"@ts-ignore",
    r"@ts-expect-error",
    r"eslint-disable",
    r"#\s*type:\s*ignore",
    r"#\s*noqa\b",
]
DEFAULT_FORBIDDEN_TEST_PATTERNS: List[str] = [
    r"\b(it|test|describe)\.(skip|only)\s*\(",
    r"\b(xit|xtest|xdescribe|fit|fdescribe)\s*\(",
    r"@unittest\.skip",
    r"@pytest\.mark\.skip",
]

# A rules-table row: "| BR-S02.T02-01 | ... |" or "| RN-01 | ... |".
RULE_ROW_RE = re.compile(r"^\|\s*([A-Z][A-Z0-9]+-[A-Za-z0-9][A-Za-z0-9._-]*)\s*\|", re.MULTILINE)
DIAG_RE = re.compile(r"error TS\d+|\berror\b|\bFAIL\b|×|✗|AssertionError|SyntaxError|TypeError|Expected|Received|\bassert",
                     re.IGNORECASE)
NOISE_RE = re.compile(r"ELIFECYCLE|ERR_PNPM|^npm warn|^\$ |^> ", re.IGNORECASE)
FAIL_MARK_RE = re.compile(r"\bFAIL\b|×|✗|❯|\bERROR\b|\bFAILED\b")


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text or "")


def diag_tail(stdout: str, stderr: str, limit: int = 1500) -> str:
    """The useful part of a failed command: diagnostic lines first, plain tail otherwise."""
    full = strip_ansi((stdout or "") + "\n" + (stderr or "")).strip()
    diags = [l for l in full.splitlines() if DIAG_RE.search(l) and not NOISE_RE.search(l)]
    picked = "\n".join(diags).strip()
    return picked[:limit] if picked else full[-limit:]


def forbidden_hits(content: str, patterns: Sequence[str]) -> List[str]:
    """First offending line per pattern, as 'pattern @ line N: text'."""
    hits: List[str] = []
    lines = (content or "").split("\n")
    for pat in patterns:
        rx = re.compile(pat)
        for i, line in enumerate(lines, 1):
            if rx.search(line):
                hits.append(f"{pat} @ line {i}: {line.strip()[:120]}")
                break
    return hits


def rule_ids_from_issue(body: str) -> List[str]:
    """Ids in the first column of the business-rules table(s) of an issue body, in order, unique."""
    seen: List[str] = []
    for rid in RULE_ROW_RE.findall(body or ""):
        if rid not in seen:
            seen.append(rid)
    return seen


def rule_coverage(rule_ids: Iterable[str], texts: Iterable[str]) -> Tuple[List[str], List[str]]:
    """(covered, missing): a rule is covered when its id appears verbatim in any text."""
    corpus = "\n".join(texts)
    covered = [r for r in rule_ids if r in corpus]
    missing = [r for r in rule_ids if r not in corpus]
    return covered, missing


def failed_test_files(test_output: str, test_paths: Sequence[str]) -> Optional[List[str]]:
    """
    Which of `test_paths` the runner reported as failing.
    Returns None when the output never mentions any of the files (a runner that
    prints test names only, like unittest), so callers can skip the check.
    """
    text = strip_ansi(test_output or "")
    names = {p: os.path.basename(p) for p in test_paths}
    if not any(n in text for n in names.values()):
        return None
    failed: List[str] = []
    for line in text.splitlines():
        if not FAIL_MARK_RE.search(line):
            continue
        for path, name in names.items():
            if name in line and path not in failed:
                failed.append(path)
    return failed


def scoped_command(base_command: str, paths: Optional[Sequence[str]]) -> str:
    """`pnpm test` + the task's test files (quoted when needed); base command when no paths."""
    if not paths:
        return base_command
    quoted = [f'"{p}"' if " " in p else p for p in paths]
    return base_command + " " + " ".join(quoted)


def crlf_offenders_from_eol(eol_listing: str) -> List[str]:
    """Paths whose working copy is CRLF while the attribute pins LF (output of `git ls-files --eol`)."""
    out: List[str] = []
    for line in (eol_listing or "").splitlines():
        if "w/crlf" in line and "eol=lf" in line and "\t" in line:
            out.append(line.split("\t", 1)[1].strip())
    return out


def crlf_offenders(repo_root: str) -> List[str]:
    try:
        res = subprocess.run(["git", "ls-files", "--eol"], capture_output=True, text=True,
                             encoding="utf-8", errors="replace", cwd=repo_root, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return []
    return crlf_offenders_from_eol(res.stdout)


def repo_tree(repo_root: str, allowed_paths: Sequence[str], max_chars: int = 20000) -> str:
    """Tracked files under the allowed prefixes (all files when the list is empty), one per line."""
    try:
        res = subprocess.run(["git", "ls-files"], capture_output=True, text=True,
                             encoding="utf-8", errors="replace", cwd=repo_root, timeout=60)
        files = [l.strip() for l in res.stdout.splitlines() if l.strip()]
    except (OSError, subprocess.TimeoutExpired):
        files = []
    prefixes = [p.strip("/").replace("\\", "/") for p in allowed_paths if p.strip()]
    if prefixes:  # keep root-level files (manifests, tsconfig) so conventions stay visible
        files = [f for f in files if "/" not in f or any(f == p or f.startswith(p + "/") for p in prefixes)]
    text = "\n".join(files)
    if len(text) > max_chars:
        text = text[:max_chars].rsplit("\n", 1)[0] + f"\n... ({len(files)} files in total; listing truncated)"
    return text or "(no tracked files under the allowed paths)"


def parse_file_list(response: str, limit: int = 8) -> List[str]:
    """
    Repo-relative paths chosen by the file-selection call: the first JSON array of
    strings in the response; otherwise any bullet or backticked token that looks
    like a path. Normalised, de-duplicated, capped at `limit`.
    """
    text = response or ""
    found: List[str] = []
    decoder = json.JSONDecoder()
    for m in re.finditer(r"\[", text):
        try:
            value, _ = decoder.raw_decode(text[m.start():])
        except ValueError:
            continue
        if isinstance(value, list) and all(isinstance(v, str) for v in value):
            found = value
            break
    if not found:
        for tok in re.findall(r"`([^`\n]+)`|^\s*[-*]\s+(\S+)", text, re.MULTILINE):
            cand = tok[0] or tok[1]
            if "/" in cand or "." in cand:
                found.append(cand)
    out: List[str] = []
    for p in found:
        rel = p.strip().strip("`").replace("\\", "/")
        while rel.startswith("./"):
            rel = rel[2:]
        rel = rel.strip("/")
        if rel and rel not in out:
            out.append(rel)
        if len(out) >= limit:
            break
    return out


def inject_files(paths: Sequence[str], read_text, fence_for, max_chars: int) -> Tuple[str, List[str], List[str]]:
    """
    Build the injected WORKSPACE FILES block within `max_chars`.
    `read_text(path) -> Optional[str]` and `fence_for(path) -> str` are injected to
    stay independent of file_ops. Returns (block, included, omitted).
    """
    parts: List[str] = []
    included: List[str] = []
    omitted: List[str] = []
    total = 0
    for p in paths:
        content = read_text(p)
        if content is None:
            omitted.append(f"{p} (unreadable or missing)")
            continue
        block = f"### FILE: {p}\n```{fence_for(p)}\n{content.rstrip()}\n```\n"
        if total + len(block) > max_chars:
            omitted.append(f"{p} (injection limit of {max_chars} chars reached)")
            continue
        parts.append(block)
        included.append(p)
        total += len(block)
    return ("\n".join(parts) if parts else "(none)"), included, omitted
