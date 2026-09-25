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
    limiter.reset()

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
    with test_engine.connect() as connection:
        transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


@pytest.fixture
def employee(db_session):
    from app.models import Employee
    from app.services.auth import hash_password

    record = Employee(
        username="fiscal.teste",
        full_name="Fiscal de Teste",
        password_hash=hash_password("s3nhaSegura!"),
        must_change_password=False,
    )
    db_session.add(record)
    db_session.flush()
    db_session.refresh(record)
    return record


@pytest.fixture
def make_schedule(db_session):
    from datetime import date

    from app.models import CargoItem, DriverDocumentType, Schedule

    def _make(employee, *, plate="ABC1D23", scheduled_date=date(2026, 9, 24), **overrides):
        record = Schedule(
            plate=plate,
            driver_name=overrides.get("driver_name", "João da Silva"),
            driver_birth_date=overrides.get("driver_birth_date", date(1990, 1, 1)),
            driver_birth_place=overrides.get("driver_birth_place", "São Luís - MA"),
            driver_birth_state=overrides.get("driver_birth_state", "MA"),
            driver_document_type=overrides.get("driver_document_type", DriverDocumentType.CPF),
            driver_document=overrides.get("driver_document", "11144477735"),
            driver_document_photo_front_path=overrides.get(
                "driver_document_photo_front_path", "schedules/doc-front.jpg"
            ),
            driver_document_photo_back_path=overrides.get(
                "driver_document_photo_back_path", "schedules/doc-back.jpg"
            ),
            driver_document_validated=overrides.get("driver_document_validated", True),
            driver_document_validation_detail=overrides.get(
                "driver_document_validation_detail", "Número do documento confere com a foto."
            ),
            vehicle_document_photo_path=overrides.get("vehicle_document_photo_path", "schedules/vehicle.jpg"),
            vehicle_brand=overrides.get("vehicle_brand", "Volvo"),
            vehicle_model=overrides.get("vehicle_model", "FH 540"),
            vehicle_year=overrides.get("vehicle_year", "2020"),
            vehicle_chassis=overrides.get("vehicle_chassis", "9BWZZZ377VT004251"),
            vehicle_color=overrides.get("vehicle_color", "Branco"),
            vehicle_length_m=overrides.get("vehicle_length_m", 12.5),
            vehicle_height_m=overrides.get("vehicle_height_m", 4.0),
            vehicle_width_m=overrides.get("vehicle_width_m", 2.6),
            origin_location=overrides.get("origin_location", "São Paulo - SP"),
            destination_location=overrides.get("destination_location", "São Luís - MA"),
            manifest_photo_path=overrides.get("manifest_photo_path", "schedules/manifest.jpg"),
            scheduled_date=scheduled_date,
            created_by_id=employee.id,
            cargo_items=overrides.get(
                "cargo_items", [CargoItem(product_name="Grãos", category="nao_perecivel")]
            ),
        )
        db_session.add(record)
        db_session.flush()
        db_session.refresh(record)
        return record

    return _make


@pytest.fixture
def authenticated_client(employee, db_session):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app
    from app.services.auth import get_current_employee

    app.dependency_overrides[get_current_employee] = lambda: employee
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        del app.dependency_overrides[get_current_employee]
        del app.dependency_overrides[get_db]
