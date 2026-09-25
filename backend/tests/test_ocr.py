from unittest.mock import MagicMock, patch

import pytest

from app.main import app
from app.services.ocr_service import PlateReading
from app.services.plate_format import PlateFormat
from app.services.plate_verification import PlateVerification, VerificationStatus, get_plate_verifier

READING = PlateReading(
    plate="ABC1D23",
    format=PlateFormat.MERCOSUL,
    confidence=0.98,
    needs_review=False,
    detections=[{"text": "BRASIL", "confidence": 0.99}, {"text": "ABC1D23", "confidence": 0.98}],
)


@pytest.fixture
def verifier():
    fake = MagicMock()
    fake.verify.return_value = PlateVerification(VerificationStatus.REGULAR, "Sem restrições.", "Base de teste")
    app.dependency_overrides[get_plate_verifier] = lambda: fake
    yield fake
    del app.dependency_overrides[get_plate_verifier]


def _upload(authenticated_client):
    return authenticated_client.post("/ocr/upload", files={"file": ("placa.jpg", b"fake-image-bytes", "image/jpeg")})


def test_rejects_unsupported_content_type(authenticated_client):
    response = authenticated_client.post(
        "/ocr/upload",
        files={"file": ("placa.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 400


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_returns_plate_format_confidence_and_verification(_, authenticated_client, verifier):
    response = _upload(authenticated_client)

    assert response.status_code == 200
    body = response.json()
    assert body["plate"] == "ABC1D23"
    assert body["plate_format"] == "mercosul"
    assert body["confidence"] == 0.98
    assert body["needs_review"] is False
    assert body["verification"] == {"status": "regular", "detail": "Sem restrições.", "source": "Base de teste"}
    assert body["detections"][1] == {"text": "ABC1D23", "confidence": 0.98}
    verifier.verify.assert_called_once_with("ABC1D23")


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_default_verification_is_not_checked(_, authenticated_client):
    body = _upload(authenticated_client).json()

    assert body["verification"]["status"] == "not_checked"


@patch(
    "app.routers.ocr.read_plate",
    return_value=PlateReading(None, None, None, needs_review=True, detections=[{"text": "SP", "confidence": 0.4}]),
)
def test_without_a_valid_plate_nothing_is_sent_to_the_official_database(_, authenticated_client, verifier):
    body = _upload(authenticated_client).json()

    assert body["plate"] is None
    assert body["plate_format"] is None
    assert body["needs_review"] is True
    assert body["verification"] is None
    verifier.verify.assert_not_called()


@patch("app.routers.ocr.read_plate")
def test_returns_400_when_the_image_cannot_be_decoded(mock_read_plate, authenticated_client):
    mock_read_plate.side_effect = ValueError("Não foi possível decodificar a imagem enviada.")

    response = _upload(authenticated_client)

    assert response.status_code == 400
    assert response.json() == {"detail": "Não foi possível decodificar a imagem enviada."}


def test_ocr_runs_off_the_event_loop_so_the_api_keeps_responding(authenticated_client):
    import asyncio
    import time

    import httpx

    _ = authenticated_client
    finished = []

    def slow_read(_):
        time.sleep(0.5)
        return READING

    async def scenario():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:

            async def upload():
                files = {"file": ("placa.jpg", b"fake-image-bytes", "image/jpeg")}
                await async_client.post("/ocr/upload", files=files)
                finished.append("upload")

            async def health():
                await asyncio.sleep(0.1)
                await async_client.get("/health")
                finished.append("health")

            await asyncio.gather(upload(), health())

    with patch("app.routers.ocr.read_plate", side_effect=slow_read):
        asyncio.run(scenario())

    assert finished == ["health", "upload"]


class TestManualPlateEntry:

    def _submit(self, authenticated_client, plate: str, **extra):
        return authenticated_client.post("/ocr/manual", data={"plate": plate, **extra})

    def test_detects_mercosul_format_by_character_order(self, authenticated_client, verifier):
        response = self._submit(authenticated_client, "ABC1D23")

        assert response.status_code == 200
        body = response.json()
        assert body["plate"] == "ABC1D23"
        assert body["plate_format"] == "mercosul"
        assert body["confidence"] == 1.0
        assert body["needs_review"] is False
        assert body["detections"] == []
        assert body["audit_saved"] is None
        verifier.verify.assert_called_once_with("ABC1D23")

    def test_detects_old_format_by_character_order(self, authenticated_client):
        body = self._submit(authenticated_client, "ABC1234").json()

        assert body["plate"] == "ABC1234"
        assert body["plate_format"] == "antigo"

    @pytest.mark.parametrize(
        "typed",
        ["abc-1d23", " ABC1D23 ", "abc1d23"],
    )
    def test_normalizes_hyphen_lowercase_and_spaces(self, authenticated_client, typed):
        body = self._submit(authenticated_client, typed).json()

        assert body["plate"] == "ABC1D23"

    @pytest.mark.parametrize("invalid", ["ABC123", "ABCD123", "1234567", "ABCDEFG"])
    def test_rejects_text_that_is_not_a_valid_plate_format(self, authenticated_client, invalid):
        response = self._submit(authenticated_client, invalid)

        assert response.status_code == 400
        assert "formato" in response.json()["detail"].lower()

    def test_rejects_empty_plate(self, authenticated_client):
        response = self._submit(authenticated_client, "")

        assert response.status_code == 422

    def test_rejects_absurdly_long_text(self, authenticated_client):
        response = self._submit(authenticated_client, "A" * 200)

        assert response.status_code == 400

    def test_is_verified_against_the_official_database_like_an_ocr_read(self, authenticated_client, verifier):
        verifier.verify.return_value = PlateVerification(
            VerificationStatus.NOT_FOUND, "Placa não encontrada.", "Base de teste"
        )

        body = self._submit(authenticated_client, "ABC1D23").json()

        assert body["verification"] == {
            "status": "not_found",
            "detail": "Placa não encontrada.",
            "source": "Base de teste",
        }

    def test_invalid_plate_is_never_sent_to_the_official_database(self, authenticated_client, verifier):
        self._submit(authenticated_client, "ABCDEFG")

        verifier.verify.assert_not_called()

    def test_does_not_reflect_unsanitized_input_in_the_response(self, authenticated_client):
        response = self._submit(authenticated_client, "<script>alert(1)</script>")

        assert response.status_code == 400
        assert "<script>" not in response.text

    def test_attaches_a_photo_as_a_safeguard_and_saves_it_to_disk(self, authenticated_client, tmp_path, monkeypatch):
        import app.services.photo_storage as photo_storage

        monkeypatch.setattr(photo_storage.settings, "upload_dir", str(tmp_path))

        response = authenticated_client.post(
            "/ocr/manual",
            data={"plate": "ABC1D23", "ocr_plate": "ABC1D2Z", "ocr_confidence": "0.2"},
            files={"photo": ("placa.jpg", b"fake-image-bytes", "image/jpeg")},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["audit_saved"] is True
        saved_files = list(tmp_path.glob("manual_reviews/*.jpg"))
        assert len(saved_files) == 1
        assert saved_files[0].read_bytes() == b"fake-image-bytes"

    def test_invalid_ocr_plate_context_is_dropped_instead_of_failing(self, authenticated_client, tmp_path, monkeypatch):
        import app.services.photo_storage as photo_storage

        monkeypatch.setattr(photo_storage.settings, "upload_dir", str(tmp_path))

        response = authenticated_client.post(
            "/ocr/manual",
            data={"plate": "ABC1D23", "ocr_plate": "não é uma placa"},
            files={"photo": ("placa.jpg", b"fake-image-bytes", "image/jpeg")},
        )

        assert response.status_code == 200
        assert response.json()["audit_saved"] is True
