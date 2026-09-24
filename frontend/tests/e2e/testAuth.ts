import type { Page } from '@playwright/test'

const STORAGE_KEY = 'ocr-placas.auth'

export const FAKE_EMPLOYEE = {
  id: 1,
  username: 'fiscal.teste',
  full_name: 'Fiscal de Teste',
  is_admin: false,
  active: true,
}
const FAKE_TOKEN = 'token-de-teste'

export async function loginAsTestUser(page: Page, employee = FAKE_EMPLOYEE): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(employee) }),
  )
  await page.addInitScript(
    ({ token, employee, storageKey }: { token: string; employee: typeof FAKE_EMPLOYEE; storageKey: string }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ token, employee, mustChangePassword: false }))
    },
    { token: FAKE_TOKEN, employee, storageKey: STORAGE_KEY },
  )
}
