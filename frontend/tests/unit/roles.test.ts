import { describe, expect, it } from 'vitest'
import { desktopNavItems, homePathFor, mobileNavItems } from '../../src/services/navigation'
import {
  accessLabel,
  hasAccess,
  roleLabel,
  screenLabel,
  type Permissions,
} from '../../src/services/roles'

const FISCAL: Permissions = {
  capture: 'full',
  checkins: 'read',
  schedules: 'none',
  logs: 'none',
  reports: 'none',
  employees: 'none',
}

const ANALISTA: Permissions = {
  capture: 'none',
  checkins: 'read',
  schedules: 'none',
  logs: 'read',
  reports: 'full',
  employees: 'none',
}

const ADMIN: Permissions = {
  capture: 'full',
  checkins: 'full',
  schedules: 'full',
  logs: 'full',
  reports: 'full',
  employees: 'full',
}

describe('rótulos', () => {
  it.each([
    ['fiscal', 'Fiscal de Portaria'],
    ['planejador', 'Planejador de Agendamentos'],
    ['analista', 'Analista de Operações'],
    ['supervisor', 'Supervisor de Turno'],
    ['admin', 'Administrador'],
  ] as const)('cargo %s -> %s', (role, label) => {
    expect(roleLabel(role)).toBe(label)
  })

  it.each([
    ['none', 'Sem acesso'],
    ['read', 'Somente leitura'],
    ['full', 'Acesso total'],
  ] as const)('acesso %s -> %s', (access, label) => {
    expect(accessLabel(access)).toBe(label)
  })

  it('traduz o nome da tela', () => {
    expect(screenLabel('schedules')).toBe('Agendamentos')
  })
})

describe('hasAccess', () => {
  it.each([
    ['full', true],
    ['read', true],
    ['none', false],
  ] as const)('%s -> %s', (access, expected) => {
    expect(hasAccess({ logs: access }, 'logs')).toBe(expected)
  })

  it('trata permissões ausentes como sem acesso', () => {
    expect(hasAccess(undefined, 'capture')).toBe(false)
    expect(hasAccess({}, 'capture')).toBe(false)
  })
})

describe('menu por cargo', () => {
  it('no desktop mostra as telas sem acesso como bloqueadas e esconde Permissões', () => {
    const items = desktopNavItems(FISCAL)

    expect(items.map((item) => [item.id, item.enabled])).toEqual([
      ['capture', true],
      ['checkins', true],
      ['schedules', false],
      ['logs', false],
      ['reports', false],
      ['employees', false],
    ])
  })

  it('o administrador enxerga tudo, inclusive Permissões', () => {
    const items = desktopNavItems(ADMIN)

    expect(items.every((item) => item.enabled)).toBe(true)
    expect(items.map((item) => item.id)).toContain('permissions')
  })

  it('no celular só aparecem as telas com acesso e nunca Permissões', () => {
    expect(mobileNavItems(FISCAL).map((item) => item.id)).toEqual(['capture', 'checkins'])
    expect(mobileNavItems(ADMIN).map((item) => item.id)).not.toContain('permissions')
  })

  it.each([
    [FISCAL, '/'],
    [ANALISTA, '/relatorios'],
    [{ checkins: 'read' } as Permissions, '/checkins'],
    [{}, '/'],
  ])('página inicial de %j é %s', (permissions, expected) => {
    expect(homePathFor(permissions)).toBe(expected)
  })
})
