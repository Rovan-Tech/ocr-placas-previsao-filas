import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCitiesByState } from '../../src/services/locations'

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

describe('fetchCitiesByState', () => {
  it('busca os municípios da UF na API do IBGE e devolve id/nome', async () => {
    const fetchMock = mockFetch(
      jsonResponse([
        { id: 2304400, nome: 'Fortaleza' },
        { id: 2303709, nome: 'Caucaia' },
      ]),
    )

    const cities = await fetchCitiesByState('CE')

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://servicodados.ibge.gov.br/api/v1/localidades/estados/CE/municipios?orderBy=nome',
    )
    expect(cities).toEqual([
      { id: 2304400, name: 'Fortaleza' },
      { id: 2303709, name: 'Caucaia' },
    ])
  })

  it('lança erro quando a API do IBGE responde com falha', async () => {
    mockFetch(jsonResponse({ error: 'indisponível' }, 500))

    await expect(fetchCitiesByState('CE')).rejects.toThrow('Não foi possível carregar as cidades dessa UF.')
  })
})
