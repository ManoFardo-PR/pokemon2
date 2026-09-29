"""
Offline tests for the phase-1 hardening of the orchestrator (2026-09-29):
checks.py (diagnostics, suppression guard, rule coverage, honest RED, CRLF,
CLI-free Stage 1 helpers), validation_handler scoping and metrics parsing.
No network, no LLM.

Run from the repository root:
    python -m unittest modules/TESTE/test_pipeline_checks.py -v
"""
import copy
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MODULES_DIR = os.path.dirname(CURRENT_DIR)
REPO_ROOT = os.path.dirname(MODULES_DIR)
for d in (MODULES_DIR, CURRENT_DIR):
    if d not in sys.path:
        sys.path.insert(0, d)

import checks                    # noqa: E402
import metrics                   # noqa: E402
import validation_handler        # noqa: E402
import seed_issues as si         # noqa: E402
from main import load_config     # noqa: E402

PNPM_EPILOGUE = """$ pnpm -r run typecheck && tsc -p scripts/tsconfig.json
$ tsc --noEmit
src/fetch-ptcg.ts(139,9): error TS2322: Type 'string' is not assignable to type 'number'.
$ tsc --noEmit
[ELIFECYCLE] Command failed with exit code 2.
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
  × "pnpm recursive run" failed in C:\\repo\\packages\\etl
[ELIFECYCLE] Command failed with exit code 1."""

VITEST_OUTPUT = """\x1b[31m FAIL \x1b[39m @pokesearch/etl  src/paths.spec.ts > sandbox > rejects ../ escapes
AssertionError: expected 'ok' to be 'error'
 FAIL  @pokesearch/etl  src/paths.spec.ts [ src/paths.spec.ts ]
 ✓ @pokesearch/etl  src/logger.spec.ts (4 tests)
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 19 passed (20)"""

UNITTEST_OUTPUT = """test_hello (test_hello.TestHello.test_hello) ... ERROR
======================================================================
ERROR: test_hello (test_hello.TestHello.test_hello)
ModuleNotFoundError: No module named 'src.hello'
FAILED (errors=1)"""


class Diagnostics(unittest.TestCase):
    def test_strip_ansi(self):
        self.assertEqual(checks.strip_ansi("\x1b[31mFAIL\x1b[39m ok"), "FAIL ok")

    def test_diag_tail_prefers_diagnostics_over_pnpm_epilogue(self):
        out = checks.diag_tail(PNPM_EPILOGUE, "", 1500)
        self.assertIn("error TS2322", out)
        self.assertNotIn("ELIFECYCLE", out)
        self.assertNotIn("ERR_PNPM", out)

    def test_diag_tail_falls_back_to_plain_tail(self):
        self.assertEqual(checks.diag_tail("just some text", "", 100), "just some text")

    def test_diag_tail_strips_colour_codes(self):
        self.assertNotIn("\x1b", checks.diag_tail(VITEST_OUTPUT, "", 2000))


class SuppressionGuard(unittest.TestCase):
    def test_detects_typecheck_and_lint_suppressions(self):
        content = "// @ts-nocheck\nimport x from './x';\n/* eslint-disable */\n"
        hits = checks.forbidden_hits(content, checks.DEFAULT_FORBIDDEN_PATTERNS)
        self.assertEqual(len(hits), 2)
        self.assertTrue(hits[0].startswith("@ts-nocheck @ line 1"))

    def test_detects_skipped_or_focused_tests(self):
        content = "describe('x', () => {\n  it.skip('a', () => {});\n  test.only('b', () => {});\n});\n"
        hits = checks.forbidden_hits(content, checks.DEFAULT_FORBIDDEN_TEST_PATTERNS)
        self.assertEqual(len(hits), 1)
        self.assertIn("line 2", hits[0])

    def test_clean_file_passes(self):
        self.assertEqual(checks.forbidden_hits("export const a = 1;\n", checks.DEFAULT_FORBIDDEN_PATTERNS
                                               + checks.DEFAULT_FORBIDDEN_TEST_PATTERNS), [])


