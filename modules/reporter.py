"""
Trilha viva do orquestrador: grava cada evento em modules/logs/live.log
(formato legível e parseável) e imprime um resumo no console.

Formato de um evento no arquivo:

    ==== 11:52:25 | X01 | LLM_PROMPT | stage1_r1 | chars=3318 ====
    ...corpo completo (pode ser vazio)...
    ==== END LLM_PROMPT ====

`monitor.py` segue esse arquivo em outro terminal. O reporter não substitui
logs/<task>/ nem os .log.md: é a ordem cronológica de tudo que aconteceu.
"""
import os
import threading
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional

KINDS = (
    "TASK_START", "TASK_END", "LLM_PROMPT", "LLM_WAIT", "LLM_RESPONSE", "LLM_ERROR",
    "CHECKS", "GATE", "FILE_WRITE", "FILE_SKIP", "FILE_REJECT", "LOCAL_VALIDATION",
    "AUDIT", "GIT", "GITHUB", "WARN", "INFO",
)

HEADER_PREFIX = "==== "
HEADER_SUFFIX = " ===="


def format_header(ts: str, task: str, kind: str, title: str, meta: Optional[Dict[str, Any]] = None) -> str:
    parts = [ts, task or "-", kind, title.replace("\n", " ").strip() or "-"]
    if meta:
        parts.append(" ".join(f"{k}={v}" for k, v in meta.items()))
    return HEADER_PREFIX + " | ".join(parts) + HEADER_SUFFIX


class Reporter:
    def __init__(self, live_path: str, verbose: bool = False, max_mb: float = 20):
        self.live_path = live_path
        self.verbose = verbose
        self.max_bytes = int(max_mb * 1024 * 1024)
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(live_path) or ".", exist_ok=True)

    # ------------------------------------------------------------------
    def _rotate_if_needed(self) -> None:
        try:
            if os.path.getsize(self.live_path) > self.max_bytes:
                backup = self.live_path.replace(".log", ".1.log") if self.live_path.endswith(".log") else self.live_path + ".1"
                if os.path.exists(backup):
                    os.remove(backup)
                os.replace(self.live_path, backup)
        except OSError:
            pass

    def event(self, kind: str, task: str, title: str, body: str = "", meta: Optional[Dict[str, Any]] = None) -> None:
        ts = time.strftime("%H:%M:%S")
        header = format_header(ts, task, kind, title, meta)
        block = header + "\n" + (body.rstrip("\n") + "\n" if body else "") + f"{HEADER_PREFIX}END {kind}{HEADER_SUFFIX}\n"
        with self._lock:
            self._rotate_if_needed()
            with open(self.live_path, "a", encoding="utf-8", errors="replace") as f:
                f.write(block)
                f.flush()
        size = f" ({len(body)} chars)" if body else ""
        line = f"[{ts}] {kind:<16} {task or '-':<6} {title}{size}"
        if meta:
            line += "  " + " ".join(f"{k}={v}" for k, v in meta.items())
        print(line, flush=True)
        if self.verbose and body:
            print("    " + body.rstrip("\n").replace("\n", "\n    "), flush=True)

    # ------------------------------------------------------------------
    @contextmanager
    def waiting(self, task: str, title: str, interval: int = 15) -> Iterator[None]:
        """Emite LLM_WAIT a cada `interval` segundos enquanto a CLI roda."""
        stop = threading.Event()
        start = time.time()

        def beat() -> None:
            while not stop.wait(interval):
                self.event("LLM_WAIT", task, title, meta={"elapsed": f"{int(time.time() - start)}s"})

        t = threading.Thread(target=beat, daemon=True)
        t.start()
        try:
            yield
        finally:
            stop.set()
            t.join(timeout=1)


class NullReporter(Reporter):
    """Reporter que não grava nada (PoCs e testes)."""

    def __init__(self) -> None:  # noqa: D107
        self.verbose = False
        self._lock = threading.Lock()

    def event(self, kind: str, task: str, title: str, body: str = "", meta: Optional[Dict[str, Any]] = None) -> None:
        return None
