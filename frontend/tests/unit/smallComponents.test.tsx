import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeactivateConfirmation from '../../src/components/DeactivateConfirmation'
import InfoTip from '../../src/components/InfoTip'
import PermissionLog from '../../src/components/PermissionLog'
import RoleBadge, { roleTone } from '../../src/components/RoleBadge'
import StatusMessage from '../../src/components/StatusMessage'
import Toast from '../../src/components/Toast'
import type { PermissionLogEntry } from '../../src/services/auth'
import { ADMIN_ROLE, makeEmployee } from './support/fixtures'

afterEach(() => {
  vi.useRealTimers()
})

describe('RoleBadge', () => {
  it('usa a chave do cargo de sistema como tom', () => {
    render(<RoleBadge role={ADMIN_ROLE} />)

    expect(screen.getByText('Administrador')).toHaveClass('role-badge-admin')
  })

  it('usa o tom "custom" para cargo criado pelo usuário', () => {
    const custom = { id: 9, key: 'conferente', name: 'Conferente', is_system: false }

    expect(roleTone(custom)).toBe('custom')
    render(<RoleBadge role={custom} />)
    expect(screen.getByText('Conferente')).toHaveClass('role-badge-custom')
  })
})

describe('StatusMessage', () => {
  it('erro vira alerta com a classe do tom', () => {
    render(<StatusMessage tone="error">Falhou</StatusMessage>)

    expect(screen.getByRole('alert')).toHaveTextContent('Falhou')
    expect(screen.getByRole('alert')).toHaveClass('message', 'error')
  })

  it('sucesso vira status e aceita classe extra', () => {
    render(
      <StatusMessage tone="success" className="extra">
        Deu certo
      </StatusMessage>,
    )

    expect(screen.getByRole('status')).toHaveClass('message', 'extra')
  })
})

describe('InfoTip', () => {
  it('liga o botão ao texto da dica pelo aria-describedby', () => {
    render(<InfoTip label="Cargo" text="Define o que a pessoa pode fazer." />)

    const button = screen.getByRole('button', { name: 'O que faz: Cargo' })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Define o que a pessoa pode fazer.')
    expect(button).toHaveAttribute('aria-describedby', tooltip.id)
  })
})

describe('Toast', () => {
  it('não renderiza nada sem mensagem', () => {
    const { container } = render(<Toast message={null} onClose={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('mostra a mensagem e fecha pelo botão', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Toast message="Salvo!" onClose={onClose} />)

    expect(screen.getByRole('status')).toHaveTextContent('Salvo!')
    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('fecha sozinho depois do tempo informado', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Toast message="Salvo!" onClose={onClose} durationMs={1000} />)

    act(() => vi.advanceTimersByTime(999))
    expect(onClose).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('usa 4 segundos por padrão e chama o onClose mais recente', () => {
    vi.useFakeTimers()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Toast message="Salvo!" onClose={first} />)
    rerender(<Toast message="Salvo!" onClose={second} />)

    act(() => vi.advanceTimersByTime(4000))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('cancela o temporizador quando a mensagem some', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const { rerender } = render(<Toast message="Salvo!" onClose={onClose} durationMs={1000} />)

    rerender(<Toast message={null} onClose={onClose} durationMs={1000} />)
    act(() => vi.advanceTimersByTime(2000))

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('PermissionLog', () => {
  const entry: PermissionLogEntry = {
    id: 1,
    created_at: '2026-03-10T12:30:00Z',
    actor_username: 'maria',
    actor_name: 'Maria Souza',
    client_ip: '10.0.0.5',
    action: 'role.update',
    target_name: 'Conferente',
    summary: 'Cargo Conferente ganhou "Ver logs"',
    details: {},
  }

  it('avisa quando não há alterações', () => {
    render(<PermissionLog entries={[]} />)

    expect(screen.getByText('Nenhuma alteração registrada ainda.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lista quem alterou, o IP e o resumo', () => {
    render(<PermissionLog entries={[entry, { ...entry, id: 2, client_ip: null }]} />)

    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getAllByText(/Maria Souza/)).toHaveLength(2)
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getAllByText('Cargo Conferente ganhou "Ver logs"')).toHaveLength(2)
    expect(document.querySelector('time')).toHaveAttribute('datetime', '2026-03-10T12:30:00Z')
  })
})

describe('DeactivateConfirmation', () => {
  const employee = makeEmployee({ full_name: 'João Pereira', username: 'joao' })

  it('mostra os dados do funcionário e confirma a exclusão', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<DeactivateConfirmation employee={employee} onCancel={vi.fn()} onConfirm={onConfirm} />)

    expect(screen.getByText('João Pereira')).toBeInTheDocument()
    expect(screen.getByText('joao')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))

    expect(onConfirm).toHaveBeenCalledWith(employee)
  })

  it('cancela sem excluir', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<DeactivateConfirmation employee={employee} onCancel={onCancel} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('bloqueia os botões enquanto exclui', async () => {
    const user = userEvent.setup()
    render(
      <DeactivateConfirmation
        employee={employee}
        onCancel={vi.fn()}
        onConfirm={() => new Promise<void>(() => {})}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))

    expect(screen.getByRole('button', { name: 'Excluindo…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('mostra o erro e libera os botões quando a exclusão falha', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockRejectedValue(new Error('Sem permissão.'))
    render(<DeactivateConfirmation employee={employee} onCancel={vi.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão.')
    expect(screen.getByRole('button', { name: 'Sim, excluir' })).toBeEnabled()
  })

  it('usa mensagem padrão quando o erro não é uma Error', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockRejectedValue('falhou')
    render(<DeactivateConfirmation employee={employee} onCancel={vi.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Erro inesperado ao excluir o funcionário.',
    )
  })
})
