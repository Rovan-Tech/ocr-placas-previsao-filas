export type PermissionKey =
  | 'capture.read_plate'
  | 'capture.authorize_entry'
  | 'capture.refuse_entry'
  | 'checkins.view'
  | 'schedules.view'
  | 'schedules.create'
  | 'logs.view'
  | 'reports.view'
  | 'employees.view'
  | 'employees.create'
  | 'employees.deactivate'
  | 'employees.set_role'
  | 'permissions.manage'

export interface RoleSummary {
  id: number
  key: string
  name: string
  is_system: boolean
}

export interface RoleDetail extends RoleSummary {
  permissions: PermissionKey[]
}

export interface PermissionDef {
  key: PermissionKey
  label: string
  description: string
}

export interface ScreenDef {
  key: string
  label: string
  permissions: PermissionDef[]
}

export interface PermissionsMatrix {
  catalog: ScreenDef[]
  roles: RoleDetail[]
}

export interface Overrides {
  granted: PermissionKey[]
  denied: PermissionKey[]
}

export type OverrideChoice = 'inherit' | 'grant' | 'deny'

export function can(
  permissions: readonly PermissionKey[] | undefined,
  key: PermissionKey,
): boolean {
  return permissions?.includes(key) ?? false
}

export function canAny(
  permissions: readonly PermissionKey[] | undefined,
  keys: readonly PermissionKey[],
): boolean {
  return keys.some((key) => can(permissions, key))
}

export function overrideChoiceFor(overrides: Overrides, key: PermissionKey): OverrideChoice {
  if (overrides.granted.includes(key)) return 'grant'
  if (overrides.denied.includes(key)) return 'deny'
  return 'inherit'
}

export function overridesFromChoices(choices: Record<string, OverrideChoice>): Overrides {
  const keys = Object.keys(choices) as PermissionKey[]
  return {
    granted: keys.filter((key) => choices[key] === 'grant'),
    denied: keys.filter((key) => choices[key] === 'deny'),
  }
}
