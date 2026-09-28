"""
Operações de arquivo do orquestrador: cerca de segurança, patch SEARCH/REPLACE,
snapshot/restore e linguagem da cerca de código.

Nenhuma regra de layout (src/, tests/) mora aqui: o destino de cada arquivo vem
do plano do Estágio 1. Este módulo só garante que nada seja gravado fora dos
prefixos permitidos nem dentro dos proibidos.
"""
import os
from typing import Dict, List, Optional, Tuple

FENCE_BY_EXT = {
    ".py": "python", ".js": "javascript", ".ts": "typescript", ".tsx": "tsx", ".jsx": "jsx",
    ".json": "json", ".md": "markdown", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".sh": "bash", ".sql": "sql", ".html": "html", ".css": "css", ".txt": "text", ".ini": "ini",
}


def fence_for(path: str) -> str:
    return FENCE_BY_EXT.get(os.path.splitext(path)[1].lower(), "")


def normalize_rel(path: str) -> str:
    """Barras normais, sem './' inicial, sem barras nas pontas."""
    rel = path.replace("\\", "/").strip().strip("`").strip()
    while rel.startswith("./"):
        rel = rel[2:]
    return rel.strip("/")


def safe_path(rel_path: str, repo_root: str, allowed_paths: List[str], forbidden_paths: List[str]) -> str:
    """
    Devolve o caminho absoluto se `rel_path` for aceitável; senão levanta ValueError.
    - `allowed_paths`: prefixos permitidos (relativos à raiz). Lista vazia ou [""] = tudo.
    - `forbidden_paths`: prefixos proibidos, sempre aplicados.
    """
    rel = normalize_rel(rel_path)
    if not rel or os.path.isabs(rel_path) or ".." in rel.split("/"):
        raise ValueError(f"caminho inválido: {rel_path!r}")
    parts = rel.split("/")
    for forb in forbidden_paths:
        f = normalize_rel(forb)
        if f and (rel == f or parts[: len(f.split('/'))] == f.split("/")):
            raise ValueError(f"caminho proibido ({f}/): {rel}")
    allowed = [normalize_rel(a) for a in allowed_paths if normalize_rel(a)]
    if allowed and not any(rel == a or parts[: len(a.split('/'))] == a.split("/") for a in allowed):
        raise ValueError(f"caminho fora dos prefixos permitidos {allowed}: {rel}")
    return os.path.join(repo_root, *parts)


def apply_patch(text: str, edits: List[Dict[str, str]]) -> Tuple[str, Optional[str]]:
    """
    Aplica edições SEARCH/REPLACE em ordem. Cada SEARCH deve ocorrer exatamente
    uma vez (comparação literal; segunda tentativa ignorando espaços à direita
    de cada linha). Devolve (novo_texto, None) ou (texto_original, erro).
    """
    current = text
    for i, edit in enumerate(edits, start=1):
        search, replace = edit["search"], edit["replace"]
        if not search.strip():
            return text, f"edição {i}: bloco SEARCH vazio"
        count = current.count(search)
        if count == 1:
            current = current.replace(search, replace, 1)
            continue
        if count > 1:
            return text, f"edição {i}: SEARCH ambíguo ({count} ocorrências)"
        # tolerância: espaços à direita
        norm_cur_lines = [l.rstrip() for l in current.split("\n")]
        norm_search_lines = [l.rstrip() for l in search.split("\n")]
        n = len(norm_search_lines)
        hits = [k for k in range(len(norm_cur_lines) - n + 1) if norm_cur_lines[k:k + n] == norm_search_lines]
        if len(hits) == 1:
            lines = current.split("\n")
            k = hits[0]
            lines[k:k + n] = replace.split("\n")
            current = "\n".join(lines)
            continue
        if len(hits) > 1:
            return text, f"edição {i}: SEARCH ambíguo ({len(hits)} ocorrências, ignorando espaços à direita)"
        return text, f"edição {i}: SEARCH não encontrado no arquivo (copie o trecho exatamente do CURRENT CONTENT)"
    return current, None


def read_text(abs_path: str) -> Optional[str]:
    if not os.path.isfile(abs_path):
        return None
    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def write_text(abs_path: str, content: str) -> None:
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def snapshot(abs_paths: List[str]) -> Dict[str, Optional[str]]:
    """Conteúdo atual de cada caminho (None = não existia)."""
    return {p: read_text(p) for p in abs_paths}


def restore(snap: Dict[str, Optional[str]]) -> None:
    """Volta cada arquivo ao estado do snapshot (apaga os que não existiam)."""
    for p, content in snap.items():
        if content is None:
            if os.path.isfile(p):
                os.remove(p)
        else:
            write_text(p, content)
