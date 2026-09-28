Você é Engenheiro de Software Sênior. Está executando a fase GREEN da subtarefa T06, em Python (somente biblioteca padrão).

PASTA ALVO: tests/cpf_validator
RUNNER DE TESTES: `python -m unittest discover -s tests/cpf_validator -v`

================================================================================
PLANO MESTRE (Estágio 1) - seções 2, 3 e 5 definem arquivos, contratos e restrições:
================================================================================
### 1. Objetivo e Contexto da Subtarefa
- **Objetivo**: Implementar a fachada de validação completa do CPF na função `validate_cpf(cpf_raw: str) -> dict`, integrando em um fluxo unificado os módulos de sanitização (`clean_cpf`), validação de formato (`is_valid_format`) e cálculo de dígitos verificadores (`calculate_dv1` e `calculate_dv2`).
- **Dependências de Tarefas Anteriores**:
  - `T02`: Módulo `tests/cpf_validator/src/sanitizer.py` (`clean_cpf`).
  - `T03`: Módulo `tests/cpf_validator/src/format_validator.py` (`is_valid_format`).
  - `T04` e `T05`: Módulo `tests/cpf_validator/src/verifier.py` (`calculate_dv1`, `calculate_dv2`).
- **O que Já Existe no Workspace**:
  - `tests/cpf_validator/src/__init__.py` (pacote Python inicializado).
  - `tests/cpf_validator/src/sanitizer.py` (higienização de caracteres não numéricos).
  - `tests/cpf_validator/src/format_validator.py` (validação de tamanho de 11 dígitos e dígitos repetidos).
  - `tests/cpf_validator/src/verifier.py` (cálculo algorítmico de DV1 e DV2 via Módulo 11).
  - Testes unitários das etapas anteriores (`test_structure.py`, `test_sanitizer.py`, `test_format_validator.py`, `test_verifier_dv1.py`, `test_verifier_dv2.py`) executando com 100% de aprovação.

---

### 2. Arquivos Alvo

**Arquivos de Produção:**
- `tests/cpf_validator/src/validator.py` — Criar: módulo de fachada contendo a função pública `validate_cpf(cpf_raw: str) -> dict` integrando sanitização, formato e validação de DV1 e DV2.

**Arquivos de Teste:**
- `tests/cpf_validator/test_validator_facade.py` — Criar: suíte de testes unitários `TestValidatorFacade` cobrindo validações bem-sucedidas, falha rápida por sanitização/formato inválido, falha no primeiro dígito verificador, falha no segundo dígito verificador e casos de borda com tipos de entrada inválidos.

---

### 3. Requisitos Técnicos e Contratos

**Assinatura da Função:**
```python
def validate_cpf(cpf_raw: Any) -> dict[str, Any]:
    """Valida um CPF aplicando sanitização, validação de formato e cálculo dos dois dígitos verificadores.

    Args:
        cpf_raw: String bruta contendo o CPF formatado ou não formatado, ou qualquer outro tipo de entrada.

    Returns:
        dict: Dicionário contendo o diagnóstico da validação com a seguinte estrutura:
              {
                  'valid': bool,        # True se o CPF for íntegro e válido, False caso contrário
                  'cpf_clean': str,     # Dígitos numéricos resultantes da sanitização
                  'reason': str         # Mensagem descritiva do resultado da validação
              }
    """
```

**Regras de Negócio:**
- **BR-T06-01**: A função deve retornar obrigatoriamente um dicionário com a chave `'valid'` (booleano), a chave `'cpf_clean'` (string sanitizada com apenas os dígitos numéricos encontrados) e a chave `'reason'` (string explicativa do motivo de sucesso ou falha).
- **BR-T06-02**: A validação deve falhar rapidamente (*fail-fast*):
  1. Executar a sanitização através de `clean_cpf(cpf_raw)`.
  2. Executar a validação estrutural via `is_valid_format(cpf_clean)`. Caso retorne `False` (tamanho diferente de 11, vazio ou sequência de dígitos homogêneos), retornar imediatamente `valid: False` sem calcular os DVs.
  3. Calcular o DV1 esperado com `calculate_dv1(cpf_clean[:9])`. Se o 10º dígito (`int(cpf_clean[9])`) for diferente do esperado, retornar imediatamente `valid: False` sem calcular o DV2.
  4. Calcular o DV2 esperado com `calculate_dv2(cpf_clean[:10])`. Se o 11º dígito (`int(cpf_clean[10])`) for diferente do esperado, retornar `valid: False`.
  5. Se todas as etapas forem satisfeitas, retornar `valid: True`.

