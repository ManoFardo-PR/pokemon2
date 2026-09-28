"""
PoC Fase 4: ciclo RED -> GREEN -> retroalimentação com PATCH, sem GitHub.

Pasta temporária em modules/logs/tmp/poc4 como "projeto". A primeira tentativa
GREEN é sabotada de propósito (implementação errada gravada no lugar da
resposta da IA). A segunda tentativa recebe o CURRENT CONTENT do arquivo
errado mais os erros dos testes e deve devolver um PATCH (SEARCH/REPLACE)
que o orquestrador aplica com file_ops.apply_patch.
"""
import sys

if hasattr(sys.stdout, "reconfigure"):  # console Windows em cp1252 quebra com emojis
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import os
import shutil
from typing import Any, Dict, List

MODULES_DIR = os.path.dirname(os.path.abspath(__file__))
if MODULES_DIR not in sys.path:
    sys.path.insert(0, MODULES_DIR)

import file_ops                                       # noqa: E402
from continue_cli import ContinueCLIHandler           # noqa: E402
from main import load_config                          # noqa: E402
from validation_handler import ValidationHandler      # noqa: E402

FORMAT_FILE = ("\n\nOUTPUT FORMAT (mandatory): for each NEW file, a heading `### FILE: path` followed immediately "
               "by a ```python fenced block. Nothing else.")
FORMAT_PATCH = ("\n\nOUTPUT FORMAT (mandatory): the file already exists (see CURRENT CONTENT). Return a heading "
                "`### PATCH: path` followed by one or more edits:\n<<<<<<< SEARCH\n(exact lines copied from CURRENT CONTENT)\n"
                "=======\n(replacement lines)\n>>>>>>> REPLACE\nDo not return the whole file. Nothing else.")


