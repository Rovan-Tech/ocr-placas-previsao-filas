
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
    extension = EXTENSION_BY_CONTENT_TYPE.get(content_type, ".bin")
    relative_path = Path(subdir) / f"{uuid.uuid4().hex}{extension}"

    destination = _base_dir() / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)

    return str(relative_path)


def resolve_photo_path(relative_path: str) -> Path | None:
    base_dir = _base_dir()
    candidate = (base_dir / relative_path).resolve()
    if base_dir not in candidate.parents:
        return None
    return candidate if candidate.is_file() else None
