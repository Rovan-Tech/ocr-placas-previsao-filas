import cv2
import numpy as np
import pytest

from app.services import plate_samples
from app.services.plate_format import plate_format
from app.services.plate_samples import _jpeg, _maybe, random_cases


def _decode(image_bytes: bytes) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)


def test_random_cases_builds_the_requested_number_of_decodable_valid_plate_samples():
    samples = random_cases(count=4)

    assert [sample.name for sample in samples] == [
        "aleatoria_00",
        "aleatoria_01",
        "aleatoria_02",
        "aleatoria_03",
    ]
    for sample in samples:
        assert plate_format(sample.plate) is not None
        assert sample.description
        assert _decode(sample.image_bytes) is not None


def test_random_cases_is_deterministic_for_the_same_seed_and_varies_with_another():
    first = random_cases(count=3, seed=7)
    again = random_cases(count=3, seed=7)
    other = random_cases(count=3, seed=8)

    assert first == again
    assert [sample.plate for sample in first] != [sample.plate for sample in other]


def test_random_cases_describes_the_applied_degradations_separated_by_comma():
    descriptions = [sample.description for sample in random_cases(count=20)]

    assert any(", " in description for description in descriptions)
    assert all(description for description in descriptions)


@pytest.mark.parametrize(
    ("probability", "expected"),
    [(1.0, "feito"), (0.0, "padrão")],
)
def test_maybe_builds_the_value_only_when_the_chance_hits(probability, expected):
    rng = np.random.default_rng(1)

    result = _maybe(rng, probability, lambda: "feito", "padrão")

    assert result == expected


def test_maybe_does_not_call_the_factory_when_the_chance_misses():
    calls = []

    _maybe(np.random.default_rng(1), 0.0, lambda: calls.append(1), None)

    assert calls == []


def test_jpeg_encodes_an_image_to_bytes_that_decode_back():
    image = np.full((20, 30, 3), 128, np.uint8)

    decoded = _decode(_jpeg(image, 80))

    assert decoded.shape == image.shape


def test_jpeg_fails_loudly_when_the_encoder_refuses_the_image(monkeypatch):
    monkeypatch.setattr(cv2, "imencode", lambda *_args, **_kwargs: (False, None))

    with pytest.raises(RuntimeError, match=plate_samples.JPEG_ENCODE_ERROR):
        _jpeg(np.zeros((4, 4, 3), np.uint8), 80)


def test_font_falls_back_to_the_default_when_no_candidate_font_exists(monkeypatch):
    monkeypatch.setattr(plate_samples, "FONT_CANDIDATES", ["/caminho/inexistente.ttf"])
    plate_samples._font.cache_clear()

    try:
        font = plate_samples._font(24)
    finally:
        plate_samples._font.cache_clear()

    assert font.getbbox("ABC1D23")[2] > 0
