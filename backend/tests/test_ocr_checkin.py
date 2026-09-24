from datetime import date, timedelta
from unittest.mock import patch

import pytest

from app.main import app
from app.models import Schedule
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


def _schedule(db_session, employee, *, scheduled_date, plate="ABC1D23"):
    record = Schedule(
        plate=plate,
        driver_name="João da Silva",
        driver_document="12345678900",
        cargo_type="Grãos",
        scheduled_date=scheduled_date,
        created_by_id=employee.id,
    )
    db_session.add(record)
    db_session.flush()
    return record


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_scheduled_for_today_shows_schedule_and_vehicle_data(
    _, authenticated_client, employee, db_session, vehicle_provider_found
):
    _schedule(db_session, employee, scheduled_date=date.today())

    body = _upload(authenticated_client).json()

    assert body["checkin"]["found"] is True
    assert body["checkin"]["schedule"]["status"] == "on_time"
    assert body["checkin"]["schedule"]["driver_name"] == "João da Silva"
    assert body["checkin"]["schedule"]["cargo_type"] == "Grãos"
    assert body["checkin"]["vehicle_data"] == {
        "brand": "FIAT", "model": "UNO", "year": "2015", "uf": "SP", "color": "Branco"
    }


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_scheduled_for_a_future_date_is_early(
    _, authenticated_client, employee, db_session, vehicle_provider_found
):
    scheduled = _schedule(db_session, employee, scheduled_date=date.today() + timedelta(days=2))

    body = _upload(authenticated_client).json()

    assert body["checkin"]["schedule"]["status"] == "early"
    assert body["checkin"]["schedule"]["scheduled_date"] == scheduled.scheduled_date.isoformat()


@patch("app.routers.ocr.read_plate", return_value=READING)
def test_scheduled_for_a_past_date_is_late(
    _, authenticated_client, employee, db_session, vehicle_provider_found
):
    _schedule(db_session, employee, scheduled_date=date.today() - timedelta(days=1))

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
def test_schedule_still_shows_even_when_the_external_api_is_unavailable(
    _, authenticated_client, employee, db_session, vehicle_provider_not_found
):
    _schedule(db_session, employee, scheduled_date=date.today())

    body = _upload(authenticated_client).json()

    assert body["checkin"]["found"] is True
    assert body["checkin"]["schedule"]["status"] == "on_time"
    assert body["checkin"]["vehicle_data"] is None


@patch("app.routers.ocr.read_plate", return_value=NO_PLATE_READING)
def test_no_checkin_context_when_no_plate_was_read(_, authenticated_client, vehicle_provider_found):
    body = _upload(authenticated_client).json()

    assert body["checkin"] is None


def test_manual_entry_also_gets_a_checkin_context(authenticated_client, employee, db_session, vehicle_provider_found):
    _schedule(db_session, employee, scheduled_date=date.today())

    response = authenticated_client.post("/ocr/manual", data={"plate": "ABC1D23"})

    assert response.status_code == 200
    body = response.json()
    assert body["checkin"]["found"] is True
    assert body["checkin"]["schedule"]["status"] == "on_time"
