
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from app.models import Employee
from app.services.auth import PASSWORD_MAX_AGE, create_access_token, hash_password


@pytest.fixture
def admin(db_session):
    record = Employee(
        username="admin.teste",
        full_name="Admin de Teste",
        password_hash=hash_password("senhaAdminForte1"),
        is_admin=True,
        must_change_password=False,
    )
    db_session.add(record)
    db_session.flush()
    db_session.refresh(record)
    return record


@pytest.fixture
def db_client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        del app.dependency_overrides[get_db]


def _token_for(employee: Employee) -> str:
    return create_access_token(employee)


class TestCreateEmployee:
    def test_admin_can_create_an_employee_with_a_temporary_password(self, admin, db_client):
        response = db_client.post(
            "/auth/employees",
            headers={"Authorization": f"Bearer {_token_for(admin)}"},
            json={"username": "fiscal.novo", "full_name": "Fiscal Novo", "temporary_password": "temp12345"},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["username"] == "fiscal.novo"
        assert body["is_admin"] is False
        assert "temporary_password" not in body and "password_hash" not in body

    def test_new_employee_must_change_password_on_first_login(self, admin, db_client):
        db_client.post(
            "/auth/employees",
            headers={"Authorization": f"Bearer {_token_for(admin)}"},
            json={"username": "fiscal.novo", "full_name": "Fiscal Novo", "temporary_password": "temp12345"},
        )

        login = db_client.post("/auth/login", data={"username": "fiscal.novo", "password": "temp12345"})

        assert login.status_code == 200
        assert login.json()["must_change_password"] is True

    def test_non_admin_cannot_create_employees(self, employee, db_client):
        response = db_client.post(
            "/auth/employees",
            headers={"Authorization": f"Bearer {_token_for(employee)}"},
            json={"username": "outro", "full_name": "Outro", "temporary_password": "temp12345"},
        )

        assert response.status_code == 403

    def test_rejects_a_duplicate_username(self, admin, employee, db_client):
        response = db_client.post(
            "/auth/employees",
            headers={"Authorization": f"Bearer {_token_for(admin)}"},
            json={"username": employee.username, "full_name": "Outro Nome", "temporary_password": "temp12345"},
        )

        assert response.status_code == 409

    def test_rejects_a_short_temporary_password(self, admin, db_client):
        response = db_client.post(
            "/auth/employees",
            headers={"Authorization": f"Bearer {_token_for(admin)}"},
            json={"username": "fiscal.novo", "full_name": "Fiscal Novo", "temporary_password": "123"},
        )

        assert response.status_code == 422


class TestPendingPasswordChangeBlocksEverythingElse:
    def test_a_pending_change_blocks_ocr_and_logs_but_not_change_password_itself(self, employee, db_session, db_client):
        employee.must_change_password = True
        db_session.flush()
        token = _token_for(employee)
        headers = {"Authorization": f"Bearer {token}"}

        blocked = db_client.get("/logs", headers=headers)
        assert blocked.status_code == 403
        assert blocked.json()["detail"]["code"] == "password_change_required"

        allowed = db_client.post(
            "/auth/change-password",
            headers=headers,
            json={"current_password": "s3nhaSegura!", "new_password": "umaSenhaNovaForte1"},
        )
        assert allowed.status_code == 200

    def test_change_password_requires_the_correct_current_password(self, employee, db_session, db_client):
        employee.must_change_password = True
        db_session.flush()

        response = db_client.post(
            "/auth/change-password",
            headers={"Authorization": f"Bearer {_token_for(employee)}"},
            json={"current_password": "senha-errada", "new_password": "umaSenhaNovaForte1"},
        )

        assert response.status_code == 401

    def test_after_changing_the_password_the_same_token_stops_being_blocked(self, employee, db_session, db_client):
        employee.must_change_password = True
        db_session.flush()
        token = _token_for(employee)
        headers = {"Authorization": f"Bearer {token}"}

        db_client.post(
            "/auth/change-password",
            headers=headers,
            json={"current_password": "s3nhaSegura!", "new_password": "umaSenhaNovaForte1"},
        )

        response = db_client.get("/logs", headers=headers)

        assert response.status_code == 200


class TestPasswordExpiry:
    def test_password_older_than_30_days_forces_a_change(self, employee, db_session, db_client):
        employee.password_set_at = datetime.now(UTC) - PASSWORD_MAX_AGE - timedelta(days=1)
        db_session.flush()

        response = db_client.get("/logs", headers={"Authorization": f"Bearer {_token_for(employee)}"})

        assert response.status_code == 403
        assert response.json()["detail"]["reason"] == "expired"

    def test_password_within_30_days_is_not_expired(self, employee, db_session, db_client):
        employee.password_set_at = datetime.now(UTC) - timedelta(days=29)
        db_session.flush()

        response = db_client.get("/logs", headers={"Authorization": f"Bearer {_token_for(employee)}"})

        assert response.status_code == 200

    def test_login_response_flags_an_expired_password_too(self, employee, db_session, db_client):
        employee.password_set_at = datetime.now(UTC) - PASSWORD_MAX_AGE - timedelta(days=1)
        db_session.flush()

        response = db_client.post("/auth/login", data={"username": employee.username, "password": "s3nhaSegura!"})

        assert response.json()["must_change_password"] is True

    def test_changing_the_password_resets_the_30_day_clock(self, employee, db_session, db_client):
        employee.password_set_at = datetime.now(UTC) - PASSWORD_MAX_AGE - timedelta(days=1)
        db_session.flush()
        token = _token_for(employee)

        db_client.post(
            "/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": "s3nhaSegura!", "new_password": "umaSenhaNovaForte1"},
        )

        assert datetime.now(UTC) - employee.password_set_at < timedelta(seconds=5)


