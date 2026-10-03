import { vi } from 'vitest'
import type { Employee } from '../../../src/services/auth'
import { makeEmployee } from './fixtures'

interface AuthValue {
  employee: Employee | null
  token: string | null
  mustChangePassword: boolean
  loginWithResponse: ReturnType<typeof vi.fn>
  onPasswordChanged: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
}

export const authValue: AuthValue = {
  employee: makeEmployee(),
  token: 'tok',
  mustChangePassword: false,
  loginWithResponse: vi.fn(),
  onPasswordChanged: vi.fn(),
  logout: vi.fn(),
}

export function setAuth(partial: Partial<AuthValue> = {}) {
  authValue.employee = makeEmployee()
  authValue.token = 'tok'
  authValue.mustChangePassword = false
  authValue.loginWithResponse = vi.fn()
  authValue.onPasswordChanged = vi.fn()
  authValue.logout = vi.fn()
  Object.assign(authValue, partial)
}

export function useAuthMock(): AuthValue {
  return authValue
}
