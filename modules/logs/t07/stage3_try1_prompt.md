Você é Engenheiro de Software Sênior. Está executando a fase GREEN da subtarefa T07, em Python (somente biblioteca padrão).

PASTA ALVO: tests/cpf_validator
RUNNER DE TESTES: `python -m unittest discover -s tests/cpf_validator -v`

================================================================================
PLANO MESTRE (Estágio 1) - seções 2, 3 e 5 definem arquivos, contratos e restrições:
================================================================================
### 1. Objetivo e Contexto da Subtarefa
- **Objetivo**: Implementar o arquivo `tests/cpf_validator/test_full_suite.py`, consolidando a suíte de testes de integração global e ponta a ponta (end-to-end) para validação do módulo `validator.py`. A suíte deve verificar o comportamento completo do validador frente a baterias de CPFs reais/conhecidos válidos, formatos com e sem máscara, casos de borda de cálculo de dígitos verificadores e rejeição estrita de entradas inválidas.
- **Dependências de tarefas anteriores**:
  - T01: Estrutura inicial do pacote e existência de `tests/cpf_validator/src/__init__.py`.
  - T02: Sanitizador de CPF (`tests/cpf_validator/src/sanitizer.py`).
  - T03: Validador de formato e fail-fast (`tests/cpf_validator/src/format_validator.py`).
  - T04: Cálculo e verificação do primeiro dígito verificador DV1 (`tests/cpf_validator/src/verifier.py`).
  - T05: Cálculo e verificação do segundo dígito verificador DV2 (`tests/cpf_validator/src/verifier.py`).
  - T06: Fachada integrada unificada de validação (`tests/cpf_validator/src/validator.py`).
- **O que já existe no workspace**:
  - Módulos de produção em `tests/cpf_validator/src/`: `__init__.py`, `sanitizer.py`, `format_validator.py`, `verifier.py` e `validator.py`.
  - Suítes de testes unitários existentes: `test_structure.py`, `test_sanitizer.py`, `test_format_validator.py`, `test_verifier_dv1.py`, `test_verifier_dv2.py` e `test_validator_facade.py` (70 testes passando com sucesso).

### 2. Arquivos Alvo
- **Arquivos de produção**:
  - Nenhum arquivo de produção a criar ou alterar (`tests/cpf_validator/src/validator.py` já se encontra totalmente implementado).
- **Arquivos de teste**:
  - `tests/cpf_validator/test_full_suite.py`: Criação da suíte de teste de integração end-to-end cobrindo cenários reais, casos de borda e garantindo conformidade com o runner global do unittest.

### 3. Requisitos Técnicos e Contratos
- **Contrato da função sob teste** (`tests/cpf_validator/src/validator.py`):
  ```python
  def validate_cpf(cpf_raw: Any) -> dict[str, Any]:
  ```
  - **Parâmetro**: `cpf_raw` do tipo `Any` (aceita strings formatadas, não formatadas ou tipos não-string).
  - **Retorno**: Dicionário com a estrutura exata:
    ```python
    {
        "valid": bool,        # True se válido; False caso contrário
        "cpf_clean": str,     # Dígitos numéricos resultantes da sanitização ou ""
        "reason": str         # "CPF válido", "Formato inválido", "Primeiro dígito verificador inválido" ou "Segundo dígito verificador inválido"
    }
    ```
- **Regras de Negócio**:
  - `BR-T07-01`: Todos os testes contidos dentro do diretório `tests/cpf_validator/` devem ser descobertos e passar com sucesso via comando `python -m unittest discover -s tests/cpf_validator -v`.
- **Tratamento de erros e casos de borda**:
  - Entradas válidas formatadas (`XXX.XXX.XXX-XX`), limpas (`XXXXXXXXXXX`), com espaços ou quebras de linha (`\n`, `\t`) devem retornar `valid: True`, `cpf_clean` com 11 dígitos e `reason: "CPF válido"`.
  - CPFs iniciados com `0` e CPFs cujos cálculos de DV resultam em 0 (resto `>= 10` ou `0`) devem ser calculados e validados corretamente.
  - Dígitos repetidos ("000.000.000-00" a "999.999.999-99") devem ser rejeitados com `valid: False` e `reason: "Formato inválido"`.
  - CPFs com DV1 incorreto devem retornar `valid: False` e `reason: "Primeiro dígito verificador inválido"`.
  - CPFs com DV1 correto mas DV2 incorreto devem retornar `valid: False` e `reason: "Segundo dígito verificador inválido"`.
  - CPFs com tamanho menor que 11, maior que 11, strings sem dígitos, vazias ou tipos arbitrários (`None`, `int`, `float`, `bool`, `list`, `dict`) não devem lançar exceções não tratadas; devem retornar `valid: False` e `reason: "Formato inválido"`.

