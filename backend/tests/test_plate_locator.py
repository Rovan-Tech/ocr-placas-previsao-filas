import cv2
import numpy as np
import pytest

from app.services.plate_locator import (
    MAX_PLATE_ASPECT_RATIO,
    MIN_PLATE_ASPECT_RATIO,
    MOTO_MAX_ASPECT_RATIO,
    MOTO_MIN_ASPECT_RATIO,
    _candidate_corners,
    _character_boxes,
    _cluster_characters_into_lines,
    _is_plausible_plate_ratio,
    _looks_like_plate_text,
    find_plate_candidates,
    locate_plate,
    rectify,
)
from app.services.plate_samples import hard_cases, render_moto_plate, render_plate


def _decode(image_bytes: bytes) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)


def test_returns_original_image_when_no_plate_like_region_is_found():
    blank_image = np.zeros((100, 100, 3), dtype=np.uint8)

    result = locate_plate(blank_image)

    assert result.shape == blank_image.shape


def test_rectify_straightens_a_rotated_plate():
    plate = render_plate("DEF1G23")
    canvas = np.zeros((600, 800, 3), np.uint8)
    rotation = cv2.getRotationMatrix2D((400, 300), 12, 1.0)
    offset = np.float32([[400 - plate.shape[1] / 2], [300 - plate.shape[0] / 2]])
    corners = np.float32([[0, 0], [plate.shape[1], 0], [plate.shape[1], plate.shape[0]], [0, plate.shape[0]]])
    placed = cv2.transform((corners + offset.T)[None], rotation)[0]
    matrix = cv2.getPerspectiveTransform(corners, placed)
    canvas = cv2.warpPerspective(plate, matrix, (800, 600))

    straightened = rectify(canvas, placed, height=plate.shape[0])

    assert abs(straightened.shape[1] / straightened.shape[0] - plate.shape[1] / plate.shape[0]) < 0.05
    difference = np.abs(straightened.astype(int) - plate.astype(int)).mean()
    assert difference < 25


def test_rectify_keeps_the_plate_wider_than_tall_even_at_a_steep_rotation():
    plate = render_plate("DEF1G23")
    canvas = np.zeros((900, 900, 3), np.uint8)
    rotation = cv2.getRotationMatrix2D((450, 450), 80, 1.0)
    offset = np.float32([[450 - plate.shape[1] / 2], [450 - plate.shape[0] / 2]])
    corners = np.float32([[0, 0], [plate.shape[1], 0], [plate.shape[1], plate.shape[0]], [0, plate.shape[0]]])
    placed = cv2.transform((corners + offset.T)[None], rotation)[0]
    matrix = cv2.getPerspectiveTransform(corners, placed)
    canvas = cv2.warpPerspective(plate, matrix, (900, 900))

    straightened = rectify(canvas, placed, height=plate.shape[0])

    aspect_ratio = straightened.shape[1] / straightened.shape[0]
    assert aspect_ratio > 1.0, f"recorte saiu mais alto que largo (aspect ratio {aspect_ratio:.2f})"
    assert abs(aspect_ratio - plate.shape[1] / plate.shape[0]) < 0.3


LOCATOR_CANNOT_ISOLATE_ALONE = {"chuva_pouca_luz"}


@pytest.mark.parametrize("sample", hard_cases(), ids=lambda sample: sample.name)
def test_best_candidate_is_the_plate_and_not_the_bumper(sample):
    candidates = find_plate_candidates(_decode(sample.image_bytes))

    if sample.name in LOCATOR_CANNOT_ISOLATE_ALONE:
        return

    assert candidates, "nenhum candidato encontrado"
    best, _ = candidates[0]
    aspect_ratio = best.shape[1] / best.shape[0]
    assert 1.3 <= aspect_ratio <= 7.0
    equalized = cv2.equalizeHist(cv2.cvtColor(best, cv2.COLOR_BGR2GRAY))
    assert equalized.std() > 15


def test_ignores_a_degenerate_approx_polygon_for_the_plate_outline_candidate(monkeypatch):
    sample = hard_cases()[0]
    gray = cv2.cvtColor(_decode(sample.image_bytes), cv2.COLOR_BGR2GRAY)

    degenerate_quad = np.array([[[0, 0]], [[2, 0]], [[2, 200]], [[0, 200]]], dtype=np.int32)
    monkeypatch.setattr(cv2, "approxPolyDP", lambda *args, **kwargs: degenerate_quad)

    corners_by_source = _candidate_corners(gray)
    non_cluster_candidates = [corners for corners, is_cluster in corners_by_source if not is_cluster]

    assert non_cluster_candidates, "nenhum candidato por moldura/bloco de texto encontrado"
    for corners in non_cluster_candidates:
        (_, _), (w, h), _ = cv2.minAreaRect(corners)
        long_side, short_side = max(w, h), min(w, h)
        assert short_side > 0
        ratio = long_side / short_side
        assert MIN_PLATE_ASPECT_RATIO <= ratio <= MAX_PLATE_ASPECT_RATIO, (
            f"candidato com aspect ratio {ratio:.2f} fora da faixa de uma placa"
        )