class RuleCoverage(unittest.TestCase):
    def rendered_body(self, backlog, task_id):
        with open(os.path.join(CURRENT_DIR, backlog), encoding="utf-8") as f:
            items = copy.deepcopy(json.load(f))
        ordered, _ = si.prepare_backlog(items)
        item = next(it for it in ordered if it["id"] == task_id)
        body, comments = si.render_issue(item)
        return body + "\n\n" + "\n\n".join(comments), item

    def test_rule_ids_from_rendered_issue(self):
        body, item = self.rendered_body("S02-backlog.json", "S02T02")
        ids = checks.rule_ids_from_issue(body)
        self.assertEqual(ids, [r["id"] for r in item["business_rules"]])
        self.assertEqual(len(ids), 8)

    def test_rule_ids_accept_other_prefixes_and_skip_header_rows(self):
        body = "| Campo | Valor |\n|---|---|\n| ID Tarefa | S02T05 |\n\n| ID | Regra |\n|---|---|\n| RN-01 | a |\n| BR-S02.T05-02 | b |\n| RN-01 | again |\n"
        self.assertEqual(checks.rule_ids_from_issue(body), ["RN-01", "BR-S02.T05-02"])

    def test_coverage_split(self):
        covered, missing = checks.rule_coverage(["BR-1", "BR-2", "BR-3"], ["it('x (BR-1)')", "// BR-3"])
        self.assertEqual((covered, missing), (["BR-1", "BR-3"], ["BR-2"]))


class HonestRed(unittest.TestCase):
    def test_vitest_failure_attributed_to_task_files(self):
        failed = checks.failed_test_files(VITEST_OUTPUT, ["packages/etl/src/paths.spec.ts", "packages/etl/src/logger.spec.ts"])
        self.assertEqual(failed, ["packages/etl/src/paths.spec.ts"])

    def test_failure_elsewhere_returns_empty_list(self):
        other = VITEST_OUTPUT.replace("paths.spec.ts", "docs-lint.spec.mjs")
        self.assertEqual(checks.failed_test_files(other, ["packages/etl/src/paths.spec.ts", "packages/etl/src/logger.spec.ts"]), [])

    def test_runner_without_file_names_returns_none(self):
        self.assertIsNone(checks.failed_test_files(UNITTEST_OUTPUT, ["tests/hello_demo/test_hello.py"]))

    def test_scoped_command(self):
        self.assertEqual(checks.scoped_command("pnpm test", None), "pnpm test")
        self.assertEqual(checks.scoped_command("pnpm test", ["a/b.spec.ts", "c d/e.spec.ts"]),
                         'pnpm test a/b.spec.ts "c d/e.spec.ts"')


class LineEndings(unittest.TestCase):
    def test_crlf_offenders_from_eol_listing(self):
        listing = ("i/lf    w/crlf  attr/text eol=lf      \tpackages/shared/schema/card-def.json\n"
                   "i/lf    w/lf    attr/text eol=lf      \tpackages/shared/schema/decklist.json\n"
                   "i/crlf  w/crlf  attr/                 \tlegacy/win.txt\n")
        self.assertEqual(checks.crlf_offenders_from_eol(listing), ["packages/shared/schema/card-def.json"])


