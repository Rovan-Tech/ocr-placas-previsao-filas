import { expect, test, type Page } from '@playwright/test'
import { FAKE_EMPLOYEE, loginAsTestUser } from './testAuth'

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

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

test('resultado com alertas não estoura a largura em viewport mobile', async ({ page }) => {
  await page.route('**/api/ocr/upload', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        filename: 'placa.png',
        plate: 'KLM4821',
        plate_format: 'antigo',
        confidence: 0.52,
        needs_review: true,
        verification: {
          status: 'not_found',
          detail: 'Placa não encontrada na base oficial de veículos — verifique o documento do veículo.',
          source: 'SENATRAN',
        },
        detections: [{ text: 'UMTEXTOMUITOLONGOSEMESPACOSQUEPODERIAESTOURARALARGURA', confidence: 0.3 }],
      }),
    }),
  )
  await page.goto('/')
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Enviar foto do aparelho|Fotografar placa/ }).click()
  await (await fileChooserPromise).setFiles({
    name: 'placa.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  })
  await page.getByRole('button', { name: 'Sim, continuar' }).click()

  await expect(page.getByText('KLM-4821', { exact: true })).toBeVisible()
  await page.getByText(/Textos lidos pelo OCR/).click()
  await expect(page.getByRole('alert').first()).toBeInViewport()
  expect(await hasHorizontalOverflow(page)).toBe(false)
})

test('digitação manual da placa não estoura a largura em viewport mobile', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Digitar a placa manualmente' }).click()

  await expect(page.getByLabel('Digite a placa do veículo')).toBeInViewport()
  expect(await hasHorizontalOverflow(page)).toBe(false)
})

test('lista de funcionários não estoura a largura em viewport mobile (rola por dentro)', async ({ page }) => {
  await loginAsTestUser(page, { ...FAKE_EMPLOYEE, is_admin: true })
  await page.route('**/api/auth/employees', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([
            FAKE_EMPLOYEE,
            { id: 2, username: 'fiscal.maria', full_name: 'Maria Fiscal', is_admin: false, active: true },
          ]),
        })
      : route.continue(),
  )
  await page.goto('/funcionarios')

  await expect(page.getByRole('table')).toBeVisible()
  expect(await hasHorizontalOverflow(page)).toBe(false)
})
