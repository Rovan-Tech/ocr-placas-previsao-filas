
from dataclasses import dataclass
from enum import Enum
from typing import Protocol


class VerificationStatus(str, Enum):
    NOT_CHECKED = "not_checked"
    REGULAR = "regular"
    IRREGULAR = "irregular"
    NOT_FOUND = "not_found"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class PlateVerification:
    status: VerificationStatus
    detail: str
    source: str | None = None


class PlateVerifier(Protocol):
    def verify(self, plate: str) -> PlateVerification: ...


class NotConfiguredVerifier:

    def verify(self, plate: str) -> PlateVerification:
        return PlateVerification(
            status=VerificationStatus.NOT_CHECKED,
            detail="Placa não verificada na base oficial (integração com a SENATRAN não configurada).",
        )


def get_plate_verifier() -> PlateVerifier:
    return NotConfiguredVerifier()
