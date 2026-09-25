import subprocess
import shlex
import sys
from typing import Dict, Any

def run_terminal_command(command: str, timeout: int = 60) -> Dict[str, Any]:
    """
    Executa comandos no terminal do SO de maneira síncrona e autônoma.
    
    Args:
        command (str): Comando completo do terminal a ser executado.
        timeout (int): Tempo limite de execução em segundos.
        
    Returns:
        dict: {
            "stdout": str,
            "stderr": str,
            "exit_code": int,
            "success": bool
        }
    """
    try:
        # No Windows, shell=True garante suporte a comandos do CMD/PowerShell.
        # Em Unix/Linux, shell=True lida com encadeamentos e pipes.
        use_shell = sys.platform == "win32" or True

        process = subprocess.run(
            command if use_shell else shlex.split(command),
            capture_output=True,
            text=True,
            shell=use_shell,
            timeout=timeout,
            encoding="utf-8",
            errors="replace"
        )

        return {
            "stdout": process.stdout.strip(),
            "stderr": process.stderr.strip(),
            "exit_code": process.returncode,
            "success": process.returncode == 0
        }

    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"Erro: O comando excede o tempo limite de {timeout}s.",
            "exit_code": -1,
            "success": False
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Erro inesperado ao executar o comando: {str(e)}",
            "exit_code": -1,
            "success": False
        }