import pytest

from app.models import Role
from app.services.permissions import ROLE_ACCESS, Access, Screen, access_for, can


def test_every_role_defines_every_screen():
    for role in Role:
        assert set(ROLE_ACCESS[role]) == set(Screen)


@pytest.mark.parametrize(
    ("role", "screen", "expected"),
    [
        (Role.FISCAL, Screen.CAPTURE, Access.FULL),
        (Role.FISCAL, Screen.CHECKINS, Access.READ),
        (Role.FISCAL, Screen.SCHEDULES, Access.NONE),
        (Role.PLANEJADOR, Screen.SCHEDULES, Access.FULL),
        (Role.PLANEJADOR, Screen.CAPTURE, Access.NONE),
        (Role.ANALISTA, Screen.REPORTS, Access.FULL),
        (Role.ANALISTA, Screen.LOGS, Access.READ),
        (Role.ANALISTA, Screen.CAPTURE, Access.NONE),
        (Role.SUPERVISOR, Screen.CAPTURE, Access.FULL),
        (Role.SUPERVISOR, Screen.LOGS, Access.READ),
        (Role.SUPERVISOR, Screen.EMPLOYEES, Access.NONE),
        (Role.ADMIN, Screen.EMPLOYEES, Access.FULL),
    ],
)
def test_access_matrix_follows_the_role_table(role, screen, expected):
    assert access_for(role, screen) == expected


@pytest.mark.parametrize(
    ("role", "screen", "needed", "expected"),
    [
        (Role.FISCAL, Screen.CHECKINS, Access.READ, True),
        (Role.FISCAL, Screen.CHECKINS, Access.FULL, False),
        (Role.SUPERVISOR, Screen.LOGS, Access.READ, True),
        (Role.SUPERVISOR, Screen.LOGS, Access.FULL, False),
        (Role.ADMIN, Screen.LOGS, Access.FULL, True),
        (Role.PLANEJADOR, Screen.LOGS, Access.READ, False),
    ],
)
def test_can_compares_the_access_level(role, screen, needed, expected):
    assert can(role, screen, needed) is expected


def test_only_the_admin_reaches_the_employees_screen():
    allowed = [role for role in Role if can(role, Screen.EMPLOYEES, Access.READ)]

    assert allowed == [Role.ADMIN]
