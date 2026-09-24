from dataclasses import dataclass
from datetime import date
from enum import Enum

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Schedule


class ScheduleStatus(str, Enum):
    ON_TIME = "on_time"
    EARLY = "early"
    LATE = "late"


@dataclass(frozen=True)
class ScheduleMatch:
    schedule: Schedule
    status: ScheduleStatus


def match_schedule_for_plate(db: Session, plate: str, today: date) -> ScheduleMatch | None:
    schedules = db.execute(select(Schedule).where(Schedule.plate == plate)).scalars().all()
    if not schedules:
        return None

    closest = min(schedules, key=lambda schedule: abs((schedule.scheduled_date - today).days))
    if closest.scheduled_date == today:
        status = ScheduleStatus.ON_TIME
    elif closest.scheduled_date > today:
        status = ScheduleStatus.EARLY
    else:
        status = ScheduleStatus.LATE
    return ScheduleMatch(schedule=closest, status=status)
