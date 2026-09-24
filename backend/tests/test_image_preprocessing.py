import cv2
import numpy as np

from app.services.image_preprocessing import (
    TARGET_PLATE_HEIGHT,
    brighten,
    equalize_contrast,
    has_glare,
    has_scratches,
    is_dark,
    ocr_variants,
    reduce_glare,
    remove_scratches,
    resize_to_height,
)
from tests.plate_samples import render_plate


def _dark(image: np.ndarray, factor: float = 0.25) -> np.ndarray:
    return (image.astype(np.float32) * factor).astype(np.uint8)


def _with_glare(image: np.ndarray) -> np.ndarray:
    glared = image.copy()
    glared[:, image.shape[1] // 2 :] = 255
    return glared


def test_resize_to_height_keeps_aspect_ratio():
    image = np.zeros((40, 130), np.uint8)

    resized = resize_to_height(image)

    assert resized.shape[0] == TARGET_PLATE_HEIGHT
    assert abs(resized.shape[1] / resized.shape[0] - 130 / 40) < 0.05


def test_brighten_raises_the_mean_of_a_dark_image():
    gray = _dark(render_plate("QRS3T45")[..., 0])

    assert is_dark(gray)
    assert brighten(gray).mean() > gray.mean() * 1.5


def test_equalize_contrast_improves_worn_plate_contrast():
    # Placa desbotada: tinta cinza sobre fundo cinza.
    gray = render_plate("PQR7C56", ink=120, background=190)[..., 0]

    assert equalize_contrast(gray).std() > gray.std()


def test_reduce_glare_removes_most_saturated_pixels():
    gray = _with_glare(render_plate("STU0D12")[..., 0])

    assert has_glare(gray)
    assert (reduce_glare(gray) >= 250).mean() < (gray >= 250).mean()


def test_clean_plate_only_gets_the_cheap_variants():
    names = [name for name, _ in ocr_variants(render_plate("BRA2E19"))]

    assert names[0] == "original"
    assert "clareada" not in names
    assert "sem_ruido" not in names
    assert "sem_reflexo" not in names


def test_dark_plate_gets_brightening_and_denoising_variants():
    names = [name for name, _ in ocr_variants(_dark(render_plate("HJK7L20")))]

    assert {"clareada", "sem_ruido"} <= set(names)


def test_plate_with_glare_gets_the_glare_variant():
    names = [name for name, _ in ocr_variants(_with_glare(render_plate("CDE3456")))]

    assert "sem_reflexo" in names


def test_all_variants_are_grayscale_with_the_target_height():
    for _, variant in ocr_variants(_dark(render_plate("JKL6F01"))):
        assert variant.ndim == 2
        assert variant.shape[0] == TARGET_PLATE_HEIGHT


def _plain_plate_background(height: int = 149, width: int = 500) -> np.ndarray:
    """Fundo uniforme de teste, sem moldura nem texto — o que importa aqui é só a reta em si,
    não o contraste dela contra um caractere específico (ver docstring dos testes abaixo)."""
    return np.full((height, width), 200, np.uint8)


def _with_a_straight_scratch(gray: np.ndarray) -> np.ndarray:
    """Um arranhão contínuo e comprido, com bom contraste contra o fundo de ponta a ponta.

    Um arranhão de verdade brilha por reflexo especular, então pode parecer claro OU escuro
    dependendo do que está por baixo (fundo claro da placa ou tinta escura de um caractere) — um
    valor de cor fixo não reproduz isso, e sobre um caractere de cor parecida ele "some" nas
    bordas do Canny, quebrando a reta em pedaços curtos demais para o Hough encontrar. Por isso
    este teste isola só o mecanismo (reta comprida => detectada e removível) num fundo uniforme,
    e os cenários com placa de verdade (``tests/plate_samples.py``, casos "arranhada"/
    "arranhada_suja") medem o resultado final na prática, em ``test_ocr_accuracy.py``.
    """
    scratched = gray.copy()
    height, width = scratched.shape[:2]
    cv2.line(scratched, (10, int(height * 0.35)), (width - 10, int(height * 0.7)), 30, 2, cv2.LINE_AA)
    return scratched


def test_has_scratches_detects_a_long_straight_line():
    clean = _plain_plate_background()
    scratched = _with_a_straight_scratch(clean)

    assert not has_scratches(clean)
    assert has_scratches(scratched)


def test_has_scratches_ignores_the_mercosul_band_border():
    """A borda da faixa azul "BRASIL" também é uma reta comprida, mas não é um arranhão — e nunca
    passa pelos caracteres (ver BAND_EXCLUSION_FRACTION)."""
    mercosul_plate = render_plate("ZQX7B15")[10:-10, 10:-10, 0]

    assert not has_scratches(mercosul_plate)


def test_remove_scratches_reduces_the_amount_of_long_line_pixels():
    scratched = _with_a_straight_scratch(_plain_plate_background())

    cleaned = remove_scratches(scratched)

    assert cv2.Canny(cleaned, 60, 160).sum() < cv2.Canny(scratched, 60, 160).sum()


def test_remove_scratches_is_a_noop_without_scratches():
    clean = _plain_plate_background()

    assert np.array_equal(remove_scratches(clean), clean)
