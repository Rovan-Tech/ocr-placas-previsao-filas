import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ManualPlateEntry from '../../src/components/ManualPlateEntry'
import RolePermissionsPanel from '../../src/components/RolePermissionsPanel'
import RoleTabs from '../../src/components/RoleTabs'
import { ApiError, submitPlateManually } from '../../src/services/api'
import type { RoleDetail, ScreenDef } from '../../src/services/roles'

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/api')>()),
  submitPlateManually: vi.fn(),
}))

const submitPlateManuallyMock = vi.mocked(submitPlateManually)

const systemRole: RoleDetail = {
  id: 1,
  key: 'admin',
  name: 'Administrador',
  is_system: true,
  permissions: ['logs.view'],
}
const customRole: RoleDetail = {
  id: 7,
  key: 'monitor',
  name: 'Monitor',
  is_system: false,
  permissions: [],
}

describe('RoleTabs', () => {
  function renderTabs(onCreate = vi.fn().mockResolvedValue(undefined), onSelect = vi.fn()) {
    render(
      <RoleTabs
        roles={[systemRole, customRole]}
        selectedId={1}
        dirtyIds={[7]}
        onSelect={onSelect}
        onCreate={onCreate}
      />,
    )
    return { onCreate, onSelect }
  }

  it('marca a aba selecionada e as alterações não salvas', () => {
    renderTabs()

    expect(screen.getByRole('tab', { name: 'Administrador' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: /Monitor/ })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('alterações não salvas')).toBeInTheDocument()
  })

  it('seleciona outro cargo', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderTabs()

    await user.click(screen.getByRole('tab', { name: /Monitor/ }))

    expect(onSelect).toHaveBeenCalledWith(7)
  })

  it('cria um cargo com o nome aparado e fecha o formulário', async () => {
    const user = userEvent.setup()
    const { onCreate } = renderTabs()

    await user.click(screen.getByRole('button', { name: /Novo cargo/ }))
    expect(screen.getByRole('button', { name: 'Criar cargo' })).toBeDisabled()
    await user.type(screen.getByLabelText('Nome do novo cargo'), '  Monitor Noturno  ')
    await user.click(screen.getByRole('button', { name: 'Criar cargo' }))

    expect(onCreate).toHaveBeenCalledWith('Monitor Noturno')
    expect(await screen.findByRole('button', { name: /Novo cargo/ })).toBeInTheDocument()
  })

  it('cancelar fecha o formulário sem criar', async () => {
    const user = userEvent.setup()
    const { onCreate } = renderTabs()

    await user.click(screen.getByRole('button', { name: /Novo cargo/ }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Nome do novo cargo')).not.toBeInTheDocument()
  })

  it.each([
    ['uma Error', new Error('Nome já usado.'), 'Nome já usado.'],
    ['um valor desconhecido', 'x', 'Erro ao criar o cargo.'],
  ])(
    'mantém o formulário aberto e mostra o erro quando falha com %s',
    async (_nome, failure, message) => {
      const user = userEvent.setup()
      renderTabs(vi.fn().mockRejectedValue(failure))

      await user.click(screen.getByRole('button', { name: /Novo cargo/ }))
      await user.type(screen.getByLabelText('Nome do novo cargo'), 'Monitor')
      await user.click(screen.getByRole('button', { name: 'Criar cargo' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.getByLabelText('Nome do novo cargo')).toHaveValue('Monitor')
    },
  )
})

describe('RolePermissionsPanel', () => {
  const catalog: ScreenDef[] = [
    {
      key: 'logs',
      label: 'Logs',
      permissions: [
        { key: 'logs.view', label: 'Ver logs', description: 'Abre a tela de logs.' },
        { key: 'reports.view', label: 'Ver relatórios', description: 'Abre os relatórios.' },
      ],
    },
  ]

  it('cargo do sistema não pode ser excluído', () => {
    render(
      <RolePermissionsPanel
        role={systemRole}
        catalog={catalog}
        granted={['logs.view']}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText(/Cargo do sistema/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Excluir cargo/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ver logs')).toBeChecked()
    expect(screen.getByLabelText('Ver relatórios')).not.toBeChecked()
  })

  it('alterna uma permissão', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <RolePermissionsPanel
        role={systemRole}
        catalog={catalog}
        granted={[]}
        onToggle={onToggle}
        onDelete={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Ver relatórios'))

    expect(onToggle).toHaveBeenCalledWith('reports.view')
  })

  it('exige confirmação para excluir um cargo criado pelo usuário', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <RolePermissionsPanel
        role={customRole}
        catalog={catalog}
        granted={[]}
        onToggle={vi.fn()}
        onDelete={onDelete}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Excluir cargo Monitor' }))
    expect(onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Excluir cargo Monitor' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Excluir cargo Monitor' }))
    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))

    expect(onDelete).toHaveBeenCalledWith(customRole)
  })
})

describe('ManualPlateEntry', () => {
  const result = { plate: 'ABC1D23' } as Awaited<ReturnType<typeof submitPlateManually>>

  it('mantém confirmar desabilitado até digitar e converte para maiúsculas', async () => {
    const user = userEvent.setup()
    render(<ManualPlateEntry onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Confirmar placa' })).toBeDisabled()
    await user.type(screen.getByLabelText('Digite a placa do veículo'), 'abc1d23')

    expect(screen.getByLabelText('Digite a placa do veículo')).toHaveValue('ABC1D23')
    expect(screen.getByRole('button', { name: 'Confirmar placa' })).toBeEnabled()
  })

  it('envia a placa com o contexto da foto e devolve o resultado', async () => {
    const user = userEvent.setup()
    submitPlateManuallyMock.mockResolvedValue(result)
    const onSubmit = vi.fn()
    const photo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const context = { photo, ocrPlate: 'ABC1D2O', ocrConfidence: 0.4 }
    render(<ManualPlateEntry onSubmit={onSubmit} onCancel={vi.fn()} context={context} />)

    expect(screen.getByText(/A foto será salva junto/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Digite a placa do veículo'), 'abc1d23')
    await user.click(screen.getByRole('button', { name: 'Confirmar placa' }))

    expect(submitPlateManuallyMock).toHaveBeenCalledWith('ABC1D23', context)
    expect(onSubmit).toHaveBeenCalledWith(result)
  })

  it('mostra a mensagem da API quando a placa é recusada', async () => {
    const user = userEvent.setup()
    submitPlateManuallyMock.mockRejectedValue(new ApiError('Placa inválida.', 422))
    const onSubmit = vi.fn()
    render(<ManualPlateEntry onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Digite a placa do veículo'), 'XXX')
    await user.click(screen.getByRole('button', { name: 'Confirmar placa' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Placa inválida.')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByText(/A foto será salva/)).not.toBeInTheDocument()
  })

  it('usa mensagem padrão para erro inesperado e permite cancelar', async () => {
    const user = userEvent.setup()
    submitPlateManuallyMock.mockRejectedValue(new Error('boom'))
    const onCancel = vi.fn()
    render(<ManualPlateEntry onSubmit={vi.fn()} onCancel={onCancel} />)

    await user.type(screen.getByLabelText('Digite a placa do veículo'), 'ABC1D23')
    await user.click(screen.getByRole('button', { name: 'Confirmar placa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Erro inesperado ao registrar a placa.',
    )
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledOnce()
  })
})
