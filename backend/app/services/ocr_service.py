import os
import threading
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any, cast

MAX_IMAGE_PIXELS = 25_000_000

os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(MAX_IMAGE_PIXELS))

import cv2  # noqa: E402
import easyocr  # noqa: E402
import numpy as np  # noqa: E402

from app.services.image_preprocessing import ocr_variants  # noqa: E402
from app.services.plate_format import (  # noqa: E402
    PLATE_LENGTH,
    PlateFormat,
    find_plate,
    normalize,
)
from app.services.plate_locator import find_plate_candidates  # noqa: E402

PLATE_ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"

FULL_IMAGE_MAX_WIDTH = 1280

CORRECTION_PENALTY = 0.85

CONFIDENT_SINGLE_READ = 0.9
CONFIDENT_AGREEING_READS = 2
CONFIDENT_AGREEING_MIN = 0.5

SOFT_TIME_BUDGET_S = 7.0
HARD_TIME_BUDGET_S = 10.0
FULL_IMAGE_MAX_VARIANTS = 2

REVIEW_CONFIDENCE = 0.65
AMBIGUITY_RATIO = 0.5

EMPTY_IMAGE_MESSAGE = "Nenhuma imagem foi enviada."
UNDECODABLE_IMAGE_MESSAGE = "Não foi possível decodificar a imagem enviada."
IMAGE_TOO_LARGE_MESSAGE = "Resolução da imagem acima do limite permitido."

OcrResult = tuple[Any, str, float]
_TextBox = tuple[float, float, float, str, float]


_reader: easyocr.Reader | None = None
_reader_lock = threading.Lock()
_inference_lock = threading.Lock()


def get_reader() -> easyocr.Reader:
    global _reader  # noqa: PLW0603 - singleton preguiçoso protegido por lock
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


@dataclass
class _ReadState:
    votes: dict[str, _Vote] = field(default_factory=dict)
    detections: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class PlateReading:
    plate: str | None
    format: PlateFormat | None
    confidence: float | None
    needs_review: bool
    detections: list[dict[str, Any]]


def decode_image(image_bytes: bytes) -> np.ndarray:
    if not image_bytes:
        raise ValueError(EMPTY_IMAGE_MESSAGE)

    array = np.frombuffer(image_bytes, dtype=np.uint8)
    try:
        image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    except cv2.error:
        image = None
    if image is None:
        raise ValueError(UNDECODABLE_IMAGE_MESSAGE)

    height, width = image.shape[:2]
    if height * width > MAX_IMAGE_PIXELS:
        raise ValueError(IMAGE_TOO_LARGE_MESSAGE)
    return image


def _group_into_rows(boxes: list[_TextBox]) -> list[list[_TextBox]]:
    order = sorted(range(len(boxes)), key=lambda i: boxes[i][1])
    assigned = [False] * len(boxes)
    rows: list[list[_TextBox]] = []
    for i in order:
        if assigned[i]:
            continue
        _, y, height, _, _ = boxes[i]
        row_indices = [
            j
            for j in order
            if not assigned[j] and abs(boxes[j][1] - y) < max(height, 1) / 2
        ]
        for j in row_indices:
            assigned[j] = True
        rows.append(sorted((boxes[j] for j in row_indices), key=lambda b: b[0]))
    return rows


def _text_lines(results: list[OcrResult]) -> Iterator[tuple[str, float]]:
    boxes: list[_TextBox] = []
    for box, text, confidence in results:
        points = np.asarray(box, dtype=np.float32)
        boxes.append(
            (
                float(points[:, 0].min()),
                float(points[:, 1].mean()),
                float(np.ptp(points[:, 1])),
                text,
                float(confidence),
            )
        )

    for _, _, _, text, confidence in boxes:
        yield text, confidence

    boxes.sort(key=lambda item: item[0])
    for i, (_, y, height, _, _) in enumerate(boxes):
        line = [b for b in boxes[i:] if abs(b[1] - y) < max(height, 1) / 2]
        if len(line) > 1:
            yield "".join(b[3] for b in line), min(b[4] for b in line)

    tallest = max((b[2] for b in boxes), default=0.0)
    plate_boxes = [b for b in boxes if b[2] >= 0.6 * tallest]
    plate_rows = _group_into_rows(plate_boxes)
    if len(plate_rows) > 1:
        stacked = [b for row in plate_rows for b in row]
        yield "".join(b[3] for b in stacked), min(b[4] for b in stacked)


def _is_confident(vote: _Vote) -> bool:
    if vote.corrections == 0 and vote.confidence >= CONFIDENT_SINGLE_READ:
        return True
    agreeing = [c for c in vote.confidences if c >= CONFIDENT_AGREEING_MIN]
    return len(agreeing) >= CONFIDENT_AGREEING_READS


def _looks_truncated(results: list[OcrResult]) -> bool:
    for _, text, _ in results:
        chars = normalize(text)
        if (
            PLATE_LENGTH - 2 <= len(chars) < PLATE_LENGTH
            and any(c.isdigit() for c in chars)
            and any(c.isalpha() for c in chars)
        ):
            return True
    return False


