import enum
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, Float, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class DriverDocumentType(str, enum.Enum):
    CPF = "cpf"
    RG = "rg"
    CNH = "cnh"


class Schedule(Base):

    __tablename__ = "schedules"
    __table_args__ = (
        CheckConstraint("plate ~ '^[A-Z0-9]{7}$'", name="plate_format"),
        CheckConstraint("vehicle_chassis ~ '^[A-Z0-9]{17}$'", name="vehicle_chassis_format"),
        CheckConstraint("driver_birth_state ~ '^[A-Z]{2}$'", name="driver_birth_state_format"),
        UniqueConstraint("plate", "scheduled_date", name="uq_schedules_plate_scheduled_date"),
        UniqueConstraint("driver_document", "scheduled_date", name="uq_schedules_driver_document_scheduled_date"),
        UniqueConstraint("vehicle_chassis", "scheduled_date", name="uq_schedules_vehicle_chassis_scheduled_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plate: Mapped[str] = mapped_column(String(7), index=True)

    driver_name: Mapped[str] = mapped_column(String(120))
    driver_birth_date: Mapped[date] = mapped_column(Date)
    driver_birth_place: Mapped[str] = mapped_column(String(120))
    driver_birth_state: Mapped[str] = mapped_column(String(2))
    driver_document_type: Mapped[DriverDocumentType] = mapped_column(
        Enum(
            DriverDocumentType,
            name="driver_document_type",
            native_enum=False,
            create_constraint=True,
            length=10,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
    )
    driver_document: Mapped[str] = mapped_column(String(20))
    driver_document_photo_front_path: Mapped[str] = mapped_column(String(255))
    driver_document_photo_back_path: Mapped[str] = mapped_column(String(255))
    driver_document_validated: Mapped[bool]
    driver_document_validation_detail: Mapped[str] = mapped_column(String(255))

    vehicle_document_photo_path: Mapped[str] = mapped_column(String(255))
    vehicle_brand: Mapped[str] = mapped_column(String(60))
    vehicle_model: Mapped[str] = mapped_column(String(60))
    vehicle_year: Mapped[str] = mapped_column(String(4))
    vehicle_chassis: Mapped[str] = mapped_column(String(17))
    vehicle_color: Mapped[str] = mapped_column(String(40))
    vehicle_length_m: Mapped[float] = mapped_column(Float)
    vehicle_height_m: Mapped[float] = mapped_column(Float)
    vehicle_width_m: Mapped[float] = mapped_column(Float)

    origin_location: Mapped[str] = mapped_column(String(120))
    destination_location: Mapped[str] = mapped_column(String(120))

    manifest_photo_path: Mapped[str] = mapped_column(String(255))

    cargo_items: Mapped[list["CargoItem"]] = relationship(
        back_populates="schedule", cascade="all, delete-orphan", order_by="CargoItem.id"
    )

    scheduled_date: Mapped[date] = mapped_column(Date, index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"Schedule(id={self.id!r}, plate={self.plate!r}, scheduled_date={self.scheduled_date!r})"
