import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { ThemeProvider } from '../../src/context/ThemeContext'
import type { PermissionKey } from '../../src/services/roles'
import { setAuth } from './support/authMock'
import { makeEmployee } from './support/fixtures'

vi.mock('../../src/context/AuthContext', async () => ({
  useAuth: (await import('./support/authMock')).useAuthMock,
}))

const pageStubs = vi.hoisted(() => ({
  CapturePage: 'Página de captura',
  ChangePasswordPage: 'Página de troca de senha',
  CheckinsPage: 'Página de check-ins',
  CreateEmployeePage: 'Página de funcionários',
  CreateSchedulePage: 'Página de agendamentos',
  DemoPage: 'Página de demonstração',
  LoginPage: 'Página de login',
  LogsPage: 'Página de logs',
  PermissionsPage: 'Página de permissões',
  ReportsPage: 'Página de relatórios',
}))

vi.mock('../../src/pages/CapturePage', () => ({ default: () => <p>{pageStubs.CapturePage}</p> }))
vi.mock('../../src/pages/ChangePasswordPage', () => ({
  default: () => <p>{pageStubs.ChangePasswordPage}</p>,
}))
vi.mock('../../src/pages/CheckinsPage', () => ({ default: () => <p>{pageStubs.CheckinsPage}</p> }))
vi.mock('../../src/pages/CreateEmployeePage', () => ({
  default: () => <p>{pageStubs.CreateEmployeePage}</p>,
}))
vi.mock('../../src/pages/CreateSchedulePage', () => ({
  default: () => <p>{pageStubs.CreateSchedulePage}</p>,
}))
vi.mock('../../src/pages/DemoPage', () => ({ default: () => <p>{pageStubs.DemoPage}</p> }))
vi.mock('../../src/pages/LoginPage', () => ({ default: () => <p>{pageStubs.LoginPage}</p> }))
vi.mock('../../src/pages/LogsPage', () => ({ default: () => <p>{pageStubs.LogsPage}</p> }))
vi.mock('../../src/pages/PermissionsPage', () => ({
  default: () => <p>{pageStubs.PermissionsPage}</p>,
}))
vi.mock('../../src/pages/ReportsPage', () => ({ default: () => <p>{pageStubs.ReportsPage}</p> }))

function renderApp(route: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>
        <App />
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

describe('App - guardas de login', () => {
  it('mostra o login para quem não está autenticado', () => {
    setAuth({ employee: null })
    renderApp('/')

    expect(screen.getByText(pageStubs.LoginPage)).toBeInTheDocument()
  })

  it('exige a troca de senha antes de qualquer tela', () => {
    setAuth({ mustChangePassword: true })
    renderApp('/checkins')

    expect(screen.getByText(pageStubs.ChangePasswordPage)).toBeInTheDocument()
    expect(screen.queryByText(pageStubs.CheckinsPage)).not.toBeInTheDocument()
  })

  it('a demonstração é pública, mesmo sem login', () => {
    setAuth({ employee: null })
    renderApp('/demo')

    expect(screen.getByText(pageStubs.DemoPage)).toBeInTheDocument()
  })
})

describe('App - rotas autenticadas', () => {
  it.each([
    ['/', pageStubs.CapturePage],
    ['/checkins', pageStubs.CheckinsPage],
    ['/logs', pageStubs.LogsPage],
    ['/agendamentos', pageStubs.CreateSchedulePage],
    ['/relatorios', pageStubs.ReportsPage],
    ['/funcionarios', pageStubs.CreateEmployeePage],
    ['/permissoes', pageStubs.PermissionsPage],
  ])('administrador abre %s', (route, text) => {
    renderApp(route)

    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })

  it('redireciona para a primeira tela liberada quando falta permissão', () => {
    withPermissions(['reports.view'])
    renderApp('/logs')

    expect(screen.getByText(pageStubs.ReportsPage)).toBeInTheDocument()
    expect(screen.queryByText(pageStubs.LogsPage)).not.toBeInTheDocument()
  })

  it('a raiz leva quem não captura para a tela liberada', () => {
    withPermissions(['logs.view'])
    renderApp('/')

    expect(screen.getByText(pageStubs.LogsPage)).toBeInTheDocument()
  })

  it('caminho desconhecido volta para a tela inicial do cargo', () => {
    renderApp('/nao-existe')

    expect(screen.getByText(pageStubs.CapturePage)).toBeInTheDocument()
  })
})
