import { expect, test } from '@playwright/test'
import { loginAsTestUser } from './testAuth'

const LOGS = [
  {
    id: 1,
    employee_id: 1,
    employee_username: 'marcos.vieira',
    endpoint: 'upload',
    client_ip: '187.54.2.11',
    ocr_plate: 'BRA2E19',
    ocr_confidence: 0.97,
    manual_plate: null,
    final_plate: 'BRA2E19',
    final_plate_format: 'mercosul',
    needs_review: false,
    has_photo: true,
    created_at: '2026-09-28T14:02:00Z',
  },
  {
    id: 2,
    employee_id: 2,
    employee_username: 'juliana.reis',
    endpoint: 'manual',
    client_ip: null,
    ocr_plate: null,
    ocr_confidence: null,
    manual_plate: 'RIO4F32',
    final_plate: 'RIO4F32',
    final_plate_format: 'mercosul',
    needs_review: true,
    has_photo: false,
    created_at: '2026-09-28T13:48:00Z',
  },
]

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

test('lista os logs com selo de origem, placa incerta e link da foto', async ({ page }) => {
  await page.route('**/api/logs?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(LOGS) }),
  )
  await page.goto('/logs')

  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible()
  const ocrRow = page.getByRole('row', { name: /BRA2E19/ })
  await expect(ocrRow).toContainText('Foto (OCR)')
  await expect(ocrRow).toContainText('marcos.vieira')
  await expect(ocrRow.getByRole('button', { name: 'abrir foto' })).toBeVisible()

  const manualRow = page.getByRole('row', { name: /RIO4F32/ })
  await expect(manualRow).toContainText('Digitação manual')
  await expect(manualRow).toContainText('incerta')
  await expect(manualRow.getByRole('button', { name: 'abrir foto' })).toHaveCount(0)
})

test('mostra lista vazia e erro com recarga pelo botão Atualizar', async ({ page }) => {
  let shouldFail = true
  await page.route('**/api/logs?*', (route) =>
    shouldFail
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"detail":"Erro interno."}',
        })
      : route.fulfill({ contentType: 'application/json', body: '[]' }),
  )
  await page.goto('/logs')

  await expect(page.getByText('Erro interno.')).toBeVisible()
  shouldFail = false
  await page.getByRole('button', { name: 'Atualizar' }).click()
  await expect(page.getByText('Nenhum registro ainda.')).toBeVisible()
})

test('no celular cada log vira um cartão sem estourar a largura', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.route('**/api/logs?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(LOGS) }),
  )
  await page.goto('/logs')

  await expect(page.getByRole('row', { name: /BRA2E19/ })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(overflow).toBe(false)
})
