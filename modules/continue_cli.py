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
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from validation_handler import run_terminal_command

MODULES_DIR = os.path.dirname(os.path.abspath(__file__))
CN_LOG_PATH = os.path.expanduser(os.path.join("~", ".continue", "logs", "cn.log"))

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
    ):
        self.cli_args = self._resolve_cli(cli_path)
        self.config_path = config_path
        self.timeout_sec = timeout_sec
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
    def _cn_log_offset() -> int:
        try:
            return os.path.getsize(CN_LOG_PATH)
        except OSError:
            return 0

    @staticmethod
    def _cn_log_delta(offset: int) -> str:
        """Bytes novos do cn.log desde `offset` (0 se o arquivo foi rotacionado)."""
        try:
            size = os.path.getsize(CN_LOG_PATH)
            with open(CN_LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
                f.seek(offset if size >= offset else 0)
                return f.read()
        except OSError:
            return ""

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
        cmd = self.cli_args + ["-p", "--silent", "--readonly", "--verbose"]
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
            log_offset = self._cn_log_offset()
            result = run_terminal_command(cmd, timeout=self.timeout_sec, cwd=MODULES_DIR, env=env, input_text=prompt)
            output = result["stdout"].strip()
            exit_code = result["exit_code"]

            # Tudo que a CLI fez internamente vai para a trilha viva, com ou sem sucesso.
            thinking, trace = self._digest_trace(self._cn_log_delta(log_offset))
            stderr_clean = self._clean_stderr(result["stderr"])
            if self.on_event:
                if thinking:
                    self.on_event("LLM_THINKING", f"tentativa {attempt}", thinking[:30000])
                if trace:
                    self.on_event("LLM_TRACE", f"tentativa {attempt}", trace[:20000])
                if stderr_clean:
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
