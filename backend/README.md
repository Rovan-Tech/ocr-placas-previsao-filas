# Backend

API em Python (FastAPI) responsável por:

- Login de funcionário (usuário e senha) — todo o resto exige estar logado
- Receber a imagem da placa (upload ou câmera) e localizar/recortar a placa com OpenCV
- Rodar o OCR (EasyOCR, open-source) e validar o formato de placa Mercosul
- Digitação manual da placa, com uma foto de resguardo quando a câmera não lê
- Registrar quem enviou cada foto/placa, de onde, e o que a leitura deu (log de auditoria)
- Cruzar a placa lida com agendamento de chegada e dados do veículo (check-in inteligente)
- Registrar o check-in no PostgreSQL
- Calcular a fila estimada por média móvel do histórico de check-ins

## Rodando localmente

Suba o PostgreSQL (na raiz do repositório, precisa de Docker):

```bash
docker compose up -d
```

O banco fica em `localhost:5433` (porta 5433 para não conflitar com um PostgreSQL já instalado),
usuário/senha `ocr`/`ocr`, banco `ocr_placas`. Um segundo banco, `ocr_placas_test`, é criado junto
para os testes.

Depois, dentro de `backend/`:

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head          # cria/atualiza as tabelas
uvicorn app.main:app --reload --port 8002
```

A URL do banco vem de `DATABASE_URL` (padrão em `app/config.py`, já alinhado ao compose). Para
mudar, copie `.env.example` para `.env`. `JWT_SECRET_KEY` também vem de lá — sem definir, o
servidor gera uma chave aleatória a cada subida, e todo mundo precisa logar de novo a cada
restart (ok pra rodar local; defina no `.env` pra produção). `API_BRASIL_DEVICE_TOKEN`/
`API_BRASIL_BEARER_TOKEN` são opcionais — sem eles, o check-in inteligente funciona só com o
agendamento interno, sem a consulta de dados do veículo (ver "Check-in inteligente" abaixo).

A API sobe em `http://localhost:8002` (`/docs` para a documentação interativa do Swagger).

### Criando o primeiro login (admin master)

Não existe cadastro aberto — veja por quê em "Login e cadastro de funcionário" mais abaixo. O
primeiro admin é criado direto no banco, por quem administra o servidor:

```bash
python scripts/create_employee.py --username admin --full-name "Seu Nome" --admin
```

Ele loga com a senha que digitar ali (é tratada como temporária: no primeiro login, o próprio
script já avisa, tem que trocar por uma definitiva — ver abaixo). Depois disso, o admin cadastra
os demais funcionários logado, em `POST /auth/employees`.

## Testes

```bash
pytest
```

Os testes de precisão do OCR (`tests/test_ocr_accuracy.py`) rodam o EasyOCR de verdade e levam
~1 min. Para pular durante o desenvolvimento: `pytest -m "not ocr_real"`.

Os testes de banco (modelo e migrações) rodam no `ocr_placas_test`, aplicando as migrações do
zero. Se o PostgreSQL não estiver no ar, eles são pulados (`SKIPPED`) e o resto da suíte roda
normalmente.

## Migrações (Alembic)

```bash
alembic upgrade head                                   # aplica as pendentes
alembic revision --autogenerate -m "descrição curta"   # gera uma nova a partir dos modelos
alembic downgrade -1                                   # desfaz a última
```

Revise sempre o arquivo gerado em `migrations/versions/` antes de commitar. O teste
`test_migrations_match_the_models` falha se um modelo mudar sem a migração correspondente.

## O que já existe

- `GET /health` — healthcheck da API
- `GET /health/db` — verifica a conexão com o banco (503 se estiver fora do ar)
- `POST /auth/login` — usuário e senha (form-urlencoded, `username`/`password`), devolve o token
  usado em todo o resto (`Authorization: Bearer <token>`).
- `GET /auth/me` — quem está logado com o token enviado.
- `POST /auth/change-password` — troca a senha; obrigatório no primeiro login (senha temporária)
  e a cada 30 dias (ver "Login e cadastro de funcionário" abaixo).
- `POST /auth/employees` — cadastra um funcionário com uma senha temporária. Só quem já é admin
  master pode chamar (403 pra quem não é).
