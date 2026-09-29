from pydantic import BaseModel

from app.models import Employee, Role
from app.services.permissions import Permission, effective_permissions


class RoleOut(BaseModel):
    id: int
    key: str
    name: str
    is_system: bool


class OverridesOut(BaseModel):
    granted: list[Permission] = []
    denied: list[Permission] = []


class EmployeeOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: RoleOut
    permissions: list[Permission] = []
    overrides: OverridesOut = OverridesOut()
    active: bool = True


def to_role_out(role: Role) -> RoleOut:
    return RoleOut(id=role.id, key=role.key, name=role.name, is_system=role.is_system)


def _permissions_from(employee: Employee, *, granted: bool) -> list[Permission]:
    known = {permission.value: permission for permission in Permission}
    return sorted(
        known[override.permission]
        for override in employee.overrides
        if override.granted is granted and override.permission in known
    )


def to_employee_out(employee: Employee) -> EmployeeOut:
    return EmployeeOut(
        id=employee.id,
        username=employee.username,
        full_name=employee.full_name,
        role=to_role_out(employee.role),
        permissions=sorted(effective_permissions(employee)),
        overrides=OverridesOut(
            granted=_permissions_from(employee, granted=True),
            denied=_permissions_from(employee, granted=False),
        ),
        active=employee.active,
    )
