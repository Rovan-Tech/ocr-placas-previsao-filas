#!/usr/bin/env python3
"""SubagentStop (matcher: code-reviewer|qa-tester) — grava o veredito e o relatório completo.

Se `last_assistant_message` não começar com `VEREDITO: APROVADO`/`VEREDITO: REPROVADO`, bloqueia
(`decision: block`) para o subagent completar o relatório no formato exigido, em vez de gravar
um estado inválido que o hook de Stop não saberia interpretar.
"""

from __future__ import annotations

import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import (  # noqa: E402
    block,
    code_fingerprint,
    load_verdicts,
    project_dir,
    read_stdin_json,
    reports_dir,
    save_verdicts,
)

VERDICT_RE = re.compile(r"VEREDITO:\s*(APROVADO|REPROVADO)", re.IGNORECASE)


def main() -> int:
    data = read_stdin_json()
    agent_type = data.get("agent_type", "")
    if agent_type not in ("code-reviewer", "qa-tester"):
        return 0

    message = (data.get("last_assistant_message") or "").strip()
    match = VERDICT_RE.search(message[:200])
    if not match:
        block(
            "O relatório precisa começar pela linha `VEREDITO: APROVADO` ou `VEREDITO: REPROVADO` "
            "(ver o formato exigido na sua própria definição em .claude/agents/). Refaça o "
            "relatório nesse formato antes de terminar."
        )
        return 0

    verdict = match.group(1).upper()
    root = project_dir()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report_path = reports_dir() / f"{agent_type}-{timestamp}.md"
    report_path.write_text(message, encoding="utf-8")

    verdicts = load_verdicts()
    verdicts[agent_type] = {
        "verdict": verdict,
        "fingerprint": code_fingerprint(root),
        "timestamp": timestamp,
        "report_file": str(report_path.relative_to(root)),
    }
    save_verdicts(verdicts)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        sys.stderr.write(f"record_subagent_verdict.py: erro interno, não gravando veredito: {exc}\n")
        sys.exit(0)
