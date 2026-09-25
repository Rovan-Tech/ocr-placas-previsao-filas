from datetime import date, timedelta
from unittest.mock import patch

import pytest

from app.main import app
from app.services.ocr_service import PlateReading
from app.services.plate_format import PlateFormat
from app.services.vehicle_data_api import VehicleData, get_vehicle_data_provider

READING = PlateReading(plate="ABC1D23", format=PlateFormat.MERCOSUL, confidence=0.98, needs_review=False, detections=[])
NO_PLATE_READING = PlateReading(plate=None, format=None, confidence=None, needs_review=True, detections=[])
VEHICLE_DATA = VehicleData(brand="FIAT", model="UNO", year="2015", uf="SP", color="Branco")


class _FakeVehicleProvider:
    def __init__(self, data):
        self._data = data

    async def lookup(self, plate):
        return self._data


@pytest.fixture
def vehicle_provider_found():
    app.dependency_overrides[get_vehicle_data_provider] = lambda: _FakeVehicleProvider(VEHICLE_DATA)
    yield
    del app.dependency_overrides[get_vehicle_data_provider]


@pytest.fixture
def vehicle_provider_not_found():
    app.dependency_overrides[get_vehicle_data_provider] = lambda: _FakeVehicleProvider(None)
    yield
    del app.dependency_overrides[get_vehicle_data_provider]


def _upload(authenticated_client):
    return authenticated_client.post("/ocr/upload", files={"file": ("placa.jpg", b"fake-image-bytes", "image/jpeg")})


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_scheduled_for_today_shows_schedule_and_vehicle_data(
    _, authenticated_client, employee, make_schedule, vehicle_provider_found
):
    make_schedule(employee, scheduled_date=date.today())

    body = _upload(authenticated_client).json()

    assert body["checkin"]["found"] is True
    assert body["checkin"]["schedule"]["status"] == "on_time"
    assert body["checkin"]["schedule"]["driver_name"] == "João da Silva"
    assert body["checkin"]["schedule"]["cargo_items"] == [{"product_name": "Grãos", "category": "nao_perecivel"}]
    assert body["checkin"]["schedule"]["driver_document_validated"] is True


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_scheduled_shows_the_driver_document_validation_result(
    _, authenticated_client, employee, make_schedule, vehicle_provider_found
):
    make_schedule(
        employee,
        scheduled_date=date.today(),
        driver_document_validated=False,
        driver_document_validation_detail="Número do documento não foi encontrado na foto — confira manualmente.",
    )

    body = _upload(authenticated_client).json()

    assert body["checkin"]["schedule"]["driver_document_validated"] is False
    assert body["checkin"]["schedule"]["driver_document_validation_detail"] == (
        "Número do documento não foi encontrado na foto — confira manualmente."
    )


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_scheduled_vehicle_shows_the_registered_vehicle_not_the_external_lookup(
    _, authenticated_client, employee, make_schedule, vehicle_provider_found
):
    make_schedule(
        employee,
        scheduled_date=date.today(),
        vehicle_brand="Volvo",
        vehicle_model="FH 540",
        vehicle_year="2020",
        vehicle_color="Branco",
    )

    body = _upload(authenticated_client).json()

    assert body["checkin"]["vehicle_data"] == {
        "brand": "Volvo", "model": "FH 540", "year": "2020", "uf": None, "color": "Branco", "is_mock": False
    }


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_scheduled_for_a_future_date_is_early(
    _, authenticated_client, employee, make_schedule, vehicle_provider_found
):
    scheduled = make_schedule(employee, scheduled_date=date.today() + timedelta(days=2))

    body = _upload(authenticated_client).json()

    assert body["checkin"]["schedule"]["status"] == "early"
    assert body["checkin"]["schedule"]["scheduled_date"] == scheduled.scheduled_date.isoformat()


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_scheduled_for_a_past_date_is_late(
    _, authenticated_client, employee, make_schedule, vehicle_provider_found
):
    make_schedule(employee, scheduled_date=date.today() - timedelta(days=1))

    body = _upload(authenticated_client).json()

    assert body["checkin"]["schedule"]["status"] == "late"


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_no_schedule_but_found_in_the_external_api(_, authenticated_client, vehicle_provider_found):
    body = _upload(authenticated_client).json()

    assert body["checkin"]["found"] is True
    assert body["checkin"]["schedule"] is None
    assert body["checkin"]["vehicle_data"]["brand"] == "FIAT"


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_not_found_in_any_source(_, authenticated_client, vehicle_provider_not_found):
    body = _upload(authenticated_client).json()

    assert body["checkin"]["found"] is False
    assert body["checkin"]["schedule"] is None
    assert body["checkin"]["vehicle_data"] is None


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_schedule_still_shows_the_registered_vehicle_even_when_the_external_api_is_unavailable(
    _, authenticated_client, employee, make_schedule, vehicle_provider_not_found
):
    make_schedule(employee, scheduled_date=date.today())

    body = _upload(authenticated_client).json()

    assert body["checkin"]["found"] is True
    assert body["checkin"]["schedule"]["status"] == "on_time"
    assert body["checkin"]["vehicle_data"]["brand"] == "Volvo"
    assert body["checkin"]["vehicle_data"]["is_mock"] is False


