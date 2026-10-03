import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PermissionsPage from '../../src/pages/PermissionsPage'
import {
  createRole,
  deleteRole,
  fetchPermissionLog,
  fetchPermissions,
  updateRole,
  type PermissionLogEntry,
} from '../../src/services/auth'
import type { PermissionsMatrix, RoleDetail } from '../../src/services/roles'
import { setAuth } from './support/authMock'
import { ADMIN_ROLE } from './support/fixtures'
import { renderPage } from './support/render'

vi.mock('../../src/context/AuthContext', async () => ({
  useAuth: (await import('./support/authMock')).useAuthMock,
}))
vi.mock('../../src/services/auth', () => ({
  createRole: vi.fn(),
  deleteRole: vi.fn(),
  fetchPermissionLog: vi.fn(),
  fetchPermissions: vi.fn(),
  updateRole: vi.fn(),
}))

const createRoleMock = vi.mocked(createRole)
const deleteRoleMock = vi.mocked(deleteRole)
const fetchLogMock = vi.mocked(fetchPermissionLog)
const fetchPermissionsMock = vi.mocked(fetchPermissions)
const updateRoleMock = vi.mocked(updateRole)

const adminRole: RoleDetail = { ...ADMIN_ROLE, permissions: ['logs.view'] }
const monitorRole: RoleDetail = {
  id: 7,
  key: 'monitor',
  name: 'Monitor',
  is_system: false,
  permissions: [],
}
const matrix: PermissionsMatrix = {
  catalog: [
    {
      key: 'logs',
      label: 'Logs',
      permissions: [
        { key: 'logs.view', label: 'Ver logs', description: 'Abre os logs.' },
        { key: 'reports.view', label: 'Ver relatórios', description: 'Abre os relatórios.' },
      ],
    },
  ],
  roles: [adminRole, monitorRole],
}
const logEntry: PermissionLogEntry = {
  id: 1,
  created_at: '2026-03-10T12:30:00Z',
  actor_username: 'maria',
  actor_name: 'Maria Souza',
  client_ip: '10.0.0.5',
  action: 'role.update',
  target_name: 'Monitor',
  summary: 'Cargo Monitor ganhou "Ver logs"',
  details: {},
}

beforeEach(() => {
  setAuth()
  createRoleMock.mockReset()
  deleteRoleMock.mockReset()
  updateRoleMock.mockReset()
  fetchLogMock.mockReset().mockResolvedValue([logEntry])
  fetchPermissionsMock.mockReset().mockResolvedValue(matrix)
})

async function renderLoaded() {
  renderPage(<PermissionsPage />)
  await screen.findByRole('tab', { name: 'Administrador' })
}

