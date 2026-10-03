import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReportsPage from '../../src/pages/ReportsPage'
import {
  fetchLogs,
  fetchRecentCheckins,
  type Checkin,
  type UploadLogEntry,
} from '../../src/services/api'

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/api')>()),
  fetchLogs: vi.fn(),
  fetchRecentCheckins: vi.fn(),
}))

const fetchLogsMock = vi.mocked(fetchLogs)
const fetchCheckinsMock = vi.mocked(fetchRecentCheckins)

const NOW = new Date(2026, 2, 10, 15, 0, 0)

function at(dayOffset: number, hour: number): string {
  return new Date(2026, 2, 10 + dayOffset, hour, 30).toISOString()
}

function makeCheckin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: 1,
    plate: 'ABC1D23',
    created_at: at(0, 9),
    status: 'admitted',
    schedule_id: 5,
    estimated_wait_minutes: 8,
    ...overrides,
  }
}

function makeLog(overrides: Partial<UploadLogEntry> = {}): UploadLogEntry {
  return {
    id: 1,
    employee_id: 1,
    employee_username: 'maria',
    endpoint: 'upload',
    client_ip: null,
    ocr_plate: null,
    ocr_confidence: null,
    manual_plate: null,
    final_plate: 'ABC1D23',
    final_plate_format: 'mercosul',
    needs_review: false,
    has_photo: false,
    created_at: at(0, 9),
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  fetchCheckinsMock.mockReset()
  fetchLogsMock.mockReset().mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

function kpi(title: string) {
  return screen.getByRole('heading', { name: title }).closest('.kpi-card') as HTMLElement
}

describe('ReportsPage', () => {
  it('mostra carregando, pede as 100 últimas amostras e depois os indicadores', async () => {
    fetchCheckinsMock.mockResolvedValue([makeCheckin()])
    render(<ReportsPage />)

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    expect(await screen.findByText('Check-ins hoje')).toBeInTheDocument()
    expect(fetchCheckinsMock).toHaveBeenCalledWith({ limit: 100 })
    expect(fetchLogsMock).toHaveBeenCalledWith({ limit: 100 })
    expect(screen.getByText('Somente leitura')).toBeInTheDocument()
  })

  it('mostra o estado vazio quando não há check-ins hoje', async () => {
    fetchCheckinsMock.mockResolvedValue([makeCheckin({ created_at: at(-3, 9) })])
    render(<ReportsPage />)

    expect(await screen.findByText('Nenhum check-in registrado hoje.')).toBeInTheDocument()
    expect(screen.queryByText('Check-ins hoje')).not.toBeInTheDocument()
  })

  it('aceita a resposta no formato { items } e trata ausência de items como vazio', async () => {
    fetchCheckinsMock.mockResolvedValueOnce({ items: [makeCheckin()] })
    const { unmount } = render(<ReportsPage />)
    expect(await screen.findByText('Check-ins hoje')).toBeInTheDocument()
    unmount()

    fetchCheckinsMock.mockResolvedValueOnce({})
    render(<ReportsPage />)

    expect(await screen.findByText('Nenhum check-in registrado hoje.')).toBeInTheDocument()
  })

  it.each([
    ['uma Error', new Error('Sem acesso.'), 'Sem acesso.'],
    ['um valor desconhecido', 'x', 'Erro ao carregar os relatórios.'],
  ])('mostra o erro quando a busca falha com %s', async (_nome, failure, message) => {
    fetchCheckinsMock.mockRejectedValue(failure)
    render(<ReportsPage />)

    expect(await screen.findByText(message)).toHaveClass('error')
  })

  it('calcula os indicadores: variação, espera dentro da meta, incertas e recusadas', async () => {
    fetchCheckinsMock.mockResolvedValue([
      makeCheckin({ id: 1, estimated_wait_minutes: 8 }),
      makeCheckin({ id: 2, status: 'waiting', estimated_wait_minutes: 6 }),
      makeCheckin({ id: 3, status: 'cancelled', schedule_id: null, estimated_wait_minutes: 4 }),
      makeCheckin({ id: 4, status: 'cancelled', schedule_id: 9, estimated_wait_minutes: 6 }),
      makeCheckin({ id: 5, created_at: at(-1, 10) }),
    ])
    fetchLogsMock.mockResolvedValue([
      makeLog({ id: 1, needs_review: true }),
      makeLog({ id: 2 }),
      makeLog({ id: 3 }),
      makeLog({ id: 4 }),
    ])
    render(<ReportsPage />)
    await screen.findByText('Check-ins hoje')

    expect(kpi('Check-ins hoje')).toHaveTextContent('4')
    expect(kpi('Check-ins hoje')).toHaveTextContent('↑ 300% vs. ontem')
    expect(kpi('Espera média')).toHaveTextContent('6 min')
    expect(kpi('Espera média')).toHaveTextContent('meta: até 10 min')
    expect(kpi('Leituras incertas')).toHaveTextContent('25%')
    expect(kpi('Leituras incertas')).toHaveTextContent('acima da meta (5%)')
    expect(kpi('Leituras incertas').querySelector('.kpi-note-warning')).toBeInTheDocument()
    expect(kpi('Entradas recusadas')).toHaveTextContent('2')
    expect(kpi('Entradas recusadas')).toHaveTextContent('1 sem agendamento')
  })

  it('mostra a tabela de decisões', async () => {
    fetchCheckinsMock.mockResolvedValue([
      makeCheckin({ id: 1 }),
      makeCheckin({ id: 2 }),
      makeCheckin({ id: 3, status: 'waiting' }),
      makeCheckin({ id: 4, status: 'cancelled' }),
    ])
    render(<ReportsPage />)
    await screen.findByText('Check-ins hoje')

    const rows = screen.getAllByRole('row').map((row) => row.textContent)
    expect(rows).toEqual(
      expect.arrayContaining(['Autorizado2', 'Aguardando1', 'Recusado1', 'Total4']),
    )
  })

  it('sinaliza espera acima da meta, queda em relação a ontem e dados ausentes', async () => {
    fetchCheckinsMock.mockResolvedValue([
      makeCheckin({ id: 1, estimated_wait_minutes: 25 }),
      makeCheckin({ id: 2, created_at: at(-1, 9) }),
      makeCheckin({ id: 3, created_at: at(-1, 10) }),
    ])
    render(<ReportsPage />)
    await screen.findByText('Check-ins hoje')

    expect(kpi('Check-ins hoje')).toHaveTextContent('↓ 50% vs. ontem')
    expect(kpi('Espera média')).toHaveTextContent('acima da meta (10 min)')
    expect(kpi('Leituras incertas')).toHaveTextContent('—')
    expect(kpi('Leituras incertas')).toHaveTextContent('meta: até 5%')
  })

  it('sem dados de ontem nem de espera mostra traços e avisos neutros', async () => {
    fetchCheckinsMock.mockResolvedValue([makeCheckin({ estimated_wait_minutes: null })])
    render(<ReportsPage />)
    await screen.findByText('Check-ins hoje')

    expect(kpi('Check-ins hoje')).toHaveTextContent('sem dados de ontem')
    expect(kpi('Espera média')).toHaveTextContent('—')
    expect(kpi('Espera média')).toHaveTextContent('sem dados de espera')
  })

  it('desenha o gráfico por hora com acessibilidade e rótulos alternados quando é denso', async () => {
    fetchCheckinsMock.mockResolvedValue([
      makeCheckin({ id: 1, created_at: at(0, 6) }),
      makeCheckin({ id: 2, created_at: at(0, 6) }),
      makeCheckin({ id: 3, created_at: at(0, 14) }),
      makeCheckin({ id: 4, created_at: at(0, 19) }),
    ])
    const { container } = render(<ReportsPage />)
    await screen.findByText('Check-ins por hora')

    const chart = screen.getByRole('img')
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('06h 2'))
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('19h 1'))
    expect(container.querySelectorAll('.hour-chart-column')).toHaveLength(14)
    const labels = [...container.querySelectorAll('.hour-chart-label')].map((el) => el.textContent)
    expect(labels.filter(Boolean)).toHaveLength(7)
    expect(labels[1]).toBe('')
  })

  it('mostra todos os rótulos quando o gráfico é curto', async () => {
    fetchCheckinsMock.mockResolvedValue([
      makeCheckin({ id: 1, created_at: at(0, 9) }),
      makeCheckin({ id: 2, created_at: at(0, 11) }),
    ])
    const { container } = render(<ReportsPage />)
    await screen.findByText('Check-ins por hora')

    const labels = [...container.querySelectorAll('.hour-chart-label')].map((el) => el.textContent)
    expect(labels).toEqual(['09h', '10h', '11h'])
    const bars = container.querySelectorAll<HTMLElement>('.hour-chart-bar')
    expect(bars[0]?.style.height).toBe('140px')
    expect(bars[1]?.style.height).toBe('4px')
  })
})
