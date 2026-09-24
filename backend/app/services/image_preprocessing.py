"""Pré-processamento do recorte da placa para o OCR em fotos reais de celular.

Cada função trata uma condição típica da guarita. ``ocr_variants`` devolve as versões da imagem
na ordem em que valem a pena ser tentadas: a mais barata primeiro, e as correções mais pesadas só
quando a imagem pede (ex.: redução de ruído só em foto escura).
"""

from collections.abc import Iterator

import cv2
import numpy as np

# Altura para onde o recorte é redimensionado: letras pequenas demais (placa longe) ou grandes
# demais (foto de perto) atrapalham o reconhecedor do EasyOCR.
TARGET_PLATE_HEIGHT = 160

DARK_MEAN_THRESHOLD = 90  # média de cinza abaixo disso = foto escura (fim de tarde/noite)
GLARE_PIXEL_VALUE = 250  # pixels "estourados" pelo reflexo (o branco da placa fica abaixo)
GLARE_MIN_FRACTION = 0.01
GLARE_CAP = 200

# Comprimento mínimo de uma reta para ser tratada como arranhão e não como o traço de uma letra.
# Relativo à ALTURA do recorte (não à largura): um arranhão pode ser bem inclinado ou quase
# vertical, então o que garante que não é uma letra é ser mais alto que qualquer caractere
# sozinho consegue ser, em qualquer ângulo.
SCRATCH_MIN_LENGTH_FACTOR = 1.15
SCRATCH_LINE_THICKNESS = 3
# Ignora esta fração do topo do recorte ao procurar arranhões (ver _scratch_lines).
BAND_EXCLUSION_FRACTION = 0.22


def to_gray(image: np.ndarray) -> np.ndarray:
    return image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def resize_to_height(image: np.ndarray, height: int = TARGET_PLATE_HEIGHT) -> np.ndarray:
    scale = height / image.shape[0]
    if abs(scale - 1) < 0.05:
        return image
    interpolation = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
    return cv2.resize(image, None, fx=scale, fy=scale, interpolation=interpolation)


def equalize_contrast(gray: np.ndarray) -> np.ndarray:
    """CLAHE: realça o contraste local — pouca luz, tinta desbotada e reflexo parcial."""
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 8))
    return clahe.apply(gray)


def brighten(gray: np.ndarray) -> np.ndarray:
    """Correção de gama proporcional ao quanto a imagem está escura."""
    # Gama que leva a média da imagem para ~128 (meio da escala), limitada a 3x.
    mean = min(max(float(gray.mean()), 1.0), 254.0)
    gamma = float(np.clip(np.log(mean / 255) / np.log(128 / 255), 1.0, 3.0))
    table = ((np.arange(256) / 255.0) ** (1 / gamma) * 255).astype(np.uint8)
    return cv2.LUT(gray, table)


def denoise(gray: np.ndarray) -> np.ndarray:
    """Remove o granulado de fotos noturnas sem borrar as bordas das letras."""
    return cv2.fastNlMeansDenoising(gray, None, h=12, templateWindowSize=7, searchWindowSize=21)


def sharpen(gray: np.ndarray) -> np.ndarray:
    """Unsharp mask: recupera parte da nitidez de fotos tremidas."""
    blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=3)
    return cv2.addWeighted(gray, 1.8, blurred, -0.8, 0)


def glare_mask(gray: np.ndarray) -> np.ndarray:
    """Máscara das áreas estouradas pelo reflexo (um pouco dilatada para pegar a borda do brilho)."""
    mask = (gray >= GLARE_PIXEL_VALUE).astype(np.uint8) * 255
    return cv2.dilate(mask, np.ones((5, 5), np.uint8))


def has_glare(gray: np.ndarray) -> bool:
    return float((gray >= GLARE_PIXEL_VALUE).mean()) >= GLARE_MIN_FRACTION


def reduce_glare(gray: np.ndarray) -> np.ndarray:
    """Atenua o reflexo: comprime os tons altos e realça o contraste local no que sobrou.

    Onde o reflexo estourou totalmente a letra não há o que recuperar; mas na borda do brilho as
    letras ainda existem com pouco contraste, e é isso que esta variante tenta devolver ao OCR.
    """
    # Achata o estouro num cinza claro (não branco) e realça o contraste local sem voltar a
    # esticar tudo até 255 — senão o reflexo reaparece igual.
    return equalize_contrast(np.minimum(gray, GLARE_CAP))


def is_dark(gray: np.ndarray) -> bool:
    return float(gray.mean()) < DARK_MEAN_THRESHOLD


def _scratch_lines(gray: np.ndarray) -> np.ndarray | None:
    """Retas longas na imagem (Hough) que cruzam a faixa dos caracteres.

    Comprimento mínimo relativo à ALTURA do recorte — o suficiente para atravessar vários
    caracteres em qualquer ângulo, o que distingue um arranhão físico do traço de uma letra
    (curto e muitas vezes curvo). Ignora a faixa de cima do recorte: numa placa Mercosul, a borda
    da faixa azul "BRASIL" já é, sozinha, uma reta comprida — mas não é um arranhão, e nunca
    passa pelos caracteres (ver render_plate em tests/plate_samples.py).
    """
    height = gray.shape[0]
    edges = cv2.Canny(gray, 60, 160)
    edges[: int(height * BAND_EXCLUSION_FRACTION)] = 0
    min_length = int(height * SCRATCH_MIN_LENGTH_FACTOR)
    return cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=30, minLineLength=min_length, maxLineGap=10)


def has_scratches(gray: np.ndarray) -> bool:
    return _scratch_lines(gray) is not None


def remove_scratches(gray: np.ndarray) -> np.ndarray:
    """Apaga riscos retos e longos via inpainting, preenchendo com os pixels ao redor — sem mexer
    nos traços dos próprios caracteres, que ficam de fora do filtro de comprimento mínimo."""
    lines = _scratch_lines(gray)
    if lines is None:
        return gray
    mask = np.zeros_like(gray)
    for x1, y1, x2, y2 in lines.reshape(-1, 4):
        cv2.line(mask, (int(x1), int(y1)), (int(x2), int(y2)), 255, SCRATCH_LINE_THICKNESS)
    return cv2.inpaint(gray, mask, 3, cv2.INPAINT_TELEA)


def ocr_variants(plate_image: np.ndarray) -> Iterator[tuple[str, np.ndarray]]:
    """Versões do recorte para o OCR, da mais simples para a mais agressiva.

    É um gerador: quem consome pode parar assim que uma leitura for confiável, sem pagar o custo
    das variantes seguintes.
    """
    gray = resize_to_height(to_gray(plate_image))
    yield "original", gray

    base = gray
    if is_dark(gray):
        base = brighten(gray)
        yield "clareada", base

    yield "contraste", equalize_contrast(base)

    if has_glare(gray):
        yield "sem_reflexo", reduce_glare(gray)

    if has_scratches(gray):
        yield "sem_arranhoes", equalize_contrast(remove_scratches(base))

    if is_dark(gray):
        yield "sem_ruido", equalize_contrast(denoise(base))

    yield "nitidez", sharpen(equalize_contrast(base))
