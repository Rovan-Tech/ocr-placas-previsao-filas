import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CheckInStatus(str, enum.Enum):
    WAITING = "waiting"
    ADMITTED = "admitted"
    CANCELLED = "cancelled"


class CheckIn(Base):
    __tablename__ = "checkins"
    __table_args__ = (
        CheckConstraint("plate ~ '^[A-Z0-9]{7}$'", name="plate_format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plate: Mapped[str] = mapped_column(String(7), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
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
    created_by_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    schedule_id: Mapped[int | None] = mapped_column(ForeignKey("schedules.id"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"CheckIn(id={self.id!r}, plate={self.plate!r}, status={self.status.value!r})"
