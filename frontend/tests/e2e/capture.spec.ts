import { expect, test, type Page } from '@playwright/test'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function mockOcr(page: Page, { status = 200, body }: { status?: number; body: unknown }) {
  return page.route('**/api/ocr/upload', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

test('envia foto do aparelho e mostra a placa lida', async ({ page }) => {
  await mockOcr(page, {
    body: {
      filename: 'placa.png',
      detections: [
        { text: 'BR', confidence: 0.4 },
        { text: 'ABC1D23', confidence: 0.9876 },
      ],
    },
  })
  await page.goto('/')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })

  await expect(page.getByText('ABC1D23', { exact: true })).toBeVisible()
  await expect(page.getByText('Confiança: 98.8%')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Foto enviada da placa' })).toBeVisible()

  await page.getByRole('button', { name: 'Nova foto' }).click()
  await expect(page.getByRole('button', { name: 'Abrir câmera' })).toBeVisible()
})

test('tira foto pela câmera e envia para o OCR', async ({ page }) => {
  let uploadedContentType
  await page.route('**/api/ocr/upload', (route) => {
    uploadedContentType = route.request().headers()['content-type']
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ filename: 'placa.jpg', detections: [{ text: 'XYZ9A87', confidence: 0.91 }] }),
    })
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'Abrir câmera' }).click()
  await page.getByRole('button', { name: 'Tirar foto' }).click()

  await expect(page.getByText('XYZ9A87')).toBeVisible()
  expect(uploadedContentType).toContain('multipart/form-data')
})

test('mostra o erro do backend e permite tentar de novo', async ({ page }) => {
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
          body: JSON.stringify({ filename: 'placa.png', detections: [{ text: 'ABC1D23', confidence: 0.9 }] }),
        })
  })
  await page.goto('/')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
  await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })

  await expect(page.getByText('Não foi possível decodificar a imagem enviada.')).toBeVisible()
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByText('ABC1D23')).toBeVisible()
})

test('avisa quando o OCR não encontra texto', async ({ page }) => {
  await mockOcr(page, { body: { filename: 'placa.png', detections: [] } })
  await page.goto('/')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Enviar foto do aparelho' }).click()
  await (await fileChooserPromise).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PNG_1PX })

  await expect(page.getByText(/Nenhum texto foi lido na imagem/)).toBeVisible()
})

test('reduz o tamanho de uma foto grande do celular antes de enviar', async ({ page }) => {
  let uploadedBytes = 0
  await page.route('**/api/ocr/upload', (route) => {
    uploadedBytes = route.request().postDataBuffer()?.length ?? 0
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ filename: 'placa.jpg', detections: [{ text: 'ABC1D23', confidence: 0.9 }] }),
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

  await expect(page.getByText('ABC1D23')).toBeVisible()
  // O redimensionamento no navegador precisa deixar o upload bem abaixo do limite de 5 MB.
  expect(uploadedBytes).toBeGreaterThan(0)
  expect(uploadedBytes).toBeLessThan(1024 * 1024)
})
