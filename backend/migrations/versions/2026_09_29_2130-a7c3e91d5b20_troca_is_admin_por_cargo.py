from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7c3e91d5b20"
down_revision: str | Sequence[str] | None = "59c19e055908"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column(
            "role",
            sa.Enum(
                "fiscal",
                "planejador",
                "analista",
                "supervisor",
                "admin",
                name="employee_role",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="fiscal",
            nullable=False,
        ),
    )
    op.execute("UPDATE employees SET role = 'admin' WHERE is_admin")
    op.drop_column("employees", "is_admin")


def downgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False),
    )
    op.execute("UPDATE employees SET is_admin = true WHERE role = 'admin'")
    op.drop_column("employees", "role")
