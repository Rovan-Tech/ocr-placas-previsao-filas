#!/usr/bin/env python

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.services.demo_seed import WeakPasswordError, seed_demo_data

PASSWORD_VARIABLE = "SEED_ADMIN_PASSWORD"  # noqa: S105 - nome da variável, não a senha


def main() -> int:
    password = os.environ.get(PASSWORD_VARIABLE, "")
    if not password:
        sys.stderr.write(f"Defina a variável de ambiente {PASSWORD_VARIABLE}.\n")
        return 2

    with SessionLocal() as session:
        try:
            report = seed_demo_data(session, password)
        except WeakPasswordError as error:
            sys.stderr.write(f"{error}\n")
            return 2

    if report.skipped:
        sys.stdout.write("Os dados de demonstração já existem. Nada foi alterado.\n")
        return 0
    sys.stdout.write(
        f"Criados: {report.employees} funcionários, {report.schedules} agendamentos, "
        f"{report.checkins} check-ins e {report.logs} logs.\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
