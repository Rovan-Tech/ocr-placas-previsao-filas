from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Employee
from app.services.auth import (
    authenticate_employee,
    create_access_token,
    get_current_employee,
    hash_password,
    password_is_expired,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LENGTH = 8


class EmployeeOut(BaseModel):
    id: int
    username: str
    full_name: str
    is_admin: bool = False
    # False depois de excluído (ver DELETE /auth/employees/{id}) — o cadastro em si nunca é
    # apagado do banco, só desativado, pra não perder o "quem enviou cada foto" já registrado
    # (UploadLog referencia o funcionário; ver o modelo em app/models/employee.py).
    active: bool = True


def _to_employee_out(employee: Employee) -> EmployeeOut:
    return EmployeeOut(
        id=employee.id,
        username=employee.username,
        full_name=employee.full_name,
        is_admin=employee.is_admin,
        active=employee.active,
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    employee: EmployeeOut
    # True logo após o cadastro (senha temporária) ou quando os 30 dias da senha vencem — o
    # frontend deve levar direto pra tela de trocar senha; o token só serve pra isso enquanto
    # esse campo for true (ver get_current_employee em app/services/auth.py).
    must_change_password: bool


def _require_admin(employee: Employee = Depends(get_current_employee)) -> Employee:
    if not employee.is_admin:
        raise HTTPException(status_code=403, detail="Só o admin master pode gerenciar funcionários.")
    return employee


def _check_password_length(password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"A senha precisa ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.")
    return password


def _get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Funcionário não encontrado.")
    return employee


class CreateEmployeeRequest(BaseModel):
    username: str
    full_name: str
    temporary_password: str
    is_admin: bool = False

    @field_validator("temporary_password")
    @classmethod
    def _validate_temporary_password(cls, value: str) -> str:
        return _check_password_length(value)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _validate_new_password(cls, value: str) -> str:
        return _check_password_length(value)


@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> TokenResponse:
    """Usuário e senha de um funcionário cadastrado — form-urlencoded (padrão OAuth2 do FastAPI,
    ``username``/``password``), não JSON. Devolve o token que identifica quem faz cada chamada
    de OCR/digitação manual daqui pra frente (ver UploadLog e ``Authorization: Bearer <token>``)."""
    employee = authenticate_employee(db, form.username, form.password)
    return TokenResponse(
        access_token=create_access_token(employee),
        employee=_to_employee_out(employee),
        must_change_password=employee.must_change_password or password_is_expired(employee),
    )


@router.get("/me", response_model=EmployeeOut)
def read_current_employee(employee: Employee = Depends(get_current_employee)) -> EmployeeOut:
    """Quem está logado com o token enviado — o frontend usa pra saber se a sessão ainda vale."""
    return _to_employee_out(employee)


@router.post("/change-password", response_model=EmployeeOut)
def change_password(
    payload: ChangePasswordRequest,
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> EmployeeOut:
    """Troca a senha — obrigatória no primeiro acesso (senha temporária do admin) e a cada 30
    dias. É o único endpoint que uma sessão com troca pendente pode chamar."""
    if not verify_password(payload.current_password, employee.password_hash):
        raise HTTPException(status_code=401, detail="Senha atual incorreta.")

    employee.password_hash = hash_password(payload.new_password)
    employee.must_change_password = False
    employee.password_set_at = datetime.now(UTC)
    db.commit()
    return _to_employee_out(employee)


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(db: Session = Depends(get_db), _admin: Employee = Depends(_require_admin)) -> list[EmployeeOut]:
    """Todos os funcionários cadastrados, ativos ou não — só o admin master vê essa lista, pra
    decidir quem cadastrar ou excluir."""
    employees = db.query(Employee).order_by(Employee.full_name).all()
    return [_to_employee_out(employee) for employee in employees]


@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(
    payload: CreateEmployeeRequest,
    db: Session = Depends(get_db),
    _admin: Employee = Depends(_require_admin),
) -> EmployeeOut:
    """Cadastra um funcionário com uma senha temporária — só o admin master pode fazer isso (ver
    scripts/create_employee.py pra criar o primeiro admin, antes de existir qualquer login).
    No primeiro acesso, o próprio funcionário troca essa senha temporária pela definitiva."""
    if db.query(Employee).filter(Employee.username == payload.username).first() is not None:
        raise HTTPException(status_code=409, detail="Já existe um funcionário com esse usuário.")

    employee = Employee(
        username=payload.username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.temporary_password),
        is_admin=payload.is_admin,
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
    admin: Employee = Depends(_require_admin),
) -> EmployeeOut:
    """Desliga o acesso de um funcionário (saiu da empresa) — só o admin master pode.

    Não apaga a linha do banco: só marca ``active=False``, porque o histórico de
    ``UploadLog`` (quem enviou cada foto) precisa continuar existindo mesmo depois de alguém
    sair. Com a conta desativada, qualquer token que essa pessoa já tinha para de funcionar no
    próximo request (ver ``get_current_employee``), e um novo login é recusado.

    Não há uma checagem separada de "não pode ser o último admin": dado que só um admin ativo
    chega até aqui (``_require_admin``) e não pode excluir a própria conta (checagem abaixo), o
    próprio chamador sempre continua sendo um admin ativo depois da chamada — não tem como esse
    endpoint, sozinho, zerar os admins ativos do sistema.
    """
    target = _get_employee_or_404(db, employee_id)

    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Você não pode excluir a própria conta.")

    target.active = False
    db.commit()
    return _to_employee_out(target)
