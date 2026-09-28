### FILE: tests/cpf_validator/test_verifier_dv2.py
```python
import unittest
from src.verifier import calculate_dv2

class TestVerifierDv2(unittest.TestCase):
    """Suíte de testes para a função calculate_dv2 (Fase RED - Subtarefa T05)."""

    def test_calculate_dv2_valid_base_cases(self) -> None:
        """Verifica o cálculo correto do segundo dígito verificador para bases válidas."""
        self.assertEqual(calculate_dv2("1114447773"), 5)
        self.assertEqual(calculate_dv2("5299822472"), 5)
        self.assertEqual(calculate_dv2("1231231238"), 7)
        self.assertEqual(calculate_dv2("1234567890"), 9)
        self.assertEqual(calculate_dv2("1111111111"), 1)
        self.assertEqual(calculate_dv2("3905334409"), 8)

    def test_calculate_dv2_modulo_11_rule_zero_results(self) -> None:
        """Verifica se valores com resto >= 10 ou resto 0 resultam em DV2 igual a 0 conforme BR-T05-02."""
        self.assertEqual(calculate_dv2("0123456789"), 0)
        self.assertEqual(calculate_dv2("0000000000"), 0)
        self.assertEqual(calculate_dv2("3905334402"), 0)

    def test_calculate_dv2_invalid_length_raises_value_error(self) -> None:
        """Verifica se strings com comprimento diferente de 10 caracteres levantam ValueError."""
        self.assertRaises(ValueError, calculate_dv2, "")
        self.assertRaises(ValueError, calculate_dv2, "123456789")
        self.assertRaises(ValueError, calculate_dv2, "12345678901")

    def test_calculate_dv2_non_digit_characters_raises_value_error(self) -> None:
        """Verifica se strings de tamanho 10 contendo caracteres não numéricos levantam ValueError."""
        self.assertRaises(ValueError, calculate_dv2, "123456789a")
        self.assertRaises(ValueError, calculate_dv2, "123456789 ")
        self.assertRaises(ValueError, calculate_dv2, " 123456789")
        self.assertRaises(ValueError, calculate_dv2, "111.444.77")
        self.assertRaises(ValueError, calculate_dv2, "12345!6789")

    def test_calculate_dv2_invalid_type_raises_type_error(self) -> None:
        """Verifica se entradas cujo tipo não é str levantam TypeError."""
        self.assertRaises(TypeError, calculate_dv2, None)
        self.assertRaises(TypeError, calculate_dv2, 1114447773)
        self.assertRaises(TypeError, calculate_dv2, ["1114447773"])
        self.assertRaises(TypeError, calculate_dv2, False)
        self.assertRaises(TypeError, calculate_dv2, 1114447773.0)
        self.assertRaises(TypeError, calculate_dv2, {"cpf": "1114447773"})

if __name__ == "__main__":
    unittest.main()
```