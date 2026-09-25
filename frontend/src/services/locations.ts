export interface CityOption {
  id: number
  name: string
}

const IBGE_MUNICIPIOS_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados'

export async function fetchCitiesByState(uf: string): Promise<CityOption[]> {
  const response = await fetch(`${IBGE_MUNICIPIOS_URL}/${uf}/municipios?orderBy=nome`)
  if (!response.ok) throw new Error('Não foi possível carregar as cidades dessa UF.')
  const data = (await response.json()) as Array<{ id: number; nome: string }>
  return data.map((city) => ({ id: city.id, name: city.nome }))
}
