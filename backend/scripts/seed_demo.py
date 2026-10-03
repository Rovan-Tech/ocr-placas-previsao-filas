#!/usr/bin/env python

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.services.demo_seed import SeedReport, WeakPasswordError, seed_demo_data

PASSWORD_VARIABLE = "SEED_ADMIN_PASSWORD"  # noqa: S105
RESET_VARIABLE = "SEED_RESET_PASSWORDS"
RESET_CONFIRMATION = "sim"


def describe(report: SeedReport) -> str:
    lines = [
        f"Usuários criados: {report.employees_created}.",
        f"Senhas redefinidas: {report.passwords_reset}.",
    ]
    if report.data_skipped:
        lines.append("Os dados de demonstração já existem: nada foi criado.")
    else:
        lines.append(
            f"Criados {report.schedules} agendamentos, {report.checkins} check-ins "
            f"e {report.logs} logs."
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    password = os.environ.get(PASSWORD_VARIABLE, "")
    if not password:
        sys.stderr.write(f"Defina a variável de ambiente {PASSWORD_VARIABLE}.\n")
        return 2
    reset_passwords = os.environ.get(RESET_VARIABLE) == RESET_CONFIRMATION

    with SessionLocal() as session:
        try:
            report = seed_demo_data(session, password, reset_passwords=reset_passwords)
        except WeakPasswordError as error:
            sys.stderr.write(f"{error}\n")
            return 2

    sys.stdout.write(describe(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
