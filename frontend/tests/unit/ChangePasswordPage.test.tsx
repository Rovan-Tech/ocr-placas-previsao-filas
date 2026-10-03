import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChangePasswordPage from '../../src/pages/ChangePasswordPage'
import { changePassword } from '../../src/services/auth'
import { authValue, setAuth } from './support/authMock'
import { makeEmployee } from './support/fixtures'
import { renderPage } from './support/render'

vi.mock('../../src/context/AuthContext', async () => ({
  useAuth: (await import('./support/authMock')).useAuthMock,
}))
vi.mock('../../src/services/auth', () => ({ changePassword: vi.fn() }))

const changePasswordMock = vi.mocked(changePassword)

beforeEach(() => {
  setAuth({ mustChangePassword: true })
  changePasswordMock.mockReset()
})

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { current = 'antiga123', next = 'nova-senha-1', confirm = 'nova-senha-1' } = {},
) {
  await user.type(screen.getByLabelText('Senha atual'), current)
  await user.type(screen.getByLabelText('Nova senha'), next)
  await user.type(screen.getByLabelText('Confirme a nova senha'), confirm)
}

describe('ChangePasswordPage', () => {
  it('só habilita o envio com os três campos preenchidos', async () => {
    const user = userEvent.setup()
    renderPage(<ChangePasswordPage />)
    const submit = screen.getByRole('button', { name: 'Trocar senha' })

    expect(submit).toBeDisabled()
    await fill(user)

    expect(submit).toBeEnabled()
  })

  it('troca a senha e avisa o contexto com o funcionário atualizado', async () => {
    const user = userEvent.setup()
    const updated = makeEmployee({ full_name: 'Maria Atualizada' })
    changePasswordMock.mockResolvedValue(updated)
    renderPage(<ChangePasswordPage />)

    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(changePasswordMock).toHaveBeenCalledWith('tok', 'antiga123', 'nova-senha-1')
    expect(authValue.onPasswordChanged).toHaveBeenCalledWith(updated)
  })

  it('recusa senha nova curta sem chamar a API', async () => {
    const user = userEvent.setup()
    renderPage(<ChangePasswordPage />)

    await fill(user, { next: 'curta', confirm: 'curta' })
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A nova senha precisa ter pelo menos 8 caracteres.',
    )
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('recusa confirmação diferente sem chamar a API', async () => {
    const user = userEvent.setup()
    renderPage(<ChangePasswordPage />)

    await fill(user, { confirm: 'outra-senha-1' })
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(screen.getByRole('alert')).toHaveTextContent('As duas senhas digitadas são diferentes.')
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('não faz nada sem token', async () => {
    const user = userEvent.setup()
    setAuth({ token: null })
    renderPage(<ChangePasswordPage />)

    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(changePasswordMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('bloqueia o formulário enquanto troca', async () => {
    const user = userEvent.setup()
    changePasswordMock.mockReturnValue(new Promise(() => {}))
    renderPage(<ChangePasswordPage />)

    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(screen.getByRole('button', { name: 'Trocando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeDisabled()
  })

  it.each([
    ['uma Error', new Error('Senha atual incorreta.'), 'Senha atual incorreta.'],
    ['um valor desconhecido', 'x', 'Erro inesperado ao trocar a senha.'],
  ])('mostra o erro quando a API falha com %s', async (_nome, failure, message) => {
    const user = userEvent.setup()
    changePasswordMock.mockRejectedValue(failure)
    renderPage(<ChangePasswordPage />)

    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(authValue.onPasswordChanged).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Trocar senha' })).toBeEnabled()
  })

  it('permite sair sem trocar a senha', async () => {
    const user = userEvent.setup()
    renderPage(<ChangePasswordPage />)

    await user.click(screen.getByRole('button', { name: 'Sair' }))

    expect(authValue.logout).toHaveBeenCalledOnce()
  })
})
