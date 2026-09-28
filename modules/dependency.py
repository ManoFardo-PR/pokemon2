"""
Dependências entre issues: leitura da declaração no corpo, índice de issues,
resolução de prontidão e ordenação topológica da fila.

Declaração no corpo da issue (qualquer uma das formas; o marcador tem prioridade):

    <!-- depends_on: T02,T03 -->        <!-- seq: 4 -->
    | Depende de | T02, T03 |           | Ordem de lançamento | 4 |

`Nenhuma` / `None` / `-` / vazio = raiz. Sem declaração alguma = não declarada
(obrigatoriedade: a issue fica bloqueada até alguém editar o corpo).

Este módulo não faz chamadas de rede: recebe as listas de issues prontas.
"""
import re
from typing import Any, Dict, List, Optional, Tuple

ROOT_WORDS = {"", "-", "nenhuma", "nenhum", "none", "n/a", "na", "raiz", "root"}
DEP_MARK_RE = re.compile(r"<!--\s*depends_on\s*:\s*(.*?)\s*-->", re.IGNORECASE | re.DOTALL)
SEQ_MARK_RE = re.compile(r"<!--\s*seq\s*:\s*(\d+)\s*-->", re.IGNORECASE)
DEP_ROW_RE = re.compile(r"^\|\s*(?:Depende de|Depends on)\s*\|\s*(.*?)\s*\|\s*$", re.IGNORECASE | re.MULTILINE)
SEQ_ROW_RE = re.compile(r"^\|\s*(?:Ordem de lan[çc]amento|Launch order|Sequ[êe]ncia)\s*\|\s*(\d+)\s*\|\s*$",
                        re.IGNORECASE | re.MULTILINE)
TITLE_ID_RE = re.compile(r"\s*\[([^\]]+)\]")

STATUS_READY = "ready"          # todas as dependências fechadas
STATUS_CHAINED = "chained"      # alguma dependência está na própria fila (roda antes, na mesma batelada)
STATUS_BLOCKED = "blocked"      # dependência aberta fora da fila, falhada, inexistente, ciclo ou bloqueada
STATUS_UNDECLARED = "undeclared"  # corpo sem declaração de dependência


def task_id_of(issue: Dict[str, Any]) -> str:
    m = TITLE_ID_RE.match(issue.get("title", "") or "")
    return m.group(1).strip().upper() if m else f"TASK-{issue.get('number')}"


def normalize_ids(text: str) -> List[str]:
    ids: List[str] = []
    for part in re.split(r"[,;]", text or ""):
        p = part.strip().strip("`").strip()
        if p.lower() in ROOT_WORDS:
            continue
        p = p.upper()
        if p not in ids:
            ids.append(p)
    return ids


def parse_depends_on(body: Optional[str]) -> Optional[List[str]]:
    """None = não declarada; [] = raiz; senão lista de ids em maiúsculas."""
    text = body or ""
    m = DEP_MARK_RE.search(text) or DEP_ROW_RE.search(text)
    if not m:
        return None
    return normalize_ids(m.group(1))


def parse_seq(body: Optional[str]) -> Optional[int]:
    text = body or ""
    m = SEQ_MARK_RE.search(text) or SEQ_ROW_RE.search(text)
    return int(m.group(1)) if m else None


