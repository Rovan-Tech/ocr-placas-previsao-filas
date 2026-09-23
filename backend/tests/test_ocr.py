from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_rejects_unsupported_content_type():
    response = client.post(
        "/ocr/upload",
        files={"file": ("placa.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 400


@patch("app.routers.ocr.read_plate_text")
def test_returns_detections_for_a_supported_image(mock_read_plate_text):
    mock_read_plate_text.return_value = [{"text": "ABC1D23", "confidence": 0.98}]

    response = client.post(
        "/ocr/upload",
        files={"file": ("placa.jpg", b"fake-image-bytes", "image/jpeg")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "placa.jpg"
    assert body["detections"] == [{"text": "ABC1D23", "confidence": 0.98}]


@patch("app.routers.ocr.read_plate_text")
def test_returns_400_when_the_image_cannot_be_decoded(mock_read_plate_text):
    mock_read_plate_text.side_effect = ValueError("Não foi possível decodificar a imagem enviada.")

    response = client.post(
        "/ocr/upload",
        files={"file": ("placa.jpg", b"not-really-an-image", "image/jpeg")},
    )

    assert response.status_code == 400