**Tratamento de Erros e Casos de Borda:**
- Entradas não-string (`None`, `int`, `float`, `list`, `bool`, etc.) devem ser tratadas graciosamente sem lançar exceções não capturadas, resultando em `cpf_clean: ""` e `valid: False`.
- Strings vazias ou contendo apenas caracteres não numéricos sanitizam para `""` e falham rapidamente em formato com `valid: False`.
- CPFs com 11 dígitos repetidos (ex: `"111.111.111-11"`) falham no formato com `valid: False`.

---

### 4. Cenários de Teste (Fase RED)

- `assert validate_cpf("111.444.777-35") == {"valid": True, "cpf_clean": "11144477735", "reason": "CPF válido"}` (CPF formatado válido com pontuação)
- `assert validate_cpf("11144477735") == {"valid": True, "cpf_clean": "11144477735", "reason": "CPF válido"}` (CPF válido contendo apenas dígitos numéricos)
- `assert validate_cpf(" 529.982.247-25 \n") == {"valid": True, "cpf_clean": "52998224725", "reason": "CPF válido"}` (CPF válido com espaços e quebra de linha)
- `assert validate_cpf("123.123.123-87") == {"valid": True, "cpf_clean": "12312312387", "reason": "CPF válido"}` (CPF válido com repetições parciais)
- `assert validate_cpf("012.345.678-90") == {"valid": True, "cpf_clean": "01234567890", "reason": "CPF válido"}` (CPF válido iniciado por zero e com DV2 zero)
- `assert validate_cpf("111.444.777-45") == {"valid": False, "cpf_clean": "11144477745", "reason": "Primeiro dígito verificador inválido"}` (Falha no primeiro dígito verificador DV1)
- `assert validate_cpf("111.444.777-34") == {"valid": False, "cpf_clean": "11144477734", "reason": "Segundo dígito verificador inválido"}` (DV1 correto, falha no segundo dígito verificador DV2)
- `assert validate_cpf("000.000.000-00") == {"valid": False, "cpf_clean": "00000000000", "reason": "Formato inválido"}` (Fail-fast: rejeição de 11 dígitos homogêneos repetidos)
- `assert validate_cpf("111.111.111-11") == {"valid": False, "cpf_clean": "11111111111", "reason": "Formato inválido"}` (Fail-fast: rejeição de dígitos idênticos)
- `assert validate_cpf("123.456.789") == {"valid": False, "cpf_clean": "123456789", "reason": "Formato inválido"}` (Fail-fast: CPF incompleto com menos de 11 dígitos)
- `assert validate_cpf("123.456.789-012") == {"valid": False, "cpf_clean": "123456789012", "reason": "Formato inválido"}` (Fail-fast: CPF excessivo com mais de 11 dígitos)
- `assert validate_cpf("") == {"valid": False, "cpf_clean": "", "reason": "Formato inválido"}` (Fail-fast: string vazia)
- `assert validate_cpf("abc.def.ghi-jk") == {"valid": False, "cpf_clean": "", "reason": "Formato inválido"}` (Fail-fast: string sem dígitos numéricos)
- `assert validate_cpf(None) == {"valid": False, "cpf_clean": "", "reason": "Formato inválido"}` (Entrada nula: tratamento defensivo de tipo)
- `assert validate_cpf(11144477735) == {"valid": False, "cpf_clean": "", "reason": "Formato inválido"}` (Entrada numérica inteira: tratamento defensivo de tipo)
- `assert validate_cpf(["111.444.777-35"]) == {"valid": False, "cpf_clean": "", "reason": "Formato inválido"}` (Entrada do tipo lista: tratamento defensivo de tipo)
- `assert validate_cpf(False) == {"valid": False, "cpf_clean": "", "reason": "Formato inválido"}` (Entrada booleana: tratamento defensivo de tipo)

---

### 5. Restrições de Arquitetura e Código
- **Bibliotecas**: Utilizar exclusivamente a biblioteca padrão do Python (`typing` e `unittest`). É proibido o uso de pacotes externos.
- **Pacotes e Módulos**:
  - `tests/cpf_validator/src/__init__.py` deve ser preservado.
  - A importação das dependências internas dentro de `tests/cpf_validator/src/validator.py` deve usar importação relativa ou pelo pacote raiz descoberto (`from src.sanitizer import clean_cpf`, `from src.format_validator import is_valid_format`, `from src.verifier import calculate_dv1, calculate_dv2`).
  - No arquivo de testes, importar a fachada como: `from src.validator import validate_cpf`.
  - Runner de execução: `python -m unittest discover -s tests/cpf_validator -v` executado da raiz do repositório.
