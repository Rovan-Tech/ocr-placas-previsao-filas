import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateEmployeePage from '../../src/pages/CreateEmployeePage'
import {
  changeEmployeeRole,
  createEmployee,
  deactivateEmployee,
  fetchPermissions,
  fetchRoles,
  listEmployees,
  setEmployeeOverrides,
} from '../../src/services/auth'
import type { PermissionKey, PermissionsMatrix, RoleSummary } from '../../src/services/roles'
import { setAuth } from './support/authMock'
import { ADMIN_ROLE, makeEmployee } from './support/fixtures'
import { renderPage } from './support/render'

vi.mock('../../src/context/AuthContext', async () => ({
  useAuth: (await import('./support/authMock')).useAuthMock,
}))
vi.mock('../../src/services/auth', () => ({
  changeEmployeeRole: vi.fn(),
  createEmployee: vi.fn(),
  deactivateEmployee: vi.fn(),
  fetchPermissions: vi.fn(),
  fetchRoles: vi.fn(),
  listEmployees: vi.fn(),
  setEmployeeOverrides: vi.fn(),
}))

const listEmployeesMock = vi.mocked(listEmployees)
const fetchRolesMock = vi.mocked(fetchRoles)
const createEmployeeMock = vi.mocked(createEmployee)
const changeRoleMock = vi.mocked(changeEmployeeRole)
const deactivateMock = vi.mocked(deactivateEmployee)
const fetchPermissionsMock = vi.mocked(fetchPermissions)
const setOverridesMock = vi.mocked(setEmployeeOverrides)

const FISCAL_ROLE: RoleSummary = { id: 2, key: 'fiscal', name: 'Fiscal', is_system: true }
const maria = makeEmployee({ id: 1, full_name: 'Maria Souza', username: 'maria' })
const joao = makeEmployee({
  id: 2,
  full_name: 'João Pereira',
  username: 'joao',
  role: FISCAL_ROLE,
  permissions: ['capture.read_plate'],
})
const matrix: PermissionsMatrix = {
  catalog: [
    {
      key: 'logs',
      label: 'Logs',
      permissions: [{ key: 'logs.view', label: 'Ver logs', description: 'Abre os logs.' }],
    },
  ],
  roles: [
    { ...ADMIN_ROLE, permissions: ['logs.view'] },
    { ...FISCAL_ROLE, permissions: [] },
  ],
}

function withPermissions(permissions: PermissionKey[]) {
  setAuth({ employee: makeEmployee({ ...maria, permissions }) })
}

beforeEach(() => {
  setAuth({ employee: maria })
  listEmployeesMock.mockReset().mockResolvedValue([maria, joao])
  fetchRolesMock.mockReset().mockResolvedValue([ADMIN_ROLE, FISCAL_ROLE])
  createEmployeeMock.mockReset()
  changeRoleMock.mockReset()
  deactivateMock.mockReset()
  fetchPermissionsMock.mockReset().mockResolvedValue(matrix)
  setOverridesMock.mockReset()
})

async function renderLoaded() {
  renderPage(<CreateEmployeePage />)
  await screen.findByText('João Pereira')
}

