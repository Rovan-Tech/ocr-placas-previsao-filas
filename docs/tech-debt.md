# Débito técnico — linha de base

Gerado em 2026-09-29, rodando `python scripts/quality_gate.py --full` sobre o código **existente**
antes desta rodada de configuração do Claude Code — nada aqui foi corrigido de propósito (ver
"Código legado" no `CLAUDE.md` raiz: as regras novas valem para código novo/alterado, não
retroativamente). Serve de referência para não confundir "achado pré-existente" com "regressão
introduzida por um PR novo" — e para priorizar se algum dia alguém decidir pagar essa dívida.

Ambiente onde rodou: Ubuntu 24, Python 3.14 (venv sem `python3-venv` do sistema — ver nota do
`pip-audit` abaixo), Node 20. Alguns números podem variar ligeiramente em outra máquina/CI, mas a
ordem de grandeza e os arquivos afetados devem ser os mesmos.

`ruff format .` e `prettier --write .` já foram rodados uma vez em todo o código existente como
parte desta configuração (backend 63/63 arquivos, frontend 36/36) — formatação automática é
mecânica e sem risco de mudar comportamento, então não fazia sentido deixar como dívida só para
"não mexer no que não foi pedido". O que fica como dívida de verdade abaixo é lint semântico
(ruff check) e tipagem (mypy), que exigem julgamento por arquivo e não foram tocados.

## Resumo por prioridade

| Prioridade | Item | Volume |
| --- | --- | --- |
| Alta | mypy (backend) | 51 erros em 9 arquivos |
| Média | ruff check (backend) | 337 achados (ver detalhe por regra) |
| Baixa | vulture (código morto, backend) | 1 achado |
| Baixa | Cobertura Vitest concentrada em `services/` | ver nota abaixo — não é bug |
| Bloqueado no ambiente | `pip-audit` | não rodou nesta sandbox — ver nota |

## Alta prioridade

### mypy --strict — 51 erros em 9 arquivos

Nenhum é um bug de comportamento confirmado (o `pytest` passa 100%); são lacuna de tipagem que
`mypy --strict` só passou a cobrar agora (o projeto não tinha type checker configurado antes).

- `app/services/plate_locator.py` (6 erros) — overload do OpenCV (`getPerspectiveTransform`,
  `normalize`, `erode`) não bate com o tipo que o código passa; provavelmente precisa de
  `cv2.Mat`/cast explícito, não necessariamente bug.
- `app/services/ocr_service.py` (8 erros) — `dict`/`tuple`/`list` sem parâmetro de tipo
  (`dict[str, Any]` em vez de `dict`), uma comparação `Any`/`Any` com operador `/`.
- `app/services/vehicle_data_api.py` (2 erros) — mesmo padrão de `dict` sem parâmetro de tipo.
- `app/models/schedule.py` / `app/models/cargo_item.py` (1 erro cada) — referência cruzada entre
  os dois modelos sem `TYPE_CHECKING`/string forward-ref (`"CargoItem"`), typo do mypy
  (`Schedule` vs `schedule`, o módulo).
- `app/services/queue_prediction.py` (1 erro) — subtração com `datetime | None` sem narrow antes.
- `app/routers/ocr.py` (1 erro) — atribuição de `VehicleDataOut | None` em variável tipada sem
  `| None`.
- `app/main.py` (4 erros) — `lifespan`/`add_security_headers` sem anotação de retorno/parâmetro;
  handler do `slowapi` com assinatura que o `Starlette` não reconhece exatamente (possível
  incompatibilidade de tipo entre `slowapi` e a versão do `starlette` instalada — vale checar via
  context7 antes de "corrigir", pode ser limitação real da lib).

## Média prioridade

### ruff check — 867 achados no backend

Quebra por regra (top 10, `ruff check . --statistics`):

