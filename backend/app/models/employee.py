from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Employee(Base):
    """Fiscal cadastrado para usar o sistema. Login com usuário e senha (ver app/services/auth.py)
    identifica quem enviou cada foto (ver UploadLog).

    Cadastro é feito só pelo admin master (``is_admin``) — ver POST /auth/employees. O admin
    define usuário + uma senha temporária; no primeiro acesso (ou quando a senha completa 30
    dias, ver ``password_is_expired`` em app/services/auth.py), o próprio funcionário é obrigado
    a trocar por uma senha definitiva antes de usar o resto do sistema.
    """

    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    # Hash bcrypt — a senha em texto puro nunca é guardada nem loga (ver app/services/auth.py).
    password_hash: Mapped[str] = mapped_column(String(60))
    full_name: Mapped[str] = mapped_column(String(120))
    # Admin master: só quem tem is_admin=True pode cadastrar outros funcionários.
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Força a troca de senha antes de liberar o resto do sistema — no primeiro acesso (senha
    # temporária dada pelo admin) e sempre que os 30 dias da senha atual vencerem.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    password_set_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Desativa o acesso sem apagar o histórico de logs já associado ao funcionário.
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"Employee(id={self.id!r}, username={self.username!r})"
