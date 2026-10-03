import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CargoCategory, CargoItem, DriverDocumentType, Employee, Schedule
from app.routers.responses import (
    BAD_REQUEST,
    CONFLICT,
    NOT_FOUND,
    PAYLOAD_TOO_LARGE,
    UNPROCESSABLE,
    VALIDATION_ERROR_CONTENT,
)
from app.services.auth import require_schedules_create, require_schedules_view
from app.services.document_validation import is_valid_cpf, validate_document_photo
from app.services.ocr_service import decode_image
from app.services.photo_storage import resolve_photo_path, save_photo
from app.services.plate_format import normalize, plate_format

router = APIRouter(prefix="/schedules", tags=["schedules"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_TEXT_LENGTH = 120
MAX_DOCUMENT_LENGTH = 20
MIN_CARGO_ITEMS = 1
MAX_CARGO_ITEMS = 30
MAX_CARGO_ITEMS_JSON_LENGTH = 8 * 1024
CHASSIS_LENGTH = 17
INVALID_CHASSIS_MESSAGE = (
    "Chassi inválido. Informe 17 letras e/ou números (sem espaços ou símbolos)."
)
CPF_LENGTH = 11
INVALID_CPF_MESSAGE = "CPF inválido. Confira os 11 dígitos digitados."
CNH_LENGTH = 11
INVALID_CNH_MESSAGE = (
    "Número de registro da CNH inválido. Informe os 11 dígitos (9 do registro + "
    "2 verificadores)."
)
RG_MIN_LENGTH = 7
RG_MAX_LENGTH = 9
INVALID_RG_MESSAGE = (
    "RG inválido. Informe de 7 a 9 caracteres (padrão estadual) ou, se for a nova "
    "Carteira de Identidade Nacional, os 11 dígitos do CPF."
)
VALID_UFS = {
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
}
INVALID_UF_MESSAGE = "UF de nascimento inválida."

INVALID_PLATE = HTTPException(
    status_code=400,
    detail=(
        "Formato de placa inválido. Use o padrão Mercosul (ex.: ABC1D23) ou o "
        "padrão antigo (ex.: ABC1234)."
    ),
)
INVALID_CARGO_ITEMS = HTTPException(
    status_code=422, detail="Lista de produtos da carga inválida."
)
DUPLICATE_PLATE = HTTPException(
    status_code=409, detail="Já existe um agendamento para esta placa nesta data."
)
DUPLICATE_DRIVER_DOCUMENT = HTTPException(
    status_code=409, detail="Já existe um agendamento para este motorista nesta data."
)
DUPLICATE_VEHICLE_CHASSIS = HTTPException(
    status_code=409, detail="Já existe um agendamento para este chassi nesta data."
)
DUPLICATE_SCHEDULE = HTTPException(
    status_code=409,
    detail="Já existe um agendamento com esta placa, motorista ou chassi nesta data.",
)


class CargoItemIn(BaseModel):
    product_name: str
    category: CargoCategory


class CargoItemOut(BaseModel):
    id: int
    product_name: str
    category: CargoCategory


class ScheduleOut(BaseModel):
    id: int
    plate: str
    driver_name: str
    driver_birth_date: date
    driver_birth_place: str
    driver_birth_state: str
    driver_document_type: DriverDocumentType
    driver_document: str
    driver_document_validated: bool
    driver_document_validation_detail: str
    vehicle_brand: str
    vehicle_model: str
    vehicle_year: str
    vehicle_chassis: str
    vehicle_color: str
    vehicle_length_m: float
    vehicle_height_m: float
    vehicle_width_m: float
    origin_location: str
    destination_location: str
    cargo_items: list[CargoItemOut]
    scheduled_date: date
    created_at: datetime


def _to_schedule_out(schedule: Schedule) -> ScheduleOut:
    return ScheduleOut(
        id=schedule.id,
        plate=schedule.plate,
        driver_name=schedule.driver_name,
        driver_birth_date=schedule.driver_birth_date,
        driver_birth_place=schedule.driver_birth_place,
        driver_birth_state=schedule.driver_birth_state,
        driver_document_type=schedule.driver_document_type,
        driver_document=schedule.driver_document,
        driver_document_validated=schedule.driver_document_validated,
        driver_document_validation_detail=schedule.driver_document_validation_detail,
        vehicle_brand=schedule.vehicle_brand,
        vehicle_model=schedule.vehicle_model,
        vehicle_year=schedule.vehicle_year,
        vehicle_chassis=schedule.vehicle_chassis,
        vehicle_color=schedule.vehicle_color,
        vehicle_length_m=schedule.vehicle_length_m,
        vehicle_height_m=schedule.vehicle_height_m,
        vehicle_width_m=schedule.vehicle_width_m,
        origin_location=schedule.origin_location,
        destination_location=schedule.destination_location,
        cargo_items=[
            CargoItemOut(
                id=item.id, product_name=item.product_name, category=item.category
            )
            for item in schedule.cargo_items
        ],
        scheduled_date=schedule.scheduled_date,
        created_at=schedule.created_at,
    )


def _require_non_empty(value: str, *, max_length: int, message: str) -> str:
    stripped = value.strip()
    if not stripped or len(stripped) > max_length:
        raise HTTPException(status_code=422, detail=message)
    return stripped


def _clean_chassis(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]", "", value).upper()
    if len(cleaned) != CHASSIS_LENGTH:
        raise HTTPException(status_code=422, detail=INVALID_CHASSIS_MESSAGE)
    return cleaned


def _clean_uf(value: str) -> str:
    cleaned = value.strip().upper()
    if cleaned not in VALID_UFS:
        raise HTTPException(status_code=422, detail=INVALID_UF_MESSAGE)
    return cleaned


def _clean_driver_document(document_type: DriverDocumentType, value: str) -> str:
    stripped = _require_non_empty(
        value,
        max_length=MAX_DOCUMENT_LENGTH,
        message="Documento do motorista inválido.",
    )

    if document_type == DriverDocumentType.CPF:
        digits = re.sub(r"\D", "", stripped)
        if len(digits) != CPF_LENGTH or not is_valid_cpf(digits):
            raise HTTPException(status_code=422, detail=INVALID_CPF_MESSAGE)
        return digits

    if document_type == DriverDocumentType.CNH:
        digits = re.sub(r"\D", "", stripped)
        if len(digits) != CNH_LENGTH:
            raise HTTPException(status_code=422, detail=INVALID_CNH_MESSAGE)
        return digits

    cleaned = re.sub(r"[^A-Za-z0-9]", "", stripped).upper()
    if len(cleaned) == CPF_LENGTH:
        if not is_valid_cpf(cleaned):
            raise HTTPException(status_code=422, detail=INVALID_RG_MESSAGE)
        return cleaned
    if RG_MIN_LENGTH <= len(cleaned) <= RG_MAX_LENGTH:
        return cleaned
    raise HTTPException(status_code=422, detail=INVALID_RG_MESSAGE)


def _clean_dimension_m(value: float, *, message: str) -> float:
    rounded = round(value, 2)
    if rounded <= 0:
        raise HTTPException(status_code=422, detail=message)
    return rounded


def _parse_cargo_items(raw: str) -> list[CargoItemIn]:
    if len(raw) > MAX_CARGO_ITEMS_JSON_LENGTH:
        raise INVALID_CARGO_ITEMS
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as error:
        raise INVALID_CARGO_ITEMS from error
    if (
        not isinstance(payload, list)
        or not MIN_CARGO_ITEMS <= len(payload) <= MAX_CARGO_ITEMS
    ):
        raise INVALID_CARGO_ITEMS
    try:
        items = [CargoItemIn.model_validate(entry) for entry in payload]
    except ValidationError as error:
        raise INVALID_CARGO_ITEMS from error
    for item in items:
        if not item.product_name.strip() or len(item.product_name) > MAX_TEXT_LENGTH:
            raise INVALID_CARGO_ITEMS
    return items


def _reject_duplicate_schedule(
    db: Session,
    *,
    plate: str,
    driver_document: str,
    vehicle_chassis: str,
    scheduled_date: date,
) -> None:
    if db.execute(
        select(Schedule.id).where(
            Schedule.plate == plate, Schedule.scheduled_date == scheduled_date
        )
    ).first():
        raise DUPLICATE_PLATE
    if db.execute(
        select(Schedule.id).where(
            Schedule.driver_document == driver_document,
            Schedule.scheduled_date == scheduled_date,
        )
    ).first():
        raise DUPLICATE_DRIVER_DOCUMENT
    if db.execute(
        select(Schedule.id).where(
            Schedule.vehicle_chassis == vehicle_chassis,
            Schedule.scheduled_date == scheduled_date,
        )
    ).first():
        raise DUPLICATE_VEHICLE_CHASSIS


async def _save_required_photo(photo: UploadFile) -> tuple[str, bytes]:
    if photo.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Tipo de arquivo não suportado. Envie uma imagem JPEG, PNG ou WebP."
            ),
        )
    content = await photo.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413, detail="Imagem muito grande. O limite é de 5 MB."
        )
    try:
        await run_in_threadpool(decode_image, content)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    path = await run_in_threadpool(
        save_photo, content, photo.content_type, subdir="schedules"
    )
    return path, content


