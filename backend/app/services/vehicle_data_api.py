import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

API_BRASIL_URL = "https://gateway.apibrasil.io/api/v2/vehicles/dados"

_WRAPPER_KEYS = ("dados", "response", "resposta")
_BRAND_KEYS = ("marca", "MARCA", "brand")
_MODEL_KEYS = ("modelo", "MODELO", "model")
_YEAR_KEYS = ("ano", "ANO", "year")
_UF_KEYS = ("uf", "UF", "estado")
_COLOR_KEYS = ("cor", "COR", "color")


@dataclass(frozen=True)
class VehicleData:
    brand: str | None
    model: str | None
    year: str | None
    uf: str | None
    color: str | None


class VehicleDataProvider(Protocol):
    async def lookup(self, plate: str) -> VehicleData | None: ...


def _first(payload: dict, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = payload.get(key)
        if value:
            return str(value)
    return None


def _parse_vehicle_data(payload: dict) -> VehicleData | None:
    data = payload
    for key in _WRAPPER_KEYS:
        nested = payload.get(key)
        if isinstance(nested, dict):
            data = nested
            break

    vehicle_data = VehicleData(
        brand=_first(data, _BRAND_KEYS),
        model=_first(data, _MODEL_KEYS),
        year=_first(data, _YEAR_KEYS),
        uf=_first(data, _UF_KEYS),
        color=_first(data, _COLOR_KEYS),
    )
    if vehicle_data.brand is None and vehicle_data.model is None:
        return None
    return vehicle_data


class ApiBrasilVehicleDataProvider:

    def __init__(self, device_token: str, bearer_token: str, timeout: float) -> None:
        self._device_token = device_token
        self._bearer_token = bearer_token
        self._timeout = timeout

    async def lookup(self, plate: str) -> VehicleData | None:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    API_BRASIL_URL,
                    headers={
                        "Authorization": f"Bearer {self._bearer_token}",
                        "DeviceToken": self._device_token,
                        "Content-Type": "application/json",
                    },
                    json={"placa": plate},
                )
        except httpx.TimeoutException:
            logger.warning("Consulta de veículo na API Brasil expirou (timeout) para a placa %s.", plate)
            return None
        except httpx.HTTPError:
            logger.exception("Falha de rede consultando a API Brasil para a placa %s.", plate)
            return None

        if response.status_code == 429:
            logger.warning("Limite diário da API Brasil estourado.")
            return None
        if response.status_code != 200:
            logger.warning("API Brasil respondeu %s para a placa %s.", response.status_code, plate)
            return None

        try:
            payload = response.json()
        except ValueError:
            logger.warning("Resposta da API Brasil não é um JSON válido.")
            return None

        if not isinstance(payload, dict) or payload.get("error") is True or payload.get("success") is False:
            return None
        return _parse_vehicle_data(payload)


class NotConfiguredVehicleDataProvider:

    async def lookup(self, plate: str) -> VehicleData | None:
        return None


def get_vehicle_data_provider() -> VehicleDataProvider:
    if not settings.api_brasil_device_token or not settings.api_brasil_bearer_token:
        return NotConfiguredVehicleDataProvider()
    return ApiBrasilVehicleDataProvider(
        settings.api_brasil_device_token,
        settings.api_brasil_bearer_token,
        settings.api_brasil_timeout_seconds,
    )
