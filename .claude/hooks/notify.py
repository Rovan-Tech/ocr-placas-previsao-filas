#!/usr/bin/env python3
"""Notification — avisa o SO (notificação + beep do terminal) quando o usuário precisa aprovar
algo ou uma tarefa termina. Best-effort: terminal sem suporte a OSC 9 só recebe o BEL."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import emit, read_stdin_json  # noqa: E402


def main() -> int:
    data = read_stdin_json()
    message = data.get("message") or "Claude Code precisa da sua atenção"
    title = "Claude Code"
    seq = f"\033]9;{title}: {message}\007"
    emit({"terminalSequence": seq})
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        sys.stderr.write(f"notify.py: erro interno: {exc}\n")
        sys.exit(0)
