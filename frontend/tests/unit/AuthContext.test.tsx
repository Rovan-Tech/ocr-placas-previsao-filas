import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../../src/context/AuthContext'
import { fetchCurrentEmployee, type LoginResponse } from '../../src/services/auth'
import {
  getAuthToken,
  notifyPasswordChangeRequired,
  notifySessionInvalid,
  setAuthToken,
} from '../../src/services/authToken'
import { makeEmployee } from './support/fixtures'

vi.mock('../../src/services/auth', () => ({ fetchCurrentEmployee: vi.fn() }))

const STORAGE_KEY = 'ocr-placas.auth'
const fetchCurrentEmployeeMock = vi.mocked(fetchCurrentEmployee)

function Probe() {
  const { employee, token, mustChangePassword, loginWithResponse, onPasswordChanged, logout } =
    useAuth()
  const loginResponse: LoginResponse = {
    access_token: 'novo-token',
    token_type: 'bearer',
    employee: makeEmployee({ full_name: 'Joana Lima' }),
    must_change_password: true,
  }
  return (
    <div>
      <p data-testid="employee">{employee?.full_name ?? 'ninguém'}</p>
      <p data-testid="token">{token ?? 'sem token'}</p>
      <p data-testid="must-change">{String(mustChangePassword)}</p>
      <button type="button" onClick={() => loginWithResponse(loginResponse)}>
        entrar
      </button>
      <button
        type="button"
        onClick={() => onPasswordChanged(makeEmployee({ full_name: 'Joana Atualizada' }))}
      >
        trocou
      </button>
      <button type="button" onClick={logout}>
        sair
      </button>
    </div>
  )
}

function storeSession(mustChangePassword = false) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ token: 'guardado', employee: makeEmployee(), mustChangePassword }),
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

beforeEach(() => {
  fetchCurrentEmployeeMock.mockReset()
  fetchCurrentEmployeeMock.mockResolvedValue(makeEmployee())
})

afterEach(() => {
  setAuthToken(null)
})

describe('AuthProvider', () => {
  it('começa deslogado quando não há sessão guardada', () => {
    renderProvider()

    expect(screen.getByTestId('employee')).toHaveTextContent('ninguém')
    expect(screen.getByTestId('token')).toHaveTextContent('sem token')
    expect(fetchCurrentEmployeeMock).not.toHaveBeenCalled()
  })

  it('restaura a sessão guardada e revalida o funcionário no backend', async () => {
    storeSession()
    fetchCurrentEmployeeMock.mockResolvedValue(makeEmployee({ full_name: 'Nome Revalidado' }))

    renderProvider()

    expect(screen.getByTestId('token')).toHaveTextContent('guardado')
    expect(getAuthToken()).toBe('guardado')
    await waitFor(() => expect(screen.getByTestId('employee')).toHaveTextContent('Nome Revalidado'))
    expect(fetchCurrentEmployeeMock).toHaveBeenCalledWith('guardado')
  })

  it('descarta a sessão guardada quando o backend recusa o token', async () => {
    storeSession()
    fetchCurrentEmployeeMock.mockRejectedValue(new Error('401'))

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('employee')).toHaveTextContent('ninguém'))
    expect(getAuthToken()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('ignora um valor corrompido no armazenamento', () => {
    localStorage.setItem(STORAGE_KEY, '{nao-e-json')

    renderProvider()

    expect(screen.getByTestId('employee')).toHaveTextContent('ninguém')
  })

  it('loginWithResponse guarda token, funcionário e a exigência de trocar a senha', async () => {
    const user = userEvent.setup()
    renderProvider()

    await user.click(screen.getByRole('button', { name: 'entrar' }))

    expect(screen.getByTestId('employee')).toHaveTextContent('Joana Lima')
    expect(screen.getByTestId('token')).toHaveTextContent('novo-token')
    expect(screen.getByTestId('must-change')).toHaveTextContent('true')
    expect(getAuthToken()).toBe('novo-token')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      token: 'novo-token',
      mustChangePassword: true,
    })
  })

  it('onPasswordChanged atualiza o funcionário e libera o acesso', async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole('button', { name: 'entrar' }))

    await user.click(screen.getByRole('button', { name: 'trocou' }))

    expect(screen.getByTestId('employee')).toHaveTextContent('Joana Atualizada')
    expect(screen.getByTestId('must-change')).toHaveTextContent('false')
  })

  it('onPasswordChanged sem sessão não cria uma sessão', async () => {
    const user = userEvent.setup()
    renderProvider()

    await user.click(screen.getByRole('button', { name: 'trocou' }))

    expect(screen.getByTestId('employee')).toHaveTextContent('ninguém')
  })

  it('logout limpa token, estado e armazenamento', async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole('button', { name: 'entrar' }))

    await user.click(screen.getByRole('button', { name: 'sair' }))

    expect(screen.getByTestId('employee')).toHaveTextContent('ninguém')
    expect(getAuthToken()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('encerra a sessão quando a API avisa que o token é inválido', async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole('button', { name: 'entrar' }))

    act(() => notifySessionInvalid())

    expect(screen.getByTestId('employee')).toHaveTextContent('ninguém')
  })

  it('marca a troca de senha como obrigatória quando a API exige', async () => {
    storeSession(false)
    renderProvider()
    await waitFor(() => expect(fetchCurrentEmployeeMock).toHaveBeenCalled())

    act(() => notifyPasswordChangeRequired())

    expect(screen.getByTestId('must-change')).toHaveTextContent('true')
  })

  it('exigir troca de senha sem sessão não faz nada', () => {
    renderProvider()

    act(() => notifyPasswordChangeRequired())

    expect(screen.getByTestId('must-change')).toHaveTextContent('false')
  })

  it('continua funcionando quando o armazenamento local está indisponível', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    renderProvider()

    await user.click(screen.getByRole('button', { name: 'entrar' }))

    expect(screen.getByTestId('employee')).toHaveTextContent('Joana Lima')
    vi.restoreAllMocks()
  })
})

describe('useAuth', () => {
  it('lança erro claro fora do AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow('useAuth precisa estar dentro de <AuthProvider>')
    vi.restoreAllMocks()
  })
})
