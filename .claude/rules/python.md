---
paths:
  - "backend/**/*.py"
---

# Python (backend)

Regras genéricas de código Python. Convenções específicas de domínio (router fino/service
testável, formato de placa, EasyOCR, JWT) estão em [`backend/CLAUDE.md`](../../backend/CLAUDE.md)
e valem junto com este arquivo. Gate de qualidade: `python scripts/quality_gate.py` (ver raiz do
`CLAUDE.md`).

## Sintaxe e tipagem

- Alvo: Python 3.11 (versão do CI, `backend/pyproject.toml` → `[tool.ruff] target-version`).
  Sintaxe moderna: `list[str]`, `dict[str, int]`, `X | None` (nunca `Optional`/`List`/`Dict` de
  `typing`), `StrEnum`/`Enum`, `dataclass(slots=True, frozen=True)` quando o objeto é um DTO
  imutável, `Protocol` para depender de comportamento em vez de classe concreta, `TypedDict` para
  dict com forma fixa, `Literal` para um conjunto fechado de valores, `Final` para constante de
  módulo, `match` só quando reduz `if/elif` encadeado a algo mais legível.
- Tipagem completa em toda função, método e atributo público — parâmetros, retorno e atributos de
  classe. `mypy --strict` roda no gate; `Any` só com um comentário `# type: ignore[código] — motivo`
  na mesma linha (ver "Sem comentários" abaixo: essa é a exceção explícita do `CLAUDE.md` raiz para
  diretivas de ferramenta). `# type: ignore` sem código de erro é bloqueante no code-reviewer.
  - ✅ `def estimate_wait_minutes(checkins: list[CheckIn]) -> int | None: ...`
  - ❌ `def estimate_wait_minutes(checkins) -> Optional[int]: ...`

## Limites objetivos (medidos por ruff/radon no gate)

- Função ≤ 40 linhas · complexidade ciclomática ≤ 10 · ≤ 5 parâmetros (acima disso, um objeto de
  parâmetros/dataclass) · aninhamento ≤ 3 níveis · módulo ≤ 400 linhas · linha ≤ 88 colunas
  (padrão do `ruff format`, sem override).
  - Por quê: acima desses números o code-reviewer historicamente perde bugs de borda escondidos no
    meio da função — o limite força quebrar em passos nomeados antes disso acontecer.
  - ✅ `_read_plate_from_crop(crop)`, `_vote_best_reading(candidates)`, `_apply_review_rules(vote)`
    como três funções pequenas chamadas em sequência.
  - ❌ uma função `read_plate(...)` de 120 linhas fazendo recorte, OCR, votação e decisão de
    revisão tudo junto.

## DRY sem abstração prematura

- Nenhum bloco duplicado com 6+ linhas — vira função/util compartilhado. Mas nenhuma camada,
  classe base ou "framework interno" para um caso de uso hipotético futuro: três linhas parecidas
  em dois lugares são melhores que uma abstração genérica cedo demais (ver "O que não fazer" no
  `CLAUDE.md` raiz).

## Responsabilidade única e acoplamento

- Router fino / service testável (detalhe em `backend/CLAUDE.md`): service recebe e devolve tipos
  simples, sem importar `fastapi`. Funções pequenas e, quando possível, puras (sem I/O) — isola o
  I/O (banco, disco, rede, EasyOCR) nas bordas da função/módulo para poder testar a lógica sem
  mock pesado. Sem estado global mutável (nada de `global`, nada de cache em variável de módulo
  que muda em runtime fora de um objeto de configuração imutável). Composição em vez de herança:
  prefira compor serviços/funções a criar hierarquia de classes.

## Erros

- Exceções específicas (`ValueError`, ou uma exceção própria do domínio) — nunca `except:` nu, nunca
  `except Exception: pass`. Mensagem de exceção é dado técnico (inglês, para debug); mensagem que
  chega ao fiscal via `HTTPException` é traduzida no router (pt-BR, ver `backend/CLAUDE.md`).
  Nunca engolir exceção silenciosamente — se a intenção é "não derrubar a resposta principal"
  (caso do `UploadLog`/`CheckIn`, ver `backend/CLAUDE.md`), capturar a exceção específica esperada
  (`SQLAlchemyError`) e logar, nunca `Exception` genérico.

## Logging

- Módulo `logging`, nunca `print` (bloqueante no gate via ruff `T20`). Sem dado sensível no log
  (senha, token, JWT, foto em base64).

## I/O

- `pathlib.Path` em vez de `os.path`; sempre context manager (`with open(...)`) para arquivo.
  Timeout explícito em toda chamada de rede (`httpx.Client(timeout=...)`, já usado em
  `vehicle_data_api.py` — seguir o mesmo padrão em clientes novos).

## Configuração

- Variável de ambiente via `pydantic-settings` (`app/config.py`), nunca segredo hardcoded no
  código nem lido direto de `os.environ` espalhado pelo código.

## Sem comentários nem docstring (desvio da convenção genérica de Python)

Este projeto decidiu — e já aplica via skill `/clean-code` — que **nenhum comentário ou docstring
fica no código**, nem estilo Google nem qualquer outro: nome de função/variável claro faz esse
papel, e a decisão não-óbvia vai para o `CLAUDE.md` do módulo ou a mensagem do commit (ver "Código
sem comentários" no `CLAUDE.md` raiz). Isso é intencional e mais restritivo que a prática comum de
Python (que pede docstring Google em função pública) — não adicionar docstring "porque é boa
prática": aqui é considerado ruído e o `code-reviewer` reprova. As únicas exceções são diretivas que
mudam o comportamento de uma ferramenta: `# noqa: <código>`, `# nosec`, `# type: ignore[<código>]`
— sempre com o código específico e, quando o motivo não for óbvio pelo nome do erro, uma frase
curta explicando por quê.

## Nomes e imports

- PEP 8 (`snake_case` para função/variável, `PascalCase` para classe), nomes descritivos sem
  abreviação obscura (`checkin`, não `ci`; `employee`, não `emp`). Função com verbo
  (`estimate_wait_minutes`, não `wait_minutes`). Booleano com prefixo `is_`/`has_`/`can_`
  (`is_admin`, `has_strong_evidence`, já usados no código).
- Imports absolutos (`from app.services.auth import ...`), nunca `import *`, nunca import
  circular entre `routers/` e `services/` (a direção é sempre router → service → model).
