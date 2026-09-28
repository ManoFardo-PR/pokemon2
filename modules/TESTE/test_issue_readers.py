"""
Offline regression tests for the issue-reading side of the orchestrator.

They render real backlog items with the seeder and pass the result through the
readers (`dependency.py`, `Orchestrator._issue_section_paths`,
`GitHubHandler.get_issue_full_body`) to make sure what the seeder writes is what
the orchestrator reads. No network: `GitHubHandler._gh` is replaced by a fake.

Run from the repository root:
    python -m unittest modules/TESTE/test_issue_readers.py -v
"""
import copy
import glob
import json
import os
import re
import sys
import unittest

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MODULES_DIR = os.path.dirname(CURRENT_DIR)
for d in (MODULES_DIR, CURRENT_DIR):
    if d not in sys.path:
        sys.path.insert(0, d)

import dependency                      # noqa: E402
import seed_issues as si               # noqa: E402
from github_handler import GitHubHandler  # noqa: E402
from main import Orchestrator          # noqa: E402

TEMPLATE_H2 = re.compile(r"## (🎯|🔍|📥|📤|🔌|⚙️|🧪|✅|🗂️|📖|📁)")
SAMPLES = [("S02-backlog.json", "S02T05"), ("S02-backlog.json", "S02T01"), ("S07-backlog.json", "S07T07")]


