#!/usr/bin/env python
"""Cadastra o primeiro admin master — depois disso, o cadastro dos demais funcionários é feito
por ele mesmo, logado, em POST /auth/employees (ver app/routers/auth.py).

Não existe endpoint de auto-cadastro de propósito: qualquer pessoa poder criar um login próprio
tornaria inútil saber "quem enviou cada foto" (ver UploadLog e backend/CLAUDE.md). O primeiro
admin, por sua vez, não tem ninguém que já esteja logado pra cadastrá-lo — daí este script,
rodado direto no servidor por quem administra o sistema.

Uso (a partir de backend/, com o venv ativado e o PostgreSQL no ar):

    python scripts/create_employee.py --username admin --full-name "Fulano" --admin

Sem --password, pede a senha de forma interativa (não fica no histórico do terminal). A senha
criada aqui é tratada como temporária, igual a qualquer cadastro feito pelo admin: no primeiro
login, o próprio dono da conta é obrigado a trocá-la (ver Employee.must_change_password).
"""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal  # noqa: E402
from app.models import Employee  # noqa: E402
from app.services.auth import hash_password  # noqa: E402

MIN_PASSWORD_LENGTH = 8


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", required=True, help="login do funcionário (único)")
    parser.add_argument("--full-name", required=True, help="nome completo, pra aparecer nos logs")
    parser.add_argument("--password", help="senha temporária; se não passar, pede de forma interativa")
    parser.add_argument("--admin", action="store_true", help="cadastra como admin master (pode cadastrar outros)")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Senha temporária: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        parser.error(f"a senha precisa ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.")

    with SessionLocal() as session:
        if session.query(Employee).filter(Employee.username == args.username).first() is not None:
            parser.error(f"já existe um funcionário com o usuário {args.username!r}.")

        employee = Employee(
            username=args.username,
            full_name=args.full_name,
            password_hash=hash_password(password),
            is_admin=args.admin,
            must_change_password=True,
        )
        session.add(employee)
        session.commit()
        session.refresh(employee)
        role = "admin master" if employee.is_admin else "funcionário"
        print(f"{role.capitalize()} criado: id={employee.id} username={employee.username!r}")
        print("Senha temporária — precisa ser trocada no primeiro login (POST /auth/change-password).")


if __name__ == "__main__":
    main()
