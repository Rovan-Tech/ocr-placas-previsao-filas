import re
import unicodedata
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from sqlalchemy.orm import Session

from app.models import Employee


class Permission(StrEnum):
    CAPTURE_READ_PLATE = "capture.read_plate"
    CAPTURE_AUTHORIZE_ENTRY = "capture.authorize_entry"
    CAPTURE_REFUSE_ENTRY = "capture.refuse_entry"
    CHECKINS_VIEW = "checkins.view"
    SCHEDULES_VIEW = "schedules.view"
    SCHEDULES_CREATE = "schedules.create"
    LOGS_VIEW = "logs.view"
    REPORTS_VIEW = "reports.view"
    EMPLOYEES_VIEW = "employees.view"
    EMPLOYEES_CREATE = "employees.create"
    EMPLOYEES_DEACTIVATE = "employees.deactivate"
    EMPLOYEES_SET_ROLE = "employees.set_role"
    PERMISSIONS_MANAGE = "permissions.manage"


@dataclass(frozen=True, slots=True)
class PermissionDef:
    key: Permission
    label: str
    description: str


@dataclass(frozen=True, slots=True)
class ScreenDef:
    key: str
    label: str
    permissions: tuple[PermissionDef, ...]


CATALOG: Final[tuple[ScreenDef, ...]] = (
    ScreenDef(
        "capture",
        "Capturar placa",
        (
            PermissionDef(
                Permission.CAPTURE_READ_PLATE,
                "Ler a placa (foto ou digitação)",
                (
                    "Permite fotografar ou digitar a placa do caminhão na tela de "
                    "Captura e ver o resultado da leitura."
                ),
            ),
            PermissionDef(
                Permission.CAPTURE_AUTHORIZE_ENTRY,
                "Autorizar entrada",
                (
                    "Permite liberar a entrada do caminhão depois de ler a placa "
                    "(botão “Autorizar entrada”)."
                ),
            ),
            PermissionDef(
                Permission.CAPTURE_REFUSE_ENTRY,
                "Recusar entrada",
                "Permite barrar a entrada do caminhão (botão “Recusar entrada”).",
            ),
        ),
    ),
    ScreenDef(
        "checkins",
        "Check-ins",
        (
            PermissionDef(
                Permission.CHECKINS_VIEW,
                "Ver check-ins",
                "Mostra a lista de check-ins recentes e o gráfico do tempo de espera.",
            ),
        ),
    ),
    ScreenDef(
        "schedules",
        "Agendamentos",
        (
            PermissionDef(
                Permission.SCHEDULES_VIEW,
                "Ver agendamentos e fotos",
                (
                    "Mostra a lista de agendamentos e as fotos dos documentos do "
                    "motorista, do veículo e do manifesto."
                ),
            ),
            PermissionDef(
                Permission.SCHEDULES_CREATE,
                "Cadastrar agendamento",
                (
                    "Permite cadastrar a chegada prevista de um caminhão, com "
                    "motorista, veículo, carga e fotos."
                ),
            ),
        ),
    ),
    ScreenDef(
        "logs",
        "Logs",
        (
            PermissionDef(
                Permission.LOGS_VIEW,
                "Ver logs e fotos",
                (
                    "Mostra o histórico de quem enviou cada foto ou placa e de onde, e "
                    "permite abrir a foto."
                ),
            ),
        ),
    ),
    ScreenDef(
        "reports",
        "Relatórios",
        (
            PermissionDef(
                Permission.REPORTS_VIEW,
                "Ver relatórios",
                (
                    "Mostra os indicadores e o gráfico da tela de Relatórios. Também "
                    "libera ler os check-ins e os logs que alimentam esses números."
                ),
            ),
        ),
    ),
    ScreenDef(
        "employees",
        "Funcionários",
        (
            PermissionDef(
                Permission.EMPLOYEES_VIEW,
                "Ver a lista de funcionários",
                "Mostra a lista de funcionários, com cargo e situação.",
            ),
            PermissionDef(
                Permission.EMPLOYEES_CREATE,
                "Cadastrar funcionário",
                "Permite cadastrar novos funcionários, com uma senha temporária.",
            ),
            PermissionDef(
                Permission.EMPLOYEES_DEACTIVATE,
                "Excluir funcionário",
                (
                    "Permite excluir funcionários. Eles perdem o acesso na hora, mas o "
                    "histórico de fotos e placas continua."
                ),
            ),
            PermissionDef(
                Permission.EMPLOYEES_SET_ROLE,
                "Trocar o cargo de um funcionário",
                "Permite trocar o cargo de um funcionário.",
            ),
        ),
    ),
    ScreenDef(
        "permissions",
        "Permissões",
        (
            PermissionDef(
                Permission.PERMISSIONS_MANAGE,
                "Gerenciar cargos e permissões",
                (
                    "Permite criar, editar e excluir cargos e liberar ou bloquear "
                    "ações para pessoas específicas. Dê com cuidado."
                ),
            ),
        ),
    ),
)

ALL_PERMISSIONS: Final[frozenset[str]] = frozenset(Permission)

MAX_ROLE_KEY_LENGTH = 50


def effective_permissions(employee: Employee) -> frozenset[Permission]:
    granted = {
        Permission(item.permission)
        for item in employee.role.permissions
        if item.permission in ALL_PERMISSIONS
    }
    for override in employee.overrides:
        if override.permission not in ALL_PERMISSIONS:
            continue
        if override.granted:
            granted.add(Permission(override.permission))
        else:
            granted.discard(Permission(override.permission))
    return frozenset(granted)


def can(employee: Employee, permission: Permission) -> bool:
    return permission in effective_permissions(employee)


def slugify_role_name(name: str) -> str:
    ascii_name = (
        unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug[:MAX_ROLE_KEY_LENGTH].strip("-")


LOCKOUT_MESSAGE = (
    "Essa mudança deixaria o sistema sem ninguém que possa gerenciar permissões."
)


class LockoutError(ValueError):
    def __init__(self) -> None:
        super().__init__(LOCKOUT_MESSAGE)


def ensure_someone_can_manage(db: Session) -> None:
    active = db.query(Employee).filter(Employee.active.is_(True)).all()
    if not any(can(employee, Permission.PERMISSIONS_MANAGE) for employee in active):
        raise LockoutError
