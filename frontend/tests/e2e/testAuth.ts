import type { Page } from '@playwright/test'

const STORAGE_KEY = 'ocr-placas.auth'

export type TestRole = 'fiscal' | 'planejador' | 'analista' | 'supervisor' | 'admin'

export const PERMISSIONS: Record<TestRole, Record<string, string>> = {
  fiscal: {
    capture: 'full',
    checkins: 'read',
    schedules: 'none',
    logs: 'none',
    reports: 'none',
    employees: 'none',
  },
  planejador: {
    capture: 'none',
    checkins: 'read',
    schedules: 'full',
    logs: 'none',
    reports: 'none',
    employees: 'none',
  },
  analista: {
    capture: 'none',
    checkins: 'read',
    schedules: 'none',
    logs: 'read',
    reports: 'full',
    employees: 'none',
  },
  supervisor: {
    capture: 'full',
    checkins: 'full',
    schedules: 'full',
    logs: 'read',
    reports: 'read',
    employees: 'none',
  },
  admin: {
    capture: 'full',
    checkins: 'full',
    schedules: 'full',
    logs: 'full',
    reports: 'full',
    employees: 'full',
  },
}

export interface TestEmployee {
  id: number
  username: string
  full_name: string
  role: TestRole
  permissions: Record<string, string>
  active: boolean
}

export const FAKE_EMPLOYEE: TestEmployee = {
  id: 1,
  username: 'fiscal.teste',
  full_name: 'Fiscal de Teste',
  role: 'supervisor',
  permissions: PERMISSIONS.supervisor,
  active: true,
}

export function employeeWithRole(role: TestRole): TestEmployee {
  return { ...FAKE_EMPLOYEE, role, permissions: PERMISSIONS[role] }
}
const FAKE_TOKEN = 'token-de-teste'

export async function loginAsTestUser(
  page: Page,
  employee: TestEmployee = FAKE_EMPLOYEE,
): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(employee) }),
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
