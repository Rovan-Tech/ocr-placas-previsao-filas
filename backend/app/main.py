from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.rate_limit import limiter
from app.routers import health, ocr

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}

app = FastAPI(
    title="OCR de Placas e Previsão de Filas",
    description=(
        "API do case de portfólio da Rovan Tech — leitura de placas via OCR e "
        "estimativa de fila do Porto Baía Verde (nome fictício)."
    ),
    version="0.1.0",
)

# Lista explícita de origens (nunca "*" junto com allow_credentials) — vazia em
# dev local, onde o proxy do Vite dispensa CORS; em produção vem de
# FRONTEND_ORIGINS (backend/app/config.py).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Rate limiting no endpoint pesado (OCR) contra DoS — limite configurável via
# OCR_UPLOAD_RATE_LIMIT (backend/app/config.py); o decorator fica no router
# (app/routers/ocr.py) para poder usar um limite específico dessa rota.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response


app.include_router(health.router)
app.include_router(ocr.router)
