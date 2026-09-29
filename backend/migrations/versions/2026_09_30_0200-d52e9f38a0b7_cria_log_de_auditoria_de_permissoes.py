from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d52e9f38a0b7"
down_revision: str | Sequence[str] | None = "c41d8e27f9a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "permission_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("actor_username", sa.String(length=50), nullable=False),
        sa.Column("actor_name", sa.String(length=120), nullable=False),
        sa.Column("client_ip", sa.String(length=45), nullable=True),
        sa.Column(
            "action",
            sa.Enum(
                "role_created",
                "role_updated",
                "role_deleted",
                "employee_role_changed",
                "employee_overrides_changed",
                name="permission_audit_action",
                native_enum=False,
                create_constraint=True,
                length=30,
            ),
            nullable=False,
        ),
        sa.Column("target_name", sa.String(length=120), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["employees.id"],
            name=op.f("fk_permission_audit_logs_actor_id_employees"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_permission_audit_logs")),
    )
    op.create_index(
        op.f("ix_permission_audit_logs_actor_id"),
        "permission_audit_logs",
        ["actor_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_permission_audit_logs_created_at"),
        "permission_audit_logs",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_permission_audit_logs_created_at"),
        table_name="permission_audit_logs",
    )
    op.drop_index(
        op.f("ix_permission_audit_logs_actor_id"), table_name="permission_audit_logs"
    )
    op.drop_table("permission_audit_logs")
