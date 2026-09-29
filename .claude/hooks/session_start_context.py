#!/usr/bin/env python3
"""SessionStart — grava o fingerprint inicial da sessão (uma vez só, sem sobrescrever em
resume/compact) e injeta um resumo curto: branch, git status, últimos vereditos e se ainda valem.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import (  # noqa: E402
    changed_or_untracked_files,
    code_fingerprint,
    git,
    load_verdicts,
    project_dir,
    read_stdin_json,
    state_dir,
    write_json,
)


def session_fingerprint_path(session_id: str) -> Path:
    return state_dir() / f"session-fingerprint-{session_id}.json"


def main() -> int:
    data = read_stdin_json()
    session_id = data.get("session_id", "unknown")
    root = project_dir()

    current_fp = code_fingerprint(root)
    path = session_fingerprint_path(session_id)
    if not path.exists():
        write_json(path, {"fingerprint": current_fp})

    branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root).strip() or "?"
    pending = changed_or_untracked_files(root)

    lines = [
        f"Branch atual: {branch}",
        f"Arquivos com mudança pendente: {len(pending)}" + (f" ({', '.join(pending[:5])}{'…' if len(pending) > 5 else ''})" if pending else ""),
    ]

    verdicts = load_verdicts()
    if verdicts:
        for agent, v in verdicts.items():
            stale = v.get("fingerprint") != current_fp
            status = f"{v.get('verdict', '?')}" + (" (desatualizado para o código atual)" if stale else " (vale para o código atual)")
            lines.append(f"Último veredito de {agent}: {status}")
    else:
        lines.append("Nenhum veredito de code-reviewer/qa-tester registrado ainda.")

    lines.append(
        "Lembrete: toda mudança de código segue o fluxo obrigatório do CLAUDE.md "
        "(gate rápido → code-reviewer → qa-tester → entrega) antes de considerar a tarefa pronta."
    )

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        sys.stderr.write(f"session_start_context.py: erro interno: {exc}\n")
        sys.exit(0)
