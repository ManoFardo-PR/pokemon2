"""
Interação com GitHub Issues via CLI `gh` (já autenticada na máquina).

Estado do pipeline = labels da issue:
  tdd-queue   -> issue elegível para o orquestrador (label gatilho, fica até o fim)
  tdd-context -> Estágio 1 em andamento
  tdd-red     -> Estágio 2 concluído (testes gravados)
  tdd-green   -> Estágio 3 em andamento
  tdd-audit   -> Estágio 4 (auditoria) em andamento
  tdd-failed  -> desistiu; sai da fila até alguém remover a label

`on_event(kind, title, body)` é um callback opcional (reporter) chamado a cada
comentário, mudança de label ou fechamento.
"""
import json
import os
import re
import time
from typing import Any, Callable, Dict, List, Optional

from validation_handler import run_terminal_command

MODULES_DIR = os.path.dirname(os.path.abspath(__file__))

DEFAULT_PIPELINE_LABELS = {
    "tdd-queue":   {"color": "5319e7", "description": "Fila do Orquestrador TDD (gatilho)"},
    "tdd-context": {"color": "fbca04", "description": "Estágio 1: Contexto e Planejamento"},
    "tdd-red":     {"color": "d93f0b", "description": "Estágio 2: TDD Vermelho (Criação de Testes)"},
    "tdd-green":   {"color": "0e8a16", "description": "Estágio 3: TDD Verde (Código de Produção)"},
    "tdd-audit":   {"color": "1d76db", "description": "Estágio 4: Auditoria Global e Fechamento"},
    "tdd-failed":  {"color": "b60205", "description": "Orquestrador TDD desistiu; ver último comentário"},
}

STAGE_LABELS = ["tdd-context", "tdd-red", "tdd-green", "tdd-audit"]

# Marker the seeder puts at the top of each continuation comment (body split by GitHub's limit).
CONTINUATION_RE = re.compile(r"^\s*<!--\s*continua[çc][ãa]o\s+(\d+)/(\d+)\s*-->", re.IGNORECASE)

EventCallback = Callable[[str, str, str], None]