def test_second_candidate_is_a_wider_version_of_the_best_one():
    sample = hard_cases()[0]
    candidates = find_plate_candidates(_decode(sample.image_bytes))

    assert len(candidates) >= 2
    best, _ = candidates[0]
    wide, _ = candidates[1]
    assert wide.shape[0] == best.shape[0]
    assert wide.shape[1] > best.shape[1] * 1.2


def _plate_with_characters_torn_apart(text: str) -> np.ndarray:
    canvas = np.full((260, 620, 3), 200, np.uint8)
    x = 40
    for char in text:
        cv2.putText(canvas, char, (x, 160), cv2.FONT_HERSHEY_SIMPLEX, 2.2, (20, 20, 20), 6)
        x += 60
    return canvas


def test_clusters_scattered_characters_into_a_single_plate_candidate():
    canvas = _plate_with_characters_torn_apart("CUR6435")

    candidates = find_plate_candidates(canvas)

    assert any(is_weak for _, is_weak in candidates), "o agrupamento de caracteres não achou nada"
    best, _ = candidates[0]
    assert best.shape[1] / best.shape[0] > 3.0


def test_a_wellformed_plate_block_is_not_evicted_by_a_worse_overlapping_cluster():
    sample = hard_cases()[0]
    image = _decode(sample.image_bytes)

    candidates = find_plate_candidates(image)

    assert candidates[0][1] is False, "um agrupamento pior expulsou o candidato correto"


def test_merges_two_stacked_lines_into_a_square_moto_plate_candidate():
    plate = render_moto_plate("ABC1D23")
    canvas = np.full((plate.shape[0] + 20, plate.shape[1] + 20, 3), 190, np.uint8)
    canvas[10 : 10 + plate.shape[0], 10 : 10 + plate.shape[1]] = plate
    gray = cv2.cvtColor(canvas, cv2.COLOR_BGR2GRAY)

    corners = _cluster_characters_into_lines(_character_boxes(gray))

    assert corners, "o agrupamento de caracteres não achou nenhum candidato"
    ratios = [max(w, h) / min(w, h) for box in corners for (_, _), (w, h), _ in [cv2.minAreaRect(box)]]
    assert any(MOTO_MIN_ASPECT_RATIO <= ratio <= MOTO_MAX_ASPECT_RATIO for ratio in ratios), (
        f"nenhum candidato de agrupamento ficou no formato de placa de moto: {ratios}"
    )


def test_is_plausible_plate_ratio_accepts_car_and_moto_shapes_but_not_in_between():
    assert _is_plausible_plate_ratio(MIN_PLATE_ASPECT_RATIO)
    assert _is_plausible_plate_ratio(MAX_PLATE_ASPECT_RATIO)
    assert _is_plausible_plate_ratio(MOTO_MIN_ASPECT_RATIO)
    assert _is_plausible_plate_ratio(MOTO_MAX_ASPECT_RATIO)
    assert not _is_plausible_plate_ratio((MOTO_MAX_ASPECT_RATIO + MIN_PLATE_ASPECT_RATIO) / 2)


def _single_character_canvas(char: str, size: int) -> np.ndarray:
    canvas = np.full((size, size), 235, np.uint8)
    cv2.putText(
        canvas, char, (int(size * 0.15), int(size * 0.8)), cv2.FONT_HERSHEY_SIMPLEX, size / 90, (20,), 12
    )
    return canvas


def test_looks_like_plate_text_rejects_a_single_blown_up_character():
    gray = _single_character_canvas("W", 200)
    corners = np.float32([[0, 0], [200, 0], [200, 200], [0, 200]])

    assert not _looks_like_plate_text(gray, corners)


def test_looks_like_plate_text_accepts_a_real_moto_plate_crop():
    plate = render_moto_plate("ABC1D23")
    gray = cv2.cvtColor(plate, cv2.COLOR_BGR2GRAY)
    corners = np.float32([[0, 0], [plate.shape[1], 0], [plate.shape[1], plate.shape[0]], [0, plate.shape[0]]])

    assert _looks_like_plate_text(gray, corners)
