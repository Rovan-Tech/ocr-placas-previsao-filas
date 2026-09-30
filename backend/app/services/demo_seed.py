from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Final, NamedTuple
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import (
    CargoCategory,
    CargoItem,
    CheckIn,
    CheckInStatus,
    DriverDocumentType,
    Employee,
    Role,
    Schedule,
    UploadEndpoint,
    UploadLog,
)
from app.services.auth import hash_password
from app.services.plate_format import PlateFormat

MIN_PASSWORD_LENGTH: Final = 12
TIMEZONE: Final = ZoneInfo("America/Sao_Paulo")
PLACEHOLDER_PHOTO: Final = "demo/sem-foto.jpg"


class ScheduleSeed(NamedTuple):
    plate: str
    driver: str
    document: str
    cargo: str
    category: str
    origin: str
    destination: str
    day_offset: int
    validated: bool
    brand: str
    model: str


STAFF: Final = (
    ("admin", "Administrador Demo", "admin"),
    ("marcos.vieira", "Marcos Vieira Lima", "supervisor"),
    ("juliana.reis", "Juliana Reis Costa", "fiscal"),
    ("carla.mendes", "Carla Mendes Duarte", "planejador"),
    ("otavio.nunes", "Otávio Nunes Ferraz", "analista"),
)

SCHEDULES: Final = (
    ScheduleSeed(
        "BRA2E19",
        "Adriano Souza Lima",
        "52998224725",
        "Grãos a granel",
        "nao_perecivel",
        "Rondonópolis/MT",
        "Terminal 1",
        0,
        True,
        "Volvo",
        "FH 540",
    ),
    ScheduleSeed(
        "QRS3T45",
        "Marina Costa Almeida",
        "11144477735",
        "Máquinas agrícolas",
        "nao_perecivel",
        "São Paulo/SP",
        "Terminal 3",
        0,
        False,
        "Scania",
        "R 450",
    ),
    ScheduleSeed(
        "STU0D12",
        "Carla Mendes Duarte",
        "39053344705",
        "Contêiner",
        "nao_perecivel",
        "Curitiba/PR",
        "Terminal 2",
        0,
        True,
        "Mercedes-Benz",
        "Actros 2651",
    ),
    ScheduleSeed(
        "KLM4821",
        "Bruno Fagundes Reis",
        "16899535009",
        "Granel líquido",
        "quimico",
        "Paranaguá/PR",
        "Terminal 1",
        1,
        True,
        "DAF",
        "XF 530",
    ),
    ScheduleSeed(
        "MNO8P61",
        "Paulo Andrade Silva",
        "86288366757",
        "Frutas frescas",
        "perecivel",
        "Petrolina/PE",
        "Terminal 4",
        -1,
        True,
        "Iveco",
        "Hi-Way 560",
    ),
    ScheduleSeed(
        "GHJ5K67",
        "Luís Otávio Pereira",
        "24971547080",
        "Fertilizantes",
        "quimico",
        "Uberaba/MG",
        "Terminal 2",
        1,
        True,
        "Volvo",
        "FH 460",
    ),
    ScheduleSeed(
        "PLK9M20",
        "Sérgio Ramos Batista",
        "98765432100",
        "Eletrodomésticos",
        "nao_perecivel",
        "Manaus/AM",
        "Terminal 3",
        1,
        True,
        "Scania",
        "G 410",
    ),
    ScheduleSeed(
        "TRN6V88",
        "Helena Prado Matos",
        "45317828791",
        "Laticínios",
        "perecivel",
        "Passo Fundo/RS",
        "Terminal 4",
        2,
        False,
        "Volkswagen",
        "Constellation",
    ),
    ScheduleSeed(
        "WXY1Z34",
        "Tiago Nascimento Leal",
        "71428793023",
        "Soja em grãos",
        "nao_perecivel",
        "Sorriso/MT",
        "Terminal 1",
        2,
        True,
        "Mercedes-Benz",
        "Actros 2546",
    ),
)

