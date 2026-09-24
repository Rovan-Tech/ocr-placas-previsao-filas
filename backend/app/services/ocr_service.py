import os
import threading
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field

MAX_IMAGE_PIXELS = 25_000_000

os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(MAX_IMAGE_PIXELS))

import cv2  # noqa: E402
import easyocr  # noqa: E402
import numpy as np  # noqa: E402

from app.services.image_preprocessing import ocr_variants  # noqa: E402
from app.services.plate_format import PLATE_LENGTH, PlateFormat, find_plate, normalize  # noqa: E402
from app.services.plate_locator import find_plate_candidates  # noqa: E402

PLATE_ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"

FULL_IMAGE_MAX_WIDTH = 1280

CORRECTION_PENALTY = 0.85

CONFIDENT_SINGLE_READ = 0.9
CONFIDENT_AGREEING_READS = 2
CONFIDENT_AGREEING_MIN = 0.5

SOFT_TIME_BUDGET_S = 2.5
HARD_TIME_BUDGET_S = 3.5
FULL_IMAGE_MAX_VARIANTS = 2

REVIEW_CONFIDENCE = 0.65
AMBIGUITY_RATIO = 0.5


_reader: easyocr.Reader | None = None
_reader_lock = threading.Lock()
_inference_lock = threading.Lock()


def get_reader() -> easyocr.Reader:
    global _reader
    with _reader_lock:
        if _reader is None:
            _reader = easyocr.Reader(["pt", "en"], gpu=False)
        return _reader


@dataclass
class _Vote:
    format: PlateFormat
    confidences: list[float] = field(default_factory=list)
    corrections: int = 7
    has_strong_evidence: bool = False

    @property
    def score(self) -> float:
        return sum(self.confidences)

    @property
    def confidence(self) -> float:
        return max(self.confidences)


@dataclass(frozen=True)
class PlateReading:

    plate: str | None
    format: PlateFormat | None
    confidence: float | None
    needs_review: bool
    detections: list[dict]


def decode_image(image_bytes: bytes) -> np.ndarray:
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
    return image


def _text_lines(results: list) -> Iterator[tuple[str, float]]:
    boxes = []
    for box, text, confidence in results:
        points = np.asarray(box, dtype=np.float32)
        boxes.append((points[:, 0].min(), points[:, 1].mean(), np.ptp(points[:, 1]), text, float(confidence)))

    for _, _, _, text, confidence in boxes:
        yield text, confidence

    boxes.sort(key=lambda item: item[0])
    for i, (_, y, height, _, _) in enumerate(boxes):
        line = [b for b in boxes[i:] if abs(b[1] - y) < max(height, 1) / 2]
        if len(line) > 1:
            yield "".join(b[3] for b in line), min(b[4] for b in line)


def _is_confident(vote: _Vote) -> bool:
    if vote.corrections == 0 and vote.confidence >= CONFIDENT_SINGLE_READ:
        return True
    agreeing = [c for c in vote.confidences if c >= CONFIDENT_AGREEING_MIN]
    return len(agreeing) >= CONFIDENT_AGREEING_READS


def _looks_truncated(results: list) -> bool:
    for _, text, _ in results:
        chars = normalize(text)
        if PLATE_LENGTH - 2 <= len(chars) < PLATE_LENGTH and any(c.isdigit() for c in chars) and any(
            c.isalpha() for c in chars
        ):
            return True
    return False


def _full_image(image: np.ndarray) -> np.ndarray:
    width = image.shape[1]
    if width <= FULL_IMAGE_MAX_WIDTH:
        return image
    scale = FULL_IMAGE_MAX_WIDTH / width
    return cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)


def _vote(votes: dict[str, _Vote], results: list, is_weak_evidence: bool) -> None:
    for text, confidence in _text_lines(results):
        match = find_plate(text)
        if match is None:
            continue
        vote = votes.setdefault(match.plate, _Vote(match.format))
        vote.confidences.append(confidence * CORRECTION_PENALTY**match.corrections)
        vote.corrections = min(vote.corrections, match.corrections)
        vote.has_strong_evidence = vote.has_strong_evidence or not is_weak_evidence


def _read_images(reader: easyocr.Reader, images: Iterable[tuple[np.ndarray, bool]], votes: dict[str, _Vote],
                 detections: list[dict], started: float, max_variants: int | None = None) -> bool:
    for region, is_weak_evidence in images:
        for index, (_, variant) in enumerate(ocr_variants(region)):
            elapsed = time.monotonic() - started
            if elapsed > HARD_TIME_BUDGET_S or (votes and elapsed > SOFT_TIME_BUDGET_S):
                return False
            if max_variants is not None and index >= max_variants:
                break
            results = reader.readtext(variant, allowlist=PLATE_ALLOWLIST)
            detections.extend(
                {"text": text, "confidence": round(float(confidence), 4)} for _, text, confidence in results
            )
            _vote(votes, results, is_weak_evidence)
            if votes and _is_confident(max(votes.values(), key=lambda v: v.score)):
                return True
            if not votes and _looks_truncated(results):
                break
    return False


def read_plate(image_bytes: bytes) -> PlateReading:
    image = decode_image(image_bytes)
    votes: dict[str, _Vote] = {}
    detections: list[dict] = []

    with _inference_lock:
        reader = get_reader()
        started = time.monotonic()
        if not _read_images(reader, find_plate_candidates(image), votes, detections, started) and not votes:
            _read_images(reader, [(_full_image(image), True)], votes, detections, started, FULL_IMAGE_MAX_VARIANTS)

    if not votes:
        return PlateReading(None, None, None, needs_review=True, detections=detections)

    ranked = sorted(votes.items(), key=lambda item: item[1].score, reverse=True)
    plate, best = ranked[0]
    ambiguous = len(ranked) > 1 and ranked[1][1].score >= AMBIGUITY_RATIO * best.score
    confidence = round(best.confidence, 4)
    return PlateReading(
        plate=plate,
        format=best.format,
        confidence=confidence,
        needs_review=confidence < REVIEW_CONFIDENCE or ambiguous or not best.has_strong_evidence,
        detections=detections,
    )
