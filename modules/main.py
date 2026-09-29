"""
Orquestrador TDD Autônomo - ponto de entrada e máquina de estados.

Uso (da raiz do repositório ou de qualquer lugar):
    python modules/main.py                 # interativo: lista a fila e pergunta o que rodar
    python modules/main.py --once          # a primeira da fila e sai
    python modules/main.py --batch 10      # as 10 primeiras e sai
    python modules/main.py --all           # toda a fila e sai
    python modules/main.py --select 2,4-6  # índices da fila (ou #12,#14 = números de issue)
    python modules/main.py --issue 4       # só a issue #4
    python modules/main.py --poll          # polling contínuo (automação; padrão sem terminal)
    python modules/main.py --verbose ...   # corpo completo de prompts/respostas no console

Monitor em outro terminal: python modules/monitor.py

Estado = labels da issue no GitHub (ver github_handler.py). Artefatos
intermediários (plano, testes, prompts, respostas) ficam em
modules/logs/<task_id>/ para permitir retomada após reinício. A trilha
cronológica de tudo vai para modules/logs/live.log (reporter.py).

Princípio: cada fase recebe um prompt autocontido (template + saída da fase
anterior + conteúdo atual dos arquivos a editar, injetado pelo orquestrador)
e devolve uma saída autocontida. Só o Estágio 1 lê o workspace. Entre as
fases há um portão determinístico (custo zero) e, opcionalmente, um portão
LLM (PROMPT/VERIFY.MD) que responde CORRECT ou REWORK.
"""
import sys

if hasattr(sys.stdout, "reconfigure"):  # console Windows em cp1252 quebra com emojis
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import hashlib
import json
import os
import re
import time
import traceback
from datetime import date
from typing import Any, Callable, Dict, List, Optional, Tuple

MODULES_DIR = os.path.dirname(os.path.abspath(__file__))
if MODULES_DIR not in sys.path:
    sys.path.insert(0, MODULES_DIR)

import checks as chk                                  # noqa: E402  (alias: stages have a local named `checks`)
import dependency                                     # noqa: E402
import file_ops                                       # noqa: E402
import selector                                       # noqa: E402
from continue_cli import ContinueCLIHandler           # noqa: E402
from decision_engine import DecisionEngine            # noqa: E402
from github_handler import GitHubHandler              # noqa: E402
from reporter import NullReporter, Reporter           # noqa: E402
from validation_handler import ValidationHandler, run_terminal_command  # noqa: E402

STAGE_LABEL = {1: "tdd-context", 2: "tdd-red", 3: "tdd-green", 4: "tdd-audit"}
STAGE_NAME = {1: "Stage 1 - Planning", 2: "Stage 2 - TDD RED (tests)",
              3: "Stage 3 - TDD GREEN (implementation)", 4: "Stage 4 - Audit"}
ROLES = ("test", "src", "config", "doc")
ACTIONS = ("create", "patch", "rewrite")


# ----------------------------------------------------------------------
# Configuração
# ----------------------------------------------------------------------
def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """Carrega modules/config.json e resolve caminhos relativos a modules/."""
    path = config_path or os.path.join(MODULES_DIR, "config.json")
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    required = ["continue_cli_path", "test_command", "typecheck_command", "trigger_label"]
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        raise ValueError(f"config.json sem campos obrigatórios: {missing}")

    cfg["repo_root"] = os.path.abspath(os.path.join(MODULES_DIR, cfg.get("repo_root", "..")))
    cfg["continue_config"] = os.path.abspath(
        os.path.join(MODULES_DIR, cfg.get("continue_config", "../.continue/config.yaml"))
    )
    if not os.path.exists(cfg["continue_config"]):
        raise FileNotFoundError(f"Config da Continue CLI não encontrada: {cfg['continue_config']}")

    token_env = cfg.get("github_token_env")
    if token_env and not os.environ.get(token_env):
        print(f"ℹ️  Variável {token_env} não definida; usando a autenticação da CLI gh.")

    # compatibilidade: target_dir antigo vira allowed_paths
    if "allowed_paths" not in cfg and cfg.get("target_dir"):
        cfg["allowed_paths"] = [cfg["target_dir"]]
    cfg.setdefault("allowed_paths", [])
    cfg.setdefault("forbidden_paths", ["modules", ".git", ".continue"])
    cfg.setdefault("project_conventions", "")
    cfg.setdefault("failed_label", "tdd-failed")
    cfg.setdefault("max_retries", 3)
    cfg.setdefault("verify_stages", [1, 2, 3])
    cfg.setdefault("verify_max_rounds", 2)
    cfg.setdefault("audit_mode", "llm")
    cfg.setdefault("max_inject_chars", 40000)
    cfg.setdefault("gate_prompt_sent_chars", 12000)  # PROMPT_SENT embutido no portão
    # Phase-1 hardening (2026-09-29): baseline, scoped tests, CLI-free planning, guards.
    cfg.setdefault("check_command", "")            # full project gate for the pre-flight; "" = typecheck + tests
    cfg.setdefault("preflight", True)              # baseline on the untouched tree before the first issue of a batch
    cfg.setdefault("test_scope", True)             # stages 2 and 4 run the task's test files before the full suite
    cfg.setdefault("test_timeout_sec", 600)
    cfg.setdefault("stage1_mode", "direct")        # "direct": two API calls, no CLI; "cli": Continue CLI with tools
    cfg.setdefault("stage1_max_files", 8)          # files the selection call may add to the task's read_files
    cfg.setdefault("stage1_inject_chars", 60000)
    cfg.setdefault("forbidden_patterns", list(chk.DEFAULT_FORBIDDEN_PATTERNS))
    cfg.setdefault("forbidden_test_patterns", list(chk.DEFAULT_FORBIDDEN_TEST_PATTERNS))
    cfg.setdefault("max_diff_chars", 8000)
    cfg.setdefault("poll_interval_sec", 10)
    cfg.setdefault("cli_timeout_sec", 300)   # inatividade: conta da última atividade da CLI
    cfg.setdefault("cli_max_sec", 3600)      # teto absoluto por chamada
    cfg.setdefault("cli_retries", 1)
    cfg.setdefault("cli_retry_wait_sec", 15)
    cfg.setdefault("live_log", "logs/live.log")
    cfg.setdefault("live_log_max_mb", 20)
    cfg.setdefault("console_verbose", False)
    cfg.setdefault("auto_countdown_sec", 0)
    cfg.setdefault("project_name", os.path.basename(cfg["repo_root"]))
    cfg["live_log"] = os.path.abspath(os.path.join(MODULES_DIR, cfg["live_log"]))
    if cfg["audit_mode"] not in ("llm", "local"):
        raise ValueError("audit_mode deve ser 'llm' ou 'local'")
    if cfg["stage1_mode"] not in ("direct", "cli"):
        raise ValueError("stage1_mode must be 'direct' or 'cli'")
    return cfg


class StageError(Exception):
    """Falha definitiva de um estágio: a issue vai para a label de falha."""


