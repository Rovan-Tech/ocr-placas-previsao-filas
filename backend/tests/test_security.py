import os
from unittest.mock import patch

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import get_db
from app.main import SECURITY_HEADERS, app
from app.routers.ocr import MAX_UPLOAD_BYTES
from app.services import ocr_service
from app.services.ocr_service import PlateReading

client = TestClient(app)


@pytest.mark.parametrize("path", ["/health", "/rota-inexistente"])
def test_responses_include_security_headers(path):
    response = client.get(path)

    for header, value in SECURITY_HEADERS.items():
        assert response.headers[header] == value


def test_cors_does_not_allow_arbitrary_origins():
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers


def test_cors_never_configured_with_wildcard_and_credentials():
    cors_middleware = next(
        m for m in app.user_middleware if m.cls.__name__ == "CORSMiddleware"
    )
    assert cors_middleware.kwargs.get("allow_credentials") is False
    assert "*" not in cors_middleware.kwargs.get("allow_origins", [])


@pytest.mark.parametrize(
    "origins_env,expected",
    [
        ("", []),
        ("https://ocr-placas.pages.dev", ["https://ocr-placas.pages.dev"]),
        (
            "https://a.example, https://b.example",
            ["https://a.example", "https://b.example"],
        ),
    ],
)
def test_frontend_origins_list_parses_comma_separated_env(monkeypatch, origins_env, expected):
    monkeypatch.setattr(settings, "frontend_origins", origins_env)

    assert settings.frontend_origins_list == expected


def test_rate_limits_ocr_upload_per_ip(monkeypatch, authenticated_client):
    monkeypatch.setattr(settings, "ocr_upload_rate_limit", "2/minute")
    reading = PlateReading(plate=None, format=None, confidence=None, needs_review=True, detections=[])

    with patch("app.routers.ocr.read_plate", return_value=reading):
        responses = [
            authenticated_client.post(
                "/ocr/upload",
                files={"file": ("placa.jpg", b"fake-image-bytes", "image/jpeg")},
            )
            for _ in range(3)
        ]

    assert [r.status_code for r in responses[:2]] == [200, 200]
    assert responses[2].status_code == 429


@patch("app.routers.ocr.read_plate")
def test_rejects_uploads_larger_than_the_limit(mock_read_plate, authenticated_client):
    oversized = b"\xff" * (MAX_UPLOAD_BYTES + 1)

    response = authenticated_client.post(
        "/ocr/upload",
        files={"file": ("placa.jpg", oversized, "image/jpeg")},
    )

    assert response.status_code == 413
    mock_read_plate.assert_not_called()


@patch("app.routers.ocr.read_plate")
def test_does_not_reflect_client_supplied_content_type(mock_read_plate, authenticated_client):
    malicious_type = "text/html<script>alert(1)</script>"

    response = authenticated_client.post(
        "/ocr/upload",
        files={"file": ("placa.html", b"<script>", malicious_type)},
    )

    assert response.status_code == 400
    assert "<script>" not in response.text
    mock_read_plate.assert_not_called()


def test_rejects_images_above_the_pixel_limit(monkeypatch):
    monkeypatch.setattr(ocr_service, "MAX_IMAGE_PIXELS", 100)
    _, encoded = cv2.imencode(".png", np.zeros((20, 20, 3), dtype=np.uint8))
    image_bytes = encoded.tobytes()

    with pytest.raises(ValueError, match="Resolução"):
        ocr_service.read_plate(image_bytes)


def test_rejects_empty_image_bytes_without_crashing():
    with pytest.raises(ValueError, match="Nenhuma imagem"):
        ocr_service.read_plate(b"")


def test_opencv_decoder_is_capped_against_decompression_bombs():
    assert int(os.environ["OPENCV_IO_MAX_IMAGE_PIXELS"]) <= ocr_service.MAX_IMAGE_PIXELS


@pytest.mark.parametrize(
    "payload",
    [b"", b"GIF89a" + b"\x00" * 32, b"%PDF-1.4 fake", b"\x00" * 1024],
)
def test_returns_400_for_non_image_bytes_disguised_as_jpeg(payload, authenticated_client):
    response = authenticated_client.post(
        "/ocr/upload",
        files={"file": ("placa.jpg", payload, "image/jpeg")},
    )

    assert response.status_code == 400


