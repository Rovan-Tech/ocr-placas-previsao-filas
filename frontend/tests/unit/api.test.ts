import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createCheckin,
  createSchedule,
  demoSampleImageUrl,
  fetchDemoSamples,
  fetchRecentCheckins,
  listSchedules,
  submitDemoOcr,
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

function validScheduleInput(overrides: Partial<Parameters<typeof createSchedule>[0]> = {}) {
  const photo = new File(['fake'], 'foto.jpg', { type: 'image/jpeg' })
  return {
    plate: 'ABC1D23',
    driverName: 'João da Silva',
    driverBirthDate: '1990-01-01',
    driverBirthPlace: 'São Luís',
    driverBirthState: 'MA',
    driverDocumentType: 'cpf' as const,
    driverDocument: '12345678900',
    vehicleBrand: 'Volvo',
    vehicleModel: 'FH 540',
    vehicleYear: '2020',
    vehicleChassis: '9BWZZZ377VT004251',
    vehicleColor: 'Branco',
    vehicleLengthM: '12.5',
    vehicleHeightM: '4.0',
    vehicleWidthM: '2.6',
    originLocation: 'São Paulo - SP',
    destinationLocation: 'São Luís - MA',
    cargoItems: [{ productName: 'Grãos', category: 'nao_perecivel' as const }],
    scheduledDate: '2026-09-24',
    driverDocumentPhotoFront: photo,
    driverDocumentPhotoBack: photo,
    vehicleDocumentPhoto: photo,
    manifestPhoto: photo,
    ...overrides,
  }
}

describe('createSchedule', () => {
  it('envia os campos, os produtos da carga e as fotos como multipart para /api/schedules', async () => {
    const body = { id: 1, plate: 'ABC1D23' }
    const fetchMock = mockFetch(jsonResponse(body, 201))

    const result = await createSchedule(validScheduleInput())

    expect(result).toEqual(body)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/schedules')
    expect(options.method).toBe('POST')
    const form = options.body as FormData
    expect(form.get('plate')).toBe('ABC1D23')
    expect(form.get('driver_name')).toBe('João da Silva')
    expect(form.get('driver_birth_place')).toBe('São Luís')
    expect(form.get('driver_birth_state')).toBe('MA')
    expect(form.get('driver_document_type')).toBe('cpf')
    expect(form.get('vehicle_brand')).toBe('Volvo')
    expect(JSON.parse(form.get('cargo_items') as string)).toEqual([
      { product_name: 'Grãos', category: 'nao_perecivel' },
    ])
    expect(form.get('scheduled_date')).toBe('2026-09-24')
    expect((form.get('driver_document_photo_front') as File).name).toBe('foto.jpg')
    expect((form.get('driver_document_photo_back') as File).name).toBe('foto.jpg')
    expect((form.get('vehicle_document_photo') as File).name).toBe('foto.jpg')
    expect((form.get('manifest_photo') as File).name).toBe('foto.jpg')
  })

  it('usa o detail do FastAPI quando a placa é inválida', async () => {
    mockFetch(jsonResponse({ detail: 'Formato de placa inválido.' }, 400))

    const error = await createSchedule(validScheduleInput({ plate: 'NAO-VALIDA' })).catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
  })
})

describe('createCheckin', () => {
  it('envia placa e decisão como multipart para /api/checkins', async () => {
    const body = { id: 1, plate: 'ABC1D23', status: 'admitted', schedule_id: null }
    const fetchMock = mockFetch(jsonResponse(body, 201))

    const result = await createCheckin('ABC1D23', 'admitted')

    expect(result).toEqual(body)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/checkins')
    const form = options.body as FormData
    expect(form.get('plate')).toBe('ABC1D23')
    expect(form.get('status')).toBe('admitted')
    expect(form.has('schedule_id')).toBe(false)
  })

  it('inclui o schedule_id quando informado', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 1 }, 201))

    await createCheckin('ABC1D23', 'cancelled', 7)

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit
    const form = options.body as FormData
    expect(form.get('schedule_id')).toBe('7')
  })

  it('inclui o checkin_id quando informado, pra atualizar o check-in automático', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 42 }, 201))

    await createCheckin('ABC1D23', 'admitted', null, 42)

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit
    const form = options.body as FormData
    expect(form.get('checkin_id')).toBe('42')
    expect(form.has('schedule_id')).toBe(false)
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

describe('fetchDemoSamples', () => {
  it('busca /api/ocr/demo-samples', async () => {
    const body = [{ id: 'limpa_mercosul', description: 'foto boa, controle' }]
    const fetchMock = mockFetch(jsonResponse(body))

    const result = await fetchDemoSamples()

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ocr/demo-samples')
    expect(result).toEqual(body)
  })
})

describe('demoSampleImageUrl', () => {
  it('monta a URL da imagem do exemplo', () => {
    expect(demoSampleImageUrl('limpa_mercosul')).toBe('/api/ocr/demo-samples/limpa_mercosul/image')
  })

  it('escapa o id do exemplo na URL', () => {
    expect(demoSampleImageUrl('a/b')).toBe('/api/ocr/demo-samples/a%2Fb/image')
  })
})

describe('submitDemoOcr', () => {
  it('envia sample_id como multipart para /api/ocr/demo-upload', async () => {
    const body = { plate: 'ABC1D23', plate_format: 'mercosul', confidence: 0.9, needs_review: false, detections: [] }
    const fetchMock = mockFetch(jsonResponse(body))

    const result = await submitDemoOcr({ sampleId: 'limpa_mercosul' })

    expect(result).toEqual(body)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/ocr/demo-upload')
    expect((options.body as FormData).get('sample_id')).toBe('limpa_mercosul')
    expect((options.body as FormData).get('file')).toBeNull()
  })

  it('envia file como multipart para /api/ocr/demo-upload', async () => {
    const body = { plate: null, plate_format: null, confidence: null, needs_review: true, detections: [] }
    const fetchMock = mockFetch(jsonResponse(body))
    const file = new File(['fake'], 'placa.jpg', { type: 'image/jpeg' })

    await submitDemoOcr({ file })

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(((options.body as FormData).get('file') as File).name).toBe('placa.jpg')
    expect((options.body as FormData).get('sample_id')).toBeNull()
  })
})
