import logging

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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ocr", tags=["ocr"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
# Folga sobre o tamanho de uma placa (7) — texto muito maior que isso é claramente lixo, não
# precisa nem tentar normalizar.
MAX_MANUAL_PLATE_LENGTH = 16


class Detection(BaseModel):
    text: str
    confidence: float


class Verification(BaseModel):
    status: VerificationStatus
    detail: str
    source: str | None = None


class PlateReadResponse(BaseModel):
    filename: str | None
    # Placa normalizada (7 caracteres, sem hífen) ou None se nenhuma leitura teve formato válido.
    plate: str | None
    plate_format: PlateFormat | None
    confidence: float | None
    # True quando o fiscal deve conferir a placa na mão (baixa confiança, leitura ambígua ou nada lido).
    needs_review: bool
    # Só existe quando há placa em formato válido — texto inválido nunca é enviado à base oficial.
    verification: Verification | None
    detections: list[Detection]


class ManualPlateReadResponse(PlateReadResponse):
    # Só relevante quando uma foto foi anexada (câmera não leu, e o fiscal digitou por cima):
    # None quando não havia foto pra guardar de resguardo; True/False conforme o registro foi
    # salvo. Nunca bloqueia a confirmação da placa — é um resguardo, não o resultado principal.
    audit_saved: bool | None = None


def _verify(plate: str | None, verifier: PlateVerifier) -> Verification | None:
    if plate is None:
        return None
    result = verifier.verify(plate)
    return Verification(status=result.status, detail=result.detail, source=result.source)


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
    """Registra quem fez a chamada e o que ela leu — nunca impede a resposta ao fiscal: se o
    registro falhar, o problema fica só nos logs do servidor (ver CLAUDE.md, 'nunca bloquear a
    tarefa principal por causa de um resguardo secundário')."""
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
        # OCR é pesado e síncrono: numa thread à parte, o servidor segue respondendo às outras
        # requisições (healthcheck, outra foto) em vez de travar até a leitura acabar.
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
        photo_path=None,  # a foto em si só é retida no caminho de resguardo (ver /manual)
    )

    return PlateReadResponse(
        filename=file.filename,
        plate=reading.plate,
        plate_format=reading.format,
        confidence=reading.confidence,
        needs_review=reading.needs_review,
        verification=_verify(reading.plate, verifier),
        detections=[Detection(**detection) for detection in reading.detections],
    )


@router.post("/manual", response_model=ManualPlateReadResponse)
async def submit_plate_manually(
    request: Request,
    plate: str = Form(...),
    # Foto original, só quando a câmera não leu (ou o fiscal preferiu digitar direto): guardada
    # em disco como resguardo (nunca no banco — ver app/services/photo_storage.py). ocr_plate/
    # ocr_confidence dão o contexto de o que o OCR chegou a tentar ler antes da digitação.
    photo: UploadFile | None = File(None),
    ocr_plate: str | None = Form(None),
    ocr_confidence: float | None = Form(None),
    verifier: PlateVerifier = Depends(get_plate_verifier),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> ManualPlateReadResponse:
    """Placa digitada pelo fiscal — quando a câmera não lê a placa, ou o fiscal prefere digitar.

    O mesmo validador de formato do OCR (`plate_format.py`) decide sozinho, pela ordem dos
    caracteres, se é uma placa Mercosul (``LLLNLNN``) ou do padrão antigo (``LLLNNNN``) — não há
    nenhuma escolha de formato na tela, só o texto digitado. Formato inválido é rejeitado (400):
    diferente da leitura por OCR, aqui não existe "quase certo" a corrigir, então não faz sentido
    aceitar e pedir revisão — ou o texto é uma placa válida, ou o fiscal digita de novo.
    """
    invalid_format = HTTPException(
        status_code=400,
        detail=(
            "Formato de placa inválido. Use o padrão Mercosul (ex.: ABC1D23) ou o "
            "padrão antigo (ex.: ABC1234)."
        ),
    )
    # Checado antes de normalizar, e sem incluir o texto do cliente na mensagem: ecoar de volta o
    # que o cliente mandou é o que a política de segurança do projeto evita para qualquer entrada.
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

        # ocr_plate vem do resultado do OCR que o próprio frontend recebeu antes — mas é entrada
        # do cliente mesmo assim, então valida como qualquer outra: formato inválido é descartado
        # (vira None) em vez de travar o resguardo por causa de um dado só de contexto.
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
        # Digitada pelo fiscal, não lida por OCR: não há incerteza de leitura a expressar.
        confidence=1.0,
        needs_review=False,
        verification=_verify(normalized, verifier),
        detections=[],
        audit_saved=audit_saved,
    )
