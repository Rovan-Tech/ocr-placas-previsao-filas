import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.rate_limit import limiter
from app.routers import auth, checkins, health, logs, ocr, ocr_demo, schedules
from app.services.ocr_service import get_reader

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}

@asynccontextmanager
async def lifespan(_: FastAPI):
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(ocr.router)
app.include_router(ocr_demo.router)
app.include_router(logs.router)
app.include_router(schedules.router)
app.include_router(checkins.router)
