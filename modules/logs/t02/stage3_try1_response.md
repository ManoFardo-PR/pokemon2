### FILE: tests/cpf_validator/src/__init__.py
```python
"""Módulo de validação de CPF."""
```

### FILE: tests/cpf_validator/src/sanitizer.py
```python
import re
from typing import Any

def clean_cpf(cpf_raw: Any) -> str:
    if not isinstance(cpf_raw, str):
        return ""
    return re.sub(r"[^0-9]", "", cpf_raw)
```