describe('PermissionsPage - carregamento', () => {
  it('mostra carregando e depois abas, permissões do primeiro cargo e histórico', async () => {
    renderPage(<PermissionsPage />)

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    await screen.findByRole('tab', { name: 'Administrador' })

    expect(fetchPermissionsMock).toHaveBeenCalledWith('tok')
    expect(screen.getByRole('tab', { name: 'Administrador' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByLabelText('Ver logs')).toBeChecked()
    expect(screen.getByLabelText('Ver relatórios')).not.toBeChecked()
    expect(await screen.findByText('Cargo Monitor ganhou "Ver logs"')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma alteração pendente')).toBeInTheDocument()
  })

  it('mostra o erro quando as permissões não carregam', async () => {
    fetchPermissionsMock.mockRejectedValue(new Error('Sem acesso.'))
    renderPage(<PermissionsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem acesso.')
    expect(screen.queryByText('Carregando…')).not.toBeInTheDocument()
  })

  it('usa mensagem padrão para erro desconhecido', async () => {
    fetchPermissionsMock.mockRejectedValue('x')
    renderPage(<PermissionsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao carregar as permissões.')
  })

  it('segue funcionando quando o histórico falha', async () => {
    fetchLogMock.mockRejectedValue(new Error('x'))
    await renderLoaded()

    expect(await screen.findByText('Nenhuma alteração registrada ainda.')).toBeInTheDocument()
  })

  it('não busca nada sem token', () => {
    setAuth({ token: null })
    renderPage(<PermissionsPage />)

    expect(fetchPermissionsMock).not.toHaveBeenCalled()
  })
})

describe('PermissionsPage - edição e salvamento', () => {
  it('conta as alterações pendentes e permite descartar', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByLabelText('Ver relatórios'))
    expect(screen.getByText('1 alteração em 1 cargo, ainda não salvas')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Ver logs'))
    expect(screen.getByText('2 alterações em 1 cargo, ainda não salvas')).toBeInTheDocument()
    expect(screen.getByText('alterações não salvas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(screen.getByText('Nenhuma alteração pendente')).toBeInTheDocument()
    expect(screen.getByLabelText('Ver logs')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
  })

  it('salva só os cargos alterados, avisa e recarrega do servidor', async () => {
    const user = userEvent.setup()
    updateRoleMock.mockResolvedValue(adminRole)
    await renderLoaded()

    await user.click(screen.getByLabelText('Ver relatórios'))
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(updateRoleMock).toHaveBeenCalledOnce()
    expect(updateRoleMock).toHaveBeenCalledWith('tok', 1, {
      name: 'Administrador',
      permissions: ['logs.view', 'reports.view'],
    })
    expect(await screen.findByText('Permissões salvas.')).toBeInTheDocument()
    await waitFor(() => expect(fetchPermissionsMock).toHaveBeenCalledTimes(2))
  })

  it('bloqueia os botões enquanto salva', async () => {
    const user = userEvent.setup()
    updateRoleMock.mockReturnValue(new Promise(() => {}))
    await renderLoaded()

    await user.click(screen.getByLabelText('Ver relatórios'))
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled()
  })

  it.each([
    ['uma Error', new Error('Cargo protegido.'), 'Cargo protegido.'],
    ['um valor desconhecido', 'x', 'Erro ao salvar as permissões.'],
  ])('mostra o erro de salvamento com %s e recarrega os dados', async (_nome, failure, message) => {
    const user = userEvent.setup()
    updateRoleMock.mockRejectedValue(failure)
    await renderLoaded()

    await user.click(screen.getByLabelText('Ver relatórios'))
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    await waitFor(() => expect(fetchPermissionsMock).toHaveBeenCalledTimes(2))
  })

  it('troca de cargo mantendo o rascunho do outro', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByLabelText('Ver relatórios'))
    await user.click(screen.getByRole('tab', { name: /Monitor/ }))
    expect(screen.getByLabelText('Ver logs')).not.toBeChecked()
    await user.click(screen.getByRole('tab', { name: /Administrador/ }))

    expect(screen.getByLabelText('Ver relatórios')).toBeChecked()
  })
})

describe('PermissionsPage - criar e excluir cargos', () => {
  it('cria um cargo, seleciona o novo e avisa', async () => {
    const user = userEvent.setup()
    const created: RoleDetail = {
      id: 9,
      key: 'noturno',
      name: 'Noturno',
      is_system: false,
      permissions: [],
    }
    createRoleMock.mockResolvedValue(created)
    await renderLoaded()
    fetchPermissionsMock.mockResolvedValue({ ...matrix, roles: [...matrix.roles, created] })

    await user.click(screen.getByRole('button', { name: /Novo cargo/ }))
    await user.type(screen.getByLabelText('Nome do novo cargo'), 'Noturno')
    await user.click(screen.getByRole('button', { name: 'Criar cargo' }))

    expect(createRoleMock).toHaveBeenCalledWith('tok', { name: 'Noturno', permissions: [] })
    expect(await screen.findByText(/Cargo "Noturno" criado/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Noturno' })).toHaveAttribute('aria-selected', 'true'),
    )
  })

  it('exclui um cargo criado pelo usuário e recarrega', async () => {
    const user = userEvent.setup()
    deleteRoleMock.mockResolvedValue(undefined)
    await renderLoaded()

    await user.click(screen.getByRole('tab', { name: /Monitor/ }))
    await user.click(screen.getByRole('button', { name: 'Excluir cargo Monitor' }))
    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))

    expect(deleteRoleMock).toHaveBeenCalledWith('tok', 7)
    expect(await screen.findByText('Cargo "Monitor" excluído.')).toBeInTheDocument()
    await waitFor(() => expect(fetchPermissionsMock).toHaveBeenCalledTimes(2))
  })

  it.each([
    ['uma Error', new Error('Cargo em uso.'), 'Cargo em uso.'],
    ['um valor desconhecido', 'x', 'Erro ao excluir o cargo.'],
  ])('mostra o erro ao excluir com %s', async (_nome, failure, message) => {
    const user = userEvent.setup()
    deleteRoleMock.mockRejectedValue(failure)
    await renderLoaded()

    await user.click(screen.getByRole('tab', { name: /Monitor/ }))
    await user.click(screen.getByRole('button', { name: 'Excluir cargo Monitor' }))
    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('o aviso de sucesso pode ser fechado', async () => {
    const user = userEvent.setup()
    updateRoleMock.mockResolvedValue(adminRole)
    await renderLoaded()

    await user.click(screen.getByLabelText('Ver relatórios'))
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await screen.findByText('Permissões salvas.')
    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }))

    expect(screen.queryByText('Permissões salvas.')).not.toBeInTheDocument()
  })

  it('as ações não chamam a API quando o token some', async () => {
    const user = userEvent.setup()
    const view = renderPage(<PermissionsPage />)
    await screen.findByRole('tab', { name: 'Administrador' })
    setAuth({ token: null })
    view.rerenderPage(<PermissionsPage />)

    await user.click(screen.getByLabelText('Ver relatórios'))
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await user.click(screen.getByRole('tab', { name: /Monitor/ }))
    await user.click(screen.getByRole('button', { name: 'Excluir cargo Monitor' }))
    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))
    await user.click(screen.getByRole('button', { name: /Novo cargo/ }))
    await user.type(screen.getByLabelText('Nome do novo cargo'), 'X')
    await user.click(screen.getByRole('button', { name: 'Criar cargo' }))

    expect(updateRoleMock).not.toHaveBeenCalled()
    expect(deleteRoleMock).not.toHaveBeenCalled()
    expect(createRoleMock).not.toHaveBeenCalled()
  })
})