| Regra | Achados | O que é |
| --- | --- | --- |
| `E501` | 554 | linha > 88 colunas (95º percentil das linhas hoje é 94 — a maioria já está perto do limite; resolve com `ruff format`) |
| `PLC0415` | 56 | import fora do topo do módulo (import dentro de função) |
| `B008` | 52 | chamada de função em valor padrão de argumento (comum em `Depends(...)` do FastAPI — **possível falso positivo**, checar antes de "corrigir": é o padrão idiomático do FastAPI) |
| `PLR2004` | 26 | valor mágico em comparação |
| `ANN001` | 26 | argumento de função sem anotação de tipo |
| `PT019` | 16 | fixture do pytest usada como valor, não como fixture |
| `ARG001`/`ARG002`/`ARG005` | 31 | argumento não usado (função, método, lambda) |
| `UP007`/`UP017`/`UP035`/`UP042` | 33 | sintaxe antiga (`Optional[X]` em vez de `X \| None`, `datetime.utcnow`, import antigo, `Enum` em vez de `StrEnum`) |
| `PLR0913`/`PLR0917` | 13 | função com muitos parâmetros/parâmetros posicionais |
| `S105` | 4 | string com cara de senha hardcoded (**checar se é falso positivo** — comum em teste com senha fake) |

`B008` merece nota separada: é o padrão `Depends(...)` do FastAPI usado em toda a base — antes de
"corrigir" isso em qualquer arquivo, confirmar via context7 que não é o jeito idiomático esperado
(muito provavelmente é, e o ideal é adicionar um `per-file-ignore` para `routers/`, não reescrever
o código).

### Formatação não aplicada

- **Backend**: `ruff format --check .` aponta 53 de 63 arquivos `.py` — nunca rodou formatador
  automático neste código antes.
- **Frontend**: `prettier --check .` aponta 36 arquivos (a maior parte do `src/` e `tests/`, mais
  `README.md`) — Prettier é novo neste projeto (ver `.claude/rules/typescript.md`).

Nenhum dos dois foi rodado com `--write`/`--fix` nesta configuração de propósito: reformatar tudo
de uma vez geraria um diff enorme sem relação com a tarefa (ver "Código legado" no `CLAUDE.md`).
Fica para quando o time decidir pagar essa dívida num PR dedicado só a isso.

## Baixa prioridade

### vulture — 1 achado

`app/config.py:21: unused variable 'cls' (100% confidence)` — muito provavelmente falso positivo
(parâmetro `cls` de um `@field_validator`/`@classmethod` do Pydantic, que o vulture não reconhece
como "usado" só por estar na assinatura). Confirmar antes de mexer.

### Cobertura de teste do frontend concentrada em `src/services/`

`npm run test -- --coverage` (Vitest, `vite.config.ts` com `coverage.all: true`) reporta **18,69%
statements** em todo `src/`, mas **~76% em `src/services/`** especificamente — os componentes e
páginas (`components/`, `pages/`) aparecem em 0% porque a estratégia de teste deste projeto
sempre foi: **lógica pura no Vitest, interação de tela no Playwright (E2E)** — ver
`.claude/rules/testing.md`. Os 8 specs de E2E (`frontend/tests/e2e/`) cobrem exatamente as telas
que o Vitest não cobre. **Não é uma regressão nem uma lacuna real** — é só que "cobertura global"
como número único do Vitest conta uma história incompleta neste projeto; leia sempre os dois
números juntos (cobertura Vitest + contagem de specs E2E passando), não o Vitest isolado.

Limitação conhecida do gate atual: não existe hoje uma ferramenta equivalente ao `diff-cover`
(Python) para medir "cobertura das linhas alteradas" combinando Vitest fnj E2E no frontend — o
`--full` do gate só aplica esse cálculo no backend. Registrado aqui como lacuna de ferramental,
não como debt de código.

## Bloqueado no ambiente (não é achado de código)

### pip-audit não rodou nesta sandbox

```
The virtual environment was not created successfully because ensurepip is not available.
```

Este ambiente de execução (sandbox usado para montar esta configuração) não tem o pacote de
sistema `python3-venv` instalado e não há acesso a `sudo` interativo para instalá-lo — `pip-audit`
cria um venv isolado internamente para resolver a árvore de dependências e falha por causa disso,
não por vulnerabilidade real encontrada. **Isto não é um achado de segurança** — é uma limitação
do ambiente onde esta configuração foi montada. Numa máquina normal (ou no CI, que já usa
`ubuntu-latest` com `python3-venv` disponível) o comando roda normalmente; o passo já está no
`ci.yml` e deve ser conferido lá antes de considerar `pip-audit` "testado de verdade".
