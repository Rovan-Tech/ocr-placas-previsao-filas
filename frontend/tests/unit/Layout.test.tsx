import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from '../../src/components/Layout'
import { ThemeProvider } from '../../src/context/ThemeContext'
import type { PermissionKey } from '../../src/services/roles'
import { authValue, setAuth } from './support/authMock'
import { makeEmployee, stubMatchMedia } from './support/fixtures'

vi.mock('../../src/context/AuthContext', async () => ({
  useAuth: (await import('./support/authMock')).useAuthMock,
}))

function renderLayout(route = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<p>Conteúdo da captura</p>} />
            <Route path="logs" element={<p>Conteúdo dos logs</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

function withPermissions(permissions: PermissionKey[]) {
  setAuth({ employee: makeEmployee({ permissions }) })
}

beforeEach(() => {
  setAuth()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Layout no desktop', () => {
  beforeEach(() => {
    stubMatchMedia(false)
  })

  it('mostra a marca, o cargo, o nome e o conteúdo da rota', () => {
    renderLayout()

    expect(screen.getByText('Porto Baía Verde')).toBeInTheDocument()
    expect(screen.getByText('Administrador')).toHaveClass('role-chip')
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    expect(screen.getByText('Conteúdo da captura')).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Navegação principal' }),
    ).not.toBeInTheDocument()
  })

  it('lista todos os atalhos para quem tem todas as permissões e marca o atual', () => {
    renderLayout('/logs')

    expect(screen.getByRole('link', { name: 'Capturar placa' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Permissões' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Logs' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Capturar placa' })).not.toHaveAttribute('aria-current')
  })

  it('mostra atalhos sem acesso como bloqueados e esconde Permissões', () => {
    withPermissions(['capture.read_plate'])
    renderLayout()

    expect(screen.getByRole('link', { name: 'Capturar placa' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Logs' })).not.toBeInTheDocument()
    const locked = screen.getByText('Logs').closest('.nav-locked') as HTMLElement
    expect(locked).toHaveAttribute('aria-disabled', 'true')
    expect(within(locked).getByLabelText('Sem acesso')).toBeInTheDocument()
    expect(screen.queryByText('Permissões')).not.toBeInTheDocument()
  })

  it('o botão Sair encerra a sessão', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByRole('button', { name: 'Sair' }))

    expect(authValue.logout).toHaveBeenCalledOnce()
  })

  it('funciona sem funcionário carregado', () => {
    setAuth({ employee: null })
    renderLayout()

    expect(screen.queryByText('Administrador')).not.toBeInTheDocument()
    expect(screen.getByText('Conteúdo da captura')).toBeInTheDocument()
  })

  it('troca para a barra de abas quando a tela encolhe', () => {
    const media = stubMatchMedia(false)
    renderLayout()
    expect(
      screen.queryByRole('navigation', { name: 'Navegação principal' }),
    ).not.toBeInTheDocument()

    act(() => media.emit(true))

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
  })
})

describe('Layout no celular', () => {
  beforeEach(() => {
    stubMatchMedia(true)
  })

  it('mostra a barra de abas sem o menu do cabeçalho e sem a tela só de desktop', () => {
    renderLayout()

    const tabBar = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(tabBar).getByRole('link', { name: 'Capturar' })).toBeInTheDocument()
    expect(within(tabBar).getByRole('link', { name: 'Equipe' })).toBeInTheDocument()
    expect(within(tabBar).queryByText('Permissões')).not.toBeInTheDocument()
    expect(document.querySelector('.app-nav')).not.toBeInTheDocument()
  })

  it('só mostra as abas liberadas ao cargo', () => {
    withPermissions(['capture.read_plate', 'logs.view'])
    renderLayout()

    const tabBar = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(
      within(tabBar)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Capturar', 'Logs'])
  })

  it('para de ouvir mudanças de tela ao desmontar', () => {
    const removeSpy = vi.fn()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: removeSpy })),
    )
    const { unmount } = renderLayout()

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