class Stage1Helpers(unittest.TestCase):
    def test_parse_file_list_json_in_fence(self):
        raw = 'Here you go:\n```json\n["packages/etl/src/paths.ts", "./packages/etl/package.json", "packages/etl/src/paths.ts"]\n```'
        self.assertEqual(checks.parse_file_list(raw, 8), ["packages/etl/src/paths.ts", "packages/etl/package.json"])

    def test_parse_file_list_bullets_fallback_and_limit(self):
        raw = "- `packages/a/x.ts`\n- packages/b/y.ts\n- just words\n- `packages/c/z.ts`"
        self.assertEqual(checks.parse_file_list(raw, 2), ["packages/a/x.ts", "packages/b/y.ts"])

    def test_repo_tree_keeps_root_files_and_allowed_prefixes_only(self):
        tree = checks.repo_tree(REPO_ROOT, ["packages"], max_chars=200000).splitlines()
        self.assertIn("package.json", tree)
        self.assertTrue(any(l.startswith("packages/etl/") for l in tree))
        self.assertFalse(any(l.startswith("modules/") for l in tree))

    def test_inject_files_respects_budget(self):
        contents = {"a.ts": "x" * 50, "b.ts": "y" * 50, "c.ts": None}
        block, included, omitted = checks.inject_files(
            ["a.ts", "b.ts", "c.ts"], contents.get, lambda p: "ts", max_chars=90)
        self.assertEqual(included, ["a.ts"])
        self.assertEqual(len(omitted), 2)
        self.assertIn("### FILE: a.ts", block)


class ValidationScoping(unittest.TestCase):
    def test_quiet_env_disables_colour_but_does_not_claim_ci(self):
        env = validation_handler.quiet_env()
        self.assertEqual((env["NO_COLOR"], env["FORCE_COLOR"]), ("1", "0"))
        # CI=true changes typescript-eslint's project service and broke lint-config.spec.ts locally
        self.assertEqual(env.get("CI"), os.environ.get("CI"))

    def test_run_tests_appends_paths_and_check_is_optional(self):
        calls = []

        def fake_run(command, timeout=60, cwd=None, env=None, input_text=None):
            calls.append((command, timeout, env is not None and env.get("NO_COLOR") == "1"))
            return {"stdout": "", "stderr": "", "exit_code": 0, "success": True}

        with mock.patch.object(validation_handler, "run_terminal_command", fake_run):
            vh = validation_handler.ValidationHandler("pnpm test", "pnpm typecheck", cwd=".", check_cmd=None, test_timeout=42)
            vh.run_tests(["packages/etl/src/a.spec.ts"])
            vh.run_tests()
            self.assertTrue(vh.run_check()["skipped"])
        self.assertEqual(calls[0], ("pnpm test packages/etl/src/a.spec.ts", 42, True))
        self.assertEqual(calls[1][0], "pnpm test")

    def test_analyze_errors_uses_diagnostics(self):
        vh = validation_handler.ValidationHandler()
        report = vh.analyze_errors(None, {"success": False, "stdout": PNPM_EPILOGUE, "stderr": ""})
        self.assertIn("error TS2322", report)
        self.assertNotIn("ELIFECYCLE", report)


class MetricsParsing(unittest.TestCase):
    LOG = "\n".join([
        "==== 15:22:10 | S02T01 | TASK_START | #1 [S02T01] title | labels=tdd-queue ====",
        "==== 15:22:14 | S02T01 | LLM_PROMPT | stage1_r1 | chars=28510 call=1 ====",
        "==== 15:24:39 | S02T01 | LLM_RESPONSE | stage1_r1 | chars=22864 elapsed=144.3s exit=0 ====",
        "==== 15:24:39 | S02T01 | GATE | fase 1 rodada 1: REWORK (checks) ====",
        "==== 15:24:41 | S02T01 | LLM_PROMPT | stage1_r2 | chars=52336 call=2 ====",
        "==== 15:25:00 | S02T01 | LLM_TRACE | tentativa 1 | gemini direto m: entrada=30000 saída=7000 pensamento=500 tokens; finishReason=STOP ====",
        "==== 15:25:37 | S02T01 | LLM_RESPONSE | stage1_r2 | chars=23263 elapsed=56.1s exit=0 ====",
        "==== 15:25:47 | S02T01 | GATE | fase 1 rodada 2: CORRECT ====",
        "==== 15:26:00 | S02T01 | FILE_WRITE | packages/etl/src/a.ts | op=create kind=FILE ====",
        "==== 15:53:57 | S02T01 | TASK_END | #1 FALHOU | llm_calls=2 files=1 elapsed=1906s ====",
        "==== END TASK_END ====",
    ])

    def test_summarize_one_attempt(self):
        with tempfile.NamedTemporaryFile("w", suffix=".log", delete=False, encoding="utf-8") as f:
            f.write(self.LOG)
            path = f.name
        try:
            rows = metrics.summarize(metrics.parse_headers(path))
        finally:
            os.remove(path)
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual((r["task"], r["outcome"], r["calls"], r["chars_sent"], r["files_written"]),
                         ("S02T01", "failed", 2, 80846, 1))
        self.assertAlmostEqual(r["wait_s"], 200.4, places=1)
        self.assertEqual((r["prompt_tokens"], r["output_tokens"], r["thinking_tokens"], r["direct_requests"]), (30000, 7000, 500, 1))
        self.assertEqual(r["rework"], {"1": 1})
        self.assertEqual(r["elapsed_s"], 1906)
        self.assertIn("S02T01", metrics.render(rows))


