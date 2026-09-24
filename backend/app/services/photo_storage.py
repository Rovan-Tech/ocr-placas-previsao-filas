"""Fotos de resguardo, guardadas em disco (nunca no banco — ver ManualReview no histórico do PR
e a decisão em backend/CLAUDE.md). Uma pasta local simples: sem custo, sem serviço externo.
"""

import uuid
from pathlib import Path

from app.config import settings

EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _base_dir() -> Path:
    return Path(settings.upload_dir).resolve()


def save_photo(content: bytes, content_type: str, *, subdir: str = "manual_reviews") -> str:
    """Salva a foto com um nome aleatório (nunca o nome/formato enviado pelo cliente) e devolve o
    caminho relativo a ``settings.upload_dir``, para guardar em ``UploadLog.photo_path``."""
    extension = EXTENSION_BY_CONTENT_TYPE.get(content_type, ".bin")
    relative_path = Path(subdir) / f"{uuid.uuid4().hex}{extension}"

    destination = _base_dir() / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)

    return str(relative_path)


def resolve_photo_path(relative_path: str) -> Path | None:
    """Caminho absoluto de uma foto salva, ou None se o registro apontar pra fora da pasta de
    upload (defesa contra um ``photo_path`` adulterado) ou o arquivo não existir mais."""
    base_dir = _base_dir()
    candidate = (base_dir / relative_path).resolve()
    if base_dir not in candidate.parents:
        return None
    return candidate if candidate.is_file() else None
