import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fetchRecentCheckins, uploadPlateImage } from '../../src/services/api'

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
