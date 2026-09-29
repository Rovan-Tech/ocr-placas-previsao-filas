import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class SystemRole(enum.StrEnum):
    FISCAL = "fiscal"
    PLANEJADOR = "planejador"
    ANALISTA = "analista"
    SUPERVISOR = "supervisor"
    ADMIN = "admin"


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    is_system: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    permissions: Mapped[list["RolePermission"]] = relationship(
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="RolePermission.permission",
    )

    def __repr__(self) -> str:
        return f"Role(id={self.id!r}, key={self.key!r})"


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission: Mapped[str] = mapped_column(String(50), primary_key=True)


class EmployeePermissionOverride(Base):
    __tablename__ = "employee_permission_overrides"

    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), primary_key=True
    )
    permission: Mapped[str] = mapped_column(String(50), primary_key=True)
    granted: Mapped[bool] = mapped_column(Boolean)
