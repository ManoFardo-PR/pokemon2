"""
Cria issues no GitHub a partir de um backlog JSON (modelo de subtask v2),
garantindo dependência obrigatória e ordem de lançamento.

Uso:
    python modules/TESTE/seed_issues.py                              # menu: escolhe um .json da pasta do script
    python modules/TESTE/seed_issues.py S02-backlog.json             # arquivo direto (relativo à pasta do script)
    python modules/TESTE/seed_issues.py --list                       # só lista os .json disponíveis
    python modules/TESTE/seed_issues.py S02-backlog.json --only S02T03,S02T04   # só alguns ids
    python modules/TESTE/seed_issues.py S02-backlog.json --dry-run   # valida e mostra, sem criar
    python modules/TESTE/seed_issues.py S02-backlog.json --dry-run --full   # mostra o corpo inteiro no dry-run
    python modules/TESTE/seed_issues.py S02-backlog.json --skip-existing    # não recria ids que já existem no GitHub

Regras de dependência:
- Item sem `depends_on` (chave ausente ou vazia) recebe o id do item anterior na
  ordem do arquivo; o primeiro vira "Nenhuma". `unblocks` é recalculado (inverso)
  e `seq` é a posição na ordem topológica. Tudo é gravado de volta no JSON.
- Ids duplicados, dependência inexistente (nem no JSON nem no GitHub) ou ciclo
  abortam antes de criar qualquer issue.
- As issues são criadas em ordem topológica (números crescem com as dependências).

Conteúdo da issue:
- Todos os campos do item vão para a issue. Campos do schema têm seção própria;
  qualquer outro campo (ex.: depends_on_external, unblocks_external, spec_file)
  aparece na tabela de cabeçalho ou em "Outros campos". Nada do JSON é descartado.
- O GitHub limita o corpo da issue a 65.536 caracteres. Quando o corpo passa do
  limite, as seções longas (contexto, interfaces, regras...) vão, na ordem, para
  comentários numerados logo após a criação. Cabeçalho, marcadores
  <!-- depends_on --> / <!-- seq -->, "Arquivos para ler" e "Arquivos Alvo"
  ficam sempre no corpo, porque o orquestrador os lê de lá.
- The orchestrator merges the continuation comments back in Stage 1
  (GitHubHandler.get_issue_full_body). Sections that hold only a placeholder
  never leave the body. An item with an empty `target_files` aborts the run.
"""
import sys

if hasattr(sys.stdout, "reconfigure"):  # console Windows em cp1252 quebra com emojis
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import glob
import json
import os
from typing import Any, Dict, List, Optional, Tuple

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MODULES_DIR = os.path.dirname(CURRENT_DIR)
if MODULES_DIR not in sys.path:
    sys.path.insert(0, MODULES_DIR)

import dependency                                  # noqa: E402
from github_handler import GitHubHandler          # noqa: E402
from main import load_config                      # noqa: E402
from validation_handler import run_terminal_command  # noqa: E402

ROOT = "Nenhuma"
GITHUB_BODY_LIMIT = 65536
BODY_BUDGET = 64000        # ~1,500 chars of margin under GITHUB_BODY_LIMIT for the continuation note
COMMENT_BUDGET = 60000
KEEP_IN_BODY_CHARS = 300   # placeholder-only sections ("- (nenhum)") never go to a comment

# Campos com lugar próprio no corpo; o resto vai para "Outros campos".
KNOWN_FIELDS = {
    "id", "title", "stage", "depends_on", "unblocks", "seq", "objective", "context",
    "inputs", "outputs", "interfaces", "business_rules", "test_scenarios", "done_when",
    "read_files", "target_files", "depends_on_external", "unblocks_external", "spec_file",
}


