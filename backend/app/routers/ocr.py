import logging
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Employee, UploadEndpoint, UploadLog
from app.rate_limit import limiter
from app.services.auth import get_client_ip, get_current_employee
from app.services.ocr_service import read_plate
from app.services.photo_storage import save_photo
from app.services.plate_format import PlateFormat, normalize, plate_format
from app.services.plate_verification import PlateVerifier, VerificationStatus, get_plate_verifier
from app.services.schedule_matching import ScheduleStatus, match_schedule_for_plate
from app.services.vehicle_data_api import VehicleDataProvider, get_vehicle_data_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ocr", tags=["ocr"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_MANUAL_PLATE_LENGTH = 16


class Detection(BaseModel):
    text: str
    confidence: float


class Verification(BaseModel):
    status: VerificationStatus
    detail: str
    source: str | None = None


class ScheduleInfo(BaseModel):
    driver_name: str
    driver_document: str
    has_driver_document_photo: bool
    has_vehicle_document_photo: bool
    cargo_type: str
    scheduled_date: date
    status: ScheduleStatus


class VehicleDataOut(BaseModel):
    brand: str | None
    model: str | None
    year: str | None
    uf: str | None
    color: str | None


class CheckinContext(BaseModel):
    found: bool
    schedule: ScheduleInfo | None
    vehicle_data: VehicleDataOut | None


class PlateReadResponse(BaseModel):
    filename: str | None
    plate: str | None
    plate_format: PlateFormat | None
    confidence: float | None
    needs_review: bool
    verification: Verification | None
    detections: list[Detection]
    checkin: CheckinContext | None = None


class ManualPlateReadResponse(PlateReadResponse):
    audit_saved: bool | None = None


def _verify(plate: str | None, verifier: PlateVerifier) -> Verification | None:
    if plate is None:
        return None
    result = verifier.verify(plate)
    return Verification(status=result.status, detail=result.detail, source=result.source)


async def _build_checkin_context(
    db: Session, plate: str | None, vehicle_provider: VehicleDataProvider
) -> CheckinContext | None:
    if plate is None:
        return None

    match = match_schedule_for_plate(db, plate, date.today())
    schedule_info = (
        ScheduleInfo(
            driver_name=match.schedule.driver_name,
            driver_document=match.schedule.driver_document,
            has_driver_document_photo=match.schedule.driver_document_photo_path is not None,
            has_vehicle_document_photo=match.schedule.vehicle_document_photo_path is not None,
            cargo_type=match.schedule.cargo_type,
            scheduled_date=match.schedule.scheduled_date,
            status=match.status,
        )
        if match is not None
        else None
    )

    vehicle_data = await vehicle_provider.lookup(plate)
    vehicle_data_out = (
        VehicleDataOut(
            brand=vehicle_data.brand,
            model=vehicle_data.model,
            year=vehicle_data.year,
            uf=vehicle_data.uf,
            color=vehicle_data.color,
        )
        if vehicle_data is not None
        else None
    )

    return CheckinContext(
        found=schedule_info is not None or vehicle_data_out is not None,
        schedule=schedule_info,
        vehicle_data=vehicle_data_out,
    )