TODAY_SLOTS: Final = (
    (6, 12, 6),
    (6, 48, 8),
    (7, 20, 5),
    (7, 41, 9),
    (8, 5, 7),
    (8, 27, 11),
    (8, 52, 6),
    (9, 15, 9),
    (9, 44, 12),
    (10, 8, 8),
    (10, 33, 6),
    (11, 2, 10),
    (11, 30, 7),
    (12, 16, 5),
    (13, 4, 9),
    (13, 39, 13),
    (14, 22, 8),
    (15, 10, 6),
    (15, 48, 11),
    (16, 20, 7),
    (16, 55, 9),
    (17, 30, 6),
    (18, 5, 12),
    (18, 44, 8),
    (19, 12, 7),
)
YESTERDAY_SLOTS: Final = (
    (6, 5, 7),
    (6, 40, 6),
    (7, 10, 6),
    (7, 35, 8),
    (8, 0, 9),
    (8, 25, 7),
    (9, 10, 9),
    (10, 15, 7),
    (11, 5, 6),
    (12, 20, 9),
    (13, 30, 10),
    (14, 45, 8),
    (16, 10, 6),
    (17, 5, 7),
    (18, 0, 8),
)
REFUSED_INDEXES: Final = frozenset({4, 10, 19})
UNCERTAIN_EVERY: Final = 9
UNCERTAIN_REMAINDER: Final = 4
MANUAL_EVERY: Final = 7
MANUAL_REMAINDER: Final = 1
PLATE_LETTERS: Final = "ABCDEFGHJKLMNPRSTUVWXYZ"


@dataclass(frozen=True, slots=True)
class SeedReport:
    employees_created: int
    passwords_reset: int
    schedules: int
    checkins: int
    logs: int
    data_skipped: bool


def _plate(index: int) -> str:
    size = len(PLATE_LETTERS)
    letters = "".join(PLATE_LETTERS[(index * step) % size] for step in (1, 3, 7))
    fourth = PLATE_LETTERS[(index * 5) % size]
    digits = f"{index % 10}{(index * 7) % 10}{(index * 3) % 10}"
    return f"{letters}{digits[0]}{fourth}{digits[1:]}"


def _at(day: date, hour: int, minute: int) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=TIMEZONE).astimezone(UTC)


def _demo_data_exists(session: Session) -> bool:
    plates = [seed.plate for seed in SCHEDULES]
    return (
        session.query(Schedule).filter(Schedule.plate.in_(plates)).first() is not None
    )


def _reset_credentials(
    employee: Employee, password_hash: str, moment: datetime
) -> None:
    employee.password_hash = password_hash
    employee.must_change_password = False
    employee.active = True
    employee.password_set_at = moment


def _ensure_staff(
    session: Session, password: str, moment: datetime, *, reset_passwords: bool
) -> tuple[dict[str, Employee], int, int]:
    roles = {role.key: role for role in session.query(Role).all()}
    usernames = [username for username, _, _ in STAFF]
    existing = {
        employee.username: employee
        for employee in session.query(Employee).filter(Employee.username.in_(usernames))
    }
    password_hash = hash_password(password)
    created = reset = 0
    for username, full_name, role_key in STAFF:
        if username in existing:
            if reset_passwords:
                _reset_credentials(existing[username], password_hash, moment)
                reset += 1
            continue
        existing[username] = Employee(
            username=username,
            full_name=full_name,
            password_hash=password_hash,
            role=roles[role_key],
            must_change_password=False,
        )
        session.add(existing[username])
        created += 1
    session.flush()
    return existing, created, reset


def _build_schedule(
    seed: ScheduleSeed, index: int, creator: Employee, today: date
) -> Schedule:
    detail = (
        "Número do documento confere com a foto."
        if seed.validated
        else "Não foi possível confirmar o número na foto — confira manualmente."
    )
    schedule = Schedule(
        plate=seed.plate,
        driver_name=seed.driver,
        driver_birth_date=date(1984, 5, 17),
        driver_birth_place="Curitiba",
        driver_birth_state="PR",
        driver_document_type=DriverDocumentType.CPF,
        driver_document=seed.document,
        driver_document_photo_front_path=PLACEHOLDER_PHOTO,
        driver_document_photo_back_path=PLACEHOLDER_PHOTO,
        driver_document_validated=seed.validated,
        driver_document_validation_detail=detail,
        vehicle_document_photo_path=PLACEHOLDER_PHOTO,
        vehicle_brand=seed.brand,
        vehicle_model=seed.model,
        vehicle_year="2021",
        vehicle_chassis=f"9BVAG4X12NE1{index:05d}",
        vehicle_color="Branco",
        vehicle_length_m=16.5,
        vehicle_height_m=4.2,
        vehicle_width_m=2.6,
        origin_location=seed.origin,
        destination_location=seed.destination,
        manifest_photo_path=PLACEHOLDER_PHOTO,
        scheduled_date=today + timedelta(days=seed.day_offset),
        created_by_id=creator.id,
    )
    schedule.cargo_items = [
        CargoItem(product_name=seed.cargo, category=CargoCategory(seed.category))
    ]
    return schedule


