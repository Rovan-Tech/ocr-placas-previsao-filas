import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from app.models import Role
from app.services.auth import create_access_token

ROUTES = [
    (
        "get",
        "/checkins",
        {Role.FISCAL, Role.PLANEJADOR, Role.ANALISTA, Role.SUPERVISOR, Role.ADMIN},
    ),
    ("post", "/checkins", {Role.FISCAL, Role.SUPERVISOR, Role.ADMIN}),
    ("get", "/logs", {Role.ANALISTA, Role.SUPERVISOR, Role.ADMIN}),
    ("get", "/logs/1/photo", {Role.ANALISTA, Role.SUPERVISOR, Role.ADMIN}),
    ("get", "/schedules", {Role.PLANEJADOR, Role.SUPERVISOR, Role.ADMIN}),
    ("post", "/schedules", {Role.PLANEJADOR, Role.SUPERVISOR, Role.ADMIN}),
    (
        "get",
        "/schedules/1/driver-document-photo-front",
        {Role.PLANEJADOR, Role.SUPERVISOR, Role.ADMIN},
    ),
    (
        "get",
        "/schedules/1/driver-document-photo-back",
        {Role.PLANEJADOR, Role.SUPERVISOR, Role.ADMIN},
    ),
    (
        "get",
        "/schedules/1/vehicle-document-photo",
        {Role.PLANEJADOR, Role.SUPERVISOR, Role.ADMIN},
    ),
    (
        "get",
        "/schedules/1/manifest-photo",
        {Role.PLANEJADOR, Role.SUPERVISOR, Role.ADMIN},
    ),
    ("post", "/ocr/upload", {Role.FISCAL, Role.SUPERVISOR, Role.ADMIN}),
    ("post", "/ocr/manual", {Role.FISCAL, Role.SUPERVISOR, Role.ADMIN}),
    ("get", "/auth/employees", {Role.ADMIN}),
    ("post", "/auth/employees", {Role.ADMIN}),
    ("get", "/auth/permissions", {Role.ADMIN}),
    ("patch", "/auth/employees/1/role", {Role.ADMIN}),
    ("delete", "/auth/employees/1", {Role.ADMIN}),
]


@pytest.fixture
def db_client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        del app.dependency_overrides[get_db]


@pytest.fixture
def call_as(make_employee, db_client):
    def _call(role: Role, method: str, path: str):
        token = create_access_token(make_employee(role))
        return getattr(db_client, method)(
            path, headers={"Authorization": f"Bearer {token}"}
        )

    return _call


@pytest.mark.parametrize("role", list(Role))
@pytest.mark.parametrize(("method", "path", "allowed_roles"), ROUTES)
def test_each_route_is_open_only_to_the_roles_that_need_it(
    role, method, path, allowed_roles, call_as
):
    response = call_as(role, method, path)

    if role in allowed_roles:
        assert response.status_code != 403
    else:
        assert response.status_code == 403
        assert response.json()["detail"] == "Seu cargo não tem acesso a esta função."


class TestChangeRole:
    def test_admin_changes_the_role_of_another_employee(self, make_employee, db_client):
        admin = make_employee(Role.ADMIN)
        target = make_employee(Role.FISCAL)

        response = db_client.patch(
            f"/auth/employees/{target.id}/role",
            json={"role": "planejador"},
            headers={"Authorization": f"Bearer {create_access_token(admin)}"},
        )

        assert response.status_code == 200
        assert response.json()["role"] == "planejador"
        assert response.json()["permissions"]["schedules"] == "full"

    def test_admin_cannot_change_their_own_role(self, make_employee, db_client):
        admin = make_employee(Role.ADMIN)

        response = db_client.patch(
            f"/auth/employees/{admin.id}/role",
            json={"role": "fiscal"},
            headers={"Authorization": f"Bearer {create_access_token(admin)}"},
        )

        assert response.status_code == 400

    def test_returns_404_for_a_nonexistent_employee(self, make_employee, db_client):
        admin = make_employee(Role.ADMIN)

        response = db_client.patch(
            "/auth/employees/999999/role",
            json={"role": "fiscal"},
            headers={"Authorization": f"Bearer {create_access_token(admin)}"},
        )

        assert response.status_code == 404

    def test_rejects_an_unknown_role(self, make_employee, db_client):
        admin = make_employee(Role.ADMIN)
        target = make_employee(Role.FISCAL)

        response = db_client.patch(
            f"/auth/employees/{target.id}/role",
            json={"role": "chefe"},
            headers={"Authorization": f"Bearer {create_access_token(admin)}"},
        )

        assert response.status_code == 422


class TestCreateEmployeeWithRole:
    def _create(self, db_client, admin, **fields):
        return db_client.post(
            "/auth/employees",
            json={
                "username": "novo.funcionario",
                "full_name": "Novo Funcionário",
                "temporary_password": "senhaTemporaria1",
                **fields,
            },
            headers={"Authorization": f"Bearer {create_access_token(admin)}"},
        )

    def test_creates_with_the_chosen_role(self, make_employee, db_client):
        response = self._create(db_client, make_employee(Role.ADMIN), role="analista")

        assert response.status_code == 201
        assert response.json()["role"] == "analista"
        assert response.json()["is_admin"] is False

    def test_defaults_to_the_least_privileged_role(self, make_employee, db_client):
        response = self._create(db_client, make_employee(Role.ADMIN))

        assert response.json()["role"] == "fiscal"


def test_permissions_endpoint_returns_the_whole_matrix(make_employee, db_client):
    admin = make_employee(Role.ADMIN)

    response = db_client.get(
        "/auth/permissions",
        headers={"Authorization": f"Bearer {create_access_token(admin)}"},
    )

    body = response.json()
    assert set(body["roles"]) == {role.value for role in Role}
    assert body["roles"]["fiscal"]["capture"] == "full"
    assert body["roles"]["analista"]["reports"] == "full"
    assert body["roles"]["admin"]["employees"] == "full"
