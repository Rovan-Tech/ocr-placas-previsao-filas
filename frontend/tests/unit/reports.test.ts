import { describe, expect, it } from 'vitest'
import type { Checkin, UploadLogEntry } from '../../src/services/api'
import { hourLabel, summarizeCheckins, uncertainReadingsPercent } from '../../src/services/reports'

const NOW = new Date(2026, 8, 29, 15, 0, 0)

function checkin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: 1,
    plate: 'ABC1D23',
    created_at: new Date(2026, 8, 29, 10, 0, 0).toISOString(),
    status: 'admitted',
    schedule_id: 1,
    estimated_wait_minutes: 6,
    ...overrides,
  }
}

function log(overrides: Partial<UploadLogEntry> = {}): UploadLogEntry {
  return {
    id: 1,
    employee_id: 1,
    employee_username: 'fiscal',
    endpoint: 'upload',
    client_ip: null,
    ocr_plate: null,
    ocr_confidence: null,
    manual_plate: null,
    final_plate: null,
    final_plate_format: null,
    needs_review: false,
    has_photo: false,
    created_at: new Date(2026, 8, 29, 10, 0, 0).toISOString(),
    ...overrides,
  }
}

describe('summarizeCheckins', () => {
  it('conta só os check-ins de hoje e separa por decisão', () => {
    const summary = summarizeCheckins(
      [
        checkin({ id: 1, status: 'admitted' }),
        checkin({ id: 2, status: 'waiting' }),
        checkin({ id: 3, status: 'cancelled', schedule_id: null }),
        checkin({ id: 4, created_at: new Date(2026, 8, 28, 10, 0, 0).toISOString() }),
        checkin({ id: 5, created_at: null }),
      ],
      NOW,
    )

    expect(summary).toMatchObject({
      total: 3,
      admitted: 1,
      waiting: 1,
      cancelled: 1,
      cancelledWithoutSchedule: 1,
    })
  })

  it('calcula a espera média ignorando check-ins sem estimativa', () => {
    const summary = summarizeCheckins(
      [
        checkin({ id: 1, estimated_wait_minutes: 4 }),
        checkin({ id: 2, estimated_wait_minutes: 10 }),
        checkin({ id: 3, estimated_wait_minutes: null }),
      ],
      NOW,
    )

    expect(summary.averageWaitMinutes).toBe(7)
  })

  it('devolve espera média nula quando ninguém tem estimativa', () => {
    expect(
      summarizeCheckins([checkin({ estimated_wait_minutes: null })], NOW).averageWaitMinutes,
    ).toBeNull()
  })

  it.each([
    [2, 1, 100],
    [1, 2, -50],
  ])('compara com ontem: hoje=%i ontem=%i -> %i%%', (todayCount, yesterdayCount, expected) => {
    const today = Array.from({ length: todayCount }, (_, index) => checkin({ id: index }))
    const yesterday = Array.from({ length: yesterdayCount }, (_, index) =>
      checkin({ id: 100 + index, created_at: new Date(2026, 8, 28, 9, 0, 0).toISOString() }),
    )

    expect(summarizeCheckins([...today, ...yesterday], NOW).changeVsYesterdayPercent).toBe(expected)
  })

  it('não compara com ontem quando não há dados de ontem', () => {
    expect(summarizeCheckins([checkin()], NOW).changeVsYesterdayPercent).toBeNull()
  })

  it('agrupa por hora preenchendo as horas vazias entre a primeira e a última', () => {
    const summary = summarizeCheckins(
      [
        checkin({ id: 1, created_at: new Date(2026, 8, 29, 8, 10, 0).toISOString() }),
        checkin({ id: 2, created_at: new Date(2026, 8, 29, 8, 50, 0).toISOString() }),
        checkin({ id: 3, created_at: new Date(2026, 8, 29, 10, 5, 0).toISOString() }),
      ],
      NOW,
    )

    expect(summary.byHour).toEqual([
      { hour: 8, count: 2 },
      { hour: 9, count: 0 },
      { hour: 10, count: 1 },
    ])
  })

  it('devolve tudo zerado quando não há check-ins', () => {
    expect(summarizeCheckins([], NOW)).toMatchObject({ total: 0, byHour: [] })
  })
})

describe('uncertainReadingsPercent', () => {
  it('calcula a porcentagem de leituras incertas de hoje', () => {
    const logs = [
      log({ id: 1, needs_review: true }),
      log({ id: 2 }),
      log({ id: 3 }),
      log({ id: 4 }),
      log({ id: 5, created_at: new Date(2026, 8, 20, 10, 0, 0).toISOString(), needs_review: true }),
    ]

    expect(uncertainReadingsPercent(logs, NOW)).toBe(25)
  })

  it('devolve nulo sem logs de hoje', () => {
    expect(uncertainReadingsPercent([], NOW)).toBeNull()
  })
})

describe('hourLabel', () => {
  it.each([
    [7, '07h'],
    [13, '13h'],
  ])('%i -> %s', (hour, label) => {
    expect(hourLabel(hour)).toBe(label)
  })
})
