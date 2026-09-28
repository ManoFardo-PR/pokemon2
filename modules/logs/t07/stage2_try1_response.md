Implementação da suíte de testes ponta a ponta e testes de integração em `tests/cpf_validator/test_full_suite.py` para a fase RED da subtarefa T07.

### FILE: tests/cpf_validator/test_full_suite.py
```python
import unittest
from src.validator import validate_cpf

class TestFullSuite(unittest.TestCase):
    """Suíte consolidada de testes de integração e ponta a ponta para validação de CPF (T07)."""

    def test_known_valid_cpfs_unformatted(self):
        """Valida bateria de CPFs válidos conhecidos fornecidos sem formatação."""
        valid_unformatted_cpfs = [
            "11144477735",
            "52998224725",
            "01234567890",
        ]
        for cpf in valid_unformatted_cpfs:
            with self.subTest(cpf=cpf):
                result = validate_cpf(cpf)
                self.assertEqual(
                    result,
                    {
                        "valid": True,
                        "cpf_clean": cpf,
                        "reason": "CPF válido",
                    },
                )

    def test_known_valid_cpfs_formatted(self):
        """Valida bateria de CPFs válidos conhecidos com máscara padrão."""
        formatted_cases = [
            ("111.444.777-35", "11144477735"),
            ("529.982.247-25", "52998224725"),
            ("012.345.678-90", "01234567890"),
        ]
        for raw_cpf, expected_clean in formatted_cases:
            with self.subTest(raw_cpf=raw_cpf):
                result = validate_cpf(raw_cpf)
                self.assertEqual(
                    result,
                    {
                        "valid": True,
                        "cpf_clean": expected_clean,
                        "reason": "CPF válido",
                    },
                )

    def test_valid_cpf_with_whitespace_and_tabs(self):
        """Valida CPF válido contendo espaçamentos atípicos, quebras de linha e tabulações."""
        raw_cpf = "\t 111.444.777-35 \n"
        result = validate_cpf(raw_cpf)
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "11144477735",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_leading_zero(self):
        """Valida preservação do zero à esquerda em CPF válido com máscara."""
        result = validate_cpf("012.345.678-90")
        self.assertEqual(
            result,
            {
                "valid": True,
                "cpf_clean": "01234567890",
                "reason": "CPF válido",
            },
        )

    def test_valid_cpf_modular_rule_edge_cases_dv_zero(self):
        """Valida CPFs onde o cálculo modular dos dígitos verificadores resulta em zero (resto 0 ou 1)."""
        # "33344455508" possui resto 0 na soma ponderada do DV1 (DV1 = 0)
        # "01234567890" possui resto 1 na soma ponderada do DV2 (DV2 = 0)
        edge_cases = [
            ("333.444.555-08", "33344455508"),
            ("012.345.678-90", "01234567890"),
        ]
        for raw_cpf, expected_clean in edge_cases:
            with self.subTest(raw_cpf=raw_cpf):
                result = validate_cpf(raw_cpf)
                self.assertEqual(
                    result,
                    {
                        "valid": True,
                        "cpf_clean": expected_clean,
                        "reason": "CPF válido",
                    },
                )

    def test_repeated_digits_cpfs_rejection(self):
        """Rejeita em lote todos os 10 CPFs constituídos por dígitos repetidos."""
        for digit in range(10):
            cpf_repeated = str(digit) * 11
            with self.subTest(cpf_repeated=cpf_repeated):
                result = validate_cpf(cpf_repeated)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": cpf_repeated,
                        "reason": "Formato inválido",
                    },
                )

    def test_invalid_dv1_rejection(self):
        """Rejeita CPF com primeiro dígito verificador incorreto."""
        result = validate_cpf("111.444.777-05")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11144477705",
                "reason": "Primeiro dígito verificador inválido",
            },
        )

    def test_invalid_dv2_rejection(self):
        """Rejeita CPF com DV1 correto mas segundo dígito verificador incorreto."""
        result = validate_cpf("111.444.777-30")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "11144477730",
                "reason": "Segundo dígito verificador inválido",
            },
        )

    def test_short_cpf_rejection(self):
        """Rejeita entrada contendo menos de 11 dígitos numéricos."""
        result = validate_cpf("123.456.789")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "123456789",
                "reason": "Formato inválido",
            },
        )

    def test_long_cpf_rejection(self):
        """Rejeita entrada contendo mais de 11 dígitos numéricos."""
        result = validate_cpf("123.456.789-012")
        self.assertEqual(
            result,
            {
                "valid": False,
                "cpf_clean": "123456789012",
                "reason": "Formato inválido",
            },
        )

    def test_empty_and_whitespace_only_rejection(self):
        """Rejeita string vazia e string contendo apenas espaços em branco."""
        for empty_val in ["", "   ", "\t\n  "]:
            with self.subTest(empty_val=repr(empty_val)):
                result = validate_cpf(empty_val)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": "",
                        "reason": "Formato inválido",
                    },
                )

    def test_alphabetic_and_punctuation_only_rejection(self):
        """Rejeita string puramente alfabética ou pontuações sem nenhum dígito."""
        for invalid_raw in ["abc.def.ghi-jk", "...", "---"]:
            with self.subTest(invalid_raw=invalid_raw):
                result = validate_cpf(invalid_raw)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": "",
                        "reason": "Formato inválido",
                    },
                )

    def test_none_input_rejection(self):
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

    def test_integer_input_rejection(self):
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

    def test_boolean_input_rejection(self):
        """Trata defensivamente entradas de tipos booleanos."""
        for bool_val in [True, False]:
            with self.subTest(bool_val=bool_val):
                result = validate_cpf(bool_val)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": "",
                        "reason": "Formato inválido",
                    },
                )

    def test_structured_and_collection_types_rejection(self):
        """Trata defensivamente coleções e outros tipos numéricos (list, dict, float)."""
        inputs = [
            ["111.444.777-35"],
            {"cpf": "11144477735"},
            123.456,
        ]
        for structured_val in inputs:
            with self.subTest(structured_val=type(structured_val).__name__):
                result = validate_cpf(structured_val)
                self.assertEqual(
                    result,
                    {
                        "valid": False,
                        "cpf_clean": "",
                        "reason": "Formato inválido",
                    },
                )

    def test_response_keys_integrity(self):
        """Verifica a integridade do contrato de retorno em cenários válidos e inválidos."""
        expected_keys = {"valid", "cpf_clean", "reason"}
        sample_inputs = [
            "111.444.777-35",
            "000.000.000-00",
            "111.444.777-05",
            "invalid",
            None,
        ]
        for sample in sample_inputs:
            with self.subTest(sample=sample):
                result = validate_cpf(sample)
                self.assertIsInstance(result, dict)
                self.assertEqual(set(result.keys()), expected_keys)
                self.assertIsInstance(result["valid"], bool)
                self.assertIsInstance(result["cpf_clean"], str)
                self.assertIsInstance(result["reason"], str)

if __name__ == "__main__":
    unittest.main()
```