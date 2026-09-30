from datetime import UTC, datetime

import pytest

from app.models import CheckIn, CheckInStatus, Employee, Schedule, UploadLog
from app.services.auth import verify_password
from app.services.demo_seed import STAFF, WeakPasswordError, seed_demo_data

PASSWORD = "senha-de-demonstracao-1"  # noqa: S105 - valor de teste
NOON = datetime(2026, 9, 30, 15, 0, tzinfo=UTC)
EVENING = datetime(2026, 9, 30, 23, 30, tzinfo=UTC)


def test_creates_the_team_with_the_right_roles_and_a_working_password(db_session):
    seed_demo_data(db_session, PASSWORD, NOON)

    employees = {e.username: e for e in db_session.query(Employee).all()}
    for username, full_name, role_key in STAFF:
        employee = employees[username]
        assert employee.full_name == full_name
        assert employee.role.key == role_key
        assert employee.must_change_password is False
        assert verify_password(PASSWORD, employee.password_hash)


def test_creates_schedules_checkins_and_logs_relative_to_the_given_moment(db_session):
    report = seed_demo_data(db_session, PASSWORD, EVENING)

    assert report.skipped is False
    assert report.employees == len(STAFF)
    assert report.schedules == db_session.query(Schedule).count() > 0
    assert report.checkins == db_session.query(CheckIn).count() > 0
    assert report.logs == db_session.query(UploadLog).count() > 0


def test_does_not_create_checkins_in_the_future(db_session):
    seed_demo_data(db_session, PASSWORD, NOON)

    newest = max(checkin.created_at for checkin in db_session.query(CheckIn).all())
    assert newest <= NOON


def test_includes_admitted_and_refused_decisions(db_session):
    seed_demo_data(db_session, PASSWORD, EVENING)

    statuses = {checkin.status for checkin in db_session.query(CheckIn).all()}
    assert statuses == {CheckInStatus.ADMITTED, CheckInStatus.CANCELLED}


def test_running_twice_changes_nothing(db_session):
    seed_demo_data(db_session, PASSWORD, EVENING)
    counts = (
        db_session.query(Employee).count(),
        db_session.query(CheckIn).count(),
        db_session.query(UploadLog).count(),
    )

    second = seed_demo_data(db_session, PASSWORD, EVENING)

    assert second.skipped is True
    assert (second.employees, second.schedules, second.checkins, second.logs) == (
        0,
        0,
        0,
        0,
    )
    assert counts == (
        db_session.query(Employee).count(),
        db_session.query(CheckIn).count(),
        db_session.query(UploadLog).count(),
    )


def test_keeps_existing_employees_untouched(db_session, employee):
    seed_demo_data(db_session, PASSWORD, NOON)

    assert db_session.get(Employee, employee.id) is not None
    assert verify_password(
        "s3nhaSegura!", db_session.get(Employee, employee.id).password_hash
    )


@pytest.mark.parametrize("password", ["", "curta", "onze-chars1"])
def test_refuses_a_short_password_without_writing_anything(db_session, password):
    with pytest.raises(WeakPasswordError, match="pelo menos 12"):
        seed_demo_data(db_session, password, NOON)

    assert db_session.query(Employee).filter(Employee.username == "admin").count() == 0
