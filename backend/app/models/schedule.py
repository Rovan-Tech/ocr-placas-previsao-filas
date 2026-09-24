from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Schedule(Base):

    __tablename__ = "schedules"
    __table_args__ = (
        CheckConstraint("plate ~ '^[A-Z0-9]{7}$'", name="plate_format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plate: Mapped[str] = mapped_column(String(7), index=True)
    driver_name: Mapped[str] = mapped_column(String(120))
    driver_document: Mapped[str] = mapped_column(String(20))
    driver_document_photo_front_path: Mapped[str | None] = mapped_column(String(255))
    driver_document_photo_back_path: Mapped[str | None] = mapped_column(String(255))
    vehicle_document_photo_path: Mapped[str | None] = mapped_column(String(255))
    cargo_type: Mapped[str] = mapped_column(String(120))
    scheduled_date: Mapped[date] = mapped_column(Date, index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"Schedule(id={self.id!r}, plate={self.plate!r}, scheduled_date={self.scheduled_date!r})"
