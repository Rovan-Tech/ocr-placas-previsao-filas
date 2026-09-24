import { expect, test, type Page } from '@playwright/test'
import { loginAsTestUser } from './testAuth'

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page)
})

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function ocrResponse(overrides: Record<string, unknown> = {}) {
  return {
    filename: 'placa.png',
    plate: 'ABC1D23',
    plate_format: 'mercosul',
    confidence: 0.9876,
    needs_review: false,
    verification: {
      status: 'not_checked',
      detail: 'Placa não verificada na base oficial (integração com a SENATRAN não configurada).',
      source: null,
    },
    detections: [
      { text: 'BRASIL', confidence: 0.99 },
      { text: 'ABC1D23', confidence: 0.9876 },
    ],
    ...overrides,
  }
}

function mockOcr(page: Page, { status = 200, body }: { status?: number; body: unknown }) {
  return page.route('**/api/ocr/upload', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

function mockManual(page: Page, { status = 200, body }: { status?: number; body: unknown }) {
  return page.route('**/api/ocr/manual', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

/** Escolhe uma foto e confirma que ela ficou boa — chega ao mesmo ponto que `sendPhoto` tinha
 * antes da tela de conferência da foto existir. */
async function sendPhoto(page: Page) {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
  await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })
  await page.getByRole('button', { name: 'Sim, continuar' }).click()
}

test.describe('conferência da foto antes de enviar', () => {
  test('pede confirmação de que a foto ficou boa antes de chamar o OCR', async ({ page }) => {
    let called = false
    await page.route('**/api/ocr/upload', (route) => {
      called = true
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ocrResponse()) })
    })
    await page.goto('/')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
    await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })

    await expect(page.getByText('A foto ficou nítida e a placa está legível?')).toBeVisible()
    expect(called).toBe(false)

    await page.getByRole('button', { name: 'Sim, continuar' }).click()
    await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
    expect(called).toBe(true)
  })

  test('descarta a foto e volta pra câmera quando não ficou boa', async ({ page }) => {
    await page.goto('/')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
    await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })
    await page.getByRole('button', { name: 'Não, tirar outra' }).click()

    await expect(page.getByRole('button', { name: 'Enviar foto do aparelho' })).toBeVisible()
    await expect(page.getByText('A foto ficou nítida')).toHaveCount(0)
  })

  test('oferece digitar manualmente já na tela de conferência da foto', async ({ page }) => {
    await page.goto('/')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
    await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })
    await page.getByRole('button', { name: 'Prefiro digitar a placa' }).click()

    await expect(page.getByLabel('Digite a placa do veículo')).toBeVisible()
  })
})

test('tira foto pela câmera e envia para o OCR', async ({ page }) => {
  let uploadedContentType
  await page.route('**/api/ocr/upload', (route) => {
    uploadedContentType = route.request().headers()['content-type']
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(ocrResponse({ plate: 'XYZ9A87', detections: [{ text: 'XYZ9A87', confidence: 0.91 }] })),
    })
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'Abrir câmera' }).click()
  await page.getByRole('button', { name: 'Tirar foto' }).click()
  await page.getByRole('button', { name: 'Sim, continuar' }).click()

  await expect(page.getByText('XYZ9A87', { exact: true })).toBeVisible()
  expect(uploadedContentType).toContain('multipart/form-data')
})

test('mostra o erro do backend e permite tentar de novo, ou digitar manualmente', async ({ page }) => {
  let calls = 0
  await page.route('**/api/ocr/upload', (route) => {
    calls += 1
    return calls === 1
      ? route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Não foi possível decodificar a imagem enviada.' }),
        })
      : route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(ocrResponse()),
        })
  })
  await page.goto('/')
  await sendPhoto(page)

  await expect(page.getByText('Não foi possível decodificar a imagem enviada.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Digitar manualmente' })).toBeVisible()

  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
})

test('placa não lida: não aceita em silêncio, exige tirar outra foto ou digitar', async ({ page }) => {
  await mockOcr(page, {
    body: ocrResponse({
      plate: null,
      plate_format: null,
      confidence: null,
      needs_review: true,
      verification: null,
      detections: [{ text: 'SAO PAULO', confidence: 0.8 }],
    }),
  })
  await page.goto('/')
  await sendPhoto(page)

  await expect(page.getByText('Nenhuma placa em formato válido foi lida')).toBeVisible()
  await expect(page.getByText(/leitura incerta não é registrada sozinha/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tirar outra foto' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Digitar manualmente' })).toBeVisible()
  // Sem nenhum jeito de simplesmente seguir em frente com essa leitura.
  await expect(page.getByRole('button', { name: /confirmar/i })).toHaveCount(0)
})

