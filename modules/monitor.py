"""
Monitor ao vivo do orquestrador: segue modules/logs/live.log como `tail -f`,
com cores por tipo de evento e filtros. Rode em um segundo terminal:

    python modules/monitor.py                       # a partir de agora
    python modules/monitor.py --from-start          # desde o início do arquivo
    python modules/monitor.py --only GATE,FILE_WRITE,LLM_RESPONSE
    python modules/monitor.py --task X01 --no-body  # só cabeçalhos da task X01
    python modules/monitor.py --max-lines 20        # trunca corpos longos

Sem dependências externas. Cores ANSI (habilitadas no Windows).
"""
import sys

if hasattr(sys.stdout, "reconfigure"):  # console Windows em cp1252 quebra com emojis
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import argparse
import os
import time
from typing import Iterator, List, Optional, Tuple

MODULES_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_FILE = os.path.join(MODULES_DIR, "logs", "live.log")

RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
COLORS = {
    "TASK_START": "\033[1;97;44m", "TASK_END": "\033[1;97;42m",
    "LLM_PROMPT": "\033[36m", "LLM_WAIT": "\033[2;36m", "LLM_RESPONSE": "\033[96m", "LLM_ERROR": "\033[1;31m",
    "LLM_CALL": "\033[2;36m", "LLM_THINKING": "\033[95m", "LLM_TRACE": "\033[2;37m", "LLM_STDERR": "\033[33m",
    "CHECKS": "\033[33m", "GATE": "\033[1;35m", "AUDIT": "\033[1;35m",
    "FILE_WRITE": "\033[32m", "FILE_SKIP": "\033[2;32m", "FILE_REJECT": "\033[31m",
    "LOCAL_VALIDATION": "\033[33m", "GIT": "\033[34m", "GITHUB": "\033[94m",
    "WARN": "\033[1;33m", "INFO": "\033[37m",
}


def parse_header(line: str) -> Optional[Tuple[str, str, str, str, str]]:
    """'==== ts | task | KIND | title | meta ====' -> (ts, task, kind, title, meta) ou None."""
    if not (line.startswith("==== ") and line.rstrip("\n").endswith(" ====")) or line.startswith("==== END "):
        return None
    inner = line.rstrip("\n")[5:-5]
    parts = [p.strip() for p in inner.split(" | ")]
    if len(parts) < 4:
        return None
    ts, task, kind, title = parts[0], parts[1], parts[2], parts[3]
    meta = parts[4] if len(parts) > 4 else ""
    return ts, task, kind, title, meta


def is_end(line: str) -> bool:
    return line.startswith("==== END ") and line.rstrip("\n").endswith(" ====")


def events_from_lines(lines: Iterator[str]):
    """Gera (header_tuple, body_lines) a partir de linhas do live.log."""
    header, body = None, []
    for line in lines:
        h = parse_header(line)
        if h:
            header, body = h, []
            continue
        if header and is_end(line):
            yield header, body
            header, body = None, []
            continue
        if header:
            body.append(line.rstrip("\n"))


def follow(path: str, from_start: bool) -> Iterator[str]:
    """Segue o arquivo; reabre se ele for rotacionado/truncado."""
    while not os.path.exists(path):
        time.sleep(0.5)
    f = open(path, "r", encoding="utf-8", errors="replace")
    if not from_start:
        f.seek(0, os.SEEK_END)
    pos = f.tell()
    while True:
        line = f.readline()
        if line:
            if not line.endswith("\n"):
                # linha parcial: espera completar
                f.seek(pos)
                time.sleep(0.2)
                continue
            pos = f.tell()
            yield line
            continue
        time.sleep(0.5)
        try:
            if os.path.getsize(path) < pos:  # rotação ou truncamento
                f.close()
                f = open(path, "r", encoding="utf-8", errors="replace")
                pos = 0
        except OSError:
            pass


def render(header: Tuple[str, str, str, str, str], body: List[str], no_body: bool, max_lines: int, color: bool) -> str:
    ts, task, kind, title, meta = header
    c = COLORS.get(kind, "") if color else ""
    r = RESET if color else ""
    b = BOLD if color else ""
    d = DIM if color else ""
    out = f"{c}{b}[{ts}] {kind:<16}{r} {c}{task:<6}{r} {title}" + (f"  {d}{meta}{r}" if meta else "")
    if body and not no_body:
        shown = body[:max_lines] if max_lines > 0 else body
        out += "\n" + "\n".join(f"{d}    │{r} {l}" for l in shown)
        if max_lines > 0 and len(body) > max_lines:
            out += f"\n{d}    │ ... +{len(body) - max_lines} linhas{r}"
    return out


def main(argv: List[str]) -> None:
    ap = argparse.ArgumentParser(description="Monitor ao vivo do Orquestrador TDD")
    ap.add_argument("--file", default=DEFAULT_FILE)
    ap.add_argument("--from-start", action="store_true", help="lê desde o início do arquivo")
    ap.add_argument("--only", default="", help="tipos de evento, separados por vírgula (ex.: GATE,FILE_WRITE)")
    ap.add_argument("--task", default="", help="só eventos desta task (ex.: X01)")
    ap.add_argument("--no-body", action="store_true", help="só cabeçalhos")
    ap.add_argument("--max-lines", type=int, default=40, help="linhas de corpo por evento (0 = todas)")
    ap.add_argument("--no-color", action="store_true")
    ap.add_argument("--once", action="store_true", help="imprime o que existe e sai (implica --from-start)")
    args = ap.parse_args(argv)

    color = not args.no_color and sys.stdout.isatty()
    if color and os.name == "nt":
        os.system("")  # habilita sequências VT no console do Windows
    only = {k.strip().upper() for k in args.only.split(",") if k.strip()}
    task = args.task.strip().upper()

    def wanted(h: Tuple[str, str, str, str, str]) -> bool:
        return (not only or h[2] in only) and (not task or h[1].upper() == task)

    if args.once:
        with open(args.file, "r", encoding="utf-8", errors="replace") as f:
            for h, body in events_from_lines(iter(f.readlines())):
                if wanted(h):
                    print(render(h, body, args.no_body, args.max_lines, color))
        return

    print(f"{DIM if color else ''}monitorando {args.file} (Ctrl+C para sair){RESET if color else ''}", flush=True)
    try:
        for h, body in events_from_lines(follow(args.file, args.from_start)):
            if wanted(h):
                print(render(h, body, args.no_body, args.max_lines, color), flush=True)
    except KeyboardInterrupt:
        print("\nmonitor encerrado.")


if __name__ == "__main__":
    main(sys.argv[1:])
