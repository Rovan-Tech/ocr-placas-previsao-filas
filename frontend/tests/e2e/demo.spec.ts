import { expect, test, type Page } from '@playwright/test'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const SAMPLES = [
  { id: 'limpa_mercosul', description: 'foto boa, controle' },
  { id: 'suja', description: 'placa com barro e riscos' },
]

function mockDemoSamples(page: Page, samples: unknown[] = SAMPLES) {
  return page.route('**/api/ocr/demo-samples', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(samples) }),
  )
}

function mockDemoSampleImages(page: Page) {
  return page.route('**/api/ocr/demo-samples/*/image', (route) =>
    route.fulfill({ contentType: 'image/jpeg', body: PNG_1PX }),
  )
}

function demoUploadResponse(overrides: Record<string, unknown> = {}) {
  return {
    plate: 'ABC1D23',
    plate_format: 'mercosul',
    confidence: 0.95,
    needs_review: false,
    detections: [{ text: 'ABC1D23', confidence: 0.95 }],
    ...overrides,
  }
}

test.beforeEach(async ({ page }) => {
  await mockDemoSamples(page)
  await mockDemoSampleImages(page)
})

test('acessa a demonstração direto, sem passar pelo login', async ({ page }) => {
  await page.goto('/demo')

  await expect(page.getByRole('heading', { name: 'Testar o OCR de placas' })).toBeVisible()
  await expect(page.getByLabel('Usuário')).toHaveCount(0)
})

test('mostra o aviso de modo de demonstração', async ({ page }) => {
  await page.goto('/demo')

  await expect(page.getByText(/nada aqui fica gravado como registro de produção/)).toBeVisible()
})

test('lista os exemplos disponíveis e roda o OCR ao escolher um', async ({ page }) => {
  let sentBody = ''
  await page.route('**/api/ocr/demo-upload', (route) => {
    sentBody = route.request().postData() ?? ''
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(demoUploadResponse()) })
  })
  await page.goto('/demo')

  await expect(page.getByText('foto boa, controle')).toBeVisible()
  await expect(page.getByText('placa com barro e riscos')).toBeVisible()

  await page.getByRole('button', { name: /foto boa, controle/ }).click()

  await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
  expect(sentBody).toContain('limpa_mercosul')
})

test('permite enviar a própria foto em vez de escolher um exemplo', async ({ page }) => {
  let uploadedContentType = ''
  await page.route('**/api/ocr/demo-upload', (route) => {
    uploadedContentType = route.request().headers()['content-type']
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(demoUploadResponse()) })
  })
  await page.goto('/demo')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
  await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })

  await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
  expect(uploadedContentType).toContain('multipart/form-data')
})

test('mostra o erro do backend quando a leitura falha', async ({ page }) => {
  await page.route('**/api/ocr/demo-upload', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Não foi possível decodificar a imagem enviada.' }),
    }),
  )
  await page.goto('/demo')

  await page.getByRole('button', { name: /foto boa, controle/ }).click()

  await expect(page.getByText('Não foi possível decodificar a imagem enviada.')).toBeVisible()
})

test('permite testar outra placa depois do resultado', async ({ page }) => {
  await page.route('**/api/ocr/demo-upload', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(demoUploadResponse()) }),
  )
  await page.goto('/demo')
  await page.getByRole('button', { name: /foto boa, controle/ }).click()
  await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Testar outra placa' }).click()

  await expect(page.getByText('foto boa, controle')).toBeVisible()
  await expect(page.getByText('ABC1D23', { exact: true })).toHaveCount(0)
})

test('link "Testar sem login" na tela de login leva pra demonstração', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: 'Testar sem login' }).click()

  await expect(page.getByRole('heading', { name: 'Testar o OCR de placas' })).toBeVisible()
})