@patch("app.routers.ocr.read_plate", return_value=NO_PLATE_READING)
def test_no_checkin_context_when_no_plate_was_read(_, authenticated_client, vehicle_provider_found):
    body = _upload(authenticated_client).json()

    assert body["checkin"] is None


def test_manual_entry_also_gets_a_checkin_context(authenticated_client, employee, make_schedule, vehicle_provider_found):
    make_schedule(employee, scheduled_date=date.today())

    response = authenticated_client.post("/ocr/manual", data={"plate": "ABC1D23"})

    assert response.status_code == 200
    body = response.json()
    assert body["checkin"]["found"] is True
    assert body["checkin"]["schedule"]["status"] == "on_time"


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_upload_automatically_creates_a_waiting_checkin(_, authenticated_client, db_session, vehicle_provider_found):
    from app.models import CheckIn, CheckInStatus

    body = _upload(authenticated_client).json()

    checkin_id = body["checkin"]["checkin_id"]
    assert checkin_id is not None
    record = db_session.get(CheckIn, checkin_id)
    assert record.plate == "ABC1D23"
    assert record.status == CheckInStatus.WAITING


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_upload_still_succeeds_when_the_automatic_checkin_fails_to_save(
    _, authenticated_client, db_session, vehicle_provider_found
):
    from sqlalchemy.exc import SQLAlchemyError

    from app.models import CheckIn

    with patch.object(db_session, "commit", side_effect=SQLAlchemyError("boom")):
        response = _upload(authenticated_client)

    assert response.status_code == 200
    body = response.json()
    assert body["plate"] == "ABC1D23"
    assert body["checkin"]["checkin_id"] is None
    assert db_session.query(CheckIn).count() == 0


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_upload_links_the_automatic_checkin_to_the_matched_schedule(
    _, authenticated_client, db_session, employee, make_schedule, vehicle_provider_found
):
    from app.models import CheckIn

    schedule = make_schedule(employee, scheduled_date=date.today())

    body = _upload(authenticated_client).json()

    record = db_session.get(CheckIn, body["checkin"]["checkin_id"])
    assert record.schedule_id == schedule.id


def test_manual_entry_automatically_creates_a_waiting_checkin(authenticated_client, db_session, vehicle_provider_found):
    from app.models import CheckIn, CheckInStatus

    body = authenticated_client.post("/ocr/manual", data={"plate": "ABC1D23"}).json()

    record = db_session.get(CheckIn, body["checkin"]["checkin_id"])
    assert record.plate == "ABC1D23"
    assert record.status == CheckInStatus.WAITING


@patch("app.routers.ocr.read_plate", return_value=NO_PLATE_READING)
def test_no_checkin_is_created_when_no_plate_was_read(_, authenticated_client, db_session, vehicle_provider_found):
    from app.models import CheckIn

    _upload(authenticated_client)

    assert db_session.query(CheckIn).count() == 0
