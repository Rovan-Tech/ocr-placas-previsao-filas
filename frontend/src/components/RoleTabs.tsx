import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { RoleDetail } from '../services/roles'
import StatusMessage from './StatusMessage'

interface RoleTabsProps {
  roles: RoleDetail[]
  selectedId: number
  dirtyIds: number[]
  onSelect: (roleId: number) => void
  onCreate: (name: string) => Promise<void>
}

function NewRoleForm({ onCreate }: Readonly<{ onCreate: (name: string) => Promise<void> }>) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    setError(null)
    try {
      await onCreate(name.trim())
      setName('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar o cargo.')
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="role-tab role-tab-new" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" size={16} />
        Novo cargo
      </button>
    )
  }

  return (
    <form className="new-role-form" onSubmit={handleSubmit}>
      <label htmlFor="new-role-name">Nome do novo cargo</label>
      <input
        id="new-role-name"
        type="text"
        autoComplete="off"
        placeholder="Ex.: Monitor Noturno"
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={sending}
        autoFocus
      />
      <button type="submit" className="primary" disabled={sending || !name.trim()}>
        Criar cargo
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={sending}>
        Cancelar
      </button>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
    </form>
  )
}

export default function RoleTabs({
  roles,
  selectedId,
  dirtyIds,
  onSelect,
  onCreate,
}: Readonly<RoleTabsProps>) {
  return (
    <div className="role-tabs-row">
      <div className="role-tabs" role="tablist" aria-label="Cargos">
        {roles.map((role) => (
          <button
            key={role.id}
            type="button"
            role="tab"
            aria-selected={role.id === selectedId}
            className={`role-tab ${role.id === selectedId ? 'is-selected' : ''}`}
            onClick={() => onSelect(role.id)}
          >
            {role.name}
            {dirtyIds.includes(role.id) && (
              <span className="role-tab-dirty" title="Alterações não salvas">
                <span className="visually-hidden">alterações não salvas</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <NewRoleForm onCreate={onCreate} />
    </div>
  )
}
