import { expect, test, type Page } from '@playwright/test'
import { loginAsTestUser } from './testAuth'

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

function mockList(page: Page, schedules: unknown[]) {
  return page.route('**/api/schedules', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(schedules) })
      : route.continue(),
  )
}

test('lista os agendamentos cadastrados', async ({ page }) => {
  await mockList(page, [
    {
      id: 1,
      plate: 'ABC1D23',
      driver_name: 'João da Silva',
      driver_document: '12345678900',
      has_driver_document_photo: false,
      has_vehicle_document_photo: false,
      cargo_type: 'Grãos',
      scheduled_date: '2026-09-24',
      created_at: '2026-09-20T10:00:00Z',
    },
  ])
  await page.goto('/agendamentos')

  await expect(page.getByRole('cell', { name: 'ABC1D23' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'João da Silva' })).toBeVisible()
})

test('mostra aviso quando não há agendamento cadastrado', async ({ page }) => {
  await mockList(page, [])
  await page.goto('/agendamentos')

  await expect(page.getByText('Nenhum agendamento cadastrado ainda.')).toBeVisible()
})

test('cadastra um agendamento novo com foto do documento do motorista', async ({ page }) => {
  await mockList(page, [])
  let sentBody = ''
  await page.route('**/api/schedules', (route) => {
    if (route.request().method() === 'GET') return route.continue()
    sentBody = route.request().postData() ?? ''
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 2,
        plate: 'XYZ9A87',
        driver_name: 'Maria Souza',
        driver_document: '98765432100',
        has_driver_document_photo: true,
        has_vehicle_document_photo: false,
        cargo_type: 'Contêiner',
        scheduled_date: '2026-09-25',
        created_at: '2026-09-24T12:00:00Z',
      }),
    })
  })
  await page.goto('/agendamentos')

  await page.getByLabel('Placa').fill('XYZ9A87')
  await page.getByLabel('Nome do motorista').fill('Maria Souza')
  await page.getByLabel('Documento do motorista', { exact: true }).fill('98765432100')
  await page.getByLabel('Tipo de carga').fill('Contêiner')
  await page.getByLabel('Data prevista').fill('2026-09-25')
  await page.getByRole('button', { name: 'Cadastrar' }).click()

  await expect(page.getByText(/agendamento da placa XYZ9A87 cadastrado/i)).toBeVisible()
  expect(sentBody).toContain('XYZ9A87')
  expect(sentBody).toContain('Maria Souza')
  expect(sentBody).toContain('Contêiner')
})

test('mostra o erro do backend quando a placa é inválida', async ({ page }) => {
  await mockList(page, [])
  await page.route('**/api/schedules', (route) =>
    route.request().method() === 'GET'
      ? route.continue()
      : route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Formato de placa inválido. Use o padrão Mercosul (ex.: ABC1D23) ou o padrão antigo (ex.: ABC1234).' }),
        }),
  )
  await page.goto('/agendamentos')

  await page.getByLabel('Placa').fill('NAOVALIDA')
  await page.getByLabel('Nome do motorista').fill('Maria Souza')
  await page.getByLabel('Documento do motorista', { exact: true }).fill('98765432100')
  await page.getByLabel('Tipo de carga').fill('Contêiner')
  await page.getByLabel('Data prevista').fill('2026-09-25')
  await page.getByRole('button', { name: 'Cadastrar' }).click()

  await expect(page.getByText(/Formato de placa inválido/)).toBeVisible()
})

test('link de Agendamentos está acessível pelo menu', async ({ page }) => {
  await mockList(page, [])
  await page.goto('/')

  await page.getByRole('link', { name: 'Agendamentos' }).click()

  await expect(page.getByRole('heading', { name: 'Agendamentos' })).toBeVisible()
})
