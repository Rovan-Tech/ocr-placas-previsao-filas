from enum import StrEnum
from typing import Final

from app.models.employee import Role


class Screen(StrEnum):
    CAPTURE = "capture"
    CHECKINS = "checkins"
    SCHEDULES = "schedules"
    LOGS = "logs"
    REPORTS = "reports"
    EMPLOYEES = "employees"


class Access(StrEnum):
    NONE = "none"
    READ = "read"
    FULL = "full"


ACCESS_RANK: Final[dict[Access, int]] = {
    Access.NONE: 0,
    Access.READ: 1,
    Access.FULL: 2,
}

ROLE_ACCESS: Final[dict[Role, dict[Screen, Access]]] = {
    Role.FISCAL: {
        Screen.CAPTURE: Access.FULL,
        Screen.CHECKINS: Access.READ,
        Screen.SCHEDULES: Access.NONE,
        Screen.LOGS: Access.NONE,
        Screen.REPORTS: Access.NONE,
        Screen.EMPLOYEES: Access.NONE,
    },
    Role.PLANEJADOR: {
        Screen.CAPTURE: Access.NONE,
        Screen.CHECKINS: Access.READ,
        Screen.SCHEDULES: Access.FULL,
        Screen.LOGS: Access.NONE,
        Screen.REPORTS: Access.NONE,
        Screen.EMPLOYEES: Access.NONE,
    },
    Role.ANALISTA: {
        Screen.CAPTURE: Access.NONE,
        Screen.CHECKINS: Access.READ,
        Screen.SCHEDULES: Access.NONE,
        Screen.LOGS: Access.READ,
        Screen.REPORTS: Access.FULL,
        Screen.EMPLOYEES: Access.NONE,
    },
    Role.SUPERVISOR: {
        Screen.CAPTURE: Access.FULL,
        Screen.CHECKINS: Access.FULL,
        Screen.SCHEDULES: Access.FULL,
        Screen.LOGS: Access.READ,
        Screen.REPORTS: Access.READ,
        Screen.EMPLOYEES: Access.NONE,
    },
    Role.ADMIN: dict.fromkeys(Screen, Access.FULL),
}


def access_for(role: Role, screen: Screen) -> Access:
    return ROLE_ACCESS[role][screen]


def can(role: Role, screen: Screen, needed: Access) -> bool:
    return ACCESS_RANK[access_for(role, screen)] >= ACCESS_RANK[needed]
