import { expect, test } from '@playwright/test'
import { loginAsTestUser } from './testAuth'

function todayAt(hour: number, minute = 0): string {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

const CHECKINS = [
  {
    id: 1,
    plate: 'AAA1A11',
    created_at: todayAt(8),
    status: 'admitted',
    schedule_id: 1,
    estimated_wait_minutes: 4,
  },
  {
    id: 2,
    plate: 'BBB2B22',
    created_at: todayAt(8, 30),
    status: 'admitted',
    schedule_id: 2,
    estimated_wait_minutes: 8,
  },
  {
    id: 3,
    plate: 'CCC3C33',
    created_at: todayAt(10),
    status: 'waiting',
    schedule_id: null,
    estimated_wait_minutes: 12,
  },
  {
    id: 4,
    plate: 'DDD4D44',
    created_at: todayAt(10, 20),
    status: 'cancelled',
    schedule_id: null,
    estimated_wait_minutes: null,
  },
]

const LOGS = [
  {
    id: 1,
    employee_id: 1,
    employee_username: 'a',
    endpoint: 'upload',
    client_ip: null,
    ocr_plate: null,
    ocr_confidence: null,
    manual_plate: null,
    final_plate: null,
    final_plate_format: null,
    needs_review: true,
    has_photo: false,
    created_at: todayAt(8),
  },
  {
    id: 2,
    employee_id: 1,
    employee_username: 'a',
    endpoint: 'upload',
    client_ip: null,
    ocr_plate: null,
    ocr_confidence: null,
    manual_plate: null,
    final_plate: null,
    final_plate_format: null,
    needs_review: false,
    has_photo: false,
    created_at: todayAt(9),
  },
]

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

test('mostra os indicadores, o gráfico por hora e a tabela de decisões', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(CHECKINS) }),
  )
  await page.route('**/api/logs?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(LOGS) }),
  )
  await page.goto('/relatorios')

  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible()
  await expect(page.getByText('Somente leitura')).toBeVisible()
  await expect(page.getByText('Check-ins hoje')).toBeVisible()
  await expect(page.getByText('8 min')).toBeVisible()
  await expect(page.getByText('50%')).toBeVisible()
  const chart = page.getByRole('img', { name: /Check-ins por hora/ })
  await expect(chart).toBeVisible()
  await expect(chart).toHaveAttribute('aria-label', /08h 2.*09h 0.*10h 2/)
  await expect(chart.getByText('08h')).toBeVisible()
  await expect(page.getByRole('row', { name: /Autorizado/ })).toContainText('2')
  await expect(page.getByRole('row', { name: /Total/ })).toContainText('4')
})

test('mostra aviso quando não há check-in hoje', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  )
  await page.route('**/api/logs?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  )
  await page.goto('/relatorios')

  await expect(page.getByText('Nenhum check-in registrado hoje.')).toBeVisible()
})

test('mostra o erro do backend', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"detail":"Erro interno."}',
    }),
  )
  await page.route('**/api/logs?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  )
  await page.goto('/relatorios')

  await expect(page.getByText('Erro interno.')).toBeVisible()
})

test('no celular os indicadores não estouram a largura', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(CHECKINS) }),
  )
  await page.route('**/api/logs?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(LOGS) }),
  )
  await page.goto('/relatorios')

  await expect(page.getByText('Check-ins hoje')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(overflow).toBe(false)
})
