# Backend

API em Python (FastAPI) responsável por:

- Receber a imagem da placa (upload ou câmera) e localizar/recortar a placa com OpenCV
- Rodar o OCR (EasyOCR, open-source) e validar o formato de placa Mercosul
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
mudar, copie `.env.example` para `.env`.

A API sobe em `http://localhost:8002` (`/docs` para a documentação interativa do Swagger).

## Testes

```bash
pytest
```

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
- `POST /ocr/upload` — recebe uma imagem (`multipart/form-data`, campo `file`), tenta localizar
  a placa na foto (`app/services/plate_locator.py`) e roda o OCR (`app/services/ocr_service.py`),
  retornando o texto detectado e a confiança de cada trecho.

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
