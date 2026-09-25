from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CheckIn, CheckInStatus, Employee, Schedule
from app.services.auth import get_current_employee
from app.services.plate_format import normalize, plate_format
from app.services.queue_prediction import estimate_wait_minutes

router = APIRouter(prefix="/checkins", tags=["checkins"])

DECIDABLE_STATUSES = {CheckInStatus.ADMITTED, CheckInStatus.CANCELLED}

INVALID_PLATE = HTTPException(
    status_code=400,
    detail="Formato de placa inválido. Use o padrão Mercosul (ex.: ABC1D23) ou o padrão antigo (ex.: ABC1234).",
)
INVALID_STATUS = HTTPException(
    status_code=422, detail="Decisão inválida. Use 'admitted' para autorizar ou 'cancelled' para recusar."
)
SCHEDULE_NOT_FOUND = HTTPException(status_code=404, detail="Agendamento não encontrado.")
MISSING_SCHEDULE_FOR_DECISION = HTTPException(
    status_code=422,
    detail="Não é possível autorizar ou recusar a entrada sem agendamento — cadastre motorista, carga e "
    "caminhão antes.",
)


class CheckinOut(BaseModel):
    id: int
    plate: str
    created_at: datetime
    status: CheckInStatus
    schedule_id: int | None
    estimated_wait_minutes: float | None = None


def _to_checkin_out(db: Session, checkin: CheckIn) -> CheckinOut:
    return CheckinOut(
        id=checkin.id,
        plate=checkin.plate,
        created_at=checkin.created_at,
        status=checkin.status,
        schedule_id=checkin.schedule_id,
        estimated_wait_minutes=estimate_wait_minutes(db, checkin),
    )


def _existing_waiting_checkin(db: Session, checkin_id: int, plate: str) -> CheckIn | None:
    checkin = db.get(CheckIn, checkin_id)
    if checkin is None or checkin.plate != plate or checkin.status != CheckInStatus.WAITING:
        return None
    return checkin


@router.post("", response_model=CheckinOut, status_code=201)
def create_checkin(
    plate: str = Form(...),
    status: CheckInStatus = Form(...),
    schedule_id: int | None = Form(None),
    checkin_id: int | None = Form(None),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> CheckinOut:
    normalized_plate = normalize(plate)
    if plate_format(normalized_plate) is None:
        raise INVALID_PLATE
    if status not in DECIDABLE_STATUSES:
        raise INVALID_STATUS
    if schedule_id is not None and db.get(Schedule, schedule_id) is None:
        raise SCHEDULE_NOT_FOUND

    existing = _existing_waiting_checkin(db, checkin_id, normalized_plate) if checkin_id is not None else None

    effective_schedule_id = schedule_id if schedule_id is not None else (existing.schedule_id if existing else None)
    if effective_schedule_id is None:
        raise MISSING_SCHEDULE_FOR_DECISION

    if existing is not None:
        existing.status = status
        existing.decided_at = datetime.now(timezone.utc)
        if schedule_id is not None:
            existing.schedule_id = schedule_id
        db.commit()
        db.refresh(existing)
        return _to_checkin_out(db, existing)

    checkin = CheckIn(
        plate=normalized_plate,
        status=status,
        schedule_id=schedule_id,
        created_by_id=employee.id,
        decided_at=datetime.now(timezone.utc),
    )
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return _to_checkin_out(db, checkin)


@router.get("", response_model=list[CheckinOut])
def list_checkins(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _employee: Employee = Depends(get_current_employee),
) -> list[CheckinOut]:
    query = select(CheckIn).order_by(CheckIn.created_at.desc(), CheckIn.id.desc()).limit(limit)
    rows = db.execute(query).scalars().all()
    return [_to_checkin_out(db, checkin) for checkin in rows]