def _create_schedules(session: Session, creator: Employee, today: date) -> int:
    session.add_all(
        _build_schedule(seed, index, creator, today)
        for index, seed in enumerate(SCHEDULES)
    )
    session.flush()
    return len(SCHEDULES)


def _create_checkins(
    session: Session, staff: dict[str, Employee], today: date, now: datetime
) -> int:
    fiscal = staff["juliana.reis"]
    created = 0
    for day, slots in (
        (today, TODAY_SLOTS),
        (today - timedelta(days=1), YESTERDAY_SLOTS),
    ):
        for index, (hour, minute, wait) in enumerate(slots):
            moment = _at(day, hour, minute)
            if moment > now - timedelta(minutes=20):
                continue
            refused = day == today and index in REFUSED_INDEXES
            session.add(
                CheckIn(
                    plate=_plate(created + 1),
                    status=CheckInStatus.CANCELLED
                    if refused
                    else CheckInStatus.ADMITTED,
                    created_by_id=fiscal.id,
                    created_at=moment,
                    decided_at=moment + timedelta(minutes=wait),
                )
            )
            created += 1
    session.flush()
    return created


def _create_logs(
    session: Session, staff: dict[str, Employee], today: date, now: datetime
) -> int:
    authors = (staff["juliana.reis"], staff["marcos.vieira"])
    ips = ("187.54.2.11", "187.54.2.19")
    created = 0
    for index, (hour, minute, _) in enumerate(TODAY_SLOTS):
        moment = _at(today, hour, minute)
        if moment > now - timedelta(minutes=20):
            continue
        manual = index % MANUAL_EVERY == MANUAL_REMAINDER
        plate = _plate(index + 1)
        session.add(
            UploadLog(
                employee_id=authors[index % 2].id,
                endpoint=UploadEndpoint.MANUAL if manual else UploadEndpoint.UPLOAD,
                client_ip=ips[index % 2],
                ocr_plate=None if manual else plate,
                ocr_confidence=None if manual else 0.93,
                manual_plate=plate if manual else None,
                final_plate=plate,
                final_plate_format=PlateFormat.MERCOSUL,
                needs_review=manual or index % UNCERTAIN_EVERY == UNCERTAIN_REMAINDER,
                created_at=moment,
            )
        )
        created += 1
    session.flush()
    return created


class WeakPasswordError(ValueError):
    def __init__(self) -> None:
        super().__init__(
            f"A senha precisa ter pelo menos {MIN_PASSWORD_LENGTH} caracteres."
        )


def seed_demo_data(
    session: Session,
    password: str,
    now: datetime | None = None,
    *,
    reset_passwords: bool = False,
) -> SeedReport:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise WeakPasswordError

    moment = (now or datetime.now(UTC)).astimezone(UTC)
    today = moment.astimezone(TIMEZONE).date()
    staff, created, reset = _ensure_staff(
        session, password, moment, reset_passwords=reset_passwords
    )
    data_skipped = _demo_data_exists(session)
    report = SeedReport(
        employees_created=created,
        passwords_reset=reset,
        schedules=0
        if data_skipped
        else _create_schedules(session, staff["carla.mendes"], today),
        checkins=0 if data_skipped else _create_checkins(session, staff, today, moment),
        logs=0 if data_skipped else _create_logs(session, staff, today, moment),
        data_skipped=data_skipped,
    )
    session.commit()
    return report
