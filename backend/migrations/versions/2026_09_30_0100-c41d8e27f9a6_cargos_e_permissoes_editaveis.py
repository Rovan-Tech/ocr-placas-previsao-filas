from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c41d8e27f9a6"
down_revision: str | Sequence[str] | None = "a7c3e91d5b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CAPTURE = ["capture.read_plate", "capture.authorize_entry", "capture.refuse_entry"]
EMPLOYEES = [
    "employees.view",
    "employees.create",
    "employees.deactivate",
    "employees.set_role",
]
ALL_PERMISSIONS = [
    *CAPTURE,
    "checkins.view",
    "schedules.view",
    "schedules.create",
    "logs.view",
    "reports.view",
    *EMPLOYEES,
    "permissions.manage",
]

SYSTEM_ROLES: list[tuple[str, str, list[str]]] = [
    ("fiscal", "Fiscal de Portaria", [*CAPTURE, "checkins.view"]),
    (
        "planejador",
        "Planejador de Agendamentos",
        ["checkins.view", "schedules.view", "schedules.create"],
    ),
    (
        "analista",
        "Analista de Operações",
        ["checkins.view", "logs.view", "reports.view"],
    ),
    (
        "supervisor",
        "Supervisor de Turno",
        [
            *CAPTURE,
            "checkins.view",
            "schedules.view",
            "schedules.create",
            "logs.view",
            "reports.view",
        ],
    ),
    ("admin", "Administrador", ALL_PERMISSIONS),
]


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
        sa.UniqueConstraint("key", name=op.f("uq_roles_key")),
        sa.UniqueConstraint("name", name=op.f("uq_roles_name")),
    )
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission", sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            name=op.f("fk_role_permissions_role_id_roles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "role_id", "permission", name=op.f("pk_role_permissions")
        ),
    )
    op.create_table(
        "employee_permission_overrides",
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("permission", sa.String(length=50), nullable=False),
        sa.Column("granted", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["employees.id"],
            name=op.f("fk_employee_permission_overrides_employee_id_employees"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "employee_id",
            "permission",
            name=op.f("pk_employee_permission_overrides"),
        ),
    )
    _seed_system_roles()
    _move_employees_to_roles()


def _seed_system_roles() -> None:
    connection = op.get_bind()
    for key, name, permissions in SYSTEM_ROLES:
        role_id = connection.execute(
            sa.text(
                "INSERT INTO roles (key, name, is_system) "
                "VALUES (:key, :name, true) RETURNING id"
            ),
            {"key": key, "name": name},
        ).scalar_one()
        for permission in permissions:
            connection.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission) "
                    "VALUES (:role_id, :permission)"
                ),
                {"role_id": role_id, "permission": permission},
            )


def _move_employees_to_roles() -> None:
    op.add_column("employees", sa.Column("role_id", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE employees SET role_id = roles.id FROM roles "
        "WHERE roles.key = employees.role"
    )
    op.alter_column("employees", "role_id", nullable=False)
    op.create_foreign_key(
        op.f("fk_employees_role_id_roles"),
        "employees",
        "roles",
        ["role_id"],
        ["id"],
    )
    op.drop_column("employees", "role")


def downgrade() -> None:
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
    op.execute(
        "UPDATE employees SET role = roles.key FROM roles "
        "WHERE roles.id = employees.role_id AND roles.is_system"
    )
    op.drop_constraint(
        op.f("fk_employees_role_id_roles"), "employees", type_="foreignkey"
    )
    op.drop_column("employees", "role_id")
    op.drop_table("employee_permission_overrides")
    op.drop_table("role_permissions")
    op.drop_table("roles")
