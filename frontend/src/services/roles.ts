export type Role = 'fiscal' | 'planejador' | 'analista' | 'supervisor' | 'admin'
export type Screen = 'capture' | 'checkins' | 'schedules' | 'logs' | 'reports' | 'employees'
export type Access = 'none' | 'read' | 'full'
export type Permissions = Partial<Record<Screen, Access>>

export const ROLES: Role[] = ['fiscal', 'planejador', 'analista', 'supervisor', 'admin']

export const SCREENS: Screen[] = [
  'capture',
  'checkins',
  'schedules',
  'logs',
  'reports',
  'employees',
]

const ROLE_LABELS: Record<Role, string> = {
  fiscal: 'Fiscal de Portaria',
  planejador: 'Planejador de Agendamentos',
  analista: 'Analista de Operações',
  supervisor: 'Supervisor de Turno',
  admin: 'Administrador',
}

const SCREEN_LABELS: Record<Screen, string> = {
  capture: 'Capturar',
  checkins: 'Check-ins',
  schedules: 'Agendamentos',
  logs: 'Logs',
  reports: 'Relatórios',
  employees: 'Funcionários',
}

const ACCESS_LABELS: Record<Access, string> = {
  none: 'Sem acesso',
  read: 'Somente leitura',
  full: 'Acesso total',
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role]
}

export function screenLabel(screen: Screen): string {
  return SCREEN_LABELS[screen]
}

export function accessLabel(access: Access): string {
  return ACCESS_LABELS[access]
}

export function accessTo(permissions: Permissions | undefined, screen: Screen): Access {
  return permissions?.[screen] ?? 'none'
}

export function hasAccess(permissions: Permissions | undefined, screen: Screen): boolean {
  return accessTo(permissions, screen) !== 'none'
}