- `GET /auth/employees` — lista todos os funcionários (ativos e excluídos). Só admin master.
- `DELETE /auth/employees/{id}` — exclusão lógica (marca `active=False`, não apaga a linha:
  o histórico em `UploadLog` continua íntegro). Só admin master; 400 se tentar excluir a
  própria conta (evita o admin se travar fora do sistema sem querer).
- `POST /ocr/upload` — recebe uma imagem (`multipart/form-data`, campo `file`) e devolve a placa
  lida, já validada no formato Mercosul ou antigo (ver "Leitura da placa" abaixo), mais o
  check-in inteligente em `checkin` (ver "Check-in inteligente" abaixo).
- `POST /ocr/manual` — o fiscal digita a placa (câmera não leu, ou ele prefere digitar). Recebe
  `multipart/form-data` com o campo `plate` (`ABC1D23`) e, opcionalmente, `photo` (a foto que não
  saiu boa — guardada em disco como resguardo, nunca no banco, ver "Fotos de resguardo" abaixo),
  `ocr_plate`/`ocr_confidence` (o que o OCR chegou a ler, se chegou). Devolve a mesma forma de
  resposta do `/ocr/upload` (`confidence: 1.0`, `needs_review: false`, `detections: []`), mais
  `audit_saved` (`null` sem foto anexada; `true`/`false` conforme o resguardo foi salvo). O
  formato (Mercosul ou antigo) é decidido sozinho pela ordem dos caracteres — não existe campo
  pra escolher o formato. Texto que não bate com nenhum dos dois formatos é rejeitado com 400,
  sem chegar a normalizar nem a consultar a base oficial.
- `GET /logs` — quem enviou cada foto/placa, de qual endereço, e o que a leitura deu (paginado,
  `?limit=&offset=`). Qualquer funcionário logado pode ver.
- `GET /logs/{id}/photo` — baixa a foto de resguardo daquele log, quando existe (404 se não).
- `POST /schedules` — cadastra um agendamento de chegada (`multipart/form-data`: `plate`,
  `driver_name`, `driver_document`, `cargo_type`, `scheduled_date`, e opcionalmente
  `driver_document_photo`/`vehicle_document_photo`). Qualquer funcionário logado pode cadastrar
  — não é gestão de funcionário, é dado operacional.
- `GET /schedules` — lista os agendamentos (aceita `?plate=` pra filtrar por placa).
- `GET /schedules/{id}/driver-document-photo` e `GET /schedules/{id}/vehicle-document-photo` —
  baixam as fotos dos documentos daquele agendamento, quando existem (404 se não).

### Login e cadastro de funcionário

Não existe cadastro aberto (`POST /auth/register` não existe de propósito): qualquer um poder
criar o próprio login tornaria inútil saber "quem enviou cada foto" (ver `UploadLog` abaixo). O
cadastro é sempre feito por alguém já logado como admin master, em `POST /auth/employees` — com
usuário, nome completo e uma senha temporária, que o admin repassa ao funcionário fora do sistema
(verbalmente, por escrito etc.).

No primeiro login com essa senha temporária — e de novo sempre que a senha atual completar 30
dias —, o servidor bloqueia qualquer outro endpoint com 403 até o funcionário trocá-la
(`POST /auth/change-password`); só esse endpoint continua liberado nesse meio-tempo. É assim que
o sistema garante que toda senha em uso foi escolhida pelo próprio dono da conta, e não fica
velha demais.

O primeiro admin master (que cadastra todos os outros) é criado pelo `scripts/create_employee.py`
— ver "Criando o primeiro login" acima.

### Fotos de resguardo

Quando a câmera não lê a placa e o fiscal digita por cima, a foto original é salva em disco (não
no banco — `app/services/photo_storage.py`), numa pasta local (`backend/data/uploads/`,
configurável por `UPLOAD_DIR`, nunca versionada — ver `.gitignore`). O banco (`UploadLog`) guarda
só o caminho relativo do arquivo, quem enviou, de que IP, e o que a leitura deu — nunca a imagem
em si. `GET /logs/{id}/photo` é o único jeito de baixar essa foto de volta, e também exige login.

### Check-in inteligente

