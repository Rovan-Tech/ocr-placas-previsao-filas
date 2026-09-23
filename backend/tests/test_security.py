import os
from unittest.mock import patch

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import SECURITY_HEADERS, app
from app.routers.ocr import MAX_UPLOAD_BYTES
from app.services import ocr_service

client = TestClient(app)


@pytest.mark.parametrize("path", ["/health", "/rota-inexistente"])
def test_responses_include_security_headers(path):
    response = client.get(path)

    for header, value in SECURITY_HEADERS.items():
        assert response.headers[header] == value


def test_cors_does_not_allow_arbitrary_origins():
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers


@patch("app.routers.ocr.read_plate_text")
def test_rejects_uploads_larger_than_the_limit(mock_read_plate_text):
    oversized = b"\xff" * (MAX_UPLOAD_BYTES + 1)

    response = client.post(
        "/ocr/upload",
        files={"file": ("placa.jpg", oversized, "image/jpeg")},
    )

    assert response.status_code == 413
    mock_read_plate_text.assert_not_called()


@patch("app.routers.ocr.read_plate_text")
def test_does_not_reflect_client_supplied_content_type(mock_read_plate_text):
    malicious_type = "text/html<script>alert(1)</script>"

    response = client.post(
        "/ocr/upload",
        files={"file": ("placa.html", b"<script>", malicious_type)},
    )

    assert response.status_code == 400
    assert "<script>" not in response.text
    mock_read_plate_text.assert_not_called()


def test_rejects_images_above_the_pixel_limit(monkeypatch):
    monkeypatch.setattr(ocr_service, "MAX_IMAGE_PIXELS", 100)
    _, encoded = cv2.imencode(".png", np.zeros((20, 20, 3), dtype=np.uint8))
    image_bytes = encoded.tobytes()

    with pytest.raises(ValueError, match="Resolução"):
        ocr_service.read_plate_text(image_bytes)


def test_rejects_empty_image_bytes_without_crashing():
    with pytest.raises(ValueError, match="Nenhuma imagem"):
        ocr_service.read_plate_text(b"")


def test_opencv_decoder_is_capped_against_decompression_bombs():
    assert int(os.environ["OPENCV_IO_MAX_IMAGE_PIXELS"]) <= ocr_service.MAX_IMAGE_PIXELS


@pytest.mark.parametrize(
    "payload",
    [b"", b"GIF89a" + b"\x00" * 32, b"%PDF-1.4 fake", b"\x00" * 1024],
)
def test_returns_400_for_non_image_bytes_disguised_as_jpeg(payload):
    response = client.post(
        "/ocr/upload",
        files={"file": ("placa.jpg", payload, "image/jpeg")},
    )

    assert response.status_code == 400
