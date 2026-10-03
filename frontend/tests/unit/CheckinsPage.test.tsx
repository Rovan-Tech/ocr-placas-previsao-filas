import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CheckinsPage from '../../src/pages/CheckinsPage'
import { fetchRecentCheckins, type Checkin } from '../../src/services/api'

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/api')>()),
  fetchRecentCheckins: vi.fn(),
}))

const fetchMock = vi.mocked(fetchRecentCheckins)

function makeCheckin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: 1,
    plate: 'ABC1D23',
    created_at: '2026-03-10T12:00:00Z',
    status: 'waiting',
    schedule_id: null,
    estimated_wait_minutes: 24.6,
    ...overrides,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
})

describe('CheckinsPage', () => {
  it('mostra carregando e depois a tabela com decisão e espera arredondada', async () => {
    fetchMock.mockResolvedValue([
      makeCheckin(),
      makeCheckin({ id: 2, plate: 'XYZ9K88', status: 'admitted', estimated_wait_minutes: null }),
      makeCheckin({ id: 3, plate: 'QWE1R23', status: 'cancelled', created_at: null }),
    ])
    render(<CheckinsPage />)

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Aguardando')).toBeInTheDocument()
    expect(screen.getByText('Autorizado')).toBeInTheDocument()
    expect(screen.getByText('Recusado')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByText('25 min')).toHaveLength(2)
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('Tendência do tempo de espera')).toBeInTheDocument()
  })

  it('aceita a resposta no formato { items }', async () => {
    fetchMock.mockResolvedValue({ items: [makeCheckin({ plate: 'ITM1A11' })] })
    render(<CheckinsPage />)

    expect(await screen.findByText('ITM1A11')).toBeInTheDocument()
  })

  it('trata resposta sem items como lista vazia', async () => {
    fetchMock.mockResolvedValue({})
    render(<CheckinsPage />)

    expect(await screen.findByText('Nenhum check-in registrado ainda.')).toBeInTheDocument()
  })

  it('mostra o estado vazio sem tabela nem gráfico', async () => {
    fetchMock.mockResolvedValue([])
    render(<CheckinsPage />)

    expect(await screen.findByText('Nenhum check-in registrado ainda.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('Tendência do tempo de espera')).not.toBeInTheDocument()
  })

  it.each([
    ['uma Error', new Error('Backend fora do ar.'), 'Backend fora do ar.'],
    ['um valor desconhecido', 'x', 'Erro inesperado ao carregar os check-ins.'],
  ])('mostra o erro quando a busca falha com %s', async (_nome, failure, message) => {
    fetchMock.mockRejectedValue(failure)
    render(<CheckinsPage />)

    expect(await screen.findByText(message)).toHaveClass('error')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('Atualizar busca de novo, limpa o erro e desabilita o botão enquanto carrega', async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValueOnce(new Error('Falhou.'))
    render(<CheckinsPage />)
    await screen.findByText('Falhou.')
    let release: (value: Checkin[]) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))

    await user.click(screen.getByRole('button', { name: /Atualizar/ }))

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Atualizar/ })).toBeDisabled()
    release([makeCheckin({ plate: 'NEW1A11' })])
    expect(await screen.findByText('NEW1A11')).toBeInTheDocument()
    expect(screen.queryByText('Falhou.')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