Depois de ler a placa (OCR ou digitação manual), o `/ocr/upload`/`/ocr/manual` cruzam com duas
fontes e devolvem tudo junto em `checkin`:

- **Agendamento interno** (`Schedule`, tabela `schedules`) — motorista, documento, tipo de carga
  e data prevista, cadastrados via `POST /schedules`. `checkin.schedule.status` diz `on_time`
  (agendado pra hoje), `early` (data agendada no futuro — "adiantado") ou `late` (data agendada
  no passado — "atrasado"), sempre com a data agendada original.
- **API Brasil** (`app/services/vehicle_data_api.py`, produto "Consulta Placa Veículo", plano
  free — 100 requisições/dia) — marca, modelo, ano, UF e cor do veículo, em `checkin.vehicle_data`.
  Roda sempre que uma placa válida é lida, mesmo com agendamento (entra como confirmação/
  complemento). Precisa de `API_BRASIL_DEVICE_TOKEN`/`API_BRASIL_BEARER_TOKEN` no `.env`
  (conta grátis em app.apibrasil.io) — sem eles, essa parte fica desligada e o check-in segue só
  com o agendamento. Qualquer falha (timeout, rede, limite diário estourado, resposta malformada)
  vira `null` sem derrubar o check-in.

`checkin.found` indica se a placa foi reconhecida em qualquer uma das duas fontes; `null` quando
nenhuma placa em formato válido foi lida. Motorista e documento do motorista vêm **só** do
agendamento interno — nenhuma API pública de placa devolve esse dado (é restrito Detran/RENAVAM).

### Leitura da placa

Pipeline do `POST /ocr/upload`, pensado para fotos de celular tiradas na guarita:

1. **Localização** (`plate_locator.py`): procura regiões com cara de placa por três caminhos —
   moldura do retângulo, bloco de texto escuro sobre fundo claro e, quando os dois anteriores só
   acham pedaços soltos (ex.: moiré de fotografar uma tela, ou textura do para-choque num ângulo
   ruim, quebram cada letra num contorno separado), agrupamento dos caracteres isolados pela
   linha de base — com uma checagem de espaçamento horizontal pra não "encadear" um caractere de
   ruído distante da placa. Pontua cada região pela textura de caracteres e endireita rotação e
   perspectiva. Os 3 melhores recortes são testados, e a foto inteira entra só como último
   recurso.
2. **Pré-processamento** (`image_preprocessing.py`): variantes para pouca luz (gama, CLAHE),
   granulado noturno (redução de ruído), reflexo/contraluz, arranhões longos e retos (detectados
   por transformada de Hough e removidos por inpainting — só quando o arranhão é comprido o
   bastante pra não ser confundido com o traço de uma letra), tinta desbotada e foto tremida
   (nitidez). As mais pesadas só rodam quando a imagem pede.
3. **OCR** (EasyOCR) com alfabeto restrito a `A-Z`, `0-9` e hífen.
4. **Formato e correção** (`plate_format.py`): só texto no formato `LLLNLNN` (Mercosul) ou `LLLNNNN`
   (antigo) é aceito como placa. Trocas típicas (`O`/`0`, `I`/`1`, `B`/`8`...) são corrigidas
   pela posição. A 5ª posição nunca é alterada, porque é ela que diferencia os dois formatos.
5. **Votação** (`ocr_service.py`): cada leitura válida de cada variante vale um voto, e para cedo
   quando a leitura já é confiável. Leitura cortada (ex.: `MA-8376`) pula direto para um recorte
   mais largo. Orçamento de tempo: passados 2,5 s, responde com o que já tiver lido; em 3,5 s,
   responde de qualquer jeito (pior caso medido: ~4 s). Confiança baixa, duas placas disputando ou
   uma leitura que só existe graças ao agrupamento de caracteres ou à foto inteira (evidência mais
   frágil — ver `_Vote.has_strong_evidence` em `ocr_service.py`) põem `needs_review: true`: o
   fiscal confere no veículo. Essa última regra existe porque, sem ela, uma leitura de último
   recurso pode "concordar consigo mesma" nas várias variantes de pré-processamento e sair com
   confiança alta mesmo estando errada — dado que todas leem o mesmo defeito real da imagem
   (ex.: sujeira sobre um caractere), a votação sozinha não pega esse tipo de erro.
