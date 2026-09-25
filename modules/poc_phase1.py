import os
from validation_handler import run_terminal_command
from continue_cli import ContinueCLIHandler

def run_poc():
    print("=" * 60)
    print("🚀 INICIANDO PROVA DE CONCEITO (PoC) - FASE 1")
    print("=" * 60)

    # 1. Teste do Terminal
    print("\n[1/2] Testando validação do terminal local...")
    test_dir = "temp_poc_test"
    test_file = os.path.join(test_dir, "hello.txt")

    if os.name == 'nt':
        cmd_create = f'mkdir "{test_dir}" && echo POC Phase 1 Validation > "{test_file}"'
    else:
        cmd_create = f'mkdir -p "{test_dir}" && echo "POC Phase 1 Validation" > "{test_file}"'

    res_terminal = run_terminal_command(cmd_create)
    
    if res_terminal["success"] and os.path.exists(test_file):
        print(" [OK] Arquivo criado e manipulado no terminal com sucesso!")
        with open(test_file, "r") as f:
            print(f"      Conteúdo do arquivo: {f.read().strip()}")
    else:
        print(f" ❌ [FALHA] Não foi possível manipular o terminal: {res_terminal['stderr']}")
        return

    # Limpeza
    if os.name == 'nt':
        run_terminal_command(f'rmdir /s /q "{test_dir}"')
    else:
        run_terminal_command(f'rm -rf "{test_dir}"')

    # 2. Teste da CLI
    print("\n[2/2] Testando integração com a CLI do Continue...")
    continue_handler = ContinueCLIHandler()
    
    prompt_test = "Responda estritamente em formato JSON: {'status': 'OK', 'message': 'Continue CLI operacional'}"
    print(f"      Enviando Prompt: {prompt_test}")

    res_cli = continue_handler.execute_prompt(prompt_test)

    if res_cli["success"]:
        print(" [OK] Resposta recebida da CLI do Continue!")
        parsed = continue_handler.parse_response(res_cli["raw_response"])
        print(f"      Resultado Parseado: {parsed}")
    else:
        print(f" ⚠️ [ALERTA/FALHA] Falha ao comunicar com a CLI:")
        print(f"      Detalhes: {res_cli['error']}")

    print("\n" + "=" * 60)
    print("🏁 CONCLUÍDA A EXECUÇÃO DA FASE 1")
    print("=" * 60)

if __name__ == "__main__":
    run_poc()