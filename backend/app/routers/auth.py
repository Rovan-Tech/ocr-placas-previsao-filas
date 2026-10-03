from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Employee, Role, SystemRole
from app.routers.employee_schemas import EmployeeOut, to_employee_out
from app.routers.responses import (
    BAD_REQUEST,
    CONFLICT,
    INVALID_CREDENTIALS,
    NOT_FOUND,
    UNPROCESSABLE,
    VALIDATION_ERROR_CONTENT,
)
from app.services.auth import (
    authenticate_employee,
    create_access_token,
    get_current_employee,
    hash_password,
    password_is_expired,
    require_employees_create,
    require_employees_deactivate,
    require_employees_view,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LENGTH = 8


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    employee: EmployeeOut
    must_change_password: bool


def _require_min_password_length(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"A senha precisa ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.",
        )


def get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Funcionário não encontrado.")
    return employee


def _resolve_role(db: Session, role_id: int | None) -> Role:
    if role_id is None:
        role = db.query(Role).filter(Role.key == SystemRole.FISCAL).first()
    else:
        role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=422, detail="Cargo não encontrado.")
    return role


class CreateEmployeeRequest(BaseModel):
    username: str
    full_name: str
    temporary_password: str
    role_id: int | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    employee = authenticate_employee(db, form.username, form.password)
    return TokenResponse(
        access_token=create_access_token(employee),
        employee=to_employee_out(employee),
        must_change_password=employee.must_change_password
        or password_is_expired(employee),
    )


@router.get("/me")
def read_current_employee(
    employee: Annotated[Employee, Depends(get_current_employee)],
) -> EmployeeOut:
    return to_employee_out(employee)


@router.post(
    "/change-password",
    responses={
        401: {"description": INVALID_CREDENTIALS},
        422: {"description": UNPROCESSABLE, "content": VALIDATION_ERROR_CONTENT},
    },
)
def change_password(
    payload: ChangePasswordRequest,
    employee: Annotated[Employee, Depends(get_current_employee)],
    db: Annotated[Session, Depends(get_db)],
) -> EmployeeOut:
    if not verify_password(payload.current_password, employee.password_hash):
        raise HTTPException(status_code=401, detail="Senha atual incorreta.")
    _require_min_password_length(payload.new_password)

    employee.password_hash = hash_password(payload.new_password)
    employee.must_change_password = False
    employee.password_set_at = datetime.now(UTC)
    db.commit()
    return to_employee_out(employee)


@router.get("/employees")
def list_employees(
    db: Annotated[Session, Depends(get_db)],
    _viewer: Annotated[Employee, Depends(require_employees_view)],
) -> list[EmployeeOut]:
    employees = db.query(Employee).order_by(Employee.full_name).all()
    return [to_employee_out(employee) for employee in employees]


@router.post(
    "/employees",
    status_code=201,
    responses={
        409: {"description": CONFLICT},
        422: {"description": UNPROCESSABLE, "content": VALIDATION_ERROR_CONTENT},
    },
)
def create_employee(
    payload: CreateEmployeeRequest,
    db: Annotated[Session, Depends(get_db)],
    _creator: Annotated[Employee, Depends(require_employees_create)],
) -> EmployeeOut:
    if (
        db.query(Employee).filter(Employee.username == payload.username).first()
        is not None
    ):
        raise HTTPException(
            status_code=409, detail="Já existe um funcionário com esse usuário."
        )
    _require_min_password_length(payload.temporary_password)
    role = _resolve_role(db, payload.role_id)

    employee = Employee(
        username=payload.username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.temporary_password),
        role=role,
        must_change_password=True,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return to_employee_out(employee)


@router.delete(
    "/employees/{employee_id}",
    responses={
        400: {"description": BAD_REQUEST},
        404: {"description": NOT_FOUND},
    },
)
def deactivate_employee(
    employee_id: int,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[Employee, Depends(require_employees_deactivate)],
) -> EmployeeOut:
    target = get_employee_or_404(db, employee_id)

    if target.id == admin.id:
        raise HTTPException(
            status_code=400, detail="Você não pode excluir a própria conta."
        )

    target.active = False
    db.commit()
    return to_employee_out(target)
