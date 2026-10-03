import type { Overrides, PermissionKey, PermissionsMatrix, RoleDetail, RoleSummary } from './roles'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface Employee {
  id: number
  username: string
  full_name: string
  role: RoleSummary
  permissions: PermissionKey[]
  overrides: Overrides
  active: boolean
}

export interface PermissionLogEntry {
  id: number
  created_at: string
  actor_username: string
  actor_name: string
  client_ip: string | null
  action: string
  target_name: string
  summary: string
  details: Record<string, unknown>
}

export interface LoginResponse {
  access_token: string
  token_type: string
  employee: Employee
  must_change_password: boolean
}

function errorMessageFromDetail(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in detail) {
    if (typeof detail.message === 'string') return detail.message
  }
  return `Erro ${status} ao chamar o backend.`
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
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? (body as { detail: unknown }).detail
        : null
    throw new Error(errorMessageFromDetail(detail, response.status))
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
  data: { username: string; full_name: string; temporary_password: string; role_id: number },
): Promise<Employee> {
  return authRequest<Employee>('/auth/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
}

export function listEmployees(token: string): Promise<Employee[]> {
  return authRequest<Employee[]>('/auth/employees', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function deactivateEmployee(token: string, employeeId: number): Promise<Employee> {
  return authRequest<Employee>(`/auth/employees/${employeeId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

function jsonInit(token: string, method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

export function fetchPermissions(token: string): Promise<PermissionsMatrix> {
  return authRequest<PermissionsMatrix>('/auth/permissions', jsonInit(token, 'GET'))
}

export function fetchRoles(token: string): Promise<RoleSummary[]> {
  return authRequest<RoleSummary[]>('/auth/roles', jsonInit(token, 'GET'))
}

export function createRole(
  token: string,
  data: { name: string; permissions: PermissionKey[] },
): Promise<RoleDetail> {
  return authRequest<RoleDetail>('/auth/roles', jsonInit(token, 'POST', data))
}

export function updateRole(
  token: string,
  roleId: number,
  data: { name: string; permissions: PermissionKey[] },
): Promise<RoleDetail> {
  return authRequest<RoleDetail>(`/auth/roles/${roleId}`, jsonInit(token, 'PUT', data))
}

export async function deleteRole(token: string, roleId: number): Promise<void> {
  await authRequest<null>(`/auth/roles/${roleId}`, jsonInit(token, 'DELETE'))
}

export function changeEmployeeRole(
  token: string,
  employeeId: number,
  roleId: number,
): Promise<Employee> {
  return authRequest<Employee>(
    `/auth/employees/${employeeId}/role`,
    jsonInit(token, 'PATCH', { role_id: roleId }),
  )
}

export function setEmployeeOverrides(
  token: string,
  employeeId: number,
  overrides: Overrides,
): Promise<Employee> {
  return authRequest<Employee>(
    `/auth/employees/${employeeId}/permissions`,
    jsonInit(token, 'PUT', overrides),
  )
}

export function fetchPermissionLog(token: string, limit = 50): Promise<PermissionLogEntry[]> {
  return authRequest<PermissionLogEntry[]>(
    `/auth/permission-log?limit=${limit}`,
    jsonInit(token, 'GET'),
  )
}
