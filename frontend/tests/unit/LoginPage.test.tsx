import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../../src/pages/LoginPage'
import { login } from '../../src/services/auth'
import { authValue, setAuth } from './support/authMock'
import { makeEmployee } from './support/fixtures'
import { renderPage } from './support/render'

vi.mock('../../src/context/AuthContext', async () => ({
  useAuth: (await import('./support/authMock')).useAuthMock,
}))
vi.mock('../../src/services/auth', () => ({ login: vi.fn() }))

const loginMock = vi.mocked(login)

beforeEach(() => {
  setAuth({ employee: null, token: null })
  loginMock.mockReset()
})

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Usuário'), 'maria')
  await user.type(screen.getByLabelText('Senha'), 's3nha-forte')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('LoginPage', () => {
  it('apresenta o sistema, os cargos e o atalho para a demonstração', () => {
    renderPage(<LoginPage />)

    expect(screen.getAllByText('Porto Baía Verde').length).toBeGreaterThan(0)
    expect(screen.getByRole('list', { name: 'Cargos do sistema' }).children).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Testar sem login' })).toHaveAttribute('href', '/demo')
  })

  it('mantém Entrar desabilitado até preencher usuário e senha', async () => {
    const user = userEvent.setup()
    renderPage(<LoginPage />)
    const submit = screen.getByRole('button', { name: 'Entrar' })

    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Usuário'), 'maria')
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Senha'), 'x')

    expect(submit).toBeEnabled()
  })

  it('alterna a visibilidade da senha', async () => {
    const user = userEvent.setup()
    renderPage(<LoginPage />)
    const password = screen.getByLabelText('Senha')

    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }))

    expect(password).toHaveAttribute('type', 'password')
  })

  it('entrega a resposta do login ao contexto de autenticação', async () => {
    const user = userEvent.setup()
    const response = {
      access_token: 't',
      token_type: 'bearer',
      employee: makeEmployee(),
      must_change_password: false,
    }
    loginMock.mockResolvedValue(response)
    renderPage(<LoginPage />)

    await fillAndSubmit(user)

    expect(loginMock).toHaveBeenCalledWith('maria', 's3nha-forte')
    expect(authValue.loginWithResponse).toHaveBeenCalledWith(response)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('bloqueia o formulário enquanto entra', async () => {
    const user = userEvent.setup()
    loginMock.mockReturnValue(new Promise(() => {}))
    renderPage(<LoginPage />)

    await fillAndSubmit(user)

    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled()
    expect(screen.getByLabelText('Usuário')).toBeDisabled()
  })

  it('mostra o erro do backend e libera o formulário', async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new Error('Usuário ou senha inválidos.'))
    renderPage(<LoginPage />)

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    expect(authValue.loginWithResponse).not.toHaveBeenCalled()
  })

  it('usa mensagem padrão para erro desconhecido', async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue('x')
    renderPage(<LoginPage />)

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro inesperado ao entrar.')
  })
})
