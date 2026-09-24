import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Employee, LoginResponse } from '../services/auth'
import { fetchCurrentEmployee } from '../services/auth'
import { setAuthCallbacks, setAuthToken } from '../services/authToken'

// Guardado no navegador pra não pedir login de novo a cada recarga de página — é o token
// assinado pelo servidor, nunca a senha (ver o pedido original do usuário e a explicação dada:
// "salvar a senha" na prática vira "lembrar a sessão", sem guardar nada decifrável no cliente).
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
    return null // storage bloqueado (aba anônima, política do navegador) — só pede login de novo
  }
}

function saveStoredSession(session: StoredSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // sem storage disponível: a sessão só dura enquanto a aba ficar aberta, e tudo bem
  }
}

interface AuthContextValue {
  employee: Employee | null
  /** Pras chamadas de services/auth.ts, que exigem passar o token explicitamente (login/troca de
   * senha não usam o api.ts genérico, que o pega sozinho — ver services/authToken.ts). */
  token: string | null
  /** true logo após o cadastro (senha temporária) ou quando os 30 dias da senha vencem — a tela
   * de troca de senha é a única coisa que a aplicação mostra enquanto isso for true. */
  mustChangePassword: boolean
  loginWithResponse: (response: LoginResponse) => void
  onPasswordChanged: (employee: Employee) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => loadStoredSession())

  // O token de dentro do state é a única fonte de verdade pro api.ts anexar nas chamadas.
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

  // Sessão restaurada do storage: confirma que o token ainda vale (o funcionário pode ter sido
  // desativado, ou o token pode ter expirado enquanto a aba estava fechada).
  useEffect(() => {
    if (!session) return
    fetchCurrentEmployee(session.token).catch(() => setSession(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na primeira carga da sessão salva
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
