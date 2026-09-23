import { expect, test, type Page } from '@playwright/test'

// O fiscal usa o celular na guarita para fotografar a placa, então a tela não
// pode "estourar" a largura em viewport mobile (isso força zoom/scroll
// horizontal e esconde os botões de ação). Roda em todos os projetos
// configurados no playwright.config.ts, mas é o projeto `mobile-chrome`
// (viewport de celular) que realmente exercita o limite.
async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}

test('tela de captura não estoura a largura em viewport mobile', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: /Abrir câmera|Fotografar placa/ })).toBeInViewport()
  expect(await hasHorizontalOverflow(page)).toBe(false)
})

test('tabela de check-ins não estoura a largura em viewport mobile', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, plate: 'ABC1D23', created_at: '2026-09-23T14:05:00Z', estimated_wait_minutes: 12.4 },
        { id: 2, plate: 'XYZ9A87', created_at: '2026-09-23T13:50:00Z', estimated_wait_minutes: null },
      ]),
    }),
  )
  await page.goto('/checkins')

  await expect(page.getByRole('table')).toBeVisible()
  expect(await hasHorizontalOverflow(page)).toBe(false)
})
