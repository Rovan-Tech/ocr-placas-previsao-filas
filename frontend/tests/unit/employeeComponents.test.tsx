import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EmployeesTable, { type EmployeeActions } from '../../src/components/EmployeesTable'
import OverridesEditor from '../../src/components/OverridesEditor'
import type { PermissionsMatrix, RoleDetail, RoleSummary } from '../../src/services/roles'
import { ADMIN_ROLE, makeEmployee } from './support/fixtures'

const GUARD_ROLE: RoleSummary = { id: 2, key: 'guard', name: 'Fiscal', is_system: true }

function makeActions(overrides: Partial<EmployeeActions> = {}): EmployeeActions {
  return {
    canSetRole: true,
    canManagePermissions: true,
    canDeactivate: true,
    onChangeRole: vi.fn(),
    onEditPermissions: vi.fn(),
    onDeactivate: vi.fn(),
    ...overrides,
  }
}

function renderTable(
  props: Partial<React.ComponentProps<typeof EmployeesTable>> = {},
  actions = makeActions(),
) {
  const employees = [
    makeEmployee({ id: 1, full_name: 'Maria Souza', username: 'maria' }),
    makeEmployee({ id: 2, full_name: 'João Pereira', username: 'joao', role: GUARD_ROLE }),
    makeEmployee({ id: 3, full_name: 'Ana Costa', username: 'ana', active: false }),
  ]
  render(
    <EmployeesTable
      employees={employees}
      roles={[ADMIN_ROLE, GUARD_ROLE]}
      loading={false}
      error={null}
      currentEmployeeId={1}
      actions={actions}
      {...props}
    />,
  )
  return actions
}

describe('EmployeesTable', () => {
  it('mostra carregando', () => {
    renderTable({ loading: true })

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('mostra o erro como alerta', () => {
    renderTable({ error: 'Falha ao listar.' })

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao listar.')
  })

  it('mostra o estado vazio', () => {
    renderTable({ employees: [] })

    expect(screen.getByText('Nenhum funcionário cadastrado ainda.')).toBeInTheDocument()
  })

  it('lista nome, usuário e situação de cada funcionário', () => {
    renderTable()

    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(within(rows[2]!).getByText('João Pereira')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Ativo')).toBeInTheDocument()
    expect(within(rows[3]!).getByText('Excluído')).toBeInTheDocument()
  })

  it('só deixa trocar o cargo de outro funcionário ativo', async () => {
    const user = userEvent.setup()
    const actions = renderTable()

    expect(screen.queryByRole('combobox', { name: 'Cargo de Maria Souza' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Cargo de Ana Costa' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Cargo de João Pereira' }), '1')

    expect(actions.onChangeRole).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), 1)
  })

  it('mostra o cargo como etiqueta quando não pode alterar', () => {
    renderTable({}, makeActions({ canSetRole: false }))

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('Fiscal')).toHaveClass('role-badge')
  })

  it('indica exceções de permissão nos dois modos de exibição', () => {
    const withOverrides = { granted: ['logs.view' as const], denied: [] }
    const employees = [
      makeEmployee({ id: 1, overrides: withOverrides }),
      makeEmployee({ id: 2, full_name: 'João', overrides: { granted: [], denied: ['logs.view'] } }),
    ]
    renderTable({ employees })

    expect(screen.getAllByText(/com exceções/)).toHaveLength(2)
  })

  it('aciona permissões para ativos e excluir só para outros ativos', async () => {
    const user = userEvent.setup()
    const actions = renderTable()

    expect(screen.getAllByRole('button', { name: 'Permissões' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Excluir' })).toHaveLength(1)
    await user.click(screen.getAllByRole('button', { name: 'Permissões' })[1]!)
    await user.click(screen.getByRole('button', { name: 'Excluir' }))

    expect(actions.onEditPermissions).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
    expect(actions.onDeactivate).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  })

  it('esconde as ações sem permissão', () => {
    renderTable({}, makeActions({ canManagePermissions: false, canDeactivate: false }))

    expect(screen.queryByRole('button', { name: 'Permissões' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
  })
})

describe('OverridesEditor', () => {
  const guardRole: RoleDetail = { ...GUARD_ROLE, permissions: ['logs.view'] }
  const matrix: PermissionsMatrix = {
    catalog: [
      {
        key: 'logs',
        label: 'Logs',
        permissions: [{ key: 'logs.view', label: 'Ver logs', description: 'Abre a tela de logs.' }],
      },
      {
        key: 'reports',
        label: 'Relatórios',
        permissions: [
          { key: 'reports.view', label: 'Ver relatórios', description: 'Abre os relatórios.' },
        ],
      },
    ],
    roles: [guardRole],
  }
  const employee = makeEmployee({
    id: 2,
    full_name: 'João Pereira',
    role: GUARD_ROLE,
    overrides: { granted: ['reports.view'], denied: [] },
  })

  it('mostra o estado inicial de cada permissão a partir do cargo e das exceções', () => {
    render(
      <OverridesEditor employee={employee} matrix={matrix} onCancel={vi.fn()} onSave={vi.fn()} />,
    )

    expect(screen.getByRole('combobox', { name: 'Ver logs' })).toHaveValue('inherit')
    expect(screen.getByRole('option', { name: 'Seguir o cargo (permite)' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Ver relatórios' })).toHaveValue('grant')
    expect(screen.getByText(/Cargo: Fiscal/)).toBeInTheDocument()
  })

  it('indica que o cargo bloqueia quando a permissão não está no cargo', async () => {
    const roleWithoutPermission = { ...employee, role: { ...GUARD_ROLE, id: 99 } }
    render(
      <OverridesEditor
        employee={roleWithoutPermission}
        matrix={matrix}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('option', { name: 'Seguir o cargo (bloqueia)' })).toHaveLength(2)
  })

  it('salva as escolhas convertidas em exceções', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <OverridesEditor employee={employee} matrix={matrix} onCancel={vi.fn()} onSave={onSave} />,
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Ver logs' }), 'deny')
    await user.click(screen.getByRole('button', { name: 'Salvar exceções' }))

    expect(onSave).toHaveBeenCalledWith(employee, {
      granted: ['reports.view'],
      denied: ['logs.view'],
    })
  })

  it('cancela sem salvar', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onSave = vi.fn()
    render(
      <OverridesEditor employee={employee} matrix={matrix} onCancel={onCancel} onSave={onSave} />,
    )

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('bloqueia a tela enquanto salva', async () => {
    const user = userEvent.setup()
    render(
      <OverridesEditor
        employee={employee}
        matrix={matrix}
        onCancel={vi.fn()}
        onSave={() => new Promise<void>(() => {})}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Salvar exceções' }))

    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Ver logs' })).toBeDisabled()
  })

  it.each([
    ['uma Error', new Error('Sem acesso.'), 'Sem acesso.'],
    ['um valor desconhecido', 'x', 'Erro inesperado ao salvar as exceções.'],
  ])('mostra o erro de salvar quando falha com %s', async (_nome, failure, message) => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(failure)
    render(
      <OverridesEditor employee={employee} matrix={matrix} onCancel={vi.fn()} onSave={onSave} />,
    )

    await user.click(screen.getByRole('button', { name: 'Salvar exceções' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Salvar exceções' })).toBeEnabled()
  })
})
