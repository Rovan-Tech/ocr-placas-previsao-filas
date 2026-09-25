import { expect, test } from '@playwright/test'
import { loginAsTestUser } from './testAuth'

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

test('lista os check-ins recentes vindos do backend', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          plate: 'ABC1D23',
          created_at: '2026-09-23T14:05:00Z',
          status: 'admitted',
          schedule_id: null,
          estimated_wait_minutes: 12.4,
        },
        {
          id: 2,
          plate: 'XYZ9A87',
          created_at: '2026-09-23T13:50:00Z',
          status: 'cancelled',
          schedule_id: null,
          estimated_wait_minutes: null,
        },
      ]),
    }),
  )
  await page.goto('/')
  await page.getByRole('link', { name: 'Check-ins' }).click()

  await expect(page.getByRole('heading', { name: 'Check-ins recentes' })).toBeVisible()
  const rows = page.getByRole('row')
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('row', { name: /ABC1D23/ })).toContainText('12 min')
  await expect(page.getByRole('row', { name: /ABC1D23/ })).toContainText('Entrada autorizada')
  await expect(page.getByRole('row', { name: /XYZ9A87/ })).toContainText('Entrada recusada')
})

test('mostra lista vazia', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  )
  await page.goto('/checkins')

  await expect(page.getByText('Nenhum check-in registrado ainda.')).toBeVisible()
  await expect(page.getByRole('img', { name: /Tendência do tempo de espera/ })).toHaveCount(0)
})

test('mostra o gráfico de tendência do tempo de espera quando há dados', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          plate: 'ABC1D23',
          created_at: '2026-09-23T14:05:00Z',
          status: 'admitted',
          schedule_id: null,
          estimated_wait_minutes: 12.4,
        },
        {
          id: 2,
          plate: 'XYZ9A87',
          created_at: '2026-09-23T13:50:00Z',
          status: 'waiting',
          schedule_id: null,
          estimated_wait_minutes: 4,
        },
      ]),
    }),
  )
  await page.goto('/checkins')

  await expect(page.getByRole('heading', { name: 'Tendência do tempo de espera' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Tendência do tempo de espera estimado/ })).toBeVisible()
})

test('mostra um aviso quando não há dados suficientes pro gráfico', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, plate: 'ABC1D23', created_at: null, status: 'waiting', schedule_id: null, estimated_wait_minutes: null },
      ]),
    }),
  )
  await page.goto('/checkins')

  await expect(page.getByText('Ainda não há dados suficientes para o gráfico de tendência.')).toBeVisible()
})

test('passar o mouse no gráfico mostra a dica com placa, horário e minutos', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          plate: 'ABC1D23',
          created_at: '2026-09-23T14:05:00Z',
          status: 'admitted',
          schedule_id: null,
          estimated_wait_minutes: 12,
        },
      ]),
    }),
  )
  await page.goto('/checkins')

  const chart = page.getByRole('img', { name: /Tendência do tempo de espera estimado/ })
  await chart.hover()

  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toContainText('ABC1D23')
  await expect(tooltip).toContainText('12 min')
})

test('mostra o erro do backend e recarrega com Atualizar', async ({ page }) => {
  let shouldFail = true
  await page.route('**/api/checkins?*', (route) => {
    return shouldFail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"Erro interno."}' })
      : route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, plate: 'ABC1D23', created_at: '2026-09-23T14:05:00Z', status: 'admitted', schedule_id: null, estimated_wait_minutes: 5 },
          ]),
        })
  })
  await page.goto('/checkins')

  await expect(page.getByText('Erro interno.')).toBeVisible()
  shouldFail = false
  await page.getByRole('button', { name: 'Atualizar' }).click()
  await expect(page.getByRole('row', { name: /ABC1D23/ })).toBeVisible()
})
