from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CheckIn, CheckInStatus

RECENT_SERVICE_WINDOW = 5
DEFAULT_SERVICE_MINUTES = 5.0


def _average_recent_service_minutes(db: Session) -> float:
    query = (
        select(CheckIn.created_at, CheckIn.decided_at)
        .where(CheckIn.status != CheckInStatus.WAITING, CheckIn.decided_at.is_not(None))
        .order_by(CheckIn.decided_at.desc())
        .limit(RECENT_SERVICE_WINDOW)
    )
    rows = db.execute(query).all()
    if not rows:
        return DEFAULT_SERVICE_MINUTES
    durations = [(decided_at - created_at).total_seconds() / 60 for created_at, decided_at in rows]
    return sum(durations) / len(durations)


def _trucks_ahead_in_queue(db: Session, checkin: CheckIn) -> int:
    query = (
        select(func.count())
        .select_from(CheckIn)
        .where(CheckIn.status == CheckInStatus.WAITING, CheckIn.created_at < checkin.created_at)
    )
    return db.execute(query).scalar_one()


def estimate_wait_minutes(db: Session, checkin: CheckIn) -> float | None:
    if checkin.status == CheckInStatus.WAITING:
        trucks_ahead = _trucks_ahead_in_queue(db, checkin)
        return round(trucks_ahead * _average_recent_service_minutes(db), 1)
    if checkin.decided_at is not None:
        return round((checkin.decided_at - checkin.created_at).total_seconds() / 60, 1)
    return None
