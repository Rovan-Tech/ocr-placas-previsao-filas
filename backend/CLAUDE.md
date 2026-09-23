# CLAUDE.md — backend

Guia específico do backend. As regras gerais do projeto (nome fictício do porto, nada de APIs
pagas, testes obrigatórios, fluxo de PR) estão no `CLAUDE.md` da raiz e valem aqui também.

## Stack

- Python + FastAPI, servido com Uvicorn
- OpenCV (`opencv-python-headless`) para localizar a placa na foto
- EasyOCR para ler os caracteres — escolhido no lugar do Tesseract porque instala 100% via pip,
  sem binário de sistema. Roda com `gpu=False` para não depender de hardware específico.
- pytest + `httpx` (via `TestClient` do FastAPI) para os testes
- PostgreSQL + SQLAlchemy: planejado, ainda não implementado (`app/models/` está vazio)

## Comandos

Sempre a partir de `backend/`:

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002   # API em http://localhost:8002, Swagger em /docs
pytest                            # testes (pythonpath e testpaths vêm do pyproject.toml)
```

## Estrutura e responsabilidades

```
app/
  main.py         cria o FastAPI e registra os routers — nada de lógica aqui
  routers/        endpoints HTTP: validam entrada, chamam services, traduzem erros em HTTPException
  services/       lógica de domínio, sem depender do FastAPI
    plate_locator.py   recorta a região da placa por contornos + proporção (~3:1 Mercosul)
    ocr_service.py     decodifica a imagem, chama locate_plate e roda o EasyOCR
  models/         modelos SQLAlchemy (a criar)
tests/            um arquivo test_<módulo>.py por router/service
```

Convenções:

- **Router fino, service testável.** Regra de negócio fica em `services/`, recebendo e
  devolvendo tipos simples (`bytes`, `np.ndarray`, `list[dict]`). O router só valida o request e
  converte exceções.
- **Erros de entrada inválida viram `ValueError` no service** e `HTTPException(400)` no router,
  com a mensagem em português (ela aparece para o fiscal no frontend).
- **Mensagens, docstrings e comentários em português**; nomes de código em inglês.
- Novo router: criar em `app/routers/`, com `APIRouter(prefix=..., tags=[...])`, e registrar em
  `app/main.py`.

## Testes

- Testes de endpoint usam `TestClient(app)` e **mockam o service** com
  `@patch("app.routers.<router>.<função>")`, patcheando onde a função é usada, não onde é
  definida. Assim os testes não carregam o modelo do EasyOCR, que é lento e baixa pesos na
  primeira execução.
- Lógica de OpenCV (`plate_locator`) é testada com imagens sintéticas geradas em `numpy`/`cv2`
  dentro do próprio teste — não commitar fotos de placas reais.
- Todo endpoint ou service novo/alterado precisa de teste (ver `CLAUDE.md` da raiz).

## Contrato com o frontend

O frontend (React + TypeScript, em `../frontend`) chama o backend pelo proxy `/api` do Vite,
então não há CORS configurado. Endpoints consumidos hoje:

| Endpoint             | Resposta                                                                      |
| -------------------- | ----------------------------------------------------------------------------- |
| `POST /ocr/upload`   | `{ "filename": str, "detections": [{ "text": str, "confidence": float }] }` |
| `GET /checkins`      | **a criar** — lista de `{ id, plate, created_at, estimated_wait_minutes }`   |

`GET /checkins` aceita `?limit=` (o frontend envia `20`), ordenado do mais recente para o mais
antigo, com `created_at` em ISO 8601. Ao mudar esse formato, atualizar também
`frontend/src/services/api.ts` e `frontend/README.md`.

## Próximos passos planejados

- `docker-compose.yml` na raiz com o PostgreSQL
- Modelo `CheckIn` em `app/models/` e registro do check-in após o OCR
- Validação do formato de placa Mercosul (`AAA0A00`) e do formato antigo (`AAA0000`)
- Fila estimada por média móvel simples sobre os check-ins recentes