class StageFlowOffline(unittest.TestCase):
    """
    Stages 2 and 3 end to end with the LLM, GitHub and the validators stubbed, in a
    temporary repository. This is the test that would have caught the UnboundLocalError
    of 2026-09-29 (`checks` module shadowed by the stage's local variable).
    """
    PLAN = "\n".join([
        "### 1. Objective and Context", "demo",
        "### 2. Target Files",
        "| Path | Role | Action | Purpose |", "|---|---|---|---|",
        "| packages/demo/src/thing.ts | src | create | impl |",
        "| packages/demo/src/thing.spec.ts | test | create | tests |",
        "### 3. Technical Requirements and Contracts", "BR-X-01, BR-X-02",
        "### 4. Test Scenarios (RED phase)", "- a",
        "### 5. Architecture and Coding Constraints", "none",
        "### 6. Existing Code This Task Depends On", "None", "",
    ])
    BODY = "## ⚙️ Regras de Negócio\n| ID | Regra de Negócio |\n|---|---|\n| BR-X-01 | a |\n| BR-X-02 | b |\n"
    FENCE = "`" * 3

    def setUp(self):
        from main import Orchestrator  # noqa: E402  (import here: main resolves npx at construction only)
        self.tmp = tempfile.mkdtemp(prefix="orch-flow-")
        os.makedirs(os.path.join(self.tmp, "repo", "packages", "demo", "src"))
        yaml = os.path.join(self.tmp, "config.yaml")
        open(yaml, "w", encoding="utf-8").write("models: []\n")
        cfg_path = os.path.join(self.tmp, "config.json")
        json.dump({
            "continue_cli_path": "npx @continuedev/cli", "continue_config": yaml,
            "repo_root": os.path.join(self.tmp, "repo"), "allowed_paths": ["packages"],
            "test_command": "pnpm test", "typecheck_command": "pnpm typecheck", "trigger_label": "tdd-queue",
            "verify_stages": [], "verify_max_rounds": 0, "audit_mode": "local", "preflight": False,
            "live_log": os.path.join(self.tmp, "live.log"),
        }, open(cfg_path, "w", encoding="utf-8"))
        self.orch = Orchestrator(load_config(cfg_path))
        self.orch.logs_dir = os.path.join(self.tmp, "logs")
        self.state = {"phase": "red", "runs": [], "asked": []}
        gh_calls = []
        self.orch.gh = mock.Mock(**{
            "set_stage.return_value": True, "add_comment.side_effect": lambda n, b: gh_calls.append(b) or True,
            "get_issue_labels.return_value": [], "get_issue_full_body.return_value": self.BODY,
        })
        self.gh_calls = gh_calls
        self.orch.validator.check_compilation = lambda: {"success": True, "exit_code": 0, "stdout": "", "stderr": "", "command": ""}

        def run_tests(paths=None):
            self.state["runs"].append(paths)
            if self.state["phase"] == "red":
                return {"success": False, "exit_code": 1, "stdout": " FAIL  packages/demo/src/thing.spec.ts > x\nError: Failed to load ./thing.js",
                        "stderr": "", "command": ""}
            return {"success": True, "exit_code": 0, "stdout": " ✓ thing.spec.ts (2 tests)", "stderr": "", "command": ""}
        self.orch.validator.run_tests = run_tests

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def stub_llm(self, test_body: str):
        def ask(prompt, tag, task_id, single_shot=False):
            self.state["asked"].append(tag)
            if tag.startswith("stage2"):
                return f"### FILE: packages/demo/src/thing.spec.ts\n{self.FENCE}ts\n{test_body}\n{self.FENCE}\n"
            return f"### FILE: packages/demo/src/thing.ts\n{self.FENCE}ts\nexport const thing = 1;\n{self.FENCE}\n"
        self.orch._ask_cli = ask

    def test_red_then_green_local_audit(self):
        self.stub_llm("import { thing } from './thing.js';\nit('thing is 1 (BR-X-01, BR-X-02)', () => { expect(thing).toBe(1); });")
        issue = {"number": 99, "title": "[ZZFLOW] demo", "body": ""}
        tests_md = self.orch.stage2_red(issue, "ZZFLOW", self.PLAN)
        self.assertIn("### FILE: packages/demo/src/thing.spec.ts", tests_md)
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "repo", "packages", "demo", "src", "thing.spec.ts")))
        self.assertEqual(self.state["runs"], [["packages/demo/src/thing.spec.ts"]])  # scoped RED run
        red_report = next(b for b in self.gh_calls if "[Estágio 2" in b)
        self.assertIn("Rule coverage: 2/2", red_report)

        self.state["phase"] = "green"
        result = self.orch.stage3_green_and_audit(issue, "ZZFLOW", self.PLAN, tests_md)
        self.assertTrue(result["success"])
        self.assertEqual(result["attempts"], 1)
        self.assertIn("packages/demo/src/thing.ts", self.orch.files_touched)
        # Stage 4: scoped run first, then the full suite
        self.assertEqual(self.state["runs"][1:], [["packages/demo/src/thing.spec.ts"], None])
        self.assertEqual(self.state["asked"], ["stage2_r1", "stage3_r1"])

    def test_red_rejects_missing_rule_ids(self):
        from main import StageError
        self.stub_llm("import { thing } from './thing.js';\nit('only BR-X-01', () => { expect(thing).toBe(1); });")
        with self.assertRaisesRegex(StageError, "missing: BR-X-02"):
            self.orch.stage2_red({"number": 99, "title": "[ZZFLOW] demo", "body": ""}, "ZZFLOW", self.PLAN)

    def test_red_rejects_suppressed_test_file(self):
        from main import StageError
        self.stub_llm("// @ts-nocheck\nit('x (BR-X-01, BR-X-02)', () => {});")
        with self.assertRaisesRegex(StageError, "forbidden content"):
            self.orch.stage2_red({"number": 99, "title": "[ZZFLOW] demo", "body": ""}, "ZZFLOW", self.PLAN)


class ConfigDefaults(unittest.TestCase):
    def test_phase1_defaults_and_validation(self):
        base = {"continue_cli_path": "npx @continuedev/cli", "test_command": "pnpm test",
                "typecheck_command": "pnpm typecheck", "trigger_label": "tdd-queue"}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(base, f)
            path = f.name
        try:
            cfg = load_config(path)
            self.assertEqual((cfg["stage1_mode"], cfg["preflight"], cfg["test_scope"], cfg["check_command"]),
                             ("direct", True, True, ""))
            self.assertIn("@ts-nocheck", cfg["forbidden_patterns"])
            with open(path, "w", encoding="utf-8") as f:
                json.dump({**base, "stage1_mode": "magic"}, f)
            with self.assertRaisesRegex(ValueError, "stage1_mode"):
                load_config(path)
        finally:
            os.remove(path)


if __name__ == "__main__":
    unittest.main()
