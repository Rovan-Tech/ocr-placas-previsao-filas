from fastapi import FastAPI

from app.routers import health, ocr

app = FastAPI(
    title="OCR de Placas e Previsão de Filas",
    description=(
        "API do case de portfólio da Rovan Tech — leitura de placas via OCR e "
        "estimativa de fila do Porto Baía Verde (nome fictício)."
    ),
    version="0.1.0",
)

app.include_router(health.router)
app.include_router(ocr.router)
