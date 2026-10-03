import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAuthToken,
  notifyPasswordChangeRequired,
  notifySessionInvalid,
  setAuthCallbacks,
  setAuthToken,
} from '../../src/services/authToken'

afterEach(() => {
  setAuthToken(null)
  setAuthCallbacks({})
})

describe('authToken', () => {
  it('guarda e limpa o token atual', () => {
    expect(getAuthToken()).toBeNull()

    setAuthToken('abc')
    expect(getAuthToken()).toBe('abc')

    setAuthToken(null)
    expect(getAuthToken()).toBeNull()
  })

  it('dispara os callbacks registrados', () => {
    const onSessionInvalid = vi.fn()
    const onPasswordChangeRequired = vi.fn()
    setAuthCallbacks({ onSessionInvalid, onPasswordChangeRequired })

    notifySessionInvalid()
    notifyPasswordChangeRequired()

    expect(onSessionInvalid).toHaveBeenCalledOnce()
    expect(onPasswordChangeRequired).toHaveBeenCalledOnce()
  })

  it('não falha quando nenhum callback foi registrado', () => {
    setAuthCallbacks({})

    expect(() => notifySessionInvalid()).not.toThrow()
    expect(() => notifyPasswordChangeRequired()).not.toThrow()
  })

  it('registrar só um callback remove o outro', () => {
    const onSessionInvalid = vi.fn()
    const onPasswordChangeRequired = vi.fn()
    setAuthCallbacks({ onSessionInvalid, onPasswordChangeRequired })

    setAuthCallbacks({ onSessionInvalid })
    notifyPasswordChangeRequired()

    expect(onPasswordChangeRequired).not.toHaveBeenCalled()
  })
})
