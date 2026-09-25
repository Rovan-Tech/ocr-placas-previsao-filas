import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cargoCategoryLabel,
  checkInStatusLabel,
  driverDocumentHint,
  driverDocumentTypeLabel,
  formatConfidence,
  formatPlate,
  formatScheduledDate,
  isDriverDocumentTooShortToJudge,
  isValidCnh,
  isValidCpf,
  isValidDriverDocument,
  isValidRg,
  plateFormatLabel,
  sanitizeChassis,
  sanitizeDriverDocument,
  scheduleStatusInfo,
  todayIsoDate,
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

describe('cargoCategoryLabel', () => {
  it.each([
    ['perecivel', 'Perecível'],
    ['nao_perecivel', 'Não perecível'],
    ['quimico', 'Químico'],
    ['toxico', 'Tóxico'],
    ['inflamavel', 'Inflamável'],
  ] as const)('%s -> %s', (category, label) => {
    expect(cargoCategoryLabel(category)).toBe(label)
  })
})

describe('driverDocumentTypeLabel', () => {
  it.each([
    ['cpf', 'CPF'],
    ['rg', 'RG'],
    ['cnh', 'CNH'],
  ] as const)('%s -> %s', (type, label) => {
    expect(driverDocumentTypeLabel(type)).toBe(label)
  })
})

describe('checkInStatusLabel', () => {
  it.each([
    ['waiting', 'Aguardando decisão'],
    ['admitted', 'Entrada autorizada'],
    ['cancelled', 'Entrada recusada'],
  ] as const)('%s -> %s', (status, label) => {
    expect(checkInStatusLabel(status)).toBe(label)
  })
})

describe('formatScheduledDate', () => {
  it('formata a data ISO como DD/MM/AAAA, sem depender de fuso horário', () => {
    expect(formatScheduledDate('2026-09-24')).toBe('24/09/2026')
  })
})

describe('todayIsoDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('usa os componentes locais da data, não UTC (evita cair no dia anterior perto da meia-noite)', () => {
    vi.setSystemTime(new Date(2026, 8, 24, 0, 30))

    expect(todayIsoDate()).toBe('2026-09-24')
  })

  it('preenche mês e dia com zero à esquerda', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0))

    expect(todayIsoDate()).toBe('2026-01-05')
  })
})

describe('sanitizeDriverDocument', () => {
  it('remove tudo que não é dígito quando o tipo é CPF', () => {
    expect(sanitizeDriverDocument('123.456.789-00', 'cpf')).toBe('12345678900')
  })

  it('corta em 11 dígitos quando o tipo é CPF', () => {
    expect(sanitizeDriverDocument('123456789001234', 'cpf')).toBe('12345678900')
  })

  it('remove tudo que não é dígito quando o tipo é CNH', () => {
    expect(sanitizeDriverDocument('123 456 789-00', 'cnh')).toBe('12345678900')
  })

  it('remove símbolos e deixa maiúsculo quando o tipo é RG, mas mantém letras', () => {
    expect(sanitizeDriverDocument('mg-12.345-6', 'rg')).toBe('MG123456')
  })

  it('corta o RG em 11 caracteres (cobre o caso da nova CIN)', () => {
    expect(sanitizeDriverDocument('111.444.777-35999', 'rg')).toBe('11144477735')
  })
})

describe('isValidCpf', () => {
  it('aceita um CPF com dígito verificador correto', () => {
    expect(isValidCpf('111.444.777-35')).toBe(true)
  })

  it('rejeita um CPF com dígito verificador errado', () => {
    expect(isValidCpf('111.444.777-36')).toBe(false)
  })

  it('rejeita todos os dígitos iguais', () => {
    expect(isValidCpf('11111111111')).toBe(false)
  })

  it('rejeita quando não tem 11 dígitos', () => {
    expect(isValidCpf('111444777')).toBe(false)
  })
})

describe('isValidCnh', () => {
  it('aceita 11 dígitos', () => {
    expect(isValidCnh('12345678900')).toBe(true)
  })

  it('rejeita menos de 11 dígitos', () => {
    expect(isValidCnh('123456789')).toBe(false)
  })

  it('rejeita mais de 11 dígitos', () => {
    expect(isValidCnh('1234567890099')).toBe(false)
  })
})

describe('isValidRg', () => {
  it('aceita de 7 a 9 caracteres (padrão estadual, com letra)', () => {
    expect(isValidRg('MG123456')).toBe(true)
  })

  it('rejeita menos de 7 caracteres', () => {
    expect(isValidRg('123456')).toBe(false)
  })

  it('rejeita entre 10 e 10 caracteres (nem padrão estadual nem CPF)', () => {
    expect(isValidRg('1234567890')).toBe(false)
  })

  it('aceita 11 dígitos quando bate como CPF válido (nova CIN)', () => {
    expect(isValidRg('111.444.777-35')).toBe(true)
  })

  it('rejeita 11 dígitos quando não bate como CPF válido', () => {
    expect(isValidRg('111.444.777-36')).toBe(false)
  })
})

describe('isValidDriverDocument', () => {
  it('valida CPF pelo dígito verificador', () => {
    expect(isValidDriverDocument('cpf', '11144477735')).toBe(true)
    expect(isValidDriverDocument('cpf', '11144477736')).toBe(false)
  })

  it('valida CNH pela quantidade de dígitos', () => {
    expect(isValidDriverDocument('cnh', '12345678900')).toBe(true)
    expect(isValidDriverDocument('cnh', '123456789')).toBe(false)
  })

  it('valida RG pelo padrão estadual ou pela nova CIN', () => {
    expect(isValidDriverDocument('rg', 'MG123456')).toBe(true)
    expect(isValidDriverDocument('rg', '11144477735')).toBe(true)
    expect(isValidDriverDocument('rg', '123')).toBe(false)
  })
})

describe('isDriverDocumentTooShortToJudge', () => {
  it('para CPF/CNH, considera curto até faltar dígito pros 11', () => {
    expect(isDriverDocumentTooShortToJudge('cpf', '123456789')).toBe(true)
    expect(isDriverDocumentTooShortToJudge('cpf', '12345678900')).toBe(false)
  })

  it('para RG, considera curto até faltar caractere pro mínimo de 7', () => {
    expect(isDriverDocumentTooShortToJudge('rg', '123456')).toBe(true)
    expect(isDriverDocumentTooShortToJudge('rg', '1234567')).toBe(false)
  })
})

describe('driverDocumentHint', () => {
  it('devolve uma dica diferente por tipo de documento', () => {
    expect(driverDocumentHint('cpf')).toMatch(/11 dígitos/)
    expect(driverDocumentHint('cnh')).toMatch(/11 dígitos/)
    expect(driverDocumentHint('rg')).toMatch(/7 a 9/)
  })
})

describe('sanitizeChassis', () => {
  it('remove espaços e símbolos', () => {
    expect(sanitizeChassis('9bw-zzz 377.vt-004251')).toBe('9BWZZZ377VT004251')
  })

  it('corta em 17 caracteres', () => {
    expect(sanitizeChassis('9BWZZZ377VT0042519999')).toBe('9BWZZZ377VT004251')
  })

  it('deixa maiúsculo', () => {
    expect(sanitizeChassis('abc123')).toBe('ABC123')
  })
})
