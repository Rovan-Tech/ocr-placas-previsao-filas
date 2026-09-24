import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createSchedule,
  fetchRecentCheckins,
  listSchedules,
  submitPlateManually,
  uploadPlateImage,
} from '../../src/services/api'

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadPlateImage', () => {
  it('envia a imagem como multipart no campo "file" para /api/ocr/upload', async () => {
    const body = { filename: 'placa.jpg', detections: [{ text: 'ABC1D23', confidence: 0.98 }] }
    const fetchMock = mockFetch(jsonResponse(body))
    const file = new File(['fake'], 'placa.jpg', { type: 'image/jpeg' })

    const result = await uploadPlateImage(file)

    expect(result).toEqual(body)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/ocr/upload')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect(((options.body as FormData).get('file') as File).name).toBe('placa.jpg')
  })

  it('usa o detail do FastAPI como mensagem de erro', async () => {
    mockFetch(jsonResponse({ detail: 'Tipo de arquivo não suportado: text/plain' }, 400))

    const error = await uploadPlateImage(new File(['x'], 'a.txt')).catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.message).toBe('Tipo de arquivo não suportado: text/plain')
  })

  it('usa mensagem genérica quando a resposta de erro não é JSON', async () => {
    mockFetch(new Response('Internal Server Error', { status: 500 }))

    const error = await uploadPlateImage(new File(['x'], 'a.jpg')).catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(500)
    expect(error.message).toBe('Erro 500 ao chamar o backend.')
  })

  it('lança ApiError com status 0 quando o backend está fora do ar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await uploadPlateImage(new File(['x'], 'a.jpg')).catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.message).toBe('Não foi possível conectar ao backend.')
  })
})

describe('submitPlateManually', () => {
  it('envia a placa digitada como multipart para /api/ocr/manual, sem contexto', async () => {
    const body = { plate: 'ABC1D23', plate_format: 'mercosul', audit_saved: null }
    const fetchMock = mockFetch(jsonResponse(body))

    const result = await submitPlateManually('ABC1D23')

    expect(result).toEqual(body)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/ocr/manual')
    expect(options.method).toBe('POST')
    const form = options.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('plate')).toBe('ABC1D23')
    expect(form.has('photo')).toBe(false)
    expect(form.has('ocr_plate')).toBe(false)
    expect(form.has('ocr_confidence')).toBe(false)
  })

  it('anexa a foto e o contexto do OCR quando vêm de uma foto que não saiu boa', async () => {
    const fetchMock = mockFetch(jsonResponse({ plate: 'ABC1D23', audit_saved: true }))
    const photo = new File(['fake'], 'placa.jpg', { type: 'image/jpeg' })

    await submitPlateManually('ABC1D23', { photo, ocrPlate: 'ABC1D2Z', ocrConfidence: 0.3 })

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    const form = options.body as FormData
    expect((form.get('photo') as File).name).toBe('placa.jpg')
    expect(form.get('ocr_plate')).toBe('ABC1D2Z')
    expect(form.get('ocr_confidence')).toBe('0.3')
  })

  it('usa o detail do FastAPI quando o formato digitado é inválido', async () => {
    mockFetch(jsonResponse({ detail: 'Formato de placa inválido.' }, 400))

    const error = await submitPlateManually('AAAAAAA').catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.message).toBe('Formato de placa inválido.')
  })
})

describe('fetchRecentCheckins', () => {
  it('busca /api/checkins com limite padrão de 20', async () => {
    const fetchMock = mockFetch(jsonResponse([]))

    await fetchRecentCheckins()

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/checkins?limit=20')
  })

  it('repassa o limite informado', async () => {
    const fetchMock = mockFetch(jsonResponse([]))

    await fetchRecentCheckins({ limit: 5 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/checkins?limit=5')
  })
})

describe('createSchedule', () => {
  it('envia os campos e as fotos como multipart para /api/schedules', async () => {
    const body = { id: 1, plate: 'ABC1D23' }
    const fetchMock = mockFetch(jsonResponse(body, 201))
    const driverDocumentPhoto = new File(['fake'], 'cnh.jpg', { type: 'image/jpeg' })

    const result = await createSchedule({
      plate: 'ABC1D23',
      driverName: 'João da Silva',
      driverDocument: '12345678900',
      cargoType: 'Grãos',
      scheduledDate: '2026-09-24',
      driverDocumentPhoto,
    })

    expect(result).toEqual(body)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/schedules')
    expect(options.method).toBe('POST')
    const form = options.body as FormData
    expect(form.get('plate')).toBe('ABC1D23')
    expect(form.get('driver_name')).toBe('João da Silva')
    expect(form.get('driver_document')).toBe('12345678900')
    expect(form.get('cargo_type')).toBe('Grãos')
    expect(form.get('scheduled_date')).toBe('2026-09-24')
    expect((form.get('driver_document_photo') as File).name).toBe('cnh.jpg')
    expect(form.has('vehicle_document_photo')).toBe(false)
  })

  it('usa o detail do FastAPI quando a placa é inválida', async () => {
    mockFetch(jsonResponse({ detail: 'Formato de placa inválido.' }, 400))

    const error = await createSchedule({
      plate: 'NAO-VALIDA',
      driverName: 'João',
      driverDocument: '123',
      cargoType: 'Grãos',
      scheduledDate: '2026-09-24',
    }).catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
  })
})

describe('listSchedules', () => {
  it('busca /api/schedules sem filtro', async () => {
    const fetchMock = mockFetch(jsonResponse([]))

    await listSchedules()

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/schedules')
  })

  it('filtra por placa quando informada', async () => {
    const fetchMock = mockFetch(jsonResponse([]))

    await listSchedules('ABC1D23')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/schedules?plate=ABC1D23')
  })
})
