Você é Engenheiro de Software Sênior. Está executando a fase GREEN da subtarefa T01, em Python (somente biblioteca padrão).

PASTA ALVO: tests/cpf_validator
RUNNER DE TESTES: `python -m unittest discover -s tests/cpf_validator -v`

================================================================================
PLANO MESTRE (Estágio 1) - seções 2, 3 e 5 definem arquivos, contratos e restrições:
================================================================================
### 1. Objetivo e Contexto da Subtarefa
- **Objetivo**: Criar a estrutura base de diretórios e arquivos para o validador de CPF de forma isolada, estabelecendo `tests/cpf_validator/src` como um pacote Python válido.
- **Dependências de tarefas anteriores**: Nenhuma (subtarefa inicial do estágio Validador de CPF; desbloqueia T02).
- **O que já existe no workspace**: O diretório `tests/cpf_validator` ainda não existe no repositório. Não há arquivos prévios criados para este módulo.

### 2. Arquivos Alvo
Arquivos de produção:
- `tests/cpf_validator/src/__init__.py` — Inicializador do pacote Python `src`, tornando o diretório importável como módulo/pacote de produção.

Arquivos de teste:
- `tests/cpf_validator/test_structure.py` — Teste unitário para validar que a estrutura de diretórios foi criada e que `src` é reconhecido como pacote Python.

### 3. Requisitos Técnicos e Contratos
- **Assinaturas de funções**: T01 não introduz funções ou classes de negócio. O pacote `src` atua como contêiner base para os módulos das subtarefas subsequentes.
- **Regras de Negócio**:
  - `BR-T01-01`: A pasta `tests/cpf_validator/src` deve existir e ser um pacote Python válido contendo `__init__.py`.
- **Tratamento de erros e casos de borda**:
  - Importação de `src` não deve disparar `ModuleNotFoundError` nem `ImportError`.
  - A execução a partir da raiz de descoberta (`tests/cpf_validator`) deve resolver `src` no `sys.path`.

### 4. Cenários de Teste (Fase RED)
- Verificar se `importlib.import_module('src')` é executado com sucesso sem levantar exceção.
- Verificar se `hasattr(src, '__file__')` é verdadeiro e aponta para o arquivo `__init__.py`.
- Verificar se `hasattr(src, '__path__')` é verdadeiro, confirmando que `src` é reconhecido como um pacote Python.
- Verificar se o caminho físico correspondente a `tests/cpf_validator/src/__init__.py` existe no sistema de arquivos.

### 5. Restrições de Arquitetura e Código
- Utilizar estritamente a biblioteca padrão do Python (`os`, `pathlib`, `importlib`, `unittest`).
- O arquivo `tests/cpf_validator/src/__init__.py` deve existir (podendo ser vazio ou conter docstring descritiva do módulo).
- Compatibilidade estrita com o runner: `python -m unittest discover -s tests/cpf_validator -v`.
- Convenções de nomes: nomes de diretórios e arquivos em minúsculas seguindo a PEP 8.
- Interpretações assumidas: Para validação formal via unittest no runner exigido, cria-se o arquivo de teste `tests/cpf_validator/test_structure.py` cobrindo a integridade do pacote `src` conforme a regra `BR-T01-01`.
================================================================================
TESTES DA FASE RED (Estágio 2) - o código de produção DEVE fazer todos passarem:
================================================================================
### FILE: tests/cpf_validator/test_structure.py
```python
import importlib
import os
import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

class TestPackageStructure(unittest.TestCase):
    def test_import_src_package(self):
        """Verifica se importlib.import_module('src') executa com sucesso sem exceção."""
        try:
            src = importlib.import_module("src")
        except (ModuleNotFoundError, ImportError) as exc:
            self.fail(f"Falha ao importar o pacote 'src': {exc}")
        self.assertIsNotNone(src)

    def test_src_file_points_to_init(self):
        """Verifica se hasattr(src, '__file__') é verdadeiro e aponta para __init__.py."""
        src = importlib.import_module("src")
        self.assertTrue(
            hasattr(src, "__file__"),
            "O módulo 'src' não possui o atributo '__file__'.",
        )
        self.assertIsNotNone(src.__file__, "O atributo '__file__' de 'src' está vazio.")
        self.assertTrue(
            os.path.basename(src.__file__).startswith("__init__.py"),
            f"O atributo '__file__' ({src.__file__}) não aponta para '__init__.py'.",
        )

    def test_src_has_path_attribute(self):
        """Verifica se hasattr(src, '__path__') é verdadeiro, confirmando que src é um pacote."""
        src = importlib.import_module("src")
        self.assertTrue(
            hasattr(src, "__path__"),
            "O objeto 'src' não é reconhecido como pacote Python (__path__ ausente).",
        )

    def test_init_file_exists_on_filesystem(self):
        """Verifica se o caminho físico correspondente a tests/cpf_validator/src/__init__.py existe."""
        init_file = BASE_DIR / "src" / "__init__.py"
        self.assertTrue(
            init_file.is_file(),
            f"O arquivo físico de inicialização do pacote não foi encontrado: {init_file}",
        )

if __name__ == "__main__":
    unittest.main()
```
================================================================================

REGRAS:
1. Implemente o MÍNIMO de código de produção que satisfaça todos os testes e os contratos do plano. Não modifique os arquivos de teste.
2. Respeite exatamente os caminhos e assinaturas do plano (ex.: `tests/cpf_validator/src/sanitizer.py` com `def clean_cpf(cpf_raw: str) -> str`).
3. Garanta que `tests/cpf_validator/src/__init__.py` exista (devolva-o, mesmo vazio, se ainda não existir ou se tiver dúvida).
4. Se um módulo já existe de uma tarefa anterior e você precisa acrescentar uma função, devolva o ARQUIVO COMPLETO (o orquestrador sobrescreve o arquivo inteiro). Você pode LER o workspace para ver o conteúdo atual.
5. Você NÃO tem ferramentas de escrita. Devolva os arquivos no formato abaixo; o orquestrador grava no disco.
6. Se houver uma seção de FEEDBACK acima com erros da tentativa anterior, corrija exatamente aqueles erros.

FORMATO DE SAÍDA (obrigatório): para cada arquivo, um cabeçalho `### FILE:` com o caminho relativo à raiz do repositório, seguido IMEDIATAMENTE (na linha seguinte) por um bloco de código cercado por ```python e ```. Nenhum texto entre o cabeçalho e a cerca. Explicações, se houver, vêm antes do primeiro cabeçalho e devem ser curtas.

### FILE: tests/cpf_validator/src/exemplo.py
```python
def funcao(x: int) -> int:
    return x
```
