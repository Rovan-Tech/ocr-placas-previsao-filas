#!/usr/bin/env python3
"""Stop — portão final: impede parar com código mudado nesta sessão, pendente, sem os dois
vereditos APROVADO (code-reviewer + qa-tester) para o fingerprint atual.

Usa `stop_hook_active` e um contador em disco para não travar num loop infinito: depois de 3
bloqueios seguidos sem o gate limpar, libera a parada com um aviso explícito.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import (  # noqa: E402
    block,
    changed_or_untracked_files,
    code_fingerprint,
    emit,
    load_verdicts,
    project_dir,
    read_json,
    read_stdin_json,
    state_dir,
    write_json,
)

MAX_CONSECUTIVE_BLOCKS = 3


def counter_path(session_id: str) -> Path:
    return state_dir() / f"stop-block-count-{session_id}.json"


def session_fingerprint_path(session_id: str) -> Path:
    return state_dir() / f"session-fingerprint-{session_id}.json"


def main() -> int:
    data = read_stdin_json()
    session_id = data.get("session_id", "unknown")
    root = project_dir()

    pending_changes = bool(changed_or_untracked_files(root))
    if not pending_changes:
        return 0  # nada pra commitar, nada a garantir

    current_fp = code_fingerprint(root)

    initial = read_json(session_fingerprint_path(session_id)) or {}
    initial_fp = initial.get("fingerprint")
    code_changed_this_session = initial_fp is not None and initial_fp != current_fp

    if not code_changed_this_session:
        return 0  # sessão não alterou código (ou SessionStart não rodou) — nada a garantir aqui

    verdicts = load_verdicts()
    missing = []
    for agent in ("code-reviewer", "qa-tester"):
        v = verdicts.get(agent)
        if not v or v.get("verdict") != "APROVADO" or v.get("fingerprint") != current_fp:
            missing.append(agent)

    if not missing:
        counter_path(session_id).unlink(missing_ok=True)
        return 0

    counter_data = read_json(counter_path(session_id)) or {"count": 0}
    count = counter_data.get("count", 0)

    if count >= MAX_CONSECUTIVE_BLOCKS:
        counter_path(session_id).unlink(missing_ok=True)
        emit(
            {
                "systemMessage": (
                    f"Liberando a parada após {MAX_CONSECUTIVE_BLOCKS} bloqueios seguidos sem "
                    f"aprovação de {', '.join(missing)} para o código atual — revise manualmente "
                    "antes de commitar/abrir PR."
                )
            }
        )
        return 0

    write_json(counter_path(session_id), {"count": count + 1})
    faltando = " e ".join(missing)
    block(
        f"O código mudou nesta sessão e ainda há alterações pendentes, mas falta aprovação "
        f"(`APROVADO`) de {faltando} para o fingerprint atual do código. Rode o fluxo obrigatório "
        f"do CLAUDE.md (invoque o(s) subagent(s) faltante(s)) antes de terminar."
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        sys.stderr.write(f"stop_gate.py: erro interno, permitindo a parada: {exc}\n")
        sys.exit(0)
