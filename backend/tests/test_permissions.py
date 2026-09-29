import pytest

from app.models import Employee, EmployeePermissionOverride, Role, RolePermission
from app.services.permission_audit import (
    override_state,
    summarize_override_diff,
    summarize_permission_diff,
)
from app.services.permissions import (
    ALL_PERMISSIONS,
    CATALOG,
    Permission,
    can,
    effective_permissions,
    slugify_role_name,
)


def _employee(role_permissions, overrides=()):
    role = Role(
        key="teste",
        name="Teste",
        permissions=[RolePermission(permission=key) for key in role_permissions],
    )
    return Employee(
        username="x",
        full_name="X",
        password_hash="x",  # noqa: S106 - valor de teste
        role=role,
        overrides=[
            EmployeePermissionOverride(permission=key, granted=granted)
            for key, granted in overrides
        ],
    )


def test_catalog_lists_every_permission_exactly_once():
    listed = [item.key for screen in CATALOG for item in screen.permissions]

    assert sorted(listed) == sorted(Permission)
    assert len(listed) == len(set(listed))
    assert set(listed) == ALL_PERMISSIONS


def test_every_permission_explains_what_it_does():
    for screen in CATALOG:
        for item in screen.permissions:
            assert item.label.strip()
            assert len(item.description) > 20


def test_role_permissions_are_the_base():
    employee = _employee(["checkins.view", "logs.view"])

    assert effective_permissions(employee) == {
        Permission.CHECKINS_VIEW,
        Permission.LOGS_VIEW,
    }


def test_a_granted_override_adds_a_permission():
    employee = _employee(["checkins.view"], [("schedules.create", True)])

    assert can(employee, Permission.SCHEDULES_CREATE)
    assert can(employee, Permission.CHECKINS_VIEW)


def test_a_denied_override_removes_a_permission_from_the_role():
    employee = _employee(["checkins.view", "logs.view"], [("logs.view", False)])

    assert not can(employee, Permission.LOGS_VIEW)
    assert can(employee, Permission.CHECKINS_VIEW)


def test_unknown_stored_permissions_are_ignored():
    employee = _employee(
        ["checkins.view", "coisa.removida"], [("outra.removida", True)]
    )

    assert effective_permissions(employee) == {Permission.CHECKINS_VIEW}


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Monitor Noturno", "monitor-noturno"),
        ("  Gestão de Pátio  ", "gestao-de-patio"),
        ("Auditor #2", "auditor-2"),
        ("!!!", ""),
    ],
)
def test_slugify_role_name(name, slug):
    assert slugify_role_name(name) == slug


def test_slug_is_limited_to_the_column_size():
    assert len(slugify_role_name("a" * 200)) == 50


class TestAuditSummaries:
    def test_permission_diff_lists_what_was_released_and_blocked(self):
        summary = summarize_permission_diff(
            {"checkins.view", "logs.view"}, {"checkins.view", "reports.view"}
        )

        assert summary == "liberou Ver relatórios; bloqueou Ver logs e fotos"

    def test_permission_diff_is_empty_when_nothing_changed(self):
        assert summarize_permission_diff({"logs.view"}, {"logs.view"}) == ""

    def test_override_diff_covers_grant_deny_and_back_to_the_role(self):
        summary = summarize_override_diff(
            {"logs.view": "deny", "reports.view": "grant"},
            {"logs.view": "grant", "schedules.view": "deny"},
        )

        assert summary == (
            "bloqueou Ver agendamentos e fotos; liberou Ver logs e fotos; "
            "voltou a seguir o cargo em Ver relatórios"
        )

    def test_override_state_prefers_deny_when_repeated(self):
        assert override_state(["a"], ["b"]) == {"a": "grant", "b": "deny"}
