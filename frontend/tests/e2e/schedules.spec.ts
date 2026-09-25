import { expect, test, type Page } from '@playwright/test'
import { loginAsTestUser } from './testAuth'

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

const FAKE_PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function mockIbgeCities(page: Page, uf: string, cities: string[]) {
  return page.route(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios**`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(cities.map((nome, id) => ({ id, nome }))),
    }),
  )
}

function mockSchedules(
  page: Page,
  {
    list = [],
    onCreate,
  }: {
    list?: unknown[]
    onCreate?: (route: import('@playwright/test').Route) => Promise<void> | void
  } = {},
) {
  return page.route('**/api/schedules', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(list) })
    }
    if (onCreate) return onCreate(route)
    return route.continue()
  })
}

async function fillScheduleForm(page: Page, plate: string, driverName: string, driverDocument: string) {
  await page.getByLabel('Placa').fill(plate)
  await page.getByLabel('Nome do motorista').fill(driverName)
  await page.getByLabel('Data de nascimento').fill('1988-04-12')
  await mockIbgeCities(page, 'CE', ['Fortaleza'])
  await page.getByLabel('UF').selectOption('CE')
  await page.getByLabel('Local de nascimento').selectOption('Fortaleza')
  await page.getByLabel('Número do documento').fill(driverDocument)
  await page.getByLabel('Marca do veículo').fill('Iveco')
  await page.getByLabel('Modelo do veículo').fill('Tector')
  await page.getByLabel('Ano do veículo').fill('2019')
  await page.getByLabel('Chassi').fill('9BWZZZ377VT004999')
  await page.getByLabel('Cor do veículo').fill('Azul')
  await page.getByLabel('Comprimento (m)').fill('10')
  await page.getByLabel('Altura (m)').fill('3.8')
  await page.getByLabel('Largura (m)').fill('2.5')
  await page.getByLabel('Origem').fill('Fortaleza - CE')
  await page.getByLabel('Destino').fill('Recife - PE')
  await page.getByLabel('Produto 1').fill('Contêiner')
  await page.getByLabel('Data prevista').fill('2026-09-25')

  for (const label of [
    'Foto da frente do documento do motorista',
    'Foto do verso do documento do motorista',
    'Foto do documento do veículo',
    'Foto do manifesto de carga',
  ]) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByLabel(label).click()])
    await chooser.setFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: FAKE_PHOTO })
  }
}

test('o token da sessão salva já está pronto na primeira busca da página, sem cair pro login', async ({ page }) => {
  await page.route('**/api/schedules', (route) => {
    const authorization = route.request().headers()['authorization']
    if (authorization !== 'Bearer token-de-teste') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Não autenticado.' }) })
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })

  await page.goto('/agendamentos')

  await expect(page.getByRole('heading', { name: 'Agendamentos' })).toBeVisible()
  await expect(page.getByLabel('Usuário')).toHaveCount(0)
})

test('lista os agendamentos cadastrados', async ({ page }) => {
  await mockSchedules(page, {
    list: [
      {
        id: 1,
        plate: 'ABC1D23',
        driver_name: 'João da Silva',
        driver_document: '12345678900',
        driver_document_validated: true,
        origin_location: 'São Paulo - SP',
        destination_location: 'Recife - PE',
        cargo_items: [{ id: 1, product_name: 'Grãos', category: 'nao_perecivel' }],
        scheduled_date: '2026-09-24',
        created_at: '2026-09-20T10:00:00Z',
      },
    ],
  })
  await page.goto('/agendamentos')

  await expect(page.getByRole('cell', { name: 'ABC1D23' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'João da Silva' })).toBeVisible()
  await expect(page.getByRole('cell', { name: /Grãos/ })).toBeVisible()
})

test('mostra aviso quando não há agendamento cadastrado', async ({ page }) => {
  await mockSchedules(page)
  await page.goto('/agendamentos')

  await expect(page.getByText('Nenhum agendamento cadastrado ainda.')).toBeVisible()
})

test('cadastra um agendamento novo com todos os campos e as quatro fotos', async ({ page }) => {
  let sentBody = ''
  await mockSchedules(page, {
    onCreate: (route) => {
      sentBody = route.request().postData() ?? ''
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 2,
          plate: 'XYZ9A87',
          driver_name: 'Maria Souza',
          driver_document: '98765432100',
          driver_document_validated: false,
          driver_document_validation_detail: 'Número do documento não foi encontrado na foto — confira manualmente.',
          origin_location: 'Fortaleza - CE',
          destination_location: 'Recife - PE',
          cargo_items: [{ id: 1, product_name: 'Contêiner', category: 'nao_perecivel' }],
          scheduled_date: '2026-09-25',
          created_at: '2026-09-24T12:00:00Z',
        }),
      })
    },
  })
  await page.goto('/agendamentos')

  await fillScheduleForm(page, 'XYZ9A87', 'Maria Souza', '98765432100')
  await page.getByRole('button', { name: 'Cadastrar' }).click()

  await expect(page.getByText(/agendamento da placa XYZ9A87 cadastrado/i)).toBeVisible()
  expect(sentBody).toContain('XYZ9A87')
  expect(sentBody).toContain('Maria Souza')
  expect(sentBody).toContain('Cont')
  expect(sentBody).toContain('driver_document_photo_front')
  expect(sentBody).toContain('driver_document_photo_back')
  expect(sentBody).toContain('vehicle_document_photo')
  expect(sentBody).toContain('manifest_photo')
})

test('mostra o erro do backend quando a placa é inválida', async ({ page }) => {
  await mockSchedules(page, {
    onCreate: (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Formato de placa inválido. Use o padrão Mercosul (ex.: ABC1D23) ou o padrão antigo (ex.: ABC1234).',
        }),
      }),
  })
  await page.goto('/agendamentos')

  await fillScheduleForm(page, 'NAOVALIDA', 'Maria Souza', '98765432100')
  await page.getByRole('button', { name: 'Cadastrar' }).click()

  await expect(page.getByText(/Formato de placa inválido/)).toBeVisible()
})

test('mostra o erro do backend quando já existe agendamento para a mesma placa/motorista/chassi na data', async ({
  page,
}) => {
  await mockSchedules(page, {
    onCreate: (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Já existe um agendamento para esta placa nesta data.' }),
      }),
  })
  await page.goto('/agendamentos')

  await fillScheduleForm(page, 'ABC1D23', 'Maria Souza', '98765432100')
  await page.getByRole('button', { name: 'Cadastrar' }).click()

  await expect(page.getByText('Já existe um agendamento para esta placa nesta data.')).toBeVisible()
})

test('link de Agendamentos está acessível pelo menu', async ({ page }) => {
  await mockSchedules(page)
  await page.goto('/')

  await page.getByRole('link', { name: 'Agenda' }).click()

  await expect(page.getByRole('heading', { name: 'Agendamentos' })).toBeVisible()
})
