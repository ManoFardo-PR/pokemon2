"""
Interface com a Continue CLI (`cn`) em modo headless.

Decisões (ver plano de 25/09/2026):
- O prompt vai por STDIN (`echo ... | cn -p`), nunca na linha de comando:
  evita o limite de ~8 KB do cmd.exe e preserva quebras de linha/aspas.
  (`--prompt <arquivo>` foi testado e a CLI 1.5.47 não o aceita como prompt.)
- No Windows a CLI costuma abortar na saída (assert do libuv) DEPOIS de
  imprimir a resposta inteira; por isso o sucesso é julgado pelo stdout.
- Sem `shell=True`: argumentos em lista, executável resolvido com shutil.which.
- `--readonly`: as ferramentas da CLI não podem gravar arquivos; quem grava
  é o orquestrador, a partir dos blocos `### FILE:` / `### PATCH:` da resposta.
- `--model` NÃO é usado (na CLI ele adiciona um modelo do hub, não seleciona
  um do config.yaml). Um único modelo para todos os estágios; `model_type`
  fica na assinatura por compatibilidade com o documento, mas é ignorado.

Contrato de resposta (ver PROMPT/PROMPT_02.MD e PROMPT_03.MD):

    ### FILE: caminho/novo.py
    ```python
    ...conteúdo completo...
    ```

    ### PATCH: caminho/existente.py
    <<<<<<< SEARCH
    trecho exato atual
    =======
    trecho novo
    >>>>>>> REPLACE
"""
import json
import os
import re
import shutil
import subprocess
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

MODULES_DIR = os.path.dirname(os.path.abspath(__file__))
CN_LOG_DIR = os.path.expanduser(os.path.join("~", ".continue", "logs"))

# Linhas de rotina do cn.log que não dizem nada sobre a tarefa (ruído de serviço).
_TRACE_NOISE = ("Received chunk", "state updated", "Context usage check",
                "Service", "service", "Indexed ", "FileIndexService")
_REASONING_RE = re.compile(r'"reasoning":"((?:[^"\\]|\\.)*)"')

HEADER_RE = re.compile(r"^#{0,4}[ \t]*(FILE|PATCH):[ \t]*`?([^`\n]+?)`?[ \t]*$", re.MULTILINE)
FENCE_RE = re.compile(
    r"\A(?:[ \t]*\n)*[ \t]*```[a-zA-Z0-9_+-]*[ \t]*\n(.*?)^[ \t]*```[ \t]*$",
    re.DOTALL | re.MULTILINE,
)
EDIT_RE = re.compile(
    r"^<{7} SEARCH[ \t]*\n(.*?)^={7}[ \t]*\n(.*?)^>{7} REPLACE[ \t]*$",
    re.DOTALL | re.MULTILINE,
)


def _strip_one_newline(s: str) -> str:
    return s[:-1] if s.endswith("\n") else s


