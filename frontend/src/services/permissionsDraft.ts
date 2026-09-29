import type { PermissionKey, RoleDetail } from './roles'

export type Draft = Record<number, PermissionKey[]>

export function draftFromRoles(roles: RoleDetail[]): Draft {
  return Object.fromEntries(roles.map((role) => [role.id, [...role.permissions]]))
}

export function togglePermission(draft: Draft, roleId: number, key: PermissionKey): Draft {
  const current = draft[roleId] ?? []
  const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
  return { ...draft, [roleId]: next }
}

export function dirtyRoleIds(roles: RoleDetail[], draft: Draft): number[] {
  return roles
    .filter((role) => {
      const drafted = draft[role.id] ?? []
      return (
        drafted.length !== role.permissions.length ||
        drafted.some((key) => !role.permissions.includes(key))
      )
    })
    .map((role) => role.id)
}

export function changeCount(roles: RoleDetail[], draft: Draft): number {
  return roles.reduce((total, role) => {
    const drafted = draft[role.id] ?? []
    const added = drafted.filter((key) => !role.permissions.includes(key)).length
    const removed = role.permissions.filter((key) => !drafted.includes(key)).length
    return total + added + removed
  }, 0)
}
