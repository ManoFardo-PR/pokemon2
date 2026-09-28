"""
PoC Fase 1: executor de terminal + Continue CLI em modo headless.

Valida:
1. run_terminal_command cria/lê/apaga arquivo sem intervenção.
2. A CLI responde a um prompt enviado por ARQUIVO (--prompt), inclusive um
   prompt grande (> 8 KB, acima do limite do cmd.exe), e devolve um bloco
   `### FILE:` que o parser reconhece.
"""
import sys

if hasattr(sys.stdout, "reconfigure"):  # console Windows em cp1252 quebra com emojis
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
import os
import sys

MODULES_DIR = os.path.dirname(os.path.abspath(__file__))
if MODULES_DIR not in sys.path:
    sys.path.insert(0, MODULES_DIR)

from continue_cli import ContinueCLIHandler          # noqa: E402
from main import load_config                         # noqa: E402
from validation_handler import run_terminal_command  # noqa: E402


def run_poc() -> None:
    print("=" * 60)
    print("🚀 PROVA DE CONCEITO - FASE 1")
    print("=" * 60)

    # 1. Terminal
    print("\n[1/3] Terminal local...")
    test_dir = os.path.join(MODULES_DIR, "logs", "tmp", "poc1")
    os.makedirs(test_dir, exist_ok=True)
    test_file = os.path.join(test_dir, "hello.txt")
    res = run_terminal_command(f'echo POC Phase 1 > "{test_file}"')
    if res["success"] and os.path.exists(test_file):
        print(" [OK] arquivo criado via terminal")
        os.remove(test_file)
        os.rmdir(test_dir)
    else:
        print(f" ❌ terminal falhou: {res['stderr']}")
        return

    # 2. CLI com prompt curto
    cfg = load_config()
    cli = ContinueCLIHandler(cli_path=cfg["continue_cli_path"], config_path=cfg["continue_config"],
                             timeout_sec=cfg["cli_timeout_sec"])

    print("\n[2/3] Continue CLI, prompt curto...")
    prompt = (
        "Responda EXATAMENTE no formato abaixo, sem nenhum outro texto:\n\n"
        "### FILE: poc/hello.py\n```python\nprint('ok')\n```\n"
    )
    res = cli.execute_prompt(prompt)
    if not res["success"]:
        print(f" ❌ CLI falhou: {res['error']}")
        return
    files = cli.parse_files(res["raw_response"])
    print(f" [OK] resposta com {len(files)} bloco(s) FILE: {[f['path'] for f in files]}")
    if not files:
        print(f"   resposta bruta:\n{res['raw_response'][:800]}")

    # 3. CLI com prompt grande (limite do cmd.exe é ~8 KB)
    print("\n[3/3] Continue CLI, prompt de ~20 KB...")
    filler = "\n".join(f"linha de contexto {i}: lorem ipsum dolor sit amet." for i in range(400))
    big_prompt = (
        "O texto abaixo é contexto irrelevante. Ignore-o.\n\n" + filler +
        "\n\nAgora responda EXATAMENTE no formato abaixo, sem nenhum outro texto:\n\n"
        "### FILE: poc/big.py\n```python\nBIG = True\n```\n"
    )
    print(f"   tamanho do prompt: {len(big_prompt)} caracteres")
    res = cli.execute_prompt(big_prompt)
    if not res["success"]:
        print(f" ❌ CLI falhou com prompt grande: {res['error']}")
        return
    files = cli.parse_files(res["raw_response"])
    print(f" [OK] prompt grande aceito; blocos FILE: {[f['path'] for f in files]}")

    print("\n" + "=" * 60)
    print("🏁 FASE 1 CONCLUÍDA")
    print("=" * 60)


if __name__ == "__main__":
    run_poc()
