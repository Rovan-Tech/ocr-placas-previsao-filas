import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from app.models import Role, RolePermission, SystemRole
from app.services.auth import create_access_token

ALL_ROLES = [role.value for role in SystemRole]
SEE_CHECKINS = set(ALL_ROLES)
SEE_LOGS = {"analista", "supervisor", "admin"}
SEE_SCHEDULES = {"planejador", "supervisor", "admin"}
READ_PLATE = {"fiscal", "supervisor", "admin"}
ADMIN_ONLY = {"admin"}

ROUTES = [
    ("get", "/checkins", SEE_CHECKINS),
    ("get", "/logs", SEE_LOGS),
    ("get", "/logs/1/photo", SEE_LOGS),
    ("get", "/schedules", SEE_SCHEDULES),
    ("post", "/schedules", SEE_SCHEDULES),
    ("get", "/schedules/1/driver-document-photo-front", SEE_SCHEDULES),
    ("get", "/schedules/1/driver-document-photo-back", SEE_SCHEDULES),
    ("get", "/schedules/1/vehicle-document-photo", SEE_SCHEDULES),
    ("get", "/schedules/1/manifest-photo", SEE_SCHEDULES),
    ("post", "/ocr/upload", READ_PLATE),
    ("post", "/ocr/manual", READ_PLATE),
    ("get", "/auth/employees", ADMIN_ONLY),
    ("post", "/auth/employees", ADMIN_ONLY),
    ("delete", "/auth/employees/1", ADMIN_ONLY),
    ("patch", "/auth/employees/1/role", ADMIN_ONLY),
    ("put", "/auth/employees/1/permissions", ADMIN_ONLY),
    ("get", "/auth/roles", ADMIN_ONLY),
    ("post", "/auth/roles", ADMIN_ONLY),
    ("put", "/auth/roles/1", ADMIN_ONLY),
    ("delete", "/auth/roles/1", ADMIN_ONLY),
    ("get", "/auth/permissions", ADMIN_ONLY),
    ("get", "/auth/permission-log", ADMIN_ONLY),
]

FORBIDDEN_MESSAGE = "Seu cargo não tem acesso a esta função."


@pytest.fixture
def db_client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        del app.dependency_overrides[get_db]


@pytest.fixture
def call_as(make_employee, db_client):
    def _call(employee_or_key, method: str, path: str, **kwargs):
        employee = (
            make_employee(employee_or_key)
            if isinstance(employee_or_key, str)
            else employee_or_key
        )
        headers = {"Authorization": f"Bearer {create_access_token(employee)}"}
        return getattr(db_client, method)(path, headers=headers, **kwargs)

    return _call


@pytest.fixture
def make_custom_role(db_session):
    def _make(name: str, permissions: list[str]) -> Role:
        role = Role(
            key=name.lower().replace(" ", "-"),
            name=name,
            permissions=[RolePermission(permission=key) for key in permissions],
        )
        db_session.add(role)
        db_session.flush()
        db_session.refresh(role)
        return role

    return _make


@pytest.mark.parametrize("role_key", ALL_ROLES)
@pytest.mark.parametrize(("method", "path", "allowed_roles"), ROUTES)
def test_each_route_is_open_only_to_the_roles_that_need_it(
    role_key, method, path, allowed_roles, call_as
):
    response = call_as(role_key, method, path)

    if role_key in allowed_roles:
        assert response.status_code != 403
    else:
        assert response.status_code == 403
        assert response.json()["detail"] == FORBIDDEN_MESSAGE


class TestEntryDecisionPermissions:
    def _decide(self, call_as, employee, status, schedule_id):
        return call_as(
            employee,
            "post",
            "/checkins",
            data={"plate": "ABC1D23", "status": status, "schedule_id": schedule_id},
        )

    def test_authorize_and_refuse_are_separate_permissions(
        self, make_employee, make_custom_role, make_schedule, db_session, call_as
    ):
        only_authorize = make_custom_role(
            "So Autoriza", ["capture.authorize_entry", "checkins.view"]
        )
        employee = make_employee("fiscal", "so.autoriza")
        employee.role = only_authorize
        schedule = make_schedule(employee)
        db_session.flush()

        assert (
            self._decide(call_as, employee, "admitted", schedule.id).status_code == 201
        )
        refused = self._decide(call_as, employee, "cancelled", schedule.id)
        assert refused.status_code == 403
        assert refused.json()["detail"] == FORBIDDEN_MESSAGE

    def test_the_fiscal_can_authorize_and_refuse(
        self, call_as, make_employee, make_schedule
    ):
        employee = make_employee("fiscal")
        schedule = make_schedule(employee)

        assert (
            self._decide(call_as, employee, "admitted", schedule.id).status_code == 201
        )
        assert (
            self._decide(call_as, employee, "cancelled", schedule.id).status_code == 201
        )

    def test_an_invalid_status_is_still_rejected(self, call_as, make_employee):
        response = self._decide(call_as, make_employee("fiscal"), "waiting", 1)

        assert response.status_code == 422


