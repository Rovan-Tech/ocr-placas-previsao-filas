import enum

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class CargoCategory(str, enum.Enum):
    PERECIVEL = "perecivel"
    NAO_PERECIVEL = "nao_perecivel"
    QUIMICO = "quimico"
    TOXICO = "toxico"
    INFLAMAVEL = "inflamavel"


class CargoItem(Base):

    __tablename__ = "cargo_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    schedule_id: Mapped[int] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"))
    product_name: Mapped[str] = mapped_column(String(120))
    category: Mapped[CargoCategory] = mapped_column(
        Enum(
            CargoCategory,
            name="cargo_category",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
    )

    schedule: Mapped["Schedule"] = relationship(back_populates="cargo_items")

    def __repr__(self) -> str:
        return f"CargoItem(id={self.id!r}, schedule_id={self.schedule_id!r}, product_name={self.product_name!r})"
