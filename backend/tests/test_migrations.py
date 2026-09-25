from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect

import app.models  # noqa: F401 — registra os modelos em Base.metadata
from app.db import Base
from tests.conftest import TEST_DATABASE_URL, alembic_config


def test_migrations_match_the_models(test_engine):
    with test_engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        diff = compare_metadata(context, Base.metadata)

    assert diff == [], f"Modelos e migrações fora de sincronia — rode alembic revision --autogenerate: {diff}"


def test_downgrade_and_upgrade_are_reversible(test_engine):
    config = alembic_config(TEST_DATABASE_URL)

    command.downgrade(config, "base")
    assert "checkins" not in inspect(test_engine).get_table_names()

    command.upgrade(config, "head")
    columns = {column["name"] for column in inspect(test_engine).get_columns("checkins")}
    assert columns == {"id", "plate", "created_at", "status", "created_by_id", "schedule_id", "decided_at"}