def load_backlog(name):
    with open(os.path.join(CURRENT_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def prepared(name):
    """Items in topological order with depends_on/unblocks/seq filled; never written back."""
    ordered, _ = si.prepare_backlog(copy.deepcopy(load_backlog(name)))
    return ordered


def outside_fences(text):
    """Lines of `text` that are not inside a ``` / ~~~ code fence (same rule as the reader)."""
    out, fence = [], ""
    for line in text.split("\n"):
        stripped = line.lstrip()
        if not fence and stripped[:3] in ("```", "~~~"):
            fence = stripped[0] * (len(stripped) - len(stripped.lstrip(stripped[0])))
            continue
        if fence:
            if stripped.startswith(fence):
                fence = ""
            continue
        out.append(line)
    return out


def rendered(name, task_id):
    item = next(it for it in prepared(name) if it["id"] == task_id)
    body, comments = si.render_issue(item)
    return item, body, comments


class RenderedBodyIsReadBack(unittest.TestCase):
    """What the seeder writes is what dependency.py and main.py read."""

    def test_samples_round_trip(self):
        for name, tid in SAMPLES:
            with self.subTest(item=tid):
                item, body, _ = rendered(name, tid)
                issue = {"number": 1, "title": f"[{tid}] {item['title']}", "body": body}
                self.assertEqual(dependency.task_id_of(issue), tid)
                self.assertEqual(dependency.parse_depends_on(body), dependency.normalize_ids(item["depends_on"]))
                self.assertEqual(dependency.parse_seq(body), item["seq"])
                self.assertEqual(Orchestrator._issue_section_paths(body, "Arquivos Alvo", "Target Files"),
                                 list(item["target_files"]))
                self.assertEqual(Orchestrator._issue_section_paths(body, "Arquivos para ler", "Files to read"),
                                 list(item.get("read_files", [])))

    def test_section_reader_ignores_headings_inside_code_fences(self):
        body = ("## 🔍 Contexto\n```markdown\n## Arquivos Alvo (example inside a fence)\n- `fake/inside.py`\n```\n"
                "````\n```\n## Target Files nested\n- `fake/nested.py`\n```\n````\n"
                "## 📁 Arquivos Alvo a Criar/Editar\n- `real/a.py`\n- `real/b.ts`\n\n## 📖 Arquivos para ler\n- `real/c.md`\n")
        self.assertEqual(Orchestrator._issue_section_paths(body, "Arquivos Alvo", "Target Files"), ["real/a.py", "real/b.ts"])
        self.assertEqual(Orchestrator._issue_section_paths(body, "Arquivos para ler", "Files to read"), ["real/c.md"])

    def test_cross_stage_row_is_not_read_as_dependency(self):
        item, body, _ = rendered("S02-backlog.json", "S02T01")
        self.assertIn("| Depende de (outros estágios) | S01T01, S01T04 |", body)
        without_marker = dependency.DEP_MARK_RE.sub("", body)
        self.assertEqual(dependency.parse_depends_on(without_marker), [])

    def test_files_and_markers_always_stay_in_body(self):
        item, body, comments = rendered("S07-backlog.json", "S07T07")
        self.assertEqual(len(dependency.DEP_MARK_RE.findall(body)), 1)
        self.assertEqual(len(dependency.SEQ_MARK_RE.findall(body)), 1)
        self.assertIn("## 📁 Arquivos Alvo a Criar/Editar", body)
        self.assertIn("## 📖 Arquivos para ler primeiro", body)
        for c in comments:
            self.assertRegex(c, r"^<!-- continuação \d+/\d+ -->")

    def test_all_items_render_without_foreign_h2(self):
        """Outside code fences, no line of any rendered body starts with '## ' unless it is a template section."""
        for path in sorted(glob.glob(os.path.join(CURRENT_DIR, "S0*-backlog.json"))):
            try:
                items = prepared(os.path.basename(path))
            except ValueError as e:  # a backlog with a known validation problem is reported, not fatal here
                self.skipTest(f"{os.path.basename(path)}: {e}")
            for it in items:
                body, comments = si.render_issue(it)
                text = body + "\n" + "\n".join(comments)
                foreign = [l for l in outside_fences(text) if l.startswith("## ") and not TEMPLATE_H2.match(l)]
                self.assertEqual(foreign, [], f"{it['id']}: {foreign[:3]}")
                self.assertEqual(Orchestrator._issue_section_paths(body, "Arquivos Alvo", "Target Files"),
                                 list(it["target_files"]), it["id"])
                for c in comments:
                    self.assertGreater(len(c), si.KEEP_IN_BODY_CHARS + 60, f"{it['id']}: placeholder-only comment")


class SeederHelpers(unittest.TestCase):
    def test_demote_headings(self):
        text = "# Title\n## Sub\n### Deep\n```\n# inside code\n```\n~~~\n## inside tilde\n~~~\n# Last"
        expected = "### Title\n### Sub\n#### Deep\n```\n# inside code\n```\n~~~\n## inside tilde\n~~~\n### Last"
        self.assertEqual(si._demote_headings(text), expected)

    def test_empty_target_files_aborts(self):
        items = [{"id": "X01", "title": "x", "target_files": ["a/b.py"]},
                 {"id": "X02", "title": "y", "target_files": []},
                 {"id": "X03", "title": "z"}]
        with self.assertRaisesRegex(ValueError, r"target_files is required and empty in: \['X02', 'X03'\]"):
            si.prepare_backlog(items)

    def test_small_sections_never_move_to_comments(self):
        item = {"id": "X01", "title": "x", "objective": "o", "context": "c" * (si.BODY_BUDGET + 10),
                "target_files": ["a/b.py"], "test_scenarios": [], "done_when": ["d"]}
        si.prepare_backlog([item])
        body, comments = si.render_issue(item)
        self.assertTrue(comments)
        self.assertIn("## 🧪 Cenários de teste", body)
        self.assertIn("## 🎯 Objetivo\no\n", body)
        self.assertTrue(any("## 🔍 Contexto" in c for c in comments))


class FakeGh:
    """Stands in for GitHubHandler._gh; returns a canned `gh issue view --json body,comments`."""

    def __init__(self, payload, success=True):
        self.payload, self.success, self.calls = payload, success, []

    def __call__(self, args, timeout=60):
        self.calls.append(args)
        return {"success": self.success, "stdout": json.dumps(self.payload) if self.success else "",
                "stderr": "" if self.success else "boom", "exit_code": 0 if self.success else 1}


class FullBodyMergesContinuations(unittest.TestCase):
    def handler(self, fake):
        gh = GitHubHandler(repo=None, cwd=CURRENT_DIR)
        gh._gh = fake
        return gh

    def test_continuations_in_order_and_orchestrator_comments_dropped(self):
        payload = {"body": "BODY", "comments": [
            {"body": "🤖 **[Orquestrador TDD]** Iniciando"},
            {"body": "<!-- continuação 2/2 -->\n**Continuação 2/2**\n\nSECOND"},
            {"body": "🔎 **[Gate fase 1, rodada 1]** CORRECT"},
            {"body": "<!-- continuação 1/2 -->\n**Continuação 1/2**\n\nFIRST"},
        ]}
        fake = FakeGh(payload)
        text = self.handler(fake).get_issue_full_body(42)
        self.assertEqual(text.index("BODY") < text.index("FIRST") < text.index("SECOND"), True)
        self.assertNotIn("Orquestrador", text)
        self.assertNotIn("Gate fase", text)
        self.assertEqual(fake.calls[0][:3], ["issue", "view", "42"])
        self.assertIn("body,comments", fake.calls[0])

    def test_no_comments_returns_body(self):
        self.assertEqual(self.handler(FakeGh({"body": "ONLY", "comments": []})).get_issue_full_body(1), "ONLY")

    def test_failure_returns_empty_string(self):
        self.assertEqual(self.handler(FakeGh({}, success=False)).get_issue_full_body(1), "")


if __name__ == "__main__":
    unittest.main()
