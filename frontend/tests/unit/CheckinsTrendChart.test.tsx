import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CheckinsTrendChart from '../../src/components/CheckinsTrendChart'
import type { Checkin } from '../../src/services/api'

function makeCheckin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: 1,
    plate: 'ABC1D23',
    created_at: '2026-03-10T12:00:00Z',
    status: 'waiting',
    schedule_id: null,
    estimated_wait_minutes: 10,
    ...overrides,
  }
}

const NO_DATA = 'Ainda não há dados suficientes para o gráfico de tendência.'

describe('CheckinsTrendChart', () => {
  it('mostra aviso com lista vazia', () => {
    render(<CheckinsTrendChart checkins={[]} />)

    expect(screen.getByText(NO_DATA)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('ignora check-ins sem horário ou sem espera estimada', () => {
    render(
      <CheckinsTrendChart
        checkins={[
          makeCheckin({ id: 1, created_at: null }),
          makeCheckin({ id: 2, estimated_wait_minutes: null }),
        ]}
      />,
    )

    expect(screen.getByText(NO_DATA)).toBeInTheDocument()
  })

  it('desenha uma única entrada como ponto, sem área preenchida', () => {
    const { container } = render(
      <CheckinsTrendChart checkins={[makeCheckin({ estimated_wait_minutes: 18 })]} />,
    )

    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(container.querySelector('.checkins-trend-area')).not.toBeInTheDocument()
    expect(screen.getByText('18 min')).toBeInTheDocument()
  })

  it('marca o pico de espera e desenha a área com várias entradas', () => {
    const { container } = render(
      <CheckinsTrendChart
        checkins={[
          makeCheckin({ id: 1, created_at: '2026-03-10T12:00:00Z', estimated_wait_minutes: 10 }),
          makeCheckin({ id: 2, created_at: '2026-03-10T13:00:00Z', estimated_wait_minutes: 40 }),
          makeCheckin({ id: 3, created_at: '2026-03-10T14:00:00Z', estimated_wait_minutes: 20 }),
        ]}
      />,
    )

    expect(screen.getByText('40 min')).toBeInTheDocument()
    expect(container.querySelector('.checkins-trend-area')).toBeInTheDocument()
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(container.querySelectorAll('.checkins-trend-axis-label')).toHaveLength(3)
  })

  it('limita os rótulos do eixo quando há muitas entradas e mantém o último', () => {
    const checkins = Array.from({ length: 20 }, (_, index) =>
      makeCheckin({
        id: index,
        created_at: new Date(Date.UTC(2026, 2, 10, 8, index * 10)).toISOString(),
        estimated_wait_minutes: index + 1,
      }),
    )
    const { container } = render(<CheckinsTrendChart checkins={checkins} />)

    const labels = container.querySelectorAll('.checkins-trend-axis-label')
    expect(labels.length).toBeLessThan(20)
    expect(labels.length).toBeGreaterThan(1)
  })

  it('mostra a dica da entrada mais próxima ao passar o ponteiro e some ao sair', () => {
    const checkins = [
      makeCheckin({
        id: 1,
        plate: 'AAA1A11',
        created_at: '2026-03-10T12:00:00Z',
        estimated_wait_minutes: 10,
      }),
      makeCheckin({
        id: 2,
        plate: 'BBB2B22',
        created_at: '2026-03-10T13:00:00Z',
        estimated_wait_minutes: 40,
      }),
      makeCheckin({
        id: 3,
        plate: 'CCC3C33',
        created_at: '2026-03-10T14:00:00Z',
        estimated_wait_minutes: 20,
      }),
    ]
    const { container } = render(<CheckinsTrendChart checkins={checkins} />)
    const svg = screen.getByRole('img')
    svg.getBoundingClientRect = () => ({ left: 0, width: 640 }) as DOMRect

    fireEvent.pointerMove(svg, { clientX: 600 })

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('CCC3C33')
    expect(tooltip).toHaveTextContent('20 min')
    expect(container.querySelectorAll('circle')).toHaveLength(2)
    expect(container.querySelector('.checkins-trend-crosshair')).toBeInTheDocument()
    expect(screen.queryByText('40 min', { selector: 'text' })).not.toBeInTheDocument()

    fireEvent.pointerMove(svg, { clientX: 320 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('BBB2B22')
    expect(container.querySelectorAll('circle')).toHaveLength(1)

    fireEvent.pointerLeave(svg)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByText('40 min')).toBeInTheDocument()
  })

  it('com uma única entrada, passar o ponteiro mostra essa entrada', () => {
    render(<CheckinsTrendChart checkins={[makeCheckin({ plate: 'ONE1A11' })]} />)
    const svg = screen.getByRole('img')
    svg.getBoundingClientRect = () => ({ left: 0, width: 640 }) as DOMRect

    fireEvent.pointerMove(svg, { clientX: 100 })

    expect(screen.getByRole('tooltip')).toHaveTextContent('ONE1A11')
  })

  it('o rótulo acessível descreve o intervalo de horários', () => {
    render(
      <CheckinsTrendChart
        checkins={[
          makeCheckin({ id: 1, created_at: '2026-03-10T12:00:00Z' }),
          makeCheckin({ id: 2, created_at: '2026-03-10T15:00:00Z' }),
        ]}
      />,
    )

    expect(screen.getByRole('img')).toHaveAccessibleName(
      /Tendência do tempo de espera estimado ao longo do dia, de .* a .*/,
    )
  })
})
