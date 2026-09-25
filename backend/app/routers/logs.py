from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Employee, UploadEndpoint, UploadLog
from app.services.auth import get_current_employee
from app.services.photo_storage import resolve_photo_path
from app.services.plate_format import PlateFormat

router = APIRouter(prefix="/logs", tags=["logs"])

MAX_LIMIT = 200


class LogEntry(BaseModel):
    id: int
    employee_id: int
    employee_username: str
    endpoint: UploadEndpoint
    client_ip: str | None
    ocr_plate: str | None
    ocr_confidence: float | None
    manual_plate: str | None
    final_plate: str | None
    final_plate_format: PlateFormat | None
    needs_review: bool
    has_photo: bool
    created_at: datetime


@router.get("", response_model=list[LogEntry])
def list_logs(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _employee: Employee = Depends(get_current_employee),
) -> list[LogEntry]:
    limit = max(1, min(limit, MAX_LIMIT))
    rows = db.execute(
        select(UploadLog, Employee.username)
        .join(Employee, UploadLog.employee_id == Employee.id)
        .order_by(UploadLog.created_at.desc(), UploadLog.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return [
        LogEntry(
            id=log.id,
            employee_id=log.employee_id,
            employee_username=username,
            endpoint=log.endpoint,
            client_ip=log.client_ip,
            ocr_plate=log.ocr_plate,
            ocr_confidence=log.ocr_confidence,
            manual_plate=log.manual_plate,
            final_plate=log.final_plate,
            final_plate_format=log.final_plate_format,
            needs_review=log.needs_review,
            has_photo=log.photo_path is not None,
            created_at=log.created_at,
        )
        for log, username in rows
    ]


@router.get("/{log_id}/photo")
def get_log_photo(
    log_id: int, db: Session = Depends(get_db), _employee: Employee = Depends(get_current_employee)
) -> FileResponse:
    log = db.get(UploadLog, log_id)
    if log is None or log.photo_path is None:
        raise HTTPException(status_code=404, detail="Essa linha não tem foto de resguardo salva.")

    photo_path = resolve_photo_path(log.photo_path)
    if photo_path is None:
        raise HTTPException(status_code=404, detail="Arquivo da foto não foi encontrado no servidor.")

    return FileResponse(photo_path)
