Você é Arquiteto de Software Principal e Tech Lead. Sua missão é reunir todo o contexto necessário e produzir um PROMPT MESTRE autocontido para a implementação da subtarefa abaixo, em Python.

SUBTAREFA: T01
PROJETO: Meu_Board_2
PASTA ALVO (relativa à raiz do repositório): tests/cpf_validator
RUNNER DE TESTES: `python -m unittest discover -s tests/cpf_validator -v` (unittest padrão do Python; os testes importam os módulos de produção como `from src.<modulo> import ...`, pois `tests/cpf_validator` é a raiz de descoberta)

REGRAS:
1. A especificação completa da subtarefa está no fim deste prompt (seção ESPECIFICAÇÃO). NÃO procure um arquivo de especificação em disco.
2. Você pode LER arquivos do workspace para conhecer o que já existe em `tests/cpf_validator` (arquivos de tarefas anteriores). Não escreva nem edite nada.
3. Não invente requisitos que não estejam na especificação. Se algo estiver ambíguo, escolha a interpretação mais simples e registre-a na seção 5.
4. Todos os caminhos de arquivo devem começar com `tests/cpf_validator/`.

FORMATO DE SAÍDA (obrigatório, exatamente estas cinco seções, nesta ordem, com estes títulos):

### 1. Objetivo e Contexto da Subtarefa
[objetivo, dependências de tarefas anteriores, o que já existe no workspace]

### 2. Arquivos Alvo
[lista de caminhos a criar/modificar, um por linha, com o papel de cada um; separe arquivos de produção (`tests/cpf_validator/src/...`) de arquivos de teste (`tests/cpf_validator/test_*.py`)]

### 3. Requisitos Técnicos e Contratos
[assinaturas exatas das funções (nome, parâmetros, tipos, retorno), regras de negócio numeradas (BR-...), tratamento de erros e casos de borda]

### 4. Cenários de Teste (Fase RED)
[lista completa das asserções que os testes devem cobrir, incluindo casos de borda; uma linha por asserção]

### 5. Restrições de Arquitetura e Código
[somente biblioteca padrão do Python; `tests/cpf_validator/src/__init__.py` deve existir; convenções de nomes; interpretações assumidas]

================================================================================
ESPECIFICAÇÃO (fonte da verdade desta subtarefa):
================================================================================
# [T01] T01 — Estrutura de diretórios do Validador de CPF

# T01 — Estrutura de diretórios do Validador de CPF

| Campo | Valor |
|---|---|
| Estágio | Validador de CPF (Isolado em tests/cpf_validator/) |
| ID Tarefa | T01 |
| Depende de | Nenhuma |
| Desbloqueia | T02 |

## 📥 Entradas (Inputs)
- Nenhum

## 📤 Saídas Esperadas (Outputs)
- `tests/cpf_validator/src/__init__.py`

## 🎯 Objetivo Inicial
Criar a estrutura base de pastas e arquivos para o validador de CPF de forma isolada.

## 🔍 Contexto
Garantir que a pasta de testes 'tests/cpf_validator/' exista e contenha a subpasta de código 'src/' para isolamento total.

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-T01-01 | A pasta 'tests/cpf_validator/src' deve existir e ser um pacote Python válido. |


## 📁 Arquivos Alvo a Criar/Editar
- `tests/cpf_validator/src/__init__.py`

