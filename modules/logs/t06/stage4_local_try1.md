Compilação: OK (exit 0)
Testes: OK (exit 0)

```text
al_repetitions (test_validator_facade.TestValidatorFacade.test_valid_cpf_with_partial_repetitions)
Valida CPF com blocos parciais repetidos mas com d�gitos finais v�lidos. ... ok
test_valid_cpf_with_whitespace_and_newline (test_validator_facade.TestValidatorFacade.test_valid_cpf_with_whitespace_and_newline)
Valida CPF v�lido contendo espa�os nas extremidades e quebras de linha. ... ok
test_valid_formatted_cpf (test_validator_facade.TestValidatorFacade.test_valid_formatted_cpf)
Valida CPF v�lido fornecido com m�scara padr�o. ... ok
test_valid_unformatted_cpf (test_validator_facade.TestValidatorFacade.test_valid_unformatted_cpf)
Valida CPF v�lido contendo apenas d�gitos num�ricos. ... ok
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
Ran 70 tests in 0.004s

OK
```