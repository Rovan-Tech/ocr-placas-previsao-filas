#!/usr/bin/env python

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import Employee, Role
from app.services.auth import hash_password

MIN_PASSWORD_LENGTH = 8


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--username", required=True, help="login do funcionário (único)"
    )
    parser.add_argument(
        "--full-name", required=True, help="nome completo, pra aparecer nos logs"
    )
    parser.add_argument(
        "--password", help="senha temporária; se não passar, pede de forma interativa"
    )
    parser.add_argument(
        "--role",
        choices=[role.value for role in Role],
        default=Role.FISCAL.value,
        help="cargo do funcionário (padrão: fiscal)",
    )
    parser.add_argument(
        "--admin",
        action="store_true",
        help="atalho para --role admin (pode cadastrar outros)",
    )
    args = parser.parse_args()

    password = args.password or getpass.getpass("Senha temporária: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        parser.error(
            f"a senha precisa ter pelo menos {MIN_PASSWORD_LENGTH} caracteres."
        )

    with SessionLocal() as session:
        if (
            session.query(Employee).filter(Employee.username == args.username).first()
            is not None
        ):
            parser.error(f"já existe um funcionário com o usuário {args.username!r}.")

        employee = Employee(
            username=args.username,
            full_name=args.full_name,
            password_hash=hash_password(password),
            role=Role.ADMIN if args.admin else Role(args.role),
            must_change_password=True,
        )
        session.add(employee)
        session.commit()
        session.refresh(employee)
        sys.stdout.write(
            f"Funcionário criado ({employee.role.value}): id={employee.id} "
            f"username={employee.username!r}\n"
        )
        sys.stdout.write(
            "Senha temporária — precisa ser trocada no primeiro login "
            "(POST /auth/change-password).\n"
        )


if __name__ == "__main__":
    main()