def _full_image(image: np.ndarray) -> np.ndarray:
    width = image.shape[1]
    if width <= FULL_IMAGE_MAX_WIDTH:
        return image
    scale = FULL_IMAGE_MAX_WIDTH / width
    return cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)


def _vote(
    votes: dict[str, _Vote], results: list[OcrResult], is_weak_evidence: bool
) -> None:
    for text, confidence in _text_lines(results):
        match = find_plate(text)
        if match is None:
            continue
        vote = votes.setdefault(match.plate, _Vote(match.format))
        vote.confidences.append(confidence * CORRECTION_PENALTY**match.corrections)
        vote.corrections = min(vote.corrections, match.corrections)
        vote.has_strong_evidence = vote.has_strong_evidence or not is_weak_evidence


def _prepare_variants(
    images: Iterable[tuple[np.ndarray, bool]], max_variants: int | None
) -> list[tuple[bool, list[tuple[str, np.ndarray]]]]:
    prepared = [
        (is_weak_evidence, list(ocr_variants(region)))
        for region, is_weak_evidence in images
    ]
    if max_variants is None:
        return prepared
    return [
        (is_weak_evidence, variants[:max_variants])
        for is_weak_evidence, variants in prepared
    ]


def _out_of_time(state: _ReadState, started: float) -> bool:
    elapsed = time.monotonic() - started
    return elapsed > HARD_TIME_BUDGET_S or (
        bool(state.votes) and elapsed > SOFT_TIME_BUDGET_S
    )


def _read_variant(
    reader: easyocr.Reader,
    variant: np.ndarray,
    state: _ReadState,
    is_weak_evidence: bool,
) -> list[OcrResult]:
    results = reader.readtext(variant, allowlist=PLATE_ALLOWLIST)
    state.detections.extend(
        {"text": text, "confidence": round(float(confidence), 4)}
        for _, text, confidence in results
    )
    _vote(state.votes, results, is_weak_evidence)
    return cast("list[OcrResult]", results)


def _has_confident_vote(state: _ReadState) -> bool:
    return bool(state.votes) and _is_confident(
        max(state.votes.values(), key=lambda v: v.score)
    )


@dataclass
class _ReadPass:
    reader: easyocr.Reader
    state: _ReadState
    started: float
    prepared: list[tuple[bool, list[tuple[str, np.ndarray]]]]
    exhausted: list[bool] = field(init=False)

    def __post_init__(self) -> None:
        self.exhausted = [False] * len(self.prepared)

    def run_round(self, round_index: int) -> bool | None:
        for i, (is_weak_evidence, variants) in enumerate(self.prepared):
            if self.exhausted[i]:
                continue
            if round_index >= len(variants):
                self.exhausted[i] = True
                continue
            if _out_of_time(self.state, self.started):
                return False
            _, variant = variants[round_index]
            results = _read_variant(self.reader, variant, self.state, is_weak_evidence)
            if _has_confident_vote(self.state):
                return True
            if not self.state.votes and _looks_truncated(results):
                self.exhausted[i] = True
        return None


def _read_images(
    reader: easyocr.Reader,
    images: Iterable[tuple[np.ndarray, bool]],
    state: _ReadState,
    started: float,
    max_variants: int | None = None,
) -> bool:
    read_pass = _ReadPass(
        reader, state, started, _prepare_variants(images, max_variants)
    )
    round_index = 0
    while not all(read_pass.exhausted):
        outcome = read_pass.run_round(round_index)
        if outcome is not None:
            return outcome
        round_index += 1
    return False


def read_raw_text(image: np.ndarray) -> list[OcrResult]:
    with _inference_lock:
        reader = get_reader()
        return cast("list[OcrResult]", reader.readtext(image))


def read_plate(image_bytes: bytes) -> PlateReading:
    image = decode_image(image_bytes)
    state = _ReadState()

    with _inference_lock:
        reader = get_reader()
        started = time.monotonic()
        candidates = find_plate_candidates(image, max_candidates=6)
        if not _read_images(reader, candidates, state, started) and not state.votes:
            _read_images(
                reader,
                [(_full_image(image), True)],
                state,
                started,
                FULL_IMAGE_MAX_VARIANTS,
            )

    if not state.votes:
        return PlateReading(
            None, None, None, needs_review=True, detections=state.detections
        )

    ranked = sorted(state.votes.items(), key=lambda item: item[1].score, reverse=True)
    plate, best = ranked[0]
    ambiguous = len(ranked) > 1 and ranked[1][1].score >= AMBIGUITY_RATIO * best.score
    confidence = round(best.confidence, 4)
    return PlateReading(
        plate=plate,
        format=best.format,
        confidence=confidence,
        needs_review=confidence < REVIEW_CONFIDENCE
        or ambiguous
        or not best.has_strong_evidence,
        detections=state.detections,
    )
