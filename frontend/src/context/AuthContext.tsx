import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Employee, LoginResponse } from '../services/auth'
import { fetchCurrentEmployee } from '../services/auth'
import { setAuthCallbacks, setAuthToken } from '../services/authToken'

const STORAGE_KEY = 'ocr-placas.auth'

interface StoredSession {
  token: string
  employee: Employee
  mustChangePassword: boolean
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

function saveStoredSession(session: StoredSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

interface AuthContextValue {
  employee: Employee | null
  token: string | null
  mustChangePassword: boolean
  loginWithResponse: (response: LoginResponse) => void
  onPasswordChanged: (employee: Employee) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => loadStoredSession())

  useEffect(() => {
    setAuthToken(session?.token ?? null)
  }, [session])

  useEffect(() => {
    setAuthCallbacks({
      onSessionInvalid: () => setSession(null),
      onPasswordChangeRequired: () =>
        setSession((current) => (current ? { ...current, mustChangePassword: true } : current)),
    })
  }, [])

  useEffect(() => {
    if (!session) return
    fetchCurrentEmployee(session.token).catch(() => setSession(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => saveStoredSession(session), [session])

  const value = useMemo<AuthContextValue>(
    () => ({
      employee: session?.employee ?? null,
      token: session?.token ?? null,
      mustChangePassword: session?.mustChangePassword ?? false,
      loginWithResponse: (response) =>
        setSession({
          token: response.access_token,
          employee: response.employee,
          mustChangePassword: response.must_change_password,
        }),
      onPasswordChanged: (employee) =>
        setSession((current) => (current ? { ...current, employee, mustChangePassword: false } : current)),
      logout: () => setSession(null),
    }),
    [session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return context
}
