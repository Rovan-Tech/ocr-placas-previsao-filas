// Login, troca de senha e cadastro de funcionário — ver app/routers/auth.py no backend.

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface Employee {
  id: number
  username: string
  full_name: string
  is_admin: boolean
  /** false depois de excluído (ver deactivateEmployee) — o cadastro fica no histórico, só sem
   * acesso; um funcionário comum só vê a própria conta, sempre `active: true`, nesse campo. */
  active: boolean
}

export interface LoginResponse {
  access_token: string
  token_type: string
  employee: Employee
  /** true logo após o cadastro (senha temporária) ou quando os 30 dias da senha atual vencem —
   * a tela deve levar direto pra "trocar senha" antes de liberar o resto do sistema. */
  must_change_password: boolean
}

// Não reaproveita o `request()` de api.ts de propósito: login/troca de senha tratam o próprio
// erro na tela (usuário/senha errados, sessão ainda não existe) e nunca devem disparar o
// logout/redirecionamento globais que um 401 comum dispara nas outras chamadas (ver api.ts).
async function authRequest<T>(path: string, options: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, options)
  } catch {
    throw new Error('Não foi possível conectar ao backend.')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : null
    const message =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string'
          ? detail.message
          : `Erro ${response.status} ao chamar o backend.`
    throw new Error(message)
  }
  return body as T
}

/** Usuário e senha — form-urlencoded (padrão OAuth2 do FastAPI), não JSON. */
export function login(username: string, password: string): Promise<LoginResponse> {
  const form = new URLSearchParams({ username, password })
  return authRequest<LoginResponse>('/auth/login', { method: 'POST', body: form })
}

export function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<Employee> {
  return authRequest<Employee>('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

export function fetchCurrentEmployee(token: string): Promise<Employee> {
  return authRequest<Employee>('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
}

/** Só o admin master consegue: ver Employee.is_admin. */
export function createEmployee(
  token: string,
  data: { username: string; full_name: string; temporary_password: string; is_admin?: boolean },
): Promise<Employee> {
  return authRequest<Employee>('/auth/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
}

/** Todos os funcionários, ativos ou não — só o admin master consegue. */
export function listEmployees(token: string): Promise<Employee[]> {
  return authRequest<Employee[]>('/auth/employees', { headers: { Authorization: `Bearer ${token}` } })
}

/**
 * Desliga o acesso de um funcionário (saiu da empresa) — só o admin master consegue. Não apaga o
 * cadastro: o histórico de quem enviou cada foto continua existindo (ver GET /logs).
 */
export function deactivateEmployee(token: string, employeeId: number): Promise<Employee> {
  return authRequest<Employee>(`/auth/employees/${employeeId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}
