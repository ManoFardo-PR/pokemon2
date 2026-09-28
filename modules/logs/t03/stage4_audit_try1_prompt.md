Você é Auditor de Qualidade Líder e Arquiteto de Sistemas. Faça a auditoria pós-implementação da subtarefa T03 e decida se ela pode ser encerrada.

PASTA ALVO: tests/cpf_validator

================================================================================
PLANO MESTRE (Estágio 1) - critérios de aceite:
================================================================================
### 1. Objetivo e Contexto da Subtarefa
- **Objetivo**: Implementar o módulo `format_validator.py` contendo a função `is_valid_format`, responsável por validar se uma string de CPF previamente limpa possui exatamente 11 caracteres numéricos e não é composta por uma sequência de 11 dígitos idênticos.
- **Dependências**: Depende de T02 (`tests/cpf_validator/src/sanitizer.py`, contendo `clean_cpf`) e T01 (`tests/cpf_validator/src/__init__.py`). Desbloqueia T04 (cálculo e validação dos dígitos verificadores).
- **O que já existe no workspace**: Estrutura do pacote `tests/cpf_validator/src/__init__.py`, testes de estrutura `tests/cpf_validator/test_structure.py`, módulo de higienização `tests/cpf_validator/src/sanitizer.py` e testes de higienização `tests/cpf_validator/test_sanitizer.py`, todos validados pelo runner `python -m unittest discover -s tests/cpf_validator -v`.

### 2. Arquivos Alvo
**Arquivos de Produção:**
- `tests/cpf_validator/src/format_validator.py`: Contém a implementação da função `is_valid_format(cpf_clean: str) -> bool` para verificação de tamanho, caracteres puramente numéricos e rejeição de sequências de dígitos repetidos.

**Arquivos de Teste:**
- `tests/cpf_validator/test_format_validator.py`: Contém a suíte de testes unitários com `unittest.TestCase` cobrindo todas as regras de negócio e casos de borda de `is_valid_format`.

### 3. Requisitos Técnicos e Contratos
- **Assinatura da Função**:
  `def is_valid_format(cpf_clean: str) -> bool:`
- **Regras de Negócio**:
  - `BR-T03-01`: O CPF limpo deve ter exatamente 11 caracteres numéricos. Caso a string contenha menos de 11 dígitos, mais de 11 dígitos ou caracteres não numéricos, deve retornar `False`.
  - `BR-T03-02`: CPFs com todos os 11 dígitos repetidos (ex: `'00000000000'`, `'11111111111'`, ..., `'99999999999'`) devem retornar `False`.
- **Tratamento de Erros e Casos de Borda**:
  - Se a entrada for de tipo não-string (`None`, `int`, `list`, etc.), a função deve retornar `False` sem levantar exceções.
  - String vazia `""` deve retornar `False`.
  - Strings com menos de 11 dígitos (ex: `'1234567890'`) ou mais de 11 dígitos (ex: `'123456789012'`) devem retornar `False`.
  - Strings de 11 caracteres que contenham letras, símbolos ou espaços (ex: `'1234567890a'`, `' 1234567890'`) devem retornar `False`.
  - Strings com exatamente 11 dígitos numéricos que não sejam todos idênticos devem retornar `True`.

