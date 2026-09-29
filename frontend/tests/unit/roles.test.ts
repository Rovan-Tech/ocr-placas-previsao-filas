import { describe, expect, it } from 'vitest'
import { desktopNavItems, homePathFor, mobileNavItems } from '../../src/services/navigation'
import {
  can,
  canAny,
  overrideChoiceFor,
  overridesFromChoices,
  type PermissionKey,
} from '../../src/services/roles'

const FISCAL: PermissionKey[] = [
  'capture.read_plate',
  'capture.authorize_entry',
  'capture.refuse_entry',
  'checkins.view',
]
const ANALISTA: PermissionKey[] = ['checkins.view', 'logs.view', 'reports.view']
const PLANEJADOR: PermissionKey[] = ['checkins.view', 'schedules.view', 'schedules.create']
const ADMIN: PermissionKey[] = [
  ...FISCAL,
  'schedules.view',
  'schedules.create',
  'logs.view',
  'reports.view',
  'employees.view',
  'employees.create',
  'employees.deactivate',
  'employees.set_role',
  'permissions.manage',
]

describe('can e canAny', () => {
  it('confere uma permissão específica', () => {
    expect(can(FISCAL, 'capture.read_plate')).toBe(true)
    expect(can(FISCAL, 'logs.view')).toBe(false)
  })

  it('trata permissões ausentes como sem acesso', () => {
    expect(can(undefined, 'checkins.view')).toBe(false)
    expect(canAny(undefined, ['checkins.view'])).toBe(false)
    expect(canAny([], ['checkins.view'])).toBe(false)
  })

  it('canAny basta uma das permissões', () => {
    expect(canAny(PLANEJADOR, ['schedules.view', 'schedules.create'])).toBe(true)
    expect(canAny(['schedules.create'], ['schedules.view', 'schedules.create'])).toBe(true)
    expect(canAny(FISCAL, ['schedules.view', 'schedules.create'])).toBe(false)
  })
})

describe('exceções por funcionário', () => {
  const overrides = {
    granted: ['logs.view'] as PermissionKey[],
    denied: ['checkins.view'] as PermissionKey[],
  }

  it.each([
    ['logs.view', 'grant'],
    ['checkins.view', 'deny'],
    ['reports.view', 'inherit'],
  ] as const)('%s -> %s', (key, choice) => {
    expect(overrideChoiceFor(overrides, key)).toBe(choice)
  })

  it('monta as listas a partir das escolhas, ignorando "seguir o cargo"', () => {
    expect(
      overridesFromChoices({
        'logs.view': 'grant',
        'checkins.view': 'deny',
        'reports.view': 'inherit',
      }),
    ).toEqual({ granted: ['logs.view'], denied: ['checkins.view'] })
  })
})

describe('menu por permissões', () => {
  it('no desktop mostra as telas sem permissão como bloqueadas e esconde Permissões', () => {
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

  it('quem gerencia permissões enxerga o item Permissões', () => {
    const items = desktopNavItems(ADMIN)

    expect(items.every((item) => item.enabled)).toBe(true)
    expect(items.map((item) => item.id)).toContain('permissions')
  })

  it('só cadastrar agendamento já libera a tela de Agendamentos', () => {
    const items = desktopNavItems(['schedules.create'])

    expect(items.find((item) => item.id === 'schedules')?.enabled).toBe(true)
  })

  it('no celular só aparecem as telas liberadas e nunca Permissões', () => {
    expect(mobileNavItems(FISCAL).map((item) => item.id)).toEqual(['capture', 'checkins'])
    expect(mobileNavItems(ADMIN).map((item) => item.id)).not.toContain('permissions')
  })

  it.each([
    [FISCAL, '/'],
    [PLANEJADOR, '/agendamentos'],
    [ANALISTA, '/relatorios'],
    [['checkins.view'] as PermissionKey[], '/checkins'],
    [[] as PermissionKey[], '/'],
  ])('página inicial de %j é %s', (permissions, expected) => {
    expect(homePathFor(permissions)).toBe(expected)
  })
})
