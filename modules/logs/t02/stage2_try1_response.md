### FILE: tests/cpf_validator/test_sanitizer.py
```python
import unittest
from src.sanitizer import clean_cpf

class TestCleanCpf(unittest.TestCase):
    def test_clean_cpf_standard_formatted(self):
        self.assertEqual(clean_cpf("123.456.789-00"), "12345678900")

    def test_clean_cpf_already_only_digits(self):
        self.assertEqual(clean_cpf("12345678900"), "12345678900")

    def test_clean_cpf_with_surrounding_and_inner_spaces(self):
        self.assertEqual(clean_cpf(" 123 456 789 00 "), "12345678900")

    def test_clean_cpf_with_slashes_and_extra_punctuation(self):
        self.assertEqual(clean_cpf("123.456.789/0001-00"), "123456789000100")

    def test_clean_cpf_with_tabs_and_newlines(self):
        self.assertEqual(clean_cpf("123\t456\n789-00"), "12345678900")

    def test_clean_cpf_with_interleaved_letters(self):
        self.assertEqual(clean_cpf("abc123def456ghi789j00"), "12345678900")

    def test_clean_cpf_empty_string(self):
        self.assertEqual(clean_cpf(""), "")

    def test_clean_cpf_only_punctuation_and_spaces(self):
        self.assertEqual(clean_cpf("   .-.   "), "")

    def test_clean_cpf_only_special_characters(self):
        self.assertEqual(clean_cpf("!@#$%^&*()_+"), "")

    def test_clean_cpf_none_input(self):
        self.assertEqual(clean_cpf(None), "")

    def test_clean_cpf_int_input(self):
        self.assertEqual(clean_cpf(12345678900), "")

    def test_clean_cpf_float_input(self):
        self.assertEqual(clean_cpf(123.456), "")

    def test_clean_cpf_bool_true_input(self):
        self.assertEqual(clean_cpf(True), "")

    def test_clean_cpf_bool_false_input(self):
        self.assertEqual(clean_cpf(False), "")

    def test_clean_cpf_list_input(self):
        self.assertEqual(clean_cpf(["123.456.789-00"]), "")

    def test_clean_cpf_dict_input(self):
        self.assertEqual(clean_cpf({"cpf": "12345678900"}), "")

if __name__ == "__main__":
    unittest.main()
```