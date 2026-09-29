from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Employee,
    EmployeePermissionOverride,
    PermissionAuditAction,
    PermissionAuditLog,
    Role,
    RolePermission,
)
from app.routers.auth import get_employee_or_404
from app.routers.employee_schemas import (
    EmployeeOut,
    RoleOut,
    to_employee_out,
    to_role_out,
)
from app.services.auth import (
    get_client_ip,
    require_employees_set_role,
    require_employees_view,
    require_permissions_manage,
)
from app.services.permission_audit import (
    override_state,
    permission_keys,
    record_permission_change,
    summarize_override_diff,
    summarize_permission_diff,
)
from app.services.permissions import (
    CATALOG,
    LockoutError,
    Permission,
    ensure_someone_can_manage,
    slugify_role_name,
)

router = APIRouter(prefix="/auth", tags=["access"])

MAX_ROLE_NAME_LENGTH = 80
MAX_LOG_LIMIT = 200
OVERLAP_MESSAGE = "Uma permissão não pode ser liberada e bloqueada."


class RoleDetailOut(RoleOut):
    permissions: list[Permission]


class PermissionDefOut(BaseModel):
    key: Permission
    label: str
    description: str


class ScreenDefOut(BaseModel):
    key: str
    label: str
    permissions: list[PermissionDefOut]


class PermissionsOut(BaseModel):
    catalog: list[ScreenDefOut]
    roles: list[RoleDetailOut]


class RoleWrite(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_ROLE_NAME_LENGTH)
    permissions: list[Permission] = []


class OverridesWrite(BaseModel):
    granted: list[Permission] = []
    denied: list[Permission] = []

    @model_validator(mode="after")
    def _no_overlap(self) -> "OverridesWrite":
        if set(self.granted) & set(self.denied):
            raise ValueError(OVERLAP_MESSAGE)
        return self


class ChangeRoleRequest(BaseModel):
    role_id: int


class PermissionLogOut(BaseModel):
    id: int
    created_at: datetime
    actor_username: str
    actor_name: str
    client_ip: str | None
    action: PermissionAuditAction
    target_name: str
    summary: str
    details: dict[str, object]


def _to_role_detail(role: Role) -> RoleDetailOut:
    known = {permission.value: permission for permission in Permission}
    return RoleDetailOut(
        **to_role_out(role).model_dump(),
        permissions=sorted(
            known[item.permission]
            for item in role.permissions
            if item.permission in known
        ),
    )


def _get_role_or_404(db: Session, role_id: int) -> Role:
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Cargo não encontrado.")
    return role


@contextmanager
def _lockout_guard(db: Session) -> Iterator[None]:
    try:
        with db.begin_nested():
            yield
            db.flush()
            ensure_someone_can_manage(db)
    except LockoutError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    db.commit()


def _set_role_permissions(role: Role, permissions: list[Permission]) -> None:
    role.permissions.clear()
    for permission in sorted(set(permissions)):
        role.permissions.append(RolePermission(permission=permission.value))


def _replace_overrides(target: Employee, payload: OverridesWrite) -> None:
    target.overrides.clear()
    for permission in sorted(set(payload.granted)):
        target.overrides.append(
            EmployeePermissionOverride(permission=permission.value, granted=True)
        )
    for permission in sorted(set(payload.denied)):
        target.overrides.append(
            EmployeePermissionOverride(permission=permission.value, granted=False)
        )


