import json
import re
from typing import Dict, Any
from validation_handler import run_terminal_command

class ContinueCLIHandler:
    def __init__(
        self, 
        cli_path: str = "npx @continuedev/cli", 
        config_path: str = r"C:\Users\mfard\.continue\config.yaml",
        default_model: str = "1 - Gemini 2.5 Flash (Google Free)"
    ):
        self.cli_path = cli_path
        self.config_path = config_path
        self.default_model = default_model

    def execute_prompt(self, prompt: str, model: str = None) -> Dict[str, Any]:
        target_model = model or self.default_model
        
        # Sanitiza o prompt removendo aspas duplas e quebras de linha para evitar quebra no PowerShell
        clean_prompt = prompt.replace("\n", " ").replace('"', "'")
        
        cmd = f'{self.cli_path} "{clean_prompt}" --config "{self.config_path}" --model "{target_model}"'

        result = run_terminal_command(cmd, timeout=120)

        # Se houver stdout, a execução foi bem sucedida (ignora avisos não fatais do stderr)
        if result["stdout"]:
            raw = result["stdout"]
            
            # Pega o texto gerado pela LLM após o marcador "●" ou limpa o resultado
            if "●" in raw:
                output_text = raw.split("●")[-1].strip()
            else:
                output_text = raw.strip()

            return {
                "raw_response": output_text,
                "success": True,
                "error": ""
            }
        else:
            return {
                "raw_response": "",
                "success": False,
                "error": result["stderr"] or "Nenhuma resposta retornada pela CLI do Continue."
            }

    def parse_response(self, raw_output: str) -> Dict[str, Any]:
        try:
            json_match = re.search(r'\{.*\}', raw_output, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                parsed_json = json.loads(json_str)
                return {"type": "json", "data": parsed_json}
        except Exception:
            pass

        return {"type": "text", "data": raw_output}