class TestReportsPermissionReadsTheirData:
    def test_reports_view_alone_can_read_checkins_and_logs(
        self, make_employee, make_custom_role, db_session, call_as
    ):
        employee = make_employee("fiscal", "so.relatorios")
        employee.role = make_custom_role("So Relatorios", ["reports.view"])
        db_session.flush()

        assert call_as(employee, "get", "/checkins").status_code == 200
        assert call_as(employee, "get", "/logs").status_code == 200
        assert call_as(employee, "get", "/schedules").status_code == 403


class TestEmployeeOverridesTakeEffect:
    def test_a_granted_override_opens_a_route_the_role_blocks(
        self, make_employee, call_as
    ):
        fiscal = make_employee("fiscal")
        admin = make_employee("admin")
        assert call_as(fiscal, "get", "/logs").status_code == 403

        response = call_as(
            admin,
            "put",
            f"/auth/employees/{fiscal.id}/permissions",
            json={"granted": ["logs.view"], "denied": []},
        )

        assert response.status_code == 200
        assert response.json()["overrides"]["granted"] == ["logs.view"]
        assert "logs.view" in response.json()["permissions"]
        assert call_as(fiscal, "get", "/logs").status_code == 200

    def test_a_denied_override_closes_a_route_the_role_allows(
        self, make_employee, call_as
    ):
        fiscal = make_employee("fiscal")
        admin = make_employee("admin")

        call_as(
            admin,
            "put",
            f"/auth/employees/{fiscal.id}/permissions",
            json={"granted": [], "denied": ["capture.read_plate"]},
        )

        assert call_as(fiscal, "post", "/ocr/upload").status_code == 403

    def test_sending_empty_overrides_clears_them(self, make_employee, call_as):
        fiscal = make_employee("fiscal")
        admin = make_employee("admin")
        path = f"/auth/employees/{fiscal.id}/permissions"
        call_as(admin, "put", path, json={"granted": ["logs.view"], "denied": []})

        response = call_as(admin, "put", path, json={"granted": [], "denied": []})

        assert response.json()["overrides"] == {"granted": [], "denied": []}
        assert call_as(fiscal, "get", "/logs").status_code == 403

    def test_the_same_permission_cannot_be_granted_and_denied(
        self, make_employee, call_as
    ):
        fiscal = make_employee("fiscal")

        response = call_as(
            make_employee("admin"),
            "put",
            f"/auth/employees/{fiscal.id}/permissions",
            json={"granted": ["logs.view"], "denied": ["logs.view"]},
        )

        assert response.status_code == 422

    def test_rejects_an_unknown_permission(self, make_employee, call_as):
        fiscal = make_employee("fiscal")

        response = call_as(
            make_employee("admin"),
            "put",
            f"/auth/employees/{fiscal.id}/permissions",
            json={"granted": ["voar.helicoptero"], "denied": []},
        )

        assert response.status_code == 422

    def test_returns_404_for_a_nonexistent_employee(self, make_employee, call_as):
        response = call_as(
            make_employee("admin"),
            "put",
            "/auth/employees/999999/permissions",
            json={"granted": [], "denied": []},
        )

        assert response.status_code == 404

    def test_an_admin_cannot_lock_the_system_out_of_permissions(
        self, make_employee, call_as
    ):
        admin = make_employee("admin")

        response = call_as(
            admin,
            "put",
            f"/auth/employees/{admin.id}/permissions",
            json={"granted": [], "denied": ["permissions.manage"]},
        )

        assert response.status_code == 400
        assert "ninguém que possa gerenciar" in response.json()["detail"]
        assert call_as(admin, "get", "/auth/permissions").status_code == 200