@dataclass
class ScheduleForm:
    plate: Annotated[str, Form()]
    driver_name: Annotated[str, Form()]
    driver_birth_date: Annotated[date, Form()]
    driver_birth_place: Annotated[str, Form()]
    driver_birth_state: Annotated[str, Form()]
    driver_document_type: Annotated[DriverDocumentType, Form()]
    driver_document: Annotated[str, Form()]
    vehicle_brand: Annotated[str, Form()]
    vehicle_model: Annotated[str, Form()]
    vehicle_year: Annotated[str, Form()]
    vehicle_chassis: Annotated[str, Form()]
    vehicle_color: Annotated[str, Form()]
    vehicle_length_m: Annotated[float, Form()]
    vehicle_height_m: Annotated[float, Form()]
    vehicle_width_m: Annotated[float, Form()]
    origin_location: Annotated[str, Form()]
    destination_location: Annotated[str, Form()]
    cargo_items: Annotated[str, Form()]
    scheduled_date: Annotated[date, Form()]
    driver_document_photo_front: Annotated[UploadFile, File()]
    driver_document_photo_back: Annotated[UploadFile, File()]
    vehicle_document_photo: Annotated[UploadFile, File()]
    manifest_photo: Annotated[UploadFile, File()]


@router.post(
    "",
    status_code=201,
    responses={
        400: {"description": BAD_REQUEST},
        409: {"description": CONFLICT},
        413: {"description": PAYLOAD_TOO_LARGE},
        422: {"description": UNPROCESSABLE, "content": VALIDATION_ERROR_CONTENT},
    },
)
async def create_schedule(
    form: Annotated[ScheduleForm, Depends()],
    employee: Annotated[Employee, Depends(require_schedules_create)],
    db: Annotated[Session, Depends(get_db)],
) -> ScheduleOut:
    normalized_plate = normalize(form.plate)
    if plate_format(normalized_plate) is None:
        raise INVALID_PLATE

    clean_driver_name = _require_non_empty(
        form.driver_name,
        max_length=MAX_TEXT_LENGTH,
        message="Nome do motorista inválido.",
    )
    clean_birth_place = _require_non_empty(
        form.driver_birth_place,
        max_length=MAX_TEXT_LENGTH,
        message="Local de nascimento inválido.",
    )
    clean_birth_state = _clean_uf(form.driver_birth_state)
    clean_driver_document = _clean_driver_document(
        form.driver_document_type, form.driver_document
    )
    clean_brand = _require_non_empty(
        form.vehicle_brand, max_length=60, message="Marca do veículo inválida."
    )
    clean_model = _require_non_empty(
        form.vehicle_model, max_length=60, message="Modelo do veículo inválido."
    )
    clean_year = _require_non_empty(
        form.vehicle_year, max_length=4, message="Ano do veículo inválido."
    )
    clean_chassis = _clean_chassis(form.vehicle_chassis)
    clean_color = _require_non_empty(
        form.vehicle_color, max_length=40, message="Cor do veículo inválida."
    )
    clean_origin = _require_non_empty(
        form.origin_location, max_length=MAX_TEXT_LENGTH, message="Origem inválida."
    )
    clean_destination = _require_non_empty(
        form.destination_location,
        max_length=MAX_TEXT_LENGTH,
        message="Destino inválido.",
    )
    clean_length_m = _clean_dimension_m(
        form.vehicle_length_m, message="Comprimento do veículo inválido."
    )
    clean_height_m = _clean_dimension_m(
        form.vehicle_height_m, message="Altura do veículo inválida."
    )
    clean_width_m = _clean_dimension_m(
        form.vehicle_width_m, message="Largura do veículo inválida."
    )
    parsed_cargo_items = _parse_cargo_items(form.cargo_items)

    _reject_duplicate_schedule(
        db,
        plate=normalized_plate,
        driver_document=clean_driver_document,
        vehicle_chassis=clean_chassis,
        scheduled_date=form.scheduled_date,
    )

    (
        driver_document_photo_front_path,
        driver_document_photo_front_bytes,
    ) = await _save_required_photo(form.driver_document_photo_front)
    driver_document_photo_back_path, _ = await _save_required_photo(
        form.driver_document_photo_back
    )
    vehicle_document_photo_path, _ = await _save_required_photo(
        form.vehicle_document_photo
    )
    manifest_photo_path, _ = await _save_required_photo(form.manifest_photo)

    is_valid, validation_detail = await run_in_threadpool(
        validate_document_photo,
        clean_driver_document,
        driver_document_photo_front_bytes,
    )

    schedule = Schedule(
        plate=normalized_plate,
        driver_name=clean_driver_name,
        driver_birth_date=form.driver_birth_date,
        driver_birth_place=clean_birth_place,
        driver_birth_state=clean_birth_state,
        driver_document_type=form.driver_document_type,
        driver_document=clean_driver_document,
        driver_document_photo_front_path=driver_document_photo_front_path,
        driver_document_photo_back_path=driver_document_photo_back_path,
        driver_document_validated=is_valid,
        driver_document_validation_detail=validation_detail,
        vehicle_document_photo_path=vehicle_document_photo_path,
        vehicle_brand=clean_brand,
        vehicle_model=clean_model,
        vehicle_year=clean_year,
        vehicle_chassis=clean_chassis,
        vehicle_color=clean_color,
        vehicle_length_m=clean_length_m,
        vehicle_height_m=clean_height_m,
        vehicle_width_m=clean_width_m,
        origin_location=clean_origin,
        destination_location=clean_destination,
        manifest_photo_path=manifest_photo_path,
        scheduled_date=form.scheduled_date,
        created_by_id=employee.id,
        cargo_items=[
            CargoItem(product_name=item.product_name.strip(), category=item.category)
            for item in parsed_cargo_items
        ],
    )
    db.add(schedule)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise DUPLICATE_SCHEDULE from error
    db.refresh(schedule)
    return _to_schedule_out(schedule)


