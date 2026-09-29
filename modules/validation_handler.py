import os
import subprocess
from typing import Any, Dict, List, Optional, Sequence, Union

from checks import diag_tail, scoped_command


def run_terminal_command(
    command: Union[str, List[str]],
    timeout: int = 60,
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
    input_text: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executa um comando no terminal de forma síncrona e autônoma.

    - `command` como string: roda via shell (útil para gh/git simples).
    - `command` como lista: roda sem shell (sem limite do cmd.exe e sem
      reinterpretação de aspas), indicado para argumentos longos ou com
      caracteres especiais.
    - `stdin` é fechado para nenhum processo ficar esperando teclado/TUI,
      salvo quando `input_text` é informado (enviado por pipe e fechado).
    """
    use_shell = isinstance(command, str)
    try:
        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            shell=use_shell,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
            stdin=None if input_text is not None else subprocess.DEVNULL,
            input=input_text,
            cwd=cwd,
            env=env,
        )
        return {
            "stdout": process.stdout.strip(),
            "stderr": process.stderr.strip(),
            "exit_code": process.returncode,
            "success": process.returncode == 0,
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"Erro: o comando excedeu o tempo limite de {timeout}s.",
            "exit_code": -1,
            "success": False,
        }
    except Exception as e:  # noqa: BLE001 - queremos capturar tudo e devolver estruturado
        return {
            "stdout": "",
            "stderr": f"Erro inesperado ao executar o comando: {e}",
            "exit_code": -1,
            "success": False,
        }


def quiet_env() -> Dict[str, str]:
    """
    Environment for validation commands: no colour codes. `CI` is deliberately NOT set:
    on 2026-09-29 `CI=true` made typescript-eslint's project service reject the fixture
    written by scripts/lint-config.spec.ts, turning a green tree red.
    """
    env = os.environ.copy()
    env.update({"NO_COLOR": "1", "FORCE_COLOR": "0"})
    return env


class ValidationHandler:
    def __init__(
        self,
        test_cmd: str = "python -m unittest discover",
        typecheck_cmd: str = "python -m compileall -q .",
        cwd: Optional[str] = None,
        check_cmd: Optional[str] = None,
        test_timeout: int = 600,
        typecheck_timeout: int = 300,
    ):
        self.test_cmd = test_cmd
        self.typecheck_cmd = typecheck_cmd
        self.check_cmd = check_cmd or None
        self.cwd = cwd
        self.test_timeout = int(test_timeout)
        self.typecheck_timeout = int(typecheck_timeout)

    def run_tests(self, paths: Optional[Sequence[str]] = None) -> Dict[str, Any]:
        """Runs the test suite; with `paths`, only those test files (appended to the command)."""
        cmd = scoped_command(self.test_cmd, paths)
        res = run_terminal_command(cmd, timeout=self.test_timeout, cwd=self.cwd, env=quiet_env())
        res["command"] = cmd
        return res

    def check_compilation(self) -> Dict[str, Any]:
        """Valida compilação/tipagem do código."""
        res = run_terminal_command(self.typecheck_cmd, timeout=self.typecheck_timeout, cwd=self.cwd, env=quiet_env())
        res["command"] = self.typecheck_cmd
        return res

    def run_check(self) -> Dict[str, Any]:
        """The project's full gate (`check_command`), when configured."""
        if not self.check_cmd:
            return {"stdout": "", "stderr": "", "exit_code": 0, "success": True, "skipped": True, "command": ""}
        res = run_terminal_command(self.check_cmd, timeout=self.test_timeout * 2, cwd=self.cwd, env=quiet_env())
        res["command"] = self.check_cmd
        return res

    def analyze_errors(
        self,
        test_result: Optional[Dict[str, Any]],
        compilation_result: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Consolida os logs de erro em Markdown para retroalimentar a IA (diagnostics first, no ANSI)."""
        error_report = []

        if compilation_result and not compilation_result["success"]:
            error_report.append("### ERROS DE COMPILAÇÃO / CHECAGEM DE TIPOS")
            error_report.append("```text\n" + diag_tail(compilation_result["stdout"], compilation_result["stderr"], 1500) + "\n```")

        if test_result and not test_result["success"]:
            error_report.append("### ERROS DE EXECUÇÃO DE TESTE")
            error_report.append("```text\n" + diag_tail(test_result["stdout"], test_result["stderr"], 2500) + "\n```")

        if not error_report:
            return "Nenhum erro detectado no ambiente local."

        return "\n\n".join(error_report)
