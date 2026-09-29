from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, text

import app.models  # noqa: F401 — registra os modelos em Base.metadata
from app.db import Base
from tests.conftest import TEST_DATABASE_URL, alembic_config


def test_migrations_match_the_models(test_engine):
    with test_engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        diff = compare_metadata(context, Base.metadata)

    assert diff == [], (
        "Modelos e migrações fora de sincronia — "
        f"rode alembic revision --autogenerate: {diff}"
    )


def test_downgrade_and_upgrade_are_reversible(test_engine):
    config = alembic_config(TEST_DATABASE_URL)

    command.downgrade(config, "base")
    assert "checkins" not in inspect(test_engine).get_table_names()

    command.upgrade(config, "head")
    columns = {
        column["name"] for column in inspect(test_engine).get_columns("checkins")
    }
    assert columns == {
        "id",
        "plate",
        "created_at",
        "status",
        "created_by_id",
        "schedule_id",
        "decided_at",
    }


def test_role_migration_keeps_admins_and_turns_the_rest_into_fiscais(test_engine):
    config = alembic_config(TEST_DATABASE_URL)
    insert = text(
        "INSERT INTO employees (username, password_hash, full_name, is_admin) "
        "VALUES (:username, 'x', 'Nome', :is_admin)"
    )

    command.downgrade(config, "59c19e055908")
    with test_engine.begin() as connection:
        connection.execute(insert, {"username": "antigo.admin", "is_admin": True})
        connection.execute(insert, {"username": "antigo.fiscal", "is_admin": False})

    command.upgrade(config, "head")
    with test_engine.begin() as connection:
        roles = dict(
            connection.execute(
                text(
                    "SELECT employees.username, roles.key FROM employees "
                    "JOIN roles ON roles.id = employees.role_id ORDER BY username"
                )
            ).all()
        )
        connection.execute(text("DELETE FROM employees"))

    assert roles == {"antigo.admin": "admin", "antigo.fiscal": "fiscal"}


def test_role_tables_migration_seeds_the_system_roles_and_round_trips(test_engine):
    config = alembic_config(TEST_DATABASE_URL)

    with test_engine.connect() as connection:
        seeded = dict(
            connection.execute(
                text(
                    "SELECT roles.key, count(role_permissions.permission) FROM roles "
                    "LEFT JOIN role_permissions ON role_permissions.role_id = roles.id "
                    "WHERE roles.is_system GROUP BY roles.key"
                )
            ).all()
        )
    assert seeded == {
        "fiscal": 4,
        "planejador": 3,
        "analista": 3,
        "supervisor": 8,
        "admin": 13,
    }

    with test_engine.begin() as connection:
        admin_id = connection.execute(
            text("SELECT id FROM roles WHERE key = 'admin'")
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO employees (username, password_hash, full_name, role_id) "
                "VALUES ('volta.admin', 'x', 'Nome', :role_id)"
            ),
            {"role_id": admin_id},
        )

    command.downgrade(config, "a7c3e91d5b20")
    with test_engine.begin() as connection:
        downgraded = connection.execute(
            text("SELECT role FROM employees WHERE username = 'volta.admin'")
        ).scalar_one()
        connection.execute(text("DELETE FROM employees"))
    command.upgrade(config, "head")

    assert downgraded == "admin"
