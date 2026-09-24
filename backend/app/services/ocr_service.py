import os
import threading
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field

MAX_IMAGE_PIXELS = 25_000_000

# Limita a decodificação no próprio OpenCV (proteção contra "decompression bomb");
# precisa estar definido antes do primeiro cv2.imdecode.
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(MAX_IMAGE_PIXELS))

import cv2  # noqa: E402
import easyocr  # noqa: E402
import numpy as np  # noqa: E402

from app.services.image_preprocessing import ocr_variants  # noqa: E402
from app.services.plate_format import PLATE_LENGTH, PlateFormat, find_plate, normalize  # noqa: E402
from app.services.plate_locator import find_plate_candidates  # noqa: E402

# Placas só têm letras sem acento, números e (na antiga) hífen: restringir o alfabeto do
# reconhecedor evita leituras como "Ç" ou "É" e melhora a precisão.
PLATE_ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"

# A foto inteira só é lida se nenhum recorte der uma placa válida; reduzida para caber no tempo.
FULL_IMAGE_MAX_WIDTH = 1280

# Cada caractere corrigido (letra<->número) reduz a confiança da leitura.
CORRECTION_PENALTY = 0.85

# Para de tentar variantes quando a leitura já é confiável (economiza CPU e tempo de resposta).
CONFIDENT_SINGLE_READ = 0.9
CONFIDENT_AGREEING_READS = 2
CONFIDENT_AGREEING_MIN = 0.5

# Orçamento de tempo por foto (o fiscal está esperando na guarita). Depois do orçamento "suave",
# para assim que houver alguma placa válida; depois do "duro", para de qualquer jeito.
SOFT_TIME_BUDGET_S = 2.5
HARD_TIME_BUDGET_S = 3.5
# A foto inteira é cara de ler (o detector de texto roda na imagem toda): só as variantes básicas.
FULL_IMAGE_MAX_VARIANTS = 2

# Abaixo disso o fiscal deve conferir a placa na mão.
REVIEW_CONFIDENCE = 0.65
# Uma segunda placa com pelo menos esta fração dos votos da vencedora = leitura ambígua.
AMBIGUITY_RATIO = 0.5


_reader: easyocr.Reader | None = None
_reader_lock = threading.Lock()
# Uma leitura por vez: o PyTorch já usa todos os núcleos da CPU em cada inferência, então duas
# leituras simultâneas só dividiriam a CPU e atrasariam as duas.
_inference_lock = threading.Lock()


def get_reader() -> easyocr.Reader:
    """Modelo do EasyOCR, carregado uma vez só (o main.py pré-carrega na subida do servidor)."""
    global _reader
    with _reader_lock:
        if _reader is None:
            # gpu=False: mantém o projeto 100% gratuito e local, sem depender de GPU.
            _reader = easyocr.Reader(["pt", "en"], gpu=False)
        return _reader


@dataclass
class _Vote:
    format: PlateFormat
    confidences: list[float] = field(default_factory=list)
    corrections: int = 7
    # True se ao menos um voto veio de um recorte com evidência estrutural forte (moldura ou
    # bloco de texto da placa inteiro — ver find_plate_candidates). Uma placa votada só a partir
    # de evidência fraca (agrupamento de caracteres ou a foto inteira) sempre pede revisão,
    # mesmo com confiança alta: são recortes de último recurso, sem a mesma garantia de que a
    # região é mesmo a placa e não outro texto da foto.
    has_strong_evidence: bool = False

    @property
    def score(self) -> float:
        return sum(self.confidences)

    @property
    def confidence(self) -> float:
        return max(self.confidences)


@dataclass(frozen=True)
class PlateReading:
    """Resultado da leitura. ``plate`` é None quando nenhuma placa em formato válido foi lida."""

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
    """Textos a testar como placa: cada trecho lido e os trechos da mesma linha juntos.

    O OCR às vezes quebra a placa em dois pedaços (ex.: "ABC" e "1D23"); juntar os trechos
    vizinhos, da esquerda para a direita, recupera a placa inteira.
    """
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
    """Leitura com cara de placa cortada pelo recorte (ex.: "MA-8376"): 5-6 caracteres, letras e números."""
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
    """Lê cada recorte com as variantes de pré-processamento. True se chegou a uma leitura confiável."""
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
                # Recorte cortou a placa: outras variantes do mesmo recorte não recuperam a letra
                # que ficou de fora. Passa para o próximo (o 2º é a versão larga do 1º).
                break
    return False


def read_plate(image_bytes: bytes) -> PlateReading:
    """Localiza a placa na foto, lê com OCR e devolve a placa em formato válido mais votada.

    Cada recorte candidato passa por variantes de pré-processamento (contraste, brilho, ruído,
    reflexo, nitidez); cada leitura em formato válido vale um voto. A placa com mais votos vence —
    assim um erro isolado numa variante não decide o resultado.
    """
    image = decode_image(image_bytes)
    votes: dict[str, _Vote] = {}
    detections: list[dict] = []

    with _inference_lock:
        reader = get_reader()
        started = time.monotonic()
        if not _read_images(reader, find_plate_candidates(image), votes, detections, started) and not votes:
            # Nenhum recorte deu placa válida: tenta a foto inteira como último recurso. É
            # evidência fraca pelo mesmo motivo do agrupamento de caracteres (ver _Vote).
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
