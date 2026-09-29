import { canAny, type PermissionKey } from './roles'

export interface NavEntry {
  id: string
  to: string
  end: boolean
  label: string
  shortLabel: string
  requires: PermissionKey[]
  hiddenWhenLocked: boolean
  desktopOnly: boolean
}

export const NAV_ENTRIES: NavEntry[] = [
  {
    id: 'capture',
    to: '/',
    end: true,
    label: 'Capturar placa',
    shortLabel: 'Capturar',
    requires: ['capture.read_plate'],
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'checkins',
    to: '/checkins',
    end: false,
    label: 'Check-ins recentes',
    shortLabel: 'Check-ins',
    requires: ['checkins.view'],
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'schedules',
    to: '/agendamentos',
    end: false,
    label: 'Agendamentos',
    shortLabel: 'Agenda',
    requires: ['schedules.view', 'schedules.create'],
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'logs',
    to: '/logs',
    end: false,
    label: 'Logs',
    shortLabel: 'Logs',
    requires: ['logs.view'],
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'reports',
    to: '/relatorios',
    end: false,
    label: 'Relatórios',
    shortLabel: 'Relatórios',
    requires: ['reports.view'],
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'employees',
    to: '/funcionarios',
    end: false,
    label: 'Funcionários',
    shortLabel: 'Equipe',
    requires: ['employees.view'],
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'permissions',
    to: '/permissoes',
    end: false,
    label: 'Permissões',
    shortLabel: 'Permissões',
    requires: ['permissions.manage'],
    hiddenWhenLocked: true,
    desktopOnly: true,
  },
]

export interface NavItem extends NavEntry {
  enabled: boolean
}

export function desktopNavItems(permissions: readonly PermissionKey[] | undefined): NavItem[] {
  return NAV_ENTRIES.map((entry) => ({
    ...entry,
    enabled: canAny(permissions, entry.requires),
  })).filter((item) => item.enabled || !item.hiddenWhenLocked)
}

export function mobileNavItems(permissions: readonly PermissionKey[] | undefined): NavItem[] {
  return desktopNavItems(permissions).filter((item) => item.enabled && !item.desktopOnly)
}

const HOME_ORDER = [
  'capture',
  'schedules',
  'reports',
  'checkins',
  'logs',
  'employees',
  'permissions',
]

export function entryById(id: string): NavEntry | undefined {
  return NAV_ENTRIES.find((entry) => entry.id === id)
}

export function homePathFor(permissions: readonly PermissionKey[] | undefined): string {
  for (const id of HOME_ORDER) {
    const entry = entryById(id)
    if (entry && canAny(permissions, entry.requires)) return entry.to
  }
  return '/'
}
