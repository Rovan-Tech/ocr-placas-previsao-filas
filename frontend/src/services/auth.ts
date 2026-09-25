const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface Employee {
  id: number
  username: string
  full_name: string
  is_admin: boolean
  active: boolean
}

export interface LoginResponse {
  access_token: string
  token_type: string
  employee: Employee
  must_change_password: boolean
}

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

export function listEmployees(token: string): Promise<Employee[]> {
  return authRequest<Employee[]>('/auth/employees', { headers: { Authorization: `Bearer ${token}` } })
}

export function deactivateEmployee(token: string, employeeId: number): Promise<Employee> {
  return authRequest<Employee>(`/auth/employees/${employeeId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}
