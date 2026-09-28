### FILE: tests/cpf_validator/src/__init__.py
```python
"""Pacote src para validação de CPF."""
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