### 4. Cenários de Teste (Fase RED)
- Asserção testando validação de bateria de CPFs válidos conhecidos desformatados (`11144477735`, `52998224725`, `01234567890`) retornando `valid: True` e `reason: "CPF válido"`.
- Asserção testando validação de bateria de CPFs válidos conhecidos com máscara padrão (`111.444.777-35`, `529.982.247-25`, `012.345.678-90`) retornando `valid: True` e `cpf_clean` correspondente.
- Asserção testando CPF válido contendo espaçamentos atípicos e tabulações (`\t 111.444.777-35 \n`) retornando `valid: True` e `cpf_clean: "11144477735"`.
- Asserção testando preservação de zero à esquerda em CPF válido (`012.345.678-90`) retornando `cpf_clean: "01234567890"` e `valid: True`.
- Asserção testando CPF válido em que a regra modular resulta em resto zero / dez para DV1 e DV2 retornando `valid: True`.
- Asserção testando rejeição em lote de todos os 10 CPFs de dígitos repetidos (`00000000000` até `99999999999`) retornando `valid: False` e `reason: "Formato inválido"`.
- Asserção testando rejeição de CPF com primeiro dígito verificador incorreto (`111.444.777-05`) retornando `valid: False` e `reason: "Primeiro dígito verificador inválido"`.
- Asserção testando rejeição de CPF com segundo dígito verificador incorreto (`111.444.777-30`) retornando `valid: False` e `reason: "Segundo dígito verificador inválido"`.
- Asserção testando rejeição de CPF com menos de 11 dígitos numéricos (`123.456.789`) retornando `valid: False` e `reason: "Formato inválido"`.
- Asserção testando rejeição de CPF com mais de 11 dígitos numéricos (`123.456.789-012`) retornando `valid: False` e `reason: "Formato inválido"`.
- Asserção testando rejeição de string vazia (`""`) e string contendo apenas espaços retornando `valid: False`, `cpf_clean: ""` e `reason: "Formato inválido"`.
- Asserção testando rejeição de string puramente alfabética ou pontuações sem dígitos (`"abc.def.ghi-jk"`) retornando `valid: False`, `cpf_clean: ""` e `reason: "Formato inválido"`.
- Asserção testando entrada do tipo `None` retornando `valid: False`, `cpf_clean: ""` e `reason: "Formato inválido"`.
- Asserção testando entrada de tipo numérico `int` (`11144477735`) retornando `valid: False`, `cpf_clean: ""` e `reason: "Formato inválido"`.
- Asserção testando entradas de tipo booleano (`True` e `False`) retornando `valid: False`, `cpf_clean: ""` e `reason: "Formato inválido"`.
- Asserção testando tipos estruturados e coleções (`list`, `dict`, `float`) retornando `valid: False`, `cpf_clean: ""` e `reason: "Formato inválido"`.
- Asserção testando integridade das chaves retornadas (`valid`, `cpf_clean`, `reason`) garantindo que nenhum campo obrigatório esteja ausente em qualquer resposta.

### 5. Restrições de Arquitetura e Código
- Utilizar exclusivamente a biblioteca padrão do Python (`unittest` e biblioteca padrão de tipos). Nenhuma dependência externa adicional é permitida.
- O pacote `tests/cpf_validator/src/__init__.py` deve ser preservado como pacote Python válido.
- As importações de produção no arquivo de teste devem ser realizadas a partir da raiz de descoberta de testes: `from src.validator import validate_cpf`.
- Convenção de nomenclatura: o arquivo deve ser nomeado exatamente `tests/cpf_validator/test_full_suite.py`, contendo classe herdando de `unittest.TestCase` (por exemplo, `class TestFullSuite(unittest.TestCase):`) e métodos de teste iniciando com o prefixo `test_`.
- Interpretações assumidas:
  - T07 restringe-se à adição da suíte de teste de integração `test_full_suite.py` sem modificação de código-fonte de produção em `tests/cpf_validator/src/`.
  - A execução de `python -m unittest discover -s tests/cpf_validator -v` a partir da raiz do repositório deve rodar todos os testes de forma independente e com 100% de sucesso.
