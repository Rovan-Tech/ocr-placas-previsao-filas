# CLAUDE.md — backend

Guia específico do backend. As regras gerais do projeto (nome fictício do porto, nada de APIs
pagas, testes obrigatórios, fluxo de PR) estão no `CLAUDE.md` da raiz e valem aqui também.

## Stack

- Python + FastAPI, servido com Uvicorn
- OpenCV (`opencv-python-headless`) para localizar a placa na foto
- EasyOCR para ler os caracteres — escolhido no lugar do Tesseract porque instala 100% via pip,
  sem binário de sistema. Roda com `gpu=False` para não depender de hardware específico.
- pytest + `httpx` (via `TestClient` do FastAPI) para os testes
- PostgreSQL + SQLAlchemy + Alembic (modelos em `app/models/`: `CheckIn`, `Employee`, `Schedule`,
  `UploadLog`)
- `bcrypt` (hash de senha) + `pyjwt` (token de login) — ver "Login e auditoria" abaixo
- `httpx` (async) para a API Brasil (consulta de dados do veículo) — ver "Check-in inteligente" abaixo

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
    plate_locator.py        candidatos a placa (moldura, bloco de texto e agrupamento de
                             caracteres soltos), endireitados
    image_preprocessing.py  variantes para pouca luz, ruído, reflexo/contraluz, arranhões e tremido
    plate_format.py         formato Mercosul/antigo e correção letra<->número por posição
    ocr_service.py          orquestra: recortes x variantes -> EasyOCR -> votação da placa
    plate_verification.py   ponto de integração com a base oficial (hoje: not_checked)
    auth.py                 hash/verificação de senha, JWT, dependência get_current_employee
    photo_storage.py        salva/lê a foto de resguardo em disco (nunca no banco)
    schedule_matching.py    cruza a placa lida com os agendamentos (hoje/adiantado/atrasado)
    vehicle_data_api.py     cliente da API Brasil (marca/modelo/ano/UF/cor), com fallback gracioso
  models/         modelos SQLAlchemy (CheckIn, Employee, Schedule, UploadLog)
