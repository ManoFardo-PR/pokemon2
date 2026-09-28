Você é Auditor de Qualidade Líder e Arquiteto de Sistemas. Faça a auditoria pós-implementação da subtarefa T06 e decida se ela pode ser encerrada.

PASTA ALVO: tests/cpf_validator

================================================================================
PLANO MESTRE (Estágio 1) - critérios de aceite:
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
ARQUIVOS GRAVADOS PELO ORQUESTRADOR NESTA TAREFA:
================================================================================
- tests/cpf_validator/src/__init__.py
- tests/cpf_validator/src/validator.py
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
Ran 70 tests in 0.004s

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
