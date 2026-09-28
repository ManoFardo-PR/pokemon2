import sys

if hasattr(sys.stdout, "reconfigure"):  # console Windows em cp1252 quebra com emojis
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
import time
from github_handler import GitHubHandler
from validation_handler import run_terminal_command

def run_poc():
    print("=" * 60)
    print("🚀 INICIANDO PROVA DE CONCEITO (PoC) - FASE 2")
    print("=" * 60)

    gh = GitHubHandler()

    # --- AQUI ENTRA O SEU TRECHO ---
    print("\n🛠️ Configurando infraestrutura de labels no repositório...")
    setup_res = gh.setup_repository()

    if setup_res["success"]:
        print(" [OK] Todas as labels do pipeline estão prontas e configuradas!")
    else:
        print(f" ⚠️ Erro ao configurar labels: {setup_res['errors']}")
    # ---------------------------------

    # 1. Criar Issue de Teste
    print("\n[1/5] Criando issue de teste no GitHub...")
    cmd_create = 'gh issue create --title "[PoC Phase 2] Teste do GitHub Handler" --body "Issue temporária para validação autônoma do orquestrador Python." --label "bug"'
    res_create = run_terminal_command(cmd_create)

    if not res_create["success"]:
        print(" ❌ [FALHA] Não foi possível criar a issue via CLI 'gh':")
        print(f"      {res_create['stderr']}")
        print("      Certifique-se de que a CLI do GitHub está autenticada ('gh auth status').")
        return

    # Extrai o número da issue criada a partir da URL retornada pela CLI
    issue_url = res_create["stdout"]
    issue_number = int(issue_url.split("/")[-1])
    print(f" [OK] Issue #{issue_number} criada com sucesso: {issue_url}")

    # 2. Adicionar Comentário
    print(f"\n[2/5] Adicionando comentário de log na Issue #{issue_number}...")
    comment_text = "🤖 **[Orquestrador TDD]** Iniciando fase de verificação do GitHub Handler."
    if gh.add_comment(issue_number, comment_text):
        print(" [OK] Comentário gravado com sucesso!")
    else:
        print(" ❌ [FALHA] Falha ao adicionar comentário.")

    # 3. Atualizar Labels
    print(f"\n[3/5] Atualizando labels da Issue #{issue_number}...")
    if gh.update_issue_labels(issue_number, add_labels=["tdd-red"], remove_labels=["bug"]):
        print(" [OK] Labels atualizadas com sucesso! (+tdd-red, -bug)")
    else:
        print(" ⚠️ [ALERTA] Falha ao atualizar labels.")

    # 4. Listar Issues Abertas
    print("\n[4/5] Listando issues abertas no repositório...")
    open_issues = gh.get_open_issues()
    found = any(i["number"] == issue_number for i in open_issues)
    
    if found:
        print(f" [OK] Issue #{issue_number} localizada na lista de issues abertas ({len(open_issues)} issue(s) encontrada(s)).")
    else:
        print(f" ❌ [FALHA] Issue #{issue_number} não foi encontrada na busca.")

    # 5. Fechar Issue
    print(f"\n[5/5] Encerrando a Issue #{issue_number}...")
    final_log = "✅ **[Orquestrador TDD]** Testes do GitHub Handler concluídos com sucesso. Encerrando tarefa."
    if gh.close_issue(issue_number, final_log):
        print(f" [OK] Issue #{issue_number} fechada com sucesso!")
    else:
        print(" ❌ [FALHA] Falha ao fechar a issue.")

    print("\n" + "=" * 60)
    print("🏁 CONCLUÍDA A EXECUÇÃO DA FASE 2")
    print("=" * 60)

if __name__ == "__main__":
    run_poc()