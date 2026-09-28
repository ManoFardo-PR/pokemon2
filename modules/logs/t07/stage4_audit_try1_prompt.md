Você é Auditor de Qualidade Líder e Arquiteto de Sistemas. Faça a auditoria pós-implementação da subtarefa T07 e decida se ela pode ser encerrada.

PASTA ALVO: tests/cpf_validator

================================================================================
PLANO MESTRE (Estágio 1) - critérios de aceite:
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
ARQUIVOS GRAVADOS PELO ORQUESTRADOR NESTA TAREFA:
================================================================================
- tests/cpf_validator/src/__init__.py
- tests/cpf_validator/src/format_validator.py
- tests/cpf_validator/src/sanitizer.py
- tests/cpf_validator/src/validator.py
- tests/cpf_validator/src/verifier.py
================================================================================
RESULTADO DA VALIDAÇÃO LOCAL (compilação e testes):
================================================================================
Compilação: OK (exit 0)
Testes: OK (exit 0)

```text
al_repetitions (test_validator_facade.TestValidatorFacade.test_valid_cpf_with_partial_repetitions)
Valida CPF com blocos parciais repetidos mas com d�gitos finais v�lidos. ... ok
test_valid_cpf_with_whitespace_and_newline (test_validator_facade.TestValidatorFacade.test_valid_cpf_with_whitespace_and_newline)
Valida CPF v�lido contendo espa�os nas extremidades e quebras de linha. ... ok
test_valid_formatted_cpf (test_validator_facade.TestValidatorFacade.test_valid_formatted_cpf)
Valida CPF v�lido fornecido com m�scara padr�o. ... ok
test_valid_unformatted_cpf (test_validator_facade.TestValidatorFacade.test_valid_unformatted_cpf)
Valida CPF v�lido contendo apenas d�gitos num�ricos. ... ok
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
test_calculate_dv2_invalid_length_raises_value_error (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_invalid_length_raises_value_error)
Verifica se strings com comprimento diferente de 10 caracteres levantam ValueError. ... ok
test_calculate_dv2_invalid_type_raises_type_error (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_invalid_type_raises_type_error)
Verifica se entradas cujo tipo n�o � str levantam TypeError. ... ok
test_calculate_dv2_modulo_11_rule_zero_results (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_modulo_11_rule_zero_results)
Verifica se valores com resto >= 10 ou resto 0 resultam em DV2 igual a 0 conforme BR-T05-02. ... ok
test_calculate_dv2_non_digit_characters_raises_value_error (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_non_digit_characters_raises_value_error)
Verifica se strings de tamanho 10 contendo caracteres n�o num�ricos levantam ValueError. ... ok
test_calculate_dv2_valid_base_cases (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_valid_base_cases)
Verifica o c�lculo correto do segundo d�gito verificador para bases v�lidas. ... ok

----------------------------------------------------------------------
Ran 87 tests in 0.004s

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