================================================================================
TESTES DA FASE RED (Estágio 2) - o código de produção DEVE fazer todos passarem:
================================================================================
### FILE: tests/cpf_validator/test_full_suite.py
```python
import unittest
from src.validator import validate_cpf

class TestFullSuite(unittest.TestCase):
    """Suíte consolidada de testes de integração e ponta a ponta para validação de CPF (T07)."""

    def test_known_valid_cpfs_unformatted(self):
        """Valida bateria de CPFs válidos conhecidos fornecidos sem formatação."""
        valid_unformatted_cpfs = [
            "11144477735",
            "52998224725",
            "01234567890",
        ]
        for cpf in valid_unformatted_cpfs:
            with self.subTest(cpf=cpf):
                result = validate_cpf(cpf)
                self.assertEqual(
                    result,
                    {
                        "valid": True,
                        "cpf_clean": cpf,
                        "reason": "CPF válido",
                    },
                )

    def test_known_valid_cpfs_formatted(self):
        """Valida bateria de CPFs válidos conhecidos com máscara padrão."""
        formatted_cases = [
            ("111.444.777-35", "11144477735"),
            ("529.982.247-25", "52998224725"),
            ("012.345.678-90", "01234567890"),
        ]
        for raw_cpf, expected_clean in formatted_cases:
            with self.subTest(raw_cpf=raw_cpf):
                result = validate_cpf(raw_cpf)
                self.assertEqual(
                    result,
                    {
                        "valid": True,
                        "cpf_clean": expected_clean,
                        "reason": "CPF válido",
                    },
                )

    def test_valid_cpf_with_whitespace_and_tabs(self):
        """Valida CPF válido contendo espaçamentos atípicos, quebras de linha e tabulações."""
        raw_cpf = "\t 111.444.777-35 \n"
        result = validate_cpf(raw_cpf)
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "11144477735",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_leading_zero(self):
        """Valida preservação do zero à esquerda em CPF válido com máscara."""
        result = validate_cpf("012.345.678-90")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "01234567890",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_modular_rule_edge_cases_dv_zero(self):
        """Valida CPFs onde o cálculo modular dos dígitos verificadores resulta em zero (resto 0 ou 1)."""
        # "33344455508" possui resto 0 na soma ponderada do DV1 (DV1 = 0)
        # "01234567890" possui resto 1 na soma ponderada do DV2 (DV2 = 0)
        edge_cases = [
            ("333.444.555-08", "33344455508"),
            ("012.345.678-90", "01234567890"),
        ]
        for raw_cpf, expected_clean in edge_cases:
            with self.subTest(raw_cpf=raw_cpf):
                result = validate_cpf(raw_cpf)
                self.assertEqual(
                    result,
                    {
                        "valid": True,
                        "cpf_clean": expected_clean,
                        "reason": "CPF válido",
                    },
                )

    def test_repeated_digits_cpfs_rejection(self):
        """Rejeita em lote todos os 10 CPFs constituídos por dígitos repetidos."""
        for digit in range(10):
            cpf_repeated = str(digit) * 11
            with self.subTest(cpf_repeated=cpf_repeated):
                result = validate_cpf(cpf_repeated)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": cpf_repeated,
                        "reason": "Formato inválido",
                    },
                )

    def test_invalid_dv1_rejection(self):
        """Rejeita CPF com primeiro dígito verificador incorreto."""
        result = validate_cpf("111.444.777-05")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11144477705",
                "reason": "Primeiro dígito verificador inválido",
            },
        )

    def test_invalid_dv2_rejection(self):
        """Rejeita CPF com DV1 correto mas segundo dígito verificador incorreto."""
        result = validate_cpf("111.444.777-30")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11144477730",
                "reason": "Segundo dígito verificador inválido",
            },
        )

    def test_short_cpf_rejection(self):
        """Rejeita entrada contendo menos de 11 dígitos numéricos."""
        result = validate_cpf("123.456.789")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "123456789",
                "reason": "Formato inválido",
            },
        )

    def test_long_cpf_rejection(self):
        """Rejeita entrada contendo mais de 11 dígitos numéricos."""
        result = validate_cpf("123.456.789-012")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "123456789012",
                "reason": "Formato inválido",
            },
        )

    def test_empty_and_whitespace_only_rejection(self):
        """Rejeita string vazia e string contendo apenas espaços em branco."""
        for empty_val in ["", "   ", "\t\n  "]:
            with self.subTest(empty_val=repr(empty_val)):
                result = validate_cpf(empty_val)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": "",
                        "reason": "Formato inválido",
                    },
                )

    def test_alphabetic_and_punctuation_only_rejection(self):
        """Rejeita string puramente alfabética ou pontuações sem nenhum dígito."""
        for invalid_raw in ["abc.def.ghi-jk", "...", "---"]:
            with self.subTest(invalid_raw=invalid_raw):
                result = validate_cpf(invalid_raw)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": "",
                        "reason": "Formato inválido",
                    },
                )

    def test_none_input_rejection(self):
        """Trata defensivamente entrada do tipo None."""
        result = validate_cpf(None)
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_integer_input_rejection(self):
        """Trata defensivamente entrada do tipo int."""
        result = validate_cpf(11144477735)
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_boolean_input_rejection(self):
        """Trata defensivamente entradas de tipos booleanos."""
        for bool_val in [True, False]:
            with self.subTest(bool_val=bool_val):
                result = validate_cpf(bool_val)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": "",
                        "reason": "Formato inválido",
                    },
                )

    def test_structured_and_collection_types_rejection(self):
        """Trata defensivamente coleções e outros tipos numéricos (list, dict, float)."""
        inputs = [
            ["111.444.777-35"],
            {"cpf": "11144477735"},
            123.456,
        ]
        for structured_val in inputs:
            with self.subTest(structured_val=type(structured_val).__name__):
                result = validate_cpf(structured_val)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": "",
                        "reason": "Formato inválido",
                    },
                )

    def test_response_keys_integrity(self):
        """Verifica a integridade do contrato de retorno em cenários válidos e inválidos."""
        expected_keys = {"valid", "cpf_clean", "reason"}
        sample_inputs = [
            "111.444.777-35",
            "000.000.000-00",
            "111.444.777-05",
            "invalid",
            None,
        ]
        for sample in sample_inputs:
            with self.subTest(sample=sample):
                result = validate_cpf(sample)
                self.assertIsInstance(result, dict)
                self.assertEqual(set(result.keys()), expected_keys)
                self.assertIsInstance(result["valid"], bool)
                self.assertIsInstance(result["cpf_clean"], str)
                self.assertIsInstance(result["reason"], str)

if __name__ == "__main__":
    unittest.main()
```
================================================================================