# ----------------------------------------------------------------------
# Escolha do arquivo
# ----------------------------------------------------------------------
def list_backlogs(folder: str = CURRENT_DIR) -> List[str]:
    """Arquivos .json da pasta que parecem backlog (lista de objetos com 'id')."""
    found = []
    for path in sorted(glob.glob(os.path.join(folder, "*.json"))):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(data, list) and data and all(isinstance(x, dict) and "id" in x for x in data):
            found.append(path)
    return found


def choose_backlog(folder: str = CURRENT_DIR) -> Optional[str]:
    """Menu interativo: mostra os backlogs da pasta e devolve o escolhido (ou None)."""
    files = list_backlogs(folder)
    if not files:
        print(f"❌ Nenhum backlog .json encontrado em {folder}")
        return None
    print(f"Backlogs em {folder}:")
    for i, p in enumerate(files, 1):
        with open(p, "r", encoding="utf-8") as f:
            n = len(json.load(f))
        print(f"  {i:>2}) {os.path.basename(p)}  ({n} itens)")
    while True:
        try:
            ans = input("Número do arquivo (Enter cancela): ").strip()
        except EOFError:
            return None
        if not ans:
            return None
        if ans.isdigit() and 1 <= int(ans) <= len(files):
            return files[int(ans) - 1]
        print("   opção inválida")


# ----------------------------------------------------------------------
# Preparação do backlog (puro, testável)
# ----------------------------------------------------------------------
def _dep_list(value: Any) -> Optional[List[str]]:
    """None = não informado; [] = raiz explícita; senão ids."""
    if value is None:
        return None
    if isinstance(value, list):
        text = ",".join(str(v) for v in value)
    else:
        text = str(value)
    if not text.strip():
        return None
    return dependency.normalize_ids(text)