- **Convenções de Nomenclatura**:
  - Arquivo de produção: `tests/cpf_validator/src/validator.py`.
  - Arquivo de testes: `tests/cpf_validator/test_validator_facade.py`.
  - Classe de teste: `class TestValidatorFacade(unittest.TestCase):`.
  - Assinatura: `def validate_cpf(cpf_raw: Any) -> dict[str, Any]:`.
- **Interpretações Assumidas**:
  - Mensagens padronizadas para o campo `'reason'`:
    - Sucesso: `"CPF válido"`.
    - Falha em formato/sanitização: `"Formato inválido"`.
    - Falha no primeiro DV: `"Primeiro dígito verificador inválido"`.
    - Falha no segundo DV: `"Segundo dígito verificador inválido"`.
  - Se a entrada `cpf_raw` não for uma string válida, a função não deve propagar erro, mas sim utilizar a higienização de `clean_cpf` (que retorna `""`) e falhar rapidamente no formato.
================================================================================
TESTES DA FASE RED (Estágio 2) - o código de produção DEVE fazer todos passarem:
================================================================================
### FILE: tests/cpf_validator/test_validator_facade.py
```python
import unittest
from src.validator import validate_cpf

class TestValidatorFacade(unittest.TestCase):
    """Suíte de testes da fachada de validação de CPF (T06)."""

    def test_valid_formatted_cpf(self):
        """Valida CPF válido fornecido com máscara padrão."""
        result = validate_cpf("111.444.777-35")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "11144477735",
                "reason": "CPF válido",
            },
        )

    def test_valid_unformatted_cpf(self):
        """Valida CPF válido contendo apenas dígitos numéricos."""
        result = validate_cpf("11144477735")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "11144477735",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_with_whitespace_and_newline(self):
        """Valida CPF válido contendo espaços nas extremidades e quebras de linha."""
        result = validate_cpf(" 529.982.247-25 \n")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "52998224725",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_with_partial_repetitions(self):
        """Valida CPF com blocos parciais repetidos mas com dígitos finais válidos."""
        result = validate_cpf("123.123.123-87")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "12312312387",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_starting_with_zero_and_dv2_zero(self):
        """Valida CPF válido com dígito zero à esquerda e DV2 igual a zero."""
        result = validate_cpf("012.345.678-90")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "01234567890",
                "reason": "CPF válido",
            },
        )

    def test_invalid_first_verifier_digit(self):
        """Rejeita CPF cujo primeiro dígito verificador (DV1) está incorreto."""
        result = validate_cpf("111.444.777-45")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11144477745",
                "reason": "Primeiro dígito verificador inválido",
            },
        )

    def test_invalid_second_verifier_digit(self):
        """Rejeita CPF com DV1 correto mas segundo dígito verificador (DV2) incorreto."""
        result = validate_cpf("111.444.777-34")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11144477734",
                "reason": "Segundo dígito verificador inválido",
            },
        )

    def test_fail_fast_all_zeros(self):
        """Rejeita fail-fast CPF com 11 zeros repetidos."""
        result = validate_cpf("000.000.000-00")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "00000000000",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_all_identical_digits(self):
        """Rejeita fail-fast CPF com 11 dígitos idênticos."""
        result = validate_cpf("111.111.111-11")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11111111111",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_incomplete_cpf(self):
        """Rejeita fail-fast CPF com menos de 11 dígitos numéricos."""
        result = validate_cpf("123.456.789")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "123456789",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_excessive_digits(self):
        """Rejeita fail-fast CPF com mais de 11 dígitos numéricos."""
        result = validate_cpf("123.456.789-012")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "123456789012",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_empty_string(self):
        """Rejeita fail-fast string vazia."""
        result = validate_cpf("")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_letters_only_string(self):
        """Rejeita fail-fast string sem nenhum dígito numérico."""
        result = validate_cpf("abc.def.ghi-jk")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_defensive_none_input(self):
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

    def test_defensive_integer_input(self):
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

    def test_defensive_list_input(self):
        """Trata defensivamente entrada do tipo list."""
        result = validate_cpf(["111.444.777-35"])
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_defensive_boolean_input(self):
        """Trata defensivamente entrada do tipo bool."""
        result_false = validate_cpf(False)
        self.assertEqual(
            result_false,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )
        result_true = validate_cpf(True)
        self.assertEqual(
            result_true,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_defensive_dict_and_float_input(self):
        """Trata defensivamente outros tipos não-string (dict e float)."""
        self.assertEqual(
            validate_cpf(123.456),
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )
        self.assertEqual(
            validate_cpf({"cpf": "11144477735"}),
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

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
