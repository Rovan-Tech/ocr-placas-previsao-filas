import numpy as np

from app.services.plate_locator import locate_plate


def test_returns_original_image_when_no_plate_like_region_is_found():
    blank_image = np.zeros((100, 100, 3), dtype=np.uint8)

    result = locate_plate(blank_image)

    assert result.shape == blank_image.shape


def test_crops_a_plate_shaped_rectangle_when_one_is_present():
    image = np.zeros((300, 300, 3), dtype=np.uint8)
    # Retângulo branco ~3:1 (proporção de uma placa Mercosul) sobre fundo preto.
    image[100:160, 50:260] = 255

    result = locate_plate(image)

    assert result.shape != image.shape
    aspect_ratio = result.shape[1] / result.shape[0]
    assert 2.0 <= aspect_ratio <= 5.0
