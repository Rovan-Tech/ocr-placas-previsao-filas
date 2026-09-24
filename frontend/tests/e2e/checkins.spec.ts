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
        { id: 1, plate: 'ABC1D23', created_at: '2026-09-23T14:05:00Z', estimated_wait_minutes: 12.4 },
        { id: 2, plate: 'XYZ9A87', created_at: '2026-09-23T13:50:00Z', estimated_wait_minutes: null },
      ]),
    }),
  )
  await page.goto('/')
  await page.getByRole('link', { name: 'Check-ins recentes' }).click()

  await expect(page.getByRole('heading', { name: 'Check-ins recentes' })).toBeVisible()
  const rows = page.getByRole('row')
  await expect(rows).toHaveCount(3) // cabeçalho + 2 check-ins
  await expect(page.getByRole('row', { name: /ABC1D23/ })).toContainText('12 min')
  await expect(page.getByRole('row', { name: /XYZ9A87/ })).toContainText('—')
})

test('mostra lista vazia', async ({ page }) => {
  await page.route('**/api/checkins?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  )
  await page.goto('/checkins')

  await expect(page.getByText('Nenhum check-in registrado ainda.')).toBeVisible()
})

test('avisa quando o endpoint ainda não existe e recarrega com Atualizar', async ({ page }) => {
  // Em dev o StrictMode dispara o fetch inicial duas vezes, então o mock
  // responde 404 até o clique em Atualizar, e não por número de chamadas.
  let endpointExists = false
  await page.route('**/api/checkins?*', (route) => {
    return !endpointExists
      ? route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not Found"}' })
      : route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([{ id: 1, plate: 'ABC1D23', created_at: '2026-09-23T14:05:00Z', estimated_wait_minutes: 5 }]),
        })
  })
  await page.goto('/checkins')

  await expect(page.getByText(/GET \/checkins\) ainda não existe/)).toBeVisible()
  endpointExists = true
  await page.getByRole('button', { name: 'Atualizar' }).click()
  await expect(page.getByRole('row', { name: /ABC1D23/ })).toBeVisible()
})
