#!/usr/bin/env python3
"""PreToolUse (Read|Edit|Write) — protege .env/segredo, pede confirmação antes de mexer em
config de qualidade ou em .claude/, e bloqueia escrita em .claude/state|reports (só hook grava lá).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import ask, deny, project_dir, read_stdin_json  # noqa: E402

SECRET_PATTERNS = (
    re.compile(r"(^|/)\.env(\..+)?$"),
    re.compile(r"(^|/)\.env\.example$"),  # placeholder — removido do bloqueio abaixo
    re.compile(r"\.pem$"),
    re.compile(r"\.key$"),
    re.compile(r"(^|/)id_rsa(\.\w+)?$"),
    re.compile(r"(^|/)credentials\.json$"),
    re.compile(r"(^|/)secrets?\.(ya?ml|json|toml)$"),
)

ALLOWED_ENV_FILES = {".env.example"}

QUALITY_CONFIG_PATTERNS = (
    re.compile(r"(^|/)backend/pyproject\.toml$"),
    re.compile(r"(^|/)\.pre-commit-config\.ya?ml$"),
    re.compile(r"(^|/)\.github/workflows/.*\.ya?ml$"),
    re.compile(r"(^|/)frontend/\.oxlintrc\.json$"),
    re.compile(r"(^|/)frontend/\.prettierrc.*$"),
)


def rel_path(file_path: str, root: Path) -> str:
    try:
        return str(Path(file_path).resolve().relative_to(root.resolve()))
    except ValueError:
        return file_path


def main() -> int:
    data = read_stdin_json()
    tool_name = data.get("tool_name")
    if tool_name not in ("Read", "Edit", "Write"):
        return 0

    file_path = data.get("tool_input", {}).get("file_path", "")
    if not file_path:
        return 0

    root = project_dir()
    rel = rel_path(file_path, root).replace("\\", "/")
    name = Path(rel).name

    if name not in ALLOWED_ENV_FILES:
        for pattern in SECRET_PATTERNS:
            if pattern.search(rel) or pattern.search(name):
                deny(f"'{rel}' parece segredo/credencial — leitura e escrita bloqueadas pelo hook de proteção")
                return 0

    if tool_name in ("Edit", "Write"):
        if re.search(r"(^|/)\.claude/(state|reports)/", rel):
            deny("só os hooks escrevem em .claude/state/ e .claude/reports/ — peça ao usuário se precisar mudar algo lá")
            return 0

        if re.match(r"^\.claude/", rel):
            ask(f"'{rel}' é config do Claude Code neste projeto — confirme antes de alterar (evita afrouxar o gate sem querer)")
            return 0

        for pattern in QUALITY_CONFIG_PATTERNS:
            if pattern.search(rel):
                ask(f"'{rel}' contém configuração de qualidade — confirme antes de alterar")
                return 0

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        sys.stderr.write(f"guard_files.py: erro interno, permitindo a ação: {exc}\n")
        sys.exit(0)
