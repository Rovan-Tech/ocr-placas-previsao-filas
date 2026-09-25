from datetime import date, timedelta

from app.services.schedule_matching import ScheduleStatus, match_schedule_for_plate

TODAY = date(2026, 9, 24)


def test_returns_none_when_plate_has_no_schedule(db_session):
    assert match_schedule_for_plate(db_session, "ABC1D23", TODAY) is None


def test_matches_a_schedule_for_today_as_on_time(db_session, employee, make_schedule):
    scheduled = make_schedule(employee, scheduled_date=TODAY)

    match = match_schedule_for_plate(db_session, "ABC1D23", TODAY)

    assert match is not None
    assert match.schedule.id == scheduled.id
    assert match.status == ScheduleStatus.ON_TIME


def test_a_schedule_in_the_future_is_early(db_session, employee, make_schedule):
    make_schedule(employee, scheduled_date=TODAY + timedelta(days=3))

    match = match_schedule_for_plate(db_session, "ABC1D23", TODAY)

    assert match is not None
    assert match.status == ScheduleStatus.EARLY


def test_a_schedule_in_the_past_is_late(db_session, employee, make_schedule):
    make_schedule(employee, scheduled_date=TODAY - timedelta(days=2))

    match = match_schedule_for_plate(db_session, "ABC1D23", TODAY)

    assert match is not None
    assert match.status == ScheduleStatus.LATE


def test_a_different_plate_does_not_match(db_session, employee, make_schedule):
    make_schedule(employee, plate="XYZ9A87", scheduled_date=TODAY)

    assert match_schedule_for_plate(db_session, "ABC1D23", TODAY) is None


def test_picks_the_schedule_closest_to_today_when_there_are_several(db_session, employee, make_schedule):
    make_schedule(employee, scheduled_date=TODAY + timedelta(days=10))
    close = make_schedule(employee, scheduled_date=TODAY + timedelta(days=1))

    match = match_schedule_for_plate(db_session, "ABC1D23", TODAY)

    assert match is not None
    assert match.schedule.id == close.id
    assert match.status == ScheduleStatus.EARLY
