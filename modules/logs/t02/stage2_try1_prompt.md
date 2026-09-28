Você é Engenheiro de QA Sênior e especialista em TDD. Está executando a fase RED (testes primeiro) da subtarefa T02, em Python, com `unittest` da biblioteca padrão.

PASTA ALVO: tests/cpf_validator
RUNNER DE TESTES: `python -m unittest discover -s tests/cpf_validator -v`

================================================================================
PLANO MESTRE (saída do Estágio 1 - Planejador):
================================================================================
### 1. Objetivo e Contexto da Subtarefa
- **Objetivo**: Implementar o módulo de sanitização de CPF contendo a função `clean_cpf`, responsável por filtrar e manter apenas os caracteres numéricos de uma entrada ou retornar string vazia caso a entrada seja inválida ou não textual.
- **Dependências**: Depende de T01 (estrutura do pacote `tests/cpf_validator/src/` com `__init__.py`). Desbloqueia T03 (validação de tamanho e formato).
- **O que já existe no workspace**: O pacote `tests/cpf_validator/src/__init__.py` e os testes de estrutura `tests/cpf_validator/test_structure.py`, já validados e passando no runner `python -m unittest discover -s tests/cpf_validator -v`.

### 2. Arquivos Alvo
**Arquivos de Produção:**
- `tests/cpf_validator/src/sanitizer.py`: Contém a implementação da função `clean_cpf(cpf_raw: Any) -> str` para higienização e extração de dígitos numéricos.

**Arquivos de Teste:**
- `tests/cpf_validator/test_sanitizer.py`: Suíte de testes unitários com `unittest.TestCase` cobrindo todas as regras de negócio e casos de borda de `clean_cpf`.

### 3. Requisitos Técnicos e Contratos
- **Assinatura da Função**:
  `def clean_cpf(cpf_raw: Any) -> str:`
- **Regras de Negócio**:
  - `BR-T02-01`: A função deve remover pontos (`.`), hífens (`-`), espaços em branco e quaisquer outros caracteres não numéricos presentes na entrada, preservando unicamente dígitos (`0` a `9`).
  - `BR-T02-02`: Se a entrada for nula (`None`) ou de qualquer tipo diferente de string (`int`, `float`, `bool`, `list`, `dict`, etc.), a função deve retornar uma string vazia `""` sem lançar exceções.
- **Tratamento de Erros e Casos de Borda**:
  - Entradas não-string não devem ser convertidas via `str(cpf_raw)`; devem retornar `""` imediatamente.
  - Entradas vazias ou contendo apenas separadores/espaços devem retornar `""`.
  - Espaços em branco (iniciais, intermediários, finais, tabulações `\t` e quebras de linha `\n`) devem ser removidos.

### 4. Cenários de Teste (Fase RED)
- `self.assertEqual(clean_cpf("123.456.789-00"), "12345678900")` para entrada de CPF formatado padrão com pontos e hífen.
- `self.assertEqual(clean_cpf("12345678900"), "12345678900")` para string já contendo apenas dígitos numéricos sem alteração.
- `self.assertEqual(clean_cpf(" 123 456 789 00 "), "12345678900")` para string contendo múltiplos espaços em branco no início, meio e fim.
- `self.assertEqual(clean_cpf("123.456.789/0001-00"), "123456789000100")` para string contendo barras e pontuações variadas.
- `self.assertEqual(clean_cpf("123\t456\n789-00"), "12345678900")` para string contendo tabulações e quebras de linha.
- `self.assertEqual(clean_cpf("abc123def456ghi789j00"), "12345678900")` para string alfanumérica contendo letras intercaladas entre os dígitos.
- `self.assertEqual(clean_cpf(""), "")` para string vazia.
- `self.assertEqual(clean_cpf("   .-.   "), "")` para string contendo apenas pontuações e espaços sem dígitos.
- `self.assertEqual(clean_cpf("!@#$%^&*()_+"), "")` para string contendo apenas caracteres especiais.
- `self.assertEqual(clean_cpf(None), "")` para entrada do tipo `NoneType`.
- `self.assertEqual(clean_cpf(12345678900), "")` para entrada numérica do tipo `int`.
- `self.assertEqual(clean_cpf(123.456), "")` para entrada numérica do tipo `float`.
- `self.assertEqual(clean_cpf(True), "")` para entrada booleana `True`.
- `self.assertEqual(clean_cpf(False), "")` para entrada booleana `False`.
- `self.assertEqual(clean_cpf(["123.456.789-00"]), "")` para entrada do tipo `list`.
- `self.assertEqual(clean_cpf({"cpf": "12345678900"}), "")` para entrada do tipo `dict`.

### 5. Restrições de Arquitetura e Código
- Utilizar exclusivamente a biblioteca padrão do Python (módulo `re` ou métodos nativos de string como `str.isdigit`).
- Não adicionar bibliotecas externas ao projeto.
- Preservar o arquivo `tests/cpf_validator/src/__init__.py` sem sobrescrever seu propósito.
- Os testes em `tests/cpf_validator/test_sanitizer.py` devem importar a função sob teste através de `from src.sanitizer import clean_cpf`.
- Convenções de nomes: arquivo `sanitizer.py`, função `clean_cpf`, arquivo de teste `test_sanitizer.py`, classe de teste `TestCleanCpf(unittest.TestCase)`.
- Interpretações assumidas: A validação de tipo para BR-T02-02 é estrita para `isinstance(cpf_raw, str)`; nenhum tipo primitivo ou composto é coagido para string antes da limpeza. Todo caractere fora do intervalo `'0'` a `'9'` é descartado.
================================================================================

REGRAS:
1. NÃO escreva código de produção. Somente arquivos de teste.
2. Cubra TODAS as asserções da seção 4 do plano mestre, mais os casos de borda das regras de negócio.
3. Os testes devem ser sintaticamente válidos e executáveis pelo runner acima. Eles DEVEM falhar agora (o código de produção ainda não existe) e passar depois que ele for escrito conforme os contratos da seção 3.
4. Importe o código de produção exatamente como o plano define (ex.: `from src.sanitizer import clean_cpf`). Não use imports relativos.
5. Se a tarefa não tiver lógica testável (ex.: só criar um pacote), escreva ao menos um teste que verifique a existência/importação do módulo.
6. Você NÃO tem ferramentas de escrita. Devolva os arquivos no formato abaixo; o orquestrador grava no disco.

FORMATO DE SAÍDA (obrigatório): para cada arquivo, um cabeçalho `### FILE:` com o caminho relativo à raiz do repositório, seguido IMEDIATAMENTE (na linha seguinte) por um bloco de código cercado por ```python e ```. Nenhum texto entre o cabeçalho e a cerca. Explicações, se houver, vêm antes do primeiro cabeçalho e devem ser curtas.

### FILE: tests/cpf_validator/test_exemplo.py
```python
import unittest
from src.exemplo import funcao

class TestExemplo(unittest.TestCase):
    def test_caso(self):
        self.assertEqual(funcao(1), 1)

if __name__ == "__main__":
    unittest.main()
```