tests/            um arquivo test_<módulo>.py por router/service
```

Convenções:

- **Router fino, service testável.** Regra de negócio fica em `services/`, recebendo e
  devolvendo tipos simples (`bytes`, `np.ndarray`, `list[dict]`). O router só valida o request e
  converte exceções.
- **Erros de entrada inválida viram `ValueError` no service** e `HTTPException(400)` no router,
  com a mensagem em português (ela aparece para o fiscal no frontend).
- **Mensagens de erro (as que aparecem pro fiscal) em português**; nomes de código em inglês.
  Sem comentário nem docstring no código (ver `CLAUDE.md` da raiz e o skill `/clean-code`) — nome
  de função/variável claro faz esse papel; decisão não-óbvia vai pra este arquivo, não pro código.
- Novo router: criar em `app/routers/`, com `APIRouter(prefix=..., tags=[...])`, e registrar em
  `app/main.py`.

## Testes

- Testes de endpoint usam `TestClient(app)` e **mockam o service** com
  `@patch("app.routers.<router>.<função>")`, patcheando onde a função é usada, não onde é
  definida. Assim os testes não carregam o modelo do EasyOCR, que é lento e baixa pesos na
  primeira execução.
- Lógica de OpenCV é testada com imagens sintéticas: `tests/plate_samples.py` gera fotos de
  placa em condições difíceis (seed fixa) — não commitar fotos de placas reais.
- A lógica de escolha da placa (`ocr_service`) é testada com um `FakeReader` roteirizado, sem
  EasyOCR. A precisão de ponta a ponta fica em `tests/test_ocr_accuracy.py` (marcador `ocr_real`,
  ~1-2 min): `hard_cases` (casos calibrados, um por condição — luz, ângulo, sujeira, reflexo,
  contraluz, chuva, arranhões...) e `random_cases` (validação, sorteia as mesmas condições —
  **não calibre o pipeline olhando para ela**, senão ela deixa de medir generalização). Mudou o
  OCR ou adicionou uma condição nova? Rode os dois e atualize a tabela de precisão no `README.md`.
- Regra de segurança do OCR: placa errada só pode sair com `needs_review: false` num número
  pequeno e monitorado de casos (`MAX_SILENT_ERRORS` em `test_ocr_accuracy.py`; hoje 2, ver o
  "Limite conhecido" no `README.md`) — na prática, ou o sistema acerta, ou não devolve placa, ou
  pede pro fiscal conferir. Duas defesas estruturais:
  1. Uma leitura só é "confiável" se pelo menos um recorte com evidência estrutural forte
     (moldura ou bloco de texto) contribuiu para ela — evidência fraca sozinha (agrupamento de
     caracteres, foto inteira) sempre força revisão, mesmo com confiança numérica alta
     (`_Vote.has_strong_evidence`).
  2. `REVIEW_CONFIDENCE` (0.65): leituras abaixo disso sempre pedem revisão.
  Nenhuma das duas pega um defeito que faz um caractere parecer outro caractere válido de
  verdade (ex.: arranhão que fecha o laço de um "9" e vira "8") — aí todas as variantes de
  pré-processamento concordam no mesmo erro, então a votação não ajuda. Isso é um limite
  conhecido e aceito (documentado no `README.md`), não um bug a perseguir infinitamente; a
  correção de verdade é a verificação na base oficial (`plate_verification.py`), quando existir.
- Todo endpoint ou service novo/alterado precisa de teste (ver `CLAUDE.md` da raiz).

## Login e auditoria

- **Sem cadastro aberto.** `POST /auth/employees`, `GET /auth/employees` e
  `DELETE /auth/employees/{id}` só funcionam logado como admin master (`Employee.is_admin`,
  dependência `_require_admin` em `app/routers/auth.py`) — de propósito, para "quem enviou
  cada foto" continuar significando algo. O primeiro admin é criado por
  `scripts/create_employee.py`, direto no banco.
- **Exclusão de funcionário é lógica.** `DELETE /auth/employees/{id}` marca `active=False`,
  nunca apaga a linha — `UploadLog.employee_id` referencia o funcionário, e o histórico de
  quem enviou cada foto precisa sobreviver a alguém sair da empresa. Auto-exclusão é
  bloqueada (400): dado que só um admin ativo chega ao endpoint e não pode excluir a
  própria conta, o próprio chamador sempre continua sendo um admin ativo depois da chamada
  — não existe (nem precisa existir) uma checagem separada de "último admin".
- **Senha sempre temporária no início.** Todo `Employee` novo nasce com
  `must_change_password=True`. `get_current_employee` (em `app/services/auth.py`) bloqueia
  **qualquer** endpoint com 403 (`detail.code == "password_change_required"`) enquanto isso for
  true, ou enquanto `password_is_expired` (30 dias desde `password_set_at`) — só
  `POST /auth/change-password` continua liberado nesse meio-tempo. Ao alterar essa janela, mudar
  `PASSWORD_MAX_AGE` em `auth.py`.
- **Todo router protegido depende de `get_current_employee`.** Novo endpoint que mexe com dado
  do fiscal ou da guarita: adicionar `employee: Employee = Depends(get_current_employee)`, igual
  a `ocr.py`/`logs.py`.
- **`UploadLog`** é escrito em toda chamada a `/ocr/upload` e `/ocr/manual` (helper `_log_upload`
  em `ocr.py`) — nunca deixa a chamada principal falhar por causa do log (só loga a exceção e
  segue, ver `try/except SQLAlchemyError`). Mudou o que é registrado? Atualizar também `GET
  /logs` (`app/routers/logs.py`) e a tabela de precisão/contrato abaixo.
- **Foto de resguardo só existe em disco** (`photo_storage.py`, `UPLOAD_DIR`), nunca em bytea no
  Postgres — decisão explícita do usuário. `UploadLog.photo_path` guarda só o caminho relativo;
  `resolve_photo_path` valida que o caminho não escapa da pasta de upload antes de servir.
- **JWT em HS256 só** — evite adicionar `python-jose` de novo (tem uma CVE conhecida numa
  dependência transitiva, `ecdsa`, por causa de algoritmos ECDSA que este projeto não usa). Use
  `pyjwt`.

## Check-in inteligente (agendamento + dados do veículo)

- **Duas fontes, cruzadas pela placa.** `match_schedule_for_plate` (`schedule_matching.py`)
  procura agendamento pra placa lida; `get_vehicle_data_provider().lookup(plate)`
  (`vehicle_data_api.py`) consulta a API Brasil. `_build_checkin_context` em `ocr.py` chama as
  duas sempre que uma placa em formato válido foi lida (OCR ou digitação manual) e monta
  `PlateReadResponse.checkin` — `None` só quando nenhuma placa foi lida.
- **Regra de status do agendamento**: `on_time` (hoje), `early` (data agendada no futuro),
  `late` (data agendada no passado). Com mais de um agendamento pra mesma placa,
  `match_schedule_for_plate` usa o mais próximo de hoje.
- **A consulta externa roda sempre**, mesmo com agendamento — ela entra como confirmação/
  complemento (marca/modelo/ano/UF/cor), não substitui o agendamento. Isso consome a cota
  diária da API Brasil (100/dia no plano free) em toda leitura de placa válida, de propósito
  (ver o pedido original da feature) — se a cota se mostrar curta, ajustar aqui antes de trocar
  de fornecedor.
- **Nunca derruba o check-in.** `ApiBrasilVehicleDataProvider.lookup` nunca levanta exceção:
  timeout, erro de rede, 429, status != 200, JSON malformado ou placa não encontrada viram
  `None` (com log).
- **Sem os tokens configurados, o factory devolve `MockVehicleDataProvider`** (não
  `NotConfiguredVehicleDataProvider` — removido) em vez de desligar a consulta: mostra um
  perfil de veículo fictício, fixo por placa (`VehicleData.is_mock=True`, `ocr.py` propaga esse
  campo pra `VehicleDataOut`), pra sempre ter algo pra demonstrar sem exigir conta na API
  Brasil. O frontend mostra um aviso de "dados de exemplo" nesse caso (`OcrResult.tsx`). Só
  quando `API_BRASIL_DEVICE_TOKEN`/`API_BRASIL_BEARER_TOKEN` estão preenchidos o factory devolve
  `ApiBrasilVehicleDataProvider` de verdade.
- **Motorista e documento do motorista vêm só do agendamento interno, nunca da API externa** —
  nenhuma API pública de placa devolve esse dado (é restrito Detran/RENAVAM). O parser de
  `vehicle_data_api.py` só extrai marca/modelo/ano/UF/cor.
- **Nomes exatos dos campos da resposta da API Brasil não confirmados**: a documentação
  (`doc.apibrasil.io`) fica atrás de login. `_parse_vehicle_data` tenta variações comuns
  (maiúscula/minúscula, com/sem wrapper `dados`/`response`/`resposta`) — conferir contra uma
  resposta real assim que existir conta de teste, e ajustar `_BRAND_KEYS`/`_MODEL_KEYS`/etc. se
  necessário.
- **Fotos de documento (motorista frente/verso + veículo) seguem a mesma regra de upload do
  resto do projeto**: tipo e tamanho validados, nunca salvas com o nome enviado pelo cliente
  (`photo_storage.py`, subpasta `schedules`), nunca em bytea no banco. O documento do motorista
  tem duas fotos (`driver_document_photo_front_path`/`_back_path`) — CNH e RG normalmente têm
  dado relevante nos dois lados.
- `POST /schedules` e `GET /schedules` exigem login (`get_current_employee`), sem gate de
  admin — cadastro de agendamento é dado operacional, não gestão de funcionário.

## Contrato com o frontend

O frontend (React + TypeScript, em `../frontend`) chama o backend pelo proxy `/api` do Vite,
então não há CORS configurado. Toda chamada abaixo, exceto `/auth/login`, exige
`Authorization: Bearer <token>` (ver `useAuth()`/`api.ts` no frontend). Endpoints consumidos hoje:

| Endpoint                | Resposta                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- |
| `POST /auth/login`      | `{ access_token, token_type, employee, must_change_password }` |
| `GET /auth/me`          | `{ id, username, full_name, is_admin, active }` |
| `POST /auth/change-password` | Mesma forma de `/auth/me` |
| `POST /auth/employees`  | Mesma forma de `/auth/me`, a partir de `{ username, full_name, temporary_password, is_admin? }` |
| `GET /auth/employees`   | Lista de `EmployeeOut` (com `active`) |
| `DELETE /auth/employees/{id}` | Mesma forma de `/auth/me`, com `active: false` |
| `POST /ocr/upload`      | `{ filename, plate, plate_format, confidence, needs_review, verification, detections, checkin }` (ver `PlateReadResponse` em `app/routers/ocr.py` e o `README.md`) |
| `POST /ocr/manual`      | Mesma forma acima + `audit_saved`, a partir de `multipart/form-data` (`plate`, `photo?`, `ocr_plate?`, `ocr_confidence?`) — sempre `confidence: 1.0`, `needs_review: false`, `detections: []`; formato inválido é 400 |
| `GET /logs`             | Lista de `{ id, employee_id, employee_username, endpoint, client_ip, ocr_plate, ocr_confidence, manual_plate, final_plate, final_plate_format, needs_review, has_photo, created_at }` |
| `GET /logs/{id}/photo`  | Arquivo da foto de resguardo (404 se não houver) |
| `POST /schedules`       | `ScheduleOut` (`{ id, plate, driver_name, driver_document, has_driver_document_photo_front, has_driver_document_photo_back, has_vehicle_document_photo, cargo_type, scheduled_date, created_at }`), a partir de `multipart/form-data` (`plate`, `driver_name`, `driver_document`, `cargo_type`, `scheduled_date`, `driver_document_photo_front?`, `driver_document_photo_back?`, `vehicle_document_photo?`) |
| `GET /schedules`        | Lista de `ScheduleOut`; aceita `?plate=` pra filtrar |
| `GET /schedules/{id}/driver-document-photo-front` | Arquivo da foto da frente do documento do motorista (404 se não houver) |
| `GET /schedules/{id}/driver-document-photo-back` | Arquivo da foto do verso do documento do motorista (404 se não houver) |
| `GET /schedules/{id}/vehicle-document-photo` | Arquivo da foto do documento do veículo (404 se não houver) |
| `GET /checkins`         | **a criar** — lista de `{ id, plate, created_at, estimated_wait_minutes }`   |

`checkin` em `PlateReadResponse` é `null` quando nenhuma placa em formato válido foi lida, ou
`{ found, schedule, vehicle_data }`: `schedule` é `null` sem agendamento, senão `{ driver_name,
driver_document, has_driver_document_photo_front, has_driver_document_photo_back,
has_vehicle_document_photo, cargo_type, scheduled_date, status }` (`status`: `"on_time" | "early"
| "late"`); `vehicle_data` é `null` sem retorno da API Brasil, senão `{ brand, model, year, uf,
color }` (qualquer campo pode vir `null` se a API Brasil não devolveu).

Sem agendamento (`checkin.schedule === null`), o frontend oferece cadastrar o motorista/carga/
caminhão na hora, direto na tela de captura (`POST /schedules` com `scheduled_date` de hoje) —
ver "Check-in inteligente" acima e `CapturePage.tsx`/`ScheduleForm.tsx` no frontend.

`GET /checkins` aceita `?limit=` (o frontend envia `20`), ordenado do mais recente para o mais
antigo, com `created_at` em ISO 8601. Ao mudar esse formato, atualizar também
`frontend/src/services/api.ts` e `frontend/README.md`.

## Próximos passos planejados

- Registro do check-in após o OCR e `GET /checkins`
- Fila estimada por média móvel simples sobre os check-ins recentes
- Provedor real em `plate_verification.py`, se houver contrato com a base oficial (SENATRAN/Serpro)
- Medir a precisão com fotos reais da guarita (as métricas atuais são de fotos sintéticas)
- `GET /logs` hoje é visível pra qualquer funcionário logado — se isso precisar virar admin-only,
  é só trocar `get_current_employee` por um novo `_require_admin` em `app/routers/logs.py`
  (mesmo padrão já usado em `auth.py`)
