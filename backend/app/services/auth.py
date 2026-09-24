"""Login de funcionário (usuário e senha) e o token que identifica quem faz cada chamada.

Sem isso, /ocr/upload e /ocr/manual não sabem quem enviou a foto — o que o projeto agora exige
(ver UploadLog). O token é um JWT: o servidor não guarda sessão nenhuma, só confere a assinatura.

Cadastro é só do admin master (ver app/routers/auth.py, POST /auth/employees), com uma senha
temporária. No primeiro acesso — e de novo a cada 30 dias — o funcionário é obrigado a trocar de
senha (`must_change_password`/`password_is_expired`) antes de usar qualquer outro endpoint.
"""

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Employee

# tokenUrl é só o que aparece na doc do Swagger (Authorize); a rota de verdade é POST /auth/login.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

PASSWORD_MAX_AGE = timedelta(days=30)
# Único endpoint que uma sessão com troca de senha pendente pode chamar (é um caminho de URL,
# não uma senha — bandit confunde a string por causa do nome).
CHANGE_PASSWORD_PATH = "/auth/change-password"  # nosec B105

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
        # Hash corrompido/formato inesperado — trata como senha errada, não como erro 500.
        return False


def password_is_expired(employee: Employee) -> bool:
    password_set_at = employee.password_set_at
    if password_set_at.tzinfo is None:  # sqlite/testes podem devolver sem timezone
        password_set_at = password_set_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - password_set_at > PASSWORD_MAX_AGE


def password_change_required_error(employee: Employee) -> HTTPException:
    reason = "expired" if password_is_expired(employee) and not employee.must_change_password else "first_access"
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
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(employee.id), "username": employee.username, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def authenticate_employee(db: Session, username: str, password: str) -> Employee:
    """Confere usuário/senha. Levanta 401 tanto pro usuário inexistente quanto pra senha errada —
    nunca revela qual dos dois estava errado (evita confirmar pra um invasor que um usuário existe)."""
    employee = db.query(Employee).filter(Employee.username == username).first()
    if employee is None or not employee.active or not verify_password(password, employee.password_hash):
        raise CREDENTIALS_ERROR
    return employee


def get_current_employee(
    request: Request, token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Employee:
    """Dependência do FastAPI: exige `Authorization: Bearer <token>` válido num funcionário ativo.

    Com troca de senha pendente (primeiro acesso ou senha vencida), só deixa passar pra
    `POST /auth/change-password` — qualquer outro endpoint responde 403 até a troca ser feita.
    """
    if token is None:
        raise TOKEN_ERROR
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
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
    """Endereço de quem conectou no servidor. Sem proxy reverso na frente (não há um configurado
    neste projeto), é o endereço de verdade da máquina/celular do fiscal."""
    return request.client.host if request.client else None