def build_index(all_issues: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """task id -> {number, state, labels, title}. Em id repetido, vence a issue de maior número."""
    index: Dict[str, Dict[str, Any]] = {}
    for it in sorted(all_issues, key=lambda x: x.get("number", 0)):
        labels = it.get("label_names") or [l.get("name", "") for l in it.get("labels", [])]
        index[task_id_of(it)] = {
            "number": it.get("number"), "state": (it.get("state") or "").upper(),
            "labels": labels, "title": it.get("title", ""),
        }
    return index


def dep_state(dep: str, index: Dict[str, Dict[str, Any]], failed_label: str) -> Tuple[str, str]:
    """('closed'|'failed'|'open'|'missing', motivo legível)."""
    info = index.get(dep)
    if info is None:
        return "missing", f"{dep} inexistente no repositório"
    if info["state"] == "CLOSED":
        return "closed", ""
    if failed_label in info["labels"]:
        return "failed", f"{dep} (#{info['number']}) com {failed_label}"
    return "open", f"{dep} (#{info['number']}) aberta"


def ready_now(issue: Dict[str, Any], index: Dict[str, Dict[str, Any]], failed_label: str = "tdd-failed") -> Tuple[bool, str]:
    """Prontidão imediata: todas as dependências fechadas neste índice."""
    deps = parse_depends_on(issue.get("body"))
    if deps is None:
        return False, "sem dependência declarada (obrigatório; use 'Nenhuma' para raiz)"
    for dep in deps:
        state, reason = dep_state(dep, index, failed_label)
        if state != "closed":
            return False, reason
    return True, ""


def resolve(queue: List[Dict[str, Any]], index: Dict[str, Dict[str, Any]],
            failed_label: str = "tdd-failed") -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Anota cada issue da fila com task_id, deps, seq, dep_status, blocked_by e after
    (números das dependências que estão na própria fila). Devolve
    (executáveis em ordem topológica, bloqueadas em ordem de número).
    """
    by_id: Dict[str, Dict[str, Any]] = {}
    for it in queue:
        it["task_id"] = task_id_of(it)
        it["deps"] = parse_depends_on(it.get("body"))
        it["seq"] = parse_seq(it.get("body"))
        it["after"] = []
        it["blocked_by"] = ""
        by_id[it["task_id"]] = it

    for it in queue:
        if it["deps"] is None:
            it["dep_status"] = STATUS_UNDECLARED
            it["blocked_by"] = "sem dependência declarada (obrigatório; use 'Nenhuma' para raiz)"
            continue
        reasons, chained = [], False
        for dep in it["deps"]:
            if dep == it["task_id"]:
                reasons.append(f"depende de si mesma ({dep})")
                continue
            if dep in by_id:
                chained = True
                it["after"].append(by_id[dep]["number"])
                continue
            state, reason = dep_state(dep, index, failed_label)
            if state != "closed":
                reasons.append(reason)
        if reasons:
            it["dep_status"], it["blocked_by"] = STATUS_BLOCKED, "; ".join(reasons)
        else:
            it["dep_status"] = STATUS_CHAINED if chained else STATUS_READY

    # propaga bloqueio pela cadeia dentro da fila
    changed = True
    while changed:
        changed = False
        for it in queue:
            if it["dep_status"] not in (STATUS_READY, STATUS_CHAINED):
                continue
            for dep in it["deps"] or []:
                d = by_id.get(dep)
                if d is not None and d["dep_status"] in (STATUS_BLOCKED, STATUS_UNDECLARED):
                    it["dep_status"] = STATUS_BLOCKED
                    it["blocked_by"] = f"depende de {dep} (#{d['number']}), que está bloqueada"
                    changed = True
                    break

    runnable = [it for it in queue if it["dep_status"] in (STATUS_READY, STATUS_CHAINED)]
    ordered, cyclic = topo_order(runnable)
    for it in cyclic:
        it["dep_status"] = STATUS_BLOCKED
        it["blocked_by"] = "ciclo de dependências: " + " → ".join(c["task_id"] for c in cyclic)
    blocked = sorted([it for it in queue if it["dep_status"] in (STATUS_BLOCKED, STATUS_UNDECLARED)],
                     key=lambda x: x["number"])
    return ordered, blocked


def topo_order(issues: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Kahn com desempate por (seq, número). Devolve (ordenadas, restantes em ciclo)."""
    by_id = {it["task_id"]: it for it in issues}
    indeg = {it["task_id"]: 0 for it in issues}
    children: Dict[str, List[str]] = {it["task_id"]: [] for it in issues}
    for it in issues:
        for dep in it.get("deps") or []:
            if dep in by_id and dep != it["task_id"]:
                indeg[it["task_id"]] += 1
                children[dep].append(it["task_id"])

    def key(tid: str) -> Tuple[int, int]:
        it = by_id[tid]
        return (it.get("seq") if it.get("seq") is not None else 10**9, it["number"])

    available = sorted([t for t, d in indeg.items() if d == 0], key=key)
    ordered: List[Dict[str, Any]] = []
    while available:
        tid = available.pop(0)
        ordered.append(by_id[tid])
        for child in children[tid]:
            indeg[child] -= 1
            if indeg[child] == 0:
                available.append(child)
                available.sort(key=key)
    done = {it["task_id"] for it in ordered}
    cyclic = sorted([it for it in issues if it["task_id"] not in done], key=lambda x: x["number"])
    return ordered, cyclic
