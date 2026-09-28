Você é Auditor de Qualidade Líder e Arquiteto de Sistemas. Faça a auditoria pós-implementação da subtarefa T04 e decida se ela pode ser encerrada.

PASTA ALVO: tests/cpf_validator

================================================================================
PLANO MESTRE (Estágio 1) - critérios de aceite:
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
ARQUIVOS GRAVADOS PELO ORQUESTRADOR NESTA TAREFA:
================================================================================
- tests/cpf_validator/src/__init__.py
- tests/cpf_validator/src/verifier.py
================================================================================
RESULTADO DA VALIDAÇÃO LOCAL (compilação e testes):
================================================================================
Compilação: OK (exit 0)
Testes: OK (exit 0)

```text
eanCpf.test_clean_cpf_int_input) ... ok
test_clean_cpf_list_input (test_sanitizer.TestCleanCpf.test_clean_cpf_list_input) ... ok
test_clean_cpf_none_input (test_sanitizer.TestCleanCpf.test_clean_cpf_none_input) ... ok
test_clean_cpf_only_punctuation_and_spaces (test_sanitizer.TestCleanCpf.test_clean_cpf_only_punctuation_and_spaces) ... ok
test_clean_cpf_only_special_characters (test_sanitizer.TestCleanCpf.test_clean_cpf_only_special_characters) ... ok
test_clean_cpf_standard_formatted (test_sanitizer.TestCleanCpf.test_clean_cpf_standard_formatted) ... ok
test_clean_cpf_with_interleaved_letters (test_sanitizer.TestCleanCpf.test_clean_cpf_with_interleaved_letters) ... ok
test_clean_cpf_with_slashes_and_extra_punctuation (test_sanitizer.TestCleanCpf.test_clean_cpf_with_slashes_and_extra_punctuation) ... ok
test_clean_cpf_with_surrounding_and_inner_spaces (test_sanitizer.TestCleanCpf.test_clean_cpf_with_surrounding_and_inner_spaces) ... ok
test_clean_cpf_with_tabs_and_newlines (test_sanitizer.TestCleanCpf.test_clean_cpf_with_tabs_and_newlines) ... ok
test_import_src_package (test_structure.TestPackageStructure.test_import_src_package)
Verifica se importlib.import_module('src') executa com sucesso sem exce��o. ... ok
test_init_file_exists_on_filesystem (test_structure.TestPackageStructure.test_init_file_exists_on_filesystem)
Verifica se o caminho f�sico correspondente a tests/cpf_validator/src/__init__.py existe. ... ok
test_src_file_points_to_init (test_structure.TestPackageStructure.test_src_file_points_to_init)
Verifica se hasattr(src, '__file__') � verdadeiro e aponta para __init__.py. ... ok
test_src_has_path_attribute (test_structure.TestPackageStructure.test_src_has_path_attribute)
Verifica se hasattr(src, '__path__') � verdadeiro, confirmando que src � um pacote. ... ok
test_calculate_dv1_invalid_length_raises_value_error (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_invalid_length_raises_value_error)
Verifica se strings com tamanho diferente de 9 levantam ValueError. ... ok
test_calculate_dv1_invalid_type_raises_type_error (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_invalid_type_raises_type_error)
Verifica se entradas de tipos diferentes de str levantam TypeError. ... ok
test_calculate_dv1_modulo_11_rule_zero_results (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_modulo_11_rule_zero_results)
Verifica se valores com resto >= 10 ou resto 0 resultam em DV1 igual a 0 conforme BR-T04-02. ... ok
test_calculate_dv1_non_digit_characters_raises_value_error (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_non_digit_characters_raises_value_error)
Verifica se strings de 9 caracteres com caracteres n�o-num�ricos levantam ValueError. ... ok
test_calculate_dv1_valid_base_cases (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_valid_base_cases)
Verifica o c�lculo correto do primeiro d�gito verificador para bases v�lidas. ... ok

----------------------------------------------------------------------
Ran 47 tests in 0.002s

OK
```
================================================================================

INSTRUÇÕES:
1. Você pode LER os arquivos do workspace em `tests/cpf_validator` para conferir o conteúdo real. Não escreva nada.
2. Verifique: (a) todos os arquivos da seção 2 do plano existem; (b) as assinaturas da seção 3 foram respeitadas; (c) cada regra de negócio (BR-...) está coberta por teste e implementada; (d) os testes locais passaram; (e) não há código morto, prints de debug ou dependências fora da biblioteca padrão.
3. Seja objetivo. Não peça melhorias cosméticas; só reprove por desvio real de contrato, regra de negócio não atendida, teste ausente para uma regra, ou falha local.

FORMATO DE SAÍDA (obrigatório):

### 1. Checklist de Implementação
- [x] ou [ ] caminho: status

### 2. Conformidade com Regras de Negócio
- BR-...: atendida / não atendida (motivo)

### 3. Desvios e Lacunas
- lista objetiva (ou "Nenhum")

### 4. Veredito
Termine com UMA linha, exatamente neste formato, sem outro texto depois dela:
VERDICT: OK
ou
VERDICT: NOT OK