@router.get("/roles", response_model=list[RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    _viewer: Employee = Depends(require_employees_view),
) -> list[RoleOut]:
    return [to_role_out(role) for role in db.query(Role).order_by(Role.id).all()]


@router.get("/permissions", response_model=PermissionsOut)
def read_permissions(
    db: Session = Depends(get_db),
    _manager: Employee = Depends(require_permissions_manage),
) -> PermissionsOut:
    return PermissionsOut(
        catalog=[
            ScreenDefOut(
                key=screen.key,
                label=screen.label,
                permissions=[
                    PermissionDefOut(
                        key=item.key, label=item.label, description=item.description
                    )
                    for item in screen.permissions
                ],
            )
            for screen in CATALOG
        ],
        roles=[_to_role_detail(role) for role in db.query(Role).order_by(Role.id)],
    )


def _role_keys(role: Role) -> set[str]:
    return {item.permission for item in role.permissions}


@router.post("/roles", response_model=RoleDetailOut, status_code=201)
def create_role(
    payload: RoleWrite,
    request: Request,
    db: Session = Depends(get_db),
    actor: Employee = Depends(require_permissions_manage),
) -> RoleDetailOut:
    name = payload.name.strip()
    key = slugify_role_name(name)
    if not key:
        raise HTTPException(status_code=422, detail="Dê um nome válido ao cargo.")
    taken = db.query(Role).filter((Role.key == key) | (Role.name == name)).first()
    if taken is not None:
        raise HTTPException(status_code=409, detail="Já existe um cargo com esse nome.")

    role = Role(key=key, name=name, is_system=False)
    _set_role_permissions(role, payload.permissions)
    db.add(role)
    record_permission_change(
        db,
        actor=actor,
        client_ip=get_client_ip(request),
        action=PermissionAuditAction.ROLE_CREATED,
        target_name=name,
        summary=f"Criou o cargo “{name}”",
        details={"permissions": permission_keys(payload.permissions)},
    )
    db.commit()
    db.refresh(role)
    return _to_role_detail(role)


@router.put("/roles/{role_id}", response_model=RoleDetailOut)
def update_role(
    role_id: int,
    payload: RoleWrite,
    request: Request,
    db: Session = Depends(get_db),
    actor: Employee = Depends(require_permissions_manage),
) -> RoleDetailOut:
    role = _get_role_or_404(db, role_id)
    name = payload.name.strip()
    if role.is_system and name != role.name:
        raise HTTPException(
            status_code=400, detail="O nome de um cargo do sistema não pode mudar."
        )
    if name != role.name:
        clash = db.query(Role).filter(Role.name == name, Role.id != role.id).first()
        if clash is not None:
            raise HTTPException(
                status_code=409, detail="Já existe um cargo com esse nome."
            )

    before = _role_keys(role)
    old_name = role.name
    after = set(permission_keys(payload.permissions))
    with _lockout_guard(db):
        role.name = name
        _set_role_permissions(role, payload.permissions)
        _audit_role_update(
            db, actor, get_client_ip(request), (old_name, name), (before, after)
        )
    db.refresh(role)
    return _to_role_detail(role)


def _capitalize_first(text: str) -> str:
    return text[:1].upper() + text[1:]


def _audit_role_update(
    db: Session,
    actor: Employee,
    client_ip: str | None,
    names: tuple[str, str],
    keys: tuple[set[str], set[str]],
) -> None:
    (old_name, new_name), (before, after) = names, keys
    parts = []
    if old_name != new_name:
        parts.append(f"renomeou o cargo “{old_name}” para “{new_name}”")
    diff = summarize_permission_diff(before, after)
    if diff:
        parts.append(f"no cargo “{new_name}”: {diff}")
    if not parts:
        return
    record_permission_change(
        db,
        actor=actor,
        client_ip=client_ip,
        action=PermissionAuditAction.ROLE_UPDATED,
        target_name=new_name,
        summary=_capitalize_first("; ".join(parts)),
        details={
            "name_from": old_name,
            "name_to": new_name,
            "added": sorted(after - before),
            "removed": sorted(before - after),
        },
    )


@router.delete("/roles/{role_id}", status_code=204)
def delete_role(
    role_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: Employee = Depends(require_permissions_manage),
) -> None:
    role = _get_role_or_404(db, role_id)
    if role.is_system:
        raise HTTPException(
            status_code=400, detail="Um cargo do sistema não pode ser excluído."
        )
    in_use = db.query(Employee).filter(Employee.role_id == role.id).count()
    if in_use:
        raise HTTPException(
            status_code=409,
            detail="Há funcionários com esse cargo. Troque o cargo deles antes.",
        )
    record_permission_change(
        db,
        actor=actor,
        client_ip=get_client_ip(request),
        action=PermissionAuditAction.ROLE_DELETED,
        target_name=role.name,
        summary=f"Excluiu o cargo “{role.name}”",
        details={"permissions": sorted(_role_keys(role))},
    )
    db.delete(role)
    db.commit()


@router.patch("/employees/{employee_id}/role", response_model=EmployeeOut)
def change_employee_role(
    employee_id: int,
    payload: ChangeRoleRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_employees_set_role),
) -> EmployeeOut:
    target = get_employee_or_404(db, employee_id)
    if target.id == admin.id:
        raise HTTPException(
            status_code=400, detail="Você não pode mudar o próprio cargo."
        )
    new_role = _get_role_or_404(db, payload.role_id)
    old_role_name = target.role.name
    with _lockout_guard(db):
        target.role = new_role
        record_permission_change(
            db,
            actor=admin,
            client_ip=get_client_ip(request),
            action=PermissionAuditAction.EMPLOYEE_ROLE_CHANGED,
            target_name=target.full_name,
            summary=(
                f"Trocou o cargo de {target.full_name} de “{old_role_name}” "
                f"para “{new_role.name}”"
            ),
            details={"role_from": old_role_name, "role_to": new_role.name},
        )
    db.refresh(target)
    return to_employee_out(target)


@router.put("/employees/{employee_id}/permissions", response_model=EmployeeOut)
def set_employee_overrides(
    employee_id: int,
    payload: OverridesWrite,
    request: Request,
    db: Session = Depends(get_db),
    actor: Employee = Depends(require_permissions_manage),
) -> EmployeeOut:
    target = get_employee_or_404(db, employee_id)
    before = override_state(
        [o.permission for o in target.overrides if o.granted],
        [o.permission for o in target.overrides if not o.granted],
    )
    after = override_state(
        permission_keys(payload.granted), permission_keys(payload.denied)
    )
    with _lockout_guard(db):
        _replace_overrides(target, payload)
        diff = summarize_override_diff(before, after)
        if diff:
            record_permission_change(
                db,
                actor=actor,
                client_ip=get_client_ip(request),
                action=PermissionAuditAction.EMPLOYEE_OVERRIDES_CHANGED,
                target_name=target.full_name,
                summary=f"Exceções de {target.full_name}: {diff}",
                details={"before": before, "after": after},
            )
    db.refresh(target)
    return to_employee_out(target)


@router.get("/permission-log", response_model=list[PermissionLogOut])
def read_permission_log(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _manager: Employee = Depends(require_permissions_manage),
) -> list[PermissionLogOut]:
    rows = (
        db.query(PermissionAuditLog)
        .order_by(PermissionAuditLog.created_at.desc(), PermissionAuditLog.id.desc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, MAX_LOG_LIMIT)))
        .all()
    )
    return [
        PermissionLogOut(
            id=row.id,
            created_at=row.created_at,
            actor_username=row.actor_username,
            actor_name=row.actor_name,
            client_ip=row.client_ip,
            action=row.action,
            target_name=row.target_name,
            summary=row.summary,
            details=row.details,
        )
        for row in rows
    ]
