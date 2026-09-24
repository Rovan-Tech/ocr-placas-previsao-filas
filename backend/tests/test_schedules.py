from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create(client, **overrides):
    data = {
        "plate": "ABC1D23",
        "driver_name": "João da Silva",
        "driver_document": "12345678900",
        "cargo_type": "Grãos",
        "scheduled_date": "2026-09-24",
        **overrides,
    }
    return client.post("/schedules", data=data)


class TestCreateSchedule:
    def test_creates_a_schedule_with_no_photos(self, authenticated_client):
        response = _create(authenticated_client)

        assert response.status_code == 201
        body = response.json()
        assert body["plate"] == "ABC1D23"
        assert body["driver_name"] == "João da Silva"
        assert body["has_driver_document_photo_front"] is False
        assert body["has_driver_document_photo_back"] is False
        assert body["has_vehicle_document_photo"] is False

    def test_creates_a_schedule_with_all_three_photos_and_saves_them_to_disk(
        self, authenticated_client, tmp_path, monkeypatch
    ):
        import app.services.photo_storage as photo_storage

        monkeypatch.setattr(photo_storage.settings, "upload_dir", str(tmp_path))

        response = authenticated_client.post(
            "/schedules",
            data={
                "plate": "ABC1D23",
                "driver_name": "João da Silva",
                "driver_document": "12345678900",
                "cargo_type": "Grãos",
                "scheduled_date": "2026-09-24",
            },
            files={
                "driver_document_photo_front": ("cnh-frente.jpg", b"fake-driver-doc-front", "image/jpeg"),
                "driver_document_photo_back": ("cnh-verso.jpg", b"fake-driver-doc-back", "image/jpeg"),
                "vehicle_document_photo": ("crlv.jpg", b"fake-vehicle-doc", "image/jpeg"),
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["has_driver_document_photo_front"] is True
        assert body["has_driver_document_photo_back"] is True
        assert body["has_vehicle_document_photo"] is True
        saved_files = list(tmp_path.glob("schedules/*.jpg"))
        assert len(saved_files) == 3

    def test_rejects_an_invalid_plate(self, authenticated_client):
        response = _create(authenticated_client, plate="NAO-E-PLACA")

        assert response.status_code == 400

    def test_rejects_an_empty_driver_name(self, authenticated_client):
        response = _create(authenticated_client, driver_name="   ")

        assert response.status_code == 422

    def test_rejects_a_non_image_photo(self, authenticated_client):
        response = authenticated_client.post(
            "/schedules",
            data={
                "plate": "ABC1D23",
                "driver_name": "João da Silva",
                "driver_document": "12345678900",
                "cargo_type": "Grãos",
                "scheduled_date": "2026-09-24",
            },
            files={"driver_document_photo_front": ("doc.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

        assert response.status_code == 400

    def test_rejects_a_photo_larger_than_the_limit(self, authenticated_client):
        oversized = b"\xff" * (5 * 1024 * 1024 + 1)

        response = authenticated_client.post(
            "/schedules",
            data={
                "plate": "ABC1D23",
                "driver_name": "João da Silva",
                "driver_document": "12345678900",
                "cargo_type": "Grãos",
                "scheduled_date": "2026-09-24",
            },
            files={"driver_document_photo_front": ("cnh.jpg", oversized, "image/jpeg")},
        )

        assert response.status_code == 413

    def test_requires_authentication(self):
        response = _create(client)

        assert response.status_code == 401

    def test_normalizes_the_plate_with_a_hyphen(self, authenticated_client):
        response = _create(authenticated_client, plate="ABC-1234")

        assert response.status_code == 201
        assert response.json()["plate"] == "ABC1234"


class TestListSchedules:
    def test_lists_created_schedules(self, authenticated_client):
        _create(authenticated_client, plate="ABC1D23")
        _create(authenticated_client, plate="XYZ9A87")

        response = authenticated_client.get("/schedules")

        assert response.status_code == 200
        plates = {row["plate"] for row in response.json()}
        assert plates == {"ABC1D23", "XYZ9A87"}

    def test_filters_by_plate(self, authenticated_client):
        _create(authenticated_client, plate="ABC1D23")
        _create(authenticated_client, plate="XYZ9A87")

        response = authenticated_client.get("/schedules", params={"plate": "ABC1D23"})

        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 1
        assert rows[0]["plate"] == "ABC1D23"

    def test_requires_authentication(self):
        response = client.get("/schedules")

        assert response.status_code == 401


class TestSchedulePhotos:
    def test_returns_404_when_there_is_no_photo(self, authenticated_client):
        created = _create(authenticated_client).json()

        assert authenticated_client.get(f"/schedules/{created['id']}/driver-document-photo-front").status_code == 404
        assert authenticated_client.get(f"/schedules/{created['id']}/driver-document-photo-back").status_code == 404
        assert authenticated_client.get(f"/schedules/{created['id']}/vehicle-document-photo").status_code == 404

    def test_returns_404_for_an_unknown_schedule(self, authenticated_client):
        assert authenticated_client.get("/schedules/999999/driver-document-photo-front").status_code == 404
        assert authenticated_client.get("/schedules/999999/driver-document-photo-back").status_code == 404
        assert authenticated_client.get("/schedules/999999/vehicle-document-photo").status_code == 404

    def test_serves_the_front_and_back_driver_document_photos_separately(
        self, authenticated_client, tmp_path, monkeypatch
    ):
        import app.services.photo_storage as photo_storage

        monkeypatch.setattr(photo_storage.settings, "upload_dir", str(tmp_path))

        created = authenticated_client.post(
            "/schedules",
            data={
                "plate": "ABC1D23",
                "driver_name": "João da Silva",
                "driver_document": "12345678900",
                "cargo_type": "Grãos",
                "scheduled_date": "2026-09-24",
            },
            files={
                "driver_document_photo_front": ("cnh-frente.jpg", b"fake-driver-doc-front", "image/jpeg"),
                "driver_document_photo_back": ("cnh-verso.jpg", b"fake-driver-doc-back", "image/jpeg"),
            },
        ).json()

        front = authenticated_client.get(f"/schedules/{created['id']}/driver-document-photo-front")
        back = authenticated_client.get(f"/schedules/{created['id']}/driver-document-photo-back")

        assert front.status_code == 200
        assert front.content == b"fake-driver-doc-front"
        assert back.status_code == 200
        assert back.content == b"fake-driver-doc-back"
