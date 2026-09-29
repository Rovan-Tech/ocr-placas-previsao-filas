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
                text("SELECT username, role FROM employees ORDER BY username")
            ).all()
        )
        connection.execute(text("DELETE FROM employees"))

    assert roles == {"antigo.admin": "admin", "antigo.fiscal": "fiscal"}

    with test_engine.begin() as connection:
        for username, role in [("novo.admin", "admin"), ("novo.analista", "analista")]:
            connection.execute(
                text(
                    "INSERT INTO employees (username, password_hash, full_name, role) "
                    "VALUES (:username, 'x', 'Nome', :role)"
                ),
                {"username": username, "role": role},
            )

    command.downgrade(config, "59c19e055908")
    with test_engine.begin() as connection:
        flags = dict(
            connection.execute(
                text("SELECT username, is_admin FROM employees ORDER BY username")
            ).all()
        )
        connection.execute(text("DELETE FROM employees"))
    command.upgrade(config, "head")

    assert flags == {"novo.admin": True, "novo.analista": False}
