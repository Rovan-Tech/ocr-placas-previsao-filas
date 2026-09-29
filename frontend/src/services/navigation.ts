import { accessTo, hasAccess, type Permissions, type Screen } from './roles'

export interface NavEntry {
  id: string
  to: string
  end: boolean
  label: string
  shortLabel: string
  requires: Screen
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
    requires: 'capture',
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'checkins',
    to: '/checkins',
    end: false,
    label: 'Check-ins recentes',
    shortLabel: 'Check-ins',
    requires: 'checkins',
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'schedules',
    to: '/agendamentos',
    end: false,
    label: 'Agendamentos',
    shortLabel: 'Agenda',
    requires: 'schedules',
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'logs',
    to: '/logs',
    end: false,
    label: 'Logs',
    shortLabel: 'Logs',
    requires: 'logs',
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'reports',
    to: '/relatorios',
    end: false,
    label: 'Relatórios',
    shortLabel: 'Relatórios',
    requires: 'reports',
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'employees',
    to: '/funcionarios',
    end: false,
    label: 'Funcionários',
    shortLabel: 'Equipe',
    requires: 'employees',
    hiddenWhenLocked: false,
    desktopOnly: false,
  },
  {
    id: 'permissions',
    to: '/permissoes',
    end: false,
    label: 'Permissões',
    shortLabel: 'Permissões',
    requires: 'employees',
    hiddenWhenLocked: true,
    desktopOnly: true,
  },
]

export interface NavItem extends NavEntry {
  enabled: boolean
}

export function desktopNavItems(permissions: Permissions | undefined): NavItem[] {
  return NAV_ENTRIES.map((entry) => ({
    ...entry,
    enabled: hasAccess(permissions, entry.requires),
  })).filter((item) => item.enabled || !item.hiddenWhenLocked)
}

export function mobileNavItems(permissions: Permissions | undefined): NavItem[] {
  return desktopNavItems(permissions).filter((item) => item.enabled && !item.desktopOnly)
}

export function homePathFor(permissions: Permissions | undefined): string {
  const main = NAV_ENTRIES.find((entry) => accessTo(permissions, entry.requires) === 'full')
  const fallback = NAV_ENTRIES.find((entry) => hasAccess(permissions, entry.requires))
  return (main ?? fallback)?.to ?? '/'
}
