import os
from functools import lru_cache

MAX_IMAGE_PIXELS = 25_000_000

# Limita a decodificação no próprio OpenCV (proteção contra "decompression bomb");
# precisa estar definido antes do primeiro cv2.imdecode.
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(MAX_IMAGE_PIXELS))

import cv2  # noqa: E402
import easyocr  # noqa: E402
import numpy as np  # noqa: E402

from app.services.plate_locator import locate_plate  # noqa: E402


@lru_cache(maxsize=1)
def get_reader() -> easyocr.Reader:
    # gpu=False: mantém o projeto 100% gratuito e local, sem depender de GPU.
    return easyocr.Reader(["pt", "en"], gpu=False)


def read_plate_text(image_bytes: bytes) -> list[dict]:
    if not image_bytes:
        raise ValueError("Nenhuma imagem foi enviada.")

    array = np.frombuffer(image_bytes, dtype=np.uint8)
    try:
        image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    except cv2.error:
        image = None
    if image is None:
        raise ValueError("Não foi possível decodificar a imagem enviada.")

    height, width = image.shape[:2]
    if height * width > MAX_IMAGE_PIXELS:
        raise ValueError("Resolução da imagem acima do limite permitido.")

    plate_region = locate_plate(image)
    reader = get_reader()
    results = reader.readtext(plate_region)

    return [
        {"text": text, "confidence": round(float(confidence), 4)}
        for _, text, confidence in results
    ]
