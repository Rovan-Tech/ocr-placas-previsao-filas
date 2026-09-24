import type { Page } from '@playwright/test'

// Mesma chave usada por src/context/AuthContext.tsx — mantida em sincronia manualmente (poucos
// lugares usam essa constante, e duplicá-la aqui evita os testes precisarem importar código do
// app pra dentro da suíte do Playwright, que roda num processo Node separado do navegador).
const STORAGE_KEY = 'ocr-placas.auth'

export const FAKE_EMPLOYEE = {
  id: 1,
  username: 'fiscal.teste',
  full_name: 'Fiscal de Teste',
  is_admin: false,
  active: true,
}
const FAKE_TOKEN = 'token-de-teste'

/**
 * Pré-autentica a página antes da navegação: a maioria dos testes de e2e quer testar a tela de
 * captura/check-ins/logs em si, não o login — chame isso antes do primeiro `page.goto`.
 */
export async function loginAsTestUser(page: Page, employee = FAKE_EMPLOYEE): Promise<void> {
  // GET /auth/me roda assim que o AuthContext sobe, pra confirmar que a sessão "restaurada"
  // ainda vale — sem essa rota mockada, a validação falha e a página cai de volta pro login.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(employee) }),
  )
  // addInitScript roda antes de qualquer script da página (inclusive o React), então o
  // AuthContext já encontra a sessão salva na primeira renderização.
  await page.addInitScript(
    ({ token, employee, storageKey }: { token: string; employee: typeof FAKE_EMPLOYEE; storageKey: string }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ token, employee, mustChangePassword: false }))
    },
    { token: FAKE_TOKEN, employee, storageKey: STORAGE_KEY },
  )
}
