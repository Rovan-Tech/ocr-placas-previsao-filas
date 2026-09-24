import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.services.plate_format import PlateFormat


class UploadEndpoint(str, enum.Enum):
    UPLOAD = "upload"  # POST /ocr/upload — foto enviada pra leitura automática
    MANUAL = "manual"  # POST /ocr/manual — placa digitada (com ou sem foto de resguardo)


class UploadLog(Base):
    """Quem enviou cada foto/placa, de qual endereço, e o que saiu da leitura.

    Existe uma linha por chamada a `/ocr/upload` ou `/ocr/manual` — nunca sem um funcionário
    logado (`employee_id` não aceita nulo). `photo_path` só é preenchido quando a foto em si é
    guardada em disco: hoje isso só acontece no caminho de resguardo (`/ocr/manual` com uma foto
    que não saiu boa) — ver app/services/photo_storage.py. As demais chamadas ficam só com os
    metadados (quem, quando, de onde, o que leu), sem reter a imagem.
    """

    __tablename__ = "upload_logs"
    __table_args__ = (
        CheckConstraint("ocr_plate IS NULL OR ocr_plate ~ '^[A-Z0-9]{7}$'", name="ocr_plate_format"),
        CheckConstraint("manual_plate IS NULL OR manual_plate ~ '^[A-Z0-9]{7}$'", name="manual_plate_format"),
        CheckConstraint("final_plate IS NULL OR final_plate ~ '^[A-Z0-9]{7}$'", name="final_plate_format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    endpoint: Mapped[UploadEndpoint] = mapped_column(
        Enum(
            UploadEndpoint,
            name="upload_log_endpoint",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        )
    )
    # IP de quem conectou no servidor (request.client.host) — sem proxy reverso na frente, é o
    # endereço de verdade da máquina/celular do fiscal. Ver get_client_ip em app/services/auth.py.
    client_ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(300))

    ocr_plate: Mapped[str | None] = mapped_column(String(7))
    ocr_confidence: Mapped[float | None] = mapped_column(Float)
    manual_plate: Mapped[str | None] = mapped_column(String(7))
    # O que valeu no fim: a placa lida com confiança, ou a digitada por cima.
    final_plate: Mapped[str | None] = mapped_column(String(7), index=True)
    final_plate_format: Mapped[PlateFormat | None] = mapped_column(
        Enum(
            PlateFormat,
            name="upload_log_plate_format",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        )
    )
    needs_review: Mapped[bool] = mapped_column(default=False, server_default="false")
    # Caminho relativo a settings.upload_dir — None quando não havia foto pra guardar, ou quando
    # a foto não precisou ser retida (leitura automática que já saiu confiável).
    photo_path: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    def __repr__(self) -> str:
        return f"UploadLog(id={self.id!r}, employee_id={self.employee_id!r}, endpoint={self.endpoint!r})"
