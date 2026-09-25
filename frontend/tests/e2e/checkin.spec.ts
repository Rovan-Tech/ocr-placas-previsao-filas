import { expect, test, type Page } from '@playwright/test'
import { loginAsTestUser } from './testAuth'

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

const PNG_1PX = Buffer.from(
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

function scheduleInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    driver_name: 'João da Silva',
    driver_document: '12345678900',
    driver_document_validated: true,
    driver_document_validation_detail: 'Número do documento confere com a foto.',
    cargo_items: [{ product_name: 'Grãos', category: 'nao_perecivel' }],
    scheduled_date: '2026-09-24',
    status: 'on_time',
    ...overrides,
  }
}

test('agendado para hoje: mostra motorista, carga e o veículo como confirmação', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: scheduleInfo(),
    vehicle_data: { brand: 'FIAT', model: 'UNO', year: '2015', uf: 'SP', color: 'Branco' },
  })

  await expect(page.getByText('Agendado para hoje')).toBeVisible()
  await expect(page.getByText(/João da Silva/)).toBeVisible()
  await expect(page.getByText(/Grãos/)).toBeVisible()
  await expect(page.getByText(/FIAT.*UNO/)).toBeVisible()
  await expect(page.getByText('Número do documento confere com a foto.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver frente do documento' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver verso do documento' })).toBeVisible()
})

test('documento do motorista não confere com a foto: avisa para conferir manualmente', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: scheduleInfo({
      driver_document_validated: false,
      driver_document_validation_detail: 'Número do documento não foi encontrado na foto — confira manualmente.',
    }),
    vehicle_data: null,
  })

  await expect(page.getByText('Número do documento não foi encontrado na foto — confira manualmente.')).toBeVisible()
})

test('agendado para outra data no futuro: avisa explicitamente que chegou adiantado', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: scheduleInfo({ scheduled_date: '2026-10-05', status: 'early' }),
    vehicle_data: null,
  })

  await expect(page.getByText('Adiantado', { exact: true })).toBeVisible()
  await expect(page.getByText('05/10/2026').first()).toBeVisible()
  await expect(page.getByText(/Motorista chegou adiantado! O agendamento era para 05\/10\/2026\./)).toBeVisible()
})

test('agendado para outra data no passado: mostra "Atrasado" e a data agendada', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: scheduleInfo({ scheduled_date: '2026-09-10', status: 'late' }),
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

  const notice = page.getByRole('note')
  await expect(notice.getByText(/VOLVO.*FH 540/)).toBeVisible()
  await expect(notice.getByText(/Dados de exemplo — em produção, a busca seria feita na API oficial do governo/)).toBeVisible()
})

test('não encontrada em nenhuma fonte: avisa que a placa não foi reconhecida', async ({ page }) => {
  await mockAndSend(page, { found: false, schedule: null, vehicle_data: null })

  await expect(page.getByText(/Placa não reconhecida em nenhuma fonte/)).toBeVisible()
})

test('sem agendamento: oferece cadastrar motorista, carga e caminhão na hora', async ({ page }) => {
  await mockAndSend(page, { found: false, schedule: null, vehicle_data: null })

  await expect(page.getByRole('button', { name: 'Cadastrar motorista, carga e caminhão' })).toBeVisible()
})

test('sem agendamento: não oferece autorizar nem recusar entrada antes do cadastro', async ({ page }) => {
  await mockAndSend(page, {
    found: true,
    schedule: null,
    vehicle_data: { brand: 'VOLKSWAGEN', model: 'GOL', year: '2020', uf: 'RJ', color: 'Prata' },
  })

  await expect(page.getByRole('button', { name: 'Autorizar entrada' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recusar entrada' })).toHaveCount(0)
  await expect(
    page.getByText('Cadastre motorista, carga e caminhão abaixo para poder autorizar ou recusar a entrada.'),
  ).toBeVisible()
})

test('agendado: não oferece cadastro avulso, já tem os dados', async ({ page }) => {
  await mockAndSend(page, { found: true, schedule: scheduleInfo(), vehicle_data: null })

  await expect(page.getByRole('button', { name: 'Cadastrar motorista, carga e caminhão' })).toHaveCount(0)
})

test('qualquer resultado de check-in oferece autorizar ou recusar a entrada', async ({ page }) => {
  await mockAndSend(page, { found: true, schedule: scheduleInfo(), vehicle_data: null })
  await page.route('**/api/checkins', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, plate: 'ABC1D23', status: 'admitted', schedule_id: 1 }),
    }),
  )

  await page.getByRole('button', { name: 'Autorizar entrada' }).click()

  await expect(page.getByText('Entrada autorizada.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Autorizar entrada' })).toHaveCount(0)
})

test('recusar a entrada registra a decisão', async ({ page }) => {
  await mockAndSend(page, { found: true, schedule: scheduleInfo(), vehicle_data: null })
  await page.route('**/api/checkins', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 2, plate: 'ABC1D23', status: 'cancelled', schedule_id: 1 }),
    }),
  )

  await page.getByRole('button', { name: 'Recusar entrada' }).click()

  await expect(page.getByText('Entrada recusada.')).toBeVisible()
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
        driver_document: '11144477735',
        driver_document_validated: true,
        driver_document_validation_detail: 'Número do documento confere com a foto.',
        cargo_items: [{ id: 1, product_name: 'Contêiner', category: 'nao_perecivel' }],
        scheduled_date: '2026-09-24',
        created_at: '2026-09-24T14:00:00Z',
      }),
    }),
  )

  await expect(page.getByRole('button', { name: 'Autorizar entrada' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Cadastrar motorista, carga e caminhão' }).click()

  const plateField = page.getByLabel('Placa')
  await expect(plateField).toHaveValue('ABC1D23')
  await expect(plateField).toBeDisabled()
  await page.getByLabel('Nome do motorista').fill('Pedro Lima')
  await page.getByLabel('Data de nascimento').fill('1988-04-12')
  await mockIbgeCities(page, 'CE', ['Fortaleza'])
  await page.getByLabel('UF').selectOption('CE')
  await page.getByLabel('Local de nascimento').selectOption('Fortaleza')
  await page.getByLabel('Número do documento').fill('11144477735')
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
  await page.getByLabel('Data prevista').fill('2026-09-24')

  for (const label of [
    'Foto da frente do documento do motorista',
    'Foto do verso do documento do motorista',
    'Foto do documento do veículo',
    'Foto do manifesto de carga',
  ]) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByLabel(label).click()])
    await chooser.setFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: PNG_1PX })
  }

  await page.getByRole('button', { name: 'Cadastrar' }).click()

  await expect(page.getByText('Agendado para hoje')).toBeVisible()
  await expect(page.getByText(/Pedro Lima/)).toBeVisible()
  await expect(page.getByText(/Contêiner/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Autorizar entrada' })).toBeVisible()
})