test('leitura incerta: mesmo com placa, exige decisão em vez de aceitar sozinha', async ({ page }) => {
  await mockOcr(page, { body: ocrResponse({ confidence: 0.45, needs_review: true }) })
  await page.goto('/')
  await sendPhoto(page)

  await expect(page.getByText(/Leitura incerta: confira a placa no veículo/)).toBeVisible()
  await expect(page.getByText(/leitura incerta não é registrada sozinha/)).toBeVisible()
  await page.getByRole('button', { name: 'Digitar manualmente' }).click()
  await expect(page.getByLabel('Digite a placa do veículo')).toBeVisible()
})

test('mostra placa antiga com hífen e oferece corrigir manualmente', async ({ page }) => {
  await mockOcr(page, { body: ocrResponse({ plate: 'KLM4821', plate_format: 'antigo' }) })
  await page.goto('/')
  await sendPhoto(page)

  await expect(page.getByText('KLM-4821', { exact: true })).toBeVisible()
  await expect(page.getByText(/Padrão antigo/)).toBeVisible()
  await expect(page.getByText('Não é essa placa?')).toBeVisible()
})

test('alerta placa não encontrada na base oficial como possível falsa', async ({ page }) => {
  await mockOcr(page, {
    body: ocrResponse({
      verification: { status: 'not_found', detail: 'Placa inexistente na base.', source: 'SENATRAN' },
    }),
  })
  await page.goto('/')
  await sendPhoto(page)

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('possível placa falsa')
  await expect(alert).toContainText('Placa inexistente na base.')
  await expect(alert).toContainText('Fonte: SENATRAN')
})

