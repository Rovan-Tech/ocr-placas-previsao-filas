import { vi } from 'vitest'
import type { Employee } from '../../../src/services/auth'
import type { PermissionKey, RoleSummary } from '../../../src/services/roles'

export const ALL_PERMISSIONS: PermissionKey[] = [
  'capture.read_plate',
  'capture.authorize_entry',
  'capture.refuse_entry',
  'checkins.view',
  'schedules.view',
  'schedules.create',
  'logs.view',
  'reports.view',
  'employees.view',
  'employees.create',
  'employees.deactivate',
  'employees.set_role',
  'permissions.manage',
]

export const ADMIN_ROLE: RoleSummary = {
  id: 1,
  key: 'admin',
  name: 'Administrador',
  is_system: true,
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 1,
    username: 'maria',
    full_name: 'Maria Souza',
    role: ADMIN_ROLE,
    permissions: ALL_PERMISSIONS,
    overrides: { granted: [], denied: [] },
    active: true,
    ...overrides,
  }
}

export function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQueryList = {
    matches,
    media: '',
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQueryList),
  )
  return {
    emit(nextMatches: boolean) {
      listeners.forEach((listener) => listener({ matches: nextMatches } as MediaQueryListEvent))
    },
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
