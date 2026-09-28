Você é Arquiteto de Software Principal e Tech Lead. Sua missão é reunir todo o contexto necessário e produzir um PROMPT MESTRE autocontido para a implementação da subtarefa abaixo, em Python.

SUBTAREFA: T07
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
# [T07] T07 — Teste de Integração e Suíte Global do Validador

# T07 — Teste de Integração e Suíte Global do Validador

| Campo | Valor |
|---|---|
| Estágio | Validador de CPF (Isolado em tests/cpf_validator/) |
| ID Tarefa | T07 |
| Depende de | T06 |
| Desbloqueia | Nenhum |

## 📥 Entradas (Inputs)
- Módulo unificado `tests/cpf_validator/src/validator.py`

## 📤 Saídas Esperadas (Outputs)
- `tests/cpf_validator/test_full_suite.py` com bateria de testes reais e borda

## 🎯 Objetivo Inicial
Validar a suíte completa contra CPFs válidos conhecidos e casos de borda.

## 🔍 Contexto
Garantir 100% de cobertura e funcionamento em um teste end-to-end do módulo criado.

## ⚙️ Regras de Negócio
| ID | Regra de Negócio |
|---|---|
| BR-T07-01 | Todos os testes dentro da pasta 'tests/cpf_validator/' devem passar com sucesso via unittest. |


## 📁 Arquivos Alvo a Criar/Editar
- `tests/cpf_validator/test_full_suite.py`

