### FILE: tests/cpf_validator/src/__init__.py
```python
"""Módulo de validação de CPF."""
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