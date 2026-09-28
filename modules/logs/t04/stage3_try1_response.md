### FILE: tests/cpf_validator/src/__init__.py
```python
"""Pacote src para validação de CPF."""
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
```