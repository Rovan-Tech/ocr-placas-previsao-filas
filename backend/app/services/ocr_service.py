from functools import lru_cache

import cv2
import easyocr
import numpy as np

from app.services.plate_locator import locate_plate


@lru_cache(maxsize=1)
def get_reader() -> easyocr.Reader:
    # gpu=False: mantém o projeto 100% gratuito e local, sem depender de GPU.
    return easyocr.Reader(["pt", "en"], gpu=False)


def read_plate_text(image_bytes: bytes) -> list[dict]:
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Não foi possível decodificar a imagem enviada.")

    plate_region = locate_plate(image)
    reader = get_reader()
    results = reader.readtext(plate_region)

    return [
        {"text": text, "confidence": round(float(confidence), 4)}
        for _, text, confidence in results
    ]
