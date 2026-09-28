Você é Engenheiro de Software Sênior. Está executando a fase GREEN da subtarefa T04, em Python (somente biblioteca padrão).

PASTA ALVO: tests/cpf_validator
RUNNER DE TESTES: `python -m unittest discover -s tests/cpf_validator -v`

================================================================================
PLANO MESTRE (Estágio 1) - seções 2, 3 e 5 definem arquivos, contratos e restrições:
================================================================================
### 1. Objetivo e Contexto da Subtarefa
- **Objetivo**: Implementar em `tests/cpf_validator/src/verifier.py` a função `calculate_dv1(cpf_9_digits: str) -> int` responsável pelo cálculo do primeiro dígito verificador (DV1, 10º dígito do CPF) a partir dos 9 primeiros dígitos numéricos do CPF, utilizando o algoritmo oficial de soma ponderada e módulo 11.
- **Dependências de tarefas anteriores**:
  - `T01`: Estrutura do pacote `src` (`tests/cpf_validator/src/__init__.py`).
  - `T02`: Módulo de higienização (`tests/cpf_validator/src/sanitizer.py`).
  - `T03`: Módulo de validação de formato (`tests/cpf_validator/src/format_validator.py`).
- **O que já existe no workspace**:
  - `tests/cpf_validator/src/__init__.py`: Arquivo de inicialização do pacote `src`.
  - `tests/cpf_validator/src/sanitizer.py`: Implementação da função `clean_cpf(cpf_raw: Any) -> str`.
  - `tests/cpf_validator/src/format_validator.py`: Implementação da função `is_valid_format(cpf_clean: str) -> bool`.
  - `tests/cpf_validator/test_structure.py`, `tests/cpf_validator/test_sanitizer.py`, `tests/cpf_validator/test_format_validator.py`: Suítes de testes unitários existentes (42 testes passando com sucesso via `python -m unittest discover -s tests/cpf_validator -v`).

### 2. Arquivos Alvo
**Arquivos de Produção:**
- `tests/cpf_validator/src/verifier.py`: Implementa a função de cálculo do primeiro dígito verificador `calculate_dv1`.

**Arquivos de Teste:**
- `tests/cpf_validator/test_verifier_dv1.py`: Contém a classe de teste `TestVerifierDv1` baseada em `unittest.TestCase` cobrindo o cálculo com pesos decrescentes, a regra de módulo 11 gerando 0 quando resto >= 10, e os tratamentos de erro para entradas inválidas.

### 3. Requisitos Técnicos e Contratos
- **Assinatura da Função**:
  ```python
  def calculate_dv1(cpf_9_digits: str) -> int:
  ```
  - **Parâmetro**: `cpf_9_digits` (`str`): string contendo exatamente os 9 primeiros dígitos numéricos do CPF.
  - **Retorno**: `int`: valor numérico de 0 a 9 correspondente ao primeiro dígito verificador (DV1).

- **Regras de Negócio**:
  - `BR-T04-01`: Multiplica-se cada um dos 9 primeiros dígitos pelos pesos decrescentes de 10 a 2:
    $$\text{soma} = \sum_{i=0}^{8} (\text{int}(\text{cpf\_9\_digits}[i]) \times (10 - i))$$
  - `BR-T04-02`: O resultado base é dado por $(\text{soma} \times 10) \pmod{11}$. Se o resultado dessa operação for maior ou igual a 10 (ou seja, 10 ou 11), o DV1 deve ser fixado em `0`. Caso contrário, o DV1 é o próprio resultado obtido.

- **Tratamento de Erros e Casos de Borda**:
  - Se `cpf_9_digits` não for uma instância de `str`, levantar `TypeError`.
  - Se o comprimento de `cpf_9_digits` for diferente de 9 caracteres, levantar `ValueError`.
  - Se `cpf_9_digits` contiver qualquer caractere não numérico (`not cpf_9_digits.isdigit()`), levantar `ValueError`.