class TestAuthentication:

    @pytest.fixture
    def db_client(self, db_session):
        app.dependency_overrides[get_db] = lambda: db_session
        try:
            yield TestClient(app)
        finally:
            del app.dependency_overrides[get_db]

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("post", "/ocr/upload"),
            ("post", "/ocr/manual"),
            ("get", "/logs"),
            ("get", "/logs/1/photo"),
        ],
    )
    def test_protected_endpoints_reject_requests_without_a_token(self, method, path):
        response = getattr(client, method)(path)

        assert response.status_code == 401

    def test_rejects_a_tampered_token(self):
        response = client.get("/logs", headers={"Authorization": "Bearer isso.nao.eh.um.jwt.valido"})

        assert response.status_code == 401

    def test_rejects_a_token_signed_with_a_different_key(self):
        import jwt

        from app.config import settings

        forged = jwt.encode({"sub": "1"}, "chave-errada-mas-com-32-bytes-ok", algorithm=settings.jwt_algorithm)

        response = client.get("/logs", headers={"Authorization": f"Bearer {forged}"})

        assert response.status_code == 401

    def test_login_rejects_wrong_password(self, employee, db_client):
        response = db_client.post("/auth/login", data={"username": employee.username, "password": "senha-errada"})

        assert response.status_code == 401

    def test_login_rejects_unknown_username(self, db_client):
        response = db_client.post("/auth/login", data={"username": "ninguem-com-esse-login", "password": "qualquer"})

        assert response.status_code == 401

    def test_login_does_not_reveal_whether_the_username_exists(self, employee, db_client):
        wrong_password = db_client.post("/auth/login", data={"username": employee.username, "password": "errada"})
        unknown_user = db_client.post(
            "/auth/login", data={"username": "ninguem-com-esse-login", "password": "errada"}
        )

        assert wrong_password.status_code == unknown_user.status_code
        assert wrong_password.json() == unknown_user.json()

    def test_successful_login_never_returns_the_password_hash(self, employee, db_client):
        response = db_client.post("/auth/login", data={"username": employee.username, "password": "s3nhaSegura!"})

        assert response.status_code == 200
        assert "password_hash" not in response.text
        assert employee.password_hash not in response.text

    def test_login_returns_a_usable_token(self, employee, db_client):
        token = db_client.post(
            "/auth/login", data={"username": employee.username, "password": "s3nhaSegura!"}
        ).json()["access_token"]

        response = db_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 200
        assert response.json() == {
            "id": employee.id,
            "username": employee.username,
            "full_name": employee.full_name,
            "is_admin": False,
            "active": True,
        }

    def test_inactive_employee_cannot_log_in(self, employee, db_session, db_client):
        employee.active = False
        db_session.flush()

        response = db_client.post("/auth/login", data={"username": employee.username, "password": "s3nhaSegura!"})

        assert response.status_code == 401

    def test_deactivating_an_employee_invalidates_their_existing_token(self, employee, db_session, db_client):
        from app.services.auth import create_access_token

        token = create_access_token(employee)
        employee.active = False
        db_session.flush()

        response = db_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 401


def test_photo_path_traversal_is_rejected():
    from app.services.photo_storage import resolve_photo_path

    assert resolve_photo_path("../../../../etc/passwd") is None
    assert resolve_photo_path("/etc/passwd") is None


class TestPasswordValidationDoesNotReflectTheInput:

    @pytest.fixture
    def admin(self, db_session):
        from app.models import Employee
        from app.services.auth import hash_password

        record = Employee(
            username="admin.seguranca.teste",
            full_name="Admin de Segurança",
            password_hash=hash_password("senhaAdminForte1"),
            is_admin=True,
            must_change_password=False,
        )
        db_session.add(record)
        db_session.flush()
        db_session.refresh(record)
        return record

    @pytest.fixture
    def db_client(self, db_session):
        app.dependency_overrides[get_db] = lambda: db_session
        try:
            yield TestClient(app)
        finally:
            del app.dependency_overrides[get_db]

    def test_create_employee_does_not_echo_a_short_temporary_password(self, admin, db_client):
        from app.services.auth import create_access_token

        short_password = "curta1"
        response = db_client.post(
            "/auth/employees",
            headers={"Authorization": f"Bearer {create_access_token(admin)}"},
            json={
                "username": "fiscal.seguranca.teste",
                "full_name": "Fiscal Novo",
                "temporary_password": short_password,
            },
        )

        assert response.status_code == 422
        assert short_password not in response.text

    def test_change_password_does_not_echo_a_short_new_password(self, employee, db_client):
        from app.services.auth import create_access_token

        short_password = "curta2"
        response = db_client.post(
            "/auth/change-password",
            headers={"Authorization": f"Bearer {create_access_token(employee)}"},
            json={"current_password": "s3nhaSegura!", "new_password": short_password},
        )

        assert response.status_code == 422
        assert short_password not in response.text


class TestScheduleSecurity:

    def test_sql_injection_payloads_in_schedule_fields_are_treated_as_plain_text(self, authenticated_client):
        payload = "'; DROP TABLE schedules;--"
        short_payload = "1' OR '1'='1"
        response = authenticated_client.post(
            "/schedules",
            data={
                "plate": "ABC1D23",
                "driver_name": payload,
                "driver_document": short_payload,
                "cargo_type": payload,
                "scheduled_date": "2026-09-24",
            },
        )

        assert response.status_code == 201
        assert response.json()["driver_name"] == payload

        listing = authenticated_client.get("/schedules")
        assert listing.status_code == 200

    def test_requires_authentication_to_create(self):
        response = client.post(
            "/schedules",
            data={
                "plate": "ABC1D23",
                "driver_name": "João",
                "driver_document": "123",
                "cargo_type": "Grãos",
                "scheduled_date": "2026-09-24",
            },
        )

        assert response.status_code == 401

    def test_photo_endpoints_require_authentication(self):
        assert client.get("/schedules/1/driver-document-photo").status_code == 401
        assert client.get("/schedules/1/vehicle-document-photo").status_code == 401
