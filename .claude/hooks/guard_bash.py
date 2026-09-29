#!/usr/bin/env python3
"""PreToolUse (Bash) — bloqueia comando destrutivo, commit/push direto na main, instalação de
pacote fora do requirements.txt e escrita em .claude/state|reports via shell.

Bloqueia com `hookSpecificOutput.permissionDecision = "deny"` (não usa exit 2 para poder mandar
o motivo específico para o Claude, não só para stderr).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import deny, git, project_dir, read_stdin_json  # noqa: E402


def _is_wide_target(t: str) -> bool:
    if t in ("/", "~", ".", "..", "*", "$HOME", '"$HOME"'):
        return True
    # Um caminho absoluto com poucos segmentos é uma pasta ampla (/home, /home/user);
    # um caminho longo e específico (muitos segmentos) é um arquivo/pasta pontual, não amplo.
    if t.startswith("/"):
        segments = [s for s in t.split("/") if s]
        return len(segments) <= 2
    return False


def is_destructive_rm(command: str) -> str | None:
    for match in re.finditer(r"\brm\s+([^\n;|&]*)", command):
        args = match.group(1)
        tokens = args.split()
        flags = "".join(t for t in tokens if t.startswith("-") and not t.startswith("--"))
        long_flags = [t for t in tokens if t.startswith("--")]
        has_recursive_force = (
            re.search(r"r", flags) and re.search(r"f", flags)
        ) or ("--recursive" in long_flags and "--force" in long_flags)
        if not has_recursive_force:
            continue
        targets = [t for t in tokens if not t.startswith("-")]
        if not targets or any(_is_wide_target(t) for t in targets):
            return f"`rm` recursivo/forçado em caminho amplo: `{match.group(0).strip()}`"
    return None


def is_force_push(command: str) -> str | None:
    if re.search(r"\bgit\s+push\b", command) and re.search(r"(--force\b|--force-with-lease\b|\s-f\b)", command):
        return "`git push --force`/`-f` é destrutivo (pode sobrescrever histórico remoto)"
    return None


def is_reset_hard(command: str) -> str | None:
    if re.search(r"\bgit\s+reset\s+--hard\b", command):
        return "`git reset --hard` descarta mudanças não commitadas"
    return None


def is_git_clean(command: str) -> str | None:
    # nosemgrep: skills.code-injection.skill-ldap-injection.skill-ldap-injection -- falso positivo: regex de "git clean", sem LDAP
    if re.search(r"\bgit\s+clean\s+.*-[a-zA-Z]*f[a-zA-Z]*d|\bgit\s+clean\s+.*-[a-zA-Z]*d[a-zA-Z]*f", command):
        return "`git clean -fd` apaga arquivo não rastreado sem confirmação"
    return None


def is_db_wipe(command: str) -> str | None:
    if re.search(r"\bdropdb\b", command) or re.search(
        r"\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE)\b", command, re.IGNORECASE
    ):
        return "comando de banco destrutivo (DROP/TRUNCATE/dropdb)"
    if re.search(r"docker\s+compose\s+down\s+.*-v\b", command):
        return "`docker compose down -v` apaga o volume do Postgres local"
    return None


def is_curl_pipe_shell(command: str) -> str | None:
    if re.search(r"\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b", command):
        return "baixar e executar script remoto direto num shell (`curl|sh`) sem revisar antes"
    return None


def is_main_branch_write(command: str, cwd: Path) -> str | None:
    if not re.search(r"\bgit\s+(commit|push)\b", command):
        return None
    branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd).strip()
    if branch in ("main", "master"):
        return f"a branch atual é `{branch}` — commit/push direto nela é proibido (ver .claude/rules/git.md)"
    return None


def is_adhoc_pip_install(command: str) -> str | None:
    for match in re.finditer(r"\bpip3?\s+install\s+([^\n;|&]*)", command):
        args = match.group(1)
        if re.search(r"(^|\s)-r\s|-e\s+\.|--editable", args):
            continue
        if "requirements" in args:
            continue
        return (
            "`pip install` de pacote solto — adicione a dependência em backend/requirements.txt "
            "e rode `pip install -r requirements.txt`, para não haver dependência não rastreada"
        )
    return None


STATE_OR_REPORTS_PATH = r"['\"]?[^\s'\";|&]*\.claude[/\\](state|reports)\b"
MUTATING_COMMANDS = ("rm", "mv", "cp", "touch", "tee")


def is_state_or_reports_write(command: str) -> str | None:
    # Redirecionamento (`>`/`>>`) direto para o caminho — não confundir com `2>&1` (stderr),
    # que não é seguido por um caminho de .claude/state|reports.
    if re.search(r">{1,2}\s*" + STATE_OR_REPORTS_PATH, command):
        return "só os hooks escrevem em .claude/state/ e .claude/reports/ — não escreva lá via Bash"

    for segment in re.split(r"[;&|\n]+", command):
        segment = segment.strip()
        if not segment or not re.search(STATE_OR_REPORTS_PATH, segment):
            continue
        first_word = segment.split()[0] if segment.split() else ""
        if first_word in MUTATING_COMMANDS or re.search(r"\bsed\b[^\n]*-i\b", segment):
            return "só os hooks escrevem em .claude/state/ e .claude/reports/ — não escreva lá via Bash"
    return None


CHECKS = (
    is_destructive_rm,
    is_force_push,
    is_reset_hard,
    is_git_clean,
    is_db_wipe,
    is_curl_pipe_shell,
    is_adhoc_pip_install,
    is_state_or_reports_write,
)


def main() -> int:
    data = read_stdin_json()
    if data.get("tool_name") != "Bash":
        return 0
    command = data.get("tool_input", {}).get("command", "")
    if not command:
        return 0

    cwd = Path(data.get("cwd") or project_dir())

    reason = is_main_branch_write(command, cwd)
    if reason:
        deny(reason)
        return 0

    for check in CHECKS:
        reason = check(command)
        if reason:
            deny(reason)
            return 0

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # nunca travar a sessão por erro interno do hook
        sys.stderr.write(f"guard_bash.py: erro interno, permitindo o comando: {exc}\n")
        sys.exit(0)
