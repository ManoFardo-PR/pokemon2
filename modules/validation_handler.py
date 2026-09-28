import subprocess
import sys
from typing import Any, Dict, List, Optional, Union


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


class ValidationHandler:
    def __init__(
        self,
        test_cmd: str = "python -m unittest discover",
        typecheck_cmd: str = "python -m compileall -q .",
        cwd: Optional[str] = None,
    ):
        self.test_cmd = test_cmd
        self.typecheck_cmd = typecheck_cmd
        self.cwd = cwd

    def run_tests(self) -> Dict[str, Any]:
        """Executa a suíte de testes do projeto local."""
        return run_terminal_command(self.test_cmd, timeout=180, cwd=self.cwd)

    def check_compilation(self) -> Dict[str, Any]:
        """Valida compilação/tipagem do código (para Python: compileall)."""
        return run_terminal_command(self.typecheck_cmd, timeout=120, cwd=self.cwd)

    def analyze_errors(
        self,
        test_result: Optional[Dict[str, Any]],
        compilation_result: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Consolida os logs de erro em Markdown para retroalimentar a IA."""
        error_report = []

        if compilation_result and not compilation_result["success"]:
            comp_err = compilation_result["stderr"] or compilation_result["stdout"]
            error_report.append("### ERROS DE COMPILAÇÃO / CHECAGEM DE TIPOS")
            error_report.append(f"```text\n{comp_err[-1500:]}\n```")

        if test_result and not test_result["success"]:
            test_err = test_result["stderr"] or test_result["stdout"]
            error_report.append("### ERROS DE EXECUÇÃO DE TESTE")
            error_report.append(f"```text\n{test_err[-2500:]}\n```")

        if not error_report:
            return "Nenhum erro detectado no ambiente local."

        return "\n\n".join(error_report)