@router.get("")
def list_schedules(
    plate: str | None = None,
    db: Session = Depends(get_db),
    _employee: Employee = Depends(require_schedules_view),
) -> list[ScheduleOut]:
    query = select(Schedule).order_by(Schedule.scheduled_date.desc())
    if plate:
        query = query.where(Schedule.plate == normalize(plate))
    rows = db.execute(query).scalars().all()
    return [_to_schedule_out(schedule) for schedule in rows]


def _serve_schedule_photo(relative_path: str, not_found_message: str) -> FileResponse:
    photo_path = resolve_photo_path(relative_path)
    if photo_path is None:
        raise HTTPException(status_code=404, detail=not_found_message)
    return FileResponse(photo_path)  # nosemgrep


def _get_schedule_or_404(schedule_id: int, db: Session) -> Schedule:
    schedule = db.get(Schedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado.")
    return schedule


@router.get(
    "/{schedule_id}/driver-document-photo-front",
    responses={404: {"description": NOT_FOUND}},
)
def get_driver_document_photo_front(
    schedule_id: int,
    db: Session = Depends(get_db),
    _employee: Employee = Depends(require_schedules_view),
) -> FileResponse:
    schedule = _get_schedule_or_404(schedule_id, db)
    return _serve_schedule_photo(
        schedule.driver_document_photo_front_path,
        "Arquivo da foto da frente do documento do motorista não foi encontrado no "
        "servidor.",
    )


@router.get(
    "/{schedule_id}/driver-document-photo-back",
    responses={404: {"description": NOT_FOUND}},
)
def get_driver_document_photo_back(
    schedule_id: int,
    db: Session = Depends(get_db),
    _employee: Employee = Depends(require_schedules_view),
) -> FileResponse:
    schedule = _get_schedule_or_404(schedule_id, db)
    return _serve_schedule_photo(
        schedule.driver_document_photo_back_path,
        "Arquivo da foto do verso do documento do motorista não foi encontrado no "
        "servidor.",
    )


@router.get(
    "/{schedule_id}/vehicle-document-photo", responses={404: {"description": NOT_FOUND}}
)
def get_vehicle_document_photo(
    schedule_id: int,
    db: Session = Depends(get_db),
    _employee: Employee = Depends(require_schedules_view),
) -> FileResponse:
    schedule = _get_schedule_or_404(schedule_id, db)
    return _serve_schedule_photo(
        schedule.vehicle_document_photo_path,
        "Arquivo da foto do documento do veículo não foi encontrado no servidor.",
    )


@router.get(
    "/{schedule_id}/manifest-photo", responses={404: {"description": NOT_FOUND}}
)
def get_manifest_photo(
    schedule_id: int,
    db: Session = Depends(get_db),
    _employee: Employee = Depends(require_schedules_view),
) -> FileResponse:
    schedule = _get_schedule_or_404(schedule_id, db)
    return _serve_schedule_photo(
        schedule.manifest_photo_path,
        "Arquivo do manifesto de carga não foi encontrado no servidor.",
    )
