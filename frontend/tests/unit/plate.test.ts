import { describe, expect, it } from 'vitest'
import {
  formatConfidence,
  formatPlate,
  formatScheduledDate,
  plateFormatLabel,
  scheduleStatusInfo,
  verificationInfo,
} from '../../src/services/plate'

describe('formatPlate', () => {
  it('mostra a placa Mercosul sem hífen', () => {
    expect(formatPlate('BRA2E19', 'mercosul')).toBe('BRA2E19')
  })

  it('mostra a placa antiga com hífen, como está no veículo', () => {
    expect(formatPlate('KLM4821', 'antigo')).toBe('KLM-4821')
  })
})

describe('plateFormatLabel', () => {
  it.each([
    ['mercosul', 'Mercosul'],
    ['antigo', 'Padrão antigo'],
    [null, 'Formato desconhecido'],
  ] as const)('%s -> %s', (format, label) => {
    expect(plateFormatLabel(format)).toBe(label)
  })
})

describe('verificationInfo', () => {
  it('deixa claro quando a placa não foi verificada na base oficial', () => {
    expect(verificationInfo('not_checked')).toEqual({
      label: 'Não verificada na base oficial',
      tone: 'neutral',
      blocksEntry: false,
    })
  })

  it.each(['irregular', 'not_found'] as const)('%s exige barrar o veículo', (status) => {
    const info = verificationInfo(status)
    expect(info.tone).toBe('danger')
    expect(info.blocksEntry).toBe(true)
  })

  it('placa não encontrada é tratada como possível placa falsa', () => {
    expect(verificationInfo('not_found').label).toMatch(/possível placa falsa/)
  })

  it.each(['regular', 'unavailable', 'not_checked'] as const)('%s não barra a entrada', (status) => {
    expect(verificationInfo(status).blocksEntry).toBe(false)
  })
})

describe('formatConfidence', () => {
  it('formata como porcentagem com uma casa', () => {
    expect(formatConfidence(0.9876)).toBe('98.8%')
  })
})

describe('scheduleStatusInfo', () => {
  it.each([
    ['on_time', 'Agendado para hoje', 'ok'],
    ['early', 'Adiantado', 'warning'],
    ['late', 'Atrasado', 'danger'],
  ] as const)('%s -> %s (%s)', (status, label, tone) => {
    expect(scheduleStatusInfo(status)).toEqual({ label, tone })
  })
})

describe('formatScheduledDate', () => {
  it('formata a data ISO como DD/MM/AAAA, sem depender de fuso horário', () => {
    expect(formatScheduledDate('2026-09-24')).toBe('24/09/2026')
  })
})
