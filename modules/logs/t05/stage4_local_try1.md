Compilação: OK (exit 0)
Testes: OK (exit 0)

```text
ckageStructure.test_import_src_package)
Verifica se importlib.import_module('src') executa com sucesso sem exce��o. ... ok
test_init_file_exists_on_filesystem (test_structure.TestPackageStructure.test_init_file_exists_on_filesystem)
Verifica se o caminho f�sico correspondente a tests/cpf_validator/src/__init__.py existe. ... ok
test_src_file_points_to_init (test_structure.TestPackageStructure.test_src_file_points_to_init)
Verifica se hasattr(src, '__file__') � verdadeiro e aponta para __init__.py. ... ok
test_src_has_path_attribute (test_structure.TestPackageStructure.test_src_has_path_attribute)
Verifica se hasattr(src, '__path__') � verdadeiro, confirmando que src � um pacote. ... ok
test_calculate_dv1_invalid_length_raises_value_error (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_invalid_length_raises_value_error)
Verifica se strings com tamanho diferente de 9 levantam ValueError. ... ok
test_calculate_dv1_invalid_type_raises_type_error (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_invalid_type_raises_type_error)
Verifica se entradas de tipos diferentes de str levantam TypeError. ... ok
test_calculate_dv1_modulo_11_rule_zero_results (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_modulo_11_rule_zero_results)
Verifica se valores com resto >= 10 ou resto 0 resultam em DV1 igual a 0 conforme BR-T04-02. ... ok
test_calculate_dv1_non_digit_characters_raises_value_error (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_non_digit_characters_raises_value_error)
Verifica se strings de 9 caracteres com caracteres n�o-num�ricos levantam ValueError. ... ok
test_calculate_dv1_valid_base_cases (test_verifier_dv1.TestVerifierDv1.test_calculate_dv1_valid_base_cases)
Verifica o c�lculo correto do primeiro d�gito verificador para bases v�lidas. ... ok
test_calculate_dv2_invalid_length_raises_value_error (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_invalid_length_raises_value_error)
Verifica se strings com comprimento diferente de 10 caracteres levantam ValueError. ... ok
test_calculate_dv2_invalid_type_raises_type_error (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_invalid_type_raises_type_error)
Verifica se entradas cujo tipo n�o � str levantam TypeError. ... ok
test_calculate_dv2_modulo_11_rule_zero_results (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_modulo_11_rule_zero_results)
Verifica se valores com resto >= 10 ou resto 0 resultam em DV2 igual a 0 conforme BR-T05-02. ... ok
test_calculate_dv2_non_digit_characters_raises_value_error (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_non_digit_characters_raises_value_error)
Verifica se strings de tamanho 10 contendo caracteres n�o num�ricos levantam ValueError. ... ok
test_calculate_dv2_valid_base_cases (test_verifier_dv2.TestVerifierDv2.test_calculate_dv2_valid_base_cases)
Verifica o c�lculo correto do segundo d�gito verificador para bases v�lidas. ... ok

----------------------------------------------------------------------
Ran 52 tests in 0.003s

OK
```