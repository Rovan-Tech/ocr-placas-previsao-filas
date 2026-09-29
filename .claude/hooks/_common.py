"""Utilidades compartilhadas pelos hooks deste repositório. Só biblioteca padrão."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


def project_dir() -> Path:
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parent.parent.parent


def state_dir() -> Path:
    d = project_dir() / ".claude" / "state"
    d.mkdir(parents=True, exist_ok=True)
    return d


def reports_dir() -> Path:
    d = project_dir() / ".claude" / "reports"
    d.mkdir(parents=True, exist_ok=True)
    return d


def read_stdin_json() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))


def deny(reason: str, event: str = "PreToolUse") -> None:
    emit(
        {
            "hookSpecificOutput": {
                "hookEventName": event,
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        }
    )


def ask(reason: str, event: str = "PreToolUse") -> None:
    emit(
        {
            "hookSpecificOutput": {
                "hookEventName": event,
                "permissionDecision": "ask",
                "permissionDecisionReason": reason,
            }
        }
    )


def block(reason: str) -> None:
    emit({"decision": "block", "reason": reason})


def git(args: list[str], cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=False
    )
    return result.stdout


def changed_or_untracked_files(root: Path) -> list[str]:
    """Arquivos modificados/adicionados/não rastreados, respeitando .gitignore."""
    status = git(["status", "--porcelain"], root)
    paths = []
    for line in status.splitlines():
        if len(line) < 4:
            continue
        path = line[3:].strip()
        if " -> " in path:  # rename: "old -> new"
            path = path.split(" -> ", 1)[1]
        paths.append(path)
    return sorted(set(paths))


CODE_EXTENSIONS = (
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".sql",
    ".toml",
    ".json",
    ".yml",
    ".yaml",
)


def code_fingerprint(root: Path) -> str:
    """Hash do conteúdo dos arquivos de código alterados/novos (para o portão do Stop)."""
    files = [f for f in changed_or_untracked_files(root) if f.endswith(CODE_EXTENSIONS)]
    digest = hashlib.sha256()
    for rel in files:
        path = root / rel
        if not path.is_file():
            continue
        digest.update(rel.encode("utf-8"))
        try:
            digest.update(path.read_bytes())
        except OSError:
            continue
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def verdicts_path() -> Path:
    return state_dir() / "verdicts.json"


def load_verdicts() -> dict[str, Any]:
    return read_json(verdicts_path()) or {}


def save_verdicts(data: dict[str, Any]) -> None:
    write_json(verdicts_path(), data)
