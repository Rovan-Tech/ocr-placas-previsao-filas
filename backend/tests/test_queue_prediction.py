from datetime import datetime, timedelta, timezone

from app.models import CheckIn, CheckInStatus
from app.services.queue_prediction import DEFAULT_SERVICE_MINUTES, estimate_wait_minutes


def _make_checkin(db_session, employee, **overrides):
    checkin = CheckIn(
        plate=overrides.get("plate", "ABC1D23"),
        status=overrides.get("status", CheckInStatus.WAITING),
        created_by_id=employee.id,
        created_at=overrides.get("created_at", datetime.now(timezone.utc)),
        decided_at=overrides.get("decided_at"),
    )
    db_session.add(checkin)
    db_session.flush()
    db_session.refresh(checkin)
    return checkin


def test_a_decided_checkin_shows_the_actual_minutes_it_took(db_session, employee):
    created_at = datetime.now(timezone.utc)
    checkin = _make_checkin(
        db_session,
        employee,
        status=CheckInStatus.ADMITTED,
        created_at=created_at,
        decided_at=created_at + timedelta(minutes=7),
    )

    assert estimate_wait_minutes(db_session, checkin) == 7.0


def test_a_decided_checkin_without_a_decided_at_has_no_estimate(db_session, employee):
    checkin = _make_checkin(db_session, employee, status=CheckInStatus.CANCELLED, decided_at=None)

    assert estimate_wait_minutes(db_session, checkin) is None


def test_a_waiting_checkin_with_nobody_ahead_has_zero_wait(db_session, employee):
    checkin = _make_checkin(db_session, employee, status=CheckInStatus.WAITING)

    assert estimate_wait_minutes(db_session, checkin) == 0


def test_a_waiting_checkin_behind_others_multiplies_by_the_average_recent_service_time(db_session, employee):
    now = datetime.now(timezone.utc)
    _make_checkin(
        db_session,
        employee,
        plate="AAA1111",
        status=CheckInStatus.ADMITTED,
        created_at=now - timedelta(minutes=10),
        decided_at=now - timedelta(minutes=4),
    )
    ahead = _make_checkin(db_session, employee, plate="BBB2222", status=CheckInStatus.WAITING, created_at=now)
    behind = _make_checkin(
        db_session, employee, plate="CCC3333", status=CheckInStatus.WAITING, created_at=now + timedelta(minutes=1)
    )

    assert estimate_wait_minutes(db_session, ahead) == 0
    assert estimate_wait_minutes(db_session, behind) == 6.0


def test_falls_back_to_the_default_service_time_without_recent_history(db_session, employee):
    now = datetime.now(timezone.utc)
    _make_checkin(db_session, employee, plate="AAA1111", status=CheckInStatus.WAITING, created_at=now)
    behind = _make_checkin(
        db_session, employee, plate="BBB2222", status=CheckInStatus.WAITING, created_at=now + timedelta(minutes=1)
    )

    assert estimate_wait_minutes(db_session, behind) == DEFAULT_SERVICE_MINUTES


def test_averages_only_the_most_recent_decided_checkins(db_session, employee):
    now = datetime.now(timezone.utc)
    for index in range(8):
        _make_checkin(
            db_session,
            employee,
            plate=f"OLD{index:04d}",
            status=CheckInStatus.ADMITTED,
            created_at=now - timedelta(minutes=100 - index),
            decided_at=now - timedelta(minutes=100 - index) + timedelta(minutes=20),
        )
    for index in range(5):
        _make_checkin(
            db_session,
            employee,
            plate=f"NEW{index:04d}",
            status=CheckInStatus.ADMITTED,
            created_at=now - timedelta(minutes=5 - index),
            decided_at=now - timedelta(minutes=5 - index) + timedelta(minutes=2),
        )
    ahead = _make_checkin(db_session, employee, plate="YYY8888", status=CheckInStatus.WAITING, created_at=now)
    behind = _make_checkin(
        db_session, employee, plate="ZZZ9999", status=CheckInStatus.WAITING, created_at=now + timedelta(minutes=1)
    )

    assert estimate_wait_minutes(db_session, ahead) == 0
    assert estimate_wait_minutes(db_session, behind) == 2.0