class GitHubHandler:
    def __init__(self, repo: Optional[str] = None, cwd: Optional[str] = None,
                 on_event: Optional[EventCallback] = None):
        self.repo_args = ["-R", repo] if repo else []
        self.cwd = cwd
        self.on_event = on_event
        self.tmp_dir = os.path.join(MODULES_DIR, "logs", "tmp")
        os.makedirs(self.tmp_dir, exist_ok=True)

    def _gh(self, args: List[str], timeout: int = 60) -> Dict[str, Any]:
        return run_terminal_command(["gh"] + args, timeout=timeout, cwd=self.cwd)

    def _emit(self, title: str, body: str = "") -> None:
        if self.on_event:
            self.on_event("GITHUB", title, body)

    # ------------------------------------------------------------------
    def setup_repository(self) -> Dict[str, Any]:
        """Garante a infraestrutura de labels no repositório."""
        created, errors = [], []
        for name, meta in DEFAULT_PIPELINE_LABELS.items():
            res = self._gh(["label", "create", name, *self.repo_args,
                            "--color", meta["color"], "--description", meta["description"], "--force"])
            if res["success"]:
                created.append(name)
            else:
                errors.append({"label": name, "error": res["stderr"]})
        return {"success": not errors, "created": created, "errors": errors}

    def get_open_issues(self, trigger_label: Optional[str] = None,
                        exclude_label: Optional[str] = None) -> List[Dict[str, Any]]:
        """Issues abertas (opcionalmente só com a label gatilho), em ordem crescente de número."""
        args = ["issue", "list", *self.repo_args, "--state", "open",
                "--json", "number,title,body,labels", "--limit", "500"]
        if trigger_label:
            args += ["--label", trigger_label]
        res = self._gh(args)
        if not (res["success"] and res["stdout"]):
            return []
        try:
            issues = json.loads(res["stdout"])
        except json.JSONDecodeError:
            return []
        for issue in issues:
            issue["label_names"] = [l["name"] for l in issue.get("labels", [])]
        if exclude_label:
            issues = [i for i in issues if exclude_label not in i["label_names"]]
        return sorted(issues, key=lambda x: x["number"])

    def get_all_issues(self, limit: int = 500) -> List[Dict[str, Any]]:
        """Todas as issues (abertas e fechadas) com número, título, estado e labels: índice de dependências."""
        res = self._gh(["issue", "list", *self.repo_args, "--state", "all",
                        "--json", "number,title,state,labels", "--limit", str(limit)], timeout=120)
        if not (res["success"] and res["stdout"]):
            return []
        try:
            issues = json.loads(res["stdout"])
        except json.JSONDecodeError:
            return []
        for issue in issues:
            issue["label_names"] = [l["name"] for l in issue.get("labels", [])]
        return issues

    def get_issue_full_body(self, issue_number: int) -> str:
        """Issue body followed by the seeder's continuation comments, in order.

        The seeder moves the sections that do not fit GitHub's 65,536-character body
        limit into numbered comments starting with `<!-- continuação i/N -->`. This
        merges them back so Stage 1 sees the whole specification. Comments without the
        marker (gate, stage and retry notes written by the orchestrator itself) are
        ignored. Returns "" on any failure so the caller can fall back to the body it
        already has from the issue list.
        """
        res = self._gh(["issue", "view", str(issue_number), *self.repo_args, "--json", "body,comments"])
        if not (res["success"] and res["stdout"]):
            return ""
        try:
            data = json.loads(res["stdout"])
        except json.JSONDecodeError:
            return ""
        continuations = []
        for c in data.get("comments") or []:
            m = CONTINUATION_RE.match(c.get("body") or "")
            if m:
                continuations.append((int(m.group(1)), c["body"]))
        parts = [data.get("body") or ""] + [body for _, body in sorted(continuations, key=lambda x: x[0])]
        return "\n\n".join(parts)

    def get_issue_labels(self, issue_number: int) -> List[str]:
        res = self._gh(["issue", "view", str(issue_number), *self.repo_args, "--json", "labels"])
        if not res["success"]:
            return []
        try:
            return [l["name"] for l in json.loads(res["stdout"]).get("labels", [])]
        except (json.JSONDecodeError, AttributeError):
            return []

    def add_comment(self, issue_number: int, comment_body: str) -> bool:
        """Comentário via --body-file: aceita Markdown multilinha e caracteres especiais."""
        path = os.path.join(self.tmp_dir, f"comment_{issue_number}_{int(time.time() * 1000)}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(comment_body[:60000])  # limite do GitHub é 65536
        res = self._gh(["issue", "comment", str(issue_number), *self.repo_args, "--body-file", path])
        try:
            os.remove(path)
        except OSError:
            pass
        if not res["success"]:
            print(f"   ⚠️ Falha ao comentar na issue #{issue_number}: {res['stderr'][:200]}")
        self._emit(f"comentário em #{issue_number}" + ("" if res["success"] else " (FALHOU)"), comment_body)
        return res["success"]

    def update_issue_labels(self, issue_number: int, add_labels: Optional[List[str]] = None,
                            remove_labels: Optional[List[str]] = None) -> bool:
        args = ["issue", "edit", str(issue_number), *self.repo_args]
        if add_labels:
            args += ["--add-label", ",".join(add_labels)]
        if remove_labels:
            args += ["--remove-label", ",".join(remove_labels)]
        if len(args) == 3 + len(self.repo_args):
            return True
        res = self._gh(args)
        if not res["success"]:
            print(f"   ⚠️ Falha ao atualizar labels da #{issue_number}: {res['stderr'][:200]}")
        self._emit(f"labels #{issue_number}: +{add_labels or []} -{remove_labels or []}")
        return res["success"]

    def set_stage(self, issue_number: int, stage_label: Optional[str]) -> bool:
        """Deixa exatamente uma label de estágio (ou nenhuma) na issue."""
        remove = [l for l in STAGE_LABELS if l != stage_label]
        add = [stage_label] if stage_label else None
        return self.update_issue_labels(issue_number, add_labels=add, remove_labels=remove)

    def mark_failed(self, issue_number: int, reason: str, failed_label: str = "tdd-failed") -> bool:
        self.add_comment(issue_number,
                         f"🛑 **[Orquestrador TDD] Desistindo desta tarefa.**\n\n{reason}\n\n"
                         f"Para tentar de novo: remova a label `{failed_label}`.")
        return self.update_issue_labels(issue_number, add_labels=[failed_label], remove_labels=STAGE_LABELS)

    def close_issue(self, issue_number: int, final_comment: Optional[str] = None) -> bool:
        if final_comment:
            self.add_comment(issue_number, final_comment)
        res = self._gh(["issue", "close", str(issue_number), *self.repo_args])
        self._emit(f"issue #{issue_number} fechada" + ("" if res["success"] else " (FALHOU)"))
        return res["success"]
