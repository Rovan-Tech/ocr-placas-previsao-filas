# Imagem de produção do backend (FastAPI + OpenCV + EasyOCR), pensada pro
# Cloud Run: escuta em $PORT e já sobe com os modelos do EasyOCR baixados
# (senão a 1ª requisição depois de "acordar" a instância ficaria lenta/
# instável baixando modelo pela rede).
FROM python:3.11-slim

WORKDIR /app

# libgl1/libglib2.0-0: dependências indiretas do opencv-python-headless em
# imagens Debian slim (sem elas o `import cv2` falha com "libGL.so.1").
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# torch/torchvision na versão CPU-only ANTES do resto: o pip install padrão do
# easyocr puxaria o wheel com CUDA/cuDNN embutido (uns 5 GB de suporte a GPU
# que este projeto nunca usa — gpu=False em ocr_service.py). Instalando a
# versão CPU antes, o pip reaproveita ela ao resolver a dependência do easyocr.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY app app
COPY alembic.ini .
COPY migrations migrations

# Baixa e cacheia os modelos do EasyOCR na própria imagem (fica em
# /root/.EasyOCR), em vez de na primeira requisição em produção.
RUN python -c "from app.services.ocr_service import get_reader; get_reader()"

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