REGRAS:
1. Implemente o MÍNIMO de código de produção que satisfaça todos os testes e os contratos do plano. Não modifique os arquivos de teste.
2. Respeite exatamente os caminhos e assinaturas do plano (ex.: `tests/cpf_validator/src/sanitizer.py` com `def clean_cpf(cpf_raw: str) -> str`).
3. Garanta que `tests/cpf_validator/src/__init__.py` exista (devolva-o, mesmo vazio, se ainda não existir ou se tiver dúvida).
4. Se um módulo já existe de uma tarefa anterior e você precisa acrescentar uma função, devolva o ARQUIVO COMPLETO (o orquestrador sobrescreve o arquivo inteiro). Você pode LER o workspace para ver o conteúdo atual.
5. Você NÃO tem ferramentas de escrita. Devolva os arquivos no formato abaixo; o orquestrador grava no disco.
6. Se houver uma seção de FEEDBACK acima com erros da tentativa anterior, corrija exatamente aqueles erros.

FORMATO DE SAÍDA (obrigatório): para cada arquivo, um cabeçalho `### FILE:` com o caminho relativo à raiz do repositório, seguido IMEDIATAMENTE (na linha seguinte) por um bloco de código cercado por ```python e ```. Nenhum texto entre o cabeçalho e a cerca. Explicações, se houver, vêm antes do primeiro cabeçalho e devem ser curtas.

### FILE: tests/cpf_validator/src/exemplo.py
```python
def funcao(x: int) -> int:
    return x
```
