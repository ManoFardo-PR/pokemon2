### 1. Objetivo e Contexto da Subtarefa
- **Objetivo**: Implementar o cálculo do segundo dígito verificador (DV2 / 11º dígito) do CPF a partir dos 10 primeiros dígitos (9 dígitos base + DV1) e disponibilizar a suíte de testes unitários correspondente.
- **Dependências de Tarefas Anteriores**: Depende de T04 (`calculate_dv1` em `tests/cpf_validator/src/verifier.py`), que já fornece o primeiro dígito verificador e estabelece os padrões de validação de entrada e convenções de tipo.
- **Estado Atual do Workspace**:
  - `tests/cpf_validator/src/__init__.py` (pacote Python inicializado).
  - `tests/cpf_validator/src/sanitizer.py` (função `clean_cpf` implementada na T02).
  - `tests/cpf_validator/src/format_validator.py` (função `is_valid_format` implementada na T03).
  - `tests/cpf_validator/src/verifier.py` (função `calculate_dv1` implementada na T04).
  - Testes existentes (`test_structure.py`, `test_sanitizer.py`, `test_format_validator.py`, `test_verifier_dv1.py`) passam com 100% de sucesso.

---

### 2. Arquivos Alvo

**Arquivos de Produção:**
- `tests/cpf_validator/src/verifier.py` — Modificar: manter a função `calculate_dv1` e adicionar a função `calculate_dv2(cpf_10_digits: str) -> int`.

**Arquivos de Teste:**
- `tests/cpf_validator/test_verifier_dv2.py` — Criar: suíte de testes unitários `TestVerifierDv2` cobrindo o cálculo de DV2, regras de módulo 11 e tratamento de exceções.

---

### 3. Requisitos Técnicos e Contratos

**Assinatura da Função:**
```python
def calculate_dv2(cpf_10_digits: str) -> int:
    """Calcula o segundo dígito verificador (DV2) a partir dos 10 primeiros dígitos do CPF.

    Args:
        cpf_10_digits: String contendo exatamente os 10 primeiros dígitos numéricos (9 base + DV1).

    Returns:
        int: O segundo dígito verificador calculado (0 a 9).

    Raises:
        TypeError: Se cpf_10_digits não for do tipo str.
        ValueError: Se cpf_10_digits não contiver exatamente 10 dígitos numéricos.
    """
```

**Regras de Negócio:**
- **BR-T05-01**: Multiplicar cada um dos 10 dígitos (posições 0 a 9 da string) pelos pesos decrescentes de 11 a 2 (isto é: `peso = 11 - indice`). Somar os produtos: $\sum_{i=0}^{9} \text{int}(d_i) \times (11 - i)$.
- **BR-T05-02**: Calcular o resultado por módulo 11 (fórmula `(soma * 10) % 11` ou `11 - (soma % 11)`). Se o resultado for 10 ou 11 (resto da divisão por 11 menor que 2 ou `resultado >= 10`), o DV2 resultante deve ser obrigatoriamente `0`. Caso contrário, o DV2 é o próprio resultado (1 a 9).

**Tratamento de Erros e Casos de Borda:**
- Se o parâmetro recebido não for uma instância estrita de `str`, levantar `TypeError`.
- Se o comprimento da string for diferente de 10 caracteres, levantar `ValueError`.
- Se a string contiver qualquer caractere não numérico (espaços, letras, símbolos, pontuações), levantar `ValueError`.

---

### 4. Cenários de Teste (Fase RED)

- `assert calculate_dv2("1114447773") == 5` (base válida padrão com DV1 calculado)
- `assert calculate_dv2("5299822472") == 5` (base válida padrão com DV1 calculado)
- `assert calculate_dv2("1231231238") == 7` (base com repetições parciais válidas)
- `assert calculate_dv2("3905334402") == 8` (base válida com dígitos variados)
- `assert calculate_dv2("1234567890") == 9` (base sequencial com DV1=0 e DV2=9)
- `assert calculate_dv2("0123456789") == 0` (caso de resto gerando DV2 igual a 0 conforme BR-T05-02)
- `assert calculate_dv2("0000000000") == 0` (sequência de zeros gerando soma zero e DV2 igual a 0)
- `assert calculate_dv2("1111111111") == 1` (sequência homogênea de 1s gerando DV2=1)
- `assertRaises(ValueError, calculate_dv2, "")` (string vazia)
- `assertRaises(ValueError, calculate_dv2, "123456789")` (string curta com 9 dígitos)
- `assertRaises(ValueError, calculate_dv2, "12345678901")` (string longa com 11 dígitos)
- `assertRaises(ValueError, calculate_dv2, "123456789a")` (string com 10 caracteres contendo letra)
- `assertRaises(ValueError, calculate_dv2, "123456789 ")` (string com espaço ao final)
- `assertRaises(ValueError, calculate_dv2, " 123456789")` (string com espaço no início)
- `assertRaises(ValueError, calculate_dv2, "111.444.77")` (string com pontuação de formatação)
- `assertRaises(TypeError, calculate_dv2, None)` (entrada nula)
- `assertRaises(TypeError, calculate_dv2, 1114447773)` (entrada numérica inteira)
- `assertRaises(TypeError, calculate_dv2, ["1114447773"])` (entrada do tipo lista)
- `assertRaises(TypeError, calculate_dv2, False)` (entrada booleana)

---

### 5. Restrições de Arquitetura e Código
- **Bibliotecas**: Permitido o uso exclusivo da biblioteca padrão do Python (especificamente `unittest` para testes; nenhum pacote externo).
- **Pacotes e Módulos**:
  - `tests/cpf_validator/src/__init__.py` deve ser preservado.
  - A importação nos testes deve seguir o padrão `from src.verifier import calculate_dv2`.
  - Runner de execução: `python -m unittest discover -s tests/cpf_validator -v`.
- **Convenções de Nomenclatura**:
  - Módulo de teste: `tests/cpf_validator/test_verifier_dv2.py`.
  - Classe de teste: `class TestVerifierDv2(unittest.TestCase):`.
  - Função de produção: `calculate_dv2` com type hints completos e docstring em português.
- **Interpretações Assumidas**:
  - A validação de tipo (`isinstance(cpf_10_digits, str)`) precede a checagem de tamanho e caracteres (`len` e `.isdigit()`).
  - Não deve haver chamada implícita a `clean_cpf` dentro de `calculate_dv2`; a função espera receber a cadeia pré-sanitizada contendo estritamente os 10 dígitos numéricos, falhando com `ValueError` caso contrário.