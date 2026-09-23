# Backend

API em Python (FastAPI) responsável por:

- Receber a imagem da placa (upload ou câmera) e localizar/recortar a placa com OpenCV
- Rodar o OCR (EasyOCR, open-source) e validar o formato de placa Mercosul
- Registrar o check-in no PostgreSQL
- Calcular a fila estimada por média móvel do histórico de check-ins

## Rodando localmente

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

A API sobe em `http://localhost:8000` (`/docs` para a documentação interativa do Swagger).

## Testes

```bash
pytest
```

## O que já existe

- `GET /health` — healthcheck
- `POST /ocr/upload` — recebe uma imagem (`multipart/form-data`, campo `file`), tenta localizar
  a placa na foto (`app/services/plate_locator.py`) e roda o OCR (`app/services/ocr_service.py`),
  retornando o texto detectado e a confiança de cada trecho.

O registro de check-in no banco (PostgreSQL) e o cálculo da fila estimada ainda não foram
implementados — os modelos em `app/models/` estão vazios por enquanto.