### 4. Cenários de Teste (Fase RED)
- `self.assertTrue(is_valid_format("12345678901"))` para CPF com 11 dígitos numéricos válidos e variados.
- `self.assertTrue(is_valid_format("11144477735"))` para CPF com 11 dígitos contendo repetições parciais válidas.
- `self.assertTrue(is_valid_format("01234567890"))` para CPF válido de 11 dígitos iniciando em zero.
- `self.assertFalse(is_valid_format("00000000000"))` para sequência de 11 dígitos '0' repetidos.
- `self.assertFalse(is_valid_format("11111111111"))` para sequência de 11 dígitos '1' repetidos.
- `self.assertFalse(is_valid_format("22222222222"))` para sequência de 11 dígitos '2' repetidos.
- `self.assertFalse(is_valid_format("33333333333"))` para sequência de 11 dígitos '3' repetidos.
- `self.assertFalse(is_valid_format("44444444444"))` para sequência de 11 dígitos '4' repetidos.
- `self.assertFalse(is_valid_format("55555555555"))` para sequência de 11 dígitos '5' repetidos.
- `self.assertFalse(is_valid_format("66666666666"))` para sequência de 11 dígitos '6' repetidos.
- `self.assertFalse(is_valid_format("77777777777"))` para sequência de 11 dígitos '7' repetidos.
- `self.assertFalse(is_valid_format("88888888888"))` para sequência de 11 dígitos '8' repetidos.
- `self.assertFalse(is_valid_format("99999999999"))` para sequência de 11 dígitos '9' repetidos.
- `self.assertFalse(is_valid_format("1234567890"))` para string com 10 dígitos (tamanho menor que 11).
- `self.assertFalse(is_valid_format("123456789012"))` para string com 12 dígitos (tamanho maior que 11).
- `self.assertFalse(is_valid_format(""))` para string vazia.
- `self.assertFalse(is_valid_format("1234567890a"))` para string de 11 caracteres contendo letra.
- `self.assertFalse(is_valid_format("1234567890!"))` para string de 11 caracteres contendo caractere especial.
- `self.assertFalse(is_valid_format(" 1234567890"))` para string de 11 caracteres contendo espaço.
- `self.assertFalse(is_valid_format(None))` para entrada `None`.
- `self.assertFalse(is_valid_format(12345678901))` para entrada do tipo `int`.

### 5. Restrições de Arquitetura e Código
- Utilizar exclusivamente recursos da biblioteca padrão do Python (sem bibliotecas externas).
- O arquivo `tests/cpf_validator/src/__init__.py` existe e deve ser preservado.
- Convenções de nomes: módulo de produção `format_validator.py`, função `is_valid_format`, módulo de teste `test_format_validator.py`, classe de teste `TestFormatValidator(unittest.TestCase)`.
- Importação nos testes: a função sob teste deve ser importada como `from src.format_validator import is_valid_format`.
- Interpretações assumidas:
  - A função `is_valid_format` é defensiva quanto ao tipo do parâmetro: caso `cpf_clean` não seja uma instância de `str`, deve retornar `False` diretamente.
  - A regra `BR-T03-02` invalida exclusivamente CPFs cujos 11 dígitos sejam todos iguais entre si (`len(set(cpf_clean)) == 1`); repetições parciais não invalidam o formato.
  - A responsabilidade de `is_valid_format` restringe-se a formato e repetições de dígitos; ela não executa o cálculo aritmético dos dígitos verificadores, o qual cabe à subtarefa subsequente (T04).
================================================================================
ARQUIVOS GRAVADOS PELO ORQUESTRADOR NESTA TAREFA:
================================================================================
- tests/cpf_validator/src/__init__.py
- tests/cpf_validator/src/format_validator.py
================================================================================
RESULTADO DA VALIDAÇÃO LOCAL (compilação e testes):
================================================================================
Compilação: OK (exit 0)
Testes: OK (exit 0)

```text
. ok
test_invalid_cpf_with_special_char (test_format_validator.TestFormatValidator.test_invalid_cpf_with_special_char) ... ok
test_valid_cpf_format (test_format_validator.TestFormatValidator.test_valid_cpf_format) ... ok
test_valid_cpf_starting_with_zero (test_format_validator.TestFormatValidator.test_valid_cpf_starting_with_zero) ... ok
test_valid_cpf_with_partial_repetitions (test_format_validator.TestFormatValidator.test_valid_cpf_with_partial_repetitions) ... ok
test_clean_cpf_already_only_digits (test_sanitizer.TestCleanCpf.test_clean_cpf_already_only_digits) ... ok
test_clean_cpf_bool_false_input (test_sanitizer.TestCleanCpf.test_clean_cpf_bool_false_input) ... ok
test_clean_cpf_bool_true_input (test_sanitizer.TestCleanCpf.test_clean_cpf_bool_true_input) ... ok
test_clean_cpf_dict_input (test_sanitizer.TestCleanCpf.test_clean_cpf_dict_input) ... ok
test_clean_cpf_empty_string (test_sanitizer.TestCleanCpf.test_clean_cpf_empty_string) ... ok
test_clean_cpf_float_input (test_sanitizer.TestCleanCpf.test_clean_cpf_float_input) ... ok
test_clean_cpf_int_input (test_sanitizer.TestCleanCpf.test_clean_cpf_int_input) ... ok
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

----------------------------------------------------------------------
Ran 42 tests in 0.002s

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
