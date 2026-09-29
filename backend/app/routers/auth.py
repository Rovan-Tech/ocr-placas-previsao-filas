from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Employee, Role
from app.services.auth import (
    authenticate_employee,
    create_access_token,
    get_current_employee,
    hash_password,
    password_is_expired,
    require_admin,
    verify_password,
)
from app.services.permissions import ROLE_ACCESS, Access, Screen

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LENGTH = 8


class EmployeeOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: Role = Role.FISCAL
    permissions: dict[Screen, Access] = {}
    is_admin: bool = False
    active: bool = True


def _to_employee_out(employee: Employee) -> EmployeeOut:
    return EmployeeOut(
        id=employee.id,
        username=employee.username,
        full_name=employee.full_name,
        role=employee.role,
        permissions=ROLE_ACCESS[employee.role],
        is_admin=employee.is_admin,
        active=employee.active,
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 - tipo do token OAuth2, não é senha
    employee: EmployeeOut
    must_change_password: bool


def _require_min_password_length(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"A senha precisa ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.",
        )


def _get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Funcionário não encontrado.")
    return employee


class CreateEmployeeRequest(BaseModel):
    username: str
    full_name: str
    temporary_password: str
    role: Role | None = None
    is_admin: bool = False


class ChangeRoleRequest(BaseModel):
    role: Role


class PermissionsOut(BaseModel):
    roles: dict[Role, dict[Screen, Access]]


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login", response_model=TokenResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> TokenResponse:
    employee = authenticate_employee(db, form.username, form.password)
    return TokenResponse(
        access_token=create_access_token(employee),
        employee=_to_employee_out(employee),
        must_change_password=employee.must_change_password
        or password_is_expired(employee),
    )


@router.get("/me", response_model=EmployeeOut)
def read_current_employee(
    employee: Employee = Depends(get_current_employee),
) -> EmployeeOut:
    return _to_employee_out(employee)


@router.post("/change-password", response_model=EmployeeOut)
def change_password(
    payload: ChangePasswordRequest,
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> EmployeeOut:
    if not verify_password(payload.current_password, employee.password_hash):
        raise HTTPException(status_code=401, detail="Senha atual incorreta.")
    _require_min_password_length(payload.new_password)

    employee.password_hash = hash_password(payload.new_password)
    employee.must_change_password = False
    employee.password_set_at = datetime.now(UTC)
    db.commit()
    return _to_employee_out(employee)


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(
    db: Session = Depends(get_db), _admin: Employee = Depends(require_admin)
) -> list[EmployeeOut]:
    employees = db.query(Employee).order_by(Employee.full_name).all()
    return [_to_employee_out(employee) for employee in employees]


@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(
    payload: CreateEmployeeRequest,
    db: Session = Depends(get_db),
    _admin: Employee = Depends(require_admin),
) -> EmployeeOut:
    if (
        db.query(Employee).filter(Employee.username == payload.username).first()
        is not None
    ):
        raise HTTPException(
            status_code=409, detail="Já existe um funcionário com esse usuário."
        )
    _require_min_password_length(payload.temporary_password)

    employee = Employee(
        username=payload.username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.temporary_password),
        role=payload.role or (Role.ADMIN if payload.is_admin else Role.FISCAL),
        must_change_password=True,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return _to_employee_out(employee)


@router.delete("/employees/{employee_id}", response_model=EmployeeOut)
def deactivate_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_admin),
) -> EmployeeOut:
    target = _get_employee_or_404(db, employee_id)

    if target.id == admin.id:
        raise HTTPException(
            status_code=400, detail="Você não pode excluir a própria conta."
        )

    target.active = False
    db.commit()
    return _to_employee_out(target)


@router.patch("/employees/{employee_id}/role", response_model=EmployeeOut)
def change_employee_role(
    employee_id: int,
    payload: ChangeRoleRequest,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_admin),
) -> EmployeeOut:
    target = _get_employee_or_404(db, employee_id)

    if target.id == admin.id:
        raise HTTPException(
            status_code=400, detail="Você não pode mudar o próprio cargo."
        )

    target.role = payload.role
    db.commit()
    return _to_employee_out(target)


@router.get("/permissions", response_model=PermissionsOut)
def read_permissions(_admin: Employee = Depends(require_admin)) -> PermissionsOut:
    return PermissionsOut(roles=ROLE_ACCESS)
