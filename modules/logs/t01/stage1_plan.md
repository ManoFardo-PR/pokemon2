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