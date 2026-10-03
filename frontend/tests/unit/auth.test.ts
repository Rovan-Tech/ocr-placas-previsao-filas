import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  changeEmployeeRole,
  changePassword,
  createEmployee,
  createRole,
  deactivateEmployee,
  deleteRole,
  fetchCurrentEmployee,
  fetchPermissionLog,
  fetchPermissions,
  fetchRoles,
  listEmployees,
  login,
  setEmployeeOverrides,
  updateRole,
} from '../../src/services/auth'
import { jsonResponse } from './support/fixtures'

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function callAt(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  return fetchMock.mock.calls[index] as [string, RequestInit]
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  return callAt(fetchMock, 0)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('login', () => {
  it('envia usuário e senha como formulário url-encoded e devolve a sessão', async () => {
    const body = { access_token: 't', token_type: 'bearer', must_change_password: false }
    const fetchMock = mockFetch(jsonResponse(body))

    const result = await login('maria', 's3nha')

    expect(result).toEqual(body)
    const [url, options] = lastCall(fetchMock)
    expect(url).toBe('/api/auth/login')
    expect(options.method).toBe('POST')
    expect(String(options.body)).toBe('username=maria&password=s3nha')
  })

  it('usa o detail em texto do backend como mensagem', async () => {
    mockFetch(jsonResponse({ detail: 'Usuário ou senha inválidos.' }, 401))

    await expect(login('maria', 'errada')).rejects.toThrow('Usuário ou senha inválidos.')
  })

  it('usa o detail.message quando o backend devolve um objeto', async () => {
    mockFetch(jsonResponse({ detail: { message: 'Conta bloqueada.', code: 'locked' } }, 403))

    await expect(login('maria', 'x')).rejects.toThrow('Conta bloqueada.')
  })

  it.each([
    ['sem detail', { erro: 'x' }],
    ['detail objeto sem message', { detail: { code: 'x' } }],
    ['detail numérico', { detail: 42 }],
    ['corpo nulo', null],
  ])('cai na mensagem genérica com o status quando a resposta vem %s', async (_nome, body) => {
    mockFetch(jsonResponse(body, 500))

    await expect(login('maria', 'x')).rejects.toThrow('Erro 500 ao chamar o backend.')
  })

  it('cai na mensagem genérica quando o corpo de erro não é JSON', async () => {
    mockFetch(new Response('<html>', { status: 502 }))

    await expect(login('maria', 'x')).rejects.toThrow('Erro 502 ao chamar o backend.')
  })

  it('avisa que não conseguiu conectar quando o fetch falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(login('maria', 'x')).rejects.toThrow('Não foi possível conectar ao backend.')
  })
})

describe('chamadas autenticadas', () => {
  const employee = { id: 1, username: 'maria' }

  it('changePassword envia as senhas em JSON com o Bearer token', async () => {
    const fetchMock = mockFetch(jsonResponse(employee))

    await changePassword('tok', 'velha', 'nova')

    const [url, options] = lastCall(fetchMock)
    expect(url).toBe('/api/auth/change-password')
    expect(options.method).toBe('POST')
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(JSON.parse(String(options.body))).toEqual({
      current_password: 'velha',
      new_password: 'nova',
    })
  })

  it('fetchCurrentEmployee consulta /auth/me com o token', async () => {
    const fetchMock = mockFetch(jsonResponse(employee))

    expect(await fetchCurrentEmployee('tok')).toEqual(employee)

    const [url, options] = lastCall(fetchMock)
    expect(url).toBe('/api/auth/me')
    expect(options.headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('createEmployee envia os dados do novo funcionário', async () => {
    const fetchMock = mockFetch(jsonResponse(employee, 201))
    const data = { username: 'joao', full_name: 'João', temporary_password: 'abc12345', role_id: 2 }

    await createEmployee('tok', data)

    const [url, options] = lastCall(fetchMock)
    expect(url).toBe('/api/auth/employees')
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toEqual(data)
  })

  it('listEmployees faz GET em /auth/employees', async () => {
    const fetchMock = mockFetch(jsonResponse([employee]))

    expect(await listEmployees('tok')).toEqual([employee])

    expect(lastCall(fetchMock)[0]).toBe('/api/auth/employees')
  })

  it('deactivateEmployee faz DELETE no funcionário', async () => {
    const fetchMock = mockFetch(jsonResponse(employee))

    await deactivateEmployee('tok', 7)

    const [url, options] = lastCall(fetchMock)
    expect(url).toBe('/api/auth/employees/7')
    expect(options.method).toBe('DELETE')
  })

  it('fetchPermissions e fetchRoles fazem GET sem corpo', async () => {
    const fetchMock = mockFetch(jsonResponse({ catalog: [], roles: [] }))

    await fetchPermissions('tok')
    await fetchRoles('tok')

    const permissionsCall = callAt(fetchMock, 0)
    const rolesCall = callAt(fetchMock, 1)
    expect(permissionsCall[0]).toBe('/api/auth/permissions')
    expect(permissionsCall[1].method).toBe('GET')
    expect(permissionsCall[1].body).toBeUndefined()
    expect(rolesCall[0]).toBe('/api/auth/roles')
  })

  it('createRole e updateRole enviam nome e permissões', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 5 }))
    const data = { name: 'Conferente', permissions: ['logs.view' as const] }

    await createRole('tok', data)
    await updateRole('tok', 5, data)

    const createCall = callAt(fetchMock, 0)
    const updateCall = callAt(fetchMock, 1)
    expect(createCall[0]).toBe('/api/auth/roles')
    expect(createCall[1].method).toBe('POST')
    expect(updateCall[0]).toBe('/api/auth/roles/5')
    expect(updateCall[1].method).toBe('PUT')
    expect(JSON.parse(String(updateCall[1].body))).toEqual(data)
  })

  it('deleteRole faz DELETE e não devolve nada', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }))

    expect(await deleteRole('tok', 5)).toBeUndefined()

    const [url, options] = lastCall(fetchMock)
    expect(url).toBe('/api/auth/roles/5')
    expect(options.method).toBe('DELETE')
  })

  it('changeEmployeeRole faz PATCH com o novo cargo', async () => {
    const fetchMock = mockFetch(jsonResponse(employee))

    await changeEmployeeRole('tok', 3, 9)

    const [url, options] = lastCall(fetchMock)
    expect(url).toBe('/api/auth/employees/3/role')
    expect(options.method).toBe('PATCH')
    expect(JSON.parse(String(options.body))).toEqual({ role_id: 9 })
  })

  it('setEmployeeOverrides faz PUT com as exceções', async () => {
    const fetchMock = mockFetch(jsonResponse(employee))
    const overrides = { granted: ['logs.view' as const], denied: [] }

    await setEmployeeOverrides('tok', 3, overrides)

    const [url, options] = lastCall(fetchMock)
    expect(url).toBe('/api/auth/employees/3/permissions')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(String(options.body))).toEqual(overrides)
  })

  it('fetchPermissionLog usa o limite informado ou 50 por padrão', async () => {
    const fetchMock = mockFetch(jsonResponse([]))

    await fetchPermissionLog('tok')
    await fetchPermissionLog('tok', 10)

    const defaultCall = callAt(fetchMock, 0)
    const limitedCall = callAt(fetchMock, 1)
    expect(defaultCall[0]).toBe('/api/auth/permission-log?limit=50')
    expect(limitedCall[0]).toBe('/api/auth/permission-log?limit=10')
  })
})
