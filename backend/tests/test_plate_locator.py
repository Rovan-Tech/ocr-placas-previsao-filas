import cv2
import numpy as np
import pytest

from app.services.plate_locator import find_plate_candidates, locate_plate, rectify
from tests.plate_samples import hard_cases, render_plate


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


@pytest.mark.parametrize("sample", hard_cases(), ids=lambda sample: sample.name)
def test_best_candidate_is_the_plate_and_not_the_bumper(sample):
    """Antes, o localizador recortava o para-choque (retângulo largo) em vez da placa."""
    candidates = find_plate_candidates(_decode(sample.image_bytes))

    assert candidates, "nenhum candidato encontrado"
    best, _ = candidates[0]
    aspect_ratio = best.shape[1] / best.shape[0]
    assert 1.5 <= aspect_ratio <= 7.0
    # Placa: fundo claro com caracteres escuros => bastante contraste dentro do recorte.
    assert cv2.cvtColor(best, cv2.COLOR_BGR2GRAY).std() > 15


def test_second_candidate_is_a_wider_version_of_the_best_one():
    sample = hard_cases()[0]
    candidates = find_plate_candidates(_decode(sample.image_bytes))

    assert len(candidates) >= 2
    best, _ = candidates[0]
    wide, _ = candidates[1]
    assert wide.shape[0] == best.shape[0]  # mesma altura (endireitados)
    assert wide.shape[1] > best.shape[1] * 1.2


def _plate_with_characters_torn_apart(text: str) -> np.ndarray:
    """Caracteres bem espaçados numa "cena" de fundo — o vão entre eles é largo demais para o
    bloco de texto normal juntar (kernel de fechamento de (31, 7) em _candidate_corners), como
    acontece quando ruído (ex.: moiré de fotografar uma tela) corta a placa em pedaços soltos.
    """
    canvas = np.full((260, 620, 3), 200, np.uint8)
    x = 40
    for char in text:
        cv2.putText(canvas, char, (x, 160), cv2.FONT_HERSHEY_SIMPLEX, 2.2, (20, 20, 20), 6)
        x += 60
    return canvas


def test_clusters_scattered_characters_into_a_single_plate_candidate():
    """Regressão: foto de tela (moiré) quebrava a placa em recortes de um caractere só,
    inclusive pegando o adesivo "EMPLACAR" de uma placa demonstrativa em vez da placa real."""
    canvas = _plate_with_characters_torn_apart("CUR6435")

    candidates = find_plate_candidates(canvas)

    assert any(is_weak for _, is_weak in candidates), "o agrupamento de caracteres não achou nada"
    best, _ = candidates[0]
    assert best.shape[1] / best.shape[0] > 3.0  # linha inteira, não um caractere isolado


def test_a_wellformed_plate_block_is_not_evicted_by_a_worse_overlapping_cluster():
    """Regressão: dar prioridade cega ao agrupamento fazia ele expulsar um candidato melhor e
    já correto (achado pelo bloco de texto normal) quando os dois cobrem a mesma região."""
    sample = hard_cases()[0]  # placa limpa: o bloco de texto normal já acha a região certa
    image = _decode(sample.image_bytes)

    candidates = find_plate_candidates(image)

    assert candidates[0][1] is False, "um agrupamento pior expulsou o candidato correto"
