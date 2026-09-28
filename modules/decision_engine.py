import os
import sys
import time
import json

if sys.platform == "win32":
    import msvcrt

class DecisionEngine:
    def __init__(self, rules_file="auto_rules.json", auto_countdown_sec: int = 3):
        self.auto_countdown_sec = auto_countdown_sec
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.rules_file = os.path.join(base_dir, rules_file)
        self.auto_rules = self._load_rules()

    def _load_rules(self) -> dict:
        if os.path.exists(self.rules_file):
            try:
                with open(self.rules_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    def _save_rules(self):
        with open(self.rules_file, "w", encoding="utf-8") as f:
            json.dump(self.auto_rules, f, indent=2)

    def ask_or_auto(self, action_type: str, description: str, timeout_sec: int = None) -> bool:
        if timeout_sec is None:
            timeout_sec = self.auto_countdown_sec
        if self.auto_rules.get(action_type) == "AUTO_APPROVE":
            if timeout_sec <= 0:
                print(f"⚡ [AUTO] ({action_type}) {description}")
                return True
            print(f"\n⚡ [MODO AUTOMÁTICO] Ação detectada: ({action_type}) -> {description}")
            print(f"⏳ Executando automaticamente em {timeout_sec}s... (Aperte 'C' para CANCELAR)")

            canceled = self._countdown_timer(timeout_sec)
            if canceled:
                print("\n🛑 [CANCELADO] Ação interrompida pelo usuário!")
                return False
            
            print("🚀 [APROVADO AUTOMATICAMENTE] Prosseguindo...")
            return True

        print(f"\n⚠️  [INTERVENÇÃO NECESSÁRIA] A IA solicita a seguinte ação:")
        print(f"   📌 Tipo: [{action_type}]")
        print(f"   📝 Detalhe: {description}")
        print("\nEscolha uma opção:")
        print("  [S] Sim (Apenas esta vez)")
        print("  [N] Não (Cancelar ação)")
        print("  [A] Automático (Aprovar esta e TODAS as próximas deste tipo)")

        choice = input("\nOpção [S/N/A]: ").strip().upper()

        if choice == "A":
            self.auto_rules[action_type] = "AUTO_APPROVE"
            self._save_rules()
            print(f"✅ Tipo '{action_type}' cadastrado para APROVAÇÃO AUTOMÁTICA!")
            return True
        elif choice == "S":
            return True
        else:
            print("❌ Ação rejeitada pelo usuário.")
            return False

    def _countdown_timer(self, seconds: int) -> bool:
        start_time = time.time()
        while time.time() - start_time < seconds:
            remaining = seconds - int(time.time() - start_time)
            sys.stdout.write(f"\r⏱️  Tempo restante: {remaining}s | Aperte 'C' para cancelar... ")
            sys.stdout.flush()

            if sys.platform == "win32" and msvcrt.kbhit():
                key = msvcrt.getch().decode("utf-8", errors="ignore").upper()
                if key in ["C", "c", "\x03"]:
                    sys.stdout.write("\n")
                    return True
            time.sleep(0.1)

        sys.stdout.write("\r⏱️  Executando ação...                          \n")
        return False