class TDDCycleRunner:
    def __init__(self, target_dir: str):
        self.target_dir = target_dir
        os.makedirs(os.path.join(target_dir, "src"), exist_ok=True)
        file_ops.write_text(os.path.join(target_dir, "src", "__init__.py"), "")
        cfg = load_config()
        self.cli = ContinueCLIHandler(cli_path=cfg["continue_cli_path"], config_path=cfg["continue_config"],
                                      timeout_sec=cfg["cli_timeout_sec"])
        self.validator = ValidationHandler(
            test_cmd=f'python -m unittest discover -s "{target_dir}" -v',
            typecheck_cmd=f'python -m compileall -q "{target_dir}"',
        )

    def _abs(self, rel: str) -> str:
        parts = rel.replace("\\", "/").split("/")
        tail = parts[-2:] if len(parts) >= 2 and parts[-2] == "src" else parts[-1:]
        return os.path.join(self.target_dir, *tail)

    def _apply(self, blocks: List[Dict[str, Any]]) -> List[str]:
        problems = []
        for b in blocks:
            if b.get("error"):
                problems.append(f"{b['path']}: {b['error']}")
                continue
            path = self._abs(b["path"])
            if b["kind"] == "file":
                file_ops.write_text(path, b["code"])
                print(f"   [OK] FILE gravado {path}")
            else:
                current = file_ops.read_text(path)
                if current is None:
                    problems.append(f"{b['path']}: PATCH em arquivo inexistente")
                    continue
                new, err = file_ops.apply_patch(current, b["edits"])
                if err:
                    problems.append(f"{b['path']}: {err}")
                    continue
                file_ops.write_text(path, new)
                print(f"   [OK] PATCH aplicado em {path} ({len(b['edits'])} edição(ões))")
        return problems

    def stage_red(self, spec: str) -> Dict[str, Any]:
        print("\n🔴 [Etapa 2 - TDD RED] gerando testes...")
        prompt = (
            "You are a Python TDD engineer. Specification: " + spec +
            "\nWrite ONLY a unittest file named test_feature.py that imports "
            "`from src.feature import calcular_desconto` and covers: 150 -> 135.0, 100 -> 100, 50 -> 50, 0 -> 0."
            + FORMAT_FILE
        )
        res = self.cli.execute_prompt(prompt)
        if not res["success"]:
            return {"success": False, "error": res["error"]}
        blocks = [b for b in self.cli.parse_blocks(res["raw_response"]) if "test_" in b["path"]]
        if not blocks:
            return {"success": False, "error": f"sem bloco FILE de teste. Bruto:\n{res['raw_response'][:500]}"}
        problems = self._apply(blocks)
        if problems:
            return {"success": False, "error": "; ".join(problems)}
        red = self.validator.run_tests()
        print(f"   testes em RED: {'falharam (esperado)' if not red['success'] else 'passaram (inesperado)'}")
        tests_md = "\n\n".join(f"### FILE: {b['path']}\n```python\n{b['code']}```" for b in blocks)
        return {"success": True, "tests_md": tests_md}

    def stage_green_with_feedback_loop(self, tests_md: str, max_retries: int = 3) -> bool:
        print("\n🟢 [Etapa 3 - TDD GREEN] implementando...")
        feature_path = os.path.join(self.target_dir, "src", "feature.py")
        feedback = ""
        for attempt in range(1, max_retries + 1):
            print(f"\n🔄 tentativa {attempt}/{max_retries}")
            current = file_ops.read_text(feature_path)
            if current is None:
                prompt = ("Write the production code in src/feature.py that makes these tests pass:\n\n"
                          + tests_md + FORMAT_FILE)
            else:
                prompt = ("The production code in src/feature.py exists but the tests fail. Fix it.\n\n"
                          + tests_md + "\n\n### CURRENT CONTENT: src/feature.py\n```python\n" + current + "```\n\n"
                          + feedback + FORMAT_PATCH)
            res = self.cli.execute_prompt(prompt)
            if not res["success"]:
                print(f"   ❌ CLI: {res['error']}")
                continue
            blocks = [b for b in self.cli.parse_blocks(res["raw_response"]) if "test_" not in b["path"]]
            if not blocks:
                print("   ⚠️ resposta sem bloco FILE/PATCH de produção")
                feedback = "FEEDBACK: your previous answer had no `### FILE:`/`### PATCH:` block. Use the required format.\n"
                continue

            if attempt == 1:
                print("   🧪 SABOTAGEM: gravando implementação errada para testar a retroalimentação por PATCH")
                blocks = [{"kind": "file", "path": "src/feature.py",
                           "code": "def calcular_desconto(valor):\n    return valor  # errado de propósito\n"}]
            else:
                kinds = {b["kind"] for b in blocks}
                print(f"   tipos de bloco devolvidos: {sorted(kinds)}")
            problems = self._apply(blocks)
            if problems:
                print(f"   ⚠️ problemas ao aplicar: {problems}")
                feedback = "FEEDBACK: the orchestrator could not apply your output:\n- " + "\n- ".join(problems) + "\n"
                continue

            print("🔍 [Etapa 4 - validação local]")
            comp = self.validator.check_compilation()
            tests = self.validator.run_tests()
            if comp["success"] and tests["success"]:
                print("   ✅ GREEN: compilação e testes OK")
                return True
            errors = self.validator.analyze_errors(tests, comp)
            print("   ❌ falhou; reinjetando erros no prompt")
            feedback = f"FEEDBACK FROM THE PREVIOUS ATTEMPT (fix exactly this):\n{errors}\n"
        return False


def run_poc() -> None:
    print("=" * 60)
    print("🚀 PROVA DE CONCEITO - FASE 4 (ciclo TDD com retroalimentação por PATCH)")
    print("=" * 60)
    target = os.path.join(MODULES_DIR, "logs", "tmp", "poc4")
    shutil.rmtree(target, ignore_errors=True)
    runner = TDDCycleRunner(target)
    spec = ("function calcular_desconto(valor: float) -> float: returns the value with a 10% discount "
            "when valor > 100, otherwise returns the original value.")
    try:
        red = runner.stage_red(spec)
        if not red["success"]:
            print(f"\n❌ RED falhou: {red['error']}")
            return
        if runner.stage_green_with_feedback_loop(red["tests_md"]):
            print("\n🎉 CICLO TDD COMPLETO E AUTORREPARADO (com PATCH)")
        else:
            print("\n❌ não chegou a GREEN dentro do limite")
    finally:
        shutil.rmtree(target, ignore_errors=True)


if __name__ == "__main__":
    run_poc()
