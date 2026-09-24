import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.rate_limit import limiter

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Evita que o rate limit do /ocr/upload vaze de um teste pro outro —
    todos os testes batem no mesmo TestClient/limiter dentro da suíte."""
    limiter.reset()

# Banco separado dos dados de dev — criado pelo docker/postgres/init/ do docker-compose.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://ocr:ocr@localhost:5433/ocr_placas_test"
)


def alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    config.attributes["configure_logger"] = False
    return config


@pytest.fixture(scope="session")
def test_engine():
    """Engine do banco de testes, já migrado até o head.

    Os testes que dependem dele são pulados se o PostgreSQL não estiver no ar
    (docker compose up -d), para o resto da suíte continuar rodando.
    """
    engine = create_engine(TEST_DATABASE_URL)
    try:
        with engine.connect():
            pass
    except OperationalError:
        pytest.skip(f"PostgreSQL de testes indisponível em {TEST_DATABASE_URL}")

    config = alembic_config(TEST_DATABASE_URL)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield engine
    command.downgrade(config, "base")
    engine.dispose()


@pytest.fixture
def db_session(test_engine):
    """Sessão dentro de uma transação que é desfeita no fim de cada teste."""
    with test_engine.connect() as connection:
        transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()
