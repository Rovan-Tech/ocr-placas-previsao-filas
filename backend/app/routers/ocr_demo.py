from functools import lru_cache

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.config import settings
from app.rate_limit import limiter
from app.routers.ocr import ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES, Detection
from app.services.ocr_service import read_plate
from app.services.plate_format import PlateFormat
from app.services.plate_samples import PlateSample, hard_cases

router = APIRouter(prefix="/ocr", tags=["ocr-demo"])

DEMO_SAMPLE_NAMES = [
    "limpa_mercosul",
    "limpa_antiga",
    "pouca_luz",
    "angulo_lateral",
    "suja",
    "reflexo",
]

SAMPLE_NOT_FOUND = HTTPException(status_code=404, detail="Exemplo de demonstração não encontrado.")


@lru_cache(maxsize=1)
def demo_samples() -> list[PlateSample]:
    all_cases = {sample.name: sample for sample in hard_cases()}
    return [all_cases[name] for name in DEMO_SAMPLE_NAMES]


def _sample_or_404(sample_id: str) -> PlateSample:
    for sample in demo_samples():
        if sample.name == sample_id:
            return sample
    raise SAMPLE_NOT_FOUND


class DemoSampleInfo(BaseModel):
    id: str
    description: str


class DemoPlateReadResponse(BaseModel):
    plate: str | None
    plate_format: PlateFormat | None
    confidence: float | None
    needs_review: bool
    detections: list[Detection]


@router.get("/demo-samples", response_model=list[DemoSampleInfo])
def list_demo_samples() -> list[DemoSampleInfo]:
    return [DemoSampleInfo(id=sample.name, description=sample.description) for sample in demo_samples()]


@router.get("/demo-samples/{sample_id}/image")
def get_demo_sample_image(sample_id: str) -> Response:
    sample = _sample_or_404(sample_id)
    return Response(content=sample.image_bytes, media_type="image/jpeg")


@router.post("/demo-upload", response_model=DemoPlateReadResponse)
@limiter.limit(lambda: settings.ocr_demo_rate_limit)
async def demo_upload(
    request: Request,
    sample_id: str | None = Form(None),
    file: UploadFile | None = File(None),
) -> DemoPlateReadResponse:
    if sample_id is not None and file is not None:
        raise HTTPException(
            status_code=422,
            detail="Envie um exemplo pré-carregado (sample_id) ou uma foto (file), não os dois.",
        )

    if sample_id is not None:
        image_bytes = _sample_or_404(sample_id).image_bytes
    elif file is not None:
        if file.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Tipo de arquivo não suportado. Envie uma imagem JPEG, PNG ou WebP.",
            )
        image_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(image_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Imagem muito grande. O limite é de 5 MB.")
    else:
        raise HTTPException(
            status_code=422,
            detail="Envie um exemplo pré-carregado (sample_id) ou uma foto (file).",
        )

    try:
        reading = await run_in_threadpool(read_plate, image_bytes)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return DemoPlateReadResponse(
        plate=reading.plate,
        plate_format=reading.format,
        confidence=reading.confidence,
        needs_review=reading.needs_review,
        detections=[Detection(**detection) for detection in reading.detections],
    )
