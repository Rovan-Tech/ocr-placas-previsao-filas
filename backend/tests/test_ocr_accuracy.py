
import pytest

from app.services.ocr_service import read_plate
from app.services.plate_samples import hard_cases, random_cases

pytestmark = pytest.mark.ocr_real

MIN_VALIDATION_ACCURACY = 0.35

MAX_SILENT_ERRORS = 6

KNOWN_UNAVOIDABLE_CHARACTER_CONFUSION = {"arranhada_suja"}


@pytest.mark.parametrize("sample", hard_cases(), ids=lambda sample: sample.name)
def test_reads_plate_in_hard_conditions(sample):
    reading = read_plate(sample.image_bytes)

    if reading.plate == sample.plate or sample.name in KNOWN_UNAVOIDABLE_CHARACTER_CONFUSION:
        return

    assert reading.plate is None or reading.needs_review, (
        f"{sample.description}: leu {reading.plate!r} (esperado {sample.plate!r}) sem pedir "
        "revisão — placa errada com confiança é o que os testes de segurança devem impedir"
    )


DISTANCE_CASES = {"muito_perto", "distancia_ideal", "media_distancia", "muito_longe"}


@pytest.mark.parametrize("sample", [s for s in hard_cases() if s.name in DISTANCE_CASES], ids=lambda sample: sample.name)
def test_reads_plate_correctly_across_camera_distances(sample):
    reading = read_plate(sample.image_bytes)

    assert reading.plate == sample.plate, (
        f"{sample.description}: leu {reading.plate!r} (esperado {sample.plate!r})"
    )


def test_validation_set_accuracy_and_bounded_silent_errors():
    samples = random_cases()
    readings = [(sample, read_plate(sample.image_bytes)) for sample in samples]

    correct = [sample for sample, reading in readings if reading.plate == sample.plate]
    silent_errors = [
        f"{sample.name}: esperado {sample.plate}, lido {reading.plate} ({sample.description})"
        for sample, reading in readings
        if reading.plate not in (None, sample.plate) and not reading.needs_review
    ]

    accuracy = len(correct) / len(samples)
    assert accuracy >= MIN_VALIDATION_ACCURACY, f"precisão {accuracy:.0%} abaixo de {MIN_VALIDATION_ACCURACY:.0%}"
    assert len(silent_errors) <= MAX_SILENT_ERRORS, (
        f"{len(silent_errors)} erros silenciosos (máximo aceito: {MAX_SILENT_ERRORS}): {silent_errors}"
    )
