Implementação da fase GREEN da subtarefa T07 mantendo o pacote e a fachada de validação compatíveis com a suíte ponta a ponta.

### FILE: tests/cpf_validator/src/__init__.py
```python
"""Pacote src para validação de CPF."""
```

### FILE: tests/cpf_validator/src/sanitizer.py
```python
import re
from typing import Any

def clean_cpf(cpf_raw: Any) -> str:
    """Sanitiza a entrada de CPF removendo todos os caracteres não numéricos."""
    if not isinstance(cpf_raw, str):
        return ""
    return re.sub(r"[^0-9]", "", cpf_raw)
```

### FILE: tests/cpf_validator/src/format_validator.py
```python
def is_valid_format(cpf_clean: str) -> bool:
    """Valida se o CPF limpo possui exatamente 11 dígitos numéricos e não é composto por dígitos repetidos."""
    if not isinstance(cpf_clean, str):
        return False
    if len(cpf_clean) != 11:
        return False
    if not (cpf_clean.isascii() and cpf_clean.isdigit()):
        return False
    if len(set(cpf_clean)) == 1:
        return False
    return True
```

### FILE: tests/cpf_validator/src/verifier.py
```python
"""Módulo para cálculo e verificação dos dígitos verificadores do CPF."""

def calculate_dv1(cpf_9_digits: str) -> int:
    """Calcula o primeiro dígito verificador (DV1) a partir dos 9 primeiros dígitos do CPF.

    Args:
        cpf_9_digits: String contendo exatamente os 9 primeiros dígitos numéricos.

    Returns:
        int: O primeiro dígito verificador (0-9).

    Raises:
        TypeError: Se cpf_9_digits não for do tipo str.
        ValueError: Se cpf_9_digits não contiver exatamente 9 dígitos numéricos.
    """
    if not isinstance(cpf_9_digits, str):
        raise TypeError(f"Entrada deve ser do tipo str, recebido: {type(cpf_9_digits).__name__}")

    if len(cpf_9_digits) != 9 or not cpf_9_digits.isdigit():
        raise ValueError("cpf_9_digits deve conter exatamente 9 dígitos numéricos.")

    total = sum(int(digit) * (10 - index) for index, digit in enumerate(cpf_9_digits))
    result = (total * 10) % 11

    return 0 if result >= 10 else result

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
    if not isinstance(cpf_10_digits, str):
        raise TypeError(f"Entrada deve ser do tipo str, recebido: {type(cpf_10_digits).__name__}")

    if len(cpf_10_digits) != 10 or not cpf_10_digits.isdigit():
        raise ValueError("cpf_10_digits deve conter exatamente 10 dígitos numéricos.")

    total = sum(int(digit) * (11 - index) for index, digit in enumerate(cpf_10_digits))
    result = (total * 10) % 11

    return 0 if result >= 10 else result
```

### FILE: tests/cpf_validator/src/validator.py
```python
from typing import Any

try:
    from src.sanitizer import clean_cpf
    from src.format_validator import is_valid_format
    from src.verifier import calculate_dv1, calculate_dv2
except ImportError:
    from .sanitizer import clean_cpf
    from .format_validator import is_valid_format
    from .verifier import calculate_dv1, calculate_dv2

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
    cpf_clean = clean_cpf(cpf_raw)

    if not is_valid_format(cpf_clean):
        return {
            "valid": False,
            "cpf_clean": cpf_clean,
            "reason": "Formato inválido",
        }

    dv1_expected = calculate_dv1(cpf_clean[:9])
    if int(cpf_clean[9]) != dv1_expected:
        return {
            "valid": False,
            "cpf_clean": cpf_clean,
            "reason": "Primeiro dígito verificador inválido",
        }

    dv2_expected = calculate_dv2(cpf_clean[:10])
    if int(cpf_clean[10]) != dv2_expected:
        return {
            "valid": False,
            "cpf_clean": cpf_clean,
            "reason": "Segundo dígito verificador inválido",
        }

    return {
        "valid": True,
        "cpf_clean": cpf_clean,
        "reason": "CPF válido",
    }
```