# ----------------------------------------------------------------------
# Orquestrador
# ----------------------------------------------------------------------
class Orchestrator:
    def __init__(self, cfg: Dict[str, Any], reporter: Optional[Reporter] = None):
        self.cfg = cfg
        self.repo_root = cfg["repo_root"]
        self.prompts_dir = os.path.join(MODULES_DIR, "PROMPT")
        self.logs_dir = os.path.join(MODULES_DIR, "logs")
        os.makedirs(self.logs_dir, exist_ok=True)

        self.rep = reporter or Reporter(cfg["live_log"], verbose=bool(cfg["console_verbose"]),
                                        max_mb=float(cfg["live_log_max_mb"]))
        self.current_task = "-"

        def relay(kind: str, title: str, body: str) -> None:
            self.rep.event(kind, self.current_task, title, body)

        self.gh = GitHubHandler(repo=cfg.get("github_repo") or None, cwd=self.repo_root, on_event=relay)
        self.cli = ContinueCLIHandler(
            cli_path=cfg["continue_cli_path"],
            config_path=cfg["continue_config"],
            timeout_sec=cfg["cli_timeout_sec"],
            max_sec=cfg["cli_max_sec"],
            retries=cfg["cli_retries"],
            retry_wait_sec=cfg["cli_retry_wait_sec"],
            on_event=relay,
        )
        self.engine = DecisionEngine(auto_countdown_sec=cfg["auto_countdown_sec"])
        self.validator = ValidationHandler(
            test_cmd=cfg["test_command"],
            typecheck_cmd=cfg["typecheck_command"],
            cwd=self.repo_root,
            check_cmd=cfg["check_command"] or None,
            test_timeout=int(cfg["test_timeout_sec"]),
        )
        # estado por task
        self.llm_calls = 0
        self.events: List[str] = []
        self.files_touched: List[str] = []
        self._bodies: Dict[int, str] = {}  # issue number -> body with continuation comments merged

    # ------------------------------------------------------------------
    # Templates e artefatos
    # ------------------------------------------------------------------
    def _tpl(self, name: str) -> str:
        path = os.path.join(self.prompts_dir, name)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Template de prompt não encontrado: {path}")
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    @staticmethod
    def _fill(template: str, **values: str) -> str:
        out = template
        for key, val in values.items():
            out = out.replace("{{" + key + "}}", val)
        return out

    def _feedback(self, kind: str, attempt: int, max_: int, body: str, previous_output: str = "") -> str:
        return self._fill(self._tpl(f"FEEDBACK_{kind}.MD"), ATTEMPT=str(attempt), MAX=str(max_),
                          BODY=body, PREVIOUS_OUTPUT=previous_output)

    def _task_log_dir(self, task_id: str) -> str:
        d = os.path.join(self.logs_dir, task_id.lower())
        os.makedirs(d, exist_ok=True)
        return d

    def _save_artifact(self, task_id: str, name: str, content: str) -> str:
        path = os.path.join(self._task_log_dir(task_id), name)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    def _load_artifact(self, task_id: str, name: str) -> Optional[str]:
        path = os.path.join(self._task_log_dir(task_id), name)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        return None

    def _event(self, text: str, kind: str = "INFO") -> None:
        self.events.append(f"{time.strftime('%H:%M:%S')} {text}")
        self.rep.event(kind, self.current_task, text)

    def _ask_cli(self, prompt: str, tag: str, task_id: str, single_shot: bool = False) -> str:
        self._save_artifact(task_id, f"{tag}_prompt.md", prompt)
        self.llm_calls += 1
        self.rep.event("LLM_PROMPT", task_id, tag, prompt,
                       {"chars": len(prompt), "call": self.llm_calls, "single_shot": single_shot})
        with self.rep.waiting(task_id, tag):
            res = self.cli.execute_prompt(prompt, single_shot=single_shot)
        if not res["success"]:
            self.rep.event("LLM_ERROR", task_id, tag, res["error"], {"attempts": res.get("attempts", 1)})
            raise StageError(f"{tag}: a Continue CLI falhou: {res['error'][:500]}")
        self._save_artifact(task_id, f"{tag}_response.md", res["raw_response"])
        self.rep.event("LLM_RESPONSE", task_id, tag, res["raw_response"],
                       {"chars": len(res["raw_response"]), "elapsed": f"{res.get('elapsed', 0)}s",
                        "exit": res.get("exit_code", 0)})
        return res["raw_response"]

    # ------------------------------------------------------------------
    # Issue e plano
    # ------------------------------------------------------------------
    @staticmethod
    def _extract_task_id(issue: Dict[str, Any]) -> str:
        m = re.match(r"\s*\[([^\]]+)\]", issue["title"])
        return m.group(1).strip() if m else f"TASK-{issue['number']}"

    @staticmethod
    def _issue_section_paths(body: str, *heading_keys: str) -> List[str]:
        """Caminhos em crase dentro da seção '## ... <heading_key> ...' do corpo da issue.

        Lines inside code fences (``` or ~~~, any length) are skipped, so a '## ' that
        belongs to a spec example can never open or close a section.
        """
        lines = (body or "").split("\n")
        collecting, found, fence = False, [], ""
        for line in lines:
            stripped = line.lstrip()
            if not fence and stripped[:3] in ("```", "~~~"):
                fence = stripped[0] * (len(stripped) - len(stripped.lstrip(stripped[0])))
                continue
            if fence:
                if stripped.startswith(fence):  # closing fence: same char, at least as long
                    fence = ""
                continue
            if line.startswith("## "):
                collecting = any(k.lower() in line.lower() for k in heading_keys)
                continue
            if collecting:
                found += [file_ops.normalize_rel(p) for p in re.findall(r"`([^`\n]+)`", line)]
        return [p for p in found if "/" in p or "." in p]

    @staticmethod
    def _plan_sections(plan: str) -> Dict[int, str]:
        parts = re.split(r"^###\s*([1-6])\.[^\n]*\n", plan, flags=re.MULTILINE)
        sections: Dict[int, str] = {}
        for i in range(1, len(parts) - 1, 2):
            sections[int(parts[i])] = parts[i + 1].strip()
        return sections

    @classmethod
    def _plan_files(cls, plan: str) -> List[Dict[str, str]]:
        """Linhas da tabela da seção 2: [{'path', 'role', 'action', 'purpose'}]."""
        sec2 = cls._plan_sections(plan).get(2, "")
        files = []
        for line in sec2.split("\n"):
            if not line.strip().startswith("|"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) < 3:
                continue
            path = file_ops.normalize_rel(cells[0])
            role, action = cells[1].lower().strip("*` "), cells[2].lower().strip("*` ")
            if role not in ROLES or action not in ACTIONS:
                continue
            files.append({"path": path, "role": role, "action": action,
                          "purpose": cells[3] if len(cells) > 3 else ""})
        return files

    def _safe(self, rel: str) -> str:
        try:
            return file_ops.safe_path(rel, self.repo_root, self.cfg["allowed_paths"], self.cfg["forbidden_paths"])
        except ValueError as e:
            raise StageError(str(e))

    def _rel(self, abs_path: str) -> str:
        return os.path.relpath(abs_path, self.repo_root).replace("\\", "/")

    def _current_files_block(self, plan_files: List[Dict[str, str]], roles: Tuple[str, ...]) -> str:
        """Injeção determinística do conteúdo atual dos arquivos do plano que já existem."""
        parts, total = [], 0
        limit = int(self.cfg["max_inject_chars"])
        for pf in plan_files:
            if pf["role"] not in roles:
                continue
            try:
                abs_path = self._safe(pf["path"])
            except StageError:
                continue
            content = file_ops.read_text(abs_path)
            if content is None:
                continue
            block = f"### CURRENT CONTENT: {pf['path']}\n```{file_ops.fence_for(pf['path'])}\n{content.rstrip()}\n```\n"
            if total + len(block) > limit:
                parts.append(f"### CURRENT CONTENT: {pf['path']}\n(omitted: injection limit of {limit} chars reached)\n")
                self._event(f"injeção de {pf['path']} omitida (limite {limit} chars)", "WARN")
                continue
            parts.append(block)
            total += len(block)
        return "\n".join(parts) if parts else "(none)"

    # ------------------------------------------------------------------
    # Aplicação de blocos
    # ------------------------------------------------------------------
    def _apply_blocks(self, blocks: List[Dict[str, Any]], plan_files: List[Dict[str, str]],
                      stage: int) -> Dict[str, Any]:
        """
        Grava FILE / aplica PATCH conforme papel e ação do plano.
        Estágio 2 só aceita arquivos de papel test; Estágio 3 só papéis não-test.
        Devolve {'written', 'skipped', 'problems', 'warnings'}.
        """
        by_path = {pf["path"]: pf for pf in plan_files}
        written, skipped, problems, warnings = [], [], [], []
        want_test = stage == 2

        def reject(path: str, msg: str) -> None:
            problems.append(f"{path}: {msg}")
            self.rep.event("FILE_REJECT", self.current_task, path, msg)

        for b in blocks:
            path = file_ops.normalize_rel(b["path"])
            if b.get("error"):
                reject(path, b["error"])
                continue
            try:
                abs_path = self._safe(path)
            except StageError as e:
                reject(path, str(e))
                continue
            pf = by_path.get(path)
            if pf is None:
                if want_test:
                    reject(path, "not listed in section 2 of the plan (Stage 2 may only write files with Role = test listed there)")
                    continue
                warnings.append(f"{path}: not listed in section 2 of the plan (written anyway)")
                self.rep.event("WARN", self.current_task, f"{path} fora da seção 2 do plano (gravado mesmo assim)")
            elif (pf["role"] == "test") != want_test:
                reject(path, f"Role = {pf['role']} in the plan; this stage may only write "
                       + ("test files" if want_test else "non-test files"))
                continue

            current = file_ops.read_text(abs_path)
            if b["kind"] == "file":
                if current is not None and current == b["code"]:
                    skipped.append(path)
                    self.rep.event("FILE_SKIP", self.current_task, path, meta={"kind": "FILE", "reason": "identical"})
                    continue
                if current is not None and pf is not None and pf["action"] == "patch":
                    reject(path, "file exists and the plan says Action = patch; return a PATCH with exact edits instead of a full FILE")
                    continue
                new_content = b["code"]
            else:
                if current is None:
                    reject(path, "PATCH on a file that does not exist; use FILE to create it")
                    continue
                new_content, err = file_ops.apply_patch(current, b["edits"])
                if err:
                    reject(path, err)
                    continue
                if new_content == current:
                    skipped.append(path)
                    self.rep.event("FILE_SKIP", self.current_task, path, meta={"kind": "PATCH", "reason": "no-op"})
                    continue

            # Guard: the model may not silence the type checker, the linter or the test runner
            # (T01 shipped five spec files with `// @ts-nocheck` to get "Compile OK").
            patterns = list(self.cfg["forbidden_patterns"]) + (list(self.cfg["forbidden_test_patterns"]) if want_test else [])
            hits = chk.forbidden_hits(new_content, patterns)
            if hits:
                reject(path, "forbidden content (suppressing the type checker, linter or test runner is not allowed): "
                       + "; ".join(hits))
                continue

            if not self.engine.ask_or_auto("CREATE_FILE" if current is None else "EDIT_FILE", f"Gravar {path}"):
                raise StageError(f"Gravação de {path} recusada pelo usuário.")
            file_ops.write_text(abs_path, new_content)
            written.append(path)
            if path not in self.files_touched:
                self.files_touched.append(path)
            meta = {"op": "create" if current is None else "edit", "kind": b["kind"].upper()}
            if b["kind"] == "patch":
                meta["edits"] = len(b["edits"])
            self.rep.event("FILE_WRITE", self.current_task, path, new_content if b["kind"] == "file" else
                           "\n\n".join(f"<<<<<<< SEARCH\n{e['search']}\n=======\n{e['replace']}\n>>>>>>> REPLACE" for e in b["edits"]),
                           meta)

        return {"written": written, "skipped": skipped, "problems": problems, "warnings": warnings}

    @staticmethod
    def _diag_tail(res: Dict[str, Any], limit: int = 1500) -> str:
        """Trecho útil de um comando que falhou: prioriza as linhas de diagnóstico
        (error TS..., FAIL, AssertionError) sobre o epílogo do pnpm, que era a
        única coisa que sobrava com um simples tail e deixava o modelo às cegas."""
        return chk.diag_tail(res.get("stdout") or "", res.get("stderr") or "", limit)

    @staticmethod
    def _apply_report(res: Dict[str, Any]) -> str:
        lines = []
        if res["written"]:
            lines.append("Written: " + ", ".join(res["written"]))
        if res["skipped"]:
            lines.append("Identical to disk, ignored: " + ", ".join(res["skipped"]))
        if res["warnings"]:
            lines.append("Warnings:\n- " + "\n- ".join(res["warnings"]))
        if res["problems"]:
            lines.append("Problems:\n- " + "\n- ".join(res["problems"]))
        return "\n".join(lines) or "Nothing returned."

    def _local_report(self, scope_paths: Optional[List[str]] = None) -> Dict[str, Any]:
        """Compile, then the task's own test files (fast, attributable), then the full suite."""
        comp = self.validator.check_compilation()
        scoped = self.validator.run_tests(scope_paths) if (scope_paths and self.cfg["test_scope"]) else None
        if scoped is not None and not scoped["success"]:
            tests, scope_note = scoped, f"task tests only, {len(scope_paths or [])} file(s); full suite not run"
        else:
            tests = self.validator.run_tests()
            scope_note = ("task tests OK; " if scoped is not None else "") + "full suite"
        ok = comp["success"] and tests["success"]
        tail = (chk.diag_tail(tests["stdout"], tests["stderr"], 3000) if not tests["success"]
                else chk.strip_ansi(tests["stdout"] or tests["stderr"])[-1500:])
        text = (
            f"Compile: {'OK' if comp['success'] else 'FAILED'} (exit {comp['exit_code']})\n"
            f"Tests ({scope_note}): {'OK' if tests['success'] else 'FAILED'} (exit {tests['exit_code']})\n\n"
            "```text\n" + tail + "\n```"
        )
        self.rep.event("LOCAL_VALIDATION", self.current_task, f"compile + tests ({scope_note})", tail,
                       {"compile": comp["exit_code"], "tests": tests["exit_code"], "ok": ok})
        return {"ok": ok, "text": text, "compilation": comp, "tests": tests}

    # ------------------------------------------------------------------
    # Portão por fase
    # ------------------------------------------------------------------
    def _gate(self, stage_no: int, round_no: int, prompt_sent: str, output: str,
              checks_report: str, task_id: str) -> Tuple[str, str]:
        # O prompt original embute plano/testes/arquivos que o OUTPUT repete em
        # grande parte; mandar tudo de novo dobrava o custo do portão (104k chars
        # para um veredito de 16). O cabeçalho (requisitos e formato) basta.
        limit = int(self.cfg["gate_prompt_sent_chars"])
        if len(prompt_sent) > limit:
            prompt_sent = (prompt_sent[:limit]
                           + "\n... (truncated by the orchestrator: the worker received the "
                           + "full prompt; judge the requirements above against the OUTPUT)")
        prompt = self._fill(self._tpl("VERIFY.MD"), STAGE_NAME=STAGE_NAME[stage_no], ROUND=str(round_no),
                            PROMPT_SENT=prompt_sent, OUTPUT=output, CHECKS_REPORT=checks_report)
        raw = self._ask_cli(prompt, f"stage{stage_no}_r{round_no}_gate", task_id, single_shot=True)
        verdict = self.cli.extract_verdict(raw, kind="gate")
        reasons = "\n".join(l for l in raw.strip().split("\n") if l.strip().startswith("-"))[:2000]
        if verdict is None:
            return "REWORK", "The reviewer did not return a VERDICT line; treat the output as not verified.\n" + raw[-800:]
        return verdict, reasons

    def _run_stage(self, stage_no: int, issue_number: int, task_id: str, base_prompt: str,
                   base_feedback: str, check_fn: Callable[[str], Dict[str, Any]]) -> Tuple[str, Dict[str, Any], bool]:
        """
        Executa uma fase com verificação determinística (check_fn) e portão LLM
        opcional. Devolve (saída, checks, convergiu).
        check_fn(output) -> {'ok': bool, 'report': str, 'feedback': str}
        """
        max_rework = int(self.cfg["verify_max_rounds"])
        use_gate = stage_no in [int(s) for s in self.cfg["verify_stages"]]
        # Só o Estágio 1 em modo "cli" lê o workspace com ferramentas; em modo "direct"
        # os arquivos vêm injetados e todas as fases rodam com uma requisição só.
        single_shot = stage_no != 1 or self.cfg["stage1_mode"] == "direct"
        prompt = self._fill(base_prompt, FEEDBACK=base_feedback)
        prev_hash, output, checks = None, "", {"ok": False, "report": "", "feedback": ""}

        for round_no in range(1, max_rework + 2):
            output = self._ask_cli(prompt, f"stage{stage_no}_r{round_no}", task_id, single_shot=single_shot)
            checks = check_fn(output)
            self.rep.event("CHECKS", task_id, f"fase {stage_no} rodada {round_no}", checks["report"], {"ok": checks["ok"]})
            verdict, reasons = "CORRECT", ""
            if checks["ok"] and use_gate:
                verdict, reasons = self._gate(stage_no, round_no, prompt, output, checks["report"], task_id)
            elif not checks["ok"]:
                verdict, reasons = "REWORK", checks["feedback"]

            label = "CORRECT" if verdict == "CORRECT" else "REWORK"
            source = "" if label == "CORRECT" else (" (checks)" if not checks["ok"] else " (LLM)")
            self.events.append(f"{time.strftime('%H:%M:%S')} gate fase {stage_no} rodada {round_no}: {label}{source}")
            self.rep.event("GATE", task_id, f"fase {stage_no} rodada {round_no}: {label}{source}", reasons)
            self.gh.add_comment(issue_number, f"🔎 **[Gate fase {stage_no}, rodada {round_no}]** {label}"
                                + (f"\n\n{reasons[:3000]}" if reasons else ""))
            if verdict == "CORRECT":
                return output, checks, True

            h = hashlib.sha1(output.encode("utf-8")).hexdigest()
            if h == prev_hash:
                self._event(f"fase {stage_no}: saída idêntica à anterior; encerrando o loop de rework", "WARN")
                break
            prev_hash = h
            if round_no > max_rework:
                break
            rework = self._feedback("REWORK", round_no, max_rework, reasons or checks["feedback"], previous_output=output)
            prompt = self._fill(base_prompt, FEEDBACK=base_feedback + rework)

        self._event(f"fase {stage_no}: gate não convergiu (checks {'OK' if checks['ok'] else 'FALHARAM'})", "WARN")
        return output, checks, False

    # ------------------------------------------------------------------
    # Estágio 1: plano
    # ------------------------------------------------------------------
    def _issue_body(self, issue: Dict[str, Any]) -> str:
        """Issue body with the seeder's continuation comments merged back (cached per issue)."""
        number = issue["number"]
        if number not in self._bodies:
            list_body = issue.get("body") or ""
            body = self.gh.get_issue_full_body(number) or list_body
            if len(body) > len(list_body):
                self._event(f"Stage 1: merged {len(body) - len(list_body)} chars from continuation comments into the specification")
            self._bodies[number] = body
        return self._bodies[number]

    def _stage1_workspace_files(self, task_id: str, spec: str, read_files: List[str]) -> str:
        """
        CLI-free Stage 1, first half: one direct call (PROMPT_01A.MD) picks the existing
        files the planner needs from the tracked-file listing; the orchestrator injects
        their content, bounded by stage1_inject_chars. Reads may go anywhere outside
        forbidden_paths; writes stay fenced by allowed_paths as before.
        """
        n = int(self.cfg["stage1_max_files"])
        prompt = self._fill(
            self._tpl("PROMPT_01A.MD"), TASK_ID=task_id, MAX_FILES=str(n),
            READ_FILES=", ".join(read_files) if read_files else "(none)",
            TREE=chk.repo_tree(self.repo_root, self.cfg["allowed_paths"]), SPEC=spec,
        )
        raw = self._ask_cli(prompt, "stage1_files", task_id, single_shot=True)
        wanted = [p for p in chk.parse_file_list(raw, limit=n) if p not in read_files]

        def readable(rel: str) -> Optional[str]:
            try:
                abs_path = file_ops.safe_path(rel, self.repo_root, [], self.cfg["forbidden_paths"])
            except ValueError:
                return None
            return abs_path if os.path.isfile(abs_path) else None

        candidates, skipped = [], []
        for rel in list(read_files) + wanted:
            (candidates if readable(rel) else skipped).append(rel)
        block, included, omitted = chk.inject_files(
            candidates, lambda rel: file_ops.read_text(readable(rel) or ""), file_ops.fence_for,
            int(self.cfg["stage1_inject_chars"]))
        notes = [f"{s} (outside the repository fence or not a file)" for s in skipped] + omitted
        self._event(f"Stage 1: injected {len(included)} workspace file(s), {len(block)} chars"
                    + (f"; skipped: {'; '.join(notes)}" if notes else ""))
        return block

    def stage1_plan(self, issue: Dict[str, Any], task_id: str) -> str:
        cached = self._load_artifact(task_id, "stage1_plan.md")
        if cached:
            self._event("Estágio 1: plano já existe em logs/; reutilizando")
            return cached

        print(f"\n📄 [{STAGE_NAME[1]}] PROMPT_01.MD ({self.cfg['stage1_mode']} mode)")
        self.gh.set_stage(issue["number"], STAGE_LABEL[1])
        body = self._issue_body(issue)
        target_files = self._issue_section_paths(body, "Arquivos Alvo", "Target Files")
        read_files = self._issue_section_paths(body, "Arquivos para ler", "Files to read")
        spec = f"# {issue['title']}\n\n{body}"
        allowed = ", ".join(self.cfg["allowed_paths"]) or "(the whole repository)"
        forbidden = ", ".join(self.cfg["forbidden_paths"]) or "(none)"
        if self.cfg["stage1_mode"] == "direct":
            workspace_rule = ("You have NO tools and cannot read the workspace. The orchestrator injected below the "
                              "existing files it selected for you (WORKSPACE FILES). Plan only from them and from the "
                              "specification; if a file you would need is missing, say so in section 5 and take the "
                              "simplest safe assumption.")
            workspace_files = self._stage1_workspace_files(task_id, spec, read_files)
        else:
            workspace_rule = ("You MAY read files in the workspace (read-only tools) to learn what already exists: "
                              "modules produced by earlier tasks, project layout, conventions. Start with FILES TO READ "
                              "FIRST when given. Do not write or edit anything.")
            workspace_files = "(not injected in cli mode: read the workspace with your tools)"
        base_prompt = self._fill(
            self._tpl("PROMPT_01.MD"),
            TASK_ID=task_id, PROJECT_NAME=self.cfg["project_name"],
            TEST_COMMAND=self.cfg["test_command"], TYPECHECK_COMMAND=self.cfg["typecheck_command"],
            PROJECT_CONVENTIONS=self.cfg["project_conventions"] or "(none)",
            READ_FILES=", ".join(read_files) if read_files else "(none specified)",
            WORKSPACE_RULE=workspace_rule, WORKSPACE_FILES=workspace_files,
            ALLOWED_PATHS=allowed, FORBIDDEN_PATHS=forbidden,
            SPEC=spec,
        )

        def check1(plan: str) -> Dict[str, Any]:
            problems = []
            sections = self._plan_sections(plan)
            missing = [str(n) for n in range(1, 7) if n not in sections]
            if missing:
                problems.append(f"missing sections: {', '.join(missing)} (headings must be '### N. Title')")
            files = self._plan_files(plan)
            if not files:
                problems.append("section 2 has no valid table rows (columns: Path | Role | Action | Purpose; Role in test/src/config/doc; Action in create/patch/rewrite)")
            for pf in files:
                try:
                    self._safe(pf["path"])
                except StageError as e:
                    problems.append(f"section 2 path rejected: {e}")
            plan_paths = {pf["path"] for pf in files}
            for tf in target_files:
                if tf not in plan_paths:
                    problems.append(f"target file from the task is not in section 2: {tf}")
            if files and not any(pf["role"] == "test" for pf in files):
                problems.append("section 2 has no file with Role = test")
            report = (f"Sections found: {sorted(sections)}\nFiles in section 2: "
                      + (", ".join(f"{pf['path']} ({pf['role']}/{pf['action']})" for pf in files) or "none")
                      + (f"\nTask target files: {', '.join(target_files)}" if target_files else "")
                      + ("\nProblems:\n- " + "\n- ".join(problems) if problems else "\nNo problems."))
            return {"ok": not problems, "report": report, "feedback": "\n".join(f"- {p}" for p in problems)}

        plan, checks, converged = self._run_stage(1, issue["number"], task_id, base_prompt, "", check1)
        if not checks["ok"]:
            raise StageError("Estágio 1: o plano não passou nas verificações:\n" + checks["feedback"])
        if not converged:
            self.gh.add_comment(issue["number"], "⚠️ Gate LLM da fase 1 não convergiu; seguindo porque as verificações determinísticas passaram.")

        self._save_artifact(task_id, "stage1_plan.md", plan)
        self.gh.add_comment(
            issue["number"],
            f"📄 **[Estágio 1 - Plano]** Plano mestre gerado para `{task_id}`.\n\n"
            f"<details><summary>Ver plano</summary>\n\n{plan[:50000]}\n\n</details>",
        )
        return plan

    # ------------------------------------------------------------------
    # Estágio 2: TDD vermelho
    # ------------------------------------------------------------------
    def _tests_from_disk(self, plan_files: List[Dict[str, str]]) -> str:
        parts = []
        for pf in plan_files:
            if pf["role"] != "test":
                continue
            content = file_ops.read_text(self._safe(pf["path"]))
            if content is not None:
                parts.append(f"### FILE: {pf['path']}\n```{file_ops.fence_for(pf['path'])}\n{content.rstrip()}\n```")
        return "\n\n".join(parts)

    def stage2_red(self, issue: Dict[str, Any], task_id: str, plan: str) -> str:
        plan_files = self._plan_files(plan)
        cached = self._load_artifact(task_id, "stage2_tests.md")
        if cached and STAGE_LABEL[2] in self.gh.get_issue_labels(issue["number"]):
            self._event("Estágio 2: testes já gravados (label tdd-red); reutilizando")
            return cached

        print(f"\n🔴 [{STAGE_NAME[2]}] PROMPT_02.MD")
        test_rel = [pf["path"] for pf in plan_files if pf["role"] == "test"]
        rule_ids = chk.rule_ids_from_issue(self._issue_body(issue))
        test_paths = [self._safe(pf["path"]) for pf in plan_files if pf["role"] == "test"]
        snap = file_ops.snapshot(test_paths)
        base_prompt = self._fill(
            self._tpl("PROMPT_02.MD"),
            TASK_ID=task_id, TEST_COMMAND=self.cfg["test_command"], PLAN_OUTPUT=plan,
            CURRENT_FILES=self._current_files_block(plan_files, ("test",)),
        )

        def check2(output: str) -> Dict[str, Any]:
            file_ops.restore(snap)
            res = self._apply_blocks(self.cli.parse_blocks(output), plan_files, stage=2)
            report = self._apply_report(res)
            if res["problems"] or not (res["written"] or res["skipped"]):
                if not (res["written"] or res["skipped"]):
                    res["problems"].append("no test file was returned in the required format")
                return {"ok": False, "report": report, "feedback": "\n".join(f"- {p}" for p in res["problems"])}
            comp = self.validator.check_compilation()
            if not comp["success"]:
                err = self._diag_tail(comp)
                return {"ok": False, "report": report + f"\nCompile FAILED:\n{err}",
                        "feedback": f"- the test files do not compile:\n```text\n{err}\n```"}
            red = self.validator.run_tests(test_rel if self.cfg["test_scope"] else None)
            tail = chk.diag_tail(red["stdout"], red["stderr"], 1500)
            if red["success"]:
                return {"ok": False, "report": report + "\nTests PASSED before implementation (must fail in RED).",
                        "feedback": "- the tests pass before any production code exists; RED tests must fail (they must exercise the code described in section 3 of the plan)"}
            # Honest RED: the failure must come from the task's own test files, not from elsewhere.
            failed = chk.failed_test_files((red["stdout"] or "") + "\n" + (red["stderr"] or ""), test_rel)
            if failed is not None and not failed:
                return {"ok": False,
                        "report": report + f"\nRED run failed, but none of the task's test files is reported as failing:\n```text\n{tail}\n```",
                        "feedback": "- the test run failed for a reason outside the task's test files (wrong paths, a syntax "
                                    "error elsewhere, or the runner did not pick the files up); the task's own tests must be "
                                    "the ones failing: " + ", ".join(test_rel)}
            # Every business rule id of the issue must be cited in the test files.
            texts = [file_ops.read_text(self._safe(p)) or "" for p in test_rel]
            covered, missing = chk.rule_coverage(rule_ids, texts)
            if missing:
                return {"ok": False,
                        "report": report + f"\nRule coverage: {len(covered)}/{len(rule_ids)}; missing: {', '.join(missing)}",
                        "feedback": "- every business rule id must appear verbatim in a test name or a comment of the task's "
                                    "test files; missing: " + ", ".join(missing)}
            coverage = f"Rule coverage: {len(covered)}/{len(rule_ids)}." if rule_ids else "Rule coverage: no rule ids in the issue."
            failing = ", ".join(failed) if failed else "(runner does not print file names)"
            return {"ok": True,
                    "report": report + f"\nCompile OK. RED run failed as expected (exit {red['exit_code']}); failing files: {failing}. {coverage}\n```text\n{tail}\n```",
                    "feedback": ""}

        output, checks, converged = self._run_stage(2, issue["number"], task_id, base_prompt, "", check2)
        if not checks["ok"]:
            raise StageError("Estágio 2: os testes não passaram nas verificações:\n" + checks["feedback"])
        if not converged:
            self.gh.add_comment(issue["number"], "⚠️ Gate LLM da fase 2 não convergiu; seguindo porque as verificações determinísticas passaram.")

        tests_md = self._tests_from_disk(plan_files)
        self._save_artifact(task_id, "stage2_tests.md", tests_md)
        self.gh.set_stage(issue["number"], STAGE_LABEL[2])
        self.gh.add_comment(issue["number"], "🔴 **[Estágio 2 - TDD RED]** " + checks["report"][:6000])
        return tests_md

    # ------------------------------------------------------------------
    # Estágios 3 e 4: TDD verde + validação local + auditoria (loop)
    # ------------------------------------------------------------------
    def _task_diff(self) -> str:
        if not self.files_touched:
            return "(no files)"
        run_terminal_command(["git", "add", "-N", "--", *self.files_touched], cwd=self.repo_root)
        diff = run_terminal_command(["git", "diff", "--", *self.files_touched], cwd=self.repo_root)["stdout"]
        limit = int(self.cfg["max_diff_chars"])
        return diff[:limit] + ("\n... (truncated)" if len(diff) > limit else "") if diff else "(empty diff)"

    def stage3_green_and_audit(self, issue: Dict[str, Any], task_id: str, plan: str, tests_md: str) -> Dict[str, Any]:
        number = issue["number"]
        plan_files = self._plan_files(plan)
        self.gh.set_stage(number, STAGE_LABEL[3])
        prod_paths = [self._safe(pf["path"]) for pf in plan_files if pf["role"] != "test"]
        snap = file_ops.snapshot(prod_paths)
        base_prompt = self._fill(
            self._tpl("PROMPT_03.MD"),
            TASK_ID=task_id, TEST_COMMAND=self.cfg["test_command"], TYPECHECK_COMMAND=self.cfg["typecheck_command"],
            PLAN_OUTPUT=plan, TESTS_OUTPUT=tests_md,
            CURRENT_FILES=self._current_files_block(plan_files, tuple(r for r in ROLES if r != "test")),
        )
        max_retries = int(self.cfg["max_retries"])
        outer_feedback = ""
        test_rel = [pf["path"] for pf in plan_files if pf["role"] == "test"]
        rule_ids = chk.rule_ids_from_issue(self._issue_body(issue))
        covered, missing = chk.rule_coverage(rule_ids, [file_ops.read_text(self._safe(p)) or "" for p in test_rel])
        rule_coverage = ((f"{len(covered)}/{len(rule_ids)} rule ids found in the test files"
                          + (f"; MISSING: {', '.join(missing)}" if missing else ""))
                         if rule_ids else "(the issue declares no rule ids)")

        def check3(output: str) -> Dict[str, Any]:
            file_ops.restore(snap)
            res = self._apply_blocks(self.cli.parse_blocks(output), plan_files, stage=3)
            report = self._apply_report(res)
            if res["problems"] or not (res["written"] or res["skipped"]):
                if not (res["written"] or res["skipped"]):
                    res["problems"].append("no production file was returned in the required format")
                return {"ok": False, "report": report, "feedback": "\n".join(f"- {p}" for p in res["problems"])}
            comp = self.validator.check_compilation()
            if not comp["success"]:
                err = self._diag_tail(comp)
                return {"ok": False, "report": report + f"\nCompile FAILED:\n{err}",
                        "feedback": f"- the code does not compile:\n```text\n{err}\n```"}
            return {"ok": True, "report": report + "\nCompile OK.", "feedback": ""}

        for attempt in range(1, max_retries + 1):
            print(f"\n🟢 [{STAGE_NAME[3]}] tentativa {attempt}/{max_retries}")
            self.gh.set_stage(number, STAGE_LABEL[3])
            output, checks, converged = self._run_stage(3, number, task_id, base_prompt, outer_feedback, check3)
            if not checks["ok"]:
                outer_feedback = self._feedback("FORMAT", attempt, max_retries, checks["feedback"])
                self.gh.add_comment(number, f"⚠️ **[Retroalimentação {attempt}/{max_retries}]** Saída não aplicável; repetindo.\n\n{checks['feedback'][:3000]}")
                continue
            if not converged:
                self.gh.add_comment(number, "⚠️ Gate LLM da fase 3 não convergiu; seguindo porque compilação e formato passaram.")

            print("🔍 [Estágio 4 - Validação local] testes")
            local = self._local_report(test_rel)
            self._save_artifact(task_id, f"stage4_local_try{attempt}.md", local["text"])
            if not local["ok"]:
                errors = self.validator.analyze_errors(local["tests"], local["compilation"])
                outer_feedback = self._feedback("LOCAL", attempt, max_retries, errors)
                self._event(f"validação local falhou (tentativa {attempt})", "WARN")
                self.gh.add_comment(number, f"⚠️ **[Retroalimentação {attempt}/{max_retries}]** Validação local falhou; reinjetando erros no Estágio 3.\n\n{errors[:6000]}")
                continue

            if self.cfg["audit_mode"] == "local":
                self._event(f"auditoria (tentativa {attempt}): OK (modo local, sem LLM)", "AUDIT")
                return {"success": True, "attempts": attempt, "local": local["text"],
                        "audit": "Auditoria em modo local (audit_mode = local): compilação e testes passaram; sem chamada à LLM."}

            print(f"🔍 [{STAGE_NAME[4]}] PROMPT_04.MD")
            self.gh.set_stage(number, STAGE_LABEL[4])
            audit_prompt = self._fill(
                self._tpl("PROMPT_04.MD"), TASK_ID=task_id, PLAN_OUTPUT=plan, TASK_DIFF=self._task_diff(),
                FILES_WRITTEN="\n".join(f"- {w}" for w in self.files_touched) or "(none)", LOCAL_REPORT=local["text"],
                RULE_COVERAGE=rule_coverage,
            )
            audit = self._ask_cli(audit_prompt, f"stage4_audit_try{attempt}", task_id, single_shot=True)
            verdict = self.cli.extract_verdict(audit, kind="audit")
            self.events.append(f"{time.strftime('%H:%M:%S')} auditoria (tentativa {attempt}): {verdict or 'sem VERDICT'}")
            self.rep.event("AUDIT", task_id, f"tentativa {attempt}: {verdict or 'sem VERDICT'}", audit)
            if verdict == "OK":
                return {"success": True, "attempts": attempt, "audit": audit, "local": local["text"]}

            reason = "sem linha VERDICT" if verdict is None else "VERDICT: NOT OK"
            outer_feedback = self._feedback("AUDIT", attempt, max_retries, audit[-4000:])
            self.gh.add_comment(number, f"⚠️ **[Retroalimentação {attempt}/{max_retries}]** Auditoria reprovou ({reason}); reinjetando no Estágio 3.\n\n<details><summary>Relatório</summary>\n\n{audit[:20000]}\n\n</details>")

        return {"success": False, "attempts": max_retries, "audit": "", "local": ""}

    # ------------------------------------------------------------------
    # Encerramento: log, commit, close
    # ------------------------------------------------------------------
    def _write_log(self, task_id: str, number: int, status: str, result: Dict[str, Any]) -> str:
        log_path = os.path.join(self.logs_dir, f"{task_id.lower()}.log.md")
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(
                f"# Log de Auditoria - {task_id}\n\n"
                f"- **Status**: {status}\n"
                f"- **Completion Date**: {date.today().isoformat()}\n"
                f"- **Issue**: #{number}\n"
                f"- **Tentativas GREEN**: {result.get('attempts', 0)}\n"
                f"- **LLM calls**: {self.llm_calls}\n"
                f"- **Audit mode**: {self.cfg['audit_mode']}\n"
                f"- **Test Status**: {'PASSED' if status == 'COMPLETED' else 'FAILED'}\n"
                f"- **Files Created/Modified**:\n" + "".join(f"  - {w}\n" for w in self.files_touched) +
                "\n## Eventos\n\n" + "".join(f"- {e}\n" for e in self.events) +
                f"\n## Validação local\n\n{result.get('local', '')}\n\n## Auditoria\n\n{result.get('audit', '')}\n"
            )
        return self._rel(log_path)

    def finalize(self, issue: Dict[str, Any], task_id: str, result: Dict[str, Any]) -> None:
        number = issue["number"]
        rel_log = self._write_log(task_id, number, "COMPLETED", result)
        commit_msg = f"feat({task_id}): conclui tarefa via Orquestrador TDD (#{number})"
        add = run_terminal_command(["git", "add", "--", *self.files_touched, rel_log], cwd=self.repo_root)
        commit = run_terminal_command(["git", "commit", "-m", commit_msg], cwd=self.repo_root)
        if not commit["success"]:
            print(f"   ⚠️ commit não realizado: {(commit['stderr'] or commit['stdout'])[:300]}")
        sha = run_terminal_command(["git", "rev-parse", "--short", "HEAD"], cwd=self.repo_root)["stdout"]
        self.rep.event("GIT", task_id, f"commit {sha}" if commit["success"] else "commit FALHOU",
                       (add["stderr"] + "\n" + (commit["stdout"] or commit["stderr"])).strip(),
                       {"files": len(self.files_touched) + 1})

        commit_info = f"`{sha}` {commit_msg}" if commit["success"] else "commit falhou; ver console do orquestrador"
        audit_note = " (auditoria local, sem LLM)" if self.cfg["audit_mode"] == "local" else ""
        summary = (
            f"✅ **[CONCLUÍDO]** `{task_id}` resolvida e auditada{audit_note} em {result['attempts']} tentativa(s), "
            f"{self.llm_calls} chamadas à LLM.\n\n"
            f"- Commit: {commit_info}\n"
            f"- Arquivos: " + ", ".join(f"`{w}`" for w in self.files_touched) + "\n"
            f"- Log: `{rel_log}`\n\n"
            f"<details><summary>Auditoria final</summary>\n\n{result['audit'][:20000]}\n\n</details>"
        )
        self.gh.set_stage(number, None)
        self.gh.update_issue_labels(number, remove_labels=[self.cfg["trigger_label"]])
        self.gh.close_issue(number, summary)
        print(f" 🚀 Issue #{number} encerrada ({self.llm_calls} chamadas à LLM).")

    # ------------------------------------------------------------------
    # Pipeline por issue
    # ------------------------------------------------------------------
    def process_issue(self, issue: Dict[str, Any]) -> bool:
        number = issue["number"]
        task_id = self._extract_task_id(issue)
        self.llm_calls, self.events, self.files_touched = 0, [], []
        self.current_task = task_id
        started = time.time()
        print("\n" + "=" * 70 + f"\n📌 ISSUE #{number} ({task_id}) {issue['title']}\n" + "=" * 70)
        self.rep.event("TASK_START", task_id, f"#{number} {issue['title']}", issue.get("body") or "",
                       {"labels": ",".join(issue.get("label_names") or []) or "-"})

        ok = False
        try:
            labels = issue.get("label_names") or self.gh.get_issue_labels(number)
            stage_labels = [l for l in labels if l in STAGE_LABEL.values()]
            if stage_labels:
                self.gh.add_comment(number, f"🤖 **[Orquestrador TDD]** Retomando `{task_id}` a partir de `{', '.join(stage_labels)}`.")
            else:
                self.gh.add_comment(number, f"🤖 **[Orquestrador TDD]** Iniciando processamento autônomo de `{task_id}`.")

            plan = self.stage1_plan(issue, task_id)
            tests_md = self.stage2_red(issue, task_id, plan)
            result = self.stage3_green_and_audit(issue, task_id, plan, tests_md)
            if not result["success"]:
                raise StageError(f"Não foi possível chegar a GREEN + auditoria OK em {result['attempts']} tentativas.")
            self.finalize(issue, task_id, result)
            ok = True

        except StageError as e:
            print(f"\n🛑 {e}")
            self.rep.event("WARN", task_id, "falha de estágio", str(e))
            self._write_log(task_id, number, "FAILED", {})
            self.gh.mark_failed(number, f"{e}\n\nChamadas à LLM: {self.llm_calls}", self.cfg["failed_label"])
        except Exception as e:  # noqa: BLE001 - o polling não pode morrer
            tb = traceback.format_exc()
            print(f"\n💥 Erro inesperado na issue #{number}: {e}\n{tb}")
            self.rep.event("WARN", task_id, f"erro inesperado: {e}", tb[-4000:])
            self._write_log(task_id, number, "FAILED", {})
            self.gh.mark_failed(number, f"Erro inesperado no orquestrador: `{e}`\n\n```text\n{tb[-3000:]}\n```", self.cfg["failed_label"])
        finally:
            self.rep.event("TASK_END", task_id, f"#{number} {'CONCLUÍDA' if ok else 'FALHOU'}", "",
                           {"llm_calls": self.llm_calls, "files": len(self.files_touched),
                            "elapsed": f"{int(time.time() - started)}s"})
            self.current_task = "-"
        return ok

    # ------------------------------------------------------------------
    # Loop principal e modos
    # ------------------------------------------------------------------
    def _index(self) -> Dict[str, Dict[str, Any]]:
        return dependency.build_index(self.gh.get_all_issues())

    def queue(self) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """(executáveis em ordem topológica, bloqueadas/sem dependência)."""
        q = self.gh.get_open_issues(self.cfg["trigger_label"], self.cfg["failed_label"])
        return dependency.resolve(q, self._index(), self.cfg["failed_label"])

    def _preflight(self) -> bool:
        """
        Baseline on the untouched tree, once per batch: the project's own gate must be
        green before any issue is touched, so a later failure is attributable to the task
        (on 2026-09-28 CRLF-broken specs outside the task cost six GREEN rounds).
        """
        if not self.cfg["preflight"]:
            return True
        steps = ([("check", self.validator.run_check)] if self.cfg["check_command"]
                 else [("typecheck", self.validator.check_compilation), ("tests", self.validator.run_tests)])
        print("\n🧪 [PRE-FLIGHT] baseline on the untouched tree: " + ", ".join(n for n, _ in steps))
        for name, fn in steps:
            res = fn()
            tail = chk.diag_tail(res["stdout"], res["stderr"], 3000)
            self.rep.event("PREFLIGHT", "-", f"{name}: {'OK' if res['success'] else 'FAILED'} (exit {res['exit_code']})",
                           "" if res["success"] else tail)
            if res["success"]:
                continue
            crlf = chk.crlf_offenders(self.repo_root)
            hint = (f"\n   {len(crlf)} tracked file(s) are CRLF in the working copy but pinned to LF by .gitattributes "
                    f"(e.g. {crlf[0]}). On a clean tree run: git rm --cached -r -q . && git reset --hard") if crlf else ""
            print(f"⛔ pre-flight '{name}' failed on the untouched tree; no issue was touched.{hint}\n{tail}")
            return False
        print(" ✅ baseline green")
        return True

    def run_batch(self, issues: List[Dict[str, Any]]) -> Dict[str, Any]:
        started = time.time()
        done, failed, skipped, calls = [], [], [], 0
        if not self._preflight():
            skipped = [f"#{i['number']} (pre-flight failed: the baseline is red)" for i in issues]
            summary = {"done": done, "failed": failed, "skipped": skipped, "llm_calls": 0,
                       "elapsed": int(time.time() - started)}
            print(f"\n📊 Batelada não iniciada: {len(skipped)} pulada(s) pelo pre-flight.")
            return summary
        for issue in issues:
            ok_dep, reason = dependency.ready_now(issue, self._index(), self.cfg["failed_label"])
            if not ok_dep:
                task = dependency.task_id_of(issue)
                self.rep.event("WARN", task, f"#{issue['number']} pulada: {reason}")
                print(f"\n⏭️  #{issue['number']} ({task}) pulada: {reason}")
                skipped.append(f"#{issue['number']} ({reason})")
                continue
            ok = self.process_issue(issue)
            (done if ok else failed).append(issue["number"])
            calls += self.llm_calls
        summary = {"done": done, "failed": failed, "skipped": skipped, "llm_calls": calls,
                   "elapsed": int(time.time() - started)}
        print(f"\n📊 Batelada: {len(done)} concluída(s) {done}, {len(failed)} falha(s) {failed}, "
              f"{len(skipped)} pulada(s) {skipped}, {calls} chamadas à LLM, {summary['elapsed']}s")
        return summary

    def _setup(self) -> None:
        print("\n🛠️ [SETUP] Labels do pipeline no GitHub...")
        res = self.gh.setup_repository()
        print(" ✅ labels prontas" if res["success"] else f" ⚠️ labels: {res['errors']}")
        print(f"📂 repo: {self.repo_root}\n📁 permitidos: {self.cfg['allowed_paths'] or ['(todo o repo)']}"
              f"\n🏷️ fila: label {self.cfg['trigger_label']}\n🔎 gate LLM nas fases: {self.cfg['verify_stages']}"
              f"   auditoria: {self.cfg['audit_mode']}\n📡 trilha viva: {self.cfg['live_log']}  "
              f"(python modules/monitor.py em outro terminal)")

    def run_pipeline(self, mode: str = "interactive", count: int = 1, select: str = "",
                     issue_number: Optional[int] = None) -> None:
        self._setup()

        if mode == "issue":
            issues = [i for i in self.gh.get_open_issues() if i["number"] == issue_number]
            if not issues:
                print(f"❌ Issue #{issue_number} não está aberta.")
                return
            ok_dep, reason = dependency.ready_now(issues[0], self._index(), self.cfg["failed_label"])
            if not ok_dep:
                print(f"⚠️ Issue #{issue_number} está bloqueada ({reason}); executando mesmo assim por pedido explícito.")
            if not self._preflight():
                return
            self.process_issue(issues[0])
            return

        if mode in ("batch", "all", "select"):
            runnable, blocked = self.queue()
            if not runnable and not blocked:
                print("📭 Fila vazia.")
                return
            if not runnable:
                print("⛔ Nenhuma issue executável:\n" + selector.render(runnable, blocked))
                return
            if mode == "select":
                choice = selector.parse_choice(select, runnable, blocked)
                if isinstance(choice, str):
                    print(f"❌ seleção inválida: {choice}")
                    return
                chosen = [runnable[i - 1] for i in choice]
            else:
                chosen = runnable if mode == "all" else runnable[:max(1, count)]
            print("\n" + selector.render(chosen, blocked))
            self.run_batch(chosen)
            return

        if mode == "poll":
            print("\n🤖 ORQUESTRADOR TDD EM POLLING (Ctrl+C para parar)")
            idle_cycles = 0
            try:
                while True:
                    runnable, blocked = self.queue()
                    if runnable:
                        idle_cycles = 0
                        self.process_issue(runnable[0])
                    else:
                        if blocked and idle_cycles % 30 == 0:
                            print("\n⛔ só issues bloqueadas na fila:\n" + selector.render([], blocked))
                        idle_cycles += 1
                        print(".", end="", flush=True)
                    time.sleep(int(self.cfg["poll_interval_sec"]))
            except KeyboardInterrupt:
                print("\n🛑 Orquestrador parado pelo usuário.")
            return

        # interativo
        try:
            while True:
                runnable, blocked = self.queue()
                if not runnable and not blocked:
                    print("📭 Fila vazia. [r] recarregar   [q] sair")
                    if input("\nEscolha: ").strip().lower() in ("q", "quit", "sair"):
                        return
                    continue
                chosen = selector.select_issues(runnable, blocked)
                if chosen is None:
                    print("👋 até logo.")
                    return
                if chosen == "reload":
                    continue
                self.run_batch(chosen)
        except (KeyboardInterrupt, EOFError):
            print("\n🛑 Orquestrador parado pelo usuário.")


def main(argv: List[str]) -> None:
    cfg = load_config()
    if "--verbose" in argv:
        cfg["console_verbose"] = True

    def arg(flag: str) -> Optional[str]:
        return argv[argv.index(flag) + 1] if flag in argv and argv.index(flag) + 1 < len(argv) else None

    orch = Orchestrator(cfg)
    if "--issue" in argv:
        orch.run_pipeline("issue", issue_number=int(arg("--issue") or 0))
    elif "--once" in argv:
        orch.run_pipeline("batch", count=1)
    elif "--batch" in argv:
        orch.run_pipeline("batch", count=int(arg("--batch") or 1))
    elif "--all" in argv:
        orch.run_pipeline("all")
    elif "--select" in argv:
        orch.run_pipeline("select", select=arg("--select") or "")
    elif "--interactive" in argv:
        orch.run_pipeline("interactive")
    elif "--poll" in argv or not sys.stdin.isatty():
        orch.run_pipeline("poll")
    else:
        orch.run_pipeline("interactive")


if __name__ == "__main__":
    main(sys.argv[1:])