describe('CreateEmployeePage - lista', () => {
  it('carrega funcionários e cargos do backend com o token', async () => {
    await renderLoaded()

    expect(listEmployeesMock).toHaveBeenCalledWith('tok')
    expect(fetchRolesMock).toHaveBeenCalledWith('tok')
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })

  it('mostra o erro de carregamento', async () => {
    listEmployeesMock.mockRejectedValue(new Error('Sem acesso.'))
    renderPage(<CreateEmployeePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem acesso.')
  })

  it('usa mensagem padrão para erro desconhecido de carregamento', async () => {
    fetchRolesMock.mockRejectedValue('x')
    renderPage(<CreateEmployeePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao carregar funcionários.')
  })

  it('não busca nada sem token', () => {
    setAuth({ token: null })
    renderPage(<CreateEmployeePage />)

    expect(listEmployeesMock).not.toHaveBeenCalled()
    expect(screen.getByText('Carregando…')).toBeInTheDocument()
  })
})

describe('CreateEmployeePage - cadastro', () => {
  async function fillForm(user: ReturnType<typeof userEvent.setup>, password = 'senha-temp-1') {
    await user.type(screen.getByLabelText('Usuário'), 'ana')
    await user.type(screen.getByLabelText('Nome completo'), 'Ana Costa')
    await user.type(screen.getByLabelText('Senha temporária'), password)
  }

  it('seleciona o cargo Fiscal por padrão e só habilita com os dados válidos', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const submit = screen.getByRole('button', { name: 'Cadastrar' })

    expect(screen.getByLabelText('Cargo')).toHaveValue('2')
    expect(submit).toBeDisabled()
    await fillForm(user, 'curta')
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Senha temporária'), '12345')

    expect(submit).toBeEnabled()
  })

  it('cadastra o funcionário, mostra o aviso e limpa o formulário', async () => {
    const user = userEvent.setup()
    createEmployeeMock.mockResolvedValue(
      makeEmployee({ id: 3, full_name: 'Ana Costa', username: 'ana', role: ADMIN_ROLE }),
    )
    await renderLoaded()

    await fillForm(user)
    await user.selectOptions(screen.getByLabelText('Cargo'), '1')
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(createEmployeeMock).toHaveBeenCalledWith('tok', {
      username: 'ana',
      full_name: 'Ana Costa',
      temporary_password: 'senha-temp-1',
      role_id: 1,
    })
    expect(
      await screen.findByText(/Funcionário Ana Costa \(usuário "ana"\) cadastrado/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Usuário')).toHaveValue('')
    expect(screen.getByLabelText('Cargo')).toHaveValue('2')
    expect(screen.getAllByText('Ana Costa').length).toBeGreaterThan(0)
  })

  it('bloqueia o formulário enquanto cadastra', async () => {
    const user = userEvent.setup()
    createEmployeeMock.mockReturnValue(new Promise(() => {}))
    await renderLoaded()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(screen.getByRole('button', { name: 'Cadastrando…' })).toBeDisabled()
    expect(screen.getByLabelText('Usuário')).toBeDisabled()
  })

  it.each([
    ['uma Error', new Error('Usuário já existe.'), 'Usuário já existe.'],
    ['um valor desconhecido', 'x', 'Erro inesperado ao cadastrar o funcionário.'],
  ])('mostra o erro de cadastro quando falha com %s', async (_nome, failure, message) => {
    const user = userEvent.setup()
    createEmployeeMock.mockRejectedValue(failure)
    await renderLoaded()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Usuário')).toHaveValue('ana')
  })

  it('esconde o formulário sem permissão de cadastrar', async () => {
    withPermissions(['employees.view'])
    await renderLoaded()

    expect(screen.queryByText('Cadastrar novo funcionário')).not.toBeInTheDocument()
  })

  it('só aponta para a tela de permissões quem pode gerenciá-las', async () => {
    withPermissions(['employees.view', 'employees.create'])
    await renderLoaded()
    expect(screen.queryByRole('link', { name: 'Permissões por cargo' })).not.toBeInTheDocument()
  })

  it('mostra o link para permissões por cargo a quem gerencia', async () => {
    await renderLoaded()

    expect(screen.getByRole('link', { name: 'Permissões por cargo' })).toHaveAttribute(
      'href',
      '/permissoes',
    )
  })

  it('usa o primeiro cargo quando não existe o Fiscal', async () => {
    fetchRolesMock.mockResolvedValue([ADMIN_ROLE])
    await renderLoaded()

    expect(screen.getByLabelText('Cargo')).toHaveValue('1')
  })

  it('não envia quando não há cargo disponível', async () => {
    const user = userEvent.setup()
    fetchRolesMock.mockResolvedValue([])
    await renderLoaded()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(createEmployeeMock).not.toHaveBeenCalled()
  })
})

describe('CreateEmployeePage - ações na tabela', () => {
  it('troca o cargo de outro funcionário', async () => {
    const user = userEvent.setup()
    changeRoleMock.mockResolvedValue({ ...joao, role: ADMIN_ROLE })
    await renderLoaded()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cargo de João Pereira' }), '1')

    expect(changeRoleMock).toHaveBeenCalledWith('tok', 2, 1)
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Cargo de João Pereira' })).toHaveValue('1'),
    )
  })

  it.each([
    ['uma Error', new Error('Cargo inválido.'), 'Cargo inválido.'],
    ['um valor desconhecido', 'x', 'Erro ao trocar o cargo.'],
  ])('mostra o erro ao trocar o cargo com %s', async (_nome, failure, message) => {
    const user = userEvent.setup()
    changeRoleMock.mockRejectedValue(failure)
    await renderLoaded()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cargo de João Pereira' }), '1')

    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it('exclui o funcionário depois da confirmação', async () => {
    const user = userEvent.setup()
    deactivateMock.mockResolvedValue({ ...joao, active: false })
    await renderLoaded()

    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('João Pereira')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Sim, excluir' }))

    expect(deactivateMock).toHaveBeenCalledWith('tok', 2)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByText('Excluído')).toBeInTheDocument()
  })

  it('cancelar a exclusão fecha a confirmação sem excluir', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deactivateMock).not.toHaveBeenCalled()
  })

  it('edita as exceções de permissão de um funcionário', async () => {
    const user = userEvent.setup()
    const updated = { ...joao, overrides: { granted: ['logs.view' as const], denied: [] } }
    setOverridesMock.mockResolvedValue(updated)
    await renderLoaded()

    await user.click(screen.getAllByRole('button', { name: 'Permissões' })[1]!)
    const editor = await screen.findByRole('region', { name: 'Permissões de João Pereira' })
    await user.selectOptions(within(editor).getByRole('combobox', { name: 'Ver logs' }), 'grant')
    await user.click(within(editor).getByRole('button', { name: 'Salvar exceções' }))

    expect(setOverridesMock).toHaveBeenCalledWith('tok', 2, { granted: ['logs.view'], denied: [] })
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /Permissões de/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByText(/com exceções/)).toBeInTheDocument()
  })

  it('cancelar a edição de exceções fecha o editor', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getAllByRole('button', { name: 'Permissões' })[1]!)
    const editor = await screen.findByRole('region', { name: 'Permissões de João Pereira' })
    await user.click(within(editor).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('region', { name: /Permissões de/ })).not.toBeInTheDocument()
  })

  it.each([
    ['uma Error', new Error('Sem permissão.'), 'Sem permissão.'],
    ['um valor desconhecido', 'x', 'Erro ao carregar as permissões.'],
  ])('mostra o erro ao abrir as permissões com %s', async (_nome, failure, message) => {
    const user = userEvent.setup()
    fetchPermissionsMock.mockRejectedValue(failure)
    await renderLoaded()

    await user.click(screen.getAllByRole('button', { name: 'Permissões' })[1]!)

    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it('as ações não chamam a API quando o token some', async () => {
    const user = userEvent.setup()
    const view = renderPage(<CreateEmployeePage />)
    await screen.findByText('João Pereira')
    setAuth({ token: null })
    view.rerenderPage(<CreateEmployeePage />)

    await user.click(screen.getAllByRole('button', { name: 'Permissões' })[1]!)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Cargo de João Pereira' }), '1')
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))

    expect(fetchPermissionsMock).not.toHaveBeenCalled()
    expect(changeRoleMock).not.toHaveBeenCalled()
    expect(deactivateMock).not.toHaveBeenCalled()
  })
})
