from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Employee
from app.services.permissions import Permission, can

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

PASSWORD_MAX_AGE = timedelta(days=30)
CHANGE_PASSWORD_PATH = "/auth/change-password"  # nosec B105  # noqa: S105

CREDENTIALS_ERROR = HTTPException(status_code=401, detail="Usuário ou senha inválidos.")
TOKEN_ERROR = HTTPException(
    status_code=401,
    detail="Sessão inválida ou expirada. Faça login de novo.",
    headers={"WWW-Authenticate": "Bearer"},
)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False


def password_is_expired(employee: Employee) -> bool:
    password_set_at = employee.password_set_at
    if password_set_at.tzinfo is None:
        password_set_at = password_set_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - password_set_at > PASSWORD_MAX_AGE


def password_change_required_error(employee: Employee) -> HTTPException:
    reason = (
        "expired"
        if password_is_expired(employee) and not employee.must_change_password
        else "first_access"
    )
    return HTTPException(
        status_code=403,
        detail={
            "code": "password_change_required",
            "reason": reason,
            "message": (
                "A senha temporária precisa ser trocada antes de continuar."
                if reason == "first_access"
                else "A senha completou 30 dias e precisa ser trocada."
            ),
        },
    )


def create_access_token(employee: Employee) -> str:
    expires_at = datetime.now(UTC) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": str(employee.id),
        "username": employee.username,
        "exp": expires_at,
    }
    return jwt.encode(
        payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def authenticate_employee(db: Session, username: str, password: str) -> Employee:
    employee = db.query(Employee).filter(Employee.username == username).first()
    if (
        employee is None
        or not employee.active
        or not verify_password(password, employee.password_hash)
    ):
        raise CREDENTIALS_ERROR
    return employee


def get_current_employee(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Employee:
    if token is None:
        raise TOKEN_ERROR
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        employee_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError) as error:
        raise TOKEN_ERROR from error

    employee = db.get(Employee, employee_id)
    if employee is None or not employee.active:
        raise TOKEN_ERROR

    if request.url.path != CHANGE_PASSWORD_PATH and (
        employee.must_change_password or password_is_expired(employee)
    ):
        raise password_change_required_error(employee)

    return employee


def get_client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def ensure_permission(employee: Employee, permission: Permission) -> None:
    if not can(employee, permission):
        raise HTTPException(
            status_code=403, detail="Seu cargo não tem acesso a esta função."
        )


def require_permission(*any_of: Permission) -> Callable[..., Employee]:
    def dependency(employee: Employee = Depends(get_current_employee)) -> Employee:
        if not any(can(employee, permission) for permission in any_of):
            raise HTTPException(
                status_code=403, detail="Seu cargo não tem acesso a esta função."
            )
        return employee

    return dependency


require_read_plate = require_permission(Permission.CAPTURE_READ_PLATE)
require_checkins_view = require_permission(
    Permission.CHECKINS_VIEW, Permission.REPORTS_VIEW
)
require_logs_view = require_permission(Permission.LOGS_VIEW, Permission.REPORTS_VIEW)
require_schedules_view = require_permission(Permission.SCHEDULES_VIEW)
require_schedules_create = require_permission(Permission.SCHEDULES_CREATE)
require_employees_view = require_permission(Permission.EMPLOYEES_VIEW)
require_employees_create = require_permission(Permission.EMPLOYEES_CREATE)
require_employees_deactivate = require_permission(Permission.EMPLOYEES_DEACTIVATE)
require_employees_set_role = require_permission(Permission.EMPLOYEES_SET_ROLE)
require_permissions_manage = require_permission(Permission.PERMISSIONS_MANAGE)
