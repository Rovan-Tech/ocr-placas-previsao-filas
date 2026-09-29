import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PermissionAuditAction(enum.StrEnum):
    ROLE_CREATED = "role_created"
    ROLE_UPDATED = "role_updated"
    ROLE_DELETED = "role_deleted"
    EMPLOYEE_ROLE_CHANGED = "employee_role_changed"
    EMPLOYEE_OVERRIDES_CHANGED = "employee_overrides_changed"


class PermissionAuditLog(Base):
    __tablename__ = "permission_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    actor_username: Mapped[str] = mapped_column(String(50))
    actor_name: Mapped[str] = mapped_column(String(120))
    client_ip: Mapped[str | None] = mapped_column(String(45))
    action: Mapped[PermissionAuditAction] = mapped_column(
        Enum(
            PermissionAuditAction,
            name="permission_audit_action",
            native_enum=False,
            create_constraint=True,
            length=30,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        )
    )
    target_name: Mapped[str] = mapped_column(String(120))
    summary: Mapped[str] = mapped_column(Text)
    details: Mapped[dict[str, object]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
