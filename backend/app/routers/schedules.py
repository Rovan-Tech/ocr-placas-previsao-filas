from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Employee, Schedule
from app.services.auth import get_current_employee
from app.services.photo_storage import resolve_photo_path, save_photo
from app.services.plate_format import normalize, plate_format

router = APIRouter(prefix="/schedules", tags=["schedules"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_TEXT_LENGTH = 120
MAX_DOCUMENT_LENGTH = 20

INVALID_PLATE = HTTPException(
    status_code=400,
    detail="Formato de placa inválido. Use o padrão Mercosul (ex.: ABC1D23) ou o padrão antigo (ex.: ABC1234).",
)


class ScheduleOut(BaseModel):
    id: int
    plate: str
    driver_name: str
    driver_document: str
    has_driver_document_photo: bool
    has_vehicle_document_photo: bool
    cargo_type: str
    scheduled_date: date
    created_at: datetime


def _to_schedule_out(schedule: Schedule) -> ScheduleOut:
    return ScheduleOut(
        id=schedule.id,
        plate=schedule.plate,
        driver_name=schedule.driver_name,
        driver_document=schedule.driver_document,
        has_driver_document_photo=schedule.driver_document_photo_path is not None,
        has_vehicle_document_photo=schedule.vehicle_document_photo_path is not None,
        cargo_type=schedule.cargo_type,
        scheduled_date=schedule.scheduled_date,
        created_at=schedule.created_at,
    )


def _require_non_empty(value: str, *, max_length: int, message: str) -> str:
    stripped = value.strip()
    if not stripped or len(stripped) > max_length:
        raise HTTPException(status_code=422, detail=message)
    return stripped


async def _save_optional_photo(photo: UploadFile | None) -> str | None:
    if photo is None:
        return None
    if photo.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Tipo de arquivo não suportado. Envie uma imagem JPEG, PNG ou WebP.",
        )
    content = await photo.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Imagem muito grande. O limite é de 5 MB.")
    return await run_in_threadpool(save_photo, content, photo.content_type, subdir="schedules")


@router.post("", response_model=ScheduleOut, status_code=201)
async def create_schedule(
    plate: str = Form(...),
    driver_name: str = Form(...),
    driver_document: str = Form(...),
    cargo_type: str = Form(...),
    scheduled_date: date = Form(...),
    driver_document_photo: UploadFile | None = File(None),
    vehicle_document_photo: UploadFile | None = File(None),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> ScheduleOut:
    normalized_plate = normalize(plate)
    if plate_format(normalized_plate) is None:
        raise INVALID_PLATE

    clean_driver_name = _require_non_empty(driver_name, max_length=MAX_TEXT_LENGTH, message="Nome do motorista inválido.")
    clean_driver_document = _require_non_empty(
        driver_document, max_length=MAX_DOCUMENT_LENGTH, message="Documento do motorista inválido."
    )
    clean_cargo_type = _require_non_empty(cargo_type, max_length=MAX_TEXT_LENGTH, message="Tipo de carga inválido.")

    driver_document_photo_path = await _save_optional_photo(driver_document_photo)
    vehicle_document_photo_path = await _save_optional_photo(vehicle_document_photo)

    schedule = Schedule(
        plate=normalized_plate,
        driver_name=clean_driver_name,
        driver_document=clean_driver_document,
        driver_document_photo_path=driver_document_photo_path,
        vehicle_document_photo_path=vehicle_document_photo_path,
        cargo_type=clean_cargo_type,
        scheduled_date=scheduled_date,
        created_by_id=employee.id,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return _to_schedule_out(schedule)


@router.get("", response_model=list[ScheduleOut])
def list_schedules(
    plate: str | None = None,
    db: Session = Depends(get_db),
    _employee: Employee = Depends(get_current_employee),
) -> list[ScheduleOut]:
    query = select(Schedule).order_by(Schedule.scheduled_date.desc())
    if plate:
        query = query.where(Schedule.plate == normalize(plate))
    rows = db.execute(query).scalars().all()
    return [_to_schedule_out(schedule) for schedule in rows]


@router.get("/{schedule_id}/driver-document-photo")
def get_driver_document_photo(
    schedule_id: int, db: Session = Depends(get_db), _employee: Employee = Depends(get_current_employee)
) -> FileResponse:
    schedule = db.get(Schedule, schedule_id)
    if schedule is None or schedule.driver_document_photo_path is None:
        raise HTTPException(status_code=404, detail="Esse agendamento não tem foto do documento do motorista.")
    photo_path = resolve_photo_path(schedule.driver_document_photo_path)
    if photo_path is None:
        raise HTTPException(status_code=404, detail="Arquivo da foto não foi encontrado no servidor.")
    return FileResponse(photo_path)


@router.get("/{schedule_id}/vehicle-document-photo")
def get_vehicle_document_photo(
    schedule_id: int, db: Session = Depends(get_db), _employee: Employee = Depends(get_current_employee)
) -> FileResponse:
    schedule = db.get(Schedule, schedule_id)
    if schedule is None or schedule.vehicle_document_photo_path is None:
        raise HTTPException(status_code=404, detail="Esse agendamento não tem foto do documento do veículo.")
    photo_path = resolve_photo_path(schedule.vehicle_document_photo_path)
    if photo_path is None:
        raise HTTPException(status_code=404, detail="Arquivo da foto não foi encontrado no servidor.")
    return FileResponse(photo_path)
