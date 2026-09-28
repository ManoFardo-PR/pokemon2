### FILE: tests/cpf_validator/test_format_validator.py
```python
import unittest
from src.format_validator import is_valid_format

class TestFormatValidator(unittest.TestCase):
    def test_valid_cpf_format(self):
        self.assertTrue(is_valid_format("12345678901"))

    def test_valid_cpf_with_partial_repetitions(self):
        self.assertTrue(is_valid_format("11144477735"))

    def test_valid_cpf_starting_with_zero(self):
        self.assertTrue(is_valid_format("01234567890"))

    def test_invalid_cpf_all_zeros(self):
        self.assertFalse(is_valid_format("00000000000"))

    def test_invalid_cpf_all_ones(self):
        self.assertFalse(is_valid_format("11111111111"))

    def test_invalid_cpf_all_twos(self):
        self.assertFalse(is_valid_format("22222222222"))

    def test_invalid_cpf_all_threes(self):
        self.assertFalse(is_valid_format("33333333333"))

    def test_invalid_cpf_all_fours(self):
        self.assertFalse(is_valid_format("44444444444"))

    def test_invalid_cpf_all_fives(self):
        self.assertFalse(is_valid_format("55555555555"))

    def test_invalid_cpf_all_sixes(self):
        self.assertFalse(is_valid_format("66666666666"))

    def test_invalid_cpf_all_sevens(self):
        self.assertFalse(is_valid_format("77777777777"))

    def test_invalid_cpf_all_eights(self):
        self.assertFalse(is_valid_format("88888888888"))

    def test_invalid_cpf_all_nines(self):
        self.assertFalse(is_valid_format("99999999999"))

    def test_invalid_cpf_too_short(self):
        self.assertFalse(is_valid_format("1234567890"))

    def test_invalid_cpf_too_long(self):
        self.assertFalse(is_valid_format("123456789012"))

    def test_invalid_cpf_empty_string(self):
        self.assertFalse(is_valid_format(""))

    def test_invalid_cpf_with_letter(self):
        self.assertFalse(is_valid_format("1234567890a"))

    def test_invalid_cpf_with_special_char(self):
        self.assertFalse(is_valid_format("1234567890!"))

    def test_invalid_cpf_with_space(self):
        self.assertFalse(is_valid_format(" 1234567890"))

    def test_invalid_cpf_none_input(self):
        self.assertFalse(is_valid_format(None))

    def test_invalid_cpf_int_input(self):
        self.assertFalse(is_valid_format(12345678901))

    def test_invalid_cpf_list_input(self):
        self.assertFalse(is_valid_format(["12345678901"]))

if __name__ == "__main__":
    unittest.main()
```