Você é Auditor de Qualidade Líder e Arquiteto de Sistemas. Faça a auditoria pós-implementação da subtarefa T02 e decida se ela pode ser encerrada.

PASTA ALVO: tests/cpf_validator

================================================================================
PLANO MESTRE (Estágio 1) - critérios de aceite:
================================================================================
### 1. Objetivo e Contexto da Subtarefa
- **Objetivo**: Implementar o módulo de sanitização de CPF contendo a função `clean_cpf`, responsável por filtrar e manter apenas os caracteres numéricos de uma entrada ou retornar string vazia caso a entrada seja inválida ou não textual.
- **Dependências**: Depende de T01 (estrutura do pacote `tests/cpf_validator/src/` com `__init__.py`). Desbloqueia T03 (validação de tamanho e formato).
- **O que já existe no workspace**: O pacote `tests/cpf_validator/src/__init__.py` e os testes de estrutura `tests/cpf_validator/test_structure.py`, já validados e passando no runner `python -m unittest discover -s tests/cpf_validator -v`.

### 2. Arquivos Alvo
**Arquivos de Produção:**
- `tests/cpf_validator/src/sanitizer.py`: Contém a implementação da função `clean_cpf(cpf_raw: Any) -> str` para higienização e extração de dígitos numéricos.

**Arquivos de Teste:**
- `tests/cpf_validator/test_sanitizer.py`: Suíte de testes unitários com `unittest.TestCase` cobrindo todas as regras de negócio e casos de borda de `clean_cpf`.

### 3. Requisitos Técnicos e Contratos
- **Assinatura da Função**:
  `def clean_cpf(cpf_raw: Any) -> str:`
- **Regras de Negócio**:
  - `BR-T02-01`: A função deve remover pontos (`.`), hífens (`-`), espaços em branco e quaisquer outros caracteres não numéricos presentes na entrada, preservando unicamente dígitos (`0` a `9`).
  - `BR-T02-02`: Se a entrada for nula (`None`) ou de qualquer tipo diferente de string (`int`, `float`, `bool`, `list`, `dict`, etc.), a função deve retornar uma string vazia `""` sem lançar exceções.
- **Tratamento de Erros e Casos de Borda**:
  - Entradas não-string não devem ser convertidas via `str(cpf_raw)`; devem retornar `""` imediatamente.
  - Entradas vazias ou contendo apenas separadores/espaços devem retornar `""`.
  - Espaços em branco (iniciais, intermediários, finais, tabulações `\t` e quebras de linha `\n`) devem ser removidos.

### 4. Cenários de Teste (Fase RED)
- `self.assertEqual(clean_cpf("123.456.789-00"), "12345678900")` para entrada de CPF formatado padrão com pontos e hífen.
- `self.assertEqual(clean_cpf("12345678900"), "12345678900")` para string já contendo apenas dígitos numéricos sem alteração.
- `self.assertEqual(clean_cpf(" 123 456 789 00 "), "12345678900")` para string contendo múltiplos espaços em branco no início, meio e fim.
- `self.assertEqual(clean_cpf("123.456.789/0001-00"), "123456789000100")` para string contendo barras e pontuações variadas.
- `self.assertEqual(clean_cpf("123\t456\n789-00"), "12345678900")` para string contendo tabulações e quebras de linha.
- `self.assertEqual(clean_cpf("abc123def456ghi789j00"), "12345678900")` para string alfanumérica contendo letras intercaladas entre os dígitos.
- `self.assertEqual(clean_cpf(""), "")` para string vazia.
- `self.assertEqual(clean_cpf("   .-.   "), "")` para string contendo apenas pontuações e espaços sem dígitos.
- `self.assertEqual(clean_cpf("!@#$%^&*()_+"), "")` para string contendo apenas caracteres especiais.
- `self.assertEqual(clean_cpf(None), "")` para entrada do tipo `NoneType`.
- `self.assertEqual(clean_cpf(12345678900), "")` para entrada numérica do tipo `int`.
- `self.assertEqual(clean_cpf(123.456), "")` para entrada numérica do tipo `float`.
- `self.assertEqual(clean_cpf(True), "")` para entrada booleana `True`.
- `self.assertEqual(clean_cpf(False), "")` para entrada booleana `False`.
- `self.assertEqual(clean_cpf(["123.456.789-00"]), "")` para entrada do tipo `list`.
- `self.assertEqual(clean_cpf({"cpf": "12345678900"}), "")` para entrada do tipo `dict`.

### 5. Restrições de Arquitetura e Código
- Utilizar exclusivamente a biblioteca padrão do Python (módulo `re` ou métodos nativos de string como `str.isdigit`).
- Não adicionar bibliotecas externas ao projeto.
- Preservar o arquivo `tests/cpf_validator/src/__init__.py` sem sobrescrever seu propósito.
- Os testes em `tests/cpf_validator/test_sanitizer.py` devem importar a função sob teste através de `from src.sanitizer import clean_cpf`.
- Convenções de nomes: arquivo `sanitizer.py`, função `clean_cpf`, arquivo de teste `test_sanitizer.py`, classe de teste `TestCleanCpf(unittest.TestCase)`.
- Interpretações assumidas: A validação de tipo para BR-T02-02 é estrita para `isinstance(cpf_raw, str)`; nenhum tipo primitivo ou composto é coagido para string antes da limpeza. Todo caractere fora do intervalo `'0'` a `'9'` é descartado.
================================================================================
ARQUIVOS GRAVADOS PELO ORQUESTRADOR NESTA TAREFA:
================================================================================
- tests/cpf_validator/src/__init__.py
- tests/cpf_validator/src/sanitizer.py
================================================================================
RESULTADO DA VALIDAÇÃO LOCAL (compilação e testes):
================================================================================
Compilação: OK (exit 0)
Testes: OK (exit 0)

```text
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
Ran 20 tests in 0.003s

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
