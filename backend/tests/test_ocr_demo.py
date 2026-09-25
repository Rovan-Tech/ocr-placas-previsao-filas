from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import settings
from app.db import get_db
from app.main import app
from app.routers.ocr_demo import DEMO_SAMPLE_NAMES
from app.services.ocr_service import PlateReading
from app.services.plate_format import PlateFormat

client = TestClient(app)

FAKE_READING = PlateReading(
    plate="BRA2E19",
    format=PlateFormat.MERCOSUL,
    confidence=0.97,
    needs_review=False,
    detections=[{"text": "BRA2E19", "confidence": 0.97}],
)


def test_lists_demo_samples_without_authentication():
    response = client.get("/ocr/demo-samples")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == len(DEMO_SAMPLE_NAMES)
    assert {sample["id"] for sample in body} == set(DEMO_SAMPLE_NAMES)
    for sample in body:
        assert set(sample.keys()) == {"id", "description"}


def test_serves_a_demo_sample_image():
    response = client.get(f"/ocr/demo-samples/{DEMO_SAMPLE_NAMES[0]}/image")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert len(response.content) > 0


def test_returns_404_for_an_unknown_sample_image():
    response = client.get("/ocr/demo-samples/nao-existe/image")

    assert response.status_code == 404


def test_demo_upload_with_a_sample_id_reads_the_plate():
    with patch("app.routers.ocr_demo.read_plate", return_value=FAKE_READING):
        response = client.post("/ocr/demo-upload", data={"sample_id": DEMO_SAMPLE_NAMES[0]})

    assert response.status_code == 200
    body = response.json()
    assert body["plate"] == "BRA2E19"
    assert body["plate_format"] == "mercosul"
    assert body["needs_review"] is False


def test_demo_upload_with_an_own_photo_reads_the_plate():
    with patch("app.routers.ocr_demo.read_plate", return_value=FAKE_READING):
        response = client.post(
            "/ocr/demo-upload", files={"file": ("placa.jpg", b"fake-image-bytes", "image/jpeg")}
        )

    assert response.status_code == 200
    assert response.json()["plate"] == "BRA2E19"


def test_demo_upload_rejects_when_neither_sample_nor_file_is_given():
    response = client.post("/ocr/demo-upload")

    assert response.status_code == 422


def test_demo_upload_rejects_when_both_sample_and_file_are_given():
    response = client.post(
        "/ocr/demo-upload",
        data={"sample_id": DEMO_SAMPLE_NAMES[0]},
        files={"file": ("placa.jpg", b"fake-image-bytes", "image/jpeg")},
    )

    assert response.status_code == 422


def test_demo_upload_rejects_an_unknown_sample_id():
    response = client.post("/ocr/demo-upload", data={"sample_id": "nao-existe"})

    assert response.status_code == 404


def test_demo_upload_rejects_a_non_image_file():
    response = client.post(
        "/ocr/demo-upload", files={"file": ("doc.pdf", b"%PDF-1.4 fake", "application/pdf")}
    )

    assert response.status_code == 400


def test_demo_upload_rejects_a_file_larger_than_the_limit():
    oversized = b"\xff" * (5 * 1024 * 1024 + 1)

    response = client.post("/ocr/demo-upload", files={"file": ("grande.jpg", oversized, "image/jpeg")})

    assert response.status_code == 413


def test_demo_upload_never_writes_to_the_production_upload_log(db_session):
    from app.models import Employee, UploadLog

    app.dependency_overrides[get_db] = lambda: db_session
    try:
        with patch("app.routers.ocr_demo.read_plate", return_value=FAKE_READING):
            client.post("/ocr/demo-upload", data={"sample_id": DEMO_SAMPLE_NAMES[0]})
            client.post(
                "/ocr/demo-upload", files={"file": ("placa.jpg", b"fake-image-bytes", "image/jpeg")}
            )

        assert db_session.query(UploadLog).count() == 0
        assert db_session.query(Employee).count() == 0
    finally:
        del app.dependency_overrides[get_db]


def test_rate_limits_demo_upload_per_ip(monkeypatch):
    monkeypatch.setattr(settings, "ocr_demo_rate_limit", "2/minute")

    with patch("app.routers.ocr_demo.read_plate", return_value=FAKE_READING):
        responses = [
            client.post("/ocr/demo-upload", data={"sample_id": DEMO_SAMPLE_NAMES[0]}) for _ in range(3)
        ]

    assert [r.status_code for r in responses[:2]] == [200, 200]
    assert responses[2].status_code == 429
