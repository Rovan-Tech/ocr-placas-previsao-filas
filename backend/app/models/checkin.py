import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CheckInStatus(str, enum.Enum):
    WAITING = "waiting"  # aguardando na fila do pátio
    ADMITTED = "admitted"  # liberado para entrar no pátio
    CANCELLED = "cancelled"  # check-in cancelado (ex.: leitura errada)


class CheckIn(Base):
    __tablename__ = "checkins"
    __table_args__ = (
        # Placa normalizada: 7 caracteres, maiúsculos, sem hífen (Mercosul ou padrão antigo).
        CheckConstraint("plate ~ '^[A-Z0-9]{7}$'", name="plate_format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plate: Mapped[str] = mapped_column(String(7), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    # native_enum=False + create_constraint: grava como VARCHAR + CHECK, mais simples de evoluir em
    # migrações do que um tipo ENUM do PostgreSQL.
    status: Mapped[CheckInStatus] = mapped_column(
        Enum(
            CheckInStatus,
            name="checkin_status",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=CheckInStatus.WAITING,
        server_default=CheckInStatus.WAITING.value,
    )

    def __repr__(self) -> str:
        return f"CheckIn(id={self.id!r}, plate={self.plate!r}, status={self.status.value!r})"
