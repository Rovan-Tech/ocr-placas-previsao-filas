
import cv2
import numpy as np
import pytest

from app.services import ocr_service
from app.services.plate_format import PlateFormat


def _box(x: float, y: float = 50, width: float = 100, height: float = 40):
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]


class FakeReader:

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = 0

    def readtext(self, image, **kwargs):
        self.kwargs = kwargs
        response = self.responses[min(self.calls, len(self.responses) - 1)]
        self.calls += 1
        return response


@pytest.fixture
def image_bytes():
    _, encoded = cv2.imencode(".png", np.full((200, 400, 3), 200, np.uint8))
    return encoded.tobytes()


@pytest.fixture
def use_reader(monkeypatch):
    def install(reader, candidates=1):
        monkeypatch.setattr(ocr_service, "get_reader", lambda: reader)
        monkeypatch.setattr(
            ocr_service,
            "find_plate_candidates",
            lambda image, max_candidates=3: [(np.full((50, 160, 3), 200, np.uint8), False)] * candidates,
        )
        return reader

    return install


def test_ignores_band_text_even_when_it_has_higher_confidence(use_reader, image_bytes):
    use_reader(FakeReader([(_box(0, 0), "BRASIL", 0.99), (_box(0, 60), "BRA2E19", 0.95)]))

    reading = ocr_service.read_plate(image_bytes)

    assert reading.plate == "BRA2E19"
    assert reading.format is PlateFormat.MERCOSUL
    assert reading.needs_review is False


def test_corrects_letter_digit_confusion_and_lowers_confidence(use_reader, image_bytes):
    use_reader(FakeReader([(_box(0), "HJK7L2O", 0.9)]))

    reading = ocr_service.read_plate(image_bytes)

    assert reading.plate == "HJK7L20"
    assert reading.confidence == pytest.approx(0.9 * ocr_service.CORRECTION_PENALTY)


def test_joins_plate_split_in_two_pieces_on_the_same_line(use_reader, image_bytes):
    use_reader(FakeReader([(_box(120), "1D23", 0.95), (_box(0), "ABC", 0.97)]))

    assert ocr_service.read_plate(image_bytes).plate == "ABC1D23"


def test_old_plate_with_hyphen_is_normalized(use_reader, image_bytes):
    use_reader(FakeReader([(_box(0), "KLM-4821", 0.99)]))

    reading = ocr_service.read_plate(image_bytes)

    assert reading.plate == "KLM4821"
    assert reading.format is PlateFormat.OLD


def test_restricts_ocr_alphabet_to_plate_characters(use_reader, image_bytes):
    reader = use_reader(FakeReader([(_box(0), "BRA2E19", 0.99)]))

    ocr_service.read_plate(image_bytes)

    assert reader.kwargs["allowlist"] == ocr_service.PLATE_ALLOWLIST


def test_stops_early_on_a_confident_read(use_reader, image_bytes):
    reader = use_reader(FakeReader([(_box(0), "BRA2E19", 0.98)]), candidates=3)

    ocr_service.read_plate(image_bytes)

    assert reader.calls == 1


def test_majority_of_variants_wins_over_a_single_misread(use_reader, image_bytes):
    reader = use_reader(
        FakeReader(
            [(_box(0), "QRS3145", 0.7)],
            [(_box(0), "QRS3T45", 0.6)],
            [(_box(0), "QRS3T45", 0.65)],
        )
    )

    reading = ocr_service.read_plate(image_bytes)

    assert reading.plate == "QRS3T45"
    assert reader.calls == 3


def test_flags_ambiguous_reads_for_manual_review(use_reader, image_bytes):
    use_reader(FakeReader([(_box(0), "QRS3145", 0.45)], [(_box(0), "QRS3T45", 0.42)], [(_box(0), "NADA", 0.3)]))

    reading = ocr_service.read_plate(image_bytes)

    assert reading.needs_review is True


def test_low_confidence_read_needs_review(use_reader, image_bytes):
    use_reader(FakeReader([(_box(0), "BRA2E19", 0.3)]))

    reading = ocr_service.read_plate(image_bytes)

    assert reading.plate == "BRA2E19"
    assert reading.needs_review is True