def _log_upload(
    db: Session,
    *,
    employee: Employee,
    request: Request,
    endpoint: UploadEndpoint,
    ocr_plate: str | None,
    ocr_confidence: float | None,
    manual_plate: str | None,
    final_plate: str | None,
    final_plate_format: PlateFormat | None,
    needs_review: bool,
    photo_path: str | None,
) -> None:
    try:
        db.add(
            UploadLog(
                employee_id=employee.id,
                endpoint=endpoint,
                client_ip=get_client_ip(request),
                user_agent=request.headers.get("user-agent"),
                ocr_plate=ocr_plate,
                ocr_confidence=ocr_confidence,
                manual_plate=manual_plate,
                final_plate=final_plate,
                final_plate_format=final_plate_format,
                needs_review=needs_review,
                photo_path=photo_path,
            )
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Não foi possível registrar o log de %s para o funcionário %s.", endpoint, employee.id)


@router.post("/upload", response_model=PlateReadResponse)
@limiter.limit(lambda: settings.ocr_upload_rate_limit)
async def upload_plate_image(
    request: Request,
    file: UploadFile,
    verifier: PlateVerifier = Depends(get_plate_verifier),
    vehicle_provider: VehicleDataProvider = Depends(get_vehicle_data_provider),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> PlateReadResponse:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Tipo de arquivo não suportado. Envie uma imagem JPEG, PNG ou WebP.",
        )

    image_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Imagem muito grande. O limite é de 5 MB.",
        )

    try:
        reading = await run_in_threadpool(read_plate, image_bytes)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    _log_upload(
        db,
        employee=employee,
        request=request,
        endpoint=UploadEndpoint.UPLOAD,
        ocr_plate=reading.plate,
        ocr_confidence=reading.confidence,
        manual_plate=None,
        final_plate=reading.plate,
        final_plate_format=reading.format,
        needs_review=reading.needs_review,
        photo_path=None,
    )

    return PlateReadResponse(
        filename=file.filename,
        plate=reading.plate,
        plate_format=reading.format,
        confidence=reading.confidence,
        needs_review=reading.needs_review,
        verification=_verify(reading.plate, verifier),
        detections=[Detection(**detection) for detection in reading.detections],
        checkin=await _build_checkin_context(db, reading.plate, vehicle_provider),
    )


@router.post("/manual", response_model=ManualPlateReadResponse)
async def submit_plate_manually(
    request: Request,
    plate: str = Form(...),
    photo: UploadFile | None = File(None),
    ocr_plate: str | None = Form(None),
    ocr_confidence: float | None = Form(None),
    verifier: PlateVerifier = Depends(get_plate_verifier),
    vehicle_provider: VehicleDataProvider = Depends(get_vehicle_data_provider),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> ManualPlateReadResponse:
    invalid_format = HTTPException(
        status_code=400,
        detail=(
            "Formato de placa inválido. Use o padrão Mercosul (ex.: ABC1D23) ou o "
            "padrão antigo (ex.: ABC1234)."
        ),
    )
    if len(plate) > MAX_MANUAL_PLATE_LENGTH:
        raise invalid_format

    normalized = normalize(plate)
    detected_format = plate_format(normalized)
    if detected_format is None:
        raise invalid_format

    audit_saved = None
    photo_path = None
    normalized_ocr_plate = None
    if photo is not None:
        if photo.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Tipo de arquivo não suportado. Envie uma imagem JPEG, PNG ou WebP.",
            )
        photo_bytes = await photo.read(MAX_UPLOAD_BYTES + 1)
        if len(photo_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Imagem muito grande. O limite é de 5 MB.")

        normalized_ocr_plate = normalize(ocr_plate) if ocr_plate else None
        if normalized_ocr_plate is not None and plate_format(normalized_ocr_plate) is None:
            normalized_ocr_plate = None

        try:
            photo_path = await run_in_threadpool(save_photo, photo_bytes, photo.content_type)
            audit_saved = True
        except OSError:
            logger.exception("Não foi possível salvar a foto de resguardo em disco.")
            audit_saved = False

    _log_upload(
        db,
        employee=employee,
        request=request,
        endpoint=UploadEndpoint.MANUAL,
        ocr_plate=normalized_ocr_plate,
        ocr_confidence=ocr_confidence,
        manual_plate=normalized,
        final_plate=normalized,
        final_plate_format=detected_format,
        needs_review=False,
        photo_path=photo_path,
    )

    return ManualPlateReadResponse(
        filename=None,
        plate=normalized,
        plate_format=detected_format,
        confidence=1.0,
        needs_review=False,
        verification=_verify(normalized, verifier),
        detections=[],
        checkin=await _build_checkin_context(db, normalized, vehicle_provider),
        audit_saved=audit_saved,
    )
