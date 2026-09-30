from datetime import UTC, datetime

import pytest

from app.models import CheckIn, CheckInStatus, Employee, Schedule, UploadLog
from app.services.auth import hash_password, verify_password
from app.services.demo_seed import STAFF, WeakPasswordError, seed_demo_data

PASSWORD = "senha-de-demonstracao-1"  # noqa: S105 - valor de teste
OTHER_PASSWORD = "outra-senha-antiga-9"  # noqa: S105 - valor de teste
NOON = datetime(2026, 9, 30, 15, 0, tzinfo=UTC)
EVENING = datetime(2026, 9, 30, 23, 30, tzinfo=UTC)


def _employee(db_session, username):
    return db_session.query(Employee).filter(Employee.username == username).one()


def _counts(db_session):
    return (
        db_session.query(Employee).count(),
        db_session.query(Schedule).count(),
        db_session.query(CheckIn).count(),
        db_session.query(UploadLog).count(),
    )


def test_creates_the_team_with_the_right_roles_and_a_working_password(db_session):
    seed_demo_data(db_session, PASSWORD, NOON)

    for username, full_name, role_key in STAFF:
        employee = _employee(db_session, username)
        assert employee.full_name == full_name
        assert employee.role.key == role_key
        assert employee.must_change_password is False
        assert verify_password(PASSWORD, employee.password_hash)


def test_creates_schedules_checkins_and_logs_relative_to_the_given_moment(db_session):
    report = seed_demo_data(db_session, PASSWORD, EVENING)

    assert report.data_skipped is False
    assert report.employees_created == len(STAFF)
    assert report.passwords_reset == 0
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
    before = _counts(db_session)

    second = seed_demo_data(db_session, PASSWORD, EVENING)

    assert second.data_skipped is True
    assert (second.employees_created, second.passwords_reset) == (0, 0)
    assert (second.schedules, second.checkins, second.logs) == (0, 0, 0)
    assert _counts(db_session) == before


def test_keeps_the_password_of_an_existing_demo_user_by_default(db_session, role_named):
    db_session.add(
        Employee(
            username="admin",
            full_name="Admin Antigo",
            password_hash=hash_password(OTHER_PASSWORD),
            role=role_named("admin"),
            must_change_password=False,
        )
    )
    db_session.flush()

    report = seed_demo_data(db_session, PASSWORD, NOON)

    admin = _employee(db_session, "admin")
    assert verify_password(OTHER_PASSWORD, admin.password_hash)
    assert admin.full_name == "Admin Antigo"
    assert report.employees_created == len(STAFF) - 1
    assert report.passwords_reset == 0
    assert report.data_skipped is False
    assert verify_password(
        PASSWORD, _employee(db_session, "juliana.reis").password_hash
    )


def test_resets_credentials_of_existing_demo_users_only_when_asked(
    db_session, role_named
):
    db_session.add(
        Employee(
            username="admin",
            full_name="Admin Antigo",
            password_hash=hash_password(OTHER_PASSWORD),
            role=role_named("fiscal"),
            must_change_password=True,
            active=False,
        )
    )
    db_session.flush()

    report = seed_demo_data(db_session, PASSWORD, NOON, reset_passwords=True)

    admin = _employee(db_session, "admin")
    assert verify_password(PASSWORD, admin.password_hash)
    assert admin.must_change_password is False
    assert admin.active is True
    assert admin.role.key == "fiscal"
    assert admin.full_name == "Admin Antigo"
    assert report.passwords_reset == 1
    assert report.employees_created == len(STAFF) - 1


def test_reset_does_not_duplicate_users_or_data_on_a_second_run(db_session):
    seed_demo_data(db_session, PASSWORD, EVENING)
    before = _counts(db_session)

    second = seed_demo_data(db_session, OTHER_PASSWORD, EVENING, reset_passwords=True)

    assert second.passwords_reset == len(STAFF)
    assert second.data_skipped is True
    assert _counts(db_session) == before
    assert verify_password(OTHER_PASSWORD, _employee(db_session, "admin").password_hash)


def test_keeps_employees_that_are_not_part_of_the_demo_untouched(db_session, employee):
    seed_demo_data(db_session, PASSWORD, NOON, reset_passwords=True)

    untouched = db_session.get(Employee, employee.id)
    assert verify_password("s3nhaSegura!", untouched.password_hash)


@pytest.mark.parametrize("password", ["", "curta", "onze-chars1"])
def test_refuses_a_short_password_without_writing_anything(db_session, password):
    with pytest.raises(WeakPasswordError, match="pelo menos 12"):
        seed_demo_data(db_session, password, NOON, reset_passwords=True)

    assert db_session.query(Employee).filter(Employee.username == "admin").count() == 0
