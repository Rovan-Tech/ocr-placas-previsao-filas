#!/usr/bin/env python3
"""Gate de qualidade único do projeto — fonte de verdade para hooks, pre-commit e CI.

Uso:
    python scripts/quality_gate.py --fast   # formatação + lint + tipos nos arquivos alterados
    python scripts/quality_gate.py --full   # tudo: testes+cobertura, duplicação, código morto,
                                             # auditoria de dependências, E2E

Só biblioteca padrão — orquestra ferramentas externas (ruff, mypy, pytest, npm...) via
subprocess. Precisa do venv do backend criado (`backend/.venv`) e do `node_modules` do frontend
instalado (`npm ci` em `frontend/`) — ver `npm run dev` na raiz, que prepara os dois.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
IS_WINDOWS = sys.platform == "win32"
VENV_BIN = BACKEND / ".venv" / ("Scripts" if IS_WINDOWS else "bin")


class StepResult:
    def __init__(self, name: str, ok: bool, output: str = "") -> None:
        self.name = name
        self.ok = ok
        self.output = output


def _venv_tool(name: str) -> str:
    exe = VENV_BIN / (f"{name}.exe" if IS_WINDOWS else name)
    return str(exe) if exe.exists() else name


def run(
    cmd: list[str], *, cwd: Path = ROOT, name: str | None = None, allow_missing: bool = False
) -> StepResult:
    label = name or " ".join(cmd)
    executable = shutil.which(cmd[0]) if not Path(cmd[0]).is_absolute() else cmd[0]
    if executable is None and not Path(cmd[0]).exists():
        if allow_missing:
            return StepResult(label, True, f"(pulado — {cmd[0]} não encontrado)")
        return StepResult(label, False, f"comando não encontrado: {cmd[0]}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    ok = result.returncode == 0
    output = (result.stdout + result.stderr).strip()
    return StepResult(label, ok, output)


def changed_files(extensions: tuple[str, ...]) -> list[str]:
    """Arquivos alterados/novos em relação a origin/main, mais o que está sujo na working tree."""
    files: set[str] = set()

    base_candidates = ["origin/main", "main"]
    base = None
    for candidate in base_candidates:
        check = subprocess.run(
            ["git", "merge-base", candidate, "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if check.returncode == 0:
            base = check.stdout.strip()
            break

    diff_ranges = [["HEAD"]]
    if base:
        diff_ranges.append([base, "HEAD"])

    for diff_range in diff_ranges:
        result = subprocess.run(
            ["git", "diff", "--name-only", *diff_range],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            files.update(result.stdout.splitlines())

    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True, check=False
    )
    for line in status.stdout.splitlines():
        path = line[3:].strip()
        if path:
            files.add(path)

    return sorted(f for f in files if f.endswith(extensions) and (ROOT / f).exists())


def print_step(result: StepResult, verbose: bool = False) -> None:
    icon = "✅" if result.ok else "❌"
    print(f"{icon} {result.name}", flush=True)
    if not result.ok or verbose:
        for line in result.output.splitlines()[-40:]:
            print(f"    {line}", flush=True)


def run_step(steps: list[StepResult], *args: object, **kwargs: object) -> None:
    result = run(*args, **kwargs)  # type: ignore[arg-type]
    print_step(result)
    steps.append(result)


def fast_gate() -> bool:
    steps: list[StepResult] = []

    py_files = changed_files((".py",))
    py_files = [f for f in py_files if f.startswith("backend/")]
    if py_files:
        rel = [f[len("backend/") :] for f in py_files]
        steps.append(
            run([_venv_tool("ruff"), "format", "--check", *rel], cwd=BACKEND, name="ruff format (backend, arquivos alterados)")
        )
        steps.append(
            run([_venv_tool("ruff"), "check", *rel], cwd=BACKEND, name="ruff check (backend, arquivos alterados)")
        )
        steps.append(run([_venv_tool("mypy"), *rel], cwd=BACKEND, name="mypy (backend, arquivos alterados)"))
    else:
        print("· nenhum .py alterado em backend/ — pulando ruff/mypy")

    ts_files = changed_files((".ts", ".tsx"))
    ts_files = [f for f in ts_files if f.startswith("frontend/")]
    if ts_files:
        rel = [f[len("frontend/") :] for f in ts_files]
        npm = "npm.cmd" if IS_WINDOWS else "npm"
        steps.append(run([npm, "run", "lint"], cwd=FRONTEND, name="oxlint (frontend)"))
        steps.append(run([npm, "run", "typecheck"], cwd=FRONTEND, name="tsc -b (frontend)"))
        steps.append(
            run(
                [npm, "exec", "--", "prettier", "--check", *rel],
                cwd=FRONTEND,
                name="prettier --check (frontend, arquivos alterados)",
                allow_missing=True,
            )
        )
    else:
        print("· nenhum .ts/.tsx alterado em frontend/ — pulando oxlint/tsc/prettier")

    for step in steps:
        print_step(step, verbose=False)
    return all(s.ok for s in steps)


def full_gate() -> bool:
    npm = "npm.cmd" if IS_WINDOWS else "npm"
    steps: list[StepResult] = []

    steps.append(run([_venv_tool("ruff"), "format", "--check", "."], cwd=BACKEND, name="ruff format (backend)"))
    steps.append(run([_venv_tool("ruff"), "check", "."], cwd=BACKEND, name="ruff check (backend)"))
    steps.append(run([_venv_tool("mypy"), "app"], cwd=BACKEND, name="mypy (backend)"))
    steps.append(
        run(
            [
                _venv_tool("pytest"),
                "-m",
                "not ocr_real",
                "--cov=app",
                "--cov-report=term-missing",
                "--cov-report=xml",
            ],
            cwd=BACKEND,
            name="pytest + cobertura (backend, sem ocr_real)",
        )
    )
    steps.append(
        run(
            [
                _venv_tool("diff-cover"),
                "coverage.xml",
                "--compare-branch=origin/main",
                "--fail-under=90",
            ],
            cwd=BACKEND,
            name="diff-cover (cobertura do diff ≥ 90%, backend)",
            allow_missing=True,
        )
    )
    steps.append(
        run([_venv_tool("vulture"), "app", "--min-confidence", "80"], cwd=BACKEND, name="vulture (código morto, backend)")
    )
    steps.append(run([_venv_tool("bandit"), "-r", "app", "-q"], cwd=BACKEND, name="bandit (segurança estática, backend)"))
    steps.append(
        run([_venv_tool("pip-audit"), "-r", "requirements.txt"], cwd=BACKEND, name="pip-audit (dependências, backend)")
    )

    steps.append(run([npm, "run", "lint"], cwd=FRONTEND, name="oxlint (frontend)"))
    steps.append(run([npm, "run", "format:check"], cwd=FRONTEND, name="prettier --check (frontend)", allow_missing=True))
    steps.append(run([npm, "run", "typecheck"], cwd=FRONTEND, name="tsc -b (frontend)"))
    steps.append(run([npm, "run", "test", "--", "--coverage"], cwd=FRONTEND, name="vitest + cobertura (frontend)"))
    steps.append(run([npm, "run", "build"], cwd=FRONTEND, name="build (tsc + vite, frontend)"))
    steps.append(run([npm, "run", "test:e2e"], cwd=FRONTEND, name="playwright (e2e, frontend)"))
    steps.append(run([npm, "audit", "--audit-level=high"], cwd=FRONTEND, name="npm audit (frontend)"))

    steps.append(
        run(
            ["npx", "--yes", "jscpd", "backend/app", "frontend/src", "--threshold", "1"],
            cwd=ROOT,
            name="jscpd (duplicação, backend+frontend)",
            allow_missing=True,
        )
    )

    for step in steps:
        print_step(step, verbose=False)
    return all(s.ok for s in steps)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--fast", action="store_true", help="formatação + lint + tipos, arquivos alterados")
    mode.add_argument("--full", action="store_true", help="gate completo (testes, cobertura, E2E, auditoria)")
    args = parser.parse_args()

    print(f"=== Gate de qualidade ({'fast' if args.fast else 'full'}) ===\n")
    ok = fast_gate() if args.fast else full_gate()
    print()
    print("✅ Gate passou." if ok else "❌ Gate falhou — corrija os itens acima antes de prosseguir.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
