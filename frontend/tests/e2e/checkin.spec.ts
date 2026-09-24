import { expect, test, type Page } from '@playwright/test'
import { loginAsTestUser } from './testAuth'

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function ocrResponse(checkin: unknown) {
  return {
    filename: 'placa.png',
    plate: 'ABC1D23',
    plate_format: 'mercosul',
    confidence: 0.9876,
    needs_review: false,
    verification: null,
    detections: [],
    checkin,
  }
}

async function mockAndSend(page: Page, checkin: unknown) {
  await page.route('**/api/ocr/upload', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(ocrResponse(checkin)) }),
  )
  await page.goto('/')
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Enviar foto do aparelho|Fotografar placa/ }).click()
  await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })
  await page.getByRole('button', { name: 'Sim, continuar' }).click()
}

test('agendado para hoje: mostra motorista, carga e o veículo como confirmação', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: {
      driver_name: 'João da Silva',
      driver_document: '12345678900',
      has_driver_document_photo_front: true,
      has_driver_document_photo_back: false,
      has_vehicle_document_photo: false,
      cargo_type: 'Grãos',
      scheduled_date: '2026-09-24',
      status: 'on_time',
    },
    vehicle_data: { brand: 'FIAT', model: 'UNO', year: '2015', uf: 'SP', color: 'Branco' },
  })

  await expect(page.getByText('Agendado para hoje')).toBeVisible()
  await expect(page.getByText(/João da Silva/)).toBeVisible()
  await expect(page.getByText(/Grãos/)).toBeVisible()
  await expect(page.getByText(/FIAT.*UNO/)).toBeVisible()
})

test('agendado para outra data no futuro: mostra "Adiantado" e a data agendada', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: {
      driver_name: 'João da Silva',
      driver_document: '12345678900',
      has_driver_document_photo_front: false,
      has_driver_document_photo_back: false,
      has_vehicle_document_photo: false,
      cargo_type: 'Grãos',
      scheduled_date: '2026-10-05',
      status: 'early',
    },
    vehicle_data: null,
  })

  await expect(page.getByText('Adiantado')).toBeVisible()
  await expect(page.getByText('05/10/2026')).toBeVisible()
})

test('agendado para outra data no passado: mostra "Atrasado" e a data agendada', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: {
      driver_name: 'João da Silva',
      driver_document: '12345678900',
      has_driver_document_photo_front: false,
      has_driver_document_photo_back: false,
      has_vehicle_document_photo: false,
      cargo_type: 'Grãos',
      scheduled_date: '2026-09-10',
      status: 'late',
    },
    vehicle_data: null,
  })

  await expect(page.getByText('Atrasado')).toBeVisible()
  await expect(page.getByText('10/09/2026')).toBeVisible()
})

test('sem agendamento, mas achado na API Brasil: mostra os dados do veículo e avisa que não há agendamento', async ({
  page,
}) => {
  await mockAndSend(page, {
    found: true,
    schedule: null,
    vehicle_data: { brand: 'VOLKSWAGEN', model: 'GOL', year: '2020', uf: 'RJ', color: 'Prata' },
  })

  await expect(page.getByText('Sem agendamento cadastrado')).toBeVisible()
  await expect(page.getByText(/VOLKSWAGEN.*GOL/)).toBeVisible()
  await expect(page.getByText(/Dados de exemplo/)).toHaveCount(0)
})

test('dados do veículo mockados (sem API Brasil configurada): avisa que são dados de exemplo', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: null,
    vehicle_data: { brand: 'VOLVO', model: 'FH 540', year: '2019', uf: 'SP', color: 'Branco', is_mock: true },
  })

  await expect(page.getByText(/VOLVO.*FH 540/)).toBeVisible()
  await expect(page.getByText(/Dados de exemplo — em produção, a busca seria feita na API oficial do governo/)).toBeVisible()
})

test('não encontrada em nenhuma fonte: avisa que a placa não foi reconhecida', async ({ page }) => {
  await mockAndSend(page, { found: false, schedule: null, vehicle_data: null })

  await expect(page.getByText(/Placa não reconhecida em nenhuma fonte/)).toBeVisible()
})

test('sem agendamento: oferece cadastrar motorista, carga e caminhão na hora', async ({ page }) => {
  await mockAndSend(page, { found: false, schedule: null, vehicle_data: null })

  await expect(page.getByRole('button', { name: 'Cadastrar motorista, carga e caminhão' })).toBeVisible()
})

test('agendado: não oferece cadastro avulso, já tem os dados', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: {
      driver_name: 'João da Silva',
      driver_document: '12345678900',
      has_driver_document_photo_front: false,
      has_driver_document_photo_back: false,
      has_vehicle_document_photo: false,
      cargo_type: 'Grãos',
      scheduled_date: '2026-09-24',
      status: 'on_time',
    },
    vehicle_data: null,
  })

  await expect(page.getByRole('button', { name: 'Cadastrar motorista, carga e caminhão' })).toHaveCount(0)
})

test('sem agendamento: cadastra motorista/carga na hora e a tela passa a mostrar agendado para hoje', async ({
  page,
}) => {
  await mockAndSend(page, { found: false, schedule: null, vehicle_data: null })
  await page.route('**/api/schedules', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 10,
        plate: 'ABC1D23',
        driver_name: 'Pedro Lima',
        driver_document: '11122233344',
        has_driver_document_photo_front: false,
        has_driver_document_photo_back: false,
        has_vehicle_document_photo: false,
        cargo_type: 'Contêiner',
        scheduled_date: '2026-09-24',
        created_at: '2026-09-24T14:00:00Z',
      }),
    }),
  )

  await page.getByRole('button', { name: 'Cadastrar motorista, carga e caminhão' }).click()

  const plateField = page.getByLabel('Placa')
  await expect(plateField).toHaveValue('ABC1D23')
  await expect(plateField).toBeDisabled()
  await page.getByLabel('Nome do motorista').fill('Pedro Lima')
  await page.getByLabel('Documento do motorista', { exact: true }).fill('11122233344')
  await page.getByLabel('Tipo de carga').fill('Contêiner')
  await page.getByRole('button', { name: 'Cadastrar' }).click()

  await expect(page.getByText('Agendado para hoje')).toBeVisible()
  await expect(page.getByText(/Pedro Lima/)).toBeVisible()
  await expect(page.getByText(/Contêiner/)).toBeVisible()
})