def test_falls_back_to_full_image_when_no_crop_has_a_valid_plate(monkeypatch, image_bytes):
    reader = FakeReader([(_box(0), "BRASIL", 0.99)])
    monkeypatch.setattr(ocr_service, "get_reader", lambda: reader)
    monkeypatch.setattr(ocr_service, "find_plate_candidates", lambda image, max_candidates=3: [])

    reading = ocr_service.read_plate(image_bytes)

    assert reader.calls > 0
    assert reading.plate is None
    assert reading.needs_review is True


def test_returns_no_plate_and_raw_detections_when_nothing_is_a_plate(use_reader, image_bytes):
    use_reader(FakeReader([(_box(0), "SAO PAULO", 0.9)]))

    reading = ocr_service.read_plate(image_bytes)

    assert reading.plate is None
    assert reading.format is None
    assert reading.confidence is None
    assert {"text": "SAO PAULO", "confidence": 0.9} in reading.detections


def test_skips_to_the_next_crop_when_the_read_looks_cut_off(use_reader, image_bytes):
    reader = use_reader(
        FakeReader(
            [(_box(0), "MA-8376", 0.98)],
            [(_box(0), "LMA-8376", 0.97)],
        ),
        candidates=2,
    )

    reading = ocr_service.read_plate(image_bytes)

    assert reading.plate == "LMA8376"
    assert reader.calls == 2


def test_stops_at_the_soft_time_budget_when_a_plate_was_already_read(use_reader, image_bytes, monkeypatch):
    reader = use_reader(FakeReader([(_box(0), "BRA2E19", 0.4)]), candidates=3)
    monkeypatch.setattr(ocr_service, "SOFT_TIME_BUDGET_S", 0.0)

    reading = ocr_service.read_plate(image_bytes)

    assert reader.calls == 1
    assert reading.plate == "BRA2E19"
    assert reading.needs_review is True


def test_hard_time_budget_stops_even_without_a_plate(use_reader, image_bytes, monkeypatch):
    reader = use_reader(FakeReader([(_box(0), "NADA", 0.4)]), candidates=3)
    monkeypatch.setattr(ocr_service, "HARD_TIME_BUDGET_S", 0.0)

    reading = ocr_service.read_plate(image_bytes)

    assert reader.calls == 0
    assert reading.plate is None


def test_full_image_fallback_only_tries_the_basic_variants(monkeypatch, image_bytes):
    reader = FakeReader([(_box(0), "BRASIL", 0.99)])
    monkeypatch.setattr(ocr_service, "get_reader", lambda: reader)
    monkeypatch.setattr(ocr_service, "find_plate_candidates", lambda image, max_candidates=3: [])

    ocr_service.read_plate(image_bytes)

    assert reader.calls == ocr_service.FULL_IMAGE_MAX_VARIANTS


def test_weak_evidence_alone_always_needs_review_even_with_high_confidence(use_reader, image_bytes, monkeypatch):
    use_reader(FakeReader([(_box(0), "BRA2E19", 0.95)] * 3))
    monkeypatch.setattr(
        ocr_service, "find_plate_candidates", lambda image, max_candidates=3: [(np.full((50, 160, 3), 200, np.uint8), True)]
    )

    reading = ocr_service.read_plate(image_bytes)

    assert reading.plate == "BRA2E19"
    assert reading.needs_review is True


def test_strong_evidence_from_any_crop_is_enough_to_trust_the_vote(use_reader, image_bytes, monkeypatch):
    monkeypatch.setattr(
        ocr_service,
        "find_plate_candidates",
        lambda image, max_candidates=3: [
            (np.full((50, 160, 3), 200, np.uint8), False),
            (np.full((50, 160, 3), 200, np.uint8), True),
        ],
    )
    use_reader(FakeReader([(_box(0), "BRA2E19", 0.95)] * 3))

    reading = ocr_service.read_plate(image_bytes)

    assert reading.needs_review is False
