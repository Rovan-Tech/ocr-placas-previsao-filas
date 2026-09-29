#!/usr/bin/env python3
"""PostToolUse (Edit|Write) — formata/linta o arquivo tocado na hora e escaneia anti-gambiarra.

Backend (.py): `ruff format` + `ruff check --fix` no arquivo, depois `mypy` só nele; erro que
sobrar volta para o Claude via `decision: block` (o arquivo já foi salvo — isto só devolve
feedback, não desfaz a escrita).
Frontend (.ts/.tsx/.css): oxlint no arquivo; cor/fonte fora dos tokens em .tsx/.css vira aviso.
Qualquer arquivo de código: escaneia diretiva usada para calar ferramenta sem motivo, `print(`
solto, `except: pass`, `breakpoint()` e string com cara de segredo.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import block, project_dir, read_stdin_json  # noqa: E402

IS_WINDOWS = sys.platform == "win32"


def venv_tool(root: Path, name: str) -> str:
    exe = root / "backend" / ".venv" / ("Scripts" if IS_WINDOWS else "bin") / (f"{name}.exe" if IS_WINDOWS else name)
    return str(exe) if exe.exists() else name


def run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    try:
        result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 0, f"(pulado: {exc})"
    return result.returncode, (result.stdout + result.stderr).strip()


ANTI_GAMBIARRA_CHECKS = [
    (re.compile(r"#\s*type:\s*ignore(?!\[)"), "`# type: ignore` sem código de erro entre colchetes (ex.: `# type: ignore[arg-type]`)"),
    (re.compile(r"#\s*noqa(?!:)"), "`# noqa` sem o código específico da regra (ex.: `# noqa: E501`)"),
    (re.compile(r"@pytest\.mark\.(skip|xfail)\b"), "teste marcado como skip/xfail — precisa de motivo forte e visível no relatório, não silencioso"),
    (re.compile(r"\bexcept\s*:\s*\n?\s*pass\b"), "`except: pass` engole qualquer exceção — capture o tipo específico e trate/logue"),
    (re.compile(r"\bexcept\s+Exception\s*:\s*\n?\s*pass\b"), "`except Exception: pass` engole erro real — capture a exceção específica"),
    (re.compile(r"\bbreakpoint\(\)"), "`breakpoint()` esquecido no código"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "string com cara de access key da AWS"),
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"), "string com cara de API key (padrão `sk-...`)"),
    (re.compile(r"-----BEGIN (RSA |EC )?PRIVATE KEY-----"), "chave privada aparente no código"),
]


def scan_anti_gambiarra(content: str, is_python: bool) -> list[str]:
    findings = [msg for pattern, msg in ANTI_GAMBIARRA_CHECKS if pattern.search(content)]
    if is_python and re.search(r"(?<![\w.])print\(", content):
        findings.append("`print(` no backend — use o módulo `logging` (ver .claude/rules/python.md)")
    return findings


def scan_offtoken_css(content: str) -> list[str]:
    findings = []
    if re.search(r"#[0-9a-fA-F]{3,8}\b", content) or re.search(r"\brgba?\(|\bhsla?\(", content):
        findings.append("cor solta (hex/rgb/hsl) fora de index.css — use var(--token), ver .claude/rules/design-system.md")
    return findings


def main() -> int:
    data = read_stdin_json()
    if data.get("tool_name") not in ("Edit", "Write"):
        return 0

    file_path = data.get("tool_input", {}).get("file_path")
    if not file_path:
        return 0
    path = Path(file_path)
    if not path.is_file():
        return 0

    root = project_dir()
    try:
        rel = path.resolve().relative_to(root.resolve())
    except ValueError:
        rel = path

    messages: list[str] = []
    is_python = path.suffix == ".py"
    # backend/scripts/ e o scripts/ da raiz são CLI — print() ali é a interface com o operador,
    # não um vazamento de log de aplicação (ver backend/scripts/create_employee.py, já assim).
    is_app_python = is_python and str(rel).replace("\\", "/").startswith("backend/app/")

    if is_python and str(rel).startswith("backend"):
        backend = root / "backend"
        rel_in_backend = path.resolve().relative_to(backend.resolve())
        run([venv_tool(root, "ruff"), "format", str(rel_in_backend)], backend)
        _, check_out = run([venv_tool(root, "ruff"), "check", "--fix", str(rel_in_backend)], backend)
        if check_out and "All checks passed" not in check_out and "no issues" not in check_out.lower():
            messages.append(f"ruff check ainda com pendência:\n{check_out}")
        code, mypy_out = run([venv_tool(root, "mypy"), str(rel_in_backend)], backend)
        if code != 0:
            messages.append(f"mypy encontrou problema:\n{mypy_out}")

    elif path.suffix in (".ts", ".tsx"):
        frontend = root / "frontend"
        try:
            rel_in_frontend = path.resolve().relative_to(frontend.resolve())
            npm = "npm.cmd" if IS_WINDOWS else "npm"
            code, out = run([npm, "exec", "--", "oxlint", str(rel_in_frontend)], frontend)
            if code != 0:
                messages.append(f"oxlint encontrou problema:\n{out}")
        except ValueError:
            pass

    rel_str = str(rel).replace("\\", "/")
    is_meta_tooling = rel_str.startswith(".claude/") or rel_str.startswith("scripts/")
    if not is_meta_tooling:
        content = path.read_text(encoding="utf-8", errors="ignore")
        messages.extend(f"anti-gambiarra: {m}" for m in scan_anti_gambiarra(content, is_app_python))
        if path.suffix in (".tsx", ".css"):
            messages.extend(f"design-system: {m}" for m in scan_offtoken_css(content))

    if messages:
        block("\n\n".join(messages))

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        sys.stderr.write(f"post_edit_quality.py: erro interno, ignorando: {exc}\n")
        sys.exit(0)
