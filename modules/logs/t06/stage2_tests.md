### FILE: tests/cpf_validator/test_validator_facade.py
```python
import unittest
from src.validator import validate_cpf

class TestValidatorFacade(unittest.TestCase):
    """Suíte de testes da fachada de validação de CPF (T06)."""

    def test_valid_formatted_cpf(self):
        """Valida CPF válido fornecido com máscara padrão."""
        result = validate_cpf("111.444.777-35")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "11144477735",
                "reason": "CPF válido",
            },
        )

    def test_valid_unformatted_cpf(self):
        """Valida CPF válido contendo apenas dígitos numéricos."""
        result = validate_cpf("11144477735")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "11144477735",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_with_whitespace_and_newline(self):
        """Valida CPF válido contendo espaços nas extremidades e quebras de linha."""
        result = validate_cpf(" 529.982.247-25 \n")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "52998224725",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_with_partial_repetitions(self):
        """Valida CPF com blocos parciais repetidos mas com dígitos finais válidos."""
        result = validate_cpf("123.123.123-87")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "12312312387",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_starting_with_zero_and_dv2_zero(self):
        """Valida CPF válido com dígito zero à esquerda e DV2 igual a zero."""
        result = validate_cpf("012.345.678-90")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "01234567890",
                "reason": "CPF válido",
            },
        )

    def test_invalid_first_verifier_digit(self):
        """Rejeita CPF cujo primeiro dígito verificador (DV1) está incorreto."""
        result = validate_cpf("111.444.777-45")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11144477745",
                "reason": "Primeiro dígito verificador inválido",
            },
        )

    def test_invalid_second_verifier_digit(self):
        """Rejeita CPF com DV1 correto mas segundo dígito verificador (DV2) incorreto."""
        result = validate_cpf("111.444.777-34")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11144477734",
                "reason": "Segundo dígito verificador inválido",
            },
        )

    def test_fail_fast_all_zeros(self):
        """Rejeita fail-fast CPF com 11 zeros repetidos."""
        result = validate_cpf("000.000.000-00")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "00000000000",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_all_identical_digits(self):
        """Rejeita fail-fast CPF com 11 dígitos idênticos."""
        result = validate_cpf("111.111.111-11")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11111111111",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_incomplete_cpf(self):
        """Rejeita fail-fast CPF com menos de 11 dígitos numéricos."""
        result = validate_cpf("123.456.789")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "123456789",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_excessive_digits(self):
        """Rejeita fail-fast CPF com mais de 11 dígitos numéricos."""
        result = validate_cpf("123.456.789-012")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "123456789012",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_empty_string(self):
        """Rejeita fail-fast string vazia."""
        result = validate_cpf("")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_fail_fast_letters_only_string(self):
        """Rejeita fail-fast string sem nenhum dígito numérico."""
        result = validate_cpf("abc.def.ghi-jk")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_defensive_none_input(self):
        """Trata defensivamente entrada do tipo None."""
        result = validate_cpf(None)
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_defensive_integer_input(self):
        """Trata defensivamente entrada do tipo int."""
        result = validate_cpf(11144477735)
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_defensive_list_input(self):
        """Trata defensivamente entrada do tipo list."""
        result = validate_cpf(["111.444.777-35"])
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_defensive_boolean_input(self):
        """Trata defensivamente entrada do tipo bool."""
        result_false = validate_cpf(False)
        self.assertEqual(
            result_false,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )
        result_true = validate_cpf(True)
        self.assertEqual(
            result_true,
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

    def test_defensive_dict_and_float_input(self):
        """Trata defensivamente outros tipos não-string (dict e float)."""
        self.assertEqual(
            validate_cpf(123.456),
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )
        self.assertEqual(
            validate_cpf({"cpf": "11144477735"}),
            {
                "valid": False,
                "cpf_clean": "",
                "reason": "Formato inválido",
            },
        )

if __name__ == "__main__":
    unittest.main()
```