class ContinueCLIHandler:
    def __init__(
        self,
        cli_path: str = "npx @continuedev/cli",
        config_path: Optional[str] = None,
        timeout_sec: int = 300,
        retries: int = 1,
        retry_wait_sec: int = 15,
        on_event: Optional[Callable[[str, str, str], None]] = None,
        max_sec: int = 3600,
        poll_sec: float = 2.0,
    ):
        self.cli_args = self._resolve_cli(cli_path)
        self.config_path = config_path
        # timeout_sec conta a partir da ÚLTIMA atividade observada da CLI
        # (crescimento do cn.log ou bytes em stdout/stderr), não do início da
        # chamada; max_sec é o teto absoluto de segurança.
        self.timeout_sec = timeout_sec
        self.max_sec = max(int(max_sec), int(timeout_sec))
        self.poll_sec = max(0.5, float(poll_sec))
        self.retries = max(0, int(retries))
        self.retry_wait_sec = max(0, int(retry_wait_sec))
        self.on_event = on_event

    @staticmethod
    def _resolve_cli(cli_path: str) -> List[str]:
        """Transforma 'npx @continuedev/cli' em [caminho absoluto do npx, '@continuedev/cli']."""
        parts = cli_path.split()
        exe = shutil.which(parts[0])
        if not exe:
            raise FileNotFoundError(
                f"Executável '{parts[0]}' não encontrado no PATH (continue_cli_path='{cli_path}')."
            )
        return [exe] + parts[1:]

    # ------------------------------------------------------------------
    # Trilha interna da CLI (~/.continue/logs/cn.log, escrita com --verbose)
    # ------------------------------------------------------------------
    @staticmethod
    def _cn_current_log() -> str:
        """O cn*.log mais recente: a CLI rotaciona a 10MB (cn.log, cn1.log, ...)."""
        try:
            candidates = [os.path.join(CN_LOG_DIR, n) for n in os.listdir(CN_LOG_DIR)
                          if re.fullmatch(r"cn\d*\.log", n)]
            return max(candidates, key=os.path.getmtime) if candidates else ""
        except OSError:
            return ""

    @staticmethod
    def _log_size(path: str) -> int:
        try:
            return os.path.getsize(path) if path else 0
        except OSError:
            return 0

    @staticmethod
    def _log_delta(path: str, offset: int) -> Tuple[str, int]:
        """(texto novo de `path` desde `offset`, novo offset); do zero se truncado."""
        if not path:
            return "", offset
        try:
            start = offset if os.path.getsize(path) >= offset else 0
            with open(path, "rb") as f:
                f.seek(start)
                data = f.read()
            return data.decode("utf-8", errors="replace"), start + len(data)
        except OSError:
            return "", offset

    @staticmethod
    def _digest_trace(trace: str) -> Tuple[str, str]:
        """(pensamento do modelo, trilha de atividade) a partir do delta do cn.log.

        - pensamento: fragmentos `"reasoning":"..."` dos chunks, concatenados;
        - trilha: linhas do log sem o ruído de rotina (chunks, serviços, índice),
          preservando chamadas de ferramenta, erros e avisos.
        """
        thinking_parts = []
        for frag in _REASONING_RE.findall(trace):
            try:
                thinking_parts.append(json.loads(f'"{frag}"'))
            except ValueError:
                thinking_parts.append(frag)
        lines = [l for l in trace.splitlines()
                 if l.strip() and not any(n in l for n in _TRACE_NOISE)]
        return "".join(thinking_parts), "\n".join(lines)

    @staticmethod
    def _clean_stderr(stderr: str) -> str:
        """Stderr sem os avisos de rotina do npm."""
        return "\n".join(l for l in (stderr or "").splitlines()
                         if l.strip() and not l.startswith("npm warn")).strip()

    def _emit_live(self, attempt: int, delta: str) -> None:
        """Publica na trilha viva o que a CLI fez neste intervalo de polling."""
        if not (delta and self.on_event):
            return
        thinking, trace = self._digest_trace(delta)
        if thinking.strip():
            self.on_event("LLM_THINKING", f"tentativa {attempt}", thinking[:8000])
        if trace.strip():
            self.on_event("LLM_TRACE", f"tentativa {attempt}", trace[:6000])

    @staticmethod
    def _kill_tree(proc: "subprocess.Popen") -> None:
        """Encerra o processo e seus filhos (npx -> node -> shells de ferramenta)."""
        try:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                               capture_output=True, timeout=15)
            proc.kill()
        except OSError:
            pass

    def _run_cli_streaming(self, cmd: List[str], env: Dict[str, str], prompt: str,
                           attempt: int) -> Dict[str, Any]:
        """
        Roda a CLI acompanhando o cn.log em tempo real: a cada `poll_sec` o
        delta vira eventos LLM_THINKING/LLM_TRACE, e o relógio de inatividade
        zera sempre que a CLI dá sinal de vida (cn.log, stdout ou stderr).
        Mata o processo após `timeout_sec` sem atividade ou `max_sec` no total.
        """
        stdout_parts: List[str] = []
        stderr_parts: List[str] = []
        last_activity = [time.time()]

        try:
            proc = subprocess.Popen(cmd, cwd=MODULES_DIR, env=env,
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, text=True,
                                    encoding="utf-8", errors="replace")
        except OSError as e:
            return {"stdout": "", "stderr": f"falha ao iniciar a CLI: {e}", "exit_code": -1, "success": False}

        def _feed() -> None:
            try:
                proc.stdin.write(prompt)
                proc.stdin.close()
            except OSError:
                pass

        def _pump(stream: Any, sink: List[str]) -> None:
            for chunk in iter(lambda: stream.read(4096), ""):
                sink.append(chunk)
                last_activity[0] = time.time()
            stream.close()

        threads = [threading.Thread(target=_feed, daemon=True),
                   threading.Thread(target=_pump, args=(proc.stdout, stdout_parts), daemon=True),
                   threading.Thread(target=_pump, args=(proc.stderr, stderr_parts), daemon=True)]
        for t in threads:
            t.start()

        started = time.time()
        log_path = self._cn_current_log()
        offset = self._log_size(log_path)
        # Tamanhos no início da chamada: ao trocar de arquivo (rotação a 10MB),
        # retoma do tamanho antigo para não reapresentar conteúdo anterior.
        try:
            sizes0 = {os.path.join(CN_LOG_DIR, n): self._log_size(os.path.join(CN_LOG_DIR, n))
                      for n in os.listdir(CN_LOG_DIR) if re.fullmatch(r"cn\d*\.log", n)}
        except OSError:
            sizes0 = {}

        def _drain() -> str:
            """Delta do log atual, seguindo a rotação (cn.log -> cn1.log -> ...)."""
            nonlocal log_path, offset
            delta, offset = self._log_delta(log_path, offset)
            newest = self._cn_current_log()
            if newest and newest != log_path:  # rotacionou: termina o antigo, segue o novo
                log_path, offset = newest, sizes0.get(newest, 0)
                more, offset = self._log_delta(log_path, offset)
                delta += more
            return delta

        timeout_msg = ""
        while proc.poll() is None:
            time.sleep(self.poll_sec)
            delta = _drain()
            if delta:
                last_activity[0] = time.time()
                self._emit_live(attempt, delta)
            idle = time.time() - last_activity[0]
            if idle > self.timeout_sec:
                timeout_msg = (f"Erro: CLI sem atividade há {int(idle)}s "
                               f"(limite {self.timeout_sec}s); processo encerrado.")
            elif time.time() - started > self.max_sec:
                timeout_msg = (f"Erro: CLI excedeu o teto absoluto de {self.max_sec}s; "
                               "processo encerrado.")
            if timeout_msg:
                self._kill_tree(proc)
                break

        proc.wait()
        for t in threads[1:]:
            t.join(timeout=5)
        self._emit_live(attempt, _drain())  # o que sobrou após o fim

        stderr = ("".join(stderr_parts) + ("\n" + timeout_msg if timeout_msg else "")).strip()
        exit_code = -1 if timeout_msg else proc.returncode
        return {"stdout": "".join(stdout_parts).strip(), "stderr": stderr,
                "exit_code": exit_code, "success": exit_code == 0}

    def execute_prompt(self, prompt: str, model_type: str = "strong") -> Dict[str, Any]:
        """
        Envia o prompt à CLI (por stdin) e devolve
        {'raw_response', 'success', 'error', 'elapsed', 'exit_code', 'attempts'}.
        Resposta vazia ou timeout: repete até `retries` vezes com espera.
        `model_type` é aceito (assinatura do documento) mas ignorado: um único modelo.
        """
        del model_type  # decisão do usuário: um só modelo para todos os estágios

        # --verbose faz a CLI escrever a trilha interna (pensamento, ferramentas,
        # chunks, erros) em ~/.continue/logs/cn.log; lemos o delta a cada tentativa.
        # --exclude Bash: a ferramenta Bash da CLI roda via perfil interativo do
        # PowerShell e pode travar para sempre (visto em 28/09: `git ls-files ..`
        # preso em "calling" até o timeout); Read/List/Fetch bastam para explorar.
        # (obrigatório --exclude=Bash em um único argumento: separado, a CLI o
        # confunde com o prompt posicional e ignora o stdin.)
        cmd = self.cli_args + ["-p", "--silent", "--readonly", "--verbose", "--exclude=Bash"]
        if self.config_path:
            cmd += ["--config", self.config_path]

        env = os.environ.copy()
        env["CI"] = "true"

        started = time.time()
        err = ""
        exit_code = -1
        for attempt in range(1, self.retries + 2):
            print(f"\n🤖 [Continue CLI] Enviando prompt ({len(prompt)} caracteres) via stdin"
                  + (f" (tentativa {attempt})" if attempt > 1 else "") + "...")
            if self.on_event:
                self.on_event("LLM_CALL", f"tentativa {attempt}", " ".join(cmd))
            # A trilha interna (pensamento, ferramentas, erros) é publicada AO VIVO
            # durante a chamada por _run_cli_streaming; aqui só resta o stderr.
            result = self._run_cli_streaming(cmd, env, prompt, attempt)
            output = result["stdout"].strip()
            exit_code = result["exit_code"]

            stderr_clean = self._clean_stderr(result["stderr"])
            if self.on_event and stderr_clean:
                self.on_event("LLM_STDERR", f"tentativa {attempt} (exit {exit_code})", stderr_clean[:8000])

            if output:
                if not result["success"]:
                    # Assert do libuv no Windows depois da resposta completa: seguimos com aviso.
                    print(f"   ⚠️ CLI saiu com exit {exit_code} mas devolveu resposta; prosseguindo.")
                print(f"   📥 Resposta recebida ({len(output)} caracteres)")
                return {"raw_response": output, "success": True, "error": "",
                        "elapsed": round(time.time() - started, 1), "exit_code": exit_code, "attempts": attempt}

            err = stderr_clean or result["stderr"] or f"exit code {exit_code}"
            print(f"   ❌ CLI sem resposta (exit {exit_code}): {err[:300]}")
            if self.on_event:
                self.on_event("LLM_ERROR", f"tentativa {attempt}: sem resposta (exit {exit_code})", err[:4000])
            if attempt <= self.retries:
                print(f"   ⏳ aguardando {self.retry_wait_sec}s antes de repetir...")
                time.sleep(self.retry_wait_sec)

        return {"raw_response": "", "success": False, "error": err,
                "elapsed": round(time.time() - started, 1), "exit_code": exit_code, "attempts": self.retries + 1}

    # ------------------------------------------------------------------
    # Parsing
    # ------------------------------------------------------------------
    @staticmethod
    def parse_blocks(raw_output: str) -> List[Dict[str, Any]]:
        """
        Extrai blocos `### FILE:` e `### PATCH:` na ordem de aparição.
        FILE  -> {'kind': 'file',  'path': ..., 'code': '...\\n'}
        PATCH -> {'kind': 'patch', 'path': ..., 'edits': [{'search', 'replace'}, ...]}
        Um FILE sem cerca de código, ou um PATCH sem edições, é devolvido com
        'error' preenchido para virar feedback.
        """
        headers = list(HEADER_RE.finditer(raw_output))
        blocks: List[Dict[str, Any]] = []
        for i, h in enumerate(headers):
            kind = h.group(1).lower()
            path = h.group(2).strip().strip("`").strip().replace("\\", "/")
            seg_start = h.end()
            seg_end = headers[i + 1].start() if i + 1 < len(headers) else len(raw_output)
            segment = raw_output[seg_start:seg_end]
            if not path:
                continue
            if kind == "file":
                m = FENCE_RE.search(segment)
                if not m:
                    blocks.append({"kind": "file", "path": path, "code": "", "error": "FILE sem bloco de código cercado logo após o cabeçalho"})
                    continue
                blocks.append({"kind": "file", "path": path, "code": m.group(1).rstrip("\n") + "\n"})
            else:
                edits = [{"search": _strip_one_newline(s), "replace": _strip_one_newline(r)}
                         for s, r in EDIT_RE.findall(segment)]
                if not edits:
                    blocks.append({"kind": "patch", "path": path, "edits": [], "error": "PATCH sem blocos <<<<<<< SEARCH / ======= / >>>>>>> REPLACE"})
                    continue
                blocks.append({"kind": "patch", "path": path, "edits": edits})
        return blocks

    @classmethod
    def parse_files(cls, raw_output: str) -> List[Dict[str, str]]:
        """Compatibilidade: só os blocos FILE válidos, como [{'path', 'code'}]."""
        return [{"path": b["path"], "code": b["code"]}
                for b in cls.parse_blocks(raw_output) if b["kind"] == "file" and not b.get("error")]

    def parse_response(self, raw_output: str) -> Dict[str, Any]:
        """Compatibilidade com o documento: {'type': 'files'|'text', 'data': ...}."""
        blocks = self.parse_blocks(raw_output)
        if blocks:
            return {"type": "files", "data": blocks}
        return {"type": "text", "data": raw_output}

    @staticmethod
    def extract_verdict(raw_output: str, kind: str = "audit") -> Optional[str]:
        """
        Último 'VERDICT: ...' da resposta.
        kind='audit' -> 'OK' | 'NOT OK' | None
        kind='gate'  -> 'CORRECT' | 'REWORK' | None
        """
        if kind == "gate":
            pat = r"VERDICT\s*:\s*\**\s*(REWORK|CORRECT)\b"
        else:
            pat = r"VERDICT\s*:\s*\**\s*(NOT\s+OK|OK)\b"
        matches = re.findall(pat, raw_output, re.IGNORECASE)
        if not matches:
            return None
        last = re.sub(r"\s+", " ", matches[-1].upper())
        return last
