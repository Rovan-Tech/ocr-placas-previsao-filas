import asyncio
from unittest.mock import AsyncMock

import httpx

from app.services.vehicle_data_api import (
    ApiBrasilVehicleDataProvider,
    NotConfiguredVehicleDataProvider,
    VehicleData,
    get_vehicle_data_provider,
)


def _run(coro):
    return asyncio.run(coro)


class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _BadJsonResponse(_FakeResponse):
    def json(self):
        raise ValueError("resposta não é JSON")


def test_not_configured_provider_returns_none_without_calling_anything():
    provider = NotConfiguredVehicleDataProvider()

    assert _run(provider.lookup("ABC1D23")) is None


def test_factory_returns_not_configured_when_tokens_are_missing(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "api_brasil_device_token", "")
    monkeypatch.setattr(settings, "api_brasil_bearer_token", "")

    assert isinstance(get_vehicle_data_provider(), NotConfiguredVehicleDataProvider)


def test_factory_returns_the_real_provider_when_both_tokens_are_set(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "api_brasil_device_token", "device-123")
    monkeypatch.setattr(settings, "api_brasil_bearer_token", "bearer-123")

    assert isinstance(get_vehicle_data_provider(), ApiBrasilVehicleDataProvider)


def test_lookup_parses_a_successful_response(monkeypatch):
    provider = ApiBrasilVehicleDataProvider("device", "bearer", 5.0)
    fake_response = _FakeResponse(200, {"marca": "FIAT", "modelo": "UNO", "ano": "2015", "uf": "SP", "cor": "Branco"})
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(return_value=fake_response))

    result = _run(provider.lookup("ABC1D23"))

    assert result == VehicleData(brand="FIAT", model="UNO", year="2015", uf="SP", color="Branco")


def test_lookup_parses_a_response_wrapped_in_a_dados_key(monkeypatch):
    provider = ApiBrasilVehicleDataProvider("device", "bearer", 5.0)
    fake_response = _FakeResponse(
        200, {"dados": {"marca": "VOLKSWAGEN", "modelo": "GOL", "ano": "2020", "uf": "RJ", "cor": "Prata"}}
    )
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(return_value=fake_response))

    result = _run(provider.lookup("ABC1D23"))

    assert result == VehicleData(brand="VOLKSWAGEN", model="GOL", year="2020", uf="RJ", color="Prata")


def test_lookup_returns_none_on_timeout(monkeypatch):
    provider = ApiBrasilVehicleDataProvider("device", "bearer", 5.0)
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(side_effect=httpx.TimeoutException("timeout")))

    assert _run(provider.lookup("ABC1D23")) is None


def test_lookup_returns_none_on_network_error(monkeypatch):
    provider = ApiBrasilVehicleDataProvider("device", "bearer", 5.0)
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(side_effect=httpx.ConnectError("sem rede")))

    assert _run(provider.lookup("ABC1D23")) is None


def test_lookup_returns_none_when_the_daily_limit_is_exceeded(monkeypatch):
    provider = ApiBrasilVehicleDataProvider("device", "bearer", 5.0)
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(return_value=_FakeResponse(429, {})))

    assert _run(provider.lookup("ABC1D23")) is None


def test_lookup_returns_none_on_a_non_200_response(monkeypatch):
    provider = ApiBrasilVehicleDataProvider("device", "bearer", 5.0)
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(return_value=_FakeResponse(500, {})))

    assert _run(provider.lookup("ABC1D23")) is None


def test_lookup_returns_none_when_the_plate_is_not_found(monkeypatch):
    provider = ApiBrasilVehicleDataProvider("device", "bearer", 5.0)
    fake_response = _FakeResponse(200, {"error": True, "message": "Placa não encontrada"})
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(return_value=fake_response))

    assert _run(provider.lookup("ABC1D23")) is None


def test_lookup_returns_none_for_a_response_without_brand_or_model(monkeypatch):
    provider = ApiBrasilVehicleDataProvider("device", "bearer", 5.0)
    fake_response = _FakeResponse(200, {"chassi": "9BW..."})
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(return_value=fake_response))

    assert _run(provider.lookup("ABC1D23")) is None


def test_lookup_returns_none_for_malformed_json(monkeypatch):
    provider = ApiBrasilVehicleDataProvider("device", "bearer", 5.0)
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(return_value=_BadJsonResponse(200, {})))

    assert _run(provider.lookup("ABC1D23")) is None