class TestListEmployees:
    def test_admin_sees_active_and_inactive_employees(self, admin, employee, db_client):
        response = db_client.get("/auth/employees", headers={"Authorization": f"Bearer {_token_for(admin)}"})

        assert response.status_code == 200
        usernames = {entry["username"] for entry in response.json()}
        assert {admin.username, employee.username} <= usernames

    def test_non_admin_cannot_list_employees(self, employee, db_client):
        response = db_client.get("/auth/employees", headers={"Authorization": f"Bearer {_token_for(employee)}"})

        assert response.status_code == 403


class TestDeactivateEmployee:
    def test_admin_can_deactivate_an_employee(self, admin, employee, db_client):
        response = db_client.delete(
            f"/auth/employees/{employee.id}", headers={"Authorization": f"Bearer {_token_for(admin)}"}
        )

        assert response.status_code == 200
        assert response.json()["active"] is False

    def test_deactivated_employee_cannot_log_in_again(self, admin, employee, db_client):
        db_client.delete(f"/auth/employees/{employee.id}", headers={"Authorization": f"Bearer {_token_for(admin)}"})

        login = db_client.post("/auth/login", data={"username": employee.username, "password": "s3nhaSegura!"})

        assert login.status_code == 401

    def test_deactivated_employee_existing_token_stops_working_immediately(self, admin, employee, db_client):
        token = _token_for(employee)
        db_client.delete(f"/auth/employees/{employee.id}", headers={"Authorization": f"Bearer {_token_for(admin)}"})

        response = db_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 401

    def test_non_admin_cannot_deactivate_anyone(self, employee, db_session, db_client):
        from app.services.auth import hash_password
        from app.models import Employee

        other = Employee(username="fiscal.outro", full_name="Outro", password_hash=hash_password("senha12345"))
        db_session.add(other)
        db_session.flush()

        response = db_client.delete(
            f"/auth/employees/{other.id}", headers={"Authorization": f"Bearer {_token_for(employee)}"}
        )

        assert response.status_code == 403

    def test_admin_cannot_deactivate_their_own_account(self, admin, db_client):
        response = db_client.delete(
            f"/auth/employees/{admin.id}", headers={"Authorization": f"Bearer {_token_for(admin)}"}
        )

        assert response.status_code == 400

    def test_an_admin_can_deactivate_another_admin(self, admin, employee, db_session, db_client):
        employee.is_admin = True
        db_session.flush()

        response = db_client.delete(
            f"/auth/employees/{admin.id}", headers={"Authorization": f"Bearer {_token_for(employee)}"}
        )

        assert response.status_code == 200
        assert response.json()["active"] is False

    def test_returns_404_for_a_nonexistent_employee(self, admin, db_client):
        response = db_client.delete("/auth/employees/999999", headers={"Authorization": f"Bearer {_token_for(admin)}"})

        assert response.status_code == 404

    def test_uploads_already_logged_survive_the_deactivation(self, admin, employee, db_session, db_client):
        from app.models import UploadEndpoint, UploadLog

        log = UploadLog(employee_id=employee.id, endpoint=UploadEndpoint.UPLOAD, final_plate="ABC1D23")
        db_session.add(log)
        db_session.flush()

        db_client.delete(f"/auth/employees/{employee.id}", headers={"Authorization": f"Bearer {_token_for(admin)}"})

        still_there = db_session.get(UploadLog, log.id)
        assert still_there is not None
        assert still_there.employee_id == employee.id
