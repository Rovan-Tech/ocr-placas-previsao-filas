from fastapi import APIRouter, HTTPException, Request, UploadFile

from app.config import settings
from app.rate_limit import limiter
from app.services.ocr_service import read_plate_text

router = APIRouter(prefix="/ocr", tags=["ocr"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


@router.post("/upload")
@limiter.limit(lambda: settings.ocr_upload_rate_limit)
async def upload_plate_image(request: Request, file: UploadFile) -> dict:
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
        detections = read_plate_text(image_bytes)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"filename": file.filename, "detections": detections}
