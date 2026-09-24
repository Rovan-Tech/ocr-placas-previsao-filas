"""Verificação da placa numa base oficial de veículos — ponto de integração.

Hoje não há provedor ligado: não existe API pública e gratuita do governo para consultar placas.
O acesso oficial (base da SENATRAN, via API paga do Serpro) exige contrato e CNPJ, e automatizar o
site/app do Sinesp Cidadão viola os termos de uso — então o projeto não faz nenhum dos dois.

Para ligar um provedor no futuro, basta criar uma classe com ``verify(plate) -> PlateVerification``
e devolvê-la em ``get_plate_verifier``; o endpoint e as telas (desktop e mobile) já tratam todos os
status abaixo. A placa enviada ao provedor já passou pela validação de formato (7 caracteres
A-Z/0-9), então nenhum texto livre vindo do OCR chega à consulta externa.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Protocol


class VerificationStatus(str, Enum):
    NOT_CHECKED = "not_checked"  # nenhuma base oficial configurada
    REGULAR = "regular"  # placa existe e sem restrição
    IRREGULAR = "irregular"  # existe, mas com restrição (ex.: roubo/furto)
    NOT_FOUND = "not_found"  # placa não existe na base — suspeita de placa falsa
    UNAVAILABLE = "unavailable"  # base oficial fora do ar ou sem resposta


@dataclass(frozen=True)
class PlateVerification:
    status: VerificationStatus
    detail: str
    source: str | None = None  # nome da base consultada, quando houver


class PlateVerifier(Protocol):
    def verify(self, plate: str) -> PlateVerification: ...


class NotConfiguredVerifier:
    """Padrão enquanto não houver integração oficial: deixa claro que a placa não foi conferida."""

    def verify(self, plate: str) -> PlateVerification:
        return PlateVerification(
            status=VerificationStatus.NOT_CHECKED,
            detail="Placa não verificada na base oficial (integração com a SENATRAN não configurada).",
        )


def get_plate_verifier() -> PlateVerifier:
    return NotConfiguredVerifier()