### 4. Cenários de Teste (Fase RED)
- `self.assertEqual(calculate_dv1("111444777"), 3)`: Primeiro dígito verificador igual a 3 para a base do CPF 111.444.777-35.
- `self.assertEqual(calculate_dv1("529982247"), 2)`: Primeiro dígito verificador igual a 2 para a base do CPF 529.982.247-25.
- `self.assertEqual(calculate_dv1("012345678"), 9)`: Primeiro dígito verificador igual a 9 para base iniciada em zero.
- `self.assertEqual(calculate_dv1("123123123"), 8)`: Primeiro dígito verificador igual a 8 para sequência repetida em blocos.
- `self.assertEqual(calculate_dv1("390533440"), 2)`: Primeiro dígito verificador igual a 2 para base terminada em zero.
- `self.assertEqual(calculate_dv1("111111111"), 1)`: Primeiro dígito verificador igual a 1 para sequência de noves dígitos '1'.
- `self.assertEqual(calculate_dv1("123456789"), 0)`: Soma ponderada resulta em 210, $(210 \times 10) \pmod{11} = 10$, DV1 resultante deve ser 0 conforme BR-T04-02.
- `self.assertEqual(calculate_dv1("000000040"), 0)`: Soma ponderada resulta em 12, $(12 \times 10) \pmod{11} = 10$, DV1 resultante deve ser 0 conforme BR-T04-02.
- `self.assertEqual(calculate_dv1("987654321"), 0)`: Soma ponderada resulta em 330, $(330 \times 10) \pmod{11} = 0$, DV1 resultante deve ser 0.
- `self.assertEqual(calculate_dv1("000000000"), 0)`: Todos os dígitos zeros resultam em soma 0 e DV1 igual a 0.
- `self.assertRaises(ValueError, calculate_dv1, "")`: Entrada vazia deve levantar `ValueError`.
- `self.assertRaises(ValueError, calculate_dv1, "12345678")`: Entrada com 8 dígitos (curta) deve levantar `ValueError`.
- `self.assertRaises(ValueError, calculate_dv1, "1234567890")`: Entrada com 10 dígitos (longa) deve levantar `ValueError`.
- `self.assertRaises(ValueError, calculate_dv1, "12345678a")`: Entrada com caractere alfabético deve levantar `ValueError`.
- `self.assertRaises(ValueError, calculate_dv1, "12345678 ")`: Entrada contendo espaços deve levantar `ValueError`.
- `self.assertRaises(ValueError, calculate_dv1, "123-456-7")`: Entrada contendo pontuação deve levantar `ValueError`.
- `self.assertRaises(TypeError, calculate_dv1, None)`: Entrada do tipo `None` deve levantar `TypeError`.
- `self.assertRaises(TypeError, calculate_dv1, 123456789)`: Entrada do tipo `int` deve levantar `TypeError`.
- `self.assertRaises(TypeError, calculate_dv1, ["123456789"])`: Entrada do tipo `list` deve levantar `TypeError`.

### 5. Restrições de Arquitetura e Código
- **Dependências**: Usar exclusivamente a biblioteca padrão do Python (sem bibliotecas externas).
- **Estrutura de Pacotes**: `tests/cpf_validator/src/__init__.py` já existe e deve ser preservado.
- **Importações nos Testes**: O arquivo `tests/cpf_validator/test_verifier_dv1.py` deve importar a função diretamente com `from src.verifier import calculate_dv1`.
- **Convenções**:
  - Código aderente à PEP 8 com anotações de tipo completas (`type hints`).
  - Classe de teste nomeada como `TestVerifierDv1` herdando de `unittest.TestCase`.
  - Métodos de teste iniciando com o prefixo `test_`.
- **Interpretações Assumidas**:
  - O algoritmo segue o padrão canônico da Receita Federal do Brasil: `resultado = (soma * 10) % 11`; se `resultado >= 10`, `dv1 = 0`, senão `dv1 = resultado` (o que equivale matematicamente a `((soma * 10) % 11) % 10`).
  - Entradas não-string disparam `TypeError`; strings que não possuem exatamente 9 dígitos numéricos decimais ASCII disparam `ValueError`.
================================================================================
TESTES DA FASE RED (Estágio 2) - o código de produção DEVE fazer todos passarem:
================================================================================
### FILE: tests/cpf_validator/test_verifier_dv1.py
```python
import unittest
from src.verifier import calculate_dv1

class TestVerifierDv1(unittest.TestCase):
    """Suíte de testes para a função calculate_dv1 (Fase RED - Subtarefa T04)."""

    def test_calculate_dv1_valid_base_cases(self) -> None:
        """Verifica o cálculo correto do primeiro dígito verificador para bases válidas."""
        self.assertEqual(calculate_dv1("111444777"), 3)
        self.assertEqual(calculate_dv1("529982247"), 2)
        self.assertEqual(calculate_dv1("012345678"), 9)
        self.assertEqual(calculate_dv1("123123123"), 8)
        self.assertEqual(calculate_dv1("390533440"), 2)
        self.assertEqual(calculate_dv1("111111111"), 1)

    def test_calculate_dv1_modulo_11_rule_zero_results(self) -> None:
        """Verifica se valores com resto >= 10 ou resto 0 resultam em DV1 igual a 0 conforme BR-T04-02."""
        self.assertEqual(calculate_dv1("123456789"), 0)
        self.assertEqual(calculate_dv1("000000040"), 0)
        self.assertEqual(calculate_dv1("987654321"), 0)
        self.assertEqual(calculate_dv1("000000000"), 0)

    def test_calculate_dv1_invalid_length_raises_value_error(self) -> None:
        """Verifica se strings com tamanho diferente de 9 levantam ValueError."""
        self.assertRaises(ValueError, calculate_dv1, "")
        self.assertRaises(ValueError, calculate_dv1, "12345678")
        self.assertRaises(ValueError, calculate_dv1, "1234567890")

    def test_calculate_dv1_non_digit_characters_raises_value_error(self) -> None:
        """Verifica se strings de 9 caracteres com caracteres não-numéricos levantam ValueError."""
        self.assertRaises(ValueError, calculate_dv1, "12345678a")
        self.assertRaises(ValueError, calculate_dv1, "12345678 ")
        self.assertRaises(ValueError, calculate_dv1, "123-456-7")

    def test_calculate_dv1_invalid_type_raises_type_error(self) -> None:
        """Verifica se entradas de tipos diferentes de str levantam TypeError."""
        self.assertRaises(TypeError, calculate_dv1, None)
        self.assertRaises(TypeError, calculate_dv1, 123456789)
        self.assertRaises(TypeError, calculate_dv1, ["123456789"])

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
