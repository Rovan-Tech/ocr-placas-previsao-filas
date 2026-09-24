from datetime import date, timedelta

from app.models import Schedule
from app.services.schedule_matching import ScheduleStatus, match_schedule_for_plate

TODAY = date(2026, 9, 24)


def _schedule(db_session, employee, *, plate="ABC1D23", scheduled_date=TODAY, **overrides):
    record = Schedule(
        plate=plate,
        driver_name=overrides.get("driver_name", "João da Silva"),
        driver_document=overrides.get("driver_document", "12345678900"),
        cargo_type=overrides.get("cargo_type", "Grãos"),
        scheduled_date=scheduled_date,
        created_by_id=employee.id,
    )
    db_session.add(record)
    db_session.flush()
    db_session.refresh(record)
    return record


def test_returns_none_when_plate_has_no_schedule(db_session):
    assert match_schedule_for_plate(db_session, "ABC1D23", TODAY) is None


def test_matches_a_schedule_for_today_as_on_time(db_session, employee):
    scheduled = _schedule(db_session, employee, scheduled_date=TODAY)

    match = match_schedule_for_plate(db_session, "ABC1D23", TODAY)

    assert match is not None
    assert match.schedule.id == scheduled.id
    assert match.status == ScheduleStatus.ON_TIME


def test_a_schedule_in_the_future_is_early(db_session, employee):
    _schedule(db_session, employee, scheduled_date=TODAY + timedelta(days=3))

    match = match_schedule_for_plate(db_session, "ABC1D23", TODAY)

    assert match is not None
    assert match.status == ScheduleStatus.EARLY


def test_a_schedule_in_the_past_is_late(db_session, employee):
    _schedule(db_session, employee, scheduled_date=TODAY - timedelta(days=2))

    match = match_schedule_for_plate(db_session, "ABC1D23", TODAY)

    assert match is not None
    assert match.status == ScheduleStatus.LATE


def test_a_different_plate_does_not_match(db_session, employee):
    _schedule(db_session, employee, plate="XYZ9A87", scheduled_date=TODAY)

    assert match_schedule_for_plate(db_session, "ABC1D23", TODAY) is None


def test_picks_the_schedule_closest_to_today_when_there_are_several(db_session, employee):
    _schedule(db_session, employee, scheduled_date=TODAY + timedelta(days=10))
    close = _schedule(db_session, employee, scheduled_date=TODAY + timedelta(days=1))

    match = match_schedule_for_plate(db_session, "ABC1D23", TODAY)

    assert match is not None
    assert match.schedule.id == close.id
    assert match.status == ScheduleStatus.EARLY
