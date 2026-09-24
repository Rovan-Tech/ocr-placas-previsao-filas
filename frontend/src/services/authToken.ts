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
