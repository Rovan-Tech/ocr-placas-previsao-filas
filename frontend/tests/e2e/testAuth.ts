import type { Page } from '@playwright/test'

const STORAGE_KEY = 'ocr-placas.auth'

export type TestRole = 'fiscal' | 'planejador' | 'analista' | 'supervisor' | 'admin'

const CAPTURE = ['capture.read_plate', 'capture.authorize_entry', 'capture.refuse_entry']
const EMPLOYEES = [
  'employees.view',
  'employees.create',
  'employees.deactivate',
  'employees.set_role',
]

export const PERMISSIONS: Record<TestRole, string[]> = {
  fiscal: [...CAPTURE, 'checkins.view'],
  planejador: ['checkins.view', 'schedules.view', 'schedules.create'],
  analista: ['checkins.view', 'logs.view', 'reports.view'],
  supervisor: [
    ...CAPTURE,
    'checkins.view',
    'schedules.view',
    'schedules.create',
    'logs.view',
    'reports.view',
  ],
  admin: [
    ...CAPTURE,
    'checkins.view',
    'schedules.view',
    'schedules.create',
    'logs.view',
    'reports.view',
    ...EMPLOYEES,
    'permissions.manage',
  ],
}

const ROLE_NAMES: Record<TestRole, string> = {
  fiscal: 'Fiscal de Portaria',
  planejador: 'Planejador de Agendamentos',
  analista: 'Analista de Operações',
  supervisor: 'Supervisor de Turno',
  admin: 'Administrador',
}

const ROLE_IDS: Record<TestRole, number> = {
  fiscal: 1,
  planejador: 2,
  analista: 3,
  supervisor: 4,
  admin: 5,
}

export interface TestRoleSummary {
  id: number
  key: string
  name: string
  is_system: boolean
}

export interface TestEmployee {
  id: number
  username: string
  full_name: string
  role: TestRoleSummary
  permissions: string[]
  overrides: { granted: string[]; denied: string[] }
  active: boolean
}

const ROLE_KEYS: TestRole[] = ['fiscal', 'planejador', 'analista', 'supervisor', 'admin']

export function roleOf(key: TestRole): TestRoleSummary {
  return { id: ROLE_IDS[key], key, name: ROLE_NAMES[key], is_system: true }
}

export function employeeWithRole(key: TestRole): TestEmployee {
  return {
    id: 1,
    username: 'fiscal.teste',
    full_name: 'Fiscal de Teste',
    role: roleOf(key),
    permissions: PERMISSIONS[key],
    overrides: { granted: [], denied: [] },
    active: true,
  }
}

export const FAKE_EMPLOYEE: TestEmployee = employeeWithRole('supervisor')

const FAKE_TOKEN = 'token-de-teste'

export async function loginAsTestUser(
  page: Page,
  employee: TestEmployee = FAKE_EMPLOYEE,
): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(employee) }),
  )
  await page.route('**/api/auth/roles', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(ROLE_KEYS.map(roleOf)),
        })
      : route.fallback(),
  )
  await page.addInitScript(
    ({
      token,
      employee,
      storageKey,
    }: {
      token: string
      employee: TestEmployee
      storageKey: string
    }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ token, employee, mustChangePassword: false }),
      )
    },
    { token: FAKE_TOKEN, employee, storageKey: STORAGE_KEY },
  )
}
