from datetime import datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DataError, IntegrityError

from app.models import CheckIn, CheckInStatus


def test_new_checkin_defaults_to_waiting_with_timestamp(db_session):
    checkin = CheckIn(plate="ABC1D23")
    db_session.add(checkin)
    db_session.flush()
    db_session.refresh(checkin)

    assert checkin.id is not None
    assert checkin.status is CheckInStatus.WAITING
    assert isinstance(checkin.created_at, datetime)
    assert checkin.created_at.tzinfo is not None


def test_status_is_stored_as_its_value(db_session):
    db_session.add(CheckIn(plate="ABC1234", status=CheckInStatus.ADMITTED))
    db_session.flush()

    stored = db_session.execute(text("SELECT status FROM checkins WHERE plate = 'ABC1234'")).scalar_one()
    assert stored == "admitted"


def test_recent_checkins_can_be_ordered_by_created_at(db_session):
    db_session.execute(
        text(
            "INSERT INTO checkins (plate, created_at) VALUES "
            "('AAA1A11', now() - interval '10 minutes'), ('BBB2B22', now())"
        )
    )

    plates = db_session.scalars(select(CheckIn.plate).order_by(CheckIn.created_at.desc())).all()
    assert plates == ["BBB2B22", "AAA1A11"]


@pytest.mark.parametrize("plate", ["abc1d23", "ABC1D2", "ABC 1D2"])
def test_rejects_plate_outside_normalized_format(db_session, plate):
    db_session.add(CheckIn(plate=plate))

    with pytest.raises(IntegrityError, match="ck_checkins_plate_format"):
        db_session.flush()


@pytest.mark.parametrize("plate", ["ABC-1D23", "ABC1D234"])
def test_rejects_plate_longer_than_seven_characters(db_session, plate):
    db_session.add(CheckIn(plate=plate))

    with pytest.raises(DataError):
        db_session.flush()


def test_database_rejects_unknown_status(db_session):
    with pytest.raises(IntegrityError, match="ck_checkins_checkin_status"):
        db_session.execute(text("INSERT INTO checkins (plate, status) VALUES ('ABC1D23', 'foo')"))
