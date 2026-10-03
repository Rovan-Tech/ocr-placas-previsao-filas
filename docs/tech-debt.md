# Débito técnico

Atualizado em 2026-09-29, depois do #30 (correção de lint e tipos do backend) e do #31 (setup do
Claude Code e gate de qualidade). A primeira versão deste documento era uma linha de base
tirada **antes** dessas correções, com dívida de `mypy` e `ruff check`; ela não vale mais.

O gate (`python scripts/quality_gate.py --full` e o `ci.yml`) roda `ruff format`, `ruff check`,
`mypy`, `pytest` com cobertura, `diff-cover`, `vulture`, `bandit` e `pip-audit` no backend, e
Prettier, oxlint, Vitest e Playwright no frontend. Rode-o de novo antes de confiar em qualquer
número deste arquivo: ele é uma fotografia.

## Resumo

| Item | Estado |
| --- | --- |
| `ruff format` / Prettier | limpo em todo o código |
| `ruff check` (backend) | **0 avisos** (eram 232 na linha de base) |
| `mypy app` (backend) | **0 erros** (eram 49 em 7 arquivos) |
| `vulture` (código morto, backend) | **0 achados** (`ignore_names = ["cls"]` no `pyproject.toml`) |
| `bandit -r app` | limpo |
| `pip-audit -r requirements.txt` | sem vulnerabilidades conhecidas (rodou local depois de instalar `python3-venv`) |
| Cobertura Vitest concentrada em `src/services/` | por desenho, não é bug (ver abaixo) |
| Ferramenta de "cobertura do diff" no frontend | lacuna de ferramental (ver abaixo) |

## O que foi pago no #30

Foram corrigidas as causas, sem afrouxar nenhuma regra: tipos em `main`, `ocr_service`,
`plate_locator`, `plate_samples` e `vehicle_data_api`; constantes nomeadas no lugar de valores
mágicos; `StrEnum`; `raise ... from`; mensagens de erro em constantes; `itertools.pairwise`;
estado de leitura único no OCR (`_ReadState`) e opções tipadas no gerador de amostras
(`_BuildOptions`). As 41 imagens sintéticas do gerador continuam idênticas byte a byte.

### `# noqa` que sobraram (todos com código e motivo)

| Onde | Regra | Motivo |
| --- | --- | --- |
| handlers do FastAPI com muitos campos (`create_schedule`, `create_checkin`, `upload_plate_image`, `submit_plate_manually`) | `PLR0913`, `PLR0917` | campos de formulário e dependências não podem sair da assinatura sem quebrar a API |
| `_log_upload` (`routers/ocr.py`) | `PLR0913` | campos nomeados do registro de auditoria |
| `get_reader` (`services/ocr_service.py`) | `PLW0603` | singleton preguiçoso protegido por lock |
| `TokenResponse.token_type`, `CHANGE_PASSWORD_PATH` | `S105` | falso positivo: tipo do token OAuth2 e uma rota, não senhas |
| `demo_upload` (`routers/ocr_demo.py`) | `ARG001` | `request` é exigido pelo limiter do `slowapi` |
| `NotConfiguredVerifier.verify` | `ARG002` | assinatura do protocolo |
| `tests/test_security.py` (2) | `S105` | senhas de teste |
| `tests/test_migrations.py` | `F401` | importa os modelos para registrá-los em `Base.metadata` |

Se algum desses handlers ganhar ainda mais campos, o caminho é agrupá-los num modelo, e não
acrescentar mais `noqa`.

## Baixa prioridade

### Cobertura de teste do frontend concentrada em `src/services/`

`npm run test -- --coverage` (Vitest, `vite.config.ts` com `coverage.all: true`) reporta **18,69%
statements** em todo `src/`, mas **~76% em `src/services/`** — os componentes e páginas
(`components/`, `pages/`) aparecem em 0% porque a estratégia de teste do projeto é: **lógica pura
no Vitest, interação de tela no Playwright (E2E)** — ver `.claude/rules/testing.md`. Os specs de
E2E (`frontend/tests/e2e/`) cobrem as telas que o Vitest não cobre. **Não é regressão nem lacuna
real**: leia sempre os dois números juntos (cobertura do Vitest e specs E2E passando).

Os números são de 2026-09-29 e podem ter mudado.

### Sem "cobertura do diff" no frontend

Não existe hoje uma ferramenta equivalente ao `diff-cover` (Python) para medir a cobertura das
linhas alteradas combinando Vitest e E2E no frontend; o `--full` do gate só aplica esse cálculo no
backend. Registrado como lacuna de ferramental, não como dívida de código.

## Limitações conhecidas

- `pip-audit` não audita `torch` e `torchvision` (as versões `+cpu` usadas aqui não existem no
  PyPI); a limitação é a mesma no CI.
- `pip-audit -r requirements.txt` precisa do pacote de sistema `python3-venv` para criar o venv
  isolado; sem ele o comando falha com "ensurepip is not available", o que **não** é achado de
  segurança.
- **SonarQube `python:S930` em `plate_samples.py:37`** (`ImageFont.load_default(size=size)`) —
  falso positivo confirmado em 2026-10-02: a assinatura real da versão de Pillow pinada no
  `requirements.txt` (`pillow==12.3.0`, exata, mesma em todo ambiente) aceita `size` —
  `inspect.signature(ImageFont.load_default)` devolve
  `(size: 'float | None' = None) -> 'FreeTypeFont | ImageFont'`. O parâmetro foi adicionado numa
  versão do Pillow mais recente que a base de conhecimento do analisador do SonarQube, que
  aparenta usar uma assinatura desatualizada da biblioteca. Removê-lo passaria no scanner mas
  seria regressão real (a fonte de reserva voltaria a ignorar o tamanho pedido, usada só quando a
  fonte embutida do repositório, `app/services/fonts/`, falta — hoje inalcançável em qualquer
  ambiente real). Marcado como Falso Positivo direto no painel do SonarQube, não há
  `sonar-project.properties` neste repositório para suprimir por configuração.
