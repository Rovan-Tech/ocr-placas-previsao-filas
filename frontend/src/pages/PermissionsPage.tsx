import { useCallback, useEffect, useState } from 'react'
import PermissionLog from '../components/PermissionLog'
import RolePermissionsPanel from '../components/RolePermissionsPanel'
import RoleTabs from '../components/RoleTabs'
import StatusMessage from '../components/StatusMessage'
import Toast from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import {
  createRole,
  deleteRole,
  fetchPermissionLog,
  fetchPermissions,
  updateRole,
  type PermissionLogEntry,
} from '../services/auth'
import {
  changeCount,
  dirtyRoleIds,
  draftFromRoles,
  togglePermission,
  type Draft,
} from '../services/permissionsDraft'
import type { PermissionsMatrix, RoleDetail } from '../services/roles'

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export default function PermissionsPage() {
  const { token } = useAuth()
  const [matrix, setMatrix] = useState<PermissionsMatrix | null>(null)
  const [log, setLog] = useState<PermissionLogEntry[]>([])
  const [draft, setDraft] = useState<Draft>({})
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    if (!token) return
    fetchPermissionLog(token)
      .then(setLog)
      .catch(() => setLog([]))
    fetchPermissions(token)
      .then((data) => {
        setMatrix(data)
        setDraft(draftFromRoles(data.roles))
        setSelectedId((current) =>
          data.roles.some((role) => role.id === current) ? current : (data.roles[0]?.id ?? null),
        )
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Erro ao carregar as permissões.'),
      )
  }, [token])

  useEffect(() => load(), [load])

  const dirty = matrix ? dirtyRoleIds(matrix.roles, draft) : []
  const changes = matrix ? changeCount(matrix.roles, draft) : 0
  const selected = matrix?.roles.find((role) => role.id === selectedId) ?? null

  async function handleSave() {
    if (!token || !matrix) return
    setSaving(true)
    setError(null)
    setSaved(null)
    try {
      for (const role of matrix.roles.filter((entry) => dirty.includes(entry.id))) {
        await updateRole(token, role.id, { name: role.name, permissions: draft[role.id] ?? [] })
      }
      setSaved('Permissões salvas.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar as permissões.')
    } finally {
      setSaving(false)
      load()
    }
  }

  async function handleCreate(name: string) {
    if (!token) return
    const role = await createRole(token, { name, permissions: [] })
    setSelectedId(role.id)
    setSaved(`Cargo "${name}" criado. Marque as ações que ele pode fazer e salve.`)
    load()
  }

  async function handleDelete(role: RoleDetail) {
    if (!token) return
    setError(null)
    setSaved(null)
    try {
      await deleteRole(token, role.id)
      setSaved(`Cargo "${role.name}" excluído.`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir o cargo.')
    }
  }

  return (
    <section className="page page-wide permissions-page">
      <h1>Permissões por cargo</h1>
      <p className="subtitle">
        Escolha um cargo e ligue ou desligue o que ele pode fazer, tela por tela. Só quem gerencia
        permissões enxerga esta tela.
      </p>

      {!matrix && !error && <p className="message">Carregando…</p>}
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      <Toast message={saved} onClose={() => setSaved(null)} />

      {matrix && selected && (
        <>
          <RoleTabs
            roles={matrix.roles}
            selectedId={selected.id}
            dirtyIds={dirty}
            onSelect={setSelectedId}
            onCreate={handleCreate}
          />
          <RolePermissionsPanel
            role={selected}
            catalog={matrix.catalog}
            granted={draft[selected.id] ?? []}
            onToggle={(key) => setDraft((current) => togglePermission(current, selected.id, key))}
            onDelete={handleDelete}
          />
          <section className="save-bar" aria-label="Salvar alterações">
            <span className={changes > 0 ? 'save-bar-pending' : 'save-bar-idle'}>
              {changes > 0
                ? `${pluralize(changes, 'alteração', 'alterações')} em ${pluralize(dirty.length, 'cargo', 'cargos')}, ainda não salvas`
                : 'Nenhuma alteração pendente'}
            </span>
            <div className="save-bar-actions">
              <button
                type="button"
                onClick={() => setDraft(draftFromRoles(matrix.roles))}
                disabled={saving || changes === 0}
              >
                Descartar
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleSave}
                disabled={saving || changes === 0}
              >
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </section>
          <PermissionLog entries={log} />
        </>
      )}
    </section>
  )
}
