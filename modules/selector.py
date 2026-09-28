"""
Seletor de batelada: mostra a fila em ordem de execução (topológica, por
dependência) e lê a escolha do usuário.

    [1] primeira   [10] dez primeiras   [a] todas
    [2,4-6] índices da tabela   [#12,#14] números de issue
    [r] recarregar   [q] sair

Issues bloqueadas (dependência aberta, falhada, inexistente, ciclo) ou sem
dependência declarada aparecem no fim, marcadas, e não são selecionáveis.
"""
import re
from typing import Any, Callable, Dict, List, Optional, Union

import dependency

MENU = ("[1] primeira   [10] dez primeiras   [a] todas   [2,4-6] índices   "
        "[#12,#14] issues   [r] recarregar   [q] sair")

STAGE_LABELS = ("tdd-context", "tdd-red", "tdd-green", "tdd-audit")


def _task_id(issue: Dict[str, Any]) -> str:
    return issue.get("task_id") or dependency.task_id_of(issue)


def _situation(issue: Dict[str, Any]) -> str:
    status = issue.get("dep_status", dependency.STATUS_READY)
    if status == dependency.STATUS_READY:
        return "pronta"
    if status == dependency.STATUS_CHAINED:
        return "após " + ", ".join(f"#{n}" for n in issue.get("after", []))
    if status == dependency.STATUS_UNDECLARED:
        return "SEM DEPENDÊNCIA"
    return "BLOQUEADA: " + (issue.get("blocked_by") or "")


def render(runnable: List[Dict[str, Any]], blocked: Optional[List[Dict[str, Any]]] = None, width: int = 48) -> str:
    blocked = blocked or []
    if not runnable and not blocked:
        return "(fila vazia)"
    lines = [f"{'#':>3}  {'issue':>6}  {'task':<8} {'estado':<11} {'depende de':<12} {'situação':<22} título",
             "-" * (70 + width)]

    def row(idx: str, issue: Dict[str, Any]) -> str:
        labels = issue.get("label_names") or [l.get("name", "") for l in issue.get("labels", [])]
        stage = next((l for l in labels if l in STAGE_LABELS), "novo")
        deps = issue.get("deps")
        deps_txt = "?" if deps is None else (", ".join(deps) if deps else "raiz")
        if len(deps_txt) > 12:
            deps_txt = deps_txt[:11] + "…"
        title = re.sub(r"^\s*\[[^\]]+\]\s*", "", issue.get("title", ""))
        if len(title) > width:
            title = title[: width - 1] + "…"
        sit = _situation(issue)
        if len(sit) > 22:
            sit = sit[:21] + "…"
        return f"{idx:>3}  #{issue['number']:>5}  {_task_id(issue):<8} {stage:<11} {deps_txt:<12} {sit:<22} {title}"

    for i, issue in enumerate(runnable, start=1):
        lines.append(row(str(i), issue))
    if blocked:
        lines.append("-" * (70 + width) + "  (não selecionáveis)")
        for issue in blocked:
            lines.append(row("x", issue))
            if issue.get("blocked_by"):
                lines.append(f"{'':>3}  {'':>6}  {'':<8} {'':<11} {'':<12} └ {issue['blocked_by']}")
    return "\n".join(lines)


def parse_choice(text: str, runnable: List[Dict[str, Any]],
                 blocked: Optional[List[Dict[str, Any]]] = None) -> Union[List[int], str]:
    """
    Devolve a lista de índices (1-based, sobre `runnable`) em ordem crescente,
    ou um comando: 'reload', 'quit', ou 'error: ...'.
    """
    blocked = blocked or []
    t = text.strip().lower()
    n = len(runnable)
    if t in ("q", "quit", "sair"):
        return "quit"
    if t in ("r", "reload", "recarregar"):
        return "reload"
    if not t:
        return "error: digite uma opção"
    if n == 0:
        return "error: nenhuma issue executável na fila"
    if t in ("a", "all", "todas", "todos"):
        return list(range(1, n + 1))
    if re.fullmatch(r"\d+", t):
        k = int(t)
        if k <= 0:
            return "error: número deve ser positivo"
        return list(range(1, min(k, n) + 1))

    chosen = set()
    for part in [p.strip() for p in t.split(",") if p.strip()]:
        if part.startswith("#"):
            num = part[1:].strip()
            if not num.isdigit():
                return f"error: issue inválida '{part}'"
            idx = next((i for i, it in enumerate(runnable, start=1) if it["number"] == int(num)), None)
            if idx is None:
                b = next((it for it in blocked if it["number"] == int(num)), None)
                if b is not None:
                    return f"error: issue #{num} não é selecionável ({_situation(b)})"
                return f"error: issue #{num} não está na fila"
            chosen.add(idx)
            continue
        m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if a > b:
                a, b = b, a
            if a < 1 or b > n:
                return f"error: intervalo {part} fora de 1..{n}"
            chosen.update(range(a, b + 1))
            continue
        if part.isdigit():
            k = int(part)
            if k < 1 or k > n:
                return f"error: índice {k} fora de 1..{n}"
            chosen.add(k)
            continue
        return f"error: não entendi '{part}'"
    if not chosen:
        return "error: nada selecionado"
    return sorted(chosen)


def select_issues(runnable: List[Dict[str, Any]], blocked: Optional[List[Dict[str, Any]]] = None,
                  ask: Callable[[str], str] = input,
                  out: Callable[[str], None] = print) -> Optional[Union[List[Dict[str, Any]], str]]:
    """
    Mostra a tabela e o menu; devolve a lista de issues escolhidas (na ordem
    da tabela, que é a ordem topológica), 'reload' para recarregar, ou None para sair.
    """
    out("\n📋 Fila de execução (ordem por dependência):\n")
    out(render(runnable, blocked))
    out("\n" + MENU)
    while True:
        try:
            text = ask("\nEscolha: ")
        except EOFError:
            return None
        choice = parse_choice(text, runnable, blocked)
        if choice == "quit":
            return None
        if choice == "reload":
            return "reload"
        if isinstance(choice, str):
            out("⚠️  " + choice[len("error: "):] + f". {MENU}")
            continue
        selected = [runnable[i - 1] for i in choice]
        out("✅ Selecionadas: " + ", ".join(f"#{it['number']} ({_task_id(it)})" for it in selected))
        return selected
