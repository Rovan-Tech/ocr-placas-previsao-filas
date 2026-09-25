import json

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _photo_bytes(fill: int) -> bytes:
    image = np.full((10, 10, 3), fill, dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


def _valid_data(**overrides):
    data = {
        "plate": "ABC1D23",
        "driver_name": "João da Silva",
        "driver_birth_date": "1990-01-01",
        "driver_birth_place": "São Luís - MA",
        "driver_birth_state": "MA",
        "driver_document_type": "cpf",
        "driver_document": "11144477735",
        "vehicle_brand": "Volvo",
        "vehicle_model": "FH 540",
        "vehicle_year": "2020",
        "vehicle_chassis": "9BWZZZ377VT004251",
        "vehicle_color": "Branco",
        "vehicle_length_m": "12.5",
        "vehicle_height_m": "4.0",
        "vehicle_width_m": "2.6",
        "origin_location": "São Paulo - SP",
        "destination_location": "São Luís - MA",
        "cargo_items": json.dumps([{"product_name": "Grãos", "category": "nao_perecivel"}]),
        "scheduled_date": "2026-09-24",
    }
    data.update(overrides)
    return data


def _valid_files(**overrides):
    files = {
        "driver_document_photo_front": ("cnh-frente.jpg", _photo_bytes(10), "image/jpeg"),
        "driver_document_photo_back": ("cnh-verso.jpg", _photo_bytes(15), "image/jpeg"),
        "vehicle_document_photo": ("crlv.jpg", _photo_bytes(20), "image/jpeg"),
        "manifest_photo": ("manifesto.jpg", _photo_bytes(30), "image/jpeg"),
    }
    files.update(overrides)
    return files


def _create(client, *, data=None, files=None, omit_files=()):
    request_files = _valid_files(**(files or {}))
    for key in omit_files:
        request_files.pop(key, None)
    return client.post("/schedules", data=_valid_data(**(data or {})), files=request_files)


class TestCreateSchedule:
    def test_creates_a_schedule_with_all_fields_and_saves_the_four_photos(
        self, authenticated_client, tmp_path, monkeypatch
    ):
        import app.services.photo_storage as photo_storage

        monkeypatch.setattr(photo_storage.settings, "upload_dir", str(tmp_path))

        response = _create(authenticated_client)

        assert response.status_code == 201
        body = response.json()
        assert body["plate"] == "ABC1D23"
        assert body["driver_name"] == "João da Silva"
        assert body["vehicle_brand"] == "Volvo"
        assert body["cargo_items"] == [{"id": body["cargo_items"][0]["id"], "product_name": "Grãos", "category": "nao_perecivel"}]
        saved_files = list(tmp_path.glob("schedules/*.jpg"))
        assert len(saved_files) == 4

    def test_rejects_an_invalid_plate(self, authenticated_client):
        response = _create(authenticated_client, data={"plate": "NAO-E-PLACA"})

        assert response.status_code == 400

    def test_rejects_an_empty_driver_name(self, authenticated_client):
        response = _create(authenticated_client, data={"driver_name": "   "})

        assert response.status_code == 422

    def test_rejects_an_unknown_birth_state(self, authenticated_client):
        response = _create(authenticated_client, data={"driver_birth_state": "XX"})

        assert response.status_code == 422

    def test_normalizes_the_birth_state_to_uppercase(self, authenticated_client):
        response = _create(authenticated_client, data={"driver_birth_state": "ma"})

        assert response.status_code == 201
        assert response.json()["driver_birth_state"] == "MA"

    def test_rejects_a_cpf_with_less_than_11_digits(self, authenticated_client):
        response = _create(authenticated_client, data={"driver_document": "123456789"})

        assert response.status_code == 422

    def test_rejects_a_cpf_with_more_than_11_digits(self, authenticated_client):
        response = _create(authenticated_client, data={"driver_document": "123456789001"})

        assert response.status_code == 422

    def test_strips_punctuation_from_the_cpf_before_counting_the_digits(self, authenticated_client):
        response = _create(authenticated_client, data={"driver_document": "111.444.777-35"})

        assert response.status_code == 201
        assert response.json()["driver_document"] == "11144477735"

    def test_rejects_a_cpf_with_an_invalid_check_digit(self, authenticated_client):
        response = _create(authenticated_client, data={"driver_document": "11144477736"})

        assert response.status_code == 422

    def test_rejects_a_cpf_with_all_digits_repeated(self, authenticated_client):
        response = _create(authenticated_client, data={"driver_document": "11111111111"})

        assert response.status_code == 422

    def test_accepts_an_old_model_rg_with_a_letter_and_strips_punctuation(self, authenticated_client):
        response = _create(
            authenticated_client, data={"driver_document_type": "rg", "driver_document": "MG-12.345-6"}
        )

        assert response.status_code == 201
        assert response.json()["driver_document"] == "MG123456"

    def test_rejects_an_old_model_rg_shorter_than_7_characters(self, authenticated_client):
        response = _create(authenticated_client, data={"driver_document_type": "rg", "driver_document": "12345"})

        assert response.status_code == 422

    def test_rejects_an_old_model_rg_longer_than_9_characters_but_not_a_valid_cpf_length(self, authenticated_client):
        response = _create(
            authenticated_client, data={"driver_document_type": "rg", "driver_document": "1234567890"}
        )

        assert response.status_code == 422

    def test_accepts_a_new_model_rg_cin_when_it_is_a_valid_cpf(self, authenticated_client):
        response = _create(
            authenticated_client, data={"driver_document_type": "rg", "driver_document": "111.444.777-35"}
        )

        assert response.status_code == 201
        assert response.json()["driver_document"] == "11144477735"

    def test_rejects_a_new_model_rg_cin_with_an_invalid_cpf_check_digit(self, authenticated_client):
        response = _create(
            authenticated_client, data={"driver_document_type": "rg", "driver_document": "111.444.777-36"}
        )

        assert response.status_code == 422

    def test_accepts_an_11_digit_cnh_registration_number(self, authenticated_client):
        response = _create(
            authenticated_client, data={"driver_document_type": "cnh", "driver_document": "12345678900"}
        )

        assert response.status_code == 201
        assert response.json()["driver_document"] == "12345678900"

    def test_rejects_a_cnh_with_fewer_than_11_digits(self, authenticated_client):
        response = _create(
            authenticated_client, data={"driver_document_type": "cnh", "driver_document": "123456789"}
        )

        assert response.status_code == 422

    def test_rejects_missing_cargo_items(self, authenticated_client):
        response = _create(authenticated_client, data={"cargo_items": json.dumps([])})

        assert response.status_code == 422

    def test_rejects_an_oversized_cargo_items_payload(self, authenticated_client):
        huge_product_name = "A" * 20_000
        response = _create(
            authenticated_client,
            data={"cargo_items": json.dumps([{"product_name": huge_product_name, "category": "nao_perecivel"}])},
        )

        assert response.status_code == 422

    def test_rejects_malformed_cargo_items_json(self, authenticated_client):
        response = _create(authenticated_client, data={"cargo_items": "not-json"})

        assert response.status_code == 422

    def test_rejects_an_unknown_cargo_category(self, authenticated_client):
        response = _create(
            authenticated_client,
            data={"cargo_items": json.dumps([{"product_name": "Grãos", "category": "explosivo"}])},
        )

        assert response.status_code == 422

    def test_rejects_when_a_required_photo_is_missing(self, authenticated_client):
        response = _create(authenticated_client, omit_files=["manifest_photo"])

        assert response.status_code == 422

    def test_rejects_when_the_driver_document_back_photo_is_missing(self, authenticated_client):
        response = _create(authenticated_client, omit_files=["driver_document_photo_back"])

        assert response.status_code == 422

    def test_rejects_a_non_image_photo(self, authenticated_client):
        response = _create(
            authenticated_client,
            files={"driver_document_photo_front": ("doc.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

        assert response.status_code == 400

    def test_rejects_a_photo_whose_content_does_not_match_the_declared_type(self, authenticated_client):
        response = _create(
            authenticated_client,
            files={"vehicle_document_photo": ("evil.jpg", b"<svg onload=alert(1)></svg>", "image/jpeg")},
        )

        assert response.status_code == 400

    def test_rejects_a_photo_larger_than_the_limit(self, authenticated_client):
        oversized = b"\xff" * (5 * 1024 * 1024 + 1)

        response = _create(authenticated_client, files={"manifest_photo": ("grande.jpg", oversized, "image/jpeg")})

        assert response.status_code == 413

    def test_requires_authentication(self):
        request_files = _valid_files()
        response = client.post("/schedules", data=_valid_data(), files=request_files)

        assert response.status_code == 401

    def test_normalizes_the_plate_with_a_hyphen(self, authenticated_client):
        response = _create(authenticated_client, data={"plate": "ABC-1234"})

        assert response.status_code == 201
        assert response.json()["plate"] == "ABC1234"

    def test_rejects_a_chassis_with_less_than_17_characters(self, authenticated_client):
        response = _create(authenticated_client, data={"vehicle_chassis": "9BWZZZ377VT00425"})

        assert response.status_code == 422

    def test_rejects_a_chassis_with_more_than_17_characters(self, authenticated_client):
        response = _create(authenticated_client, data={"vehicle_chassis": "9BWZZZ377VT0042511"})

        assert response.status_code == 422

    def test_strips_spaces_and_symbols_from_the_chassis_before_counting_the_length(self, authenticated_client):
        response = _create(authenticated_client, data={"vehicle_chassis": "9bw-zzz 377.vt-004251"})

        assert response.status_code == 201
        assert response.json()["vehicle_chassis"] == "9BWZZZ377VT004251"

    def test_rounds_the_vehicle_dimensions_to_two_decimal_places(self, authenticated_client):
        response = _create(
            authenticated_client,
            data={"vehicle_length_m": "12.567", "vehicle_height_m": "4.001", "vehicle_width_m": "2.607"},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["vehicle_length_m"] == 12.57
        assert body["vehicle_height_m"] == 4.0
        assert body["vehicle_width_m"] == 2.61

    def test_rejects_a_vehicle_dimension_that_is_zero_or_negative(self, authenticated_client):
        response = _create(authenticated_client, data={"vehicle_width_m": "0"})

        assert response.status_code == 422

    def test_validates_the_driver_document_against_the_photo(self, authenticated_client, tmp_path, monkeypatch):
        import app.services.photo_storage as photo_storage

        monkeypatch.setattr(photo_storage.settings, "upload_dir", str(tmp_path))

        response = _create(authenticated_client, data={"driver_document": "11144477735"})

        assert response.status_code == 201
        body = response.json()
        assert body["driver_document_validated"] is False
        assert "não foi encontrado" in body["driver_document_validation_detail"]

    def test_rejects_a_second_schedule_for_the_same_plate_and_date(self, authenticated_client):
        _create(authenticated_client)

        response = _create(
            authenticated_client,
            data={"driver_document": "52998224725", "vehicle_chassis": "1HGCM82633A004352"},
        )

        assert response.status_code == 409

    def test_rejects_a_second_schedule_for_the_same_driver_document_and_date(self, authenticated_client):
        _create(authenticated_client)

        response = _create(
            authenticated_client,
            data={"plate": "XYZ9A87", "vehicle_chassis": "1HGCM82633A004352"},
        )

        assert response.status_code == 409

    def test_rejects_a_second_schedule_for_the_same_vehicle_chassis_and_date(self, authenticated_client):
        _create(authenticated_client)

        response = _create(
            authenticated_client,
            data={"plate": "XYZ9A87", "driver_document": "52998224725"},
        )

        assert response.status_code == 409

    def test_allows_the_same_plate_on_a_different_date(self, authenticated_client):
        _create(authenticated_client)

        response = _create(
            authenticated_client,
            data={
                "driver_document": "52998224725",
                "vehicle_chassis": "1HGCM82633A004352",
                "scheduled_date": "2026-09-25",
            },
        )

        assert response.status_code == 201


class TestListSchedules:
    def test_lists_created_schedules(self, authenticated_client):
        _create(authenticated_client, data={"plate": "ABC1D23"})
        _create(
            authenticated_client,
            data={"plate": "XYZ9A87", "driver_document": "52998224725", "vehicle_chassis": "1HGCM82633A004352"},
        )

        response = authenticated_client.get("/schedules")

        assert response.status_code == 200
        plates = {row["plate"] for row in response.json()}
        assert plates == {"ABC1D23", "XYZ9A87"}

    def test_filters_by_plate(self, authenticated_client):
        _create(authenticated_client, data={"plate": "ABC1D23"})
        _create(
            authenticated_client,
            data={"plate": "XYZ9A87", "driver_document": "52998224725", "vehicle_chassis": "1HGCM82633A004352"},
        )

        response = authenticated_client.get("/schedules", params={"plate": "ABC1D23"})

        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 1
        assert rows[0]["plate"] == "ABC1D23"

    def test_requires_authentication(self):
        response = client.get("/schedules")

        assert response.status_code == 401


class TestSchedulePhotos:
    def test_returns_404_for_an_unknown_schedule(self, authenticated_client):
        assert authenticated_client.get("/schedules/999999/driver-document-photo-front").status_code == 404
        assert authenticated_client.get("/schedules/999999/driver-document-photo-back").status_code == 404
        assert authenticated_client.get("/schedules/999999/vehicle-document-photo").status_code == 404
        assert authenticated_client.get("/schedules/999999/manifest-photo").status_code == 404

    def test_serves_the_four_photos_separately(self, authenticated_client, tmp_path, monkeypatch):
        import app.services.photo_storage as photo_storage

        monkeypatch.setattr(photo_storage.settings, "upload_dir", str(tmp_path))
        driver_front_bytes = _photo_bytes(10)
        driver_back_bytes = _photo_bytes(15)
        vehicle_bytes = _photo_bytes(20)
        manifest_bytes = _photo_bytes(30)

        created = _create(
            authenticated_client,
            files={
                "driver_document_photo_front": ("cnh-frente.jpg", driver_front_bytes, "image/jpeg"),
                "driver_document_photo_back": ("cnh-verso.jpg", driver_back_bytes, "image/jpeg"),
                "vehicle_document_photo": ("crlv.jpg", vehicle_bytes, "image/jpeg"),
                "manifest_photo": ("manifesto.jpg", manifest_bytes, "image/jpeg"),
            },
        ).json()

        driver_front = authenticated_client.get(f"/schedules/{created['id']}/driver-document-photo-front")
        driver_back = authenticated_client.get(f"/schedules/{created['id']}/driver-document-photo-back")
        vehicle = authenticated_client.get(f"/schedules/{created['id']}/vehicle-document-photo")
        manifest = authenticated_client.get(f"/schedules/{created['id']}/manifest-photo")

        assert driver_front.status_code == 200
        assert driver_front.content == driver_front_bytes
        assert driver_back.status_code == 200
        assert driver_back.content == driver_back_bytes
        assert vehicle.status_code == 200
        assert vehicle.content == vehicle_bytes
        assert manifest.status_code == 200
        assert manifest.content == manifest_bytes

    def test_photo_endpoints_require_authentication(self):
        assert client.get("/schedules/1/driver-document-photo-front").status_code == 401
        assert client.get("/schedules/1/driver-document-photo-back").status_code == 401
        assert client.get("/schedules/1/vehicle-document-photo").status_code == 401
        assert client.get("/schedules/1/manifest-photo").status_code == 401
