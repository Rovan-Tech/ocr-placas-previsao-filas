import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  fetchLogPhoto,
  fetchLogs,
  fetchRecentCheckins,
  fetchScheduleDriverDocumentPhotoBack,
  fetchScheduleDriverDocumentPhotoFront,
  fetchScheduleManifestPhoto,
  fetchScheduleVehicleDocumentPhoto,
} from '../../src/services/api'
import { setAuthCallbacks, setAuthToken } from '../../src/services/authToken'
import { jsonResponse } from './support/fixtures'

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentHeaders(fetchMock: ReturnType<typeof vi.fn>): Headers {
  const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
  return new Headers(options?.headers)
}

afterEach(() => {
  vi.unstubAllGlobals()
  setAuthToken(null)
  setAuthCallbacks({})
})

describe('sessão nas chamadas à API', () => {
  it('envia o token atual no cabeçalho Authorization', async () => {
    setAuthToken('meu-token')
    const fetchMock = mockFetch(jsonResponse([]))

    await fetchRecentCheckins()

    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer meu-token')
  })

  it('não envia Authorization sem token', async () => {
    const fetchMock = mockFetch(jsonResponse([]))

    await fetchRecentCheckins()

    expect(sentHeaders(fetchMock).has('Authorization')).toBe(false)
  })

  it('avisa que a sessão é inválida quando a API responde 401', async () => {
    const onSessionInvalid = vi.fn()
    setAuthCallbacks({ onSessionInvalid })
    mockFetch(jsonResponse({ detail: 'Token expirado.' }, 401))

    const error = await fetchRecentCheckins().catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(401)
    expect(error.message).toBe('Token expirado.')
    expect(onSessionInvalid).toHaveBeenCalledOnce()
  })

  it('exige a troca de senha quando a API devolve o código password_change_required', async () => {
    const onPasswordChangeRequired = vi.fn()
    const onSessionInvalid = vi.fn()
    setAuthCallbacks({ onPasswordChangeRequired, onSessionInvalid })
    mockFetch(
      jsonResponse(
        { detail: { message: 'Troque a senha.', code: 'password_change_required' } },
        403,
      ),
    )

    const error = await fetchRecentCheckins().catch((err) => err)

    expect(error.message).toBe('Troque a senha.')
    expect(error.code).toBe('password_change_required')
    expect(onPasswordChangeRequired).toHaveBeenCalledOnce()
    expect(onSessionInvalid).not.toHaveBeenCalled()
  })

  it('aceita detail em objeto sem código', async () => {
    mockFetch(jsonResponse({ detail: { message: 'Não permitido.' } }, 403))

    const error = await fetchRecentCheckins().catch((err) => err)

    expect(error.message).toBe('Não permitido.')
    expect(error.code).toBeUndefined()
  })

  it.each([
    ['detail numérico', { detail: 7 }],
    ['detail objeto sem message', { detail: { code: 'x' } }],
    ['corpo sem detail', { erro: 'x' }],
    ['corpo nulo', null],
  ])('usa a mensagem genérica quando a resposta tem %s', async (_nome, body) => {
    mockFetch(jsonResponse(body, 500))

    const error = await fetchRecentCheckins().catch((err) => err)

    expect(error.message).toBe('Erro 500 ao chamar o backend.')
  })
})

describe('fetchLogs', () => {
  it('usa limite 50 e deslocamento 0 por padrão', async () => {
    const fetchMock = mockFetch(jsonResponse([]))

    await fetchLogs()

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/logs?limit=50&offset=0')
  })

  it('repassa limite e deslocamento', async () => {
    const fetchMock = mockFetch(jsonResponse([]))

    await fetchLogs({ limit: 10, offset: 30 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/logs?limit=10&offset=30')
  })
})

describe('fotos protegidas', () => {
  it('fetchLogPhoto devolve o blob e envia o token', async () => {
    setAuthToken('tok')
    const fetchMock = mockFetch(new Response('img'))

    const blob = await fetchLogPhoto(12)

    expect(await blob.text()).toBe('img')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/logs/12/photo')
    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer tok')
  })

  it('fetchLogPhoto lança ApiError com o status quando a foto não existe', async () => {
    mockFetch(new Response('', { status: 404 }))

    const error = await fetchLogPhoto(12).catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.message).toBe('Não foi possível carregar a foto.')
  })

  it.each([
    ['frente do documento', fetchScheduleDriverDocumentPhotoFront, 'driver-document-photo-front'],
    ['verso do documento', fetchScheduleDriverDocumentPhotoBack, 'driver-document-photo-back'],
    ['documento do veículo', fetchScheduleVehicleDocumentPhoto, 'vehicle-document-photo'],
    ['manifesto', fetchScheduleManifestPhoto, 'manifest-photo'],
  ])('busca a foto de %s do agendamento', async (_nome, fetchPhoto, path) => {
    setAuthToken('tok')
    const fetchMock = mockFetch(new Response('img'))

    const blob = await fetchPhoto(5)

    expect(await blob.text()).toBe('img')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/schedules/5/${path}`)
    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer tok')
  })

  it('a foto do agendamento lança ApiError quando a resposta falha', async () => {
    mockFetch(new Response('', { status: 403 }))

    const error = await fetchScheduleManifestPhoto(5).catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(403)
  })

  it('a foto sem token não envia Authorization', async () => {
    const fetchMock = mockFetch(new Response('img'))

    await fetchScheduleVehicleDocumentPhoto(5)

    expect(sentHeaders(fetchMock).has('Authorization')).toBe(false)
  })
})
