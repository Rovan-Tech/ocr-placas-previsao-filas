import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from app.routers import auth, health, logs, ocr
from app.services.ocr_service import get_reader

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Carrega o modelo do EasyOCR (~2 s) em segundo plano assim que o servidor sobe, em vez de
    # na primeira foto: a API já responde enquanto isso, e o fiscal não paga esse tempo.
    threading.Thread(target=get_reader, name="easyocr-warmup", daemon=True).start()
    yield


app = FastAPI(
    title="OCR de Placas e Previsão de Filas",
    description=(
        "API do case de portfólio da Rovan Tech — leitura de placas via OCR e "
        "estimativa de fila do Porto Baía Verde (nome fictício)."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(ocr.router)
app.include_router(logs.router)
