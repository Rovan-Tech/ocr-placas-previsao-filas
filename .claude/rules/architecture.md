# Arquitetura

Mapa de camadas e direção de dependência deste repositório. Detalhe fino (contrato de API,
fórmula de previsão de fila) está em [`backend/CLAUDE.md`](../../backend/CLAUDE.md).

## Backend

```
routers/  →  services/  →  models/
(HTTP)       (domínio)      (SQLAlchemy)
```

- **`routers/`**: só valida o request (Pydantic/query params), chama um service e converte
  exceção do service em `HTTPException` com mensagem em pt-BR. Zero regra de negócio aqui.
- **`services/`**: toda lógica de domínio — OCR, formato de placa, previsão de fila, auth,
  agendamento. Não importa `fastapi` (nem `Request`, `HTTPException`, `Depends`). Recebe e devolve
  tipos simples (`bytes`, `np.ndarray`, `list[dict]`, dataclass) para ser testável sem subir a
  API.
- **`models/`**: só SQLAlchemy — schema e relacionamento, sem lógica de negócio (uma migração
  Alembic por schema, `NAMING_CONVENTION` de `app/db.py`).

**Proibido**: regra de negócio dentro de um router; SQL cru fora de `services/` (e mesmo lá,
sempre via SQLAlchemy ORM/`text()` com bind params, nunca f-string); service importando
`fastapi`; router chamando outro router.

## Frontend

```
pages/  →  components/  →  services/
(tela)     (peça de UI)    (lógica pura / chamada HTTP)
```

- **`pages/`**: uma tela, orquestra estado e chama `services/`.
- **`components/`**: peça de UI reutilizável, sem chamada HTTP direta (recebe dado e callback via
  props).
- **`services/`**: chamada HTTP (`api.ts`) e lógica pura testável (`plate.ts`,
  `checkinsTrend.ts`, `statusMessage.ts`) — sem JSX aqui.
- **`context/`**: estado global de sessão/tema (`AuthContext`, `ThemeContext`) — só o
  indispensável para não virar prop-drilling; não usar para estado que pertence a uma página só.

**Proibido**: `fetch`/`axios` direto dentro de um componente ou página (sempre via
`services/api.ts`); lógica de formatação de placa/data duplicada num componente em vez de reusar
`services/`.

## Regra geral de dependência

A seta sempre aponta de "mais perto do usuário/HTTP" para "mais perto do domínio/dado" — nunca o
contrário. Um `service` nunca depende de um `router`; um `model` nunca depende de um `service`.