6. **Verificação oficial** (`plate_verification.py`): ponto de integração. Não há API pública e
   gratuita do governo para consultar placas (o acesso oficial à base da SENATRAN é pago, via
   Serpro, e automatizar o Sinesp Cidadão viola os termos de uso). Por isso a resposta hoje é
   sempre `not_checked`. Os status `regular`, `irregular`, `not_found` e `unavailable` já são
   tratados pelo frontend para quando houver um provedor.

O modelo do EasyOCR é pré-carregado em segundo plano quando o servidor sobe (`lifespan` em
`app/main.py`), e o OCR roda numa thread à parte: enquanto uma foto é lida, a API continua
respondendo às outras requisições.

Resposta:

```json
{
  "filename": "placa.jpg",
  "plate": "BRA2E19",
  "plate_format": "mercosul",
  "confidence": 0.97,
  "needs_review": false,
  "verification": { "status": "not_checked", "detail": "...", "source": null },
  "detections": [{ "text": "BRA2E19", "confidence": 0.97 }]
}
```

Sem placa válida: `plate`, `plate_format`, `confidence` e `verification` vêm `null` e
`needs_review` vem `true`.

**Precisão** (`tests/test_ocr_accuracy.py`, fotos sintéticas geradas em `tests/plate_samples.py`):

| Conjunto                                                     | Resultado     |
| ------------------------------------------------------------- | ------------- |
| 23 casos difíceis calibrados (luz, ângulo, sujeira, reflexo, contraluz, chuva, arranhões...) | 22/23 (96%) |
| 40 casos aleatórios de validação (mesmas condições, sorteadas, não usadas pra calibrar) | 27/40 (68%) |
| Tempo médio por foto (CPU)                                     | ~1,3 s        |

Histórico: antes deste pipeline, os primeiros 16 casos difíceis iam de 5/16 (31%) para 16/16, e a
validação de 10/40 (25%) para 36/40 (90%) — números que caíram de novo ao adicionar contraluz,
chuva e arranhões ao conjunto de teste (cenários mais difíceis, não porque o pipeline piorou).

**Limite conhecido:** em 2 dos 40 casos de validação, o sistema lê uma placa errada com confiança
alta — verificado manualmente, não é bug de localização ou de pré-processamento. Num deles, um
arranhão fecha por acaso o laço de um "9" e faz parecer um "8"; no outro, desfoque + contraluz faz
um "U" parecer um "C". Em ambos, **todas** as variantes de pré-processamento e os dois recortes
(normal e largo) concordam no mesmo caractere errado, porque o defeito faz o caractere parecer
outro caractere válido de verdade — não é uma questão de tentar mais variantes. A votação entre
variantes só pega erros onde as variantes discordam; quando o defeito está nos pixels da própria
foto, todas leem igual. A correção definitiva desse tipo de erro é conferir a placa numa base
oficial de verdade (`plate_verification.py`), que hoje não está disponível de graça — ver `O que
não fazer` no `CLAUDE.md` da raiz. Até lá, é por isso que o fiscal deve confirmar a placa lida
contra o veículo antes de liberar a entrada, mesmo quando a tela não pede revisão.

As fotos são sintéticas, então esses números medem a robustez do pipeline, não a taxa real em
campo — para essa, é preciso testar com fotos reais da guarita, em todas as condições citadas
acima.

Para inspecionar as imagens de teste: `python -m tests.plate_samples /tmp/amostras`.

### Banco de dados

Tabela `checkins` (modelo `CheckIn` em `app/models/checkin.py`):

| Coluna       | Tipo            | Observação                                                   |
| ------------ | --------------- | ------------------------------------------------------------ |
| `id`         | `integer`       | chave primária                                               |
| `plate`      | `varchar(7)`    | placa normalizada: 7 caracteres maiúsculos, sem hífen (CHECK) |
| `created_at` | `timestamptz`   | data/hora do check-in, `now()` por padrão, indexada          |
| `status`     | `varchar(20)`   | `waiting` (padrão), `admitted` ou `cancelled` (CHECK)        |

Ainda não implementado: gravar o check-in a partir do OCR, `GET /checkins` (consumido pelo
frontend) e o cálculo da fila estimada.
