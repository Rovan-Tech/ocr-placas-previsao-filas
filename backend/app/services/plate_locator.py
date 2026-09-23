import cv2
import numpy as np

MIN_PLATE_ASPECT_RATIO = 2.0
MAX_PLATE_ASPECT_RATIO = 5.0
MIN_PLATE_WIDTH_PX = 60


def locate_plate(image: np.ndarray) -> np.ndarray:
    """Tenta localizar e recortar a região da placa numa foto do veículo.

    Heurística simples baseada em bordas e na proporção largura/altura
    típica de uma placa Mercosul (~3:1) — suficiente para o MVP. Se
    nenhuma região plausível for encontrada, retorna a imagem original
    sem recorte, deixando o OCR rodar na foto inteira.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.bilateralFilter(gray, 11, 17, 17)
    edges = cv2.Canny(blurred, 30, 200)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if h == 0 or w < MIN_PLATE_WIDTH_PX:
            continue

        aspect_ratio = w / h
        if MIN_PLATE_ASPECT_RATIO <= aspect_ratio <= MAX_PLATE_ASPECT_RATIO:
            return image[y : y + h, x : x + w]

    return image
