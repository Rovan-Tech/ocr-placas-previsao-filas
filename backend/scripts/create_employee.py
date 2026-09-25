#!/usr/bin/env python

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
