import { describe, expect, it } from 'vitest'
import {
  changeCount,
  dirtyRoleIds,
  draftFromRoles,
  togglePermission,
} from '../../src/services/permissionsDraft'
import type { RoleDetail } from '../../src/services/roles'

const ROLES: RoleDetail[] = [
  { id: 1, key: 'fiscal', name: 'Fiscal', is_system: true, permissions: ['checkins.view'] },
  { id: 2, key: 'novo', name: 'Novo', is_system: false, permissions: [] },
]

describe('rascunho da matriz de permissões', () => {
  it('parte do que está salvo, sem alterar o original', () => {
    const draft = draftFromRoles(ROLES)
    draft[1]?.push('logs.view')

    expect(ROLES[0]?.permissions).toEqual(['checkins.view'])
  })

  it('marcar e desmarcar alterna a permissão só naquele cargo', () => {
    const added = togglePermission(draftFromRoles(ROLES), 2, 'logs.view')
    const removed = togglePermission(added, 1, 'checkins.view')

    expect(added[2]).toEqual(['logs.view'])
    expect(removed[1]).toEqual([])
    expect(removed[2]).toEqual(['logs.view'])
  })

  it('só considera alterados os cargos que mudaram de verdade', () => {
    const draft = togglePermission(draftFromRoles(ROLES), 2, 'logs.view')

    expect(dirtyRoleIds(ROLES, draft)).toEqual([2])
  })

  it('marcar e desmarcar a mesma permissão volta a não haver alteração', () => {
    let draft = draftFromRoles(ROLES)
    draft = togglePermission(draft, 1, 'logs.view')
    draft = togglePermission(draft, 1, 'logs.view')

    expect(dirtyRoleIds(ROLES, draft)).toEqual([])
  })

  it('trocar uma permissão por outra também conta como alteração', () => {
    let draft = togglePermission(draftFromRoles(ROLES), 1, 'checkins.view')
    draft = togglePermission(draft, 1, 'logs.view')

    expect(dirtyRoleIds(ROLES, draft)).toEqual([1])
  })
})

describe('contagem de alterações', () => {
  it('conta cada permissão marcada ou desmarcada, em todos os cargos', () => {
    let draft = draftFromRoles(ROLES)
    draft = togglePermission(draft, 1, 'checkins.view')
    draft = togglePermission(draft, 2, 'logs.view')
    draft = togglePermission(draft, 2, 'reports.view')

    expect(changeCount(ROLES, draft)).toBe(3)
  })

  it('é zero quando nada mudou', () => {
    expect(changeCount(ROLES, draftFromRoles(ROLES))).toBe(0)
  })
})

describe('rascunho sem entrada para um cargo', () => {
  it('marcar uma permissão num cargo ainda ausente do rascunho cria a lista dele', () => {
    const draft = togglePermission({}, 2, 'logs.view')

    expect(draft[2]).toEqual(['logs.view'])
  })

  it('cargo ausente do rascunho conta como se tivesse perdido todas as permissões', () => {
    expect(dirtyRoleIds(ROLES, {})).toEqual([1])
    expect(changeCount(ROLES, {})).toBe(1)
  })
})
