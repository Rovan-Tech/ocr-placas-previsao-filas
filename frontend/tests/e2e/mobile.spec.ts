import { expect, test, type Page } from '@playwright/test'
import { FAKE_EMPLOYEE, loginAsTestUser } from './testAuth'

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}

test('tela de captura não estoura a largura em viewport mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
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

test.describe('navegação responsiva', () => {
  test('em viewport mobile, a tab bar do rodapé aparece e o menu horizontal some', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const tabBar = page.getByRole('navigation', { name: 'Navegação principal' })
    await expect(tabBar).toBeVisible()
    await expect(tabBar.getByRole('link', { name: 'Check-ins' })).toBeVisible()
  })

  test('em viewport desktop, o menu horizontal aparece e a tab bar não', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Check-ins recentes' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeHidden()
  })

  test('a tab bar navega para a página certa sem cobrir o conteúdo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/api/checkins?*', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }))
    await page.goto('/')

    await page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Check-ins' })
      .click()

    await expect(page.getByRole('heading', { name: 'Check-ins recentes' })).toBeInViewport()
  })

  test('o botão principal de captura tem alvo de toque de pelo menos 44x44px em mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const box = await page.getByRole('button', { name: /Abrir câmera|Fotografar placa/ }).boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  })
})

test.describe('tabelas viram cards em viewport mobile', () => {
  test('tabela de check-ins reflow para lista de cards, mantendo os dados acessíveis', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/api/checkins?*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, plate: 'ABC1D23', created_at: '2026-09-23T14:05:00Z', status: 'admitted', estimated_wait_minutes: 12.4 },
        ]),
      }),
    )
    await page.goto('/checkins')

    const display = await page.locator('table.checkins').evaluate((el) => getComputedStyle(el).display)
    expect(display).toBe('block')
    await expect(page.getByRole('row', { name: /ABC1D23/ })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'ABC1D23' })).toBeVisible()
    expect(await hasHorizontalOverflow(page)).toBe(false)
  })
})
