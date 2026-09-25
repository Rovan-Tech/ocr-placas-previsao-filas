import { describe, expect, it } from 'vitest'
import type { Checkin } from '../../src/services/api'
import { niceMax, toTrendPoints } from '../../src/services/checkinsTrend'

function checkin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: 1,
    plate: 'ABC1D23',
    created_at: '2026-09-25T10:00:00Z',
    status: 'waiting',
    schedule_id: null,
    estimated_wait_minutes: 5,
    ...overrides,
  }
}

describe('toTrendPoints', () => {
  it('descarta check-ins sem created_at ou sem estimated_wait_minutes', () => {
    const points = toTrendPoints([
      checkin({ id: 1, created_at: null }),
      checkin({ id: 2, estimated_wait_minutes: null }),
      checkin({ id: 3 }),
    ])

    expect(points).toHaveLength(1)
    expect(points[0]?.plate).toBe('ABC1D23')
  })

  it('ordena do mais antigo pro mais recente', () => {
    const points = toTrendPoints([
      checkin({ id: 1, plate: 'BBB2222', created_at: '2026-09-25T12:00:00Z' }),
      checkin({ id: 2, plate: 'AAA1111', created_at: '2026-09-25T09:00:00Z' }),
    ])

    expect(points.map((point) => point.plate)).toEqual(['AAA1111', 'BBB2222'])
  })

  it('converte estimated_wait_minutes pro campo minutes', () => {
    const points = toTrendPoints([checkin({ estimated_wait_minutes: 12.5 })])

    expect(points[0]?.minutes).toBe(12.5)
  })
})

describe('niceMax', () => {
  it('nunca fica abaixo do teto mínimo, mesmo com valores pequenos', () => {
    expect(niceMax(1)).toBeGreaterThanOrEqual(10)
  })

  it('arredonda pra um número redondo acima do valor com folga', () => {
    expect(niceMax(42)).toBe(50)
  })

  it('dá folga de 15% antes de arredondar', () => {
    expect(niceMax(100)).toBe(200)
  })
})
