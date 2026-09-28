Compilação: OK (exit 0)
Testes: OK (exit 0)

```text
test_clean_cpf_already_only_digits (test_sanitizer.TestCleanCpf.test_clean_cpf_already_only_digits) ... ok
test_clean_cpf_bool_false_input (test_sanitizer.TestCleanCpf.test_clean_cpf_bool_false_input) ... ok
test_clean_cpf_bool_true_input (test_sanitizer.TestCleanCpf.test_clean_cpf_bool_true_input) ... ok
test_clean_cpf_dict_input (test_sanitizer.TestCleanCpf.test_clean_cpf_dict_input) ... ok
test_clean_cpf_empty_string (test_sanitizer.TestCleanCpf.test_clean_cpf_empty_string) ... ok
test_clean_cpf_float_input (test_sanitizer.TestCleanCpf.test_clean_cpf_float_input) ... ok
test_clean_cpf_int_input (test_sanitizer.TestCleanCpf.test_clean_cpf_int_input) ... ok
test_clean_cpf_list_input (test_sanitizer.TestCleanCpf.test_clean_cpf_list_input) ... ok
test_clean_cpf_none_input (test_sanitizer.TestCleanCpf.test_clean_cpf_none_input) ... ok
test_clean_cpf_only_punctuation_and_spaces (test_sanitizer.TestCleanCpf.test_clean_cpf_only_punctuation_and_spaces) ... ok
test_clean_cpf_only_special_characters (test_sanitizer.TestCleanCpf.test_clean_cpf_only_special_characters) ... ok
test_clean_cpf_standard_formatted (test_sanitizer.TestCleanCpf.test_clean_cpf_standard_formatted) ... ok
test_clean_cpf_with_interleaved_letters (test_sanitizer.TestCleanCpf.test_clean_cpf_with_interleaved_letters) ... ok
test_clean_cpf_with_slashes_and_extra_punctuation (test_sanitizer.TestCleanCpf.test_clean_cpf_with_slashes_and_extra_punctuation) ... ok
test_clean_cpf_with_surrounding_and_inner_spaces (test_sanitizer.TestCleanCpf.test_clean_cpf_with_surrounding_and_inner_spaces) ... ok
test_clean_cpf_with_tabs_and_newlines (test_sanitizer.TestCleanCpf.test_clean_cpf_with_tabs_and_newlines) ... ok
test_import_src_package (test_structure.TestPackageStructure.test_import_src_package)
Verifica se importlib.import_module('src') executa com sucesso sem exce��o. ... ok
test_init_file_exists_on_filesystem (test_structure.TestPackageStructure.test_init_file_exists_on_filesystem)
Verifica se o caminho f�sico correspondente a tests/cpf_validator/src/__init__.py existe. ... ok
test_src_file_points_to_init (test_structure.TestPackageStructure.test_src_file_points_to_init)
Verifica se hasattr(src, '__file__') � verdadeiro e aponta para __init__.py. ... ok
test_src_has_path_attribute (test_structure.TestPackageStructure.test_src_has_path_attribute)
Verifica se hasattr(src, '__path__') � verdadeiro, confirmando que src � um pacote. ... ok

----------------------------------------------------------------------
Ran 20 tests in 0.003s

OK
```