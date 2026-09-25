
from collections.abc import Iterator

import cv2
import numpy as np

TARGET_PLATE_HEIGHT = 160

DARK_MEAN_THRESHOLD = 90
GLARE_PIXEL_VALUE = 250
GLARE_MIN_FRACTION = 0.01
GLARE_CAP = 200

SCRATCH_MIN_LENGTH_FACTOR = 1.15
SCRATCH_LINE_THICKNESS = 3
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
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 8))
    return clahe.apply(gray)


def brighten(gray: np.ndarray) -> np.ndarray:
    mean = min(max(float(gray.mean()), 1.0), 254.0)
    gamma = float(np.clip(np.log(mean / 255) / np.log(128 / 255), 1.0, 3.0))
    table = ((np.arange(256) / 255.0) ** (1 / gamma) * 255).astype(np.uint8)
    return cv2.LUT(gray, table)


def denoise(gray: np.ndarray) -> np.ndarray:
    return cv2.fastNlMeansDenoising(gray, None, h=12, templateWindowSize=7, searchWindowSize=21)


def sharpen(gray: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=3)
    return cv2.addWeighted(gray, 1.8, blurred, -0.8, 0)


def glare_mask(gray: np.ndarray) -> np.ndarray:
    mask = (gray >= GLARE_PIXEL_VALUE).astype(np.uint8) * 255
    return cv2.dilate(mask, np.ones((5, 5), np.uint8))


def has_glare(gray: np.ndarray) -> bool:
    return float((gray >= GLARE_PIXEL_VALUE).mean()) >= GLARE_MIN_FRACTION


def reduce_glare(gray: np.ndarray) -> np.ndarray:
    return equalize_contrast(np.minimum(gray, GLARE_CAP))


def is_dark(gray: np.ndarray) -> bool:
    return float(gray.mean()) < DARK_MEAN_THRESHOLD


def _scratch_lines(gray: np.ndarray) -> np.ndarray | None:
    height = gray.shape[0]
    edges = cv2.Canny(gray, 60, 160)
    edges[: int(height * BAND_EXCLUSION_FRACTION)] = 0
    min_length = int(height * SCRATCH_MIN_LENGTH_FACTOR)
    return cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=30, minLineLength=min_length, maxLineGap=10)


def has_scratches(gray: np.ndarray) -> bool:
    return _scratch_lines(gray) is not None


def remove_scratches(gray: np.ndarray) -> np.ndarray:
    lines = _scratch_lines(gray)
    if lines is None:
        return gray
    mask = np.zeros_like(gray)
    for x1, y1, x2, y2 in lines.reshape(-1, 4):
        cv2.line(mask, (int(x1), int(y1)), (int(x2), int(y2)), 255, SCRATCH_LINE_THICKNESS)
    return cv2.inpaint(gray, mask, 3, cv2.INPAINT_TELEA)


def ocr_variants(plate_image: np.ndarray) -> Iterator[tuple[str, np.ndarray]]:
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
