// Ponte entre `api.ts` (funções soltas, sem acesso ao React) e o `AuthContext` (que sabe o
// estado de login). `api.ts` lê o token daqui pra anexar em toda chamada, e avisa por aqui
// quando uma resposta diz "sessão inválida" ou "precisa trocar a senha" — o AuthContext se
// inscreve nesses avisos assim que a aplicação sobe (ver AuthContext.tsx).
let currentToken: string | null = null
let onSessionInvalid: (() => void) | null = null
let onPasswordChangeRequired: (() => void) | null = null

export function getAuthToken(): string | null {
  return currentToken
}

export function setAuthToken(token: string | null): void {
  currentToken = token
}

export function setAuthCallbacks(callbacks: {
  onSessionInvalid?: () => void
  onPasswordChangeRequired?: () => void
}): void {
  onSessionInvalid = callbacks.onSessionInvalid ?? null
  onPasswordChangeRequired = callbacks.onPasswordChangeRequired ?? null
}

export function notifySessionInvalid(): void {
  onSessionInvalid?.()
}

export function notifyPasswordChangeRequired(): void {
  onPasswordChangeRequired?.()
}
