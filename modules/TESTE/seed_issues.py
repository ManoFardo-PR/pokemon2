"""
Cria issues no GitHub a partir de um backlog JSON (modelo de subtask v2),
garantindo dependência obrigatória e ordem de lançamento.

Uso:
    python modules/TESTE/seed_issues.py                              # backlog.json
    python modules/TESTE/seed_issues.py backlog_hello_demo.json      # outro arquivo da pasta TESTE
    python modules/TESTE/seed_issues.py backlog_hello_demo.json --only X03,X04   # só alguns ids
    python modules/TESTE/seed_issues.py backlog_hello_demo.json --dry-run        # valida e mostra, sem criar

Regras de dependência:
- Item sem `depends_on` (chave ausente ou vazia) recebe o id do item anterior na
  ordem do arquivo; o primeiro vira "Nenhuma". `unblocks` é recalculado (inverso)
  e `seq` é a posição na ordem topológica. Tudo é gravado de volta no JSON.
- Ids duplicados, dependência inexistente (nem no JSON nem no GitHub) ou ciclo
  abortam antes de criar qualquer issue.
- As issues são criadas em ordem topológica (números crescem com as dependências).
"""
import sys

if hasattr(sys.stdout, "reconfigure"):  # console Windows em cp1252 quebra com emojis
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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
def _bullets(items: List[str], code: bool = False) -> str:
    if not items:
        return "- (nenhum)"
    return "\n".join(f"- `{i}`" if code else f"- {i}" for i in items)


def generate_markdown_body(data: Dict[str, Any]) -> str:
    """Corpo da issue em Markdown. Os títulos 'Arquivos Alvo' e 'Arquivos para ler', a linha
    'Depende de' e os marcadores <!-- depends_on --> / <!-- seq --> são lidos pelo orquestrador."""
    rules_table = "| ID | Regra de Negócio |\n|---|---|\n"
    for r in data.get("business_rules", []):
        rules_table += f"| {r['id']} | {r['rule']} |\n"

    interfaces = data.get("interfaces", [])
    interfaces_md = "\n".join(f"```\n{i}\n```" for i in interfaces) if interfaces else "- (a definir pelo planejador)"
    deps = data.get("depends_on") or ROOT
    seq = data.get("seq", "")

    return f"""# {data.get('title', 'Sem Título')}

| Campo | Valor |
|---|---|
| Estágio | {data.get('stage', 'Geral')} |
| ID Tarefa | {data.get('id', 'N/A')} |
| Depende de | {deps} |
| Desbloqueia | {data.get('unblocks', 'Nenhum')} |
| Ordem de lançamento | {seq} |

<!-- depends_on: {deps} -->
<!-- seq: {seq} -->

## 🎯 Objetivo
{data.get('objective', '')}

## 🔍 Contexto
{data.get('context', '')}

## 📥 Entradas (Inputs)
{_bullets(data.get('inputs', []))}

## 📤 Saídas Esperadas (Outputs)
{_bullets(data.get('outputs', []))}

## 🔌 Interfaces (assinaturas exatas; copiar, não reinterpretar)
{interfaces_md}

## ⚙️ Regras de Negócio
{rules_table}
## 🧪 Cenários de teste (opcional; se presentes, o planejador copia)
{_bullets(data.get('test_scenarios', []))}

## ✅ Critérios de aceite (done_when)
{_bullets(data.get('done_when', []))}

## 📖 Arquivos para ler primeiro (o planejador começa por estes)
{_bullets(data.get('read_files', []), code=True)}

## 📁 Arquivos Alvo a Criar/Editar
{_bullets(data.get('target_files', []), code=True)}
"""


# ----------------------------------------------------------------------
# Execução
# ----------------------------------------------------------------------
def seed_github_from_json(json_filename: str = "backlog.json", only: Optional[List[str]] = None,
                          dry_run: bool = False) -> bool:
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
        print(f"⚠️  já existem no GitHub (serão criadas de novo se você continuar): {already}")

    print("   sequência de lançamento: " + " → ".join(f"{b['id']}(seq {b['seq']}, dep {b['depends_on']})" for b in ordered))
    if dry_run:
        for b in ordered:
            print("\n" + "-" * 40 + f"\n[{b['id']}] {b['title']}\n" + "\n".join(generate_markdown_body(b).split("\n")[:12]))
        print("\n🧪 dry-run: nenhuma issue criada.")
        return True

    gh.setup_repository()
    for item in ordered:
        title = f"[{item['id']}] {item.get('title', '')}"
        body_file = os.path.join(MODULES_DIR, "logs", "tmp", "temp_issue_body.md")
        os.makedirs(os.path.dirname(body_file), exist_ok=True)
        with open(body_file, "w", encoding="utf-8") as f:
            f.write(generate_markdown_body(item))
        cmd = ["gh", "issue", "create", "--title", title, "--body-file", body_file, "--label", trigger_label]
        if cfg.get("github_repo"):
            cmd += ["-R", cfg["github_repo"]]
        result = run_terminal_command(cmd, cwd=cfg["repo_root"])
        os.remove(body_file)
        if result["success"]:
            print(f" [OK] Issue #{result['stdout'].split('/')[-1]} criada: {title} (depende de {item['depends_on']})")
        else:
            print(f" ❌ Erro ao criar {item['id']}: {result['stderr']}")
            return False

    print("\n🚀 Issues cadastradas.")
    return True


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only_ids: Optional[List[str]] = None
    if "--only" in sys.argv:
        only_ids = sys.argv[sys.argv.index("--only") + 1].split(",")
        args = [a for a in args if a != sys.argv[sys.argv.index("--only") + 1]]
    ok = seed_github_from_json(args[0] if args else "backlog.json", only_ids, dry_run="--dry-run" in sys.argv)
    sys.exit(0 if ok else 1)