def prepare_backlog(items: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Preenche depends_on (inferência sequencial), unblocks e seq. Devolve
    (itens em ordem topológica, mensagens do que foi inferido). Levanta
    ValueError em id duplicado, dependência para si mesma ou ciclo.
    """
    notes: List[str] = []
    ids = [str(it.get("id", "")).strip().upper() for it in items]
    if any(not i for i in ids):
        raise ValueError("todo item precisa de 'id'")
    dups = sorted({i for i in ids if ids.count(i) > 1})
    if dups:
        raise ValueError(f"ids duplicados no backlog: {dups}")
    empty_targets = [tid for it, tid in zip(items, ids) if not it.get("target_files")]
    if empty_targets:  # target_files is required: Stage 1 checks the plan against it
        raise ValueError(f"target_files is required and empty in: {empty_targets}")

    prev: Optional[str] = None
    for it, tid in zip(items, ids):
        it["id"] = tid
        deps = _dep_list(it.get("depends_on"))
        if deps is None:
            deps = [prev] if prev else []
            notes.append(f"{tid}: depends_on inferido = {', '.join(deps) if deps else ROOT}")
        if tid in deps:
            raise ValueError(f"{tid} depende de si mesma")
        it["_deps"] = deps
        it["depends_on"] = ", ".join(deps) if deps else ROOT
        prev = tid

    # unblocks (inverso)
    unblocks: Dict[str, List[str]] = {tid: [] for tid in ids}
    for it in items:
        for d in it["_deps"]:
            if d in unblocks:
                unblocks[d].append(it["id"])
    for it in items:
        it["unblocks"] = ", ".join(unblocks[it["id"]]) if unblocks[it["id"]] else "Nenhum"

    # ordem topológica (só dependências internas ao arquivo)
    pseudo = [{"task_id": it["id"], "deps": [d for d in it["_deps"] if d in unblocks],
               "seq": None, "number": i} for i, it in enumerate(items)]
    ordered, cyclic = dependency.topo_order(pseudo)
    if cyclic:
        raise ValueError("ciclo de dependências: " + " → ".join(c["task_id"] for c in cyclic))
    order = {p["task_id"]: k + 1 for k, p in enumerate(ordered)}
    for it in items:
        it["seq"] = order[it["id"]]
    return sorted(items, key=lambda it: it["seq"]), notes


def external_deps(items: List[Dict[str, Any]]) -> List[str]:
    """Dependências que não estão no próprio backlog (precisam existir no GitHub)."""
    internal = {it["id"] for it in items}
    return sorted({d for it in items for d in it["_deps"] if d not in internal})


def save_backlog(json_path: str, items: List[Dict[str, Any]]) -> None:
    """Grava de volta na ordem original do arquivo, sem os campos internos."""
    with open(json_path, "r", encoding="utf-8") as f:
        original: List[Dict[str, Any]] = json.load(f)
    by_id = {it["id"]: it for it in items}
    out = []
    for orig in original:
        it = by_id.get(str(orig.get("id", "")).strip().upper(), orig)
        out.append({k: v for k, v in it.items() if not k.startswith("_")})
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ----------------------------------------------------------------------
# Corpo da issue
# ----------------------------------------------------------------------
def _bullets(items: List[Any], code: bool = False) -> str:
    if not items:
        return "- (nenhum)"
    out = []
    for i in items:
        text = i if isinstance(i, str) else json.dumps(i, ensure_ascii=False)
        out.append(f"- `{text}`" if code else f"- {text}")
    return "\n".join(out)


def _cell(text: Any) -> str:
    """Texto seguro para célula de tabela Markdown (pipes escapados, sem quebra de linha)."""
    return str(text).replace("|", "\\|").replace("\r\n", "\n").replace("\n", "<br>")


def _fence(code: str) -> str:
    """Bloco de código com cerca maior que qualquer sequência de crases dentro dele."""
    longest = max((len(r) for r in _backtick_runs(code)), default=0)
    fence = "`" * max(3, longest + 1)
    return f"{fence}\n{code}\n{fence}"


def _backtick_runs(text: str) -> List[str]:
    runs, cur = [], ""
    for ch in text:
        if ch == "`":
            cur += ch
        elif cur:
            runs.append(cur)
            cur = ""
    if cur:
        runs.append(cur)
    return runs


def _demote_headings(text: str) -> str:
    """Rebaixa os títulos do texto para que fiquem abaixo da seção da issue.
    Só a marcação muda; o conteúdo é o mesmo. Ignora linhas dentro de blocos de código.

    A single '#' becomes '###' (two levels) and deeper headings go down one level, so
    nothing from the spec can render as '## ' and be mistaken for an issue section by
    the orchestrator's section reader. Fences made of backticks or tildes are skipped.
    """
    out, in_code, fence_char = [], False, ""
    for line in text.split("\n"):
        stripped = line.lstrip()
        if not in_code and (stripped.startswith("```") or stripped.startswith("~~~")):
            in_code, fence_char = True, stripped[0]
        elif in_code and stripped.startswith(fence_char * 3):
            in_code = False
        elif not in_code and line.startswith("#"):
            line = ("##" if not line.startswith("##") else "#") + line
        out.append(line)
    return "\n".join(out)


def _header(data: Dict[str, Any]) -> str:
    deps = data.get("depends_on") or ROOT
    seq = data.get("seq", "")
    rows = [
        ("Estágio", data.get("stage", "Geral")),
        ("ID Tarefa", data.get("id", "N/A")),
        ("Depende de", deps),
        ("Desbloqueia", data.get("unblocks", "Nenhum")),
        ("Ordem de lançamento", seq),
    ]
    if "depends_on_external" in data:
        rows.append(("Depende de (outros estágios)", data.get("depends_on_external") or ROOT))
    if "unblocks_external" in data:
        rows.append(("Desbloqueia (outros estágios)", data.get("unblocks_external") or "Nenhum"))
    if data.get("spec_file"):
        rows.append(("Especificação", f"`{data['spec_file']}`"))
    table = "| Campo | Valor |\n|---|---|\n" + "".join(f"| {k} | {_cell(v)} |\n" for k, v in rows)
    # A linha "| Depende de | ... |" precisa continuar existindo: o orquestrador a lê.
    return f"""# {data.get('title', 'Sem Título')}

{table}
<!-- depends_on: {deps} -->
<!-- seq: {seq} -->
"""


def build_sections(data: Dict[str, Any]) -> List[Tuple[str, str, bool]]:
    """Seções da issue na ordem: (título, conteúdo, pode_ir_para_comentário)."""
    rules = data.get("business_rules", [])
    if rules:
        rules_md = "| ID | Regra de Negócio |\n|---|---|\n" + "".join(
            f"| {_cell(r.get('id', ''))} | {_cell(r.get('rule', ''))} |\n" for r in rules)
        extra_rule_keys = sorted({k for r in rules for k in r if k not in ("id", "rule")})
        if extra_rule_keys:  # campos adicionais das regras não se perdem
            rules_md += "\n" + "\n".join(
                f"- **{r.get('id', '')}** {k}: {r[k]}" for r in rules for k in extra_rule_keys if k in r)
    else:
        rules_md = "- (nenhuma)"

    interfaces = data.get("interfaces", [])
    interfaces_md = "\n\n".join(_fence(i if isinstance(i, str) else json.dumps(i, ensure_ascii=False))
                                for i in interfaces) if interfaces else "- (a definir pelo planejador)"

    sections = [
        ("## 🎯 Objetivo", data.get("objective", "") or "(vazio)", False),
        ("## 🔍 Contexto", _demote_headings(data.get("context", "") or "(vazio)"), True),
        ("## 📥 Entradas (Inputs)", _bullets(data.get("inputs", [])), True),
        ("## 📤 Saídas Esperadas (Outputs)", _bullets(data.get("outputs", [])), True),
        ("## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)", interfaces_md, True),
        ("## ⚙️ Regras de Negócio", rules_md, True),
        ("## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)", _bullets(data.get("test_scenarios", [])), True),
        ("## ✅ Critérios de aceite (done_when)", _bullets(data.get("done_when", [])), True),
    ]
    others = {k: v for k, v in data.items() if k not in KNOWN_FIELDS and not k.startswith("_")}
    if others:
        sections.append(("## 🗂️ Outros campos do backlog",
                         "\n\n".join(f"**{k}**\n\n" + (v if isinstance(v, str) else _fence(json.dumps(v, ensure_ascii=False, indent=2)))
                                     for k, v in others.items()), True))
    return sections


def _files_block(data: Dict[str, Any]) -> str:
    return f"""## 📖 Arquivos para ler primeiro (o planejador começa por estes)
{_bullets(data.get('read_files', []), code=True)}

## 📁 Arquivos Alvo a Criar/Editar
{_bullets(data.get('target_files', []), code=True)}
"""


def generate_markdown_body(data: Dict[str, Any]) -> str:
    """Corpo completo (sem limite de tamanho). Usado no dry-run e quando cabe no GitHub."""
    parts = [_header(data)] + [f"{t}\n{c}\n" for t, c, _ in build_sections(data)] + [_files_block(data)]
    return "\n".join(parts)


def _split_text(text: str, budget: int) -> List[str]:
    """Quebra em pedaços <= budget, preferindo fronteiras de linha e sem cortar blocos de código."""
    if len(text) <= budget:
        return [text]
    chunks, cur, in_code, fence = [], "", False, ""
    for line in text.split("\n"):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            if not in_code:
                in_code, fence = True, stripped[: len(stripped) - len(stripped.lstrip("`"))]
            elif stripped.startswith(fence):
                in_code = False
        piece = line + "\n"
        if len(cur) + len(piece) > budget and cur:
            if in_code and not stripped.startswith("```"):
                chunks.append(cur + fence + "\n")
                cur = fence + "\n"
            else:
                chunks.append(cur)
                cur = ""
        while len(piece) > budget:  # linha sozinha maior que o orçamento
            chunks.append(piece[:budget])
            piece = piece[budget:]
        cur += piece
    if cur:
        chunks.append(cur)
    return chunks


def render_issue(data: Dict[str, Any]) -> Tuple[str, List[str]]:
    """Devolve (corpo, comentários). Tudo que não cabe no corpo vira comentário, na ordem."""
    full = generate_markdown_body(data)
    if len(full) <= BODY_BUDGET:
        return full, []

    header, files = _header(data), _files_block(data)
    sections = build_sections(data)
    body_parts, overflow = [header], []
    used = len(header) + len(files) + 600  # reserva para a nota de continuação
    moving = False
    for title, content, movable in sections:
        block = f"{title}\n{content}\n"
        # Non-movable and placeholder-sized sections stay in the body even after the
        # overflow started, so no comment carries only "- (nenhum)".
        keep = not movable or len(block) <= KEEP_IN_BODY_CHARS
        if keep or (not moving and used + len(block) <= BODY_BUDGET):
            body_parts.append(block)
            used += len(block)
        else:
            moving = True
            overflow.append(block)

    comments: List[str] = []
    for block in overflow:
        for piece in _split_text(block, COMMENT_BUDGET - 200):
            comments.append(piece)
    total = len(comments)
    comments = [f"<!-- continuação {i}/{total} -->\n**Continuação {i}/{total} do corpo da issue**\n\n{c}"
                for i, c in enumerate(comments, 1)]
    moved_titles = ", ".join(t.split(" ", 2)[-1] for t, _, _ in sections if any(c.startswith(f"{t}\n") for c in overflow))
    note = (f"> ⚠️ O conteúdo completo passa do limite do GitHub ({GITHUB_BODY_LIMIT} caracteres). "
            f"As seções a seguir estão nos {total} comentário(s) de continuação desta issue, na ordem: {moved_titles}.\n")
    body = "\n".join(body_parts) + "\n" + note + "\n" + files
    return body, comments


# ----------------------------------------------------------------------
# Execução
# ----------------------------------------------------------------------
def _gh(cmd: List[str], cfg: Dict[str, Any]) -> Dict[str, Any]:
    if cfg.get("github_repo"):
        cmd = cmd + ["-R", cfg["github_repo"]]
    return run_terminal_command(cmd, cwd=cfg["repo_root"])


def _write_tmp(text: str, name: str) -> str:
    path = os.path.join(MODULES_DIR, "logs", "tmp", name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


def seed_github_from_json(json_filename: str = "backlog.json", only: Optional[List[str]] = None,
                          dry_run: bool = False, full: bool = False, skip_existing: bool = False) -> bool:
    json_path = json_filename if os.path.isabs(json_filename) else os.path.join(CURRENT_DIR, json_filename)
    if not os.path.exists(json_path):
        print(f"❌ [ERRO] Arquivo de backlog não encontrado em: {json_path}")
        return False

    cfg = load_config()
    trigger_label = cfg["trigger_label"]
    print("=" * 70)
    print(f"🌱 {'VALIDANDO' if dry_run else 'CADASTRANDO'} ISSUES DE {os.path.basename(json_path)} (label {trigger_label})")
    print("=" * 70)

    with open(json_path, "r", encoding="utf-8") as f:
        backlog: List[Dict[str, Any]] = json.load(f)

    try:
        ordered, notes = prepare_backlog(backlog)
    except ValueError as e:
        print(f"❌ [ERRO] backlog inválido: {e}")
        return False
    for n in notes:
        print(f"   ↪ {n}")
    save_backlog(json_path, ordered)
    print(f"   💾 depends_on/unblocks/seq gravados em {os.path.basename(json_path)}")

    gh = GitHubHandler(repo=cfg.get("github_repo") or None, cwd=cfg["repo_root"])
    index = dependency.build_index(gh.get_all_issues())

    if only:
        wanted = {o.strip().upper() for o in only}
        ordered = [b for b in ordered if b["id"] in wanted]
        print(f"   filtrando: {sorted(wanted)} -> {len(ordered)} item(ns)")

    missing_ext = [d for d in external_deps(ordered) if d not in index]
    if missing_ext:
        print(f"❌ [ERRO] dependências que não existem nem no backlog filtrado nem no GitHub: {missing_ext}")
        return False
    already = [b["id"] for b in ordered if b["id"] in index]
    if already:
        if skip_existing:
            print(f"⏭️  já existem no GitHub e serão puladas: {already}")
            ordered = [b for b in ordered if b["id"] not in index]
        else:
            print(f"⚠️  já existem no GitHub (serão criadas de novo; use --skip-existing para pular): {already}")

    print("   sequência de lançamento: " + " → ".join(f"{b['id']}(seq {b['seq']}, dep {b['depends_on']})" for b in ordered))
    big = []
    for b in ordered:
        body, comments = render_issue(b)
        if comments:
            big.append(f"{b['id']} ({len(generate_markdown_body(b))} car. → corpo + {len(comments)} comentário(s))")
    if big:
        print("   ✂️  passam do limite do GitHub e serão divididas: " + "; ".join(big))

    if dry_run:
        for b in ordered:
            body, comments = render_issue(b)
            print("\n" + "-" * 40 + f"\n[{b['id']}] {b['title']}  (corpo {len(body)} car., {len(comments)} comentário(s))")
            print(body if full else "\n".join(body.split("\n")[:14]))
            if full:
                for c in comments:
                    print("\n" + "~" * 20 + "\n" + c)
        print("\n🧪 dry-run: nenhuma issue criada.")
        return True

    gh.setup_repository()
    for item in ordered:
        title = f"[{item['id']}] {item.get('title', '')}"
        body, comments = render_issue(item)
        body_file = _write_tmp(body, "temp_issue_body.md")
        result = _gh(["gh", "issue", "create", "--title", title, "--body-file", body_file, "--label", trigger_label], cfg)
        os.remove(body_file)
        if not result["success"]:
            print(f" ❌ Erro ao criar {item['id']}: {result['stderr']}")
            return False
        url = result["stdout"].strip().splitlines()[-1]
        number = url.rstrip("/").split("/")[-1]
        print(f" [OK] Issue #{number} criada: {title} (depende de {item['depends_on']})")
        for i, c in enumerate(comments, 1):
            cfile = _write_tmp(c, "temp_issue_comment.md")
            res = _gh(["gh", "issue", "comment", number, "--body-file", cfile], cfg)
            os.remove(cfile)
            if not res["success"]:
                print(f" ❌ Erro no comentário {i}/{len(comments)} da issue #{number}: {res['stderr']}")
                return False
        if comments:
            print(f"      + {len(comments)} comentário(s) de continuação")

    print("\n🚀 Issues cadastradas.")
    return True


def _parse_args(argv: List[str]) -> Tuple[Optional[str], Optional[List[str]], Dict[str, bool]]:
    flags = {f: f"--{f.replace('_', '-')}" in argv for f in ("dry_run", "full", "skip_existing", "list")}
    only_ids: Optional[List[str]] = None
    skip = set()
    if "--only" in argv:
        i = argv.index("--only")
        if i + 1 >= len(argv):
            raise SystemExit("--only precisa de uma lista de ids (ex.: --only S02T01,S02T02)")
        only_ids = argv[i + 1].split(",")
        skip.add(i + 1)
    positional = [a for k, a in enumerate(argv) if not a.startswith("--") and k not in skip]
    return (positional[0] if positional else None), only_ids, flags


if __name__ == "__main__":
    file_arg, only_ids, flags = _parse_args(sys.argv[1:])
    if flags["list"]:
        for p in list_backlogs():
            print(os.path.basename(p))
        sys.exit(0)
    if file_arg is None:
        file_arg = choose_backlog()
        if file_arg is None:
            print("Nada a fazer.")
            sys.exit(1)
    ok = seed_github_from_json(file_arg, only_ids, dry_run=flags["dry_run"], full=flags["full"],
                               skip_existing=flags["skip_existing"])
    sys.exit(0 if ok else 1)
