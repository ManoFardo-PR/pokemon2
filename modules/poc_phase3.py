import sys

if hasattr(sys.stdout, "reconfigure"):  # console Windows em cp1252 quebra com emojis
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
import os
import shutil
from validation_handler import run_terminal_command
from validation_handler import ValidationHandler  # Certifique-se de importar a nova classe

def run_poc():
    print("=" * 60)
    print("🚀 INICIANDO PROVA DE CONCEITO (PoC) - FASE 3")
    print("=" * 60)

    # Vamos criar um miniprojeto Python temporário usando 'pytest' ou 'unittest' nativo
    test_dir = "temp_poc_phase3"
    os.makedirs(test_dir, exist_ok=True)

    math_file = os.path.join(test_dir, "math_utils.py")
    test_file = os.path.join(test_dir, "test_math_utils.py")

    # Usaremos unittest (padrão do Python) para testar o runner local sem dependências externas
    test_command = f"python -m unittest discover -s {test_dir}"
    validator = ValidationHandler(test_cmd=test_command, typecheck_cmd="python --version")

    # Escreve o arquivo de teste que espera que a função soma(2, 3) retorne 5
    with open(test_file, "w", encoding="utf-8") as f:
        f.write(
            "import unittest\n"
            "from math_utils import soma\n\n"
            "class TestMathUtils(unittest.TestCase):\n"
            "    def test_soma(self):\n"
            "        self.assertEqual(soma(2, 3), 5)\n"
        )

    # -------------------------------------------------------------
    # SIMULAÇÃO 1: TDD RED (Código com Erro - Espera-se Falha)
    # -------------------------------------------------------------
    print("\n[1/2] Simulando Execução no Estado TDD RED (Esperando Falha)...")
    with open(math_file, "w", encoding="utf-8") as f:
        f.write("def soma(a, b):\n    return a - b  # ERRO PROPOSITAL: Subtraindo ao invés de somar\n")

    res_test_red = validator.run_tests()

    if not res_test_red["success"]:
        print(" [OK] O validador detectou a falha esperada no teste!")
        error_summary = validator.analyze_errors(res_test_red)
        print("\n--- Relatório Formatado para Retroalimentação da IA ---")
        print(error_summary[:400] + "...\n------------------------------------------------------")
    else:
        print(" ❌ [FALHA] O teste deveria ter falhado, mas passou.")

    # -------------------------------------------------------------
    # SIMULAÇÃO 2: TDD GREEN (Código Corrigido - Espera-se Sucesso)
    # -------------------------------------------------------------
    print("\n[2/2] Simulando Execução no Estado TDD GREEN (Esperando Sucesso)...")
    with open(math_file, "w", encoding="utf-8") as f:
        f.write("def soma(a, b):\n    return a + b  # CÓDIGO CORRIGIDO\n")

    res_test_green = validator.run_tests()

    if res_test_green["success"]:
        print(" [OK] O validador confirmou que todos os testes passaram!")
    else:
        print(f" ❌ [FALHA] O teste deveria ter passado: {res_test_green['stderr']}")

    # Limpeza dos arquivos temporários
    shutil.rmtree(test_dir, ignore_errors=True)

    print("\n" + "=" * 60)
    print("🏁 CONCLUÍDA A EXECUÇÃO DA FASE 3")
    print("=" * 60)

if __name__ == "__main__":
    run_poc()