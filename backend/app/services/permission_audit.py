from collections.abc import Collection, Mapping

from sqlalchemy.orm import Session

from app.models import Employee, PermissionAuditAction, PermissionAuditLog
from app.services.permissions import CATALOG, Permission

LABELS: dict[str, str] = {
    item.key.value: item.label for screen in CATALOG for item in screen.permissions
}


def _labels(keys: Collection[str]) -> list[str]:
    return sorted(LABELS.get(key, key) for key in keys)


def _join(labels: list[str]) -> str:
    return ", ".join(labels)


def summarize_permission_diff(before: Collection[str], after: Collection[str]) -> str:
    added = _labels(set(after) - set(before))
    removed = _labels(set(before) - set(after))
    parts = []
    if added:
        parts.append(f"liberou {_join(added)}")
    if removed:
        parts.append(f"bloqueou {_join(removed)}")
    return "; ".join(parts)


def override_state(granted: Collection[str], denied: Collection[str]) -> dict[str, str]:
    state = dict.fromkeys(granted, "grant")
    state.update(dict.fromkeys(denied, "deny"))
    return state


def summarize_override_diff(before: Mapping[str, str], after: Mapping[str, str]) -> str:
    parts = []
    for key in sorted(
        set(before) | set(after), key=lambda item: LABELS.get(item, item)
    ):
        old, new = before.get(key), after.get(key)
        if old == new:
            continue
        label = LABELS.get(key, key)
        if new == "grant":
            parts.append(f"liberou {label}")
        elif new == "deny":
            parts.append(f"bloqueou {label}")
        else:
            parts.append(f"voltou a seguir o cargo em {label}")
    return "; ".join(parts)


def record_permission_change(  # noqa: PLR0913 - campos da trilha de auditoria
    db: Session,
    *,
    actor: Employee,
    client_ip: str | None,
    action: PermissionAuditAction,
    target_name: str,
    summary: str,
    details: dict[str, object],
) -> None:
    db.add(
        PermissionAuditLog(
            actor_id=actor.id,
            actor_username=actor.username,
            actor_name=actor.full_name,
            client_ip=client_ip,
            action=action,
            target_name=target_name,
            summary=summary,
            details=details,
        )
    )


def permission_keys(values: Collection[Permission]) -> list[str]:
    return sorted(permission.value for permission in values)