class TestRoles:
    def test_lists_the_roles_for_the_employee_form(self, make_employee, call_as):
        response = call_as(make_employee("admin"), "get", "/auth/roles")

        keys = [role["key"] for role in response.json()]
        assert keys[:5] == ["fiscal", "planejador", "analista", "supervisor", "admin"]
        assert all(role["is_system"] for role in response.json()[:5])

    def test_permissions_endpoint_returns_catalog_and_roles(
        self, make_employee, call_as
    ):
        response = call_as(make_employee("admin"), "get", "/auth/permissions")

        body = response.json()
        screens = [screen["key"] for screen in body["catalog"]]
        assert screens == [
            "capture",
            "checkins",
            "schedules",
            "logs",
            "reports",
            "employees",
            "permissions",
        ]
        first = body["catalog"][0]["permissions"][0]
        assert first["key"] == "capture.read_plate"
        assert first["description"].startswith("Permite fotografar")
        fiscal = next(role for role in body["roles"] if role["key"] == "fiscal")
        assert fiscal["permissions"] == [
            "capture.authorize_entry",
            "capture.read_plate",
            "capture.refuse_entry",
            "checkins.view",
        ]

    def test_creates_a_custom_role(self, make_employee, call_as):
        response = call_as(
            make_employee("admin"),
            "post",
            "/auth/roles",
            json={"name": "Monitor Noturno", "permissions": ["checkins.view"]},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["key"] == "monitor-noturno"
        assert body["is_system"] is False
        assert body["permissions"] == ["checkins.view"]

    def test_rejects_a_duplicate_role_name(self, make_employee, call_as):
        response = call_as(
            make_employee("admin"),
            "post",
            "/auth/roles",
            json={"name": "Fiscal de Portaria", "permissions": []},
        )

        assert response.status_code == 409

    @pytest.mark.parametrize("name", ["", "!!!"])
    def test_rejects_an_invalid_role_name(self, name, make_employee, call_as):
        response = call_as(
            make_employee("admin"),
            "post",
            "/auth/roles",
            json={"name": name, "permissions": []},
        )

        assert response.status_code == 422

    def test_rejects_an_unknown_permission_in_a_role(self, make_employee, call_as):
        response = call_as(
            make_employee("admin"),
            "post",
            "/auth/roles",
            json={"name": "Cargo Ruim", "permissions": ["nao.existe"]},
        )

        assert response.status_code == 422

    def test_updates_the_permissions_of_a_system_role(
        self, make_employee, call_as, role_named
    ):
        planejador = role_named(SystemRole.PLANEJADOR)

        response = call_as(
            make_employee("admin"),
            "put",
            f"/auth/roles/{planejador.id}",
            json={
                "name": planejador.name,
                "permissions": ["checkins.view", "logs.view"],
            },
        )

        assert response.status_code == 200
        assert response.json()["permissions"] == ["checkins.view", "logs.view"]
        employee = make_employee("planejador", "novo.planejador")
        assert call_as(employee, "get", "/logs").status_code == 200
        assert call_as(employee, "get", "/schedules").status_code == 403

    def test_a_system_role_cannot_be_renamed(self, make_employee, call_as, role_named):
        fiscal = role_named(SystemRole.FISCAL)

        response = call_as(
            make_employee("admin"),
            "put",
            f"/auth/roles/{fiscal.id}",
            json={"name": "Outro Nome", "permissions": []},
        )

        assert response.status_code == 400

    def test_renames_a_custom_role(self, make_employee, make_custom_role, call_as):
        role = make_custom_role("Antigo", ["checkins.view"])

        response = call_as(
            make_employee("admin"),
            "put",
            f"/auth/roles/{role.id}",
            json={"name": "Novo Nome", "permissions": ["checkins.view"]},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Novo Nome"

    def test_rejects_renaming_a_role_to_an_existing_name(
        self, make_employee, make_custom_role, call_as
    ):
        role = make_custom_role("Meu Cargo", [])

        response = call_as(
            make_employee("admin"),
            "put",
            f"/auth/roles/{role.id}",
            json={"name": "Fiscal de Portaria", "permissions": []},
        )

        assert response.status_code == 409

    def test_returns_404_for_a_nonexistent_role(self, make_employee, call_as):
        response = call_as(
            make_employee("admin"),
            "put",
            "/auth/roles/999999",
            json={"name": "X", "permissions": []},
        )

        assert response.status_code == 404

    def test_removing_permission_management_from_the_last_manager_is_refused(
        self, make_employee, call_as, role_named
    ):
        admin_role = role_named(SystemRole.ADMIN)
        admin = make_employee("admin")

        response = call_as(
            admin,
            "put",
            f"/auth/roles/{admin_role.id}",
            json={"name": admin_role.name, "permissions": ["checkins.view"]},
        )

        assert response.status_code == 400
        assert call_as(admin, "get", "/auth/permissions").status_code == 200

    def test_deletes_an_unused_custom_role(
        self, make_employee, make_custom_role, call_as
    ):
        role = make_custom_role("Descartavel", [])

        response = call_as(make_employee("admin"), "delete", f"/auth/roles/{role.id}")

        assert response.status_code == 204

    def test_a_system_role_cannot_be_deleted(self, make_employee, call_as, role_named):
        fiscal = role_named(SystemRole.FISCAL)

        response = call_as(make_employee("admin"), "delete", f"/auth/roles/{fiscal.id}")

        assert response.status_code == 400

    def test_a_role_in_use_cannot_be_deleted(
        self, make_employee, make_custom_role, db_session, call_as
    ):
        role = make_custom_role("Em Uso", [])
        member = make_employee("fiscal", "membro")
        member.role = role
        db_session.flush()

        response = call_as(make_employee("admin"), "delete", f"/auth/roles/{role.id}")

        assert response.status_code == 409

    def test_returns_404_deleting_a_nonexistent_role(self, make_employee, call_as):
        response = call_as(make_employee("admin"), "delete", "/auth/roles/999999")

        assert response.status_code == 404


class TestChangeRole:
    def test_admin_changes_the_role_of_another_employee(
        self, make_employee, call_as, role_named
    ):
        target = make_employee("fiscal")

        response = call_as(
            make_employee("admin"),
            "patch",
            f"/auth/employees/{target.id}/role",
            json={"role_id": role_named(SystemRole.PLANEJADOR).id},
        )

        assert response.status_code == 200
        assert response.json()["role"]["key"] == "planejador"
        assert "schedules.create" in response.json()["permissions"]

    def test_admin_can_move_someone_to_a_custom_role(
        self, make_employee, make_custom_role, call_as
    ):
        target = make_employee("fiscal")
        role = make_custom_role("Especial", ["reports.view"])

        response = call_as(
            make_employee("admin"),
            "patch",
            f"/auth/employees/{target.id}/role",
            json={"role_id": role.id},
        )

        assert response.json()["permissions"] == ["reports.view"]

    def test_admin_cannot_change_their_own_role(
        self, make_employee, call_as, role_named
    ):
        admin = make_employee("admin")

        response = call_as(
            admin,
            "patch",
            f"/auth/employees/{admin.id}/role",
            json={"role_id": role_named(SystemRole.FISCAL).id},
        )

        assert response.status_code == 400

    def test_returns_404_for_a_nonexistent_employee(
        self, make_employee, call_as, role_named
    ):
        response = call_as(
            make_employee("admin"),
            "patch",
            "/auth/employees/999999/role",
            json={"role_id": role_named(SystemRole.FISCAL).id},
        )

        assert response.status_code == 404

    def test_returns_404_for_a_nonexistent_role(self, make_employee, call_as):
        target = make_employee("fiscal")

        response = call_as(
            make_employee("admin"),
            "patch",
            f"/auth/employees/{target.id}/role",
            json={"role_id": 999999},
        )

        assert response.status_code == 404


class TestCreateEmployeeWithRole:
    def _create(self, call_as, admin, **fields):
        return call_as(
            admin,
            "post",
            "/auth/employees",
            json={
                "username": "novo.funcionario",
                "full_name": "Novo Funcionário",
                "temporary_password": "senhaTemporaria1",
                **fields,
            },
        )

    def test_creates_with_the_chosen_role(self, make_employee, call_as, role_named):
        response = self._create(
            call_as,
            make_employee("admin"),
            role_id=role_named(SystemRole.ANALISTA).id,
        )

        assert response.status_code == 201
        assert response.json()["role"]["key"] == "analista"

    def test_defaults_to_the_fiscal_role(self, make_employee, call_as):
        response = self._create(call_as, make_employee("admin"))

        assert response.json()["role"]["key"] == "fiscal"

    def test_rejects_an_unknown_role(self, make_employee, call_as):
        response = self._create(call_as, make_employee("admin"), role_id=999999)

        assert response.status_code == 422


class TestPermissionAuditLog:
    def _log(self, call_as, admin):
        response = call_as(admin, "get", "/auth/permission-log")
        assert response.status_code == 200
        return response.json()

    def test_updating_a_role_records_who_from_where_and_what(
        self, make_employee, call_as, role_named
    ):
        admin = make_employee("admin")
        planejador = role_named(SystemRole.PLANEJADOR)

        call_as(
            admin,
            "put",
            f"/auth/roles/{planejador.id}",
            json={
                "name": planejador.name,
                "permissions": ["checkins.view", "logs.view"],
            },
        )

        (entry,) = self._log(call_as, admin)
        assert entry["action"] == "role_updated"
        assert entry["actor_username"] == admin.username
        assert entry["actor_name"] == admin.full_name
        assert entry["client_ip"] == "testclient"
        assert entry["created_at"]
        assert entry["target_name"] == "Planejador de Agendamentos"
        assert entry["summary"] == (
            "No cargo “Planejador de Agendamentos”: liberou Ver logs e fotos; "
            "bloqueou Cadastrar agendamento, Ver agendamentos e fotos"
        )
        assert entry["details"]["added"] == ["logs.view"]
        assert entry["details"]["removed"] == ["schedules.create", "schedules.view"]

    def test_saving_a_role_without_changes_does_not_log(
        self, make_employee, call_as, role_named
    ):
        admin = make_employee("admin")
        fiscal = role_named(SystemRole.FISCAL)

        call_as(
            admin,
            "put",
            f"/auth/roles/{fiscal.id}",
            json={
                "name": fiscal.name,
                "permissions": [item.permission for item in fiscal.permissions],
            },
        )

        assert self._log(call_as, admin) == []

    def test_renaming_a_custom_role_is_logged(
        self, make_employee, make_custom_role, call_as
    ):
        admin = make_employee("admin")
        role = make_custom_role("Antigo", [])

        call_as(
            admin,
            "put",
            f"/auth/roles/{role.id}",
            json={"name": "Novo Nome", "permissions": []},
        )

        (entry,) = self._log(call_as, admin)
        assert entry["summary"] == "Renomeou o cargo “Antigo” para “Novo Nome”"

    def test_creating_and_deleting_a_role_are_logged(self, make_employee, call_as):
        admin = make_employee("admin")

        created = call_as(
            admin,
            "post",
            "/auth/roles",
            json={"name": "Monitor", "permissions": ["checkins.view"]},
        ).json()
        call_as(admin, "delete", f"/auth/roles/{created['id']}")

        actions = [entry["action"] for entry in self._log(call_as, admin)]
        assert actions == ["role_deleted", "role_created"]
        summaries = [entry["summary"] for entry in self._log(call_as, admin)]
        assert summaries == ["Excluiu o cargo “Monitor”", "Criou o cargo “Monitor”"]

    def test_changing_an_employees_role_is_logged(
        self, make_employee, call_as, role_named
    ):
        admin = make_employee("admin")
        target = make_employee("fiscal")

        call_as(
            admin,
            "patch",
            f"/auth/employees/{target.id}/role",
            json={"role_id": role_named(SystemRole.ANALISTA).id},
        )

        (entry,) = self._log(call_as, admin)
        assert entry["action"] == "employee_role_changed"
        assert entry["summary"] == (
            f"Trocou o cargo de {target.full_name} de “Fiscal de Portaria” "
            "para “Analista de Operações”"
        )
        assert entry["details"] == {
            "role_from": "Fiscal de Portaria",
            "role_to": "Analista de Operações",
        }

    def test_changing_employee_overrides_is_logged_once_per_real_change(
        self, make_employee, call_as
    ):
        admin = make_employee("admin")
        target = make_employee("fiscal")
        path = f"/auth/employees/{target.id}/permissions"
        payload = {"granted": ["logs.view"], "denied": ["capture.refuse_entry"]}

        call_as(admin, "put", path, json=payload)
        call_as(admin, "put", path, json=payload)

        (entry,) = self._log(call_as, admin)
        assert entry["action"] == "employee_overrides_changed"
        assert entry["summary"] == (
            f"Exceções de {target.full_name}: bloqueou Recusar entrada; "
            "liberou Ver logs e fotos"
        )
        assert entry["details"]["after"] == {
            "logs.view": "grant",
            "capture.refuse_entry": "deny",
        }

    def test_a_refused_lockout_change_leaves_no_log(
        self, make_employee, call_as, role_named
    ):
        admin = make_employee("admin")
        admin_role = role_named(SystemRole.ADMIN)

        refused = call_as(
            admin,
            "put",
            f"/auth/roles/{admin_role.id}",
            json={"name": admin_role.name, "permissions": ["checkins.view"]},
        )

        assert refused.status_code == 400
        assert self._log(call_as, admin) == []

    def test_the_log_is_newest_first_and_can_be_paged(self, make_employee, call_as):
        admin = make_employee("admin")
        for name in ["Um", "Dois", "Tres"]:
            call_as(
                admin, "post", "/auth/roles", json={"name": name, "permissions": []}
            )

        response = call_as(admin, "get", "/auth/permission-log?limit=2&offset=1")

        assert [entry["target_name"] for entry in response.json()] == ["Dois", "Um"]

    def test_only_who_manages_permissions_reads_the_log(self, call_as):
        assert call_as("supervisor", "get", "/auth/permission-log").status_code == 403
