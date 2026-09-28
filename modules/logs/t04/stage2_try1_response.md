### FILE: tests/cpf_validator/test_verifier_dv1.py
```python
import unittest
from src.verifier import calculate_dv1

class TestVerifierDv1(unittest.TestCase):
    """Suíte de testes para a função calculate_dv1 (Fase RED - Subtarefa T04)."""

    def test_calculate_dv1_valid_base_cases(self) -> None:
        """Verifica o cálculo correto do primeiro dígito verificador para bases válidas."""
        self.assertEqual(calculate_dv1("111444777"), 3)
        self.assertEqual(calculate_dv1("529982247"), 2)
        self.assertEqual(calculate_dv1("012345678"), 9)
        self.assertEqual(calculate_dv1("123123123"), 8)
        self.assertEqual(calculate_dv1("390533440"), 2)
        self.assertEqual(calculate_dv1("111111111"), 1)

    def test_calculate_dv1_modulo_11_rule_zero_results(self) -> None:
        """Verifica se valores com resto >= 10 ou resto 0 resultam em DV1 igual a 0 conforme BR-T04-02."""
        self.assertEqual(calculate_dv1("123456789"), 0)
        self.assertEqual(calculate_dv1("000000040"), 0)
        self.assertEqual(calculate_dv1("987654321"), 0)
        self.assertEqual(calculate_dv1("000000000"), 0)

    def test_calculate_dv1_invalid_length_raises_value_error(self) -> None:
        """Verifica se strings com tamanho diferente de 9 levantam ValueError."""
        self.assertRaises(ValueError, calculate_dv1, "")
        self.assertRaises(ValueError, calculate_dv1, "12345678")
        self.assertRaises(ValueError, calculate_dv1, "1234567890")

    def test_calculate_dv1_non_digit_characters_raises_value_error(self) -> None:
        """Verifica se strings de 9 caracteres com caracteres não-numéricos levantam ValueError."""
        self.assertRaises(ValueError, calculate_dv1, "12345678a")
        self.assertRaises(ValueError, calculate_dv1, "12345678 ")
        self.assertRaises(ValueError, calculate_dv1, "123-456-7")

    def test_calculate_dv1_invalid_type_raises_type_error(self) -> None:
        """Verifica se entradas de tipos diferentes de str levantam TypeError."""
        self.assertRaises(TypeError, calculate_dv1, None)
        self.assertRaises(TypeError, calculate_dv1, 123456789)
        self.assertRaises(TypeError, calculate_dv1, ["123456789"])

if __name__ == "__main__":
    unittest.main()
```