test('mostra placa regular quando a base oficial confirma', async ({ page }) => {
  await mockOcr(page, {
    body: ocrResponse({ verification: { status: 'regular', detail: 'Sem restrições.', source: 'SENATRAN' } }),
  })
  await page.goto('/')
  await sendPhoto(page)

  await expect(page.getByRole('status').filter({ hasText: 'Placa regular' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('reduz o tamanho de uma foto grande do celular antes de enviar', async ({ page }) => {
  let uploadedBytes = 0
  await page.route('**/api/ocr/upload', (route) => {
    uploadedBytes = route.request().postDataBuffer()?.length ?? 0
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(ocrResponse()),
    })
  })
  await page.goto('/')

  // Simula uma foto de celular: um PNG válido "inflado" com bytes extras depois
  // do IEND (o navegador ignora o lixo ao decodificar), reproduzindo o caso real
  // de fotos de câmera saindo com 8+ MB — acima do limite de 5 MB do backend
  // (MAX_UPLOAD_BYTES em backend/app/routers/ocr.py).
  const oversizedPng = Buffer.concat([PNG_1PX, Buffer.alloc(6 * 1024 * 1024)])
  expect(oversizedPng.byteLength).toBeGreaterThan(5 * 1024 * 1024)

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
  await (await fileChooserPromise).setFiles({ name: 'foto-celular.png', mimeType: 'image/png', buffer: oversizedPng })
  await page.getByRole('button', { name: 'Sim, continuar' }).click()

  await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
  // O redimensionamento no navegador precisa deixar o upload bem abaixo do limite de 5 MB.
  expect(uploadedBytes).toBeGreaterThan(0)
  expect(uploadedBytes).toBeLessThan(1024 * 1024)
})

test.describe('digitação manual da placa', () => {
  test('acessível direto da tela inicial, sem precisar tirar foto', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Digitar a placa manualmente' }).click()

    await expect(page.getByLabel('Digite a placa do veículo')).toBeVisible()
  })

  test('identifica o padrão Mercosul pela ordem dos caracteres, sem escolher o formato na tela', async ({
    page,
  }) => {
    await mockManual(page, {
      body: {
        filename: null,
        plate: 'ABC1D23',
        plate_format: 'mercosul',
        confidence: 1.0,
        needs_review: false,
        verification: {
          status: 'not_checked',
          detail: 'Placa não verificada na base oficial (integração com a SENATRAN não configurada).',
          source: null,
        },
        detections: [],
      },
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Digitar a placa manualmente' }).click()
    await expect(page.getByRole('radio')).toHaveCount(0) // nenhuma escolha manual de formato

    await page.getByLabel('Digite a placa do veículo').fill('ABC1D23')
    await page.getByRole('button', { name: 'Confirmar placa' }).click()

    await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
    await expect(page.getByText('Mercosul', { exact: false })).toBeVisible()
  })

  test('identifica o padrão antigo pela ordem dos caracteres', async ({ page }) => {
    await mockManual(page, {
      body: {
        filename: null,
        plate: 'KLM4821',
        plate_format: 'antigo',
        confidence: 1.0,
        needs_review: false,
        verification: { status: 'not_checked', detail: '...', source: null },
        detections: [],
      },
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Digitar a placa manualmente' }).click()
    await page.getByLabel('Digite a placa do veículo').fill('KLM4821')
    await page.getByRole('button', { name: 'Confirmar placa' }).click()

    await expect(page.getByText('KLM-4821', { exact: true })).toBeVisible()
    await expect(page.getByText(/Padrão antigo/)).toBeVisible()
  })

  test('mostra o erro do backend para um formato de placa inválido', async ({ page }) => {
    await mockManual(page, {
      status: 400,
      body: { detail: 'Formato de placa inválido. Use o padrão Mercosul (ex.: ABC1D23) ou o padrão antigo.' },
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Digitar a placa manualmente' }).click()
    await page.getByLabel('Digite a placa do veículo').fill('AAAAAAA')
    await page.getByRole('button', { name: 'Confirmar placa' }).click()

    await expect(page.getByText(/Formato de placa inválido/)).toBeVisible()
    // Continua na tela de digitação — não finge que deu certo.
    await expect(page.getByLabel('Digite a placa do veículo')).toBeVisible()
  })

  test('cancelar volta pra tela inicial', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Digitar a placa manualmente' }).click()
    await page.getByRole('button', { name: 'Cancelar' }).click()

    await expect(page.getByRole('button', { name: 'Digitar a placa manualmente' })).toBeVisible()
  })
})

test.describe('mensagem de processamento', () => {
  test('mostra EM PROCESSAMENTO enquanto o OCR está rodando', async ({ page }) => {
    let resolveRoute: () => void = () => {}
    const routeResolved = new Promise<void>((resolve) => {
      resolveRoute = resolve
    })
    await page.route('**/api/ocr/upload', async (route) => {
      await routeResolved
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ocrResponse()) })
    })
    await page.goto('/')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
    await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })
    await page.getByRole('button', { name: 'Sim, continuar' }).click()

    await expect(page.getByText('EM PROCESSAMENTO')).toBeVisible()

    resolveRoute()
    await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
    await expect(page.getByText('EM PROCESSAMENTO')).toHaveCount(0)
  })
})

test.describe('resguardo: foto salva junto com a digitação manual', () => {
  test('anexa a foto e o que o OCR leu quando a digitação vem de uma leitura incerta', async ({ page }) => {
    await mockOcr(page, { body: ocrResponse({ confidence: 0.4, needs_review: true }) })
    const uploadedFields = { hasPhoto: false }
    await page.route('**/api/ocr/manual', (route) => {
      const contentType = route.request().headers()['content-type'] ?? ''
      uploadedFields.hasPhoto = contentType.includes('multipart/form-data')
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(ocrResponse({ audit_saved: true })),
      })
    })
    await page.goto('/')
    await sendPhoto(page)

    await expect(page.getByText(/leitura incerta não é registrada sozinha/)).toBeVisible()
    await page.getByRole('button', { name: 'Digitar manualmente' }).click()
    await expect(page.getByText('A foto será salva junto com a placa digitada, só de resguardo.')).toBeVisible()

    await page.getByLabel('Digite a placa do veículo').fill('ABC1D23')
    await page.getByRole('button', { name: 'Confirmar placa' }).click()

    await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
    expect(uploadedFields.hasPhoto).toBe(true)
  })

  test('anexa a foto quando o fiscal já recusa na conferência, antes do OCR rodar', async ({ page }) => {
    let calledUpload = false
    await page.route('**/api/ocr/upload', (route) => {
      calledUpload = true
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ocrResponse()) })
    })
    await mockManual(page, { body: ocrResponse({ audit_saved: true }) })
    await page.goto('/')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
    await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })
    await page.getByRole('button', { name: 'Prefiro digitar a placa' }).click()

    await expect(page.getByText('A foto será salva junto com a placa digitada, só de resguardo.')).toBeVisible()
    await page.getByLabel('Digite a placa do veículo').fill('ABC1D23')
    await page.getByRole('button', { name: 'Confirmar placa' }).click()

    await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
    expect(calledUpload).toBe(false) // recusou antes de chegar a chamar o OCR
  })

  test('não anexa foto quando a digitação parte da tela inicial, sem foto nenhuma', async ({ page }) => {
    await mockManual(page, { body: ocrResponse({ audit_saved: null }) })
    await page.goto('/')
    await page.getByRole('button', { name: 'Digitar a placa manualmente' }).click()

    await expect(page.getByText(/será salva junto com a placa/)).toHaveCount(0)
    await page.getByLabel('Digite a placa do veículo').fill('ABC1D23')
    await page.getByRole('button', { name: 'Confirmar placa' }).click()

    await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
  })

  test('avisa quando o resguardo não pôde ser salvo, sem travar a confirmação da placa', async ({ page }) => {
    await mockManual(page, { body: ocrResponse({ audit_saved: false }) })
    await page.goto('/')
    await page.getByRole('button', { name: 'Digitar a placa manualmente' }).click()
    await page.getByLabel('Digite a placa do veículo').fill('ABC1D23')
    await page.getByRole('button', { name: 'Confirmar placa' }).click()

    await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
    await expect(page.getByText(/não foi possível guardar a foto de resguardo/)).toBeVisible()
  })
})
